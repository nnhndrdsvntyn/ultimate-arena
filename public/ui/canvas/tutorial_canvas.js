const TUTORIAL_WORLD_TARGET_CACHE_MS = 150;
const tutorialWorldTargetCache = {
    world: '',
    playerId: 0,
    step: -1,
    expiresAt: 0,
    target: null
};

function findNearestTutorialWorldTarget(entities, matcher, localPlayer) {
    let best = null;
    let bestDistSq = Infinity;
    for (const id in entities) {
        const entity = entities[id];
        if (!entity || !matcher(entity)) continue;
        const dx = entity.x - localPlayer.x;
        const dy = entity.y - localPlayer.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            best = entity;
            bestDistSq = distSq;
        }
    }

    if (!best) return null;
    const dx = best.x - localPlayer.x;
    const dy = best.y - localPlayer.y;
    if ((dx * dx + dy * dy) <= (300 * 300)) return null;
    return { worldX: best.x, worldY: best.y };
}

export function drawTutorialObjective(ctx) {
    const {
        LC,
        Vars,
        CURRENT_WORLD,
        WORLD_TUTORIAL,
        isMobile,
        uiInput,
        TUTORIAL_DESKTOP_MOVEMENT_SEQUENCE,
        TUTORIAL_DESKTOP_MOVEMENT_HOLD_MS,
        tutorialMovementUi
    } = ctx;

    if (CURRENT_WORLD !== WORLD_TUTORIAL) return;
    if (!Vars.tutorialObjectiveVisible || !Vars.tutorialObjectiveText) return;

    const topBar = document.getElementById('top_left_bar');
    const contentRect = LC.getContentDisplayRect();
    const topBarBottom = topBar
        ? ((topBar.getBoundingClientRect().bottom - contentRect.top) * (LC.height / Math.max(1, contentRect.height)))
        : 0;
    const panelHeight = isMobile ? 64 : 56;
    const panelY = Math.max(18, Math.floor(topBarBottom + 10));
    const mobileTextByStep = {
        0: 'Use the joystick to move.',
        1: 'Tap & Hold ATTACK to swing.',
        2: 'Tap THROW to throw your weapon.',
        3: 'Attack & break this chest.',
        4: 'Walk over the coins to collect them.',
        5: 'Open the shop and buy the Branch Sword.',
        6: 'Tap the slot with the new sword to equip it.',
        7: 'Eliminate the pig.',
        8: 'Tutorial complete.'
    };
    let desktopMovementProgress = null;
    if (!isMobile && Vars.tutorialObjectiveStep === 0) {
        const stepIndex = TUTORIAL_DESKTOP_MOVEMENT_SEQUENCE.findIndex(step => step.text === Vars.tutorialObjectiveText);
        if (stepIndex >= 0) {
            if (tutorialMovementUi.stepIndex !== stepIndex) {
                tutorialMovementUi.stepIndex = stepIndex;
                tutorialMovementUi.holdStartedAt = 0;
            }
            const targetKey = TUTORIAL_DESKTOP_MOVEMENT_SEQUENCE[stepIndex].key;
            const isHoldingOnlyTarget = TUTORIAL_DESKTOP_MOVEMENT_SEQUENCE.every((step) => (
                step.key === targetKey ? uiInput.keys.has(step.key) : !uiInput.keys.has(step.key)
            ));
            if (isHoldingOnlyTarget) {
                if (!tutorialMovementUi.holdStartedAt) {
                    tutorialMovementUi.holdStartedAt = performance.now();
                }
                desktopMovementProgress = Math.max(0, Math.min(1, (performance.now() - tutorialMovementUi.holdStartedAt) / TUTORIAL_DESKTOP_MOVEMENT_HOLD_MS));
            } else {
                tutorialMovementUi.holdStartedAt = 0;
                desktopMovementProgress = 0;
            }
        } else {
            tutorialMovementUi.stepIndex = -1;
            tutorialMovementUi.holdStartedAt = 0;
        }
    } else {
        tutorialMovementUi.stepIndex = -1;
        tutorialMovementUi.holdStartedAt = 0;
    }
    const objectiveText = isMobile
        ? (mobileTextByStep[Vars.tutorialObjectiveStep] || Vars.tutorialObjectiveText)
        : Vars.tutorialObjectiveText;
    const font = isMobile ? '700 20px Inter' : '700 22px Inter';
    const textMetrics = LC.measureText({ text: objectiveText, font });
    const horizontalPadding = isMobile ? 36 : 42;
    const minPanelWidth = isMobile ? 280 : 320;
    const maxPanelWidth = Math.max(minPanelWidth, LC.width - 40);
    const panelWidth = Math.min(maxPanelWidth, Math.max(minPanelWidth, Math.ceil(textMetrics.width + horizontalPadding)));
    const panelX = (LC.width - panelWidth) * 0.5;

    const isComplete = Vars.tutorialObjectiveStatus === 1;
    const borderColor = isComplete ? 'rgba(34, 197, 94, 0.95)' : 'rgba(255, 255, 255, 0.92)';
    const textColor = isComplete ? '#34d399' : '#ffffff';
    const bgColor = isComplete ? 'rgba(6, 40, 22, 0.55)' : 'rgba(255, 255, 255, 0.16)';

    LC.drawRect({
        pos: [panelX, panelY],
        size: [panelWidth, panelHeight],
        color: bgColor,
        stroke: borderColor,
        strokeWidth: 2,
        cornerRadius: 10
    });
    if (desktopMovementProgress !== null && desktopMovementProgress > 0.001) {
        LC.drawRect({
            pos: [panelX, panelY],
            size: [panelWidth * desktopMovementProgress, panelHeight],
            color: 'rgba(21, 128, 61, 0.48)',
            cornerRadius: 10
        });
        LC.drawRect({
            pos: [panelX, panelY],
            size: [panelWidth, panelHeight],
            color: 'rgba(0, 0, 0, 0)',
            stroke: borderColor,
            strokeWidth: 2,
            cornerRadius: 10
        });
    }
    LC.drawText({
        text: objectiveText,
        pos: [LC.width / 2, panelY + (panelHeight / 2) + 6],
        font,
        color: textColor,
        textAlign: 'center'
    });
}

