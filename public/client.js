import { parsePacket } from './parser.js';
import { LibCanvas } from './libcanvas.js';
import { ENTITIES, MAP_SIZE } from './game.js';
import { dataMap, TPS, ACCESSORY_KEYS, isAccessoryItemType, accessoryIdFromItemType, DEFAULT_VIEW_RANGE_MULT } from './shared/datamap.js';
import {
    initializeUI, updateShieldUI, updateHUDVisibility,
    THROW_BTN_CONFIG, PICKUP_BTN_CONFIG, DROP_BTN_CONFIG, ATTACK_BTN_CONFIG,
    isMobile, HOTBAR_CONFIG, INVENTORY_CONFIG, ACCESSORY_SLOT_CONFIG, uiState
} from './ui.js';
import { encodeUsername } from './helpers.js';

// --- Configuration & Settings ---
export const Settings = {
    renderGrid: false,
    drawHitboxes: false,
    showPlayerIds: false,
    showChestIds: false,
    showMobsOnMinimap: false,
    showPlayersOnMinimap: false,
    showChestsOnMinimap: false,
    showMinimap: true,
};
window.Settings = Settings;

export const Vars = {
    lastDiedTime: 0,
    myId: 0,
    ping: 0,
    lastSentPing: 0,
    isAdmin: false,
    viewRangeMult: DEFAULT_VIEW_RANGE_MULT,
    myInventory: new Array(35).fill(0),
    myInventoryCounts: new Array(35).fill(0),
    selectedSlot: 0,
    dragSlot: -1,
    dragAccessory: false,
    dragAccessoryId: 0,
    lastSelectionTime: 0,
    mouseX: 0,
    mouseY: 0,
    myStats: { dmgHit: 0, dmgThrow: 0, speed: 0, hp: 100, maxHp: 100, goldCoins: 0 },
    inCombat: false,
    onlineCount: 0,
    vikingComboCount: 0,
};

export const camera = {
    x: 0, y: 0,
    target: { x: 0, y: 0 }
};

export const LC = new LibCanvas();
LC.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- State Variables ---
let cantJoin = false;
let waterOffset = 0;

const groundTextures = [];


// const step = 300;
// for (let x = 0; x < MAP_SIZE[0]; x += step) {
//     for (let y = 0; y < MAP_SIZE[1]; y += step) {
//         const tx = x + Math.floor(Math.random() * step);
//         const ty = y + Math.floor(Math.random() * step);

//         if (tx > MAP_SIZE[0] * 0.47 - 100 && tx < MAP_SIZE[0] * 0.53 + 100) continue;

//         groundTextures.push({
//             x: tx,
//             y: ty,
//             size: Math.floor(40 + Math.random() * 20),
//             texture: 'ground-texture' + (Math.floor(Math.random() * 3) + 1)
//         });
//     }
// }

window.groundTextures = groundTextures;

// --- Loading Screen Logic ---
const loadingState = {
    active: true,
    progress: 0,
    header: 'Initializing...',
    subText: '',
    totalAssets: 0,
    loadedAssets: 0,
    connected: false,
    alpha: 1,
    fadeOut: false
};

async function loadAssets() {
    try {
        const res = await fetch('./groundtextures.txt');
        if (res.ok) {
            const data = await res.json();
            groundTextures.push(...data);
        }
    } catch (e) {
        console.error('Failed to load ground textures:', e);
    }

    const assetCategories = [
        { data: dataMap.AUDIO, type: 'audio' },
        { data: dataMap.UI, type: 'image' },
        { data: dataMap.ACCESSORIES, type: 'image' },
        { data: dataMap.OBJECTS, type: 'image', rename: true },
        { data: dataMap.otherImgs, type: 'image' },
        { data: dataMap.PLAYERS.imgs, type: 'image' },
        { data: dataMap.SWORDS.imgs, type: 'image' },
        { data: dataMap.MOBS, type: 'image', rename: true },
        { data: dataMap.STRUCTURES, type: 'image', rename: true },
        { data: dataMap.PROJECTILES, type: 'image', rename: true }
    ];

    const assets = assetCategories.flatMap(cat =>
        Object.values(cat.data).map(item => ({
            type: cat.type,
            name: cat.rename ? item.imgName : item.name,
            src: cat.rename ? item.imgSrc : item.src
        }))
    );

    loadingState.totalAssets = assets.length;
    loadingState.header = 'Loading Assets';

    for (const asset of assets) {
        loadingState.subText = `Loading ${asset.src.split('/').pop()}...`;
        if (asset.type === 'audio') {
            await LC.loadAudio({ name: asset.name, src: asset.src });
        } else {
            await LC.loadImage({ name: asset.name, src: asset.src });
        }
        loadingState.loadedAssets++;
        loadingState.progress = (loadingState.loadedAssets / loadingState.totalAssets) * 0.99;
        await new Promise(r => r());
    }

    loadingState.progress = 0.99;
}

