import {
    Settings,
    Vars,
    setViewRangeMult,
    setBackBufferQuality,
    VIEW_RANGE_MIN,
    VIEW_RANGE_MAX,
    VIEW_RANGE_STEP,
    VIEW_RANGE_MOBILE_DEFAULT,
    VIEW_RANGE_PC_DEFAULT,
    VIEW_RANGE_RECOMMENDED_MOBILE,
    VIEW_RANGE_RECOMMENDED_DESKTOP
} from '../client.js';
import { sendAdminKey } from '../helpers.js';
import { BACK_BUFFER_QUALITIES } from './config.js';
import { createEl, makeDraggable } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { resetInputs } from './input.js';
import { SWORD_IDS, SPEAR_IDS, AXE_IDS, getWeaponConfig, getWeaponDisplayName } from '../shared/datamap.js';

const TEMP_WEAPON_IDS = {
    sword: SWORD_IDS.filter(id => id !== 1).slice(0, 12),
    axe: AXE_IDS.slice(0, 12),
    spear: SPEAR_IDS.slice(0, 12)
};

const TEMP_WEAPON_LABELS = {
    sword: 'Sword',
    axe: 'Axe',
    spear: 'Spear'
};

export function createSettingsButton(parent) {
    const btn = createEl('button', {
        backgroundImage: 'url("./images/ui/settings_gear.png")',
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
    uiRefs.settingsOverlay = createEl('div', {}, parent, { className: 'modal_overlay' });
    uiRefs.settingsModal = createEl('div', {}, uiRefs.settingsOverlay, { className: 'settings_modal' });

    // Header (Draggable Handle)
    const header = createEl('div', { cursor: 'move' }, uiRefs.settingsModal, { className: 'settings_header' });
    createEl('h2', {}, header, { textContent: 'SETTINGS' });
    const closeBtn = createEl('button', {}, header, { className: 'close_settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleSettingsModal(false);

    makeDraggable(uiRefs.settingsModal, header);

    // Tabs
    const tabsContainer = createEl('div', {}, uiRefs.settingsModal, { className: 'settings_tabs' });
    const tabs = ['Visuals', 'Audio', 'Stats', 'Admin', 'Temp'];
    tabs.forEach((tab) => {
        const tabEl = createEl('div', {}, tabsContainer, {
            className: `settings_tab ${tab === uiState.activeTab ? 'active' : ''}`,
            textContent: tab
        });
        tabEl.onclick = () => {
            uiState.activeTab = tab;
            document.querySelectorAll('.settings_tab').forEach(el => el.classList.remove('active'));
            tabEl.classList.add('active');
            updateSettingsBody();
        };
    });

    // Body
    uiRefs.settingsBody = createEl('div', {}, uiRefs.settingsModal, { className: 'settings_body' });
    updateSettingsBody();
}

export function updateSettingsBody() {
    if (!uiRefs.settingsBody) return;
    uiRefs.settingsBody.innerHTML = '';

    const visualClass = uiRefs.settingsBody.classList.contains('visual_tab');
    if (uiState.activeTab === 'Visuals') {
        uiRefs.settingsBody.classList.add('visual_tab');
    } else if (visualClass) {
        uiRefs.settingsBody.classList.remove('visual_tab');
    }

    switch (uiState.activeTab) {
        case 'Visuals': renderVisualsTab(); break;
        case 'Audio': renderAudioTab(); break;
        case 'Stats': renderStatsTab(); break;
        case 'Admin': renderAdminTab(); break;
        case 'Temp': renderTempTab(); break;
    }
}

export function toggleSettingsModal(show) {
    uiState.isSettingsOpen = show;
    if (uiRefs.settingsOverlay) uiRefs.settingsOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        resetInputs();
    }
}

function renderAudioTab() {
    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'Volume' });
    addRangeSetting(uiRefs.settingsBody, 'General Volume', {
        value: Vars.generalVolume,
        min: 0,
        max: 100,
        step: 1,
        isPercentage: true,
        onChange: (value) => { Vars.generalVolume = value; }
    });
    addRangeSetting(uiRefs.settingsBody, 'UI Volume', {
        value: Vars.uiVolume,
        min: 0,
        max: 100,
        step: 1,
        isPercentage: true,
        onChange: (value) => { Vars.uiVolume = value; }
    });
    addRangeSetting(uiRefs.settingsBody, 'In-Game Sound', {
        value: Vars.inGameSoundVolume,
        min: 0,
        max: 100,
        step: 1,
        isPercentage: true,
        onChange: (value) => { Vars.inGameSoundVolume = value; }
    });
}

function renderVisualsTab() {
    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'General' });
    addToggleSetting(uiRefs.settingsBody, 'Render Grid', 'renderGrid', (val) => Settings.renderGrid = val);

    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'Minimap' });
    addToggleSetting(uiRefs.settingsBody, 'Show Nearby Mobs On Minimap (orange)', 'showMobsOnMinimap', (val) => Settings.showMobsOnMinimap = val);
    addToggleSetting(uiRefs.settingsBody, 'Show Nearby Chests On Minimap (brown)', 'showChestsOnMinimap', (val) => Settings.showChestsOnMinimap = val);

    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'View Distance' });
    addRangeSetting(uiRefs.settingsBody, 'View Range Multiplier', {
        value: Vars.viewRangeMult,
        min: VIEW_RANGE_MIN,
        max: VIEW_RANGE_MAX,
        step: VIEW_RANGE_STEP,
        onChange: (value) => setViewRangeMult(value)
    });
    createEl('div', { fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', userSelect: 'none' }, uiRefs.settingsBody, {
        className: 'range_default_note',
        textContent: `RECOMMENDED: MOBILE: ${VIEW_RANGE_RECOMMENDED_MOBILE.toFixed(1)} · DESKTOP: ${VIEW_RANGE_RECOMMENDED_DESKTOP.toFixed(1)}`
    });

    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'Back-buffer Quality' });
    const backBufferSelect = addSelectSetting(uiRefs.settingsBody, 'Resolution', BACK_BUFFER_QUALITIES, (value) => setBackBufferQuality(value));
    backBufferSelect.value = Vars.backBufferQuality;
}

