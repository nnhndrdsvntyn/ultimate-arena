import { createEl } from './dom.js';

export function showNotification(text, color) {
    const notif = createEl('div', {
        position: 'fixed', top: '0', left: '0', width: '100%',
        background: color, padding: '15px', opacity: '0.9',
        color: 'white', fontSize: '1.2rem', fontWeight: 'bold',
        zIndex: '100000', textAlign: 'center', pointerEvents: 'auto',
        cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    }, document.body, { textContent: text });

    notif.onclick = () => notif.remove();

    setTimeout(() => {
        notif.style.transition = 'all 1s ease';
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-100%)';
        setTimeout(() => notif.remove(), 1000);
    }, 5000);
}
