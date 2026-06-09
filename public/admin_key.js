export const ADMIN_KEY_STORAGE_KEY = 'ua_admin_key';

export function getStoredAdminKey() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return '';
    try {
        return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

export function setStoredAdminKey(key) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
        const normalized = typeof key === 'string' ? key.trim() : '';
        if (!normalized) return;
        window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, normalized);
    } catch {
        // Ignore storage failures.
    }
}

export function clearStoredAdminKey() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
        window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    } catch {
        // Ignore storage failures.
    }
}
