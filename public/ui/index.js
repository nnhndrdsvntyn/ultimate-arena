import { writer } from '../helpers.js';
import { ws, Vars } from '../client.js';
import { ENTITIES } from '../game.js';
import {
    isMobile,
    THROW_BTN_CONFIG,
    PICKUP_BTN_CONFIG,
    DROP_BTN_CONFIG,
    ATTACK_BTN_CONFIG,
    HOTBAR_CONFIG,
    ACCESSORY_SLOT_CONFIG,
    INVENTORY_CONFIG,
    UPDATES_LOG,
    version
} from './config.js';
import { uiState, uiRefs } from './context.js';
import {
    createShieldIcon,
    createCombatText,
    createComboText,
    createHomeBlurButton,
    createFullscreenButton,
    setupVersion,
    setupUpdateLog,
    updateMobileUIState,
    updateHUDVisibility,
    updateShieldUI
} from './hud.js';
import { ACCESSORY_KEYS } from '../shared/datamap.js';
import { createSettingsButton, createSettingsModal, updateSettingsBody } from './settings.js';
import { createShopButton, createShopModal, updateShopBody } from './shop.js';
import { createChatUI } from './chat.js';
import {
    setupKeyboardControls,
    setupDesktopControls,
    setupMobileControls,
    toggleInventoryModal,
    isClickingHotbar,
    isClickingInventory,
    isClickingAccessorySlot
} from './controls.js';
import { showNotification } from './notifications.js';
import { createEl } from './dom.js';

// --- Version Info ---
document.title = `Ultimate Arena (${version})`;
console.log(`%cUltimate Arena ${version}`, 'color: #b79a6b; font-size: 16px; font-weight: bold;');

// --- UI Initialization ---
export function initializeUI() {
    const hudContainer = document.getElementById('game-hud');
    if (!hudContainer) return;

    const cursorEl = isMobile ? null : createEl('div', {}, document.body, { id: 'custom-cursor' });
    const isPointerTarget = (target) => {
        if (!target) return false;
        if (target.closest('button, input, select, textarea, a, label')) return true;
        if (target.closest('.settings-modal, .shop-item, .settings-tab, .toggle-switch, .hotbar-slot, #hotbar')) return true;
        if (target.closest('#chatInput, #chat-command-list, #chat-suggest-list')) return true;
        if (target.closest('#top-left-bar')) return true;
        return false;
    };
    const setCursorClass = (cls) => {
        if (!cursorEl) return;
        cursorEl.classList.remove('pointer', 'palm', 'palm-clenched');
        if (cls) cursorEl.classList.add(cls);
    };
    const updateCursorStyle = (target) => {
        const cx = window._lastCursorX ?? 0;
        const cy = window._lastCursorY ?? 0;
        const hotbarIdx = isClickingHotbar(cx, cy);
        const invIdx = isClickingInventory(cx, cy);
        const isAccessorySlot = isClickingAccessorySlot(cx, cy);

        if (window._cursorDragging) {
            setCursorClass('palm-clenched');
            return;
        }
        if (hotbarIdx === 5) {
            setCursorClass('pointer');
            return;
        }
        if (hotbarIdx !== -1) {
            const item = Vars.myInventory?.[hotbarIdx] || 0;
            if (item > 0) {
                setCursorClass('palm');
                return;
            }
        }
        if (invIdx !== -1) {
            const item = Vars.myInventory?.[invIdx] || 0;
            if (item > 0) {
                setCursorClass('palm');
                return;
            }
        }
        if (isAccessorySlot) {
            const myPlayer = ENTITIES.PLAYERS[Vars.myId];
            if ((myPlayer?.accessoryId || 0) > 0) {
                setCursorClass('palm');
                return;
            }
        }
        if (isPointerTarget(target)) {
            setCursorClass('pointer');
            return;
        }
        setCursorClass(null);
    };
    const isDragTargetAtPos = () => {
        const cx = window._lastCursorX ?? 0;
        const cy = window._lastCursorY ?? 0;
        const hotbarIdx = isClickingHotbar(cx, cy);
        if (hotbarIdx !== -1 && hotbarIdx !== 5) {
            return (Vars.myInventory?.[hotbarIdx] || 0) > 0;
        }
        const invIdx = isClickingInventory(cx, cy);
        if (invIdx !== -1 && (Vars.myInventory?.[invIdx] || 0) > 0) return true;
        if (isClickingAccessorySlot(cx, cy)) {
            const myPlayer = ENTITIES.PLAYERS[Vars.myId];
            return (myPlayer?.accessoryId || 0) > 0;
        }
        return false;
    };
    const showCursor = () => { if (cursorEl) cursorEl.style.display = 'block'; };
    const hideCursor = () => { if (cursorEl) cursorEl.style.display = 'none'; };
    const updateCursorPos = (x, y, target) => {
        if (!cursorEl) return;
        showCursor();
        window._lastCursorX = x;
        window._lastCursorY = y;
        cursorEl.style.left = `${x}px`;
        cursorEl.style.top = `${y}px`;
        updateCursorStyle(target);
    };
    if (!isMobile) {
        document.addEventListener('pointermove', (e) => {
            updateCursorPos(e.clientX, e.clientY, e.target);
        }, true);
        document.addEventListener('mousemove', (e) => {
            updateCursorPos(e.clientX, e.clientY, e.target);
        }, true);
        document.addEventListener('mouseover', (e) => updateCursorStyle(e.target));
        window.addEventListener('wheel', () => {
            updateCursorStyle(document.elementFromPoint(window._lastCursorX || 0, window._lastCursorY || 0));
            showCursor();
        }, { passive: true });
        window.addEventListener('scroll', () => {
            updateCursorStyle(document.elementFromPoint(window._lastCursorX || 0, window._lastCursorY || 0));
            showCursor();
        }, { passive: true });
        document.addEventListener('scroll', () => {
            updateCursorStyle(document.elementFromPoint(window._lastCursorX || 0, window._lastCursorY || 0));
            showCursor();
        }, true);
        document.addEventListener('mousedown', (e) => {
            window._cursorDragging = isDragTargetAtPos();
            updateCursorStyle(e.target);
        });
        document.addEventListener('mouseup', () => {
            window._cursorDragging = false;
            updateCursorStyle(document.elementFromPoint(window._lastCursorX || 0, window._lastCursorY || 0));
        });
        document.addEventListener('mouseleave', hideCursor);
        document.addEventListener('mouseenter', showCursor);
    }

    const topLeftBar = createEl('div', {}, hudContainer, { id: 'top-left-bar' });

    createShieldIcon(topLeftBar);
    createCombatText(hudContainer);
    createComboText(hudContainer);
    createSettingsButton(topLeftBar);
    createFullscreenButton(topLeftBar);
    createShopButton(topLeftBar);
    createHomeBlurButton();
    createSettingsModal(hudContainer);
    createShopModal(hudContainer);
    createChatUI(hudContainer);
    setupKeyboardControls();
    setupDesktopControls();
    setupMobileControls(hudContainer);
    setupVersion();
    setupUpdateLog();
    window.updateSettingsBody = updateSettingsBody;

    updateHUDVisibility(false);
    updateMobileUIState();
}

