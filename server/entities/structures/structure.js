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
import { recordResolveCollisionCall } from '../../debug.js';

export class Structure extends Entity {
    constructor(id, x, y, type) {
        const radius = dataMap.STRUCTURES[type].radius;
        super(id, x, y, radius, 0, 0, 0);

        this.type = type;

        ENTITIES.STRUCTURES[id] = this;
    }
    resolveCollisions() {
        recordResolveCollisionCall();
        const cfg = dataMap.STRUCTURES[this.type] || {};
        if (cfg.noCollisions || cfg.isSafeZone) return;
        const world = this.world || 'main';
        const baseNearRange = (this.radius || 0) + 80;

        // check collisions with players
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player) continue;
            if ((player.world || 'main') !== world) continue;
            if (!player.isAlive) continue;
            const nearDx = player.x - this.x;
            const nearDy = player.y - this.y;
            if ((nearDx * nearDx + nearDy * nearDy) > (baseNearRange * baseNearRange)) continue;

            // check if touching
            if (colliding(player, this, 50)) {
                // resolve collision
                const dist = Math.hypot(nearDx, nearDy) || 1;
                const scale = (player.radius || 0) / dist;
                const dx = nearDx * scale;
                const dy = nearDy * scale;

                // only move the player
                player.x += dx;
                player.y += dy;
            }
        }

        // check collisions with mobs
        for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            if (!mob) continue;
            if ((mob.world || 'main') !== world) continue;
            const nearDx = mob.x - this.x;
            const nearDy = mob.y - this.y;
            if ((nearDx * nearDx + nearDy * nearDy) > (baseNearRange * baseNearRange)) continue;
            // check if touching
            if (colliding(mob, this, 50)) {
                // resolve collision
                const dist = Math.hypot(nearDx, nearDy) || 1;
                const scale = (mob.radius || 0) / dist;
                const dx = nearDx * scale;
                const dy = nearDy * scale;

                // only move the mob
                mob.x += dx;
                mob.y += dy;
            }
        }
    }
}
