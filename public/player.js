import {
    ENTITIES
} from './game.js';
import {
    Vars,
    camera,
    LC,
    Settings,
    isLocalPlayerInSnowBiome,
    getCurrentPlayerColor,
    getDefaultPlayerColor,
    CURRENT_WORLD,
    WORLD_MAIN
} from './client.js';
import {
    dataMap,
    isWeaponType,
    isSpearType,
    isSwordType,
    isAxeType,
    ACCESSORY_KEYS,
    getLevelFromXp,
    getWeaponConfig,
    getWeaponSize,
    getWeaponOffset,
    getWeaponRenderTuning,
    getSpearThrustProgress,
    getWeaponMeta,
    getWeaponAttackStats
} from './shared/datamap.js';
import { drawIceEncasingOverlay, isFrozen } from './freeze_overlay.js';
import { getRenderQualityAt } from './render_quality.js';
import {
    getEntityDeltaMs,
    getTimeLerpFactor,
    lerpAngle,
    lerpEntityPosition,
    normalizeAngle
} from './interpolation.js';

function getHealthBarColor(healthRatio) {
    if (healthRatio >= 0.5) return '#22c55e';
    if (healthRatio >= 0.25) return '#eab308';
    return '#ef4444';
}

const SLASH_DEBUG_LEFT_OFFSET = -Math.PI / 3;
const SLASH_DEBUG_RIGHT_OFFSET = Math.PI / 3;

function drawSlashDebugArc(player, screenPosX, screenPosY, weaponType, alpha) {
    if (!Settings.debugMode || !Vars.isAdmin || !isWeaponType(weaponType) || isSpearType(weaponType)) return;
    if (!isSwordType(weaponType) && !isAxeType(weaponType)) return;

    const attackStats = getWeaponAttackStats(weaponType);
    const maxDistance = Number(attackStats?.maxDistance) || 0;
    if (maxDistance <= 0) return;

    const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
    const playerScale = Math.max(0.2, (player.radius || baseRadius) / baseRadius);
    const playerRadius = Math.max(0, player.radius || 0);
    const reachRadius = Math.max(1, playerRadius + (maxDistance * playerScale));
    const startAngle = player.angle + SLASH_DEBUG_LEFT_OFFSET;
    const endAngle = player.angle + SLASH_DEBUG_RIGHT_OFFSET;
    const sideAngle = player.angle - (Math.PI / 2);
    const sideStartX = screenPosX + (Math.cos(sideAngle) * playerRadius);
    const sideStartY = screenPosY + (Math.sin(sideAngle) * playerRadius);
    const sideEndX = screenPosX + (Math.cos(sideAngle) * reachRadius);
    const sideEndY = screenPosY + (Math.sin(sideAngle) * reachRadius);
    const debugColor = isAxeType(weaponType) ? '#f97316' : '#60a5fa';

    LC.ctx.save();
    LC.ctx.globalAlpha = Math.max(0, Math.min(1, 0.78 * alpha));
    LC.ctx.strokeStyle = debugColor;
    LC.ctx.lineWidth = 3;
    LC.ctx.setLineDash([14, 8]);

    LC.ctx.beginPath();
    LC.ctx.arc(screenPosX, screenPosY, reachRadius, startAngle, endAngle);
    LC.ctx.stroke();

    LC.ctx.beginPath();
    LC.ctx.moveTo(sideStartX, sideStartY);
    LC.ctx.lineTo(sideEndX, sideEndY);
    LC.ctx.stroke();
    LC.ctx.restore();
}