function drawLoadingScreen() {
    if (!loadingState.active) return;

    LC.ctx.save();
    LC.ctx.setTransform(1, 0, 0, 1, 0, 0);
    LC.ctx.fillStyle = '#0f172a';
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    const barWidth = 400;
    const barHeight = 8;
    const x = LC.width / 2 - barWidth / 2;
    const y = LC.height / 2 + 50;

    drawFPS();

    LC.drawRect({ pos: [x, y], size: [barWidth, barHeight], color: 'rgba(255, 255, 255, 0.05)', cornerRadius: 3 });
    LC.drawRect({ pos: [x, y], size: [barWidth * loadingState.progress, barHeight], color: '#b79a6b', cornerRadius: 3 });

    LC.drawText({ text: loadingState.header.toUpperCase(), pos: [LC.width / 2, y - 45], font: '900 32px Inter, sans-serif', color: 'white', textAlign: 'center' });
    if (loadingState.subText) {
        LC.drawText({ text: loadingState.subText, pos: [LC.width / 2, y - 15], font: '400 13px Inter, sans-serif', color: 'rgba(255, 255, 255, 0.35)', textAlign: 'center' });
    }
    LC.drawText({ text: `${Math.floor(loadingState.progress * 100)}%`, pos: [LC.width / 2, y + 25], font: '600 12px Inter, sans-serif', color: 'rgba(183, 154, 107, 0.6)', textAlign: 'center' });

    if (loadingState.fadeOut) {
        loadingState.alpha -= 0.05;
        if (loadingState.alpha <= 0) loadingState.active = false;
        LC.ctx.globalAlpha = loadingState.alpha;
    }
    LC.ctx.restore();
}

// --- WebSocket Setup ---
export const ws = new WebSocket(`wss://${location.host}`);
ws.binaryType = 'arraybuffer';
window.ws = ws;

ws.onopen = () => {
    if (loadingState.loadedAssets === loadingState.totalAssets) {
        loadingState.header = 'Connected!';
        loadingState.progress = 1;
    }
};

ws.onmessage = (event) => {
    if (!Vars.myId) {
        if (typeof event.data === 'string') {
            Vars.myId = parseInt(event.data);
            loadingState.connected = true;
            return;
        }
        parsePacket(event.data);
        cantJoin = true;
        return;
    }
    parsePacket(event.data);
};

// --- Main Render Loop ---
function updateCamera(localPlayer) {
    if (!localPlayer) return;
    camera.target.x = localPlayer.x;
    camera.target.y = localPlayer.y;
    camera.x = camera.target.x - (LC.width / 2);
    camera.y = camera.target.y - (LC.height / 2);
}

function updateZoom(localPlayer) {
    let targetZoom = 0.7;
    if (localPlayer?.isAlive) {
        targetZoom = 1.0;
        const inWater = localPlayer.x > MAP_SIZE[0] * 0.47 && localPlayer.x < MAP_SIZE[0] * 0.53;
        if (inWater || localPlayer.hasShield) targetZoom = 1.3;
    }

    const accessoryKey = ACCESSORY_KEYS[localPlayer?.accessoryId || 0];
    const accessoryMult = dataMap.ACCESSORIES[accessoryKey]?.viewRangeMult || 1;
    const baseViewRange = Vars.viewRangeMult || DEFAULT_VIEW_RANGE_MULT;
    const viewRangeMult = Math.max(0.1, baseViewRange * accessoryMult);
    targetZoom /= viewRangeMult;

    const delta = targetZoom - LC.zoom;
    if (Math.abs(delta) < 0.001) {
        LC.zoom = targetZoom;
    } else {
        LC.zoom += delta * 0.18;
    }
}

