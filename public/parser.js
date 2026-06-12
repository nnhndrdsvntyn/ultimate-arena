import {
    ENTITIES,
    MAP_SIZE,
    setMapSize,
    resetEntities
} from './game.js';
import {
    Player
} from './player.js';
import {
    Mob
} from './mob.js';
import {
    Projectile
} from './projectile.js';
import {
    Structure
} from './structure.js';
import {
    GameObject
} from './object.js';
import {
    showNotification,
    uiState,
    closeHomeScreenBlockingUI,
    updateSettingsBody,
    updateShopBody,
    isMobile,
    appendChatMessage,
    setHomeLeaderboardsLoading,
    updateHomeLeaderboards
} from './ui.js';
import { sendTutorialEvent } from './helpers.js';
import { applyLiveAccountDeathIncrement, applyLiveAccountKillDelta, clearStoredAccountSession, updateAccountProfileFromServer } from './auth/client_auth.js';
import {
    Vars,
    LC,
    CURRENT_WORLD,
    startJoinActionCooldown,
    onHudUpgradePointsChanged,
    addDamageIndicator,
    addCriticalHitIndicator,
    spawnMobDeathFade,
    spawnCoinPickupVfxToPlayer,
    spawnEnergyBurstFx,
    spawnPoisonAoeFx,
    spawnInfernoBeamFx,
    spawnIntimidationFx,
    spawnHeartMistFx,
    spawnBlindnessFx,
    spawnLightningShotFx,
    spawnSmokeAoeFx,
    spawnSeededChestCoins,
    clearSeededChestCoinVisuals,
    clearGroundLootVisuals,
    startBossIntroCountdown,
    setCurrentWorld,
    setPendingJoinWorld,
    ensureFullWorldAssetsLoaded,
    resetTransientWorldVisuals,
    suppressNextKeyHintAutoShow,
    DEATH_SPECTATE_START_DELAY_MS
} from './client.js';
import { setStoredAdminKey } from './admin_key.js';
import { updateShopAttentionIndicator } from './ui/shop.js';
import {
    dataMap,
    isSwordRank,
    isChestObjectType,
    isCoinObjectType
} from './shared/datamap.js';
import { generateSeededStructureLayout } from './shared/structure_layout.js';
import { WORLD_ROOT_DIMENSION, WORLD_YETI_DIMENSION, WORLD_DUNE_DIMENSION, WORLD_INFERNO_DIMENSION, WORLD_MAIN } from './shared/worlds.js';

const WORLD_STORAGE_KEY = 'ua_world';

// --- Packet Type Map ---
const PACKET_TYPES = {
    INIT: 1,
    UPDATE: 2,
    LEADERBOARD: 5,
    DIED: 6,
    AUDIO: 7,
    KICKED: 8,
    PING: 9,
    UPGRADE: 10,
    ADMIN_AUTH: 11,
    INVENTORY: 15,
    STATS: 18,
    PLAYER_COUNT: 20,
    LIGHTNING_SHOT_FX: 21,
    COIN_PICKUP_FX: 22,
    ENERGY_BURST_FX: 23,
    CRITICAL_HIT_FX: 24,
    POISON_AOE_FX: 25,
    INTIMIDATION_AOE_FX: 32,
    TUTORIAL_OBJECTIVE: 26,
    TUTORIAL_COMPLETE: 27,
    STRUCTURE_ADD: 28,
    STRUCTURE_REMOVE: 29,
    BLINDNESS_FX: 30,
    SMOKE_AOE_FX: 31,
    HEART_MIST_FX: 34,
    CHAT_FEED: 35,
    ACCOUNT_LEADERBOARDS: 36,
    ADMIN_STATE: 37,
    ACCOUNT_PROFILE: 38,
    SERVER_NOTICE: 39,
    COLLISION_DEBUG: 40,
    BOSS_INTRO_COUNTDOWN: 41,
    COIN_SNAPSHOT: 42,
    GROUND_LOOT_CLEAR: 43,
    INFERNO_BEAM_FX: 44
};

const UPDATE_SECTION_STRUCTURES = 83; // "S"
const PLAYER_SKIN_TONES = ['#e9c6a5', '#d8a77e', '#b97c56', '#8d5a3c', '#5c3b2e'];
const DEFAULT_PLAYER_SKIN = 2;
const TWO_PI = Math.PI * 2;
const PLAYER_MASK_X = 0x0001;
const PLAYER_MASK_Y = 0x0002;
const PLAYER_MASK_ANGLE = 0x0004;
const PLAYER_MASK_HP = 0x0008;
const PLAYER_MASK_MAX_HP = 0x0010;
const PLAYER_MASK_SCORE = 0x0020;
const PLAYER_MASK_WEAPON = 0x0040;
const PLAYER_MASK_SWING = 0x0080;
const PLAYER_MASK_STATUS = 0x0100;
const PLAYER_MASK_CHAT = 0x0200;
const PLAYER_MASK_USERNAME = 0x0400;
const PLAYER_MASK_ACCESSORY = 0x0800;
const PLAYER_MASK_FROZEN = 0x1000;
const PLAYER_MASK_FULL = 0x8000;
const MOB_MASK_FULL = 0x8000;
const MOB_MASK_X = 0x0001;
const MOB_MASK_Y = 0x0002;
const MOB_MASK_ANGLE = 0x0004;
const MOB_MASK_HP = 0x0008;
const MOB_MASK_MAX_HP = 0x0010;
const MOB_MASK_TYPE = 0x0020;
const MOB_MASK_SWING = 0x0040;
const MOB_MASK_FROZEN = 0x0080;

function unpackAngleU16(packed = 0) {
    const safe = Math.max(0, Math.min(65535, Number(packed) | 0));
    return (safe / 65535) * TWO_PI;
}

function unpackPlayerStatusByte(packed = 0) {
    const safe = Math.max(0, Math.min(255, Number(packed) | 0));
    return {
        hasWeapon: !!(safe & 0x01),
        hasShield: !!(safe & 0x02),
        isAlive: !!(safe & 0x04),
        isInvisible: !!(safe & 0x08),
        skinColor: DEFAULT_PLAYER_SKIN
    };
}

