import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { parsePacket } from './server/parser.js';
import { getId, PacketWriter } from './server/helpers.js';
import { ENTITIES, MAP_SIZE, deleteWorldState } from './server/game.js';
import { dataMap } from './public/shared/datamap.js';
import { TPS } from './public/shared/datamap.js';
import { sendUpdates, saveHistory, sendPlayerCount } from './server/network.js';
import { updateGame } from './server/loop.js';
import { spawnBotPlayers, BOT_POPULATION_TARGET } from './server/bots.js';
import { startHunterDebugInterval } from './server/debug.js';
import { clearWorldCaches } from './server/helpers.js';
import { adminKey } from './server/constants.js';
import { createPlayerMonitorServer } from './server/pmonitor.js';
import { createAuthRouter } from './server/auth/router.js';
import { updateAccountSessionStats } from './server/auth/service.js';
import { buildAccountLeaderboardPacket, createLeaderboardRouter, finalizePlayerLeaderboardRun } from './server/leaderboards.js';

const app = express();
const PORT = 3000;
const ipTracker = new Map();
const ipRapidAttemptState = new Map();
const ipAttemptHistory = new Map();
const ipBlockedUntil = new Map();
const ipLastAcceptedConnectionAt = new Map();
const ipNextQueuedAcceptAt = new Map();
const ANTIBOT_WEBHOOK =
    'https://discord.com/api/webhooks/1488648807188005067/kpA1aj5Z0q4dzAtuINsB4INRrnU3wxlsUQDkA7qWjh7tL7V4ZhCRkYB5ywt2H2KSwDKa';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONNECTION_ATTEMPT_WINDOW_MS = 60 * 1000;
const RAPID_ATTEMPT_GAP_MS = 2 * 1000;
const RAPID_ATTEMPT_STREAK_LIMIT = 10;
const ATTEMPT_WINDOW_LIMIT = 10;
const CONNECTION_SPACING_MS = 3 * 1000;
const CONNECTION_BLOCK_DURATION_MS = 60 * 1000;

