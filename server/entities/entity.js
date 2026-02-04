import {
    MAP_SIZE
} from '../game.js';

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
        // clamp inside map bounds
        if (this.x < 0 + this.radius) this.x = 0 + this.radius;
        if (this.y < 0 + this.radius) this.y = 0 + this.radius;
        if (this.x > MAP_SIZE[0] - this.radius) this.x = MAP_SIZE[0] - this.radius;
        if (this.y > MAP_SIZE[1] - this.radius) this.y = MAP_SIZE[1] - this.radius;
    }
}