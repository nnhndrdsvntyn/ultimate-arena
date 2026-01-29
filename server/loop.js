import {
    ENTITIES,
    spawnObject,
    deadMobs,
    brokenObjects,
    MAP_SIZE
} from './game.js';

/**
 * Main game logic update loop.
 */
export function updateGame() {
    if (ENTITIES.playerIds.size === 0) return;

    // 1. Process active entities
    processProcessables(ENTITIES.PLAYERS);
    processProximityProcessables(ENTITIES.MOBS, 1500);
    processProcessables(ENTITIES.PROJECTILES);
    processProximityProcessables(ENTITIES.OBJECTS, 1000, handleObjectLifecycle);

    // 2. Resolve structure collisions
    processProximityProcessables(ENTITIES.STRUCTURES, 700, (s) => s.resolveCollisions());

    // 3. Handle Respawns
    handleRespawns(deadMobs, () => ({
        entityType: 'mob',
        x: Math.floor(Math.random() * MAP_SIZE[0]),
        y: Math.floor(Math.random() * MAP_SIZE[1])
    }), 3000);

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
        const isNear = players.some(p => Math.abs(p.x - ent.x) < range && Math.abs(p.y - ent.y) < range);
        if (isNear) {
            customFn(ent);
        }
    }
}

function handleObjectLifecycle(obj) {
    // Despawn gold coins after 10s
    if (obj.type === 5 && performance.now() - obj.spawnTime > 10000) {
        obj.die(null);
    } else {
        obj.process();
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
