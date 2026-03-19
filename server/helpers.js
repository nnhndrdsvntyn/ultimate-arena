import {
    ENTITIES
} from './game.js';
import { spawnObject, MAP_SIZE } from './game.js';
import fs from 'fs';
const PACKET_STRUCTURE_ADD = 28;
const PACKET_STRUCTURE_REMOVE = 29;
import {
    wss
} from '../server.js';
import {
    dataMap,
    isSwordRank,
    isAccessoryId,
    accessoryItemTypeFromId,
    isChestObjectType,
    isAccessoryItemType,
    isCoinObjectType,
    getCoinObjectType
} from '../public/shared/datamap.js';

const SPAWNABLE_MOB_MAP = {
    chick: 1,
    pig: 2,
    cow: 3,
    hearty: 4,
    'polar-bear': 5,
    polar_bear: 5,
    minotaur: 6
};
const SPAWNABLE_STRUCTURE_MAP = {
    tree: 3,
    rock: 2,
    base: 1
};

function normalizeSpawnKey(rawKey) {
    if (typeof rawKey !== 'string') return '';
    return rawKey.trim().toLowerCase().replace(/\s+/g, '_');
}

// networking
// Pre-allocated packet writer for zero-allocation packet building
const sharedEncoder = new TextEncoder();

export class PacketWriter {
    constructor(initialSize = 8192) {
        this.buffer = new ArrayBuffer(initialSize);
        this.view = new DataView(this.buffer);
        this.uint8 = new Uint8Array(this.buffer);
        this.offset = 0;
        this.capacity = initialSize;
        this.cachedBuffer = null;
    }

    reset() {
        this.offset = 0;
        this.cachedBuffer = null;
    }

    ensureCapacity(needed) {
        if (this.offset + needed > this.capacity) {
            const newCapacity = Math.max(this.capacity * 2, this.offset + needed);
            const newBuffer = new ArrayBuffer(newCapacity);
            new Uint8Array(newBuffer).set(this.uint8.subarray(0, this.offset));
            this.buffer = newBuffer;
            this.view = new DataView(this.buffer);
            this.uint8 = new Uint8Array(this.buffer);
            this.capacity = newCapacity;
            this.cachedBuffer = null;
        }
    }

    writeU8(value) {
        this.ensureCapacity(1);
        this.cachedBuffer = null;
        this.view.setUint8(this.offset, value);
        this.offset += 1;
    }

    writeI8(value) {
        this.ensureCapacity(1);
        this.cachedBuffer = null;
        this.view.setInt8(this.offset, value);
        this.offset += 1;
    }

    writeU16(value) {
        this.ensureCapacity(2);
        this.cachedBuffer = null;
        this.view.setUint16(this.offset, value, false);
        this.offset += 2;
    }

    writeU32(value) {
        this.ensureCapacity(4);
        this.cachedBuffer = null;
        this.view.setUint32(this.offset, value, false);
        this.offset += 4;
    }

    writeF32(value) {
        this.ensureCapacity(4);
        this.cachedBuffer = null;
        this.view.setFloat32(this.offset, value, false);
        this.offset += 4;
    }

    writeStr(value) {
        const encoded = sharedEncoder.encode(value);
        this.ensureCapacity(1 + encoded.byteLength);
        this.cachedBuffer = null;
        this.view.setUint8(this.offset, encoded.byteLength);
        this.offset += 1;
        this.uint8.set(encoded, this.offset);
        this.offset += encoded.byteLength;
    }

    // Returns the offset where the count should be written (for deferred count writing)
    reserveU8() {
        this.ensureCapacity(1);
        this.cachedBuffer = null;
        const pos = this.offset;
        this.offset += 1;
        return pos;
    }

    reserveU16() {
        this.ensureCapacity(2);
        this.cachedBuffer = null;
        const pos = this.offset;
        this.offset += 2;
        return pos;
    }

    writeU8At(pos, value) {
        this.cachedBuffer = null;
        this.view.setUint8(pos, value);
    }

    writeU16At(pos, value) {
        this.cachedBuffer = null;
        this.view.setUint16(pos, value, false);
    }

    getBuffer() {
        if (!this.cachedBuffer) {
            this.cachedBuffer = this.buffer.slice(0, this.offset);
        }
        return this.cachedBuffer;
    }
}

export function pushEntityOutOfSafeZone(entity, world = null, extraPadding = 0) {
    if (!entity) return false;
    const worldId = world || entity.world || 'main';
    const structure = getSafeZoneStructure(worldId);
    if (!structure) return false;
    const structureCfg = dataMap.STRUCTURES[structure.type] || {};
    const safeZoneRadius = Math.max(1, Math.floor(structure.radius || structureCfg.radius || structure.safeZoneHalfSize || structureCfg.safeZoneHalfSize || 0));
    const entityRadius = Math.max(0, entity.radius || 0);
    const overlapPad = Math.max(0, extraPadding);
    const dx = entity.x - structure.x;
    const dy = entity.y - structure.y;
    const minDistance = safeZoneRadius + entityRadius + overlapPad;
    const minDistanceSq = minDistance * minDistance;
    const distSq = (dx * dx) + (dy * dy);
    if (distSq >= minDistanceSq) return false;

    const dist = Math.sqrt(distSq);
    const dirX = dist > 0 ? (dx / dist) : 1;
    const dirY = dist > 0 ? (dy / dist) : 0;
    entity.x = structure.x + (dirX * minDistance);
    entity.y = structure.y + (dirY * minDistance);
    return true;
}


export function getId(entityType) {
    const list = ENTITIES[entityType];
    let id = 1;

    // Find the smallest available ID
    while (list[id]) {
        id++;
    }

    return id;
}

export function getRandomUsername() {
    const adjectives = ['Fast', 'Slow', 'Quick', 'Lazy', 'Happy', 'Sad', 'Angry', 'Calm', 'Brave', 'Shy'];
    const nouns = ['Dog', 'Cat', 'Bird', 'Fish', 'Lion', 'Tiger', 'Bear', 'Wolf', 'Fox', 'Deer'];

    return adjectives[Math.floor(Math.random() * adjectives.length)] +
        nouns[Math.floor(Math.random() * nouns.length)] +
        Math.floor(Math.random() * 1000);
}

function forEachOpenClientInWorld(world, callback) {
    wss.clients.forEach(client => {
        if (client.readyState !== 1) return;
        const player = ENTITIES.PLAYERS[client.id];
        if (!player) return;
        if ((player.world || 'main') !== world) return;
        callback(client, player);
    });
}

export function validateUsername(username) {
    if (username.length > 15) {
        return false;
    } else {
        return true;
    }
}

const helperWriter = new PacketWriter();
const queuedCoinPickupFx = [];
const queuedChestCoinSeeds = [];
const queuedDamageIndicatorFx = [];
const safeZoneStructureCache = new Map();
const worldEnvironmentCache = new Map();