function worldToScreenPos(ctx, worldX, worldY) {
    const { LC, camera } = ctx;
    const logicalCenterX = LC.width / 2;
    const logicalCenterY = LC.height / 2;
    const unscaledX = worldX - camera.x;
    const unscaledY = worldY - camera.y;
    const logicalScreenX = ((unscaledX - logicalCenterX) * LC.zoom) + logicalCenterX;
    const logicalScreenY = ((unscaledY - logicalCenterY) * LC.zoom) + logicalCenterY;
    const clientPos = LC.logicalToClient(logicalScreenX, logicalScreenY);
    return {
        screenX: clientPos.x,
        screenY: clientPos.y
    };
}

function ensureTutorialIndicatorCanvas(ctx) {
    const { tutorialIndicatorUi } = ctx;
    if (typeof document === 'undefined') return null;
    if (!tutorialIndicatorUi.canvasEl) {
        const canvas = document.createElement('canvas');
        canvas.id = 'tutorial_arrow_canvas';
        Object.assign(canvas.style, {
            position: 'fixed',
            inset: '0',
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: '100500'
        });
        document.body.appendChild(canvas);
        tutorialIndicatorUi.canvasEl = canvas;
        tutorialIndicatorUi.ctx = canvas.getContext('2d');
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!tutorialIndicatorUi.canvasEl || !tutorialIndicatorUi.ctx) return null;
    if (tutorialIndicatorUi.width !== w || tutorialIndicatorUi.height !== h || tutorialIndicatorUi.dpr !== dpr) {
        tutorialIndicatorUi.width = w;
        tutorialIndicatorUi.height = h;
        tutorialIndicatorUi.dpr = dpr;
        tutorialIndicatorUi.canvasEl.width = Math.max(1, Math.floor(w * dpr));
        tutorialIndicatorUi.canvasEl.height = Math.max(1, Math.floor(h * dpr));
        tutorialIndicatorUi.canvasEl.style.width = `${w}px`;
        tutorialIndicatorUi.canvasEl.style.height = `${h}px`;
        tutorialIndicatorUi.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return tutorialIndicatorUi.ctx;
}

function clearTutorialIndicatorCanvas(ctx) {
    const { tutorialIndicatorUi } = ctx;
    const indicatorCtx = ensureTutorialIndicatorCanvas(ctx);
    if (!indicatorCtx) return;
    indicatorCtx.clearRect(0, 0, tutorialIndicatorUi.width, tutorialIndicatorUi.height);
}

function drawTutorialArrow(ctx, tipX, tipY, dirX, dirY) {
    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) return;
    const ux = dirX / len;
    const uy = dirY / len;
    const size = 16;
    const halfBase = 8;
    const baseX = tipX - ux * size;
    const baseY = tipY - uy * size;
    const perpX = -uy;
    const perpY = ux;
    const pulse = 0.78 + ((Math.sin(performance.now() * 0.009) + 1) * 0.1);

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX * halfBase, baseY + perpY * halfBase);
    ctx.lineTo(baseX - perpX * halfBase, baseY - perpY * halfBase);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 48, 48, ${pulse})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
}

