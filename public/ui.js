import {
    sendChat, writer, encodeUsername, sendAdminKey, sendTpPosCommand,
    sendTpEntCommand,
    sendSetPlayerAttrCommand,
    sendPickupCommand,
    sendTpChestCommand,
    sendBreakAllChestsCommand
} from './helpers.js';
import { ENTITIES } from './game.js';
import { ws, Vars, Settings, LC } from './client.js';
import { dataMap, version } from './shared/datamap.js';

// --- Configuration & Constants ---
export const THROW_BTN_CONFIG = { xOffset: 70, yOffset: 140, radius: 45, touchPadding: 15 };
export const PICKUP_BTN_CONFIG = { xOffset: 180, yOffset: 140, radius: 45, touchPadding: 20 };
export const DROP_BTN_CONFIG = { xOffset: 70, yOffset: 260, radius: 40, touchPadding: 15 };
export const ATTACK_BTN_CONFIG = { xOffset: 160, yOffset: 260, radius: 55, touchPadding: 20 };

export const HOTBAR_CONFIG = {
    slotSize: 60,
    gap: 10,
    padding: 10,
    marginBottom: 20
};

export const UPDATES_LOG = [
    {
        version: 'v1.1.1',
        changes: ['More admin commands'],
        date: '2026-01-27'
    },
    {
        version: 'v1.2.0',
        changes: [
            'Adjusted chest drops',
            'Added hotbar, players can now hold multiple items',
            'Revamped images (new snowy rocks)',
            'Manual dropping, and picking up items',
            'Better mobile controls',
        ],
        date: '2026-01-29'
    }
];

export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- UI State ---
export let isChatOpen = false;
export let isSettingsOpen = false;
export let activeTab = 'Visuals';
let tempAdminKey = '';
const adminState = {
    tpPos: { type: 'PLAYER', id: '', x: '', y: '' },
    tpEnt: { type: 'PLAYER', id: '', targetType: 'PLAYER', targetId: '' },
    setAttr: { id: '', attr: 'SCORE', value: '' },
    tpChest: { id: '', type: 'ANY' }
};

// --- DOM References ---
let settingsBody;
let shieldIcon;
let chatInput;
let chatInputWrapper;
let settingsModal;
let settingsOverlay;

// --- Input State ---
const keys = new Set();
const activeJoystickKeys = { w: 0, a: 0, s: 0, d: 0 };

// --- Rotation Limiting ---
let lastRotationTime = 0;
let rotationQueue = null;
let rotationTimeout = null;

function sendRotation(angle) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN) return;

    const now = performance.now();
    const minInterval = 1000 / 30; // 60 FPS

    if (now - lastRotationTime >= minInterval) {
        // Send immediately
        _doSendRotation(angle);
        lastRotationTime = now;

        // If there was something queued, it's now stale
        rotationQueue = null;
        if (rotationTimeout) {
            clearTimeout(rotationTimeout);
            rotationTimeout = null;
        }
    } else {
        // Queue it
        rotationQueue = angle;
        if (!rotationTimeout) {
            rotationTimeout = setTimeout(() => {
                const pendingAngle = rotationQueue;
                rotationQueue = null;
                rotationTimeout = null;
                if (pendingAngle !== null) {
                    sendRotation(pendingAngle);
                }
            }, minInterval - (now - lastRotationTime));
        }
    }
}

function _doSendRotation(angle) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer) return;
    writer.reset();
    writer.writeU8(2);
    writer.writeF32(angle);
    ws.send(writer.getBuffer());
    if (myPlayer.swingState === 0) myPlayer.angle = angle;
}

function resetInputs() {
    if (ws?.readyState !== ws.OPEN) return;

    // Reset movement keys (W, A, S, D)
    [1, 2, 3, 4].forEach(keyCode => {
        writer.reset();
        writer.writeU8(3);
        writer.writeU8(keyCode);
        writer.writeU8(0);
        ws.send(writer.getBuffer());
    });

    // Reset attack state
    writer.reset();
    writer.writeU8(4);
    writer.writeU8(0);
    ws.send(writer.getBuffer());

    // Clear local input state
    keys.clear();
    Object.keys(activeJoystickKeys).forEach(k => activeJoystickKeys[k] = 0);
}

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
    setupKeyboardControls();
    setupDesktopControls();
    setupMobileControls(hudContainer);
    setupVersion();
    setupUpdateLog();
    window.updateSettingsBody = updateSettingsBody;

    updateMobileUIState();
}

