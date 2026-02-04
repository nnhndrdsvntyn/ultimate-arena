import { Settings, Vars } from '../client.js';
import { sendAdminKey } from '../helpers.js';
import { createEl, makeDraggable } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { resetInputs } from './input.js';

export function createSettingsButton(parent) {
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

export function createSettingsModal(parent) {
    uiRefs.settingsOverlay = createEl('div', {}, parent, { className: 'modal-overlay' });
    uiRefs.settingsModal = createEl('div', {}, uiRefs.settingsOverlay, { className: 'settings-modal' });

    // Header (Draggable Handle)
    const header = createEl('div', { cursor: 'move' }, uiRefs.settingsModal, { className: 'settings-header' });
    createEl('h2', {}, header, { textContent: 'SETTINGS' });
    const closeBtn = createEl('button', {}, header, { className: 'close-settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleSettingsModal(false);

    makeDraggable(uiRefs.settingsModal, header);

    // Tabs
    const tabsContainer = createEl('div', {}, uiRefs.settingsModal, { className: 'settings-tabs' });
    const tabs = ['Visuals', 'Stats', 'Admin'];
    tabs.forEach((tab) => {
        const tabEl = createEl('div', {}, tabsContainer, {
            className: `settings-tab ${tab === uiState.activeTab ? 'active' : ''}`,
            textContent: tab
        });
        tabEl.onclick = () => {
            uiState.activeTab = tab;
            document.querySelectorAll('.settings-tab').forEach(el => el.classList.remove('active'));
            tabEl.classList.add('active');
            updateSettingsBody();
        };
    });

    // Body
    uiRefs.settingsBody = createEl('div', {}, uiRefs.settingsModal, { className: 'settings-body' });
    updateSettingsBody();
}

export function updateSettingsBody() {
    if (!uiRefs.settingsBody) return;
    uiRefs.settingsBody.innerHTML = '';

    switch (uiState.activeTab) {
        case 'Visuals': renderVisualsTab(); break;
        case 'Stats': renderStatsTab(); break;
        case 'Admin': renderAdminTab(); break;
    }
}

export function toggleSettingsModal(show) {
    uiState.isSettingsOpen = show;
    if (uiRefs.settingsOverlay) uiRefs.settingsOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        resetInputs();
    }
}

function renderVisualsTab() {
    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings-section-header', textContent: 'General' });
    addToggleSetting(uiRefs.settingsBody, 'Render Grid', 'renderGrid', (val) => Settings.renderGrid = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Hitboxes', 'drawHitboxes', (val) => Settings.drawHitboxes = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Player Ids', 'showPlayerIds', (val) => Settings.showPlayerIds = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Chest Ids', 'showChestIds', (val) => Settings.showChestIds = val);

    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings-section-header', textContent: 'Minimap' });
    addToggleSetting(uiRefs.settingsBody, 'Show Minimap', 'showMinimap', (val) => Settings.showMinimap = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Nearby Mobs On Minimap (orange)', 'showMobsOnMinimap', (val) => Settings.showMobsOnMinimap = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Nearby Players On Minimap (red)', 'showPlayersOnMinimap', (val) => Settings.showPlayersOnMinimap = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Nearby Chests On Minimap (brown)', 'showChestsOnMinimap', (val) => Settings.showChestsOnMinimap = val);
}

function renderStatsTab() {
    const s = Vars.myStats;
    createStatItem(uiRefs.settingsBody, 'DMG (hit)', s.dmgHit);
    createStatItem(uiRefs.settingsBody, 'DMG (throw sword)', s.dmgThrow);
    createStatItem(uiRefs.settingsBody, 'SPEED', s.speed);
    createStatItem(uiRefs.settingsBody, 'HP', `${Math.floor(s.hp)} / ${Math.floor(s.maxHp)}`);
}

function renderAdminTab() {
    if (!Vars.isAdmin) {
        renderAdminAuth();
    } else {
        createEl('div', { padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.7)' }, uiRefs.settingsBody, { textContent: 'Admin commands are now available via chat.' });
    }
}

function renderAdminAuth() {
    createEl('div', {}, uiRefs.settingsBody, { className: 'settings-section-header', textContent: 'Authentication' });
    addInputSetting(uiRefs.settingsBody, 'Admin Key', uiState.tempAdminKey, (val) => uiState.tempAdminKey = val, 'password');

    const btn = createEl('button', {
        marginTop: '20px', width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: 'white', fontWeight: 'bold',
        cursor: 'pointer', transition: 'all 0.2s', fontSize: '1rem'
    }, uiRefs.settingsBody, { textContent: 'Apply Key' });

    btn.onmouseover = () => btn.style.filter = 'brightness(1.1)';
    btn.onmouseout = () => btn.style.filter = 'none';
    btn.onclick = () => uiState.tempAdminKey && sendAdminKey(uiState.tempAdminKey);
}

function createStatItem(parent, label, value) {
    const item = createEl('div', { userSelect: 'none' }, parent, { className: 'stat-item' });
    createEl('div', {}, item, { className: 'stat-label', textContent: label });
    createEl('div', {}, item, { className: 'stat-value', textContent: value });
}

function addToggleSetting(parent, label, settingKey, onChange) {
    const item = createEl('div', { userSelect: 'none' }, parent, { className: 'setting-item' });
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

export function addSelectSetting(parent, label, options, onChange) {
    const item = createEl('div', {}, parent, { className: 'setting-item' });
    createEl('div', {}, item, { className: 'setting-label', textContent: label });

    const select = createEl('select', {
        background: 'rgba(0, 0, 0, 0.5)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: 'white',
        padding: '8px',
        outline: 'none',
    }, item, { className: 'setting-input' });

    options.forEach(opt => {
        createEl('option', {}, select, { value: opt, textContent: opt });
    });

    select.onchange = () => {
        onChange(select.value);
    };
    return select;
}
