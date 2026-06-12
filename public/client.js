import { parsePacket } from './parser.js';
import { LibCanvas, normalizeCanvasFont } from './libcanvas.js';
import { ENTITIES, MAP_SIZE } from './game.js';
import { dataMap, TPS, ACCESSORY_KEYS, ACCESSORY_DESCRIPTIONS, isAccessoryItemType, accessoryIdFromItemType, accessoryItemTypeFromId, DEFAULT_VIEW_RANGE_MULT, isCoinObjectType, getCoinObjectType, isChestObjectType, xpForLevel, MAX_LEVEL, WEAPON_IDS, isWeaponRank, isWeaponTypeStronger, isSellableItem, getWeaponConfig, getWeaponSize, getStructureImageName, BOSS_PORTAL_MIN_SCORE, getBossPortalEntryBlockMessage, isRockStructureType, isBoomerangType } from './shared/datamap.js';
import { getCenterDiagonalBridgeSegments } from './shared/river.js';
import { worldHasRivers, worldIsGrassOnly, worldIsSnowOnly, worldIsDesertOnly, worldIsMagmaOnly, WORLD_ROOT_DIMENSION, WORLD_YETI_DIMENSION, WORLD_DUNE_DIMENSION, WORLD_INFERNO_DIMENSION } from './shared/worlds.js';
import {
    initializeUI, updateShieldUI, updateHUDVisibility,
    THROW_BTN_CONFIG, PICKUP_BTN_CONFIG, DROP_BTN_CONFIG, ATTACK_BTN_CONFIG,
    isMobile, HOTBAR_CONFIG, INVENTORY_CONFIG, ACCESSORY_SLOT_CONFIG, uiState, uiRefs, closeHomeScreenBlockingUI, drawChatOverlay
} from './ui.js';
import { BACK_BUFFER_QUALITIES, BACK_BUFFER_DEFAULT, BACK_BUFFER_STORAGE_KEY } from './ui/config.js';
import { encodeUsername, sendTutorialEvent, sendUpgradePacket, sendAdminKey, sendBuyPacket, sendSellAllPacket, sendUiPanelVisibilityPacket, sendAuthSessionPacket, sendCoinSnapshotRequestPacket } from './helpers.js';
import { uiInput } from './ui/context.js';
import { drawTutorialObjective, drawTutorialTargetIndicator, updateTutorialGuidedShopFocus } from './ui/canvas/tutorial_canvas.js';
import { showNotification } from './ui/notifications.js';
import { getStoredAccountAuthToken, getStoredAccountUsername, setupAccountAuthUI } from './auth/client_auth.js';

// --- Configuration & Settings ---
export const Settings = {
    renderGrid: false,
    debugMode: false,
    _drawHitboxes: false,
    get drawHitboxes() {
        return this.debugMode;
    },
    set drawHitboxes(value) {
        this.debugMode = Boolean(value);
    },
    get showHitboxes() {
        return this.debugMode;
    },
    set showHitboxes(value) {
        this.debugMode = Boolean(value);
    },
    showMobsOnMinimap: false,
    showChestsOnMinimap: false,
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
const DEATH_MENU_DELAY_MS = 1500;
const DEATH_MENU_FADE_MS = 350;
const HOME_SCREEN_FADE_MS = 300;
const DEATH_SPECTATE_BUFFER_MS = 500;
export const DEATH_SPECTATE_START_DELAY_MS = DEATH_MENU_DELAY_MS + DEATH_MENU_FADE_MS + DEATH_SPECTATE_BUFFER_MS;
export const PAUSE_SPECTATE_START_DELAY_MS = HOME_SCREEN_FADE_MS + DEATH_SPECTATE_BUFFER_MS;
const JOIN_ACK_TIMEOUT_MS = 6000;
const PAUSE_ACK_TIMEOUT_MS = 6000;
const WORLD_STORAGE_KEY = 'ua_world';
const WORLD_CHOICE_MADE_STORAGE_KEY = 'ua_world_choice_made';
const TUTORIAL_COMPLETED_STORAGE_KEY = 'ua_tutorial_completed';
const AUTO_JOIN_STORAGE_KEY = 'ua_auto_join_after_reload';
const MINIMAP_COACH_SEEN_STORAGE_KEY = 'ua_minimap_coach_seen';
const DEFAULT_WORLD = 'main';
export const WORLD_MAIN = 'main';
export const WORLD_TUTORIAL = 'tutorial';
let pendingJoinWorld = WORLD_MAIN;
export function setPendingJoinWorld(world) {
    pendingJoinWorld = world === WORLD_TUTORIAL ? WORLD_TUTORIAL : WORLD_MAIN;
}

function getPreferredWorld() {
    try {
        if (localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY) === '1') {
            localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
            localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
            return WORLD_MAIN;
        }
        const stored = localStorage.getItem(WORLD_STORAGE_KEY);
        const hasExplicitChoice = localStorage.getItem(WORLD_CHOICE_MADE_STORAGE_KEY) === '1';
        if (stored === WORLD_MAIN) return WORLD_MAIN;
        if (stored === WORLD_TUTORIAL && hasExplicitChoice) return WORLD_TUTORIAL;
        return WORLD_MAIN;
    } catch (e) {
        return DEFAULT_WORLD;
    }
}

export let CURRENT_WORLD = getPreferredWorld();
export function setCurrentWorld(world) {
    CURRENT_WORLD = world || WORLD_MAIN;
}
export function isTutorialWorldActive() {
    return CURRENT_WORLD === WORLD_TUTORIAL;
}
const IS_FIRST_TUTORIAL_RUN = (() => {
    if (CURRENT_WORLD !== WORLD_TUTORIAL) return false;
    try {
        return localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY) !== '1';
    } catch (e) {
        return true;
    }
})();

const VIEW_RANGE_STORAGE_KEY = 'ua_view_range_multiplier';
const KEY_HINT_NEVER_SHOW_STORAGE_KEY = 'ua_never_show_key_hints';
const HAS_UPGRADED_STORAGE_KEY = 'ua_has_upgraded';
const PLAYER_SKIN_TONES = ['#e9c6a5', '#d8a77e', '#b97c56', '#8d5a3c', '#5c3b2e'];
const DEFAULT_PLAYER_SKIN = 2;

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

const withCacheKey = (src) => src;

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
const initialHasUpgraded = getStoredBoolean(HAS_UPGRADED_STORAGE_KEY);
let hasUpgradedStats = initialHasUpgraded;
let leaderboardOpen = true;
const leaderboardCanvasState = {
    rect: null,
    toggleRect: null,
    open: leaderboardOpen
};

export const Vars = {
    lastDiedTime: 0,
    myId: 0,
    ping: 0,
    netTps: 0,
    netPps: 0,
    netAupbs: 0,
    netLupbs: 0,
    lastSentPing: 0,
    isAdmin: false,
    viewRangeMult: initialViewRange,
    myInventory: new Array(35).fill(0),
    myInventoryCounts: new Array(35).fill(0),
    selectedSlot: 0,
    dragSlot: -1,
    dragAccessory: false,
    dragAccessoryId: 0,
    creativeDragItemType: 0,
    creativeDragAmount: 0,
    lastSelectionTime: 0,
    mouseX: 0,
    mouseY: 0,
    mouseWorldX: 0,
    mouseWorldY: 0,
    myStats: {
        dmgHit: 0,
        dmgThrow: 0,
        speed: 0,
        hp: 100,
        maxHp: 100,
        goldCoins: 0,
        kills: 0,
        level: 1,
        availablePoints: 0,
        buffStrength: 0,
        buffMaxHealth: 0,
        buffRegenSpeed: 0,
        regenPerTick: 5
    },
    inCombat: false,
    onlineCount: 0,
    vikingComboCount: 0,
    abilityCooldownMs: 0,
    abilityCooldownRemainingMs: 0,
    abilityCooldownEndsAt: 0,
    backBufferQuality: initialBackBufferQuality,
    joinActionLockedUntil: 0,
    tutorialObjectiveVisible: false,
    tutorialObjectiveStatus: 0,
    tutorialObjectiveStep: -1,
    tutorialObjectiveText: '',
    tutorialObjectiveUpdatedAt: 0,
    topLeader: {
        id: 0,
        x: 0,
        y: 0,
        score: 0
    },
    latestCollisionDebugType: 0,
    latestCollisionDebugId: 0,
    debugCollisionShiftHeld: false,
    deathSpectateTargetId: 0,
    deathSpectateStartAt: 0,
    pauseSpectateStartAt: 0,
    deathSpectateUntil: 0,
    minimapPlayers: [],
    disconnectMessage: '',
    disableAutoReconnect: false,
    structureSeed: null,
    bossIntroCountdownUntil: 0,
    bossIntroCountdownDurationMs: 0,
    bossIntroHudHiddenUntil: 0,
    bossIntroHudFadeUntil: 0,
    bossIntroOriginalViewRangeMult: 1,
    bossIntroFightViewRangeMult: 1,
    generalVolume: 1,
    uiVolume: 1,
    inGameSoundVolume: 1
};

const SIMULATED_PING_MAX_MS = 10000;
const SERVER_PACKET_INIT = 1;
const SERVER_PACKET_UPDATE = 2;
const SERVER_PACKET_DIED = 6;
const SERVER_PACKET_KICKED = 8;
const simulatedPingQueue = [];
let simulatedPingMs = 0;
let simulatedPingDisplayMs = 0;
let simulatedPingTimer = null;

function getSimulatedPingDelay() {
    if (simulatedPingMs <= 0) return 0;
    const base = simulatedPingMs;
    const normalJitter = (Math.random() * 2 - 1) * base * 0.18;
    const spikeJitter = Math.random() < 0.08 ? (Math.random() * 2 - 1) * base * 0.28 : 0;
    const delay = Math.max(0, Math.min(SIMULATED_PING_MAX_MS, Math.round(base + normalJitter + spikeJitter)));
    simulatedPingDisplayMs = delay;
    return delay;
}

function clearSimulatedPingQueue() {
    simulatedPingQueue.length = 0;
    simulatedPingDisplayMs = 0;
    if (simulatedPingTimer) {
        clearTimeout(simulatedPingTimer);
        simulatedPingTimer = null;
    }
}

function pumpSimulatedPingQueue() {
    simulatedPingTimer = null;
    const now = performance.now();
    while (simulatedPingQueue.length && simulatedPingQueue[0].deliverAt <= now) {
        parsePacket(simulatedPingQueue.shift().data);
    }
    if (!simulatedPingQueue.length) return;
    simulatedPingTimer = setTimeout(pumpSimulatedPingQueue, Math.max(0, simulatedPingQueue[0].deliverAt - performance.now()));
}

function queueSimulatedUpdatePacket(data) {
    const delay = getSimulatedPingDelay();
    const deliverAt = performance.now() + delay;
    simulatedPingQueue.push({ data, deliverAt });
    if (!simulatedPingTimer) {
        simulatedPingTimer = setTimeout(pumpSimulatedPingQueue, delay);
    }
}

export function setSimulatedPing(ms) {
    const next = Math.max(0, Math.min(SIMULATED_PING_MAX_MS, Number(ms) || 0));
    simulatedPingMs = next;
    if (next <= 0) clearSimulatedPingQueue();
    return simulatedPingMs;
}

export function getSimulatedPing() {
    return simulatedPingMs;
}

export function getCurrentPlayerColor() {
    return getDefaultPlayerColor();
}

export function getDefaultPlayerColor() {
    return PLAYER_SKIN_TONES[DEFAULT_PLAYER_SKIN];
}

export function getCurrentPlayerSkin() {
    return DEFAULT_PLAYER_SKIN;
}

function getStoredWorldChoice() {
    try {
        const stored = localStorage.getItem(WORLD_STORAGE_KEY);
        const hasExplicitChoice = localStorage.getItem(WORLD_CHOICE_MADE_STORAGE_KEY) === '1';
        if (stored === WORLD_MAIN) return WORLD_MAIN;
        if (stored === WORLD_TUTORIAL && hasExplicitChoice) return WORLD_TUTORIAL;
        return '';
    } catch (e) {
        return '';
    }
}

function buildWorldSocketUrl() {
    return `${wsProtocol}${location.host}`;
}

export function isLocalPlayerInSnowBiome() {
    if (CURRENT_WORLD === WORLD_TUTORIAL || worldIsGrassOnly(CURRENT_WORLD)) return false;
    const localPlayer = ENTITIES.PLAYERS[Vars.myId];
    return !!localPlayer && localPlayer.x >= MAP_SIZE[0] * 0.53;
}

const DAMAGE_INDICATOR_DURATION = 800;
const DAMAGE_INDICATOR_RISE = 28;
const damageIndicators = [];
const COIN_PICKUP_EFFECT_DURATION = 180;
const COIN_PICKUP_EFFECT_MAX_DISTANCE = 140;
const COIN_PICKUP_EFFECT_MAX_SPRITES = 5;
const SEEDED_CHEST_COIN_CONSUME_RADIUS = 55;
const coinPickupEffects = [];
const seededChestCoins = [];
const lightningShotEffects = [];
const energyBurstEffects = [];
const poisonAoeEffects = [];
const infernoBeamEffects = [];
const intimidationAoeEffects = [];
const smokeAoeEffects = [];
const heartMistEffects = [];
const blindnessOverlays = [];
const mobDeathFades = [];
let rootWalkerDreadStrength = 0;
const rootWalkerPortalOverlay = {
    enteredAt: 0,
    strength: 0,
    portalId: 0
};
let bossIntroViewRangeRestoreTimer = 0;
const BOSS_INTRO_HUD_FADE_MS = 550;

function removeUnordered(array, index) {
    const lastIndex = array.length - 1;
    if (index < 0 || index > lastIndex) return;
    array[index] = array[lastIndex];
    array.pop();
}

function getBossIntroHudAlpha(now = performance.now()) {
    const hiddenUntil = Vars.bossIntroHudHiddenUntil || 0;
    if (hiddenUntil > 0 && now < hiddenUntil) return 0;

    const fadeUntil = Vars.bossIntroHudFadeUntil || 0;
    if (fadeUntil > 0 && now < fadeUntil) {
        const fadeStart = Math.max(0, fadeUntil - BOSS_INTRO_HUD_FADE_MS);
        const t = Math.max(0, Math.min(1, (now - fadeStart) / Math.max(1, BOSS_INTRO_HUD_FADE_MS)));
        return t * t * (3 - (2 * t));
    }

    return 1;
}

export function resetTransientWorldVisuals() {
    coinPickupEffects.length = 0;
    seededChestCoins.length = 0;
    lightningShotEffects.length = 0;
    energyBurstEffects.length = 0;
    poisonAoeEffects.length = 0;
    infernoBeamEffects.length = 0;
    intimidationAoeEffects.length = 0;
    smokeAoeEffects.length = 0;
    heartMistEffects.length = 0;
    blindnessOverlays.length = 0;
    mobDeathFades.length = 0;
    rootWalkerDreadStrength = 0;
    rootWalkerPortalOverlay.portalId = 0;
    rootWalkerPortalOverlay.enteredAt = 0;
    if (bossIntroViewRangeRestoreTimer) {
        clearTimeout(bossIntroViewRangeRestoreTimer);
        bossIntroViewRangeRestoreTimer = 0;
    }
    if (Vars.bossIntroCountdownUntil > performance.now()) {
        Vars.viewRangeMult = Vars.bossIntroFightViewRangeMult || 1;
    }
    Vars.bossIntroCountdownUntil = 0;
    Vars.bossIntroHudHiddenUntil = 0;
    Vars.bossIntroHudFadeUntil = 0;
}

export function clearGroundLootVisuals() {
    clearSeededChestCoinVisuals();
    coinPickupEffects.length = 0;
    for (const id in ENTITIES.OBJECTS) {
        const object = ENTITIES.OBJECTS[id];
        if (!object) continue;
        const config = dataMap.OBJECTS[object.type];
        if (config?.isEphemeral) {
            delete ENTITIES.OBJECTS[id];
        }
    }
}

export function startBossIntroCountdown(durationMs = 5000, introViewRangeMult = 3, fightViewRangeMult = 1) {
    const safeDuration = Math.max(0, Math.min(65535, Number(durationMs) || 0));
    if (safeDuration <= 0) return;
    const now = performance.now();
    Vars.bossIntroFightViewRangeMult = Math.max(0.1, Number(fightViewRangeMult) || 1);
    Vars.bossIntroCountdownDurationMs = safeDuration;
    Vars.bossIntroCountdownUntil = now + safeDuration;
    Vars.bossIntroHudHiddenUntil = Vars.bossIntroCountdownUntil;
    Vars.bossIntroHudFadeUntil = Vars.bossIntroCountdownUntil + BOSS_INTRO_HUD_FADE_MS;
    Vars.viewRangeMult = Math.max(0.1, Number(introViewRangeMult) || 3);
    const localPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (localPlayer) {
        localPlayer.bossIntroLockedUntil = Math.max(localPlayer.bossIntroLockedUntil || 0, Vars.bossIntroCountdownUntil);
        localPlayer.swingState = 0;
        localPlayer.newSwingState = 0;
    }

    if (bossIntroViewRangeRestoreTimer) {
        clearTimeout(bossIntroViewRangeRestoreTimer);
    }
    const countdownUntil = Vars.bossIntroCountdownUntil;
    bossIntroViewRangeRestoreTimer = setTimeout(() => {
        bossIntroViewRangeRestoreTimer = 0;
        if (Vars.bossIntroCountdownUntil !== countdownUntil) return;
        Vars.bossIntroCountdownUntil = 0;
        Vars.viewRangeMult = Vars.bossIntroFightViewRangeMult || 1;
    }, safeDuration + 25);
}
const keyHintUi = {
    visible: false,
    neverShowAgain: initialNeverShowKeyHints,
    wasAliveLastFrame: false,
    suppressNextAutoShow: false,
    containerEl: null,
    neverShowCheckboxEl: null
};
const tutorialFocusUi = {
    rootEl: null,
    blocks: [],
    ringEl: null,
    hintEl: null,
    closeAckSent: false
};
const tutorialIndicatorUi = {
    canvasEl: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0
};
const dragOverlayUi = {
    canvasEl: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    visible: false
};
const TUTORIAL_DESKTOP_MOVEMENT_HOLD_MS = 2000;
const TUTORIAL_DESKTOP_MOVEMENT_SEQUENCE = [
    { key: 'w', text: 'Hold the "W" key on your keyboard for 2 seconds (your player will move NORTH)' },
    { key: 'a', text: 'Hold the "A" key on your keyboard for 2 seconds (your player will move WEST)' },
    { key: 's', text: 'Hold the "S" key on your keyboard for 2 seconds (your player will move SOUTH)' },
    { key: 'd', text: 'Hold the "D" key on your keyboard for 2 seconds (your player will move EAST)' }
];
const tutorialMovementUi = {
    stepIndex: -1,
    holdStartedAt: 0
};
let fullWorldAssetsLoaded = !IS_FIRST_TUTORIAL_RUN;
let worldChoiceInProgress = false;
let lastUpgradeRequestAt = 0;
const hudUpgradeHitboxes = [];
let hudUpgradeHeaderHitbox = null;
let hudUpgradesExpanded = true;
let hudUpgradeSlideOffset = 0;
const HUD_UPGRADE_LAYOUT = {
    x: 20,
    topY: 296,
    rowHeight: 30,
    rowGap: 10,
    totalWidth: 330,
    rightPad: 12,
    segments: 15,
    segmentGap: 2
};
const HUD_UPGRADE_SLIDE_LERP = 0.22;
const HUD_SCORE_LERP = 0.15;
let hudLevelBarProgress = 0;
let hudLevelBarScore = 0;
let hudLevelBarLevel = 1;
let hudInfoBoxScore = 0;
const TOP_BAR_CONFIG = {
    top: 12,
    padding: 8,
    gap: 10,
    buttonSize: 60,
    cornerRadius: 14
};
const topBarCanvasState = {
    visible: false,
    buttons: [],
    barRect: null
};

let minimapCoachSeen = getStoredBoolean(MINIMAP_COACH_SEEN_STORAGE_KEY);
const hasSeenMinimapCoach = () => minimapCoachSeen;
const setSeenMinimapCoach = (value) => {
    minimapCoachSeen = Boolean(value);
    setStoredBoolean(MINIMAP_COACH_SEEN_STORAGE_KEY, minimapCoachSeen);
};
const MINIMAP_UI = {
    x: 20,
    y: 20,
    size: 180
};
const minimapBackgroundCache = {
    key: '',
    canvas: null
};
const minimapCanvasState = {
    toggleRect: null,
    open: true
};
const minimapCoachUi = {
    active: false,
    dismissed: false,
    rootEl: null,
    blocks: [],
    ringEl: null,
    canvasEl: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    okRect: null
};
const topLeftHintState = {
    visible: false,
    text: '',
    layoutCache: null
};
const UI_PANEL_IDS = {
    leaderboard: 1,
    minimap: 2
};
const settingsCanvasState = {
    visible: false,
    rect: null,
    hitboxes: [],
    activeSlider: null,
    inputFocused: false,
    inputSelectAll: false,
    scrollY: 0,
    scrollMax: 0,
    dragActive: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    panelX: null,
    panelY: null
};
const shopCanvasState = {
    visible: false,
    rect: null,
    hitboxes: [],
    scrollY: 0,
    scrollMax: 0,
    dragActive: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    panelX: null,
    panelY: null,
    hoverInfoText: '',
    buyButtonRects: new Map(),
    sellDropRect: null,
    closeButtonRect: null
};
const adminCreativeInventoryState = {
    scrollY: 0,
    scrollMax: 0
};
let upgradeHintActive = false;
const ADMIN_CREATIVE_PANEL_GAP = 0;
const ADMIN_CREATIVE_ITEMS = (() => {
    const itemsByType = new Map();
    const addItem = (type, amount = 1) => {
        if (!Number.isFinite(type) || type <= 0 || itemsByType.has(type)) return;
        itemsByType.set(type, { type, amount });
    };

    WEAPON_IDS.forEach(type => addItem(type, 1));

    Object.entries(dataMap.OBJECTS || {})
        .map(([type, cfg]) => ({ type: Number(type), cfg }))
        .filter(({ type, cfg }) => (
            Number.isFinite(type) &&
            type > 0 &&
            (cfg?.category === 'coin' || cfg?.category === 'drop' || cfg?.stackable)
        ))
        .sort((a, b) => a.type - b.type)
        .forEach(({ type, cfg }) => addItem(type, cfg?.category === 'coin' ? Math.max(1, Math.floor(cfg.stackLimit || 256)) : 1));

    ACCESSORY_KEYS
        .map((key, idx) => ({ key, idx }))
        .filter(entry => entry.key !== 'none')
        .forEach(entry => addItem(accessoryItemTypeFromId(entry.idx), 1));

    return Array.from(itemsByType.values());
})();

export function playUITapSound() {
    const sfxCfg = dataMap.AUDIO['ui_tap'] || {};
    const finalVolume = (sfxCfg.defaultVolume ?? 1) * Vars.generalVolume * Vars.uiVolume;
    
    if (finalVolume <= 0) return;

    LC.playAudio({
        name: 'ui_tap',
        timestamp: sfxCfg.defaultTimestamp ?? 0,
        endTime: sfxCfg.defaultEndTime ?? sfxCfg.endTime ?? null,
        volume: finalVolume,
        speed: sfxCfg.defaultSpeed ?? 1
    });
}

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

export function spawnCoinPickupVfxToPlayer(startX, startY, angle, targetX, targetY, amount = 1) {
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;
    if (!Number.isFinite(angle)) return;
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const safeAmount = Math.max(1, Math.floor(amount || 1));
    consumeSeededChestCoinsNear(startX, startY, safeAmount);
    consumeLocalCoinObjectsNear(startX, startY, safeAmount);

    const spriteCount = Math.min(COIN_PICKUP_EFFECT_MAX_SPRITES, Math.max(1, safeAmount >= 5 ? 5 : safeAmount));
    coinPickupEffects.push({
        startX,
        startY,
        angle,
        targetX,
        targetY,
        startTime: performance.now(),
        spriteCount,
        seed: Math.random() * Math.PI * 2
    });
}

export function spawnSeededChestCoins(centerX, centerY, spread, totalCoins, seed, lifetimeMs = 100000) {
    const safeTotal = Math.max(1, Math.min(65535, Math.floor(totalCoins || 0)));
    const safeSpread = Math.max(1, Math.floor(spread || 1));
    const coinRadius = dataMap.OBJECTS[getCoinObjectType()]?.radius || 15;
    const expiresAt = performance.now() + Math.max(1, Math.floor(lifetimeMs || 100000));
    let rngState = (seed >>> 0);
    const nextRand = () => {
        rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0;
        return rngState / 4294967296;
    };

    for (let i = 0; i < safeTotal; i++) {
        const angle = nextRand() * Math.PI * 2;
        const distance = Math.sqrt(nextRand()) * safeSpread;
        const x = Math.max(coinRadius, Math.min(MAP_SIZE[0] - coinRadius, centerX + Math.cos(angle) * distance));
        const y = Math.max(coinRadius, Math.min(MAP_SIZE[1] - coinRadius, centerY + Math.sin(angle) * distance));
        seededChestCoins.push({
            x,
            y,
            expiresAt,
            removed: false
        });
    }
}

function pruneSeededChestCoins(now = performance.now()) {
    for (let i = seededChestCoins.length - 1; i >= 0; i--) {
        const coin = seededChestCoins[i];
        if (coin.removed || coin.expiresAt <= now) {
            removeUnordered(seededChestCoins, i);
        }
    }
}

function consumeSeededChestCoinsNear(x, y, amount = 1) {
    if (!seededChestCoins.length || amount <= 0) return;
    pruneSeededChestCoins();
    const safeAmount = Math.max(1, Math.floor(amount));
    const maxDistSq = SEEDED_CHEST_COIN_CONSUME_RADIUS * SEEDED_CHEST_COIN_CONSUME_RADIUS;
    for (let n = 0; n < safeAmount; n++) {
        let bestIndex = -1;
        let bestDistSq = Infinity;
        for (let i = 0; i < seededChestCoins.length; i++) {
            const coin = seededChestCoins[i];
            if (coin.removed) continue;
            const dx = coin.x - x;
            const dy = coin.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestIndex = i;
            }
        }
        if (bestIndex < 0 || bestDistSq > maxDistSq) break;
        seededChestCoins[bestIndex].removed = true;
    }
}

function consumeLocalCoinObjectsNear(x, y, amount = 1) {
    if (amount <= 0) return;
    const safeAmount = Math.max(1, Math.floor(amount));
    const maxDistSq = SEEDED_CHEST_COIN_CONSUME_RADIUS * SEEDED_CHEST_COIN_CONSUME_RADIUS;
    for (let n = 0; n < safeAmount; n++) {
        let bestId = null;
        let bestDistSq = Infinity;
        for (const id in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[id];
            if (!object || !isCoinObjectType(object.type)) continue;
            const ox = object.newX ?? object.x;
            const oy = object.newY ?? object.y;
            const dx = ox - x;
            const dy = oy - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestId = id;
            }
        }
        if (bestId === null || bestDistSq > maxDistSq) break;
        delete ENTITIES.OBJECTS[bestId];
    }
}