export function updateMobileUIState() {
    const joy = document.getElementById('joystick-container');
    const chatBtn = document.getElementById('mobile-chat-btn');
    const isHome = document.getElementById('home-screen').style.display !== 'none';
    const show = (isMobile || Settings.forceMobileUI) && !isHome;

    if (joy) joy.style.display = show ? 'block' : 'none';
    if (chatBtn) chatBtn.style.display = (show && !isChatOpen) ? 'flex' : 'none';
}

function setupVersion() {
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

function setupUpdateLog() {
    const homeScreen = document.getElementById('home-screen');
    if (!homeScreen) return;

    // Container for the update log
    const updateLog = createEl('div', {
        position: 'absolute',
        bottom: '2rem',
        right: '2rem',
        width: '320px',
        maxHeight: '250px',
        overflowY: 'auto',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    }, homeScreen, { id: 'update-log' });

    // Header
    createEl('div', {
        fontSize: '0.9rem',
        fontWeight: '800',
        color: '#38bdf8',
        textTransform: 'uppercase',
        letterSpacing: '0.1rem',
        marginBottom: '12px',
        borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
        paddingBottom: '8px'
    }, updateLog, { textContent: 'Update Log' });

    // Update entries - add new versions at the top
    [...UPDATES_LOG].reverse().forEach(update => {
        // Version header
        createEl('div', {
            fontSize: '0.85rem',
            fontWeight: '700',
            color: '#f8fafc',
            marginBottom: '4px',
            marginTop: '8px'
        }, updateLog, { textContent: update.version });

        // Changes list
        update.changes.forEach(change => {
            createEl('div', {
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.6)',
                paddingLeft: '8px',
                marginBottom: '2px'
            }, updateLog, { textContent: `• ${change}` });
        });

        // Date
        createEl('div', {
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)',
            textAlign: 'right',
            marginTop: '4px'
        }, updateLog, { textContent: update.date });
    });
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

    // Header (Draggable Handle)
    const header = createEl('div', {}, settingsModal, { className: 'settings-header' });
    header.style.cursor = 'move';
    createEl('h2', {}, header, { textContent: 'SETTINGS' });
    const closeBtn = createEl('button', {}, header, { className: 'close-settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleSettingsModal(false);

    // Draggable Logic
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    header.onmousedown = (e) => {
        if (e.target === closeBtn) return;
        isDragging = true;
        const rect = settingsModal.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;

        // Remove 'align-items' and 'justify-content' from overlay to allow absolute positioning
        settingsOverlay.style.alignItems = 'flex-start';
        settingsOverlay.style.justifyContent = 'flex-start';
        settingsModal.style.position = 'absolute';
        settingsModal.style.left = rect.left + 'px';
        settingsModal.style.top = rect.top + 'px';
        settingsModal.style.margin = '0';
    };

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        settingsModal.style.left = (e.clientX - offset.x) + 'px';
        settingsModal.style.top = (e.clientY - offset.y) + 'px';
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Tabs
    const tabsContainer = createEl('div', {}, settingsModal, { className: 'settings-tabs' });
    const tabs = ['Visuals', 'Stats', 'Admin'];
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
}

export function updateSettingsBody() {
    if (!settingsBody) return;
    settingsBody.innerHTML = '';

    switch (activeTab) {
        case 'Visuals': renderVisualsTab(); break;
        case 'Stats': renderStatsTab(); break;
        case 'Admin': renderAdminTab(); break;
    }
}

function renderVisualsTab() {
    createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'General' });
    addToggleSetting(settingsBody, 'Render Grid', 'renderGrid', (val) => Settings.renderGrid = val);
    addToggleSetting(settingsBody, 'Show Hitboxes', 'drawHitboxes', (val) => Settings.drawHitboxes = val);
    addToggleSetting(settingsBody, 'Show Player Ids', 'showPlayerIds', (val) => Settings.showPlayerIds = val);

    createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'Minimap' });
    addToggleSetting(settingsBody, 'Show Minimap', 'showMinimap', (val) => Settings.showMinimap = val);
    addToggleSetting(settingsBody, 'Show Nearby Mobs On Minimap (orange)', 'showMobsOnMinimap', (val) => Settings.showMobsOnMinimap = val);
    addToggleSetting(settingsBody, 'Show Nearby Players On Minimap (red)', 'showPlayersOnMinimap', (val) => Settings.showPlayersOnMinimap = val);
    addToggleSetting(settingsBody, 'Show Nearby Chests On Minimap (brown)', 'showChestsOnMinimap', (val) => Settings.showChestsOnMinimap = val);

    createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'Controls' });
    addToggleSetting(settingsBody, 'Force Mobile UI', 'forceMobileUI', (val) => {
        Settings.forceMobileUI = val;
        updateMobileUIState();
    });
}

