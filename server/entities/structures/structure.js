import {
    dataMap,
    isRockStructureType
} from '../../../public/shared/datamap.js';
import {
    ENTITIES
} from '../../game.js';
import {
    Entity
} from '../entity.js';
import {
    playSfx
} from '../../helpers.js';
import { recordResolveCollisionCall } from '../../debug.js';

const COLLISION_DEBUG_STRUCTURE = 4;
const ROOT_WALKER_TYPE = 7;
const YETI_TYPE = 8;
const DUNE_BEHEMOTH_TYPE = 16;
const INFERNO_BEAST_TYPE = 17;

export class Structure extends Entity {
    constructor(id, x, y, type) {
        const radius = dataMap.STRUCTURES[type].radius;
        super(id, x, y, radius, 0, 0, 0);

        this.type = type;

        ENTITIES.STRUCTURES[id] = this;
    }
    process(_now = performance.now(), _worldPlayers = null) {}
    resolveCollisions(worldPlayers = null, worldMobs = null) {
        recordResolveCollisionCall();
        const cfg = dataMap.STRUCTURES[this.type] || {};
        if (cfg.noCollisions || cfg.isSafeZone) return;
        const structureRadius = this.radius || 0;
        const baseNearRangeSq = (structureRadius + 80) * (structureRadius + 80);
        const players = Array.isArray(worldPlayers) ? worldPlayers : Object.values(ENTITIES.PLAYERS);
        const mobs = Array.isArray(worldMobs) ? worldMobs : Object.values(ENTITIES.MOBS);
        if (players.length === 0 && mobs.length === 0) return;

        for (let i = 0; i < players.length; i++) {
            this.resolveEntityCollision(players[i], baseNearRangeSq, structureRadius);
        }
        for (let i = 0; i < mobs.length; i++) {
            this.resolveEntityCollision(mobs[i], baseNearRangeSq, structureRadius);
        }
    }

    resolveEntityCollision(entity, baseNearRangeSq, structureRadius) {
        if (!entity) return;
        if (entity.isAlive === false) return;
        if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;

        const nearDx = entity.x - this.x;
        const nearDy = entity.y - this.y;
        const distSq = (nearDx * nearDx) + (nearDy * nearDy);
        if (distSq > baseNearRangeSq) return;

        const minDist = Math.max(0, (entity.radius || 0) + structureRadius - 50);
        if (distSq > (minDist * minDist)) return;
        if (typeof entity.recordLatestCollisionDebug === 'function') {
            entity.recordLatestCollisionDebug(COLLISION_DEBUG_STRUCTURE, this.id);
        }

        const dist = Math.sqrt(distSq) || 1;
        const dx = nearDx / dist;
        const dy = nearDy / dist;

        if ((entity.type === ROOT_WALKER_TYPE || entity.type === YETI_TYPE || entity.type === DUNE_BEHEMOTH_TYPE || entity.type === INFERNO_BEAST_TYPE) && isRockStructureType(this.type)) {
            const overlap = Math.max(0, (entity.radius || 0) + structureRadius - dist);
            const pushAmount = Math.min(18, Math.max(8, overlap * 0.05));
            this.x -= dx * pushAmount;
            this.y -= dy * pushAmount;
            this.clamp();
            return;
        }

        const entityScale = (entity.radius || 0);
        entity.x += dx * entityScale;
        entity.y += dy * entityScale;
    }
}
