import {
    ENTITIES
} from './game.js';
import {
    ACCESSORY_KEYS,
    TPS
} from '../public/shared/datamap.js';
import { drainQueuedCoinPickupFxByWorld, drainQueuedChestCoinSeedsByWorld, drainQueuedDamageIndicatorFxByWorld } from './helpers.js';

const UPDATE_SEND_BUFFER = 260;
const SPECTATOR_RANGE_DIVISOR = 1.5;
const MINIMAP_UPDATE_INTERVAL_TICKS = 3;
const EMPTY_WORLD_SNAPSHOT = Object.freeze({
    players: [],
    alivePlayers: [],
    mobs: [],
    projectiles: [],
    objects: [],
    leaderboard: [],
    topLeader: null,
    minimapPlayers: [],
    minimapSignature: '0:2166136261'
});
const ENTITY_KEY_PLAYER = 1 << 20;
const ENTITY_KEY_MOB = 2 << 20;
const ENTITY_KEY_PROJECTILE = 3 << 20;
const ENTITY_KEY_OBJECT = 4 << 20;

function getBotRoleSyncCode(player) {
    if (!player?.isBot) return 0;
    if (player._botRole === 'pro') return 1;
    if (player._botRole === 'casual') return 2;
    if (player._botRole === 'noob') return 3;
    return 0;
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

        // Kick inactive
        if (now - (ws.lastPacketTime || 0) > 300000) { // 5 mins
            ws.kick('Kicked for inactivity.');
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
        const wearingAlienHat = alienHatKey === 'alien-antennas';
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
        writeChestCoinSeedBatch(pw, queuedChestCoinSeedsByWorld.get(world) || []);
        writeCoinPickupFxBatch(pw, queuedCoinFxByWorld.get(world) || []);
        writeDamageIndicatorFxBatch(pw, queuedDamageFxByWorld.get(world) || []);
        const top = worldSnapshot.topLeader;
        const worldChanged = ws._lastOptionalSyncWorld !== world;
        const topSig = top ? `${top.id}:${top.x}:${top.y}:${top.score || 0}` : 'none';
        const minimapChanged = worldChanged || ws._lastMinimapSignature !== worldSnapshot.minimapSignature;
        const topChanged = worldChanged || ws._lastTopLeaderSignature !== topSig;
        const minimapTickCounter = (ws._minimapTickCounter || 0) + 1;
        const minimapCadenceDue = worldChanged || minimapTickCounter >= MINIMAP_UPDATE_INTERVAL_TICKS;
        ws._minimapTickCounter = minimapCadenceDue ? 0 : minimapTickCounter;
        const shouldSendMinimap = minimapChanged && minimapCadenceDue;
        const shouldSendTopLeader = topChanged || shouldSendMinimap;

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

function writeChestCoinSeedBatch(pw, events) {
    const countPos = pw.reserveU16();
    let count = 0;
    const limit = Math.min(65535, events.length);
    for (let i = 0; i < limit; i++) {
        const evt = events[i];
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
        pw.writeU8(p.id);
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

function finalizeWorldSnapshot(snapshot) {
    snapshot.topLeader = snapshot.leaderboard.length ? snapshot.leaderboard[0] : null;
    let hash = 2166136261;
    const minimapCount = Math.min(255, snapshot.alivePlayers.length);
    for (let i = 0; i < minimapCount; i++) {
        const p = snapshot.alivePlayers[i];
        snapshot.minimapPlayers.push(p);
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

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        const world = p.world || 'main';
        const snapshot = getOrCreateWorldSnapshot(snapshots, world);
        snapshot.players.push(p);
        if (!p.isAlive) continue;
        snapshot.alivePlayers.push(p);
        insertLeaderboardEntry(snapshot.leaderboard, p);
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
        let full = !prevSeen.has(seenKey);
        if (p._forceFullSync) full = true;

        if (full) {
            mask = 0x8000;
        } else {
            if (Math.abs(p.x - prev.x) > 1) mask |= 0x01;
            if (Math.abs(p.y - prev.y) > 1) mask |= 0x02;
            if (Math.abs(p.angle - prev.angle) > 0.01) mask |= 0x04;
            if (p.hp !== prev.hp) mask |= 0x08;
            if (p.maxHp !== prev.maxHp) mask |= 0x10;
            if (p.score !== prev.score) mask |= 0x20;
            if (p.weapon?.rank !== prev.weaponRank) mask |= 0x40;
            if (p.swingState !== prev.swingState) mask |= 0x80;
            if (p.hasWeapon !== prev.hasWeapon) mask |= 0x100;
            if (p.hasShield !== prev.hasShield) mask |= 0x200;
            if (p.isAlive !== prev.isAlive) mask |= 0x400;
            if (p.chatMessage !== prev.chatMessage) mask |= 0x800;
            if (p.username !== prev.username) mask |= 0x1000;
            if (p.accessoryId !== prev.accessoryId) mask |= 0x2000;
            if (p.isInvisible !== prev.isInvisible) mask |= 0x4000;
        }

        pw.writeU16(mask);
        if (mask & 0x8000) {
            const packedRadius = Math.max(1, Math.min(0x1FFF, Math.floor(p.radius || 1)));
            const packedRoleRadius = packedRadius | (getBotRoleSyncCode(p) << 13);
            pw.writeU16(p.x); pw.writeU16(p.y); pw.writeF32(p.angle);
            pw.writeU16(p.hp); pw.writeU16(p.maxHp); pw.writeU32(p.score);
            pw.writeU8(p.weapon?.rank || 1); pw.writeU8(p.swingState);
            pw.writeU8(p.hasShield ? 1 : 0); pw.writeU8(p.isAlive ? 1 : 0);
            pw.writeU8(p.hasWeapon ? 1 : 0); pw.writeU8(p.accessoryId || 0);
            pw.writeU8(p.isInvisible ? 1 : 0);
            pw.writeU16(packedRoleRadius);
            pw.writeStr(p.username); pw.writeStr(p.chatMessage);
        } else {
            if (mask & 0x01) pw.writeU16(p.x);
            if (mask & 0x02) pw.writeU16(p.y);
            if (mask & 0x04) pw.writeF32(p.angle);
            if (mask & 0x08) pw.writeU16(p.hp);
            if (mask & 0x10) pw.writeU16(p.maxHp);
            if (mask & 0x20) pw.writeU32(p.score);
            if (mask & 0x40) pw.writeU8(p.weapon?.rank || 1);
            if (mask & 0x80) pw.writeU8(p.swingState);
            if (mask & 0x100) pw.writeU8(p.hasWeapon ? 1 : 0);
            if (mask & 0x200) pw.writeU8(p.hasShield ? 1 : 0);
            if (mask & 0x400) pw.writeU8(p.isAlive ? 1 : 0);
            if (mask & 0x800) pw.writeStr(p.chatMessage);
            if (mask & 0x1000) pw.writeStr(p.username);
            if (mask & 0x2000) pw.writeU8(p.accessoryId || 0);
            if (mask & 0x4000) pw.writeU8(p.isInvisible ? 1 : 0);
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
        if (!full && (prev.x === undefined || prev.y === undefined || prev.angle === undefined || prev.type === undefined)) {
            full = true;
        }
        let mask = full ? 0x80 : 0;
        if (!full) {
            if (Math.abs(m.x - prev.x) > 1) mask |= 0x01;
            if (Math.abs(m.y - prev.y) > 1) mask |= 0x02;
            if (Math.abs(m.angle - prev.angle) > 0.01) mask |= 0x04;
            if (m.hp !== prev.hp) mask |= 0x08;
            if (m.maxHp !== prev.maxHp) mask |= 0x10;
            if (m.type !== prev.type) mask |= 0x20;
            if ((m.swingState || 0) !== (prev.swingState || 0)) mask |= 0x40;
        }
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(m.x); pw.writeU16(m.y); pw.writeF32(m.angle);
            pw.writeU16(m.hp); pw.writeU16(m.maxHp); pw.writeU8(m.type); pw.writeU8(m.swingState || 0);
            pw.writeU16(Math.max(1, Math.min(65535, Math.floor(m.radius || 1))));
        } else {
            if (mask & 0x01) pw.writeU16(m.x);
            if (mask & 0x02) pw.writeU16(m.y);
            if (mask & 0x04) pw.writeF32(m.angle);
            if (mask & 0x08) pw.writeU16(m.hp);
            if (mask & 0x10) pw.writeU16(m.maxHp);
            if (mask & 0x20) pw.writeU8(m.type);
            if (mask & 0x40) pw.writeU8(m.swingState || 0);
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
            if (Math.abs(p.angle - prev.angle) > 0.01) mask |= 0x04;
            if (p.type !== prev.type) mask |= 0x08;
            if (p.weaponRank !== prev.weaponRank) mask |= 0x10;
            if ((p.renderLength || 0) !== (prev.renderLength || 0)) mask |= 0x20;
            if ((p.radius || 0) !== (prev.radius || 0)) mask |= 0x40;
        }
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(sendX); pw.writeU16(sendY); pw.writeF32(p.angle);
            pw.writeI8(p.type); pw.writeU8(p.weaponRank);
            pw.writeU16(Math.max(1, Math.min(65535, Math.round(p.radius || 1))));
            if (p.type === 10) pw.writeU16(p.renderLength || 0);
        } else {
            if (mask & 0x01) pw.writeU16(sendX);
            if (mask & 0x02) pw.writeU16(sendY);
            if (mask & 0x04) pw.writeF32(p.angle);
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

export function saveHistory() {
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
        p._forceFullSync = false;
    }
    for (const id in ENTITIES.MOBS) {
        const m = ENTITIES.MOBS[id];
        if (!m) continue;
        const prev = m.prev || (m.prev = {});
        prev.x = m.x; prev.y = m.y; prev.angle = m.angle; prev.hp = m.hp; prev.maxHp = m.maxHp; prev.type = m.type; prev.swingState = m.swingState || 0;
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
}