function getHotbarLayout(ctx) {
    const { LC, HOTBAR_CONFIG } = ctx;
    const hb = HOTBAR_CONFIG;
    const totalW = (hb.slotSize * 6) + (hb.gap * 5) + (hb.padding * 2);
    return {
        hb,
        x: (LC.width / 2) - (totalW / 2),
        y: LC.height - hb.marginBottom - hb.slotSize - hb.padding * 2,
        totalW
    };
}

function drawTutorialHotbarSlotIndicators(ctx, canvasCtx) {
    const { LC, normalizeCanvasFont } = ctx;
    const { hb, x, y } = getHotbarLayout(ctx);
    const now = performance.now();

    for (let i = 0; i < 5; i++) {
        const slotX = x + hb.padding + (i * (hb.slotSize + hb.gap));
        const slotCenterX = slotX + (hb.slotSize / 2);
        const slotTopY = y + hb.padding;
        const clientCenter = LC.logicalToClient(slotCenterX, slotTopY);
        const bounce = Math.sin((now * 0.012) + (i * 0.45)) * 7;
        const tipY = clientCenter.y - 8 + bounce;

        canvasCtx.save();
        canvasCtx.font = normalizeCanvasFont('900 18px Inter');
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        canvasCtx.lineWidth = 4;
        canvasCtx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        canvasCtx.strokeText(String(i + 1), clientCenter.x, tipY - 28);
        canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        canvasCtx.fillText(String(i + 1), clientCenter.x, tipY - 28);
        canvasCtx.restore();

        drawTutorialArrow(canvasCtx, clientCenter.x, tipY, 0, 1);
    }
}

function getTutorialWorldTarget(ctx, step) {
    const {
        CURRENT_WORLD,
        WORLD_TUTORIAL,
        ENTITIES,
        Vars,
        isChestObjectType,
        isCoinObjectType
    } = ctx;

    if (CURRENT_WORLD !== WORLD_TUTORIAL) return null;
    const localPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!localPlayer) return null;
    const now = performance.now();
    if (
        tutorialWorldTargetCache.world === CURRENT_WORLD &&
        tutorialWorldTargetCache.playerId === Vars.myId &&
        tutorialWorldTargetCache.step === step &&
        tutorialWorldTargetCache.expiresAt > now
    ) {
        return tutorialWorldTargetCache.target;
    }

    let target = null;

    if (step === 3) {
        target = findNearestTutorialWorldTarget(ENTITIES.OBJECTS, (o) => isChestObjectType(o.type), localPlayer);
    } else if (step === 4) {
        target = findNearestTutorialWorldTarget(ENTITIES.OBJECTS, (o) => isCoinObjectType(o.type), localPlayer);
    } else if (step === 7) {
        target = findNearestTutorialWorldTarget(ENTITIES.MOBS, (m) => m.type === 2, localPlayer);
    }

    tutorialWorldTargetCache.world = CURRENT_WORLD;
    tutorialWorldTargetCache.playerId = Vars.myId;
    tutorialWorldTargetCache.step = step;
    tutorialWorldTargetCache.expiresAt = now + TUTORIAL_WORLD_TARGET_CACHE_MS;
    tutorialWorldTargetCache.target = target;
    return target;
}