function drawBackground() {
    // Ground and Biomes
    LC.drawRect({ pos: [-MAP_SIZE[0] / 2 - camera.x, -MAP_SIZE[1] / 2 - camera.y], size: [MAP_SIZE[0] * 0.97, MAP_SIZE[1] * 2 + 2500], color: 'rgba(20, 80, 20, 1)' });
    LC.drawRect({ pos: [(MAP_SIZE[0] * 0.47) - camera.x, -(MAP_SIZE[1] * 0.5) - camera.y], size: [MAP_SIZE[0] * 0.06, MAP_SIZE[1] * 2 + 2500], color: 'rgba(20, 80, 150, 1)' });
    LC.drawRect({ pos: [MAP_SIZE[0] * 0.53 - camera.x, -MAP_SIZE[1] / 2 - camera.y], size: [MAP_SIZE[0] * 0.97, MAP_SIZE[1] * 2 + 2500], color: 'rgba(120, 120, 120, 1)' });

    // Inner Map
    LC.drawRect({ pos: [0 - camera.x, 0 - camera.y], size: [MAP_SIZE[0] * 0.47, MAP_SIZE[1]], color: 'rgba(34, 139, 34, 0.61)' });
    LC.drawRect({ pos: [MAP_SIZE[0] * 0.53 - camera.x, 0 - camera.y], size: [MAP_SIZE[0] * 0.47, MAP_SIZE[1]], color: 'rgba(220, 220, 220, 1)' });

    groundTextures.forEach(gt => {
        if (gt.x - camera.x > -500 && gt.x - camera.x < LC.width + 500 && gt.y - camera.y > -500 && gt.y - camera.y < LC.height + 500) {
            LC.drawImage({
                name: gt.texture,
                pos: [gt.x - camera.x, gt.y - camera.y],
                size: [gt.size, gt.size],
                rotation: gt.rotation,
                transparency: 0.6
            });
        }
    });

    // Animated Water
    const waterWidth = MAP_SIZE[0] * 0.06;
    const segmentH = 400;
    waterOffset = (waterOffset + 2) % segmentH;
    for (let i = -1; i <= Math.ceil((MAP_SIZE[1] + 2000) / segmentH); i++) {
        LC.drawImage({
            name: 'water',
            pos: [MAP_SIZE[0] * 0.47 - camera.x, -1000 + (i * segmentH) + waterOffset - camera.y],
            size: [waterWidth, segmentH],
            transparency: 0.5
        });
    }
}

function render() {
    if (loadingState.active) {
        LC.clearCanvas();
        drawLoadingScreen();
        if (loadingState.connected && loadingState.loadedAssets === loadingState.totalAssets && !loadingState.fadeOut) {
            setTimeout(() => loadingState.fadeOut = true, 500);
        }
        requestAnimationFrame(render);
        return;
    }

    const localPlayer = ENTITIES.PLAYERS[Vars.myId];
    document.getElementById('game-hud').style.display = 'block';

    // Updates
    Object.values(ENTITIES).forEach(group => {
        if (typeof group === 'object') Object.values(group).forEach(e => e.update?.());
    });
    updateZoom(localPlayer);
    updateCamera(localPlayer);

    // Drawing
    LC.clearCanvas();
    LC.ctx.save();
    LC.ctx.translate(LC.width / 2, LC.height / 2);
    LC.ctx.scale(LC.zoom, LC.zoom);
    LC.ctx.translate(-LC.width / 2, -LC.height / 2);

    drawBackground();
    if (Settings.renderGrid) drawGrid(localPlayer);

    // Entities (Z-ordering implied by draw order)
    [ENTITIES.STRUCTURES, ENTITIES.OBJECTS, ENTITIES.MOBS, ENTITIES.PROJECTILES, ENTITIES.PLAYERS].forEach(group => {
        Object.values(group).forEach(e => e.draw());
    });

    // Draw bushes with transparency layering (after players so they appear on top)
    const bushes = Object.values(ENTITIES.STRUCTURES).filter(s => s.type === 3);
    bushes.forEach(bush => {
        const screenPosX = bush.x - camera.x;
        const screenPosY = bush.y - camera.y;

        // Check if local player is colliding with this bush
        const dx = localPlayer.x - bush.x;
        const dy = localPlayer.y - bush.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isPlayerInBush = dist < (localPlayer.radius + bush.radius);

        LC.drawImage({
            name: dataMap.STRUCTURES[3].imgName,
            pos: [screenPosX - bush.radius, screenPosY - bush.radius],
            size: [bush.radius * 2, bush.radius * 2],
            transparency: isPlayerInBush ? 0.5 : 1
        });
    });

    LC.ctx.restore();

    // UI & Overlays
    updateHUD(localPlayer);
    drawFPS();

    setTimeout(render, 1000 / TPS.clientCapped);
}

