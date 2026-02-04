import { writer } from '../helpers.js';
import { ws, Vars } from '../client.js';
import {
    isMobile,
    THROW_BTN_CONFIG,
    PICKUP_BTN_CONFIG,
    DROP_BTN_CONFIG,
    ATTACK_BTN_CONFIG,
    HOTBAR_CONFIG,
    INVENTORY_CONFIG,
    UPDATES_LOG,
    version
} from './config.js';
import { uiState, uiRefs } from './context.js';
import {
    createShieldIcon,
    createCombatText,
    createHomeBlurButton,
    createFullscreenButton,
    setupVersion,
    setupUpdateLog,
    updateMobileUIState,
    updateHUDVisibility,
    updateShieldUI
} from './hud.js';
import { createSettingsButton, createSettingsModal, updateSettingsBody } from './settings.js';
import { createShopButton, createShopModal, updateShopBody } from './shop.js';
import { createChatUI } from './chat.js';
import {
    setupKeyboardControls,
    setupDesktopControls,
    setupMobileControls,
    toggleInventoryModal,
    isClickingHotbar,
    isClickingInventory
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

    const cursorEl = createEl('div', {}, document.body, { id: 'custom-cursor' });
    const isPointerTarget = (target) => {
        if (!target) return false;
        if (target.closest('button, input, select, textarea, a, label')) return true;
        if (target.closest('.settings-modal, .shop-item, .settings-tab, .toggle-switch, .hotbar-slot, #hotbar')) return true;
        if (target.closest('#chatInput, #chat-command-list, #chat-suggest-list')) return true;
        if (target.closest('#top-left-bar')) return true;
        return false;
    };
    const setCursorClass = (cls) => {
        cursorEl.classList.remove('pointer', 'palm', 'palm-clenched');
        if (cls) cursorEl.classList.add(cls);
    };
    const updateCursorStyle = (target) => {
        const cx = window._lastCursorX ?? 0;
        const cy = window._lastCursorY ?? 0;
        const hotbarIdx = isClickingHotbar(cx, cy);
        const invIdx = isClickingInventory(cx, cy);

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
        if (invIdx === -1) return false;
        return (Vars.myInventory?.[invIdx] || 0) > 0;
    };
    const showCursor = () => { cursorEl.style.display = 'block'; };
    const hideCursor = () => { cursorEl.style.display = 'none'; };
    window.addEventListener('mousemove', (e) => {
        showCursor();
        window._lastCursorX = e.clientX;
        window._lastCursorY = e.clientY;
        cursorEl.style.left = `${e.clientX}px`;
        cursorEl.style.top = `${e.clientY}px`;
        updateCursorStyle(e.target);
    });
    document.addEventListener('mouseover', (e) => updateCursorStyle(e.target));
    document.addEventListener('mousedown', (e) => {
        window._cursorDragging = isDragTargetAtPos();
        updateCursorStyle(e.target);
    });
    document.addEventListener('mouseup', () => {
        window._cursorDragging = false;
        updateCursorStyle(document.elementFromPoint(window._lastCursorX || 0, window._lastCursorY || 0));
    });
    window.addEventListener('mouseleave', hideCursor);
    window.addEventListener('blur', hideCursor);
    window.addEventListener('touchstart', hideCursor, { passive: true });
    window.addEventListener('touchmove', hideCursor, { passive: true });

    const topLeftBar = createEl('div', {}, hudContainer, { id: 'top-left-bar' });

    createShieldIcon(topLeftBar);
    createCombatText(hudContainer);
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
setInterval(() => {
    if (uiState.isSettingsOpen && uiState.activeTab === 'Stats') {
        updateSettingsBody();
    }
    if (uiRefs.combatText) {
        uiRefs.combatText.style.display = Vars.inCombat ? 'block' : 'none';
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
    updateMobileUIState
};