function getTutorialUiTarget(ctx, step) {
    const {
        CURRENT_WORLD,
        WORLD_TUTORIAL,
        isMobile,
        LC,
        ATTACK_BTN_CONFIG,
        THROW_BTN_CONFIG,
        uiState,
        Vars,
        getTopBarButtonClientRect,
        getShopCanvasBuyButtonClientRect,
        shopCanvasState
    } = ctx;

    if (CURRENT_WORLD !== WORLD_TUTORIAL) return null;
    if (isMobile) {
        const toScreen = (lx, ly) => LC.logicalToClient(lx, ly);
        if (step === 1) {
            const p = toScreen(LC.width - ATTACK_BTN_CONFIG.xOffset, LC.height - ATTACK_BTN_CONFIG.yOffset);
            return { screenX: p.x, screenY: p.y, rectWidth: ATTACK_BTN_CONFIG.radius * 2, rectHeight: ATTACK_BTN_CONFIG.radius * 2 };
        }
        if (step === 2) {
            const p = toScreen(LC.width - THROW_BTN_CONFIG.xOffset, LC.height - THROW_BTN_CONFIG.yOffset);
            return { screenX: p.x, screenY: p.y, rectWidth: THROW_BTN_CONFIG.radius * 2, rectHeight: THROW_BTN_CONFIG.radius * 2 };
        }
    }
    const allowShopStep = step === 5 || (step === 6 && uiState.isShopOpen);
    if (!allowShopStep) return null;

    const hasRank2 = hasRank2SwordInInventory(ctx);
    let targetEl = null;
    let targetRect = null;
    if (!uiState.isShopOpen) {
        if (!hasRank2) targetRect = getTopBarButtonClientRect('shop');
    } else if (!hasRank2) {
        targetRect = getShopCanvasBuyButtonClientRect(2) || null;
        targetEl = targetRect ? null : document.querySelector('.shop_modal .buy_button[data-shop_item-type="2"]');
    } else {
        targetRect = getCanvasShopCloseRect(ctx) || null;
        targetEl = document.getElementById('shopCloseBtn') || document.querySelector('.shop_modal .close_settings');
    }
    if (isMobile && targetEl) {
        const elRect = targetEl.getBoundingClientRect();
        if (elRect && elRect.width > 0 && elRect.height > 0) {
            targetRect = null;
        } else {
            targetEl = null;
        }
    }
    const rect = targetRect || targetEl?.getBoundingClientRect();
    if (!rect) return null;
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (isMobile) {
        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop || 0;
        const viewportHeight = viewport?.height || window.innerHeight || 0;
        const viewportBottom = viewportTop + viewportHeight;
        const margin = 12;
        const isVerticallyVisible = rect.top >= (viewportTop + margin) && rect.bottom <= (viewportBottom - margin);
        if (!isVerticallyVisible) return null;
    }
    return {
        screenX: rect.left + rect.width / 2,
        screenY: rect.top + rect.height / 2,
        rectWidth: rect.width,
        rectHeight: rect.height
    };
}

