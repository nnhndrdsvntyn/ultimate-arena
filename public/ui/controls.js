import { ENTITIES } from '../game.js';
import { ws, Vars, LC, camera, isTutorialMobileActionEnabled, isTutorialWorldActive, getHudUpgradeTypeAtClientPos, isHudUpgradeHeaderAtClientPos, tryUseHudUpgradeAtClientPos, getCreativeInventorySlotAtLogicalPos, getCreativeInventoryItemBySlot, getAdminInventoryPanelPositions, isAdminCreativeInventoryPanelAtClientPos, handleAdminCreativeInventoryWheel, getTopBarButtonAtClientPos, handleForgotControlsCanvasClick, isForgotControlsCanvasAtClientPos, handleInfoBoxToggleClick, isInfoBoxToggleAtClientPos, handleSettingsCanvasPointerDown, handleSettingsCanvasPointerMove, handleSettingsCanvasPointerUp, handleSettingsCanvasKeyDown, handleSettingsCanvasPaste, isSettingsCanvasInteractiveAtClientPos, handleSettingsCanvasWheel, handleShopCanvasPointerDown, handleShopCanvasPointerMove, handleShopCanvasPointerUp, handleShopCanvasWheel, isShopCanvasInteractiveAtClientPos, getShopCanvasSellDropClientRect, isShopCanvasPanelAtClientPos, isSettingsCanvasPanelAtClientPos, isMinimapCoachInteractiveAtClientPos, handleMinimapCoachPointerDown, setViewRangeMult, VIEW_RANGE_STEP, isLeaderboardToggleAtClientPos, toggleLeaderboardExpanded, isMinimapToggleAtClientPos, toggleMinimapOpen, playUITapSound } from '../client.js';
import { writer, sendPickupCommand, sendEquipAccessoryPacket, sendUseAbilityPacket, sendUseItemPacket, sendAdminCreativeItemCommand } from '../helpers.js';
import { isMobile, HOTBAR_CONFIG, INVENTORY_CONFIG, ACCESSORY_SLOT_CONFIG, THROW_BTN_CONFIG, PICKUP_BTN_CONFIG, DROP_BTN_CONFIG, ATTACK_BTN_CONFIG } from './config.js';
import { dataMap } from '../shared/datamap.js';
import { isWeaponRank, isSellableItem, isAccessoryItemType, accessoryIdFromItemType, isSpearType } from '../shared/datamap.js';
import { uiInput, uiRefs, uiRotation, uiState } from './context.js';
import { createEl } from './dom.js';
import { updateShopBody, toggleShopModal } from './shop.js';
import { toggleSettingsModal } from './settings.js';
import { requestPause } from './hud.js';
import { handleChatToggle, handleChatAutocompleteTab, handleChatAutocompleteMoveSelection, handleChatHistoryNavigate, closeChatInput, toggleChatDrawer, isChatHistoryInteractiveAtClientPos, handleChatHistoryPointerDown, handleChatHistoryWheel, openChatInputOnly, isChatInputActive } from './chat.js';

// --- Rotation Limiting ---
function shouldBlockRotationDuringSwing(myPlayer) {
    if (!myPlayer) return false;
    const weaponType = (myPlayer.weaponRank || 0) & 0x7F;
    const isSwinging = (myPlayer.swingState || 0) > 0 || (myPlayer.newSwingState || 0) > 0;
    return isSwinging && !isSpearType(weaponType);
}

function isPlayerFrozen(player) {
    const now = performance.now();
    return now < (player?.frozenUntil || 0) || now < (player?.bossIntroLockedUntil || 0);
}

function clearQueuedRotation() {
    uiRotation.rotationQueue = null;
    if (uiRotation.rotationTimeout) {
        clearTimeout(uiRotation.rotationTimeout);
        uiRotation.rotationTimeout = null;
    }
}

function sendRotation(angle) {
    if (uiState.isPaused) return;
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN) return;
    if (uiState.isSettingsOpen || uiState.isShopOpen) return;
    if (shouldBlockRotationDuringSwing(myPlayer)) {
        clearQueuedRotation();
        return;
    }

    const now = performance.now();
    const minInterval = 1000 / 30; // 60 FPS

    if (now - uiRotation.lastRotationTime >= minInterval) {
        // Send immediately
        _doSendRotation(angle);
        uiRotation.lastRotationTime = now;

        // If there was something queued, it's now stale
        clearQueuedRotation();
    } else {
        // Queue it
        uiRotation.rotationQueue = angle;
        if (!uiRotation.rotationTimeout) {
            uiRotation.rotationTimeout = setTimeout(() => {
                const pendingAngle = uiRotation.rotationQueue;
                clearQueuedRotation();
                if (pendingAngle !== null) {
                    sendRotation(pendingAngle);
                }
            }, minInterval - (now - uiRotation.lastRotationTime));
        }
    }
}

function _doSendRotation(angle) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer) return;
    sendPacket(2, () => {
        writer.writeF32(angle);
    });
    myPlayer.angle = angle;
}

// --- Keyboard Input Logic ---
const KEY_MAP = {
    'w': 1, 'arrowup': 1,
    'a': 2, 'arrowleft': 2,
    's': 3, 'arrowdown': 3,
    'd': 4, 'arrowright': 4
};
const MOVEMENT_KEYS = ['w', 'a', 's', 'd'];
const QUICK_SELECT_KEYS = ['1', '2', '3'];
let ignoreMouseUntil = 0;

function isSocketOpen() {
    return !!ws && ws.readyState === WebSocket.OPEN;
}

function sendPacket(packetId, writePayload) {
    if (!isSocketOpen()) return false;
    writer.reset();
    writer.writeU8(packetId);
    if (writePayload) writePayload(writer);
    ws.send(writer.getBuffer());
    return true;
}

function stopTrackedMovement() {
    MOVEMENT_KEYS.forEach((key) => {
        uiInput.keys.delete(key);
        sendMovementPacket(KEY_MAP[key], 0);
    });
}

function getSpecialConsumableTypeSet() {
    const objectTypeByKey = dataMap.OBJECT_TYPE_BY_KEY || {};
    return new Set([
        objectTypeByKey['hearty_essence'] || 0,
        objectTypeByKey['golden_skull'] || 0
    ]);
}

function getSelectedItemType() {
    return (Vars.myInventory?.[Vars.selectedSlot] || 0) & 0x7F;
}

function isSelectedSpecialConsumable(itemType = getSelectedItemType()) {
    return getSpecialConsumableTypeSet().has(itemType);
}

function getLogicalClientPos(clientX, clientY) {
    return LC.clientToLogical(clientX, clientY);
}

