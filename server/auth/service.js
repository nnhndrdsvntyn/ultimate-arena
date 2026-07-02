import crypto from 'crypto';
import fs from 'fs';
import { adminKey } from '../constants.js';

export const RTDB_BASE_URL = 'https://ultimate-arena-accounts-default-rtdb.firebaseio.com';
const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_WHEEL_SPIN_LIMIT = 5;
const ACCOUNT_WHEEL_RESET_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_SESSION_SECRET_PATH = './profile_runtime/account_session_secret.txt';
const accountRecordLockTailByKey = new Map();

function loadPersistedAccountSessionSecret() {
    if (process.env.ACCOUNT_SESSION_SECRET) {
        return String(process.env.ACCOUNT_SESSION_SECRET);
    }

    try {
        if (fs.existsSync(ACCOUNT_SESSION_SECRET_PATH)) {
            const stored = String(fs.readFileSync(ACCOUNT_SESSION_SECRET_PATH, 'utf8') || '').trim();
            if (stored) return stored;
        }
    } catch (error) {
        console.error('Failed to read account session secret:', error);
    }

    const fallback = `ultimate-arena:${adminKey}:account-session:${crypto.randomBytes(32).toString('hex')}`;
    try {
        fs.mkdirSync('./profile_runtime', { recursive: true });
        fs.writeFileSync(ACCOUNT_SESSION_SECRET_PATH, fallback, 'utf8');
    } catch (error) {
        console.error('Failed to persist account session secret:', error);
    }
    return fallback;
}

const ACCOUNT_SESSION_SECRET = loadPersistedAccountSessionSecret();

function normalizeAccountUsername(username) {
    return String(username || '').trim();
}

function validateAccountUsername(username) {
    const normalized = normalizeAccountUsername(username);
    if (!normalized) return 'Enter a username first.';
    if (normalized.length > 15) return 'Usernames must be 15 characters or fewer.';
    if (/[\u0000-\u001F]/.test(normalized)) return 'That username contains invalid characters.';
    return '';
}

function validateAccountPassword(password) {
    const normalized = String(password || '');
    if (!normalized) return 'Enter a password first.';
    if (normalized.length < 5) return 'Passwords must be at least 5 characters long.';
    if (normalized.length > 20) return 'Passwords must be 20 characters or fewer.';
    if (!/[A-Za-z]/.test(normalized) || !/\d/.test(normalized)) {
        return 'Passwords must include at least one letter and one number.';
    }
    return '';
}

function getAccountKey(username) {
    return Buffer.from(normalizeAccountUsername(username).toLowerCase(), 'utf8').toString('base64url');
}

function buildAccountUrl(username) {
    return `${RTDB_BASE_URL}/players/${getAccountKey(username)}.json`;
}

function getAccountWheelResetAtSec(resetAtMs = 0) {
    return Math.max(0, Math.floor(Math.max(0, Number(resetAtMs) || 0) / 1000));
}

async function withAccountRecordLock(username, task) {
    const key = getAccountKey(username);
    const previousTail = accountRecordLockTailByKey.get(key) || Promise.resolve();
    let release;
    const nextTail = new Promise((resolve) => {
        release = resolve;
    });
    accountRecordLockTailByKey.set(key, previousTail.then(() => nextTail));
    await previousTail;
    try {
        return await task();
    } finally {
        release?.();
        if (accountRecordLockTailByKey.get(key) === nextTail) {
            accountRecordLockTailByKey.delete(key);
        }
    }
}

