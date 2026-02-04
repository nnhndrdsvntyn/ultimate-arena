import {
    ENTITIES,
    spawnObject,
    deadMobs,
    brokenObjects,
    MAP_SIZE,
    getRandomMobPosition
} from './game.js';
import { dataMap } from '../public/shared/datamap.js';

/**
 * Main game logic update loop.
 */
export function updateGame() {

    const now = performance.now();
    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        const config = dataMap.OBJECTS[obj.type];
        if (config && config.isEphemeral) { // Only cleanup loot (swords and coins), not chests
            if (ENTITIES.playerIds.size === 0 || now - obj.spawnTime > 10000) {
                obj.die(null);
            }
        }
    }

    if (ENTITIES.playerIds.size === 0) return;

    // 1. Process active entities
    processProcessables(ENTITIES.PLAYERS);
    processProximityProcessables(ENTITIES.MOBS, 1500);
    processProcessables(ENTITIES.PROJECTILES);
    processProximityProcessables(ENTITIES.OBJECTS, 1000);

    // 2. Resolve structure collisions
    processProximityProcessables(ENTITIES.STRUCTURES, 700, (s) => s.resolveCollisions());

    // 3. Handle Respawns
    handleRespawns(deadMobs, (ent) => {
        const { x, y } = getRandomMobPosition(ent.type);
        return {
            entityType: 'mob',
            x,
            y
        };
    }, 3000);

    handleRespawns(brokenObjects, (obj) => {
        spawnObject(obj.type);
    }, 3000);
}

function processProcessables(entities) {
    for (const id in entities) {
        entities[id].process();
    }
}

function processProximityProcessables(entities, range, customFn = (e) => e.process()) {
    const players = Object.values(ENTITIES.PLAYERS);
    for (const id in entities) {
        const ent = entities[id];
        if (!ent) continue;

        // Proximity check
        const isNear = players.some(p => {
            const viewRangeMult = p.viewRangeMult || 1;
            const scaledRange = range * viewRangeMult;
            return Math.abs(p.x - ent.x) < scaledRange && Math.abs(p.y - ent.y) < scaledRange;
        });
        if (isNear) {
            customFn(ent);
        }
    }
}

function handleRespawns(deadPool, spawnLogic, delay) {
    const now = performance.now();
    for (const id in deadPool) {
        const ent = deadPool[id];
        const deathTime = ent.lastDiedTime || ent.timeBroken;
        if (now - deathTime > delay) {
            const config = spawnLogic(ent);
            if (config) {
                ENTITIES.newEntity({
                    ...config,
                    id: ent.id,
                    type: ent.type
                });
            }
            delete deadPool[id];
        }
    }
}
