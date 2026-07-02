import express from 'express';
import { loginAccount, registerAccount } from './service.js';
import { isServerStartupGracePeriodActive } from '../constants.js';
import { isAccountConnected } from '../account_sessions.js';

const ACCOUNT_CREATION_LIMIT = 3;
const ACCOUNT_CREATION_WINDOW_MS = 5 * 60 * 1000;
const accountCreationHistoryByIp = new Map();
const ACCOUNT_CREATION_LIMIT_MESSAGE = 'Sorry, we can’t create another account right now because too many accounts were made from this connection recently. Please wait a few minutes and try again.';
const LOGIN_ATTEMPT_LIMIT = 20;
const LOGIN_ATTEMPT_WINDOW_MS = 60 * 1000;
const loginAttemptHistoryByIp = new Map();
const LOGIN_RATE_LIMIT_MESSAGE = 'You’re trying to log in too often right now. Please slow down and try again.';

function pruneCreationHistory(ip, now = Date.now()) {
    const history = accountCreationHistoryByIp.get(ip) || [];
    const recentHistory = history.filter((ts) => now - ts < ACCOUNT_CREATION_WINDOW_MS);
    if (recentHistory.length > 0) {
        accountCreationHistoryByIp.set(ip, recentHistory);
    } else {
        accountCreationHistoryByIp.delete(ip);
    }
    return recentHistory;
}

function pruneLoginHistory(ip, now = Date.now()) {
    const history = loginAttemptHistoryByIp.get(ip) || [];
    const recentHistory = history.filter((ts) => now - ts < LOGIN_ATTEMPT_WINDOW_MS);
    if (recentHistory.length > 0) {
        loginAttemptHistoryByIp.set(ip, recentHistory);
    } else {
        loginAttemptHistoryByIp.delete(ip);
    }
    return recentHistory;
}

export function createAuthRouter({ getClientIp }) {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const ip = getClientIp(req);
        const now = Date.now();
        if (isServerStartupGracePeriodActive(now)) {
            try {
                const result = await registerAccount(req.body?.username, req.body?.password);
                if (!result.ok) {
                    res.status(result.status).json(result);
                    return;
                }
                res.status(200).json(result);
            } catch (error) {
                console.error('Register account failed:', error);
                res.status(500).json({
                    ok: false,
                    message: 'Something went wrong while creating your account. Please try again.'
                });
            }
            return;
        }
        const recentCreations = pruneCreationHistory(ip, now);
        if (recentCreations.length >= ACCOUNT_CREATION_LIMIT) {
            res.status(429).json({
                ok: false,
                message: ACCOUNT_CREATION_LIMIT_MESSAGE
            });
            return;
        }

        try {
            const result = await registerAccount(req.body?.username, req.body?.password);
            if (!result.ok) {
                res.status(result.status).json(result);
                return;
            }

            recentCreations.push(now);
            accountCreationHistoryByIp.set(ip, recentCreations);
            res.status(200).json(result);
        } catch (error) {
            console.error('Register account failed:', error);
            res.status(500).json({
                ok: false,
                message: 'Something went wrong while creating your account. Please try again.'
            });
        }
    });

    router.post('/login', async (req, res) => {
        const ip = getClientIp(req);
        const now = Date.now();
        const requestedUsername = String(req.body?.username || '').trim();
        if (requestedUsername && isAccountConnected(requestedUsername)) {
            res.status(409).json({
                ok: false,
                message: 'That account is already signed in on another device. Please log out there first.'
            });
            return;
        }
        if (isServerStartupGracePeriodActive(now)) {
            try {
                const result = await loginAccount(req.body?.username, req.body?.password);
                res.status(result.status).json(result);
            } catch (error) {
                console.error('Login account failed:', error);
                res.status(500).json({
                    ok: false,
                    message: 'Something went wrong while logging you in. Please try again.'
                });
            }
            return;
        }
        const recentAttempts = pruneLoginHistory(ip, now);
        recentAttempts.push(now);
        loginAttemptHistoryByIp.set(ip, recentAttempts);
        if (recentAttempts.length > LOGIN_ATTEMPT_LIMIT) {
            res.status(429).json({
                ok: false,
                message: LOGIN_RATE_LIMIT_MESSAGE
            });
            return;
        }

        try {
            const result = await loginAccount(req.body?.username, req.body?.password);
            res.status(result.status).json(result);
        } catch (error) {
            console.error('Login account failed:', error);
            res.status(500).json({
                ok: false,
                message: 'Something went wrong while logging you in. Please try again.'
            });
        }
    });

    return router;
}