function normalizeWheelState(record, now = Date.now()) {
    const safeNow = Math.max(0, Math.floor(Number(now) || 0));
    let wheelSpinsRemaining = Math.max(0, Math.min(ACCOUNT_WHEEL_SPIN_LIMIT, Math.floor(Number(record?.wheelSpinsRemaining) || 0)));
    let wheelSpinsResetAt = Math.max(0, Math.floor(Number(record?.wheelSpinsResetAt) || 0));
    let changed = false;

    if (!Number.isFinite(Number(record?.wheelSpinsRemaining))) {
        wheelSpinsRemaining = ACCOUNT_WHEEL_SPIN_LIMIT;
        changed = true;
    }

    if (wheelSpinsRemaining <= 0 && wheelSpinsResetAt <= 0) {
        wheelSpinsRemaining = ACCOUNT_WHEEL_SPIN_LIMIT;
        changed = true;
    }

    if (wheelSpinsResetAt > 0 && wheelSpinsResetAt <= safeNow) {
        wheelSpinsRemaining = ACCOUNT_WHEEL_SPIN_LIMIT;
        wheelSpinsResetAt = 0;
        changed = true;
    } else if (wheelSpinsRemaining > ACCOUNT_WHEEL_SPIN_LIMIT) {
        wheelSpinsRemaining = ACCOUNT_WHEEL_SPIN_LIMIT;
        changed = true;
    }

    return {
        wheelSpinsRemaining,
        wheelSpinsResetAt,
        changed
    };
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

async function getAccountRecord(username) {
    const response = await fetch(buildAccountUrl(username));
    if (!response.ok) {
        throw new Error(`Account lookup failed with status ${response.status}`);
    }
    return await readJsonResponse(response);
}

async function patchAccountRecord(username, payload) {
    const response = await fetch(buildAccountUrl(username), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error(`Account patch failed with status ${response.status}`);
    }
}

function signTokenPayload(payloadBase64) {
    return crypto.createHmac('sha256', ACCOUNT_SESSION_SECRET).update(payloadBase64).digest('base64url');
}

export function createAccountSessionToken(username) {
    const payload = {
        username: normalizeAccountUsername(username),
        exp: Date.now() + ACCOUNT_SESSION_TTL_MS
    };
    const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${payloadBase64}.${signTokenPayload(payloadBase64)}`;
}

export function verifyAccountSessionToken(token) {
    const rawToken = String(token || '').trim();
    if (!rawToken) return null;

    const parts = rawToken.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSignature = signTokenPayload(payloadBase64);
    if (signature !== expectedSignature) return null;

    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    } catch (error) {
        return null;
    }

    if (!payload || typeof payload.username !== 'string' || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= Date.now()) return null;

    const usernameError = validateAccountUsername(payload.username);
    if (usernameError) return null;

    return {
        username: normalizeAccountUsername(payload.username),
        exp: payload.exp
    };
}

export async function getAccountAdminState(username) {
    const normalizedUsername = normalizeAccountUsername(username);
    if (!normalizedUsername) return { ok: false, status: 400, isAdmin: false };
    const record = await getAccountRecord(normalizedUsername);
    if (!record?.username) {
        return { ok: false, status: 404, isAdmin: false };
    }
    return {
        ok: true,
        status: 200,
        username: String(record.username || normalizedUsername),
        isAdmin: !!record.isAdmin
    };
}

export async function getAccountProfile(username) {
    const normalizedUsername = normalizeAccountUsername(username);
    if (!normalizedUsername) return { ok: false, status: 400 };
    const record = await getAccountRecord(normalizedUsername);
    if (!record?.username) {
        return { ok: false, status: 404 };
    }
    const wheelState = normalizeWheelState(record);
    return {
        ok: true,
        status: 200,
        username: String(record.username || normalizedUsername),
        isAdmin: !!record.isAdmin,
        playTime: Math.max(0, Math.floor(Number(record.playTime) || 0)),
        totalPlayerKills: Math.max(0, Math.floor(Number(record.totalPlayerKills) || 0)),
        totalDeaths: Math.max(0, Math.floor(Number(record.totalDeaths) || 0)),
        wheelSpinsRemaining: wheelState.wheelSpinsRemaining,
        wheelSpinsResetAtSec: getAccountWheelResetAtSec(wheelState.wheelSpinsResetAt)
    };
}

export async function getAccountWheelState(username) {
    const normalizedUsername = normalizeAccountUsername(username);
    if (!normalizedUsername) return { ok: false, status: 400 };

    return await withAccountRecordLock(normalizedUsername, async () => {
        const record = await getAccountRecord(normalizedUsername);
        if (!record?.username) {
            return { ok: false, status: 404 };
        }

        const wheelState = normalizeWheelState(record);
        if (wheelState.changed) {
            await patchAccountRecord(normalizedUsername, {
                wheelSpinsRemaining: wheelState.wheelSpinsRemaining,
                wheelSpinsResetAt: wheelState.wheelSpinsResetAt
            });
        }

        return {
            ok: true,
            status: 200,
            username: String(record.username || normalizedUsername),
            wheelSpinsRemaining: wheelState.wheelSpinsRemaining,
            wheelSpinsResetAtSec: getAccountWheelResetAtSec(wheelState.wheelSpinsResetAt)
        };
    });
}

export async function consumeAccountWheelSpin(username) {
    const normalizedUsername = normalizeAccountUsername(username);
    if (!normalizedUsername) {
        return { ok: false, status: 400, message: 'Log in first to spin the prize wheel.' };
    }

    return await withAccountRecordLock(normalizedUsername, async () => {
        const record = await getAccountRecord(normalizedUsername);
        if (!record?.username) {
            return { ok: false, status: 404, message: 'That account does not exist.' };
        }

        const wheelState = normalizeWheelState(record);
        let wheelSpinsResetAt = wheelState.wheelSpinsResetAt;
        let wheelSpinsRemaining = wheelState.wheelSpinsRemaining;
        if (wheelSpinsResetAt <= 0) {
            wheelSpinsRemaining = ACCOUNT_WHEEL_SPIN_LIMIT;
            wheelSpinsResetAt = Math.max(0, Math.floor(Date.now())) + ACCOUNT_WHEEL_RESET_WINDOW_MS;
        }
        if (wheelState.wheelSpinsRemaining <= 0) {
            return {
                ok: false,
                status: 429,
                message: 'You are out of prize wheel spins for now. Please wait until the reset timer ends.'
            };
        }

        const nextWheelSpinsRemaining = Math.max(0, wheelSpinsRemaining - 1);
        await patchAccountRecord(normalizedUsername, {
            wheelSpinsRemaining: nextWheelSpinsRemaining,
            wheelSpinsResetAt
        });

        return {
            ok: true,
            status: 200,
            username: String(record.username || normalizedUsername),
            wheelSpinsRemaining: nextWheelSpinsRemaining,
            wheelSpinsResetAtSec: getAccountWheelResetAtSec(wheelSpinsResetAt)
        };
    });
}

export async function setAccountAdminState(username, isAdmin) {
    const normalizedUsername = normalizeAccountUsername(username);
    if (!normalizedUsername) return { ok: false, status: 400, message: 'Enter an account username first.' };

    const currentRecord = await getAccountRecord(normalizedUsername);
    if (!currentRecord?.username) {
        return { ok: false, status: 404, message: 'That account does not exist.' };
    }

    await patchAccountRecord(normalizedUsername, { isAdmin: !!isAdmin });

    return {
        ok: true,
        status: 200,
        username: String(currentRecord.username || normalizedUsername),
        isAdmin: !!isAdmin,
        message: `${String(currentRecord.username || normalizedUsername)} is now an admin account.`
    };
}

export async function registerAccount(username, password) {
    const normalizedUsername = normalizeAccountUsername(username);
    const usernameError = validateAccountUsername(normalizedUsername);
    if (usernameError) {
        return { ok: false, status: 400, message: usernameError };
    }

    const passwordError = validateAccountPassword(password);
    if (passwordError) {
        return { ok: false, status: 400, message: passwordError };
    }

    const existingRecord = await getAccountRecord(normalizedUsername);
    if (existingRecord?.username) {
        return { ok: false, status: 409, message: 'That username is already in use.' };
    }

    const record = {
        username: normalizedUsername,
        password: String(password),
        isAdmin: false,
        playTime: 0,
        totalPlayerKills: 0,
        totalDeaths: 0,
        wheelSpinsRemaining: ACCOUNT_WHEEL_SPIN_LIMIT,
        wheelSpinsResetAt: 0,
        createdAt: Date.now()
    };

    const response = await fetch(buildAccountUrl(normalizedUsername), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
    });

    if (!response.ok) {
        throw new Error(`Account registration failed with status ${response.status}`);
    }

    return {
        ok: true,
        status: 200,
        username: normalizedUsername,
        isAdmin: false,
        token: createAccountSessionToken(normalizedUsername),
        message: 'Logged in successfully!'
    };
}

export async function loginAccount(username, password) {
    const normalizedUsername = normalizeAccountUsername(username);
    const usernameError = validateAccountUsername(normalizedUsername);
    if (usernameError) {
        return { ok: false, status: 400, message: usernameError };
    }

    const passwordError = validateAccountPassword(password);
    if (passwordError) {
        return { ok: false, status: 400, message: passwordError };
    }

    const record = await getAccountRecord(normalizedUsername);
    if (!record || record.password !== String(password)) {
        return { ok: false, status: 401, message: 'Invalid username or password!' };
    }

    return {
        ok: true,
        status: 200,
        username: String(record.username || normalizedUsername),
        isAdmin: !!record.isAdmin,
        token: createAccountSessionToken(String(record.username || normalizedUsername)),
        message: 'You are now logged in.'
    };
}

export async function updateAccountSessionStats(username, { playTimeDelta = 0, totalPlayerKillsDelta = 0, totalDeathsDelta = 0 } = {}) {
    const normalizedUsername = normalizeAccountUsername(username);
    if (!normalizedUsername) return { ok: false, status: 400 };

    const safePlayTimeDelta = Math.max(0, Math.floor(Number(playTimeDelta) || 0));
    const safeKillDelta = Math.max(0, Math.floor(Number(totalPlayerKillsDelta) || 0));
    const safeDeathDelta = Math.max(0, Math.floor(Number(totalDeathsDelta) || 0));
    if (safePlayTimeDelta <= 0 && safeKillDelta <= 0 && safeDeathDelta <= 0) {
        return { ok: true, status: 200 };
    }

    const currentRecord = await getAccountRecord(normalizedUsername);
    if (!currentRecord?.username) {
        return { ok: false, status: 404 };
    }

    const nextPayload = {
        playTime: Math.max(0, Math.floor(Number(currentRecord.playTime) || 0) + safePlayTimeDelta),
        totalPlayerKills: Math.max(0, Math.floor(Number(currentRecord.totalPlayerKills) || 0) + safeKillDelta),
        totalDeaths: Math.max(0, Math.floor(Number(currentRecord.totalDeaths) || 0) + safeDeathDelta)
    };

    await patchAccountRecord(normalizedUsername, nextPayload);

    return { ok: true, status: 200 };
}
