import { WebSocketServer } from 'ws';
import { getAccountAdminState, verifyAccountSessionToken } from './auth/service.js';

const PLAYER_WEBHOOK =
    'https://discord.com/api/webhooks/1487825085724229713/NosAeR3AauRKayWTSld6st-aujZGna-UnmsCEkNBzC9Iz5zZK9QPXzyZlFQ7w_DIKxnN';
const UNKNOWN_USERNAME = 'unkown';
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
});

function normalizeWorldName(worldId) {
    if (!worldId || worldId === 'main') return 'Main World';
    if (worldId.startsWith('tutorial')) return 'Tutorial World';
    return worldId;
}

function getDisplayUsername(value) {
    const username = typeof value === 'string' ? value.trim() : '';
    return username || UNKNOWN_USERNAME;
}

function compareEntries(a, b) {
    const usernameCompare = (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' });
    if (usernameCompare !== 0) return usernameCompare;
    return (a.id || 0) - (b.id || 0);
}

function formatTimestamp(timestamp = Date.now()) {
    return TIMESTAMP_FORMATTER.format(timestamp);
}

function formatDuration(startedAt, endedAt = Date.now()) {
    const elapsedMs = Math.max(0, endedAt - startedAt);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];

    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
}

function buildJoinPayload(timestamp, username, ip, device) {
    return {
        embeds: [
            {
                title: 'Player Joined',
                color: 0x2ecc71,
                description: `**Username:** ${getDisplayUsername(username)}\n**IP:** ${ip || 'unknown'}\n**Device:** ${device || 'Unknown Device'}`,
                footer: {
                    text: formatTimestamp(timestamp)
                }
            }
        ]
    };
}

function buildLeavePayload(timestamp, username, startedAt, ip, device) {
    return {
        embeds: [
            {
                title: 'Player Left',
                color: 0xe74c3c,
                description: `**Username:** ${getDisplayUsername(username)}\n**IP:** ${ip || 'unknown'}\n**Device:** ${device || 'Unknown Device'}\n**Playtime:** ${formatDuration(startedAt, timestamp)}`,
                footer: {
                    text: formatTimestamp(timestamp)
                }
            }
        ]
    };
}

