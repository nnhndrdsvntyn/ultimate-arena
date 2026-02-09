import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { parsePacket } from './server/parser.js';
import { getId, PacketWriter } from './server/helpers.js';
import { ENTITIES, MAP_SIZE } from './server/game.js';
import { dataMap } from './public/shared/datamap.js';
import { TPS } from './public/shared/datamap.js';
import { sendUpdates, saveHistory, sendPlayerCount } from './server/network.js';
import { updateGame } from './server/loop.js';

const app = express();
const PORT = 3000;
const ipTracker = new Map();

// --- Express & Static Hosting ---
app.use(express.static('public', { maxAge: 1000 * 60 * 60, immutable: true }));
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));

// --- WebSocket Management ---
export const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const currentIps = ipTracker.get(ip) || 0;

    if (currentIps >= 3) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nToo many connections from this IP.');
        socket.destroy();
        return;
    }

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
    if (currentIps >= 3) return ws.kick('Too many connections from this IP.');
    if (ENTITIES.playerIds.size >= 50) return ws.kick('Server is full.');

    ipTracker.set(ip, currentIps + 1);
    ws.ip = ip;
    ws.id = getId('PLAYERS');
    ws.lastPacketTime = performance.now();
    ws.seenEntities = new Set();

    ENTITIES.playerIds.add(ws.id);
    ws.send(ws.id.toString());

    // Initialize non-alive player entity
    ENTITIES.newEntity({
        entityType: 'player',
        id: ws.id,
        x: MAP_SIZE[0] / 2,
        y: MAP_SIZE[1] / 2,
        angle: 0
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
        const count = ipTracker.get(ws.ip) || 1;
        if (count <= 1) ipTracker.delete(ws.ip);
        else ipTracker.set(ws.ip, count - 1);
        ENTITIES.deleteEntity('player', ws.id);
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
    });
});

// --- Master Loop ---
const lbWriter = new PacketWriter();
const countWriter = new PacketWriter(16);

setInterval(() => {
    updateGame();
    sendUpdates(wss, lbWriter);
    saveHistory();
}, 1000 / TPS.server);

setInterval(() => {
    sendPlayerCount(wss, countWriter);
}, 1000);