function getWorldPosFromClient(clientX, clientY) {
    const { x: screenX, y: screenY } = getLogicalClientPos(clientX, clientY);
    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    const zoom = Math.max(0.001, LC.zoom);
    return {
        x: camera.x + centerX + ((screenX - centerX) / zoom),
        y: camera.y + centerY + ((screenY - centerY) / zoom)
    };
}

function getAngleFromClientToPlayer(clientX, clientY, player = ENTITIES.PLAYERS[Vars.myId]) {
    if (!player) return null;
    const worldPos = getWorldPosFromClient(clientX, clientY);
    return Math.atan2(worldPos.y - player.y, worldPos.x - player.x);
}

function isSlotQueuedForSell(slot) {
    return uiState.itemsInSellQueue.includes(slot);
}

function canDragInventorySlot(slot) {
    return slot !== -1 && (Vars.myInventory?.[slot] || 0) > 0 && !isSlotQueuedForSell(slot);
}

export function setupKeyboardControls() {
    const handleKey = (e, isDown) => {
        const rawKey = typeof e?.key === 'string' ? e.key : '';
        const keyName = (e?.code === 'Space' || rawKey === ' ') ? 'space' : rawKey.toLowerCase();
        if (!keyName) return;
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        const homeUsrnInput = document.getElementById('homeUsrnInput');

        if (keyName === 'shift') {
            Vars.debugCollisionShiftHeld = !!isDown;
        }

        if (isChatInputActive()) {
            if (!isDown) return;
            if (e.key === "Tab") {
                e.preventDefault();
                handleChatAutocompleteTab(e.shiftKey);
                return;
            }
            if (e.key === "ArrowDown") {
                if (handleChatAutocompleteMoveSelection(false) || handleChatHistoryNavigate(false)) {
                    e.preventDefault();
                    return;
                }
            }
            if (e.key === "ArrowUp") {
                if (handleChatAutocompleteMoveSelection(true) || handleChatHistoryNavigate(true)) {
                    e.preventDefault();
                    return;
                }
            }
            if (e.key === "Escape") {
                closeChatInput();
            }
            if (e.key === "Enter") {
                if (e.shiftKey && uiRefs.chatInput?.value?.trimStart?.().startsWith('/')) return;
                e.preventDefault();
                if (e.shiftKey) return;
                handleChatToggle(myPlayer, homeUsrnInput);
            }
            return;
        }

        if (uiState.isSettingsOpen && isDown) {
            if (handleSettingsCanvasKeyDown(e)) {
                e.preventDefault();
                return;
            }
        }

        if (rawKey === "Escape") {
            if (uiState.isInventoryOpen) toggleInventoryModal(false);
            else if (uiState.isSettingsOpen) toggleSettingsModal(false);
            else if (uiState.isShopOpen) toggleShopModal(false);
        }

        if (uiState.isPaused) {
            if (isDown) stopTrackedMovement();
            return;
        }

        if (keyName === 'i' && isDown) {
            if (!uiState.isSettingsOpen && !uiState.isShopOpen) {
                toggleInventoryModal(!uiState.isInventoryOpen);
            }
            return;
        }

        // Block gameplay keys if a modal is open, but allow 'q' for inventory dropping
        if (uiState.isSettingsOpen || uiState.isShopOpen) return;
        if (uiState.isInventoryOpen && keyName !== 'q') return;

        const recentChatClose = performance.now() - (uiState.lastChatCloseTime || 0) < 250;
        if (rawKey >= "1" && rawKey <= "5") {
            if (!recentChatClose) {
                handleHotbarSelection(parseInt(rawKey) - 1, false);
            }
        }

        if (keyName === 'enter') {
            if (isDown) openChatInputOnly();
            return;
        }

        if (keyName === 'space') {
            e.preventDefault();
            if (isDown) {
                if (uiInput.keys.has(keyName)) return;
                uiInput.keys.add(keyName);
                sendAttackPacket(1);
            } else {
                uiInput.keys.delete(keyName);
                sendAttackPacket(0);
            }
            return;
        }

        if (isDown) {
            if (recentChatClose && rawKey >= "1" && rawKey <= "5") return;
            if (uiInput.keys.has(keyName)) return;
            uiInput.keys.add(keyName);
            handleGameplayKeyDown(keyName, myPlayer);
        } else {
            uiInput.keys.delete(keyName);
        }

        if (KEY_MAP[keyName]) {
            sendMovementPacket(KEY_MAP[keyName], isDown ? 1 : 0);
        }
    };

    document.addEventListener('keydown', e => handleKey(e, true));
    document.addEventListener('keyup', e => handleKey(e, false));
    document.addEventListener('paste', (e) => {
        if (!uiState.isSettingsOpen) return;
        if (handleSettingsCanvasPaste(e)) {
            e.preventDefault();
        }
    });
    window.addEventListener('blur', () => {
        Vars.debugCollisionShiftHeld = false;
        stopTrackedMovement();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            Vars.debugCollisionShiftHeld = false;
            stopTrackedMovement();
        }
    });

    // Resend movement state periodically to recover from packet loss.
    setInterval(() => {
        if (uiState.isPaused) {
            stopTrackedMovement();
            sendAttackPacket(0);
            return;
        }
        MOVEMENT_KEYS.forEach(k => {
            if (uiInput.keys.has(k)) sendMovementPacket(KEY_MAP[k], 1);
        });
    }, 250);
}

function handleGameplayKeyDown(key, player) {
    if (!player?.isAlive) return;

    if (key === 'e') {
        const item = getSelectedItemType();
        if (isSelectedSpecialConsumable(item)) {
            sendUseItemPacket();
            return;
        }
        if (isWeaponRank(item)) {
            sendThrowPacket();
        }
    } else if (key === 'f') {
        const worldPos = getWorldPosFromClient(Vars.mouseX, Vars.mouseY);
        sendUseAbilityPacket(worldPos.x, worldPos.y);
    } else if (key === 'r') {
        sendPickupCommand();
    } else if (key === 'q') {
        if (Vars.isAdmin) {
            const creativeSlot = getCreativeSlotUnderClient(Vars.mouseX, Vars.mouseY);
            if (creativeSlot !== -1) {
                const creativeItem = getCreativeInventoryItemBySlot(creativeSlot);
                if (creativeItem) {
                    sendAdminCreativeItemCommand(
                        creativeItem.type,
                        creativeItem.amount,
                        255,
                        true
                    );
                    return;
                }
            }
        }
        const overAccessorySlot = isClickingAccessorySlot(Vars.mouseX, Vars.mouseY);
        if (overAccessorySlot) {
            sendDropEquippedAccessoryPacket();
            return;
        }
        const hoverSlot = getSlotUnderMouse(Vars.mouseX, Vars.mouseY);
        if (hoverSlot !== -1) {
            dropSingleSlot(hoverSlot);
        } else {
            sendDropSinglePacket();
        }
    } else if (QUICK_SELECT_KEYS.includes(key)) {
        sendSelectSlotPacket(parseInt(key) - 1);
    }
}

