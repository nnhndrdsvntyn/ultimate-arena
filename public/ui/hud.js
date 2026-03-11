import { ENTITIES } from '../game.js';
import { Vars, LC, startJoinActionCooldown } from '../client.js';
import { sendPausePacket } from '../helpers.js';
import { createEl } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { isMobile, HOTBAR_CONFIG, UPDATES_LOG, version } from './config.js';

const DID_YOU_KNOW_HINTS = [
    "You can buy accessories in the shop... some have special abilities!",
    "You automatically pick coins up... unless your inventory is full!",
    "You can drop coins, swords, and even accessories by dragging them out of your invetory or by pressing the Q key!",
    "You can hide under trees!",
    "You can sell swords you no longer need in the shop to earn coins.",
];

function setPauseState(paused) {
    if (uiState.isPaused === paused) return;
    uiState.isPaused = paused;
    uiState.forceHomeScreen = paused;
    if (paused) {
        startJoinActionCooldown();
        sendPausePacket();
    }
}

function requestPause() {
    setPauseState(true);
}

export function createComboText(parent) {
    const hb = HOTBAR_CONFIG;
    const bottomLift = 40;
    const bottom = hb.marginBottom + hb.slotSize + (hb.padding * 2) + 45 + bottomLift;

    uiRefs.comboText = createEl('div', {
        position: 'fixed',
        bottom: bottom + 'px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#fbbf24',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
        display: 'none',
        pointerEvents: 'none',
        zIndex: '90'
    }, parent, { textContent: 'Combo: 0/3' });
}

export function createShieldIcon(parent) {
    const shieldIcon = createEl('div', {
        backgroundImage: 'url("./images/ui/pause-button.png")',
        backgroundSize: '75%', // Perfectly balanced to match other top icons
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        display: 'none',
        zIndex: '100000',
        pointerEvents: 'auto',
        cursor: 'pointer'
    }, parent, { id: 'pauseBtn' });

    shieldIcon.onclick = () => {
        requestPause();
    };
}

export function createFullscreenButton(parent) {
    const btn = createEl('button', {
        backgroundImage: 'url("./images/ui/fullscreen-button.png")',
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    }, parent, {
        id: 'fullscreenBtn'
    });

    btn.onclick = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };
}

