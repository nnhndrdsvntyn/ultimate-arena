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
    isWeaponRank,
    isChestObjectType,
    isCoinObjectType,
    getWeaponSize
} from "./shared/datamap.js";
import { getRenderQuality } from "./render_quality.js";

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
        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;
        const dx = this.newX - this.x;
        const dy = this.newY - this.y;
        const distSq = dx * dx + dy * dy;
        const isEphemeral = !!dataMap.OBJECTS[this.type]?.isEphemeral;
        const snapDistance = isEphemeral ? 140 : 90;
        if (distSq > (snapDistance * snapDistance)) {
            this.x = this.newX;
            this.y = this.newY;
            return;
        }
        const baseLerpFactor = (TPS.clientCapped / TPS.server) / 10;
        const lerpFactor = isEphemeral
            ? Math.min(0.8, Math.max(0.35, baseLerpFactor * 1.8))
            : Math.min(0.72, Math.max(0.3, baseLerpFactor * 1.35));
        this.x += dx * lerpFactor;
        this.y += dy * lerpFactor;
        const settleThreshold = isEphemeral ? 0.8 : 0.5;
        if (Math.abs(this.newX - this.x) < settleThreshold) this.x = this.newX;
        if (Math.abs(this.newY - this.y) < settleThreshold) this.y = this.newY;
    }
    draw() {

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;
        const renderQuality = getRenderQuality(this, this.radius);

        // draw health as bar
        const proportions = dataMap.OBJECTS[this.type].imgProportions;
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

        // draw image
        let imgWidth = this.radius * proportions[0];
        let imgHeight = this.radius * proportions[1];

        // Ground swords should match how they look for a regular-sized player holding them.
        if (isWeaponRank(this.type)) {
            const [swordWidth, swordHeight] = getWeaponSize(this.type);
            imgWidth = swordWidth;
            imgHeight = swordHeight;
        }

        const objectCfg = dataMap.OBJECTS?.[this.type];
        const swordStackCount = isWeaponRank(this.type) ? Math.max(1, Math.floor(this.amount || 1)) : 1;
        if (isWeaponRank(this.type) && swordStackCount > 1) {
            const renderCount = Math.min(3, swordStackCount, renderQuality.stackRenderLimit);
            for (let i = 0; i < renderCount; i++) {
                const seed = ((this.id + 7) * 1103515245 + (i + 1) * 12345) >>> 0;
                const angle = (seed % 360) * (Math.PI / 180);
                const dist = 4 + ((seed >>> 8) % 6); // 4..9 px
                const ox = Math.round(Math.cos(angle) * dist);
                const oy = Math.round(Math.sin(angle) * dist);
                const rot = this.rotation + (i - 1) * 0.35;
                LC.drawImage({
                    name: this.imgName,
                    pos: [screenPosX - imgWidth / 2 + ox, screenPosY - imgHeight / 2 + oy],
                    size: [imgWidth, imgHeight],
                    rotation: rot
                });
            }
        } else if (objectCfg?.stackable && !isCoinObjectType(this.type)) {
            const count = Math.max(1, Math.floor(this.amount || 1));
            let tempAmount = count;
            let bunchIndex = 0;
            while (tempAmount > 0) {
                const bunchAmount = Math.min(256, tempAmount);
                tempAmount -= 256;

                const itemsInThisBunch = Math.min(5, bunchAmount, renderQuality.stackRenderLimit);
                const bunchAngle = (this.id * 0.7 + bunchIndex * 2.45) % (Math.PI * 2);
                const bunchDist = bunchIndex * 15;
                const bx = Math.cos(bunchAngle) * bunchDist;
                const by = Math.sin(bunchAngle) * bunchDist;

                for (let i = 0; i < itemsInThisBunch; i++) {
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
                if (renderQuality.far) break;
            }
        } else if (isCoinObjectType(this.type)) {
            let tempAmount = Math.max(1, Math.floor(this.amount || 1));
            let bunchIndex = 0;
            while (tempAmount > 0) {
                const bunchAmount = Math.min(256, tempAmount);
                tempAmount -= 256;

                const coinsInThisBunch = Math.min((bunchAmount >= 5) ? 5 : bunchAmount, renderQuality.stackRenderLimit);
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
                if (renderQuality.far) break;
            }
        } else {
            LC.drawImage({
                name: this.imgName,
                pos: [screenPosX - imgWidth / 2, screenPosY - imgHeight / 2],
                size: [imgWidth, imgHeight],
                rotation: isWeaponRank(this.type) ? this.rotation : 0, // only rotate weapon drops
            });
        }

        // Draw chest ID only while hovering in debug mode.
        const hoverDx = Vars.mouseWorldX - this.x;
        const hoverDy = Vars.mouseWorldY - this.y;
        const isHoveringObject = (hoverDx * hoverDx + hoverDy * hoverDy) <= ((this.radius + 12) * (this.radius + 12));
        if (Settings.debugMode && isChestObjectType(this.type) && isHoveringObject) {
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
                transparency: 0.2,
                fill: true,
                stroke: true,
                strokeWidth: 3
            });
        }
    }
}
