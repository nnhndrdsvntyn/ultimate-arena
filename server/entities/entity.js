import { getWorldMapSize } from '../../public/shared/worlds.js';

export class Entity {
    constructor(id, x, y, radius, speed, hp, maxHp) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.lastX = x;
        this.lastY = y;
        this.radius = radius;
        this.speed = speed;
        this.hp = hp;
        this.maxHp = maxHp;
    }
    clamp() {
        const mapSize = getWorldMapSize(this.world || 'main');
        // clamp inside map bounds
        if (this.x < 0 + this.radius) this.x = 0 + this.radius;
        if (this.y < 0 + this.radius) this.y = 0 + this.radius;
        if (this.x > mapSize[0] - this.radius) this.x = mapSize[0] - this.radius;
        if (this.y > mapSize[1] - this.radius) this.y = mapSize[1] - this.radius;
    }
}
