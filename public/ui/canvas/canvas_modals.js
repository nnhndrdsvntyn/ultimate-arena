import { getWeaponConfig, getWeaponSize, getWeaponSellPrice, getWeaponDisplayName, isWeaponRank } from '../../shared/datamap.js';
import {
    clampModalScroll,
    createClippedBodyRegion,
    drawCanvasModalBackdrop,
    drawCanvasModalCloseButton,
    drawCanvasModalTabs,
    drawModalScrollbar,
    finishClippedBodyRegion,
    getClientRectFromLogicalRect,
    resetCanvasModalState,
    setupCanvasModalLayout,
    wrapCanvasText
} from './modal_utils.js';

const addHitbox = (state, type, x, y, width, height, data = {}) => {
    state.hitboxes.push({ type, x, y, width, height, data });
};

const addBodyHitbox = (state, bodyRect, type, x, y, width, height, data = {}) => {
    const visible = y + height >= bodyRect.y && y <= bodyRect.y + bodyRect.height;
    if (!visible) return;
    state.hitboxes.push({ type, x, y, width, height, data });
};

const ARCADE_UI = {
    panel: '#243249',
    panelDark: '#1e293b',
    ink: '#111827',
    title: '#dbeafe',
    muted: '#94a3b8',
    green: '#10b981',
    blue: '#3b82f6',
    red: '#ef4444',
    white: '#ffffff'
};

const drawArcadeRect = (LC, x, y, width, height, {
    color = ARCADE_UI.panel,
    stroke = ARCADE_UI.ink,
    strokeWidth = 5,
    radius = 16,
    shadow = 8
} = {}) => {
    if (shadow > 0) {
        LC.drawRect({
            pos: [x, y + shadow],
            size: [width, height],
            color: ARCADE_UI.ink,
            cornerRadius: radius
        });
    }
    LC.drawRect({
        pos: [x, y],
        size: [width, height],
        color,
        stroke,
        strokeWidth,
        cornerRadius: radius
    });
};

const fitCanvasText = (LC, text, maxWidth, font) => {
    const metrics = LC.measureText({ text, font });
    if (metrics.width <= maxWidth) return text;
    let out = text;
    while (out.length > 0) {
        out = out.slice(0, -1);
        const candidate = `${out}…`;
        if (LC.measureText({ text: candidate, font }).width <= maxWidth) return candidate;
    }
    return '';
};

const getSwordSellPrice = (_dataMap, rank) => getWeaponSellPrice(rank);

const getInventoryItemCount = (Vars, itemType) => {
    let total = 0;
    for (let i = 0; i < Vars.myInventory.length; i++) {
        if (Vars.myInventory[i] === itemType) {
            total += (Vars.myInventoryCounts[i] || 0);
        }
    }
    return total;
};

const getAccessoryCostConfig = (dataMap, key) => {
    const costConfig = dataMap.ACCESSORY_COSTS?.[key];
    if (costConfig && typeof costConfig === 'object') {
        return {
            currency: costConfig.currency || 'coin',
            amount: Math.max(0, Math.floor(costConfig.amount || 0))
        };
    }
    return {
        currency: 'coin',
        amount: Math.max(0, Math.floor(dataMap.ACCESSORY_PRICE || 30))
    };
};

const getAccessorySellPrice = (dataMap, accessoryId, accessoryKeys) => {
    const key = accessoryKeys?.[accessoryId];
    if (!key) return 0;
    if (key === 'minotaur_hat') return 300;
    const costConfig = getAccessoryCostConfig(dataMap, key);
    return Math.floor(costConfig.amount * 0.5);
};

const formatAccessoryName = (key, accessory) => {
    if (key === 'heart_shades') return 'HEART SHADES';
    if (accessory?.displayName) return accessory.displayName;
    return key.replace(/-/g, ' ').toUpperCase();
};

const getShopCatalog = (shopCanvasState, dataMap, accessoryKeys) => {
    const itemCount = Array.isArray(dataMap.SHOP_ITEMS) ? dataMap.SHOP_ITEMS.length : 0;
    const accessoryCount = Array.isArray(accessoryKeys) ? accessoryKeys.length : 0;
    const signature = `${itemCount}:${accessoryCount}`;
    const cached = shopCanvasState._shopCatalogCache;
    if (cached && cached.signature === signature) return cached.catalog;

    const shopItems = Array.isArray(dataMap.SHOP_ITEMS) ? dataMap.SHOP_ITEMS : [];
    const swords = [];
    const spears = [];
    const axes = [];
    for (let i = 0; i < shopItems.length; i++) {
        const item = shopItems[i];
        if (!item) continue;
        const category = item.category || 'sword';
        if (category === 'spear') {
            spears.push(item);
        } else if (category === 'axe') {
            axes.push(item);
        } else {
            swords.push(item);
        }
    }

    const accessories = [];
    for (let id = 1; id < accessoryKeys.length; id++) {
        const key = accessoryKeys[id];
        if (!key || key === 'none') continue;
        const accessory = dataMap.ACCESSORIES[key];
        if (!accessory || accessory.shopHidden) continue;
        accessories.push({ id, key, accessory });
    }

    const catalog = { swords, axes, spears, accessories };
    shopCanvasState._shopCatalogCache = { signature, catalog };
    return catalog;
};