function drawFPS() {
    LC.drawText({
        text: `${TPS.clientReal} FPS`,
        pos: [15, LC.height - 15],
        font: '600 14px Inter, sans-serif',
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'left'
    });
}

function drawGrid(lp) {
    if (!lp) return;
    const size = 100, range = 2500;
    const startX = Math.floor(lp.x / size) * size - range;
    const endX = startX + range * 2;
    const startY = Math.floor(lp.y / size) * size - range;
    const endY = startY + range * 2;

    LC.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    for (let x = startX; x <= endX; x += size) {
        LC.ctx.beginPath();
        LC.ctx.moveTo(x - camera.x, startY - camera.y);
        LC.ctx.lineTo(x - camera.x, endY - camera.y);
        LC.ctx.stroke();
    }
    for (let y = startY; y <= endY; y += size) {
        LC.ctx.beginPath();
        LC.ctx.moveTo(startX - camera.x, y - camera.y);
        LC.ctx.lineTo(endX - camera.x, y - camera.y);
        LC.ctx.stroke();
    }
}

function updateHUD(lp) {
    const isAlive = lp?.isAlive;
    updateHUDVisibility(isAlive);
    updateShieldUI(lp?.hasShield);

    if (!isAlive) {
        const homeScreen = document.getElementById('home-screen');
        const respawnScreen = document.getElementById('respawn-screen');
        const shouldShowRespawn = !uiState.forceHomeScreen && (Vars.lastDiedTime > 0);
        if (shouldShowRespawn) {
            if (homeScreen) homeScreen.style.display = 'none';
            if (respawnScreen) respawnScreen.style.display = 'flex';
            updateHomeOnlineCount(false);
            updateRespawnButton();
        } else {
            if (homeScreen) homeScreen.style.display = 'flex';
            if (respawnScreen) respawnScreen.style.display = 'none';
            updateHomeOnlineCount(true);
            updateJoinButton();
        }
    } else {
        const homeScreen = document.getElementById('home-screen');
        const respawnScreen = document.getElementById('respawn-screen');
        if (homeScreen) homeScreen.style.display = 'none';
        if (respawnScreen) respawnScreen.style.display = 'none';
        uiState.forceHomeScreen = false;
        updateHomeOnlineCount(false);
        drawInfoBox(lp);
        drawLeaderboard();
        if (Settings.showMinimap) drawMinimap();
        drawHotbar();
        drawInventory();
        if (isMobile || Settings.forceMobileUI) drawMobileButtons(lp);
        drawDraggedItem();
    }
}

function drawInfoBox(lp) {
    const text = [`x: ${lp.x.toFixed(0)}`, `y: ${lp.y.toFixed(0)}`, `score: ${Math.floor(lp.score || 0)}`, `ping: ${Vars.ping}`];
    LC.drawRect({ pos: [LC.width - 420, 5], size: [155, 110], color: 'rgba(0, 0, 0, 0.4)', cornerRadius: 5 });
    text.forEach((t, i) => LC.drawText({ text: t, pos: [LC.width - 410, 25 + i * 25], font: '16px Inter', color: 'white' }));
}

