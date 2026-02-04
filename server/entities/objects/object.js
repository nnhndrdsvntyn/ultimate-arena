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
            this.teleportTicks--;
            if (this.teleportTicks === 0 && this.targetX !== undefined && this.targetY !== undefined) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.targetX = undefined;
                this.targetY = undefined;
            }
        }

        this.resolveCollisions();
    }

    resolveCollisions() {
        if (this.lastX === this.x && this.lastY === this.y) return;

        // Simple collision resolution with structures of type 2 (Rocks)
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (structure.type === 2) {
                if (colliding(this, structure)) {
                    const angle = Math.atan2(this.y - structure.y, this.x - structure.x);
                    this.x += Math.cos(angle) * 10;
                    this.y += Math.sin(angle) * 10;
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