export function drawTutorialTargetIndicator(ctx) {
    const { tutorialIndicatorUi, CURRENT_WORLD, WORLD_TUTORIAL, Vars, isMobile } = ctx;
    const indicatorCtx = ensureTutorialIndicatorCanvas(ctx);
    if (!indicatorCtx) return;
    indicatorCtx.clearRect(0, 0, tutorialIndicatorUi.width, tutorialIndicatorUi.height);

    if (CURRENT_WORLD !== WORLD_TUTORIAL) return;
    if (!Vars.tutorialObjectiveVisible) return;

    const step = Vars.tutorialObjectiveStep;
    if (!isMobile && step === 6) {
        drawTutorialHotbarSlotIndicators(ctx, indicatorCtx);
        return;
    }
    const centerX = tutorialIndicatorUi.width / 2;
    const centerY = tutorialIndicatorUi.height / 2;
    const uiTarget = getTutorialUiTarget(ctx, step);
    if (uiTarget) {
        const dx = uiTarget.screenX - centerX;
        const dy = uiTarget.screenY - centerY;
        const len = Math.hypot(dx, dy);
        if (len >= 6) {
            const ux = dx / len;
            const uy = dy / len;
            const outsideDist = (Math.hypot(uiTarget.rectWidth, uiTarget.rectHeight) * 0.5) + 10;
            const nudge = Math.sin(performance.now() * 0.012) * 10;
            const tipX = uiTarget.screenX - ux * (outsideDist + nudge);
            const tipY = uiTarget.screenY - uy * (outsideDist + nudge);
            drawTutorialArrow(indicatorCtx, tipX, tipY, ux, uy);
        }
        return;
    }

    const worldTarget = getTutorialWorldTarget(ctx, step);
    if (!worldTarget) return;
    const target = worldToScreenPos(ctx, worldTarget.worldX, worldTarget.worldY);
    const dx = target.screenX - centerX;
    const dy = target.screenY - centerY;
    const toTargetLen = Math.hypot(dx, dy);
    if (toTargetLen < 6) return;

    const orbitRadius = 200;
    const ux = dx / toTargetLen;
    const uy = dy / toTargetLen;
    const tipX = centerX + ux * orbitRadius;
    const tipY = centerY + uy * orbitRadius;
    drawTutorialArrow(indicatorCtx, tipX, tipY, ux, uy);
}

function ensureTutorialFocusUi(ctx) {
    const { tutorialFocusUi } = ctx;
    if (tutorialFocusUi.rootEl || typeof document === 'undefined') return;
    const root = document.createElement('div');
    root.id = 'tutorial_focus_overlay';
    Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '100350',
        display: 'none',
        pointerEvents: 'none'
    });

    const makeBlock = () => {
        const block = document.createElement('div');
        Object.assign(block.style, {
            position: 'fixed',
            background: 'rgba(0, 0, 0, 0.72)',
            pointerEvents: 'none'
        });
        root.appendChild(block);
        return block;
    };

    tutorialFocusUi.blocks = [makeBlock(), makeBlock(), makeBlock(), makeBlock()];
    const ring = document.createElement('div');
    Object.assign(ring.style, {
        position: 'fixed',
        border: '2px solid rgba(255,255,255,0.95)',
        borderRadius: '10px',
        boxShadow: '0 0 0 2px rgba(0,0,0,0.55), 0 0 24px rgba(255,255,255,0.35)',
        pointerEvents: 'none'
    });
    root.appendChild(ring);

    const hint = document.createElement('div');
    Object.assign(hint.style, {
        position: 'fixed',
        left: '50%',
        top: 'calc(env(safe-area-inset-top) + 56px)',
        transform: 'translateX(-50%)',
        maxWidth: 'min(92vw, 420px)',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.3)',
        background: 'rgba(8, 15, 35, 0.82)',
        color: 'white',
        font: '700 13px Inter, sans-serif',
        textAlign: 'center',
        letterSpacing: '0.01rem',
        pointerEvents: 'none',
        display: 'none'
    });
    root.appendChild(hint);

    tutorialFocusUi.ringEl = ring;
    tutorialFocusUi.hintEl = hint;
    tutorialFocusUi.rootEl = root;
    document.body.appendChild(root);
}

function hideTutorialFocus(ctx) {
    const { tutorialFocusUi } = ctx;
    ensureTutorialFocusUi(ctx);
    if (!tutorialFocusUi.rootEl) return;
    tutorialFocusUi.rootEl.style.display = 'none';
    if (tutorialFocusUi.hintEl) tutorialFocusUi.hintEl.style.display = 'none';
}

function showTutorialScrollHint(ctx, message) {
    const { tutorialFocusUi } = ctx;
    ensureTutorialFocusUi(ctx);
    if (!tutorialFocusUi.rootEl || !tutorialFocusUi.hintEl) return;
    for (const b of tutorialFocusUi.blocks) b.style.display = 'none';
    if (tutorialFocusUi.ringEl) tutorialFocusUi.ringEl.style.display = 'none';
    tutorialFocusUi.hintEl.textContent = message || '';
    tutorialFocusUi.hintEl.style.display = message ? 'block' : 'none';
    tutorialFocusUi.rootEl.style.display = 'block';
}