async function createWebhookMessage(payload) {
    try {
        const res = await fetch(`${PLAYER_WEBHOOK}?wait=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error(`Player monitor webhook create failed: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        return typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
    } catch (error) {
        console.error('Failed to create player monitor webhook message:', error);
        return null;
    }
}

async function editWebhookMessage(id, payload) {
    if (!id) return null;

    try {
        const res = await fetch(`${PLAYER_WEBHOOK}/messages/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.status === 404) return null;
        if (!res.ok) {
            console.error(`Player monitor webhook edit failed for ${id}: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        return typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
    } catch (error) {
        console.error('Failed to edit player monitor webhook message:', error);
        return null;
    }
}

export function createPlayerMonitorServer({ adminKey, wsById, entities }) {
    const monitorWss = new WebSocketServer({ noServer: true });
    let lastSnapshot = new Map();
    const playerSessions = new Map();
    let webhookQueue = Promise.resolve();

    function getMonitorEntry(playerId) {
        const ws = wsById.get(playerId);
        const player = entities.PLAYERS[playerId];
        if (!ws || ws.readyState !== 1) return null;
        if (!player || player.isBot) return null;

        return {
            id: Number(playerId),
            username: getDisplayUsername(player.username),
            world: normalizeWorldName(player.world || ws.world || 'main'),
            ip: ws.ip || 'unknown',
            device: ws.device || 'Unknown Device'
        };
    }

    function buildSnapshotMap() {
        const snapshot = new Map();
        for (const [playerId] of wsById.entries()) {
            const entry = getMonitorEntry(playerId);
            if (!entry) continue;
            snapshot.set(entry.id, entry);
        }
        return snapshot;
    }

    function getSnapshotArray(snapshotMap = buildSnapshotMap()) {
        return [...snapshotMap.values()].sort(compareEntries);
    }

    function broadcast(payload) {
        const serialized = JSON.stringify(payload);
        for (const client of monitorWss.clients) {
            if (client.readyState !== 1 || !client.isMonitorAuthed) continue;
            client.send(serialized);
        }
    }

    function queueWebhookTask(task) {
        webhookQueue = webhookQueue.catch(() => {}).then(task);
        return webhookQueue;
    }

    function trackPlayerJoin(entry) {
        const now = Date.now();
        const existing = playerSessions.get(entry.id);
        if (existing) {
            existing.lastUsername = entry.username;
            existing.world = entry.world;
            return;
        }

        playerSessions.set(entry.id, {
            joinedAt: now,
            lastUsername: entry.username,
            world: entry.world,
            ip: entry.ip,
            device: entry.device,
            messageId: null
        });

        void queueWebhookTask(async () => {
            const session = playerSessions.get(entry.id);
            if (!session || session.messageId) return;
            const messageId = await createWebhookMessage(buildJoinPayload(session.joinedAt, session.lastUsername, session.ip, session.device));
            if (!messageId) return;
            const latest = playerSessions.get(entry.id);
            if (!latest) return;
            latest.messageId = messageId;
        });
    }

    function trackPlayerUpdate(entry, previousEntry) {
        const session = playerSessions.get(entry.id);
        if (!session) {
            trackPlayerJoin(entry);
            return;
        }

        const previousUsername = previousEntry?.username || session.lastUsername;
        session.lastUsername = entry.username;
        session.world = entry.world;
        session.ip = entry.ip;
        session.device = entry.device;

        if (previousUsername === entry.username) return;

        void queueWebhookTask(async () => {
            const latest = playerSessions.get(entry.id);
            if (!latest) return;

            const payload = buildJoinPayload(latest.joinedAt, latest.lastUsername, latest.ip, latest.device);
            if (!latest.messageId) {
                const messageId = await createWebhookMessage(payload);
                if (!messageId) return;
                const current = playerSessions.get(entry.id);
                if (!current) return;
                current.messageId = messageId;
                return;
            }

            const updatedId = await editWebhookMessage(latest.messageId, payload);
            if (!updatedId) {
                const replacementId = await createWebhookMessage(payload);
                if (!replacementId) return;
                const current = playerSessions.get(entry.id);
                if (!current) return;
                current.messageId = replacementId;
                return;
            }

            const current = playerSessions.get(entry.id);
            if (!current) return;
            current.messageId = updatedId;
        });
    }

    function trackPlayerLeave(id, previousEntry) {
        const session = playerSessions.get(id);
        if (!session) return;

        const leftAt = Date.now();
        const username = previousEntry?.username || session.lastUsername;
        const ip = previousEntry?.ip || session.ip;
        const device = previousEntry?.device || session.device;
        playerSessions.delete(id);

        void queueWebhookTask(async () => {
            await createWebhookMessage(buildLeavePayload(leftAt, username, session.joinedAt, ip, device));
        });
    }

    function refreshDiffs() {
        const nextSnapshot = buildSnapshotMap();
        const upserts = [];
        const removals = [];

        for (const [id, nextEntry] of nextSnapshot.entries()) {
            const prevEntry = lastSnapshot.get(id);
            if (!prevEntry) trackPlayerJoin(nextEntry);
            else trackPlayerUpdate(nextEntry, prevEntry);

            if (!prevEntry || prevEntry.username !== nextEntry.username || prevEntry.world !== nextEntry.world) {
                upserts.push(nextEntry);
            }
        }

        for (const id of lastSnapshot.keys()) {
            if (!nextSnapshot.has(id)) {
                removals.push(id);
                trackPlayerLeave(id, lastSnapshot.get(id));
            }
        }

        lastSnapshot = nextSnapshot;

        if (upserts.length === 0 && removals.length === 0) return;
        upserts.sort(compareEntries);
        removals.sort((a, b) => a - b);
        broadcast({
            type: 'delta',
            upserts,
            removals
        });
    }

    monitorWss.on('connection', (ws) => {
        ws.isMonitorAuthed = false;

        ws.on('message', async (rawData) => {
            if (ws.isMonitorAuthed) return;

            let payload = null;
            try {
                payload = JSON.parse(rawData.toString());
            } catch {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid monitor payload.' }));
                ws.close();
                return;
            }

            if (payload?.type !== 'auth') {
                ws.send(JSON.stringify({ type: 'error', message: 'Monitor auth is required.' }));
                ws.close();
                return;
            }

            const providedKey = typeof payload.key === 'string' ? payload.key.trim() : '';
            const providedToken = typeof payload.token === 'string' ? payload.token.trim() : '';

            let isAuthorized = false;
            if (providedKey && providedKey === adminKey) {
                isAuthorized = true;
            } else if (providedToken) {
                const session = verifyAccountSessionToken(providedToken);
                if (session) {
                    try {
                        const adminState = await getAccountAdminState(session.username);
                        isAuthorized = !!adminState?.ok && !!adminState?.isAdmin;
                    } catch (error) {
                        console.error(`Failed to verify monitor admin state for ${session.username}:`, error);
                    }
                }
            }

            if (!isAuthorized) {
                ws.send(JSON.stringify({ type: 'auth', ok: false }));
                ws.close();
                return;
            }

            ws.isMonitorAuthed = true;
            const snapshot = buildSnapshotMap();
            lastSnapshot = snapshot;
            ws.send(JSON.stringify({
                type: 'auth',
                ok: true,
                players: getSnapshotArray(snapshot)
            }));
        });
    });

    return {
        monitorWss,
        refreshDiffs
    };
}