export function updateHUDVisibility(isAlive) {
    const settingsBtn = document.getElementById('settingsBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const shopBtn = document.getElementById('shopBtn');
    const homeBlurBtn = document.getElementById('homeBlurBtn');
    const shieldIconEl = document.getElementById('pauseBtn');

    const isHome = document.getElementById('home-screen').style.display !== 'none';
    const isRespawn = document.getElementById('respawn-screen')?.style.display !== 'none';

    if (settingsBtn) settingsBtn.style.display = (!isHome && !isRespawn && isAlive) ? 'flex' : 'none';
    if (fullscreenBtn) fullscreenBtn.style.display = (!isHome && !isRespawn && isAlive) ? 'flex' : 'none';
    if (shopBtn) shopBtn.style.display = (!isHome && !isRespawn && isAlive) ? 'flex' : 'none';
    if (homeBlurBtn) homeBlurBtn.style.display = isAlive ? 'none' : 'flex';
    if (shieldIconEl) shieldIconEl.style.display = (isAlive && !isHome && !isRespawn) ? 'block' : 'none';
    updateMobileUIState();
}

export function updateShieldUI(active) {
    const isAlive = ENTITIES.PLAYERS[Vars.myId]?.isAlive;
    const shieldIconEl = document.querySelector('[style*="pause-button.png"]');
    if (shieldIconEl) {
        shieldIconEl.style.display = (active && isAlive) ? 'block' : 'none';
    }
}

export function updateMobileUIState() {
    const joy = document.getElementById('joystick-container');
    const chatBtn = document.getElementById('mobile-chat-btn');
    const isHome = document.getElementById('home-screen').style.display !== 'none';
    const isRespawn = document.getElementById('respawn-screen')?.style.display !== 'none';
    const show = isMobile && !isHome && !isRespawn;

    if (joy) joy.style.display = show ? 'block' : 'none';
    if (chatBtn) chatBtn.style.display = (show && !uiState.isChatOpen) ? 'flex' : 'none';
}

export function createHomeBlurButton() {
    const homeScreen = document.getElementById('home-screen');
    if (!homeScreen) return;

    const btn = createEl('button', {
        backgroundImage: 'url("./images/ui/eye.png")',
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    }, homeScreen, {
        id: 'homeBlurBtn'
    });

    let isBlurred = true;
    btn.onclick = () => {
        isBlurred = !isBlurred;
        if (isBlurred) {
            homeScreen.classList.remove('unblurred');
            btn.style.backgroundImage = 'url("./images/ui/eye.png")';
        } else {
            homeScreen.classList.add('unblurred');
            btn.style.backgroundImage = 'url("./images/ui/crossed-eye.png")';
        }
    };
}

export function setupVersion() {
    const credits = document.getElementById('credits');
    if (credits) {
        createEl('div', {
            fontSize: '0.7rem',
            marginTop: '5px',
            opacity: '0.6',
            letterSpacing: '0.05rem',
            textAlign: 'center',
            width: '100%'
        }, credits, { textContent: `v${version}` });
    }
}

export function setupUpdateLog() {
    const homeScreen = document.getElementById('home-screen');
    if (!homeScreen) return;

    const discordLink = createEl('a', {}, homeScreen, {
        id: 'home-discord-link',
        href: 'https://discord.gg/ZN8GWJZD',
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Join Discord'
    });

    createEl('img', {}, discordLink, {
        src: './images/ui/discord-icon.png',
        alt: 'Discord'
    });

    const infoToggle = createEl('button', {}, homeScreen, {
        id: 'home-info-toggle',
        textContent: 'Info',
        title: 'Toggle Update Log'
    });

    // Container for the update log
    const updateLog = createEl('div', {
        position: 'absolute',
        bottom: isMobile ? 'auto' : '2rem',
        top: isMobile ? '60px' : 'auto',
        right: isMobile ? '50px' : '2rem',
        width: isMobile ? '160px' : '320px',
        maxHeight: isMobile ? '120px' : '250px',
        overflowY: 'auto',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        padding: isMobile ? '8px' : '16px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        fontSize: isMobile ? '0.6rem' : '1rem',
    }, homeScreen, { id: 'update-log' });

    // Toggle functionality
    infoToggle.onclick = () => {
        updateLog.classList.toggle('hidden');
    };

    // Header
    createEl('div', {
        fontSize: isMobile ? '0.75rem' : '0.9rem',
        fontWeight: '800',
        color: 'white',
        textTransform: 'uppercase',
        letterSpacing: '0.1rem',
        marginBottom: isMobile ? '6px' : '12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        paddingBottom: isMobile ? '4px' : '8px'
    }, updateLog, { textContent: 'Update Log' });

    // Update entries - add new versions at the top
    [...UPDATES_LOG].reverse().forEach(update => {
        // Version header
        createEl('div', {
            fontSize: isMobile ? '0.65rem' : '0.85rem',
            fontWeight: '700',
            color: '#f8fafc',
            marginBottom: '1px',
            marginTop: isMobile ? '3px' : '8px'
        }, updateLog, { textContent: update.version });

        // Changes list
        update.changes.forEach(change => {
            createEl('div', {
                fontSize: isMobile ? '0.55rem' : '0.75rem',
                color: 'rgba(255, 255, 255, 0.6)',
                paddingLeft: '8px',
                marginBottom: '0.5px'
            }, updateLog, { textContent: `• ${change}` });
        });

        // Date
        createEl('div', {
            fontSize: isMobile ? '0.55rem' : '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)',
            textAlign: 'right',
            marginTop: isMobile ? '1px' : '4px'
        }, updateLog, { textContent: update.date });
    });
}

export function setupDidYouKnowBox() {
    const homeScreen = document.getElementById('home-screen');
    if (!homeScreen) return;

    const box = createEl('div', {
        position: 'absolute',
        top: isMobile ? '60px' : '2rem',
        right: isMobile ? '0.75rem' : '2rem',
        width: isMobile ? '180px' : '320px',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        padding: isMobile ? '8px' : '14px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        color: 'white',
        zIndex: '3'
    }, homeScreen, { id: 'did-you-know-box' });

    createEl('div', {
        fontSize: isMobile ? '0.65rem' : '0.8rem',
        fontWeight: '900',
        letterSpacing: '0.08rem',
        marginBottom: isMobile ? '5px' : '8px',
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.95)'
    }, box, { textContent: 'DID YOU KNOW:' });

    const hintText = createEl('div', {
        fontSize: isMobile ? '0.58rem' : '0.78rem',
        lineHeight: isMobile ? '1.25' : '1.4',
        color: 'rgba(255, 255, 255, 0.82)'
    }, box, { textContent: DID_YOU_KNOW_HINTS[0] });

    let hintIndex = 0;
    setInterval(() => {
        hintIndex = (hintIndex + 1) % DID_YOU_KNOW_HINTS.length;
        hintText.textContent = DID_YOU_KNOW_HINTS[hintIndex];
    }, 7000);
}
