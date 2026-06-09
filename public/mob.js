import {
    ENTITIES
} from './game.js';

import {
    LC,
    camera,
    Vars,
    Settings
} from './client.js';
import {
    TPS,
    dataMap,
    getSwordSize,
    getSwordOffset
} from './shared/datamap.js';
import { drawIceEncasingOverlay, isFrozen } from './freeze_overlay.js';
import { getRenderQuality } from './render_quality.js';

function getHealthBarColor(healthRatio) {
    if (healthRatio >= 0.5) return '#22c55e';
    if (healthRatio >= 0.25) return '#eab308';
    return '#ef4444';
}

export class Mob {
    constructor(id, x, y, type) {
        this.id = id;


        this.x = x;
        this.newX = x;
        this.y = y;
        this.newY = y;

        this.health = undefined;
        this.maxHealth = undefined

        this.angle = 0
        this.newAngle = 0;
        this.swingState = 0;
        this.newSwingState = 0;
        this.weaponRank = type === 6 ? 12 : 0;
        this.frozenUntil = 0;

        this.radius = dataMap.MOBS[type].radius;

        this.type = type;

        ENTITIES.MOBS[id] = this;
    }
    update() {
        const lerpFactor = (TPS.clientCapped / TPS.server) / 10;

        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;

        // lerp if x, y is NOT UNDEFINED (IS DEFINED), else don't lerp and change x, y directly.
        if (typeof this.x !== 'undefined') {
            this.x = this.x + (this.newX - this.x) * lerpFactor;
        } else {
            this.x = this.newX
        }
        if (typeof this.y !== 'undefined') {
            this.y = this.y + (this.newY - this.y) * lerpFactor;
        } else {
            this.y = this.newY
        };

        // lerp angle for mobs
        this.angle += (((this.newAngle - this.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI) * lerpFactor);

        // keep angle within range
        this.angle = ((this.angle + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;

        const swingDelta = (this.newSwingState || 0) - (this.swingState || 0);
        if (Math.abs(swingDelta) < 0.01) {
            this.swingState = this.newSwingState || 0;
        } else if ((this.newSwingState || 0) < (this.swingState || 0)) {
            this.swingState = this.newSwingState || 0;
        } else {
            this.swingState = (this.swingState || 0) + swingDelta * lerpFactor;
        }
    }
    draw() {
        if (typeof this.x === 'undefined' || typeof this.y === 'undefined') return;

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;
        const renderQuality = getRenderQuality(this, this.radius);

        if (this.type === 6) {
            const axeRank = dataMap.SWORDS.imgs[this.weaponRank] ? this.weaponRank : 12;
            const [baseAxeWidth, baseAxeHeight] = getSwordSize(axeRank);
            const axeOffset = getSwordOffset(axeRank);
            const axeWidth = baseAxeWidth * 1.5;
            const axeHeight = baseAxeHeight * 1.5;
            const axeAngleOffset = (this.swingState * (Math.PI / 6)) - (Math.PI / 2);
            const axeAngle = this.angle + axeAngleOffset;
            const axeBackOffset = 32;
            const axeDownOffset = -10;
            const radialDistance = this.radius + (axeWidth / 2) - axeBackOffset;
            const radialX = Math.cos(axeAngle) * radialDistance;
            const radialY = Math.sin(axeAngle) * radialDistance;
            const localOffsetX = (axeOffset.x || 0) * 1.5;
            const localOffsetY = ((axeOffset.y || 0) + axeDownOffset) * 1.5;
            const rotatedOffsetX = (Math.cos(axeAngle) * localOffsetX) - (Math.sin(axeAngle) * localOffsetY);
            const rotatedOffsetY = (Math.sin(axeAngle) * localOffsetX) + (Math.cos(axeAngle) * localOffsetY);
            const axeOffsetX = radialX + rotatedOffsetX;
            const axeOffsetY = radialY + rotatedOffsetY;

            if (!renderQuality.veryFar) {
                LC.drawImage({
                    name: dataMap.SWORDS.imgs[axeRank]?.name || 'swords_boulder_blade',
                    pos: [
                        screenPosX + axeOffsetX - axeWidth / 2,
                        screenPosY + axeOffsetY - axeHeight / 2
                    ],
                    size: [axeWidth, axeHeight],
                    rotation: axeAngle
                });
            }

            const proportions = dataMap.MOBS[this.type].imgProportions;
            LC.drawImage({
                name: dataMap.MOBS[this.type].imgName,
                pos: [screenPosX - this.radius * (proportions[0] / 2), screenPosY - this.radius * (proportions[1] / 2)],
                size: [proportions[0] * this.radius, proportions[1] * this.radius],
                rotation: this.angle
            });

            if (isFrozen(this) && renderQuality.showStatusOverlays) {
                drawIceEncasingOverlay(LC, screenPosX, screenPosY, this.radius, 1, [
                    proportions[0] * this.radius,
                    proportions[1] * this.radius
                ]);
            }

            if (this.health !== undefined && this.maxHealth !== undefined && renderQuality.showBars) {
                const barWidth = this.radius * 2;
                const barHeight = 5;
                const healthPercentage = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
                const healthColor = getHealthBarColor(healthPercentage);
                LC.drawRect({
                    pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 8],
                    size: [barWidth, barHeight],
                    color: 'rgba(128, 128, 128, 0.45)',
                    cornerRadius: 2
                });
                LC.drawRect({
                    pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 8],
                    size: [barWidth * healthPercentage, barHeight],
                    color: healthColor,
                    cornerRadius: 2
                });
            }

            if (Settings.drawHitboxes) {
                LC.drawCircle({
                    pos: [screenPosX, screenPosY],
                    radius: this.radius,
                    color: 'orange',
                    transparency: 0.2,
                    fill: true,
                    stroke: true,
                    strokeWidth: 3
                });
                LC.drawLine({
                    start: [screenPosX, screenPosY],
                    length: this.radius,
                    angle: this.angle,
                    color: 'orange',
                    lineWidth: 3,
                    transparency: 0.85
                });
            }
            return;
        }

        let proportions = {
            ...dataMap.MOBS[this.type].imgProportions
        };

        LC.drawImage({
            name: dataMap.MOBS[this.type].imgName,
            pos: [screenPosX - this.radius * (proportions[0] / 2), screenPosY - this.radius * (proportions[1] / 2)],
            size: [proportions[0] * this.radius, proportions[1] * this.radius],
            rotation: this.angle
        });

        if (isFrozen(this) && renderQuality.showStatusOverlays) {
            drawIceEncasingOverlay(LC, screenPosX, screenPosY, this.radius, 1, [
                proportions[0] * this.radius,
                proportions[1] * this.radius
            ]);
        }

        // draw health as bar
        if (this.health !== undefined && this.maxHealth !== undefined && renderQuality.showBars) {
            const barWidth = this.radius * 2;
            const barHeight = 5;
            const healthPercentage = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
            const healthColor = getHealthBarColor(healthPercentage);

            // Background of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius * (proportions[1] / 2) + 5],
                size: [barWidth, barHeight],
                color: 'rgba(128, 128, 128, 0.45)',
                cornerRadius: 2
            });

            // Foreground of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius * (proportions[1] / 2) + 5],
                size: [barWidth * healthPercentage, barHeight],
                color: healthColor,
                cornerRadius: 2
            });
        }

        // hitbox for debug
        const hoverDx = Vars.mouseWorldX - this.x;
        const hoverDy = Vars.mouseWorldY - this.y;
        const isHoveringMob = (hoverDx * hoverDx + hoverDy * hoverDy) <= ((this.radius + 12) * (this.radius + 12));
        if (Settings.debugMode && isHoveringMob) {
            const idText = `(${this.id})`;
            const idMetrics = LC.measureText({ text: idText, font: 'bold 15px Arial' });
            LC.drawText({
                text: idText,
                pos: [screenPosX - (idMetrics.width / 2), screenPosY - this.radius - 10],
                color: 'lightgray',
                font: 'bold 15px Arial'
            });
        }
        if (Settings.drawHitboxes) {
            LC.drawCircle({
                pos: [screenPosX, screenPosY],
                radius: this.radius,
                color: 'orange',
                transparency: 0.2,
                fill: true,
                stroke: true,
                strokeWidth: 3
            });
            LC.drawLine({
                start: [screenPosX, screenPosY],
                length: this.radius,
                angle: this.angle,
                color: 'orange',
                lineWidth: 3,
                transparency: 0.85
            });
        }
    }
}