export function clearSeededChestCoinVisuals() {
    seededChestCoins.length = 0;
}

export function spawnLightningShotFx(startX, startY, endX, endY, durationMs = 500, thicknessScale = 1) {
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
        seed: Math.random() * Math.PI * 2,
        thickness: Math.max(0.1, thicknessScale || 1)
    });
}

export function spawnEnergyBurstFx(x, y, radius = 500, durationMs = 700, waves = 3, thicknessScale = 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const duration = Math.max(1, durationMs | 0);
    energyBurstEffects.push({
        x,
        y,
        radius: Math.max(1, radius),
        duration,
        waves: Math.max(1, Math.min(8, waves | 0)),
        startTime: performance.now(),
        seed: Math.random() * Math.PI * 2,
        thickness: Math.max(0.1, thicknessScale || 1)
    });
}

export function spawnPoisonAoeFx(x, y, radius = 300, durationMs = 700, waves = 2, colorCode = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const duration = Math.max(1, durationMs | 0);
    poisonAoeEffects.push({
        x,
        y,
        radius: Math.max(1, radius),
        duration,
        waves: Math.max(1, Math.min(8, waves | 0)),
        colorCode: Math.max(0, Math.min(255, colorCode | 0)),
        startTime: performance.now()
    });
}

export function spawnInfernoBeamFx(x, y, angle = 0, length = 1200, width = 300, chargeMs = 3000, collapseMs = 100, beamMs = 420, ownerId = 65535, targetPlayerId = 255) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    infernoBeamEffects.push({
        x,
        y,
        angle: Number.isFinite(angle) ? angle : 0,
        ownerId: ownerId >= 0 && ownerId < 65535 ? ownerId : null,
        targetPlayerId: targetPlayerId >= 0 && targetPlayerId < 255 ? targetPlayerId : null,
        length: Math.max(1, length),
        width: Math.max(1, width),
        chargeMs: Math.max(1, chargeMs | 0),
        collapseMs: Math.max(1, collapseMs | 0),
        beamMs: Math.max(1, beamMs | 0),
        startTime: performance.now(),
        seed: Math.random() * Math.PI * 2
    });
}

function getInfernoBeamTrackedPose(fx) {
    const owner = fx.ownerId !== null ? ENTITIES.MOBS[fx.ownerId] : null;
    const target = fx.targetPlayerId !== null ? ENTITIES.PLAYERS[fx.targetPlayerId] : null;
    const x = owner ? owner.x : fx.x;
    const y = owner ? owner.y : fx.y;
    let angle = fx.angle;
    if (target && target.isAlive !== false && Number.isFinite(target.x) && Number.isFinite(target.y)) {
        const dx = target.x - x;
        const dy = target.y - y;
        if ((dx * dx + dy * dy) > 0.001) {
            angle = Math.atan2(dy, dx);
            fx.angle = angle;
        }
    } else if (owner && Number.isFinite(owner.angle)) {
        angle = owner.angle;
        fx.angle = angle;
    }
    return { x, y, angle };
}

export function spawnIntimidationFx(x, y, radius = 300, durationMs = 9200, followPlayerId = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const duration = Math.max(1, durationMs | 0);
    intimidationAoeEffects.push({
        x,
        y,
        radius: Math.max(1, radius),
        duration,
        startTime: performance.now(),
        followPlayerId: Number.isFinite(followPlayerId) ? followPlayerId : null
    });
}

export function spawnSmokeAoeFx(x, y, radius = 320, durationMs = 8000, waves = 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const duration = Math.max(1, durationMs | 0);
    smokeAoeEffects.push({
        x,
        y,
        radius: Math.max(1, radius),
        duration,
        waves: Math.max(1, Math.min(8, waves | 0)),
        startTime: performance.now(),
        seed: Math.random() * Math.PI * 2
    });
}

export function spawnHeartMistFx(playerId, durationMs = 3000, radius = 70) {
    if (!Number.isFinite(playerId)) return;
    const duration = Math.max(1, durationMs | 0);
    heartMistEffects.push({
        playerId: Math.max(0, Math.min(255, playerId | 0)),
        radius: Math.max(10, radius | 0),
        duration,
        startTime: performance.now(),
        seed: Math.random() * Math.PI * 2,
        particles: [],
        lastSpawnAt: 0
    });
}

export function spawnBlindnessFx(durationMs = 5000, maxAlpha = 0.75) {
    const total = Math.max(1, durationMs | 0);
    const holdMs = 3500;
    const fadeMs = Math.max(1, total - holdMs, 8000);
    const alpha = Math.max(0, Math.min(1, maxAlpha));
    blindnessOverlays.push({
        startTime: performance.now(),
        duration: holdMs + fadeMs,
        holdMs,
        fadeMs,
        maxAlpha: alpha
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
    target: { x: 0, y: 0 },
    focusKey: ''
};

export const LC = new LibCanvas();
LC.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
setBackBufferQuality(initialBackBufferQuality, { persist: false });

const canvasModalCtx = {
    LC,
    uiState,
    Settings,
    Vars,
    settingsCanvasState,
    shopCanvasState,
    VIEW_RANGE_MIN,
    VIEW_RANGE_MAX,
    VIEW_RANGE_RECOMMENDED_MOBILE,
    VIEW_RANGE_RECOMMENDED_DESKTOP,
    BACK_BUFFER_QUALITIES,
    dataMap,
    ACCESSORY_KEYS,
    ACCESSORY_DESCRIPTIONS,
    isWeaponRank,
    isAccessoryItemType,
    accessoryIdFromItemType,
    get CURRENT_WORLD() { return CURRENT_WORLD; },
    WORLD_TUTORIAL,
    isMobile,
    isSellableItem
};

const tutorialCtx = {
    LC,
    Vars,
    uiState,
    uiInput,
    camera,
    Settings,
    get CURRENT_WORLD() { return CURRENT_WORLD; },
    WORLD_TUTORIAL,
    isMobile,
    ENTITIES,
    isChestObjectType,
    isCoinObjectType,
    ATTACK_BTN_CONFIG,
    THROW_BTN_CONFIG,
    HOTBAR_CONFIG,
    TUTORIAL_DESKTOP_MOVEMENT_SEQUENCE,
    TUTORIAL_DESKTOP_MOVEMENT_HOLD_MS,
    tutorialMovementUi,
    tutorialIndicatorUi,
    tutorialFocusUi,
    shopCanvasState,
    normalizeCanvasFont,
    sendTutorialEvent,
    getTopBarButtonClientRect,
    getShopCanvasBuyButtonClientRect
};

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
const disconnectedState = {
    active: false,
    header: 'Disconnected!',
    subText: 'Attempting to reconnect...'
};
let deferredAudioAssets = [];
let deferredAudioPreloadStarted = false;
let deferredAudioInteractionHooked = false;
const gameplayRenderIntervalMs = () => 1000 / Math.max(1, TPS.clientCapped || 1);
const visibleTreeRenderQueue = [];
const visibleRockRenderQueue = [];
let lastGameplayRenderAt = 0;
let gameHudVisible = false;

function ensureGameHudVisible() {
    if (!gameHudEl || gameHudVisible) return;
    gameHudEl.style.display = 'block';
    gameHudVisible = true;
}

function forEachEntity(group, callback) {
    for (const id in group) {
        const entity = group[id];
        if (!entity) continue;
        callback(entity, id);
    }
}

function updateClientEntities() {
    forEachEntity(ENTITIES.STRUCTURES, entity => entity.update?.());
    forEachEntity(ENTITIES.OBJECTS, entity => entity.update?.());
    forEachEntity(ENTITIES.MOBS, entity => entity.update?.());
    forEachEntity(ENTITIES.PROJECTILES, entity => entity.update?.());
    forEachEntity(ENTITIES.PLAYERS, entity => entity.update?.());
}

async function warmLoadedImages() {
    const imageNames = Object.keys(LC.images || {});
    if (!imageNames.length || typeof document === 'undefined') return;

    const warmCanvas = document.createElement('canvas');
    warmCanvas.width = 16;
    warmCanvas.height = 16;
    const warmCtx = warmCanvas.getContext('2d', { alpha: true });
    if (!warmCtx) return;

    for (let i = 0; i < imageNames.length; i++) {
        const image = LC.images[imageNames[i]];
        if (!image) continue;
        try {
            warmCtx.clearRect(0, 0, warmCanvas.width, warmCanvas.height);
            warmCtx.drawImage(image, 0, 0, 1, 1);
        } catch (error) {
            console.warn(`Failed to warm image asset: ${imageNames[i]}`, error);
        }

        if ((i % 24) === 23) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }
}

function updateAssetLoadingProgress(loaded, total) {
    loadingState.loadedAssets = loaded;
    loadingState.totalAssets = total;
    loadingState.progress = total > 0 ? (loaded / total) * 0.99 : 0.99;
}

function markDeferredAudioPreloadTriggered() {
    if (!deferredAudioInteractionHooked) return;
    deferredAudioInteractionHooked = false;
    window.removeEventListener('pointerdown', startDeferredAudioPreload);
    window.removeEventListener('keydown', startDeferredAudioPreload);
    window.removeEventListener('touchstart', startDeferredAudioPreload);
}

function startDeferredAudioPreload() {
    if (deferredAudioPreloadStarted || !deferredAudioAssets.length) return;
    deferredAudioPreloadStarted = true;
    markDeferredAudioPreloadTriggered();
    const assets = deferredAudioAssets;
    deferredAudioAssets = [];
    Promise.allSettled(
        assets.map(asset => LC.loadAudio({ name: asset.name, src: asset.src }))
    ).then(results => {
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'rejected') {
                console.error(`Failed to load audio asset: ${assets[i]?.src || assets[i]?.name}`, result.reason);
            }
        }
    });
}

function installDeferredAudioInteractionHooks() {
    if (deferredAudioInteractionHooked || deferredAudioPreloadStarted || !deferredAudioAssets.length) return;
    deferredAudioInteractionHooked = true;
    window.addEventListener('pointerdown', startDeferredAudioPreload, { once: true, passive: true });
    window.addEventListener('keydown', startDeferredAudioPreload, { once: true });
    window.addEventListener('touchstart', startDeferredAudioPreload, { once: true, passive: true });
}

async function loadAssets() {
    const assetCategories = [];
    if (IS_FIRST_TUTORIAL_RUN) {
        const tutorialObjects = {};
        const coinType = getCoinObjectType();
        if (dataMap.OBJECTS[coinType]) tutorialObjects[coinType] = dataMap.OBJECTS[coinType];
        const tutorialChestId = (dataMap.CHEST_IDS || [])[0];
        if (tutorialChestId && dataMap.OBJECTS[tutorialChestId]) tutorialObjects[tutorialChestId] = dataMap.OBJECTS[tutorialChestId];
        const tutorialSwords = Object.fromEntries(
            Object.entries({ ...(dataMap.SWORDS.imgs || {}), ...(dataMap.SPEARS.imgs || {}), ...(dataMap.AXES.imgs || {}) }).filter(([, sword]) => (
                !!sword?.name
            ))
        );

        // First tutorial load: keep asset set minimal for faster startup.
        assetCategories.push(
            { data: dataMap.UI, type: 'image' },
            { data: dataMap.ACCESSORIES, type: 'image' },
            { data: tutorialObjects, type: 'image', rename: true },
            { data: dataMap.otherImgs, type: 'image' },
            { data: dataMap.PLAYERS.imgs, type: 'image' },
            { data: tutorialSwords, type: 'image' },
            { data: dataMap.BOOMERANGS?.imgs || {}, type: 'image' },
            { data: { '2': dataMap.MOBS['2'] }, type: 'image', rename: true }
        );
    } else {
        try {
            const res = await fetch(withCacheKey('./groundtextures.txt'));
            if (res.ok) {
                const data = await res.json();
                groundTextures.push(...data);
            }
        } catch (e) {
            console.error('Failed to load ground textures:', e);
        }

        assetCategories.push(
            { data: dataMap.AUDIO, type: 'audio' },
            { data: dataMap.UI, type: 'image' },
            { data: dataMap.ACCESSORIES, type: 'image' },
            { data: dataMap.OBJECTS, type: 'image', rename: true },
            { data: dataMap.otherImgs, type: 'image' },
            { data: dataMap.PLAYERS.imgs, type: 'image' },
            { data: { ...(dataMap.SWORDS.imgs || {}), ...(dataMap.SPEARS.imgs || {}), ...(dataMap.AXES.imgs || {}) }, type: 'image' },
            { data: dataMap.MOBS, type: 'image', rename: true },
            { data: dataMap.STRUCTURES, type: 'image', rename: true },
            { data: dataMap.ATTACK_PROJECTILES, type: 'image' },
            { data: dataMap.PROJECTILES, type: 'image', rename: true }
        );
    }

    const assets = assetCategories.flatMap(cat =>
        Object.values(cat.data).map(item => ({
            type: cat.type,
            name: cat.rename ? item.imgName : item.name,
            src: withCacheKey(cat.rename ? item.imgSrc : item.src)
        }))
    );
    assets.push({ type: 'image', name: 'ui_skull', src: withCacheKey('./images/ui/skull.png') });
    assets.push({ type: 'image', name: 'ui_crown', src: withCacheKey('./images/ui/crown.png') });
    assets.push({ type: 'image', name: 'particle_heart', src: withCacheKey('./images/particles/heart.png') });
    assets.push({ type: 'image', name: 'ice_encasing', src: withCacheKey('./images/accessories/ice_encasing.png') });

    const imageAssets = assets.filter(asset => asset.type === 'image');
    deferredAudioAssets = assets.filter(asset => asset.type === 'audio');
    deferredAudioPreloadStarted = false;
    markDeferredAudioPreloadTriggered();
    installDeferredAudioInteractionHooks();

    loadingState.header = 'Loading Assets';
    updateAssetLoadingProgress(0, imageAssets.length);

    let loadedCount = 0;
    const imageResults = await Promise.allSettled(
        imageAssets.map(async (asset) => {
            await LC.loadImage({ name: asset.name, src: asset.src });
            loadedCount++;
            updateAssetLoadingProgress(loadedCount, imageAssets.length);
            await new Promise(r => r());
        })
    );

    for (let i = 0; i < imageResults.length; i++) {
        const result = imageResults[i];
        if (result.status === 'rejected') {
            console.error(`Failed to load image asset: ${imageAssets[i]?.src || imageAssets[i]?.name}`, result.reason);
        }
    }

    updateAssetLoadingProgress(imageAssets.length, imageAssets.length);
    await warmLoadedImages();
}

export async function ensureFullWorldAssetsLoaded() {
    if (fullWorldAssetsLoaded) return;
    fullWorldAssetsLoaded = true;

    if (!groundTextures.length) {
        try {
            const res = await fetch(withCacheKey('./groundtextures.txt'));
            if (res.ok) {
                const data = await res.json();
                groundTextures.push(...data);
            }
        } catch (e) {
            console.error('Failed to load ground textures:', e);
        }
    }

    const assetCategories = [
        { data: dataMap.AUDIO, type: 'audio' },
        { data: dataMap.UI, type: 'image' },
        { data: dataMap.ACCESSORIES, type: 'image' },
        { data: dataMap.OBJECTS, type: 'image', rename: true },
        { data: dataMap.otherImgs, type: 'image' },
        { data: dataMap.PLAYERS.imgs, type: 'image' },
        { data: { ...(dataMap.SWORDS.imgs || {}), ...(dataMap.SPEARS.imgs || {}), ...(dataMap.AXES.imgs || {}) }, type: 'image' },
        { data: dataMap.BOOMERANGS?.imgs || {}, type: 'image' },
        { data: dataMap.MOBS, type: 'image', rename: true },
        { data: dataMap.STRUCTURES, type: 'image', rename: true },
        { data: dataMap.ATTACK_PROJECTILES, type: 'image' },
        { data: dataMap.PROJECTILES, type: 'image', rename: true }
    ];
    const assets = assetCategories.flatMap(cat =>
        Object.values(cat.data).map(item => ({
            type: cat.type,
            name: cat.rename ? item.imgName : item.name,
            src: withCacheKey(cat.rename ? item.imgSrc : item.src)
        }))
    );
    assets.push({ type: 'image', name: 'ui_skull', src: withCacheKey('./images/ui/skull.png') });
    assets.push({ type: 'image', name: 'ui_crown', src: withCacheKey('./images/ui/crown.png') });
    assets.push({ type: 'image', name: 'particle_heart', src: withCacheKey('./images/particles/heart.png') });
    assets.push({ type: 'image', name: 'ice_encasing', src: withCacheKey('./images/accessories/ice_encasing.png') });

    const missingImages = assets.filter(asset => asset.type === 'image' && !LC.images[asset.name]);
    const missingAudio = assets.filter(asset => asset.type === 'audio' && !LC.audios[asset.name]);
    deferredAudioAssets = missingAudio;
    deferredAudioPreloadStarted = false;
    markDeferredAudioPreloadTriggered();
    installDeferredAudioInteractionHooks();

    if (!missingImages.length) return;

    await Promise.allSettled(
        missingImages.map(async (asset) => {
            await LC.loadImage({ name: asset.name, src: asset.src });
        })
    );
    await warmLoadedImages();
}

function drawLoadingScreen() {
    if (!loadingState.active) return;

    const scaleX = LC.scaleX ?? 1;
    const scaleY = LC.scaleY ?? 1;

    LC.ctx.save();
    LC.ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    const grassImage = LC.images.grass;
    if (grassImage) {
        const pattern = LC.ctx.createPattern(grassImage, 'repeat');
        if (pattern) {
            if (typeof pattern.setTransform === 'function') {
                pattern.setTransform(new DOMMatrix().scale(0.28, 0.28));
            }
            LC.ctx.fillStyle = pattern;
            LC.ctx.fillRect(0, 0, LC.width, LC.height);
        } else {
            LC.ctx.fillStyle = '#1f4d2e';
            LC.ctx.fillRect(0, 0, LC.width, LC.height);
        }
    } else {
        LC.ctx.fillStyle = '#1f4d2e';
        LC.ctx.fillRect(0, 0, LC.width, LC.height);
    }
    LC.ctx.fillStyle = 'rgba(6, 10, 18, 0.66)';
    LC.ctx.fillRect(0, 0, LC.width, LC.height);
    if (!grassImage) {
        LC.ctx.restore();
        return;
    }

    const barWidth = 520;
    const barHeight = 18;
    const x = LC.width / 2 - barWidth / 2;
    const y = LC.height / 2 + 50;

    drawFPS();

    LC.drawRect({ pos: [x, y], size: [barWidth, barHeight], color: 'rgba(255, 255, 255, 0.1)', cornerRadius: 6 });
    LC.drawRect({ pos: [x, y], size: [barWidth * loadingState.progress, barHeight], color: '#22c55e', cornerRadius: 6 });

    LC.drawText({ text: loadingState.header.toUpperCase(), pos: [LC.width / 2, y - 45], font: '900 32px Inter, sans-serif', color: 'white', textAlign: 'center' });
    LC.drawText({
        text: `${Math.min(loadingState.loadedAssets, loadingState.totalAssets)}/${Math.max(loadingState.totalAssets, 0)}`,
        pos: [LC.width / 2, y - 15],
        font: '400 13px Inter, sans-serif',
        color: 'rgba(255, 255, 255, 0.42)',
        textAlign: 'center'
    });
    LC.drawText({ text: `${Math.floor(loadingState.progress * 100)}%`, pos: [LC.width / 2, y + 36], font: '600 12px Inter, sans-serif', color: 'rgba(134, 239, 172, 0.82)', textAlign: 'center' });

    if (loadingState.fadeOut) {
        loadingState.alpha -= 0.05;
        if (loadingState.alpha <= 0) loadingState.active = false;
        LC.ctx.globalAlpha = loadingState.alpha;
    }
    LC.ctx.restore();
}

function drawDisconnectedScreen() {
    if (!disconnectedState.active) return;

    const scaleX = LC.scaleX ?? 1;
    const scaleY = LC.scaleY ?? 1;

    LC.ctx.save();
    LC.ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    LC.ctx.fillStyle = '#0f172a';
    LC.ctx.fillRect(0, 0, LC.width, LC.height);
    LC.ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    const y = LC.height / 2 + 50;

    drawFPS();

    LC.drawText({ text: disconnectedState.header.toUpperCase(), pos: [LC.width / 2, y - 20], font: '900 32px Inter, sans-serif', color: '#ef4444', textAlign: 'center' });
    if (disconnectedState.subText) {
        LC.drawText({ text: disconnectedState.subText, pos: [LC.width / 2, y + 14], font: '600 15px Inter, sans-serif', color: 'rgba(248, 113, 113, 0.92)', textAlign: 'center' });
    }

    LC.ctx.restore();
}

// --- WebSocket Setup ---
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = buildWorldSocketUrl();
let reconnectProbeTimer = null;
let reconnectProbeInFlight = false;
let incomingPacketsThisSecond = 0;
let incomingUpdatePacketsThisSecond = 0;
let incomingUpdatePacketBytesThisSecond = 0;
const COIN_SNAPSHOT_REQUEST_INTERVAL_MS = 3000;
export const ws = new WebSocket(wsUrl);
ws.binaryType = 'arraybuffer';
window.ws = ws;

ws.onopen = () => { 
    disconnectedState.active = false;
    Vars.disconnectMessage = '';
    Vars.disableAutoReconnect = false;
    if (LC.container) LC.container.style.zIndex = '';
    if (reconnectProbeTimer) {
        clearInterval(reconnectProbeTimer);
        reconnectProbeTimer = null;
    }
    if (loadingState.loadedAssets === loadingState.totalAssets) {
        loadingState.header = 'Connected!';
        loadingState.progress = 1;
    }
    const storedAuthToken = getStoredAccountAuthToken();
    if (storedAuthToken) {
        sendAuthSessionPacket(storedAuthToken);
    }
};

ws.onmessage = (event) => {
    incomingPacketsThisSecond++;
    let packetType = 0;
    if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
        packetType = new Uint8Array(event.data, 0, 1)[0];
        if (packetType === SERVER_PACKET_UPDATE) {
            incomingUpdatePacketsThisSecond++;
            incomingUpdatePacketBytesThisSecond += event.data.byteLength;
            if (Settings.debugMode) {
                Vars.netLupbs = event.data.byteLength;
            }
        }
    }
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
    if (packetType === SERVER_PACKET_INIT || packetType === SERVER_PACKET_DIED || packetType === SERVER_PACKET_KICKED) {
        clearSimulatedPingQueue();
    }
    if (simulatedPingMs > 0 && packetType === SERVER_PACKET_UPDATE) {
        queueSimulatedUpdatePacket(event.data);
        return;
    }
    parsePacket(event.data);
};

setInterval(() => {
    if (!Vars.myId) return;
    if (!ENTITIES.PLAYERS[Vars.myId]) return;
    sendCoinSnapshotRequestPacket();
}, COIN_SNAPSHOT_REQUEST_INTERVAL_MS);

function startReconnectProbeLoop() {
    if (reconnectProbeTimer) return;
    reconnectProbeTimer = setInterval(() => {
        if (reconnectProbeInFlight) return;
        reconnectProbeInFlight = true;
        const probe = new WebSocket(buildWorldSocketUrl());
        probe.onopen = () => {
            try { probe.close(); } catch (e) {}
            if (reconnectProbeTimer) {
                clearInterval(reconnectProbeTimer);
                reconnectProbeTimer = null;
            }
            window.location.reload();
        };
        probe.onerror = () => {
            try { probe.close(); } catch (e) {}
        };
        probe.onclose = () => {
            reconnectProbeInFlight = false;
        };
    }, 500);
}

ws.onclose = () => {
    disconnectedState.active = true;
    disconnectedState.subText = Vars.disconnectMessage || 'Attempting to reconnect...';
    if (LC.container) LC.container.style.zIndex = '2147483647';
    if (!Vars.disableAutoReconnect) {
        startReconnectProbeLoop();
    }
};

// --- Main Render Loop ---
function updateCamera(localPlayer, focusState = null) {
    if (!localPlayer) return;
    const focusPlayer = focusState?.target || localPlayer;
    const focusKey = focusState?.key || '';
    if (localPlayer.isAlive) {
        camera.target.x = focusPlayer.x;
        camera.target.y = focusPlayer.y;
    } else {
        const switchedFocus = camera.focusKey !== focusKey;
        const cameraLerp = switchedFocus ? 0.2 : 0.12;
        camera.target.x += (focusPlayer.x - camera.target.x) * cameraLerp;
        camera.target.y += (focusPlayer.y - camera.target.y) * cameraLerp;
        if (Math.abs(focusPlayer.x - camera.target.x) < 0.5) camera.target.x = focusPlayer.x;
        if (Math.abs(focusPlayer.y - camera.target.y) < 0.5) camera.target.y = focusPlayer.y;
    }
    camera.focusKey = focusKey;
    camera.x = camera.target.x - (LC.width / 2);
    camera.y = camera.target.y - (LC.height / 2);
}

function updateZoom(localPlayer, focusState = null) {
    let targetZoom = 0.7;
    if (localPlayer?.isAlive) {
        targetZoom = 1.0;
        const inWater = Boolean(localPlayer.inWater) && worldHasRivers(CURRENT_WORLD);
        if (inWater || localPlayer.hasShield) targetZoom = 1.3;
    }

    const zoomRefPlayer = focusState?.target || getZoomReferencePlayer(localPlayer);
    const accessoryKey = ACCESSORY_KEYS[zoomRefPlayer?.accessoryId || 0];
    const accessoryMult = dataMap.ACCESSORIES[accessoryKey]?.viewRangeMult || 1;
    const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
    const radiusScale = Math.max(0.1, (zoomRefPlayer?.radius || baseRadius) / baseRadius);
    const baseViewRange = Vars.viewRangeMult || DEFAULT_VIEW_RANGE_MULT;
    const viewRangeMult = Math.max(0.1, baseViewRange * accessoryMult * radiusScale);
    targetZoom /= viewRangeMult;

    const delta = targetZoom - LC.zoom;
    if (Math.abs(delta) < 0.001) {
        LC.zoom = targetZoom;
    } else {
        LC.zoom += delta * 0.18;
    }
}

function getZoomReferencePlayer(localPlayer) {
    return getCameraFocusState(localPlayer)?.target || null;
}

