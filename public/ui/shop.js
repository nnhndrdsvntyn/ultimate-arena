import {
    CURRENT_WORLD,
    Vars,
    WORLD_TUTORIAL
} from '../client.js';
import { sendBuyPacket, sendSellAllPacket } from '../helpers.js';
import {
    ACCESSORY_DESCRIPTIONS,
    ACCESSORY_KEYS,
    accessoryIdFromItemType,
    accessoryItemTypeFromId,
    dataMap,
    getWeaponConfig,
    getWeaponDisplayName,
    getWeaponSellPrice,
    isAccessoryItemType,
    isSellableItem,
    isWeaponRank,
    isWeaponTypeStronger
} from '../shared/datamap.js';
import { createEl, makeDraggable } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { isMobile } from './config.js';
import { resetInputs } from './input.js';

export function createShopButton(_parent) {
    // The top bar button is drawn by the HUD canvas; the modal itself is DOM.
}

export function createShopModal(parent) {
    if (uiRefs.shopOverlay) return;

    uiRefs.shopOverlay = createEl('div', {}, parent, { className: 'modal_overlay' });
    uiRefs.shopModal = createEl('div', {}, uiRefs.shopOverlay, { className: 'shop_modal' });

    const header = createEl('div', { cursor: 'move' }, uiRefs.shopModal, { className: 'shop_header' });
    createEl('h2', {}, header, { textContent: 'SHOP' });
    const coinBox = createEl('div', {}, header, { className: 'shop_coin_box' });
    createEl('img', {}, coinBox, { className: 'shop_price_icon', src: './images/objects/gold_coin.png', alt: '' });
    createEl('span', {}, coinBox, { id: 'shop_coin_count', textContent: '0' });
    const closeBtn = createEl('button', {}, header, { id: 'shopCloseBtn', className: 'close_settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleShopModal(false);
    makeDraggable(uiRefs.shopModal, header);

    const tabsContainer = createEl('div', {}, uiRefs.shopModal, { className: 'shop_tabs' });
    ['Buy', 'Sell'].forEach((tab) => {
        const tabEl = createEl('button', {}, tabsContainer, {
            className: `shop_tab ${tab === uiState.activeShopTab ? 'active' : ''}`,
            type: 'button',
            textContent: tab
        });
        tabEl.onclick = () => {
            uiState.activeShopTab = tab;
            updateShopBody();
        };
    });

    uiRefs.shopBody = createEl('div', {}, uiRefs.shopModal, { className: 'shop_body settings_body' });
    updateShopBody();
}

function getBestSwordRank() {
    let best = 0;
    for (let i = 0; i < Vars.myInventory.length; i++) {
        if ((Vars.myInventoryCounts[i] || 0) <= 0) continue;
        const rank = Vars.myInventory[i] & 0x7F;
        if (isWeaponRank(rank) && isWeaponTypeStronger(rank, best)) best = rank;
    }
    return best;
}

function getAffordableBetterSwordRank() {
    const bestRank = getBestSwordRank();
    const coins = Vars.myStats.goldCoins || 0;
    let bestAffordable = null;
    for (const item of dataMap.SHOP_ITEMS || []) {
        if (!isWeaponTypeStronger(item.id, bestRank)) continue;
        if (coins < (item.price || 0)) continue;
        if (!bestAffordable || isWeaponTypeStronger(item.id, bestAffordable)) bestAffordable = item.id;
    }
    return bestAffordable;
}

function getInventoryItemCount(itemType) {
    let total = 0;
    for (let i = 0; i < Vars.myInventory.length; i++) {
        if (Vars.myInventory[i] === itemType) total += (Vars.myInventoryCounts[i] || 0);
    }
    return total;
}

function getAccessoryCostConfig(key) {
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
}

function getAccessorySellPrice(accessoryId) {
    const key = ACCESSORY_KEYS?.[accessoryId];
    if (!key) return 0;
    if (key === 'minotaur_hat') return 300;
    return Math.floor(getAccessoryCostConfig(key).amount * 0.5);
}

function formatAccessoryName(key, accessory) {
    if (key === 'heart_shades') return 'HEART SHADES';
    if (accessory?.displayName) return accessory.displayName;
    return String(key || '').replace(/[-_]/g, ' ').toUpperCase();
}

function getAssetSrc(configOrName, fallback = './images/objects/gold_coin.png') {
    if (!configOrName) return fallback;
    if (typeof configOrName === 'string') {
        const pools = [dataMap.OBJECTS, dataMap.ACCESSORIES, dataMap.SWORDS?.imgs, dataMap.SPEARS?.imgs, dataMap.UI];
        for (const pool of pools) {
            const found = Object.values(pool || {}).find(item => item?.name === configOrName || item?.imgName === configOrName);
            if (found?.src || found?.imgSrc) return found.src || found.imgSrc;
        }
        return fallback;
    }
    return configOrName.src || configOrName.imgSrc || fallback;
}

function splitShopWeapons() {
    const swords = [];
    const spears = [];
    for (const item of dataMap.SHOP_ITEMS || []) {
        if ((item?.category || 'sword') === 'spear') spears.push(item);
        else swords.push(item);
    }
    return { swords, spears };
}

function isTutorialBranchSwordOnly() {
    return CURRENT_WORLD === WORLD_TUTORIAL
        && Vars.tutorialObjectiveStep === 5
        && !Vars.myInventory.some((type, idx) => ((type & 0x7F) === 2) && Vars.myInventoryCounts[idx] > 0);
}

export function updateShopAttentionIndicator() {
    const targetRank = getAffordableBetterSwordRank();
    uiState.shopAttentionRank = targetRank;
    const dot = document.getElementById('shop_alert_dot');
    if (dot) dot.style.display = targetRank ? 'block' : 'none';
}

export function updateShopBody() {
    updateShopAttentionIndicator();
    if (!uiRefs.shopBody) return;

    const coinCount = document.getElementById('shop_coin_count');
    if (coinCount) coinCount.textContent = (Vars.myStats.goldCoins || 0).toLocaleString();

    uiRefs.shopModal?.querySelectorAll('.shop_tab').forEach(el => {
        el.classList.toggle('active', el.textContent === uiState.activeShopTab);
    });

    uiRefs.shopBody.innerHTML = '';
    if (uiState.activeShopTab === 'Sell') renderSellTab();
    else renderBuyTab();
}

export function toggleShopModal(show) {
    uiState.isShopOpen = !!show;
    if (uiRefs.shopOverlay) uiRefs.shopOverlay.style.display = show ? 'flex' : 'none';
    if (!show) {
        uiState.itemsInSellQueue = [];
        updateShopBody();
        return;
    }
    resetInputs();
    updateShopBody();
}

function renderBuyTab() {
    const tutorialLockedToBranch = isTutorialBranchSwordOnly();
    const { swords, spears } = splitShopWeapons();
    renderWeaponSection('Swords', swords, tutorialLockedToBranch);
    renderWeaponSection('Spears', spears, tutorialLockedToBranch);
    renderAccessoriesSection(tutorialLockedToBranch);
    renderMiscSection(tutorialLockedToBranch);
}

function renderSection(title) {
    createEl('div', {}, uiRefs.shopBody, { className: 'shop_section_title', textContent: title });
    return createEl('div', {}, uiRefs.shopBody, { className: 'shop_grid' });
}

function renderWeaponSection(title, items, tutorialLockedToBranch) {
    if (!items.length) return;
    const grid = renderSection(title);
    for (const item of items) {
        const canAfford = (Vars.myStats.goldCoins || 0) >= item.price;
        const tutorialAllowed = !tutorialLockedToBranch || item.id === 2;
        addShopItem(grid, {
            kind: item.category || 'sword',
            id: item.id,
            name: item.name,
            iconSrc: getAssetSrc(getWeaponConfig(item.id)),
            priceRows: [{ iconSrc: './images/objects/gold_coin.png', text: item.price.toLocaleString() }],
            canBuy: canAfford && tutorialAllowed,
            buttonText: tutorialAllowed ? (canAfford ? 'Buy' : 'Too Poor') : 'Locked',
            attentionRank: item.id
        });
    }
}

function renderAccessoriesSection(tutorialLockedToBranch) {
    const grid = renderSection('Accessories');
    for (let id = 1; id < ACCESSORY_KEYS.length; id++) {
        const key = ACCESSORY_KEYS[id];
        if (!key || key === 'none') continue;
        const accessory = dataMap.ACCESSORIES[key];
        if (!accessory || accessory.shopHidden) continue;
        const costConfig = getAccessoryCostConfig(key);
        const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
        const canAfford = costConfig.currency === 'hearty_essence'
            ? (essenceType ? getInventoryItemCount(essenceType) >= costConfig.amount : false)
            : (Vars.myStats.goldCoins || 0) >= costConfig.amount;
        const iconSrc = costConfig.currency === 'hearty_essence'
            ? getAssetSrc(dataMap.OBJECTS?.[essenceType], './images/objects/hearty_essence.png')
            : './images/objects/gold_coin.png';
        addShopItem(grid, {
            kind: 'accessory',
            id,
            name: formatAccessoryName(key, accessory),
            iconSrc: getAssetSrc(accessory),
            priceRows: [{ iconSrc, text: costConfig.amount.toLocaleString() }],
            canBuy: canAfford && !tutorialLockedToBranch,
            buttonText: tutorialLockedToBranch ? 'Locked' : (canAfford ? 'Buy' : 'Too Poor'),
            infoText: ACCESSORY_DESCRIPTIONS[key] || 'Coming Soon'
        });
    }
}

function renderMiscSection(tutorialLockedToBranch) {
    const grid = renderSection('Misc');
    for (const item of dataMap.SPECIAL_SHOP_ITEMS || []) {
        const coinCost = Math.max(0, Math.floor(item.coinCost || 0));
        const itemCosts = Array.isArray(item.itemCosts) ? item.itemCosts : [];
        let canAfford = (Vars.myStats.goldCoins || 0) >= coinCost;
        const priceRows = [{ iconSrc: './images/objects/gold_coin.png', text: coinCost.toLocaleString() }];
        for (const cost of itemCosts) {
            const ingredientType = dataMap.OBJECT_TYPE_BY_KEY?.[cost?.key] || 0;
            const amount = Math.max(0, Math.floor(cost?.amount || 0));
            if (!ingredientType || amount <= 0 || getInventoryItemCount(ingredientType) < amount) canAfford = false;
            priceRows.push({ iconSrc: getAssetSrc(dataMap.OBJECTS?.[ingredientType]), text: amount.toLocaleString() });
        }
        addShopItem(grid, {
            kind: 'special',
            id: item.itemType,
            name: item.name || 'Special Item',
            iconSrc: getAssetSrc(dataMap.OBJECTS?.[item.itemType]),
            priceRows,
            canBuy: canAfford && !tutorialLockedToBranch,
            buttonText: tutorialLockedToBranch ? 'Locked' : (canAfford ? 'Buy' : 'Too Poor')
        });
    }

    for (const item of dataMap.XP_SHOP_ITEMS || []) {
        const canAfford = (Vars.myStats.goldCoins || 0) >= (item.price || 0);
        addShopItem(grid, {
            kind: 'xp',
            id: item.id,
            name: item.name,
            iconText: 'XP',
            priceRows: [{ iconSrc: './images/objects/gold_coin.png', text: (item.price || 0).toLocaleString() }],
            canBuy: canAfford && !tutorialLockedToBranch,
            buttonText: tutorialLockedToBranch ? 'Locked' : (canAfford ? 'Buy' : 'Too Poor')
        });
    }
}

function addShopItem(parent, cfg) {
    const item = createEl('div', {}, parent, {
        className: `shop_item ${uiState.shopAttentionRank === cfg.attentionRank ? 'shop_item_attention' : ''}`
    });

    if (cfg.infoText) {
        const info = createEl('div', {}, item, { className: 'shop_item_info_corner', textContent: 'i' });
        const tip = createEl('div', {}, item, { className: 'shop_item_info_tip', textContent: cfg.infoText });
        info.onmouseenter = () => tip.classList.add('visible');
        info.onmouseleave = () => tip.classList.remove('visible');
        info.ontouchstart = (e) => {
            e.stopPropagation();
            tip.classList.toggle('visible');
        };
    }

    if (cfg.iconText) {
        createEl('div', {}, item, { className: 'shop_item_icon shop_item_icon_text', textContent: cfg.iconText });
    } else {
        createEl('img', {}, item, { className: 'shop_item_icon', src: cfg.iconSrc, alt: '' });
    }

    createEl('div', {}, item, { className: 'shop_item_name', textContent: cfg.name });
    const price = createEl('div', {}, item, { className: 'shop_item_price' });
    for (const row of cfg.priceRows || []) {
        const line = createEl('span', {}, price, { className: 'shop_price_row' });
        createEl('img', {}, line, { className: 'shop_price_icon', src: row.iconSrc, alt: '' });
        createEl('span', {}, line, { textContent: row.text });
    }

    const btn = createEl('button', {}, item, {
        className: `buy_button ${cfg.canBuy ? '' : 'disabled'}`,
        type: 'button',
        textContent: cfg.buttonText
    });
    btn.dataset.itemId = String(cfg.id);
    btn.dataset.shopItemType = String(cfg.id);
    btn.disabled = !cfg.canBuy;
    btn.onclick = () => {
        if (!cfg.canBuy) return;
        const itemType = cfg.kind === 'accessory' ? accessoryItemTypeFromId(cfg.id) : cfg.id;
        sendBuyPacket(itemType);
    };
}

function renderSellTab() {
    const note = isMobile
        ? 'Drag or tap items in your hotbar/inventory to queue for sale.'
        : 'Shift+Click or drag items in your hotbar/inventory to queue for sale.';
    createEl('div', {}, uiRefs.shopBody, { className: 'shop_sell_help', textContent: note });

    const drop = createEl('div', {}, uiRefs.shopBody, {
        id: 'shop_sell_slot',
        className: 'shop_sell_drop'
    });
    createEl('div', {}, drop, { className: 'shop_sell_title', textContent: 'Sell Queue' });

    const validQueue = uiState.itemsInSellQueue.filter(slotIdx => {
        const type = Vars.myInventory[slotIdx] & 0x7F;
        return isSellableItem(type);
    });
    uiState.itemsInSellQueue = validQueue;

    if (!validQueue.length) {
        createEl('div', {}, drop, { className: 'shop_sell_empty', textContent: 'NO ITEMS QUEUED' });
        return;
    }

    for (const slotIdx of validQueue) {
        const item = getSellQueueItem(slotIdx);
        if (!item) continue;
        const row = createEl('button', {}, drop, {
            className: 'shop_sell_row',
            type: 'button'
        });
        createEl('img', {}, row, { className: 'shop_sell_icon', src: item.iconSrc, alt: '' });
        createEl('span', {}, row, { className: 'shop_sell_name', textContent: item.label });
        createEl('span', {}, row, { className: 'shop_sell_price', textContent: item.price.toLocaleString() });
        createEl('span', {}, row, { className: 'shop_sell_remove', textContent: '×' });
        row.onclick = () => {
            uiState.itemsInSellQueue = uiState.itemsInSellQueue.filter(idx => idx !== slotIdx);
            updateShopBody();
        };
    }

    const sellBtn = createEl('button', {}, uiRefs.shopBody, {
        className: 'shop_sell_all',
        type: 'button',
        textContent: `Sell ${validQueue.length} Items`
    });
    sellBtn.onclick = () => {
        validQueue.forEach(slotIdx => {
            Vars.myInventory[slotIdx] = 0;
            Vars.myInventoryCounts[slotIdx] = 0;
        });
        sendSellAllPacket(validQueue);
        uiState.itemsInSellQueue = [];
        updateShopBody();
    };
}

function getSellQueueItem(slotIdx) {
    const rawType = Vars.myInventory[slotIdx] & 0x7F;
    const count = Vars.myInventoryCounts[slotIdx] || 1;

    if (isWeaponRank(rawType)) {
        return {
            label: getWeaponDisplayName(rawType) || `Weapon ${rawType}`,
            price: getWeaponSellPrice(rawType) * count,
            iconSrc: getAssetSrc(getWeaponConfig(rawType))
        };
    }

    if (isAccessoryItemType(rawType)) {
        const accessoryId = accessoryIdFromItemType(rawType);
        const key = ACCESSORY_KEYS?.[accessoryId];
        const accessory = key ? dataMap.ACCESSORIES[key] : null;
        return {
            label: formatAccessoryName(key, accessory),
            price: getAccessorySellPrice(accessoryId) * count,
            iconSrc: getAssetSrc(accessory)
        };
    }

    return null;
}
