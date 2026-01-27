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
    }
    draw() {
        if (typeof this.x === 'undefined' || typeof this.y === 'undefined') return;

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

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
            const healthPercentage = this.health / this.maxHealth;

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