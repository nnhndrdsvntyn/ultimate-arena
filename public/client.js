import { parsePacket } from './parser.js';
import { LibCanvas } from './libcanvas.js';
import { ENTITIES, MAP_SIZE } from './game.js';
import { dataMap, TPS, ACCESSORY_KEYS, isAccessoryItemType, accessoryIdFromItemType, DEFAULT_VIEW_RANGE_MULT, isCoinObjectType, getCoinObjectType, isChestObjectType } from './shared/datamap.js';
import {
    initializeUI, updateShieldUI, updateHUDVisibility,
    THROW_BTN_CONFIG, PICKUP_BTN_CONFIG, DROP_BTN_CONFIG, ATTACK_BTN_CONFIG,
    isMobile, HOTBAR_CONFIG, INVENTORY_CONFIG, ACCESSORY_SLOT_CONFIG, uiState
} from './ui.js';
import { BACK_BUFFER_QUALITIES, BACK_BUFFER_DEFAULT, BACK_BUFFER_STORAGE_KEY } from './ui/config.js';
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

export const VIEW_RANGE_MIN = 0.5;
export const VIEW_RANGE_MAX = 1.0;
export const VIEW_RANGE_STEP = 0.01;
export const VIEW_RANGE_MOBILE_DEFAULT = 0.7;
export const VIEW_RANGE_PC_DEFAULT = 1.0;
export const VIEW_RANGE_RECOMMENDED_MOBILE = 0.7;
export const VIEW_RANGE_RECOMMENDED_DESKTOP = 1.0;
// Must match server join cooldown in server/parser.js (handleJoinPacket).
export const JOIN_ACTION_COOLDOWN_MS = 1000;

const VIEW_RANGE_STORAGE_KEY = 'ua_view_range_multiplier';
const KEY_HINT_NEVER_SHOW_STORAGE_KEY = 'ua_never_show_key_hints';

const clampViewRange = (value) => Math.min(VIEW_RANGE_MAX, Math.max(VIEW_RANGE_MIN, value));

const getStoredViewRange = () => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(VIEW_RANGE_STORAGE_KEY);
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) ? clampViewRange(parsed) : null;
    } catch (e) {
        return null;
    }
};

const getStoredBoolean = (key) => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
    try {
        return window.localStorage.getItem(key) === '1';
    } catch (e) {
        return false;
    }
};

const setStoredBoolean = (key, value) => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
        window.localStorage.setItem(key, value ? '1' : '0');
    } catch (e) {
        // Ignore storage failures
    }
};

const defaultDeviceViewRange = isMobile ? VIEW_RANGE_MOBILE_DEFAULT : VIEW_RANGE_PC_DEFAULT;
const initialViewRange = getStoredViewRange() ?? defaultDeviceViewRange;

const getStoredBackBufferQuality = () => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
    try {
        return window.localStorage.getItem(BACK_BUFFER_STORAGE_KEY);
    } catch (error) {
        return null;
    }
};

const getBackBufferOption = (value) => BACK_BUFFER_QUALITIES.find(opt => opt.value === value);
const defaultBackBufferOption = getBackBufferOption(BACK_BUFFER_DEFAULT) ?? BACK_BUFFER_QUALITIES[0];
const initialBackBufferOption = getBackBufferOption(getStoredBackBufferQuality()) ?? defaultBackBufferOption;
const initialBackBufferQuality = initialBackBufferOption?.value ?? defaultBackBufferOption?.value ?? (BACK_BUFFER_QUALITIES[0]?.value ?? BACK_BUFFER_DEFAULT);
const initialNeverShowKeyHints = getStoredBoolean(KEY_HINT_NEVER_SHOW_STORAGE_KEY);

export const Vars = {
    lastDiedTime: 0,
    myId: 0,
    ping: 0,
    lastSentPing: 0,
    isAdmin: false,
    viewRangeMult: initialViewRange,
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
    abilityCooldownMs: 0,
    abilityCooldownRemainingMs: 0,
    abilityCooldownEndsAt: 0,
    backBufferQuality: initialBackBufferQuality,
    joinActionLockedUntil: 0
};

const DAMAGE_INDICATOR_DURATION = 800;
const DAMAGE_INDICATOR_RISE = 28;
const damageIndicators = [];
const COIN_PICKUP_EFFECT_DURATION = 180;
const COIN_PICKUP_EFFECT_MAX_DISTANCE = 140;
const COIN_PICKUP_EFFECT_MAX_SPRITES = 5;
const coinPickupEffects = [];
const lightningShotEffects = [];
const energyBurstEffects = [];
const mobDeathFades = [];
const keyHintUi = {
    visible: false,
    neverShowAgain: initialNeverShowKeyHints,
    wasAliveLastFrame: false,
    containerEl: null,
    neverShowCheckboxEl: null
};

export function addDamageIndicator(worldX, worldY, amount) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    const rounded = Math.round(amount);
    if (rounded <= 0) return;

    damageIndicators.push({
        text: `-${rounded}`,
        x: worldX,
        y: worldY,
        start: performance.now(),
        duration: DAMAGE_INDICATOR_DURATION,
        font: 'bold 16px Inter',
        color: '#ff0000',
        rise: DAMAGE_INDICATOR_RISE
    });
}

export function addCriticalHitIndicator(worldX, worldY) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    damageIndicators.push({
        text: 'CRITICAL HIT!',
        x: worldX,
        y: worldY - 18,
        start: performance.now(),
        duration: 900,
        font: '900 18px Inter',
        color: '#ffd166',
        rise: DAMAGE_INDICATOR_RISE + 10
    });
}

