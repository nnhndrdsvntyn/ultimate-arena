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
    createComboText,
    createHomeBlurButton,
    createHomeWheel,
    setupHomeOverlays,
    setupVersion,
    setupUpdateLog,
    setupDidYouKnowBox,
    updateMobileUIState,
    updateHUDVisibility,
    updateShieldUI,
    setHomeLeaderboardsLoading,
    updateHomeLeaderboards,
    handleHomeWheelSpinResult
} from './hud.js';
import { ACCESSORY_KEYS } from '../shared/datamap.js';
import { createSettingsModal, updateSettingsBody, toggleSettingsModal } from './settings.js';
import { createShopModal, updateShopBody, toggleShopModal } from './shop.js';
import { isForgotControlsCanvasAtClientPos, isInfoBoxToggleAtClientPos, isHudUpgradePlusAtClientPos, isHudUpgradeHeaderAtClientPos, isTopBarButtonAtClientPos, isLeaderboardToggleAtClientPos, isMinimapToggleAtClientPos, isSettingsCanvasInteractiveAtClientPos, isShopCanvasInteractiveAtClientPos } from '../client.js';
import { createTopBarHint } from './hud.js';
import { createChatUI, closeChatInput, closeChatDrawer, appendChatMessage, syncChatOverlay, isChatHistoryInteractiveAtClientPos, handleChatHistoryPointerDown, handleChatHistoryWheel } from './chat.js';
import {
    setupKeyboardControls,
    setupDesktopControls,
    setupMobileControls,
    toggleInventoryModal,
    getInventoryPointerTargets
} from './controls.js';
import { showNotification } from './notifications.js';
import { createEl } from './dom.js';
import { playUITapSound } from '../client.js';

// --- Version Info ---
document.title = `Ultimate Arena (${version})`;
console.log(`%cUltimate Arena ${version}`, 'color: #b79a6b; font-size: 16px; font-weight: bold;');

// --- Global UI Click Sound ---
document.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (target && (
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('input[type="range"]') ||
        target.closest('select') ||
        target.classList.contains('toggle_switch') ||
        target.classList.contains('toggle_knob') ||
        target.classList.contains('settings_tab') ||
        target.classList.contains('chat_command_item') ||
        target.closest('.chat_command_item') ||
        target.closest('.shop_tab') ||
        target.closest('.shop_sell_all') ||
        target.closest('.shop_sell_row') ||
        target.closest('.home_leaderboard_scope_btn') ||
        target.classList.contains('close_settings') ||
        target.classList.contains('shop_modal') ||
        target.closest('[class*="toggle"]')
    )) {
        playUITapSound();
    }
}, { capture: true, passive: true });