function updateHomeOnlineCount(shouldShow) {
    const countEl = document.getElementById('home-online-count');
    if (!countEl) return;
    if (!shouldShow) {
        countEl.style.display = 'none';
        return;
    }
    const count = Math.max(0, Vars.onlineCount || 0);
    countEl.textContent = `${count} player${count === 1 ? '' : 's'} online`;
    countEl.style.display = 'block';
}

function drawLeaderboard() {
    const lb = ENTITIES.leaderboard || [];
    const h = 50 + lb.length * 25;
    LC.drawRect({ pos: [LC.width - 260, 10], size: [250, h], color: 'rgba(0,0,0,0.6)', cornerRadius: 8 });
    LC.drawText({ text: 'LEADERBOARD', pos: [LC.width - 135, 35], font: 'bold 16px Inter', color: 'white', textAlign: 'center' });

    lb.forEach((p, i) => {
        const color = p.id === Vars.myId ? 'white' : 'lightgray';
        LC.drawText({ text: `${i + 1}. ${p.username.slice(0, 12)}`, pos: [LC.width - 250, 65 + i * 25], font: '14px Inter', color });
        LC.drawText({ text: formatScore(p.score), pos: [LC.width - 20, 65 + i * 25], font: '14px Inter', color, textAlign: 'right' });
    });
}

function formatScore(s) {
    if (s >= 1e9) return (s / 1e9).toFixed(1) + 'B';
    if (s >= 1e6) return (s / 1e6).toFixed(1) + 'M';
    if (s >= 1e3) return (s / 1e3).toFixed(1) + 'k';
    return Math.floor(s).toString();
}

function drawMinimap() {
    const size = 180, x = 20, y = 20;
    LC.drawRect({ pos: [x - 5, y - 5], size: [size + 10, size + 10], color: 'rgba(0,0,0,0.4)', cornerRadius: 5 });

    // Biomes
    LC.drawRect({ pos: [x, y], size: [size * 0.47, size], color: '#21ae2fb3' }); // Lighter Green
    LC.drawRect({ pos: [x + size * 0.47, y], size: [size * 0.06, size], color: '#3b82f6' }); // Blue
    LC.drawRect({ pos: [x + size * 0.53, y], size: [size * 0.47, size], color: '#a3a3a3' }); // Lighter Gray

    const drawDot = (e, color) => {
        const dx = (e.x / MAP_SIZE[0]) * size;
        const dy = (e.y / MAP_SIZE[1]) * size;
        LC.drawCircle({ pos: [x + dx, y + dy], radius: 2, color });
    };

    if (Settings.showMobsOnMinimap) Object.values(ENTITIES.MOBS).forEach(m => drawDot(m, 'orange'));
    if (Settings.showChestsOnMinimap) Object.values(ENTITIES.OBJECTS).filter(o => dataMap.CHEST_IDS.includes(o.type)).forEach(o => drawDot(o, '#b45309'));
    if (Settings.showPlayersOnMinimap) Object.values(ENTITIES.PLAYERS).filter(p => p.id !== Vars.myId && p.isAlive).forEach(p => drawDot(p, 'red'));
    const lp = ENTITIES.PLAYERS[Vars.myId];
    if (lp) drawDot(lp, 'white');
}