function unpackPlayerSkin(skinValue) {
    const safe = Number(skinValue) | 0;
    return safe >= 0 && safe < PLAYER_SKIN_TONES.length ? safe : DEFAULT_PLAYER_SKIN;
}

function skinColorFromIndex(skinValue) {
    return PLAYER_SKIN_TONES[unpackPlayerSkin(skinValue)] || PLAYER_SKIN_TONES[DEFAULT_PLAYER_SKIN];
}

function triggerDamageIndicator(prevHp, newHp, x, y, radius = 0) {
    if (!Number.isFinite(prevHp)) return;
    const nextHp = Number.isFinite(newHp) ? newHp : 0;
    const delta = prevHp - nextHp;
    if (delta <= 0) return;
    const { px, py } = jitterOnEntity(x, y, radius);
    addDamageIndicator(px, py, delta);
}

function applyFrozenRemaining(entity, remainingMs) {
    if (!entity) return;
    const safeMs = Math.max(0, Math.min(65535, Number(remainingMs) || 0));
    entity.frozenUntil = safeMs > 0 ? performance.now() + safeMs : 0;
}

function jitterOnEntity(x, y, radius) {
    if (!radius || radius <= 0) {
        return { px: x, py: y };
    }
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius * 0.75;
    return {
        px: x + Math.cos(angle) * dist,
        py: y + Math.sin(angle) * dist
    };
}

function handleStructureAddPacket(reader) {
    const id = reader.readU16();
    const x = reader.readU16();
    const y = reader.readU16();
    const type = reader.readU8();
    if (!dataMap.STRUCTURES[type]) return;
    if (ENTITIES.STRUCTURES[id]) return;
    new Structure(id, x, y, type);
}

function handleStructureRemovePacket(reader) {
    const id = reader.readU16();
    const existing = ENTITIES.STRUCTURES[id];
    if (!existing) return;
    delete ENTITIES.STRUCTURES[id];
    // Optional: clear any cached references if needed
}

function handleChatFeedPacket(reader) {
    const username = reader.readString();
    const message = reader.readString();
    appendChatMessage(username, message);
}

function handleCollisionDebugPacket(reader) {
    Vars.latestCollisionDebugType = reader.readU8();
    Vars.latestCollisionDebugId = reader.readU32();
}

function handleBossIntroCountdownPacket(reader) {
    const durationMs = reader.readU16();
    const introViewRangeMult = reader.offset + 1 <= reader.view.byteLength ? reader.readU8() : 3;
    const fightViewRangeMult = reader.offset + 1 <= reader.view.byteLength ? reader.readU8() : 1;
    startBossIntroCountdown(durationMs, introViewRangeMult, fightViewRangeMult);
}

function peekU8(reader) {
    if (reader.offset >= reader.view.byteLength) return null;
    return reader.view.getUint8(reader.offset);
}

function applyStructureUpdate(id, x, y, type, radius, isFullUpdate) {
    let structure = ENTITIES.STRUCTURES[id];
    if (!structure) {
        if (!isFullUpdate || !dataMap.STRUCTURES[type]) return;
        structure = new Structure(id, x, y, type);
    }

    if (Number.isFinite(x)) structure.newX = x;
    if (Number.isFinite(y)) structure.newY = y;
    if (dataMap.STRUCTURES[type]) {
        structure.type = type;
    }
    if (Number.isFinite(radius) && radius > 0) {
        structure.radius = radius;
    } else if (dataMap.STRUCTURES[structure.type]?.radius) {
        structure.radius = dataMap.STRUCTURES[structure.type].radius;
    }
}

function handleStructureUpdatesSection(reader) {
    if (reader.offset + 2 > reader.view.byteLength) return;
    const count = reader.readU16();
    for (let i = 0; i < count; i++) {
        if (reader.offset + 3 > reader.view.byteLength) return;
        const id = reader.readU16();
        const mask = reader.readU8();
        let x = NaN;
        let y = NaN;
        let type = ENTITIES.STRUCTURES[id]?.type;
        let radius = ENTITIES.STRUCTURES[id]?.radius;

        if (mask & 0x80) {
            if (reader.offset + 7 > reader.view.byteLength) return;
            x = reader.readU16();
            y = reader.readU16();
            type = reader.readU8();
            radius = reader.readU16();
            applyStructureUpdate(id, x, y, type, radius, true);
            continue;
        }

        if (mask & 0x01) {
            if (reader.offset + 2 > reader.view.byteLength) return;
            x = reader.readU16();
        }
        if (mask & 0x02) {
            if (reader.offset + 2 > reader.view.byteLength) return;
            y = reader.readU16();
        }
        if (mask & 0x04) {
            if (reader.offset + 1 > reader.view.byteLength) return;
            type = reader.readU8();
        }
        if (mask & 0x08) {
            if (reader.offset + 2 > reader.view.byteLength) return;
            radius = reader.readU16();
        }
        applyStructureUpdate(id, x, y, type, radius, false);
    }
}

function skipPlayerDelta(reader, mask) {
    if (mask & PLAYER_MASK_X) reader.readU16();
    if (mask & PLAYER_MASK_Y) reader.readU16();
    if (mask & PLAYER_MASK_ANGLE) reader.readU16();
    if (mask & PLAYER_MASK_HP) reader.readU16();
    if (mask & PLAYER_MASK_MAX_HP) reader.readU16();
    if (mask & PLAYER_MASK_SCORE) reader.readU32();
    if (mask & PLAYER_MASK_WEAPON) reader.readU8();
    if (mask & PLAYER_MASK_SWING) reader.readU8();
    if (mask & PLAYER_MASK_STATUS) reader.readU8();
    if (mask & PLAYER_MASK_CHAT) reader.readString();
    if (mask & PLAYER_MASK_USERNAME) reader.readString();
    if (mask & PLAYER_MASK_ACCESSORY) reader.readU8();
    if (mask & PLAYER_MASK_FROZEN) reader.readU16();
}