function renderStatsTab() {
    const s = Vars.myStats;
    createStatItem(settingsBody, 'DMG (hit)', s.dmgHit);
    createStatItem(settingsBody, 'DMG (throw sword)', s.dmgThrow);
    createStatItem(settingsBody, 'SPEED', s.speed);
    createStatItem(settingsBody, 'HP', `${Math.floor(s.hp)} / ${Math.floor(s.maxHp)}`);
}

function renderAdminTab() {
    if (!Vars.isAdmin) {
        renderAdminAuth();
    } else {
        renderAdminDashboard();
    }
}

function renderAdminAuth() {
    createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'Authentication' });
    addInputSetting(settingsBody, 'Admin Key', tempAdminKey, (val) => tempAdminKey = val, 'password');

    const btn = createEl('button', {
        marginTop: '20px', width: '100%', padding: '12px', background: '#38bdf8',
        border: 'none', borderRadius: '10px', color: '#0f172a', fontWeight: '800',
        cursor: 'pointer', transition: 'all 0.2s', fontSize: '1rem',
        textTransform: 'uppercase', letterSpacing: '1px'
    }, settingsBody, { textContent: 'Apply Key' });

    btn.onmouseover = () => btn.style.filter = 'brightness(1.1)';
    btn.onmouseout = () => btn.style.filter = 'none';
    btn.onclick = () => tempAdminKey && sendAdminKey(tempAdminKey);
}

function renderAdminDashboard() {
    createEl('div', {}, settingsBody, { className: 'settings-section-header', textContent: 'Admin Dashboard' });

    renderAdminTpPos();
    renderAdminTpEnt();
    renderAdminSetAttr();
    renderAdminTpChest();
    renderAdminBreakChests();
}

function renderAdminTpPos() {
    createEl('div', { marginBottom: '10px', fontSize: '0.9rem', color: '#38bdf8', fontWeight: 'bold' }, settingsBody, { textContent: 'COMMAND: TPPOS TO POS' });
    const posTypeSelect = addSelectSetting(settingsBody, 'Target Type', ['PLAYER', 'MOB'], (val) => adminState.tpPos.type = val);
    posTypeSelect.value = adminState.tpPos.type;

    addInputSetting(settingsBody, 'Target ID', adminState.tpPos.id, (val) => adminState.tpPos.id = val, 'number');
    const posXInput = addInputSetting(settingsBody, 'X Pos', adminState.tpPos.x, (val) => adminState.tpPos.x = val, 'number');
    const posYInput = addInputSetting(settingsBody, 'Y Pos', adminState.tpPos.y, (val) => adminState.tpPos.y = val, 'number');

    const applyPosBtn = createEl('button', {
        width: '100%', padding: '10px', background: '#38bdf8', border: 'none', borderRadius: '8px',
        color: '#0f172a', fontWeight: '700', cursor: 'pointer', marginBottom: '25px'
    }, settingsBody, { textContent: 'TP ENTITY TO POS' });

    applyPosBtn.onclick = () => {
        const type = adminState.tpPos.type === 'PLAYER' ? 1 : 2;
        const id = parseInt(adminState.tpPos.id);
        const x = parseInt(posXInput.value);
        const y = parseInt(posYInput.value);
        if (isNaN(id) || isNaN(x) || isNaN(y)) return showNotification("Invalid values!", "red");
        sendTpPosCommand(type, id, x, y);
    };
}

