import {
    ENTITIES,
    spawnObject,
    deadMobs,
    brokenObjects,
    getRandomMobPosition
} from './game.js';
import { dataMap, isChestObjectType, isCoinObjectType } from '../public/shared/datamap.js';
import { isBotNearAnyRealPlayer, processOffscreenBot, processOffscreenHunterBot, updateBotPlayers } from './bots.js';
import { recordCollisionFrame } from './debug.js';
let npcLogicTick = 0;
let respawnCycleId = 0;
const SPECTATOR_PROXIMITY_RANGE_DIVISOR = 1.5;
const BOT_STILL_DEBUG = true;
const BOT_STILL_LOG_MS = 5000;
const BOT_STILL_POS_EPS_SQ = 0.01;
const BOT_STILL_ANGLE_EPS = 0.001;
const RESPAWN_CHUNK_SIZE = 50;
const RESPAWN_CHUNK_DELAY_MS = 2000;
const respawnThrottle = {
    cycleId: 0,
    spawnedThisCycle: 0,
    pausedUntil: 0
};

/**
 * Main game logic update loop.
 */
export function updateGame(now = performance.now()) {
    recordCollisionFrame();
    npcLogicTick = (npcLogicTick + 1) % 3;
    const runNpcLogicThisFrame = npcLogicTick === 0;

    if (runNpcLogicThisFrame) {
        updateBotPlayers(now);
    }

    const activeWorlds = new Set();
    const players = [];
    const playersByWorld = new Map();
    const playerProximityByWorld = new Map();
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        players.push(p);
        const world = p.world || 'main';
        activeWorlds.add(world);
        if (!playersByWorld.has(world)) playersByWorld.set(world, []);
        playersByWorld.get(world).push(p);
        if (!playerProximityByWorld.has(world)) playerProximityByWorld.set(world, []);
        const spectatorRangeMult = p.isAlive ? 1 : (1 / SPECTATOR_PROXIMITY_RANGE_DIVISOR);
        playerProximityByWorld.get(world).push({
            x: p.x,
            y: p.y,
            rangeMult: (p.viewRangeMult || 1) * spectatorRangeMult
        });
    }

    if (BOT_STILL_DEBUG) {
        debugLogStillBots(players, now);
    }
    const mobsByWorld = new Map();
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob) continue;
        const world = mob.world || 'main';
        if (!mobsByWorld.has(world)) mobsByWorld.set(world, []);
        mobsByWorld.get(world).push(mob);
    }
    const structuresByWorld = new Map();
    const structureBucketsByWorld = new Map();
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure) continue;
        const world = structure.world || 'main';
        if (!structuresByWorld.has(world)) structuresByWorld.set(world, []);
        structuresByWorld.get(world).push(structure);
        let bucket = structureBucketsByWorld.get(world);
        if (!bucket) {
            bucket = { all: [], trees: [], safeZone: null };
            structureBucketsByWorld.set(world, bucket);
        }
        bucket.all.push(structure);
        if (structure.type === 3) bucket.trees.push(structure);
        const structureCfg = dataMap.STRUCTURES[structure.type];
        if (!bucket.safeZone && structureCfg?.isSafeZone) bucket.safeZone = structure;
    }
    const objectBucketsByWorld = new Map();
    const objectsByWorld = new Map();
    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj) continue;
        const world = obj.world || 'main';
        let worldObjects = objectsByWorld.get(world);
        if (!worldObjects) {
            worldObjects = [];
            objectsByWorld.set(world, worldObjects);
        }
        worldObjects.push(obj);
        let bucket = objectBucketsByWorld.get(world);
        if (!bucket) {
            bucket = { coins: [], chests: [], pickups: [] };
            objectBucketsByWorld.set(world, bucket);
        }
        if (isCoinObjectType(obj.type)) bucket.coins.push(obj);
        if (isChestObjectType(obj.type)) bucket.chests.push(obj);
        if (dataMap.OBJECTS[obj.type]?.isEphemeral) bucket.pickups.push(obj);
    }

    for (const [objWorld, objects] of objectsByWorld) {
        const worldHasPlayers = activeWorlds.has(objWorld);
        const inTutorialWorld = objWorld.startsWith('tutorial');
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            const config = dataMap.OBJECTS[obj.type];
            if (!(config && config.isEphemeral)) continue; // Only cleanup loot (swords and coins), not chests
            const keepTutorialCoinAlive = inTutorialWorld && worldHasPlayers && isCoinObjectType(obj.type);
            const ttlMs = Math.max(1, Math.floor(config.dropTtlMs || 100000));
            if (!worldHasPlayers || (!keepTutorialCoinAlive && now - obj.spawnTime > ttlMs)) {
                obj.die(null);
                objects[i] = null;
            }
        }
    }

    const currentRespawnCycleId = ++respawnCycleId;
    handleRespawns(brokenObjects, (obj) => {
        const world = obj.world || 'main';
        const spawned = spawnObject(obj.type, undefined, undefined, 1, null, world);
        if (spawned) return true;

        // Fallback: respawn at the previous chest location if strict random validation fails.
        return !!spawnObject(obj.type, obj.x, obj.y, 1, null, world);
    }, 3000, currentRespawnCycleId, { useThrottle: false });

    handleRespawns(deadMobs, (ent) => {
        const { x, y } = getRandomMobPosition(ent.type, ent.world || 'main');
        return {
            entityType: 'mob',
            x,
            y,
            world: ent.world || 'main'
        };
    }, 3000, currentRespawnCycleId);

    if (ENTITIES.playerIds.size === 0) return;

    const proximity1500 = buildProximityContexts(playerProximityByWorld, 1500);
    const proximity1000 = buildProximityContexts(playerProximityByWorld, 1000);

    // 1. Process active entities
    processPlayers(players, now, objectBucketsByWorld, playersByWorld, mobsByWorld, structureBucketsByWorld);

    processProximityProcessables(mobsByWorld, proximity1500, (mob) => mob.process(runNpcLogicThisFrame));

    processProjectileWorlds(ENTITIES.PROJECTILES, playersByWorld, mobsByWorld, structureBucketsByWorld, objectBucketsByWorld);

    processProximityProcessables(objectsByWorld, proximity1000, undefined, true);

    // 2. Process structure logic and resolve structure collisions.
    // Root walker portals must keep ticking even when nobody is standing near them,
    // otherwise stale encounters never time out and can leave bad state behind.
    for (const [world, structures] of structuresByWorld) {
        const context = proximity1000.get(world) || null;
        const worldPlayers = playersByWorld.get(world) || [];
        const worldMobs = mobsByWorld.get(world) || [];
        for (let i = 0; i < structures.length; i++) {
            const s = structures[i];
            if (!s) continue;
            const nearPlayers = isEntityNearWorldPlayers(s, context);
            const shouldRunLogic = nearPlayers || s.type === 5;
            if (!shouldRunLogic) continue;
            s.process?.(now, worldPlayers);
            if (ENTITIES.STRUCTURES[s.id] !== s) continue;
            if (nearPlayers) {
                s.resolveCollisions(worldPlayers, worldMobs);
            }
        }
    }
}