function skipMobDelta(reader, mask) {
    if (mask & MOB_MASK_X) reader.readU16();
    if (mask & MOB_MASK_Y) reader.readU16();
    if (mask & MOB_MASK_ANGLE) reader.readU16();
    if (mask & MOB_MASK_HP) reader.readU16();
    if (mask & MOB_MASK_MAX_HP) reader.readU16();
    if (mask & MOB_MASK_TYPE) reader.readU8();
    if (mask & MOB_MASK_SWING) reader.readU8();
    if (mask & MOB_MASK_FROZEN) reader.readU16();
}

function skipProjectileDelta(reader, mask) {
    if (mask & 0x01) reader.readU16();
    if (mask & 0x02) reader.readU16();
    if (mask & 0x04) reader.readU16();
    if (mask & 0x08) reader.readI8();
    if (mask & 0x10) reader.readU8();
    if (mask & 0x20) reader.readU16();
    if (mask & 0x40) reader.readU16();
}

function skipObjectDelta(reader, mask) {
    if (mask & 0x01) reader.readU16();
    if (mask & 0x02) reader.readU16();
    if (mask & 0x04) reader.readU16();
    if (mask & 0x08) reader.readI8();
    if (mask & 0x10) reader.readU32();
}

export function parsePacket(buffer) {
    const reader = new PacketReader(buffer);
    const packetType = reader.readU8();

    switch (packetType) {
        case PACKET_TYPES.INIT:
            handleInitPacket(reader);
            break;
        case PACKET_TYPES.UPDATE:
            handleUpdatePacket(reader);
            break;
        case PACKET_TYPES.LEADERBOARD:
            handleLeaderboardPacket(reader);
            break;
        case PACKET_TYPES.DIED:
            handleDiedPacket(reader);
            break;
        case PACKET_TYPES.AUDIO:
            handleAudioPacket(reader);
            break;
        case PACKET_TYPES.KICKED:
            handleKickedPacket(reader);
            break;
        case PACKET_TYPES.PING:
            handlePingPacket();
            break;
        case PACKET_TYPES.UPGRADE:
            handleUpgradePacket(reader);
            break;
        case PACKET_TYPES.ADMIN_AUTH:
            handleAdminAuthPacket(reader);
            break;
        case PACKET_TYPES.INVENTORY:
            handleInventoryPacket(reader);
            break;
        case PACKET_TYPES.STATS:
            handleStatsPacket(reader);
            break;
        case PACKET_TYPES.PLAYER_COUNT:
            handlePlayerCountPacket(reader);
            break;
        case PACKET_TYPES.LIGHTNING_SHOT_FX:
            handleLightningShotFxPacket(reader);
            break;
        case PACKET_TYPES.COIN_PICKUP_FX:
            handleCoinPickupFxPacket(reader);
            break;
        case PACKET_TYPES.ENERGY_BURST_FX:
            handleEnergyBurstFxPacket(reader);
            break;
        case PACKET_TYPES.CRITICAL_HIT_FX:
            handleCriticalHitFxPacket(reader);
            break;
        case PACKET_TYPES.POISON_AOE_FX:
            handlePoisonAoeFxPacket(reader);
            break;
        case PACKET_TYPES.INTIMIDATION_AOE_FX:
            handleIntimidationFxPacket(reader);
            break;
        case PACKET_TYPES.SMOKE_AOE_FX:
            handleSmokeAoeFxPacket(reader);
            break;
        case PACKET_TYPES.HEART_MIST_FX:
            handleHeartMistFxPacket(reader);
            break;
        case PACKET_TYPES.CHAT_FEED:
            handleChatFeedPacket(reader);
            break;
        case PACKET_TYPES.ACCOUNT_LEADERBOARDS:
            handleAccountLeaderboardsPacket(reader);
            break;
        case PACKET_TYPES.ADMIN_STATE:
            handleAdminStatePacket(reader);
            break;
        case PACKET_TYPES.ACCOUNT_PROFILE:
            handleAccountProfilePacket(reader);
            break;
        case PACKET_TYPES.SERVER_NOTICE:
            handleServerNoticePacket(reader);
            break;
        case PACKET_TYPES.BLINDNESS_FX:
            handleBlindnessFxPacket(reader);
            break;
        case PACKET_TYPES.TUTORIAL_OBJECTIVE:
            handleTutorialObjectivePacket(reader);
            break;
        case PACKET_TYPES.TUTORIAL_COMPLETE:
            handleTutorialCompletePacket();
            break;
        case PACKET_TYPES.STRUCTURE_ADD:
            handleStructureAddPacket(reader);
            break;
        case PACKET_TYPES.STRUCTURE_REMOVE:
            handleStructureRemovePacket(reader);
            break;
        case PACKET_TYPES.COLLISION_DEBUG:
            handleCollisionDebugPacket(reader);
            break;
        case PACKET_TYPES.BOSS_INTRO_COUNTDOWN:
            handleBossIntroCountdownPacket(reader);
            break;
        case PACKET_TYPES.COIN_SNAPSHOT:
            handleCoinSnapshotPacket(reader);
            break;
        case PACKET_TYPES.GROUND_LOOT_CLEAR:
            clearGroundLootVisuals();
            break;
        case PACKET_TYPES.INFERNO_BEAM_FX:
            handleInfernoBeamFxPacket(reader);
            break;
        default:
            // console.warn(`Unknown packet type: ${packetType}`);
            break;
    }
}

// --- Packet Handlers ---