function renderAdminTpEnt() {
    createEl('div', { marginBottom: '10px', fontSize: '0.9rem', color: '#38bdf8', fontWeight: 'bold' }, settingsBody, { textContent: 'COMMAND: TP ENTITY TO ENTITY' });
    const entTypeSelect = addSelectSetting(settingsBody, 'Entity Type', ['PLAYER', 'MOB'], (val) => adminState.tpEnt.type = val);
    entTypeSelect.value = adminState.tpEnt.type;
    addInputSetting(settingsBody, 'Entity ID', adminState.tpEnt.id, (val) => adminState.tpEnt.id = val, 'number');

    const targetTypeSelect = addSelectSetting(settingsBody, 'Target Type', ['PLAYER', 'MOB'], (val) => adminState.tpEnt.targetType = val);
    targetTypeSelect.value = adminState.tpEnt.targetType;
    addInputSetting(settingsBody, 'Target ID', adminState.tpEnt.targetId, (val) => adminState.tpEnt.targetId = val, 'number');

    const applyEntBtn = createEl('button', {
        width: '100%', padding: '10px', background: '#38bdf8', border: 'none', borderRadius: '8px',
        color: '#0f172a', fontWeight: '700', cursor: 'pointer', marginBottom: '10px'
    }, settingsBody, { textContent: 'TP ENTITY TO ENTITY' });

    applyEntBtn.onclick = () => {
        const type = adminState.tpEnt.type === 'PLAYER' ? 1 : 2;
        const id = parseInt(adminState.tpEnt.id);
        const targetType = adminState.tpEnt.targetType === 'PLAYER' ? 1 : 2;
        const targetId = parseInt(adminState.tpEnt.targetId);
        if (isNaN(id) || isNaN(targetId)) return showNotification("Invalid IDs!", "red");
        sendTpEntCommand(type, id, targetType, targetId);
    };
}

function renderAdminSetAttr() {
    createEl('div', { marginBottom: '10px', fontSize: '0.9rem', color: '#38bdf8', fontWeight: 'bold' }, settingsBody, { textContent: 'COMMAND: SET PLAYER ATTRIBUTE' });
    addInputSetting(settingsBody, 'Player ID', adminState.setAttr.id, (val) => adminState.setAttr.id = val, 'number');

    const attrSelect = addSelectSetting(settingsBody, 'Attribute', ['SCORE', 'SPEED', 'INVINCIBLE', 'WEAPON', 'STRENGTH'], (val) => {
        adminState.setAttr.attr = val;
        updateAttrValueInputHints(attrValueInput, val);
    });
    attrSelect.value = adminState.setAttr.attr;

    const attrValueInput = addInputSetting(settingsBody, 'Value', adminState.setAttr.value, (val) => adminState.setAttr.value = val, 'number');
    updateAttrValueInputHints(attrValueInput, attrSelect.value);

    const applyAttrBtn = createEl('button', {
        width: '100%', padding: '10px', background: '#38bdf8', border: 'none', borderRadius: '8px',
        color: '#0f172a', fontWeight: '700', cursor: 'pointer', marginBottom: '10px'
    }, settingsBody, { textContent: 'SET ATTRIBUTE' });

    applyAttrBtn.onclick = () => {
        const id = parseInt(adminState.setAttr.id);
        const attr = adminState.setAttr.attr;
        const attrMap = { 'SPEED': 1, 'SCORE': 2, 'INVINCIBLE': 3, 'WEAPON': 4, 'STRENGTH': 5 };
        const attrIdx = attrMap[attr] || 2;

        const value = parseFloat(adminState.setAttr.value);
        if (isNaN(id) || isNaN(value)) return showNotification("Invalid values!", "red");

        if (attrIdx === 3 && value !== 0 && value !== 1) return showNotification("Invincible must be 0 or 1!", "red");
        if (attrIdx === 4 && (value < 1 || value > 7)) return showNotification("Weapon rank must be between 1 and 7!", "red");

        sendSetPlayerAttrCommand(id, attrIdx, value);
    };
}

function updateAttrValueInputHints(input, attr) {
    if (attr === 'INVINCIBLE') {
        input.min = '0'; input.max = '1'; input.placeholder = '0 or 1';
    } else if (attr === 'WEAPON') {
        input.min = '1'; input.max = '7'; input.placeholder = '1-7 (Rank)';
    } else {
        input.removeAttribute('min'); input.removeAttribute('max');
        input.placeholder = attr === 'STRENGTH' ? 'Any integer' : 'Enter...';
    }
}