// --- UI Initialization ---
export function initializeUI() {
    const hudContainer = document.getElementById('game_hud');
    if (!hudContainer) return;

    uiRefs.homeScreen = document.getElementById('home_screen');
    uiRefs.respawnScreen = document.getElementById('respawn_screen');
    uiRefs.joystickContainer = document.getElementById('joystick_container');
    uiRefs.mobileChatBtn = document.getElementById('mobile_chat_btn');
    uiRefs.homeOnlineCount = document.getElementById('home_online_count');

    const cursorEl = isMobile ? null : createEl('div', {}, document.body, { id: 'custom_cursor' });
    const isPointerTarget = (target) => {
        if (!target) return false;
        if (target.closest('button, input, select, textarea, a, label')) return true;
        if (target.closest('.settings_modal, .shop_item, .settings_tab, .toggle_switch, .hotbar_slot, #hotbar')) return true;
        if (target.closest('#chatInput, #chat_command_list, #chat_suggest_list, #chat_history_panel')) return true;
        return false;
    };
    let lastCursorClass = '';
    const setCursorClass = (cls) => {
        if (!cursorEl) return;
        if (cls === lastCursorClass) return;
        lastCursorClass = cls || '';
        cursorEl.classList.remove('pointer', 'palm', 'palm_clenched');
        if (cls) cursorEl.classList.add(cls);
    };
    const updateCursorStyle = (target) => {
        const cx = window._lastCursorX ?? 0;
        const cy = window._lastCursorY ?? 0;
        const { hotbarSlot: hotbarIdx, inventorySlot: invIdx, isAccessorySlot } = getInventoryPointerTargets(cx, cy);

        if (window._cursorDragging) {
            setCursorClass('palm_clenched');
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
        if (isHudUpgradePlusAtClientPos(cx, cy) || isHudUpgradeHeaderAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isTopBarButtonAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isForgotControlsCanvasAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isInfoBoxToggleAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isLeaderboardToggleAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isMinimapToggleAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isSettingsCanvasInteractiveAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
        }
        if (isShopCanvasInteractiveAtClientPos(cx, cy)) {
            setCursorClass('pointer');
            return;
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
        const { hotbarSlot: hotbarIdx, inventorySlot: invIdx, isAccessorySlot } = getInventoryPointerTargets(cx, cy);
        if (hotbarIdx !== -1 && hotbarIdx !== 5) {
            return (Vars.myInventory?.[hotbarIdx] || 0) > 0;
        }
        if (invIdx !== -1 && (Vars.myInventory?.[invIdx] || 0) > 0) return true;
        if (isAccessorySlot) {
            const myPlayer = ENTITIES.PLAYERS[Vars.myId];
            return (myPlayer?.accessoryId || 0) > 0;
        }
        return false;
    };
    const showCursor = () => { if (cursorEl) cursorEl.style.display = 'block'; };
    const hideCursor = () => { if (cursorEl) cursorEl.style.display = 'none'; };
    let lastCursorTarget = null;
    const updateCursorPos = (x, y, target) => {
        if (!cursorEl) return;
        showCursor();
        window._lastCursorX = x;
        window._lastCursorY = y;
        cursorEl.style.transform = `translate3d(${x - 6}px, ${y - 6}px, 0)`;
        if (target !== lastCursorTarget) lastCursorTarget = target;
        updateCursorStyle(target);
    };
    if (!isMobile) {
        const handleCursorMove = (e) => {
            updateCursorPos(e.clientX, e.clientY, e.target);
        };
        document.addEventListener('pointermove', handleCursorMove, { capture: true, passive: true });
        if ('onpointerrawupdate' in window) {
            document.addEventListener('pointerrawupdate', handleCursorMove, { capture: true, passive: true });
        }
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

    const topLeftBar = createEl('div', {}, hudContainer, { id: 'top_left_bar' });
    topLeftBar.classList.add('canvas_topbar');
    uiRefs.topLeftBar = topLeftBar;

    createTopBarHint(hudContainer);
    createComboText(hudContainer);
    createHomeBlurButton();
    createHomeWheel(uiRefs.homeScreen);
    setupHomeOverlays();
    createChatUI(hudContainer);
    createSettingsModal(hudContainer);
    createShopModal(hudContainer);
    setupKeyboardControls();
    setupDesktopControls();
    setupMobileControls(hudContainer);
    setupVersion();
    setupUpdateLog();
    setupDidYouKnowBox();
    window.updateSettingsBody = updateSettingsBody;

    updateHUDVisibility(false);
    updateMobileUIState();
}

export function closeHomeScreenBlockingUI() {
    if (uiState.isSettingsOpen) toggleSettingsModal(false);
    if (uiState.isShopOpen) toggleShopModal(false);
    if (uiState.isInventoryOpen) toggleInventoryModal(false);
    if (uiState.isChatInputOpen) closeChatInput();
    if (uiState.isChatHistoryOpen) closeChatDrawer();
}

// --- Periodic Updates ---
let lastShownVikingComboCount = 0;
setInterval(() => {
    if (uiRefs.comboText) {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        const accessoryKey = ACCESSORY_KEYS[myPlayer?.accessoryId || 0];
        const comboCount = Vars.vikingComboCount || 0;
        const showCombo = accessoryKey === 'viking_hat' && comboCount > 0;
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
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
    uiRefs,
    updateSettingsBody,
    updateShopBody,
    toggleInventoryModal,
    showNotification,
    updateHUDVisibility,
    updateShieldUI,
    setHomeLeaderboardsLoading,
    updateHomeLeaderboards,
    appendChatMessage,
    syncChatOverlay,
    isChatHistoryInteractiveAtClientPos,
    handleChatHistoryPointerDown,
    handleChatHistoryWheel,
    getInventoryPointerTargets,
    updateMobileUIState,
    handleHomeWheelSpinResult
};