function handleInitPacket(reader) {
    const worldId = reader.readString();
    const worldWidth = reader.readU16();
    const worldHeight = reader.readU16();
    const previousWorld = CURRENT_WORLD;
    uiState.dimensionTransitionUntil = 0;
    if (previousWorld && previousWorld !== worldId) {
        suppressNextKeyHintAutoShow();
    }
    setCurrentWorld(worldId);
    if (worldId === 'tutorial' || worldId === 'main') {
        setPendingJoinWorld(worldId);
    }
    if (worldId !== 'tutorial') {
        ensureFullWorldAssetsLoaded().catch((error) => {
            console.error('Failed to load full world assets after init:', error);
        });
    }
    setMapSize(worldWidth, worldHeight);
    resetEntities();
    resetTransientWorldVisuals();
    Vars.latestCollisionDebugType = 0;
    Vars.latestCollisionDebugId = 0;

    // Players
    const playerCount = reader.readU8();
    for (let i = 0; i < playerCount; i++) {
        const id = reader.readU8();
        const x = reader.readU16();
        const y = reader.readU16();
        const angle = reader.readF32();
        const username = reader.readString();
        const skinColor = DEFAULT_PLAYER_SKIN;

        const player = new Player(id, x, y);
        player.angle = angle;
        player.username = username;
        player.skinColor = skinColor;
        player.color = skinColorFromIndex(skinColor);
    }

    // Mobs
    const mobCount = reader.readU16();
    for (let i = 0; i < mobCount; i++) {
        const id = reader.readU16();
        const x = reader.readU16();
        const y = reader.readU16();
        const angle = reader.readF32();
        const type = reader.readI8();

        const mob = new Mob(id, x, y, type);
        mob.angle = angle;
    }

    // Structures
    const structureEncoding = reader.readU8();
    if (structureEncoding === 1) {
        const structureSeed = reader.readU32();
        const layout = generateSeededStructureLayout(structureSeed, MAP_SIZE, {
            rockCount: 78,
            smallRockCount: 32,
            bigRockCountPerBiome: 2,
            treeCount: 48,
            treeCountPerBiome: 12
        });
        for (const structure of layout) {
            new Structure(structure.id, structure.x, structure.y, structure.type);
        }
        Vars.structureSeed = structureSeed >>> 0;
        // console.log(`[INIT] structure seed=${Vars.structureSeed} structures=${layout.length}`);
    } else {
        const structureCount = reader.readU16();
        for (let i = 0; i < structureCount; i++) {
            const id = reader.readU16();
            const x = reader.readU16();
            const y = reader.readU16();
            const type = reader.readI8();

            new Structure(id, x, y, type);
        }
        Vars.structureSeed = null;
    }

    // Objects
    const objectCount = reader.readU16();
    for (let i = 0; i < objectCount; i++) {
        const id = reader.readU16();
        const x = reader.readU16();
        const y = reader.readU16();
        const type = reader.readI8();

        new GameObject(id, x, y, type);
    }
}