function getAliveSpectatePlayerByFocusKey(focusKey) {
    if (typeof focusKey !== 'string' || !focusKey.startsWith('player:')) return null;
    const id = Number.parseInt(focusKey.slice(7), 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    const player = ENTITIES.PLAYERS[id];
    return player?.isAlive ? player : null;
}

function getCameraFocusState(localPlayer) {
    if (!localPlayer) return null;
    if (localPlayer.isAlive) {
        return { target: localPlayer, key: `player:${localPlayer.id}` };
    }

    const now = performance.now();
    const spectateStartAt = Math.max(Vars.deathSpectateStartAt || 0, Vars.pauseSpectateStartAt || 0);
    if (now < spectateStartAt) {
        return { target: localPlayer, key: `player:${localPlayer.id}` };
    }

    if (Vars.deathSpectateTargetId && now < (Vars.deathSpectateUntil || 0)) {
        const killer = ENTITIES.PLAYERS[Vars.deathSpectateTargetId];
        if (killer?.isAlive) return { target: killer, key: `player:${killer.id}` };
    }

    const lockedFocusPlayer = getAliveSpectatePlayerByFocusKey(camera.focusKey);
    if (lockedFocusPlayer) {
        return { target: lockedFocusPlayer, key: `player:${lockedFocusPlayer.id}` };
    }

    const topLeaderId = ENTITIES.leaderboard?.[0]?.id;
    const topLeader = topLeaderId ? ENTITIES.PLAYERS[topLeaderId] : null;
    if (topLeader?.isAlive) return { target: topLeader, key: `player:${topLeader.id}` };

    if (Vars.topLeader.id && Number.isFinite(Vars.topLeader.x) && Number.isFinite(Vars.topLeader.y)) {
        return {
            target: {
                x: Vars.topLeader.x,
                y: Vars.topLeader.y,
                isAlive: true
            },
            key: `leader:${Vars.topLeader.id}`
        };
    }

    let closestAlive = null;
    let bestDistSq = Infinity;
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive) continue;
        const dx = p.x - localPlayer.x;
        const dy = p.y - localPlayer.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            closestAlive = p;
        }
    }
    if (closestAlive) {
        return { target: closestAlive, key: `player:${closestAlive.id}` };
    }
    return { target: localPlayer, key: `player:${localPlayer.id}` };
}

function drawBackground() {
    const staticViewRect = getCameraViewRect(getStaticWorldCullMargin());

    const highRov = (Number(Vars.viewRangeMult) || 1) >= 5;
    const GRASS_TILE_SIZE = highRov ? 250 : 125;
    if (CURRENT_WORLD === WORLD_TUTORIAL || worldIsGrassOnly(CURRENT_WORLD)) {
        drawTiledImageInRect('grass', -MAP_SIZE[0] / 2, -MAP_SIZE[1] / 2, MAP_SIZE[0] * 2, MAP_SIZE[1] * 2 + 2500, GRASS_TILE_SIZE, staticViewRect, 0.95);
        drawTiledImageInRect('grass', 0, 0, MAP_SIZE[0], MAP_SIZE[1], GRASS_TILE_SIZE, staticViewRect, 0.9);
        drawOutsideMapOverlay(staticViewRect);
        return;
    }

    if (worldIsSnowOnly(CURRENT_WORLD) || worldIsDesertOnly(CURRENT_WORLD) || worldIsMagmaOnly(CURRENT_WORLD) || !worldHasRivers(CURRENT_WORLD)) {
        const tileName = worldIsSnowOnly(CURRENT_WORLD) ? 'grass_snow' : (worldIsDesertOnly(CURRENT_WORLD) ? 'sand' : (worldIsMagmaOnly(CURRENT_WORLD) ? 'magma' : 'grass'));
        drawTiledImageInRect(tileName, -MAP_SIZE[0] / 2, -MAP_SIZE[1] / 2, MAP_SIZE[0] * 2, MAP_SIZE[1] * 2 + 2500, GRASS_TILE_SIZE, staticViewRect, 0.95);
        drawTiledImageInRect(tileName, 0, 0, MAP_SIZE[0], MAP_SIZE[1], GRASS_TILE_SIZE, staticViewRect, 0.9);
        drawOutsideMapOverlay(staticViewRect);
        return;
    }

    const riverBaseLeft = MAP_SIZE[0] * 0.47;
    const riverBaseRight = MAP_SIZE[0] * 0.53;
    const riverCenterX = MAP_SIZE[0] * 0.5;
    const riverCenterY = MAP_SIZE[1] / 2;
    const riverTop = -(MAP_SIZE[1] * 0.5);
    const riverBottom = (MAP_SIZE[1] * 1.5) + 2500;
    const riverBulgeRadius = 1400;
    const riverBulgeStep = 6;
    const getRiverBoundsAtY = (y) => {
        const dy = y - riverCenterY;
        const dySq = dy * dy;
        if (dySq >= riverBulgeRadius * riverBulgeRadius) {
            return { left: riverBaseLeft, right: riverBaseRight };
        }
        const halfWidth = Math.sqrt((riverBulgeRadius * riverBulgeRadius) - dySq);
        const left = Math.min(riverBaseLeft, riverCenterX - halfWidth);
        const right = Math.max(riverBaseRight, riverCenterX + halfWidth);
        return { left, right };
    };
    const getRiverBoundsAtX = (x) => {
        const dx = x - riverCenterX;
        const dxSq = dx * dx;
        if (dxSq >= riverBulgeRadius * riverBulgeRadius) {
            return { top: MAP_SIZE[1] * 0.47, bottom: MAP_SIZE[1] * 0.53 };
        }
        const halfWidth = Math.sqrt((riverBulgeRadius * riverBulgeRadius) - dxSq);
        const top = Math.min(MAP_SIZE[1] * 0.47, riverCenterY - halfWidth);
        const bottom = Math.max(MAP_SIZE[1] * 0.53, riverCenterY + halfWidth);
        return { top, bottom };
    };
    const buildRiverPath = (path, top, bottom, step) => {
        const snappedTop = Math.floor((top - riverTop) / step) * step + riverTop;
        const snappedBottom = Math.ceil((bottom - riverTop) / step) * step + riverTop;
        for (let y = snappedTop; y <= snappedBottom; y += step) {
            const { left } = getRiverBoundsAtY(y);
            if (y === snappedTop) path.moveTo(left - camera.x, y - camera.y);
            else path.lineTo(left - camera.x, y - camera.y);
        }
        for (let y = snappedBottom; y >= snappedTop; y -= step) {
            const { right } = getRiverBoundsAtY(y);
            path.lineTo(right - camera.x, y - camera.y);
        }
        path.closePath();
    };
    const buildRiverPathHorizontal = (path, left, right, step) => {
        const snappedLeft = Math.floor(left / step) * step;
        const snappedRight = Math.ceil(right / step) * step;
        // Keep winding direction consistent with vertical river path so overlap is union, not a hole.
        for (let xw = snappedRight; xw >= snappedLeft; xw -= step) {
            const { top } = getRiverBoundsAtX(xw);
            if (xw === snappedRight) path.moveTo(xw - camera.x, top - camera.y);
            else path.lineTo(xw - camera.x, top - camera.y);
        }
        for (let xw = snappedLeft; xw <= snappedRight; xw += step) {
            const { bottom } = getRiverBoundsAtX(xw);
            path.lineTo(xw - camera.x, bottom - camera.y);
        }
        path.closePath();
    };

    // Ground and Biomes
    const splitY = MAP_SIZE[1] * 0.53;
    // Outer biome bands (render only outside the playable [0..MAP_SIZE] area to avoid overlap flicker).
    drawTiledImageInRect('grass', -MAP_SIZE[0] / 2, -MAP_SIZE[1] / 2, MAP_SIZE[0] / 2, splitY + (MAP_SIZE[1] * 0.5), GRASS_TILE_SIZE, staticViewRect, 0.95);
    drawTiledImageInRect('sand', -MAP_SIZE[0] / 2, splitY, MAP_SIZE[0] / 2, (MAP_SIZE[1] * 1.5 + 2500) - splitY, GRASS_TILE_SIZE, staticViewRect, 0.95);
    drawTiledImageInRect('grass_snow', MAP_SIZE[0], -MAP_SIZE[1] / 2, MAP_SIZE[0] / 2, splitY + (MAP_SIZE[1] * 0.5), GRASS_TILE_SIZE, staticViewRect, 0.95);
    drawTiledImageInRect('magma', MAP_SIZE[0], splitY, MAP_SIZE[0] / 2, (MAP_SIZE[1] * 1.5 + 2500) - splitY, GRASS_TILE_SIZE, staticViewRect, 0.95);
    // Top/bottom outer strips so vertical out-of-bounds matches side biome look.
    drawTiledImageInRect('grass', 0, -MAP_SIZE[1] / 2, MAP_SIZE[0] * 0.47, MAP_SIZE[1] / 2, GRASS_TILE_SIZE, staticViewRect, 0.95);
    drawTiledImageInRect('grass_snow', MAP_SIZE[0] * 0.53, -MAP_SIZE[1] / 2, MAP_SIZE[0] * 0.47, MAP_SIZE[1] / 2, GRASS_TILE_SIZE, staticViewRect, 0.95);
    drawTiledImageInRect('sand', 0, MAP_SIZE[1], MAP_SIZE[0] * 0.47, (MAP_SIZE[1] * 0.5) + 2500, GRASS_TILE_SIZE, staticViewRect, 0.95);
    drawTiledImageInRect('magma', MAP_SIZE[0] * 0.53, MAP_SIZE[1], MAP_SIZE[0] * 0.47, (MAP_SIZE[1] * 0.5) + 2500, GRASS_TILE_SIZE, staticViewRect, 0.95);

    // Inner Map
    drawTiledImageInRect('grass', 0, 0, MAP_SIZE[0] * 0.47, MAP_SIZE[1] * 0.47, GRASS_TILE_SIZE, staticViewRect, 0.9);
    drawTiledImageInRect('sand', 0, MAP_SIZE[1] * 0.53, MAP_SIZE[0] * 0.47, MAP_SIZE[1] * 0.47, GRASS_TILE_SIZE, staticViewRect, 0.9);
    drawTiledImageInRect('grass_snow', MAP_SIZE[0] * 0.53, 0, MAP_SIZE[0] * 0.47, MAP_SIZE[1] * 0.47, GRASS_TILE_SIZE, staticViewRect, 0.9);
    drawTiledImageInRect('magma', MAP_SIZE[0] * 0.53, MAP_SIZE[1] * 0.53, MAP_SIZE[0] * 0.47, MAP_SIZE[1] * 0.47, GRASS_TILE_SIZE, staticViewRect, 0.9);

    groundTextures.forEach(gt => {
        if (highRov && (gt.size * Math.max(0.001, LC.zoom)) < 18) return;
        if (!isRectVisible(gt.x, gt.y, gt.size, gt.size, staticViewRect)) return;
        LC.drawImage({
            name: gt.texture,
            pos: [gt.x - camera.x, gt.y - camera.y],
            size: [gt.size, gt.size],
            rotation: gt.rotation,
            transparency: 0.6
        });
    });

    // River base + animated water (single clip pass for both rivers to avoid overlap seams)
    const segmentH = 400;
    waterOffset = (waterOffset + 2) % segmentH;
    const visibleTop = Math.max(riverTop, staticViewRect.top - 200);
    const visibleBottom = Math.min(riverBottom, staticViewRect.bottom + 200);
    const riverLeftLimit = -MAP_SIZE[0] * 0.5;
    const riverRightLimit = MAP_SIZE[0] * 1.5;
    const visibleLeft = Math.max(riverLeftLimit, staticViewRect.left - 200);
    const visibleRight = Math.min(riverRightLimit, staticViewRect.right + 200);
    if (visibleBottom > visibleTop || visibleRight > visibleLeft) {
        const riverClipPath = new Path2D();
        if (visibleBottom > visibleTop) {
            const verticalPath = new Path2D();
            buildRiverPath(verticalPath, visibleTop, visibleBottom, riverBulgeStep);
            riverClipPath.addPath(verticalPath);
        }
        if (visibleRight > visibleLeft) {
            const horizontalPath = new Path2D();
            buildRiverPathHorizontal(horizontalPath, visibleLeft, visibleRight, riverBulgeStep);
            riverClipPath.addPath(horizontalPath);
        }

        LC.ctx.save();
        LC.ctx.fillStyle = 'rgba(20, 80, 150, 1)';
        LC.ctx.fill(riverClipPath);
        LC.ctx.clip(riverClipPath);

        const tileLeft = staticViewRect.left - 200;
        const tileRight = staticViewRect.right + 200;
        const riverBoundsTop = Math.floor((staticViewRect.top - waterOffset - segmentH) / segmentH) * segmentH;
        const riverBoundsBottom = Math.ceil((staticViewRect.bottom - waterOffset + segmentH) / segmentH) * segmentH;
        for (let y = riverBoundsTop; y <= riverBoundsBottom; y += segmentH) {
            LC.drawImage({
                name: 'water',
                pos: [tileLeft - camera.x, y + waterOffset - camera.y],
                size: [tileRight - tileLeft, segmentH],
                transparency: 0.5
            });
        }
        LC.ctx.restore();
    }

    drawRiverShoreline(staticViewRect, getRiverBoundsAtY, getRiverBoundsAtX, riverTop, riverBottom, riverBulgeStep);
    drawRiverShorelineHorizontal(staticViewRect, getRiverBoundsAtX, getRiverBoundsAtY, riverBulgeStep);
    drawStaticRiverBridges(staticViewRect);
    drawOutsideMapOverlay(staticViewRect);
}

function drawStaticRiverBridges(viewRect) {
    const cfg = dataMap.STRUCTURES?.['1'] || {};
    const bridgeHalfHeight = Math.max(10, Math.floor(cfg.bridgeHalfHeight || 70));
    const diagonalBridgeHalfWidth = Math.max(8, Math.floor(cfg.diagonalBridgeHalfWidth || bridgeHalfHeight));
    const bridgeCount = Math.max(1, Math.floor(cfg.bridgeCount || 5));
    const centerBridgeIndex = Math.ceil(bridgeCount / 2);
    const bridgeThickness = bridgeHalfHeight * 2;
    const vRiverStartX = MAP_SIZE[0] * 0.47;
    const vRiverEndX = MAP_SIZE[0] * 0.53;
    const vBridgeWidth = vRiverEndX - vRiverStartX;
    const hRiverStartY = MAP_SIZE[1] * 0.47;
    const hRiverEndY = MAP_SIZE[1] * 0.53;
    const hBridgeHeight = hRiverEndY - hRiverStartY;
    const segmentHeight = MAP_SIZE[1] / (bridgeCount + 1);
    const segmentWidth = MAP_SIZE[0] / (bridgeCount + 1);
    const safeZoneRadius = Math.max(1, Math.floor(cfg.radius || cfg.safeZoneHalfSize || 500));
    const diagonalBridgeSegments = getCenterDiagonalBridgeSegments(MAP_SIZE, safeZoneRadius, { landPad: 24, step: 8 });

    const drawPlankBridge = (x, y, width, height, orientation = 'horizontal') => {
        const plankGap = 2;
        if (orientation === 'horizontal') {
            const plankW = Math.max(12, Math.floor(height * 0.28));
            let plankIdx = 0;
            for (let px = x; px < x + width; px += (plankW + plankGap)) {
                const segW = Math.min(plankW, (x + width) - px);
                const wobble = (((plankIdx % 2) === 0) ? -1 : 1) * (0.02 + ((plankIdx % 3) * 0.006));
                const drawW = height;
                const drawH = segW;
                const rotateOffset = (drawW - drawH) * 0.5;
                LC.drawImage({
                    name: 'plank',
                    // Rotate source texture so vertical planks keep the same wood grain style as horizontal planks.
                    pos: [px - rotateOffset - camera.x, y + rotateOffset - camera.y],
                    size: [drawW, drawH],
                    rotation: (Math.PI / 2) + wobble
                });
                plankIdx++;
            }
            return;
        }

        const plankH = Math.max(12, Math.floor(width * 0.28));
        let plankIdx = 0;
        for (let py = y; py < y + height; py += (plankH + plankGap)) {
            const segH = Math.min(plankH, (y + height) - py);
            const wobble = (((plankIdx % 2) === 0) ? -1 : 1) * (0.02 + ((plankIdx % 3) * 0.006));
            LC.drawImage({
                name: 'plank',
                pos: [x - camera.x, py - camera.y],
                size: [width, segH],
                rotation: wobble
            });
            plankIdx++;
        }
    };

    const drawDiagonalPlankBridge = (x1, y1, x2, y2, halfWidth) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) return;

        const nx = dx / length;
        const ny = dy / length;
        const width = halfWidth * 2;
        const plankGap = 2;
        const plankAlong = Math.max(12, Math.floor(width * 0.28));
        const plankRotationBase = Math.atan2(dy, dx) + (Math.PI / 2);
        let plankIdx = 0;

        for (let t = 0; t < length; t += (plankAlong + plankGap)) {
            const segLen = Math.min(plankAlong, length - t);
            const centerDist = t + (segLen * 0.5);
            const cx = x1 + (nx * centerDist);
            const cy = y1 + (ny * centerDist);
            const wobble = (((plankIdx % 2) === 0) ? -1 : 1) * (0.02 + ((plankIdx % 3) * 0.006));
            LC.drawImage({
                name: 'plank',
                pos: [cx - (width * 0.5) - camera.x, cy - (segLen * 0.5) - camera.y],
                size: [width, segLen],
                rotation: plankRotationBase + wobble
            });
            plankIdx++;
        }
    };

    // Left-right bridges across the vertical river.
    for (let i = 1; i <= bridgeCount; i++) {
        if (i === centerBridgeIndex) continue;
        const bridgeCenterY = segmentHeight * i;
        const bridgeTop = bridgeCenterY - bridgeHalfHeight;
        if (!isRectVisible(vRiverStartX, bridgeTop, vBridgeWidth, bridgeThickness, viewRect)) continue;
        drawPlankBridge(vRiverStartX, bridgeTop, vBridgeWidth, bridgeThickness, 'horizontal');
    }

    // Up-down bridges across the horizontal river.
    for (let i = 1; i <= bridgeCount; i++) {
        if (i === centerBridgeIndex) continue;
        const bridgeCenterX = segmentWidth * i;
        const bridgeLeft = bridgeCenterX - bridgeHalfHeight;
        if (!isRectVisible(bridgeLeft, hRiverStartY, bridgeThickness, hBridgeHeight, viewRect)) continue;
        drawPlankBridge(bridgeLeft, hRiverStartY, bridgeThickness, hBridgeHeight, 'vertical');
    }

    // Four diagonal connectors from center base edge to nearby ledges.
    for (let i = 0; i < diagonalBridgeSegments.length; i++) {
        const seg = diagonalBridgeSegments[i];
        const minX = Math.min(seg.x1, seg.x2) - diagonalBridgeHalfWidth;
        const minY = Math.min(seg.y1, seg.y2) - diagonalBridgeHalfWidth;
        const maxX = Math.max(seg.x1, seg.x2) + diagonalBridgeHalfWidth;
        const maxY = Math.max(seg.y1, seg.y2) + diagonalBridgeHalfWidth;
        if (!isRectVisible(minX, minY, maxX - minX, maxY - minY, viewRect)) continue;
        drawDiagonalPlankBridge(seg.x1, seg.y1, seg.x2, seg.y2, diagonalBridgeHalfWidth);
    }
}

function drawRiverShoreline(viewRect, getRiverBoundsAtY, getRiverBoundsAtX, riverTop, riverBottom, stepSize) {
    const riverLeft = MAP_SIZE[0] * 0.47;
    const riverRight = MAP_SIZE[0] * 0.53;
    const shoreWidth = 16;
    const dirtY = -MAP_SIZE[1] / 2;
    const dirtHeight = MAP_SIZE[1] * 2 + 2500;
    const bulgeRadius = 1400;
    const minLeft = riverLeft - bulgeRadius - shoreWidth;
    const maxRight = riverRight + bulgeRadius + shoreWidth;
    if (!isRectVisible(minLeft, dirtY, maxRight - minLeft, dirtHeight, viewRect)) return;

    const visibleTop = Math.max(dirtY, viewRect.top);
    const visibleBottom = Math.min(dirtY + dirtHeight, viewRect.bottom);
    if (visibleBottom <= visibleTop) return;

    const step = 20;
    const snappedTop = Math.max(riverTop, Math.floor((visibleTop - riverTop) / step) * step + riverTop);
    const snappedBottom = Math.min(riverBottom, Math.ceil((visibleBottom - riverTop) / step) * step + riverTop);

    const buildSidePath = (side) => {
        const path = new Path2D();
        let hasActive = false;
        for (let y = snappedTop; y <= snappedBottom; y += step) {
            const bounds = getRiverBoundsAtY ? getRiverBoundsAtY(y) : { left: riverLeft, right: riverRight };
            const rawX = (side === 'left' ? bounds.left : bounds.right);
            let skip = false;
            if (typeof getRiverBoundsAtX === 'function') {
                const hBounds = getRiverBoundsAtX(rawX);
                if (y > hBounds.top && y < hBounds.bottom) skip = true;
            }
            if (skip) {
                hasActive = false;
                continue;
            }
            const x = rawX - camera.x;
            const sy = y - camera.y;
            if (!hasActive) {
                path.moveTo(x, sy);
                hasActive = true;
            } else {
                path.lineTo(x, sy);
            }
        }
        return path;
    };

    LC.ctx.save();
    LC.ctx.lineJoin = 'round';
    LC.ctx.lineCap = 'round';

    const leftPath = buildSidePath('left');
    const rightPath = buildSidePath('right');

    LC.ctx.strokeStyle = 'rgba(118, 83, 46, 0.97)';
    LC.ctx.lineWidth = shoreWidth * 2;
    LC.ctx.stroke(leftPath);
    LC.ctx.stroke(rightPath);

    // Dotted soil texture along the curved shore.
    LC.ctx.restore();
}

function drawRiverShorelineHorizontal(viewRect, getRiverBoundsAtX, getRiverBoundsAtY, stepSize) {
    const riverTop = MAP_SIZE[1] * 0.47;
    const riverBottom = MAP_SIZE[1] * 0.53;
    const shoreWidth = 16;
    const dirtX = -MAP_SIZE[0] / 2;
    const dirtW = MAP_SIZE[0] * 2 + 2500;
    const bulgeRadius = 1400;
    const minTop = riverTop - bulgeRadius - shoreWidth;
    const maxBottom = riverBottom + bulgeRadius + shoreWidth;
    if (!isRectVisible(dirtX, minTop, dirtW, maxBottom - minTop, viewRect)) return;

    const visibleLeft = Math.max(dirtX, viewRect.left);
    const visibleRight = Math.min(dirtX + dirtW, viewRect.right);
    if (visibleRight <= visibleLeft) return;

    const step = 20;
    const snappedLeft = Math.floor(visibleLeft / step) * step;
    const snappedRight = Math.ceil(visibleRight / step) * step;

    const buildSidePath = (side) => {
        const path = new Path2D();
        let hasActive = false;
        for (let xw = snappedLeft; xw <= snappedRight; xw += step) {
            const bounds = getRiverBoundsAtX ? getRiverBoundsAtX(xw) : { top: riverTop, bottom: riverBottom };
            const rawY = (side === 'top' ? bounds.top : bounds.bottom);
            let skip = false;
            if (typeof getRiverBoundsAtY === 'function') {
                const vBounds = getRiverBoundsAtY(rawY);
                if (xw > vBounds.left && xw < vBounds.right) skip = true;
            }
            if (skip) {
                hasActive = false;
                continue;
            }
            const y = rawY - camera.y;
            const sx = xw - camera.x;
            if (!hasActive) {
                path.moveTo(sx, y);
                hasActive = true;
            } else {
                path.lineTo(sx, y);
            }
        }
        return path;
    };

    LC.ctx.save();
    LC.ctx.lineJoin = 'round';
    LC.ctx.lineCap = 'round';

    const topPath = buildSidePath('top');
    const bottomPath = buildSidePath('bottom');

    LC.ctx.strokeStyle = 'rgba(118, 83, 46, 0.97)';
    LC.ctx.lineWidth = shoreWidth * 2;
    LC.ctx.stroke(topPath);
    LC.ctx.stroke(bottomPath);

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

function drawBlindnessOverlays() {
    if (!blindnessOverlays.length) return;
    const now = performance.now();
    let maxAlpha = 0;

    for (let i = blindnessOverlays.length - 1; i >= 0; i--) {
        const fx = blindnessOverlays[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            removeUnordered(blindnessOverlays, i);
            continue;
        }
        const elapsed = now - fx.startTime;
        const hold = Math.max(0, fx.holdMs || 0);
        const fade = Math.max(1, fx.fadeMs || 1);
        let alpha;
        if (elapsed <= hold) {
            alpha = fx.maxAlpha;
        } else {
            const ft = Math.max(0, Math.min(1, (elapsed - hold) / fade));
            alpha = fx.maxAlpha * (1 - ft);
        }
        if (alpha > maxAlpha) maxAlpha = alpha;
    }

    if (maxAlpha <= 0) return;
    LC.ctx.save();
    LC.ctx.fillStyle = `rgba(0, 0, 0, ${maxAlpha})`;
    LC.ctx.fillRect(0, 0, LC.width, LC.height);
    LC.ctx.font = '800 20px Inter, sans-serif';
    LC.ctx.textAlign = 'center';
    LC.ctx.textBaseline = 'middle';
    LC.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    LC.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    LC.ctx.shadowBlur = 8;
    LC.ctx.fillText("YOU'VE BEEN TEMPORARILY BLINDED!", LC.width / 2, LC.height / 2);
    LC.ctx.restore();
}

function drawBossIntroCountdown() {
    const now = performance.now();
    const remainingMs = Math.max(0, Vars.bossIntroCountdownUntil - now);
    if (remainingMs <= 0) return;

    const totalMs = Math.max(1, Vars.bossIntroCountdownDurationMs || remainingMs);
    const elapsedMs = Math.max(0, totalMs - remainingMs);
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    const digitAgeMs = elapsedMs % 1000;
    const popT = Math.max(0, Math.min(1, 1 - (digitAgeMs / 180)));
    const popEase = 1 - Math.pow(1 - popT, 3);
    const scale = 1 + (popEase * 0.22);
    const fontSize = Math.round(Math.max(92, Math.min(180, Math.min(LC.width, LC.height) * 0.22)));

    LC.ctx.save();
    LC.ctx.textAlign = 'center';
    LC.ctx.textBaseline = 'middle';
    LC.ctx.translate(centerX, centerY);
    LC.ctx.scale(scale, scale);
    LC.ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    LC.ctx.shadowBlur = 26;
    LC.ctx.shadowOffsetY = 5;
    LC.ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
    LC.ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    LC.ctx.fillText(String(seconds), 0, 0);
    LC.ctx.restore();
}

function getNearestRootWalkerDistance(localPlayer) {
    if (!localPlayer?.isAlive) return Infinity;
    let nearest = Infinity;
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== 7) continue;
        const dx = mob.x - localPlayer.x;
        const dy = mob.y - localPlayer.y;
        const dist = Math.sqrt((dx * dx) + (dy * dy)) - Math.max(0, mob.radius || 0);
        if (dist < nearest) nearest = dist;
    }
    return nearest;
}