function getClosestCoinCollectorId(x, y) {
    let bestId = null;
    let bestDistSq = Infinity;

    for (const p of Object.values(ENTITIES.PLAYERS)) {
        if (!p?.isAlive) continue;
        const dx = p.x - x;
        const dy = p.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestId = p.id;
        }
    }

    if (bestId === null) return null;
    if (bestDistSq > COIN_PICKUP_EFFECT_MAX_DISTANCE * COIN_PICKUP_EFFECT_MAX_DISTANCE) return null;
    return bestId;
}

export function spawnCoinPickupVfx(coinObj) {
    if (!coinObj || !isCoinObjectType(coinObj.type)) return;

    const startX = coinObj.newX ?? coinObj.x;
    const startY = coinObj.newY ?? coinObj.y;
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

    const targetId = getClosestCoinCollectorId(startX, startY);
    if (targetId === null) return;

    const amount = Math.max(1, coinObj.amount || 1);
    const spriteCount = Math.min(COIN_PICKUP_EFFECT_MAX_SPRITES, amount >= 5 ? 5 : amount);

    coinPickupEffects.push({
        startX,
        startY,
        targetId,
        startTime: performance.now(),
        spriteCount,
        seed: Math.random() * Math.PI * 2
    });
}

export function spawnCoinPickupVfxToPlayer(startX, startY, targetId, amount = 1) {
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;
    if (!Number.isInteger(targetId)) return;
    if (!ENTITIES.PLAYERS[targetId]?.isAlive) return;

    const spriteCount = Math.min(COIN_PICKUP_EFFECT_MAX_SPRITES, Math.max(1, amount >= 5 ? 5 : amount));
    coinPickupEffects.push({
        startX,
        startY,
        targetId,
        startTime: performance.now(),
        spriteCount,
        seed: Math.random() * Math.PI * 2
    });
}

export function spawnLightningShotFx(startX, startY, endX, endY, durationMs = 500) {
    if (!Number.isFinite(startX) || !Number.isFinite(startY) || !Number.isFinite(endX) || !Number.isFinite(endY)) return;
    const duration = Math.max(1, durationMs | 0);
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0.001) return;

    lightningShotEffects.push({
        startX,
        startY,
        endX,
        endY,
        midX: (startX + endX) / 2,
        midY: (startY + endY) / 2,
        angle: Math.atan2(dy, dx),
        length,
        startTime: performance.now(),
        duration,
        seed: Math.random() * Math.PI * 2
    });
}

export function spawnEnergyBurstFx(x, y, radius = 500, durationMs = 700, waves = 3) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const duration = Math.max(1, durationMs | 0);
    energyBurstEffects.push({
        x,
        y,
        radius: Math.max(1, radius),
        duration,
        waves: Math.max(1, Math.min(8, waves | 0)),
        startTime: performance.now(),
        seed: Math.random() * Math.PI * 2
    });
}

export function spawnMobDeathFade(mob) {
    if (!mob || mob.type !== 6) return; // Minotaur only
    mobDeathFades.push({
        x: mob.x,
        y: mob.y,
        angle: mob.angle || 0,
        type: mob.type,
        startTime: performance.now(),
        duration: 750
    });
}

export function setViewRangeMult(value, { persist = true } = {}) {
    const clamped = clampViewRange(value);
    Vars.viewRangeMult = clamped;
    if (persist && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        try {
            window.localStorage.setItem(VIEW_RANGE_STORAGE_KEY, clamped.toString());
        } catch (error) {
            // Ignore storage failures
        }
    }
    return clamped;
}

export function setBackBufferQuality(value, { persist = true } = {}) {
    const option = getBackBufferOption(value) ?? defaultBackBufferOption ?? BACK_BUFFER_QUALITIES[0];
    if (!option) return null;

    Vars.backBufferQuality = option.value;
    LC.setBackBufferResolution(option.width, option.height);

    if (persist && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        try {
            window.localStorage.setItem(BACK_BUFFER_STORAGE_KEY, option.value);
        } catch (error) {
            // Ignore storage failures
        }
    }

    return option;
}

export const camera = {
    x: 0, y: 0,
    target: { x: 0, y: 0 }
};

export const LC = new LibCanvas();
LC.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
setBackBufferQuality(initialBackBufferQuality, { persist: false });

