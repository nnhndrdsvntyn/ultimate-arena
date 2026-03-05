import {
    ENTITIES,
    spawnObject,
    deadMobs,
    brokenObjects,
    MAP_SIZE,
    getRandomMobPosition
} from './game.js';
import { dataMap, isCoinObjectType } from '../public/shared/datamap.js';
import { isBotNearAnyRealPlayer, processOffscreenBot, processOffscreenHunterBot } from './bots.js';
import { recordCollisionFrame } from './debug.js';
let npcLogicTick = 0;
const SPECTATOR_PROXIMITY_RANGE_DIVISOR = 1.5;

/**
 * Main game logic update loop.
 */
export function updateGame() {
    recordCollisionFrame();
    npcLogicTick = (npcLogicTick + 1) % 3;
    const runNpcLogicThisFrame = npcLogicTick === 0;

    const now = performance.now();
    const activeWorlds = new Set();
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        activeWorlds.add(p.world || 'main');
    }

    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        const config = dataMap.OBJECTS[obj.type];
        if (config && config.isEphemeral) { // Only cleanup loot (swords and coins), not chests
            const objWorld = obj.world || 'main';
            const worldHasPlayers = activeWorlds.has(objWorld);
            const inTutorialWorld = objWorld.startsWith('tutorial');
            const keepTutorialCoinAlive = inTutorialWorld && worldHasPlayers && isCoinObjectType(obj.type);
            if (!worldHasPlayers || (!keepTutorialCoinAlive && now - obj.spawnTime > 10000)) {
                obj.die(null);
            }
        }
    }

    if (ENTITIES.playerIds.size === 0) return;

    // 1. Process active entities
    processPlayers(now);
    processProximityProcessables(ENTITIES.MOBS, 1500, (mob) => mob.process(runNpcLogicThisFrame));
    processProcessables(ENTITIES.PROJECTILES);
    processProximityProcessables(ENTITIES.OBJECTS, 1000);

    // 2. Resolve structure collisions
    processProximityProcessables(ENTITIES.STRUCTURES, 1000, (s) => s.resolveCollisions());

    // 3. Handle Respawns
    handleRespawns(deadMobs, (ent) => {
        const { x, y } = getRandomMobPosition(ent.type);
        return {
            entityType: 'mob',
            x,
            y,
            world: ent.world || 'main'
        };
    }, 3000);

    handleRespawns(brokenObjects, (obj) => {
        spawnObject(obj.type, undefined, undefined, 1, null, obj.world || 'main');
    }, 3000);
}

function processProcessables(entities) {
    for (const id in entities) {
        entities[id].process();
    }
}

function processPlayers(now = performance.now()) {
    const realPlayers = Object.values(ENTITIES.PLAYERS).filter(p => p && !p.isBot);
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        const isActiveHunterBot = !!(p.isBot && p._botRole === 'pro' && p._botHunterTargetId);
        const isAssistTargetBot = !!(p.isBot && p._botAssistTargetId);
        if (p.isBot && !isBotNearAnyRealPlayer(p, realPlayers)) {
            if (isActiveHunterBot || isAssistTargetBot) {
                processOffscreenHunterBot(p, now);
            } else {
                processOffscreenBot(p, now);
            }
            continue;
        }
        p.process();
    }
}

function processProximityProcessables(entities, range, customFn = (e) => e.process()) {
    const players = Object.values(ENTITIES.PLAYERS);
    for (const id in entities) {
        const ent = entities[id];
        if (!ent) continue;
        const entityWorld = ent.world || 'main';

        // Proximity check
        const isNear = players.some(p => {
            if ((p.world || 'main') !== entityWorld) return false;
            const viewRangeMult = p.viewRangeMult || 1;
            const spectatorRangeMult = p.isAlive ? 1 : (1 / SPECTATOR_PROXIMITY_RANGE_DIVISOR);
            const scaledRange = range * viewRangeMult * spectatorRangeMult;
            return Math.abs(p.x - ent.x) < scaledRange && Math.abs(p.y - ent.y) < scaledRange;
        });
        if (isNear) {
            if (entities === ENTITIES.OBJECTS && isCoinObjectType(ent.type) && (ent.teleportTicks || 0) <= 0) {
                continue; // idle coins do not need per-frame processing
            }
            customFn(ent);
        }
    }
}

function handleRespawns(deadPool, spawnLogic, delay) {
    const now = performance.now();
    for (const id in deadPool) {
        const ent = deadPool[id];
        if (ent.noRespawn) {
            delete deadPool[id];
            continue;
        }
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