function drawRootWalkerDreadOverlay(localPlayer) {
    const nearestDistance = getNearestRootWalkerDistance(localPlayer);
    const fadeStartDistance = 2200;
    const fullEffectDistance = 140;
    let targetStrength = 0;
    if (Number.isFinite(nearestDistance) && nearestDistance < fadeStartDistance) {
        const normalized = 1 - Math.max(0, Math.min(1, nearestDistance / fadeStartDistance));
        const fullNormalized = 1 - Math.max(0, Math.min(1, fullEffectDistance / fadeStartDistance));
        targetStrength = fullNormalized > 0
            ? Math.max(0, Math.min(1, normalized / fullNormalized))
            : 1;
        targetStrength = targetStrength * targetStrength * (3 - (2 * targetStrength));
    }
    rootWalkerDreadStrength += (targetStrength - rootWalkerDreadStrength) * 0.12;
    const eased = rootWalkerDreadStrength;
    if (eased <= 0.001) return;

    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    const outerRadius = Math.max(LC.width, LC.height) * 0.8;
    const innerRadius = Math.max(120, outerRadius * (0.52 - eased * 0.16));

    LC.ctx.save();

    const viewAlpha = 0.06 + (eased * 0.24);
    LC.ctx.fillStyle = `rgba(0, 0, 0, ${viewAlpha})`;
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    const vignette = LC.ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.55, `rgba(0, 0, 0, ${0.10 + eased * 0.16})`);
    vignette.addColorStop(1, `rgba(0, 0, 0, ${0.32 + eased * 0.42})`);
    LC.ctx.fillStyle = vignette;
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    LC.ctx.restore();
}

function drawBossPortalOverlay(localPlayer) {
    const now = performance.now();
    let activePortal = null;
    let nearestDistSq = Math.max(1, dataMap.STRUCTURES?.[5]?.radius || 90);
    nearestDistSq *= nearestDistSq;

    if (localPlayer?.isAlive) {
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure || structure.type !== 5) continue;
            const dx = structure.x - localPlayer.x;
            const dy = structure.y - localPlayer.y;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq > nearestDistSq) continue;
            activePortal = structure;
            nearestDistSq = distSq;
        }
    }

    let targetStrength = 0;
    if (activePortal) {
        if (rootWalkerPortalOverlay.portalId !== activePortal.id) {
            rootWalkerPortalOverlay.portalId = activePortal.id;
            rootWalkerPortalOverlay.enteredAt = now;
        } else if (!rootWalkerPortalOverlay.enteredAt) {
            rootWalkerPortalOverlay.enteredAt = now;
        }
        const progress = Math.max(0, Math.min(1, (now - rootWalkerPortalOverlay.enteredAt) / 3000));
        targetStrength = progress * progress * (3 - (2 * progress));
    } else {
        rootWalkerPortalOverlay.portalId = 0;
        rootWalkerPortalOverlay.enteredAt = 0;
    }

    const smoothing = activePortal ? 0.14 : 0.08;
    rootWalkerPortalOverlay.strength += (targetStrength - rootWalkerPortalOverlay.strength) * smoothing;
    if (rootWalkerPortalOverlay.strength <= 0.002 && !activePortal) {
        rootWalkerPortalOverlay.strength = 0;
        return;
    }

    const alpha = Math.max(0, Math.min(0.92, rootWalkerPortalOverlay.strength * 0.92));
    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    const outerRadius = Math.max(LC.width, LC.height) * 0.9;
    const innerRadius = Math.max(80, outerRadius * (0.54 - (rootWalkerPortalOverlay.strength * 0.26)));
    const pulse = 0.9 + (Math.sin(now * 0.01) * 0.1);

    LC.ctx.save();
    LC.ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.55})`;
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    const vignette = LC.ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
    vignette.addColorStop(0, `rgba(0, 0, 0, ${alpha * 0.04})`);
    vignette.addColorStop(0.45, `rgba(0, 0, 0, ${alpha * 0.28})`);
    vignette.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
    LC.ctx.fillStyle = vignette;
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    LC.ctx.strokeStyle = `rgba(22, 14, 30, ${alpha * 0.55})`;
    LC.ctx.lineWidth = 26 * pulse;
    LC.ctx.beginPath();
    LC.ctx.arc(centerX, centerY, Math.max(56, innerRadius - 18), 0, Math.PI * 2);
    LC.ctx.stroke();
    LC.ctx.restore();
}

function setElementDisplay(el, display) {
    if (el && el.style.display !== display) {
        el.style.display = display;
    }
}

function hideDeathMenu(el) {
    if (!el) return;
    el.classList.remove('visible');
    setElementDisplay(el, 'none');
}

function showDeathMenuWithFade(el) {
    if (!el) return;
    if (el.style.display !== 'flex') {
        el.classList.remove('visible');
        setElementDisplay(el, 'flex');
        return;
    }
    if (!el.classList.contains('visible')) {
        el.classList.add('visible');
    }
}

function setElementSize(el, widthPx, heightPx) {
    if (!el) return;
    const nextWidth = `${Math.round(widthPx)}px`;
    const nextHeight = `${Math.round(heightPx)}px`;
    if (el.style.width !== nextWidth) el.style.width = nextWidth;
    if (el.style.height !== nextHeight) el.style.height = nextHeight;
}

function render(frameTime = performance.now()) {
    if (disconnectedState.active) {
        LC.clearCanvas();
        drawDisconnectedScreen();
        requestAnimationFrame(render);
        return;
    }

    if (loadingState.active) {
        LC.clearCanvas();
        drawLoadingScreen();
        if (loadingState.connected && loadingState.loadedAssets === loadingState.totalAssets && !loadingState.fadeOut) {
            setTimeout(() => loadingState.fadeOut = true, 500);
        }
        requestAnimationFrame(render);
        return;
    }

    if ((frameTime - lastGameplayRenderAt) < gameplayRenderIntervalMs()) {
        requestAnimationFrame(render);
        return;
    }
    lastGameplayRenderAt = frameTime;

    const localPlayer = ENTITIES.PLAYERS[Vars.myId];
    ensureGameHudVisible();

    // Updates
    updateClientEntities();
    const focusState = getCameraFocusState(localPlayer);
    updateZoom(localPlayer, focusState);
    updateCamera(localPlayer, focusState);
    const { x: mouseScreenX, y: mouseScreenY } = LC.clientToLogical(Vars.mouseX, Vars.mouseY);
    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    Vars.mouseWorldX = camera.x + centerX + ((mouseScreenX - centerX) / Math.max(0.001, LC.zoom));
    Vars.mouseWorldY = camera.y + centerY + ((mouseScreenY - centerY) / Math.max(0.001, LC.zoom));
    const staticViewRect = getCameraViewRect(getStaticWorldCullMargin());

    // Drawing
    LC.clearCanvas();
    LC.ctx.save();
    LC.ctx.translate(LC.width / 2, LC.height / 2);
    LC.ctx.scale(LC.zoom, LC.zoom);
    LC.ctx.translate(-LC.width / 2, -LC.height / 2);
    LC.setImageScale((LC.scaleX || 1) * LC.zoom, (LC.scaleY || 1) * LC.zoom);

    drawBackground();
    if (Settings.renderGrid) drawGrid(localPlayer);

    // Entities (Z-ordering implied by draw order)
    visibleTreeRenderQueue.length = 0;
    visibleRockRenderQueue.length = 0;
    forEachEntity(ENTITIES.STRUCTURES, structure => {
        if (!isCircleVisible(structure.x, structure.y, structure.radius || 0, staticViewRect)) return;
        if (structure.type === 3) {
            visibleTreeRenderQueue.push(structure);
            return;
        }
        if (isRockStructureType(structure.type)) {
            visibleRockRenderQueue.push(structure);
            return;
        }
        structure.draw();
    });
    drawSeededChestCoins();
    forEachEntity(ENTITIES.OBJECTS, entity => {
        if (!isCircleVisible(entity.x, entity.y, getEntityCullRadius(entity), staticViewRect)) return;
        entity.draw();
    });
    const isBossMob = entity => entity?.type === 7 || entity?.type === 8 || entity?.type === 16 || entity?.type === 17;
    forEachEntity(ENTITIES.MOBS, entity => {
        if (isBossMob(entity)) return;
        if (!isCircleVisible(entity.x, entity.y, getEntityCullRadius(entity), staticViewRect)) return;
        entity.draw();
    });
    forEachEntity(ENTITIES.MOBS, entity => {
        if (!isBossMob(entity)) return;
        if (!isCircleVisible(entity.x, entity.y, getEntityCullRadius(entity), staticViewRect)) return;
        entity.draw();
    });
    for (let i = 0; i < visibleRockRenderQueue.length; i++) {
        visibleRockRenderQueue[i].draw();
    }
    forEachEntity(ENTITIES.PROJECTILES, entity => {
        if (!isCircleVisible(entity.x, entity.y, getEntityCullRadius(entity), staticViewRect)) return;
        entity.draw();
    });
    drawMobDeathFades();
    drawIntimidationAoeEffects();
    drawPoisonAoeEffects();
    drawSmokeAoeEffects();
    drawEnergyBurstEffects();
    drawInfernoBeamEffects();
    drawLightningShotEffects();
    drawCoinPickupEffects();
    forEachEntity(ENTITIES.PLAYERS, entity => {
        if (!isCircleVisible(entity.x, entity.y, getEntityCullRadius(entity), staticViewRect)) return;
        entity.draw();
    });
    drawHeartMistEffects();
    drawDamageIndicators();

    // Draw trees with transparency layering (after players so they appear on top)
    for (let i = 0; i < visibleTreeRenderQueue.length; i++) {
        const tree = visibleTreeRenderQueue[i];
        const screenPosX = tree.x - camera.x;
        const screenPosY = tree.y - camera.y;
        const hoverDx = Vars.mouseWorldX - tree.x;
        const hoverDy = Vars.mouseWorldY - tree.y;
        const isHoveringTree = (hoverDx * hoverDx + hoverDy * hoverDy) <= ((tree.radius + 12) * (tree.radius + 12));

        // Check if local player is colliding with this tree
        const dx = (localPlayer?.x ?? tree.x) - tree.x;
        const dy = (localPlayer?.y ?? tree.y) - tree.y;
        const combinedRadius = (localPlayer?.radius || 0) + tree.radius;
        const isPlayerInTree = ((dx * dx) + (dy * dy)) < (combinedRadius * combinedRadius);

        LC.drawImageFast(
            getStructureImageName(tree.type, tree.x, tree.y, MAP_SIZE, tree.world || CURRENT_WORLD),
            screenPosX - tree.radius,
            screenPosY - tree.radius,
            tree.radius * 2,
            tree.radius * 2,
            0,
            isPlayerInTree ? 0.5 : 1
        );
        if (Settings.debugMode && isHoveringTree) {
            const idText = `(${tree.id})`;
            const idMetrics = LC.measureText({ text: idText, font: 'bold 15px Arial' });
            LC.drawText({
                text: idText,
                pos: [screenPosX - (idMetrics.width / 2), screenPosY - tree.radius - 10],
                color: 'lightgray',
                font: 'bold 15px Arial'
            });
        }
        if (Settings.drawHitboxes) {
            LC.drawCircleFast(screenPosX, screenPosY, tree.radius, 'blue', 0.2, true, true, null, 3);
        }
    }

    // Keep the shrine placement prompt in world-space, but above world entities.
    drawBossShrineIndicator(localPlayer, staticViewRect);

    LC.ctx.restore();
    LC.setImageScale(LC.scaleX || 1, LC.scaleY || 1);
    // UI & Overlays
    updateHUD(localPlayer);
    const hudAlpha = getBossIntroHudAlpha();
    if (hudAlpha > 0.001) {
        LC.ctx.save();
        LC.ctx.globalAlpha *= hudAlpha;
        drawFPS();
        LC.ctx.restore();
    }
    drawRootWalkerDreadOverlay(localPlayer);
    if (hudAlpha > 0.001) {
        LC.ctx.save();
        LC.ctx.globalAlpha *= hudAlpha;
        drawBossPortalOverlay(localPlayer);
        LC.ctx.restore();
    }
    drawBlindnessOverlays();
    drawBossIntroCountdown();

    requestAnimationFrame(render);
}

function drawTiledImageInRect(name, worldX, worldY, width, height, tileSize, viewRect, transparency = 1) {
    if (tileSize <= 0 || width <= 0 || height <= 0) return;
    if (!isRectVisible(worldX, worldY, width, height, viewRect)) return;

    // Anchor tile origin to the global grid, not the biome edge.
    // This prevents phase-jumps when crossing non-grid-aligned biome boundaries.
    const startX = Math.floor(Math.max(viewRect.left, worldX) / tileSize) * tileSize;
    const startY = Math.floor(Math.max(viewRect.top, worldY) / tileSize) * tileSize;
    const endX = Math.min(worldX + width, viewRect.right + tileSize);
    const endY = Math.min(worldY + height, viewRect.bottom + tileSize);

    const screenX = worldX - camera.x;
    const screenY = worldY - camera.y;
    LC.ctx.save();
    const prevSmoothing = LC.ctx.imageSmoothingEnabled;
    // Prevent sub-pixel filtering seams between repeated terrain tiles.
    LC.ctx.imageSmoothingEnabled = false;
    LC.ctx.beginPath();
    LC.ctx.rect(screenX, screenY, width, height);
    LC.ctx.clip();

    for (let x = startX; x < endX; x += tileSize) {
        for (let y = startY; y < endY; y += tileSize) {
            LC.drawImage({
                name,
                // Keep tiles edge-aligned in world space; overlap with alpha causes visible grid lines.
                pos: [x - camera.x, y - camera.y],
                size: [tileSize, tileSize],
                transparency
            });
        }
    }
    LC.ctx.imageSmoothingEnabled = prevSmoothing;
    LC.ctx.restore();
}

function drawRectInWorld(color, worldX, worldY, width, height, viewRect) {
    if (width <= 0 || height <= 0) return;
    if (!isRectVisible(worldX, worldY, width, height, viewRect)) return;

    LC.ctx.save();
    LC.ctx.fillStyle = color;
    LC.ctx.fillRect(worldX - camera.x, worldY - camera.y, width, height);
    LC.ctx.restore();
}

function drawSingleImageInRect(name, worldX, worldY, width, height, viewRect, transparency = 1) {
    if (width <= 0 || height <= 0) return;
    if (!isRectVisible(worldX, worldY, width, height, viewRect)) return;

    const screenX = worldX - camera.x;
    const screenY = worldY - camera.y;
    LC.ctx.save();
    LC.ctx.beginPath();
    LC.ctx.rect(screenX, screenY, width, height);
    LC.ctx.clip();
    LC.drawImage({
        name,
        pos: [screenX, screenY],
        size: [width, height],
        transparency
    });
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

function getEntityCullRadius(entity) {
    if (!entity) return 0;
    const baseRadius = Math.max(0, Number(entity.radius) || 0);
    const renderLength = Math.max(0, Number(entity.renderLength) || 0);
    return Math.max(baseRadius, renderLength * 0.5, 24);
}

function drawFPS() {
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    if (!uiRefs.homeScreen && homeScreen) uiRefs.homeScreen = homeScreen;
    if (homeScreen?.classList?.contains('unblurred')) return;

    LC.drawText({
        text: `${TPS.clientReal} FPS`,
        pos: [15, LC.height - 15],
        font: '600 14px Inter, sans-serif',
        color: isLocalPlayerInSnowBiome() ? 'rgba(55, 65, 81, 0.82)' : 'rgba(255, 255, 255, 0.4)',
        textAlign: 'left'
    });
}

function drawDamageIndicators() {
    const now = performance.now();
    const highRov = (Number(Vars.viewRangeMult) || 1) >= 5;
    const viewRect = highRov ? getCameraViewRect(80) : null;
    for (let i = damageIndicators.length - 1; i >= 0; i--) {
        const indicator = damageIndicators[i];
        const elapsed = now - indicator.start;
        const progress = Math.min(1, elapsed / indicator.duration);
        if (progress >= 1) {
            removeUnordered(damageIndicators, i);
            continue;
        }
        if (highRov && !isCircleVisible(indicator.x, indicator.y, 24, viewRect)) {
            continue;
        }
        const transparency = 1 - progress;
        const rise = (indicator.rise || DAMAGE_INDICATOR_RISE) * progress;
        const screenX = indicator.x - camera.x;
        const screenY = indicator.y - camera.y - rise;
        LC.drawTextFast(indicator.text, screenX, screenY, indicator.font || 'bold 16px Inter', indicator.color || '#ff0000', 'center', 'alphabetic', transparency);
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

function getNearbyStructureContext(lp) {
    const context = {
        safeZone: null,
        nearbyBossShrine: null,
        nearbyBossPortal: null
    };
    if (!lp) return context;

    let shrineDistSq = Math.max(1, dataMap.STRUCTURES?.[4]?.radius || 90);
    shrineDistSq *= shrineDistSq;
    let portalDistSq = Math.max(1, dataMap.STRUCTURES?.[5]?.radius || 90);
    portalDistSq *= portalDistSq;
    forEachEntity(ENTITIES.STRUCTURES, (structure) => {
        if (!structure || (structure.world || CURRENT_WORLD) !== CURRENT_WORLD) return;

        if (!context.safeZone && dataMap.STRUCTURES[structure.type]?.isSafeZone) {
            context.safeZone = structure;
        }

        if (structure.type !== 4 && structure.type !== 5 && structure.type !== 8 && structure.type !== 9 && structure.type !== 10) return;
        const dx = structure.x - lp.x;
        const dy = structure.y - lp.y;
        const distSq = dx * dx + dy * dy;

        if ((structure.type === 4 || structure.type === 8 || structure.type === 9 || structure.type === 10) && distSq <= shrineDistSq) {
            context.nearbyBossShrine = structure;
            shrineDistSq = distSq;
            return;
        }

        if (structure.type === 5 && distSq <= portalDistSq) {
            context.nearbyBossPortal = structure;
            portalDistSq = distSq;
        }
    });

    return context;
}

function getBossPortalDimensionName(portal = null) {
    if (CURRENT_WORLD === WORLD_ROOT_DIMENSION) return 'Root Walker Dimension';
    if (CURRENT_WORLD === WORLD_YETI_DIMENSION) return 'Yeti Dimension';
    if (CURRENT_WORLD === WORLD_DUNE_DIMENSION) return 'Dune Dimension';
    if (CURRENT_WORLD === WORLD_INFERNO_DIMENSION) return 'Inferno Dimension';
    if (portal && portal.y >= MAP_SIZE[1] * 0.5 && portal.x < MAP_SIZE[0] * 0.5) return 'Dune Dimension';
    if (portal && portal.y >= MAP_SIZE[1] * 0.5 && portal.x >= MAP_SIZE[0] * 0.5) return 'Inferno Dimension';
    if (portal && portal.x >= MAP_SIZE[0] * 0.5) return 'Yeti Dimension';
    return 'Root Walker Dimension';
}

function suppressBossIntroHudInteractions() {
    keyHintUi.visible = false;
    if (keyHintUi.containerEl) keyHintUi.containerEl.style.display = 'none';
    topBarCanvasState.visible = false;
    topBarCanvasState.buttons = [];
    topBarCanvasState.barRect = null;
    leaderboardCanvasState.toggleRect = null;
    minimapCanvasState.toggleRect = null;
    hudUpgradeHitboxes.length = 0;
    hudUpgradeHeaderHitbox = null;
    topLeftHintState.visible = false;
    clearDragOverlay();
    updateMinimapCoachOverlay(false);
}

function updateHUD(lp) {
    const isAlive = lp?.isAlive;
    const now = performance.now();
    const isDimensionSwitching = now < (uiState.dimensionTransitionUntil || 0);
    const hudAlpha = getBossIntroHudAlpha();
    const selectedItemType = (Vars.myInventory[Vars.selectedSlot] || 0) & 0x7F;
    const selectedItemCount = Vars.myInventoryCounts[Vars.selectedSlot] || 0;
    const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
    const usingMobilePrompt = isMobile || Settings.forceMobileUI;
    const shouldShowMinimapCoach = CURRENT_WORLD === WORLD_MAIN
        && !!isAlive
        && minimapCanvasState.open
        && !hasSeenMinimapCoach()
        && !minimapCoachUi.dismissed;

    minimapCoachUi.active = shouldShowMinimapCoach;
    if (!shouldShowMinimapCoach) updateMinimapCoachOverlay(false);

    updateKeyHintVisibility(isAlive && hudAlpha >= 0.999);
    updateHUDVisibility(isAlive);
    const {
        safeZone,
        nearbyBossShrine,
        nearbyBossPortal
    } = getNearbyStructureContext(lp);
    if (!isAlive && uiState.isSettingsOpen) {
        uiState.isSettingsOpen = false;
    }
    if (!isAlive && uiState.isShopOpen) {
        uiState.isShopOpen = false;
    }
    const inSafeZone = (() => {
        if (!lp || !safeZone) return false;
        if (!safeZone) return false;
        const dx = safeZone.x - lp.x;
        const dy = safeZone.y - lp.y;
        const safeRange = (safeZone.radius || dataMap.STRUCTURES[safeZone.type]?.radius || 0) + (lp.radius || dataMap.PLAYERS.baseRadius || 0) + 2;
        return (dx * dx + dy * dy) <= (safeRange * safeRange);
    })();
    updateShieldUI(lp?.hasShield && inSafeZone);
    if (uiRefs.topBar) {
        uiRefs.topBar.showSettings = CURRENT_WORLD !== WORLD_TUTORIAL;
        uiRefs.topBar.showFullscreen = true;
        uiRefs.topBar.showShop = true;
        if (CURRENT_WORLD === WORLD_TUTORIAL) {
            const shopUnlocked = Vars.tutorialObjectiveStep >= 5;
            uiRefs.topBar.shopDisabled = !shopUnlocked;
        } else {
            uiRefs.topBar.shopDisabled = false;
        }
    }

    const hintEl = uiRefs.topLeftHint || document.getElementById('top_left_hint');
    if (!uiRefs.topLeftHint && hintEl) uiRefs.topLeftHint = hintEl;
    setElementDisplay(hintEl, 'none');
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    const respawnScreen = uiRefs.respawnScreen || document.getElementById('respawn_screen');
    if (!uiRefs.homeScreen && homeScreen) uiRefs.homeScreen = homeScreen;
    if (!uiRefs.respawnScreen && respawnScreen) uiRefs.respawnScreen = respawnScreen;
    const isHome = homeScreen?.style.display !== 'none';
    const isRespawn = respawnScreen?.style.display !== 'none';
    let hintText = '';
    let hintVisible = false;
    if (!isAlive || isHome || isRespawn || CURRENT_WORLD === WORLD_TUTORIAL) {
        upgradeHintActive = false;
        updateMinimapCoachOverlay(false);
    } else {
        if (selectedItemCount > 0 && selectedItemType === goldenSkullType && nearbyBossShrine) {
            hintText = usingMobilePrompt
                ? 'Tap THROW to place the Golden Skull in the shrine!'
                : 'Press E to place the Golden Skull in the shrine!';
            hintVisible = true;
            upgradeHintActive = false;
        } else if (nearbyBossPortal) {
            const isDimensionWorld = CURRENT_WORLD === WORLD_ROOT_DIMENSION || CURRENT_WORLD === WORLD_YETI_DIMENSION || CURRENT_WORLD === WORLD_DUNE_DIMENSION || CURRENT_WORLD === WORLD_INFERNO_DIMENSION;
            const dimensionName = getBossPortalDimensionName(nearbyBossPortal);
            if (isDimensionWorld) {
                hintText = 'Stand in the portal for 3 seconds to return to the main world!';
            } else {
                const blockMessage = getBossPortalEntryBlockMessage({
                    score: lp?.score,
                    inventory: Vars.myInventory,
                    inventoryCounts: Vars.myInventoryCounts
                });
                if (blockMessage) {
                    hintText = blockMessage;
                } else {
                    hintText = `Stand in the portal for 3 seconds to enter the ${dimensionName}!`;
                }
            }
            hintVisible = true;
            upgradeHintActive = true;
        } else {
            let bestRank = 0;
            for (let i = 0; i < Vars.myInventory.length; i++) {
                if (Vars.myInventoryCounts[i] <= 0) continue;
                const rank = Vars.myInventory[i] & 0x7F;
                if (isWeaponRank(rank) && isWeaponTypeStronger(rank, bestRank)) bestRank = rank;
            }
            const coins = Vars.myStats.goldCoins || 0;
            let hasAffordableUpgrade = false;
            for (const item of dataMap.SHOP_ITEMS) {
                if (!isWeaponTypeStronger(item.id, bestRank)) continue;
                if (coins >= item.price) {
                    hasAffordableUpgrade = true;
                    break;
                }
            }
            const score = Math.max(0, Math.floor(lp?.score || 0));
            const availablePoints = Math.max(0, Math.floor(Vars.myStats.availablePoints || 0));
            const hasUpgraded = hasUpgradedStats;
            if (!hasUpgraded && availablePoints >= 3) {
                hintText = 'You have some upgrade points, you can use them to upgrade your players stats!';
                hintVisible = true;
                upgradeHintActive = true;
            } else if (bestRank < 2 && !hasAffordableUpgrade) {
                hintText = 'You need to break chests & collect more coins!';
                hintVisible = true;
                upgradeHintActive = false;
            } else if (hasAffordableUpgrade) {
                hintText = 'You have enough coins to buy a better weapon, check the shop!';
                hintVisible = true;
                upgradeHintActive = false;
            } else if (score < BOSS_PORTAL_MIN_SCORE) {
                const remaining = Math.max(0, BOSS_PORTAL_MIN_SCORE - score);
                hintText = `You need ${remaining.toLocaleString()} more xp before you can fight other players!`;
                hintVisible = true;
                upgradeHintActive = false;
            } else {
                upgradeHintActive = false;
            }
        }
    }
    topLeftHintState.visible = hintVisible;
    topLeftHintState.text = hintText;

    if (!uiRefs.topBar?.visible) {
        topBarCanvasState.visible = false;
        topBarCanvasState.buttons = [];
    }

    if (isDimensionSwitching) {
        leaderboardCanvasState.toggleRect = null;
        minimapCanvasState.toggleRect = null;
        setElementDisplay(homeScreen, 'none');
        setElementDisplay(respawnScreen, 'none');
        updateHomeOnlineCount(false);
        return;
    }

    if (uiState.pendingJoin) {
        if (isAlive) {
            uiState.pendingJoin = false;
            uiState.pendingJoinStartedAt = 0;
        } else if (now - (uiState.pendingJoinStartedAt || now) <= JOIN_ACK_TIMEOUT_MS) {
            leaderboardCanvasState.toggleRect = null;
            minimapCanvasState.toggleRect = null;
            updateMinimapCoachOverlay(false);
            clearDragOverlay();
            hudUpgradeHitboxes.length = 0;
            hudUpgradeHeaderHitbox = null;
            updateHomeOnlineCount(homeScreen?.style.display !== 'none');
            updateJoinButton();
            updateRespawnButton();
            return;
        } else {
            uiState.pendingJoin = false;
            uiState.pendingJoinStartedAt = 0;
        }
    }

    if (uiState.pendingPause) {
        if (!isAlive) {
            uiState.pendingPause = false;
            uiState.pendingPauseStartedAt = 0;
            uiState.forceHomeScreen = true;
        } else if (now - (uiState.pendingPauseStartedAt || now) > PAUSE_ACK_TIMEOUT_MS) {
            uiState.pendingPause = false;
            uiState.pendingPauseStartedAt = 0;
            uiState.isPaused = false;
            Vars.pauseSpectateStartAt = 0;
        }
    }

    if (uiState.forceHomeScreen) {
        leaderboardCanvasState.toggleRect = null;
        minimapCanvasState.toggleRect = null;
        updateMinimapCoachOverlay(false);
        clearDragOverlay();
        hudUpgradeHitboxes.length = 0;
        hudUpgradeHeaderHitbox = null;
        closeHomeScreenBlockingUI();
        updateTutorialGuidedShopFocus(tutorialCtx);
        setElementDisplay(homeScreen, 'flex');
        setElementDisplay(respawnScreen, 'none');
        updateHomeOnlineCount(true);
        updateJoinButton();
        return;
    }

    if (!isAlive) {
        leaderboardCanvasState.toggleRect = null;
        minimapCanvasState.toggleRect = null;
        updateMinimapCoachOverlay(false);
        hudUpgradeHitboxes.length = 0;
        hudUpgradeHeaderHitbox = null;
        updateTutorialGuidedShopFocus(tutorialCtx);
        const shouldShowRespawn = !uiState.forceHomeScreen && (Vars.lastDiedTime > 0);
        if (shouldShowRespawn) {
            setElementDisplay(homeScreen, 'none');
            if ((performance.now() - Vars.lastDiedTime) >= DEATH_MENU_DELAY_MS) {
                showDeathMenuWithFade(respawnScreen);
            } else {
                hideDeathMenu(respawnScreen);
            }
            updateHomeOnlineCount(false);
            updateRespawnButton();
        } else {
            hideDeathMenu(respawnScreen);
            closeHomeScreenBlockingUI();
            setElementDisplay(homeScreen, 'flex');
            updateHomeOnlineCount(true);
            updateJoinButton();
        }
    } else {
        setElementDisplay(homeScreen, 'none');
        hideDeathMenu(respawnScreen);
        uiState.forceHomeScreen = false;
        updateHomeOnlineCount(false);
        if (hudAlpha <= 0.001) {
            suppressBossIntroHudInteractions();
            return;
        }
        LC.ctx.save();
        LC.ctx.globalAlpha *= hudAlpha;
        drawInfoBox(lp);
        drawLeaderboard();
        drawMinimap();
        drawKillCounter();
        drawUpgradeBars();
        drawInCombatLabel();
        drawTutorialObjective(tutorialCtx);
        drawTutorialTargetIndicator(tutorialCtx);
        drawHotbar();
        drawInventory();
        if (isMobile || Settings.forceMobileUI) drawMobileButtons(lp);
        drawTopLeftBarButtons();
        drawTopLeftHint();
        drawChatOverlay();
        drawDraggedItem();
        LC.ctx.restore();
        updateTutorialGuidedShopFocus(tutorialCtx);
        updateMinimapCoachOverlay(hudAlpha >= 0.999 && minimapCoachUi.active);
    }
}

function drawTopLeftBarButtons() {
    const state = uiRefs.topBar;
    const topLeftBar = uiRefs.topLeftBar || document.getElementById('top_left_bar');
    if (!uiRefs.topLeftBar && topLeftBar) uiRefs.topLeftBar = topLeftBar;
    if (!state?.visible) {
        topBarCanvasState.visible = false;
        topBarCanvasState.buttons = [];
        topBarCanvasState.barRect = null;
        setElementDisplay(topLeftBar, 'none');
        return;
    }

    const buttons = [];
    if (state.showPause) buttons.push({ id: 'pause', img: 'pause_button', scale: 0.75 });
    if (state.showChat) buttons.push({ id: 'chat', img: 'chat_button', scale: 1 });
    if (state.showSettings) buttons.push({ id: 'settings', img: 'settings_gear', scale: 1 });
    if (state.showFullscreen) buttons.push({ id: 'fullscreen', img: 'fullscreen_button', scale: 1 });
    if (state.showShop) buttons.push({ id: 'shop', img: 'shopping_cart', scale: 1, disabled: !!state.shopDisabled });

    if (!buttons.length) {
        topBarCanvasState.visible = false;
        topBarCanvasState.buttons = [];
        topBarCanvasState.barRect = null;
        setElementDisplay(topLeftBar, 'none');
        return;
    }

    const viewportW = window.innerWidth || LC.width;
    let top = TOP_BAR_CONFIG.top;
    let padding = TOP_BAR_CONFIG.padding;
    let gap = TOP_BAR_CONFIG.gap;
    let buttonSize = TOP_BAR_CONFIG.buttonSize;
    if (viewportW <= 480) {
        top = 8;
        padding = 5;
        gap = 5;
        buttonSize = 30;
    } else if (viewportW <= 768) {
        top = 8;
        padding = 6;
        gap = 6;
        buttonSize = 34;
    }

    const barWidth = (padding * 2)
        + (buttons.length * buttonSize)
        + ((buttons.length - 1) * gap);
    const barHeight = (padding * 2) + buttonSize;
    const barX = (LC.width - barWidth) / 2;
    const barY = top;

    if (topLeftBar) {
        setElementDisplay(topLeftBar, 'block');
        setElementSize(topLeftBar, barWidth, barHeight);
    }

    LC.drawRect({
        pos: [barX, barY],
        size: [barWidth, barHeight],
        color: 'rgba(15, 23, 42, 0.55)',
        stroke: 'rgba(255, 255, 255, 0.15)',
        strokeWidth: 1,
        cornerRadius: TOP_BAR_CONFIG.cornerRadius
    });

    topBarCanvasState.visible = true;
    topBarCanvasState.buttons = [];
    topBarCanvasState.barRect = { x: barX, y: barY, width: barWidth, height: barHeight };

    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const bx = barX + padding + (i * (buttonSize + gap));
        const by = barY + padding;
        const size = buttonSize;
        const iconScale = Math.max(0.1, btn.scale || 1);
        const iconSize = size * iconScale;
        const iconX = bx + (size - iconSize) / 2;
        const iconY = by + (size - iconSize) / 2;
        const alpha = btn.disabled ? 0.45 : 1;

        LC.drawImage({
            name: btn.img,
            pos: [iconX, iconY],
            size: [iconSize, iconSize],
            transparency: alpha
        });

        const clientTopLeft = LC.logicalToClient(bx, by);
        const clientBottomRight = LC.logicalToClient(bx + size, by + size);
        topBarCanvasState.buttons.push({
            id: btn.id,
            x: bx,
            y: by,
            width: size,
            height: size,
            disabled: !!btn.disabled,
            clientRect: {
                left: clientTopLeft.x,
                top: clientTopLeft.y,
                right: clientBottomRight.x,
                bottom: clientBottomRight.y,
                width: clientBottomRight.x - clientTopLeft.x,
                height: clientBottomRight.y - clientTopLeft.y
            }
        });

        if (btn.id === 'shop' && uiState.shopAttentionRank && !btn.disabled) {
            const dotRadius = 6;
            const dotX = bx + size - 8;
            const dotY = by + 8;
            const now = performance.now();
            const pulse = 1 + (Math.sin(now * 0.008) * 0.25);
            const ringT = (now % 1200) / 1200;
            const ringScale = 1 + (ringT * 1.6);
            const ringAlpha = 0.9 * (1 - ringT);

            LC.ctx.save();
            LC.ctx.beginPath();
            LC.ctx.arc(dotX, dotY, dotRadius * ringScale, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha})`;
            LC.ctx.lineWidth = 3;
            LC.ctx.stroke();

            LC.ctx.beginPath();
            LC.ctx.arc(dotX, dotY, dotRadius * pulse, 0, Math.PI * 2);
            LC.ctx.fillStyle = 'rgba(239, 68, 68, 0.98)';
            LC.ctx.fill();
            LC.ctx.restore();
        }
    }
}