function drawDraggedItem() {
    if (Vars.dragAccessory) {
        const accessoryKey = ACCESSORY_KEYS[Vars.dragAccessoryId];
        const accessory = accessoryKey ? dataMap.ACCESSORIES[accessoryKey] : null;
        if (!accessory) return;

        const hb = HOTBAR_CONFIG;
        const maxIconSize = hb.slotSize * 0.9;
        const aspect = (accessory.size?.[0] || 1) / (accessory.size?.[1] || 1);
        const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

        const x = Vars.mouseX * (LC.width / window.innerWidth);
        const y = Vars.mouseY * (LC.height / window.innerHeight);

        LC.drawImage({
            name: accessory.name,
            pos: [x - iconW / 2, y - iconH / 2],
            size: [iconW, iconH],
            rotation: 0,
            transparency: 0.75
        });
        return;
    }

    if (Vars.dragSlot === -1 || uiState.itemsInSellQueue.includes(Vars.dragSlot)) return;

    let rank = Vars.myInventory[Vars.dragSlot];
    if (rank > 0) {
        const isThrown = rank > 127;
        const lookupType = isThrown ? rank & 0x7F : rank;
        const count = Vars.myInventoryCounts[Vars.dragSlot];

        const { imgName, rotation, aspect } = getItemIconInfo(lookupType);

        const hb = HOTBAR_CONFIG;
        const maxIconSize = hb.slotSize * 1.1;
        const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

        const x = Vars.mouseX * (LC.width / window.innerWidth);
        const y = Vars.mouseY * (LC.height / window.innerHeight);

        LC.drawImage({
            name: imgName,
            pos: [x - iconW / 2, y - iconH / 2],
            size: [iconW, iconH],
            rotation: rotation,
            transparency: 0.7
        });

        if (count > 1) {
            LC.drawText({
                text: count.toLocaleString(),
                pos: [x + iconW / 2 - 5, y + iconH / 2 - 5],
                font: 'bold 16px Inter',
                color: 'white',
                textAlign: 'right',
                stroke: 'black',
                strokeWidth: 2
            });
        }
    }
}

