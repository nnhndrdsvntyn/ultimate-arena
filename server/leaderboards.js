import express from 'express';
import { RTDB_BASE_URL } from './auth/service.js';

export const LEADERBOARD_SCOPES = ['daily', 'weekly', 'monthly'];
const LEADERBOARD_LIMIT = 10;
const FLUSH_DEBOUNCE_MS = 5000;
const ACCOUNT_LEADERBOARD_PACKET_TYPE = 36;

const leaderboardState = new Map(LEADERBOARD_SCOPES.map((scope) => [scope, {
    loaded: false,
    loadingPromise: null,
    periodKey: '',
    lastResetAt: 0,
    entries: [],
    active: new Map(),
    flushTimer: null
}]));

function getScopeUrl(scope) {
    return `${RTDB_BASE_URL}/leaderboard/${scope}.json`;
}

function startOfUtcDay(now) {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function getWeekStartUtc(now) {
    const d = new Date(now);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff);
}

function getMonthStartUtc(now) {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function getPeriodInfo(scope, now = Date.now()) {
    if (scope === 'daily') {
        const startedAt = startOfUtcDay(now);
        return { periodKey: new Date(startedAt).toISOString().slice(0, 10), startedAt };
    }
    if (scope === 'weekly') {
        const startedAt = getWeekStartUtc(now);
        return { periodKey: `week-${startedAt}`, startedAt };
    }
    const startedAt = getMonthStartUtc(now);
    const d = new Date(startedAt);
    return { periodKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, startedAt };
}

async function fetchScopeRecord(scope) {
    const response = await fetch(getScopeUrl(scope));
    if (!response.ok) {
        throw new Error(`Failed to fetch leaderboard ${scope}: ${response.status}`);
    }
    return await response.json();
}

async function writeScopeRecord(scope, payload) {
    const response = await fetch(getScopeUrl(scope), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error(`Failed to write leaderboard ${scope}: ${response.status}`);
    }
}

function normalizeEntry(raw) {
    if (!raw) return null;
    const key = String(raw.key || '').trim();
    const username = String(raw.username || '').trim();
    const score = Math.max(0, Math.floor(Number(raw.score) || 0));
    if (!key || !username || score <= 0) return null;
    return {
        key,
        username,
        score,
        isBot: !!raw.isBot,
        accountUsername: raw.accountUsername ? String(raw.accountUsername) : '',
        recordedAt: Math.max(0, Math.floor(Number(raw.recordedAt) || Date.now()))
    };
}

function getPlayerIdentity(player) {
    return {
        username: String(player?.username || '').trim() || (player?.isBot ? 'Bot' : 'Player'),
        key: String(player?.sessionLeaderboardKey || `${player?.isBot ? 'bot' : 'player'}:${player?.id || 0}`),
        currentScore: Math.max(0, Math.floor(Number(player?.score) || 0)),
        isBot: !!player?.isBot,
        accountUsername: player?.accountUsername ? String(player.accountUsername) : ''
    };
}

function getCombinedTopEntries(scopeState) {
    const merged = new Map();
    for (let i = 0; i < scopeState.entries.length; i++) {
        const entry = normalizeEntry(scopeState.entries[i]);
        if (entry) merged.set(entry.key, entry);
    }
    for (const entry of scopeState.active.values()) {
        const normalized = normalizeEntry(entry);
        if (!normalized) continue;
        const existing = merged.get(normalized.key);
        if (!existing || normalized.score >= existing.score) {
            merged.set(normalized.key, normalized);
        }
    }
    return Array.from(merged.values())
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.recordedAt - b.recordedAt;
        })
        .slice(0, LEADERBOARD_LIMIT);
}

function scheduleScopeFlush(scope) {
    const scopeState = leaderboardState.get(scope);
    if (!scopeState) return;
    if (scopeState.flushTimer) return;
    scopeState.flushTimer = setTimeout(() => {
        scopeState.flushTimer = null;
        void flushScope(scope);
    }, FLUSH_DEBOUNCE_MS);
}

async function flushScope(scope) {
    const scopeState = leaderboardState.get(scope);
    if (!scopeState) return;
    await ensureScopeCurrent(scope);
    scopeState.entries = getCombinedTopEntries(scopeState);
    await writeScopeRecord(scope, {
        periodKey: scopeState.periodKey,
        lastResetAt: scopeState.lastResetAt,
        updatedAt: Date.now(),
        entries: scopeState.entries
    });
}

async function ensureScopeLoaded(scope) {
    const scopeState = leaderboardState.get(scope);
    if (!scopeState) throw new Error(`Unknown leaderboard scope: ${scope}`);
    if (scopeState.loaded) return scopeState;
    if (!scopeState.loadingPromise) {
        scopeState.loadingPromise = (async () => {
            const now = Date.now();
            const { periodKey, startedAt } = getPeriodInfo(scope, now);
            try {
                const remote = await fetchScopeRecord(scope);
                scopeState.periodKey = String(remote?.periodKey || '');
                scopeState.lastResetAt = Math.max(0, Math.floor(Number(remote?.lastResetAt) || 0));
                scopeState.entries = Array.isArray(remote?.entries)
                    ? remote.entries.map(normalizeEntry).filter(Boolean)
                    : [];
            } catch (error) {
                console.error(`Failed to load ${scope} leaderboard:`, error);
                scopeState.periodKey = '';
                scopeState.lastResetAt = 0;
                scopeState.entries = [];
            }

            if (scopeState.periodKey !== periodKey) {
                scopeState.periodKey = periodKey;
                scopeState.lastResetAt = startedAt;
                scopeState.entries = [];
                await writeScopeRecord(scope, {
                    periodKey,
                    lastResetAt: startedAt,
                    updatedAt: now,
                    entries: []
                });
            }

            scopeState.loaded = true;
            scopeState.loadingPromise = null;
            return scopeState;
        })();
    }
    return await scopeState.loadingPromise;
}

