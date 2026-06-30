const ACCOUNT_SESSION_STORAGE_KEY = 'ultimateArenaAccountSession';
const LIBERATION_USERNAME = 'Liberation';
const OTHER_ADMIN_NAME_COLOR = '#7f1d1d';

let accountSession = loadStoredAccountSession();
let authUiRefs = null;
let onSessionChange = null;
let authRequestInFlight = false;
const accountProfile = {
    totalPlayerKills: 0,
    totalDeaths: 0,
    basePlayTime: 0,
    sessionStartedAtSec: 0
};
let accountProfileTimerStarted = false;
let lastObservedSessionKills = 0;

function loadStoredAccountSession() {
    try {
        const raw = localStorage.getItem(ACCOUNT_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.username !== 'string' || typeof parsed.token !== 'string') return null;
        return {
            username: parsed.username,
            token: parsed.token
        };
    } catch (error) {
        return null;
    }
}

function persistAccountSession() {
    try {
        if (!accountSession) {
            localStorage.removeItem(ACCOUNT_SESSION_STORAGE_KEY);
            return;
        }
        localStorage.setItem(ACCOUNT_SESSION_STORAGE_KEY, JSON.stringify(accountSession));
    } catch (error) {
        // Ignore storage errors.
    }
}

function notifySessionChange() {
    if (typeof onSessionChange === 'function') {
        onSessionChange(accountSession);
    }
}

function formatPlayTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(safe / 86400);
    const hours = Math.floor((safe % 86400) / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    const parts = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
    if (days > 0 || hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
    if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
    parts.push(`${seconds} ${seconds === 1 ? 'Second' : 'Seconds'}`);
    return parts.join(', ');
}

function getDisplayedPlayTimeSeconds() {
    const base = Math.max(0, Math.floor(Number(accountProfile.basePlayTime) || 0));
    const startedAtSec = Math.max(0, Math.floor(Number(accountProfile.sessionStartedAtSec) || 0));
    if (!accountSession?.token || startedAtSec <= 0) return base;
    const nowSec = Math.floor(Date.now() / 1000);
    return base + Math.max(0, nowSec - startedAtSec);
}

function syncAccountStatsUi() {
    if (!authUiRefs) return;
    const { statsEl, totalKillsEl, totalDeathsEl, kdRatioEl, totalPlayTimeEl } = authUiRefs;
    const loggedIn = !!accountSession?.token;
    const kills = Math.max(0, Math.floor(Number(accountProfile.totalPlayerKills) || 0));
    const deaths = Math.max(0, Math.floor(Number(accountProfile.totalDeaths) || 0));
    const kdRatio = deaths > 0 ? (kills / deaths) : kills;
    if (statsEl) statsEl.style.display = loggedIn ? 'grid' : 'none';
    if (totalKillsEl) totalKillsEl.textContent = loggedIn ? String(kills) : '0';
    if (totalDeathsEl) totalDeathsEl.textContent = loggedIn ? String(deaths) : '0';
    if (kdRatioEl) kdRatioEl.textContent = loggedIn ? kdRatio.toFixed(2) : '0.00';
    if (totalPlayTimeEl) totalPlayTimeEl.textContent = loggedIn ? formatPlayTime(getDisplayedPlayTimeSeconds()) : '00:00:00';
}

function ensureAccountProfileTimer() {
    if (accountProfileTimerStarted) return;
    accountProfileTimerStarted = true;
    setInterval(() => {
        syncAccountStatsUi();
    }, 1000);
}

function syncAccountUi() {
    if (!authUiRefs) return;
    const {
        usernameInput,
        passwordInput,
        loginButton,
        signupButton,
        logoutButton,
        statusEl,
        statsEl,
        totalKillsEl,
        totalDeathsEl,
        kdRatioEl,
        totalPlayTimeEl
    } = authUiRefs;
    const loggedIn = !!accountSession?.token;

    if (usernameInput) {
        if (loggedIn) {
            usernameInput.value = accountSession.username;
        }
        usernameInput.disabled = loggedIn;
        usernameInput.readOnly = loggedIn;
        usernameInput.title = loggedIn ? 'Your in-game name is locked to your account.' : '';
    }

    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.disabled = loggedIn;
        passwordInput.style.display = loggedIn ? 'none' : 'block';
    }

    if (loginButton) loginButton.style.display = loggedIn ? 'none' : 'inline-flex';
    if (signupButton) signupButton.style.display = loggedIn ? 'none' : 'inline-flex';
    if (logoutButton) logoutButton.style.display = loggedIn ? 'inline-flex' : 'none';

    if (statusEl) {
        statusEl.textContent = loggedIn
            ? `Logged in as ${accountSession.username}. Your account name will always be used in-game.`
            : 'Log in or create an account.';
    }
    syncAccountStatsUi();
}