function drawHotbar() {
    const hb = HOTBAR_CONFIG, totalW = (hb.slotSize * 6) + (hb.gap * 5) + (hb.padding * 2);
    const x = (LC.width / 2) - (totalW / 2), y = LC.height - hb.marginBottom - hb.slotSize - hb.padding * 2;

    LC.drawRect({ pos: [x, y], size: [totalW, hb.slotSize + hb.padding * 2], color: 'rgba(0,0,0,0.5)', cornerRadius: 12 });

    for (let i = 0; i < 5; i++) {
        const sx = x + hb.padding + (i * (hb.slotSize + hb.gap)), sy = y + hb.padding;
        const selected = Vars.selectedSlot === i;
        LC.drawRect({ pos: [sx, sy], size: [hb.slotSize, hb.slotSize], color: selected ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)', cornerRadius: 8, stroke: selected ? 'white' : 'rgba(255,255,255,0.1)', strokeWidth: selected ? 2 : 1 });

        let rank = Vars.myInventory[i];
        if (rank > 0 && i !== Vars.dragSlot && !uiState.itemsInSellQueue.includes(i)) {
            const isThrown = rank > 127;
            const lookupType = isThrown ? rank & 0x7F : rank;
            const count = Vars.myInventoryCounts[i];

            const { imgName, rotation, aspect } = getItemIconInfo(lookupType);

            const maxIconSize = hb.slotSize - 20;
            const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

            LC.drawImage({
                name: imgName,
                pos: [sx + hb.slotSize / 2 - iconW / 2, sy + hb.slotSize / 2 - iconH / 2],
                size: [iconW, iconH],
                rotation: rotation,
                transparency: isThrown ? 0.4 : 1
            });

            if (count > 1) {
                LC.drawText({
                    text: count.toLocaleString(),
                    pos: [sx + hb.slotSize - 5, sy + hb.slotSize - 5],
                    font: 'bold 12px Inter',
                    color: 'white',
                    textAlign: 'right',
                    stroke: 'black',
                    strokeWidth: 2
                });
            }
        }
    }

    // Draw the "..." button slot
    const sx_more = x + hb.padding + (5 * (hb.slotSize + hb.gap)), sy_more = y + hb.padding;
    LC.drawRect({ pos: [sx_more, sy_more], size: [hb.slotSize, hb.slotSize], color: 'rgba(0,0,0,0.2)', cornerRadius: 8, stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 });
    LC.drawText({ text: '...', pos: [sx_more + hb.slotSize / 2, sy_more + hb.slotSize / 2 + 5], font: 'bold 24px Inter', color: 'white', textAlign: 'center' });

    drawAccessorySlot(x, y, totalW);
}

function drawInventory() {
    if (!uiState.isInventoryOpen) return;

    const inv = INVENTORY_CONFIG;
    const totalW = (inv.slotSize * inv.cols) + (inv.gap * (inv.cols - 1)) + (inv.padding * 2);
    const totalH = (inv.slotSize * inv.rows) + (inv.gap * (inv.rows - 1)) + (inv.padding * 2);

    const x = (LC.width / 2) - (totalW / 2);
    const y = (LC.height / 2) - (totalH / 2);

    LC.drawRect({ pos: [x, y], size: [totalW, totalH], color: inv.background, cornerRadius: inv.cornerRadius });

    for (let i = 0; i < 30; i++) {
        const col = i % inv.cols;
        const row = Math.floor(i / inv.cols);
        const slotIndex = i + 5;

        const sx = x + inv.padding + (col * (inv.slotSize + inv.gap));
        const sy = y + inv.padding + (row * (inv.slotSize + inv.gap));

        LC.drawRect({ pos: [sx, sy], size: [inv.slotSize, inv.slotSize], color: 'rgba(0,0,0,0.2)', cornerRadius: 8, stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 });

        let rank = Vars.myInventory[slotIndex];
        if (rank > 0 && slotIndex !== Vars.dragSlot && !uiState.itemsInSellQueue.includes(slotIndex)) {
            const isThrown = rank > 127;
            const lookupType = isThrown ? rank & 0x7F : rank;
            const count = Vars.myInventoryCounts[slotIndex];

            const { imgName, rotation, aspect } = getItemIconInfo(lookupType);

            const maxIconSize = inv.slotSize - 20;
            const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

            LC.drawImage({
                name: imgName,
                pos: [sx + inv.slotSize / 2 - iconW / 2, sy + inv.slotSize / 2 - iconH / 2],
                size: [iconW, iconH],
                rotation: rotation,
                transparency: isThrown ? 0.4 : 1
            });

            if (count > 1) {
                LC.drawText({
                    text: count.toLocaleString(),
                    pos: [sx + inv.slotSize - 5, sy + inv.slotSize - 5],
                    font: 'bold 12px Inter',
                    color: 'white',
                    textAlign: 'right',
                    stroke: 'black',
                    strokeWidth: 2
                });
            }
        }
    }
}

function fitIconSize(maxSize, aspect) {
    if (!aspect || aspect <= 0) return [maxSize, maxSize];
    if (aspect >= 1) {
        return [maxSize, maxSize / aspect];
    }
    return [maxSize * aspect, maxSize];
}

function getItemIconInfo(lookupType) {
    if (lookupType === 9) {
        return { imgName: 'gold-coin', rotation: 0, aspect: 1 };
    }
    if (isAccessoryItemType(lookupType)) {
        const accessoryId = accessoryIdFromItemType(lookupType);
        const accessoryKey = ACCESSORY_KEYS[accessoryId];
        const accessory = accessoryKey ? dataMap.ACCESSORIES[accessoryKey] : null;
        if (accessory) {
            const aspect = (accessory.size?.[0] || 1) / (accessory.size?.[1] || 1);
            return { imgName: accessory.name, rotation: 0, aspect };
        }
    }
    const sword = dataMap.SWORDS.imgs[lookupType] || dataMap.SWORDS.imgs[1];
    const aspect = (sword.swordWidth || 100) / (sword.swordHeight || 50);
    return { imgName: sword.name, rotation: -Math.PI / 4, aspect };
}

function drawAccessorySlot(hotbarX, hotbarY, hotbarWidth) {
    const hb = HOTBAR_CONFIG;
    const as = ACCESSORY_SLOT_CONFIG;
    const slotX = hotbarX - as.gap - as.size;
    const slotY = hotbarY + hb.padding + (hb.slotSize - as.size) / 2;

    LC.drawRect({
        pos: [slotX - hb.padding, hotbarY],
        size: [as.size + hb.padding * 2, hb.slotSize + hb.padding * 2],
        color: 'rgba(0,0,0,0.5)',
        cornerRadius: 12
    });

    LC.drawRect({
        pos: [slotX, slotY],
        size: [as.size, as.size],
        color: 'rgba(0,0,0,0.2)',
        cornerRadius: 7,
        stroke: 'rgba(255,255,255,0.2)',
        strokeWidth: 1
    });

    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    const accessoryId = myPlayer?.accessoryId || 0;
    const accessoryKey = ACCESSORY_KEYS[accessoryId];
    const accessory = accessoryKey ? dataMap.ACCESSORIES[accessoryKey] : null;
    if (!accessory) return;
    if (Vars.dragAccessory && Vars.dragAccessoryId === accessoryId) return;

    const maxIconSize = as.size - 10;
    const aspect = (accessory.size?.[0] || 1) / (accessory.size?.[1] || 1);
    const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

    LC.drawImage({
        name: accessory.name,
        pos: [slotX + as.size / 2 - iconW / 2, slotY + as.size / 2 - iconH / 2],
        size: [iconW, iconH],
        rotation: 0
    });
}

function drawMobileButtons(lp) {
    const drawBtn = (config, label, active) => {
        const bx = LC.width - config.xOffset;
        const by = LC.height - config.yOffset;
        const alpha = active ? 0.6 : 0.2;
        LC.drawCircle({
            pos: [bx, by],
            radius: config.radius,
            color: `rgba(0,0,0,${alpha})`,
            stroke: active ? 'white' : 'rgba(255,255,255,0.2)',
            strokeWidth: 2
        });
        LC.drawText({
            text: label,
            pos: [bx, by + 5],
            font: `bold ${config.radius * 0.4}px Inter`,
            color: active ? 'white' : 'rgba(255,255,255,0.2)',
            textAlign: 'center'
        });
    };

    drawBtn(THROW_BTN_CONFIG, 'THROW', lp.hasWeapon);
    drawBtn(ATTACK_BTN_CONFIG, 'ATTACK', lp.hasWeapon);
    drawBtn(PICKUP_BTN_CONFIG, 'PICKUP', true);
    drawBtn(DROP_BTN_CONFIG, 'DROP', true);
}

function updateJoinButton() {
    const btn = document.getElementById('joinBtn');
    if (!btn) return;
    const cooldown = performance.now() - Vars.lastDiedTime < 1700;
    btn.style.opacity = cooldown ? '0.5' : '1';
    btn.style.pointerEvents = cooldown ? 'none' : 'auto';
}

function updateRespawnButton() {
    const btn = document.getElementById('respawnBtn');
    if (!btn) return;
    const cooldown = performance.now() - Vars.lastDiedTime < 1700;
    btn.style.opacity = cooldown ? '0.5' : '1';
    btn.style.pointerEvents = cooldown ? 'none' : 'auto';
}

// --- Initialization ---
const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('homeUsrnInput');
if (usernameInput) usernameInput.value = localStorage.username || '';

const respawnBtn = document.getElementById('respawnBtn');
const respawnHomeBtn = document.getElementById('respawnHomeBtn');

const tryJoin = () => {
    if (performance.now() - Vars.lastDiedTime > 1700) {
        const username = usernameInput?.value || localStorage.username || '';
        ws.send(encodeUsername(username));
        LC.zoomIn();
    }
};

if (joinBtn) {
    joinBtn.onclick = () => {
        localStorage.username = usernameInput.value;
        uiState.forceHomeScreen = false;
        tryJoin();
    };
}

if (respawnBtn) {
    respawnBtn.onclick = () => {
        if (usernameInput) {
            localStorage.username = usernameInput.value || localStorage.username || '';
        }
        uiState.forceHomeScreen = false;
        tryJoin();
    };
}

if (respawnHomeBtn) {
    respawnHomeBtn.onclick = () => {
        const homeScreen = document.getElementById('home-screen');
        const respawnScreen = document.getElementById('respawn-screen');
        if (homeScreen) homeScreen.style.display = 'flex';
        if (respawnScreen) respawnScreen.style.display = 'none';
        uiState.forceHomeScreen = true;
    };
}
(async () => {
    initializeUI();
    requestAnimationFrame(render);
    await loadAssets();

    // FPS Tracker
    let frames = 0;
    setInterval(() => { TPS.clientReal = frames; frames = 0; }, 1000);
    const countFps = () => { frames++; requestAnimationFrame(countFps); };
    requestAnimationFrame(countFps);
})();