function sendMovementPacket(dir, state) {
    if (uiState.isPaused && state !== 0) return;
    sendPacket(3, () => {
        writer.writeU8(dir);
        writer.writeU8(state);
    });
}

function sendThrowPacket() {
    if (uiState.isPaused) return;
    sendPacket(7);
}

function sendDropSinglePacket() {
    if (uiState.isPaused) return;
    if (isTutorialWorldActive()) return;
    sendPacket(31);
}

function sendDropEquippedAccessoryPacket() {
    if (isTutorialWorldActive()) return;
    sendPacket(25);
}

function sendDropSlotPacket(slot) {
    if (isTutorialWorldActive()) return;
    sendPacket(22, () => {
        writer.writeU8(slot);
    });
}

function sendDropSlotAnglePacket(slot, angle) {
    if (isTutorialWorldActive()) return;
    sendPacket(30, () => {
        writer.writeU8(slot);
        writer.writeF32(angle);
    });
}

function sendDropSingleSlotAnglePacket(slot, angle) {
    if (isTutorialWorldActive()) return;
    sendPacket(32, () => {
        writer.writeU8(slot);
        writer.writeF32(angle);
    });
}

function sendSelectSlotPacket(slot) {
    sendPacket(16, () => {
        writer.writeU8(slot);
    });
}

function sendSwapPacket(slot1, slot2) {
    sendPacket(17, () => {
        writer.writeU8(slot1);
        writer.writeU8(slot2);
    });
}

function clearCreativeDrag() {
    Vars.creativeDragItemType = 0;
    Vars.creativeDragAmount = 0;
}

function getClientStackLimit(itemType) {
    const baseType = itemType & 0x7F;
    if (isWeaponRank(baseType)) return 256;
    const objectCfg = dataMap.OBJECTS?.[baseType];
    if (objectCfg?.stackable) return Math.max(1, Math.floor(objectCfg.stackLimit || 256));
    return 1;
}

function tryMergeDraggedSlotIntoTarget(sourceSlot, targetSlot) {
    if (sourceSlot === targetSlot) return false;
    const sourceType = Vars.myInventory[sourceSlot] || 0;
    const targetType = Vars.myInventory[targetSlot] || 0;
    const sourceCount = Vars.myInventoryCounts[sourceSlot] || 0;
    const targetCount = Vars.myInventoryCounts[targetSlot] || 0;
    if (sourceType <= 0 || targetType <= 0) return false;
    if (sourceCount <= 0 || targetCount <= 0) return false;
    if (sourceType !== targetType) return false;
    if (sourceType > 127 || targetType > 127) return false;

    const stackLimit = getClientStackLimit(sourceType);
    if (stackLimit <= 1 || targetCount >= stackLimit) return false;

    const moved = Math.min(sourceCount, stackLimit - targetCount);
    if (moved <= 0) return false;

    Vars.myInventoryCounts[targetSlot] += moved;
    Vars.myInventoryCounts[sourceSlot] -= moved;
    if (Vars.myInventoryCounts[sourceSlot] <= 0) {
        Vars.myInventory[sourceSlot] = 0;
        Vars.myInventoryCounts[sourceSlot] = 0;
    }
    return true;
}

function getCreativeSlotUnderClient(clientX, clientY) {
    const { x, y } = LC.clientToLogical(clientX, clientY);
    return getCreativeInventorySlotAtLogicalPos(x, y);
}

function handleCreativeInventoryDrop(clientX, clientY) {
    if (!Vars.isAdmin || Vars.creativeDragItemType <= 0 || ws?.readyState !== ws.OPEN) {
        clearCreativeDrag();
        return;
    }

    const { hotbarSlot, inventorySlot: invSlot } = getInventoryPointerTargets(clientX, clientY);
    const targetSlot = hotbarSlot !== -1 && hotbarSlot !== 5 ? hotbarSlot : invSlot;
    const dropOutside = targetSlot === -1;

    sendAdminCreativeItemCommand(
        Vars.creativeDragItemType,
        Vars.creativeDragAmount > 0 ? Vars.creativeDragAmount : 1,
        targetSlot === -1 ? 255 : targetSlot,
        dropOutside
    );
    clearCreativeDrag();
}

export function sendAttackPacket(state) {
    if (uiState.isPaused && state !== 0) return;
    if (isChatInputActive() || uiState.isSettingsOpen || uiState.isShopOpen || ws?.readyState !== ws.OPEN) return;
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer?.isAlive) return;
    if (isPlayerFrozen(myPlayer)) return;

    // Guard: Don't allow attack if slot is empty (optimistically checked)
    if (state === 1 && Vars.myInventory && Vars.myInventory[Vars.selectedSlot] === 0) return;
    sendPacket(4, () => {
        writer.writeU8(state);
    });
}

function isUIElement(target) {
    const interactableTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    if (interactableTags.includes(target.tagName)) return true;
    if (target.classList.contains('modal_overlay') || target.closest('.settings_modal, .shop_modal')) return true;
    if (target.closest('.hotbar_slot') || target.closest('#hotbar')) return true;
    if (target.id === 'joystick_container' || target.closest('#joystick_container')) return true;
    return false;
}

export function handleHotbarSelection(slot, allowDrag = true) {
    if (slot === 5) {
        toggleInventoryModal(!uiState.isInventoryOpen);
        return;
    }

    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if ((myPlayer?.swingState || 0) > 0) {
        return;
    }

    if (Vars.selectedSlot !== slot) {
        Vars.selectedSlot = slot;
        Vars.lastSelectionTime = performance.now();
        if (myPlayer && Vars.myInventory) {
            myPlayer.weaponRank = Vars.myInventory[Vars.selectedSlot];
        }

        if (ws?.readyState === ws.OPEN) {
            sendSelectSlotPacket(slot);
        }
    }

    // Start drag if slot has an item and not in sell queue
    if (allowDrag && canDragInventorySlot(slot)) {
        Vars.dragSlot = slot;
    }
}

function startCreativeDragAt(clientX, clientY) {
    const creativeSlot = getCreativeSlotUnderClient(clientX, clientY);
    if (creativeSlot === -1) return false;

    const creativeItem = getCreativeInventoryItemBySlot(creativeSlot);
    if (!creativeItem) return true;

    Vars.creativeDragItemType = creativeItem.type;
    Vars.creativeDragAmount = creativeItem.amount;
    return true;
}