function drawTopLeftHint() {
    if (!topLeftHintState.visible || !topLeftHintState.text) return;
    const text = topLeftHintState.text;
    const font = '700 14px Inter';
    const maxWidth = Math.min(520, LC.width - 40);
    const padX = 14;
    const padY = 10;
    const lineH = 18;
    const wrapWidth = maxWidth - padX * 2;
    let layout = topLeftHintState.layoutCache;
    if (!layout || layout.text !== text || layout.wrapWidth !== wrapWidth) {
        const words = String(text).split(/\s+/);
        const lines = [];
        let line = '';
        for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (LC.measureText({ text: next, font }).width <= wrapWidth) {
                line = next;
            } else {
                if (line) lines.push(line);
                line = word;
            }
        }
        if (line) lines.push(line);
        layout = {
            text,
            wrapWidth,
            lines,
            textWidth: lines.reduce((maxW, currentLine) => Math.max(maxW, LC.measureText({ text: currentLine, font }).width), 0)
        };
        topLeftHintState.layoutCache = layout;
    }

    const { lines, textWidth } = layout;
    const panelW = Math.min(maxWidth, Math.max(220, textWidth + padX * 2));
    const panelH = (lines.length * lineH) + padY * 2;
    const barRect = topBarCanvasState.barRect;
    const panelX = Math.max(12, (LC.width - panelW) / 2);
    const panelY = Math.max(12, (barRect ? (barRect.y + barRect.height + 10) : 20));

    LC.drawRect({
        pos: [panelX, panelY],
        size: [panelW, panelH],
        color: 'rgba(0, 0, 0, 0.55)',
        stroke: 'rgba(255, 255, 255, 0.22)',
        strokeWidth: 1,
        cornerRadius: 10
    });

    for (let i = 0; i < lines.length; i++) {
        LC.drawText({
            text: lines[i],
            pos: [panelX + padX, panelY + padY + (i + 1) * lineH - 4],
            font,
            color: 'white',
            textAlign: 'left'
        });
    }

    if (upgradeHintActive) {
        const targetHitbox = hudUpgradeHeaderHitbox || hudUpgradeHitboxes[0] || null;
        const targetX = targetHitbox
            ? (targetHitbox.x + (targetHitbox.width / 2))
            : 190;
        const targetTopY = targetHitbox
            ? targetHitbox.y
            : (LC.height - 170);
        const bounce = Math.sin(performance.now() * 0.012) * 7;
        const tipY = targetTopY - (isMobile ? 18 : 14) + bounce;

        LC.ctx.save();
        drawPulsingTutorialArrow(LC.ctx, targetX, tipY, 0, 1);
        LC.ctx.restore();
    }
}

function updateKeyHintVisibility(isAlive) {
    ensureKeyHintElement();

    if (!isAlive || CURRENT_WORLD === WORLD_TUTORIAL) {
        keyHintUi.visible = false;
        if (!keyHintUi.suppressNextAutoShow || CURRENT_WORLD === WORLD_TUTORIAL) {
            keyHintUi.wasAliveLastFrame = false;
        }
        syncKeyHintElementVisibility();
        return;
    }

    if (!keyHintUi.wasAliveLastFrame) {
        if (keyHintUi.suppressNextAutoShow) {
            keyHintUi.visible = false;
            keyHintUi.suppressNextAutoShow = false;
        } else {
            keyHintUi.visible = !keyHintUi.neverShowAgain;
        }
    }
    keyHintUi.wasAliveLastFrame = true;
    syncKeyHintElementVisibility();
}

export function suppressNextKeyHintAutoShow() {
    keyHintUi.suppressNextAutoShow = true;
    keyHintUi.visible = false;
    syncKeyHintElementVisibility();
}

function ensureKeyHintElement() {
    if (keyHintUi.containerEl || typeof document === 'undefined') return;

    const container = document.createElement('div');
    container.id = 'key_hint_overlay';
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
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;"><span style="color: #22c55e; font-weight: 800;">Left Click / Space Bar</span><span style="color: white;">: Attack</span></div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;"><span style="color: #22c55e; font-weight: 800;">E</span><span style="color: white;">: Throw Weapon / Use or Consume held item</span></div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;"><span style="color: #22c55e; font-weight: 800;">Q</span><span style="color: white;">: Drop Item</span></div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;"><span style="color: #22c55e; font-weight: 800;">R</span><span style="color: white;">: Pick Up Item</span></div>
        <div style="margin: 6px 0; font: 600 15px Inter, sans-serif;"><span style="color: #22c55e; font-weight: 800;">F</span><span style="color: white;">: Activate Ability (Must be wearing an accessory that has an ability.)</span></div>
        <div style="margin: 6px 0 10px 0; font: 600 15px Inter, sans-serif;"><span style="color: #22c55e; font-weight: 800;">Enter</span><span style="color: white;">: Chat</span></div>
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

    const canShow = keyHintUi.visible && CURRENT_WORLD !== WORLD_TUTORIAL && !isMobile && !Settings.forceMobileUI;
    keyHintUi.containerEl.style.display = canShow ? 'flex' : 'none';
    if (keyHintUi.neverShowCheckboxEl) {
        keyHintUi.neverShowCheckboxEl.checked = !!keyHintUi.neverShowAgain;
    }
}

function drawCoinPickupEffects() {
    const now = performance.now();
    const radius = dataMap.OBJECTS[getCoinObjectType()]?.radius || 15;
    const baseSize = radius * 2;
    const highRov = (Number(Vars.viewRangeMult) || 1) >= 5;

    for (let i = coinPickupEffects.length - 1; i >= 0; i--) {
        const effect = coinPickupEffects[i];

        const elapsed = now - effect.startTime;
        const t = Math.min(1, elapsed / COIN_PICKUP_EFFECT_DURATION);
        if (t >= 1) {
            removeUnordered(coinPickupEffects, i);
            continue;
        }

        const eased = 1 - Math.pow(1 - t, 3);
        const x = effect.startX + (effect.targetX - effect.startX) * eased;
        const y = effect.startY + (effect.targetY - effect.startY) * eased;
        const spread = (1 - t) * 7;
        const alpha = 1 - t * 0.8;
        const perpAngle = effect.angle + (Math.PI / 2);
        const px = Math.cos(perpAngle);
        const py = Math.sin(perpAngle);

        const spriteCount = highRov ? Math.min(1, effect.spriteCount) : effect.spriteCount;
        for (let j = 0; j < spriteCount; j++) {
            const angle = effect.seed + ((j / spriteCount) * Math.PI * 2);
            const ox = Math.cos(angle) * spread;
            const oy = Math.sin(angle) * spread;
            const size = baseSize * (1 - t * 0.2);
            const sx = x - camera.x + (ox * px) - size / 2;
            const sy = y - camera.y + (oy * py) - size / 2;

            LC.drawImageFast('gold_coin', sx, sy, size, size, 0, alpha);
        }
    }
}

function drawSeededChestCoins() {
    if (!seededChestCoins.length) return;
    const now = performance.now();
    pruneSeededChestCoins(now);
    if (!seededChestCoins.length) return;
    const radius = dataMap.OBJECTS[getCoinObjectType()]?.radius || 15;
    const size = radius * 2;
    const viewRect = getCameraViewRect(80);
    for (let i = 0; i < seededChestCoins.length; i++) {
        const coin = seededChestCoins[i];
        if (coin.removed || coin.expiresAt <= now) continue;
        if (!isCircleVisible(coin.x, coin.y, radius, viewRect)) continue;
        LC.drawImageFast('gold_coin', coin.x - camera.x - size / 2, coin.y - camera.y - size / 2, size, size);
    }
}

function drawLightningShotEffects() {
    const now = performance.now();

    for (let i = lightningShotEffects.length - 1; i >= 0; i--) {
        const fx = lightningShotEffects[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            removeUnordered(lightningShotEffects, i);
            continue;
        }

        const phase = Math.floor((now - fx.startTime) / 100);
        const mirrored = (phase % 2) === 1 ? -1 : 1;
        const segCount = Math.max(8, Math.min(48, Math.floor(fx.length / 30)));
        const jitterScale = Math.max(1, fx.thickness || 1);
        const jitter = Math.max(6, Math.min(26, fx.length * 0.035)) * jitterScale;
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
        const thick = fx.thickness || 1;
        LC.ctx.strokeStyle = 'rgba(68, 0, 0, 0.8)';
        LC.ctx.lineWidth = 12 * thick;
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
        LC.ctx.lineWidth = 6 * thick;
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
        LC.ctx.lineWidth = 2.5 * thick;
        LC.ctx.lineCap = 'round';
        LC.ctx.lineJoin = 'round';
        LC.ctx.stroke();

        LC.ctx.restore();
    }
}

function drawEnergyBurstEffects() {
    const now = performance.now();

    for (let i = energyBurstEffects.length - 1; i >= 0; i--) {
        const fx = energyBurstEffects[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            removeUnordered(energyBurstEffects, i);
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

            const thick = fx.thickness || 1;
            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(255, 70, 70, ${Math.min(0.85, alpha)})`;
            LC.ctx.lineWidth = 6 * thick;
            LC.ctx.stroke();

            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.55, alpha * 0.8)})`;
            LC.ctx.lineWidth = 2 * thick;
            LC.ctx.stroke();

            const boltCount = 8;
            const boltLen = Math.max(40, Math.min(400, 60 + fx.radius * 0.35));
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
                    null,
                    thick
                );
            }
        }
        LC.ctx.restore();
    }
}

function drawPoisonAoeEffects() {
    const now = performance.now();
    for (let i = poisonAoeEffects.length - 1; i >= 0; i--) {
        const fx = poisonAoeEffects[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            removeUnordered(poisonAoeEffects, i);
            continue;
        }

        const centerX = fx.x - camera.x;
        const centerY = fx.y - camera.y;
        const currentRadius = fx.radius * Math.max(0, Math.min(1, t));
        const baseAlpha = Math.max(0, 1 - t);
        const fillAlpha = Math.min(0.24, 0.24 * baseAlpha);
        const strokeAlpha = Math.min(0.75, 0.75 * baseAlpha);
        const colorCode = fx.colorCode || 0;
        const isBlue = colorCode === 1;
        const isOrange = colorCode === 2;
        const fillColor = isBlue
            ? `rgba(80, 180, 255, ${fillAlpha})`
            : isOrange
                ? `rgba(255, 130, 35, ${Math.min(0.2, fillAlpha)})`
                : `rgba(70, 220, 90, ${fillAlpha})`;
        const strokeColor = isBlue
            ? `rgba(120, 220, 255, ${strokeAlpha})`
            : isOrange
                ? `rgba(255, 165, 70, ${Math.min(0.55, strokeAlpha)})`
                : `rgba(80, 255, 110, ${strokeAlpha})`;

        LC.ctx.save();
        LC.ctx.beginPath();
        LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        LC.ctx.fillStyle = fillColor;
        LC.ctx.fill();

        LC.ctx.beginPath();
        LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        LC.ctx.strokeStyle = strokeColor;
        LC.ctx.lineWidth = 3;
        LC.ctx.stroke();
        LC.ctx.restore();
    }
}