// --- State Variables ---
let cantJoin = false;
let waterOffset = 0;
const STATIC_WORLD_CULL_MARGIN_BASE = 220;

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

    const scaleX = LC.scaleX ?? 1;
    const scaleY = LC.scaleY ?? 1;

    LC.ctx.save();
    LC.ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    if (LC.images?.['loading-background']) {
        LC.drawImage({
            name: 'loading-background',
            pos: [0, 0],
            size: [LC.width, LC.height],
            transparency: 0.1
        });
    }
    LC.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
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
let prefix = "wss://";
if (location.hostname == "localhost") {
    prefix = "ws://";
}
export const ws = new WebSocket(`${prefix}${location.host}`);
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
    const staticViewRect = getCameraViewRect(getStaticWorldCullMargin());

    const GRASS_TILE_SIZE = 250;

    // Ground and Biomes
    drawTiledImageInRect('grass', -MAP_SIZE[0] / 2, -MAP_SIZE[1] / 2, MAP_SIZE[0] * 0.97, MAP_SIZE[1] * 2 + 2500, GRASS_TILE_SIZE, staticViewRect, 0.95);
    LC.drawRect({ pos: [(MAP_SIZE[0] * 0.47) - camera.x, -(MAP_SIZE[1] * 0.5) - camera.y], size: [MAP_SIZE[0] * 0.06, MAP_SIZE[1] * 2 + 2500], color: 'rgba(20, 80, 150, 1)' });
    drawTiledImageInRect('grass-snow', MAP_SIZE[0] * 0.53, -MAP_SIZE[1] / 2, MAP_SIZE[0] * 0.97, MAP_SIZE[1] * 2 + 2500, GRASS_TILE_SIZE, staticViewRect, 0.95);

    // Inner Map
    drawTiledImageInRect('grass', 0, 0, MAP_SIZE[0] * 0.47, MAP_SIZE[1], GRASS_TILE_SIZE, staticViewRect, 0.9);
    drawTiledImageInRect('grass-snow', MAP_SIZE[0] * 0.53, 0, MAP_SIZE[0] * 0.47, MAP_SIZE[1], GRASS_TILE_SIZE, staticViewRect, 0.9);

    groundTextures.forEach(gt => {
        if (!isRectVisible(gt.x, gt.y, gt.size, gt.size, staticViewRect)) return;
        LC.drawImage({
            name: gt.texture,
            pos: [gt.x - camera.x, gt.y - camera.y],
            size: [gt.size, gt.size],
            rotation: gt.rotation,
            transparency: 0.6
        });
    });

    // Animated Water
    const waterWidth = MAP_SIZE[0] * 0.06;
    const segmentH = 400;
    waterOffset = (waterOffset + 2) % segmentH;
    for (let i = -1; i <= Math.ceil((MAP_SIZE[1] + 2000) / segmentH); i++) {
        const worldX = MAP_SIZE[0] * 0.47;
        const worldY = -1000 + (i * segmentH) + waterOffset;
        if (!isRectVisible(worldX, worldY, waterWidth, segmentH, staticViewRect)) continue;
        LC.drawImage({
            name: 'water',
            pos: [worldX - camera.x, worldY - camera.y],
            size: [waterWidth, segmentH],
            transparency: 0.5
        });
    }

    drawRiverShoreline(staticViewRect);
    drawOutsideMapOverlay(staticViewRect);
}

function drawRiverShoreline(viewRect) {
    const riverLeft = MAP_SIZE[0] * 0.47;
    const riverRight = MAP_SIZE[0] * 0.53;
    const shoreWidth = 16;
    const dirtY = -MAP_SIZE[1] / 2;
    const dirtHeight = MAP_SIZE[1] * 2 + 2500;
    if (!isRectVisible(riverLeft - shoreWidth, dirtY, (riverRight - riverLeft) + (shoreWidth * 2), dirtHeight, viewRect)) return;

    const visibleTop = Math.max(dirtY, viewRect.top);
    const visibleBottom = Math.min(dirtY + dirtHeight, viewRect.bottom);
    if (visibleBottom <= visibleTop) return;

    const leftScreenX = riverLeft - camera.x;
    const rightScreenX = riverRight - camera.x;
    const screenTop = visibleTop - camera.y;
    const visibleHeight = visibleBottom - visibleTop;

    LC.ctx.save();

    LC.ctx.fillStyle = 'rgba(118, 83, 46, 0.97)';
    LC.ctx.fillRect(leftScreenX - shoreWidth, screenTop, shoreWidth, visibleHeight);
    LC.ctx.fillRect(rightScreenX, screenTop, shoreWidth, visibleHeight);

    LC.ctx.strokeStyle = 'rgba(84, 57, 30, 1)';
    LC.ctx.lineWidth = 2;
    LC.ctx.beginPath();
    LC.ctx.moveTo(leftScreenX - 1, screenTop);
    LC.ctx.lineTo(leftScreenX - 1, screenTop + visibleHeight);
    LC.ctx.moveTo(rightScreenX + 1, screenTop);
    LC.ctx.lineTo(rightScreenX + 1, screenTop + visibleHeight);
    LC.ctx.stroke();

    // Dotted soil texture. Deterministic jitter keeps it natural without per-frame randomness.
    const dotStep = 18;
    for (let y = Math.floor(visibleTop / dotStep) * dotStep; y <= visibleBottom; y += dotStep) {
        const t = y * 0.055;
        const leftDotX = leftScreenX - shoreWidth + 3 + ((Math.sin(t) + 1) * 0.5 * (shoreWidth - 7));
        const rightDotX = rightScreenX + 3 + ((Math.cos(t * 1.11) + 1) * 0.5 * (shoreWidth - 7));
        const dotY = y - camera.y;

        LC.ctx.fillStyle = 'rgba(96, 66, 35, 0.95)';
        LC.ctx.beginPath();
        LC.ctx.arc(leftDotX, dotY, 1.7, 0, Math.PI * 2);
        LC.ctx.fill();

        LC.ctx.fillStyle = 'rgba(146, 106, 66, 0.88)';
        LC.ctx.beginPath();
        LC.ctx.arc(rightDotX, dotY + 2, 1.7, 0, Math.PI * 2);
        LC.ctx.fill();
    }

    LC.ctx.restore();
}

