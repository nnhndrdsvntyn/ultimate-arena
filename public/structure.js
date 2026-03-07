import {
    ENTITIES,
    MAP_SIZE
} from './game.js';
import {
    dataMap
} from './shared/datamap.js';
import {
    LC,
    camera,
    Settings
} from './client.js';

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

        if (this.type === 1) {
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
            return;
        }

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

        let imgName = dataMap.STRUCTURES[this.type].imgName;

        const riverStart = MAP_SIZE[0] * 0.47;
        // If it's on the right side (snow biome), use the snowy rock texture.
        if (this.type === 2 && this.x > riverStart) {
            imgName = 'rock1-snow';
        }

        LC.drawImage({
            name: imgName,
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