function drawInfernoBeamEffects() {
    const now = performance.now();
    for (let i = infernoBeamEffects.length - 1; i >= 0; i--) {
        const fx = infernoBeamEffects[i];
        const elapsed = now - fx.startTime;
        const total = fx.chargeMs + fx.collapseMs + fx.beamMs;
        if (elapsed >= total) {
            removeUnordered(infernoBeamEffects, i);
            continue;
        }

        const pose = getInfernoBeamTrackedPose(fx);
        const centerX = pose.x - camera.x;
        const centerY = pose.y - camera.y;
        const maxChargeRadius = Math.max(fx.width * 0.85, Math.min(fx.length * 0.42, 520));

        LC.ctx.save();
        if (elapsed < fx.chargeMs) {
            const t = Math.max(0, Math.min(1, elapsed / fx.chargeMs));
            const eased = t * t * (3 - (2 * t));
            const radius = Math.max(12, maxChargeRadius * eased);
            const pulse = 0.5 + (Math.sin((elapsed * 0.008) + fx.seed) * 0.5);
            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            LC.ctx.fillStyle = `rgba(255, 110, 35, ${0.035 + pulse * 0.025})`;
            LC.ctx.fill();
            LC.ctx.strokeStyle = `rgba(255, 180, 80, ${0.16 + pulse * 0.08})`;
            LC.ctx.lineWidth = 3;
            LC.ctx.stroke();
        } else if (elapsed < fx.chargeMs + fx.collapseMs) {
            const t = Math.max(0, Math.min(1, (elapsed - fx.chargeMs) / fx.collapseMs));
            const radius = Math.max(2, maxChargeRadius * (1 - (t * t)));
            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            LC.ctx.fillStyle = `rgba(255, 150, 60, ${0.12 * (1 - t)})`;
            LC.ctx.fill();
            LC.ctx.strokeStyle = `rgba(255, 245, 210, ${0.5 * (1 - t)})`;
            LC.ctx.lineWidth = 5;
            LC.ctx.stroke();
        } else {
            const beamElapsed = elapsed - fx.chargeMs - fx.collapseMs;
            const t = Math.max(0, Math.min(1, beamElapsed / fx.beamMs));
            const grow = 1 - Math.pow(1 - t, 3);
            const fade = Math.max(0, 1 - Math.max(0, (t - 0.55) / 0.45));
            const length = fx.length * grow;
            const width = fx.width * (0.82 + (Math.sin((beamElapsed * 0.025) + fx.seed) * 0.06));
            const localCenterX = length * 0.5;

            LC.ctx.translate(centerX, centerY);
            LC.ctx.rotate(pose.angle);

            LC.ctx.beginPath();
            LC.ctx.ellipse(localCenterX, 0, Math.max(1, length * 0.5), width * 0.62, 0, 0, Math.PI * 2);
            LC.ctx.fillStyle = `rgba(120, 12, 0, ${0.30 * fade})`;
            LC.ctx.fill();

            LC.ctx.beginPath();
            LC.ctx.ellipse(localCenterX, 0, Math.max(1, length * 0.5), width * 0.44, 0, 0, Math.PI * 2);
            LC.ctx.fillStyle = `rgba(255, 80, 18, ${0.50 * fade})`;
            LC.ctx.fill();

            LC.ctx.beginPath();
            LC.ctx.ellipse(localCenterX, 0, Math.max(1, length * 0.5), width * 0.18, 0, 0, Math.PI * 2);
            LC.ctx.fillStyle = `rgba(255, 235, 180, ${0.72 * fade})`;
            LC.ctx.fill();

            LC.ctx.beginPath();
            LC.ctx.ellipse(localCenterX, 0, Math.max(1, length * 0.5), width * 0.62, 0, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(255, 190, 70, ${0.58 * fade})`;
            LC.ctx.lineWidth = 4;
            LC.ctx.stroke();
        }
        LC.ctx.restore();
    }
}

function drawIntimidationAoeEffects() {
    const now = performance.now();
    const expandMs = 600;
    const holdMs = 8000;
    const collapseMs = 600;
    for (let i = intimidationAoeEffects.length - 1; i >= 0; i--) {
        const fx = intimidationAoeEffects[i];
        const elapsed = now - fx.startTime;
        if (elapsed >= fx.duration) {
            removeUnordered(intimidationAoeEffects, i);
            continue;
        }
        let currentRadius = fx.radius;
        if (elapsed < expandMs) {
            currentRadius = fx.radius * Math.max(0, Math.min(1, elapsed / expandMs));
        } else if (elapsed > expandMs + holdMs) {
            const collapseT = Math.max(0, Math.min(1, (elapsed - expandMs - holdMs) / collapseMs));
            currentRadius = fx.radius * (1 - collapseT);
        }

        const progress = Math.max(0, Math.min(1, elapsed / fx.duration));
        const baseAlpha = Math.max(0.08, 1 - progress);
        const followPlayer = fx.followPlayerId ? ENTITIES.PLAYERS[fx.followPlayerId] : null;
        const cx = followPlayer ? followPlayer.x : fx.x;
        const cy = followPlayer ? followPlayer.y : fx.y;
        const centerX = cx - camera.x;
        const centerY = cy - camera.y;

        LC.ctx.save();
        LC.ctx.beginPath();
        LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        LC.ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.28, baseAlpha * 0.28)})`;
        LC.ctx.fill();

        LC.ctx.beginPath();
        LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        LC.ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.8, baseAlpha)})`;
        LC.ctx.lineWidth = 3;
        LC.ctx.stroke();
        LC.ctx.restore();
    }
}

function drawSmokeAoeEffects() {
    const now = performance.now();
    for (let i = smokeAoeEffects.length - 1; i >= 0; i--) {
        const fx = smokeAoeEffects[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            removeUnordered(smokeAoeEffects, i);
            continue;
        }

        const centerX = fx.x - camera.x;
        const centerY = fx.y - camera.y;
        const currentRadius = fx.radius * Math.max(0, Math.min(1, t));
        const baseAlpha = Math.max(0, 1 - t);
        const fillAlpha = Math.min(0.85, 0.85 * baseAlpha);
        const strokeAlpha = Math.min(0.95, 0.95 * baseAlpha);

        LC.ctx.save();
        LC.ctx.beginPath();
        LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        LC.ctx.fillStyle = `rgba(0, 0, 0, ${fillAlpha})`;
        LC.ctx.fill();

        LC.ctx.beginPath();
        LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        LC.ctx.strokeStyle = `rgba(0, 0, 0, ${strokeAlpha})`;
        LC.ctx.lineWidth = 4;
        LC.ctx.stroke();
        LC.ctx.restore();
    }
}

function drawMobDeathFades() {
    const now = performance.now();
    for (let i = mobDeathFades.length - 1; i >= 0; i--) {
        const fx = mobDeathFades[i];
        const t = (now - fx.startTime) / fx.duration;
        if (t >= 1) {
            removeUnordered(mobDeathFades, i);
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

        LC.drawImageFast(cfg.imgName, screenX - width / 2, screenY - height / 2, width, height, fx.angle || 0, alpha);
    }
}

const energyBurstColliderCache = {
    frameKey: -1,
    colliders: []
};

function collectEnergyBurstColliders() {
    const frameKey = Math.floor(performance.now() / 16);
    if (energyBurstColliderCache.frameKey === frameKey) {
        return energyBurstColliderCache.colliders;
    }

    const colliders = [];

    for (const id in ENTITIES.STRUCTURES) {
        const s = ENTITIES.STRUCTURES[id];
        if (!s?.radius) continue;
        if (dataMap.STRUCTURES[s.type]?.noCollisions) continue;
        colliders.push({ x: s.x, y: s.y, r: s.radius });
    }

    for (const id in ENTITIES.OBJECTS) {
        const o = ENTITIES.OBJECTS[id];
        if (!o?.radius) continue;
        if (!isChestObjectType(o.type)) continue;
        colliders.push({ x: o.x, y: o.y, r: o.radius });
    }

    for (const id in ENTITIES.MOBS) {
        const m = ENTITIES.MOBS[id];
        if (!m?.radius) continue;
        colliders.push({ x: m.x, y: m.y, r: m.radius });
    }

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p?.isAlive || !p.radius) continue;
        colliders.push({ x: p.x, y: p.y, r: p.radius });
    }

    energyBurstColliderCache.frameKey = frameKey;
    energyBurstColliderCache.colliders = colliders;
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

function drawBurstLightningBolt(centerX, centerY, worldX, worldY, angle, startRadius, length, seed, alpha, now, colliders, thickness = 1) {
    const clampedLength = Array.isArray(colliders) && colliders.length
        ? getBurstBoltClampedLength(worldX, worldY, angle, startRadius, length, colliders)
        : length;
    if (clampedLength <= 1) return;

        const segCount = Math.max(6, Math.min(14, Math.floor(clampedLength / 7)));
        const jitterScale = Math.max(1, thickness || 1);
        const jitter = Math.max(1.8, Math.min(6.2, clampedLength * 0.09)) * jitterScale;
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
    LC.ctx.lineWidth = 8 * thickness;
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
    LC.ctx.lineWidth = 4 * thickness;
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
    LC.ctx.lineWidth = 1.8 * thickness;
    LC.ctx.lineCap = 'round';
    LC.ctx.lineJoin = 'round';
    LC.ctx.stroke();

    LC.ctx.restore();
}

function drawInfoBox(lp) {
    const font = '16px Inter';
    const paddingX = 10;
    const minBoxWidth = 155;
    const targetScore = Math.max(0, Math.floor(lp.score || 0));
    if (targetScore <= hudInfoBoxScore) {
        hudInfoBoxScore = targetScore;
    } else {
        hudInfoBoxScore += (targetScore - hudInfoBoxScore) * HUD_SCORE_LERP;
        if (Math.abs(targetScore - hudInfoBoxScore) < 1) {
            hudInfoBoxScore = targetScore;
        }
    }
    const scoreText = Math.floor(hudInfoBoxScore).toLocaleString();
    const text = [
        `x: ${lp.x.toFixed(0)}`,
        `y: ${lp.y.toFixed(0)}`,
        `score: ${scoreText}`
    ];
    if (Settings.debugMode) {
        const displayPing = simulatedPingMs > 0
            ? Math.round((Vars.ping || 0) + (simulatedPingDisplayMs || simulatedPingMs))
            : Vars.ping;
        text.push(`ping: ${displayPing}`);
        text.push(`TPS: ${Vars.netTps}`);
        text.push(`PPS: ${Vars.netPps}`);
        text.push(`AUPBS: ${Vars.netAupbs}`);
        text.push(`LUPBS: ${Vars.netLupbs}`);
    }
    const rowHeight = 25;
    const topPadding = 20;
    const bottomPadding = 15;
    const boxHeight = topPadding + bottomPadding + (rowHeight * (text.length - 1));
    const contentWidth = text.reduce((maxWidth, line) => {
        const { width } = LC.measureText({ text: line, font });
        return Math.max(maxWidth, width);
    }, 0);
    const boxWidth = Math.max(minBoxWidth, Math.ceil(contentWidth + paddingX * 2));
    const boxX = LC.width - 265 - boxWidth;
    const textX = boxX + paddingX;

    LC.drawRect({ pos: [boxX, 5], size: [boxWidth, boxHeight], color: 'rgba(0, 0, 0, 0.4)', cornerRadius: 5 });
    text.forEach((t, i) => LC.drawText({ text: t, pos: [textX, topPadding + 5 + i * rowHeight], font, color: 'white' }));
}

function updateHomeOnlineCount(shouldShow) {
    const countEl = uiRefs.homeOnlineCount || document.getElementById('home_online_count');
    if (!countEl) return;
    if (!uiRefs.homeOnlineCount) uiRefs.homeOnlineCount = countEl;
    if (!shouldShow) {
        if (countEl.style.display !== 'none') countEl.style.display = 'none';
        return;
    }
    const count = Math.max(0, Vars.onlineCount || 0);
    const nextText = `${count} player${count === 1 ? '' : 's'} online`;
    if (countEl.textContent !== nextText) countEl.textContent = nextText;
    if (countEl.style.display !== 'block') countEl.style.display = 'block';
}

function resetTopLeaderState() {
    Vars.topLeader.id = 0;
    Vars.topLeader.x = 0;
    Vars.topLeader.y = 0;
    Vars.topLeader.score = 0;
}

function setLeaderboardOpenState(isOpen, notifyServer = true) {
    const next = Boolean(isOpen);
    if (leaderboardOpen === next) return leaderboardOpen;
    leaderboardOpen = next;
    leaderboardCanvasState.open = next;
    if (!next) {
        ENTITIES.leaderboard = [];
    }
    if (notifyServer) {
        sendUiPanelVisibilityPacket(UI_PANEL_IDS.leaderboard, next);
    }
    return leaderboardOpen;
}

function setMinimapOpenState(isOpen, notifyServer = true) {
    const next = Boolean(isOpen);
    if (minimapCanvasState.open === next) return minimapCanvasState.open;
    minimapCanvasState.open = next;
    if (!next) {
        Vars.minimapPlayers = [];
        resetTopLeaderState();
        updateMinimapCoachOverlay(false);
    }
    if (notifyServer) {
        sendUiPanelVisibilityPacket(UI_PANEL_IDS.minimap, next);
    }
    return minimapCanvasState.open;
}

function drawLeaderboard() {
    const buttonSize = 24;
    const buttonX = LC.width - 44;
    const buttonY = 14;

    if (!leaderboardOpen) {
        leaderboardCanvasState.open = false;
        leaderboardCanvasState.rect = { x: buttonX, y: buttonY, width: buttonSize, height: buttonSize };
        leaderboardCanvasState.toggleRect = { x: buttonX, y: buttonY, width: buttonSize, height: buttonSize };
        LC.drawCircle({
            pos: [buttonX + buttonSize / 2, buttonY + buttonSize / 2],
            radius: buttonSize / 2,
            color: 'rgba(0,0,0,0.65)',
            stroke: 'rgba(255,255,255,0.2)',
            strokeWidth: 1
        });
        LC.drawText({
            text: '+',
            pos: [buttonX + buttonSize / 2, buttonY + 18],
            font: 'bold 18px Inter',
            color: 'white',
            textAlign: 'center'
        });
        return;
    }

    const lb = ENTITIES.leaderboard || [];
    const panelX = LC.width - 260;
    const panelY = 10;
    const panelWidth = 250;
    const headerHeight = 30;
    const rowHeight = 25;
    const bodyTopPad = 4;
    const listHeight = (lb.length * rowHeight) + (lb.length > 0 ? bodyTopPad : 0);
    const panelHeight = headerHeight + listHeight;

    leaderboardCanvasState.open = true;
    leaderboardCanvasState.rect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };
    leaderboardCanvasState.toggleRect = { x: panelX + panelWidth - 30, y: panelY + 3, width: 24, height: 24 };

    LC.drawRect({ pos: [panelX, panelY], size: [panelWidth, panelHeight], color: 'rgba(0,0,0,0.6)', cornerRadius: 8 });
    LC.drawText({ text: 'LEADERBOARD', pos: [panelX + (panelWidth / 2), panelY + 18], font: 'bold 16px Inter', color: 'white', textAlign: 'center' });
    LC.drawCircle({
        pos: [panelX + panelWidth - 18, panelY + 15],
        radius: 10,
        color: 'rgba(255,255,255,0.12)',
        stroke: 'rgba(255,255,255,0.18)',
        strokeWidth: 1
    });
    LC.drawText({
        text: '-',
        pos: [panelX + panelWidth - 18, panelY + 20],
        font: 'bold 18px Inter',
        color: 'white',
        textAlign: 'center'
    });

    lb.forEach((p, i) => {
        const color = p.id === Vars.myId ? 'white' : 'lightgray';
        const rawName = String(p.username || '');
        const shortName = rawName.length > 12 ? `${rawName.slice(0, 12)}...` : rawName;
        const rowY = panelY + headerHeight + bodyTopPad + 12 + i * rowHeight;
        LC.drawText({ text: `${i + 1}. ${shortName}`, pos: [panelX + 10, rowY], font: '14px Inter', color });
        LC.drawText({ text: formatScore(p.score), pos: [panelX + panelWidth - 10, rowY], font: '14px Inter', color, textAlign: 'right' });
    });
}

function drawBossShrineIndicator(localPlayer, staticViewRect = null) {
    if (!localPlayer?.isAlive) return;

    const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
    const selectedItemType = (Vars.myInventory[Vars.selectedSlot] || 0) & 0x7F;
    const selectedItemCount = Vars.myInventoryCounts[Vars.selectedSlot] || 0;
    if (selectedItemType !== goldenSkullType || selectedItemCount <= 0) return;

    let shrine = null;
    let nearestDistSq = 90 * 90;
    forEachEntity(ENTITIES.STRUCTURES, (structure) => {
        if (!structure || (structure.type !== 4 && structure.type !== 8 && structure.type !== 9 && structure.type !== 10)) return;
        if (!isCircleVisible(structure.x, structure.y, structure.radius || 0, staticViewRect)) return;
        const dx = structure.x - localPlayer.x;
        const dy = structure.y - localPlayer.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > nearestDistSq) return;
        shrine = structure;
        nearestDistSq = distSq;
    });
    if (!shrine) return;

    const screenX = shrine.x - camera.x;
    const screenY = shrine.y - camera.y - shrine.radius - 48;
    const promptText = (isMobile || Settings.forceMobileUI)
        ? 'TAP THROW TO PLACE GOLDEN SKULL'
        : 'PRESS E TO PLACE GOLDEN SKULL';
    const keyText = (isMobile || Settings.forceMobileUI) ? 'TAP' : 'E';
    const pulse = 0.92 + (Math.sin(performance.now() * 0.01) * 0.08);

    LC.ctx.save();
    LC.ctx.textAlign = 'center';
    LC.ctx.textBaseline = 'middle';

    const badgeFont = normalizeCanvasFont('700 14px Arial');
    const promptFont = normalizeCanvasFont('700 15px Arial');
    const badgeWidth = Math.ceil(LC.ctx.measureText(keyText).width) + 24;
    const promptWidth = Math.ceil(LC.ctx.measureText(promptText).width) + 28;
    const panelWidth = Math.max(220, promptWidth);
    const panelHeight = 34;
    const badgeHeight = 28;
    const panelX = screenX - (panelWidth / 2);
    const panelY = screenY;
    const badgeY = panelY - badgeHeight - 8;

    LC.ctx.globalAlpha = 0.96;
    LC.ctx.fillStyle = 'rgba(12, 10, 8, 0.86)';
    LC.ctx.strokeStyle = 'rgba(235, 205, 120, 0.85)';
    LC.ctx.lineWidth = 2;
    LC.ctx.beginPath();
    LC.ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 10);
    LC.ctx.fill();
    LC.ctx.stroke();

    LC.ctx.fillStyle = 'rgba(32, 24, 10, 0.92)';
    LC.ctx.beginPath();
    LC.ctx.roundRect(screenX - (badgeWidth / 2), badgeY, badgeWidth, badgeHeight, 10);
    LC.ctx.fill();

    LC.ctx.save();
    LC.ctx.translate(screenX, badgeY + (badgeHeight / 2));
    LC.ctx.scale(pulse, pulse);
    LC.ctx.fillStyle = '#ffd86b';
    LC.ctx.font = badgeFont;
    LC.ctx.fillText(keyText, 0, 0);
    LC.ctx.restore();

    LC.ctx.fillStyle = '#fff8d8';
    LC.ctx.font = promptFont;
    LC.ctx.fillText(promptText, screenX, panelY + (panelHeight / 2) + 1);
    LC.ctx.restore();
}

function formatScore(s) {
    const truncateCompact = (value, divisor, suffix) => `${(Math.floor((value / divisor) * 10) / 10).toFixed(1)}${suffix}`;
    if (s >= 1e9) return truncateCompact(s, 1e9, 'B');
    if (s >= 1e6) return truncateCompact(s, 1e6, 'M');
    if (s >= 1e3) return truncateCompact(s, 1e3, 'k');
    return Math.floor(s).toString();
}

function getMinimapBackgroundCanvas() {
    const size = MINIMAP_UI.size;
    const cacheKey = [
        CURRENT_WORLD,
        size,
        MAP_SIZE[0],
        MAP_SIZE[1],
        dataMap.STRUCTURES?.['1']?.radius || 0
    ].join(':');
    if (minimapBackgroundCache.canvas && minimapBackgroundCache.key === cacheKey) {
        return minimapBackgroundCache.canvas;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (CURRENT_WORLD === WORLD_TUTORIAL || worldIsGrassOnly(CURRENT_WORLD) || worldIsSnowOnly(CURRENT_WORLD) || worldIsDesertOnly(CURRENT_WORLD) || worldIsMagmaOnly(CURRENT_WORLD) || !worldHasRivers(CURRENT_WORLD)) {
        ctx.fillStyle = worldIsSnowOnly(CURRENT_WORLD) ? '#cbd5e1' : (worldIsDesertOnly(CURRENT_WORLD) ? '#d7b46a' : (worldIsMagmaOnly(CURRENT_WORLD) ? '#d43b2a' : '#21ae2fb3'));
        ctx.fillRect(0, 0, size, size);
    } else {
        ctx.fillStyle = '#21ae2fb3';
        ctx.fillRect(0, 0, size * 0.47, size * 0.47);
        ctx.fillStyle = '#d2be89';
        ctx.fillRect(0, size * 0.53, size * 0.47, size * 0.47);
        ctx.fillStyle = '#a3a3a3';
        ctx.fillRect(size * 0.53, 0, size * 0.47, size * 0.47);
        ctx.fillStyle = '#d43b2a';
        ctx.fillRect(size * 0.53, size * 0.53, size * 0.47, size * 0.47);

        const riverBaseLeft = MAP_SIZE[0] * 0.47;
        const riverBaseRight = MAP_SIZE[0] * 0.53;
        const riverCenterX = MAP_SIZE[0] * 0.5;
        const riverCenterY = MAP_SIZE[1] * 0.5;
        const riverBulgeRadius = 1400;
        const stepWorld = Math.max(20, Math.floor(MAP_SIZE[1] / size));
        const getRiverBoundsAtY = (worldY) => {
            const dy = worldY - riverCenterY;
            const dySq = dy * dy;
            if (dySq >= riverBulgeRadius * riverBulgeRadius) {
                return { left: riverBaseLeft, right: riverBaseRight };
            }
            const halfWidth = Math.sqrt((riverBulgeRadius * riverBulgeRadius) - dySq);
            return {
                left: Math.min(riverBaseLeft, riverCenterX - halfWidth),
                right: Math.max(riverBaseRight, riverCenterX + halfWidth)
            };
        };
        const getRiverBoundsAtX = (worldX) => {
            const dx = worldX - riverCenterX;
            const dxSq = dx * dx;
            if (dxSq >= riverBulgeRadius * riverBulgeRadius) {
                return { top: MAP_SIZE[1] * 0.47, bottom: MAP_SIZE[1] * 0.53 };
            }
            const halfWidth = Math.sqrt((riverBulgeRadius * riverBulgeRadius) - dxSq);
            return {
                top: Math.min(MAP_SIZE[1] * 0.47, riverCenterY - halfWidth),
                bottom: Math.max(MAP_SIZE[1] * 0.53, riverCenterY + halfWidth)
            };
        };

        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        for (let worldY = 0; worldY <= MAP_SIZE[1]; worldY += stepWorld) {
            const bounds = getRiverBoundsAtY(worldY);
            const miniY = (worldY / MAP_SIZE[1]) * size;
            const miniX = (bounds.left / MAP_SIZE[0]) * size;
            if (worldY === 0) ctx.moveTo(miniX, miniY);
            else ctx.lineTo(miniX, miniY);
        }
        for (let worldY = MAP_SIZE[1]; worldY >= 0; worldY -= stepWorld) {
            const bounds = getRiverBoundsAtY(worldY);
            ctx.lineTo((bounds.right / MAP_SIZE[0]) * size, (worldY / MAP_SIZE[1]) * size);
        }
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        for (let worldX = 0; worldX <= MAP_SIZE[0]; worldX += stepWorld) {
            const bounds = getRiverBoundsAtX(worldX);
            const miniX = (worldX / MAP_SIZE[0]) * size;
            const miniY = (bounds.top / MAP_SIZE[1]) * size;
            if (worldX === 0) ctx.moveTo(miniX, miniY);
            else ctx.lineTo(miniX, miniY);
        }
        for (let worldX = MAP_SIZE[0]; worldX >= 0; worldX -= stepWorld) {
            const bounds = getRiverBoundsAtX(worldX);
            ctx.lineTo((worldX / MAP_SIZE[0]) * size, (bounds.bottom / MAP_SIZE[1]) * size);
        }
        ctx.closePath();
        ctx.fill();

        const spawnRadius = Math.max(0, dataMap.STRUCTURES?.['1']?.radius || 0);
        if (spawnRadius > 0) {
            const miniRadius = (spawnRadius / MAP_SIZE[0]) * size;
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, miniRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(160, 160, 160, 0.85)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.stroke();
        }
    }

    minimapBackgroundCache.key = cacheKey;
    minimapBackgroundCache.canvas = canvas;
    return canvas;
}

function drawMinimap() {
    const size = MINIMAP_UI.size;
    const x = MINIMAP_UI.x;
    const y = MINIMAP_UI.y;
    const toggleSize = 24;
    const toggleCenterX = x;
    const toggleCenterY = y;
    const toggleX = toggleCenterX - toggleSize / 2;
    const toggleY = toggleCenterY - toggleSize / 2;
    minimapCanvasState.toggleRect = { x: toggleX, y: toggleY, width: toggleSize, height: toggleSize };

    if (!minimapCanvasState.open) {
        LC.drawCircle({
            pos: [toggleCenterX, toggleCenterY],
            radius: toggleSize / 2,
            color: 'rgba(0,0,0,0.32)',
            stroke: 'rgba(255,255,255,0.12)',
            strokeWidth: 1
        });
        LC.drawText({
            text: '+',
            pos: [toggleCenterX, toggleCenterY + 6],
            font: 'bold 18px Inter',
            color: 'rgba(255,255,255,0.85)',
            textAlign: 'center'
        });
        return;
    }

    LC.drawRect({ pos: [x - 5, y - 5], size: [size + 10, size + 10], color: 'rgba(0,0,0,0.4)', cornerRadius: 5 });
    const backgroundCanvas = getMinimapBackgroundCanvas();
    if (backgroundCanvas) {
        LC.ctx.drawImage(backgroundCanvas, x, y, size, size);
    }
    LC.drawCircle({
        pos: [toggleCenterX, toggleCenterY],
        radius: toggleSize / 2,
        color: 'rgba(0,0,0,0.32)',
        stroke: 'rgba(255,255,255,0.12)',
        strokeWidth: 1
    });
    LC.drawText({
        text: '-',
        pos: [toggleCenterX, toggleCenterY + 6],
        font: 'bold 18px Inter',
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center'
    });

    const drawDot = (e, color) => {
        const dx = (e.x / MAP_SIZE[0]) * size;
        const dy = (e.y / MAP_SIZE[1]) * size;
        LC.drawCircle({ pos: [x + dx, y + dy], radius: 2, color });
    };

    if (Settings.showMobsOnMinimap) {
        forEachEntity(ENTITIES.MOBS, (mob) => drawDot(mob, 'orange'));
    }
    if (Settings.showChestsOnMinimap) {
        forEachEntity(ENTITIES.OBJECTS, (obj) => {
            if (isChestObjectType(obj.type)) drawDot(obj, '#b45309');
        });
    }
    const lp = ENTITIES.PLAYERS[Vars.myId];
    const minimapPlayers = Array.isArray(Vars.minimapPlayers) ? Vars.minimapPlayers : [];
    for (let i = 0; i < minimapPlayers.length; i++) {
        const p = minimapPlayers[i];
        if (!p) continue;
        if (p.id === Vars.myId) continue;
        drawDot(p, 'red');
    }
    if (lp) drawDot(lp, 'white');

    const top = Vars.topLeader;
    if (CURRENT_WORLD === WORLD_MAIN && top?.id > 0 && Number.isFinite(top.x) && Number.isFinite(top.y) && LC.images?.['ui_crown']) {
        const dx = (top.x / MAP_SIZE[0]) * size;
        const dy = (top.y / MAP_SIZE[1]) * size;
        LC.drawImage({
            name: 'ui_crown',
            pos: [x + dx - 10, y + dy - 10],
            size: [20, 20]
        });
    }
}

function getMinimapClientRect() {
    const topLeft = LC.logicalToClient(MINIMAP_UI.x, MINIMAP_UI.y);
    const bottomRight = LC.logicalToClient(MINIMAP_UI.x + MINIMAP_UI.size, MINIMAP_UI.y + MINIMAP_UI.size);
    return {
        left: Math.min(topLeft.x, bottomRight.x),
        top: Math.min(topLeft.y, bottomRight.y),
        right: Math.max(topLeft.x, bottomRight.x),
        bottom: Math.max(topLeft.y, bottomRight.y),
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y)
    };
}

export function getMinimapWorldPositionAtClientPos(clientX, clientY) {
    if (!minimapCanvasState.open) return null;

    const { x, y } = LC.clientToLogical(clientX, clientY);
    if (x < MINIMAP_UI.x || x > MINIMAP_UI.x + MINIMAP_UI.size || y < MINIMAP_UI.y || y > MINIMAP_UI.y + MINIMAP_UI.size) {
        return null;
    }

    const localX = (x - MINIMAP_UI.x) / Math.max(1, MINIMAP_UI.size);
    const localY = (y - MINIMAP_UI.y) / Math.max(1, MINIMAP_UI.size);
    return {
        x: Math.max(0, Math.min(65535, Math.round(localX * MAP_SIZE[0]))),
        y: Math.max(0, Math.min(65535, Math.round(localY * MAP_SIZE[1])))
    };
}

function ensureMinimapCoachUi() {
    if (minimapCoachUi.rootEl || typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.id = 'minimap_coach_overlay';
    Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '100800',
        pointerEvents: 'none',
        display: 'none'
    });

    const makeBlock = () => {
        const block = document.createElement('div');
        Object.assign(block.style, {
            position: 'fixed',
            background: 'rgba(0, 0, 0, 0.7)',
            pointerEvents: 'none',
            zIndex: '0'
        });
        root.appendChild(block);
        return block;
    };
    minimapCoachUi.blocks = [makeBlock(), makeBlock(), makeBlock(), makeBlock()];

    const ring = document.createElement('div');
    Object.assign(ring.style, {
        position: 'fixed',
        border: '2px solid rgba(255, 255, 255, 0.95)',
        borderRadius: '10px',
        boxShadow: '0 0 0 2px rgba(0,0,0,0.5), 0 0 20px rgba(255,255,255,0.25)',
        pointerEvents: 'none',
        zIndex: '1'
    });
    root.appendChild(ring);

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: '2'
    });
    root.appendChild(canvas);

    minimapCoachUi.rootEl = root;
    minimapCoachUi.ringEl = ring;
    minimapCoachUi.canvasEl = canvas;
    minimapCoachUi.ctx = canvas.getContext('2d');
    document.body.appendChild(root);
}

function hideMinimapCoach() {
    if (!minimapCoachUi.rootEl) return;
    minimapCoachUi.rootEl.style.display = 'none';
    minimapCoachUi.okRect = null;
}

function updateMinimapCoachOverlay(show) {
    ensureMinimapCoachUi();
    if (!minimapCoachUi.rootEl) return;
    if (!show) {
        hideMinimapCoach();
        return;
    }

    const rect = getMinimapClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (minimapCoachUi.canvasEl && minimapCoachUi.ctx && (minimapCoachUi.width !== vw || minimapCoachUi.height !== vh || minimapCoachUi.dpr !== dpr)) {
        minimapCoachUi.width = vw;
        minimapCoachUi.height = vh;
        minimapCoachUi.dpr = dpr;
        minimapCoachUi.canvasEl.width = Math.max(1, Math.floor(vw * dpr));
        minimapCoachUi.canvasEl.height = Math.max(1, Math.floor(vh * dpr));
        minimapCoachUi.canvasEl.style.width = `${vw}px`;
        minimapCoachUi.canvasEl.style.height = `${vh}px`;
        minimapCoachUi.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const pad = 8;
    const left = Math.max(0, rect.left - pad);
    const top = Math.max(0, rect.top - pad);
    const right = Math.min(vw, rect.right + pad);
    const bottom = Math.min(vh, rect.bottom + pad);

    const [bTop, bLeft, bRight, bBottom] = minimapCoachUi.blocks;
    Object.assign(bTop.style, { left: '0px', top: '0px', width: `${vw}px`, height: `${Math.max(0, top)}px` });
    Object.assign(bLeft.style, { left: '0px', top: `${top}px`, width: `${Math.max(0, left)}px`, height: `${Math.max(0, bottom - top)}px` });
    Object.assign(bRight.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, vw - right)}px`, height: `${Math.max(0, bottom - top)}px` });
    Object.assign(bBottom.style, { left: '0px', top: `${bottom}px`, width: `${vw}px`, height: `${Math.max(0, vh - bottom)}px` });

    Object.assign(minimapCoachUi.ringEl.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, right - left)}px`,
        height: `${Math.max(0, bottom - top)}px`
    });

    if (minimapCoachUi.ctx) {
        const ctx = minimapCoachUi.ctx;
        ctx.clearRect(0, 0, vw, vh);

        const bubbleW = Math.min(440, Math.max(320, Math.floor(vw * 0.42)));
        const bubbleH = 142;
        const bubbleX = Math.max(12, Math.min(vw - bubbleW - 12, right + 24));
        const bubbleY = Math.max(12, top + 8);

        const arrowTipX = right + 8;
        const arrowTipY = top + 34;
        const arrowBaseX = bubbleX;
        const arrowHalf = 9;

        ctx.fillStyle = 'rgba(10, 20, 35, 0.95)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(arrowTipX, arrowTipY);
        ctx.lineTo(arrowBaseX, arrowTipY - arrowHalf);
        ctx.lineTo(arrowBaseX, arrowTipY + arrowHalf);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const radius = 12;
        ctx.beginPath();
        ctx.moveTo(bubbleX + radius, bubbleY);
        ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
        ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + radius);
        ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
        ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - radius, bubbleY + bubbleH);
        ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
        ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius);
        ctx.lineTo(bubbleX, bubbleY + radius);
        ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.font = normalizeCanvasFont('700 15px Inter');
        ctx.textAlign = 'left';
        ctx.fillText('This is the Minimap. Your player is the white', bubbleX + 14, bubbleY + 30);
        ctx.fillText('dot, and other players are red dots!', bubbleX + 14, bubbleY + 52);

        const okW = 78;
        const okH = 30;
        const okX = bubbleX + bubbleW - okW - 12;
        const okY = bubbleY + bubbleH - okH - 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(okX + 8, okY);
        ctx.lineTo(okX + okW - 8, okY);
        ctx.quadraticCurveTo(okX + okW, okY, okX + okW, okY + 8);
        ctx.lineTo(okX + okW, okY + okH - 8);
        ctx.quadraticCurveTo(okX + okW, okY + okH, okX + okW - 8, okY + okH);
        ctx.lineTo(okX + 8, okY + okH);
        ctx.quadraticCurveTo(okX, okY + okH, okX, okY + okH - 8);
        ctx.lineTo(okX, okY + 8);
        ctx.quadraticCurveTo(okX, okY, okX + 8, okY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        ctx.font = normalizeCanvasFont('800 14px Inter');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OK', okX + (okW / 2), okY + (okH / 2) + 0.5);
        ctx.textBaseline = 'alphabetic';
        minimapCoachUi.okRect = { left: okX, top: okY, right: okX + okW, bottom: okY + okH };
    }

    minimapCoachUi.rootEl.style.display = 'block';
}

export function isMinimapCoachInteractiveAtClientPos(clientX, clientY) {
    if (!minimapCoachUi.active || !minimapCoachUi.rootEl || minimapCoachUi.rootEl.style.display === 'none') return false;
    if (minimapCoachUi.okRect) {
        const r = minimapCoachUi.okRect;
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return true;
    }
    return true;
}

export function handleMinimapCoachPointerDown(clientX, clientY) {
    if (!isMinimapCoachInteractiveAtClientPos(clientX, clientY)) return false;
    if (minimapCoachUi.okRect) {
        const r = minimapCoachUi.okRect;
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            minimapCoachUi.dismissed = true;
            minimapCoachUi.active = false;
            setSeenMinimapCoach(true);
            hideMinimapCoach();
        }
    }
    return true;
}

function drawKillCounter() {
    const x = 20;
    const y = 208;
    const width = 84;
    const height = 30;
    const kills = Math.max(0, Vars.myStats.kills || 0);

    LC.drawRect({
        pos: [x - 2, y - 2],
        size: [width, height],
        color: 'rgba(0,0,0,0.45)',
        cornerRadius: 6
    });

    if (LC.images?.['ui_skull']) {
        LC.drawImage({
            name: 'ui_skull',
            pos: [x + 6, y + 5],
            size: [20, 20]
        });
    }

    LC.drawText({
        text: String(kills),
        pos: [x + 34, y + 21],
        font: 'bold 16px Inter',
        color: 'white',
        textAlign: 'left'
    });
}

function drawUpgradeBars() {
    hudUpgradeHitboxes.length = 0;
    const points = Math.max(0, Vars.myStats.availablePoints || 0);
    const showUpgradeControls = hudUpgradesExpanded;
    const rows = [
        { name: 'STRENGTH', level: Math.max(0, Math.min(15, Vars.myStats.buffStrength || 0)), color: '#ef6b6b', attrType: 1 },
        { name: 'MAX HEALTH', level: Math.max(0, Math.min(15, Vars.myStats.buffMaxHealth || 0)), color: '#f0b27a', attrType: 2 },
        { name: 'REGENERATION', level: Math.max(0, Math.min(15, Vars.myStats.buffRegenSpeed || 0)), color: '#d06de6', attrType: 3 }
    ];

    const x = HUD_UPGRADE_LAYOUT.x;
    const y = HUD_UPGRADE_LAYOUT.topY;
    const rowH = HUD_UPGRADE_LAYOUT.rowHeight;
    const rowGap = HUD_UPGRADE_LAYOUT.rowGap;
    const width = HUD_UPGRADE_LAYOUT.totalWidth;
    const plusSize = 22;
    const plusGap = 6;
    const barW = width - HUD_UPGRADE_LAYOUT.rightPad - (plusSize + plusGap);
    const rowCornerRadius = 14;
    const segmentInset = 4;
    const segmentTrackW = barW - (segmentInset * 2);
    const segmentW = (segmentTrackW - (HUD_UPGRADE_LAYOUT.segmentGap * (HUD_UPGRADE_LAYOUT.segments - 1))) / HUD_UPGRADE_LAYOUT.segments;
    const edgeSegmentRadius = Math.max(2, rowCornerRadius - segmentInset);
    const drawUpgradeSegment = ({ x, y, width, height, color, roundLeft = false, roundRight = false, radius = 0 }) => {
        const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
        const ctx = LC.ctx;
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + (roundLeft ? r : 0), y);
        ctx.lineTo(x + width - (roundRight ? r : 0), y);
        if (roundRight) {
            ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        }
        ctx.lineTo(x + width, y + height - (roundRight ? r : 0));
        if (roundRight) {
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        }
        ctx.lineTo(x + (roundLeft ? r : 0), y + height);
        if (roundLeft) {
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        }
        ctx.lineTo(x, y + (roundLeft ? r : 0));
        if (roundLeft) {
            ctx.quadraticCurveTo(x, y, x + r, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };
    const hiddenOffset = -(barW + 24);
    const targetOffset = hudUpgradesExpanded ? 0 : hiddenOffset;
    hudUpgradeSlideOffset += (targetOffset - hudUpgradeSlideOffset) * HUD_UPGRADE_SLIDE_LERP;
    if (Math.abs(targetOffset - hudUpgradeSlideOffset) < 0.25) {
        hudUpgradeSlideOffset = targetOffset;
    }
    const headerText = `UPGRADES (${points}) ${hudUpgradesExpanded ? '◀' : '▶'}`;
    const headerFont = '900 16px Inter';
    const headerMetrics = LC.measureText({ text: headerText, font: headerFont });
    const headerPadX = 10;
    const headerPadY = 4;
    const cursorX = (window._lastCursorX ?? -9999);
    const cursorY = (window._lastCursorY ?? -9999);
    const cursorHud = clientToHud(cursorX, cursorY);
    const baseHeaderColor = isLocalPlayerInSnowBiome() ? '#4b5563' : 'white';
    const hoverHeaderColor = isLocalPlayerInSnowBiome() ? '#9ca3af' : 'rgba(255,255,255,0.72)';

    hudUpgradeHeaderHitbox = {
        x: x,
        y: y - 24 - headerPadY,
        width: Math.max(140, headerMetrics.width + headerPadX * 2),
        height: 24 + (headerPadY * 2)
    };
    const isHeaderHover = cursorHud.x >= hudUpgradeHeaderHitbox.x &&
        cursorHud.x <= hudUpgradeHeaderHitbox.x + hudUpgradeHeaderHitbox.width &&
        cursorHud.y >= hudUpgradeHeaderHitbox.y &&
        cursorHud.y <= hudUpgradeHeaderHitbox.y + hudUpgradeHeaderHitbox.height;

    LC.drawText({
        text: headerText,
        pos: [x + 6, y - 8],
        font: headerFont,
        color: isHeaderHover ? hoverHeaderColor : baseHeaderColor,
        textAlign: 'left'
    });

    rows.forEach((row, idx) => {
        const rowY = y + (idx * (rowH + rowGap));
        const rowX = x + hudUpgradeSlideOffset;
        const canUpgrade = points > 0 && row.level < 10;

        LC.drawRect({
            pos: [rowX, rowY],
            size: [barW, rowH],
            color: 'rgba(0,0,0,0.52)',
            stroke: canUpgrade ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)',
            strokeWidth: 2,
            cornerRadius: rowCornerRadius
        });

        const segStartX = rowX + segmentInset;
        for (let i = 0; i < HUD_UPGRADE_LAYOUT.segments; i++) {
            const segX = segStartX + i * (segmentW + HUD_UPGRADE_LAYOUT.segmentGap);
            drawUpgradeSegment({
                x: segX,
                y: rowY + 4,
                width: segmentW,
                height: rowH - 8,
                color: i < row.level ? row.color : 'rgba(150, 170, 170, 0.38)',
                roundLeft: i === 0,
                roundRight: i === HUD_UPGRADE_LAYOUT.segments - 1,
                radius: edgeSegmentRadius
            });
        }

        LC.drawText({
            text: row.name,
            pos: [rowX + 10, rowY + 20],
            font: 'bold 14px Inter',
            color: 'white',
            textAlign: 'left',
            stroke: 'rgba(0,0,0,0.75)',
            strokeWidth: 2
        });

        if (canUpgrade && showUpgradeControls) {
            const now = performance.now();
            const orbX = rowX + barW - 8;
            const orbY = rowY + 8;
            const pulse = 1 + (Math.sin(now * 0.008) * 0.25);
            const ringT = (now % 1200) / 1200;
            const ringScale = 1 + (ringT * 1.6);
            const ringAlpha = 0.9 * (1 - ringT);

            LC.drawCircle({
                pos: [orbX, orbY],
                radius: 6 * pulse,
                color: 'rgba(239, 68, 68, 0.98)'
            });

            const ctx = LC.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.arc(orbX, orbY, 6 * ringScale, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha})`;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }

        if (showUpgradeControls) {
            const basePlusX = rowX + barW + plusGap;
            const basePlusY = rowY + Math.floor((rowH - plusSize) / 2);
            const isPlusHover = cursorHud.x >= basePlusX &&
                cursorHud.x <= basePlusX + plusSize &&
                cursorHud.y >= basePlusY &&
                cursorHud.y <= basePlusY + plusSize;
            const plusScale = isPlusHover ? 1.18 : 1;
            const plusDrawSize = plusSize * plusScale;
            const plusX = basePlusX - ((plusDrawSize - plusSize) / 2);
            const plusY = basePlusY - ((plusDrawSize - plusSize) / 2);
            LC.drawRect({
                pos: [plusX, plusY],
                size: [plusDrawSize, plusDrawSize],
                color: row.color,
                stroke: 'rgba(255,255,255,0.75)',
                strokeWidth: 2,
                cornerRadius: 6
            });
            LC.drawText({
                text: '+',
                pos: [plusX + (plusDrawSize / 2), plusY + (plusDrawSize / 2) + 5],
                font: '900 16px Inter',
                color: '#0f172a',
                textAlign: 'center'
            });

            hudUpgradeHitboxes.push({
                x: basePlusX,
                y: basePlusY,
                width: plusSize,
                height: plusSize,
                attrType: row.attrType
            });
        }
    });
}