const drawModalTitle = (LC, text, x, y) => {
    LC.drawText({
        text,
        pos: [x, y],
        font: '900 20px Nunito',
        color: ARCADE_UI.title,
        textAlign: 'left'
    });
};

export function drawSettingsModal(ctx) {
    const {
        uiState,
        Vars,
        LC,
        settingsCanvasState,
        VIEW_RANGE_MIN,
        VIEW_RANGE_MAX,
        VIEW_RANGE_RECOMMENDED_MOBILE,
        VIEW_RANGE_RECOMMENDED_DESKTOP,
        BACK_BUFFER_QUALITIES
    } = ctx;

    if (!uiState.isSettingsOpen) {
        resetCanvasModalState(settingsCanvasState, {
            activeSlider: null,
            inputFocused: false,
            dragActive: false
        });
        return;
    }

    const panelRect = setupCanvasModalLayout(LC, settingsCanvasState, {
        maxWidth: 540,
        maxHeight: 420,
        marginX: 24,
        marginY: 24
    });
    const { x: panelX, y: panelY, width: panelW, height: panelH } = panelRect;

    drawCanvasModalBackdrop(LC, 'rgba(0,0,0,0.45)');
    drawArcadeRect(LC, panelX, panelY, panelW, panelH, { radius: 20, shadow: 10 });
    drawArcadeRect(LC, panelX, panelY, panelW, 48, { color: ARCADE_UI.panelDark, radius: 16, shadow: 0 });

    // Header
    drawModalTitle(LC, 'SETTINGS', panelX + 18, panelY + 30);
    addHitbox(settingsCanvasState, 'drag', panelX, panelY, panelW - 60, 48);

    const closeSize = 26;
    const closeX = panelX + panelW - closeSize - 16;
    const closeY = panelY + 12;
    drawCanvasModalCloseButton(LC, closeX, closeY, closeSize);
    addHitbox(settingsCanvasState, 'close', closeX, closeY, closeSize, closeSize);

    // Tabs
    const tabs = ['Visuals'];
    if (!tabs.includes(uiState.activeTab)) {
        uiState.activeTab = 'Visuals';
    }
    const tabY = panelY + 58;
    const tabH = 30;
    const tabXStart = panelX + 20;
    const tabW = drawCanvasModalTabs(LC, tabs, uiState.activeTab, {
        x: tabXStart,
        y: tabY,
        width: panelW - 56,
        height: tabH
    });
    tabs.forEach((tab, i) => {
        const tx = tabXStart + i * tabW;
        addHitbox(settingsCanvasState, 'tab', tx, tabY, tabW - 8, tabH, { tab });
    });

    // Body area
    const bodyClipX = panelX + 24;
    const bodyYStart = panelY + 108;
    const bodyClipW = panelW - 48;
    const bodyH = panelH - 132;
    const bodyRect = { x: bodyClipX, y: bodyYStart, width: bodyClipW, height: bodyH };
    const bodyContentPad = 12;
    const bodyX = bodyRect.x + bodyContentPad;
    const bodyW = bodyRect.width - (bodyContentPad * 2);
    const bodyVisibleH = bodyRect.height - (bodyContentPad * 2);
    const bodyContentStart = bodyRect.y + bodyContentPad;
    let bodyY = bodyContentStart - settingsCanvasState.scrollY;
    let contentHeight = 0;

    createClippedBodyRegion(LC, {
        x: bodyRect.x,
        y: bodyRect.y,
        width: bodyRect.width,
        height: bodyRect.height,
        padding: bodyContentPad,
        scrollY: settingsCanvasState.scrollY
    });

    if (uiState.activeTab === 'Visuals') {
        const header = (text) => {
            LC.drawText({
                text: text.toUpperCase(),
                pos: [bodyX, bodyY],
                font: '900 13px Nunito',
                color: ARCADE_UI.muted,
                textAlign: 'left'
            });
            bodyY += 22;
            contentHeight += 22;
        };
        const drawCard = (x, y, w, h) => {
            drawArcadeRect(LC, x, y, w, h, { color: ARCADE_UI.panelDark, radius: 14, shadow: 5, strokeWidth: 4 });
        };
        const cardX = bodyX;
        const cardW = bodyW - 8;
        const cardPadX = 12;
        const cardGap = 12;

        header('View Distance');
        const sliderCardH = 70;
        drawCard(cardX, bodyY - 18, cardW, sliderCardH);
        LC.drawText({
            text: 'Max View Range %',
            pos: [cardX + cardPadX, bodyY + 6],
            font: '900 12.5px Nunito',
            color: 'white',
            textAlign: 'left'
        });
        const sliderX = cardX + cardPadX;
        const sliderY = bodyY + 26;
        const sliderW = cardW - (cardPadX * 2) - 60;
        const sliderH = 8;
        const range = VIEW_RANGE_MAX - VIEW_RANGE_MIN;
        const t = Math.max(0, Math.min(1, (Vars.viewRangeMult - VIEW_RANGE_MIN) / Math.max(0.001, range)));
        LC.drawRect({ pos: [sliderX, sliderY], size: [sliderW, sliderH], color: ARCADE_UI.ink, cornerRadius: 5 });
        LC.drawRect({ pos: [sliderX, sliderY], size: [sliderW * t, sliderH], color: ARCADE_UI.blue, cornerRadius: 5 });
        const knobX = sliderX + (sliderW * t);
        LC.ctx.save();
        LC.ctx.beginPath();
        LC.ctx.arc(knobX, sliderY + sliderH / 2, 7, 0, Math.PI * 2);
        LC.ctx.fillStyle = 'white';
        LC.ctx.fill();
        LC.ctx.restore();
        addBodyHitbox(settingsCanvasState, bodyRect, 'slider', sliderX, sliderY - 6, sliderW, sliderH + 12, { id: 'viewRange' });
        LC.drawText({
            text: Vars.viewRangeMult.toFixed(2),
            pos: [sliderX + sliderW + 8, sliderY + 10],
            font: '900 12px Nunito',
            color: ARCADE_UI.title,
            textAlign: 'left'
        });
        bodyY += (sliderCardH + cardGap);
        contentHeight += (sliderCardH + cardGap);
        LC.drawText({
            text: `RECOMMENDED: MOBILE ${VIEW_RANGE_RECOMMENDED_MOBILE.toFixed(1)} · DESKTOP ${VIEW_RANGE_RECOMMENDED_DESKTOP.toFixed(1)}`,
            pos: [bodyX, bodyY],
            font: '800 10px Nunito',
            color: ARCADE_UI.muted,
            textAlign: 'left'
        });
        bodyY += 30;
        contentHeight += 30;

        header('Graphics Quality');
        const selectCardH = 46;
        drawCard(cardX, bodyY - 18, cardW, selectCardH);
        LC.drawText({
            text: 'Resolution',
            pos: [cardX + cardPadX, bodyY + 6],
            font: '900 12.5px Nunito',
            color: 'white',
            textAlign: 'left'
        });
        const selectW = 176;
        const selectH = 26;
        const selectX = (cardX + cardW - cardPadX) - selectW;
        const selectY = bodyY - 6;
        drawArcadeRect(LC, selectX, selectY, selectW, selectH, { color: ARCADE_UI.ink, radius: 10, shadow: 3, strokeWidth: 3 });
        const currentQuality = BACK_BUFFER_QUALITIES.find(opt => opt.value === Vars.backBufferQuality) ?? BACK_BUFFER_QUALITIES[0];
        const qualityLabel = String(currentQuality?.label ?? currentQuality?.value ?? '');
        const fittedLabel = fitCanvasText(LC, qualityLabel, selectW - 34, '900 12px Nunito');
        LC.drawText({
            text: fittedLabel,
            pos: [selectX + 12, selectY + 18],
            font: '900 12px Nunito',
            color: 'rgba(255,255,255,0.85)',
            textAlign: 'left'
        });
        LC.drawText({
            text: '▾',
            pos: [selectX + selectW - 18, selectY + 18],
            font: '900 13px Nunito',
            color: 'rgba(255,255,255,0.9)',
            textAlign: 'center'
        });
        addBodyHitbox(settingsCanvasState, bodyRect, 'select', selectX, selectY, selectW, selectH, { id: 'backBuffer' });
        bodyY += (selectCardH + cardGap);
        contentHeight += (selectCardH + cardGap);
    }

    finishClippedBodyRegion(LC);

    clampModalScroll(settingsCanvasState, contentHeight, bodyVisibleH);
    drawModalScrollbar(LC, settingsCanvasState.scrollY, settingsCanvasState.scrollMax, contentHeight, bodyRect, panelX + panelW - 12);
}