async function postAuth(path, username, password) {
    const response = await fetch(`/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const payload = await response.json().catch(() => ({}));
    return {
        ok: !!payload?.ok,
        status: response.status,
        message: String(payload?.message || 'Unable to complete that request right now.'),
        username: typeof payload?.username === 'string' ? payload.username : '',
        token: typeof payload?.token === 'string' ? payload.token : ''
    };
}

export function getStoredAccountSession() {
    return accountSession;
}

export function getStoredAccountAuthToken() {
    return accountSession?.token || '';
}

export function getStoredAccountUsername() {
    return accountSession?.username || '';
}

export function hasStoredAccountSession() {
    return !!accountSession?.token;
}

export function getCurrentAuthenticatedAccountNameStyle(username, isAdmin = false, now = performance.now()) {
    if (!accountSession?.token) return null;

    const sessionUsername = String(accountSession.username || '').trim();
    const targetUsername = String(username || '').trim();
    if (!sessionUsername || targetUsername !== sessionUsername) return null;

    if (sessionUsername === LIBERATION_USERNAME) {
        const hue = Math.floor((Number(now) || performance.now()) / 28) % 360;
        return {
            kind: 'rainbow',
            color: `hsl(${hue} 100% 65%)`
        };
    }

    if (isAdmin) {
        return {
            kind: 'admin',
            color: OTHER_ADMIN_NAME_COLOR
        };
    }

    return null;
}

export function clearStoredAccountSession() {
    accountSession = null;
    accountProfile.totalPlayerKills = 0;
    accountProfile.totalDeaths = 0;
    accountProfile.basePlayTime = 0;
    accountProfile.sessionStartedAtSec = 0;
    lastObservedSessionKills = 0;
    persistAccountSession();
    syncAccountUi();
    notifySessionChange();
}

export function updateAccountProfileFromServer(payload) {
    if (!payload) {
        accountProfile.totalPlayerKills = 0;
        accountProfile.totalDeaths = 0;
        accountProfile.basePlayTime = 0;
        accountProfile.sessionStartedAtSec = 0;
        lastObservedSessionKills = 0;
        syncAccountStatsUi();
        return;
    }
    accountProfile.totalPlayerKills = Math.max(0, Math.floor(Number(payload.totalPlayerKills) || 0));
    accountProfile.totalDeaths = Math.max(0, Math.floor(Number(payload.totalDeaths) || 0));
    accountProfile.basePlayTime = Math.max(0, Math.floor(Number(payload.playTime) || 0));
    accountProfile.sessionStartedAtSec = Math.max(0, Math.floor(Number(payload.sessionStartedAtSec) || 0));
    lastObservedSessionKills = 0;
    syncAccountStatsUi();
}

export function applyLiveAccountDeathIncrement() {
    if (!accountSession?.token) return;
    accountProfile.totalDeaths = Math.max(0, Math.floor(Number(accountProfile.totalDeaths) || 0)) + 1;
    syncAccountStatsUi();
}

export function applyLiveAccountKillDelta(currentSessionKills) {
    const safeKills = Math.max(0, Math.floor(Number(currentSessionKills) || 0));
    if (!accountSession?.token) {
        lastObservedSessionKills = safeKills;
        return;
    }
    if (safeKills > lastObservedSessionKills) {
        accountProfile.totalPlayerKills += (safeKills - lastObservedSessionKills);
    }
    lastObservedSessionKills = safeKills;
    syncAccountStatsUi();
}

export function setupAccountAuthUI({
    usernameInput,
    passwordInput,
    loginButton,
    signupButton,
    logoutButton,
    statusEl,
    statsEl,
    totalKillsEl,
    totalDeathsEl,
    kdRatioEl,
    totalPlayTimeEl,
    showNotification,
    onAccountSessionChange
}) {
    authUiRefs = {
        usernameInput,
        passwordInput,
        loginButton,
        signupButton,
        logoutButton,
        statusEl,
        statsEl,
        totalKillsEl,
        totalDeathsEl,
        kdRatioEl,
        totalPlayTimeEl
    };
    onSessionChange = onAccountSessionChange;
    ensureAccountProfileTimer();

    const submit = async (mode) => {
        if (authRequestInFlight) return;
        const username = String(usernameInput?.value || '').trim();
        const password = String(passwordInput?.value || '');
        authRequestInFlight = true;
        try {
            const result = await postAuth(mode, username, password);
            if (!result.ok) {
                showNotification?.(result.message, 'red');
                return;
            }

            accountSession = {
                username: result.username,
                token: result.token
            };
            localStorage.username = result.username;
            persistAccountSession();
            syncAccountUi();
            notifySessionChange();
            showNotification?.(result.message, '#22c55e');
        } finally {
            authRequestInFlight = false;
        }
    };

    loginButton?.addEventListener('click', () => {
        void submit('login');
    });
    signupButton?.addEventListener('click', () => {
        void submit('register');
    });
    logoutButton?.addEventListener('click', () => {
        clearStoredAccountSession();
        showNotification?.('You have been logged out.', '#eab308');
    });
    usernameInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (accountSession?.token) return;
        event.preventDefault();
        void submit('login');
    });
    passwordInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (accountSession?.token) return;
        event.preventDefault();
        void submit('login');
    });

    syncAccountUi();
    notifySessionChange();
}
