import { sendChat, writer, encodeUsername } from './helpers.js';
import { ENTITIES } from './game.js';
import { ws, Vars, Settings, LC } from './client.js';
import { dataMap } from './shared/datamap.js';
// --- Configuration & Constants ---
export const THROW_BTN_CONFIG = {
    xOffset: 50,
    yOffset: 110,
    radius: 30
};

export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- State ---
export let isChatOpen = false;
export let isSettingsOpen = false;
let activeTab = 'Visuals';
let settingsBody;
let shieldIcon;
let chatInput;
let chatInputWrapper;
let settingsModal;
let settingsOverlay;

// --- DOM Utilities ---
function createEl(tag, styles = {}, parent = null, props = {}) {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    Object.assign(el, props);
    if (parent) parent.appendChild(el);
    return el;
}

// --- UI Initialization ---
export function initializeUI() {
    const hudContainer = document.getElementById('game-hud');
    if (!hudContainer) return;

    createShieldIcon(hudContainer);
    createSettingsButton(hudContainer);
    createFullscreenButton(hudContainer);
    createHomeBlurButton();
    createSettingsModal(hudContainer);
    createChatUI(hudContainer);
    setupSharedInputListeners();

    if (isMobile) {
        setupMobileControls(hudContainer);
    } else {
        setupDesktopControls();
    }
}
function createSettingsButton(parent) {
    const btn = createEl('button', {
        backgroundImage: 'url("./images/ui/settings-gear.png")',
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    }, parent, {
        id: 'settingsBtn'
    });

    btn.onclick = () => {
        toggleSettingsModal(true);
    };
}

function createFullscreenButton(parent) {
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

function createSettingsModal(parent) {
    settingsOverlay = createEl('div', {}, parent, { className: 'modal-overlay' });
    settingsModal = createEl('div', {}, settingsOverlay, { className: 'settings-modal' });

    // Header
    const header = createEl('div', {}, settingsModal, { className: 'settings-header' });
    createEl('h2', {}, header, { textContent: 'SETTINGS' });
    const closeBtn = createEl('button', {}, header, { className: 'close-settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleSettingsModal(false);

    // Tabs
    const tabsContainer = createEl('div', {}, settingsModal, { className: 'settings-tabs' });
    const tabs = ['Visuals', 'Stats'];
    tabs.forEach((tab) => {
        const tabEl = createEl('div', {}, tabsContainer, {
            className: `settings-tab ${tab === activeTab ? 'active' : ''}`,
            textContent: tab
        });
        tabEl.onclick = () => {
            activeTab = tab;
            document.querySelectorAll('.settings-tab').forEach(el => el.classList.remove('active'));
            tabEl.classList.add('active');
            updateSettingsBody();
        };
    });

    // Body
    settingsBody = createEl('div', {}, settingsModal, { className: 'settings-body' });
    updateSettingsBody();

    // Close on overlay click
    settingsOverlay.onclick = (e) => {
        if (e.target === settingsOverlay) toggleSettingsModal(false);
    };
}

function updateSettingsBody() {
    if (!settingsBody) return;
    settingsBody.innerHTML = '';
    if (activeTab === 'Visuals') {
        createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'General' });
        addToggleSetting(settingsBody, 'Render Grid', 'renderGrid', (val) => {
            Settings.renderGrid = val;
        });
        addToggleSetting(settingsBody, 'Show Hitboxes', 'drawHitboxes', (val) => {
            Settings.drawHitboxes = val;
        });
        addToggleSetting(settingsBody, 'Show Player Ids', 'showPlayerIds', (val) => {
            Settings.showPlayerIds = val;
        });

        createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'Minimap' });
        addToggleSetting(settingsBody, 'Show Nearby Mobs On Minimap (orange)', 'showMobsOnMinimap', (val) => {
            Settings.showMobsOnMinimap = val;
        });
        addToggleSetting(settingsBody, 'Show Nearby Players On Minimap (red)', 'showPlayersOnMinimap', (val) => {
            Settings.showPlayersOnMinimap = val;
        });
        addToggleSetting(settingsBody, 'Show Nearby Chests On Minimap (brown)', 'showChestsOnMinimap', (val) => {
            Settings.showChestsOnMinimap = val;
        });
    } else if (activeTab === 'Stats') {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer) {
            createEl('div', {}, settingsBody, { textContent: 'No player data available.' });
            return;
        }

        const level = myPlayer.level;
        const projStats = dataMap.PROJECTILES[level] || dataMap.PROJECTILES[1];

        const damagePerHit = projStats.damage;
        const damagePerThrow = damagePerHit * 2;
        const speed = myPlayer.serverAttributes.speed;
        const health = Math.floor(myPlayer.health);
        const maxHealth = Math.floor(myPlayer.maxHealth);

        createStatItem(settingsBody, 'DMG (hit)', damagePerHit);
        createStatItem(settingsBody, 'DMG (throw sword)', damagePerThrow);
        createStatItem(settingsBody, 'SPEED', speed);
        createStatItem(settingsBody, 'HP', `${health} / ${maxHealth}`);
    }
}

