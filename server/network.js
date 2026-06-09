import {
    ENTITIES
} from './game.js';
import {
    ACCESSORY_KEYS,
    TPS
} from '../public/shared/datamap.js';
import { drainQueuedCoinPickupFxByWorld, drainQueuedChestCoinSeedsByWorld, drainQueuedDamageIndicatorFxByWorld } from './helpers.js';

const UPDATE_SEND_BUFFER = 120;
const SPECTATOR_RANGE_DIVISOR = 1.5;
const MINIMAP_UPDATE_INTERVAL_TICKS = 3;
const IDLE_SESSION_LIMIT_MS = 15 * 60 * 1000;
const EMPTY_WORLD_SNAPSHOT = Object.freeze({
    players: [],
    alivePlayers: [],
    mobs: [],
    projectiles: [],
    objects: [],
    structures: [],
    leaderboard: [],
    topLeader: null,
    minimapPlayers: [],
    minimapSignature: '0:2166136261'
});
const ENTITY_KEY_PLAYER = 1 << 20;
const ENTITY_KEY_MOB = 2 << 20;
const ENTITY_KEY_PROJECTILE = 3 << 20;
const ENTITY_KEY_OBJECT = 4 << 20;
const ENTITY_KEY_STRUCTURE = 8 << 20;
const GLOBAL_LEADERBOARD_KEY = '__global_competitive__';
const UPDATE_SECTION_STRUCTURES = 83; // "S"
const TWO_PI = Math.PI * 2;
const ANGLE_DELTA_THRESHOLD = 0.02;
const POSITION_DELTA_THRESHOLD = 1;
const PLAYER_MASK_X = 0x0001;
const PLAYER_MASK_Y = 0x0002;
const PLAYER_MASK_ANGLE = 0x0004;
const PLAYER_MASK_HP = 0x0008;
const PLAYER_MASK_MAX_HP = 0x0010;
const PLAYER_MASK_SCORE = 0x0020;
const PLAYER_MASK_WEAPON = 0x0040;
const PLAYER_MASK_SWING = 0x0080;
const PLAYER_MASK_STATUS = 0x0100;
const PLAYER_MASK_CHAT = 0x0200;
const PLAYER_MASK_USERNAME = 0x0400;
const PLAYER_MASK_ACCESSORY = 0x0800;
const PLAYER_MASK_FROZEN = 0x1000;
const PLAYER_MASK_FULL = 0x8000;
const MOB_MASK_FULL = 0x8000;
const MOB_MASK_X = 0x0001;
const MOB_MASK_Y = 0x0002;
const MOB_MASK_ANGLE = 0x0004;
const MOB_MASK_HP = 0x0008;
const MOB_MASK_MAX_HP = 0x0010;
const MOB_MASK_TYPE = 0x0020;
const MOB_MASK_SWING = 0x0040;
const MOB_MASK_FROZEN = 0x0080;

