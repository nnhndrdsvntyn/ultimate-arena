import {
    ENTITIES
} from './game.js';
import {
    TPS
} from '../public/shared/datamap.js';

/**
 * Builds and sends updates for all connected clients.
 */
export function sendUpdates(wss, lbWriter) {
    const leaderboard = getLeaderboard();
    let leaderboardPacket = null;

    wss.clients.forEach(ws => {
        if (ws.readyState !== 1) return; // WebSocket.OPEN

        // Kick inactive
        if (performance.now() - (ws.lastPacketTime || 0) > 300000) { // 5 mins
            ws.kick('Kicked for inactivity.');
            return;
        }

        const localPlayer = ENTITIES.PLAYERS[ws.id] || { x: 0, y: 0 };
        const baseRange = localPlayer.isAlive ? 1000 : (1000 / 0.7);
        const viewRangeMult = localPlayer.viewRangeMult || ws.viewRangeMult || 1;
        const renderDistanceSq = (baseRange * viewRangeMult) ** 2;
        const lpX = localPlayer.x;
        const lpY = localPlayer.y;

        const pw = ws.packetWriter;
        if (!pw) return;
        pw.reset();
        pw.writeU8(2); // Packet Type: Update

        const entitiesInUpdate = new Set();
        const isFull = (type, id) => !ws.seenEntities.has(type + id);

        writePlayers(pw, ws, lpX, lpY, renderDistanceSq, isFull, entitiesInUpdate);
        writeMobs(pw, lpX, lpY, renderDistanceSq, isFull, entitiesInUpdate);
        writeProjectiles(pw, lpX, lpY, renderDistanceSq, isFull, entitiesInUpdate);
        writeObjects(pw, lpX, lpY, renderDistanceSq, isFull, entitiesInUpdate);

        ws.seenEntities = entitiesInUpdate;

        if (pw.getBuffer().byteLength > 1) {
            ws.send(pw.getBuffer());
        }

        // Handle Leaderboard
        if (shouldSendLeaderboard(ws)) {
            if (!leaderboardPacket) {
                leaderboardPacket = buildLeaderboardPacket(lbWriter, leaderboard);
            }
            ws.send(leaderboardPacket);
        }
    });
}

function getLeaderboard() {
    const lb = Object.values(ENTITIES.PLAYERS)
        .filter(p => p.isAlive)
        .sort((a, b) => b.score - a.score);
    if (lb.length > 10) lb.length = 10;
    return lb;
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

function writePlayers(pw, ws, lpX, lpY, rangeSq, isFullFn, entities) {
    const countPos = pw.reserveU8();
    let count = 0;

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        const dx = p.x - lpX;
        const dy = p.y - lpY;
        if (p.id !== ws.id && dx * dx + dy * dy > rangeSq) continue;

        entities.add('p' + p.id);
        pw.writeU8(p.id);

        let mask = 0;
        const prev = p.prev || {};
        const full = isFullFn('p', p.id);

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
        }

        pw.writeU16(mask);
        if (mask & 0x8000) {
            pw.writeU16(p.x); pw.writeU16(p.y); pw.writeF32(p.angle);
            pw.writeU16(p.hp); pw.writeU16(p.maxHp); pw.writeU32(p.score);
            pw.writeU8(p.weapon?.rank || 1); pw.writeU8(p.swingState);
            pw.writeU8(p.hasShield ? 1 : 0); pw.writeU8(p.isAlive ? 1 : 0);
            pw.writeU8(p.hasWeapon ? 1 : 0); pw.writeStr(p.username); pw.writeStr(p.chatMessage);
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
        }
        count++;
    }
    pw.writeU8At(countPos, count);
}