function renderAdminTpChest() {
    createEl('div', { marginBottom: '10px', fontSize: '0.9rem', color: '#38bdf8', fontWeight: 'bold' }, settingsBody, { textContent: 'COMMAND: TP TO NEAREST CHEST' });
    addInputSetting(settingsBody, 'Player ID', adminState.tpChest.id, (val) => adminState.tpChest.id = val, 'number');

    const chestTypeSelect = addSelectSetting(settingsBody, 'Chest Type', ['ANY', 'CHEST 1', 'CHEST 2', 'CHEST 3', 'CHEST 4'], (val) => adminState.tpChest.type = val);
    chestTypeSelect.value = adminState.tpChest.type;

    const applyChestBtn = createEl('button', {
        width: '100%', padding: '10px', background: '#38bdf8', border: 'none', borderRadius: '8px',
        color: '#0f172a', fontWeight: '700', cursor: 'pointer', marginBottom: '10px'
    }, settingsBody, { textContent: 'TP TO CHEST' });

    applyChestBtn.onclick = () => {
        const id = parseInt(adminState.tpChest.id);
        if (isNaN(id)) return showNotification("Invalid ID!", "red");
        const chestMap = { 'ANY': 0, 'CHEST 1': 1, 'CHEST 2': 2, 'CHEST 3': 3, 'CHEST 4': 4 };
        sendTpChestCommand(id, chestMap[adminState.tpChest.type] || 0);
    };
}

