import express from 'express';
import {
    WebSocketServer
} from 'ws';

import {
    parsePacket
} from './server/parser.js';
import {
    getId, PacketWriter
} from './server/helpers.js';
import {
    deadMobs, brokenObjects, ENTITIES, spawnObject
} from './server/game.js';
import { MAP_SIZE } from './server/game.js';

import http from 'http';
const app = express();
const PORT = 3000;

app.use(express.static('public'));

const httpserver = http.createServer(app);

httpserver.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// WebSocket setup
export const wss = new WebSocketServer({
    server: httpserver
});

const ipTracker = new Map();

wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    // console.log('Client connected from IP:', ip);

    ws.packetWriter = new PacketWriter(4096); // Pre-allocated buffer for this client

    ws.kick = (msg) => {
        const pw = ws.packetWriter;
        pw.reset();
        pw.writeU8(8);
        pw.writeStr(msg);
        ws.send(pw.getBuffer());
        ws.close();
    }

    // IP connection limiting (max 3)
    const currentIps = ipTracker.get(ip) || 0;
    if (currentIps >= 3) {
        ws.kick('Too many connections from this IP.');
        return;
    }
    ipTracker.set(ip, currentIps + 1);
    ws.ip = ip;

    if (ENTITIES.playerIds.size + 1 > 50) { // max players is 50
        ws.kick('Server is full.');
        return;
    }
    let newId = getId('PLAYERS');
    while (ENTITIES.PLAYERS[newId]) {
        newId = getId('PLAYERS');
    }
    ws.id = newId;
    ws.lastPacketTime = performance.now();
    ws.seenEntities = new Set();

    ws.send(ws.id);

    ENTITIES.playerIds.add(ws.id);

    // console.log('Client connected with id:', ws.id);

    ENTITIES.newEntity({
        entityType: 'player',
        id: ws.id,
        x: MAP_SIZE[0] / 2,
        y: MAP_SIZE[1] / 2,
        angle: 0,
    });
    if (ENTITIES.PLAYERS[ws.id]) ENTITIES.PLAYERS[ws.id].isAlive = false;

    ws.on('message', (data) => {
        try {
            parsePacket(data, ws);
        } catch (e) {
            ws.kick("Do not modify your client.");
        }
    });

    ws.on('close', () => {
        // console.log('Client disconnected with id:', ws.id);
        const currentIps = ipTracker.get(ws.ip) || 1;
        if (currentIps <= 1) {
            ipTracker.delete(ws.ip);
        } else {
            ipTracker.set(ws.ip, currentIps - 1);
        }
        ENTITIES.deleteEntity('player', ws.id);
    });
});

const lbWriter = new PacketWriter();

