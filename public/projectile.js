import {
    ENTITIES
} from './game.js';
import {
    dataMap,
    TPS
} from './shared/datamap.js';
import {
    LC,
    camera
} from './client.js';

export class Projectile {
    constructor(id, x, y, angle, type, weaponRank) {
        this.id = id;

        this.x = x;
        this.newX = x;
        this.y = y;
        this.newY = y;

        this.angle = angle;
        this.angleOffset = 0;
        this.newAngle = angle;

        this.type = type;
        this.weaponRank = weaponRank;
        this.radius = 10;
        this.renderLength = 0;

        ENTITIES.PROJECTILES[id] = this;
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

        // lerp angle for projectiles
        this.angle += (((this.newAngle - this.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI) * lerpFactor);

        // keep angle within range
        this.angle = ((this.angle + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;

        // for thrown swords
        if (this.type === -1) {
            // spin a little bit
            this.angleOffset += 15 * (Math.PI / 180);
            this.angleOffset %= Math.PI * 2;
        }
    }
    draw() {
        if (typeof this.x === 'undefined' || typeof this.y === 'undefined') return;

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

        // for thrown swords
        if (this.type === -1) {
            // Draw sword
            let swordWidth = 100;
            let swordHeight = 33;
            if (dataMap.SWORDS.imgs[this.weaponRank]) {
                swordWidth = dataMap.SWORDS.imgs[this.weaponRank].swordWidth;
                swordHeight = dataMap.SWORDS.imgs[this.weaponRank].swordHeight;
            }

            LC.drawImage({
                name: dataMap.SWORDS.imgs[this.weaponRank].name,
                pos: [screenPosX - swordWidth / 2, screenPosY - swordHeight / 2],
                size: [swordWidth, swordHeight],
                rotation: this.angle + this.angleOffset,
            });
        } else {
            let proportions = {
                ...dataMap.PROJECTILES[this.type].imgProportions
            };
            let drawWidth = proportions[0] * this.radius;
            let drawHeight = proportions[1] * this.radius;
            if (this.type === 10) {
                if ((this.renderLength || 0) > 0) {
                    drawWidth = this.renderLength;
                }
            }
            LC.drawImage({
                name: dataMap.PROJECTILES[this.type].imgName,
                pos: [screenPosX - (drawWidth / 2), screenPosY - (drawHeight / 2)],
                size: [drawWidth, drawHeight],
                rotation: this.angle,
            });
        }

        if (Settings.drawHitboxes) {
            if (this.type == -1) {
                let swordWidth = 100;
                if (dataMap.SWORDS.imgs[this.weaponRank]) {
                    swordWidth = dataMap.SWORDS.imgs[this.weaponRank].swordWidth;
                }
                LC.drawCircle({
                    pos: [screenPosX, screenPosY],
                    radius: swordWidth,
                    color: 'purple',
                    transparency: 0.5
                });
            } else {
                LC.drawCircle({
                    pos: [screenPosX, screenPosY],
                    radius: this.radius,
                    color: 'purple',
                    transparency: 0.5
                });
            }
        }
    }
}