function writeMobs(pw, lpX, lpY, rangeSq, isFullFn, entities) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (const id in ENTITIES.MOBS) {
        const m = ENTITIES.MOBS[id];
        const dx = m.x - lpX; const dy = m.y - lpY;
        if (dx * dx + dy * dy > rangeSq) continue;

        entities.add('m' + m.id);
        pw.writeU16(m.id);
        const full = isFullFn('m', m.id);
        const prev = m.prev || {};
        let mask = full ? 0x80 : 0;
        if (!full) {
            if (Math.abs(m.x - prev.x) > 1) mask |= 0x01;
            if (Math.abs(m.y - prev.y) > 1) mask |= 0x02;
            if (Math.abs(m.angle - prev.angle) > 0.01) mask |= 0x04;
            if (m.hp !== prev.hp) mask |= 0x08;
            if (m.maxHp !== prev.maxHp) mask |= 0x10;
            if (m.type !== prev.type) mask |= 0x20;
        }
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(m.x); pw.writeU16(m.y); pw.writeF32(m.angle);
            pw.writeU16(m.hp); pw.writeU16(m.maxHp); pw.writeU8(m.type);
        } else {
            if (mask & 0x01) pw.writeU16(m.x);
            if (mask & 0x02) pw.writeU16(m.y);
            if (mask & 0x04) pw.writeF32(m.angle);
            if (mask & 0x08) pw.writeU16(m.hp);
            if (mask & 0x10) pw.writeU16(m.maxHp);
            if (mask & 0x20) pw.writeU8(m.type);
        }
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeProjectiles(pw, lpX, lpY, rangeSq, isFullFn, entities) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (const id in ENTITIES.PROJECTILES) {
        const p = ENTITIES.PROJECTILES[id];
        const dx = p.x - lpX; const dy = p.y - lpY;
        if (dx * dx + dy * dy > rangeSq) continue;

        entities.add('j' + p.id);
        pw.writeU16(p.id);
        const full = isFullFn('j', p.id);
        const prev = p.prev || {};
        let mask = full ? 0x80 : 0;
        if (!full) {
            if (Math.abs(p.x - prev.x) > 1) mask |= 0x01;
            if (Math.abs(p.y - prev.y) > 1) mask |= 0x02;
            if (Math.abs(p.angle - prev.angle) > 0.01) mask |= 0x04;
            if (p.type !== prev.type) mask |= 0x08;
            if (p.weaponRank !== prev.weaponRank) mask |= 0x10;
        }
        pw.writeU8(mask);
        if (mask & 0x80) {
            pw.writeU16(p.x); pw.writeU16(p.y); pw.writeF32(p.angle);
            pw.writeI8(p.type); pw.writeU8(p.weaponRank);
        } else {
            if (mask & 0x01) pw.writeU16(p.x);
            if (mask & 0x02) pw.writeU16(p.y);
            if (mask & 0x04) pw.writeF32(p.angle);
            if (mask & 0x08) pw.writeI8(p.type);
            if (mask & 0x10) pw.writeU8(p.weaponRank);
        }
        count++;
    }
    pw.writeU16At(countPos, count);
}

function writeObjects(pw, lpX, lpY, rangeSq, isFullFn, entities) {
    const countPos = pw.reserveU16();
    let count = 0;
    for (const id in ENTITIES.OBJECTS) {
        const o = ENTITIES.OBJECTS[id];
        const dx = o.x - lpX; const dy = o.y - lpY;
        if (dx * dx + dy * dy > rangeSq) continue;

        entities.add('o' + o.id);
        pw.writeU16(o.id);
        const full = isFullFn('o', o.id);
        const prev = o.prev || {};
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
    for (const p of Object.values(ENTITIES.PLAYERS)) {
        p.prev = {
            x: p.x, y: p.y, angle: p.angle, hp: p.hp, maxHp: p.maxHp,
            isAlive: p.isAlive, score: p.score, weaponRank: p.weapon?.rank,
            swingState: p.swingState, hasWeapon: p.hasWeapon,
            hasShield: p.hasShield, chatMessage: p.chatMessage, username: p.username
        };
    }
    for (const m of Object.values(ENTITIES.MOBS)) {
        m.prev = { x: m.x, y: m.y, angle: m.angle, hp: m.hp, maxHp: m.maxHp, type: m.type };
    }
    for (const p of Object.values(ENTITIES.PROJECTILES)) {
        p.prev = { x: p.x, y: p.y, angle: p.angle, type: p.type, weaponRank: p.weaponRank };
    }
    for (const o of Object.values(ENTITIES.OBJECTS)) {
        o.prev = { x: o.x, y: o.y, health: o.health, type: o.type, amount: o.amount };
    }
}
