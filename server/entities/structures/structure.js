import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    ENTITIES
} from '../../game.js';
import {
    Entity
} from '../entity.js';
import {
    colliding,
    playSfx
} from '../../helpers.js';

export class Structure extends Entity {
    constructor(id, x, y, type) {
        const radius = dataMap.STRUCTURES[type].radius;
        super(id, x, y, radius, 0, 0, 0);

        this.type = type;

        ENTITIES.STRUCTURES[id] = this;
    }
    resolveCollisions() {
        if (dataMap.STRUCTURES[this.type].noCollisions) return;

        // check collisions with players
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (this.type === 1 && performance.now() - 10000 > player.lastCombatTime) break; // spawn zones don't handle collisions with players unless they were recently in combat
            if (!player.isAlive) continue;

            // check if touching
            if (colliding(player, this, 50)) {
                // resolve collision
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const dx = Math.cos(angle) * player.radius
                const dy = Math.sin(angle) * player.radius

                // only move the player
                player.x += dx;
                player.y += dy;
            }
        }

        // check collisions with mobs
        for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            // check if touching
            if (colliding(mob, this, 50)) {
                // resolve collision
                const angle = Math.atan2(mob.y - this.y, mob.x - this.x);
                const dx = Math.cos(angle) * mob.radius
                const dy = Math.sin(angle) * mob.radius

                // only move the mob
                mob.x += dx;
                mob.y += dy;
            }
        }
    }
}