function startAccessoryDragIfPresent(player = ENTITIES.PLAYERS[Vars.myId]) {
    if ((player?.accessoryId || 0) <= 0) return false;
    Vars.dragAccessory = true;
    Vars.dragAccessoryId = player.accessoryId;
    return true;
}

function startInventoryDrag(slot) {
    if (!canDragInventorySlot(slot)) return false;
    Vars.dragSlot = slot;
    return true;
}

function syncWeaponRankFromSelection() {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        myPlayer.weaponRank = Vars.myInventory[Vars.selectedSlot];
    }
}

function moveInventoryItem(sourceSlot, targetSlot) {
    Vars.myInventory[targetSlot] = Vars.myInventory[sourceSlot];
    Vars.myInventoryCounts[targetSlot] = Vars.myInventoryCounts[sourceSlot];
    Vars.myInventory[sourceSlot] = 0;
    Vars.myInventoryCounts[sourceSlot] = 0;
    syncWeaponRankFromSelection();
    sendSwapPacket(sourceSlot, targetSlot);
}

function findFirstFreeInventorySlot(start, end) {
    for (let i = start; i < end; i++) {
        if (Vars.myInventory[i] === 0 && !isSlotQueuedForSell(i)) {
            return i;
        }
    }
    return -1;
}

function tryQuickMoveInventoryItem(sourceSlot, targetRangeStart, targetRangeEnd) {
    if (!canDragInventorySlot(sourceSlot)) return false;
    const targetSlot = findFirstFreeInventorySlot(targetRangeStart, targetRangeEnd);
    if (targetSlot === -1) return false;
    moveInventoryItem(sourceSlot, targetSlot);
    return true;
}

function handleHotbarSwap(clientX, clientY) {
    const { hotbarSlot, inventorySlot, isAccessorySlot } = getInventoryPointerTargets(clientX, clientY);

    if (Vars.dragAccessory) {
        if (isAccessorySlot) {
            Vars.dragAccessory = false;
            Vars.dragAccessoryId = 0;
            return;
        }

        const targetSlot = hotbarSlot !== -1 ? hotbarSlot : inventorySlot;
        const targetIsBlocked = targetSlot !== -1 && (targetSlot === 5 || isSlotQueuedForSell(targetSlot));
        const targetCanReceive = targetSlot !== -1 && !targetIsBlocked && Vars.myInventory[targetSlot] === 0;

        if (targetCanReceive) {
            sendEquipAccessoryPacket(0, targetSlot);
        } else if (targetSlot === -1) {
            sendDropEquippedAccessoryPacket();
        }

        Vars.dragAccessory = false;
        Vars.dragAccessoryId = 0;
        return;
    }

    if (Vars.creativeDragItemType > 0) {
        handleCreativeInventoryDrop(clientX, clientY);
        return;
    }

    if (uiState.isShopOpen && uiState.activeShopTab === 'Sell') {
        const rect = getShopCanvasSellDropClientRect();
        if (rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            const type = Vars.myInventory[Vars.dragSlot] & 0x7F;
            if (isSellableItem(type)) {
                if (!uiState.itemsInSellQueue.includes(Vars.dragSlot)) {
                    uiState.itemsInSellQueue.push(Vars.dragSlot);
                }
                updateShopBody();
            }
            Vars.dragSlot = -1;
            return;
        }
    }

    if (isAccessorySlot) {
        const type = Vars.myInventory[Vars.dragSlot] & 0x7F;
        if (isAccessoryItemType(type)) {
            const accessoryId = accessoryIdFromItemType(type);
            if (accessoryId > 0) {
                sendEquipAccessoryPacket(type, Vars.dragSlot);
                Vars.myInventory[Vars.dragSlot] = 0;
                Vars.myInventoryCounts[Vars.dragSlot] = 0;
            }
        }
        Vars.dragSlot = -1;
        return;
    }

    // Prefer hotbar, then inventory
    let targetSlot = hotbarSlot !== -1 ? hotbarSlot : inventorySlot;

    // Prevent swapping with a slot that is in the sell queue
    if (targetSlot !== -1 && isSlotQueuedForSell(targetSlot)) {
        Vars.dragSlot = -1;
        return;
    }

    // If we're not over a specific slot, check if we're at least in the general hotbar area
    // (A bit more forgiving than isClickingHotbar)
    let finalSlot = hotbarSlot;
    if (finalSlot === -1) {
        const { x, y } = getLogicalClientPos(clientX, clientY);
        const hb = HOTBAR_CONFIG;
        const totalWidth = (hb.slotSize * 6) + (hb.gap * 5) + (hb.padding * 2);
        const hX = (LC.width / 2) - (totalWidth / 2);
        const hY = LC.height - hb.marginBottom - (hb.slotSize + hb.padding * 2);
        const tolerance = isMobile ? 40 : 20;

        if (y >= hY - tolerance && y <= LC.height + tolerance) {
            for (let i = 0; i < 6; i++) {
                const sX = hX + hb.padding + (i * (hb.slotSize + hb.gap));
                if (x >= sX - tolerance && x <= sX + hb.slotSize + tolerance) {
                    finalSlot = i;
                    break;
                }
            }
        }
    }

    if (finalSlot === -1 && targetSlot !== -1) finalSlot = targetSlot;

    if (finalSlot === -1 && uiState.isShopOpen && uiState.activeShopTab === 'Sell' && isShopCanvasPanelAtClientPos(clientX, clientY)) {
        const type = Vars.myInventory[Vars.dragSlot] & 0x7F;
        if (isSellableItem(type) && !uiState.itemsInSellQueue.includes(Vars.dragSlot)) {
            uiState.itemsInSellQueue.push(Vars.dragSlot);
            updateShopBody();
        }
        Vars.dragSlot = -1;
        return;
    }

    if (finalSlot === -1 && Vars.dragSlot !== -1) {
        // Remove from sell queue if dropped
        uiState.itemsInSellQueue = uiState.itemsInSellQueue.filter(i => i !== Vars.dragSlot);
        dropSlot(Vars.dragSlot);
        Vars.dragSlot = -1;
        return;
    }

    if (finalSlot !== -1 && finalSlot !== Vars.dragSlot) {
        // Remove both involved slots from sell queue if swapped
        uiState.itemsInSellQueue = uiState.itemsInSellQueue.filter(i => i !== Vars.dragSlot && i !== finalSlot);

        const merged = tryMergeDraggedSlotIntoTarget(Vars.dragSlot, finalSlot);
        if (!merged) {
            const temp = Vars.myInventory[Vars.dragSlot];
            Vars.myInventory[Vars.dragSlot] = Vars.myInventory[finalSlot];
            Vars.myInventory[finalSlot] = temp;

            const tempCount = Vars.myInventoryCounts[Vars.dragSlot];
            Vars.myInventoryCounts[Vars.dragSlot] = Vars.myInventoryCounts[finalSlot];
            Vars.myInventoryCounts[finalSlot] = tempCount;
        }

        syncWeaponRankFromSelection();

        Vars.lastSelectionTime = performance.now();

        if (ws?.readyState === ws.OPEN) {
            sendSwapPacket(Vars.dragSlot, finalSlot);
        }
    }
    Vars.dragSlot = -1;
}

