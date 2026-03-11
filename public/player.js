import {
    ENTITIES
} from './game.js';
import {
    Vars,
    camera,
    LC,
    Settings,
    isLocalPlayerInSnowBiome
} from './client.js';
import {
    TPS,
    dataMap,
    isSwordRank,
    ACCESSORY_KEYS,
    getLevelFromXp
} from './shared/datamap.js';

function getHealthBarColor(healthRatio) {
    if (healthRatio >= 0.5) return '#22c55e';
    if (healthRatio >= 0.25) return '#eab308';
    return '#ef4444';
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

        this.username = "";
        this.chatMessage = "";

        this.newAngle = 0;
        this.angle = 0;

        this.radius = dataMap.PLAYERS.baseRadius;
        this._wasAliveState = this.isAlive;
        this._deathFadeStart = 0;
        this._deathFadeX = x;
        this._deathFadeY = y;
        this._deathFadeDuration = 750;

        ENTITIES.PLAYERS[id] = this;
    }
    update() {
        const lerpFactor = (TPS.clientCapped / TPS.server) / 10;

        if (this._wasAliveState && !this.isAlive) {
            this._deathFadeStart = performance.now();
            this._deathFadeX = this.x;
            this._deathFadeY = this.y;
        } else if (!this._wasAliveState && this.isAlive) {
            this._deathFadeStart = 0;
        }
        this._wasAliveState = this.isAlive;

        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;

        // Always interpolate positions to avoid hard snapping.
        if (typeof this.x !== 'undefined') {
            this.x = this.x + (this.newX - this.x) * lerpFactor;
        } else {
            this.x = this.newX;
        }
        if (typeof this.y !== 'undefined') {
            this.y = this.y + (this.newY - this.y) * lerpFactor;
        } else {
            this.y = this.newY;
        }

        // update score
        this.score = this.newScore;

        // lerp swing state
        const delta = this.newSwingState - this.swingState;
        const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        const radiusScale = Math.max(0.1, (this.radius || baseRadius) / baseRadius);
        const swingLerpFactor = Math.max(0.05, lerpFactor / radiusScale);

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
            this.angle += (((this.newAngle - this.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI) * lerpFactor);
        }

        // keep angle within range
        this.angle = ((this.angle + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
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

        const isSelfInvisible = this.id === Vars.myId && this.isInvisible;
        const alpha = (isSelfInvisible ? 0.5 : 1) * deathFadeAlpha;

        if (this.hasShield) {
            LC.drawImage({
                name: 'spawn-zone-shield',
                pos: [screenPosX - this.radius * 1.5, screenPosY - this.radius * 1.5],
                size: [this.radius * 3, this.radius * 3],
                transparency: 0.5 * alpha
            });
        }

        const leaderId = Vars.topLeader?.id || 0;
        if (leaderId === this.id && LC.images?.['ui-crown']) {
            const crownSize = 72;
            LC.drawImage({
                name: 'ui-crown',
                pos: [screenPosX - (crownSize / 2), screenPosY - this.radius - crownSize - 28],
                size: [crownSize, crownSize],
                transparency: alpha
            });
        }

        this.swordAngleOffset = (this.swingState * (Math.PI / 6)) - (Math.PI / 2);
        const angleRad = this.angle + this.swordAngleOffset;

        let currentRank = this.weaponRank || 0;
        // If we are dragging the currently selected item OR if it's currently thrown, hide it from the player's hand
        if ((this.id === Vars.myId && Vars.dragSlot !== -1 && Vars.dragSlot === Vars.selectedSlot) || currentRank > 127) {
            currentRank = 0;
        }

        if (isSwordRank(currentRank)) {
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const swordScale = this.radius / baseRadius;
            const swordWidth = (dataMap.SWORDS.imgs[currentRank]?.swordWidth || 100) * swordScale;
            const swordHeight = (dataMap.SWORDS.imgs[currentRank]?.swordHeight || 50) * swordScale;

            // move origin to the handle instead of center
            const offsetX = Math.cos(angleRad) * (this.radius + swordWidth / 2);
            const offsetY = Math.sin(angleRad) * (this.radius + swordWidth / 2);

            let swordImgName = `swords-sword${currentRank}`;
            if (!LC.images[swordImgName]) {
                swordImgName = `swords-wipsword`;
            }

            if (this.hasWeapon) {
                LC.drawImage({
                    name: swordImgName,
                    pos: [
                        screenPosX + offsetX - swordWidth / 2,
                        screenPosY + offsetY - swordHeight / 2
                    ],
                    size: [swordWidth, swordHeight],
                    rotation: angleRad,
                    transparency: alpha
                });
            }
        }

        // actual image
        LC.drawImage({
            name: dataMap.PLAYERS.imgs[1].name, // player default
            pos: [screenPosX - this.radius, screenPosY - this.radius],
            size: [this.radius * 2, this.radius * 2],
            rotation: this.angle,
            transparency: alpha
        });

        // draw accessory
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        if (accessoryKey && accessoryKey !== 'none') {
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

                LC.drawImage({
                    name: accessory.name,
                    pos: [
                        screenPosX + rotatedX - (scaledWidth / 2),
                        screenPosY + rotatedY - (scaledHeight / 2)
                    ],
                    size: [scaledWidth, scaledHeight],
                    rotation: this.angle,
                    transparency: alpha
                });
            }
        }

        // draw health as bar
        if (this.isAlive && this.health !== undefined && this.maxHealth !== undefined) {
            const barWidth = this.radius * 2;
            const barHeight = 5;
            const healthPercentage = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
            const healthColor = getHealthBarColor(healthPercentage);

            // Background of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 5],
                size: [barWidth, barHeight],
                color: 'rgba(128, 128, 128, 0.45)',
                cornerRadius: 2,
                transparency: alpha
            });

            // Foreground of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 5],
                size: [barWidth * healthPercentage, barHeight],
                color: healthColor,
                cornerRadius: 2,
                transparency: alpha
            });
        }

        // draw chat
        if (this.chatMessage !== "") {
            const chatText = this.chatMessage;
            const chatMetrics = LC.measureText({
                text: chatText,
                font: '17px Arial'
            });
            const padding = 5;
            LC.drawRect({ // chat bubble
                pos: [screenPosX - chatMetrics.width / 2 - padding, screenPosY - this.radius - 30 - 20 - padding],
                size: [chatMetrics.width + padding * 2, 20 + padding * 1.5],
                color: 'rgba(64, 64, 64, 0.7)',
                cornerRadius: 5,
                transparency: alpha
            });


            LC.drawText({
                text: chatText,
                pos: [screenPosX - chatMetrics.width / 2, screenPosY - this.radius - 35],
                color: 'white',
                font: '17px Arial',
                transparency: alpha
            });
        }

        // draw username as text
        const usernameText = this.username;
        const levelText = `${getLevelFromXp(this.score)} | `;
        const usernameMetrics = LC.measureText({
            text: usernameText,
            font: 'bold 16px Arial'
        });
        const levelMetrics = LC.measureText({
            text: levelText,
            font: 'bold 16px Arial'
        });
        let idText = "";
        let idMetrics = {
            width: 0
        };

        if (Settings.showPlayerIds) {
            idText = ` (${this.id})`;
            idMetrics = LC.measureText({
                text: idText,
                font: 'bold 16px Arial'
            });
        }

        const totalWidth = levelMetrics.width + usernameMetrics.width + idMetrics.width;
        const usernameColor = isLocalPlayerInSnowBiome() ? '#4b5563' : 'white';

        LC.drawText({
            text: levelText,
            pos: [screenPosX - totalWidth / 2, screenPosY - this.radius - 5],
            color: '#1e3a8a',
            font: 'bold 16px Arial',
            transparency: alpha
        });

        LC.drawText({
            text: usernameText,
            pos: [screenPosX - totalWidth / 2 + levelMetrics.width, screenPosY - this.radius - 5],
            color: usernameColor,
            font: 'bold 16px Arial',
            transparency: alpha
        });

        if (Settings.showPlayerIds) {
            LC.drawText({
                text: idText,
                pos: [screenPosX - totalWidth / 2 + levelMetrics.width + usernameMetrics.width, screenPosY - this.radius - 5],
                color: 'lightgray',
                font: 'bold 16px Arial',
                transparency: alpha
            });
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
            LC.drawCircle({
                pos: [screenPosX, screenPosY],
                radius: this.radius,
                color: 'red',
                transparency: 0.5 * alpha
            });
        }
    }
}
