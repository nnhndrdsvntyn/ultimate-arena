import {
    Vars,
    setGeneralVolume,
    setUiVolume,
    setInGameSoundVolume,
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
import { BACK_BUFFER_QUALITIES } from './config.js';
import { createEl, makeDraggable, setAnimatedModalOpen } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { resetInputs } from './input.js';

const SETTINGS_TABS = ['Visuals', 'Audio'];

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
    uiRefs.settingsOverlay.style.display = 'none';
    uiRefs.settingsOverlay.setAttribute('aria-hidden', 'true');

    const blockOutsideClicks = (event) => {
        if (!uiState.isSettingsOpen) return;
        event.stopPropagation();
    };
    uiRefs.settingsOverlay.addEventListener('pointerdown', blockOutsideClicks);
    uiRefs.settingsOverlay.addEventListener('mousedown', blockOutsideClicks);
    uiRefs.settingsOverlay.addEventListener('click', blockOutsideClicks);
    uiRefs.settingsModal.addEventListener('pointerdown', blockOutsideClicks);
    uiRefs.settingsModal.addEventListener('mousedown', blockOutsideClicks);
    uiRefs.settingsModal.addEventListener('click', blockOutsideClicks);

    // Header (Draggable Handle)
    const header = createEl('div', { cursor: 'move' }, uiRefs.settingsModal, { className: 'settings_header' });
    createEl('h2', {}, header, { textContent: 'SETTINGS' });
    const closeBtn = createEl('button', {}, header, { className: 'close_settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleSettingsModal(false);

    makeDraggable(uiRefs.settingsModal, header);

    // Tabs
    if (!SETTINGS_TABS.includes(uiState.activeTab)) {
        uiState.activeTab = 'Visuals';
    }
    const tabsContainer = createEl('div', {}, uiRefs.settingsModal, { className: 'settings_tabs' });
    SETTINGS_TABS.forEach((tab) => {
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
        default:
            uiState.activeTab = 'Visuals';
            renderVisualsTab();
            break;
    }
}

export function toggleSettingsModal(show) {
    uiState.isSettingsOpen = show;
    setAnimatedModalOpen(uiRefs.settingsOverlay, uiRefs.settingsModal, show);
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
        onChange: (value) => { setGeneralVolume(value); }
    });
    addRangeSetting(uiRefs.settingsBody, 'UI Volume', {
        value: Vars.uiVolume,
        min: 0,
        max: 100,
        step: 1,
        isPercentage: true,
        onChange: (value) => { setUiVolume(value); }
    });
    addRangeSetting(uiRefs.settingsBody, 'In-Game Sound', {
        value: Vars.inGameSoundVolume,
        min: 0,
        max: 100,
        step: 1,
        isPercentage: true,
        onChange: (value) => { setInGameSoundVolume(value); }
    });
}

function renderVisualsTab() {
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

    const select = createEl('select', {}, item, { className: 'setting_input' });
    values.forEach((opt) => {
        createEl('option', {}, select, {
            value: opt.value,
            textContent: opt.label
        });
    });
    select.onchange = () => onChange(select.value);

    return {
        get value() {
            return select.value;
        },
        set value(nextValue) {
            select.value = nextValue;
        }
    };
}
