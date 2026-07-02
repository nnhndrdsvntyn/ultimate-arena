const accountSocketByKey = new Map();

function normalizeAccountUsername(username) {
    return String(username || '').trim();
}

function normalizeAccountKey(username) {
    return normalizeAccountUsername(username).toLowerCase();
}

export function isAccountConnected(username) {
    const key = normalizeAccountKey(username);
    if (!key) return false;
    const ws = accountSocketByKey.get(key);
    if (!ws) return false;
    if (ws.readyState !== 1) {
        accountSocketByKey.delete(key);
        return false;
    }
    return true;
}

export function claimAccountSocket(username, ws) {
    const accountUsername = normalizeAccountUsername(username);
    const key = normalizeAccountKey(accountUsername);

    if (!accountUsername || !key || !ws) {
        return {
            ok: false,
            reason: 'Invalid account username.'
        };
    }

    const existing = accountSocketByKey.get(key);
    if (existing && existing !== ws) {
        if (existing.readyState !== 1) {
            accountSocketByKey.delete(key);
        } else {
            return {
                ok: false,
                reason: 'That account is already signed in on another device. Please log out there first.'
            };
        }
    }

    const previousKey = ws._accountSessionKey || '';
    if (previousKey && previousKey !== key && accountSocketByKey.get(previousKey) === ws) {
        accountSocketByKey.delete(previousKey);
    }

    accountSocketByKey.set(key, ws);
    ws._accountSessionKey = key;
    ws._accountSessionUsername = accountUsername;

    return {
        ok: true,
        username: accountUsername
    };
}

export function releaseAccountSocket(ws) {
    if (!ws) return false;
    const key = ws._accountSessionKey || '';
    if (key && accountSocketByKey.get(key) === ws) {
        accountSocketByKey.delete(key);
    }
    ws._accountSessionKey = '';
    ws._accountSessionUsername = '';
    return true;
}
