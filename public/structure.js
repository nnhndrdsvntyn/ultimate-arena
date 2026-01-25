import { ENTITIES } from './game.js';
import { dataMap } from './shared/datamap.js';
import { LC, camera, Settings } from './client.js';

export class Structure {
    constructor(id, x, y, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.type = type;

        this.radius = dataMap.STRUCTURES[type].radius;

        ENTITIES.STRUCTURES[id] = this;
    }
    draw() {
        // don't draw bushes now, they are drawn in client.js separately for layering purposes
        if (this.type === 3) return;

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

        LC.drawImage({
            name: dataMap.STRUCTURES[this.type].imgName,
            pos: [screenPosX - this.radius, screenPosY - this.radius],
            size: [this.radius * 2, this.radius * 2]
        });

        if (Settings.drawHitboxes) {
            LC.drawCircle({
                color: 'blue',
                pos: [screenPosX, screenPosY],
                radius: this.radius,
                transparency: 0.5
            });
        }
    }
}