function packAngleU16(angle = 0) {
    const normalized = ((Number(angle) % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.max(0, Math.min(65535, Math.round((normalized / TWO_PI) * 65535)));
}

function getAngleDeltaAbs(a = 0, b = 0) {
    return Math.abs((((a - b) + Math.PI * 3) % TWO_PI) - Math.PI);
}

function packPlayerStatusByte(player) {
    return (
        (player?.hasWeapon ? 1 : 0) |
        ((player?.hasShield ? 1 : 0) << 1) |
        ((player?.isAlive ? 1 : 0) << 2) |
        ((player?.isInvisible ? 1 : 0) << 3)
    ) & 0xFF;
}

function getBotRoleSyncCode(player) {
    if (!player?.isBot) return 0;
    if (player._botRole === 'pro') return 1;
    if (player._botRole === 'casual') return 2;
    if (player._botRole === 'noob') return 3;
    return 0;
}

function getIceEncasedRemainingMs(entity, now = performance.now()) {
    const iceUntil = Number.isFinite(entity?.iceEncasedUntil) ? entity.iceEncasedUntil : 0;
    return Math.max(0, Math.min(65535, Math.ceil(iceUntil - now)));
}

/**
 * Builds and sends updates for all connected clients.
 */
export function sendUpdates(wss, lbWriter, now = performance.now()) {
    const queuedCoinFxByWorld = drainQueuedCoinPickupFxByWorld();
    const queuedChestCoinSeedsByWorld = drainQueuedChestCoinSeedsByWorld();
    const queuedDamageFxByWorld = drainQueuedDamageIndicatorFxByWorld();
    const worldSnapshots = buildWorldSnapshots();
    for (const ws of wss.clients) {
        if (ws.readyState !== 1) continue; // WebSocket.OPEN

        // Only kick truly idle sessions, not active players.
        const lastActivityAt = Number.isFinite(ws.lastPacketTime) ? ws.lastPacketTime : now;
        if ((now - lastActivityAt) > IDLE_SESSION_LIMIT_MS) {
            ws.kick('Kicked after 15 minutes idle.');
            continue;
        }

        const localPlayer = ENTITIES.PLAYERS[ws.id] || { x: 0, y: 0 };
        const world = localPlayer.world || ws.world || 'main';
        const worldSnapshot = worldSnapshots.get(world) || EMPTY_WORLD_SNAPSHOT;
        const spectateRef = !localPlayer.isAlive ? (worldSnapshot.topLeader || null) : null;
        const rangeRefPlayer = spectateRef || localPlayer;
        const forceTutorialWorldSync = world.startsWith('tutorial');
        const baseRange = localPlayer.isAlive ? 1200 : ((1200 / 0.7) / SPECTATOR_RANGE_DIVISOR);
        const alienHatKey = ACCESSORY_KEYS[rangeRefPlayer.accessoryId || 0];
        const wearingAlienHat = alienHatKey === 'alien_antennas';
        const alienHatRange = 1500;
        const viewRangeMult = (rangeRefPlayer.viewRangeMult ?? localPlayer.viewRangeMult ?? ws.viewRangeMult ?? 1);
        const requestedRange = baseRange * viewRangeMult;
        let renderDistance = requestedRange;
        if (wearingAlienHat) {
            renderDistance = Math.max(renderDistance, Math.min(alienHatRange, requestedRange * 1.2));
        }
        const effectiveRenderDistance = renderDistance + UPDATE_SEND_BUFFER;
        const renderDistanceSq = effectiveRenderDistance ** 2;
        const lpX = localPlayer.x;
        const lpY = localPlayer.y;

        const pw = ws.packetWriter;
        if (!pw) return;
        pw.reset();
        pw.writeU8(2); // Packet Type: Update

        const seenState = beginSeenEntityTracking(ws);

        writePlayers(pw, ws, lpX, lpY, renderDistanceSq, seenState.prev, seenState.next, worldSnapshot.players);
        writeMobs(pw, lpX, lpY, renderDistanceSq, seenState.prev, seenState.next, worldSnapshot.mobs, forceTutorialWorldSync);
        writeProjectiles(pw, lpX, lpY, renderDistanceSq, seenState.prev, seenState.next, worldSnapshot.projectiles, forceTutorialWorldSync);
        writeObjects(pw, lpX, lpY, renderDistanceSq, seenState.prev, seenState.next, worldSnapshot.objects, forceTutorialWorldSync);
        writeRemovedObjects(pw, seenState.prev, seenState.next);
        writeChestCoinSeedBatch(pw, queuedChestCoinSeedsByWorld.get(world) || [], lpX, lpY, renderDistanceSq);
        writeCoinPickupFxBatch(pw, queuedCoinFxByWorld.get(world) || []);
        writeDamageIndicatorFxBatch(pw, queuedDamageFxByWorld.get(world) || []);
        writeStructureUpdates(pw, lpX, lpY, renderDistanceSq, seenState.prev, seenState.next, worldSnapshot.structures, forceTutorialWorldSync);
        const top = worldSnapshot.topLeader;
        const worldChanged = ws._lastOptionalSyncWorld !== world;
        const topSig = top ? `${top.id}:${top.x}:${top.y}:${top.score || 0}` : 'none';
        const wantsMinimap = ws.wantsMinimap !== false;
        const minimapChanged = worldChanged || ws._lastMinimapSignature !== worldSnapshot.minimapSignature;
        const topChanged = worldChanged || ws._lastTopLeaderSignature !== topSig;
        const minimapTickCounter = (ws._minimapTickCounter || 0) + 1;
        const minimapCadenceDue = worldChanged || minimapTickCounter >= MINIMAP_UPDATE_INTERVAL_TICKS;
        ws._minimapTickCounter = minimapCadenceDue ? 0 : minimapTickCounter;
        const shouldSendMinimap = wantsMinimap && minimapChanged && minimapCadenceDue;
        const shouldSendTopLeader = wantsMinimap && (topChanged || shouldSendMinimap);

        // Keep packet order stable: minimap section can only be sent after top-leader section.
        if (shouldSendTopLeader) {
            writeTopLeaderMarker(pw, top);
            ws._lastTopLeaderSignature = topSig;
            if (shouldSendMinimap) {
                writeMinimapPlayers(pw, worldSnapshot.minimapPlayers);
                ws._lastMinimapSignature = worldSnapshot.minimapSignature;
            }
            ws._lastOptionalSyncWorld = world;
        }

        endSeenEntityTracking(ws, seenState);

        const updateBuffer = pw.getBuffer();
        if (updateBuffer.byteLength > 1) {
            ws.send(updateBuffer);
        }

        // Handle Leaderboard
        if (shouldSendLeaderboard(ws)) {
            ws.send(buildLeaderboardPacket(lbWriter, worldSnapshot.leaderboard));
        }
    }
}

function writeCoinPickupFxBatch(pw, events) {
    const countPos = pw.reserveU16();
    let count = 0;
    const limit = Math.min(65535, events.length);
    for (let i = 0; i < limit; i++) {
        const evt = events[i];
        pw.writeU16(evt.x);
        pw.writeU16(evt.y);
        pw.writeF32(evt.angle || 0);
        pw.writeU16(evt.targetX);
        pw.writeU16(evt.targetY);
        pw.writeU16(evt.amount);
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeChestCoinSeedBatch(pw, events, lpX = 0, lpY = 0, rangeSq = Infinity) {
    const countPos = pw.reserveU16();
    let count = 0;
    const limit = Math.min(65535, events.length);
    for (let i = 0; i < limit; i++) {
        const evt = events[i];
        const spread = Math.max(0, evt.spread || 0);
        if (Number.isFinite(rangeSq)) {
            const dx = evt.x - lpX;
            const dy = evt.y - lpY;
            const visibleRange = Math.sqrt(rangeSq) + spread;
            if ((dx * dx + dy * dy) > (visibleRange * visibleRange)) continue;
        }
        pw.writeU16(evt.x);
        pw.writeU16(evt.y);
        pw.writeU16(evt.spread);
        pw.writeU16(evt.totalCoins);
        pw.writeU32(evt.seed >>> 0);
        pw.writeU16(evt.lifetimeMs);
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeDamageIndicatorFxBatch(pw, events) {
    const countPos = pw.reserveU16();
    let count = 0;
    const limit = Math.min(65535, events.length);
    for (let i = 0; i < limit; i++) {
        const evt = events[i];
        pw.writeU16(evt.x);
        pw.writeU16(evt.y);
        pw.writeU16(evt.amount);
        pw.writeU16(evt.radius);
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeTopLeaderMarker(pw, top) {
    if (!top) {
        pw.writeU8(0);
        return;
    }
    pw.writeU8(1);
    pw.writeU8(top.id);
    pw.writeU16(top.x);
    pw.writeU16(top.y);
    pw.writeU32(top.score || 0);
}

function writeMinimapPlayers(pw, players) {
    const safePlayers = Array.isArray(players) ? players : [];
    const count = Math.min(255, safePlayers.length);
    pw.writeU8(count);
    for (let i = 0; i < count; i++) {
        const p = safePlayers[i];
        if (!p) continue;
        pw.writeU8(p.id || 0);
        pw.writeU16(p.x);
        pw.writeU16(p.y);
    }
}

function getOrCreateWorldSnapshot(snapshots, world) {
    let snapshot = snapshots.get(world);
    if (snapshot) return snapshot;
    snapshot = {
        players: [],
        alivePlayers: [],
        mobs: [],
        projectiles: [],
        objects: [],
        structures: [],
        leaderboard: [],
        topLeader: null,
        minimapPlayers: [],
        minimapSignature: '0:2166136261'
    };
    snapshots.set(world, snapshot);
    return snapshot;
}

function insertLeaderboardEntry(leaderboard, player) {
    let insertAt = leaderboard.length;
    while (insertAt > 0 && (leaderboard[insertAt - 1].score || 0) < (player.score || 0)) {
        insertAt--;
    }
    if (insertAt >= 10) return;
    leaderboard.splice(insertAt, 0, player);
    if (leaderboard.length > 10) leaderboard.length = 10;
}

function isPracticeWorld(world) {
    return String(world || '').startsWith('tutorial');
}

function finalizeWorldSnapshot(snapshot) {
    snapshot.topLeader = snapshot.leaderboard.length ? snapshot.leaderboard[0] : null;
    let hash = 2166136261;
    const minimapCount = Math.min(255, snapshot.alivePlayers.length);
    for (let i = 0; i < minimapCount; i++) {
        const p = snapshot.alivePlayers[i];
        snapshot.minimapPlayers.push({ id: p.id, x: p.x, y: p.y });
        hash ^= (p.id & 0xFF);
        hash = Math.imul(hash, 16777619);
        hash ^= (p.x & 0xFFFF);
        hash = Math.imul(hash, 16777619);
        hash ^= (p.y & 0xFFFF);
        hash = Math.imul(hash, 16777619);
    }
    snapshot.minimapSignature = `${minimapCount}:${hash >>> 0}`;
}

function buildWorldSnapshots() {
    const snapshots = new Map();
    const sharedLeaderboards = new Map();
    sharedLeaderboards.set(GLOBAL_LEADERBOARD_KEY, []);

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        const world = p.world || 'main';
        const snapshot = getOrCreateWorldSnapshot(snapshots, world);
        snapshot.players.push(p);
        if (!p.isAlive) continue;
        snapshot.alivePlayers.push(p);
        if (isPracticeWorld(world)) {
            insertLeaderboardEntry(snapshot.leaderboard, p);
        } else {
            insertLeaderboardEntry(sharedLeaderboards.get(GLOBAL_LEADERBOARD_KEY), p);
        }
    }

    for (const id in ENTITIES.MOBS) {
        const m = ENTITIES.MOBS[id];
        if (!m) continue;
        getOrCreateWorldSnapshot(snapshots, m.world || 'main').mobs.push(m);
    }

    for (const id in ENTITIES.PROJECTILES) {
        const p = ENTITIES.PROJECTILES[id];
        if (!p) continue;
        getOrCreateWorldSnapshot(snapshots, p.world || 'main').projectiles.push(p);
    }

    for (const id in ENTITIES.OBJECTS) {
        const o = ENTITIES.OBJECTS[id];
        if (!o) continue;
        getOrCreateWorldSnapshot(snapshots, o.world || 'main').objects.push(o);
    }

    for (const id in ENTITIES.STRUCTURES) {
        const s = ENTITIES.STRUCTURES[id];
        if (!s) continue;
        getOrCreateWorldSnapshot(snapshots, s.world || 'main').structures.push(s);
    }

    const globalLeaderboard = sharedLeaderboards.get(GLOBAL_LEADERBOARD_KEY) || [];
    for (const [world, snapshot] of snapshots) {
        if (isPracticeWorld(world)) continue;
        snapshot.leaderboard = globalLeaderboard;
    }

    for (const snapshot of snapshots.values()) {
        finalizeWorldSnapshot(snapshot);
    }

    return snapshots;
}

export function sendPlayerCount(wss, writer) {
    const count = [...wss.clients].filter(ws => ws.readyState === 1).length;
    writer.reset();
    writer.writeU8(20); // Packet Type: Player Count
    writer.writeU8(count);
    const buf = writer.getBuffer();
    wss.clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(buf);
    });
}

function getLeaderboard(world) {
    if (!isPracticeWorld(world)) {
        const lb = [];
        for (const id in ENTITIES.PLAYERS) {
            const p = ENTITIES.PLAYERS[id];
            if (!p || !p.isAlive || isPracticeWorld(p.world || 'main')) continue;
            insertLeaderboardEntry(lb, p);
        }
        return lb;
    }

    const lb = [];
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive || (p.world || 'main') !== world) continue;

        let insertAt = lb.length;
        while (insertAt > 0 && (lb[insertAt - 1].score || 0) < (p.score || 0)) {
            insertAt--;
        }
        if (insertAt >= 10) continue;
        lb.splice(insertAt, 0, p);
        if (lb.length > 10) lb.length = 10;
    }
    return lb;
}

function getTopLeaderForWorld(world) {
    const lb = getLeaderboard(world);
    return lb.length ? lb[0] : null;
}

function beginSeenEntityTracking(ws) {
    const prev = ws.seenEntities instanceof Set ? ws.seenEntities : new Set();
    const next = ws._pendingSeenEntities instanceof Set ? ws._pendingSeenEntities : new Set();
    next.clear();
    return { prev, next };
}

function endSeenEntityTracking(ws, state) {
    ws.seenEntities = state.next;
    ws._pendingSeenEntities = state.prev;
}

function buildLeaderboardPacket(writer, leaderboard) {
    writer.reset();
    writer.writeU8(5);
    writer.writeU8(leaderboard.length);
    for (const p of leaderboard) {
        writer.writeU8(p.id);
        writer.writeU32(p.score);
        writer.writeStr(p.username);
    }
    return writer.getBuffer();
}

function shouldSendLeaderboard(ws) {
    if (ws.wantsLeaderboard === false) return false;
    if (ws._leaderboardDirty) {
        ws._leaderboardDirty = false;
        return true;
    }
    const p = ENTITIES.PLAYERS[ws.id];
    const counterKey = p ? 'updateCount' : 'leaderboardUpdateCount';
    if (!ws[counterKey]) ws[counterKey] = 0;
    ws[counterKey]++;
    if (ws[counterKey] >= TPS.server * 1.5) {
        ws[counterKey] = 0;
        return true;
    }
    return false;
}

function writePlayers(pw, ws, lpX, lpY, rangeSq, prevSeen, nextSeen, players) {
    const countPos = pw.reserveU8();
    let count = 0;

    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p.isInvisible && p.id !== ws.id) continue;
        const dx = p.x - lpX;
        const dy = p.y - lpY;
        if (p.id !== ws.id && dx * dx + dy * dy > rangeSq) continue;

        const seenKey = ENTITY_KEY_PLAYER + p.id;
        nextSeen.add(seenKey);
        pw.writeU8(p.id);

        let mask = 0;
        const prev = p.prev || {};
        const freezeRemainingMs = getIceEncasedRemainingMs(p);
        const isFrozen = freezeRemainingMs > 0;
        let full = !prevSeen.has(seenKey);
        if (p._forceFullSync) full = true;

        if (full) {
            mask = PLAYER_MASK_FULL;
        } else {
            if (Math.abs(p.x - prev.x) > 1) mask |= PLAYER_MASK_X;
            if (Math.abs(p.y - prev.y) > 1) mask |= PLAYER_MASK_Y;
            if (Math.abs(p.angle - prev.angle) > ANGLE_DELTA_THRESHOLD) mask |= PLAYER_MASK_ANGLE;
            if (p.hp !== prev.hp) mask |= PLAYER_MASK_HP;
            if (p.maxHp !== prev.maxHp) mask |= PLAYER_MASK_MAX_HP;
            if (p.score !== prev.score) mask |= PLAYER_MASK_SCORE;
            if (p.weapon?.rank !== prev.weaponRank) mask |= PLAYER_MASK_WEAPON;
            if (p.swingState !== prev.swingState) mask |= PLAYER_MASK_SWING;
            if (
                p.hasWeapon !== prev.hasWeapon ||
                p.hasShield !== prev.hasShield ||
                p.isAlive !== prev.isAlive ||
                p.isInvisible !== prev.isInvisible
            ) mask |= PLAYER_MASK_STATUS;
            if (p.chatMessage !== prev.chatMessage) mask |= PLAYER_MASK_CHAT;
            if (p.username !== prev.username) mask |= PLAYER_MASK_USERNAME;
            if (p.accessoryId !== prev.accessoryId) mask |= PLAYER_MASK_ACCESSORY;
            if (isFrozen !== !!prev.isFrozen) mask |= PLAYER_MASK_FROZEN;
        }

        pw.writeU16(mask);
        if (mask & PLAYER_MASK_FULL) {
            const packedRadius = Math.max(1, Math.min(0x1FFF, Math.floor(p.radius || 1)));
            const packedRoleRadius = packedRadius | (getBotRoleSyncCode(p) << 13);
            pw.writeU16(p.x); pw.writeU16(p.y); pw.writeU16(packAngleU16(p.angle));
            pw.writeU16(p.hp); pw.writeU16(p.maxHp); pw.writeU32(p.score);
            pw.writeU8(p.weapon?.rank || 1); pw.writeU8(p.swingState);
            pw.writeU8(packPlayerStatusByte(p));
            pw.writeU8(p.accessoryId || 0);
            pw.writeU16(freezeRemainingMs);
            pw.writeU16(packedRoleRadius);
            pw.writeStr(p.username); pw.writeStr(p.chatMessage);
        } else {
            if (mask & PLAYER_MASK_X) pw.writeU16(p.x);
            if (mask & PLAYER_MASK_Y) pw.writeU16(p.y);
            if (mask & PLAYER_MASK_ANGLE) pw.writeU16(packAngleU16(p.angle));
            if (mask & PLAYER_MASK_HP) pw.writeU16(p.hp);
            if (mask & PLAYER_MASK_MAX_HP) pw.writeU16(p.maxHp);
            if (mask & PLAYER_MASK_SCORE) pw.writeU32(p.score);
            if (mask & PLAYER_MASK_WEAPON) pw.writeU8(p.weapon?.rank || 1);
            if (mask & PLAYER_MASK_SWING) pw.writeU8(p.swingState);
            if (mask & PLAYER_MASK_STATUS) pw.writeU8(packPlayerStatusByte(p));
            if (mask & PLAYER_MASK_CHAT) pw.writeStr(p.chatMessage);
            if (mask & PLAYER_MASK_USERNAME) pw.writeStr(p.username);
            if (mask & PLAYER_MASK_ACCESSORY) pw.writeU8(p.accessoryId || 0);
            if (mask & PLAYER_MASK_FROZEN) pw.writeU16(freezeRemainingMs);
        }
        count++;
    }
    pw.writeU8At(countPos, count);
}

function writeMobs(pw, lpX, lpY, rangeSq, prevSeen, nextSeen, mobs, forceWorldSync = false) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (let i = 0; i < mobs.length; i++) {
        const m = mobs[i];
        const dx = m.x - lpX; const dy = m.y - lpY;
        if (!forceWorldSync && dx * dx + dy * dy > rangeSq) continue;

        const seenKey = ENTITY_KEY_MOB + m.id;
        nextSeen.add(seenKey);
        pw.writeU16(m.id);
        let full = !prevSeen.has(seenKey);
        if (m._forceFullSync) full = true;
        const prev = m.prev || {};
        const freezeRemainingMs = getIceEncasedRemainingMs(m);
        const isFrozen = freezeRemainingMs > 0;
        if (!full && (prev.x === undefined || prev.y === undefined || prev.angle === undefined || prev.type === undefined)) {
            full = true;
        }
        let mask = full ? MOB_MASK_FULL : 0;
        if (!full) {
            const deltaX = m.x - prev.x;
            const deltaY = m.y - prev.y;
            if ((deltaX * deltaX + deltaY * deltaY) > (POSITION_DELTA_THRESHOLD * POSITION_DELTA_THRESHOLD)) {
                mask |= MOB_MASK_X | MOB_MASK_Y;
            }
            if (getAngleDeltaAbs(m.angle, prev.angle) > ANGLE_DELTA_THRESHOLD) mask |= MOB_MASK_ANGLE;
            if (m.hp !== prev.hp) mask |= MOB_MASK_HP;
            if (m.maxHp !== prev.maxHp) mask |= MOB_MASK_MAX_HP;
            if (m.type !== prev.type) mask |= MOB_MASK_TYPE;
            if ((m.swingState || 0) !== (prev.swingState || 0)) mask |= MOB_MASK_SWING;
            if (isFrozen !== !!prev.isFrozen) mask |= MOB_MASK_FROZEN;
        }
        pw.writeU16(mask);
        if (mask & MOB_MASK_FULL) {
            pw.writeU16(m.x); pw.writeU16(m.y); pw.writeU16(packAngleU16(m.angle));
            pw.writeU16(m.hp); pw.writeU16(m.maxHp); pw.writeU8(m.type); pw.writeU8(m.swingState || 0);
            pw.writeU16(Math.max(1, Math.min(65535, Math.floor(m.radius || 1))));
            pw.writeU16(freezeRemainingMs);
        } else {
            if (mask & MOB_MASK_X) pw.writeU16(m.x);
            if (mask & MOB_MASK_Y) pw.writeU16(m.y);
            if (mask & MOB_MASK_ANGLE) pw.writeU16(packAngleU16(m.angle));
            if (mask & MOB_MASK_HP) pw.writeU16(m.hp);
            if (mask & MOB_MASK_MAX_HP) pw.writeU16(m.maxHp);
            if (mask & MOB_MASK_TYPE) pw.writeU8(m.type);
            if (mask & MOB_MASK_SWING) pw.writeU8(m.swingState || 0);
            if (mask & MOB_MASK_FROZEN) pw.writeU16(freezeRemainingMs);
        }
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeProjectiles(pw, lpX, lpY, rangeSq, prevSeen, nextSeen, projectiles, forceWorldSync = false) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (let i = 0; i < projectiles.length; i++) {
        const p = projectiles[i];
        if (p.logicOnly) continue;
        const sendX = p.staticRender ? (p.renderX ?? p.x) : p.x;
        const sendY = p.staticRender ? (p.renderY ?? p.y) : p.y;
        const dx = sendX - lpX; const dy = sendY - lpY;
        if (!forceWorldSync && dx * dx + dy * dy > rangeSq) continue;

        const seenKey = ENTITY_KEY_PROJECTILE + p.id;
        nextSeen.add(seenKey);
        pw.writeU16(p.id);
        const full = !prevSeen.has(seenKey);
        const prev = p.prev || {};
        let mask = full ? 0x80 : 0;
        if (!full) {
            if (Math.abs(sendX - (prev.x ?? sendX)) > 1) mask |= 0x01;
            if (Math.abs(sendY - (prev.y ?? sendY)) > 1) mask |= 0x02;
            if (Math.abs(p.angle - prev.angle) > ANGLE_DELTA_THRESHOLD) mask |= 0x04;
            if (p.type !== prev.type) mask |= 0x08;
            if (p.weaponRank !== prev.weaponRank) mask |= 0x10;
            if ((p.renderLength || 0) !== (prev.renderLength || 0)) mask |= 0x20;
            if ((p.radius || 0) !== (prev.radius || 0)) mask |= 0x40;
        }
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(sendX); pw.writeU16(sendY); pw.writeU16(packAngleU16(p.angle));
            pw.writeI8(p.type); pw.writeU8(p.weaponRank);
            pw.writeU16(Math.max(1, Math.min(65535, Math.round(p.radius || 1))));
            if (p.type === 13) pw.writeU16(p.renderLength || 0);
        } else {
            if (mask & 0x01) pw.writeU16(sendX);
            if (mask & 0x02) pw.writeU16(sendY);
            if (mask & 0x04) pw.writeU16(packAngleU16(p.angle));
            if (mask & 0x08) pw.writeI8(p.type);
            if (mask & 0x10) pw.writeU8(p.weaponRank);
            if (mask & 0x20) pw.writeU16(p.renderLength || 0);
            if (mask & 0x40) pw.writeU16(Math.max(1, Math.min(65535, Math.round(p.radius || 1))));
        }
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeObjects(pw, lpX, lpY, rangeSq, prevSeen, nextSeen, objects, forceWorldSync = false) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (let i = 0; i < objects.length; i++) {
        const o = objects[i];
        if (o.source === 'chest') continue; // chest coins are reconstructed client-side from seed events
        const dx = o.x - lpX; const dy = o.y - lpY;
        if (!forceWorldSync && dx * dx + dy * dy > rangeSq) continue;

        const seenKey = ENTITY_KEY_OBJECT + o.id;
        nextSeen.add(seenKey);
        pw.writeU16(o.id);
        let full = !prevSeen.has(seenKey);
        const prev = o.prev || {};
        if (!full && (prev.x === undefined || prev.y === undefined || prev.health === undefined || prev.type === undefined)) {
            full = true;
        }
        let mask = full ? 0x80 : 0;
        if (!full) {
            if (Math.abs(o.x - prev.x) > 1) mask |= 0x01;
            if (Math.abs(o.y - prev.y) > 1) mask |= 0x02;
            if (o.health !== prev.health) mask |= 0x04;
            if (o.type !== prev.type) mask |= 0x08;
            if (o.amount !== prev.amount) mask |= 0x10;
        }
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(o.x); pw.writeU16(o.y); pw.writeI8(o.type); pw.writeU16(o.health);
            pw.writeU32(o.amount || 1);
        } else {
            if (mask & 0x01) pw.writeU16(o.x);
            if (mask & 0x02) pw.writeU16(o.y);
            if (mask & 0x04) pw.writeU16(o.health);
            if (mask & 0x08) pw.writeI8(o.type);
            if (mask & 0x10) pw.writeU32(o.amount || 1);
        }
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeRemovedObjects(pw, prevSeen, nextSeen) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (const seenKey of prevSeen) {
        if ((seenKey & ENTITY_KEY_OBJECT) !== ENTITY_KEY_OBJECT) continue;
        if (nextSeen.has(seenKey)) continue;
        const objectId = seenKey & 0xFFFFF;
        pw.writeU16(objectId);
        count++;
        if (count >= 65535) break;
    }
    pw.writeU16At(countPos, count);
}

function writeStructureUpdates(pw, lpX, lpY, rangeSq, prevSeen, nextSeen, structures, forceWorldSync = false) {
    const updates = [];

    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (!s) continue;
        const radius = Math.max(1, Math.min(65535, Math.round(s.radius || 1)));
        const dx = s.x - lpX;
        const dy = s.y - lpY;
        const visibleRangeSq = forceWorldSync ? Infinity : Math.pow(Math.sqrt(rangeSq) + radius, 2);
        if (!forceWorldSync && dx * dx + dy * dy > visibleRangeSq) continue;

        const seenKey = ENTITY_KEY_STRUCTURE + s.id;
        nextSeen.add(seenKey);
        const prev = s.prev || {};
        let full = !prevSeen.has(seenKey) || s._forceFullSync;
        if (!full && (prev.x === undefined || prev.y === undefined || prev.type === undefined || prev.radius === undefined)) {
            full = true;
        }

        let mask = full ? 0x80 : 0;
        if (!full) {
            if (Math.abs(s.x - prev.x) > 1) mask |= 0x01;
            if (Math.abs(s.y - prev.y) > 1) mask |= 0x02;
            if (s.type !== prev.type) mask |= 0x04;
            if (radius !== prev.radius) mask |= 0x08;
        }
        if (!mask) continue;

        updates.push({ structure: s, mask, radius });
        if (updates.length >= 65535) break;
    }

    if (updates.length === 0) return;

    pw.writeU8(UPDATE_SECTION_STRUCTURES);
    pw.writeU16(updates.length);
    for (let i = 0; i < updates.length; i++) {
        const { structure: s, mask, radius } = updates[i];
        pw.writeU16(s.id);
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(s.x);
            pw.writeU16(s.y);
            pw.writeU8(s.type);
            pw.writeU16(radius);
        } else {
            if (mask & 0x01) pw.writeU16(s.x);
            if (mask & 0x02) pw.writeU16(s.y);
            if (mask & 0x04) pw.writeU8(s.type);
            if (mask & 0x08) pw.writeU16(radius);
        }
    }
}