function createStatItem(parent, label, value) {
    const item = createEl('div', {}, parent, { className: 'stat-item' });
    createEl('div', {}, item, { className: 'stat-label', textContent: label });
    createEl('div', {}, item, { className: 'stat-value', textContent: value });
}

function addToggleSetting(parent, label, settingKey, onChange) {
    const item = createEl('div', {}, parent, { className: 'setting-item' });
    createEl('div', {}, item, { className: 'setting-label', textContent: label });

    const toggle = createEl('div', {}, item, {
        className: `toggle-switch ${Settings[settingKey] ? 'on' : ''}`
    });
    createEl('div', {}, toggle, { className: 'toggle-knob' });

    toggle.onclick = () => {
        const isOn = toggle.classList.toggle('on');
        onChange(isOn);
    };
}

function toggleSettingsModal(show) {
    isSettingsOpen = show;
    settingsOverlay.style.display = show ? 'flex' : 'none';
}

function createShieldIcon(parent) {
    shieldIcon = createEl('div', {
        position: 'fixed',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '60px',
        height: '60px',
        backgroundImage: 'url("./images/ui/pause-button.png")',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        display: 'none',
        zIndex: '100000',
        pointerEvents: 'auto',
        cursor: 'pointer',
        filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))'
    }, parent);

    shieldIcon.onclick = () => {
        writer.reset();
        writer.writeU8(6);
        ws.send(writer.getBuffer());
        Vars.lastDiedTime = performance.now();
        if (LC) LC.zoomOut();
    };
}

function createChatUI(parent) {
    chatInputWrapper = createEl('div', {}, parent, { id: 'chat-input-wrapper' });

    chatInput = createEl('input', {}, chatInputWrapper, {
        id: 'chatInput',
        maxLength: 50,
        placeholder: 'Press Enter to send...',
        autocomplete: 'off'
    });
}

// --- Shared Input Listeners ---
function setupSharedInputListeners() {
    window.addEventListener('keydown', (e) => {
        const homeUsrnInput = document.getElementById('homeUsrnInput');
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];

        if (e.key === 'Escape') {
            if (isSettingsOpen) toggleSettingsModal(false);
            return;
        }

        if (isSettingsOpen) return;

        if (e.key === 'Enter') {
            handleChatToggle(myPlayer, homeUsrnInput);
        } else if (e.key.toLowerCase() === 'e' && myPlayer?.isAlive && !isChatOpen) {
            writer.reset();
            writer.writeU8(7);
            ws.send(writer.getBuffer());
        }
    });
}

function handleChatToggle(myPlayer, homeUsrnInput) {
    if (isChatOpen) {
        // Send Chat
        sendChat(chatInput.value);
        chatInput.value = '';
        chatInputWrapper.style.display = 'none';
        chatInput.blur();
        isChatOpen = false;

        const mobileChatBtn = document.getElementById('mobile-chat-btn');
        if (mobileChatBtn) mobileChatBtn.style.display = 'flex';
    } else if (myPlayer?.isAlive) {
        // Open Chat
        isChatOpen = true;
        chatInputWrapper.style.display = 'block';
        chatInput.focus();

        const mobileChatBtn = document.getElementById('mobile-chat-btn');
        if (mobileChatBtn) mobileChatBtn.style.display = 'none';
    } else if (!myPlayer?.isAlive) {
        // Join Game if on login screen
        if (Vars.lastDiedTime + 1700 < performance.now() && document.activeElement === homeUsrnInput) {
            const username = homeUsrnInput.value || localStorage.username;
            ws.send(encodeUsername(username));
        }
    }
}

