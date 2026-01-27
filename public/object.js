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
    TPS
} from "./shared/datamap.js";
export class GameObject {
    constructor(id, x, y, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.newX = x;
        this.newY = y;

        if (type >= 1 && type <= 4) { // chests (types 1-4) have health
            this.health = dataMap.OBJECTS[type].maxHealth;
            this.maxHealth = dataMap.OBJECTS[type].maxHealth;
        }
        this.imgName = dataMap.OBJECTS[type].imgName;
        this.type = type;
        this.radius = dataMap.OBJECTS[type].radius;
        this.rotation = (id % 100) / 100 * Math.PI * 2; // Unique but static rotation

        ENTITIES.OBJECTS[id] = this;
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

        // draw image
        const imgWidth = this.radius * proportions[0];
        const imgHeight = this.radius * proportions[1];

        LC.drawImage({
            name: this.imgName,
            pos: [screenPosX - imgWidth / 2, screenPosY - imgHeight / 2],
            size: [imgWidth, imgHeight],
            rotation: this.type >= 6 ? this.rotation : 0, // only rotate weapons (types 6-12)
        });

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