export function saveHistory() {
    const now = performance.now();
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        const prev = p.prev || (p.prev = {});
        prev.x = p.x; prev.y = p.y; prev.angle = p.angle; prev.hp = p.hp; prev.maxHp = p.maxHp;
        prev.isAlive = p.isAlive; prev.score = p.score; prev.weaponRank = p.weapon?.rank;
        prev.swingState = p.swingState; prev.hasWeapon = p.hasWeapon;
        prev.hasShield = p.hasShield; prev.chatMessage = p.chatMessage; prev.username = p.username;
        prev.accessoryId = p.accessoryId || 0;
        prev.isInvisible = p.isInvisible;
        prev.isFrozen = getIceEncasedRemainingMs(p, now) > 0;
        p._forceFullSync = false;
    }
    for (const id in ENTITIES.MOBS) {
        const m = ENTITIES.MOBS[id];
        if (!m) continue;
        const prev = m.prev || (m.prev = {});
        prev.x = m.x; prev.y = m.y; prev.angle = m.angle; prev.hp = m.hp; prev.maxHp = m.maxHp; prev.type = m.type; prev.swingState = m.swingState || 0;
        prev.isFrozen = getIceEncasedRemainingMs(m, now) > 0;
        m._forceFullSync = false;
    }
    for (const id in ENTITIES.PROJECTILES) {
        const p = ENTITIES.PROJECTILES[id];
        if (!p) continue;
        const sendX = p.staticRender ? (p.renderX ?? p.x) : p.x;
        const sendY = p.staticRender ? (p.renderY ?? p.y) : p.y;
        const prev = p.prev || (p.prev = {});
        prev.x = sendX; prev.y = sendY; prev.angle = p.angle; prev.type = p.type; prev.weaponRank = p.weaponRank; prev.renderLength = p.renderLength || 0; prev.radius = p.radius || 0;
    }
    for (const id in ENTITIES.OBJECTS) {
        const o = ENTITIES.OBJECTS[id];
        if (!o) continue;
        const prev = o.prev || (o.prev = {});
        prev.x = o.x; prev.y = o.y; prev.health = o.health; prev.type = o.type; prev.amount = o.amount;
    }
    for (const id in ENTITIES.STRUCTURES) {
        const s = ENTITIES.STRUCTURES[id];
        if (!s) continue;
        const prev = s.prev || (s.prev = {});
        prev.x = s.x;
        prev.y = s.y;
        prev.type = s.type;
        prev.radius = Math.max(1, Math.min(65535, Math.round(s.radius || 1)));
        s._forceFullSync = false;
    }
}