async function ensureScopeCurrent(scope, now = Date.now()) {
    const scopeState = await ensureScopeLoaded(scope);
    const { periodKey, startedAt } = getPeriodInfo(scope, now);
    if (scopeState.periodKey === periodKey) return scopeState;

    scopeState.periodKey = periodKey;
    scopeState.lastResetAt = startedAt;
    scopeState.entries = [];
    for (const entry of scopeState.active.values()) {
        entry.baselineScore = Math.max(0, Math.floor(Number(entry.currentScore) || 0));
        entry.score = 0;
        entry.recordedAt = now;
    }
    await writeScopeRecord(scope, {
        periodKey,
        lastResetAt: startedAt,
        updatedAt: now,
        entries: []
    });
    scheduleScopeFlush(scope);
    return scopeState;
}

function buildScopeActiveEntry(player, existingEntry = null, now = Date.now()) {
    const identity = getPlayerIdentity(player);
    const baselineScore = Math.max(0, Math.floor(Number(existingEntry?.baselineScore) || identity.currentScore));
    const previousBest = Math.max(0, Math.floor(Number(existingEntry?.score) || 0));
    return {
        ...identity,
        baselineScore,
        score: Math.max(previousBest, Math.max(0, identity.currentScore - baselineScore)),
        recordedAt: now
    };
}

function buildFinalLeaderboardEntry(player, existingEntry = null, now = Date.now()) {
    const activeEntry = buildScopeActiveEntry(player, existingEntry, now);
    return {
        key: activeEntry.key,
        username: activeEntry.username,
        score: activeEntry.score,
        isBot: activeEntry.isBot,
        accountUsername: activeEntry.accountUsername,
        recordedAt: activeEntry.recordedAt
    };
}

export async function observePlayerLeaderboardScore(player, now = Date.now()) {
    if (!player) return;
    const identity = getPlayerIdentity(player);
    for (let i = 0; i < LEADERBOARD_SCOPES.length; i++) {
        const scope = LEADERBOARD_SCOPES[i];
        const scopeState = await ensureScopeCurrent(scope, now);
        const existingEntry = scopeState.active.get(identity.key) || null;
        scopeState.active.set(identity.key, buildScopeActiveEntry(player, existingEntry, now));
        scheduleScopeFlush(scope);
    }
}

export async function finalizePlayerLeaderboardRun(player, now = Date.now()) {
    if (!player) return;
    const identity = getPlayerIdentity(player);
    for (let i = 0; i < LEADERBOARD_SCOPES.length; i++) {
        const scope = LEADERBOARD_SCOPES[i];
        const scopeState = await ensureScopeCurrent(scope, now);
        const existingActiveEntry = scopeState.active.get(identity.key) || null;
        const finalEntry = buildFinalLeaderboardEntry(player, existingActiveEntry, now);
        scopeState.active.delete(finalEntry.key);
        if (finalEntry.score > 0) {
            const existing = scopeState.entries.find((entry) => entry?.key === finalEntry.key);
            if (!existing || finalEntry.score >= existing.score) {
                scopeState.entries = getCombinedTopEntries({
                    entries: [...scopeState.entries, finalEntry],
                    active: scopeState.active
                });
            }
        }
        scheduleScopeFlush(scope);
    }
}

export async function getLeaderboardSnapshot(scope, now = Date.now()) {
    const scopeState = await ensureScopeCurrent(scope, now);
    return {
        scope,
        periodKey: scopeState.periodKey,
        lastResetAt: scopeState.lastResetAt,
        entries: getCombinedTopEntries(scopeState)
    };
}

export async function getAllLeaderboardSnapshots(now = Date.now()) {
    const payload = {};
    for (let i = 0; i < LEADERBOARD_SCOPES.length; i++) {
        const scope = LEADERBOARD_SCOPES[i];
        payload[scope] = await getLeaderboardSnapshot(scope, now);
    }
    return payload;
}

export async function buildAccountLeaderboardPacket(writer, now = Date.now()) {
    const payload = await getAllLeaderboardSnapshots(now);
    writer.reset();
    writer.writeU8(ACCOUNT_LEADERBOARD_PACKET_TYPE);
    for (let i = 0; i < LEADERBOARD_SCOPES.length; i++) {
        const scope = LEADERBOARD_SCOPES[i];
        const entries = Array.isArray(payload[scope]?.entries) ? payload[scope].entries : [];
        writer.writeU8(Math.min(255, entries.length));
        for (let j = 0; j < entries.length; j++) {
            const entry = entries[j];
            writer.writeU32(Math.max(0, Math.floor(Number(entry?.score) || 0)));
            writer.writeStr(String(entry?.username || 'Player'));
        }
    }
    return writer.getBuffer();
}

export function createLeaderboardRouter() {
    const router = express.Router();

    router.get('/', async (_req, res) => {
        try {
            res.json(await getAllLeaderboardSnapshots());
        } catch (error) {
            console.error('Failed to load leaderboards:', error);
            res.status(500).json({ ok: false, message: 'Unable to load leaderboards right now.' });
        }
    });

    router.get('/:scope', async (req, res) => {
        const scope = String(req.params.scope || '').toLowerCase();
        if (!LEADERBOARD_SCOPES.includes(scope)) {
            res.status(404).json({ ok: false, message: 'Leaderboard not found.' });
            return;
        }
        try {
            res.json(await getLeaderboardSnapshot(scope));
        } catch (error) {
            console.error(`Failed to load ${scope} leaderboard:`, error);
            res.status(500).json({ ok: false, message: 'Unable to load that leaderboard right now.' });
        }
    });

    return router;
}