export function getSafeZoneStructure(world = 'main') {
    const worldId = world || 'main';
    const cachedId = safeZoneStructureCache.get(worldId);
    if (cachedId !== undefined) {
        const cached = ENTITIES.STRUCTURES[cachedId];
        if (cached) {
            const cfg = dataMap.STRUCTURES[cached.type] || {};
            if (cfg.isSafeZone && (cached.world || 'main') === worldId) return cached;
        }
        safeZoneStructureCache.delete(worldId);
    }

    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure) continue;
        if ((structure.world || 'main') !== worldId) continue;
        const structureCfg = dataMap.STRUCTURES[structure.type] || {};
        if (!structureCfg.isSafeZone) continue;
        safeZoneStructureCache.set(worldId, structure.id);
        return structure;
    }

    return null;
}

export function getWorldEnvironmentData(world = 'main') {
    const worldId = world || 'main';
    const cached = worldEnvironmentCache.get(worldId);
    if (cached) {
        const safeZone = cached.safeZoneId ? ENTITIES.STRUCTURES[cached.safeZoneId] : null;
        let valid = !cached.safeZoneId || !!safeZone;
        if (valid) {
            for (let i = 0; i < cached.bushIds.length; i++) {
                if (!ENTITIES.STRUCTURES[cached.bushIds[i]]) {
                    valid = false;
                    break;
                }
            }
        }
        if (valid) {
            return {
                ...cached,
                safeZone
            };
        }
        worldEnvironmentCache.delete(worldId);
    }

    const safeZone = getSafeZoneStructure(worldId);
    const safeZoneCfg = safeZone ? (dataMap.STRUCTURES[safeZone.type] || {}) : {};
    const bridgeHalfHeight = Math.max(1, Math.floor(safeZoneCfg.bridgeHalfHeight || 70));
    const bridgeCount = Math.max(1, Math.floor(safeZoneCfg.bridgeCount || 5));
    const centerBridgeIndex = Math.ceil(bridgeCount / 2);
    const segmentHeight = MAP_SIZE[1] / (bridgeCount + 1);
    const bridgeBands = [];
    for (let i = 1; i <= bridgeCount; i++) {
        if (i === centerBridgeIndex) continue;
        const bridgeCenterY = segmentHeight * i;
        bridgeBands.push({
            minY: bridgeCenterY - bridgeHalfHeight,
            maxY: bridgeCenterY + bridgeHalfHeight
        });
    }

    const bushIds = [];
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure) continue;
        if ((structure.world || 'main') !== worldId) continue;
        if (structure.type === 3) bushIds.push(structure.id);
    }

    const entry = {
        safeZoneId: safeZone?.id || 0,
        bushIds,
        bridgeBands
    };
    worldEnvironmentCache.set(worldId, entry);
    return {
        ...entry,
        safeZone
    };
}

export function drainQueuedCoinPickupFxByWorld() {
    if (!queuedCoinPickupFx.length) return new Map();
    const byWorld = new Map();
    for (let i = 0; i < queuedCoinPickupFx.length; i++) {
        const evt = queuedCoinPickupFx[i];
        let arr = byWorld.get(evt.world);
        if (!arr) {
            arr = [];
            byWorld.set(evt.world, arr);
        }
        arr.push(evt);
    }
    queuedCoinPickupFx.length = 0;
    return byWorld;
}

export function drainQueuedDamageIndicatorFxByWorld() {
    if (!queuedDamageIndicatorFx.length) return new Map();
    const byWorld = new Map();
    for (let i = 0; i < queuedDamageIndicatorFx.length; i++) {
        const evt = queuedDamageIndicatorFx[i];
        let arr = byWorld.get(evt.world);
        if (!arr) {
            arr = [];
            byWorld.set(evt.world, arr);
        }
        arr.push(evt);
    }
    queuedDamageIndicatorFx.length = 0;
    return byWorld;
}

export function drainQueuedChestCoinSeedsByWorld() {
    if (!queuedChestCoinSeeds.length) return new Map();
    const byWorld = new Map();
    for (let i = 0; i < queuedChestCoinSeeds.length; i++) {
        const evt = queuedChestCoinSeeds[i];
        let arr = byWorld.get(evt.world);
        if (!arr) {
            arr = [];
            byWorld.set(evt.world, arr);
        }
        arr.push(evt);
    }
    queuedChestCoinSeeds.length = 0;
    return byWorld;
}

export function emitChestCoinSeed(x, y, spread, totalCoins, seed, lifetimeMs = 10000, world = 'main') {
    queuedChestCoinSeeds.push({
        world,
        x: Math.max(0, Math.min(65535, Math.round(x))),
        y: Math.max(0, Math.min(65535, Math.round(y))),
        spread: Math.max(1, Math.min(65535, Math.round(spread))),
        totalCoins: Math.max(1, Math.min(65535, Math.round(totalCoins))),
        seed: (seed >>> 0),
        lifetimeMs: Math.max(1, Math.min(65535, Math.round(lifetimeMs)))
    });
}

export function emitDamageIndicatorFx(x, y, amount, radius = 0, world = 'main') {
    const safeAmount = Math.max(1, Math.min(65535, Math.round(amount || 0)));
    if (!safeAmount) return;
    queuedDamageIndicatorFx.push({
        world,
        x: Math.max(0, Math.min(65535, Math.round(x))),
        y: Math.max(0, Math.min(65535, Math.round(y))),
        amount: safeAmount,
        radius: Math.max(0, Math.min(65535, Math.round(radius || 0)))
    });
}

export function playSfx(xorigin, yorigin, type, range) {
    const rangeSqrd = range * range;

    wss.clients.forEach(client => {
        if (client.readyState !== 1) return;
        const player = ENTITIES.PLAYERS[client.id];
        if (!player) return;
        if ((player.world || 'main') !== (client.world || 'main')) return;
        const dx = player.x - xorigin;
        const dy = player.y - yorigin;
        const distanceSqrd = dx * dx + dy * dy;

        if (distanceSqrd <= rangeSqrd) {
            const volume = Math.max(0.1, 1 - distanceSqrd / rangeSqrd);

            helperWriter.reset();
            helperWriter.writeU8(7);
            helperWriter.writeU8(type);
            helperWriter.writeU8(Math.floor(volume * 100));
            client.send(helperWriter.getBuffer());
        }
    });
}

export function emitLightningShotFx(startX, startY, endX, endY, durationMs = 1000, world = 'main', thicknessScale = 1) {
    const fxWriter = new PacketWriter(32);
    fxWriter.reset();
    fxWriter.writeU8(21); // Lightning shot effect
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(startX))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(startY))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(endX))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(endY))));
    fxWriter.writeU16(Math.max(1, Math.min(10000, Math.round(durationMs))));
    fxWriter.writeU16(Math.max(1, Math.min(20000, Math.round((thicknessScale || 1) * 100)))); // send as hundredths
    const packet = fxWriter.getBuffer();
    forEachOpenClientInWorld(world, client => {
        client.send(packet);
    });
}

