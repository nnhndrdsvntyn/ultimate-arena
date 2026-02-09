import { createEl } from './dom.js';

const colorProbeCtx = document.createElement('canvas').getContext('2d');

function colorToRgba(color, alpha = 0.65) {
    if (!color) return `rgba(0,0,0,${alpha})`;
    colorProbeCtx.fillStyle = color;
    const normalized = colorProbeCtx.fillStyle;

    if (normalized.startsWith('rgb(')) {
        return normalized.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    if (normalized.startsWith('rgba(')) {
        return normalized.replace(/rgba\(([^)]+)\)/, (_, vals) => {
            const parts = vals.split(',').map(v => v.trim());
            if (parts.length >= 3) {
                return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
            }
            return `rgba(0,0,0,${alpha})`;
        });
    }
    if (normalized.startsWith('#')) {
        const hex = normalized.slice(1);
        const full = hex.length === 3
            ? hex.split('').map(c => c + c).join('')
            : hex.padEnd(6, '0');
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(0,0,0,${alpha})`;
}

function getNotificationHost() {
    let host = document.getElementById('notification-host');
    if (host) return host;
    host = createEl('div', {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px',
        zIndex: '100000',
        pointerEvents: 'none'
    }, document.body, { id: 'notification-host' });
    return host;
}

export function showNotification(text, color) {
    const host = getNotificationHost();
    const notif = createEl('div', {
        width: 'auto',
        maxWidth: '520px',
        minWidth: '240px',
        padding: '12px 44px 12px 16px',
        color: 'white', fontSize: '1.2rem', fontWeight: 'bold',
        textAlign: 'left', pointerEvents: 'auto',
        cursor: 'default', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        transform: 'translate(-120%, 0)',
        opacity: '0',
        backdropFilter: 'blur(6px)',
        transition: 'transform 0.35s ease, opacity 0.35s ease'
    }, host, { textContent: text });

    // Use alpha background without stacking brightness issues
    notif.style.background = colorToRgba(color, 0.6);

    const closeBtn = createEl('button', {
        position: 'absolute',
        top: '50%',
        right: '12px',
        transform: 'translateY(-50%)',
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.35)',
        background: 'rgba(0,0,0,0.25)',
        color: 'white',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        pointerEvents: 'auto'
    }, notif, { textContent: '×' });

    closeBtn.onclick = (e) => {
        e.stopPropagation();
        notif.remove();
    };

    requestAnimationFrame(() => {
        notif.style.transform = 'translate(0, 0)';
        notif.style.opacity = '1';
    });

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translate(-120%, 0)';
        setTimeout(() => notif.remove(), 1000);
    }, 5000);
}