// --- Periodic Updates ---
let lastShownVikingComboCount = 0;
setInterval(() => {
    if (uiState.isSettingsOpen && uiState.activeTab === 'Stats') {
        updateSettingsBody();
    }
    if (uiRefs.combatText) {
        uiRefs.combatText.style.display = Vars.inCombat ? 'block' : 'none';
    }
    if (uiRefs.comboText) {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        const accessoryKey = ACCESSORY_KEYS[myPlayer?.accessoryId || 0];
        const comboCount = Vars.vikingComboCount || 0;
        const showCombo = accessoryKey === 'viking-hat' && comboCount > 0;
        uiRefs.comboText.textContent = `Combo: ${comboCount}/3`;
        uiRefs.comboText.style.display = showCombo ? 'block' : 'none';

        if (showCombo && comboCount !== lastShownVikingComboCount) {
            if (typeof uiRefs.comboText.animate === 'function') {
                uiRefs.comboText.animate([
                    { transform: 'translateX(-50%) scale(1)' },
                    { transform: 'translateX(-50%) scale(1.18)' },
                    { transform: 'translateX(-50%) scale(1)' }
                ], {
                    duration: 220,
                    easing: 'ease-out'
                });
            }
        }
        lastShownVikingComboCount = comboCount;
    }
}, 100);

// ping
setInterval(() => {
    writer.reset();
    writer.writeU8(9);
    ws.send(writer.getBuffer());
    Vars.lastSentPing = Date.now();
}, 1500);

// --- Exports ---
export {
    isMobile,
    THROW_BTN_CONFIG,
    PICKUP_BTN_CONFIG,
    DROP_BTN_CONFIG,
    ATTACK_BTN_CONFIG,
    HOTBAR_CONFIG,
    ACCESSORY_SLOT_CONFIG,
    INVENTORY_CONFIG,
    UPDATES_LOG,
    uiState,
    updateSettingsBody,
    updateShopBody,
    toggleInventoryModal,
    showNotification,
    updateHUDVisibility,
    updateShieldUI,
    isClickingHotbar,
    isClickingInventory,
    isClickingAccessorySlot,
    updateMobileUIState
};