function isLocalDevIp(ip) {
    return ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1' ||
        ip === 'localhost';
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

function getClientDevice(req) {
    const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
    if (!userAgent) return 'Unknown Device';
    if (
        userAgent.includes('mobile') ||
        userAgent.includes('android') ||
        userAgent.includes('iphone') ||
        userAgent.includes('ipad')
    ) {
        return 'Mobile';
    }
    return 'PC';
}

function isIpBlocked(ip, now = Date.now()) {
    if (isLocalDevIp(ip)) return false;
    const blockedUntil = ipBlockedUntil.get(ip);
    if (!blockedUntil) return false;
    if (blockedUntil <= now) {
        ipBlockedUntil.delete(ip);
        return false;
    }
    return true;
}

function getIpBlockRemainingSeconds(ip, now = Date.now()) {
    const blockedUntil = ipBlockedUntil.get(ip);
    if (!blockedUntil || blockedUntil <= now) return 0;
    return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
}

function rejectSocketWithBlock(socket, retryAfter) {
    if (!socket || socket.destroyed || !Number.isFinite(retryAfter) || retryAfter <= 0) return;
    socket.write(`HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: ${retryAfter}\r\n\r\nToo many connection attempts. Try again in ${retryAfter} seconds.`);
    socket.destroy();
}

async function sendAntibotWebhook(ip, eventCount, trigger) {
    const payload = {
        embeds: [
            {
                title: 'Antibot Triggered',
                color: 0xf39c12,
                fields: [
                    { name: 'IP', value: ip || 'unknown', inline: false },
                    { name: 'Action', value: 'Temporary connection block', inline: false },
                    { name: 'Duration', value: `${Math.floor(CONNECTION_BLOCK_DURATION_MS / 1000)} seconds`, inline: true },
                    { name: 'Rapid Attempts In 60s', value: String(eventCount), inline: true },
                    { name: 'Triggered By', value: trigger, inline: true },
                    { name: 'Time', value: new Date().toLocaleString(), inline: false }
                ]
            }
        ]
    };

    try {
        const res = await fetch(ANTIBOT_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error(`Antibot webhook failed: ${res.status} ${res.statusText}`);
        }
    } catch (error) {
        console.error('Failed to send antibot webhook:', error);
    }
}

function recordIpConnectionAttempt(ip, label) {
    if (isLocalDevIp(ip)) return;
    const now = Date.now();
    const previousAttempts = ipAttemptHistory.get(ip) || [];
    const attempts = previousAttempts.filter(ts => now - ts <= CONNECTION_ATTEMPT_WINDOW_MS);
    attempts.push(now);
    ipAttemptHistory.set(ip, attempts);

    const previous = ipRapidAttemptState.get(ip);
    let rapidAttemptStreak = 1;
    let streakStartedAt = now;

    if (previous) {
        const withinRapidGap = now - previous.lastAttemptAt < RAPID_ATTEMPT_GAP_MS;
        const withinWindow = now - previous.streakStartedAt <= CONNECTION_ATTEMPT_WINDOW_MS;

        if (withinRapidGap && withinWindow) {
            rapidAttemptStreak = previous.count + 1;
            streakStartedAt = previous.streakStartedAt;
        }
    }

    ipRapidAttemptState.set(ip, {
        count: rapidAttemptStreak,
        streakStartedAt,
        lastAttemptAt: now
    });

    const shouldBlockForWindow = attempts.length >= ATTEMPT_WINDOW_LIMIT;
    const shouldBlockForRapidStreak = rapidAttemptStreak >= RAPID_ATTEMPT_STREAK_LIMIT;

    if (shouldBlockForWindow || shouldBlockForRapidStreak) {
        const existingBlockedUntil = ipBlockedUntil.get(ip) || 0;
        const blockedUntil = now + CONNECTION_BLOCK_DURATION_MS;
        ipBlockedUntil.set(ip, blockedUntil);

        if (existingBlockedUntil <= now) {
            const trigger = shouldBlockForWindow ? `${label}:minute-window` : `${label}:rapid-streak`;
            const eventCount = shouldBlockForWindow ? attempts.length : rapidAttemptStreak;
            void sendAntibotWebhook(ip, eventCount, trigger);
        }
    }
}

function getConnectionDelayMs(ip, now = Date.now()) {
    if (isLocalDevIp(ip)) return 0;
    const queuedAcceptAt = ipNextQueuedAcceptAt.get(ip) || 0;
    const lastAcceptedAt = ipLastAcceptedConnectionAt.get(ip) || 0;
    const baseline = Math.max(queuedAcceptAt, lastAcceptedAt);
    const elapsed = now - baseline;
    return Math.max(0, CONNECTION_SPACING_MS - elapsed);
}

function markAcceptedConnection(ip, now = Date.now()) {
    if (isLocalDevIp(ip)) return;
    ipLastAcceptedConnectionAt.set(ip, now);
    const queuedAcceptAt = ipNextQueuedAcceptAt.get(ip) || 0;
    if (queuedAcceptAt <= now) {
        ipNextQueuedAcceptAt.delete(ip);
    }
}

function getRealPlayerCount() {
    let count = 0;
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (p && !p.isBot) count++;
    }
    return count;
}