export function emitCoinPickupFx(startX, startY, targetPlayerId, amount = 1) {
    const target = ENTITIES.PLAYERS[targetPlayerId];
    const targetWorld = target?.world || 'main';
    const sx = Math.max(0, Math.min(65535, Math.round(startX)));
    const sy = Math.max(0, Math.min(65535, Math.round(startY)));
    const tx = Math.max(0, Math.min(65535, Math.round(target?.x ?? startX)));
    const ty = Math.max(0, Math.min(65535, Math.round(target?.y ?? startY)));
    queuedCoinPickupFx.push({
        world: targetWorld,
        x: sx,
        y: sy,
        angle: Math.atan2(ty - sy, tx - sx),
        targetX: tx,
        targetY: ty,
        amount: Math.max(1, Math.min(65535, Math.round(amount)))
    });
}

export function emitEnergyBurstFx(x, y, radius = 500, durationMs = 700, waves = 3, world = 'main', thicknessScale = 1) {
    const fxWriter = new PacketWriter(16);
    fxWriter.reset();
    fxWriter.writeU8(23); // Energy burst effect
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(x))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(y))));
    fxWriter.writeU16(Math.max(1, Math.min(65535, Math.round(radius))));
    fxWriter.writeU16(Math.max(1, Math.min(10000, Math.round(durationMs))));
    fxWriter.writeU8(Math.max(1, Math.min(8, Math.round(waves))));
    fxWriter.writeU16(Math.max(1, Math.min(20000, Math.round((thicknessScale || 1) * 100)))); // hundredths precision
    const packet = fxWriter.getBuffer();
    forEachOpenClientInWorld(world, client => {
        client.send(packet);
    });
}

export function emitPoisonAoeFx(x, y, radius = 300, durationMs = 700, waves = 2, world = 'main') {
    const fxWriter = new PacketWriter(16);
    fxWriter.reset();
    fxWriter.writeU8(25); // Poison AOE effect
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(x))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(y))));
    fxWriter.writeU16(Math.max(1, Math.min(65535, Math.round(radius))));
    fxWriter.writeU16(Math.max(1, Math.min(10000, Math.round(durationMs))));
    fxWriter.writeU8(Math.max(1, Math.min(8, Math.round(waves))));
    const packet = fxWriter.getBuffer();
    forEachOpenClientInWorld(world, client => {
        client.send(packet);
    });
}

export function emitIntimidationFx(x, y, radius = 300, durationMs = 9200, world = 'main', ownerId = null) {
    const fxWriter = new PacketWriter(16);
    fxWriter.reset();
    fxWriter.writeU8(32); // Intimidation AOE effect
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(x))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(y))));
    fxWriter.writeU16(Math.max(1, Math.min(65535, Math.round(radius))));
    fxWriter.writeU16(Math.max(1, Math.min(15000, Math.round(durationMs))));
    if (Number.isFinite(ownerId)) {
        fxWriter.writeU8(Math.max(0, Math.min(255, ownerId)));
    }
    const packet = fxWriter.getBuffer();
    forEachOpenClientInWorld(world, client => {
        client.send(packet);
    });
}

function applyTemporaryInvisibility(player, durationMs = 5000) {
    if (!player) return;
    const now = performance.now();
    const safeDuration = Math.max(1, Math.round(durationMs));
    const endAt = now + safeDuration;
    player.isInvisible = true;
    player._forceFullSync = true;
    player._invisibilityUntil = endAt;

    if (player._invisibilityTimer) {
        clearTimeout(player._invisibilityTimer);
    }

    player._invisibilityTimer = setTimeout(() => {
        if (!player) return;
        if ((player._invisibilityUntil || 0) > performance.now()) return;
        player.isInvisible = false;
        player._forceFullSync = true;
        player._invisibilityTimer = null;
    }, safeDuration);
}

export function emitSmokeAoeFx(x, y, radius = 320, durationMs = 8000, waves = 1, world = 'main') {
    const fxWriter = new PacketWriter(16);
    fxWriter.reset();
    fxWriter.writeU8(31); // Smoke AOE effect
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(x))));
    fxWriter.writeU16(Math.max(0, Math.min(65535, Math.round(y))));
    fxWriter.writeU16(Math.max(1, Math.min(65535, Math.round(radius))));
    fxWriter.writeU16(Math.max(1, Math.min(65535, Math.round(durationMs))));
    fxWriter.writeU8(Math.max(1, Math.min(8, Math.round(waves))));
    const packet = fxWriter.getBuffer();
    forEachOpenClientInWorld(world, client => {
        client.send(packet);
    });
}

export function emitBlindnessFxToPlayer(playerId, durationMs = 5000, maxAlpha = 0.8) {
    const fxWriter = new PacketWriter(8);
    fxWriter.reset();
    fxWriter.writeU8(30); // Blindness overlay effect
    fxWriter.writeU16(Math.max(1, Math.min(65535, Math.round(durationMs))));
    fxWriter.writeU8(Math.max(0, Math.min(100, Math.round(maxAlpha * 100))));
    const packet = fxWriter.getBuffer();
    wss.clients.forEach(client => {
        if (client.id === playerId && client.readyState === 1) {
            client.send(packet);
        }
    });
}

export function emitCriticalHitFxToPlayer(playerId, x, y) {
    const pid = Math.max(0, Math.min(255, Math.round(playerId)));
    const targetX = Math.max(0, Math.min(65535, Math.round(x)));
    const targetY = Math.max(0, Math.min(65535, Math.round(y)));

    const fxWriter = new PacketWriter(8);
    fxWriter.reset();
    fxWriter.writeU8(24); // Critical hit marker
    fxWriter.writeU16(targetX);
    fxWriter.writeU16(targetY);
    const packet = fxWriter.getBuffer();

    wss.clients.forEach(client => {
        if (client.id === pid) client.send(packet);
    });
}

function getRadiusScale(sourceRadius = 0) {
    const base = dataMap.PLAYERS?.baseRadius || 30;
    const radius = Math.max(0, sourceRadius || 0);
    const safeBase = Math.max(1, base);
    return radius / safeBase;
}

export function spawnEnergyBurstProjectiles(source, options = {}) {
    if (!source) return;
    if (source.isAlive === false) return;
    if (Number.isFinite(source.hp) && source.hp <= 0) return;

    const logicOnly = options.logicOnly !== false;
    const durationMs = Number.isFinite(options.durationMs) && options.durationMs > 0 ? Math.round(options.durationMs) : 700;
    const fxWaves = Number.isFinite(options.fxWaves) && options.fxWaves > 0 ? Math.round(options.fxWaves) : 3;
    const projectileRange = dataMap.PROJECTILES[10]?.maxDistance || 500;
    const projectileSpeed = dataMap.PROJECTILES[10]?.speed || 100;
    const projectileRadius = dataMap.PROJECTILES[10]?.radius || 30;
    const radiusScale = getRadiusScale(source.radius);
    const initialRadius = Number.isFinite(options.initialRadius) && options.initialRadius > 0
        ? Math.round(options.initialRadius)
        : Math.max(projectileRadius, Math.round((source.radius || 0) * radiusScale));
    const groupId = Math.random();
    const projectileOptions = {
        noMove: true,
        maxDistanceOverride: projectileRange * radiusScale,
        initialRadius,
        expandPerTick: projectileSpeed * radiusScale,
        persistentHits: true
    };
    if (logicOnly) projectileOptions.logicOnly = true;

    ENTITIES.newEntity({
        entityType: 'projectile',
        id: getId('PROJECTILES'),
        x: source.x,
        y: source.y,
        angle: 0,
        type: 10,
        shooter: source,
        groupId,
        projectileOptions
    });

    // Visuals are driven by a dedicated light packet instead of syncing every burst projectile.
    const burstRadius = (projectileRange * radiusScale) + (source.radius || 0);
    emitEnergyBurstFx(source.x, source.y, burstRadius, durationMs, fxWaves, source.world || 'main', radiusScale);
}