// --- Mobile Controls ---
function setupMobileControls(container) {
    // Chat Button for Mobile
    const chatBtn = createEl('button', {
        position: 'absolute', bottom: '20px', right: '20px', width: '50px', height: '50px',
        pointerEvents: 'auto', borderRadius: '50%', border: 'none',
        background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(5px)',
        color: 'white', fontSize: '24px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }, container, { id: 'mobile-chat-btn', innerHTML: '💬' });

    chatBtn.onclick = () => {
        if (isChatOpen) return;
        isChatOpen = true;
        chatInputWrapper.style.display = 'block';
        chatInput.focus();
        chatBtn.style.display = 'none';
    };

    // Joystick elements
    const joyContainer = createEl('div', {
        position: 'absolute', bottom: '60px', left: '60px', width: '120px', height: '120px',
        background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(5px)',
        borderRadius: '50%', pointerEvents: 'auto', touchAction: 'none',
        border: '2px solid rgba(255, 255, 255, 0.1)'
    }, container);

    const joyKnob = createEl('div', {
        position: 'absolute', top: '50%', left: '50%', width: '50px', height: '50px',
        transform: 'translate(-50%, -50%)', background: 'rgba(255, 255, 255, 0.4)',
        borderRadius: '50%', pointerEvents: 'none',
        boxShadow: '0 0 15px rgba(255,255,255,0.2)'
    }, joyContainer);

    setupJoystickLogic(joyContainer, joyKnob);
    setupMobileTouchActions(joyContainer, chatBtn);
}

function setupJoystickLogic(container, knob) {
    let startX, startY;
    let moveId = null;
    const maxDist = 45;
    const activeKeys = { w: 0, a: 0, s: 0, d: 0 };

    const updateKeys = (dx, dy) => {
        const newKeys = { w: 0, a: 0, s: 0, d: 0 };
        if (dy < -10) newKeys.w = 1;
        if (dy > 10) newKeys.s = 1;
        if (dx < -10) newKeys.a = 1;
        if (dx > 10) newKeys.d = 1;

        const sendKey = (key, state) => {
            if (ws?.readyState === ws.OPEN) {
                writer.reset();
                writer.writeU8(3);
                writer.writeU8(key);
                writer.writeU8(state);
                ws.send(writer.getBuffer());
            }
        };

        if (newKeys.w !== activeKeys.w) { sendKey(1, newKeys.w); activeKeys.w = newKeys.w; }
        if (newKeys.a !== activeKeys.a) { sendKey(2, newKeys.a); activeKeys.a = newKeys.a; }
        if (newKeys.s !== activeKeys.s) { sendKey(3, newKeys.s); activeKeys.s = newKeys.s; }
        if (newKeys.d !== activeKeys.d) { sendKey(4, newKeys.d); activeKeys.d = newKeys.d; }
    };

    container.addEventListener('touchstart', e => {
        if (isChatOpen || isSettingsOpen) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        moveId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
    });

    container.addEventListener('touchmove', e => {
        if (isChatOpen || isSettingsOpen) return;
        e.preventDefault();
        let touch;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === moveId) {
                touch = e.changedTouches[i];
                break;
            }
        }
        if (!touch) return;

        let dx = touch.clientX - startX;
        let dy = touch.clientY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
            const ratio = maxDist / dist;
            dx *= ratio;
            dy *= ratio;
        }

        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        updateKeys(dx, dy);
    });

    const resetJoystick = () => {
        moveId = null;
        knob.style.transform = `translate(-50%, -50%)`;
        updateKeys(0, 0);
    };

    container.addEventListener('touchend', resetJoystick);
    container.addEventListener('touchcancel', resetJoystick);
}

function setupMobileTouchActions(joyContainer, chatBtn) {
    let throwTouchId = null;

    const updateRotation = (x, y) => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN) return;

        if (myPlayer.swingState !== 0) return;

        let angle = Math.atan2(y - innerHeight / 2, x - innerWidth / 2);
        writer.reset();
        writer.writeU8(2);
        writer.writeF32(angle);
        ws.send(writer.getBuffer());
        myPlayer.angle = angle;
    };

    const sendAttack = (state) => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (myPlayer?.isAlive && ws?.readyState === ws.OPEN) {
            writer.reset();
            writer.writeU8(4);
            writer.writeU8(state);
            ws.send(writer.getBuffer());
        }
    };

    window.addEventListener('touchstart', e => {
        if (e.target === joyContainer || e.target === chatBtn || e.target === chatInput || isSettingsOpen) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];

            // Handle Throw Button Check
            const btnX = window.innerWidth - THROW_BTN_CONFIG.xOffset;
            const btnY = window.innerHeight - THROW_BTN_CONFIG.yOffset;
            const dist = Math.sqrt(Math.pow(t.clientX - btnX, 2) + Math.pow(t.clientY - btnY, 2));

            if (dist <= THROW_BTN_CONFIG.radius) {
                const myPlayer = ENTITIES.PLAYERS[Vars.myId];
                if (myPlayer?.hasWeapon) {
                    writer.reset();
                    writer.writeU8(7);
                    ws.send(writer.getBuffer());
                }
                throwTouchId = t.identifier;
                continue;
            }

            updateRotation(t.clientX, t.clientY);
            if (!isChatOpen) sendAttack(1);
        }
    });

    window.addEventListener('touchmove', e => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (e.target === joyContainer || t.identifier === throwTouchId) continue;
            updateRotation(t.clientX, t.clientY);
        }
    });

    window.addEventListener('touchend', e => {
        let shootingTouchEnded = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === throwTouchId) {
                throwTouchId = null;
                continue;
            }
            // If it wasn't the joystick touch, it was an attack touch
            shootingTouchEnded = true;
        }
        if (shootingTouchEnded) sendAttack(0);
    });
}