function clientToHud(clientX, clientY) {
    return LC.clientToLogical(clientX, clientY);
}

export function getHudUpgradeTypeAtClientPos(clientX, clientY) {
    const pos = clientToHud(clientX, clientY);
    const hit = hudUpgradeHitboxes.find(h =>
        pos.x >= h.x &&
        pos.x <= h.x + h.width &&
        pos.y >= h.y &&
        pos.y <= h.y + h.height
    );
    return hit?.attrType || 0;
}

export function isHudUpgradePlusAtClientPos(clientX, clientY) {
    if (!hudUpgradesExpanded) return false;
    return getHudUpgradeTypeAtClientPos(clientX, clientY) > 0;
}

export function isHudUpgradeHeaderAtClientPos(clientX, clientY) {
    if (!hudUpgradeHeaderHitbox) return false;
    const pos = clientToHud(clientX, clientY);
    return pos.x >= hudUpgradeHeaderHitbox.x &&
        pos.x <= hudUpgradeHeaderHitbox.x + hudUpgradeHeaderHitbox.width &&
        pos.y >= hudUpgradeHeaderHitbox.y &&
        pos.y <= hudUpgradeHeaderHitbox.y + hudUpgradeHeaderHitbox.height;
}

export function getTopBarButtonAtClientPos(clientX, clientY) {
    if (!topBarCanvasState.visible || topBarCanvasState.buttons.length === 0) return null;
    const { x, y } = LC.clientToLogical(clientX, clientY);
    for (const btn of topBarCanvasState.buttons) {
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
            return btn;
        }
    }
    return null;
}

export function isTopBarButtonAtClientPos(clientX, clientY) {
    return !!getTopBarButtonAtClientPos(clientX, clientY);
}

export function getTopBarButtonClientRect(id) {
    return topBarCanvasState.buttons.find(btn => btn.id === id)?.clientRect || null;
}

export function isLeaderboardToggleAtClientPos(clientX, clientY) {
    const rect = leaderboardCanvasState.toggleRect;
    if (!rect) return false;
    const { x, y } = LC.clientToLogical(clientX, clientY);
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function toggleLeaderboardExpanded() {
    return setLeaderboardOpenState(!leaderboardOpen);
}

export function isMinimapToggleAtClientPos(clientX, clientY) {
    const rect = minimapCanvasState.toggleRect;
    if (!rect) return false;
    const { x, y } = LC.clientToLogical(clientX, clientY);
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function toggleMinimapOpen() {
    return setMinimapOpenState(!minimapCanvasState.open);
}

export function isSettingsCanvasInteractiveAtClientPos(clientX, clientY) {
    return isDomModalInteractiveAtClientPos(clientX, clientY, uiRefs.settingsModal);
}

export function isSettingsCanvasPanelAtClientPos(clientX, clientY) {
    return isDomModalInteractiveAtClientPos(clientX, clientY, uiRefs.settingsModal);
}

export function isShopCanvasInteractiveAtClientPos(clientX, clientY) {
    return isDomModalInteractiveAtClientPos(clientX, clientY, uiRefs.shopModal);
}

export function isShopCanvasPanelAtClientPos(clientX, clientY) {
    return isDomModalInteractiveAtClientPos(clientX, clientY, uiRefs.shopModal);
}

export function getShopCanvasBuyButtonClientRect(itemId) {
    return document.querySelector(`.buy_button[data-item-id="${CSS.escape(String(itemId))}"]`)?.getBoundingClientRect() || null;
}

function isDomModalInteractiveAtClientPos(clientX, clientY, modalEl) {
    if (!modalEl || modalEl.getClientRects().length === 0) return false;
    const rect = modalEl.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function drawHeartMistEffects() {
    const now = performance.now();
    for (let i = heartMistEffects.length - 1; i >= 0; i--) {
        const fx = heartMistEffects[i];
        const elapsed = now - fx.startTime;
        const active = elapsed < fx.duration;
        const followPlayer = ENTITIES.PLAYERS[fx.playerId];
        if (!followPlayer) {
            removeUnordered(heartMistEffects, i);
            continue;
        }
        if (!Array.isArray(fx.particles)) fx.particles = [];

        const spawnIntervalMs = 120;
        if (!fx.lastSpawnAt) fx.lastSpawnAt = now;
        if (active) {
            while (now - fx.lastSpawnAt >= spawnIntervalMs) {
                fx.lastSpawnAt += spawnIntervalMs;
                for (let s = 0; s < 3; s++) {
                    const angle = Math.random() * Math.PI * 2;
                    const bodyR = Math.max(10, followPlayer.radius || 0);
                    const minDist = bodyR * 0.6;
                    const maxDist = Math.max(minDist + 4, bodyR * 1.2);
                    const dist = minDist + (Math.random() * (maxDist - minDist));
                    const baseX = followPlayer.x + Math.cos(angle) * dist;
                    const baseY = followPlayer.y + Math.sin(angle) * dist;
                    fx.particles.push({
                        x: baseX,
                        y: baseY,
                        vx: (Math.random() * 0.06) - 0.03,
                        vy: -0.05 - (Math.random() * 0.04),
                        spawnTime: fx.lastSpawnAt,
                        lifetime: 900 + Math.random() * 500,
                        size: 14 + Math.random() * 8,
                        rot: Math.random() * Math.PI * 2,
                        spin: (Math.random() * 0.004) - 0.002
                    });
                }
            }
        }

        for (let p = fx.particles.length - 1; p >= 0; p--) {
            const particle = fx.particles[p];
            const pt = now - particle.spawnTime;
            if (pt >= particle.lifetime) {
                removeUnordered(fx.particles, p);
                continue;
            }
            const progress = Math.max(0, Math.min(1, pt / particle.lifetime));
            const alpha = 0.5 * (1 - progress);
            const px = particle.x + (particle.vx * pt);
            const py = particle.y + (particle.vy * pt);
            const size = particle.size * (1 + (Math.sin((pt * 0.01) + fx.seed) * 0.05));
            const rotation = particle.rot + (particle.spin * pt);

            LC.drawImageFast('particle_heart', px - camera.x - size / 2, py - camera.y - size / 2, size, size, rotation, alpha);
        }

        const t = Math.max(0, Math.min(1, elapsed / fx.duration));
        const pulse = 0.85 + (Math.sin((elapsed * 0.01) + fx.seed) * 0.1);
        const currentRadius = fx.radius * pulse;
        const baseAlpha = active ? Math.max(0, 1 - t) : 0;
        const centerX = followPlayer.x - camera.x;
        const centerY = followPlayer.y - camera.y;

        if (active) {
            LC.ctx.save();
            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
            LC.ctx.fillStyle = `rgba(255, 105, 180, ${Math.min(0.25, baseAlpha * 0.25)})`;
            LC.ctx.fill();

            LC.ctx.beginPath();
            LC.ctx.arc(centerX, centerY, currentRadius * 1.08, 0, Math.PI * 2);
            LC.ctx.strokeStyle = `rgba(255, 160, 210, ${Math.min(0.5, baseAlpha * 0.5)})`;
            LC.ctx.lineWidth = 3;
            LC.ctx.stroke();
            LC.ctx.restore();
        }

        if (!active && fx.particles.length === 0) {
            removeUnordered(heartMistEffects, i);
        }
    }
}

export function getShopCanvasSellDropClientRect() {
    if (!uiState.isShopOpen || uiState.activeShopTab !== 'Sell') return null;
    return document.getElementById('shop_sell_slot')?.getBoundingClientRect() || uiRefs.shopModal?.getBoundingClientRect() || null;
}

export function handleSettingsCanvasPointerDown(clientX, clientY) {
    return isDomModalInteractiveAtClientPos(clientX, clientY, uiRefs.settingsModal);
}

export function handleSettingsCanvasPointerMove(clientX, clientY) {
    return false;
}

export function handleSettingsCanvasPointerUp() {
    return false;
}

export function handleSettingsCanvasWheel(clientX, clientY, deltaY) {
    return false;
}

export function handleShopCanvasPointerDown(clientX, clientY) {
    return isDomModalInteractiveAtClientPos(clientX, clientY, uiRefs.shopModal);
}

export function handleShopCanvasPointerMove(clientX, clientY) {
    return false;
}

export function handleShopCanvasPointerUp() {
    shopCanvasState.dragActive = false;
    return false;
}

export function handleShopCanvasWheel(clientX, clientY, deltaY) {
    return false;
}

export function handleSettingsCanvasKeyDown(e) {
    return false;
}

export function handleSettingsCanvasPaste(e) {
    return false;
}

function updateSettingsSliderValue(id, x) {
    if (id !== 'viewRange') return;
    const slider = settingsCanvasState.hitboxes.find(h => h.type === 'slider' && h.data.id === 'viewRange');
    if (!slider) return;
    const t = Math.max(0, Math.min(1, (x - slider.x) / Math.max(1, slider.width)));
    const raw = VIEW_RANGE_MIN + (VIEW_RANGE_MAX - VIEW_RANGE_MIN) * t;
    const stepped = Math.round(raw / VIEW_RANGE_STEP) * VIEW_RANGE_STEP;
    setViewRangeMult(stepped);
}

export function toggleHudUpgradeBars() {
    hudUpgradesExpanded = !hudUpgradesExpanded;
}

export function onHudUpgradePointsChanged(prevPoints, nextPoints) {
    const prev = Math.max(0, Math.floor(Number.isFinite(prevPoints) ? prevPoints : 0));
    const next = Math.max(0, Math.floor(Number.isFinite(nextPoints) ? nextPoints : 0));

    // Auto-open when points increase (e.g. level-up grant).
    if (next > prev) {
        hudUpgradesExpanded = true;
        return;
    }

    // Auto-close when everything is spent.
    if (next === 0 && prev > 0) {
        hudUpgradesExpanded = false;
    }
}

export function tryUseHudUpgradeAtClientPos(clientX, clientY) {
    if (isHudUpgradeHeaderAtClientPos(clientX, clientY)) {
        playUITapSound();
        toggleHudUpgradeBars();
        return true;
    }
    const attrType = getHudUpgradeTypeAtClientPos(clientX, clientY);
    if (!attrType) return false;
    if ((Vars.myStats.availablePoints || 0) <= 0) return true;
    const now = performance.now();
    if (now - lastUpgradeRequestAt < 80) return true;
    lastUpgradeRequestAt = now;
    playUITapSound();
    sendUpgradePacket(attrType);
    hasUpgradedStats = true;
    setStoredBoolean(HAS_UPGRADED_STORAGE_KEY, true);
    return true;
}

function drawInCombatLabel() {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer) return;
    const pvpDisabled = !!myPlayer.hasShield && !Vars.inCombat;

    if (!Vars.inCombat && !pvpDisabled) return;

    LC.drawText({
        text: pvpDisabled ? 'PvP Disabled' : 'In Combat',
        pos: [LC.width / 2, LC.height - 220],
        font: 'bold 24px Inter',
        color: pvpDisabled ? '#60a5fa' : '#ff4d4d',
        textAlign: 'center'
    });
}

function clearDragOverlay() {
    if (!dragOverlayUi.canvasEl || !dragOverlayUi.ctx || !dragOverlayUi.visible) return;
    dragOverlayUi.ctx.clearRect(0, 0, dragOverlayUi.width, dragOverlayUi.height);
    dragOverlayUi.canvasEl.style.display = 'none';
    dragOverlayUi.visible = false;
}

function ensureDragOverlayCanvas() {
    if (typeof document === 'undefined') return null;
    if (!dragOverlayUi.canvasEl) {
        const canvas = document.createElement('canvas');
        canvas.id = 'item_drag_overlay';
        canvas.style.position = 'fixed';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '100003';
        canvas.style.display = 'none';
        canvas.style.background = 'transparent';
        document.body.appendChild(canvas);
        dragOverlayUi.canvasEl = canvas;
        dragOverlayUi.ctx = canvas.getContext('2d', { alpha: true });
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1);
    const height = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 1);
    if (dragOverlayUi.dpr !== dpr || dragOverlayUi.width !== width || dragOverlayUi.height !== height) {
        dragOverlayUi.dpr = dpr;
        dragOverlayUi.width = width;
        dragOverlayUi.height = height;
        dragOverlayUi.canvasEl.width = Math.round(width * dpr);
        dragOverlayUi.canvasEl.height = Math.round(height * dpr);
        dragOverlayUi.canvasEl.style.width = `${width}px`;
        dragOverlayUi.canvasEl.style.height = `${height}px`;
        dragOverlayUi.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    return dragOverlayUi.ctx;
}

function getLogicalSizeAsClientSize(width, height) {
    const start = LC.logicalToClient(0, 0);
    const end = LC.logicalToClient(width, height);
    return {
        width: Math.max(1, Math.abs(end.x - start.x)),
        height: Math.max(1, Math.abs(end.y - start.y))
    };
}

function drawDragGhostOnOverlay({ imgName, iconW, iconH, rotation = 0, transparency = 1, count = 0 }) {
    const ctx = ensureDragOverlayCanvas();
    const image = LC.images?.[imgName];
    if (!ctx || !image) return false;

    ctx.clearRect(0, 0, dragOverlayUi.width, dragOverlayUi.height);
    dragOverlayUi.canvasEl.style.display = 'block';
    dragOverlayUi.visible = true;

    const { width, height } = getLogicalSizeAsClientSize(iconW, iconH);
    const x = Vars.mouseX;
    const y = Vars.mouseY;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = transparency;
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();

    if (count > 1) {
        const textScale = Math.max(0.75, Math.min(width / Math.max(1, iconW), height / Math.max(1, iconH)));
        const text = count.toLocaleString();
        const textX = x + (width / 2) - (5 * textScale);
        const textY = y + (height / 2) - (5 * textScale);
        ctx.save();
        ctx.font = normalizeCanvasFont(`bold ${Math.max(12, 16 * textScale)}px Inter`);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = Math.max(1.5, 2 * textScale);
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'white';
        ctx.strokeText(text, textX, textY);
        ctx.fillText(text, textX, textY);
        ctx.restore();
    }

    return true;
}

function drawDraggedItem() {
    clearDragOverlay();

    if (Vars.creativeDragItemType > 0) {
        const { imgName, rotation, aspect } = getItemIconInfo(Vars.creativeDragItemType);
        const hb = HOTBAR_CONFIG;
        const maxIconSize = hb.slotSize * 1.1;
        const [iconW, iconH] = fitIconSize(maxIconSize, aspect);
        const { x, y } = LC.clientToLogical(Vars.mouseX, Vars.mouseY);

        if (drawDragGhostOnOverlay({
            imgName,
            iconW,
            iconH,
            rotation,
            transparency: 0.78,
            count: Vars.creativeDragAmount
        })) return;

        LC.drawImageFast(imgName, x - iconW / 2, y - iconH / 2, iconW, iconH, rotation, 0.78);

        if (Vars.creativeDragAmount > 1) {
            LC.drawText({
                text: Vars.creativeDragAmount.toLocaleString(),
                pos: [x + iconW / 2 - 5, y + iconH / 2 - 5],
                font: 'bold 16px Inter',
                color: 'white',
                textAlign: 'right',
                stroke: 'black',
                strokeWidth: 2
            });
        }
        return;
    }

    if (Vars.dragAccessory) {
        const accessoryKey = ACCESSORY_KEYS[Vars.dragAccessoryId];
        const accessory = accessoryKey ? dataMap.ACCESSORIES[accessoryKey] : null;
        if (!accessory) return;

        const hb = HOTBAR_CONFIG;
        const maxIconSize = hb.slotSize * 0.9;
        const aspect = (accessory.size?.[0] || 1) / (accessory.size?.[1] || 1);
        const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

        const { x, y } = LC.clientToLogical(Vars.mouseX, Vars.mouseY);

        if (drawDragGhostOnOverlay({
            imgName: accessory.name,
            iconW,
            iconH,
            rotation: 0,
            transparency: 0.75
        })) return;

        LC.drawImageFast(accessory.name, x - iconW / 2, y - iconH / 2, iconW, iconH, 0, 0.75);
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

        const { x, y } = LC.clientToLogical(Vars.mouseX, Vars.mouseY);

        if (drawDragGhostOnOverlay({
            imgName,
            iconW,
            iconH,
            rotation,
            transparency: 0.7,
            count
        })) return;

        LC.drawImageFast(imgName, x - iconW / 2, y - iconH / 2, iconW, iconH, rotation, 0.7);

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

    LC.drawRectFast(x, y, totalW, hb.slotSize + hb.padding * 2, 'rgba(0,0,0,0.5)', 1, 12);

    for (let i = 0; i < 5; i++) {
        const sx = x + hb.padding + (i * (hb.slotSize + hb.gap)), sy = y + hb.padding;
        const selected = Vars.selectedSlot === i;
        LC.drawRectFast(sx, sy, hb.slotSize, hb.slotSize, selected ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)', 1, 8);

        let rank = Vars.myInventory[i];
        if (rank > 0 && i !== Vars.dragSlot && !uiState.itemsInSellQueue.includes(i)) {
            const isThrown = rank > 127;
            const lookupType = isThrown ? rank & 0x7F : rank;
            const count = Vars.myInventoryCounts[i];

            const { imgName, rotation, aspect } = getItemIconInfo(lookupType);

            const maxIconSize = hb.slotSize - 20;
            const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

            LC.drawImageFast(imgName, sx + hb.slotSize / 2 - iconW / 2, sy + hb.slotSize / 2 - iconH / 2, iconW, iconH, rotation, isThrown ? 0.4 : 1);

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
    LC.drawRectFast(sx_more, sy_more, hb.slotSize, hb.slotSize, 'rgba(0,0,0,0.2)', 1, 8);
    LC.drawTextFast('...', sx_more + hb.slotSize / 2, sy_more + hb.slotSize / 2 + 5, 'bold 24px Inter', 'white', 'center');

    drawAccessorySlot(x, y, totalW);
    drawLevelProgressBar(x, y, totalW);
    drawAbilityCooldownBar(x, y, totalW);
}

function drawLevelProgressBar(hotbarX, hotbarY, hotbarWidth) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!myPlayer) return;
    const score = Math.max(0, Math.floor(myPlayer.score || 0));
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Vars.myStats.level || 1)));
    let levelXp = score;
    for (let l = 1; l < level; l++) {
        levelXp -= xpForLevel(l);
        if (levelXp <= 0) {
            levelXp = 0;
            break;
        }
    }
    const atLevelCap = level >= MAX_LEVEL;
    const xpNeeded = Math.max(1, xpForLevel(Math.min(level, MAX_LEVEL)));
    const targetProgress = atLevelCap ? 1 : Math.max(0, Math.min(1, levelXp / xpNeeded));
    const levelChanged = level !== hudLevelBarLevel;
    const movedBackward = score < hudLevelBarScore || targetProgress < hudLevelBarProgress;
    const shouldInterpolate = !levelChanged && !movedBackward && targetProgress > hudLevelBarProgress;

    if (!shouldInterpolate) {
        hudLevelBarProgress = targetProgress;
    } else {
        hudLevelBarProgress += (targetProgress - hudLevelBarProgress) * HUD_SCORE_LERP;
        if (Math.abs(targetProgress - hudLevelBarProgress) < 0.002) {
            hudLevelBarProgress = targetProgress;
        }
    }

    hudLevelBarScore = score;
    hudLevelBarLevel = level;
    const progress = Math.max(0, Math.min(1, hudLevelBarProgress));

    const barWidth = Math.round(hotbarWidth * 0.42);
    const barHeight = 8;
    const x = hotbarX + (hotbarWidth - barWidth) / 2;
    const y = hotbarY - 56;

    LC.drawRectFast(x, y, barWidth, barHeight, 'rgba(130, 130, 130, 0.45)', 1, 6);
    if (progress > 0.001) {
        LC.drawRectFast(x, y, barWidth * progress, barHeight, 'rgba(59, 130, 246, 0.95)', 1, 6);
    }
    LC.drawTextFast(`LVL ${level}  (${Math.round(progress * 100)}%)`, x + (barWidth / 2), y - 6, 'bold 12px Inter', isLocalPlayerInSnowBiome() ? '#4b5563' : 'white', 'center');
}