export class Player {
    constructor(id, x, y) {
        this.id = id;

        this.x = x;
        this.newX = x;
        this.y = y;
        this.newY = y;

        this.score = 0;
        this.newScore = 0;

        this.swingState = 0;
        this.newSwingState = 0;
        this.swordAngleOffset = -Math.PI / 2;

        this.hasWeapon = true;

        this.serverAttributes = {
            speed: dataMap.PLAYERS.baseMovementSpeed,
            damage: 0,
        };

        this.weaponRank = 1;
        this.accessoryId = 0;

        this.health = undefined;
        this.maxHealth = undefined;

        this.hasShield = false;
        this.isAlive = false;
        this.isInvisible = false;
        this.isBot = false;
        this.botRoleCode = 0;
        this.frozenUntil = 0;
        this.bossIntroLockedUntil = 0;

        this.username = "";
        this.chatMessage = "";
        this.color = getDefaultPlayerColor();
        this.skinColor = 2;

        this.newAngle = 0;
        this.angle = 0;

        this.radius = dataMap.PLAYERS.baseRadius;
        this._wasAliveState = this.isAlive;
        this._deathFadeStart = 0;
        this._deathFadeX = x;
        this._deathFadeY = y;
        this._deathFadeDuration = 750;
        this._chatRenderCache = null;
        this._nameplateRenderCache = null;
        this._debugIdRenderCache = null;
        this._collisionDebugRenderCache = null;

        ENTITIES.PLAYERS[id] = this;
    }
    update() {
        const dt = getEntityDeltaMs(this);
        const lerpFactor = getTimeLerpFactor(dt, 1);

        if (this._wasAliveState && !this.isAlive) {
            this._deathFadeStart = performance.now();
            this._deathFadeX = this.x;
            this._deathFadeY = this.y;
        } else if (!this._wasAliveState && this.isAlive) {
            this._deathFadeStart = 0;
        }
        this._wasAliveState = this.isAlive;

        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;

        lerpEntityPosition(this, dt, 1, 0.25);

        // update score
        this.score = this.newScore;

        // lerp swing state
        const delta = this.newSwingState - this.swingState;
        const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        const radiusScale = Math.max(0.1, (this.radius || baseRadius) / baseRadius);
        const weaponAnimMult = Math.max(0.1, Number(getWeaponMeta(this.weaponRank || 1)?.cooldownMult) || 1);
        const swingLerpFactor = Math.max(0.025, (lerpFactor / radiusScale) / weaponAnimMult);

        // snap if delta is tiny
        if (Math.abs(delta) < 0.01) {
            this.swingState = this.newSwingState;
        } else if (this.newSwingState < this.swingState) {
            // if the new swing state is lower than the current, then automcailly just set it, dont lerp.
            this.swingState = this.newSwingState;
        } else {
            this.swingState += delta * swingLerpFactor;
        }

        // lerp angle for other players
        if (this.id != Vars.myId) {
            this.angle = lerpAngle(this.angle, this.newAngle, lerpFactor);
        }

        // keep angle within range
        this.angle = normalizeAngle(this.angle);
    }
    draw() {
        if (typeof this.x === 'undefined' || typeof this.y === 'undefined') return;

        let drawX = this.x;
        let drawY = this.y;
        let deathFadeAlpha = 1;
        if (!this.isAlive) {
            if (this.id === Vars.myId) return;
            if (!this._deathFadeStart) return;
            const t = (performance.now() - this._deathFadeStart) / this._deathFadeDuration;
            if (t >= 1) return;
            drawX = this._deathFadeX;
            drawY = this._deathFadeY;
            deathFadeAlpha = 1 - t;
        }

        const screenPosX = drawX - camera.x;
        const screenPosY = drawY - camera.y;
        const renderQuality = getRenderQualityAt(drawX, drawY, this.radius);
        const isLocalPlayer = this.id === Vars.myId;

        const isSelfInvisible = isLocalPlayer && this.isInvisible;
        const alpha = (isSelfInvisible ? 0.5 : 1) * deathFadeAlpha;

        if (this.hasShield && renderQuality.showStatusOverlays) {
            LC.drawImageFast('spawn_zone_shield', screenPosX - this.radius * 1.5, screenPosY - this.radius * 1.5, this.radius * 3, this.radius * 3, 0, 0.5 * alpha);
        }

        const leaderId = Vars.topLeader?.id || 0;
        if (CURRENT_WORLD === WORLD_MAIN && leaderId === this.id && LC.images?.['ui_crown'] && !renderQuality.veryFar) {
            const crownSize = 72;
            LC.drawImageFast('ui_crown', screenPosX - (crownSize / 2), screenPosY - this.radius - crownSize - 28, crownSize, crownSize, 0, alpha);
        }

        let currentWeaponType = this.weaponRank || 0;
        // If we are dragging the currently selected item OR if it's currently thrown, hide it from the player's hand
        if ((this.id === Vars.myId && Vars.dragSlot !== -1 && Vars.dragSlot === Vars.selectedSlot) || currentWeaponType > 127) {
            currentWeaponType = 0;
        }

        const isSpear = isSpearType(currentWeaponType);
        this.swordAngleOffset = isSpear ? 0 : ((this.swingState * (Math.PI / 6)) - (Math.PI / 2));
        const angleRad = this.angle + this.swordAngleOffset;

        if (isWeaponType(currentWeaponType)) {
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const swordScale = this.radius / baseRadius;
            const [baseSwordWidth, baseSwordHeight] = getWeaponSize(currentWeaponType);
            const swordOffset = getWeaponOffset(currentWeaponType);
            const renderTuning = getWeaponRenderTuning(currentWeaponType);
            const swordWidth = baseSwordWidth * swordScale;
            const swordHeight = baseSwordHeight * swordScale;
            let offsetX = 0;
            let offsetY = 0;
            let weaponRotation = angleRad;

            if (isSpear) {
                const forwardAngle = this.angle;
                const sideAngle = forwardAngle + (Math.PI / 2);
                const thrustDistance = swordWidth * 0.2925 * getSpearThrustProgress(currentWeaponType, this.swingState);
                const sideDistance = this.radius + (swordHeight * renderTuning.sideOffset);
                const baseForwardOffset = swordWidth * renderTuning.forwardOffset;
                const localOffsetX = (swordOffset.x || 0) * swordScale;
                const localOffsetY = (swordOffset.y || 0) * swordScale;
                const rotatedOffsetX = (Math.cos(forwardAngle) * localOffsetX) - (Math.sin(forwardAngle) * localOffsetY);
                const rotatedOffsetY = (Math.sin(forwardAngle) * localOffsetX) + (Math.cos(forwardAngle) * localOffsetY);
                offsetX =
                    (Math.cos(sideAngle) * sideDistance) +
                    (Math.cos(forwardAngle) * (baseForwardOffset + thrustDistance)) +
                    rotatedOffsetX;
                offsetY =
                    (Math.sin(sideAngle) * sideDistance) +
                    (Math.sin(forwardAngle) * (baseForwardOffset + thrustDistance)) +
                    rotatedOffsetY;
                weaponRotation = forwardAngle + renderTuning.rotationOffset;
            } else {
                // Move the weapon center to the player's edge, then apply per-weapon local offsets
                // in the weapon's rotated coordinate space so tuning stays consistent at any angle.
                const radialDistance = this.radius + (swordWidth / 2);
                const radialX = Math.cos(angleRad) * radialDistance;
                const radialY = Math.sin(angleRad) * radialDistance;
                const localOffsetX = (swordOffset.x || 0) * swordScale;
                const localOffsetY = (swordOffset.y || 0) * swordScale;
                const rotatedOffsetX = (Math.cos(angleRad) * localOffsetX) - (Math.sin(angleRad) * localOffsetY);
                const rotatedOffsetY = (Math.sin(angleRad) * localOffsetX) + (Math.cos(angleRad) * localOffsetY);
                offsetX = radialX + rotatedOffsetX;
                offsetY = radialY + rotatedOffsetY;
            }

            let swordImgName = getWeaponConfig(currentWeaponType)?.name || 'swords_bone';
            if (!LC.images[swordImgName]) {
                swordImgName = 'swords_bone';
            }

            if (this.hasWeapon) {
                LC.drawImageFast(
                    swordImgName,
                    screenPosX + offsetX - swordWidth / 2,
                    screenPosY + offsetY - swordHeight / 2,
                    swordWidth,
                    swordHeight,
                    weaponRotation,
                    alpha
                );
            }

            if (Settings.drawHitboxes && isSpear) {
                const forwardAngle = this.angle;
                const sideAngle = forwardAngle + (Math.PI / 2);
                const thrustDistance = swordWidth * 0.2925 * getSpearThrustProgress(currentWeaponType, this.swingState);
                if (thrustDistance > 0.001) {
                    const sideDistance = this.radius + (swordHeight * renderTuning.sideOffset);
                    const baseForwardOffset = swordWidth * renderTuning.forwardOffset;
                    const segmentRadius = Math.max(8, swordHeight * 0.28);
                    const segmentCount = 5;
                    const startAlong = 0;
                    const alongStep = (swordWidth * 0.5) / Math.max(1, segmentCount - 1);
                    const centerX = screenPosX + (Math.cos(sideAngle) * sideDistance) + (Math.cos(forwardAngle) * (baseForwardOffset + thrustDistance));
                    const centerY = screenPosY + (Math.sin(sideAngle) * sideDistance) + (Math.sin(forwardAngle) * (baseForwardOffset + thrustDistance));
                    for (let i = 0; i < segmentCount; i++) {
                        const along = startAlong + (alongStep * i);
                        LC.drawCircle({
                            pos: [
                                centerX + (Math.cos(forwardAngle) * along),
                                centerY + (Math.sin(forwardAngle) * along)
                            ],
                            radius: segmentRadius,
                            color: 'purple',
                            transparency: 0.2,
                            fill: true,
                            stroke: true,
                            strokeWidth: 2
                        });
                    }
                }
            }
        }

        drawSlashDebugArc(this, screenPosX, screenPosY, currentWeaponType, alpha);

        const playerColor = this.color || (this.id === Vars.myId
            ? getCurrentPlayerColor()
            : getDefaultPlayerColor());
        LC.drawCircleFast(screenPosX, screenPosY, this.radius, playerColor, alpha, true, true, '#000000', Math.max(2, this.radius * 0.1));

        // draw accessory
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        if (accessoryKey && accessoryKey !== 'none' && renderQuality.showAccessories) {
            const accessory = dataMap.ACCESSORIES[accessoryKey];
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const playerScale = this.radius / baseRadius;
            if (accessory) {
                const cos = Math.cos(this.angle);
                const sin = Math.sin(this.angle);
                const scaledOffsetX = (accessory.hatOffset?.x || 0) * playerScale;
                const scaledOffsetY = (accessory.hatOffset?.y || 0) * playerScale;
                const scaledWidth = (accessory.size?.[0] || 0) * playerScale;
                const scaledHeight = (accessory.size?.[1] || 0) * playerScale;

                // Standard rotation matrix:
                // x' = x*cos - y*sin
                // y' = x*sin + y*cos
                const rotatedX = scaledOffsetX * cos - scaledOffsetY * sin;
                const rotatedY = scaledOffsetX * sin + scaledOffsetY * cos;

                LC.drawImageFast(
                    accessory.name,
                    screenPosX + rotatedX - (scaledWidth / 2),
                    screenPosY + rotatedY - (scaledHeight / 2),
                    scaledWidth,
                    scaledHeight,
                    this.angle,
                    alpha
                );
            }
        }

        if (isFrozen(this) && renderQuality.showStatusOverlays) {
            drawIceEncasingOverlay(LC, screenPosX, screenPosY, this.radius, alpha);
        }

        // draw health as bar
        if (this.isAlive && this.health !== undefined && this.maxHealth !== undefined && (renderQuality.showBars || isLocalPlayer)) {
            const barWidth = this.radius * 2;
            const barHeight = 5;
            const healthPercentage = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
            const healthColor = getHealthBarColor(healthPercentage);

            // Background of the health bar
            LC.drawRectFast(screenPosX - barWidth / 2, screenPosY + this.radius + 5, barWidth, barHeight, 'rgba(128, 128, 128, 0.45)', alpha, 2);

            // Foreground of the health bar
            LC.drawRectFast(screenPosX - barWidth / 2, screenPosY + this.radius + 5, barWidth * healthPercentage, barHeight, healthColor, alpha, 2);
        }

        // draw chat
        if (this.chatMessage !== "" && (renderQuality.showChat || isLocalPlayer)) {
            const chatText = this.chatMessage;
            let chatCache = this._chatRenderCache;
            if (!chatCache || chatCache.text !== chatText) {
                chatCache = {
                    text: chatText,
                    width: LC.measureText({
                        text: chatText,
                        font: '17px Arial'
                    }).width
                };
                this._chatRenderCache = chatCache;
            }
            const padding = 5;
            LC.drawRectFast(
                screenPosX - chatCache.width / 2 - padding,
                screenPosY - this.radius - 30 - 20 - padding,
                chatCache.width + padding * 2,
                20 + padding * 1.5,
                'rgba(64, 64, 64, 0.7)',
                alpha,
                5
            );


            LC.drawTextFast(chatText, screenPosX - chatCache.width / 2, screenPosY - this.radius - 35, '17px Arial', 'white', 'left', 'alphabetic', alpha);
        }

        let idText = "";
        let idWidth = 0;
        let debugIdX = screenPosX;

        const hoverDx = Vars.mouseWorldX - this.x;
        const hoverDy = Vars.mouseWorldY - this.y;
        const isHoveringPlayer = (hoverDx * hoverDx + hoverDy * hoverDy) <= ((this.radius + 12) * (this.radius + 12));
        if (Settings.debugMode && isHoveringPlayer) {
            idText = ` (${this.id})`;
            let debugIdCache = this._debugIdRenderCache;
            if (!debugIdCache || debugIdCache.text !== idText) {
                debugIdCache = {
                    text: idText,
                    width: LC.measureText({
                        text: idText,
                        font: 'bold 16px Arial'
                    }).width
                };
                this._debugIdRenderCache = debugIdCache;
            }
            idWidth = debugIdCache.width;
        }

        const shouldShowCollisionDebug = this.id === Vars.myId
            && Settings.debugMode
            && Vars.debugCollisionShiftHeld
            && (Vars.latestCollisionDebugId || 0) > 0;
        if (shouldShowCollisionDebug) {
            const typeLabel = ({
                1: 'Player',
                2: 'Mob',
                3: 'Projectile',
                4: 'Structure',
                5: 'Object'
            })[Vars.latestCollisionDebugType] || 'Unknown';
            const collisionText = `${typeLabel}, ${Vars.latestCollisionDebugId}`;
            let collisionCache = this._collisionDebugRenderCache;
            if (!collisionCache || collisionCache.text !== collisionText) {
                collisionCache = {
                    text: collisionText,
                    width: LC.measureText({
                        text: collisionText,
                        font: 'bold 14px Arial'
                    }).width
                };
                this._collisionDebugRenderCache = collisionCache;
            }

            const boxPadX = 10;
            const boxHeight = 24;
            const boxTop = screenPosY - this.radius - 44;
            LC.drawRect({
                pos: [screenPosX - (collisionCache.width / 2) - boxPadX, boxTop],
                size: [collisionCache.width + (boxPadX * 2), boxHeight],
                color: 'rgba(0, 0, 0, 0.72)',
                cornerRadius: 6,
                transparency: alpha
            });
            LC.drawText({
                text: collisionText,
                pos: [screenPosX - collisionCache.width / 2, boxTop + 17],
                color: 'white',
                font: 'bold 14px Arial',
                transparency: alpha
            });
        }

        if (renderQuality.showNames) {
            // draw username as text
            const usernameText = this.username;
            const levelText = `${getLevelFromXp(this.score)} | `;
            let nameplateCache = this._nameplateRenderCache;
            if (!nameplateCache || nameplateCache.usernameText !== usernameText || nameplateCache.levelText !== levelText) {
                nameplateCache = {
                    usernameText,
                    levelText,
                    usernameWidth: LC.measureText({
                        text: usernameText,
                        font: 'bold 16px Arial'
                    }).width,
                    levelWidth: LC.measureText({
                        text: levelText,
                        font: 'bold 16px Arial'
                    }).width
                };
                this._nameplateRenderCache = nameplateCache;
            }

            const totalWidth = nameplateCache.levelWidth + nameplateCache.usernameWidth + idWidth;
            const usernameColor = isLocalPlayerInSnowBiome() ? '#4b5563' : 'white';
            debugIdX = screenPosX - totalWidth / 2 + nameplateCache.levelWidth + nameplateCache.usernameWidth;

            LC.drawTextFast(levelText, screenPosX - totalWidth / 2, screenPosY - this.radius - 5, 'bold 16px Arial', '#1e3a8a', 'left', 'alphabetic', alpha);

            LC.drawTextFast(usernameText, screenPosX - totalWidth / 2 + nameplateCache.levelWidth, screenPosY - this.radius - 5, 'bold 16px Arial', usernameColor, 'left', 'alphabetic', alpha);
        }

        if (Settings.debugMode && isHoveringPlayer) {
            LC.drawTextFast(idText, debugIdX, screenPosY - this.radius - 5, 'bold 16px Arial', 'lightgray', 'left', 'alphabetic', alpha);
        };

        if (Settings.drawHitboxes) {
            if (this.isBot && this.botRoleCode > 0) {
                const roleText = this.botRoleCode === 1 ? 'p' : (this.botRoleCode === 2 ? 'c' : 'n');
                const roleColor = this.botRoleCode === 1 ? '#ef4444' : (this.botRoleCode === 2 ? '#f59e0b' : '#22c55e');
                LC.drawText({
                    text: roleText,
                    pos: [screenPosX - 4, screenPosY - this.radius - 22],
                    color: roleColor,
                    font: 'bold 14px Arial',
                    transparency: alpha
                });
            }
            LC.drawCircleFast(screenPosX, screenPosY, this.radius, 'red', 0.2 * alpha, true, true, null, 3);
            LC.drawLineFast(screenPosX, screenPosY, this.radius, this.angle, 'red', 3, 0.85 * alpha);
        }
    }
}