function debugLogStillBots(players, now) {
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (!p || !p.isBot) continue;

        const last = p._botStillDebug || null;
        if (!last) {
            p._botStillDebug = {
                lastX: p.x,
                lastY: p.y,
                lastAngle: p.angle,
                posStillSince: now,
                angleStillSince: now,
                lastLogAt: 0
            };
            continue;
        }

        const dx = p.x - last.lastX;
        const dy = p.y - last.lastY;
        const posUnchanged = (dx * dx + dy * dy) <= BOT_STILL_POS_EPS_SQ;
        const angleUnchanged = Math.abs((p.angle || 0) - (last.lastAngle || 0)) <= BOT_STILL_ANGLE_EPS;

        if (!posUnchanged) last.posStillSince = now;
        if (!angleUnchanged) last.angleStillSince = now;

        const posStillMs = now - (last.posStillSince || now);
        const angleStillMs = now - (last.angleStillSince || now);
        const shouldLog = (posStillMs >= BOT_STILL_LOG_MS) || (angleStillMs >= BOT_STILL_LOG_MS);
        const canLog = now - (last.lastLogAt || 0) >= BOT_STILL_LOG_MS;

        const speed = Math.round(p.speed || 0);
        // if (shouldLog && canLog && speed < 17) {
        //     last.lastLogAt = now;
        //     const world = p.world || 'main';
        //     const keys = p.keys || { w: 0, a: 0, s: 0, d: 0 };
        //     console.warn(
        //         `[BOT STILL] id=${p.id} name=${p.username || 'Bot'} world=${world} ` +
        //         `pos=(${Math.round(p.x)},${Math.round(p.y)}) angle=${(p.angle || 0).toFixed(3)} ` +
        //         `posStillMs=${Math.floor(posStillMs)} angleStillMs=${Math.floor(angleStillMs)} ` +
        //         `alive=${p.isAlive} keys=${keys.w}${keys.a}${keys.s}${keys.d} speed=${speed} ` +
        //         `nextDecisionInMs=${Math.max(0, Math.floor((p._botNextDecisionAt || 0) - now))} ` +
        //         `nextMoveInMs=${Math.max(0, Math.floor((p._botNextMoveAt || 0) - now))} ` +
        //         `hunterTarget=${p._botHunterTargetId || 0} assistTarget=${p._botAssistTargetId || 0} ` +
        //         `blinded=${typeof p.isBlinded === 'function' ? p.isBlinded(now) : false} ` +
        //         `swing=${p.swingState || 0} attacking=${p.attacking ? 1 : 0}`
        //     );
        // }

        last.lastX = p.x;
        last.lastY = p.y;
        last.lastAngle = p.angle;
    }
}

