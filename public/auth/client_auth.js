const ACCOUNT_SESSION_STORAGE_KEY = 'ultimateArenaAccountSession';
const AUTH_USERNAME_STORAGE_KEY = 'ultimateArenaAuthUsername';
const LIBERATION_USERNAME = 'Liberation';
const OTHER_ADMIN_NAME_COLOR = '#7f1d1d';

let accountSession = loadStoredAccountSession();
let storedAccountSessionRaw = readStoredAccountSessionRaw();
let authUiRefs = null;
let onSessionChange = null;
let authRequestInFlight = false;
const accountProfile = {
    totalPlayerKills: 0,
    totalDeaths: 0,
    basePlayTime: 0,
    sessionStartedAtSec: 0,
    wheelSpinsRemaining: 0,
    wheelSpinsResetAtSec: 0,
    isLoaded: false
};
let accountProfileTimerStarted = false;
let lastObservedSessionKills = 0;

function loadStoredAuthUsername() {
    try {
        const raw = localStorage.getItem(AUTH_USERNAME_STORAGE_KEY);
        return typeof raw === 'string' ? raw : '';
    } catch (error) {
        return '';
    }
}

function persistStoredAuthUsername(username) {
    try {
        const safe = String(username || '').trim();
        if (safe) {
            localStorage.setItem(AUTH_USERNAME_STORAGE_KEY, safe);
        } else {
            localStorage.removeItem(AUTH_USERNAME_STORAGE_KEY);
        }
    } catch (error) {
        // Ignore storage errors.
    }
}

function readStoredAccountSessionRaw() {
    try {
        const raw = localStorage.getItem(ACCOUNT_SESSION_STORAGE_KEY);
        return typeof raw === 'string' ? raw : '';
    } catch (error) {
        return '';
    }
}

function loadStoredAccountSession() {
    try {
        const raw = readStoredAccountSessionRaw();
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

function resetAccountProfileState() {
    accountProfile.totalPlayerKills = 0;
    accountProfile.totalDeaths = 0;
    accountProfile.basePlayTime = 0;
    accountProfile.sessionStartedAtSec = 0;
    accountProfile.wheelSpinsRemaining = 0;
    accountProfile.wheelSpinsResetAtSec = 0;
    accountProfile.isLoaded = false;
    lastObservedSessionKills = 0;
}

function syncAccountSessionFromStorage(force = false) {
    const nextRaw = readStoredAccountSessionRaw();
    if (!force && nextRaw === storedAccountSessionRaw) {
        return accountSession;
    }

    storedAccountSessionRaw = nextRaw;
    const nextSession = nextRaw ? loadStoredAccountSession() : null;
    const prevUsername = String(accountSession?.username || '').trim();
    const prevToken = String(accountSession?.token || '');
    const nextUsername = String(nextSession?.username || '').trim();
    const nextToken = String(nextSession?.token || '');
    const sessionChanged = prevUsername !== nextUsername || prevToken !== nextToken;

    accountSession = nextSession;
    if (sessionChanged) {
        resetAccountProfileState();
        syncAccountUi();
        dispatchAccountProfileChange();
        notifySessionChange();
    }

    return accountSession;
}

function persistAccountSession() {
    try {
        if (!accountSession) {
            localStorage.removeItem(ACCOUNT_SESSION_STORAGE_KEY);
            storedAccountSessionRaw = '';
            return;
        }
        const raw = JSON.stringify(accountSession);
        localStorage.setItem(ACCOUNT_SESSION_STORAGE_KEY, raw);
        storedAccountSessionRaw = raw;
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

function dispatchAccountProfileChange() {
    try {
        window.dispatchEvent(new Event('ua-account-profile-changed'));
    } catch (error) {
        // Ignore event dispatch failures.
    }
}

function syncAccountUi() {
    if (!authUiRefs) return;
    const {
        authUsernameInput,
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

    if (authUsernameInput) {
        if (loggedIn) {
            authUsernameInput.value = accountSession.username;
        } else if (!authUsernameInput.value.trim()) {
            authUsernameInput.value = loadStoredAuthUsername();
        }
        authUsernameInput.disabled = loggedIn;
        authUsernameInput.readOnly = loggedIn;
        authUsernameInput.title = loggedIn ? 'Your account name is locked while you are logged in.' : '';
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
    syncAccountSessionFromStorage();
    return accountSession;
}

export function getStoredAccountAuthToken() {
    syncAccountSessionFromStorage();
    return accountSession?.token || '';
}

export function getStoredAccountUsername() {
    syncAccountSessionFromStorage();
    return accountSession?.username || '';
}

export function hasStoredAccountSession() {
    syncAccountSessionFromStorage();
    return !!accountSession?.token;
}

export function getCurrentAuthenticatedAccountNameStyle(username, isAdmin = false, now = performance.now()) {
    syncAccountSessionFromStorage();
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
    storedAccountSessionRaw = '';
    resetAccountProfileState();
    persistAccountSession();
    syncAccountUi();
    dispatchAccountProfileChange();
    notifySessionChange();
}

export function updateAccountProfileFromServer(payload) {
    if (!payload) {
        accountProfile.totalPlayerKills = 0;
        accountProfile.totalDeaths = 0;
        accountProfile.basePlayTime = 0;
        accountProfile.sessionStartedAtSec = 0;
        accountProfile.wheelSpinsRemaining = 0;
        accountProfile.wheelSpinsResetAtSec = 0;
        accountProfile.isLoaded = false;
        lastObservedSessionKills = 0;
        syncAccountStatsUi();
        dispatchAccountProfileChange();
        return;
    }
    accountProfile.totalPlayerKills = Math.max(0, Math.floor(Number(payload.totalPlayerKills) || 0));
    accountProfile.totalDeaths = Math.max(0, Math.floor(Number(payload.totalDeaths) || 0));
    accountProfile.basePlayTime = Math.max(0, Math.floor(Number(payload.playTime) || 0));
    accountProfile.sessionStartedAtSec = Math.max(0, Math.floor(Number(payload.sessionStartedAtSec) || 0));
    accountProfile.wheelSpinsRemaining = Math.max(0, Math.floor(Number(payload.wheelSpinsRemaining) || 0));
    accountProfile.wheelSpinsResetAtSec = Math.max(0, Math.floor(Number(payload.wheelSpinsResetAtSec) || 0));
    accountProfile.isLoaded = true;
    lastObservedSessionKills = 0;
    syncAccountStatsUi();
    dispatchAccountProfileChange();
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

export function getAccountWheelSpinState() {
    return {
        loggedIn: !!accountSession?.token,
        loaded: !!accountProfile.isLoaded,
        spinsRemaining: Math.max(0, Math.floor(Number(accountProfile.wheelSpinsRemaining) || 0)),
        resetAtSec: Math.max(0, Math.floor(Number(accountProfile.wheelSpinsResetAtSec) || 0))
    };
}

export function setupAccountAuthUI({
    authUsernameInput,
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
        authUsernameInput,
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
    syncAccountSessionFromStorage(true);

    const submit = async (mode) => {
        if (authRequestInFlight) return;
        const username = String(authUsernameInput?.value || '').trim();
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
            persistStoredAuthUsername(result.username);
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
    authUsernameInput?.addEventListener('keydown', (event) => {
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

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
        if (event.key !== ACCOUNT_SESSION_STORAGE_KEY && event.key !== AUTH_USERNAME_STORAGE_KEY) return;
        syncAccountSessionFromStorage(true);
    });
}