function handleUpdatePacket(reader) {
    // Update Players
    const playerCount = reader.readU8();
    const playerIdsThisUpdate = new Set();
    for (let i = 0; i < playerCount; i++) {
        const id = reader.readU8();
        playerIdsThisUpdate.add(id);
        const mask = reader.readU16();
        let p = ENTITIES.PLAYERS[id];
        const prevPlayerHp = p?.health;

        if (mask & PLAYER_MASK_FULL) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const angle = unpackAngleU16(reader.readU16());
            const hp = reader.readU16();
            const maxHp = reader.readU16();
            const score = reader.readU32();
            const weaponRank = reader.readU8();
            const swingState = reader.readU8();
            const status = unpackPlayerStatusByte(reader.readU8());
            const accessoryId = reader.readU8();
            const frozenRemainingMs = reader.readU16();
            const packedRadius = reader.readU16();
            const username = reader.readString();
            const chatMessage = reader.readString();
            const botRoleCode = packedRadius >> 13;
            const radius = packedRadius & 0x1FFF;

            if (!p) p = new Player(id, x, y);
            p.newX = x;
            p.newY = y;
            p.newAngle = angle;
            p.health = hp;
            p.maxHealth = maxHp;
            p.newScore = score;
            p.weaponRank = weaponRank;
            p.newSwingState = swingState;
            p.hasShield = status.hasShield;
            p.isAlive = status.isAlive;
            p.hasWeapon = status.hasWeapon;
            p.accessoryId = accessoryId;
            p.isInvisible = status.isInvisible;
            p.radius = radius;
            p.botRoleCode = botRoleCode;
            p.isBot = botRoleCode > 0;
            p.username = username;
            p.chatMessage = chatMessage;
            p.skinColor = status.skinColor;
            p.color = skinColorFromIndex(status.skinColor);
            applyFrozenRemaining(p, frozenRemainingMs);
            triggerDamageIndicator(prevPlayerHp, hp, x, y, dataMap.PLAYERS.baseRadius);
        } else { // Delta Update
            if (!p) {
                skipPlayerDelta(reader, mask);
                continue;
            }
            if (mask & PLAYER_MASK_X) p.newX = reader.readU16();
            if (mask & PLAYER_MASK_Y) p.newY = reader.readU16();
            if (mask & PLAYER_MASK_ANGLE) p.newAngle = unpackAngleU16(reader.readU16());
            if (mask & PLAYER_MASK_HP) {
                const newHp = reader.readU16();
                triggerDamageIndicator(p.health, newHp, p.newX ?? p.x ?? 0, p.newY ?? p.y ?? 0, p.radius || dataMap.PLAYERS.baseRadius);
                p.health = newHp;
            }
            if (mask & PLAYER_MASK_MAX_HP) p.maxHealth = reader.readU16();
            if (mask & PLAYER_MASK_SCORE) p.newScore = reader.readU32();
            if (mask & PLAYER_MASK_WEAPON) p.weaponRank = reader.readU8();
            if (mask & PLAYER_MASK_SWING) p.newSwingState = reader.readU8();
            if (mask & PLAYER_MASK_STATUS) {
                const status = unpackPlayerStatusByte(reader.readU8());
                p.hasWeapon = status.hasWeapon;
                p.hasShield = status.hasShield;
                p.isAlive = status.isAlive;
                p.isInvisible = status.isInvisible;
                p.skinColor = status.skinColor;
                p.color = skinColorFromIndex(p.skinColor);
            }
            if (mask & PLAYER_MASK_CHAT) p.chatMessage = reader.readString();
            if (mask & PLAYER_MASK_USERNAME) p.username = reader.readString();
            if (mask & PLAYER_MASK_ACCESSORY) p.accessoryId = reader.readU8();
            if (mask & PLAYER_MASK_FROZEN) applyFrozenRemaining(p, reader.readU16());
        }
    }

    // Cleanup players
    for (const id in ENTITIES.PLAYERS) {
        if (!playerIdsThisUpdate.has(Number(id))) delete ENTITIES.PLAYERS[id];
    }

    // Sync my stats
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        Vars.myStats.hp = myPlayer.health;
        Vars.myStats.maxHp = myPlayer.maxHealth;
    }

    // Update Mobs
    const mobCount = reader.readU16();
    const mobIdsThisUpdate = new Set();
    for (let i = 0; i < mobCount; i++) {
        const id = reader.readU16();
        mobIdsThisUpdate.add(id);
        const mask = reader.readU16();
        let m = ENTITIES.MOBS[id];
        const prevMobHp = m?.health;

        if (mask & MOB_MASK_FULL) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const angle = unpackAngleU16(reader.readU16());
            const hp = reader.readU16();
            const maxHp = reader.readU16();
            const type = reader.readU8();
            const swingState = reader.readU8();
            const radius = reader.readU16();
            const frozenRemainingMs = reader.readU16();

            if (!m) m = new Mob(id, x, y, type);
            m.x = x; m.y = y; m.angle = angle;
            m.newX = x; m.newY = y; m.newAngle = angle;
            m.health = hp; m.maxHealth = maxHp; m.type = type;
            m.newSwingState = swingState;
            m.radius = radius;
            applyFrozenRemaining(m, frozenRemainingMs);
            if (m.type !== m.lastType) m.lastType = m.type;
            triggerDamageIndicator(prevMobHp, hp, x, y, dataMap.MOBS[type]?.radius);
        } else { // Delta Update
            if (!m) {
                skipMobDelta(reader, mask);
                continue;
            }
            if (mask & MOB_MASK_X) m.newX = reader.readU16();
            if (mask & MOB_MASK_Y) m.newY = reader.readU16();
            if (mask & MOB_MASK_ANGLE) m.newAngle = unpackAngleU16(reader.readU16());
            if (mask & MOB_MASK_HP) {
                const newHp = reader.readU16();
                triggerDamageIndicator(m.health, newHp, m.newX ?? m.x ?? 0, m.newY ?? m.y ?? 0, dataMap.MOBS[m.type]?.radius);
                m.health = newHp;
            }
            if (mask & MOB_MASK_MAX_HP) m.maxHealth = reader.readU16();
            if (mask & MOB_MASK_TYPE) m.type = reader.readU8();
            if (mask & MOB_MASK_SWING) m.newSwingState = reader.readU8();
            if (mask & MOB_MASK_FROZEN) applyFrozenRemaining(m, reader.readU16());
        }
    }
    for (const id in ENTITIES.MOBS) {
        if (!mobIdsThisUpdate.has(Number(id))) {
            const mob = ENTITIES.MOBS[id];
            if (mob?.type === 6) spawnMobDeathFade(mob);
            delete ENTITIES.MOBS[id];
        }
    }

    // Update Projectiles
    const projCount = reader.readU16();
    const projIdsThisUpdate = new Set();
    for (let i = 0; i < projCount; i++) {
        const id = reader.readU16();
        projIdsThisUpdate.add(id);
        const mask = reader.readU8();
        let p = ENTITIES.PROJECTILES[id];

        if (mask & 0x80) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const angle = unpackAngleU16(reader.readU16());
            const type = reader.readI8();
            const rank = reader.readU8();
            if (!p) p = new Projectile(id, x, y, angle, type, rank);
            p.newX = x; p.newY = y; p.newAngle = angle;
            p.type = type; p.weaponRank = rank;
            p.radius = reader.readU16();
            p.renderLength = (type === 13) ? reader.readU16() : 0;
        } else { // Delta Update
            if (!p) {
                skipProjectileDelta(reader, mask);
                continue;
            }
            if (mask & 0x01) p.newX = reader.readU16();
            if (mask & 0x02) p.newY = reader.readU16();
            if (mask & 0x04) p.newAngle = unpackAngleU16(reader.readU16());
            if (mask & 0x08) p.type = reader.readI8();
            if (mask & 0x10) p.weaponRank = reader.readU8();
            if (mask & 0x20) p.renderLength = reader.readU16();
            if (mask & 0x40) p.radius = reader.readU16();
        }
    }
    for (const id in ENTITIES.PROJECTILES) {
        if (!projIdsThisUpdate.has(Number(id))) delete ENTITIES.PROJECTILES[id];
    }

    // Update Objects
    const objCount = reader.readU16();
    for (let i = 0; i < objCount; i++) {
        const id = reader.readU16();
        const mask = reader.readU8();
        let o = ENTITIES.OBJECTS[id];
        const prevObjHp = o?.health;

        if (mask & 0x80) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const type = reader.readI8();
            const health = reader.readU16();
            const amount = reader.readU32();
            const isChestType = isChestObjectType(type);
            if (!o) o = new GameObject(id, x, y, type);
            o.newX = x; o.newY = y; o.setType(type); o.health = health;
            o.amount = amount;
            if (isChestType) {
                triggerDamageIndicator(prevObjHp, health, x, y, dataMap.OBJECTS[type]?.radius);
            }
        } else { // Delta Update
            if (!o) {
                skipObjectDelta(reader, mask);
                continue;
            }
            if (mask & 0x01) o.newX = reader.readU16();
            if (mask & 0x02) o.newY = reader.readU16();
            if (mask & 0x04) {
                const newHp = reader.readU16();
                if (isChestObjectType(o.type)) {
                    triggerDamageIndicator(o.health, newHp, o.newX ?? o.x ?? 0, o.newY ?? o.y ?? 0, dataMap.OBJECTS[o.type]?.radius);
                }
                o.health = newHp;
            }
            if (mask & 0x08) o.setType(reader.readI8());
            if (mask & 0x10) o.amount = reader.readU32();
        }
    }
    const removedObjCount = reader.readU16();
    for (let i = 0; i < removedObjCount; i++) {
        const id = reader.readU16();
        delete ENTITIES.OBJECTS[id];
    }

    const chestSeedCount = reader.readU16();
    for (let i = 0; i < chestSeedCount; i++) {
        const x = reader.readU16();
        const y = reader.readU16();
        const spread = reader.readU16();
        const totalCoins = reader.readU16();
        const seed = reader.readU32();
        const lifetimeMs = reader.readU16();
        spawnSeededChestCoins(x, y, spread, totalCoins, seed, lifetimeMs);
    }

    const coinFxCount = reader.readU16();
    for (let i = 0; i < coinFxCount; i++) {
        const startX = reader.readU16();
        const startY = reader.readU16();
        const angle = reader.readF32();
        const targetX = reader.readU16();
        const targetY = reader.readU16();
        const amount = reader.readU16();
        spawnCoinPickupVfxToPlayer(startX, startY, angle, targetX, targetY, amount);
    }

    const damageFxCount = reader.readU16();
    for (let i = 0; i < damageFxCount; i++) {
        const x = reader.readU16();
        const y = reader.readU16();
        const amount = reader.readU16();
        const radius = reader.readU16();
        const { px, py } = jitterOnEntity(x, y, radius);
        addDamageIndicator(px, py, amount);
    }

    if (peekU8(reader) === UPDATE_SECTION_STRUCTURES) {
        reader.readU8();
        handleStructureUpdatesSection(reader);
    }

    // Optional top-leader marker payload:
    // u8 hasTop, [u8 id, u16 x, u16 y, u32 score]
    if (reader.offset < reader.view.byteLength) {
        const hasTop = reader.readU8();
        if (hasTop && reader.offset + 9 <= reader.view.byteLength) {
            Vars.topLeader.id = reader.readU8();
            Vars.topLeader.x = reader.readU16();
            Vars.topLeader.y = reader.readU16();
            Vars.topLeader.score = reader.readU32();
        } else {
            Vars.topLeader.id = 0;
            Vars.topLeader.x = 0;
            Vars.topLeader.y = 0;
            Vars.topLeader.score = 0;
        }
    }

    // Optional minimap players payload:
    // u8 count, then repeated [u8 id, u16 x, u16 y]
    if (reader.offset < reader.view.byteLength) {
        const count = reader.readU8();
        const minimapPlayers = [];
        for (let i = 0; i < count; i++) {
            if (reader.offset + 5 > reader.view.byteLength) break;
            const id = reader.readU8();
            const x = reader.readU16();
            const y = reader.readU16();
            minimapPlayers.push({ id, x, y });
        }
        Vars.minimapPlayers = minimapPlayers;
    }
}