// --- Express & Static Hosting ---
app.use(express.json());
app.use(express.static('public', {
    maxAge: 0,
    immutable: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
    }
}));
app.use('/api/auth', createAuthRouter({ getClientIp }));
app.use('/leaderboard', createLeaderboardRouter());
app.get('/pmonitor', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pmonitor.html'));
});
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin key: ${adminKey}`);
});

// --- WebSocket Management ---
export const wss = new WebSocketServer({ noServer: true });
export const wsById = new Map();
const { monitorWss, refreshDiffs: refreshMonitorDiffs } = createPlayerMonitorServer({
    adminKey,
    wsById,
    entities: ENTITIES
});

async function sendAccountLeaderboards(ws) {
    if (!ws || ws.readyState !== 1) return;
    try {
        const writer = new PacketWriter(2048);
        ws.send(await buildAccountLeaderboardPacket(writer, Date.now()));
    } catch (error) {
        console.error(`Failed to send account leaderboards to ${ws?.id ?? 'unknown'}:`, error);
    }
}

server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    if (requestUrl.pathname === '/monitor') {
        monitorWss.handleUpgrade(req, socket, head, (ws) => {
            monitorWss.emit('connection', ws, req);
        });
        return;
    }

    const ip = getClientIp(req);
    const now = Date.now();
    recordIpConnectionAttempt(ip, 'upgrade');

    if (isIpBlocked(ip, now)) {
        const retryAfter = getIpBlockRemainingSeconds(ip, now);
        rejectSocketWithBlock(socket, retryAfter);
        return;
    }

    const currentIps = ipTracker.get(ip) || 0;
    if (currentIps >= 3) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: 5\r\n\r\nYou cannot have more than 3 connections on one IP.');
        socket.destroy();
        return;
    }

    if (getRealPlayerCount() >= 50) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: 5\r\n\r\nServer is full.');
        socket.destroy();
        return;
    }

    const completeUpgrade = () => {
        if (socket.destroyed) return;

        const checkNow = Date.now();
        if (isIpBlocked(ip, checkNow)) {
            const retryAfter = getIpBlockRemainingSeconds(ip, checkNow);
            rejectSocketWithBlock(socket, retryAfter);
            return;
        }

        const latestCurrentIps = ipTracker.get(ip) || 0;
        if (latestCurrentIps >= 3) {
            socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: 5\r\n\r\nYou cannot have more than 3 connections on one IP.');
            socket.destroy();
            return;
        }

        if (getRealPlayerCount() >= 50) {
            socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: 5\r\n\r\nServer is full.');
            socket.destroy();
            return;
        }

        markAcceptedConnection(ip, checkNow);
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    };

    const delayMs = getConnectionDelayMs(ip, now);
    if (delayMs > 0) {
        const currentQueuedAcceptAt = ipNextQueuedAcceptAt.get(ip) || 0;
        if (currentQueuedAcceptAt <= now) {
            ipNextQueuedAcceptAt.set(ip, now + delayMs);
        }
        const retryAfter = Math.max(1, Math.ceil(delayMs / 1000));
        socket.write(`HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nConnection: close\r\nRetry-After: ${retryAfter}\r\n\r\nConnection throttled. Try again in ${retryAfter} seconds.`);
        socket.destroy();
        return;
    }

    completeUpgrade();
});

wss.on('connection', (ws, req) => {
    const ip = getClientIp(req);
    const device = getClientDevice(req);
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
    if (getRealPlayerCount() >= 50) return ws.kick('Server is full.');

    ipTracker.set(ip, currentIps + 1);
    ws.ip = ip;
    ws.device = device;
    ws.id = getId('PLAYERS');
    ws.world = 'main';
    ws.lastPacketTime = performance.now();
    ws.connectedAt = Date.now();
    ws.seenEntities = new Set();
    ws.wantsLeaderboard = true;
    ws.wantsMinimap = true;
    ws._leaderboardDirty = true;
    ws.accountUsername = null;
    ws.accountPlayStartedAt = 0;
    ws.isAdmin = false;

    ENTITIES.playerIds.add(ws.id);
    wsById.set(ws.id, ws);
    ws.send(ws.id.toString());
    void sendAccountLeaderboards(ws);

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
        const disconnectedPlayer = ENTITIES.PLAYERS[ws.id] || null;
        wsById.delete(ws.id);
        const count = ipTracker.get(ws.ip) || 1;
        if (count <= 1) ipTracker.delete(ws.ip);
        else ipTracker.set(ws.ip, count - 1);
        if (disconnectedPlayer) {
            void finalizePlayerLeaderboardRun(disconnectedPlayer, Date.now());
            if (ws.accountUsername && ws.accountPlayStartedAt > 0) {
                const playTimeDelta = Math.max(0, Math.floor((Date.now() - ws.accountPlayStartedAt) / 1000));
                const totalPlayerKillsDelta = Math.max(0, Math.floor(disconnectedPlayer.sessionPlayerKills || 0));
                const totalDeathsDelta = Math.max(0, Math.floor(disconnectedPlayer.sessionDeaths || 0));
                void updateAccountSessionStats(ws.accountUsername, {
                    playTimeDelta,
                    totalPlayerKillsDelta,
                    totalDeathsDelta
                }).catch((error) => {
                    console.error(`Failed to update account stats for ${ws.accountUsername}:`, error);
                });
            }
        }
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

        // Tutorial instances are single-player; delete the world on disconnect.
        if (world.startsWith('tutorial')) {
            deleteWorldState(world);
            clearWorldCaches(world);
        }
    });
});

// --- Master Loop ---
const lbWriter = new PacketWriter();
const countWriter = new PacketWriter(16);

spawnBotPlayers(BOT_POPULATION_TARGET);
startHunterDebugInterval();

setInterval(() => {
    const now = performance.now();
    updateGame(now);
    sendUpdates(wss, lbWriter, now);
    saveHistory();
}, 1000 / TPS.server);

setInterval(() => {
    sendPlayerCount(wss, countWriter);
}, 1000);

setInterval(() => {
    refreshMonitorDiffs();
}, 250);
