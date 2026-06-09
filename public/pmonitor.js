import { getStoredAdminKey } from './admin_key.js';
import { getStoredAccountAuthToken } from './auth/client_auth.js';

const statusEl = document.getElementById('monitor_status');
const summaryEl = document.getElementById('monitor_summary');
const bodyEl = document.getElementById('monitor_body');
const reconnectBtn = document.getElementById('monitor_reconnect');

const playersById = new Map();
let monitorSocket = null;
let reconnectTimer = 0;

function setStatus(text, tone = 'connecting') {
    statusEl.textContent = text;
    statusEl.className = `monitor_status ${tone}`;
}

function updateSummary() {
    const count = playersById.size;
    summaryEl.textContent = `${count} player${count === 1 ? '' : 's'} online`;
}

function getSortedPlayers() {
    return [...playersById.values()].sort((a, b) => {
        const nameCompare = (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' });
        if (nameCompare !== 0) return nameCompare;
        return (a.id || 0) - (b.id || 0);
    });
}

function render() {
    const rows = getSortedPlayers();
    bodyEl.innerHTML = '';

    if (rows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.className = 'monitor_empty';
        td.textContent = 'No online players to monitor right now.';
        tr.appendChild(td);
        bodyEl.appendChild(tr);
        updateSummary();
        return;
    }

    for (const player of rows) {
        const tr = document.createElement('tr');
        const usernameTd = document.createElement('td');
        const worldTd = document.createElement('td');
        usernameTd.textContent = player.username;
        worldTd.textContent = player.world;
        tr.appendChild(usernameTd);
        tr.appendChild(worldTd);
        bodyEl.appendChild(tr);
    }

    updateSummary();
}

function applySnapshot(players) {
    playersById.clear();
    for (const player of players || []) {
        if (!player || !Number.isFinite(player.id)) continue;
        playersById.set(player.id, player);
    }
    render();
}

function applyDelta(payload) {
    for (const player of payload.upserts || []) {
        if (!player || !Number.isFinite(player.id)) continue;
        playersById.set(player.id, player);
    }

    for (const id of payload.removals || []) {
        playersById.delete(id);
    }

    render();
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        connect();
    }, 2000);
}

function connect() {
    if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = 0;
    }

    if (monitorSocket && (monitorSocket.readyState === WebSocket.OPEN || monitorSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const accountToken = getStoredAccountAuthToken();
    const adminKey = getStoredAdminKey();
    if (!accountToken && !adminKey) {
        setStatus('Missing admin auth', 'error');
        summaryEl.textContent = 'Open /pmonitor from a logged-in admin account or after entering the admin key in-game.';
        return;
    }

    const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${wsProtocol}${location.host}/monitor`;
    setStatus('Connecting...', 'connecting');
    summaryEl.textContent = 'Authenticating with monitor socket';

    monitorSocket = new WebSocket(wsUrl);

    monitorSocket.addEventListener('open', () => {
        monitorSocket.send(JSON.stringify({
            type: 'auth',
            key: adminKey,
            token: accountToken
        }));
    });

    monitorSocket.addEventListener('message', (event) => {
        let payload = null;
        try {
            payload = JSON.parse(event.data);
        } catch {
            return;
        }

        if (payload.type === 'auth') {
            if (!payload.ok) {
                monitorSocket._authFailed = true;
                setStatus('Authentication failed', 'error');
                summaryEl.textContent = 'Your saved admin auth was rejected by the server.';
                return;
            }
            setStatus('Connected', 'connected');
            applySnapshot(payload.players || []);
            return;
        }

        if (payload.type === 'delta') {
            applyDelta(payload);
            return;
        }

        if (payload.type === 'error') {
            setStatus('Monitor error', 'error');
            summaryEl.textContent = payload.message || 'The monitor socket returned an error.';
        }
    });

    monitorSocket.addEventListener('close', () => {
        const hadPlayers = playersById.size > 0;
        const authFailed = !!monitorSocket?._authFailed;
        setStatus('Disconnected', 'error');
        summaryEl.textContent = authFailed
            ? 'Reconnect after refreshing your admin auth from the game client.'
            : (hadPlayers
                ? 'Connection lost. Trying again...'
                : 'Connection lost before a snapshot arrived. Trying again...');
        if (!authFailed) {
            scheduleReconnect();
        }
    });

    monitorSocket.addEventListener('error', () => {
        setStatus('Connection error', 'error');
    });
}

reconnectBtn.addEventListener('click', () => {
    if (monitorSocket) {
        try {
            monitorSocket.close();
        } catch {
            // Ignore.
        }
        monitorSocket = null;
    }
    connect();
});

connect();