function applyCoinObjectSnapshotEntry(id, x, y, type, health, amount) {
    if (!isCoinObjectType(type)) return null;
    let object = ENTITIES.OBJECTS[id];
    if (!object) {
        object = new GameObject(id, x, y, type);
    }
    object.newX = x;
    object.newY = y;
    object.setType(type);
    object.health = health;
    object.amount = amount;
    return object;
}

function handleCoinSnapshotPacket(reader) {
    clearSeededChestCoinVisuals();
    const coinIds = new Set();
    const count = reader.readU16();
    for (let i = 0; i < count; i++) {
        const id = reader.readU16();
        const x = reader.readU16();
        const y = reader.readU16();
        const type = reader.readI8();
        const health = reader.readU16();
        const amount = reader.readU32();
        if (applyCoinObjectSnapshotEntry(id, x, y, type, health, amount)) {
            coinIds.add(id);
        }
    }

    for (const id in ENTITIES.OBJECTS) {
        const object = ENTITIES.OBJECTS[id];
        if (!object || !isCoinObjectType(object.type)) continue;
        if (!coinIds.has(Number(id))) {
            delete ENTITIES.OBJECTS[id];
        }
    }
}

function handleLeaderboardPacket(reader) {
    const leaderboard = [];
    const playerCount = reader.readU8();
    for (let i = 0; i < playerCount; i++) {
        leaderboard.push({
            id: reader.readU8(),
            score: reader.readU32(),
            username: reader.readString()
        });
    }
    ENTITIES.leaderboard = leaderboard;
}

function handleAccountLeaderboardsPacket(reader) {
    const scopes = ['daily', 'weekly', 'monthly'];
    const payload = {};
    for (let i = 0; i < scopes.length; i++) {
        const scope = scopes[i];
        const count = reader.readU8();
        const entries = [];
        for (let j = 0; j < count; j++) {
            entries.push({
                rank: j + 1,
                score: reader.readU32(),
                username: reader.readString()
            });
        }
        payload[scope] = entries;
    }
    setHomeLeaderboardsLoading(false);
    updateHomeLeaderboards(payload);
}

function handleAdminStatePacket(reader) {
    Vars.isAdmin = reader.readU8() === 1;
}

function handleAccountProfilePacket(reader) {
    const ok = reader.readU8() === 1;
    if (!ok) {
        updateAccountProfileFromServer(null);
        return;
    }
    updateAccountProfileFromServer({
        playTime: reader.readU32(),
        totalPlayerKills: reader.readU32(),
        totalDeaths: reader.readU32(),
        sessionStartedAtSec: reader.readU32()
    });
}

function handleServerNoticePacket(reader) {
    const isError = reader.readU8() === 1;
    const message = reader.readString();
    if (!message) return;
    showNotification(message, isError ? 'red' : '#22c55e');
}

function handleDiedPacket(reader) {
    LC.zoomOut();
    Vars.lastDiedTime = performance.now();
    Vars.latestCollisionDebugType = 0;
    Vars.latestCollisionDebugId = 0;
    startJoinActionCooldown();
    if (CURRENT_WORLD === WORLD_ROOT_DIMENSION || CURRENT_WORLD === WORLD_YETI_DIMENSION || CURRENT_WORLD === WORLD_DUNE_DIMENSION || CURRENT_WORLD === WORLD_INFERNO_DIMENSION) {
        try {
            localStorage.setItem(WORLD_STORAGE_KEY, WORLD_MAIN);
        } catch (e) {}
    }

    const victimType = reader.readU8();
    let victimId = 0;
    if (victimType === 1) {
        victimId = reader.readU8();
    } else if (victimType === 2 || victimType === 0) {
        const hasVictimIdBytes = reader.offset + 2 <= reader.view.byteLength;
        victimId = hasVictimIdBytes ? reader.readU16() : 0;
    }
    const now = performance.now();
    Vars.deathSpectateStartAt = now + DEATH_SPECTATE_START_DELAY_MS;

    if (victimType === 1) { // Died to player
        Vars.deathSpectateTargetId = victimId;
        Vars.deathSpectateUntil = Vars.deathSpectateStartAt + 5000;
        const killer = ENTITIES.PLAYERS[victimId];
        if (killer) showNotification(`You died to ${killer.username}!`, 'red');
    } else if (victimType === 2) { // Died to mob
        Vars.deathSpectateTargetId = 0;
        Vars.deathSpectateUntil = 0;
        const mob = ENTITIES.MOBS[victimId];
        if (mob?.type === 3) showNotification("You died to a cow!", 'red');
    } else {
        Vars.deathSpectateTargetId = 0;
        Vars.deathSpectateUntil = 0;
    }
    applyLiveAccountDeathIncrement();

    // Reset local predicted stats
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        myPlayer.serverAttributes = {
            speed: dataMap.PLAYERS.baseMovementSpeed,
            damage: 0
        };
    }
}