function renderAdminBreakChests() {
    createEl('div', { marginBottom: '10px', fontSize: '0.9rem', color: '#ff4757', fontWeight: 'bold' }, settingsBody, { textContent: 'COMMAND: BREAK ALL CHESTS' });
    const breakChestsBtn = createEl('button', {
        width: '100%', padding: '10px', background: '#ff4757', border: 'none', borderRadius: '8px',
        color: 'white', fontWeight: '700', cursor: 'pointer', marginBottom: '10px'
    }, settingsBody, { textContent: 'BREAK ALL CHESTS' });

    breakChestsBtn.onclick = () => {
        const response = prompt("Would you like the chests to drop their loot? Enter '1' if yes.");
        if (response === '1') {
            if (confirm("Are you sure? This may cause a massive lag spike.")) {
                sendBreakAllChestsCommand(true);
            }
        } else {
            sendBreakAllChestsCommand(false);
        }
    };
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

function addInputSetting(parent, label, initialValue, onChange, type = 'text') {
    const item = createEl('div', {}, parent, { className: 'setting-item' });
    createEl('div', {}, item, { className: 'setting-label', textContent: label });

    const input = createEl('input', {}, item, {
        className: 'setting-input',
        type: type,
        value: initialValue,
        placeholder: 'Enter...'
    });

    input.oninput = () => {
        onChange(input.value);
    };
    return input;
}

function addSelectSetting(parent, label, options, onChange) {
    const item = createEl('div', {}, parent, { className: 'setting-item' });
    createEl('div', {}, item, { className: 'setting-label', textContent: label });

    const select = createEl('select', {
        background: 'rgba(15, 23, 42, 0.5)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: 'white',
        padding: '8px',
        outline: 'none',
    }, item, { className: 'setting-input' });

    options.forEach(opt => {
        const option = createEl('option', {}, select, { value: opt, textContent: opt });
    });

    select.onchange = () => {
        onChange(select.value);
    };
    return select;
}

function toggleSettingsModal(show) {
    isSettingsOpen = show;
    settingsOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        resetInputs();
    }
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

// --- Keyboard Input Logic ---
const KEY_MAP = {
    'w': 1, 'arrowup': 1,
    'a': 2, 'arrowleft': 2,
    's': 3, 'arrowdown': 3,
    'd': 4, 'arrowright': 4
};

function setupKeyboardControls() {
    const handleKey = (e, isDown) => {
        const keyName = e.key.toLowerCase();
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        const homeUsrnInput = document.getElementById('homeUsrnInput');

        if (keyName === 'escape') {
            if (isDown && isSettingsOpen) toggleSettingsModal(false);
            return;
        }

        if (keyName === 'enter') {
            if (isDown) handleChatToggle(myPlayer, homeUsrnInput);
            return;
        }

        if (isSettingsOpen || isChatOpen) return;

        if (isDown) {
            if (keys.has(keyName)) return;
            keys.add(keyName);
            handleGameplayKeyDown(keyName, myPlayer);
        } else {
            keys.delete(keyName);
        }

        if (KEY_MAP[keyName]) {
            sendMovementPacket(KEY_MAP[keyName], isDown ? 1 : 0);
        }
    };

    document.addEventListener('keydown', e => handleKey(e, true));
    document.addEventListener('keyup', e => handleKey(e, false));
}

function handleGameplayKeyDown(key, player) {
    if (!player?.isAlive) return;

    if (key === 'e') {
        sendThrowPacket();
    } else if (key === 'r') {
        sendPickupCommand();
    } else if (key === 'q') {
        sendDropPacket();
    } else if (['1', '2', '3'].includes(key)) {
        sendSelectSlotPacket(parseInt(key) - 1);
    }
}

function sendMovementPacket(dir, state) {
    writer.reset();
    writer.writeU8(3);
    writer.writeU8(dir);
    writer.writeU8(state);
    ws.send(writer.getBuffer());
}

function sendThrowPacket() {
    writer.reset();
    writer.writeU8(7);
    ws.send(writer.getBuffer());
}

function sendDropPacket() {
    writer.reset();
    writer.writeU8(14);
    ws.send(writer.getBuffer());
}

function sendSelectSlotPacket(slot) {
    writer.reset();
    writer.writeU8(16);
    writer.writeU8(slot);
    ws.send(writer.getBuffer());
}

function sendSwapPacket(slot1, slot2) {
    writer.reset();
    writer.writeU8(17);
    writer.writeU8(slot1);
    writer.writeU8(slot2);
    ws.send(writer.getBuffer());
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
        if (mobileChatBtn && (isMobile || Settings.forceMobileUI)) mobileChatBtn.style.display = 'flex';
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
        position: 'fixed', top: '10px', left: 'calc(50% - 180px)', width: '60px', height: '60px',
        pointerEvents: 'auto', borderRadius: '50%', border: 'none',
        background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)',
        color: 'white', fontSize: '28px', cursor: 'pointer',
        display: 'none', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.2s ease'
    }, container, { id: 'mobile-chat-btn', innerHTML: '💬' });

    chatBtn.onmouseover = () => chatBtn.style.background = 'rgba(15, 23, 42, 0.6)';
    chatBtn.onmouseout = () => chatBtn.style.background = 'rgba(15, 23, 42, 0.4)';

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
        border: '2px solid rgba(255, 255, 255, 0.1)',
        display: 'none' // Controlled by updateMobileUIState
    }, container, { id: 'joystick-container' });





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

    const updateKeys = (dx, dy) => {
        const newKeys = { w: dx > 10 ? 1 : 0, a: dx < -10 ? 1 : 0, s: dy > 10 ? 1 : 0, d: dy < -10 ? 1 : 0 };
        // Wait, the logic was: if (dy < -10) newKeys.w = 1; -> w is UP, so dy < -10
        const mappedKeys = {
            w: dy < -10 ? 1 : 0,
            s: dy > 10 ? 1 : 0,
            a: dx < -10 ? 1 : 0,
            d: dx > 10 ? 1 : 0
        };

        const keyToIndex = { w: 1, a: 2, s: 3, d: 4 };

        Object.keys(mappedKeys).forEach(key => {
            if (mappedKeys[key] !== activeJoystickKeys[key]) {
                sendMovementPacket(keyToIndex[key], mappedKeys[key]);
                activeJoystickKeys[key] = mappedKeys[key];
            }
        });
    };

    const onMove = (clientX, clientY) => {
        if (isChatOpen || isSettingsOpen || startX === undefined) return;

        let dx = clientX - startX;
        let dy = clientY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
            const ratio = maxDist / dist;
            dx *= ratio;
            dy *= ratio;
        }

        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        updateKeys(dx, dy);
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
        const touch = Array.from(e.changedTouches).find(t => t.identifier === moveId);
        if (touch) onMove(touch.clientX, touch.clientY);
    });

    container.addEventListener('mousedown', e => {
        if (isChatOpen || isSettingsOpen) return;
        startX = e.clientX;
        startY = e.clientY;
        moveId = 'mouse';

        const moveHandler = (me) => onMove(me.clientX, me.clientY);
        const upHandler = () => {
            resetJoystick();
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    });

    const resetJoystick = () => {
        moveId = null;
        startX = undefined;
        startY = undefined;
        knob.style.transform = `translate(-50%, -50%)`;
        updateKeys(0, 0);
    };

    container.addEventListener('touchend', resetJoystick);
    container.addEventListener('touchcancel', resetJoystick);
}