export function poison(entity, dmgPerRate, rate, duration, attacker = null, noKillCredit = true) {
    if (!entity || typeof entity.damage !== 'function') return;
    if (dmgPerRate <= 0 || rate <= 0 || duration <= 0) return;
    if (entity.isAlive === false || entity.hp <= 0) return;

    const now = performance.now();
    const endTime = now + duration;

    if (!entity._poison) {
        entity._poison = { timer: null, endTime: 0 };
    }

    // If already poisoned, just reset the duration timer
    entity._poison.endTime = endTime;
    if (entity._poison.timer) return;

    const tick = () => {
        if (!entity._poison) return;
        if (entity.isAlive === false || entity.hp <= 0 || performance.now() >= entity._poison.endTime) {
            clearTimeout(entity._poison.timer);
            entity._poison.timer = null;
            return;
        }

        if (attacker) {
            const prevNoKill = attacker.noKillCredit;
            if (noKillCredit) attacker.noKillCredit = true;
            entity.damage(dmgPerRate, attacker);
            if (noKillCredit) {
                if (prevNoKill === undefined) delete attacker.noKillCredit;
                else attacker.noKillCredit = prevNoKill;
            }
        } else {
            entity.damage(dmgPerRate, { noKillCredit: true });
        }
        if (entity.isAlive === false || entity.hp <= 0) {
            clearTimeout(entity._poison.timer);
            entity._poison.timer = null;
            return;
        }
        entity._poison.timer = setTimeout(tick, rate);
    };

    entity._poison.timer = setTimeout(tick, rate);
}

function applyIntimidationDebuff(entity, durationMs = 8000, debuffMult = 0.7) {
    if (!entity || entity.isAlive === false || entity.hp <= 0) return;
    const now = performance.now();
    const endTime = now + durationMs;
    if (!entity._intimidated) entity._intimidated = { timer: null, endTime: 0 };
    entity.damageDebuffMult = Math.min(entity.damageDebuffMult || 1, debuffMult);
    entity._intimidated.endTime = endTime;
    if (entity._intimidated.timer) return;

    const tick = () => {
        const remaining = (entity._intimidated?.endTime || 0) - performance.now();
        if (remaining <= 0 || entity.isAlive === false || entity.hp <= 0) {
            entity.damageDebuffMult = 1;
            if (entity._intimidated?.timer) clearTimeout(entity._intimidated.timer);
            entity._intimidated.timer = null;
            return;
        }
        entity._intimidated.timer = setTimeout(tick, Math.min(500, remaining));
    };

    entity._intimidated.timer = setTimeout(tick, 500);
}

function castIntimidation(player) {
    const expandMs = 600;
    const holdMs = 8000;
    const collapseMs = 600;
    const aoeDurationMs = expandMs + holdMs + collapseMs;
    const initialBlastDamageBase = 20; // match poison initial blast
    const debuffMult = 0.7; // 30% damage reduction
    const sourceWorld = player.world || 'main';
    const sourceRadius = Math.max(0, player.radius || 0);
    const radiusScale = getRadiusScale(sourceRadius);
    const aoeRadius = 300 * radiusScale;
    const initialBlastDamage = Math.max(1, Math.round(initialBlastDamageBase * radiusScale));
    const pulseIntervalMs = 150;
    const startedAt = performance.now();
    const endsAt = startedAt + aoeDurationMs;

    const currentRadiusAt = (now) => {
        const elapsed = now - startedAt;
        if (elapsed < expandMs) return aoeRadius * Math.max(0, Math.min(1, elapsed / expandMs));
        if (elapsed < expandMs + holdMs) return aoeRadius;
        const collapseT = Math.max(0, Math.min(1, (elapsed - expandMs - holdMs) / collapseMs));
        return aoeRadius * (1 - collapseT);
    };

    const damagedPlayers = new Set();
    const damagedMobs = new Set();

    const applyPulse = () => {
        const now = performance.now();
        const currentRadius = currentRadiusAt(now);
        const originX = player.x;
        const originY = player.y;
        for (const id in ENTITIES.PLAYERS) {
            const target = ENTITIES.PLAYERS[id];
            if (!target || !target.isAlive || target.id === player.id) continue;
            if ((target.world || 'main') !== sourceWorld) continue;
            if (target.hasShield) continue;
            const dx = target.x - originX;
            const dy = target.y - originY;
            const allowed = currentRadius + sourceRadius + Math.max(0, target.radius || 0);
            if (dx * dx + dy * dy <= (allowed * allowed)) {
                if (!damagedPlayers.has(target.id)) {
                    target.damage(initialBlastDamage, player);
                    damagedPlayers.add(target.id);
                }
                applyIntimidationDebuff(target, Math.max(500, endsAt - now), debuffMult);
            }
        }
        for (const id in ENTITIES.MOBS) {
            const target = ENTITIES.MOBS[id];
            if (!target || target.hp <= 0) continue;
            if ((target.world || 'main') !== sourceWorld) continue;
            const dx = target.x - originX;
            const dy = target.y - originY;
            const allowed = currentRadius + sourceRadius + Math.max(0, target.radius || 0);
            if (dx * dx + dy * dy <= (allowed * allowed)) {
                let tookDamage = false;
                if (!damagedMobs.has(target.id)) {
                    tookDamage = target.damage(initialBlastDamage, player);
                    if (tookDamage) damagedMobs.add(target.id);
                }
                if (tookDamage && typeof target.alarm === 'function') target.alarm(player, 'hit');
                applyIntimidationDebuff(target, Math.max(500, endsAt - now), debuffMult);
            }
        }
    };

    applyPulse();
    const pulseTimer = setInterval(() => {
        applyPulse();
        if (performance.now() >= endsAt) {
            clearInterval(pulseTimer);
        }
    }, pulseIntervalMs);

    emitIntimidationFx(player.x, player.y, aoeRadius, aoeDurationMs, sourceWorld, player.id);
}

function hasActivePoisonEffect(entity) {
    if (!entity || !entity._poison) return false;
    return Number.isFinite(entity._poison.endTime) && performance.now() < entity._poison.endTime;
}

class CommandMap {
    constructor() {
        this.entityTypeMap = {
            '1': 'PLAYERS',
            '2': 'MOBS',
        }
    }

