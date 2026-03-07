import {
    ENTITIES,
    brokenObjects
} from '../../game.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    colliding
} from '../../helpers.js';
import { recordResolveCollisionCall } from '../../debug.js';
import {
    Entity
} from '../entity.js';

export class GameObject extends Entity {
    constructor(id, x, y, type) {
        // Use default values if maxHealth isn't defined in dataMap
        const maxHealth = dataMap.OBJECTS[type].maxHealth || 100;
        super(id, x, y, dataMap.OBJECTS[type].radius, 0, maxHealth, maxHealth);

        this.score = dataMap.OBJECTS[type].score;
        this.type = type;
        this.timeBroken;
        this.spawnTime = performance.now();

        this.targetX = undefined;
        this.targetY = undefined;
        this.teleportTicks = 0;

        ENTITIES.OBJECTS[id] = this;
    }

    process() {
        if (this.teleportTicks > 0) {
            if (this.targetX !== undefined && this.targetY !== undefined) {
                const ticksLeft = Math.max(1, this.teleportTicks);
                this.x += (this.targetX - this.x) / ticksLeft;
                this.y += (this.targetY - this.y) / ticksLeft;
            }
            this.teleportTicks--;
            if (this.teleportTicks <= 0) {
                if (this.targetX !== undefined && this.targetY !== undefined) {
                    this.x = this.targetX;
                    this.y = this.targetY;
                }
                this.targetX = undefined;
                this.targetY = undefined;
                this.teleportTicks = 0;
            }
        }

        this.resolveCollisions();
    }

    resolveCollisions() {
        recordResolveCollisionCall();
        if (this.lastX === this.x && this.lastY === this.y) return;
        const world = this.world || 'main';

        // Simple collision resolution with structures of type 2 (Rocks)
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            if ((structure.world || 'main') !== world) continue;
            if (structure.type === 2) {
                const dx = this.x - structure.x;
                const dy = this.y - structure.y;
                const nearRange = (this.radius || 0) + (structure.radius || 0) + 10;
                if ((dx * dx + dy * dy) > (nearRange * nearRange)) continue;
                if (colliding(this, structure)) {
                    const dist = Math.hypot(dx, dy) || 1;
                    const pushScale = 10 / dist;
                    this.x += dx * pushScale;
                    this.y += dy * pushScale;
                }
            }
        }

        this.lastX = this.x;
        this.lastY = this.y;
    }

    die(killer) {
        if (killer && typeof killer.addScore === 'function') {
            killer.addScore(this.score);
        }

        const config = dataMap.OBJECTS[this.type];
        if (config && config.isChest) { // only chests will respawn later
            this.timeBroken = performance.now();
            brokenObjects[this.id] = {
                ...this
            };
        }

        ENTITIES.deleteEntity('object', this.id);
    }
}
