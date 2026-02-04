import { ENTITIES } from '../game.js';
import { ws, Vars, LC } from '../client.js';
import { writer, sendPickupCommand } from '../helpers.js';
import { isMobile, HOTBAR_CONFIG, INVENTORY_CONFIG, THROW_BTN_CONFIG, PICKUP_BTN_CONFIG, DROP_BTN_CONFIG, ATTACK_BTN_CONFIG } from './config.js';
import { isSwordRank, isSellableItem } from '../shared/datamap.js';
import { uiInput, uiRefs, uiRotation, uiState } from './context.js';
import { createEl } from './dom.js';
import { updateShopBody, toggleShopModal } from './shop.js';
import { toggleSettingsModal } from './settings.js';
import { handleChatToggle } from './chat.js';

// --- Rotation Limiting ---
function sendRotation(angle) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN) return;

    const now = performance.now();
    const minInterval = 1000 / 30; // 60 FPS

    if (now - uiRotation.lastRotationTime >= minInterval) {
        // Send immediately
        _doSendRotation(angle);
        uiRotation.lastRotationTime = now;

        // If there was something queued, it's now stale
        uiRotation.rotationQueue = null;
        if (uiRotation.rotationTimeout) {
            clearTimeout(uiRotation.rotationTimeout);
            uiRotation.rotationTimeout = null;
        }
    } else {
        // Queue it
        uiRotation.rotationQueue = angle;
        if (!uiRotation.rotationTimeout) {
            uiRotation.rotationTimeout = setTimeout(() => {
                const pendingAngle = uiRotation.rotationQueue;
                uiRotation.rotationQueue = null;
                uiRotation.rotationTimeout = null;
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
    writer.reset();
    writer.writeU8(2);
    writer.writeF32(angle);
    ws.send(writer.getBuffer());
    if (myPlayer.swingState === 0) myPlayer.angle = angle;
}

// --- Keyboard Input Logic ---
const KEY_MAP = {
    'w': 1, 'arrowup': 1,
    'a': 2, 'arrowleft': 2,
    's': 3, 'arrowdown': 3,
    'd': 4, 'arrowright': 4
};

export function setupKeyboardControls() {
    const stopAllMovement = () => {
        ['w', 'a', 's', 'd'].forEach(k => {
            uiInput.keys.delete(k);
            sendMovementPacket(KEY_MAP[k], 0);
        });
    };

    const handleKey = (e, isDown) => {
        const keyName = e.key.toLowerCase();
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        const homeUsrnInput = document.getElementById('homeUsrnInput');

        if (uiState.isChatOpen) {
            if (!isDown) return;
            if (e.key === "Escape") {
                uiState.isChatOpen = false;
                uiRefs.chatInput.value = '';
                uiRefs.chatInputWrapper.style.display = 'none';
                uiRefs.chatInput.blur();
                uiState.lastChatCloseTime = performance.now();
                const mobileChatBtn = document.getElementById('mobile-chat-btn');
                if (mobileChatBtn && isMobile) mobileChatBtn.style.display = 'flex';
            }
            if (e.key === "Enter") handleChatToggle(myPlayer, homeUsrnInput);
            return;
        }

        if (e.key === "Escape") {
            if (uiState.isInventoryOpen) toggleInventoryModal(false);
            else if (uiState.isSettingsOpen) toggleSettingsModal(false);
            else if (uiState.isShopOpen) toggleShopModal(false);
        }

        // Block gameplay keys if a modal is open, but allow 'q' for inventory dropping
        if (uiState.isSettingsOpen || uiState.isShopOpen) return;
        if (uiState.isInventoryOpen && keyName !== 'q') return;

        const recentChatClose = performance.now() - (uiState.lastChatCloseTime || 0) < 250;
        if (e.key >= "1" && e.key <= "5") {
            if (!recentChatClose) {
                handleHotbarSelection(parseInt(e.key) - 1, false);
            }
        }

        if (keyName === 'enter') {
            if (isDown) handleChatToggle(myPlayer, homeUsrnInput);
            return;
        }

        if (isDown) {
            if (recentChatClose && e.key >= "1" && e.key <= "5") return;
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
    window.addEventListener('blur', stopAllMovement);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAllMovement();
    });

    // Resend movement state periodically to recover from packet loss.
    setInterval(() => {
        ['w', 'a', 's', 'd'].forEach(k => {
            if (uiInput.keys.has(k)) sendMovementPacket(KEY_MAP[k], 1);
        });
    }, 250);
}

function handleGameplayKeyDown(key, player) {
    if (!player?.isAlive) return;

    if (key === 'e') {
        const item = (Vars.myInventory[Vars.selectedSlot] || 0) & 0x7F;
        if (isSwordRank(item)) {
            sendThrowPacket();
        }
    } else if (key === 'r') {
        sendPickupCommand();
    } else if (key === 'q') {
        const hoverSlot = getSlotUnderMouse(Vars.mouseX, Vars.mouseY);
        if (hoverSlot !== -1) {
            dropSlot(hoverSlot);
        } else {
            sendDropPacket();
        }
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

export function sendAttackPacket(state) {
    if (uiState.isChatOpen || uiState.isSettingsOpen || ws?.readyState !== ws.OPEN) return;
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

export function handleHotbarSelection(slot, allowDrag = true) {
    if (slot === 5) {
        toggleInventoryModal(!uiState.isInventoryOpen);
        return;
    }

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

    // Start drag if slot has an item and not in sell queue
    if (allowDrag && Vars.myInventory && Vars.myInventory[slot] > 0 && !uiState.itemsInSellQueue.includes(slot)) {
        Vars.dragSlot = slot;
    }
}

function handleHotbarSwap(clientX, clientY) {
    if (uiState.isShopOpen && uiState.activeShopTab === 'Sell') {
        const sellSlot = document.getElementById('shop-sell-slot');
        if (sellSlot) {
            const rect = sellSlot.getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
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
    }

    const slotUnderMouse = isClickingHotbar(clientX, clientY);
    const invSlotUnderMouse = isClickingInventory(clientX, clientY);

    // Prefer hotbar, then inventory
    let targetSlot = slotUnderMouse !== -1 ? slotUnderMouse : invSlotUnderMouse;

    // Prevent swapping with a slot that is in the sell queue
    if (targetSlot !== -1 && uiState.itemsInSellQueue.includes(targetSlot)) {
        Vars.dragSlot = -1;
        return;
    }

    // If we're not over a specific slot, check if we're at least in the general hotbar area
    // (A bit more forgiving than isClickingHotbar)
    let finalSlot = slotUnderMouse;
    if (finalSlot === -1) {
        const x = clientX * (LC.width / window.innerWidth);
        const y = clientY * (LC.height / window.innerHeight);
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

export function isClickingHotbar(clientX, clientY) {
    // Scale client coordinates to canvas internal coordinates (1440x760)
    const x = clientX * (LC.width / window.innerWidth);
    const y = clientY * (LC.height / window.innerHeight);

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

export function isClickingInventory(clientX, clientY) {
    if (!uiState.isInventoryOpen) return -1;
    const x = clientX * (LC.width / window.innerWidth);
    const y = clientY * (LC.height / window.innerHeight);

    const inv = INVENTORY_CONFIG;
    const totalW = (inv.slotSize * inv.cols) + (inv.gap * (inv.cols - 1)) + (inv.padding * 2);
    const totalH = (inv.slotSize * inv.rows) + (inv.gap * (inv.rows - 1)) + (inv.padding * 2);
    const startX = (LC.width / 2) - (totalW / 2);
    const startY = (LC.height / 2) - (totalH / 2);

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

function getSlotUnderMouse(x, y) {
    let slot = isClickingHotbar(x, y);
    if (slot === -1) slot = isClickingInventory(x, y);
    return slot;
}

function dropSlot(slot) {
    if (slot === Vars.selectedSlot) {
        sendDropPacket();
    } else {
        sendSelectSlotPacket(slot);
        sendDropPacket();
        sendSelectSlotPacket(Vars.selectedSlot);
    }
}

export function toggleInventoryModal(show) {
    if (Date.now() - uiState.lastInvToggleTime < 500) return;
    uiState.lastInvToggleTime = Date.now();

    uiState.isInventoryOpen = show;
    if (uiRefs.inventoryOverlay) uiRefs.inventoryOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        ['w', 'a', 's', 'd'].forEach(k => {
            uiInput.keys.delete(k);
            sendMovementPacket(KEY_MAP[k], 0);
        });
    }
}

// --- Mobile Controls ---
export function setupMobileControls(container) {
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
        if (uiState.isChatOpen) return;
        uiState.isChatOpen = true;
        uiRefs.chatInputWrapper.style.display = 'block';
        uiRefs.chatInput.focus();
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
        if (uiState.isChatOpen || uiState.isSettingsOpen || startX === undefined) return;

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
        if (uiState.isChatOpen || uiState.isSettingsOpen) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        moveId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
    });

    container.addEventListener('touchmove', e => {
        if (uiState.isChatOpen || uiState.isSettingsOpen) return;
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === moveId);
        if (touch) onMove(touch.clientX, touch.clientY);
    });

    container.addEventListener('mousedown', e => {
        if (uiState.isChatOpen || uiState.isSettingsOpen) return;
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
    const uiTouchIds = new Set();  // Track all UI touches

    const updateRotationFromTouch = (x, y) => {
        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN || myPlayer.swingState !== 0) return;

        const angle = Math.atan2(y - innerHeight / 2, x - innerWidth / 2);
        sendRotation(angle);
    };

    window.addEventListener('touchstart', (e) => {
        if (uiState.isSettingsOpen) return;

        Array.from(e.changedTouches).forEach(t => {
            // Check if touching any UI
            if (isTouchOnUI(t.clientX, t.clientY)) {
                e.preventDefault(); // Prevent synthesized mouse/click events
                uiTouchIds.add(t.identifier);

                // Check hotbar
                const hotbarSlot = isClickingHotbar(t.clientX, t.clientY);
                if (hotbarSlot !== -1) {
                    handleHotbarSelection(hotbarSlot);
                    return;
                }

                const invSlot = isClickingInventory(t.clientX, t.clientY);
                if (invSlot !== -1 && Vars.myInventory[invSlot] > 0) {
                    Vars.dragSlot = invSlot;
                    return;
                }

                // Check action buttons
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
                }
            }
        });
    });

    window.addEventListener('touchmove', (e) => {
        if (uiState.isSettingsOpen || uiState.isShopOpen || uiState.isInventoryOpen) return;
        Array.from(e.changedTouches).forEach(t => {
            // Update mouse position for drag visualization
            Vars.mouseX = t.clientX;
            Vars.mouseY = t.clientY;

            // Only rotate if NOT touching any UI
            if (!uiTouchIds.has(t.identifier) && t.identifier !== throwTouchId && t.identifier !== attackTouchId) {
                updateRotationFromTouch(t.clientX, t.clientY);
            }
        });
    });

    window.addEventListener('touchend', (e) => {
        Array.from(e.changedTouches).forEach(t => {
            // Clean up UI touch tracking
            uiTouchIds.delete(t.identifier);

            // Handle hotbar swap on touch end
            if (Vars.dragSlot !== -1) {
                handleHotbarSwap(t.clientX, t.clientY);
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
    // Scale screen coordinates to internal canvas coordinates
    const sx = clientX * (LC.width / window.innerWidth);
    const sy = clientY * (LC.height / window.innerHeight);

    const btnX = LC.width - config.xOffset;
    const btnY = LC.height - config.yOffset;
    const dist = Math.sqrt(Math.pow(sx - btnX, 2) + Math.pow(sy - btnY, 2));
    return dist <= config.radius + (config.touchPadding || 0);
}

function isTouchOnUI(clientX, clientY) {
    // Check if touching any UI element
    const joyContainer = document.getElementById('joystick-container');
    const chatBtn = document.getElementById('mobile-chat-btn');
    const chatInput = document.getElementById('chatInput');

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

    // Check Top Row Buttons
    const topButtons = ['settingsBtn', 'fullscreenBtn', 'shopBtn', 'pauseBtn'];
    for (const id of topButtons) {
        const btn = document.getElementById(id);
        if (btn && btn.offsetParent !== null) {
            const rect = btn.getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return true;
        }
    }

    // Check joystick
    if (joyContainer && joyContainer.offsetParent !== null) {
        const joyRect = joyContainer.getBoundingClientRect();
        if (clientX >= joyRect.left && clientX <= joyRect.right &&
            clientY >= joyRect.top && clientY <= joyRect.bottom) {
            return true;
        }
    }

    // Check chat button
    if (chatBtn && chatBtn.offsetParent !== null) {
        const chatBtnRect = chatBtn.getBoundingClientRect();
        if (clientX >= chatBtnRect.left && clientX <= chatBtnRect.right &&
            clientY >= chatBtnRect.top && clientY <= chatBtnRect.bottom) {
            return true;
        }
    }

    // Check chat input
    if (chatInput && chatInput.offsetParent !== null) {
        const chatRect = chatInput.getBoundingClientRect();
        if (clientX >= chatRect.left && clientX <= chatRect.right &&
            clientY >= chatRect.top && clientY <= chatRect.bottom) {
            return true;
        }
    }

    // Check hotbar
    if (isClickingHotbar(clientX, clientY) !== -1) {
        return true;
    }

    if (isClickingInventory(clientX, clientY) !== -1) {
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

// --- Desktop Controls ---
export function setupDesktopControls() {
    window.addEventListener("mousemove", (e) => {
        // Always track mouse position for dragging
        Vars.mouseX = e.clientX;
        Vars.mouseY = e.clientY;

        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
        if (!myPlayer?.isAlive || ws?.readyState !== ws.OPEN || uiState.isSettingsOpen || Vars.dragSlot !== -1) return;

        const angle = Math.atan2(e.clientY - innerHeight / 2, e.clientX - innerWidth / 2);
        sendRotation(angle);
    });

    window.addEventListener("mousedown", (e) => {
        if (isUIElement(e.target)) return;

        const slotClicked = isClickingHotbar(e.clientX, e.clientY);
        const invSlot = isClickingInventory(e.clientX, e.clientY);

        if (e.shiftKey && uiState.isShopOpen && uiState.activeShopTab === 'Sell') {
            const clickedSlot = slotClicked !== -1 ? slotClicked : invSlot;
            if (clickedSlot !== -1) {
                const queued = queueSellSlot(clickedSlot);
                if (queued) return;
            }
        }

        if (e.shiftKey) {
            // Hotbar -> Inventory
            if (uiState.isInventoryOpen && slotClicked !== -1 && slotClicked < 5 && Vars.myInventory[slotClicked] > 0 && !uiState.itemsInSellQueue.includes(slotClicked)) {
                for (let i = 5; i < 35; i++) {
                    if (Vars.myInventory[i] === 0 && !uiState.itemsInSellQueue.includes(i)) {
                        Vars.myInventory[i] = Vars.myInventory[slotClicked];
                        Vars.myInventory[slotClicked] = 0;

                        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
                        if (myPlayer && Vars.selectedSlot === slotClicked) {
                            myPlayer.weaponRank = 0;
                        }

                        sendSwapPacket(slotClicked, i);
                        return;
                    }
                }
                return;
            }

            // Inventory -> Hotbar
            if (invSlot !== -1 && Vars.myInventory[invSlot] > 0 && !uiState.itemsInSellQueue.includes(invSlot)) {
                for (let i = 0; i < 5; i++) {
                    if (Vars.myInventory[i] === 0 && !uiState.itemsInSellQueue.includes(i)) {
                        Vars.myInventory[i] = Vars.myInventory[invSlot];
                        Vars.myInventory[invSlot] = 0;

                        const myPlayer = ENTITIES.PLAYERS[Vars.myId];
                        if (myPlayer && Vars.selectedSlot === i) {
                            myPlayer.weaponRank = Vars.myInventory[i];
                        }

                        sendSwapPacket(invSlot, i);
                        return;
                    }
                }
                return;
            }
        }

        if (slotClicked !== -1) {
            handleHotbarSelection(slotClicked);
            return;
        }

        if (invSlot !== -1 && Vars.myInventory[invSlot] > 0 && !uiState.itemsInSellQueue.includes(invSlot)) {
            Vars.dragSlot = invSlot;
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

function queueSellSlot(slotIdx) {
    if (Vars.myInventory[slotIdx] <= 0) return;
    const type = Vars.myInventory[slotIdx] & 0x7F;
    if (!isSellableItem(type)) return false;
    if (uiState.itemsInSellQueue.includes(slotIdx)) return false;

    uiState.itemsInSellQueue.push(slotIdx);
    updateShopBody();
    return true;
}