export function isClickingHotbar(clientX, clientY) {
    const { x, y } = getLogicalClientPos(clientX, clientY);

    const hb = HOTBAR_CONFIG;
    const totalWidth = (hb.slotSize * 6) + (hb.gap * 5) + (hb.padding * 2);
    const startX = (LC.width / 2) - (totalWidth / 2);
    const endX = startX + totalWidth;
    const startY = LC.height - hb.marginBottom - (hb.slotSize + hb.padding * 2);
    const endY = LC.height - hb.marginBottom;

    // Add extra padding for touch detection on mobile
    const xPadding = hb.touchPadding || 0;
    const yPadding = hb.touchPadding || 0;

    if (x >= startX - xPadding && x <= endX + xPadding && y >= startY - yPadding && y <= endY + yPadding) {
        // Find which slot
        for (let i = 0; i < 6; i++) {
            const slotStartX = startX + hb.padding + (i * (hb.slotSize + hb.gap));
            const slotEndX = slotStartX + hb.slotSize;
            if (x >= slotStartX - xPadding && x <= slotEndX + xPadding) return i;
        }
    }

    return -1;
}

export function isClickingAccessorySlot(clientX, clientY) {
    const { x, y } = getLogicalClientPos(clientX, clientY);

    const hb = HOTBAR_CONFIG;
    const as = ACCESSORY_SLOT_CONFIG;
    const totalWidth = (hb.slotSize * 6) + (hb.gap * 5) + (hb.padding * 2);
    const startX = (LC.width / 2) - (totalWidth / 2);
    const startY = LC.height - hb.marginBottom - (hb.slotSize + hb.padding * 2);

    const slotX = startX - as.gap - as.size;
    const slotY = startY + hb.padding + (hb.slotSize - as.size) / 2;

    const xPadding = as.touchPadding || 0;
    const yPadding = as.touchPadding || 0;

    if (x >= slotX - xPadding && x <= slotX + as.size + xPadding &&
        y >= slotY - yPadding && y <= slotY + as.size + yPadding) {
        return true;
    }
    return false;
}

export function isClickingInventory(clientX, clientY) {
    if (!uiState.isInventoryOpen) return -1;
    const { x, y } = getLogicalClientPos(clientX, clientY);

    const inv = INVENTORY_CONFIG;
    const totalW = (inv.slotSize * inv.cols) + (inv.gap * (inv.cols - 1)) + (inv.padding * 2);
    const totalH = (inv.slotSize * inv.rows) + (inv.gap * (inv.rows - 1)) + (inv.padding * 2);
    const { inventoryX: startX, inventoryY: startY } = getAdminInventoryPanelPositions(totalW, totalH);

    if (x >= startX && x <= startX + totalW && y >= startY && y <= startY + totalH) {
        // Find slot
        const relX = x - startX - inv.padding;
        const relY = y - startY - inv.padding;

        if (relX < 0 || relY < 0) return -1;

        const col = Math.floor(relX / (inv.slotSize + inv.gap));
        const row = Math.floor(relY / (inv.slotSize + inv.gap));

        if (col >= 0 && col < inv.cols && row >= 0 && row < inv.rows) {
            const slotRelX = relX % (inv.slotSize + inv.gap);
            const slotRelY = relY % (inv.slotSize + inv.gap);
            if (slotRelX <= inv.slotSize && slotRelY <= inv.slotSize) return 5 + (row * inv.cols) + col;
        }
    }
    return -1;
}

export function getInventoryPointerTargets(clientX, clientY) {
    return {
        hotbarSlot: isClickingHotbar(clientX, clientY),
        inventorySlot: isClickingInventory(clientX, clientY),
        isAccessorySlot: isClickingAccessorySlot(clientX, clientY)
    };
}

function getSlotUnderMouse(x, y) {
    const { hotbarSlot, inventorySlot } = getInventoryPointerTargets(x, y);
    return hotbarSlot !== -1 ? hotbarSlot : inventorySlot;
}

function dropSlot(slot) {
    const angle = getAngleFromClientToPlayer(Vars.mouseX, Vars.mouseY);
    if (angle === null) {
        sendDropSlotPacket(slot);
        return;
    }
    sendDropSlotAnglePacket(slot, angle);
}

function dropSingleSlot(slot) {
    const angle = getAngleFromClientToPlayer(Vars.mouseX, Vars.mouseY);
    if (angle === null) {
        sendDropSinglePacket();
        return;
    }
    sendDropSingleSlotAnglePacket(slot, angle);
}

export function toggleInventoryModal(show) {
    if (Date.now() - uiState.lastInvToggleTime < 500) return;
    uiState.lastInvToggleTime = Date.now();

    uiState.isInventoryOpen = show;
    if (!show) {
        Vars.dragSlot = -1;
        Vars.dragAccessory = false;
        Vars.dragAccessoryId = 0;
        clearCreativeDrag();
    }
    if (uiRefs.inventoryOverlay) uiRefs.inventoryOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        stopTrackedMovement();
    }
}

// --- Mobile Controls ---
export function setupMobileControls(container) {
    // Joystick elements
    const joyContainer = createEl('div', {
        position: 'absolute', bottom: '40px', left: '40px', width: '120px', height: '120px',
        background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(5px)',
        borderRadius: '50%', pointerEvents: 'auto', touchAction: 'none',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        display: 'none' // Controlled by updateMobileUIState
    }, container, { id: 'joystick_container' });

    const joyKnob = createEl('div', {
        position: 'absolute', top: '50%', left: '50%', width: '50px', height: '50px',
        transform: 'translate(-50%, -50%)', background: 'rgba(255, 255, 255, 0.4)',
        borderRadius: '50%', pointerEvents: 'none',
        boxShadow: '0 0 15px rgba(255,255,255,0.2)'
    }, joyContainer);

    setupJoystickLogic(joyContainer, joyKnob);
    setupMobileTouchActions(joyContainer);
}