function drawAbilityCooldownBar(hotbarX, hotbarY, hotbarWidth) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    const accessoryKey = ACCESSORY_KEYS[myPlayer?.accessoryId || 0];
    const abilityAccessories = ['minotaur_hat', 'pirate_hat', 'bush_cloak', 'alien_antennas', 'dark_cloak', 'viking_hat', 'sunglasses', 'heart_shades'];
    if (!abilityAccessories.includes(accessoryKey)) return;

    const cooldownMs = Math.max(0, Vars.abilityCooldownMs || 0);
    if (cooldownMs <= 0) return;
    const remainingMs = Math.max(0, (Vars.abilityCooldownEndsAt || 0) - performance.now());
    const fillRatio = Math.max(0, Math.min(1, 1 - (remainingMs / cooldownMs)));

    const barWidth = Math.round(hotbarWidth * 0.42);
    const barHeight = 10;
    const x = hotbarX + (hotbarWidth - barWidth) / 2;
    const y = hotbarY - 18;

    LC.drawRectFast(x, y, barWidth, barHeight, 'rgba(130, 130, 130, 0.45)', 1, 6);
    LC.drawRectFast(x, y, barWidth * fillRatio, barHeight, 'rgba(220, 38, 38, 0.95)', 1, 6);

    if (fillRatio >= 0.999) {
        LC.drawTextFast(
            (isMobile || Settings.forceMobileUI) ? 'Tap ability to activate!' : 'Press F to activate your ability!',
            x + (barWidth / 2),
            y - 8,
            'bold 14px Inter',
            isLocalPlayerInSnowBiome() ? '#4b5563' : 'white',
            'center'
        );
    }
}

function drawInventory() {
    if (!uiState.isInventoryOpen) return;

    const inv = INVENTORY_CONFIG;
    const totalW = (inv.slotSize * inv.cols) + (inv.gap * (inv.cols - 1)) + (inv.padding * 2);
    const totalH = (inv.slotSize * inv.rows) + (inv.gap * (inv.rows - 1)) + (inv.padding * 2);

    const { inventoryX: x, inventoryY: y, creativeX, creativeY } = getAdminInventoryPanelPositions(totalW, totalH);

    LC.drawRectFast(x, y, totalW, totalH, inv.background, 1, inv.cornerRadius);

    for (let i = 0; i < 30; i++) {
        const col = i % inv.cols;
        const row = Math.floor(i / inv.cols);
        const slotIndex = i + 5;

        const sx = x + inv.padding + (col * (inv.slotSize + inv.gap));
        const sy = y + inv.padding + (row * (inv.slotSize + inv.gap));

        LC.drawRectFast(sx, sy, inv.slotSize, inv.slotSize, 'rgba(0,0,0,0.2)', 1, 8);

        let rank = Vars.myInventory[slotIndex];
        if (rank > 0 && slotIndex !== Vars.dragSlot && !uiState.itemsInSellQueue.includes(slotIndex)) {
            const isThrown = rank > 127;
            const lookupType = isThrown ? rank & 0x7F : rank;
            const count = Vars.myInventoryCounts[slotIndex];

            const { imgName, rotation, aspect } = getItemIconInfo(lookupType);

            const maxIconSize = inv.slotSize - 20;
            const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

            LC.drawImageFast(imgName, sx + inv.slotSize / 2 - iconW / 2, sy + inv.slotSize / 2 - iconH / 2, iconW, iconH, rotation, isThrown ? 0.4 : 1);

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

    if (Vars.isAdmin) {
        drawCreativeInventoryPanel(creativeX, creativeY, totalW, totalH);
    }
}

export function getAdminInventoryPanelPositions(totalW, totalH) {
    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    const inventoryY = centerY - (totalH / 2);
    if (!Vars.isAdmin) {
        return {
            inventoryX: centerX - (totalW / 2),
            inventoryY,
            creativeX: centerX - (totalW / 2),
            creativeY: inventoryY
        };
    }
    return {
        inventoryX: centerX - ADMIN_CREATIVE_PANEL_GAP - totalW,
        inventoryY,
        creativeX: centerX + ADMIN_CREATIVE_PANEL_GAP,
        creativeY: inventoryY
    };
}

function drawCreativeInventoryPanel(x, y, totalW, totalH) {
    const inv = INVENTORY_CONFIG;
    const rowStride = inv.slotSize + inv.gap;
    const visibleRows = inv.rows;
    const totalRows = Math.ceil(ADMIN_CREATIVE_ITEMS.length / inv.cols);
    const scrollMax = Math.max(0, (totalRows - visibleRows) * rowStride);
    adminCreativeInventoryState.scrollMax = scrollMax;
    adminCreativeInventoryState.scrollY = Math.max(0, Math.min(scrollMax, adminCreativeInventoryState.scrollY || 0));
    const scrollY = adminCreativeInventoryState.scrollY;
    const startRow = Math.max(0, Math.floor(scrollY / rowStride));
    const endRow = Math.min(totalRows, startRow + visibleRows + 2);

    LC.drawRectFast(x, y, totalW, totalH, 'rgba(0,0,0,0.45)', 1, inv.cornerRadius);
    LC.drawTextFast('ADMIN', x + 14, y - 8, 'bold 14px Inter', 'rgba(255,255,255,0.92)');

    LC.ctx.save();
    LC.ctx.beginPath();
    LC.ctx.rect(x + inv.padding, y + inv.padding, totalW - (inv.padding * 2), totalH - (inv.padding * 2));
    LC.ctx.clip();

    for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < inv.cols; col++) {
            const i = (row * inv.cols) + col;
            const sx = x + inv.padding + (col * (inv.slotSize + inv.gap));
            const sy = y + inv.padding + (row * rowStride) - scrollY;
            const item = ADMIN_CREATIVE_ITEMS[i] || null;

            LC.drawRectFast(sx, sy, inv.slotSize, inv.slotSize, 'rgba(0,0,0,0.18)', 1, 8);
            if (!item) continue;

            const { imgName, rotation, aspect } = getItemIconInfo(item.type);
            const maxIconSize = inv.slotSize - 20;
            const [iconW, iconH] = fitIconSize(maxIconSize, aspect);
            LC.drawImageFast(imgName, sx + inv.slotSize / 2 - iconW / 2, sy + inv.slotSize / 2 - iconH / 2, iconW, iconH, rotation, Vars.creativeDragItemType === item.type ? 0.4 : 1);

            if (item.amount > 1) {
                LC.drawText({
                    text: item.amount.toLocaleString(),
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

    LC.ctx.restore();

    if (scrollMax > 0) {
        const trackW = 6;
        const trackX = x + totalW - inv.padding + 1;
        const trackY = y + inv.padding;
        const trackH = totalH - (inv.padding * 2);
        const thumbH = Math.max(26, (visibleRows / totalRows) * trackH);
        const thumbTravel = Math.max(0, trackH - thumbH);
        const thumbY = trackY + ((scrollY / scrollMax) * thumbTravel);
        LC.drawRectFast(trackX, trackY, trackW, trackH, 'rgba(255,255,255,0.12)', 1, 4);
        LC.drawRectFast(trackX, thumbY, trackW, thumbH, 'rgba(255,255,255,0.55)', 1, 4);
    }
}

export function getCreativeInventorySlotAtLogicalPos(x, y) {
    if (!uiState.isInventoryOpen || !Vars.isAdmin) return -1;
    const inv = INVENTORY_CONFIG;
    const totalW = (inv.slotSize * inv.cols) + (inv.gap * (inv.cols - 1)) + (inv.padding * 2);
    const totalH = (inv.slotSize * inv.rows) + (inv.gap * (inv.rows - 1)) + (inv.padding * 2);
    const { creativeX, creativeY } = getAdminInventoryPanelPositions(totalW, totalH);

    if (x < creativeX || x > creativeX + totalW || y < creativeY || y > creativeY + totalH) return -1;
    const relX = x - creativeX - inv.padding;
    const relY = y - creativeY - inv.padding + adminCreativeInventoryState.scrollY;
    if (relX < 0 || relY < 0) return -1;
    const col = Math.floor(relX / (inv.slotSize + inv.gap));
    const row = Math.floor(relY / (inv.slotSize + inv.gap));
    if (col < 0 || col >= inv.cols || row < 0) return -1;
    const slotRelX = relX % (inv.slotSize + inv.gap);
    const slotRelY = relY % (inv.slotSize + inv.gap);
    if (slotRelX > inv.slotSize || slotRelY > inv.slotSize) return -1;
    const slot = (row * inv.cols) + col;
    return ADMIN_CREATIVE_ITEMS[slot] ? slot : -1;
}

export function getCreativeInventoryItemBySlot(slot) {
    return ADMIN_CREATIVE_ITEMS[slot] || null;
}

export function isAdminCreativeInventoryPanelAtClientPos(clientX, clientY) {
    if (!uiState.isInventoryOpen || !Vars.isAdmin) return false;
    const { x, y } = LC.clientToLogical(clientX, clientY);
    const inv = INVENTORY_CONFIG;
    const totalW = (inv.slotSize * inv.cols) + (inv.gap * (inv.cols - 1)) + (inv.padding * 2);
    const totalH = (inv.slotSize * inv.rows) + (inv.gap * (inv.rows - 1)) + (inv.padding * 2);
    const { creativeX, creativeY } = getAdminInventoryPanelPositions(totalW, totalH);
    return x >= creativeX && x <= creativeX + totalW && y >= creativeY && y <= creativeY + totalH;
}

export function handleAdminCreativeInventoryWheel(clientX, clientY, deltaY) {
    if (!isAdminCreativeInventoryPanelAtClientPos(clientX, clientY)) return false;
    if (adminCreativeInventoryState.scrollMax <= 0) return true;
    adminCreativeInventoryState.scrollY = Math.max(
        0,
        Math.min(adminCreativeInventoryState.scrollMax, adminCreativeInventoryState.scrollY + deltaY)
    );
    return true;
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
        return { imgName: 'gold_coin', rotation: 0, aspect: 1 };
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
    if (isWeaponRank(lookupType)) {
        const weapon = getWeaponConfig(lookupType);
        const [swordWidth, swordHeight] = getWeaponSize(lookupType);
        const aspect = swordWidth / swordHeight;
        return { imgName: weapon.name, rotation: -Math.PI / 4, aspect };
    }
    const objectCfg = dataMap.OBJECTS?.[lookupType];
    if (objectCfg?.imgName) {
        const aspect = (objectCfg.imgProportions?.[0] || 1) / (objectCfg.imgProportions?.[1] || 1);
        return { imgName: objectCfg.imgName, rotation: 0, aspect };
    }
    const sword = getWeaponConfig(1);
    const [swordWidth, swordHeight] = getWeaponSize(1);
    const aspect = swordWidth / swordHeight;
    return { imgName: sword.name, rotation: -Math.PI / 4, aspect };
}

function drawAccessorySlot(hotbarX, hotbarY, hotbarWidth) {
    const hb = HOTBAR_CONFIG;
    const as = ACCESSORY_SLOT_CONFIG;
    const slotX = hotbarX - as.gap - as.size;
    const slotY = hotbarY + hb.padding + (hb.slotSize - as.size) / 2;

    LC.drawRectFast(slotX - hb.padding, hotbarY, as.size + hb.padding * 2, hb.slotSize + hb.padding * 2, 'rgba(0,0,0,0.5)', 1, 12);

    LC.drawRectFast(slotX, slotY, as.size, as.size, 'rgba(0,0,0,0.2)', 1, 7);

    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    const accessoryId = myPlayer?.accessoryId || 0;
    const accessoryKey = ACCESSORY_KEYS[accessoryId];
    const accessory = accessoryKey ? dataMap.ACCESSORIES[accessoryKey] : null;
    if (!accessory) return;
    if (Vars.dragAccessory && Vars.dragAccessoryId === accessoryId) return;

    const maxIconSize = as.size - 10;
    const aspect = (accessory.size?.[0] || 1) / (accessory.size?.[1] || 1);
    const [iconW, iconH] = fitIconSize(maxIconSize, aspect);

    LC.drawImageFast(accessory.name, slotX + as.size / 2 - iconW / 2, slotY + as.size / 2 - iconH / 2, iconW, iconH);
}

function drawPulsingTutorialArrow(ctx, tipX, tipY, dirX, dirY) {
    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) return;
    const ux = dirX / len;
    const uy = dirY / len;
    const size = 16;
    const halfBase = 8;
    const baseX = tipX - (ux * size);
    const baseY = tipY - (uy * size);
    const perpX = -uy;
    const perpY = ux;
    const pulse = 0.78 + ((Math.sin(performance.now() * 0.009) + 1) * 0.1);

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + (perpX * halfBase), baseY + (perpY * halfBase));
    ctx.lineTo(baseX - (perpX * halfBase), baseY - (perpY * halfBase));
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 48, 48, ${pulse})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
}

function drawMobileButtons(lp) {
    const drawBtn = (config, label, active) => {
        const bx = LC.width - config.xOffset;
        const by = LC.height - config.yOffset;
        const alpha = active ? 0.6 : 0.2;
        LC.drawCircleFast(bx, by, config.radius, `rgba(0,0,0,${alpha})`, 1, true, true, active ? 'white' : 'rgba(255,255,255,0.2)', 2);
        LC.drawTextFast(label, bx, by + 5, `bold ${config.radius * 0.4}px Inter`, active ? 'white' : 'rgba(255,255,255,0.2)', 'center');
    };

    const canSwingSelectedWeapon = lp.hasWeapon && !isBoomerangType((lp.weaponRank || 0) & 0x7F);
    drawBtn(THROW_BTN_CONFIG, 'THROW', lp.hasWeapon && isTutorialMobileActionEnabled('throw'));
    drawBtn(ATTACK_BTN_CONFIG, 'ATTACK', canSwingSelectedWeapon && isTutorialMobileActionEnabled('attack'));
    drawBtn(PICKUP_BTN_CONFIG, 'PICKUP', isTutorialMobileActionEnabled('pickup'));
    drawBtn(DROP_BTN_CONFIG, 'DROP', isTutorialMobileActionEnabled('drop'));
}

export function isTutorialMobileActionEnabled(action) {
    if (!isMobile || CURRENT_WORLD !== WORLD_TUTORIAL || !Vars.tutorialObjectiveVisible) return true;
    const step = Vars.tutorialObjectiveStep;
    if (action === 'attack') return step >= 1;
    if (action === 'throw') return step >= 2;
    if (action === 'pickup') return step >= 4;
    if (action === 'drop') return false;
    return true;
}

function updateJoinButton() {
    const cooldown = isJoinActionOnCooldown();
    const buttons = [document.getElementById('joinBtn'), document.getElementById('tutorialBtn')];
    for (const btn of buttons) {
        if (!btn) continue;
        btn.disabled = cooldown;
        btn.style.opacity = cooldown ? '0.5' : '1';
        btn.style.pointerEvents = cooldown ? 'none' : 'auto';
    }
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
const gameHudEl = document.getElementById('game_hud');
const joinBtn = document.getElementById('joinBtn');
const tutorialBtn = document.getElementById('tutorialBtn');
const usernameInput = document.getElementById('homeUsrnInput');
const passwordInput = document.getElementById('homePassInput');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const accountStatusEl = document.getElementById('account_status');
const accountStatsEl = document.getElementById('account_stats');
const accountTotalKillsEl = document.getElementById('account_total_kills');
const accountTotalDeathsEl = document.getElementById('account_total_deaths');
const accountKdRatioEl = document.getElementById('account_kd_ratio');
const accountTotalPlayTimeEl = document.getElementById('account_total_playtime');
if (usernameInput) usernameInput.value = getStoredAccountUsername() || localStorage.username || '';
const respawnBtn = document.getElementById('respawnBtn');
const respawnHomeBtn = document.getElementById('respawnHomeBtn');

export function startJoinActionCooldown(ms = JOIN_ACTION_COOLDOWN_MS) {
    const until = performance.now() + Math.max(0, ms);
    Vars.joinActionLockedUntil = Math.max(Vars.joinActionLockedUntil || 0, until);
}

function isJoinActionOnCooldown() {
    return performance.now() < (Vars.joinActionLockedUntil || 0);
}

function clearPendingSpectateDelay() {
    Vars.pauseSpectateStartAt = 0;
    if (uiState.isPaused) return;
    Vars.deathSpectateStartAt = 0;
    Vars.deathSpectateTargetId = 0;
    Vars.deathSpectateUntil = 0;
}

const tryJoin = () => {
    if (uiState.isPaused) return;
    if (isJoinActionOnCooldown()) return;
    if (!ws || ws.readyState !== ws.OPEN) return;

    clearPendingSpectateDelay();
    startJoinActionCooldown();
    uiState.pendingJoin = true;
    uiState.pendingJoinStartedAt = performance.now();
    uiState.pendingPause = false;
    uiState.pendingPauseStartedAt = 0;
    const username = getStoredAccountUsername() || usernameInput?.value || localStorage.username || '';
    const joinWorld = pendingJoinWorld || CURRENT_WORLD;
    ws.send(encodeUsername(username, getStoredAccountAuthToken(), joinWorld));
    LC.zoomIn();
    updateJoinButton();
    updateRespawnButton();
};

function chooseWorldForJoin(desiredWorld = null) {
    return chooseWorldForJoinAsync(desiredWorld);
}

async function chooseWorldForJoinAsync(desiredWorld = null) {
    try {
        if (CURRENT_WORLD === WORLD_ROOT_DIMENSION || CURRENT_WORLD === WORLD_YETI_DIMENSION || CURRENT_WORLD === WORLD_DUNE_DIMENSION || CURRENT_WORLD === WORLD_INFERNO_DIMENSION) {
            localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
            localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
            setCurrentWorld(WORLD_MAIN);
            return true;
        }

        if (desiredWorld === WORLD_MAIN || desiredWorld === WORLD_TUTORIAL) {
            pendingJoinWorld = desiredWorld;
            localStorage.setItem(WORLD_STORAGE_KEY, desiredWorld);
            localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
            setCurrentWorld(desiredWorld);
            return true;
        }

        if (localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY) === '1') {
            pendingJoinWorld = WORLD_MAIN;
            localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
            localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
            setCurrentWorld(WORLD_MAIN);
            return true;
        }

        const storedWorldChoice = getStoredWorldChoice();
        if (storedWorldChoice === WORLD_MAIN || CURRENT_WORLD === WORLD_MAIN) {
            pendingJoinWorld = WORLD_MAIN;
            localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
            localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
            setCurrentWorld(WORLD_MAIN);
            return true;
        }

        pendingJoinWorld = WORLD_MAIN;
        localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
        localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
        setCurrentWorld(WORLD_MAIN);
        return true;
    } catch (e) {
        pendingJoinWorld = WORLD_MAIN;
        setCurrentWorld(WORLD_MAIN);
        return true;
    }
}

if (joinBtn) {
    joinBtn.onclick = async () => {
        if (worldChoiceInProgress) return;
        if (isJoinActionOnCooldown()) {
            updateJoinButton();
            return;
        }
        localStorage.username = getStoredAccountUsername() || usernameInput.value;
        worldChoiceInProgress = true;
        const canJoin = await chooseWorldForJoin(WORLD_MAIN);
        worldChoiceInProgress = false;
        if (!canJoin) return;
        uiState.forceHomeScreen = false;
        uiState.isPaused = false;
        clearPendingSpectateDelay();
        tryJoin();
    };
}

if (tutorialBtn) {
    tutorialBtn.onclick = async () => {
        if (worldChoiceInProgress) return;
        if (isJoinActionOnCooldown()) {
            updateJoinButton();
            return;
        }
        localStorage.username = getStoredAccountUsername() || usernameInput.value;
        worldChoiceInProgress = true;
        const canJoin = await chooseWorldForJoin(WORLD_TUTORIAL);
        worldChoiceInProgress = false;
        if (!canJoin) return;
        uiState.forceHomeScreen = false;
        uiState.isPaused = false;
        clearPendingSpectateDelay();
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
            localStorage.username = getStoredAccountUsername() || usernameInput.value || localStorage.username || '';
        }
        if (CURRENT_WORLD === WORLD_ROOT_DIMENSION || CURRENT_WORLD === WORLD_YETI_DIMENSION || CURRENT_WORLD === WORLD_DUNE_DIMENSION || CURRENT_WORLD === WORLD_INFERNO_DIMENSION) {
            localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
            localStorage.setItem(WORLD_CHOICE_MADE_STORAGE_KEY, '1');
        }
        uiState.forceHomeScreen = false;
        uiState.isPaused = false;
        clearPendingSpectateDelay();
        tryJoin();
    };
}

if (respawnHomeBtn) {
    respawnHomeBtn.onclick = () => {
        const homeScreen = document.getElementById('home_screen');
        const respawnScreen = document.getElementById('respawn_screen');
        closeHomeScreenBlockingUI();
        if (homeScreen) homeScreen.style.display = 'flex';
        hideDeathMenu(respawnScreen);
        uiState.pendingJoin = false;
        uiState.pendingJoinStartedAt = 0;
        uiState.pendingPause = false;
        uiState.pendingPauseStartedAt = 0;
        uiState.forceHomeScreen = true;
    };
}

setupAccountAuthUI({
    usernameInput,
    passwordInput,
    loginButton: loginBtn,
    signupButton: signupBtn,
    logoutButton: logoutBtn,
    statusEl: accountStatusEl,
    statsEl: accountStatsEl,
    totalKillsEl: accountTotalKillsEl,
    totalDeathsEl: accountTotalDeathsEl,
    kdRatioEl: accountKdRatioEl,
    totalPlayTimeEl: accountTotalPlayTimeEl,
    showNotification,
    onAccountSessionChange: (session) => {
        if (session?.token) {
            if (ws.readyState === ws.OPEN) {
                sendAuthSessionPacket(session.token);
            }
            if (usernameInput) usernameInput.value = session.username;
            localStorage.username = session.username;
        } else if (ws.readyState === ws.OPEN) {
            sendAuthSessionPacket('');
        }
    }
});

(async () => {
    initializeUI();
    ensureKeyHintElement();
    requestAnimationFrame(render);
    await loadAssets();

    // FPS Tracker
    let frames = 0;
    setInterval(() => { TPS.clientReal = frames; frames = 0; }, 1000);
    setInterval(() => {
        Vars.netPps = incomingPacketsThisSecond;
        Vars.netTps = incomingUpdatePacketsThisSecond;
        Vars.netAupbs = incomingUpdatePacketsThisSecond > 0
            ? Math.round(incomingUpdatePacketBytesThisSecond / incomingUpdatePacketsThisSecond)
            : 0;
        incomingPacketsThisSecond = 0;
        incomingUpdatePacketsThisSecond = 0;
        incomingUpdatePacketBytesThisSecond = 0;
    }, 1000);
    const countFps = () => { frames++; requestAnimationFrame(countFps); };
    requestAnimationFrame(countFps);

    try {
        if (localStorage.getItem(AUTO_JOIN_STORAGE_KEY) === '1') {
            localStorage.removeItem(AUTO_JOIN_STORAGE_KEY);
            const performAutoJoin = () => {
                uiState.forceHomeScreen = false;
                uiState.isPaused = false;
                clearPendingSpectateDelay();
                tryJoin();
            };
            if (ws.readyState === ws.OPEN) {
                performAutoJoin();
            } else {
                ws.addEventListener('open', performAutoJoin, { once: true });
            }
        }
    } catch (e) {
        // Ignore storage errors.
    }
})();