function setTutorialFocusTarget(ctx, targetEl) {
    ensureTutorialFocusUi(ctx);
    if (!ctx.tutorialFocusUi.rootEl || !targetEl) {
        hideTutorialFocus(ctx);
        return;
    }
    const rect = targetEl.getBoundingClientRect();
    setTutorialFocusRect(ctx, rect);
}

function setTutorialFocusRect(ctx, rect) {
    const { tutorialFocusUi } = ctx;
    ensureTutorialFocusUi(ctx);
    if (!tutorialFocusUi.rootEl || !rect) {
        hideTutorialFocus(ctx);
        return;
    }
    if (rect.width <= 0 || rect.height <= 0) {
        hideTutorialFocus(ctx);
        return;
    }

    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(0, rect.left - pad);
    const top = Math.max(0, rect.top - pad);
    const right = Math.min(vw, rect.right + pad);
    const bottom = Math.min(vh, rect.bottom + pad);

    const [bTop, bLeft, bRight, bBottom] = tutorialFocusUi.blocks;
    for (const b of tutorialFocusUi.blocks) b.style.display = 'block';
    if (tutorialFocusUi.ringEl) tutorialFocusUi.ringEl.style.display = 'block';
    Object.assign(bTop.style, { left: '0px', top: '0px', width: `${vw}px`, height: `${Math.max(0, top)}px` });
    Object.assign(bLeft.style, { left: '0px', top: `${top}px`, width: `${Math.max(0, left)}px`, height: `${Math.max(0, bottom - top)}px` });
    Object.assign(bRight.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, vw - right)}px`, height: `${Math.max(0, bottom - top)}px` });
    Object.assign(bBottom.style, { left: '0px', top: `${bottom}px`, width: `${vw}px`, height: `${Math.max(0, vh - bottom)}px` });

    Object.assign(tutorialFocusUi.ringEl.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, right - left)}px`,
        height: `${Math.max(0, bottom - top)}px`
    });

    tutorialFocusUi.rootEl.style.display = 'block';
}

function hasRank2SwordInInventory(ctx) {
    const { Vars } = ctx;
    return Vars.myInventory.some((itemType, idx) => ((itemType & 0x7F) === 2) && Vars.myInventoryCounts[idx] > 0);
}