function handleAudioPacket(reader) {
    const type = reader.readU8();
    const volume = reader.readU8();
    const sfxName = dataMap.sfxMap[type];
    if (!sfxName) return;
    const sfxCfg = dataMap.AUDIO[sfxName] || {};

    const finalVolume = (volume / 100) * (sfxCfg.defaultVolume ?? 1) * Vars.generalVolume * Vars.inGameSoundVolume;
    
    // Don't play audio if final volume is 0 or less
    if (finalVolume <= 0) return;

    LC.playAudio({
        name: sfxName,
        timestamp: sfxCfg.defaultTimestamp ?? 0,
        endTime: sfxCfg.defaultEndTime ?? sfxCfg.endTime ?? null,
        volume: finalVolume,
        speed: sfxCfg.defaultSpeed ?? 1
    });
}

function handleKickedPacket(reader) {
    const message = reader.readString();
    const normalized = (message || '').toLowerCase();
    const isTooManyIpConnections = normalized.includes('more than 3 connections on one ip');
    const isSessionTimeLimit = normalized.includes('15 minutes connected');
    if (isTooManyIpConnections || isSessionTimeLimit) {
        Vars.disableAutoReconnect = true;
        Vars.disconnectMessage = isTooManyIpConnections
            ? 'You have too many connections playing on this IP already!'
            : (message || 'Disconnected from server.');
    } else {
        Vars.disableAutoReconnect = false;
        Vars.disconnectMessage = message || 'Disconnected from server.';
    }
    if (normalized.includes('account session') && normalized.includes('log in again')) {
        clearStoredAccountSession();
    }
    Vars.lastDiedTime = performance.now();
    Vars.deathSpectateStartAt = 0;
    Vars.deathSpectateTargetId = 0;
    Vars.deathSpectateUntil = 0;
    startJoinActionCooldown();
    uiState.pendingJoin = false;
    uiState.pendingJoinStartedAt = 0;
    uiState.pendingPause = false;
    uiState.pendingPauseStartedAt = 0;
    uiState.isPaused = false;
    uiState.forceHomeScreen = true;
    closeHomeScreenBlockingUI();
    const homeScreen = document.getElementById('home_screen');
    const respawnScreen = document.getElementById('respawn_screen');
    if (homeScreen) homeScreen.style.display = 'flex';
    if (respawnScreen) respawnScreen.style.display = 'none';
    showNotification(message, 'red');
}

function handlePingPacket() {
    Vars.ping = Date.now() - Vars.lastSentPing;
}

function handleUpgradePacket(reader) {
    // Legacy packet; stats now sync directly through STATS packets.
    if (reader.offset < reader.view.byteLength) reader.readU8();
    if (reader.offset < reader.view.byteLength) reader.readU8();
}

function handleAdminAuthPacket(reader) {
    const success = reader.readU8();
    if (success) {
        Vars.isAdmin = true;
        setStoredAdminKey(uiState.tempAdminKey);
        showNotification("You're now admin!", 'green');
        if (typeof updateSettingsBody === 'function') {
            updateSettingsBody();
        }
    } else {
        showNotification("That key is invalid!", 'red');
    }
}

function handleInventoryPacket(reader) {
    const serverSelected = reader.readU8();
    // 200ms buffer to prevent local selection flicker
    if (!Vars.lastSelectionTime || performance.now() - Vars.lastSelectionTime > 200) {
        Vars.selectedSlot = serverSelected;
    }

    for (let i = 0; i < 35; i++) {
        Vars.myInventory[i] = reader.readU8();
        Vars.myInventoryCounts[i] = reader.readU32();
    }

    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        myPlayer.weaponRank = Vars.myInventory[Vars.selectedSlot];
    }

    if (uiState.isShopOpen) updateShopBody();
    updateShopAttentionIndicator();
}

function handleStatsPacket(reader) {
    const prevAvailablePoints = Vars.myStats.availablePoints || 0;
    Vars.myStats.dmgHit = reader.readU16();
    Vars.myStats.dmgThrow = reader.readU16();
    Vars.myStats.speed = reader.readU16();
    Vars.myStats.hp = reader.readU16();
    Vars.myStats.maxHp = reader.readU16();
    Vars.myStats.goldCoins = reader.readU32();
    Vars.myStats.kills = reader.readU16();
    applyLiveAccountKillDelta(Vars.myStats.kills);
    Vars.inCombat = reader.readU8();
    Vars.vikingComboCount = reader.readU8();
    Vars.abilityCooldownMs = reader.readU16();
    Vars.abilityCooldownRemainingMs = reader.readU16();
    Vars.abilityCooldownEndsAt = performance.now() + Vars.abilityCooldownRemainingMs;
    Vars.myStats.level = reader.readU16();
    Vars.myStats.availablePoints = reader.readU16();
    onHudUpgradePointsChanged(prevAvailablePoints, Vars.myStats.availablePoints);
    Vars.myStats.buffStrength = reader.readU8();
    Vars.myStats.buffMaxHealth = reader.readU8();
    Vars.myStats.buffRegenSpeed = reader.readU8();
    Vars.myStats.regenPerTick = reader.readU16();

    // Re-render stats if they are visible
    if (uiState.isSettingsOpen && uiState.activeTab === 'Stats') {
        updateSettingsBody();
    }
    if (uiState.isShopOpen) {
        updateShopBody();
    }
    updateShopAttentionIndicator();
}

