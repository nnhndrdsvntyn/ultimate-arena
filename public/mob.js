import {
    ENTITIES
} from './game.js';

import {
    LC,
    camera
} from './client.js';
import {
    TPS,
    dataMap
} from './shared/datamap.js';

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

        if (this.type === 6) {
            const axeRank = 9;
            const axeWidth = (dataMap.SWORDS.imgs[axeRank]?.swordWidth || 200) * 1.5;
            const axeHeight = (dataMap.SWORDS.imgs[axeRank]?.swordHeight || 65) * 1.5;
            const axeAngleOffset = (this.swingState * (Math.PI / 6)) - (Math.PI / 2);
            const axeAngle = this.angle + axeAngleOffset;
            const axeBackOffset = 32;
            const axeDownOffset = -10;
            const axeOffsetX = Math.cos(axeAngle) * (this.radius + axeWidth / 2) - Math.cos(axeAngle) * axeBackOffset;
            const axeOffsetY = Math.sin(axeAngle) * (this.radius + axeWidth / 2) - Math.sin(axeAngle) * axeBackOffset + axeDownOffset;

            LC.drawImage({
                name: dataMap.SWORDS.imgs[axeRank]?.name || 'swords-sword9',
                pos: [
                    screenPosX + axeOffsetX - axeWidth / 2,
                    screenPosY + axeOffsetY - axeHeight / 2
                ],
                size: [axeWidth, axeHeight],
                rotation: axeAngle
            });

            const proportions = dataMap.MOBS[this.type].imgProportions;
            LC.drawImage({
                name: dataMap.MOBS[this.type].imgName,
                pos: [screenPosX - this.radius * (proportions[0] / 2), screenPosY - this.radius * (proportions[1] / 2)],
                size: [proportions[0] * this.radius, proportions[1] * this.radius],
                rotation: this.angle
            });

            if (this.health !== undefined && this.maxHealth !== undefined) {
                const barWidth = this.radius * 2;
                const barHeight = 5;
                const healthPercentage = Math.min(1, this.health / this.maxHealth);
                LC.drawRect({
                    pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 8],
                    size: [barWidth, barHeight],
                    color: 'red',
                    cornerRadius: 2
                });
                LC.drawRect({
                    pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 8],
                    size: [barWidth * healthPercentage, barHeight],
                    color: 'lime',
                    cornerRadius: 2
                });
            }

            if (Settings.drawHitboxes) {
                LC.drawCircle({
                    pos: [screenPosX, screenPosY],
                    radius: this.radius,
                    color: 'orange',
                    transparency: 0.5
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

        // draw health as bar
        if (this.health !== undefined && this.maxHealth !== undefined) {
            const barWidth = this.radius * 2;
            const barHeight = 5;
            const healthPercentage = Math.min(1, this.health / this.maxHealth);

            // Background of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius * (proportions[1] / 2) + 5],
                size: [barWidth, barHeight],
                color: 'red',
                cornerRadius: 2
            });

            // Foreground of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius * (proportions[1] / 2) + 5],
                size: [barWidth * healthPercentage, barHeight],
                color: 'lime',
                cornerRadius: 2
            });
        }

        // hitbox for debug
        if (Settings.drawHitboxes) {
            LC.drawCircle({
                pos: [screenPosX, screenPosY],
                radius: this.radius,
                color: 'orange',
                transparency: 0.5
            });
        }
    }
}
