import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { parsePacket } from './server/parser.js';
import { getId, PacketWriter } from './server/helpers.js';
import { ENTITIES, MAP_SIZE, deadMobs, brokenObjects } from './server/game.js';
import { dataMap } from './public/shared/datamap.js';
import { TPS } from './public/shared/datamap.js';
import { sendUpdates, saveHistory, sendPlayerCount } from './server/network.js';
import { updateGame } from './server/loop.js';
import { spawnBotPlayers, updateBotPlayers } from './server/bots.js';
import { startHunterDebugInterval } from './server/debug.js';

const app = express();
const PORT = 3000;
const ipTracker = new Map();

// --- Express & Static Hosting ---
app.use(express.static('public', { maxAge: 1000 * 60 * 60, immutable: true }));
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));

// --- WebSocket Management ---
export const wss = new WebSocketServer({ noServer: true });
export const wsById = new Map();

server.on('upgrade', (req, socket, head) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    if (ENTITIES.playerIds.size >= 50) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: 5\r\n\r\nServer is full.');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    ws.requestedWorld = requestUrl.searchParams.get('world');
    ws.packetWriter = new PacketWriter(4096);

    ws.kick = (msg) => {
        ws.packetWriter.reset();
        ws.packetWriter.writeU8(8);
        ws.packetWriter.writeStr(msg);
        ws.send(ws.packetWriter.getBuffer());
        ws.close();
    };

    // Connection Limiting
    const currentIps = ipTracker.get(ip) || 0;
    if (currentIps >= 3) return ws.kick('You cannot have more than 3 connections on one IP!');
    if (ENTITIES.playerIds.size >= 50) return ws.kick('Server is full.');

    ipTracker.set(ip, currentIps + 1);
    ws.ip = ip;
    ws.id = getId('PLAYERS');
    ws.world = ws.requestedWorld === 'main' ? 'main' : `tutorial-${ws.id}`;
    ws.lastPacketTime = performance.now();
    ws.seenEntities = new Set();

    ENTITIES.playerIds.add(ws.id);
    wsById.set(ws.id, ws);
    ws.send(ws.id.toString());

    // Initialize non-alive player entity
    ENTITIES.newEntity({
        entityType: 'player',
        id: ws.id,
        x: MAP_SIZE[0] / 2,
        y: MAP_SIZE[1] / 2,
        angle: 0,
        world: ws.world
    });
    if (ENTITIES.PLAYERS[ws.id]) ENTITIES.PLAYERS[ws.id].isAlive = false;

    ws.on('message', (data) => {
        try {
            parsePacket(data, ws);
        } catch (e) {
            console.error(`Packet error from ${ws.id}:`, e);
            ws.kick("Do not modify your client.");
        }
    });

    ws.on('close', () => {
        const world = ws.world || 'main';
        const disconnectedId = ws.id;
        wsById.delete(ws.id);
        const count = ipTracker.get(ws.ip) || 1;
        if (count <= 1) ipTracker.delete(ws.ip);
        else ipTracker.set(ws.ip, count - 1);
        ENTITIES.deleteEntity('player', ws.id);
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player || !player.isBot) continue;
            if (player._botHunterTargetId === disconnectedId) player._botHunterTargetId = 0;
            if (player._botAssistTargetId === disconnectedId) player._botAssistTargetId = 0;
            if (player.lastDamager?.id === disconnectedId) player.lastDamager = null;
            player._botKillTargetCooldowns?.delete(disconnectedId);
        }
        for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            if (mob?.target?.id === ws.id) {
                mob.isAlarmed = false;
                mob.target = null;
                mob.alarmReason = null;
                mob.lastHitById = null;
                mob.speed = dataMap.MOBS[mob.type].speed;
            }
        }

        // Tutorial instances are single-player and should be fully reset when empty.
        if (world.startsWith('tutorial')) {
            const hasPlayersInWorld = Object.values(ENTITIES.PLAYERS).some(p => (p.world || 'main') === world);
            if (!hasPlayersInWorld) {
                for (const id in ENTITIES.MOBS) {
                    if ((ENTITIES.MOBS[id].world || 'main') === world) delete ENTITIES.MOBS[id];
                }
                for (const id in ENTITIES.STRUCTURES) {
                    if ((ENTITIES.STRUCTURES[id].world || 'main') === world) delete ENTITIES.STRUCTURES[id];
                }
                for (const id in ENTITIES.OBJECTS) {
                    if ((ENTITIES.OBJECTS[id].world || 'main') === world) delete ENTITIES.OBJECTS[id];
                }
                for (const id in ENTITIES.PROJECTILES) {
                    if ((ENTITIES.PROJECTILES[id].world || 'main') === world) delete ENTITIES.PROJECTILES[id];
                }
                for (const id in deadMobs) {
                    if ((deadMobs[id].world || 'main') === world) delete deadMobs[id];
                }
                for (const id in brokenObjects) {
                    if ((brokenObjects[id].world || 'main') === world) delete brokenObjects[id];
                }
            }
        }
    });
});

// --- Master Loop ---
const lbWriter = new PacketWriter();
const countWriter = new PacketWriter(16);

spawnBotPlayers(15);
startHunterDebugInterval();

setInterval(() => {
    const now = performance.now();
    updateGame(now);
    updateBotPlayers(now);
    sendUpdates(wss, lbWriter, now);
    saveHistory();
}, 1000 / TPS.server);

setInterval(() => {
    sendPlayerCount(wss, countWriter);
}, 1000);