function setupJoystickLogic(container, knob) {
    let startX, startY;
    let moveId = null;
    const maxDist = 45;

    const updateKeys = (dx, dy) => {
        const mappedKeys = {
            w: dy < -10 ? 1 : 0,
            s: dy > 10 ? 1 : 0,
            a: dx < -10 ? 1 : 0,
            d: dx > 10 ? 1 : 0
        };

        const keyToIndex = { w: 1, a: 2, s: 3, d: 4 };

        Object.keys(mappedKeys).forEach(key => {
            if (mappedKeys[key] !== uiInput.activeJoystickKeys[key]) {
                sendMovementPacket(keyToIndex[key], mappedKeys[key]);
                uiInput.activeJoystickKeys[key] = mappedKeys[key];
            }
        });
    };

    const onMove = (clientX, clientY) => {
        if (uiState.isPaused) {
            updateKeys(0, 0);
            return;
        }
        if (isChatInputActive() || uiState.isSettingsOpen || startX === undefined) return;

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
        if (uiState.isPaused) {
            updateKeys(0, 0);
            return;
        }
        if (isChatInputActive() || uiState.isSettingsOpen) return;
        const touch = e.changedTouches[0];
        moveId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
    }, { passive: true });

    container.addEventListener('touchmove', e => {
        if (uiState.isPaused) {
            updateKeys(0, 0);
            return;
        }
        if (isChatInputActive() || uiState.isSettingsOpen) return;
        const touch = Array.from(e.changedTouches).find(t => t.identifier === moveId);
        if (touch) onMove(touch.clientX, touch.clientY);
    }, { passive: true });

    container.addEventListener('mousedown', e => {
        if (uiState.isPaused) {
            updateKeys(0, 0);
            return;
        }
        if (isChatInputActive() || uiState.isSettingsOpen) return;
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

function setupMobileTouchActions(joyContainer) {
    let throwTouchId = null;
    let attackTouchId = null;
    const uiTouchIds = new Set();  // Track all UI touches
    let scrollTouchId = null;
    let scrollLastY = 0;
    let scrollTarget = null; // 'settings' | 'shop' | 'chat' | 'adminCreative' | null

    const updateRotationFromTouch = (x, y) => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN) return;

        const angle = Math.atan2(y - innerHeight / 2, x - innerWidth / 2);
        sendRotation(angle);
    };

    window.addEventListener('touchstart', (e) => {
        if (e.target?.closest?.('.settings_modal, .shop_modal')) {
            return;
        }
        ignoreMouseUntil = performance.now() + 500;
        Array.from(e.changedTouches).forEach(t => {
            if (handleMinimapCoachPointerDown(t.clientX, t.clientY)) {
                e.preventDefault();
            }
        });
        if (isMinimapCoachInteractiveAtClientPos(e.changedTouches?.[0]?.clientX || -1, e.changedTouches?.[0]?.clientY || -1)) return;
        if (uiState.isSettingsOpen) {
            Array.from(e.changedTouches).forEach(t => {
                const inPanel = isSettingsCanvasPanelAtClientPos(t.clientX, t.clientY);
                if (handleSettingsCanvasPointerDown(t.clientX, t.clientY)) {
                    scrollTouchId = t.identifier;
                    scrollLastY = t.clientY;
                    scrollTarget = 'settings';
                    return;
                }
                if (inPanel) {
                    scrollTouchId = t.identifier;
                    scrollLastY = t.clientY;
                    scrollTarget = 'settings';
                }
            });
            return;
        }
        Array.from(e.changedTouches).forEach(t => {
            // Check if touching any UI
            if (isTouchOnUI(t.clientX, t.clientY)) {
                e.preventDefault(); // Prevent synthesized mouse/click events
                uiTouchIds.add(t.identifier);

                if (uiState.isChatHistoryOpen && isChatHistoryInteractiveAtClientPos(t.clientX, t.clientY)) {
                    handleChatHistoryPointerDown(t.clientX, t.clientY);
                    scrollTouchId = t.identifier;
                    scrollLastY = t.clientY;
                    scrollTarget = 'chat';
                    return;
                }

                if (uiState.isShopOpen) {
                    const inPanel = isShopCanvasPanelAtClientPos(t.clientX, t.clientY);
                    const handled = handleShopCanvasPointerDown(t.clientX, t.clientY);
                    if (inPanel) {
                        scrollTouchId = t.identifier;
                        scrollLastY = t.clientY;
                        scrollTarget = 'shop';
                    }
                    if (handled) return;
                }

                if (handleSettingsCanvasPointerDown(t.clientX, t.clientY)) {
                    return;
                }

                if (handleTopBarClick(t.clientX, t.clientY)) {
                    return;
                }

                // Check hotbar
                if (tryUseHudUpgradeAtClientPos(t.clientX, t.clientY)) {
                    return;
                }

                const { hotbarSlot, inventorySlot, isAccessorySlot } = getInventoryPointerTargets(t.clientX, t.clientY);
                if (hotbarSlot !== -1) {
                    handleHotbarSelection(hotbarSlot);
                    return;
                }

                if (startInventoryDrag(inventorySlot)) {
                    return;
                }

                if (startCreativeDragAt(t.clientX, t.clientY)) {
                    return;
                }

                if (isAdminCreativeInventoryPanelAtClientPos(t.clientX, t.clientY)) {
                    scrollTouchId = t.identifier;
                    scrollLastY = t.clientY;
                    scrollTarget = 'adminCreative';
                    return;
                }

                if (isAccessorySlot && startAccessoryDragIfPresent()) {
                    return;
                }

                // Check action buttons
                if (isButtonTouched(t.clientX, t.clientY, THROW_BTN_CONFIG)) {
                    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
                    if (isSelectedSpecialConsumable()) {
                        if (isTutorialMobileActionEnabled('throw')) sendUseItemPacket();
                    } else if (myPlayer?.hasWeapon && isTutorialMobileActionEnabled('throw')) {
                        sendThrowPacket();
                    }
                    throwTouchId = t.identifier;
                } else if (isButtonTouched(t.clientX, t.clientY, ATTACK_BTN_CONFIG)) {
                    if (isTutorialMobileActionEnabled('attack')) sendAttackPacket(1);
                    attackTouchId = t.identifier;
                } else if (isButtonTouched(t.clientX, t.clientY, PICKUP_BTN_CONFIG)) {
                    if (isTutorialMobileActionEnabled('pickup')) sendPickupCommand();
                } else if (isButtonTouched(t.clientX, t.clientY, DROP_BTN_CONFIG)) {
                    if (isTutorialMobileActionEnabled('drop')) sendDropSinglePacket();
                } else {
                    Vars.mouseX = t.clientX;
                    Vars.mouseY = t.clientY;
                    updateRotationFromTouch(t.clientX, t.clientY);
                }
            }
        });
    });

    window.addEventListener('touchmove', (e) => {
        const isDraggingInventoryItem = Vars.dragSlot !== -1 || Vars.dragAccessory || Vars.creativeDragItemType > 0;
        Array.from(e.changedTouches).forEach(t => {
            if (isDraggingInventoryItem) {
                // Keep drag ghost synced with finger even while modals are open.
                Vars.mouseX = t.clientX;
                Vars.mouseY = t.clientY;
            }

            handleSettingsCanvasPointerMove(t.clientX, t.clientY);
            handleShopCanvasPointerMove(t.clientX, t.clientY);
            if (scrollTouchId === t.identifier) {
                const delta = scrollLastY - t.clientY;
                scrollLastY = t.clientY;
                if (scrollTarget === 'settings' && uiState.isSettingsOpen) {
                    handleSettingsCanvasWheel(t.clientX, t.clientY, delta * 2);
                } else if (scrollTarget === 'shop' && uiState.isShopOpen) {
                    handleShopCanvasWheel(t.clientX, t.clientY, delta * 2);
                } else if (scrollTarget === 'chat' && uiState.isChatHistoryOpen) {
                    handleChatHistoryWheel(t.clientX, t.clientY, delta * 2);
                } else if (scrollTarget === 'adminCreative' && uiState.isInventoryOpen) {
                    handleAdminCreativeInventoryWheel(t.clientX, t.clientY, delta * 2);
                }
            }
            if (uiState.isSettingsOpen || uiState.isShopOpen || uiState.isInventoryOpen) return;

            // Only rotate if NOT touching any UI
            if (!uiTouchIds.has(t.identifier) && t.identifier !== throwTouchId && t.identifier !== attackTouchId) {
                Vars.mouseX = t.clientX;
                Vars.mouseY = t.clientY;
                updateRotationFromTouch(t.clientX, t.clientY);
            }
        });
    });

    window.addEventListener('touchend', (e) => {
        Array.from(e.changedTouches).forEach(t => {
            // Clean up UI touch tracking
            uiTouchIds.delete(t.identifier);
            handleSettingsCanvasPointerUp();
            handleShopCanvasPointerUp();
            if (scrollTouchId === t.identifier) {
                scrollTouchId = null;
                scrollTarget = null;
            }

            // Handle hotbar swap on touch end
            if (Vars.dragSlot !== -1 || Vars.dragAccessory) {
                handleHotbarSwap(t.clientX, t.clientY);
            } else if (Vars.creativeDragItemType > 0) {
                handleCreativeInventoryDrop(t.clientX, t.clientY);
            }

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
    const { x: sx, y: sy } = getLogicalClientPos(clientX, clientY);

    const btnX = LC.width - config.xOffset;
    const btnY = LC.height - config.yOffset;
    const dist = Math.sqrt(Math.pow(sx - btnX, 2) + Math.pow(sy - btnY, 2));
    return dist <= config.radius + (config.touchPadding || 0);
}

function isPointInsideVisibleElement(clientX, clientY, element) {
    if (!element) return false;
    if (element.style?.pointerEvents === 'none') return false;
    if (element.getClientRects().length === 0) return false;
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function isTouchOnUI(clientX, clientY) {
    // Check if touching any UI element
    const joyContainer = document.getElementById('joystick_container');
    const { hotbarSlot, inventorySlot, isAccessorySlot } = getInventoryPointerTargets(clientX, clientY);

    if (isMinimapCoachInteractiveAtClientPos(clientX, clientY)) return true;
    if (uiState.isSettingsOpen) return true;
    // Don't block all interactions when the shop is open; only treat clicks that are
    // actually inside the shop modal as UI. This allows inventory dragging while shop is visible.
    if (isChatHistoryInteractiveAtClientPos(clientX, clientY)) return true;

    // Check settings modal
    if (uiState.isSettingsOpen && uiRefs.settingsModal) {
        const rect = uiRefs.settingsModal.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return true;
    }

    // Check shop modal
    if (uiState.isShopOpen && uiRefs.shopModal) {
        const rect = uiRefs.shopModal.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return true;
    }

    if (getTopBarButtonAtClientPos(clientX, clientY)) {
        return true;
    }

    if (isPointInsideVisibleElement(clientX, clientY, joyContainer)) return true;
    if (hotbarSlot !== -1) return true;

    if (getHudUpgradeTypeAtClientPos(clientX, clientY) !== 0) {
        return true;
    }

    if (isHudUpgradeHeaderAtClientPos(clientX, clientY)) {
        return true;
    }

    if (isAccessorySlot) return true;
    if (inventorySlot !== -1) return true;

    if (getCreativeSlotUnderClient(clientX, clientY) !== -1) {
        return true;
    }

    if (isAdminCreativeInventoryPanelAtClientPos(clientX, clientY)) {
        return true;
    }

    // Check mobile buttons
    if (isButtonTouched(clientX, clientY, THROW_BTN_CONFIG) ||
        isButtonTouched(clientX, clientY, ATTACK_BTN_CONFIG) ||
        isButtonTouched(clientX, clientY, PICKUP_BTN_CONFIG) ||
        isButtonTouched(clientX, clientY, DROP_BTN_CONFIG)) {
        return true;
    }

    return false;
}

function handleTopBarClick(clientX, clientY) {
    if (handleInfoBoxToggleClick(clientX, clientY)) {
        return true;
    }
    if (handleForgotControlsCanvasClick(clientX, clientY)) {
        return true;
    }
    if (isLeaderboardToggleAtClientPos(clientX, clientY)) {
        playUITapSound();
        toggleLeaderboardExpanded();
        return true;
    }
    if (isMinimapToggleAtClientPos(clientX, clientY)) {
        playUITapSound();
        toggleMinimapOpen();
        return true;
    }

    const btn = getTopBarButtonAtClientPos(clientX, clientY);
    if (!btn) return false;
    if (btn.disabled) return true;

    if (btn.id === 'settings') {
        playUITapSound();
        toggleSettingsModal(true);
        return true;
    }
    if (btn.id === 'chat') {
        playUITapSound();
        toggleChatDrawer();
        return true;
    }
    if (btn.id === 'fullscreen') {
        playUITapSound();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        return true;
    }
    if (btn.id === 'shop') {
        playUITapSound();
        toggleShopModal(true);
        return true;
    }
    if (btn.id === 'pause') {
        playUITapSound();
        requestPause();
        return true;
    }
    return false;
}

// --- Desktop Controls ---
export function setupDesktopControls() {
    window.addEventListener("wheel", (e) => {
        let handled = false;
        const cx = window._lastCursorX ?? e.clientX;
        const cy = window._lastCursorY ?? e.clientY;
        if (uiState.isSettingsOpen && handleSettingsCanvasWheel(cx, cy, e.deltaY)) {
            handled = true;
        }
        if (uiState.isShopOpen && handleShopCanvasWheel(cx, cy, e.deltaY)) {
            handled = true;
        }
        if (uiState.isChatHistoryOpen && handleChatHistoryWheel(cx, cy, e.deltaY)) {
            handled = true;
        }
        if (handleAdminCreativeInventoryWheel(cx, cy, e.deltaY)) {
            handled = true;
        }

        if (e.ctrlKey) {
            const direction = Math.sign(e.deltaY);
            if (direction !== 0) {
                setViewRangeMult(Vars.viewRangeMult + (direction * VIEW_RANGE_STEP));
                handled = true;
            }
        }

        if (handled) {
            e.preventDefault();
        }
    }, { passive: false });

    window.addEventListener("mousemove", (e) => {
        // Always track mouse position for dragging
        Vars.mouseX = e.clientX;
        Vars.mouseY = e.clientY;
        if (uiState.isSettingsOpen) handleSettingsCanvasPointerMove(e.clientX, e.clientY);
        if (uiState.isShopOpen) handleShopCanvasPointerMove(e.clientX, e.clientY);
        const overUpgradeHeader = isHudUpgradeHeaderAtClientPos(e.clientX, e.clientY);
        const overTopBar = !!getTopBarButtonAtClientPos(e.clientX, e.clientY);
        const overForgotControls = isForgotControlsCanvasAtClientPos(e.clientX, e.clientY);
        const overInfoBoxToggle = isInfoBoxToggleAtClientPos(e.clientX, e.clientY);
        const overLeaderboardToggle = isLeaderboardToggleAtClientPos(e.clientX, e.clientY);
        const overMinimapToggle = isMinimapToggleAtClientPos(e.clientX, e.clientY);
        const overSettings = uiState.isSettingsOpen && isSettingsCanvasInteractiveAtClientPos(e.clientX, e.clientY);
        const overShop = uiState.isShopOpen && isShopCanvasInteractiveAtClientPos(e.clientX, e.clientY);
        const overMinimapCoach = isMinimapCoachInteractiveAtClientPos(e.clientX, e.clientY);
        if (LC?.canvas) {
            const nextCursor = (overUpgradeHeader || overTopBar || overForgotControls || overInfoBoxToggle || overLeaderboardToggle || overMinimapToggle || overSettings || overShop || overMinimapCoach) ? 'pointer' : 'default';
            if (LC.canvas.style.cursor !== nextCursor) LC.canvas.style.cursor = nextCursor;
        }

        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN || uiState.isSettingsOpen || uiState.isShopOpen || Vars.dragSlot !== -1 || Vars.dragAccessory) return;
        if (Vars.creativeDragItemType > 0) return;
        if (shouldBlockRotationDuringSwing(myPlayer)) {
            clearQueuedRotation();
            return;
        }

        const angle = Math.atan2(e.clientY - innerHeight / 2, e.clientX - innerWidth / 2);
        sendRotation(angle);
    });

    window.addEventListener("mousedown", (e) => {
        if (performance.now() < ignoreMouseUntil) return;
        if (handleMinimapCoachPointerDown(e.clientX, e.clientY)) {
            return;
        }
        if (isUIElement(e.target)) return;
        if (handleSettingsCanvasPointerDown(e.clientX, e.clientY)) {
            return;
        }
        if (handleShopCanvasPointerDown(e.clientX, e.clientY)) {
            return;
        }
        if (handleChatHistoryPointerDown(e.clientX, e.clientY)) {
            return;
        }
        const shopSellActive = uiState.isShopOpen && uiState.activeShopTab === 'Sell';
        if (uiState.isShopOpen && !shopSellActive) return;

        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        const { hotbarSlot: slotClicked, inventorySlot: invSlot, isAccessorySlot } = getInventoryPointerTargets(e.clientX, e.clientY);

        if (handleTopBarClick(e.clientX, e.clientY)) {
            return;
        }

        if (tryUseHudUpgradeAtClientPos(e.clientX, e.clientY)) {
            return;
        }

        if (startCreativeDragAt(e.clientX, e.clientY)) {
            return;
        }

        if (e.shiftKey && uiState.isShopOpen && uiState.activeShopTab === 'Sell') {
            const clickedSlot = slotClicked !== -1 ? slotClicked : invSlot;
            if (clickedSlot !== -1 && queueSellSlot(clickedSlot)) {
                return;
            }
        }

        if (e.shiftKey) {
            if (isAccessorySlot) {
                if (myPlayer?.accessoryId > 0 && findFirstFreeInventorySlot(0, 35) !== -1) {
                    sendEquipAccessoryPacket(0);
                }
                return;
            }

            const clickedSlot = slotClicked !== -1 ? slotClicked : invSlot;
            const accessorySlotEmpty = myPlayer?.accessoryId === 0;
            if (accessorySlotEmpty && clickedSlot !== -1 && isAccessoryItemType(Vars.myInventory[clickedSlot] & 0x7F)) {
                sendEquipAccessoryPacket(Vars.myInventory[clickedSlot], clickedSlot);
                return;
            }

            if (uiState.isInventoryOpen && slotClicked !== -1 && slotClicked < 5 && tryQuickMoveInventoryItem(slotClicked, 5, 35)) {
                return;
            }

            if (invSlot !== -1 && tryQuickMoveInventoryItem(invSlot, 0, 5)) {
                return;
            }

            return;
        }

        if (isAccessorySlot && startAccessoryDragIfPresent(myPlayer)) {
            return;
        }

        if (slotClicked !== -1) {
            handleHotbarSelection(slotClicked);
            return;
        }

        if (startInventoryDrag(invSlot)) {
            return;
        }

        if (e.button === 0) sendAttackPacket(1);
    });

    window.addEventListener("mouseup", (e) => {
        if (performance.now() < ignoreMouseUntil) return;
        handleSettingsCanvasPointerUp();
        handleShopCanvasPointerUp();
        if (Vars.dragSlot !== -1 || Vars.dragAccessory) {
            handleHotbarSwap(e.clientX, e.clientY);
        } else if (Vars.creativeDragItemType > 0) {
            handleCreativeInventoryDrop(e.clientX, e.clientY);
        }
        if (e.button === 0) sendAttackPacket(0);
    });
}

function queueSellSlot(slotIdx) {
    if (Vars.myInventory[slotIdx] <= 0) return false;
    const type = Vars.myInventory[slotIdx] & 0x7F;
    if (!isSellableItem(type)) return false;
    if (isSlotQueuedForSell(slotIdx)) return false;

    uiState.itemsInSellQueue.push(slotIdx);
    updateShopBody();
    return true;
}