export function drawShopModal(ctx) {
    const {
        uiState,
        Vars,
        LC,
        shopCanvasState,
        dataMap,
        ACCESSORY_KEYS,
        ACCESSORY_DESCRIPTIONS,
        isWeaponRank,
        isAccessoryItemType,
        accessoryIdFromItemType,
        CURRENT_WORLD,
        WORLD_TUTORIAL,
        isMobile,
        isSellableItem
    } = ctx;

    if (!uiState.isShopOpen) {
        resetCanvasModalState(shopCanvasState, {
            scrollY: 0,
            scrollMax: 0,
            dragActive: false,
            buyButtonRects: '__clear_map__',
            hoverInfoText: '',
            sellDropRect: null,
            closeButtonRect: null
        });
        return;
    }

    shopCanvasState.buyButtonRects.clear();
    shopCanvasState.sellDropRect = null;
    const shopCatalog = getShopCatalog(shopCanvasState, dataMap, ACCESSORY_KEYS);

    const panelRect = setupCanvasModalLayout(LC, shopCanvasState, {
        maxWidth: 720,
        maxHeight: 520,
        marginX: 16,
        marginY: 16
    });
    const { x: panelX, y: panelY, width: panelW, height: panelH } = panelRect;

    drawCanvasModalBackdrop(LC, 'rgba(0,0,0,0.45)');
    drawArcadeRect(LC, panelX, panelY, panelW, panelH, { radius: 20, shadow: 10 });
    drawArcadeRect(LC, panelX, panelY, panelW, 48, { color: ARCADE_UI.panelDark, radius: 16, shadow: 0 });

    // Header
    drawModalTitle(LC, 'SHOP', panelX + 18, panelY + 30);
    addHitbox(shopCanvasState, 'drag', panelX, panelY, panelW - 60, 48);

    const closeSize = 26;
    const closeX = panelX + panelW - closeSize - 16;
    const closeY = panelY + 12;
    drawCanvasModalCloseButton(LC, closeX, closeY, closeSize);
    addHitbox(shopCanvasState, 'close', closeX, closeY, closeSize, closeSize);
    shopCanvasState.closeButtonRect = getClientRectFromLogicalRect(LC, closeX, closeY, closeSize, closeSize);

    // Coins counter
    const coins = (Vars.myStats.goldCoins || 0).toLocaleString();
    const coinBoxW = 120;
    const coinBoxH = 28;
    const coinBoxX = panelX + panelW - coinBoxW - 56;
    const coinBoxY = panelY + 12;
    drawArcadeRect(LC, coinBoxX, coinBoxY, coinBoxW, coinBoxH, { color: ARCADE_UI.ink, radius: 10, shadow: 3, strokeWidth: 3 });
    LC.drawImage({
        name: 'gold_coin',
        pos: [coinBoxX + 6, coinBoxY + 6],
        size: [16, 16]
    });
    LC.drawText({
        text: coins,
        pos: [coinBoxX + 28, coinBoxY + 19],
        font: '900 12px Nunito',
        color: ARCADE_UI.title,
        textAlign: 'left'
    });

    // Tabs
    const tabs = ['Buy', 'Sell'];
    const tabY = panelY + 54;
    const tabH = 30;
    const tabXStart = panelX + 20;
    const tabW = drawCanvasModalTabs(LC, tabs, uiState.activeShopTab, {
        x: tabXStart,
        y: tabY,
        width: panelW - 56,
        height: tabH
    });
    tabs.forEach((tab, i) => {
        const tx = tabXStart + i * tabW;
        addHitbox(shopCanvasState, 'tab', tx, tabY, tabW - 8, tabH, { tab });
    });

    const bodyClipX = panelX + 16;
    const bodyYStart = panelY + 144;
    const bodyClipW = panelW - 32;
    const bodyTopInset = 34;
    const bodyBottomInset = 16;
    const bodyRectY = bodyYStart + bodyTopInset;
    const bodyRectH = Math.max(0, panelH - (bodyRectY - panelY) - bodyBottomInset);
    const bodyRect = { x: bodyClipX, y: bodyRectY, width: bodyClipW, height: bodyRectH };
    const bodyContentPad = 18;
    const bodyX = bodyRect.x + bodyContentPad;
    const bodyW = bodyRect.width - (bodyContentPad * 2);
    const bodyVisibleH = bodyRect.height - (bodyContentPad * 2);
    const bodyContentStart = bodyRect.y + bodyContentPad;
    let bodyY = bodyContentStart - shopCanvasState.scrollY;
    let contentHeight = 0;

    createClippedBodyRegion(LC, {
        x: bodyRect.x,
        y: bodyRect.y,
        width: bodyRect.width,
        height: bodyRect.height,
        padding: bodyContentPad,
        scrollY: shopCanvasState.scrollY
    });

    if (uiState.activeShopTab === 'Buy') {
        const sectionTitle = (text) => {
            const titleY = bodyY;
            const visible = (titleY + 26) >= bodyRect.y && titleY <= (bodyRect.y + bodyRect.height);
            bodyY += 34;
            contentHeight += 34;
            if (!visible) return;
            LC.ctx.save();
            LC.ctx.textBaseline = 'top';
            LC.ctx.shadowColor = ARCADE_UI.ink;
            LC.ctx.shadowBlur = 4;
            LC.drawText({
                text: text.toUpperCase(),
                pos: [bodyX + 4, titleY + 10],
                font: '900 15px Nunito',
                color: ARCADE_UI.muted,
                textAlign: 'left'
            });
            LC.ctx.restore();
        };

        const drawItemCard = (x, y, w, h, cfg) => {
            if (y + h < bodyRect.y || y > (bodyRect.y + bodyRect.height)) return;
            const attention = uiState.shopAttentionRank === cfg.attentionRank;
            const now = performance.now();
            const ringT = attention ? ((now % 1200) / 1200) : 0;
            const ringAlpha = attention ? (0.9 * (1 - ringT)) : 0;
            const ringPad = attention ? (4 + ringT * 10) : 0;
            const ringX = x - ringPad;
            const ringY = y - ringPad;
            const ringW = w + ringPad * 2;
            const ringH = h + ringPad * 2;
            if (attention) {
                LC.ctx.save();
                LC.ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha})`;
                LC.ctx.lineWidth = 3;
                LC.ctx.beginPath();
                const r = 12 + ringPad * 0.4;
                const rx = ringX;
                const ry = ringY;
                const rw = ringW;
                const rh = ringH;
                LC.ctx.moveTo(rx + r, ry);
                LC.ctx.lineTo(rx + rw - r, ry);
                LC.ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
                LC.ctx.lineTo(rx + rw, ry + rh - r);
                LC.ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
                LC.ctx.lineTo(rx + r, ry + rh);
                LC.ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
                LC.ctx.lineTo(rx, ry + r);
                LC.ctx.quadraticCurveTo(rx, ry, rx + r, ry);
                LC.ctx.stroke();
                LC.ctx.restore();
            }

            drawArcadeRect(LC, x, y, w, h, {
                color: ARCADE_UI.panelDark,
                stroke: attention ? ARCADE_UI.red : ARCADE_UI.ink,
                strokeWidth: attention ? 5 : 4,
                radius: 14,
                shadow: 6
            });
            if (attention) {
                LC.ctx.save();
                LC.ctx.globalAlpha = 0.8;
                LC.ctx.strokeStyle = 'rgba(239,68,68,0.55)';
                LC.ctx.lineWidth = 2;
                LC.ctx.beginPath();
                const r = 12;
                const rx = x;
                const ry = y;
                const rw = w;
                const rh = h;
                LC.ctx.moveTo(rx + r, ry);
                LC.ctx.lineTo(rx + rw - r, ry);
                LC.ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
                LC.ctx.lineTo(rx + rw, ry + rh - r);
                LC.ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
                LC.ctx.lineTo(rx + r, ry + rh);
                LC.ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
                LC.ctx.lineTo(rx, ry + r);
                LC.ctx.quadraticCurveTo(rx, ry, rx + r, ry);
                LC.ctx.stroke();
                LC.ctx.restore();
            }

            if (cfg.iconName) {
                const img = LC.images?.[cfg.iconName];
                const maxIcon = 64;
                let iw = maxIcon;
                let ih = maxIcon;
                if (img?.width && img?.height) {
                    const aspect = img.width / img.height;
                    if (aspect >= 1) {
                        iw = maxIcon;
                        ih = maxIcon / aspect;
                    } else {
                        ih = maxIcon;
                        iw = maxIcon * aspect;
                    }
                }
                LC.drawImage({
                    name: cfg.iconName,
                    pos: [x + (w - iw) / 2, y + 10 + (maxIcon - ih) / 2],
                    size: [iw, ih],
                    rotation: cfg.iconRotation || 0
                });
            }
            if (cfg.iconText) {
                drawArcadeRect(LC, x + (w - 72) / 2, y + 10, 72, 64, {
                    color: ARCADE_UI.panel,
                    stroke: ARCADE_UI.title,
                    strokeWidth: 4,
                    radius: 10,
                    shadow: 4
                });
                LC.drawText({
                    text: cfg.iconText,
                    pos: [x + w / 2, y + 50],
                    font: '900 16px Nunito',
                    color: ARCADE_UI.title,
                    textAlign: 'center'
                });
            }

            LC.drawText({
                text: cfg.name,
                pos: [x + w / 2, y + 92],
                font: '900 12px Nunito',
                color: 'white',
                textAlign: 'center'
            });

            const priceRows = Array.isArray(cfg.priceRows) && cfg.priceRows.length > 0
                ? cfg.priceRows
                : [{ iconName: cfg.priceIconName || 'gold_coin', text: cfg.priceText }];
            const priceStartY = y + 102;
            const priceRowGap = 16;
            priceRows.forEach((row, rowIndex) => {
                const rowY = priceStartY + (rowIndex * priceRowGap);
                LC.drawImage({
                    name: row.iconName || 'gold_coin',
                    pos: [x + w / 2 - 18, rowY],
                    size: [14, 14]
                });
                LC.drawText({
                    text: row.text || '',
                    pos: [x + w / 2 + 2, rowY + 11],
                    font: '900 12px Nunito',
                    color: ARCADE_UI.title,
                    textAlign: 'left'
                });
            });

            const btnW = w - 24;
            const btnH = 24;
            const btnX = x + 12;
            const btnY = y + h - btnH - 12;
            drawArcadeRect(LC, btnX, btnY, btnW, btnH, {
                color: cfg.canBuy ? ARCADE_UI.green : '#64748b',
                radius: 10,
                shadow: 4,
                strokeWidth: 4
            });
            LC.drawText({
                text: cfg.buttonText,
                pos: [btnX + btnW / 2, btnY + 17],
                font: '900 11px Nunito',
                color: ARCADE_UI.white,
                textAlign: 'center'
            });
            addBodyHitbox(shopCanvasState, bodyRect, 'buy', btnX, btnY, btnW, btnH, { kind: cfg.kind, id: cfg.id, canBuy: cfg.canBuy });

            const key = `${cfg.kind}:${cfg.id}`;
            shopCanvasState.buyButtonRects.set(key, getClientRectFromLogicalRect(LC, btnX, btnY, btnW, btnH));

            if (cfg.infoText) {
                const infoSize = 16;
                const infoX = x + w - infoSize - 8;
                const infoY = y + 8;
                drawArcadeRect(LC, infoX, infoY, infoSize, infoSize, {
                    color: ARCADE_UI.blue,
                    radius: 8,
                    shadow: 3,
                    strokeWidth: 3
                });
                LC.drawText({
                    text: 'i',
                    pos: [infoX + infoSize / 2, infoY + infoSize / 2 + 5],
                    font: '900 12px Nunito',
                    color: 'white',
                    textAlign: 'center'
                });
                addBodyHitbox(shopCanvasState, bodyRect, 'info', infoX, infoY, infoSize, infoSize, { text: cfg.infoText, x: infoX, y: infoY });
            }
        };

        const tutorialSword1Only = (CURRENT_WORLD === WORLD_TUTORIAL) && (Vars.tutorialObjectiveStep === 5) && !Vars.myInventory.some((t, idx) => ((t & 0x7F) === 2) && Vars.myInventoryCounts[idx] > 0);

        const gridGap = 12;
        const minCardW = 150;
        const cols = Math.max(2, Math.min(4, Math.floor((bodyW + gridGap) / (minCardW + gridGap))));
        const cardW = Math.floor((bodyW - (cols - 1) * gridGap) / cols);
        const cardH = 172;

        const drawWeaponCards = (title, items) => {
            if (!items.length) return;
            sectionTitle(title);
            let col = 0;
            let rowY = bodyY;
            items.forEach(itemConfig => {
                const canAfford = (Vars.myStats.goldCoins || 0) >= itemConfig.price;
                const tutorialAllowed = !tutorialSword1Only || itemConfig.id === 2;
                const canBuy = canAfford && tutorialAllowed;
                const cfg = {
                    kind: itemConfig.category || 'sword',
                    id: itemConfig.id,
                    iconName: getWeaponConfig(itemConfig.id)?.name || getWeaponConfig(1)?.name,
                    name: itemConfig.name,
                    priceText: itemConfig.price.toLocaleString(),
                    canBuy,
                    buttonText: tutorialAllowed ? (canAfford ? 'BUY' : 'TOO POOR') : 'LOCKED',
                    attentionRank: itemConfig.id
                };
                const x = bodyX + col * (cardW + gridGap);
                drawItemCard(x, rowY, cardW, cardH, cfg);
                col++;
                if (col >= cols) {
                    col = 0;
                    rowY += cardH + gridGap;
                }
            });
            bodyY = rowY + (col > 0 ? cardH + gridGap : 0);
            contentHeight = bodyY - bodyContentStart + shopCanvasState.scrollY;
        };

        drawWeaponCards('Swords', shopCatalog.swords);
        drawWeaponCards('Axes', shopCatalog.axes);
        drawWeaponCards('Spears', shopCatalog.spears);

        sectionTitle('Accessories');
        let col = 0;
        let rowY = bodyY;
        shopCatalog.accessories.forEach(({ id, key, accessory }) => {
            const costConfig = getAccessoryCostConfig(dataMap, key);
            const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
            const canAfford = costConfig.currency === 'hearty_essence'
                ? (essenceType ? getInventoryItemCount(Vars, essenceType) >= costConfig.amount : false)
                : (Vars.myStats.goldCoins || 0) >= costConfig.amount;
            const canBuy = canAfford && !tutorialSword1Only;
            const cfg = {
                kind: 'accessory',
                id,
                iconName: accessory.name,
                name: formatAccessoryName(key, accessory),
                priceText: costConfig.amount.toLocaleString(),
                priceIconName: costConfig.currency === 'hearty_essence' ? 'objects_hearty_essence' : 'gold_coin',
                canBuy,
                buttonText: tutorialSword1Only ? 'LOCKED' : (canAfford ? 'BUY' : 'TOO POOR'),
                infoText: ACCESSORY_DESCRIPTIONS[key] || 'Coming Soon'
            };
            const x = bodyX + col * (cardW + gridGap);
            drawItemCard(x, rowY, cardW, cardH, cfg);
            col++;
            if (col >= cols) {
                col = 0;
                rowY += cardH + gridGap;
            }
        });
        bodyY = rowY + (col > 0 ? cardH + gridGap : 0);
        contentHeight = bodyY - bodyContentStart + shopCanvasState.scrollY;

        sectionTitle('Misc');
        col = 0;
        rowY = bodyY;
        const specialItems = dataMap.SPECIAL_SHOP_ITEMS || [];
        specialItems.forEach((itemConfig) => {
            const coinCost = Math.max(0, Math.floor(itemConfig.coinCost || 0));
            const itemCosts = Array.isArray(itemConfig.itemCosts) ? itemConfig.itemCosts : [];
            let canAfford = (Vars.myStats.goldCoins || 0) >= coinCost;
            for (const cost of itemCosts) {
                const ingredientType = dataMap.OBJECT_TYPE_BY_KEY?.[cost?.key] || 0;
                const ingredientAmount = Math.max(0, Math.floor(cost?.amount || 0));
                if (!ingredientType || ingredientAmount <= 0 || getInventoryItemCount(Vars, ingredientType) < ingredientAmount) {
                    canAfford = false;
                    break;
                }
            }
            const canBuy = canAfford && !tutorialSword1Only;
            const cfg = {
                kind: 'special',
                id: itemConfig.itemType,
                iconName: dataMap.OBJECTS?.[itemConfig.itemType]?.imgName || 'objects_golden_skull',
                name: itemConfig.name || 'Special Item',
                priceRows: [
                    { iconName: 'gold_coin', text: coinCost.toLocaleString() },
                    { iconName: dataMap.OBJECTS?.[dataMap.OBJECT_TYPE_BY_KEY?.['skull'] || 0]?.imgName || 'objects_skull', text: '1' }
                ],
                canBuy,
                buttonText: tutorialSword1Only ? 'LOCKED' : (canAfford ? 'BUY' : 'TOO POOR')
            };
            const x = bodyX + col * (cardW + gridGap);
            drawItemCard(x, rowY, cardW, cardH, cfg);
            col++;
            if (col >= cols) {
                col = 0;
                rowY += cardH + gridGap;
            }
        });
        const xpItems = dataMap.XP_SHOP_ITEMS || [];
        xpItems.forEach((itemConfig) => {
            const canAfford = (Vars.myStats.goldCoins || 0) >= (itemConfig.price || 0);
            const canBuy = canAfford && !tutorialSword1Only;
            const cfg = {
                kind: 'xp',
                id: itemConfig.id,
                iconText: 'XP',
                name: itemConfig.name,
                priceText: (itemConfig.price || 0).toLocaleString(),
                canBuy,
                buttonText: tutorialSword1Only ? 'LOCKED' : (canAfford ? 'BUY' : 'TOO POOR')
            };
            const x = bodyX + col * (cardW + gridGap);
            drawItemCard(x, rowY, cardW, cardH, cfg);
            col++;
            if (col >= cols) {
                col = 0;
                rowY += cardH + gridGap;
            }
        });
        bodyY = rowY + (col > 0 ? cardH + gridGap : 0);
        contentHeight = bodyY - bodyContentStart + shopCanvasState.scrollY;
    } else {
        const note = isMobile
            ? 'Drag or tap items in your hotbar/inventory to queue for sale.'
            : 'Shift+Click or drag items in your hotbar/inventory to queue for sale.';
        const validQueue = uiState.itemsInSellQueue.filter(idx => {
            const type = Vars.myInventory[idx] & 0x7F;
            return isSellableItem(type);
        });

        const dropX = bodyX;
        const dropY = bodyY;
        const dropW = bodyW - 8;
        const notePadX = 8;
        const notePadY = 10;
        const noteFont = '800 12.5px Nunito';
        const noteLineH = 16;
        const noteWrapW = dropW - (notePadX * 2);
        const lines = wrapCanvasText(LC, note, noteWrapW, noteFont);
        const noteHeight = (lines.length * noteLineH);
        const noteBlockH = notePadY + noteHeight + 8;
        const separatorY = dropY + noteBlockH;
        const separatorPadX = 6;

        LC.drawRect({ pos: [dropX + separatorPadX, separatorY], size: [dropW - (separatorPadX * 2), 3], color: ARCADE_UI.ink, cornerRadius: 2 });

        LC.ctx.save();
        LC.ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
            LC.drawText({
                text: lines[i],
                pos: [dropX + notePadX, dropY + notePadY + (i * noteLineH)],
                font: noteFont,
                color: ARCADE_UI.muted,
                textAlign: 'left'
            });
        }
        LC.ctx.restore();

        const queuePad = 10;
        const queueBoxX = dropX;
        const queueBoxY = separatorY + 10;
        const queueInnerX = queueBoxX + queuePad;
        const queueInnerW = dropW - (queuePad * 2);
        const emptyQueueHeight = 46;
        const itemRowHeight = 44;
        const buttonBlockHeight = 44;
        const queueContentHeight = validQueue.length
            ? (validQueue.length * itemRowHeight + buttonBlockHeight)
            : emptyQueueHeight;
        const queueBoxH = queueContentHeight + (queuePad * 2);

        drawArcadeRect(LC, queueBoxX, queueBoxY, dropW, queueBoxH, {
            color: ARCADE_UI.panelDark,
            radius: 14,
            shadow: 6,
            strokeWidth: 4
        });

        shopCanvasState.sellDropRect = {
            x: queueBoxX,
            y: queueBoxY,
            width: dropW,
            height: queueBoxH,
            clientRect: getClientRectFromLogicalRect(LC, queueBoxX, queueBoxY, dropW, queueBoxH)
        };

        let queueBodyY = queueBoxY + queuePad;
        const queueBodyX = queueInnerX;
        const queueBodyW = queueInnerW;

        const dropSectionH = (queueBoxY + queueBoxH) - dropY;
        bodyY += dropSectionH + 12;
        contentHeight += dropSectionH + 12;

        if (!validQueue.length) {
            LC.drawText({
                text: 'NO ITEMS QUEUED',
                pos: [queueBodyX + 8, queueBodyY + 20],
                font: '900 14px Nunito',
                color: ARCADE_UI.muted,
                textAlign: 'left'
            });
            queueBodyY += emptyQueueHeight;
        } else {
            validQueue.forEach(slotIdx => {
                const rawType = Vars.myInventory[slotIdx] & 0x7F;
                const count = Vars.myInventoryCounts[slotIdx];
                let label = '';
                let iconName = '';
                let iconRotation = 0;
                let price = 0;

                if (isWeaponRank(rawType)) {
                    const sword = getWeaponConfig(rawType) || getWeaponConfig(1);
                    label = getWeaponDisplayName(rawType) || `Weapon ${rawType}`;
                    price = getSwordSellPrice(dataMap, rawType) * count;
                    iconName = sword?.name;
                    iconRotation = -Math.PI / 4;
                } else if (isAccessoryItemType(rawType)) {
                    const accessoryId = accessoryIdFromItemType(rawType);
                    const key = ACCESSORY_KEYS?.[accessoryId];
                    const accessory = key ? dataMap.ACCESSORIES[key] : null;
                    label = formatAccessoryName(key, accessory);
                    price = getAccessorySellPrice(dataMap, accessoryId, ACCESSORY_KEYS) * count;
                    iconName = accessory?.name || '';
                    iconRotation = 0;
                }

                if (!iconName) return;
                const removeSize = 18;
                const removeX = queueBodyX + queueBodyW - removeSize - 6;
                const removeY = queueBodyY + 9;
                drawArcadeRect(LC, queueBodyX, queueBodyY, queueBodyW, 36, {
                    color: ARCADE_UI.panel,
                    radius: 10,
                    shadow: 3,
                    strokeWidth: 4
                });
                const maxIcon = 26;
                let iw = maxIcon;
                let ih = maxIcon;
                if (isWeaponRank(rawType)) {
                    const [swordWidth, swordHeight] = getWeaponSize(rawType);
                    const swordAspect = swordWidth / swordHeight;
                    if (swordAspect >= 1) {
                        iw = maxIcon;
                        ih = maxIcon / swordAspect;
                    } else {
                        ih = maxIcon;
                        iw = maxIcon * swordAspect;
                    }
                }
                LC.drawImage({
                    name: iconName,
                    pos: [queueBodyX + 10, queueBodyY + 6 + (maxIcon - ih) / 2],
                    size: [iw, ih],
                    rotation: iconRotation
                });
                LC.drawText({
                    text: label,
                    pos: [queueBodyX + 44, queueBodyY + 22],
                    font: '900 12px Nunito',
                    color: 'white',
                    textAlign: 'left'
                });
                LC.drawText({
                    text: price.toLocaleString(),
                    pos: [removeX - 10, queueBodyY + 22],
                    font: '900 12px Nunito',
                    color: ARCADE_UI.title,
                    textAlign: 'right'
                });
                drawArcadeRect(LC, removeX, removeY, removeSize, removeSize, {
                    color: ARCADE_UI.red,
                    radius: 6,
                    shadow: 2,
                    strokeWidth: 3
                });
                LC.drawText({
                    text: '×',
                    pos: [removeX + removeSize / 2, removeY + removeSize / 2 + 5],
                    font: '900 14px Nunito',
                    color: 'white',
                    textAlign: 'center'
                });
                addBodyHitbox(shopCanvasState, bodyRect, 'sellItemRemove', removeX, removeY, removeSize, removeSize, { slotIdx });
                addBodyHitbox(shopCanvasState, bodyRect, 'sellItem', queueBodyX, queueBodyY, queueBodyW, 36, { slotIdx });
                queueBodyY += itemRowHeight;
            });

            const btnW = 160;
            const btnH = 30;
            const btnX = queueBodyX + queueBodyW - btnW;
            const btnY = queueBodyY + 4;
            drawArcadeRect(LC, btnX, btnY, btnW, btnH, {
                color: ARCADE_UI.green,
                radius: 10,
                shadow: 4,
                strokeWidth: 4
            });
            LC.drawText({
                text: `SELL ${validQueue.length} ITEMS`,
                pos: [btnX + btnW / 2, btnY + 20],
                font: '900 11px Nunito',
                color: ARCADE_UI.white,
                textAlign: 'center'
            });
            addBodyHitbox(shopCanvasState, bodyRect, 'sellAll', btnX, btnY, btnW, btnH, { queue: validQueue });
            queueBodyY += buttonBlockHeight;
        }
    }

    finishClippedBodyRegion(LC);

    clampModalScroll(shopCanvasState, contentHeight, bodyVisibleH);
    drawModalScrollbar(LC, shopCanvasState.scrollY, shopCanvasState.scrollMax, contentHeight, bodyRect, bodyRect.x + bodyRect.width - 8);

    if (shopCanvasState.hoverInfoText) {
        const text = shopCanvasState.hoverInfoText;
        const font = '800 12px Nunito';
        const metrics = LC.measureText({ text, font });
        const pad = 8;
        const maxTipW = 320;
        const tipW = Math.min(maxTipW, Math.max(180, metrics.width + pad * 2));
        const lineH = 16;
        const maxLines = 4;
        const wrapWidth = tipW - pad * 2;
        const lines = wrapCanvasText(LC, text, wrapWidth, font);
        const shownLines = lines.slice(0, maxLines);
        const tipH = Math.max(32, (shownLines.length * lineH) + pad * 2);
        const mx = (window._lastCursorX || 0);
        const my = (window._lastCursorY || 0);
        const pos = LC.clientToLogical(mx, my);
        let tipX = Math.min(LC.width - tipW - 8, pos.x + 14);
        let tipY = Math.max(8, pos.y - tipH - 6);
        drawArcadeRect(LC, tipX, tipY, tipW, tipH, {
            color: ARCADE_UI.panelDark,
            radius: 12,
            shadow: 5,
            strokeWidth: 4
        });
        for (let i = 0; i < shownLines.length; i++) {
            LC.drawText({
                text: shownLines[i],
                pos: [tipX + pad, tipY + pad + (i + 1) * lineH - 2],
                font,
                color: 'white',
                textAlign: 'left'
            });
        }
    }
}