// --- Desktop Controls ---
function setupDesktopControls() {
    window.addEventListener("mousemove", e => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN || isSettingsOpen) return;

        const angle = Math.atan2(e.clientY - innerHeight / 2, e.clientX - innerWidth / 2);
        writer.reset();
        writer.writeU8(2);
        writer.writeF32(angle);
        ws.send(writer.getBuffer());
        if (myPlayer.swingState === 0) myPlayer.angle = angle;
    });

    const sendAttack = (state) => {
        if (isChatOpen || isSettingsOpen || ws?.readyState !== ws.OPEN) return;
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (myPlayer?.isAlive) {
            writer.reset();
            writer.writeU8(4);
            writer.writeU8(state);
            ws.send(writer.getBuffer());
        }
    };

    const isUIElement = (target) => {
        // Elements that should block game input
        const interactableTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
        if (interactableTags.includes(target.tagName)) return true;

        // Modal components
        if (target.classList.contains('modal-overlay') || target.closest('.settings-modal')) return true;

        // If it's the HUD container itself or the body, it's not a UI element blocking input
        if (target.id === 'game-hud' || target === document.body) return false;

        return false;
    };

    window.addEventListener("mousedown", e => {
        if (isUIElement(e.target)) return;
        if (e.button === 0) sendAttack(1);
    });

    window.addEventListener("mouseup", e => {
        if (e.button === 0) sendAttack(0);
    });

    setupKeyboardControls();
}

function setupKeyboardControls() {
    const keys = new Set();
    const keyMap = {
        'w': 1, 'arrowup': 1,
        'a': 2, 'arrowleft': 2,
        's': 3, 'arrowdown': 3,
        'd': 4, 'arrowright': 4
    };

    const handleKey = (e, isDown) => {
        if (isChatOpen || isSettingsOpen || ws?.readyState !== ws.OPEN) return;
        const keyName = e.key.toLowerCase();
        if (!keyMap[keyName]) return;

        if (isDown) {
            if (keys.has(keyName)) return;
            keys.add(keyName);
        } else {
            if (!keys.has(keyName)) return;
            keys.delete(keyName);
        }

        writer.reset();
        writer.writeU8(3);
        writer.writeU8(keyMap[keyName]);
        writer.writeU8(isDown ? 1 : 0);
        ws.send(writer.getBuffer());
    };

    document.addEventListener('keydown', e => handleKey(e, true));
    document.addEventListener('keyup', e => handleKey(e, false));
}

// --- Public Utility Functions ---
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

export function updateHUDVisibility(isAlive) {
    const settingsBtn = document.getElementById('settingsBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const homeBlurBtn = document.getElementById('homeBlurBtn');
    const shieldIconEl = document.querySelector('[style*="pause-button.png"]');

    if (settingsBtn) settingsBtn.style.display = isAlive ? 'flex' : 'none';
    if (fullscreenBtn) fullscreenBtn.style.display = isAlive ? 'flex' : 'none';
    if (homeBlurBtn) homeBlurBtn.style.display = isAlive ? 'none' : 'flex';
    if (shieldIconEl && !isAlive) shieldIconEl.style.display = 'none';
}

export function updateShieldUI(active) {
    const shieldIconEl = document.querySelector('[style*="pause-button.png"]');
    if (shieldIconEl) shieldIconEl.style.display = active ? 'block' : 'none';
}

function createHomeBlurButton() {
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


// stats update
setInterval(() => {
    if (isSettingsOpen && activeTab === 'Stats') {
        updateSettingsBody();
    }
}, 100);

// ping
setInterval(() => {
    writer.reset();
    writer.writeU8(9);
    ws.send(writer.getBuffer());
    Vars.lastSentPing = Date.now();
}, 1500);