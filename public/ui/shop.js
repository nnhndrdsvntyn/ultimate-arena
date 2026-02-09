import { Vars } from '../client.js';
import { sendBuyPacket, sendSellAllPacket } from '../helpers.js';
import { dataMap, isSellableItem, ACCESSORY_KEYS, ACCESSORY_DESCRIPTIONS, accessoryItemTypeFromId } from '../shared/datamap.js';
import { createEl, makeDraggable } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { resetInputs } from './input.js';

export function createShopButton(parent) {
    const btn = createEl('button', {
        backgroundImage: 'url("./images/ui/shopping-cart.png")',
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    }, parent, {
        id: 'shopBtn'
    });

    btn.onclick = () => {
        toggleShopModal(true);
    };
}

export function createShopModal(parent) {
    uiRefs.shopOverlay = createEl('div', {}, parent, { className: 'modal-overlay' });
    uiRefs.shopModal = createEl('div', {}, uiRefs.shopOverlay, { className: 'settings-modal shop-modal' }); // Reusing modal style

    // Header (Draggable Handle)
    const header = createEl('div', {}, uiRefs.shopModal, { className: 'settings-header' });
    header.style.cursor = 'move';
    createEl('h2', {}, header, { textContent: 'SHOP' });
    const closeBtn = createEl('button', {}, header, { className: 'close-settings', innerHTML: '&times;' });
    closeBtn.onclick = () => toggleShopModal(false);

    makeDraggable(uiRefs.shopModal, header);

    // Body
    uiRefs.shopBody = createEl('div', {}, uiRefs.shopModal, { className: 'settings-body' });
    updateShopBody();
}

export function updateShopBody() {
    if (!uiRefs.shopBody) return;
    uiRefs.shopBody.innerHTML = '';

    // Gold Coin Counter at the top
    const counter = createEl('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '10px 20px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '20px',
        width: 'fit-content',
        margin: '0 auto 20px auto'
    }, uiRefs.shopBody);
    counter.classList.add('no-select');

    createEl('img', {}, counter, {
        src: './images/objects/gold-coin.png',
        style: 'width: 24px; height: 24px; object-fit: contain'
    });

    createEl('span', {
        fontSize: '1.2rem',
        fontWeight: '800',
        color: 'white'
    }, counter, {
        textContent: (Vars.myStats.goldCoins || 0).toLocaleString()
    });

    // Tabs for Buy / Sell
    const tabsContainer = createEl('div', {}, uiRefs.shopBody, { className: 'settings-tabs' });
    ['Buy', 'Sell'].forEach((tab) => {
        const tabEl = createEl('div', {}, tabsContainer, {
            className: `settings-tab ${tab === uiState.activeShopTab ? 'active' : ''}`,
            textContent: tab
        });
        tabEl.onclick = () => {
            uiState.activeShopTab = tab;
            updateShopBody();
        };
    });

    if (uiState.activeShopTab === 'Buy') {
        renderShopTab();
    } else {
        renderSellTab();
    }
}

export function toggleShopModal(show) {
    uiState.isShopOpen = show;
    if (uiRefs.shopOverlay) uiRefs.shopOverlay.style.display = show ? 'flex' : 'none';
    uiState.itemsInSellQueue = [];
    if (show) {
        resetInputs();
        updateShopBody();
    }
}