function processProcessables(entities) {
    for (const id in entities) {
        entities[id].process();
    }
}

function processPlayers(players, now = performance.now(), objectBucketsByWorld = null, playersByWorld = null, mobsByWorld = null, structureBucketsByWorld = null) {
    const realPlayersByWorld = new Map();
    for (const p of players) {
        if (!p || p.isBot) continue;
        const world = p.world || 'main';
        let worldPlayers = realPlayersByWorld.get(world);
        if (!worldPlayers) {
            worldPlayers = [];
            realPlayersByWorld.set(world, worldPlayers);
        }
        worldPlayers.push(p);
    }

    const collisionPlayersByWorld = new Map();
    if (playersByWorld instanceof Map) {
        for (const [world, worldPlayers] of playersByWorld) {
            const filtered = [];
            for (let i = 0; i < worldPlayers.length; i++) {
                const candidate = worldPlayers[i];
                if (!candidate) continue;
                if (!candidate.isBot || isBotNearAnyRealPlayer(candidate, realPlayersByWorld)) {
                    filtered.push(candidate);
                }
            }
            collisionPlayersByWorld.set(world, filtered);
        }
    }

    for (const p of players) {
        if (!p) continue;
        const isActiveHunterBot = !!(p.isBot && p._botRole === 'pro' && p._botHunterTargetId);
        const isAssistTargetBot = !!(p.isBot && p._botAssistTargetId);
        if (p.isBot && !isBotNearAnyRealPlayer(p, realPlayersByWorld)) {
            if (isActiveHunterBot || isAssistTargetBot) {
                processOffscreenHunterBot(p, now);
            } else {
                processOffscreenBot(p, now, objectBucketsByWorld?.get(p.world || 'main') || null, null);
            }
            continue;
        }
        const worldBucket = objectBucketsByWorld?.get(p.world || 'main') || null;
        p.process(
            collisionPlayersByWorld.get(p.world || 'main') || playersByWorld?.get(p.world || 'main') || null,
            mobsByWorld?.get(p.world || 'main') || null,
            worldBucket?.coins || null,
            structureBucketsByWorld?.get(p.world || 'main') || null
        );
    }
}

function processProjectileWorlds(projectiles, playersByWorld = null, mobsByWorld = null, structureBucketsByWorld = null, objectBucketsByWorld = null) {
    const projectilesByWorld = new Map();
    for (const id in projectiles) {
        const projectile = projectiles[id];
        if (!projectile) continue;
        const world = projectile.world || 'main';
        let worldProjectiles = projectilesByWorld.get(world);
        if (!worldProjectiles) {
            worldProjectiles = [];
            projectilesByWorld.set(world, worldProjectiles);
        }
        worldProjectiles.push(projectile);
    }

    for (const [world, worldProjectiles] of projectilesByWorld) {
        const worldPlayers = playersByWorld?.get(world) || null;
        const worldMobs = mobsByWorld?.get(world) || null;
        const worldStructures = structureBucketsByWorld?.get(world) || null;
        const worldObjects = objectBucketsByWorld?.get(world) || null;
        for (let i = 0; i < worldProjectiles.length; i++) {
            worldProjectiles[i]?.process(
                worldStructures?.all || null,
                worldPlayers,
                worldMobs,
                worldObjects?.chests || null,
                worldProjectiles
            );
        }
    }
}