function setupMobileTouchActions(joyContainer, chatBtn) {
    let throwTouchId = null;
    let attackTouchId = null;

    const updateRotationFromTouch = (x, y) => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN || myPlayer.swingState !== 0) return;

        const angle = Math.atan2(y - innerHeight / 2, x - innerWidth / 2);
        sendRotation(angle);
    };

    window.addEventListener('touchstart', (e) => {
        if (e.target === joyContainer || e.target === chatBtn || e.target === chatInput || isSettingsOpen) return;

        Array.from(e.changedTouches).forEach(t => {
            if (isButtonTouched(t.clientX, t.clientY, THROW_BTN_CONFIG)) {
                const myPlayer = ENTITIES.PLAYERS[Vars.myId];
                if (myPlayer?.hasWeapon) sendThrowPacket();
                throwTouchId = t.identifier;
            } else if (isButtonTouched(t.clientX, t.clientY, ATTACK_BTN_CONFIG)) {
                sendAttackPacket(1);
                attackTouchId = t.identifier;
            } else if (isButtonTouched(t.clientX, t.clientY, PICKUP_BTN_CONFIG)) {
                sendPickupCommand();
            } else if (isButtonTouched(t.clientX, t.clientY, DROP_BTN_CONFIG)) {
                sendDropPacket();
            } else {
                updateRotationFromTouch(t.clientX, t.clientY);
                // Removed: tapping screen no longer attacks
            }
        });
    });

    window.addEventListener('touchmove', (e) => {
        if (isSettingsOpen) return;
        Array.from(e.changedTouches).forEach(t => {
            if (e.target !== joyContainer && t.identifier !== throwTouchId && t.identifier !== attackTouchId) {
                updateRotationFromTouch(t.clientX, t.clientY);
            }
        });
    });

    window.addEventListener('touchend', (e) => {
        Array.from(e.changedTouches).forEach(t => {
            if (t.identifier === throwTouchId) {
                throwTouchId = null;
            } else if (t.identifier === attackTouchId) {
                attackTouchId = null;
                sendAttackPacket(0);
            }
        });
    });
}

function isButtonTouched(clientX, clientY, config) {
    // Scale screen coordinates to internal canvas coordinates
    const sx = clientX * (LC.width / window.innerWidth);
    const sy = clientY * (LC.height / window.innerHeight);

    const btnX = LC.width - config.xOffset;
    const btnY = LC.height - config.yOffset;
    const dist = Math.sqrt(Math.pow(sx - btnX, 2) + Math.pow(sy - btnY, 2));
    return dist <= config.radius + (config.touchPadding || 0);
}

// --- Desktop Controls ---
function setupDesktopControls() {
    window.addEventListener("mousemove", (e) => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN || isSettingsOpen || Vars.dragSlot !== -1) return;

        const angle = Math.atan2(e.clientY - innerHeight / 2, e.clientX - innerWidth / 2);
        sendRotation(angle);
    });

    window.addEventListener("mousedown", (e) => {
        if (isUIElement(e.target)) return;

        // Support mobile button clicks on desktop if forced
        if (Settings.forceMobileUI) {
            const x = e.clientX, y = e.clientY;
            if (isButtonTouched(x, y, THROW_BTN_CONFIG)) {
                const myPlayer = ENTITIES.PLAYERS[Vars.myId];
                if (myPlayer?.hasWeapon) sendThrowPacket();
                return;
            }
            if (isButtonTouched(x, y, PICKUP_BTN_CONFIG)) {
                sendPickupCommand();
                return;
            }
            if (isButtonTouched(x, y, DROP_BTN_CONFIG)) {
                sendDropPacket();
                return;
            }
        }

        const slotClicked = isClickingHotbar(e.clientX, e.clientY);
        if (slotClicked !== -1) {
            handleHotbarSelection(slotClicked);
            return;
        }

        if (e.button === 0) sendAttackPacket(1);
    });

    window.addEventListener("mouseup", (e) => {
        if (Vars.dragSlot !== -1) {
            handleHotbarSwap(e.clientX, e.clientY);
        }
        if (e.button === 0) sendAttackPacket(0);
    });
}

function sendAttackPacket(state) {
    if (isChatOpen || isSettingsOpen || ws?.readyState !== ws.OPEN) return;
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer?.isAlive) return;

    // Guard: Don't allow attack if slot is empty (optimistically checked)
    if (state === 1 && Vars.myInventory && Vars.myInventory[Vars.selectedSlot] === 0) return;

    writer.reset();
    writer.writeU8(4);
    writer.writeU8(state);
    ws.send(writer.getBuffer());
}

function isUIElement(target) {
    const interactableTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    if (interactableTags.includes(target.tagName)) return true;
    if (target.classList.contains('modal-overlay') || target.closest('.settings-modal')) return true;
    if (target.closest('.hotbar-slot') || target.closest('#hotbar')) return true;
    if (target.id === 'joystick-container' || target.closest('#joystick-container')) return true;
    return false;
}

