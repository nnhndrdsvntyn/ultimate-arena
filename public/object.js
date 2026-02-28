import {
    Vars,
    camera,
    Settings
} from "./client.js";
import {
    ENTITIES
} from "./game.js";
import {
    LC
} from "./client.js";
import {
    dataMap,
    TPS,
    isSwordRank,
    isChestObjectType,
    isCoinObjectType
} from "./shared/datamap.js";

function getHealthBarColor(healthRatio) {
    if (healthRatio >= 0.5) return '#22c55e';
    if (healthRatio >= 0.25) return '#eab308';
    return '#ef4444';
}

export class GameObject {
    constructor(id, x, y, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.newX = x;
        this.newY = y;

        this.setType(type);
        // Pseudo-random rotation based on ID using a simple hash
        // This spreads consecutive IDs across different rotations
        const hash = ((id * 2654435761) >>> 0) % 1000;
        this.rotation = (hash / 1000) * Math.PI * 2;

        ENTITIES.OBJECTS[id] = this;
    }

    setType(type) {
        if (this.type === type) return; // No change needed

        this.type = type;
        const objData = dataMap.OBJECTS[type];
        if (!objData) return;

        this.imgName = objData.imgName;
        this.radius = objData.radius;

        if (isChestObjectType(type)) {
            this.health = objData.maxHealth;
            this.maxHealth = objData.maxHealth;
        } else {
            this.health = undefined;
            this.maxHealth = undefined;
        }
    }
    update() {
        const lerpFactor = (TPS.clientCapped / TPS.server) / 10;

        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;

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
    }
    draw() {

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

        // draw health as bar
        const proportions = dataMap.OBJECTS[this.type].imgProportions;
        if (this.health !== undefined && this.maxHealth !== undefined) {
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

        // draw image
        let imgWidth = this.radius * proportions[0];
        let imgHeight = this.radius * proportions[1];

        // Ground swords should keep each sword's actual aspect ratio.
        if (isSwordRank(this.type)) {
            const sword = dataMap.SWORDS.imgs[this.type] || dataMap.SWORDS.imgs[1];
            const swordAspect = (sword?.swordWidth || 100) / Math.max(1, (sword?.swordHeight || 50));
            imgHeight = this.radius;
            imgWidth = imgHeight * swordAspect;
        }

        if (isCoinObjectType(this.type)) {
            let tempAmount = this.amount;
            let bunchIndex = 0;
            while (tempAmount > 0) {
                const bunchAmount = Math.min(256, tempAmount);
                tempAmount -= 256;

                const coinsInThisBunch = (bunchAmount >= 5) ? 5 : bunchAmount;
                const bunchAngle = (this.id * 0.7 + bunchIndex * 2.45) % (Math.PI * 2);
                const bunchDist = bunchIndex * 15; // Spread bunches out more
                const bx = Math.cos(bunchAngle) * bunchDist;
                const by = Math.sin(bunchAngle) * bunchDist;

                for (let i = 0; i < coinsInThisBunch; i++) {
                    const angle = ((this.id * 1.5 + bunchIndex * 3.3 + i * 2.1) % (Math.PI * 2));
                    const dist = (i === 0) ? 0 : (5 + (this.id + i + bunchIndex) % 7);
                    const ox = Math.cos(angle) * dist;
                    const oy = Math.sin(angle) * dist;

                    LC.drawImage({
                        name: this.imgName,
                        pos: [screenPosX - imgWidth / 2 + bx + ox, screenPosY - imgHeight / 2 + by + oy],
                        size: [imgWidth, imgHeight],
                        rotation: 0,
                    });
                }
                bunchIndex++;
            }
        } else {
            LC.drawImage({
                name: this.imgName,
                pos: [screenPosX - imgWidth / 2, screenPosY - imgHeight / 2],
                size: [imgWidth, imgHeight],
                rotation: isSwordRank(this.type) ? this.rotation : 0, // only rotate swords
            });
        }

        // Draw chest ID if enabled
        if (Settings.showChestIds && isChestObjectType(this.type)) {
            const idText = this.id.toString();
            const font = '30px Arial';
            const metrics = LC.measureText({ text: idText, font });
            LC.drawText({
                pos: [screenPosX - metrics.width / 2, screenPosY],
                text: idText,
                font: font,
                color: 'white',
                textBaseline: 'middle'
            });
        }

        if (Settings.drawHitboxes) {
            LC.drawCircle({
                color: 'brown',
                pos: [screenPosX, screenPosY],
                radius: this.radius,
                transparency: 0.5
            });
        }
    }
}