function drawOutsideMapOverlay(viewRect) {
    const mapLeft = 0;
    const mapTop = 0;
    const mapRight = MAP_SIZE[0];
    const mapBottom = MAP_SIZE[1];
    const viewWidth = viewRect.right - viewRect.left;
    const viewHeight = viewRect.bottom - viewRect.top;
    if (viewWidth <= 0 || viewHeight <= 0) return;

    const topH = Math.max(0, Math.min(mapTop, viewRect.bottom) - viewRect.top);
    const bottomH = Math.max(0, viewRect.bottom - Math.max(mapBottom, viewRect.top));
    const leftW = Math.max(0, Math.min(mapLeft, viewRect.right) - viewRect.left);
    const rightW = Math.max(0, viewRect.right - Math.max(mapRight, viewRect.left));

    if (topH <= 0 && bottomH <= 0 && leftW <= 0 && rightW <= 0) return;

    LC.ctx.save();
    LC.ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';

    if (topH > 0) LC.ctx.fillRect(viewRect.left - camera.x, viewRect.top - camera.y, viewWidth, topH);
    if (bottomH > 0) LC.ctx.fillRect(viewRect.left - camera.x, Math.max(mapBottom, viewRect.top) - camera.y, viewWidth, bottomH);
    if (leftW > 0) LC.ctx.fillRect(viewRect.left - camera.x, viewRect.top - camera.y, leftW, viewHeight);
    if (rightW > 0) LC.ctx.fillRect(Math.max(mapRight, viewRect.left) - camera.x, viewRect.top - camera.y, rightW, viewHeight);

    LC.ctx.restore();
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
    const staticViewRect = getCameraViewRect(getStaticWorldCullMargin());

    // Drawing
    LC.clearCanvas();
    LC.ctx.save();
    LC.ctx.translate(LC.width / 2, LC.height / 2);
    LC.ctx.scale(LC.zoom, LC.zoom);
    LC.ctx.translate(-LC.width / 2, -LC.height / 2);

    drawBackground();
    if (Settings.renderGrid) drawGrid(localPlayer);

    // Entities (Z-ordering implied by draw order)
    Object.values(ENTITIES.STRUCTURES).forEach(structure => {
        if (!isCircleVisible(structure.x, structure.y, structure.radius || 0, staticViewRect)) return;
        structure.draw();
    });
    [ENTITIES.OBJECTS, ENTITIES.MOBS, ENTITIES.PROJECTILES].forEach(group => {
        Object.values(group).forEach(e => e.draw());
    });
    drawMobDeathFades();
    drawEnergyBurstEffects();
    drawLightningShotEffects();
    drawCoinPickupEffects();
    Object.values(ENTITIES.PLAYERS).forEach(e => e.draw());
    drawDamageIndicators();

    // Draw bushes with transparency layering (after players so they appear on top)
    const bushes = Object.values(ENTITIES.STRUCTURES).filter(s => s.type === 3);
    bushes.forEach(bush => {
        if (!isCircleVisible(bush.x, bush.y, bush.radius || 0, staticViewRect)) return;
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

function drawTiledImageInRect(name, worldX, worldY, width, height, tileSize, viewRect, transparency = 1) {
    if (tileSize <= 0 || width <= 0 || height <= 0) return;
    if (!isRectVisible(worldX, worldY, width, height, viewRect)) return;

    const startX = Math.max(worldX, Math.floor(viewRect.left / tileSize) * tileSize);
    const startY = Math.max(worldY, Math.floor(viewRect.top / tileSize) * tileSize);
    const endX = Math.min(worldX + width, viewRect.right + tileSize);
    const endY = Math.min(worldY + height, viewRect.bottom + tileSize);

    const screenX = worldX - camera.x;
    const screenY = worldY - camera.y;
    LC.ctx.save();
    LC.ctx.beginPath();
    LC.ctx.rect(screenX, screenY, width, height);
    LC.ctx.clip();

    for (let x = startX; x < endX; x += tileSize) {
        for (let y = startY; y < endY; y += tileSize) {
            LC.drawImage({
                name,
                pos: [x - camera.x, y - camera.y],
                // Slight overlap hides texture seams from sub-pixel camera movement.
                size: [tileSize + 1, tileSize + 1],
                transparency
            });
        }
    }
    LC.ctx.restore();
}

function getCameraViewRect(margin = 0) {
    const invZoom = 1 / Math.max(0.001, LC.zoom);
    return {
        left: camera.x - margin,
        top: camera.y - margin,
        right: camera.x + (LC.width * invZoom) + margin,
        bottom: camera.y + (LC.height * invZoom) + margin
    };
}

function getStaticWorldCullMargin() {
    return Math.max(STATIC_WORLD_CULL_MARGIN_BASE, 700 / Math.max(0.001, LC.zoom));
}

function isRectVisible(x, y, width, height, viewRect) {
    return x <= viewRect.right &&
        (x + width) >= viewRect.left &&
        y <= viewRect.bottom &&
        (y + height) >= viewRect.top;
}

function isCircleVisible(x, y, radius, viewRect) {
    return (x + radius) >= viewRect.left &&
        (x - radius) <= viewRect.right &&
        (y + radius) >= viewRect.top &&
        (y - radius) <= viewRect.bottom;
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

function drawDamageIndicators() {
    const now = performance.now();
    for (let i = damageIndicators.length - 1; i >= 0; i--) {
        const indicator = damageIndicators[i];
        const elapsed = now - indicator.start;
        const progress = Math.min(1, elapsed / indicator.duration);
        if (progress >= 1) {
            damageIndicators.splice(i, 1);
            continue;
        }
        const transparency = 1 - progress;
        const rise = (indicator.rise || DAMAGE_INDICATOR_RISE) * progress;
        const screenX = indicator.x - camera.x;
        const screenY = indicator.y - camera.y - rise;
        LC.drawText({
            text: indicator.text,
            pos: [screenX, screenY],
            font: indicator.font || 'bold 16px Inter',
            color: indicator.color || '#ff0000',
            textAlign: 'center',
            transparency
        });
    }
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
    updateKeyHintVisibility(isAlive);
    updateHUDVisibility(isAlive);
    updateShieldUI(lp?.hasShield);

    const homeScreen = document.getElementById('home-screen');
    const respawnScreen = document.getElementById('respawn-screen');

    if (uiState.forceHomeScreen) {
        if (homeScreen) homeScreen.style.display = 'flex';
        if (respawnScreen) respawnScreen.style.display = 'none';
        updateHomeOnlineCount(true);
        updateJoinButton();
        return;
    }

    if (!isAlive) {
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

function updateKeyHintVisibility(isAlive) {
    ensureKeyHintElement();

    if (!isAlive) {
        keyHintUi.wasAliveLastFrame = false;
        keyHintUi.visible = false;
        syncKeyHintElementVisibility();
        return;
    }

    if (!keyHintUi.wasAliveLastFrame) {
        keyHintUi.visible = !keyHintUi.neverShowAgain;
    }
    keyHintUi.wasAliveLastFrame = true;
    syncKeyHintElementVisibility();
}

function ensureKeyHintElement() {
    if (keyHintUi.containerEl || typeof document === 'undefined') return;

    const container = document.createElement('div');
    container.id = 'key-hint-overlay';
    Object.assign(container.style, {
        position: 'fixed',
        inset: '0',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '100200',
        pointerEvents: 'none'
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
        width: '340px',
        maxWidth: 'min(92vw, 340px)',
        background: 'rgba(0, 0, 0, 0.76)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: '12px',
        boxSizing: 'border-box',
        padding: '16px 16px 14px 16px',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
        pointerEvents: 'auto',
        backdropFilter: 'blur(6px)'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
    });

    const title = document.createElement('div');
    title.textContent = 'Controls';
    Object.assign(title.style, {
        fontSize: '20px',
        fontWeight: '700'
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    Object.assign(closeBtn.style, {
        border: '1px solid rgba(255,255,255,0.28)',
        borderRadius: '7px',
        background: 'rgba(255,255,255,0.12)',
        color: 'white',
        font: '600 13px Inter, sans-serif',
        padding: '6px 12px',
        cursor: 'pointer'
    });
    closeBtn.onclick = () => {
        keyHintUi.visible = false;
        syncKeyHintElementVisibility();
    };

    const controlsList = document.createElement('div');
    controlsList.innerHTML = `
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;">Left Click: Attack</div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;">E: Throw Weapon</div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;">Q: Drop Item</div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;">R: Pick Up Item</div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;">F: Activate Ability</div>
        <div style="margin: 6px 0 10px 0; font: 600 15px Inter, sans-serif;">Enter: Chat</div>
    `;

    const checkboxWrap = document.createElement('label');
    Object.assign(checkboxWrap.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        font: '600 13px Inter, sans-serif',
        color: 'rgba(255,255,255,0.9)',
        userSelect: 'none',
        cursor: 'pointer'
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!keyHintUi.neverShowAgain;
    checkbox.onchange = () => {
        keyHintUi.neverShowAgain = !!checkbox.checked;
        setStoredBoolean(KEY_HINT_NEVER_SHOW_STORAGE_KEY, keyHintUi.neverShowAgain);
    };

    const checkboxText = document.createElement('span');
    checkboxText.textContent = 'Never show this again';

    header.appendChild(title);
    header.appendChild(closeBtn);
    checkboxWrap.appendChild(checkbox);
    checkboxWrap.appendChild(checkboxText);
    panel.appendChild(header);
    panel.appendChild(controlsList);
    panel.appendChild(checkboxWrap);
    container.appendChild(panel);
    document.body.appendChild(container);

    keyHintUi.containerEl = container;
    keyHintUi.neverShowCheckboxEl = checkbox;
}

function syncKeyHintElementVisibility() {
    if (!keyHintUi.containerEl) return;

    const canShow = keyHintUi.visible && !isMobile && !Settings.forceMobileUI;
    keyHintUi.containerEl.style.display = canShow ? 'flex' : 'none';
    if (keyHintUi.neverShowCheckboxEl) {
        keyHintUi.neverShowCheckboxEl.checked = !!keyHintUi.neverShowAgain;
    }
}

function drawCoinPickupEffects() {
    const now = performance.now();
    const radius = dataMap.OBJECTS[getCoinObjectType()]?.radius || 15;
    const baseSize = radius * 2;

    for (let i = coinPickupEffects.length - 1; i >= 0; i--) {
        const effect = coinPickupEffects[i];
        const target = ENTITIES.PLAYERS[effect.targetId];

        if (!target?.isAlive) {
            coinPickupEffects.splice(i, 1);
            continue;
        }

        const elapsed = now - effect.startTime;
        const t = Math.min(1, elapsed / COIN_PICKUP_EFFECT_DURATION);
        if (t >= 1) {
            coinPickupEffects.splice(i, 1);
            continue;
        }

        const eased = 1 - Math.pow(1 - t, 3);
        const x = effect.startX + (target.x - effect.startX) * eased;
        const y = effect.startY + (target.y - effect.startY) * eased;
        const spread = (1 - t) * 7;
        const alpha = 1 - t * 0.8;

        for (let j = 0; j < effect.spriteCount; j++) {
            const angle = effect.seed + ((j / effect.spriteCount) * Math.PI * 2);
            const ox = Math.cos(angle) * spread;
            const oy = Math.sin(angle) * spread;
            const size = baseSize * (1 - t * 0.2);

            LC.drawImage({
                name: 'gold-coin',
                pos: [x - camera.x + ox - size / 2, y - camera.y + oy - size / 2],
                size: [size, size],
                transparency: alpha
            });
        }
    }
}

function drawLightningShotEffects() {
    const now = performance.now();

    for (let i = lightningShotEffects.length - 1; i >= 0; i--) {
        const fx = lightningShotEffects[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            lightningShotEffects.splice(i, 1);
            continue;
        }

        const phase = Math.floor((now - fx.startTime) / 100);
        const mirrored = (phase % 2) === 1 ? -1 : 1;
        const segCount = Math.max(8, Math.min(48, Math.floor(fx.length / 30)));
        const jitter = Math.max(6, Math.min(26, fx.length * 0.035));
        const waveCycles = Math.max(1.25, Math.min(8, 900 / Math.max(80, fx.length)));
        const baseFreq = waveCycles * Math.PI * 2;
        const branchChance = 0.22;
        const baseX = fx.startX - camera.x;
        const baseY = fx.startY - camera.y;

        LC.ctx.save();
        LC.ctx.translate(baseX, baseY);
        LC.ctx.rotate(fx.angle);

        // Outer glow stroke
        LC.ctx.beginPath();
        LC.ctx.moveTo(0, 0);
        for (let s = 1; s <= segCount; s++) {
            const x = (s / segCount) * fx.length;
            const wave = Math.sin(((s / segCount) * baseFreq) + fx.seed + phase * 0.8);
            const y = mirrored * wave * jitter;
            LC.ctx.lineTo(x, y);
        }
        LC.ctx.strokeStyle = 'rgba(68, 0, 0, 0.8)';
        LC.ctx.lineWidth = 12;
        LC.ctx.lineCap = 'round';
        LC.ctx.lineJoin = 'round';
        LC.ctx.stroke();

        // Main bolt
        LC.ctx.beginPath();
        LC.ctx.moveTo(0, 0);
        for (let s = 1; s <= segCount; s++) {
            const x = (s / segCount) * fx.length;
            const wave = Math.sin(((s / segCount) * baseFreq * 1.08) + fx.seed + phase);
            const y = mirrored * wave * jitter * 0.75;
            LC.ctx.lineTo(x, y);

            // Small side branches for a more natural lightning look
            if (s < segCount && Math.random() < branchChance) {
                const branchLen = 14 + Math.random() * 26;
                const branchAng = (mirrored * 0.8) + ((Math.random() - 0.5) * 0.5);
                LC.ctx.beginPath();
                LC.ctx.moveTo(x, y);
                LC.ctx.lineTo(x + Math.cos(branchAng) * branchLen, y + Math.sin(branchAng) * branchLen);
                LC.ctx.strokeStyle = 'rgba(255, 210, 210, 0.9)';
                LC.ctx.lineWidth = 2;
                LC.ctx.stroke();
            }
        }
        LC.ctx.strokeStyle = 'rgba(255, 80, 80, 1)';
        LC.ctx.lineWidth = 6;
        LC.ctx.lineCap = 'round';
        LC.ctx.lineJoin = 'round';
        LC.ctx.stroke();

        // Core highlight
        LC.ctx.beginPath();
        LC.ctx.moveTo(0, 0);
        for (let s = 1; s <= segCount; s++) {
            const x = (s / segCount) * fx.length;
            const wave = Math.sin(((s / segCount) * baseFreq * 1.08) + fx.seed + phase);
            const y = mirrored * wave * jitter * 0.55;
            LC.ctx.lineTo(x, y);
        }
        LC.ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        LC.ctx.lineWidth = 2.5;
        LC.ctx.lineCap = 'round';
        LC.ctx.lineJoin = 'round';
        LC.ctx.stroke();

        LC.ctx.restore();
    }
}

function drawEnergyBurstEffects() {
    const now = performance.now();
    const colliders = collectEnergyBurstColliders();

    for (let i = energyBurstEffects.length - 1; i >= 0; i--) {
        const fx = energyBurstEffects[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            energyBurstEffects.splice(i, 1);
            continue;
        }

        const baseAlpha = 1 - t;
        const centerX = fx.x - camera.x;
        const centerY = fx.y - camera.y;
        const waveDelay = 0.14; // stagger waves so they begin from center over time

        LC.ctx.save();
        for (let w = 0; w < fx.waves; w++) {
            const waveStart = w * waveDelay;
            if (t < waveStart) continue;
            const localT = Math.min(1, (t - waveStart) / Math.max(0.001, 1 - waveStart));
            const r = fx.radius * localT;
            const alpha = baseAlpha * (1 - localT * 0.7);
            if (r <= 0 || alpha <= 0.01) continue;

            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(255, 70, 70, ${Math.min(0.85, alpha)})`;
            LC.ctx.lineWidth = 6;
            LC.ctx.stroke();

            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.55, alpha * 0.8)})`;
            LC.ctx.lineWidth = 2;
            LC.ctx.stroke();

            const boltCount = 15;
            const boltLen = Math.max(40, Math.min(180, 48 + fx.radius * 0.14));
            if (localT < 0.04) continue; // avoid immediate outer-looking streaks at spawn
            for (let b = 0; b < boltCount; b++) {
                const angle = ((b / boltCount) * Math.PI * 2) + fx.seed;
                drawBurstLightningBolt(
                    centerX,
                    centerY,
                    fx.x,
                    fx.y,
                    angle,
                    Math.max(0, r - 18),
                    boltLen,
                    fx.seed + b * 1.37,
                    alpha,
                    now,
                    colliders
                );
            }
        }
        LC.ctx.restore();
    }
}

function drawMobDeathFades() {
    const now = performance.now();
    for (let i = mobDeathFades.length - 1; i >= 0; i--) {
        const fx = mobDeathFades[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            mobDeathFades.splice(i, 1);
            continue;
        }

        const cfg = dataMap.MOBS[fx.type];
        if (!cfg) continue;
        const alpha = 1 - t;
        const radius = cfg.radius;
        const proportions = cfg.imgProportions || [2, 2];
        const width = proportions[0] * radius;
        const height = proportions[1] * radius;
        const screenX = fx.x - camera.x;
        const screenY = fx.y - camera.y;

        LC.drawImage({
            name: cfg.imgName,
            pos: [screenX - width / 2, screenY - height / 2],
            size: [width, height],
            rotation: fx.angle || 0,
            transparency: alpha
        });
    }
}

function collectEnergyBurstColliders() {
    const colliders = [];

    Object.values(ENTITIES.STRUCTURES).forEach(s => {
        if (!s?.radius) return;
        if (dataMap.STRUCTURES[s.type]?.noCollisions) return;
        colliders.push({ x: s.x, y: s.y, r: s.radius });
    });

    Object.values(ENTITIES.OBJECTS).forEach(o => {
        if (!o?.radius) return;
        if (!isChestObjectType(o.type)) return;
        colliders.push({ x: o.x, y: o.y, r: o.radius });
    });

    Object.values(ENTITIES.MOBS).forEach(m => {
        if (!m?.radius) return;
        colliders.push({ x: m.x, y: m.y, r: m.radius });
    });

    Object.values(ENTITIES.PLAYERS).forEach(p => {
        if (!p?.isAlive || !p.radius) return;
        colliders.push({ x: p.x, y: p.y, r: p.radius });
    });

    return colliders;
}

function rayCircleHitDistance(originX, originY, dirX, dirY, cx, cy, radius, minDist, maxDist) {
    const ox = originX - cx;
    const oy = originY - cy;
    const b = 2 * (dirX * ox + dirY * oy);
    const c = (ox * ox + oy * oy) - (radius * radius);
    const disc = (b * b) - (4 * c);
    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) * 0.5;
    const t2 = (-b + sqrtDisc) * 0.5;

    let hit = Infinity;
    if (t1 >= minDist && t1 <= maxDist) hit = t1;
    if (t2 >= minDist && t2 <= maxDist) hit = Math.min(hit, t2);
    return Number.isFinite(hit) ? hit : null;
}

function getBurstBoltClampedLength(worldX, worldY, angle, startRadius, length, colliders) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const minDist = Math.max(0, startRadius);
    const maxDist = minDist + Math.max(0, length);
    let nearestHit = Infinity;

    for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        // If burst originates inside this collider, skip clipping to avoid zero-length bolts.
        const dx = worldX - c.x;
        const dy = worldY - c.y;
        if ((dx * dx + dy * dy) <= (c.r * c.r)) continue;

        const hit = rayCircleHitDistance(worldX, worldY, dirX, dirY, c.x, c.y, c.r, minDist, maxDist);
        if (hit !== null && hit < nearestHit) nearestHit = hit;
    }

    if (!Number.isFinite(nearestHit)) return length;
    return Math.max(0, (nearestHit - minDist) - 2);
}

function drawBurstLightningBolt(centerX, centerY, worldX, worldY, angle, startRadius, length, seed, alpha, now, colliders) {
    const clampedLength = getBurstBoltClampedLength(worldX, worldY, angle, startRadius, length, colliders);
    if (clampedLength <= 1) return;

    const segCount = Math.max(6, Math.min(14, Math.floor(clampedLength / 7)));
    const jitter = Math.max(1.8, Math.min(6.2, clampedLength * 0.09));
    const phase = Math.floor(now / 90);
    const mirrored = (phase % 2) === 1 ? -1 : 1;
    const glowAlpha = Math.min(0.75, alpha * 0.95);
    const mainAlpha = Math.min(0.95, alpha);
    const coreAlpha = Math.min(0.9, alpha * 0.85);

    LC.ctx.save();
    LC.ctx.translate(centerX, centerY);
    LC.ctx.rotate(angle);

    LC.ctx.beginPath();
    LC.ctx.moveTo(startRadius, 0);
    for (let s = 1; s <= segCount; s++) {
        const p = s / segCount;
        const x = startRadius + p * clampedLength;
        const wave = Math.sin((p * Math.PI * 2.4) + seed + phase * 0.55);
        const y = mirrored * wave * jitter * (1 - p * 0.35);
        LC.ctx.lineTo(x, y);
    }
    LC.ctx.strokeStyle = `rgba(68, 0, 0, ${glowAlpha})`;
    LC.ctx.lineWidth = 8;
    LC.ctx.lineCap = 'round';
    LC.ctx.lineJoin = 'round';
    LC.ctx.stroke();

    LC.ctx.beginPath();
    LC.ctx.moveTo(startRadius, 0);
    for (let s = 1; s <= segCount; s++) {
        const p = s / segCount;
        const x = startRadius + p * clampedLength;
        const wave = Math.sin((p * Math.PI * 2.4) + seed + phase * 0.65);
        const y = mirrored * wave * jitter * (1 - p * 0.35);
        LC.ctx.lineTo(x, y);
    }
    LC.ctx.strokeStyle = `rgba(255, 80, 80, ${mainAlpha})`;
    LC.ctx.lineWidth = 4;
    LC.ctx.lineCap = 'round';
    LC.ctx.lineJoin = 'round';
    LC.ctx.stroke();

    LC.ctx.beginPath();
    LC.ctx.moveTo(startRadius, 0);
    for (let s = 1; s <= segCount; s++) {
        const p = s / segCount;
        const x = startRadius + p * clampedLength;
        const wave = Math.sin((p * Math.PI * 2.4) + seed + phase * 0.65);
        const y = mirrored * wave * jitter * 0.65 * (1 - p * 0.35);
        LC.ctx.lineTo(x, y);
    }
    LC.ctx.strokeStyle = `rgba(255, 255, 255, ${coreAlpha})`;
    LC.ctx.lineWidth = 1.8;
    LC.ctx.lineCap = 'round';
    LC.ctx.lineJoin = 'round';
    LC.ctx.stroke();

    LC.ctx.restore();
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
    if (Settings.showChestsOnMinimap) Object.values(ENTITIES.OBJECTS).filter(o => isChestObjectType(o.type)).forEach(o => drawDot(o, '#b45309'));
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
    drawAbilityCooldownBar(x, y, totalW);
}

function drawAbilityCooldownBar(hotbarX, hotbarY, hotbarWidth) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    const accessoryKey = ACCESSORY_KEYS[myPlayer?.accessoryId || 0];
    if (accessoryKey !== 'minotaur-hat' && accessoryKey !== 'pirate-hat') return;

    const cooldownMs = Math.max(0, Vars.abilityCooldownMs || 0);
    if (cooldownMs <= 0) return;
    const remainingMs = Math.max(0, (Vars.abilityCooldownEndsAt || 0) - performance.now());
    const fillRatio = Math.max(0, Math.min(1, 1 - (remainingMs / cooldownMs)));

    const barWidth = Math.round(hotbarWidth * 0.42);
    const barHeight = 10;
    const x = hotbarX + (hotbarWidth - barWidth) / 2;
    const y = hotbarY - 18;

    LC.drawRect({
        pos: [x, y],
        size: [barWidth, barHeight],
        color: 'rgba(130, 130, 130, 0.45)',
        cornerRadius: 6
    });
    LC.drawRect({
        pos: [x, y],
        size: [barWidth * fillRatio, barHeight],
        color: 'rgba(220, 38, 38, 0.95)',
        cornerRadius: 6
    });

    if (fillRatio >= 0.999) {
        LC.drawText({
            text: 'Press F to activate your ability!',
            pos: [x + (barWidth / 2), y - 8],
            font: 'bold 14px Inter',
            color: 'white',
            textAlign: 'center'
        });
    }
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
    if (isCoinObjectType(lookupType)) {
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
    const cooldown = isJoinActionOnCooldown();
    btn.disabled = cooldown;
    btn.style.opacity = cooldown ? '0.5' : '1';
    btn.style.pointerEvents = cooldown ? 'none' : 'auto';
}

function updateRespawnButton() {
    const btn = document.getElementById('respawnBtn');
    if (!btn) return;
    const cooldown = isJoinActionOnCooldown();
    btn.disabled = cooldown;
    btn.style.opacity = cooldown ? '0.5' : '1';
    btn.style.pointerEvents = cooldown ? 'none' : 'auto';
}

// --- Initialization ---
const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('homeUsrnInput');
if (usernameInput) usernameInput.value = localStorage.username || '';

const respawnBtn = document.getElementById('respawnBtn');
const respawnHomeBtn = document.getElementById('respawnHomeBtn');

export function startJoinActionCooldown(ms = JOIN_ACTION_COOLDOWN_MS) {
    const until = performance.now() + Math.max(0, ms);
    Vars.joinActionLockedUntil = Math.max(Vars.joinActionLockedUntil || 0, until);
}

function isJoinActionOnCooldown() {
    return performance.now() < (Vars.joinActionLockedUntil || 0);
}

const tryJoin = () => {
    if (uiState.isPaused) return;
    if (isJoinActionOnCooldown()) return;

    startJoinActionCooldown();
    const username = usernameInput?.value || localStorage.username || '';
    ws.send(encodeUsername(username));
    LC.zoomIn();
    updateJoinButton();
    updateRespawnButton();
};

if (joinBtn) {
    joinBtn.onclick = () => {
        if (isJoinActionOnCooldown()) {
            updateJoinButton();
            return;
        }
        localStorage.username = usernameInput.value;
        uiState.forceHomeScreen = false;
        uiState.isPaused = false;
        tryJoin();
    };
}

if (respawnBtn) {
    respawnBtn.onclick = () => {
        if (isJoinActionOnCooldown()) {
            updateRespawnButton();
            return;
        }
        if (usernameInput) {
            localStorage.username = usernameInput.value || localStorage.username || '';
        }
        uiState.forceHomeScreen = false;
        uiState.isPaused = false;
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
    ensureKeyHintElement();
    requestAnimationFrame(render);
    await loadAssets();

    // FPS Tracker
    let frames = 0;
    setInterval(() => { TPS.clientReal = frames; frames = 0; }, 1000);
    const countFps = () => { frames++; requestAnimationFrame(countFps); };
    requestAnimationFrame(countFps);
})();