function handleHotbarSelection(slot) {
    if (Vars.selectedSlot !== slot) {
        Vars.selectedSlot = slot;
        Vars.lastSelectionTime = performance.now();
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (myPlayer && Vars.myInventory) {
            myPlayer.weaponRank = Vars.myInventory[Vars.selectedSlot];
        }

        if (ws?.readyState === ws.OPEN) {
            sendSelectSlotPacket(slot);
        }
    }

    // Start drag if slot has an item
    if (Vars.myInventory && Vars.myInventory[slot] > 0) {
        Vars.dragSlot = slot;
    }
}

function handleHotbarSwap(clientX, clientY) {
    const slotUnderMouse = isClickingHotbar(clientX, clientY);

    // If we're not over a specific slot, check if we're at least in the general hotbar area
    // (A bit more forgiving than isClickingHotbar)
    let finalSlot = slotUnderMouse;
    if (finalSlot === -1) {
        const x = clientX * (LC.width / window.innerWidth);
        const y = clientY * (LC.height / window.innerHeight);
        const hb = HOTBAR_CONFIG;
        const totalWidth = (hb.slotSize * 3) + (hb.gap * 2) + (hb.padding * 2);
        const hX = (LC.width / 2) - (totalWidth / 2);
        const hY = LC.height - hb.marginBottom - (hb.slotSize + hb.padding * 2);

        if (y >= hY - 50 && y <= LC.height + 50) {
            for (let i = 0; i < 3; i++) {
                const sX = hX + hb.padding + (i * (hb.slotSize + hb.gap));
                if (x >= sX - 20 && x <= sX + hb.slotSize + 20) {
                    finalSlot = i;
                    break;
                }
            }
        }
    }

    if (finalSlot !== -1 && finalSlot !== Vars.dragSlot) {
        const temp = Vars.myInventory[Vars.dragSlot];
        Vars.myInventory[Vars.dragSlot] = Vars.myInventory[finalSlot];
        Vars.myInventory[finalSlot] = temp;

        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (myPlayer) myPlayer.weaponRank = Vars.myInventory[Vars.selectedSlot];

        Vars.lastSelectionTime = performance.now();

        if (ws?.readyState === ws.OPEN) {
            sendSwapPacket(Vars.dragSlot, finalSlot);
        }
    }
    Vars.dragSlot = -1;
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

    const isHome = document.getElementById('home-screen').style.display !== 'none';

    if (settingsBtn) settingsBtn.style.display = (!isHome && (isAlive || Settings.forceMobileUI)) ? 'flex' : 'none';
    if (fullscreenBtn) fullscreenBtn.style.display = (!isHome && (isAlive || Settings.forceMobileUI)) ? 'flex' : 'none';
    if (homeBlurBtn) homeBlurBtn.style.display = isAlive ? 'none' : 'flex';
    if (shieldIconEl) shieldIconEl.style.display = (isAlive && !isHome) ? 'block' : 'none';

    updateMobileUIState();
}

export function updateShieldUI(active) {
    const isAlive = ENTITIES.PLAYERS[Vars.myId]?.isAlive;
    const shieldIconEl = document.querySelector('[style*="pause-button.png"]');
    if (shieldIconEl) {
        shieldIconEl.style.display = (active && isAlive) ? 'block' : 'none';
    }
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

export function isClickingHotbar(clientX, clientY) {
    // Scale client coordinates to canvas internal coordinates (1440x760)
    const x = clientX * (LC.width / window.innerWidth);
    const y = clientY * (LC.height / window.innerHeight);

    const totalWidth = (HOTBAR_CONFIG.slotSize * 3) + (HOTBAR_CONFIG.gap * 2) + (HOTBAR_CONFIG.padding * 2);
    const startX = (LC.width / 2) - (totalWidth / 2);
    const endX = startX + totalWidth;
    const startY = LC.height - HOTBAR_CONFIG.marginBottom - (HOTBAR_CONFIG.slotSize + HOTBAR_CONFIG.padding * 2);
    const endY = LC.height - HOTBAR_CONFIG.marginBottom;

    if (x >= startX && x <= endX && y >= startY && y <= endY) {
        // Find which slot
        for (let i = 0; i < 3; i++) {
            const slotStartX = startX + HOTBAR_CONFIG.padding + (i * (HOTBAR_CONFIG.slotSize + HOTBAR_CONFIG.gap));
            const slotEndX = slotStartX + HOTBAR_CONFIG.slotSize;
            if (x >= slotStartX && x <= slotEndX) return i;
        }
    }

    return -1;
}