    markTeleported(entityType, entity) {
        if (!entity) return;
        entity._forceFullSync = true;
        if (typeof entity.x === 'number') entity.lastX = entity.x;
        if (typeof entity.y === 'number') entity.lastY = entity.y;
        const prefix = entityType === 1 ? 'p' : (entityType === 2 ? 'm' : '');
        if (!prefix) return;
        for (const client of wss.clients) {
            if (!client?.seenEntities) continue;
            client.seenEntities.delete(prefix + entity.id);
        }
    }

    spawn(entityKey, x, y, world = 'main') {
        const key = normalizeSpawnKey(entityKey);
        if (!key) return false;

        const clampedX = Math.max(0, Math.min(MAP_SIZE[0], Math.round(Number.isFinite(x) ? x : 0)));
        const clampedY = Math.max(0, Math.min(MAP_SIZE[1], Math.round(Number.isFinite(y) ? y : 0)));
        const worldId = world || 'main';

        if (SPAWNABLE_MOB_MAP[key]) {
            ENTITIES.newEntity({
                entityType: 'mob',
                id: getId('MOBS'),
                x: clampedX,
                y: clampedY,
                type: SPAWNABLE_MOB_MAP[key],
                world: worldId
            });
            return true;
        }

        if (SPAWNABLE_STRUCTURE_MAP[key]) {
            const id = getId('STRUCTURES');
            ENTITIES.newEntity({
                entityType: 'structure',
                id,
                x: clampedX,
                y: clampedY,
                type: SPAWNABLE_STRUCTURE_MAP[key],
                world: worldId,
                isNatural: false
            });
            const structure = ENTITIES.STRUCTURES[id];
            if (structure) structure.isNatural = false;
            this.broadcastStructureSpawn(structure);
            return true;
        }

        return false;
    }

    broadcastStructureSpawn(structure) {
        if (!structure) return;
        const pw = new PacketWriter(16);
        pw.writeU8(PACKET_STRUCTURE_ADD);
        pw.writeU16(structure.id);
        pw.writeU16(Math.round(structure.x) & 0xFFFF);
        pw.writeU16(Math.round(structure.y) & 0xFFFF);
        pw.writeU8(structure.type | 0);
        const buf = pw.getBuffer();
        const world = structure.world || 'main';
        for (const client of wss.clients) {
            if (client.readyState !== 1) continue;
            if ((client.world || 'main') !== world) continue;
            client.send(buf);
        }
    }

    broadcastStructureRemove(structure) {
        if (!structure) return;
        const pw = new PacketWriter(8);
        pw.writeU8(PACKET_STRUCTURE_REMOVE);
        pw.writeU16(structure.id);
        const buf = pw.getBuffer();
        const world = structure.world || 'main';
        for (const client of wss.clients) {
            if (client.readyState !== 1) continue;
            if ((client.world || 'main') !== world) continue;
            client.send(buf);
        }
    }

    // admin commands
    tppos(entityType, entityId, x, y) {
        const entityListName = this.entityTypeMap[entityType];
        if (entityId === 0) // teleport all of that type to the position
        {
            for (const id in ENTITIES[entityListName]) {
                const entity = ENTITIES[entityListName][id];
                entity.x = x;
                entity.y = y;
                this.markTeleported(entityType, entity);
            }
        } else if (ENTITIES[entityListName][entityId]) { // teleport specific entity
            ENTITIES[entityListName][entityId].x = x;
            ENTITIES[entityListName][entityId].y = y;
            this.markTeleported(entityType, ENTITIES[entityListName][entityId]);
        }
    }
    tpent(entityType, entityId, targetEntityType, targetEntityId) {
        const entityListName = this.entityTypeMap[entityType];
        const targetEntityListName = this.entityTypeMap[targetEntityType];
        if (ENTITIES[entityListName][entityId] && ENTITIES[targetEntityListName][targetEntityId]) {
            ENTITIES[entityListName][entityId].x = ENTITIES[targetEntityListName][targetEntityId].x;
            ENTITIES[entityListName][entityId].y = ENTITIES[targetEntityListName][targetEntityId].y;
            this.markTeleported(entityType, ENTITIES[entityListName][entityId]);
        }
    }
    setattr(entityType, entityId, attrIdx, value) {
        const entityListName = this.entityTypeMap[entityType];
        if (!entityListName) return;
        const entity = ENTITIES[entityListName][entityId];
        const isDefault = !Number.isFinite(value);

        if (entity && entityType === 1) { // Player
            const player = entity;
            if (attrIdx === 1) { // defaultSpeed
                player.defaultSpeed = isDefault ? dataMap.PLAYERS.baseMovementSpeed : value;
            } else if (attrIdx === 2) { // score
                const nextScore = isDefault ? 0 : Math.floor(value);
                player.score = 0;
                player.addScore(nextScore);
            } else if (attrIdx === 3) { // invincible
                player.invincible = isDefault ? false : !!value;
            } else if (attrIdx === 4) { // weapon rank (admin give)
                if (isDefault) return;
                const rank = Math.floor(value);
                if (isSwordRank(rank)) {
                    // Always place into a new slot; if full, drop on ground.
                    let placed = false;
                    for (let i = 0; i < player.inventory.length; i++) {
                        if (!player.inventory[i] || player.inventory[i] === 0) {
                            player.inventory[i] = rank;
                            player.inventoryCounts[i] = 1;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        spawnObject(rank, player.x, player.y, 1, null, player.world || 'main');
                    } else {
                        player.sendInventoryUpdate();
                    }
                }
            } else if (attrIdx === 5) { // strength
                player.baseStrength = isDefault ? dataMap.PLAYERS.baseStrength : Math.floor(value);
                player.recomputeBuffedAttributes({ healByMaxIncrease: false });
            } else if (attrIdx === 6) { // maxHealth
                const nextMaxHp = isDefault ? dataMap.PLAYERS.maxHealth : Math.floor(value);
                player.baseMaxHp = Math.max(1, nextMaxHp);
                player.recomputeBuffedAttributes({ healByMaxIncrease: false });
            } else if (attrIdx === 8) { // coins (admin give)
                if (isDefault) {
                    player.goldCoins = 0;
                } else {
                    player.addGoldCoins(Math.floor(value));
                }
            } else if (attrIdx === 9) { // radius
                const hpRatio = (player.maxHp > 0) ? (player.hp / player.maxHp) : 1;
                const nextRadius = isDefault ? dataMap.PLAYERS.baseRadius : Math.floor(value);
                player.radius = Math.max(1, nextRadius);
                player.recomputeBuffedAttributes({ healByMaxIncrease: false });
                player.hp = Math.max(0, Math.min(player.maxHp, Math.round(player.maxHp * hpRatio)));
                player._forceFullSync = true;
            }
            player.sendStatsUpdate();
        } else if (entity && entityType === 2) { // Mob
            const mob = entity;
            if (attrIdx === 1) { // speed
                const baseSpeed = dataMap.MOBS[mob.type]?.speed || mob.speed || 0;
                const speedMult = mob.isAlarmed && typeof mob.getAlarmSpeedMultiplier === 'function' ? mob.getAlarmSpeedMultiplier() : 1;
                mob.speed = isDefault ? baseSpeed * speedMult : Math.max(0, value);
            } else if (attrIdx === 5) { // strength
                mob.strength = isDefault ? 0 : Math.floor(value);
            } else if (attrIdx === 7) { // invincible
                mob.invincible = isDefault ? false : !!value;
            } else if (attrIdx === 9) { // radius
                const oldRadius = Math.max(1, mob.radius || 1);
                const hpRatio = (mob.maxHp > 0) ? (mob.hp / mob.maxHp) : 1;
                const defaultRadius = dataMap.MOBS[mob.type]?.radius || mob.radius || 1;
                mob.radius = Math.max(1, isDefault ? defaultRadius : Math.floor(value));
                const radiusScale = mob.radius / oldRadius;
                mob.maxHp = Math.max(1, Math.round((mob.maxHp || 1) * radiusScale));
                mob.hp = Math.max(0, Math.min(mob.maxHp, Math.round(mob.maxHp * hpRatio)));
                mob._forceFullSync = true;
            }
        }
    }
    agro(mobId, playerId, mobType, mobSpeedMult) {
        const player = ENTITIES.PLAYERS[playerId];

        if (mobId === 0) {
            for (const id in ENTITIES.MOBS) {
                const m = ENTITIES.MOBS[id];
                if (mobType === 0 || m.type === mobType) {
                    if (player) m.alarm(player);
                    if (mobSpeedMult > 0) m.speed = m.speed * mobSpeedMult;
                }
            }
        } else {
            const mob = ENTITIES.MOBS[mobId];
            if (mob) {
                if (player) mob.alarm(player);
                if (mobSpeedMult > 0) mob.speed = mob.speed * mobSpeedMult;
            }
        }
    }
    tpchest(playerId, chestType = null) {
        const player = ENTITIES.PLAYERS[playerId];
        if (!player) return;

        let targetChest = null;
        let minDistanceSq = Infinity;

        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (isChestObjectType(object.type)) {
                if (chestType !== null && object.type !== chestType) continue;

                const dx = object.x - player.x;
                const dy = object.y - player.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    targetChest = object;
                }
            }
        }