function getCanvasShopCloseRect(ctx) {
    const { shopCanvasState, LC } = ctx;
    // Prefer DOM close button if present
    const domBtn = document.getElementById('shopCloseBtn') || document.querySelector('.shop_modal .close_settings');
    if (domBtn) {
        const r = domBtn.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    if (shopCanvasState?.closeButtonRect) return shopCanvasState.closeButtonRect;
    const rect = shopCanvasState?.rect;
    if (!rect) return null;
    const closeSize = 26;
    const closeX = rect.x + rect.width - closeSize - 16;
    const closeY = rect.y + 12;
    const closeClientTopLeft = LC.logicalToClient(closeX, closeY);
    const closeClientBottomRight = LC.logicalToClient(closeX + closeSize, closeY + closeSize);
    return {
        left: closeClientTopLeft.x,
        top: closeClientTopLeft.y,
        right: closeClientBottomRight.x,
        bottom: closeClientBottomRight.y,
        width: closeClientBottomRight.x - closeClientTopLeft.x,
        height: closeClientBottomRight.y - closeClientTopLeft.y
    };
}

export function updateTutorialGuidedShopFocus(ctx) {
    const {
        CURRENT_WORLD,
        WORLD_TUTORIAL,
        Vars,
        uiState,
        isMobile,
        sendTutorialEvent,
        getTopBarButtonClientRect,
        getShopCanvasBuyButtonClientRect,
        shopCanvasState
    } = ctx;

    if (CURRENT_WORLD !== WORLD_TUTORIAL) {
        ctx.tutorialFocusUi.closeAckSent = false;
        hideTutorialFocus(ctx);
        return;
    }
    const wantsShopFocus = Vars.tutorialObjectiveVisible
        && (Vars.tutorialObjectiveStep === 5 || (Vars.tutorialObjectiveStep === 6 && uiState.isShopOpen));
    if (!wantsShopFocus) {
        ctx.tutorialFocusUi.closeAckSent = false;
        const shopModalEl = document.querySelector('.shop_modal');
        if (shopModalEl) shopModalEl.classList.remove('drag_disabled');
        hideTutorialFocus(ctx);
        return;
    }

    const hasRank2 = hasRank2SwordInInventory(ctx);
    if (hasRank2 && !uiState.isShopOpen && !ctx.tutorialFocusUi.closeAckSent) {
        sendTutorialEvent(1); // Shop closed after purchasing rank 2.
        ctx.tutorialFocusUi.closeAckSent = true;
    }

    let targetEl = null;
    let targetRect = null;
    if (!uiState.isShopOpen) {
        if (!hasRank2) {
            targetRect = getTopBarButtonClientRect('shop');
        }
    } else if (!hasRank2) {
        targetRect = getShopCanvasBuyButtonClientRect(2) || null;
        targetEl = targetRect ? null : document.querySelector('.shop_modal .buy_button[data-shop_item-type="2"]');
    } else {
        targetRect = getCanvasShopCloseRect(ctx) || null;
        targetEl = document.getElementById('shopCloseBtn') || document.querySelector('.shop_modal .close_settings');
    }

    const shopModalEl = document.querySelector('.shop_modal');
    if (shopModalEl) {
        // During guided buy step, keep modal fixed for better mobile UX.
        if (uiState.isShopOpen && !hasRank2) shopModalEl.classList.add('drag_disabled');
        else shopModalEl.classList.remove('drag_disabled');
    }

    if (isMobile && uiState.isShopOpen && !hasRank2) {
        if (targetEl) {
            const elRect = targetEl.getBoundingClientRect();
            if (elRect && elRect.width > 0 && elRect.height > 0) {
                targetRect = null;
            } else {
                targetEl = null;
            }
        }
        const rect = targetRect || targetEl?.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop || 0;
        const viewportHeight = viewport?.height || window.innerHeight || 0;
        const viewportBottom = viewportTop + viewportHeight;
        const margin = 12;
        const targetVisible = !!rect && rect.width > 0 && rect.height > 0 && rect.top >= (viewportTop + margin) && rect.bottom <= (viewportBottom - margin);
        if (!targetVisible) {
            hideTutorialFocus(ctx); // Do not block touches while user scrolls the shop.
            showTutorialScrollHint(ctx, 'Scroll to find the Branch Sword, then tap Buy.');
            return;
        }
    }

    showTutorialScrollHint(ctx, '');
    if (targetEl) setTutorialFocusTarget(ctx, targetEl);
    else if (targetRect) setTutorialFocusRect(ctx, targetRect);
    else hideTutorialFocus(ctx);
}

export function showTutorialChoicePrompt(ctx) {
    const { normalizeCanvasFont } = ctx;
    return new Promise((resolve) => {
        const existing = document.getElementById('tutorial_choice_canvas');
        if (existing) existing.remove();

        const canvas = document.createElement('canvas');
        canvas.id = 'tutorial_choice_canvas';
        Object.assign(canvas.style, {
            position: 'fixed',
            inset: '0',
            width: '100vw',
            height: '100dvh',
            zIndex: '100500',
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
        });
        document.body.appendChild(canvas);

        const canvasCtx = canvas.getContext('2d');
        const state = { hover: '' };
        let uiW = window.visualViewport?.width || window.innerWidth;
        let uiH = window.visualViewport?.height || window.innerHeight;

        const getRects = () => {
            const w = uiW;
            const h = uiH;
            const isCompact = w <= 520;
            const panelW = Math.min(700, Math.max(isCompact ? 250 : 340, Math.floor(w * (isCompact ? 0.9 : 0.6))));
            const panelH = isCompact ? 210 : 250;
            const panelX = Math.floor((w - panelW) / 2);
            const panelY = Math.floor((h - panelH) / 2);
            const btnGap = isCompact ? 12 : 20;
            const btnPad = isCompact ? 14 : 20;
            const btnW = Math.floor((panelW - (btnPad * 2) - btnGap) / 2);
            const btnH = isCompact ? 54 : 70;
            const yes = { x: panelX + btnPad, y: panelY + panelH - btnH - btnPad, w: btnW, h: btnH };
            const no = { x: panelX + panelW - btnW - btnPad, y: panelY + panelH - btnH - btnPad, w: btnW, h: btnH };
            return { panelX, panelY, panelW, panelH, yes, no, isCompact };
        };

        const draw = () => {
            const w = uiW;
            const h = uiH;
            const { panelX, panelY, panelW, panelH, yes, no, isCompact } = getRects();

            canvasCtx.clearRect(0, 0, w, h);
            canvasCtx.fillStyle = 'rgba(5, 7, 12, 0.4)';
            canvasCtx.fillRect(0, 0, w, h);

            canvasCtx.fillStyle = 'rgba(12, 45, 110, 1)';
            canvasCtx.strokeStyle = 'rgba(255,255,255,1)';
            canvasCtx.lineWidth = 2;
            roundRect(canvasCtx, panelX, panelY, panelW, panelH, 16);
            canvasCtx.fill();
            canvasCtx.stroke();

            canvasCtx.fillStyle = '#ffffff';
            canvasCtx.font = normalizeCanvasFont(isCompact ? '900 20px Inter' : '900 34px Inter');
            canvasCtx.textAlign = 'center';
            if (isCompact || panelW < 520) {
                const line1 = 'WOULD YOU LIKE';
                const line2 = 'A TUTORIAL?';
                canvasCtx.fillText(line1, panelX + panelW / 2, panelY + 60);
                canvasCtx.fillText(line2, panelX + panelW / 2, panelY + 92);
            } else {
                canvasCtx.fillText('WOULD YOU LIKE A TUTORIAL?', panelX + panelW / 2, panelY + 78);
            }

            drawButton(canvasCtx, yes, state.hover === 'yes', 'YES', normalizeCanvasFont);
            drawButton(canvasCtx, no, state.hover === 'no', 'NO', normalizeCanvasFont);
        };

        const resize = () => {
            uiW = window.visualViewport?.width || window.innerWidth;
            uiH = window.visualViewport?.height || window.innerHeight;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            canvas.width = Math.max(1, Math.floor(uiW * dpr));
            canvas.height = Math.max(1, Math.floor(uiH * dpr));
            canvas.style.width = `${uiW}px`;
            canvas.style.height = `${uiH}px`;
            canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            draw();
        };

        const fromEvent = (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = (e.clientX - rect.left);
            const sy = (e.clientY - rect.top);
            return { sx, sy };
        };

        const inside = (rect, x, y) => x >= rect.x && x <= (rect.x + rect.w) && y >= rect.y && y <= (rect.y + rect.h);

        const cleanup = () => {
            window.removeEventListener('resize', resize);
            if (window.visualViewport) window.visualViewport.removeEventListener('resize', onViewportResize);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('click', onClick);
            canvas.remove();
        };

        const onViewportResize = () => resize();

        const onMove = (e) => {
            const { yes, no } = getRects();
            const { sx, sy } = fromEvent(e);
            if (inside(yes, sx, sy)) state.hover = 'yes';
            else if (inside(no, sx, sy)) state.hover = 'no';
            else state.hover = '';
            draw();
        };

        const onClick = (e) => {
            const { yes, no } = getRects();
            const { sx, sy } = fromEvent(e);
            if (inside(yes, sx, sy)) {
                cleanup();
                resolve(true);
                return;
            }
            if (inside(no, sx, sy)) {
                cleanup();
                resolve(false);
            }
        };

        window.addEventListener('resize', resize);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportResize);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('touchstart', (e) => {
            const touch = e.changedTouches?.[0];
            if (!touch) return;
            onClick({ clientX: touch.clientX, clientY: touch.clientY });
        }, { passive: true });
        resize();
    });
}

function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function drawButton(ctx, rect, hover, label, normalizeCanvasFont) {
    ctx.fillStyle = hover ? 'rgba(46, 204, 113, 0.95)' : 'rgba(255,255,255,0.2)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    const fontSize = Math.max(16, Math.min(30, Math.floor(rect.h * 0.45)));
    ctx.font = normalizeCanvasFont(`900 ${fontSize}px Inter`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textBaseline = 'alphabetic';
}
