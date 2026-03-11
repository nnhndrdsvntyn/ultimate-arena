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
    resolveCollisions(worldPlayers = null, worldMobs = null) {
        recordResolveCollisionCall();
        const cfg = dataMap.STRUCTURES[this.type] || {};
        if (cfg.noCollisions || cfg.isSafeZone) return;
        const baseNearRange = (this.radius || 0) + 80;
        const players = Array.isArray(worldPlayers) ? worldPlayers : Object.values(ENTITIES.PLAYERS);
        const mobs = Array.isArray(worldMobs) ? worldMobs : Object.values(ENTITIES.MOBS);

        players.forEach(p => this.resolveEntityCollision(p, baseNearRange));
        mobs.forEach(m => this.resolveEntityCollision(m, baseNearRange));
    }

    resolveEntityCollision(entity, baseNearRange) {
        if (!entity) return;
        if (entity.isAlive === false) return;

        const nearDx = entity.x - this.x;
        const nearDy = entity.y - this.y;
        if ((nearDx * nearDx + nearDy * nearDy) > (baseNearRange * baseNearRange)) return;

        if (!colliding(entity, this, 50)) return;

        const dist = Math.sqrt((nearDx * nearDx) + (nearDy * nearDy)) || 1;
        const scale = (entity.radius || 0) / dist;
        const dx = nearDx * scale;
        const dy = nearDy * scale;

        entity.x += dx;
        entity.y += dy;
    }
}
