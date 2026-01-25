import { dataMap } from "./shared/datamap.js";
import { Vars, camera } from "./client.js";
import { ENTITIES } from "./game.js";
import { LC } from "./client.js";
export class GameObject {
    constructor(id, x, y, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        if ([1].includes(type)) { // only chests have health
            this.health = dataMap.OBJECTS[type].maxHealth;
            this.maxHealth = dataMap.OBJECTS[type].maxHealth;
        }
        this.imgSrc = dataMap.OBJECTS[type].imgSrc;
        this.imgName = dataMap.OBJECTS[type].imgName;
        this.type = type;
        this.radius = dataMap.OBJECTS[type].radius;

        ENTITIES.OBJECTS[id] = this;
    }
    draw() {
        // target is local player
        if (ENTITIES.PLAYERS[Vars.myId]) {
            camera.target.x = ENTITIES.PLAYERS[Vars.myId].x;
            camera.target.y = ENTITIES.PLAYERS[Vars.myId].y;

            camera.x = camera.target.x - (LC.width / 2);
            camera.y = camera.target.y - (LC.height / 2);
        }

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

        // draw health as bar
        let proportions = { ...dataMap.OBJECTS[this.type].imgProportions };
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
        LC.drawImage({
            src: this.imgSrc,
            pos: [screenPosX - this.radius * (proportions[0] / 2), screenPosY - this.radius * (proportions[1] / 2)],
            size: [this.radius * proportions[0], this.radius * proportions[1]],
            name: this.imgName,
            proportions: dataMap.OBJECTS[this.type].imgProportions
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