// main update loop
function update() {
    // don't process anything if there are no players
    if (ENTITIES.playerIds.size === 0) {
        return;
    }

    // process players
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        player.process();
    }

    let unprocessedEntityCount = 0;
    // process mobs
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        // check if this mob is too far away from any player, if yes, then don't process it
        let tooFar = true;
        for (const playerId in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[playerId];
            if (player.x - mob.x < 1500 && player.y - mob.y < 1500) {
                tooFar = false;
                break;
            }
        }
        if (tooFar) {
            unprocessedEntityCount++;
            continue;
        }

        // if passed all checks, process it
        mob.process();
    }
    // process projectiles
    for (const id in ENTITIES.PROJECTILES) {
        const projectile = ENTITIES.PROJECTILES[id];
        projectile.process();
    }

    // handle structure collisions if they are within range of a player
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        let tooFar = true;
        for (const playerId in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[playerId];
            if (player.x - structure.x < 700 && player.y - structure.y < 700) {
                tooFar = false;
                break;
            }
        }
        if (tooFar) {
            unprocessedEntityCount++;
            continue;
        }
        structure.resolveCollisions();
    }

    // process objects if they are within range of a player
    for (const id in ENTITIES.OBJECTS) {
        const object = ENTITIES.OBJECTS[id];
        let tooFar = true;
        for (const playerId in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[playerId];
            if (player.x - object.x < 700 && player.y - object.y < 700) {
                tooFar = false;
                break;
            }
        }
        if (tooFar) {
            unprocessedEntityCount++;
            continue;
        }
        object.process();
    }

    // respawn all mobs that have been dead for more than 3 seconds.
    for (const id in deadMobs) {
        const mob = deadMobs[id];
        if (performance.now() - mob.lastDiedTime > 3000) {
            ENTITIES.newEntity({
                entityType: 'mob',
                id: mob.id,
                x: Math.floor(Math.random() * MAP_SIZE[0]),
                y: Math.floor(Math.random() * MAP_SIZE[1]),
                type: mob.type,
            });
            delete deadMobs[mob.id];
        }
    }

    // respawn all objects that have been dead for more than 3 seconds.
    for (const id in brokenObjects) {
        const object = brokenObjects[id];
        if (performance.now() - object.timeBroken > 3000) {
            spawnObject(object.type);
            delete brokenObjects[object.id];
        }
    }

    // Build leaderboard ONCE per tick (reused for all clients)
    const leaderboard = [];
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (p.isAlive) leaderboard.push(p);
    }
    leaderboard.sort((a, b) => Number(b.score) - Number(a.score));
    if (leaderboard.length > 10) leaderboard.length = 10;

    // Pre-build leaderboard packet data (reused for all clients who need it)
    let leaderboardPacket = null;

    // send updates
    wss.clients.forEach(ws => {
        // CHECK IF ITS CLOSED, AND CONTINUE IF IT IS
        if (ws.readyState !== WebSocket.OPEN) return;

        // kick inactive clients
        if (performance.now() - ws.lastPacketTime > 60000) {
            ws.kick('Kicked for inactivity.');
            return;
        }

        const localPlayer = ENTITIES.PLAYERS[ws.id] || { x: MAP_SIZE[0] / 2, y: MAP_SIZE[1] / 2 };
        let renderDistance = 1000;
        if (!localPlayer.isAlive) renderDistance /= 0.7;
        const renderDistanceSq = renderDistance * renderDistance;
        const lpX = localPlayer.x;
        const lpY = localPlayer.y;

        const pw = ws.packetWriter;
        if (!pw) return;
        pw.reset();

        // Packet type
        pw.writeU8(2);

        // Track entities in this update to manage seenEntities
        const entitiesInUpdate = new Set();
        const fullUpdate = (id) => !ws.seenEntities.has(id);

        // --- PLAYERS ---
        const playerCountPos = pw.reserveU8();
        let playerCount = 0;

        // Combine local player + others for uniform processing
        const visiblePlayers = [];
        if (localPlayer.isAlive || (!localPlayer.isAlive && ENTITIES.PLAYERS[ws.id])) {
            visiblePlayers.push(localPlayer);
        }
        for (const id in ENTITIES.PLAYERS) {
            const p = ENTITIES.PLAYERS[id];
            if (p.id === ws.id) continue;
            const dx = p.x - lpX;
            const dy = p.y - lpY;
            if (dx * dx + dy * dy <= renderDistanceSq) visiblePlayers.push(p);
        }

        for (const p of visiblePlayers) {
            pw.writeU32(p.id);
            entitiesInUpdate.add(p.id);

            let mask = 0;
            const prev = p.prev || {};
            const isFull = fullUpdate(p.id);

            // Calculate Mask
            if (isFull) {
                mask = 0x8000; // Full Update Bit (Bit 15)
            } else {
                if (Math.abs(p.x - prev.x) > 1) mask |= 0x01;        // X
                if (Math.abs(p.y - prev.y) > 1) mask |= 0x02;        // Y
                if (Math.abs(p.angle - prev.angle) > 0.01) mask |= 0x04; // Angle
                if (p.hp !== prev.hp) mask |= 0x08;                  // HP
                if (p.maxHp !== prev.maxHp) mask |= 0x10;            // MaxHP
                if (p.score !== prev.score) mask |= 0x20;            // Score
                if (p.level !== prev.level) mask |= 0x40;            // Level
                if (p.swingState !== prev.swingState) mask |= 0x80;  // SwingState
                if (p.hasWeapon !== prev.hasWeapon) mask |= 0x100;   // HasWeapon
                if (p.hasShield !== prev.hasShield) mask |= 0x200;   // HasShield
                if (p.isAlive !== prev.isAlive) mask |= 0x400;       // IsAlive
                if (p.chatMessage !== prev.chatMessage) mask |= 0x800; // Chat
                if (p.username !== prev.username) mask |= 0x1000;      // Username

                if (mask === 0 && !isFull) {
                    mask = 0; // No changes
                }
            }

            pw.writeU16(mask);

            if (mask & 0x8000) { // Full
                pw.writeU16(p.x);
                pw.writeU16(p.y);
                pw.writeF32(p.angle);
                pw.writeU16(p.hp);
                pw.writeU16(p.maxHp);
                pw.writeU32(p.score);
                pw.writeU8(p.level);
                pw.writeU8(p.swingState);
                pw.writeU8(p.hasShield ? 1 : 0);
                pw.writeU8(p.isAlive ? 1 : 0);
                pw.writeU8(p.hasWeapon ? 1 : 0);
                pw.writeStr(p.username);
                pw.writeStr(p.chatMessage);
            } else {
                if (mask & 0x01) pw.writeU16(p.x);
                if (mask & 0x02) pw.writeU16(p.y);
                if (mask & 0x04) pw.writeF32(p.angle);
                if (mask & 0x08) pw.writeU16(p.hp);
                if (mask & 0x10) pw.writeU16(p.maxHp);
                if (mask & 0x20) pw.writeU32(p.score);
                if (mask & 0x40) pw.writeU8(p.level);
                if (mask & 0x80) pw.writeU8(p.swingState);
                if (mask & 0x100) pw.writeU8(p.hasWeapon ? 1 : 0);
                if (mask & 0x200) pw.writeU8(p.hasShield ? 1 : 0);
                if (mask & 0x400) pw.writeU8(p.isAlive ? 1 : 0);
                if (mask & 0x800) pw.writeStr(p.chatMessage);
                if (mask & 0x1000) pw.writeStr(p.username);
            }
            playerCount++;
        }
        pw.writeU8At(playerCountPos, playerCount);

        // --- MOBS ---
        const mobCountPos = pw.reserveU16();
        let mobCount = 0;
        for (const id in ENTITIES.MOBS) {
            const m = ENTITIES.MOBS[id];
            const dx = m.x - lpX;
            const dy = m.y - lpY;
            if (dx * dx + dy * dy <= renderDistanceSq) {
                pw.writeU32(m.id);
                entitiesInUpdate.add(m.id);

                let mask = 0;
                const prev = m.prev || {};
                const isFull = fullUpdate(m.id);

                if (isFull) mask = 0x80;
                else {
                    if (Math.abs(m.x - prev.x) > 1) mask |= 0x01;
                    if (Math.abs(m.y - prev.y) > 1) mask |= 0x02;
                    if (Math.abs(m.angle - prev.angle) > 0.01) mask |= 0x04;
                    if (m.hp !== prev.hp) mask |= 0x08;
                    if (m.maxHp !== prev.maxHp) mask |= 0x10;
                    if (m.type !== prev.type) mask |= 0x20;
                }

                pw.writeU8(mask);

                if (mask & 0x80) {
                    pw.writeU16(m.x);
                    pw.writeU16(m.y);
                    pw.writeF32(m.angle);
                    pw.writeU16(m.hp);
                    pw.writeU16(m.maxHp);
                    pw.writeU8(m.type);
                } else {
                    if (mask & 0x01) pw.writeU16(m.x);
                    if (mask & 0x02) pw.writeU16(m.y);
                    if (mask & 0x04) pw.writeF32(m.angle);
                    if (mask & 0x08) pw.writeU16(m.hp);
                    if (mask & 0x10) pw.writeU16(m.maxHp);
                    if (mask & 0x20) pw.writeU8(m.type);
                }
                mobCount++;
            }
        }
        pw.writeU16At(mobCountPos, mobCount);

        // --- PROJECTILES ---
        const projCountPos = pw.reserveU16();
        let projCount = 0;
        for (const id in ENTITIES.PROJECTILES) {
            const p = ENTITIES.PROJECTILES[id];
            const dx = p.x - lpX;
            const dy = p.y - lpY;
            if (dx * dx + dy * dy <= renderDistanceSq) {
                pw.writeU32(p.id);
                entitiesInUpdate.add(p.id);

                let mask = 0;
                const prev = p.prev || {};
                const isFull = fullUpdate(p.id);

                if (isFull) mask = 0x80;
                else {
                    if (Math.abs(p.x - prev.x) > 1) mask |= 0x01;
                    if (Math.abs(p.y - prev.y) > 1) mask |= 0x02;
                    if (Math.abs(p.angle - prev.angle) > 0.01) mask |= 0x04;
                    if (p.type !== prev.type) mask |= 0x08;
                    if (p.level !== prev.level) mask |= 0x10;
                }

                pw.writeU8(mask);

                if (mask & 0x80) {
                    pw.writeU16(p.x);
                    pw.writeU16(p.y);
                    pw.writeF32(p.angle);
                    pw.writeI8(p.type);
                    pw.writeU8(p.level);
                } else {
                    if (mask & 0x01) pw.writeU16(p.x);
                    if (mask & 0x02) pw.writeU16(p.y);
                    if (mask & 0x04) pw.writeF32(p.angle);
                    if (mask & 0x08) pw.writeI8(p.type);
                    if (mask & 0x10) pw.writeU8(p.level);
                }

                projCount++;
            }
        }
        pw.writeU16At(projCountPos, projCount);

        // --- OBJECTS ---
        const objCountPos = pw.reserveU16();
        let objCount = 0;
        for (const id in ENTITIES.OBJECTS) {
            const o = ENTITIES.OBJECTS[id];
            const dx = o.x - lpX;
            const dy = o.y - lpY;
            if (dx * dx + dy * dy <= renderDistanceSq) {
                pw.writeU32(o.id);
                entitiesInUpdate.add(o.id);

                let mask = 0;
                const prev = o.prev || {};
                const isFull = fullUpdate(o.id);

                if (isFull) mask = 0x80;
                else {
                    if (Math.abs(o.x - prev.x) > 1) mask |= 0x01;
                    if (Math.abs(o.y - prev.y) > 1) mask |= 0x02;
                    if (o.health !== prev.health) mask |= 0x04;
                    if (o.type !== prev.type) mask |= 0x08;
                }

                pw.writeU8(mask);

                if (mask & 0x80) {
                    pw.writeU16(o.x);
                    pw.writeU16(o.y);
                    pw.writeI8(o.type);
                    pw.writeU16(o.health);
                } else {
                    if (mask & 0x01) pw.writeU16(o.x);
                    if (mask & 0x02) pw.writeU16(o.y);
                    if (mask & 0x04) pw.writeU16(o.health);
                    if (mask & 0x08) pw.writeI8(o.type);
                }
                objCount++;
            }
        }
        pw.writeU16At(objCountPos, objCount);

        // Update seenEntities for next tick
        ws.seenEntities = entitiesInUpdate;


        // Send update packet
        if (playerCount > 0 || mobCount > 0 || projCount > 0 || objCount > 0) {
            ws.send(pw.getBuffer());
        }

        // Check if we should send leaderboard
        let shouldSendLeaderboard = false;
        if (ENTITIES.PLAYERS[ws.id]) {
            ENTITIES.PLAYERS[ws.id].updateCount++;
            if (ENTITIES.PLAYERS[ws.id].updateCount >= TPS.server * 1.5 || ENTITIES.PLAYERS[ws.id].updateCount === -1) {
                ENTITIES.PLAYERS[ws.id].updateCount = 0;
                shouldSendLeaderboard = true;
            }
        } else {
            if (!ws.leaderboardUpdateCount) ws.leaderboardUpdateCount = 0;
            ws.leaderboardUpdateCount++;
            if (ws.leaderboardUpdateCount >= TPS.server * 1.5) {
                ws.leaderboardUpdateCount = 0;
                shouldSendLeaderboard = true;
            }
        }

        if (shouldSendLeaderboard) {
            // Build leaderboard packet once, reuse for all clients
            if (!leaderboardPacket) {
                lbWriter.reset();
                lbWriter.writeU8(5);
                lbWriter.writeU8(leaderboard.length);
                for (let i = 0; i < leaderboard.length; i++) {
                    const player = leaderboard[i];
                    lbWriter.writeU32(player.id);
                    lbWriter.writeU32(player.score);
                    lbWriter.writeStr(player.username);
                }
                leaderboardPacket = lbWriter.getBuffer();
            }
            ws.send(leaderboardPacket);
        }
    });
}

import {
    TPS
} from './public/shared/datamap.js';

function saveHistory() {
    for (const p of Object.values(ENTITIES.PLAYERS)) {
        p.prev = {
            x: p.x, y: p.y, angle: p.angle,
            hp: p.hp, maxHp: p.maxHp, isAlive: p.isAlive,
            score: p.score, level: p.level,
            swingState: p.swingState, hasWeapon: p.hasWeapon, hasShield: p.hasShield,

            chatMessage: p.chatMessage, username: p.username
        };
    }
    for (const m of Object.values(ENTITIES.MOBS)) {
        m.prev = { x: m.x, y: m.y, angle: m.angle, hp: m.hp, maxHp: m.maxHp };
    }
    for (const p of Object.values(ENTITIES.PROJECTILES)) {
        p.prev = { x: p.x, y: p.y, angle: p.angle };
    }
    for (const o of Object.values(ENTITIES.OBJECTS)) {
        o.prev = { x: o.x, y: o.y, health: o.health };
    }
}

setInterval(() => {
    update();
    saveHistory();
}, 1000 / TPS.server);