function renderStatsTab() {
    const s = Vars.myStats;
    createStatItem(uiRefs.settingsBody, 'POINTS', s.availablePoints || 0);
    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'Current Combat Stats' });
    createStatItem(uiRefs.settingsBody, 'DMG (hit)', s.dmgHit);
    createStatItem(uiRefs.settingsBody, 'DMG (throw sword)', s.dmgThrow);
    createStatItem(uiRefs.settingsBody, 'SPEED', s.speed);
    createStatItem(uiRefs.settingsBody, 'HP', `${Math.floor(s.hp)} / ${Math.floor(s.maxHp)}`);
    createStatItem(uiRefs.settingsBody, 'REGEN / TICK', s.regenPerTick || 5);
}

function renderAdminTab() {
    if (!Vars.isAdmin) {
        renderAdminAuth();
    } else {
        createEl('div', { padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.7)' }, uiRefs.settingsBody, { textContent: 'Admin commands are now available via chat.' });
    }
}

function renderAdminAuth() {
    createEl('div', {}, uiRefs.settingsBody, { className: 'settings_section_header', textContent: 'Authentication' });
    addInputSetting(uiRefs.settingsBody, 'Admin Key', uiState.tempAdminKey, (val) => uiState.tempAdminKey = val, 'password');

    const btn = createEl('button', {
        marginTop: '20px', width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: 'white', fontWeight: 'bold',
        cursor: 'pointer', transition: 'all 0.2s', fontSize: '1rem'
    }, uiRefs.settingsBody, { textContent: 'Apply Key' });
    btn.classList.add('no_select');

    btn.onmouseover = () => btn.style.filter = 'brightness(1.1)';
    btn.onmouseout = () => btn.style.filter = 'none';
    btn.onclick = () => uiState.tempAdminKey && sendAdminKey(uiState.tempAdminKey);
}

function getTempState() {
    if (!uiState.tempWeaponEditor || typeof uiState.tempWeaponEditor !== 'object') {
        uiState.tempWeaponEditor = { category: 'sword', level: 1 };
    }
    const state = uiState.tempWeaponEditor;
    if (!TEMP_WEAPON_IDS[state.category]) state.category = 'sword';
    state.level = Math.max(1, Math.min(12, Math.floor(Number(state.level) || 1)));
    return state;
}

function getTempWeaponType(category, level) {
    return TEMP_WEAPON_IDS[category]?.[level - 1] || 0;
}

function getTempWeaponConfig() {
    const state = getTempState();
    const weaponType = getTempWeaponType(state.category, state.level);
    return { state, weaponType, config: getWeaponConfig(weaponType) };
}

function setTempWeaponNumber(field, value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    const { config } = getTempWeaponConfig();
    if (!config || typeof config !== 'object') return;

    if (field === 'width') {
        config.swordWidth = Math.max(1, next);
    } else if (field === 'height') {
        config.swordHeight = Math.max(1, next);
    } else if (field === 'offsetX') {
        if (!config.offset || typeof config.offset !== 'object') config.offset = { x: 0, y: 0 };
        config.offset.x = next;
    } else if (field === 'offsetY') {
        if (!config.offset || typeof config.offset !== 'object') config.offset = { x: 0, y: 0 };
        config.offset.y = next;
    }
}

function makeWeaponExportData() {
    const groups = [
        ['sword', TEMP_WEAPON_IDS.sword],
        ['axe', TEMP_WEAPON_IDS.axe],
        ['spear', TEMP_WEAPON_IDS.spear]
    ];
    const out = {};
    groups.forEach(([category, ids]) => {
        out[category] = ids.map((weaponType, idx) => {
            const cfg = getWeaponConfig(weaponType);
            const size = Array.isArray(cfg.size) ? cfg.size : [cfg.swordWidth || 100, cfg.swordHeight || 50];
            const offset = cfg.offset || {};
            return {
                level: idx + 1,
                type: weaponType,
                width: Math.max(1, Number(size[0]) || 100),
                height: Math.max(1, Number(size[1]) || 50),
                offsetX: Number(offset.x) || 0,
                offsetY: Number(offset.y) || 0
            };
        });
    });
    return out;
}

function downloadTempWeaponData() {
    const text = JSON.stringify(makeWeaponExportData(), null, 2);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ultimate-arena-weapon-render-data.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function renderTempTab() {
    const { state, weaponType, config } = getTempWeaponConfig();
    const offset = config.offset || {};
    const size = Array.isArray(config.size) ? config.size : [config.swordWidth || 100, config.swordHeight || 50];
    const displayName = getWeaponDisplayName(weaponType) || config.name || `${TEMP_WEAPON_LABELS[state.category]} ${state.level}`;

    createEl('div', { userSelect: 'none' }, uiRefs.settingsBody, {
        className: 'settings_section_header',
        textContent: 'Weapon Render Debug'
    });

    const selector = createEl('div', {}, uiRefs.settingsBody, { className: 'temp_editor_grid' });
    addTempSelect(selector, 'Weapon Type', Object.keys(TEMP_WEAPON_LABELS).map(value => ({
        value,
        label: TEMP_WEAPON_LABELS[value]
    })), state.category, (value) => {
        state.category = value;
        state.level = 1;
        updateSettingsBody();
    });
    addTempSelect(selector, 'Level', Array.from({ length: 12 }, (_, idx) => ({
        value: String(idx + 1),
        label: String(idx + 1)
    })), String(state.level), (value) => {
        state.level = Math.max(1, Math.min(12, Math.floor(Number(value) || 1)));
        updateSettingsBody();
    });

    createEl('div', {}, uiRefs.settingsBody, {
        className: 'temp_weapon_summary',
        textContent: `${displayName} · type ${weaponType}`
    });

    const fields = createEl('div', {}, uiRefs.settingsBody, { className: 'temp_editor_grid' });
    addTempNumberInput(fields, 'Width', Number(size[0]) || 100, (value) => setTempWeaponNumber('width', value));
    addTempNumberInput(fields, 'Height', Number(size[1]) || 50, (value) => setTempWeaponNumber('height', value));
    addTempNumberInput(fields, 'X Offset', Number(offset.x) || 0, (value) => setTempWeaponNumber('offsetX', value));
    addTempNumberInput(fields, 'Y Offset', Number(offset.y) || 0, (value) => setTempWeaponNumber('offsetY', value));

    const downloadBtn = createEl('button', {}, uiRefs.settingsBody, {
        className: 'temp_download_button no_select',
        type: 'button',
        textContent: 'Download Weapon Data'
    });
    downloadBtn.onclick = downloadTempWeaponData;
}

function addTempSelect(parent, label, options, value, onChange) {
    const item = createEl('label', {}, parent, { className: 'temp_field' });
    createEl('span', {}, item, { textContent: label });
    const select = createEl('select', {}, item, { className: 'setting_input temp_control' });
    options.forEach((opt) => {
        createEl('option', {}, select, {
            value: opt.value,
            textContent: opt.label
        });
    });
    select.value = value;
    select.onchange = () => onChange(select.value);
    return select;
}

function addTempNumberInput(parent, label, value, onChange) {
    const item = createEl('label', {}, parent, { className: 'temp_field' });
    createEl('span', {}, item, { textContent: label });
    const input = createEl('input', {}, item, {
        className: 'setting_input temp_control',
        type: 'number',
        step: '1',
        value: String(Math.round(value * 1000) / 1000)
    });
    input.oninput = () => onChange(input.value);
    return input;
}

function createStatItem(parent, label, value) {
    const item = createEl('div', { userSelect: 'none' }, parent, { className: 'stat_item' });
    createEl('div', {}, item, { className: 'stat_label', textContent: label });
    createEl('div', {}, item, { className: 'stat_value', textContent: value });
}

function addToggleSetting(parent, label, settingKey, onChange) {
    const item = createEl('div', { userSelect: 'none' }, parent, { className: 'setting_item' });
    createEl('div', {}, item, { className: 'setting_label', textContent: label });

    const toggle = createEl('div', {}, item, {
        className: `toggle_switch ${Settings[settingKey] ? 'on' : ''}`
    });
    createEl('div', {}, toggle, { className: 'toggle_knob' });

    toggle.onclick = () => {
        const isOn = toggle.classList.toggle('on');
        onChange(isOn);
    };
}

function addInputSetting(parent, label, initialValue, onChange, type = 'text') {
    const item = createEl('div', {}, parent, { className: 'setting_item' });
    createEl('div', {}, item, { className: 'setting_label', textContent: label });

    const input = createEl('input', {}, item, {
        className: 'setting_input',
        type: type,
        value: initialValue,
        placeholder: 'Enter...'
    });

    input.oninput = () => {
        onChange(input.value);
    };
    return input;
}

function addRangeSetting(parent, label, options) {
    const { value, min, max, step, onChange, isPercentage } = options;
    const container = createEl('div', {}, parent, { className: 'range_setting_item' });
    createEl('div', {}, container, { className: 'setting_label', textContent: label });

    const row = createEl('div', { display: 'flex', alignItems: 'center', gap: '10px' }, container, { className: 'range_input_row' });
    const slider = createEl('input', { flex: 1 }, row, {
        className: 'range_input',
        type: 'range',
        min,
        max,
        step,
        value: isPercentage ? value * 100 : value
    });
    const valueEl = createEl('div', {}, row, { className: 'range_value no_select', textContent: '' });
    const updateValueText = (num) => {
        const safe = typeof num === 'number' && Number.isFinite(num) ? num : 0;
        if (isPercentage) {
            valueEl.textContent = `${Math.round(safe)}%`;
        } else {
            valueEl.textContent = `${safe.toFixed(2)}`;
        }
    };
    updateValueText(isPercentage ? (value * 100) : value);

    slider.oninput = () => {
        const next = parseFloat(slider.value);
        if (!Number.isFinite(next)) return;
        updateValueText(next);
        const callbackValue = isPercentage ? (next / 100) : next;
        onChange(callbackValue);
    };
    return slider;
}

export function addSelectSetting(parent, label, options, onChange) {
    const item = createEl('div', {}, parent, { className: 'setting_item' });
    createEl('div', {}, item, { className: 'setting_label', textContent: label });

    const values = options.map(opt => {
        const isObject = typeof opt === 'object' && opt !== null;
        return {
            value: isObject ? opt.value : opt,
            label: isObject ? (opt.label ?? opt.value) : opt,
            disabled: !!(isObject && opt.disabled)
        };
    }).filter(opt => !opt.disabled);

    const control = createEl('div', {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(0, 0, 0, 0.5)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: 'white'
    }, item, { className: 'setting_input' });

    const makeArrowButton = (text) => createEl('button', {
        width: '36px',
        minWidth: '36px',
        height: '36px',
        border: '0',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.12)',
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: 'bold',
        cursor: 'pointer'
    }, control, {
        type: 'button',
        textContent: text
    });

    const prevBtn = makeArrowButton('‹');
    const valueEl = createEl('div', {
        flex: '1',
        padding: '8px 6px',
        textAlign: 'center',
        fontSize: '0.95rem',
        lineHeight: '1.2',
        userSelect: 'none'
    }, control, { className: 'no_select' });
    const nextBtn = makeArrowButton('›');

    let currentIndex = Math.max(0, values.findIndex(opt => opt.value === values[0]?.value));

    const sync = (emitChange = false) => {
        const current = values[currentIndex] || values[0] || { value: '', label: '' };
        valueEl.textContent = current.label;
        prevBtn.disabled = values.length <= 1;
        nextBtn.disabled = values.length <= 1;
        prevBtn.style.opacity = prevBtn.disabled ? '0.45' : '1';
        nextBtn.style.opacity = nextBtn.disabled ? '0.45' : '1';
        if (emitChange) onChange(current.value);
    };

    const move = (delta) => {
        if (values.length <= 1) return;
        currentIndex = (currentIndex + delta + values.length) % values.length;
        sync(true);
    };

    prevBtn.onclick = () => move(-1);
    nextBtn.onclick = () => move(1);

    sync(false);

    return {
        get value() {
            return values[currentIndex]?.value ?? '';
        },
        set value(nextValue) {
            const nextIndex = values.findIndex(opt => opt.value === nextValue);
            if (nextIndex >= 0) {
                currentIndex = nextIndex;
                sync(false);
            }
        }
    };
}