function renderSellTab() {
    const container = createEl('div', {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '15px',
        padding: '10px'
    }, uiRefs.shopBody);

    createEl('div', {
        color: 'rgba(255,255,255,0.6)',
        fontSize: '0.85rem',
        textAlign: 'center',
        marginBottom: '5px',
        userSelect: 'none'
    }, container, { textContent: 'Drag items from your hotbar here to queue them for sale' });

    const sellSlot = createEl('div', {
        width: '100%',
        minHeight: '100px',
        background: 'rgba(0,0,0,0.2)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '15px',
        position: 'relative'
    }, container, { id: 'shop-sell-slot' });

    let totalPrice = 0;
    const validQueue = uiState.itemsInSellQueue.filter(idx => {
        const type = Vars.myInventory[idx] & 0x7F;
        return isSellableItem(type);
    });

    if (validQueue.length > 0) {
        validQueue.forEach(slotIdx => {
            const rank = Vars.myInventory[slotIdx] & 0x7F;
            const count = Vars.myInventoryCounts[slotIdx];
            const sword = dataMap.SWORDS.imgs[rank] || dataMap.SWORDS.imgs[1];
            const price = Math.floor((dataMap.SHOP_ITEMS.find(i => i.id === rank)?.price || 0) * 0.5) * count;
            totalPrice += price;

            const itemPreview = createEl('div', {
                width: '60px',
                height: '60px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                border: '1px solid rgba(255,255,255,0.1)'
            }, sellSlot);

            createEl('img', {
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                transform: 'rotate(-45deg)'
            }, itemPreview, { src: `./images/swords/${sword.name.split('-')[1]}.png` });

            if (count > 1) {
                createEl('div', {
                    position: 'absolute',
                    bottom: '2px',
                    right: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: 'white',
                    textShadow: '0 0 2px black'
                }, itemPreview, { textContent: count.toLocaleString() });
            }

            const removeBtn = createEl('button', {
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                width: '20px',
                height: '20px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }, itemPreview, { innerHTML: '&times;' });

            removeBtn.onclick = (e) => {
                e.stopPropagation();
                uiState.itemsInSellQueue = uiState.itemsInSellQueue.filter(i => i !== slotIdx);
                updateShopBody();
            };
        });

        const footer = createEl('div', {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            marginTop: '10px'
        }, container);

        const priceContainer = createEl('div', {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }, footer);

        createEl('img', { width: '22px', height: '22px' }, priceContainer, { src: './images/objects/gold-coin.png' });
        createEl('span', { color: '#fbbf24', fontWeight: 'bold', fontSize: '1.4rem' }, priceContainer, { textContent: `+${totalPrice.toLocaleString()}` });

        const sellBtn = createEl('button', {
            width: '100%',
            padding: '12px',
            background: 'rgba(46, 204, 113, 1)',
            border: 'none',
            borderRadius: '10px',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '1rem'
        }, footer, { textContent: `Sell ${validQueue.length} Items` });

        sellBtn.onclick = () => {
            // Optimistically update local inventory to prevent flashing
            validQueue.forEach(slotIdx => {
                Vars.myInventory[slotIdx] = 0;
            });

            sendSellAllPacket(validQueue);
            uiState.itemsInSellQueue = [];
            updateShopBody();
        };
    } else {
        createEl('div', { color: 'rgba(255,255,255,0.1)', fontSize: '1.2rem', textAlign: 'center', userSelect: 'none' }, sellSlot, { textContent: 'DROP ITEMS HERE' });
    }
}

function renderShopTab() {
    const weaponTitle = createEl('div', {}, uiRefs.shopBody, { className: 'shop-section-title', textContent: 'Weapons' });
    weaponTitle.classList.add('no-select');

    const grid = createEl('div', {}, uiRefs.shopBody, { className: 'shop-grid' });

    dataMap.SHOP_ITEMS.forEach(itemConfig => {
        const item = createEl('div', {}, grid, { className: 'shop-item' });

        // Icon
        createEl('img', {}, item, {
            className: 'shop-item-icon',
            src: `./images/swords/${itemConfig.img}.png`
        });

        createEl('div', {}, item, { className: 'shop-item-name', textContent: itemConfig.name });

        const priceContainer = createEl('div', {}, item, { className: 'shop-item-price' });
        createEl('img', {}, priceContainer, {
            className: 'shop-price-icon',
            src: './images/objects/gold-coin.png'
        });
        createEl('span', {}, priceContainer, { textContent: itemConfig.price.toLocaleString() });

        const canAfford = (Vars.myStats.goldCoins || 0) >= itemConfig.price;
        const buyBtn = createEl('button', {}, item, {
            className: `buy-button ${!canAfford ? 'disabled' : ''}`,
            textContent: canAfford ? 'Buy' : 'Too Poor',
            disabled: !canAfford
        });

        buyBtn.onclick = () => {
            if (canAfford) sendBuyPacket(itemConfig.id);
        };
    });

    const accessoryTitle = createEl('div', {}, uiRefs.shopBody, { className: 'shop-section-title', textContent: 'Accessories' });
    accessoryTitle.classList.add('no-select');

    const accessoryGrid = createEl('div', {}, uiRefs.shopBody, { className: 'shop-grid' });
    const accessoryPrice = dataMap.ACCESSORY_PRICE || 30;

    ACCESSORY_KEYS.filter(key => key !== 'none').forEach((key) => {
        const accessory = dataMap.ACCESSORIES[key];
        if (!accessory) return;

        const item = createEl('div', {}, accessoryGrid, { className: 'shop-item' });

        createEl('img', {}, item, {
            className: 'shop-item-icon',
            src: accessory.src
        });

        createEl('div', {}, item, { className: 'shop-item-name', textContent: formatAccessoryName(key) });

        const info = createEl('div', {}, item, { className: 'shop-item-info' });
        createEl('span', {}, info, { className: 'shop-item-info-icon', textContent: 'i' });
        createEl('div', {}, info, {
            className: 'shop-item-info-tip',
            textContent: ACCESSORY_DESCRIPTIONS[key] || 'Coming Soon'
        });

        const priceContainer = createEl('div', {}, item, { className: 'shop-item-price' });
        createEl('img', {}, priceContainer, {
            className: 'shop-price-icon',
            src: './images/objects/gold-coin.png'
        });
        createEl('span', {}, priceContainer, { textContent: accessoryPrice.toLocaleString() });

        const canAfford = (Vars.myStats.goldCoins || 0) >= accessoryPrice;
        const buyBtn = createEl('button', {}, item, {
            className: `buy-button ${!canAfford ? 'disabled' : ''}`,
            textContent: canAfford ? 'Buy' : 'Too Poor',
            disabled: !canAfford
        });

        buyBtn.onclick = () => {
            if (canAfford) sendBuyPacket(accessoryItemTypeFromId(ACCESSORY_KEYS.indexOf(key)));
        };
    });
}

function formatAccessoryName(key) {
    return key.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