        if (targetChest) {
            player.x = targetChest.x;
            player.y = targetChest.y;
        }
    }
    breakChests(dropLoot = false) {
        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (isChestObjectType(object.type)) {
                if (!dropLoot) object.shouldDropLoop = false;
                object.die(null);
            }
        }
    }

    breakStructures(structureType = 0) {
        for (const id in ENTITIES.STRUCTURES) {
            const s = ENTITIES.STRUCTURES[id];
            if (!s) continue;
            if (structureType && s.type !== structureType) continue;
            if (s.type === 1) continue; // never break base / safe zone
            if (s.isNatural) continue;
            this.broadcastStructureRemove(s);
            delete ENTITIES.STRUCTURES[id];
        }
    }

    clearDrops() {
        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (!isChestObjectType(object.type)) { // If not a chest, it's a drop (or coin)
                if (object.die) object.die(null);
            }
        }
    }

    giveAccessory(entityId, accessoryId) {
        const player = ENTITIES.PLAYERS[entityId];
        if (!player || !player.isAlive) return;
        if (!isAccessoryId(accessoryId) || accessoryId === 0) return;

        const emptySlot = player.inventory.indexOf(0);
        if (emptySlot === -1) return;

        player.inventory[emptySlot] = accessoryItemTypeFromId(accessoryId);
        player.inventoryCounts[emptySlot] = 1;
        player.sendInventoryUpdate();
        player.sendStatsUpdate();
    }

    moveInventoryItemToFreeSlotOrDrop(player, itemType, count, excludedSlot = -1) {
        if (!player || itemType <= 0 || count <= 0) return;

        if (isCoinObjectType(itemType)) {
            let remaining = count;
            for (let i = 0; i < player.inventory.length; i++) {
                if (i === excludedSlot) continue;
                if (!isCoinObjectType(player.inventory[i])) continue;
                const space = Math.max(0, 256 - (player.inventoryCounts[i] || 0));
                if (space <= 0) continue;
                const toAdd = Math.min(space, remaining);
                player.inventoryCounts[i] += toAdd;
                remaining -= toAdd;
                if (remaining <= 0) return;
            }

            while (remaining > 0) {
                const emptySlot = player.inventory.findIndex((type, idx) => idx !== excludedSlot && type === 0);
                if (emptySlot === -1) break;
                const toAdd = Math.min(256, remaining);
                player.inventory[emptySlot] = getCoinObjectType();
                player.inventoryCounts[emptySlot] = toAdd;
                remaining -= toAdd;
            }

            while (remaining > 0) {
                const toDrop = Math.min(256, remaining);
                const dropObj = spawnObject(getCoinObjectType(), player.x, player.y, toDrop, 'player', player.world || 'main');
                if (dropObj && typeof player.applyDropLaunch === 'function') {
                    player.applyDropLaunch(dropObj, getCoinObjectType());
                }
                remaining -= toDrop;
            }
            return;
        }

        const emptySlot = player.inventory.findIndex((type, idx) => idx !== excludedSlot && type === 0);
        if (emptySlot !== -1) {
            player.inventory[emptySlot] = itemType;
            player.inventoryCounts[emptySlot] = Math.max(1, count);
            return;
        }

        const dropObj = spawnObject(itemType, player.x, player.y, Math.max(1, count), 'player', player.world || 'main');
        if (dropObj && typeof player.applyDropLaunch === 'function') {
            player.applyDropLaunch(dropObj, itemType);
        }
    }

    creativeItem(entityId, itemType, amount = 1, targetSlot = 255, drop = false) {
        const player = ENTITIES.PLAYERS[entityId];
        if (!player || !player.isAlive) return;

        const normalizedType = Math.floor(itemType);
        const normalizedAmount = isCoinObjectType(normalizedType)
            ? Math.max(1, Math.min(256, Math.floor(amount || 1)))
            : 1;
        const isValidType = isSwordRank(normalizedType) || isAccessoryItemType(normalizedType) || isCoinObjectType(normalizedType);
        if (!isValidType) return;

        if (drop) {
            const dropObj = spawnObject(normalizedType, player.x, player.y, normalizedAmount, 'player', player.world || 'main');
            if (dropObj && typeof player.applyDropLaunch === 'function') {
                player.applyDropLaunch(dropObj, normalizedType);
            }
            return;
        }

        if (!Number.isInteger(targetSlot) || targetSlot < 0 || targetSlot >= player.inventory.length) {
            this.moveInventoryItemToFreeSlotOrDrop(player, normalizedType, normalizedAmount);
            player.sendInventoryUpdate();
            player.sendStatsUpdate();
            return;
        }

        const existingType = player.inventory[targetSlot] || 0;
        const existingCount = player.inventoryCounts[targetSlot] || 0;

        if (isCoinObjectType(normalizedType) && isCoinObjectType(existingType)) {
            const space = Math.max(0, 256 - existingCount);
            const toAdd = Math.min(space, normalizedAmount);
            player.inventoryCounts[targetSlot] = existingCount + toAdd;
            const overflow = normalizedAmount - toAdd;
            if (overflow > 0) {
                this.moveInventoryItemToFreeSlotOrDrop(player, normalizedType, overflow, targetSlot);
            }
            player.sendInventoryUpdate();
            player.sendStatsUpdate();
            return;
        }

        if (existingType > 0) {
            this.moveInventoryItemToFreeSlotOrDrop(player, existingType, existingCount, targetSlot);
        }

        player.inventory[targetSlot] = normalizedType;
        player.inventoryCounts[targetSlot] = normalizedAmount;
        player.sendInventoryUpdate();
        player.sendStatsUpdate();
    }

    resetServer(seed = null) {
        if (Number.isFinite(seed) && seed >= 0 && seed <= 0xFFFFFFFF) {
            try {
                fs.mkdirSync('./profile-runtime', { recursive: true });
                fs.writeFileSync('./profile-runtime/last-seed.txt', String(seed >>> 0), 'utf8');
            } catch (e) {
                console.error('Failed to persist seed for reset:', e);
            }
        }
        setTimeout(() => {
            process.exit(0);
        }, 50);
    }

    grantAdmin(targetId) {
        wss.clients.forEach(client => {
            if (client.id === targetId) {
                client.isAdmin = true;
                const pw = client.packetWriter;
                pw.reset();
                pw.writeU8(11); // ADMIN_AUTH packet
                pw.writeU8(1);
                client.send(pw.getBuffer());
            }
        });
    }

    kill(entityType, entityId) {
        if (entityType === 1) {
            const player = ENTITIES.PLAYERS[entityId];
            if (!player) return;
            if (!player.isAlive) return;
            player.die(null);
        } else if (entityType === 2) {
            const mob = ENTITIES.MOBS[entityId];
            if (mob) mob.die(null);
        }
    }

    setInvis(entityId, isInvisible) {
        const player = ENTITIES.PLAYERS[entityId];
        if (!player) return;
        player.isInvisible = !!isInvisible;
    }

    invis(entityType, startId, endId) {
        if (entityType !== 1) return;
        if (startId === 0 && endId === 65535) {
            for (const id in ENTITIES.PLAYERS) {
                this.setInvis(Number(id), true);
            }
            return;
        }
        for (let i = startId; i <= endId; i++) {
            this.setInvis(i, true);
        }
    }

    uninvis(entityType, startId, endId) {
        if (entityType !== 1) return;
        if (startId === 0 && endId === 65535) {
            for (const id in ENTITIES.PLAYERS) {
                this.setInvis(Number(id), false);
            }
            return;
        }
        for (let i = startId; i <= endId; i++) {
            this.setInvis(i, false);
        }
    }

    breakChest(chestId, dropLoot = false) {
        const chest = ENTITIES.OBJECTS[chestId];
        if (!chest) {
            return;
        }
        if (!isChestObjectType(chest.type)) {
            return; // Not a chest
        }
        chest.shouldDropLoop = dropLoot;
        chest.die(null);
    }

    heal(entityType, entityId) {
        const entityListName = entityType === 1 ? 'PLAYERS' : 'MOBS';
        const entity = ENTITIES[entityListName][entityId];

        if (entity) {
            if (entityType === 1) {
                // Player: use hp and maxHp
                entity.hp = entity.maxHp;
            } else {
                // Mob: use hp and maxHp
                if (entity.maxHp) {
                    entity.hp = entity.maxHp;
                }
            }
        }
    }

    damage(entityType, entityId, damage, isPercentage) {
        const entityListName = this.entityTypeMap[entityType];
        if (!entityListName) return;

        const entity = ENTITIES[entityListName][entityId];
        if (entity) {
            let finalDamage = damage;
            if (isPercentage) {
                const maxHp = entity.maxHp || entity.maxHealth || 100;
                finalDamage = maxHp * damage;
            }
            entity.damage(finalDamage, null);
        }
    }

    activateAbility(playerId, abilityName, targetX = null, targetY = null, durationSeconds = null) {
        const player = ENTITIES.PLAYERS[playerId];
        if (!player || !player.isAlive) return;

        let ability = (abilityName || '').toLowerCase();
        if (ability === 'intimidation') ability = 'invisibility';
        if (ability !== 'energy_burst' && ability !== 'lightning_shot' && ability !== 'stamina_boost' && ability !== 'speed_boost' && ability !== 'poison_blast' && ability !== 'smoke_blast' && ability !== 'growth_spurt' && ability !== 'invisibility') return;

        if (ability === 'stamina_boost') {
            const seconds = Number.isFinite(durationSeconds) ? durationSeconds : 5;
            player.activateStaminaBoost(seconds);
            return;
        }

        if (ability === 'speed_boost') {
            const seconds = Number.isFinite(durationSeconds) ? durationSeconds : 3;
            player.activateMinotaurSpeedBoost(1.25, seconds);
            return;
        }

        if (ability === 'growth_spurt') {
            const seconds = Number.isFinite(durationSeconds) ? durationSeconds : 8;
            player.activateGrowthSpurt(seconds * 1000);
            return;
        }

        if (ability === 'invisibility') {
            applyTemporaryInvisibility(player, 5000);
            return;
        }

        if (ability !== 'poison_blast' && ability !== 'smoke_blast') {
            const electricSfx = dataMap.sfxMap.indexOf('electric-sfx1');
            if (electricSfx >= 0) {
                playSfx(player.x, player.y, electricSfx, 1200);
            }
        }

        if (ability === 'lightning_shot') {
            if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

            const dx = targetX - player.x;
            const dy = targetY - player.y;
            const distanceSq = (dx * dx) + (dy * dy);
            if (distanceSq <= 1) return;
            const distance = Math.sqrt(distanceSq);
            const radiusScale = getRadiusScale(player.radius);

            emitLightningShotFx(player.x, player.y, targetX, targetY, 500 * radiusScale, player.world || 'main', radiusScale);

            const angle = Math.atan2(dy, dx);
            const hitboxSpacing = 20;
            const steps = Math.max(1, Math.ceil(distance / hitboxSpacing));
            const groupId = Math.random();
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const px = player.x + dx * t;
                const py = player.y + dy * t;
                ENTITIES.newEntity({
                    entityType: 'projectile',
                    id: getId('PROJECTILES'),
                    x: px,
                    y: py,
                    angle,
                    type: 11,
                    shooter: player,
                    groupId,
                    projectileOptions: {
                        speedOverride: 0,
                        noMove: true,
                        logicOnly: true,
                        ttlMs: 500,
                        radiusOverride: 10 * radiusScale
                    }
                });
            }
            return;
        }

        if (ability === 'smoke_blast') {
            const durationMs = 8000; // 2s full blind + 6s fade
            const fxDurationMs = 750; // expand quickly, matching poison blast speed
            const minViewRangeMult = 0.2;
            const sourceWorld = player.world || 'main';
            const originX = player.x;
            const originY = player.y;
            const sourceRadius = Math.max(0, player.radius || 0);
            const radiusScale = getRadiusScale(sourceRadius);
            const aoeRadius = 320 * radiusScale;
            const now = performance.now();

            let hitCount = 0;
            for (const id in ENTITIES.PLAYERS) {
                const target = ENTITIES.PLAYERS[id];
                if (!target || !target.isAlive || target.id === player.id) continue;
                if ((target.world || 'main') !== sourceWorld) continue;
                if (target.hasShield) continue; // safe-zone shield blocks the effect
                const dx = target.x - originX;
                const dy = target.y - originY;
                const allowed = aoeRadius + sourceRadius + Math.max(0, target.radius || 0);
                if (dx * dx + dy * dy > (allowed * allowed)) continue;
                target.applyBlindness(durationMs, minViewRangeMult, 2000, 6000);
                target.lastCombatTime = now;
                emitBlindnessFxToPlayer(target.id, durationMs, 1);
                hitCount++;
            }

            for (const id in ENTITIES.MOBS) {
                const target = ENTITIES.MOBS[id];
                if (!target || target.hp <= 0) continue;
                if ((target.world || 'main') !== sourceWorld) continue;
                const dx = target.x - originX;
                const dy = target.y - originY;
                const allowed = aoeRadius + sourceRadius + Math.max(0, target.radius || 0);
                if (dx * dx + dy * dy > (allowed * allowed)) continue;
                if (typeof target.applyBlindness === 'function') {
                    target.applyBlindness(durationMs, 1.5);
                }
            }

            if (hitCount > 0) {
                player.lastCombatTime = now;
            }
            emitSmokeAoeFx(player.x, player.y, aoeRadius, fxDurationMs, 1, sourceWorld);
            return;
        }

        if (ability === 'poison_blast') {
            const aoeDurationMs = 750;
            const initialBlastDamageBase = 20;
            const poisonDamageBase = 7;
            const poisonTickRateMs = 750;
            const poisonDurationMs = 5000;
            const pulseIntervalMs = 50;
            const sourceWorld = player.world || 'main';
            const originX = player.x;
            const originY = player.y;
            const sourceRadius = Math.max(0, player.radius || 0);
            const radiusScale = getRadiusScale(sourceRadius);
            const aoeRadius = 300 * radiusScale;
            const initialBlastDamage = Math.max(1, Math.round(initialBlastDamageBase * radiusScale));
            const poisonDamage = Math.max(1, Math.round(poisonDamageBase * radiusScale));
            const startedAt = performance.now();
            const endsAt = startedAt + aoeDurationMs;

            const applyPulse = () => {
                const now = performance.now();
                const progress = Math.max(0, Math.min(1, (now - startedAt) / aoeDurationMs));
                const currentRadius = aoeRadius * progress;

                for (const id in ENTITIES.PLAYERS) {
                    const target = ENTITIES.PLAYERS[id];
                    if (!target || !target.isAlive || target.id === player.id) continue;
                    if ((target.world || 'main') !== sourceWorld) continue;
                    if (target.hasShield) continue; // shielded players in safe zone are immune
                    if (hasActivePoisonEffect(target)) continue;
                    const dx = target.x - originX;
                    const dy = target.y - originY;
                    const allowed = currentRadius + sourceRadius + Math.max(0, target.radius || 0);
                    if (dx * dx + dy * dy <= (allowed * allowed)) {
                        target.damage(initialBlastDamage, player);
                        poison(target, poisonDamage, poisonTickRateMs, poisonDurationMs, player, true);
                    }
                }

                for (const id in ENTITIES.MOBS) {
                    const target = ENTITIES.MOBS[id];
                    if (!target || target.hp <= 0) continue;
                    if ((target.world || 'main') !== sourceWorld) continue;
                    if (hasActivePoisonEffect(target)) continue;
                    const dx = target.x - originX;
                    const dy = target.y - originY;
                    const allowed = currentRadius + sourceRadius + Math.max(0, target.radius || 0);
                    if (dx * dx + dy * dy <= (allowed * allowed)) {
                        const tookDamage = target.damage(initialBlastDamage, player);
                        // Alarm mobs that get clipped so they chase the caster.
                        if (tookDamage) target.alarm(player, 'hit');
                        poison(target, poisonDamage, poisonTickRateMs, poisonDurationMs, player, true);
                    }
                }
            };

            applyPulse();
            const pulseTimer = setInterval(() => {
                applyPulse();
                if (performance.now() >= endsAt) {
                    clearInterval(pulseTimer);
                }
            }, pulseIntervalMs);

            emitPoisonAoeFx(player.x, player.y, aoeRadius, aoeDurationMs, 2, sourceWorld);
            return;
        }

        spawnEnergyBurstProjectiles(player);
    }

    // regular commands
    upgrade(ws, attributeType) {
        const player = ENTITIES.PLAYERS[ws.id];
        if (!player || !player.isAlive) return;
        player.tryUpgradeBuff(attributeType);
    }
}