function handlePlayerCountPacket(reader) {
    Vars.onlineCount = reader.readU8();
    const countEl = document.getElementById('home_online_count');
    if (!countEl) return;
    const homeScreen = document.getElementById('home_screen');
    if (!homeScreen || homeScreen.style.display === 'none') return;
    const count = Math.max(0, Vars.onlineCount || 0);
    countEl.textContent = `${count} player${count === 1 ? '' : 's'} online`;
}

function handleLightningShotFxPacket(reader) {
    const startX = reader.readU16();
    const startY = reader.readU16();
    const endX = reader.readU16();
    const endY = reader.readU16();
    const durationMs = reader.readU16();
    let thicknessScale = 1;
    // Optional thickness value (hundredths) if packet includes it.
    if (reader.offset + 2 <= reader.view.byteLength) {
        thicknessScale = Math.max(0.1, reader.readU16() / 100);
    }
    spawnLightningShotFx(startX, startY, endX, endY, durationMs, thicknessScale);
}

function handleCoinPickupFxPacket(reader) {
    const startX = reader.readU16();
    const startY = reader.readU16();
    const angle = reader.readF32();
    const targetX = reader.readU16();
    const targetY = reader.readU16();
    const amount = reader.readU16();
    spawnCoinPickupVfxToPlayer(startX, startY, angle, targetX, targetY, amount);
}

function handleEnergyBurstFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    const radius = reader.readU16();
    const durationMs = reader.readU16();
    const waves = reader.readU8();
    let thicknessScale = 1;
    // Optional thickness field (hundredths) if present.
    if (reader.offset + 2 <= reader.view.byteLength) {
        thicknessScale = Math.max(0.1, reader.readU16() / 100);
    }
    spawnEnergyBurstFx(x, y, radius, durationMs, waves, thicknessScale);
}

function handleCriticalHitFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    addCriticalHitIndicator(x, y);
}

function handlePoisonAoeFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    const radius = reader.readU16();
    const durationMs = reader.readU16();
    const waves = reader.readU8();
    const colorCode = reader.offset + 1 <= reader.view.byteLength ? reader.readU8() : 0;
    spawnPoisonAoeFx(x, y, radius, durationMs, waves, colorCode);
}

function handleIntimidationFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    const radius = reader.readU16();
    const durationMs = reader.readU16();
    let followId = null;
    if (reader.offset + 1 <= reader.view.byteLength) {
        followId = reader.readU8();
    }
    spawnIntimidationFx(x, y, radius, durationMs, followId);
}

function handleSmokeAoeFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    const radius = reader.readU16();
    const durationMs = reader.readU16();
    const waves = reader.readU8();
    spawnSmokeAoeFx(x, y, radius, durationMs, waves);
}

function handleInfernoBeamFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    const angle = reader.readF32();
    const length = reader.readU16();
    const width = reader.readU16();
    const chargeMs = reader.readU16();
    const collapseMs = reader.readU16();
    const beamMs = reader.readU16();
    const ownerId = reader.offset + 2 <= reader.view.byteLength ? reader.readU16() : 65535;
    const targetPlayerId = reader.offset + 1 <= reader.view.byteLength ? reader.readU8() : 255;
    spawnInfernoBeamFx(x, y, angle, length, width, chargeMs, collapseMs, beamMs, ownerId, targetPlayerId);
}

function handleHeartMistFxPacket(reader) {
    const playerId = reader.readU8();
    const durationMs = reader.readU16();
    const radius = reader.readU16();
    spawnHeartMistFx(playerId, durationMs, radius);
}

function handleBlindnessFxPacket(reader) {
    const durationMs = reader.readU16();
    const maxAlpha = reader.readU8();
    const clampedAlpha = Math.max(0, Math.min(1, (maxAlpha || 0) / 100));
    spawnBlindnessFx(durationMs || 5000, clampedAlpha || 0);
}

function handleTutorialObjectivePacket(reader) {
    const status = reader.readU8();
    const step = reader.readU8();
    const text = reader.readString();
    Vars.tutorialObjectiveVisible = true;
    Vars.tutorialObjectiveStatus = status;
    Vars.tutorialObjectiveStep = step;
    Vars.tutorialObjectiveText = text;
    Vars.tutorialObjectiveUpdatedAt = performance.now();
    if (!isMobile && step === 0) {
        sendTutorialEvent(3);
    }
}

function handleTutorialCompletePacket() {
    try {
        localStorage.setItem('ua_tutorial_completed', '1');
        localStorage.setItem('ua_world', 'main');
        localStorage.setItem('ua_world_choice_made', '1');
        localStorage.removeItem('ua_auto_join_after_reload');
    } catch (e) {
        // Ignore storage errors.
    }
    showNotification('Tutorial complete. Teleporting to main world.', 'green');
    uiState.forceHomeScreen = true;
    closeHomeScreenBlockingUI();
    const homeScreen = document.getElementById('home_screen');
    const respawnScreen = document.getElementById('respawn_screen');
    if (homeScreen) homeScreen.style.display = 'flex';
    if (respawnScreen) respawnScreen.style.display = 'none';
    Vars.tutorialObjectiveVisible = false;
    Vars.deathSpectateStartAt = 0;
    Vars.deathSpectateTargetId = 0;
    Vars.deathSpectateUntil = 0;
    setTimeout(() => {
        location.reload();
    }, 120);
}

// --- Helper Classes ---

class PacketReader {
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.offset = 0;
        this.decoder = new TextDecoder();
    }

    readU8() { return this.view.getUint8(this.offset++); }
    readI8() { return this.view.getInt8(this.offset++); }
    readU16() {
        const val = this.view.getUint16(this.offset);
        this.offset += 2;
        return val;
    }
    readU32() {
        const val = this.view.getUint32(this.offset);
        this.offset += 4;
        return val;
    }
    readF32() {
        const val = this.view.getFloat32(this.offset);
        this.offset += 4;
        return val;
    }
    readString() {
        const len = this.readU8();
        const str = this.decoder.decode(new Uint8Array(this.view.buffer, this.offset, len));
        this.offset += len;
        return str;
    }
}