function buildProximityContexts(playerProximityByWorld, range) {
    const contexts = new Map();
    for (const [world, worldPlayers] of playerProximityByWorld) {
        if (!worldPlayers || worldPlayers.length === 0) continue;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const checks = new Array(worldPlayers.length * 4);
        for (let i = 0; i < worldPlayers.length; i++) {
            const p = worldPlayers[i];
            const scaledRange = range * p.rangeMult;
            const minPX = p.x - scaledRange;
            const maxPX = p.x + scaledRange;
            const minPY = p.y - scaledRange;
            const maxPY = p.y + scaledRange;
            if (minPX < minX) minX = minPX;
            if (maxPX > maxX) maxX = maxPX;
            if (minPY < minY) minY = minPY;
            if (maxPY > maxY) maxY = maxPY;
            const idx = i * 4;
            checks[idx] = minPX;
            checks[idx + 1] = maxPX;
            checks[idx + 2] = minPY;
            checks[idx + 3] = maxPY;
        }
        contexts.set(world, { checks, minX, maxX, minY, maxY, count: worldPlayers.length });
    }
    return contexts;
}

function processProximityProcessables(entitiesByWorld, proximityContextsByWorld, customFn = (e) => e.process(), skipIdleCoins = false) {
    for (const [world, entities] of entitiesByWorld) {
        const context = proximityContextsByWorld.get(world);
        if (!context) continue;
        for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
            const ent = entities[entityIndex];
            if (!ent) continue;
            if (ent.x < context.minX || ent.x > context.maxX || ent.y < context.minY || ent.y > context.maxY) continue;

            let isNear = false;
            const checks = context.checks;
            for (let i = 0; i < context.count; i++) {
                const idx = i * 4;
                if (ent.x >= checks[idx] && ent.x <= checks[idx + 1] && ent.y >= checks[idx + 2] && ent.y <= checks[idx + 3]) {
                    isNear = true;
                    break;
                }
            }
            if (!isNear) continue;
            if (skipIdleCoins && isCoinObjectType(ent.type) && (ent.teleportTicks || 0) <= 0) {
                continue;
            }
            customFn(ent);
        }
    }
}

function isEntityNearWorldPlayers(ent, context) {
    if (!ent || !context) return false;
    if (ent.x < context.minX || ent.x > context.maxX || ent.y < context.minY || ent.y > context.maxY) {
        return false;
    }
    const checks = context.checks;
    for (let i = 0; i < context.count; i++) {
        const idx = i * 4;
        if (ent.x >= checks[idx] && ent.x <= checks[idx + 1] && ent.y >= checks[idx + 2] && ent.y <= checks[idx + 3]) {
            return true;
        }
    }
    return false;
}

function prepareRespawnChunk(now, cycleId) {
    if (respawnThrottle.pausedUntil > now) return false;
    if (respawnThrottle.cycleId !== cycleId) {
        respawnThrottle.cycleId = cycleId;
        respawnThrottle.spawnedThisCycle = 0;
    }
    return true;
}

function canUseRespawnSlot(now, cycleId) {
    if (!prepareRespawnChunk(now, cycleId)) return false;
    if (respawnThrottle.spawnedThisCycle < RESPAWN_CHUNK_SIZE) return true;
    respawnThrottle.pausedUntil = now + RESPAWN_CHUNK_DELAY_MS;
    return false;
}

function markRespawnSlotUsed() {
    respawnThrottle.spawnedThisCycle++;
}

function handleRespawns(deadPool, spawnLogic, delay, cycleId, { useThrottle = true } = {}) {
    const now = performance.now();
    for (const id in deadPool) {
        const ent = deadPool[id];
        if (ent.noRespawn) {
            delete deadPool[id];
            continue;
        }
        const deathTime = ent.lastDiedTime || ent.timeBroken;
        if (now - deathTime > delay) {
            if (useThrottle && !canUseRespawnSlot(now, cycleId)) return;
            const result = spawnLogic(ent);
            let didRespawn = false;
            if (result === true) {
                didRespawn = true;
            } else if (result) {
                const config = result;
                ENTITIES.newEntity({
                    ...config,
                    id: ent.id,
                    type: ent.type
                });
                didRespawn = true;
            }
            if (didRespawn) {
                if (useThrottle) markRespawnSlotUsed();
                delete deadPool[id];
            }
        }
    }
}