export const cmdRun = new CommandMap();

export function colliding(e1, e2, buffer = 0) {
    const e1lastX = e1.lastX !== undefined ? e1.lastX : e1.x;
    const e1lastY = e1.lastY !== undefined ? e1.lastY : e1.y;
    const e2lastX = e2.lastX !== undefined ? e2.lastX : e2.x;
    const e2lastY = e2.lastY !== undefined ? e2.lastY : e2.y;

    const rSum = Math.max(0, e1.radius + e2.radius - buffer);
    const rSumSq = rSum * rSum;

    const e1MinX = Math.min(e1lastX, e1.x) - rSum;
    const e1MaxX = Math.max(e1lastX, e1.x) + rSum;
    const e1MinY = Math.min(e1lastY, e1.y) - rSum;
    const e1MaxY = Math.max(e1lastY, e1.y) + rSum;
    const e2MinX = Math.min(e2lastX, e2.x);
    const e2MaxX = Math.max(e2lastX, e2.x);
    const e2MinY = Math.min(e2lastY, e2.y);
    const e2MaxY = Math.max(e2lastY, e2.y);

    if (e1MaxX < e2MinX || e1MinX > e2MaxX || e1MaxY < e2MinY || e1MinY > e2MaxY) {
        return false;
    }

    const fx = e1lastX - e2lastX;
    const fy = e1lastY - e2lastY;

    // Check if initially overlapping (t=0)
    const c = fx * fx + fy * fy;
    if (c <= rSumSq) return true;

    // Check if overlapping at end of tick (t=1)
    const gx = e1.x - e2.x;
    const gy = e1.y - e2.y;
    if (gx * gx + gy * gy <= rSumSq) return true;

    // Relative movement (delta velocity)
    const dx = (e1.x - e1lastX) - (e2.x - e2lastX);
    const dy = (e1.y - e1lastY) - (e2.y - e2lastY);

    const a = dx * dx + dy * dy;
    if (a < 0.001) return false; // No significant relative movement

    const b = 2 * (fx * dx + fy * dy);

    // Solve for time t where distance is minimized: t = -b / (2a)
    const tMin = -b / (2 * a);

    // If the closest point occurs between the start and end of the tick
    if (tMin > 0 && tMin < 1) {
        const minDistSq = a * (tMin * tMin) + b * tMin + c;
        return minDistSq <= rSumSq;
    }

    return false;
}
