import {
    ENTITIES,
    deleteWorldState,
    buildInitPacket,
    spawnObject
} from './game.js';
import {
    validateUsername,
    getRandomUsername,
    cmdRun,
    clearWorldCaches,
    PacketWriter
} from './helpers.js';
import {
    wss
} from '../server.js';
import {
    adminKey
} from './constants.js';
import {
    MAP_SIZE
} from './game.js';
import {
    getWorldCenter,
    getWorldMapSize,
    normalizeWorldId,
    WORLD_TUTORIAL
} from '../public/shared/worlds.js';
import {
    dataMap,
    ACCESSORY_KEYS,
    getWeaponConfig,
    WEAPON_IDS,
    isAccessoryItemType,
    accessoryIdFromItemType,
    isXpShopItemType,
    isWeaponRank,
    isCoinObjectType,
    MAX_LEVEL,
    xpForLevel
} from '../public/shared/datamap.js';
import { consumeAccountWheelSpin, getAccountAdminState, getAccountProfile, setAccountAdminState, verifyAccountSessionToken } from './auth/service.js';
import { claimAccountSocket, releaseAccountSocket } from './account_sessions.js';
import { buildAccountLeaderboardPacket } from './leaderboards.js';

// --- Packet Type Map ---
const PACKET_TYPES = {
    JOIN: 1,
    ANGLE: 2,
    MOVE: 3,
    ATTACK: 4,
    CHAT: 5,
    PAUSE: 6,
    THROW: 7,
    COMMAND: 8,
    PING: 9,
    UPGRADE: 10,
    ADMIN_AUTH: 11,
    PICKUP: 12,
    EQUIP: 13,
    DROP: 14,
    DROP_SLOT: 22,
    DROP_SLOT_ANGLE: 30,
    DROP_SINGLE: 31,
    DROP_SINGLE_SLOT_ANGLE: 32,
    SELECT_SLOT: 16,
    SWAP_SLOTS: 17,
    BUY: 20,
    SELL: 21,
    EQUIP_ACCESSORY: 23,
    USE_ABILITY: 24,
    DROP_EQUIPPED_ACCESSORY: 25,
    TUTORIAL_EVENT: 28,
    USE_ITEM: 29,
    UI_PANEL_VISIBILITY: 33,
    AUTH_SESSION: 34,
    ACCOUNT_LEADERBOARD_REQUEST: 36,
    ADMIN_STATE: 37,
    ACCOUNT_PROFILE: 38,
    SERVER_NOTICE: 39,
    COIN_SNAPSHOT_REQUEST: 40,
    HOME_WHEEL_SPIN: 45
};

const PACKET_COIN_SNAPSHOT = 42;
const PACKET_HOME_WHEEL_SPIN_RESULT = 45;
const UPDATE_SEND_BUFFER = 120;
const SPECTATOR_RANGE_DIVISOR = 1.5;
const HOME_WHEEL_SEGMENT_CHANCES = [35, 22, 15, 12, 7, 5, 3, 1];
const HOME_WHEEL_TOTAL_CHANCE = HOME_WHEEL_SEGMENT_CHANCES.reduce((sum, chance) => sum + chance, 0);
const HOME_WHEEL_REWARD_COIN_500_INDEX = 0;
const HOME_WHEEL_REWARD_DOUBLE_XP_INDEX = 1;
const HOME_WHEEL_REWARD_HEARTY_ESSENCE_INDEX = 2;
const HOME_WHEEL_REWARD_GOLDEN_SKULL_INDEX = 3;
const HOME_WHEEL_REWARD_RANDOM_RANK_12_INDEX = 4;
const HOME_WHEEL_REWARD_COIN_5000_INDEX = 5;
const HOME_WHEEL_REWARD_LEVELS_INDEX = 6;
const HOME_WHEEL_REWARD_ALL_RANK_12_INDEX = 7;
const HOME_WHEEL_LEVEL_REWARD_COUNT = 15;
const HOME_WHEEL_RANK_12_WEAPON_TYPES = [13, 29, 41, 53];
const HOME_WHEEL_DOUBLE_XP_DURATION_MS = 3 * 60 * 1000;
const HOME_WHEEL_HEARTY_ESSENCE_TYPE = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
const HOME_WHEEL_GOLDEN_SKULL_TYPE = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
const HOME_WHEEL_RANK_12_WEAPON_POOL = WEAPON_IDS.filter((weaponType) => getWeaponConfig(weaponType)?.key?.endsWith('12'));

export function parsePacket(buffer, ws) {
    const reader = new PacketReader(buffer);
    const packetType = reader.readU8();

    if (packetType !== PACKET_TYPES.PING) {
        ws.lastPacketTime = performance.now();
    }

    // Special case for JOIN: Player might not exist yet
    if (packetType === PACKET_TYPES.JOIN) {
        void handleJoinPacket(reader, ws);
        return;
    }

    if (packetType === PACKET_TYPES.AUTH_SESSION) {
        void handleAuthSessionPacket(reader, ws);
        return;
    }

    if (packetType === PACKET_TYPES.ACCOUNT_LEADERBOARD_REQUEST) {
        void sendAccountLeaderboardPacket(ws);
        return;
    }

    if (packetType === PACKET_TYPES.HOME_WHEEL_SPIN) {
        void handleHomeWheelSpinPacket(ws);
        return;
    }

    // Guard: All other packets require a player entry
    const player = ENTITIES.PLAYERS[ws.id];
    if (!player) return;

    switch (packetType) {
        case PACKET_TYPES.ANGLE:
            handleAnglePacket(reader, player);
            break;
        case PACKET_TYPES.MOVE:
            handleMovePacket(reader, player);
            break;
        case PACKET_TYPES.ATTACK:
            handleAttackPacket(reader, player);
            break;
        case PACKET_TYPES.CHAT:
            handleChatPacket(reader, player, buffer);
            break;
        case PACKET_TYPES.PAUSE:
            handlePausePacket(player);
            break;
        case PACKET_TYPES.THROW:
            player.throwSword();
            break;
        case PACKET_TYPES.COMMAND:
            handleCommandPacket(reader, ws, buffer);
            break;
        case PACKET_TYPES.PING:
            handlePingPacket(ws);
            break;
        case PACKET_TYPES.UPGRADE:
            handleUpgradePacket(reader, ws);
            break;
        case PACKET_TYPES.ADMIN_AUTH:
            handleAdminAuthPacket(reader, ws, buffer);
            break;
        case PACKET_TYPES.PICKUP:
            player.tryPickup();
            break;
        case PACKET_TYPES.EQUIP:
            handleEquipPacket(player);
            break;
        case PACKET_TYPES.DROP:
            player.dropItem();
            break;
        case PACKET_TYPES.DROP_SLOT:
            player.dropItemFromSlot(reader.readU8());
            break;
        case PACKET_TYPES.DROP_SLOT_ANGLE: {
            const slot = reader.readU8();
            const angle = reader.readF32();
            player.dropItemFromSlot(slot, angle);
            break;
        }
        case PACKET_TYPES.DROP_SINGLE:
            player.dropSingleItem();
            break;
        case PACKET_TYPES.DROP_SINGLE_SLOT_ANGLE: {
            const slot = reader.readU8();
            const angle = reader.readF32();
            player.dropSingleItemFromSlot(slot, angle);
            break;
        }
        case PACKET_TYPES.SELECT_SLOT:
            player.selectSlot(reader.readU8());
            break;
        case PACKET_TYPES.SWAP_SLOTS:
            player.swapSlots(reader.readU8(), reader.readU8());
            break;
        case PACKET_TYPES.BUY:
            handleBuyPacket(reader, player);
            break;
        case PACKET_TYPES.SELL:
            handleSellPacket(reader, player);
            break;
        case PACKET_TYPES.EQUIP_ACCESSORY:
            handleEquipAccessoryPacket(reader, player);
            break;
        case PACKET_TYPES.USE_ABILITY:
            handleUseAbilityPacket(reader, player);
            break;
        case PACKET_TYPES.USE_ITEM:
            handleUseItemPacket(player);
            break;
        case PACKET_TYPES.DROP_EQUIPPED_ACCESSORY:
            player.dropEquippedAccessory();
            break;
        case PACKET_TYPES.TUTORIAL_EVENT:
            handleTutorialEventPacket(reader, player);
            break;
        case PACKET_TYPES.UI_PANEL_VISIBILITY:
            handleUiPanelVisibilityPacket(reader, ws);
            break;
        case PACKET_TYPES.COIN_SNAPSHOT_REQUEST:
            handleCoinSnapshotRequestPacket(ws, player);
            break;
        default:
            // console.warn(`Unknown packet from client ${ws.id}: ${packetType}`);
            break;
    }
}

// --- Packet Handlers ---

function getWeightedHomeWheelSegmentIndex() {
    const roll = Math.random() * HOME_WHEEL_TOTAL_CHANCE;
    let runningTotal = 0;
    for (let i = 0; i < HOME_WHEEL_SEGMENT_CHANCES.length; i++) {
        runningTotal += HOME_WHEEL_SEGMENT_CHANCES[i];
        if (roll < runningTotal) return i;
    }
    return HOME_WHEEL_SEGMENT_CHANCES.length - 1;
}

function getScoreForLevel(level) {
    const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    let score = 0;
    for (let l = 1; l < safeLevel; l++) {
        score += xpForLevel(l);
    }
    return score;
}

function addItemToPlayerInventory(player, itemType, amount = 1) {
    if (!player?.inventory || !player?.inventoryCounts) return false;
    const safeType = Math.max(0, Math.floor(Number(itemType) || 0));
    let remaining = Math.max(1, Math.floor(Number(amount) || 1));
    const objectCfg = dataMap.OBJECTS?.[safeType];
    const stackLimit = isWeaponRank(safeType)
        ? 256
        : Math.max(1, Math.floor(objectCfg?.stackLimit || (objectCfg?.stackable ? 256 : 1)));
    let changed = false;

    if (stackLimit > 1) {
        for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
            if (player.inventory[i] !== safeType) continue;
            const currentCount = Math.max(0, Math.floor(player.inventoryCounts[i] || 0));
            if (currentCount >= stackLimit) continue;
            const toAdd = Math.min(stackLimit - currentCount, remaining);
            player.inventory[i] = safeType;
            player.inventoryCounts[i] = currentCount + toAdd;
            remaining -= toAdd;
            changed = true;
        }
    }

    for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
        if (player.inventory[i] !== 0) continue;
        const toAdd = Math.min(stackLimit, remaining);
        player.inventory[i] = safeType;
        player.inventoryCounts[i] = toAdd;
        remaining -= toAdd;
        changed = true;
    }

    if (remaining > 0) {
        spawnObject(safeType, player.x, player.y, remaining, 'player', player.world || 'main');
    }

    return changed;
}

function addStackableItemToSingleSlot(player, itemType, amount = 1) {
    if (!player?.inventory || !player?.inventoryCounts) return false;
    const safeType = Math.max(0, Math.floor(Number(itemType) || 0));
    const objectCfg = dataMap.OBJECTS?.[safeType];
    const stackLimit = Math.max(1, Math.floor(objectCfg?.stackLimit || (objectCfg?.stackable ? 256 : 1)));
    const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
    let targetSlot = -1;
    let totalCount = safeAmount;

    for (let i = 0; i < player.inventory.length; i++) {
        if (player.inventory[i] === safeType) {
            const count = Math.max(0, Math.floor(player.inventoryCounts[i] || 0));
            totalCount += count;
            if (targetSlot < 0) targetSlot = i;
        }
    }
    if (targetSlot < 0) {
        targetSlot = player.inventory.findIndex((type) => type === 0);
    }
    if (targetSlot < 0) {
        spawnObject(safeType, player.x, player.y, safeAmount, 'player', player.world || 'main');
        return false;
    }

    for (let i = 0; i < player.inventory.length; i++) {
        if (i !== targetSlot && player.inventory[i] === safeType) {
            player.inventory[i] = 0;
            player.inventoryCounts[i] = 0;
        }
    }

    const toStore = Math.min(stackLimit, totalCount);
    player.inventory[targetSlot] = safeType;
    player.inventoryCounts[targetSlot] = toStore;

    const remaining = totalCount - toStore;
    if (remaining > 0) {
        spawnObject(safeType, player.x, player.y, remaining, 'player', player.world || 'main');
    }
    return true;
}

function applyHomeWheelReward(player, segmentIndex) {
    if (!player) return;

    switch (segmentIndex) {
        case HOME_WHEEL_REWARD_COIN_500_INDEX:
            player.addGoldCoins?.(500);
            break;
        case HOME_WHEEL_REWARD_DOUBLE_XP_INDEX:
            player.activateXpBoost?.(HOME_WHEEL_DOUBLE_XP_DURATION_MS);
            break;
        case HOME_WHEEL_REWARD_HEARTY_ESSENCE_INDEX:
            if (HOME_WHEEL_HEARTY_ESSENCE_TYPE) {
                addStackableItemToSingleSlot(player, HOME_WHEEL_HEARTY_ESSENCE_TYPE, 50);
                player.sendInventoryUpdate?.();
                player.sendStatsUpdate?.();
            }
            break;
        case HOME_WHEEL_REWARD_GOLDEN_SKULL_INDEX:
            if (HOME_WHEEL_GOLDEN_SKULL_TYPE) {
                addStackableItemToSingleSlot(player, HOME_WHEEL_GOLDEN_SKULL_TYPE, 10);
                player.sendInventoryUpdate?.();
                player.sendStatsUpdate?.();
            }
            break;
        case HOME_WHEEL_REWARD_RANDOM_RANK_12_INDEX: {
            const pool = HOME_WHEEL_RANK_12_WEAPON_POOL.length ? HOME_WHEEL_RANK_12_WEAPON_POOL : HOME_WHEEL_RANK_12_WEAPON_TYPES;
            const randomWeaponType = pool[Math.floor(Math.random() * pool.length)] || HOME_WHEEL_RANK_12_WEAPON_TYPES[0];
            if (randomWeaponType) {
                addItemToPlayerInventory(player, randomWeaponType, 1);
                player.sendInventoryUpdate?.();
                player.sendStatsUpdate?.();
            }
            break;
        }
        case HOME_WHEEL_REWARD_COIN_5000_INDEX:
            player.addGoldCoins?.(5000);
            break;
        case HOME_WHEEL_REWARD_LEVELS_INDEX: {
            const currentLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(player.level || 1)));
            const targetLevel = Math.min(MAX_LEVEL, currentLevel + HOME_WHEEL_LEVEL_REWARD_COUNT);
            const targetScore = getScoreForLevel(targetLevel);
            if ((player.score || 0) < targetScore) {
                player.setScore(targetScore);
                player.sendStatsUpdate?.();
            }
            break;
        }
        case HOME_WHEEL_REWARD_ALL_RANK_12_INDEX: {
            let changed = false;
            for (const itemType of HOME_WHEEL_RANK_12_WEAPON_TYPES) {
                changed = addItemToPlayerInventory(player, itemType, 1) || changed;
            }
            if (changed) {
                player.sendInventoryUpdate?.();
                player.sendStatsUpdate?.();
            }
            break;
        }
        default:
            break;
    }
}

async function handleHomeWheelSpinPacket(ws) {
    if (!ws || ws.readyState !== 1) return;
    if (!ws.accountUsername) {
        sendServerNoticePacket(ws, 'Log in first to spin the prize wheel.', true);
        return;
    }

    const wheelSpend = await consumeAccountWheelSpin(ws.accountUsername);
    if (!wheelSpend?.ok) {
        sendServerNoticePacket(ws, wheelSpend?.message || 'You cannot spin the wheel right now.', true);
        void sendAccountProfilePacket(ws);
        return;
    }

    const segmentIndex = getWeightedHomeWheelSegmentIndex();
    const spinDurationMs = 8600 + Math.floor(Math.random() * 2400);
    if (ws._homeWheelRewardTimer) {
        clearTimeout(ws._homeWheelRewardTimer);
        ws._homeWheelRewardTimer = null;
    }
    const writer = ws.packetWriter || new PacketWriter(8);
    writer.reset();
    writer.writeU8(PACKET_HOME_WHEEL_SPIN_RESULT);
    writer.writeU8(segmentIndex);
    writer.writeU16(Math.min(65535, spinDurationMs));
    ws.send(writer.getBuffer());
    void sendAccountProfilePacket(ws);
    ws._homeWheelRewardTimer = setTimeout(() => {
        ws._homeWheelRewardTimer = null;
        const livePlayer = ENTITIES.PLAYERS[ws.id];
        if (!livePlayer) return;
        applyHomeWheelReward(livePlayer, segmentIndex);
    }, spinDurationMs);
}

async function handleJoinPacket(reader, ws) {
    const player = ENTITIES.PLAYERS[ws.id];
    if (player && player.isAlive) {
        ws.kick("Do not modify your client.");
        return;
    }

    // Cooldown check if they just died
    if (player && performance.now() - player.lastDiedTime < 1000) {
        ws.kick("Do not modify your client.");
        return;
    }

    let username = reader.readString();

    if (reader.offset < reader.view.byteLength) {
        const sessionToken = reader.readString();
        if (sessionToken) {
            const session = verifyAccountSessionToken(sessionToken);
            if (!session) {
                ws.kick('Your account session is no longer valid. Please log in again.');
                return;
            }
            const claim = claimAccountSocket(session.username, ws);
            if (!claim.ok) {
                ws.kick(claim.reason);
                return;
            }
            ws.accountUsername = claim.username;
            try {
                const adminState = await getAccountAdminState(claim.username);
                ws.isAdmin = !!adminState?.isAdmin;
            } catch (error) {
                console.error(`Failed to read admin state for ${claim.username}:`, error);
                ws.isAdmin = false;
            }
        }
    }

    let requestedWorld = ws.world || 'main';
    if (reader.offset < reader.view.byteLength) {
        requestedWorld = normalizeWorldId(reader.readString());
        ws.world = requestedWorld === WORLD_TUTORIAL ? `tutorial-${ws.id}` : requestedWorld;
    }

    if (ws.accountUsername) {
        username = ws.accountUsername;
    } else {
        if (!validateUsername(username)) {
            ws.kick("Do not modify your client.");
            return;
        }

        if (username.length === 0) {
            username = getRandomUsername();
        }
    }

    const wantsTutorialWorld = (ws.world || '').startsWith('tutorial');
    if (wantsTutorialWorld) {
        const previousWorld = ws.world;
        ws.world = `tutorial-${ws.id}`;
        if (previousWorld && previousWorld.startsWith('tutorial') && previousWorld !== ws.world) {
            deleteWorldState(previousWorld);
            clearWorldCaches(previousWorld);
        }
    }

    if (!player) {
        const spawnCenter = getWorldCenter(ws.world || 'main');
        ENTITIES.newEntity({
            entityType: 'player',
            id: ws.id,
            x: spawnCenter.x,
            y: spawnCenter.y,
            username: username,
            world: ws.world || 'main'
        });
    } else {
        if (player._delayedMainWorldSwitchTimer) {
            clearTimeout(player._delayedMainWorldSwitchTimer);
            player._delayedMainWorldSwitchTimer = null;
        }
        player.username = username;
        player.world = ws.world || ws._respawnWorld || player.world || 'main';
        player.isAlive = true;
        player.hp = player.maxHp;
        const spawnCenter = getWorldCenter(player.world || 'main');
        player.x = spawnCenter.x;
        player.y = spawnCenter.y;
    }
    ENTITIES.PLAYERS[ws.id].accountUsername = ws.accountUsername || '';
    ENTITIES.PLAYERS[ws.id].isAdmin = !!ws.isAdmin;
    if (ws.accountUsername && !ws.accountPlayStartedAt) {
        ws.accountPlayStartedAt = Date.now();
    }


    ws.seenEntities = new Set();
    ws._pendingSeenEntities = new Set();
    ws._lastOptionalSyncWorld = null;
    ws._lastTopLeaderSignature = null;
    ws._lastMinimapSignature = null;
    ws._minimapTickCounter = 0;
    ws.world = ENTITIES.PLAYERS[ws.id].world || ws.world || 'main';
    ws._respawnWorld = null;
    ENTITIES.PLAYERS[ws.id].isAlive = true;
    ENTITIES.PLAYERS[ws.id].sendInventoryUpdate();
    ENTITIES.PLAYERS[ws.id].updateProgressShield();
    ws.send(buildInitPacket(ws.id, ws.world || 'main'));
    sendAdminStatePacket(ws, !!ws.isAdmin);
    void sendAccountProfilePacket(ws);
}

async function handleAuthSessionPacket(reader, ws) {
    const sessionToken = reader.readString();
    if (!sessionToken) {
        releaseAccountSocket(ws);
        ws.accountUsername = null;
        ws.accountPlayStartedAt = 0;
        ws.isAdmin = false;
        const player = ENTITIES.PLAYERS[ws.id];
        if (player) {
            player.isAdmin = false;
            player.accountUsername = '';
        }
        sendAdminStatePacket(ws, false);
        void sendAccountProfilePacket(ws);
        return;
    }

    const session = verifyAccountSessionToken(sessionToken);
    if (!session) {
        ws.kick('Your account session is no longer valid. Please log in again.');
        return;
    }

    const claim = claimAccountSocket(session.username, ws);
    if (!claim.ok) {
        ws.kick(claim.reason);
        return;
    }

    ws.accountUsername = claim.username;
    try {
        const adminState = await getAccountAdminState(claim.username);
        ws.isAdmin = !!adminState?.isAdmin;
    } catch (error) {
        console.error(`Failed to read admin state for ${claim.username}:`, error);
        ws.isAdmin = false;
    }
    const player = ENTITIES.PLAYERS[ws.id];
    if (player) {
        player.username = claim.username;
        player.accountUsername = claim.username;
        player.isAdmin = !!ws.isAdmin;
    }
    sendAdminStatePacket(ws, !!ws.isAdmin);
    void sendAccountProfilePacket(ws);
}

async function sendAccountLeaderboardPacket(ws) {
    if (!ws || ws.readyState !== 1) return;
    try {
        const writer = new PacketWriter(2048);
        ws.send(await buildAccountLeaderboardPacket(writer, Date.now()));
    } catch (error) {
        console.error('Failed to send account leaderboards:', error);
    }
}

async function sendAccountProfilePacket(ws) {
    if (!ws || ws.readyState !== 1) return;
    const username = String(ws.accountUsername || '').trim();
    if (!username) {
        const writer = new PacketWriter(16);
        writer.writeU8(PACKET_TYPES.ACCOUNT_PROFILE);
        writer.writeU8(0);
        ws.send(writer.getBuffer());
        return;
    }
    try {
        const profile = await getAccountProfile(username);
        const writer = new PacketWriter(96);
        writer.writeU8(PACKET_TYPES.ACCOUNT_PROFILE);
        writer.writeU8(profile?.ok ? 1 : 0);
        if (profile?.ok) {
            writer.writeU32(Math.max(0, Math.floor(Number(profile.playTime) || 0)));
            writer.writeU32(Math.max(0, Math.floor(Number(profile.totalPlayerKills) || 0)));
            writer.writeU32(Math.max(0, Math.floor(Number(profile.totalDeaths) || 0)));
            const sessionStartedAtSec = ws.accountPlayStartedAt > 0 ? Math.floor(ws.accountPlayStartedAt / 1000) : 0;
            writer.writeU32(sessionStartedAtSec);
            writer.writeU8(Math.max(0, Math.min(255, Math.floor(Number(profile.wheelSpinsRemaining) || 0))));
            writer.writeU32(Math.max(0, Math.floor(Number(profile.wheelSpinsResetAtSec) || 0)));
        }
        ws.send(writer.getBuffer());
    } catch (error) {
        console.error(`Failed to send account profile for ${username}:`, error);
    }
}

function sendAdminStatePacket(ws, isAdmin) {
    if (!ws || ws.readyState !== 1) return;
    const writer = new PacketWriter(8);
    writer.writeU8(PACKET_TYPES.ADMIN_STATE);
    writer.writeU8(isAdmin ? 1 : 0);
    ws.send(writer.getBuffer());
}

function sendServerNoticePacket(ws, message, isError = false) {
    if (!ws || ws.readyState !== 1) return;
    const writer = new PacketWriter(256);
    writer.writeU8(PACKET_TYPES.SERVER_NOTICE);
    writer.writeU8(isError ? 1 : 0);
    writer.writeStr(String(message || ''));
    ws.send(writer.getBuffer());
}

function getCoinSnapshotRangeSq(ws, player) {
    const baseRange = player.isAlive ? 1200 : ((1200 / 0.7) / SPECTATOR_RANGE_DIVISOR);
    const alienHatKey = ACCESSORY_KEYS[player.accessoryId || 0];
    const wearingAlienHat = alienHatKey === 'alien_antennas';
    const requestedRange = baseRange * (player.viewRangeMult ?? ws.viewRangeMult ?? 1);
    let renderDistance = requestedRange;
    if (wearingAlienHat) {
        renderDistance = Math.max(renderDistance, Math.min(1500, requestedRange * 1.2));
    }
    const effectiveRange = renderDistance + UPDATE_SEND_BUFFER;
    return effectiveRange * effectiveRange;
}

function handleCoinSnapshotRequestPacket(ws, player) {
    if (!ws || ws.readyState !== 1 || !player) return;
    const world = player.world || ws.world || 'main';
    const rangeSq = getCoinSnapshotRangeSq(ws, player);
    const pw = ws.packetWriter || new PacketWriter(1024);
    pw.reset();
    pw.writeU8(PACKET_COIN_SNAPSHOT);
    const countPos = pw.reserveU16();
    let count = 0;

    for (const id in ENTITIES.OBJECTS) {
        const object = ENTITIES.OBJECTS[id];
        if (!object) continue;
        if ((object.world || 'main') !== world) continue;
        if (!isCoinObjectType(object.type)) continue;
        const dx = object.x - player.x;
        const dy = object.y - player.y;
        if ((dx * dx + dy * dy) > rangeSq) continue;

        pw.writeU16(object.id);
        pw.writeU16(object.x);
        pw.writeU16(object.y);
        pw.writeI8(object.type);
        pw.writeU16(object.health || 0);
        pw.writeU32(object.amount || 1);
        count++;
        if (count >= 65535) break;
    }

    pw.writeU16At(countPos, count);
    ws.send(pw.getBuffer());
}

async function handleGrantAccountAdminCommand(ws, accountUsername) {
    if (!ws?.isAdmin) return;
    try {
        const result = await setAccountAdminState(accountUsername, true);
        if (!result?.ok) {
            sendServerNoticePacket(ws, result?.message || 'Account not found.', true);
            return;
        }
        sendServerNoticePacket(ws, result.message || `${result.username} is now an admin account.`, false);
        for (const client of wss.clients) {
            if (client.readyState !== 1) continue;
            if ((client.accountUsername || '').toLowerCase() !== String(result.username || '').toLowerCase()) continue;
            client.isAdmin = true;
            const player = ENTITIES.PLAYERS[client.id];
            if (player) player.isAdmin = true;
            sendAdminStatePacket(client, true);
            void sendAccountProfilePacket(client);
        }
    } catch (error) {
        console.error(`Failed to grant persistent admin to ${accountUsername}:`, error);
        sendServerNoticePacket(ws, 'Unable to update that account right now.', true);
    }
}

function handleAnglePacket(reader, player) {
    player.angle = reader.readF32();
}

function handleMovePacket(reader, player) {
    const keyMap = { 1: 'w', 2: 'a', 3: 's', 4: 'd' };
    const keyIdx = reader.readU8();
    const state = reader.readU8();
    if (keyMap[keyIdx]) {
        player.keys[keyMap[keyIdx]] = state;
    }
}

function handleAttackPacket(reader, player) {
    if (typeof player.isFrozen === 'function' && player.isFrozen()) {
        player.attacking = 0;
        return;
    }
    player.attacking = reader.readU8();
}

function handleChatPacket(reader, player, buffer) {
    const len = reader.readU8();
    player.chatMessage = buffer.toString('utf8', reader.offset, reader.offset + len).trim();
    player.lastChatTime = performance.now();
    if (!player.chatMessage) return;
    broadcastChatMessage(player);
}

function broadcastChatMessage(player) {
    const world = player.world || 'main';
    for (const client of wss.clients) {
        if (client.readyState !== 1) continue;
        if ((client.world || ENTITIES.PLAYERS[client.id]?.world || 'main') !== world) continue;
        const pw = new PacketWriter(256);
        pw.writeU8(35);
        pw.writeStr(player.username || `player${player.id}`);
        pw.writeStr(player.chatMessage || '');
        client.send(pw.getBuffer());
    }
}

function handlePausePacket(player) {
    if (player.hasShield && player.touchingSafeZone) {
        player.isAlive = false;
        player.lastDiedTime = performance.now();
    }
}

function readU16BE(reader, buffer) {
    const value = buffer.readUint16BE(reader.offset);
    reader.offset += 2;
    return value;
}

function readRangeU16(reader, buffer) {
    const startId = readU16BE(reader, buffer);
    const endId = readU16BE(reader, buffer);
    return { startId, endId };
}

function readEntityRange(reader, buffer) {
    const entType = reader.readU8();
    const { startId, endId } = readRangeU16(reader, buffer);
    return { entType, startId, endId };
}

function forRange(startId, endId, fn) {
    for (let i = startId; i <= endId; i++) {
        fn(i);
    }
}

function forMobType(mobType, fn) {
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== mobType) continue;
        fn(mob);
    }
}

function handleCommandPacket(reader, ws, buffer) {
    const cmdType = reader.readU8();

    if (!ws.isAdmin) {
        // Allow non-admin self-kill only: /kill @s
        if (cmdType === 8) {
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            if (entType === 1 && startId === ws.id && endId === ws.id) {
                const player = ENTITIES.PLAYERS[ws.id];
                if (player && player.isAlive) {
                    const inCombat = performance.now() - player.lastCombatTime < 10000;
                    const killer = inCombat && player.lastDamager ? player.lastDamager : null;
                    player.die(killer);
                }
            }
        }
        return;
    }

    switch (cmdType) {
        case 1: { // TP Pos
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const x = readU16BE(reader, buffer);
            const y = readU16BE(reader, buffer);
            forRange(startId, endId, i => {
                cmdRun.tppos(entType, i, x, y);
            });
            break;
        }
        case 2: { // TP Ent
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const targetType = reader.readU8();
            const { startId: targetStartId, endId: targetEndId } = readRangeU16(reader, buffer);
            forRange(startId, endId, i => {
                forRange(targetStartId, targetEndId, j => {
                    cmdRun.tpent(entType, i, targetType, j);
                });
            });
            break;
        }
        case 3: { // Kick
            const id = reader.readU8();
            wss.clients.forEach(c => {
                if (c.id === id) {
                    c.close();
                    delete ENTITIES.PLAYERS[id];
                }
            });
            break;
        }
        case 4: { // Set Attr
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const attr = reader.readU8();
            const val = reader.readF32();
            forRange(startId, endId, i => {
                cmdRun.setattr(entType, i, attr, val);
            });
            break;
        }
        case 5: { // Agro
            const mobId = readU16BE(reader, buffer);
            const pId = reader.readU8();
            const mType = reader.readU8();
            const mSpeed = reader.readU8();
            cmdRun.agro(mobId, pId, mType, mSpeed);
            break;
        }
        case 6: { // TP Chest
            const pId = reader.readU8();
            let cType = null;
            if (reader.offset < buffer.length) {
                cType = reader.readU8() || null;
            }
            cmdRun.tpchest(pId, cType);
            break;
        }
        case 7: { // Break Chests
            cmdRun.breakChests(reader.readU8() === 1);
            break;
        }
        case 8: { // Kill player range
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            forRange(startId, endId, i => {
                cmdRun.kill(entType, i);
            });
            break;
        }
        case 9: { // Break Chests range
            const { startId, endId } = readRangeU16(reader, buffer);
            const dropLoot = reader.readU8() === 1;
            forRange(startId, endId, i => {
                cmdRun.breakChest(i, dropLoot);
            });
            break;
        }
        case 10: { // Heal entity range
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            forRange(startId, endId, i => {
                cmdRun.heal(entType, i);
            });
            break;
        }
        case 11: { // Damage entity range
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const damage = reader.readF32();
            const isPercentage = reader.readU8() === 1;
            forRange(startId, endId, i => {
                cmdRun.damage(entType, i, damage, isPercentage);
            });
            break;
        }
        case 12: { // Clear Drops
            cmdRun.clearDrops();
            break;
        }
        case 14: { // Mob-type commands
            const subType = reader.readU8();
            const mobType = reader.readU8();

            if (subType === 1) { // tppos
                const x = readU16BE(reader, buffer);
                const y = readU16BE(reader, buffer);
                forMobType(mobType, mob => cmdRun.tppos(2, mob.id, x, y));
            } else if (subType === 2) { // tpent
                const targetType = reader.readU8();
                const targetId = readU16BE(reader, buffer);
                forMobType(mobType, mob => cmdRun.tpent(2, mob.id, targetType, targetId));
            } else if (subType === 4) { // setattr
                const attrIdx = reader.readU8();
                const value = reader.readF32();
                forMobType(mobType, mob => cmdRun.setattr(2, mob.id, attrIdx, value));
            } else if (subType === 8) { // kill
                forMobType(mobType, mob => cmdRun.kill(2, mob.id));
            } else if (subType === 10) { // heal
                forMobType(mobType, mob => cmdRun.heal(2, mob.id));
            } else if (subType === 11) { // damage
                const damage = reader.readF32();
                const isPercentage = reader.readU8() === 1;
                forMobType(mobType, mob => cmdRun.damage(2, mob.id, damage, isPercentage));
            }
            break;
        }
        case 13: { // Render/View range override
            const rangeMult = reader.readF32();
            const p = ENTITIES.PLAYERS[ws.id];
            if (p && rangeMult > 0) {
                const clamped = Math.max(0.1, Math.min(rangeMult, 10));
                p.viewRangeOverride = clamped;
                p.viewRangeMult = clamped;
                ws.viewRangeMult = clamped;
            }
            break;
        }
        case 15: { // Reset server
            let seed = null;
            if (reader.offset + 4 <= buffer.length) {
                seed = buffer.readUint32BE(reader.offset);
                reader.offset += 4;
            }
            cmdRun.resetServer(seed);
            break;
        }
        case 16: { // Give accessory
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const accessoryId = reader.readU8();
            if (entType !== 1) break;
            forRange(startId, endId, i => {
                cmdRun.giveAccessory(i, accessoryId);
            });
            break;
        }
        case 17: { // Grant admin
            const targetId = reader.readU8();
            cmdRun.grantAdmin(targetId);
            break;
        }
        case 27: { // Grant persistent account admin
            const accountUsername = reader.readString();
            void handleGrantAccountAdminCommand(ws, accountUsername);
            break;
        }
        case 18: { // Invis
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            cmdRun.invis(entType, startId, endId);
            break;
        }
        case 19: { // Uninvis
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            cmdRun.uninvis(entType, startId, endId);
            break;
        }
        case 20: { // Activate ability (admin self-cast)
            const abilityName = reader.readString();
            let targetX = null;
            let targetY = null;
            let durationSeconds = null;
            const normalizedAbility = (abilityName || '').toLowerCase();
            if (normalizedAbility === 'lightning_shot' && reader.offset + 4 <= buffer.length) {
                targetX = reader.readU16();
                targetY = reader.readU16();
            } else if ((normalizedAbility === 'stamina_boost' || normalizedAbility === 'speed_boost') && reader.offset + 2 <= buffer.length) {
                durationSeconds = reader.readU16();
            }
            cmdRun.activateAbility(ws.id, abilityName, targetX, targetY, durationSeconds);
            break;
        }
        case 25: { // Yeti ability (admin)
            const abilityNumber = reader.offset + 1 <= buffer.length ? reader.readU8() : 1;
            cmdRun.y(abilityNumber);
            break;
        }
        case 28: { // Dune behemoth ability (admin)
            const abilityNumber = reader.offset + 1 <= buffer.length ? reader.readU8() : 1;
            cmdRun.db(abilityNumber);
            break;
        }
        case 29: { // Inferno beast ability (admin)
            const abilityNumber = reader.offset + 1 <= buffer.length ? reader.readU8() : 1;
            cmdRun.ib(abilityNumber);
            break;
        }
        case 21: { // Creative inventory item
            const itemType = reader.readU8();
            const amount = buffer.readUint16BE(reader.offset);
            reader.offset += 2;
            const slot = reader.readU8();
            const drop = reader.readU8() === 1;
            cmdRun.creativeItem(ws.id, itemType, amount, slot, drop);
            break;
        }
        case 22: { // Spawn mob/structure
            const entityKey = reader.readString();
            let x = null;
            let y = null;
            if (reader.offset + 4 <= buffer.length) {
                x = reader.readU16();
                y = reader.readU16();
            }
            const player = ENTITIES.PLAYERS[ws.id];
            const playerWorld = player?.world || 'main';
            const worldSize = getWorldMapSize(playerWorld);
            const worldCenter = getWorldCenter(playerWorld);
            const fallbackX = Math.max(0, Math.min(worldSize[0], Math.round(player?.x ?? worldCenter.x)));
            const fallbackY = Math.max(0, Math.min(worldSize[1], Math.round(player?.y ?? worldCenter.y)));
            cmdRun.spawn(
                entityKey,
                Number.isFinite(x) ? x : fallbackX,
                Number.isFinite(y) ? y : fallbackY,
                playerWorld
            );
            break;
        }
        case 23: { // Break structures (non-natural)
            const structType = reader.readU8();
            cmdRun.breakStructures(structType || 0);
            break;
        }
        case 24: { // Give item
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const itemType = reader.readU8();
            const amount = reader.readU16();
            if (entType !== 1) break;
            forRange(startId, endId, i => {
                cmdRun.giveItem(i, itemType, amount);
            });
            break;
        }
        case 26: { // Teleport to dimension
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const dimensionTarget = reader.readString();
            if (entType === 1 && startId === 0 && endId === 65535) {
                cmdRun.tpdim(entType, 0, dimensionTarget);
                break;
            }
            forRange(startId, endId, i => {
                cmdRun.tpdim(entType, i, dimensionTarget);
            });
            break;
        }
    }
}

function handlePingPacket(ws) {
    const pw = ws.packetWriter;
    pw.reset();
    pw.writeU8(PACKET_TYPES.PING);
    ws.send(pw.getBuffer());
}

function handleUpgradePacket(reader, ws) {
    cmdRun.upgrade(ws, reader.readU8());
}

function handleAdminAuthPacket(reader, ws, buffer) {
    const pw = ws.packetWriter;
    const keyLen = reader.readU8();
    const key = buffer.toString('utf8', reader.offset, reader.offset + keyLen);

    pw.reset();
    pw.writeU8(PACKET_TYPES.ADMIN_AUTH);

    if (key === adminKey) {
        ws.isAdmin = true;
        pw.writeU8(1);
    } else {
        if (performance.now() - (ws.lastAdminKeyAttempt || 0) < 5000 || ws.isAdmin) return;
        ws.lastAdminKeyAttempt = performance.now();
        pw.writeU8(0);
    }
    ws.send(pw.getBuffer());
}

function handleEquipPacket(player) {
    player.hasWeapon = !player.hasWeapon;
    player.manuallyUnequippedWeapon = !player.hasWeapon;
}

function handleBuyPacket(reader, player) {
    const itemType = reader.readU8();
    if (player) {
        if (isWeaponRank(itemType)) {
            player.buyItem(itemType);
        } else if (isAccessoryItemType(itemType)) {
            const accessoryId = accessoryIdFromItemType(itemType);
            player.buyAccessory(accessoryId);
        } else if (isXpShopItemType(itemType)) {
            player.buyXp(itemType);
        } else if (dataMap.SPECIAL_SHOP_ITEMS?.some(item => (item?.itemType | 0) === itemType)) {
            player.buySpecialItem(itemType);
        }
    }
}

function handleSellPacket(reader, player) {
    const count = reader.readU8();
    const indices = [];
    for (let i = 0; i < count; i++) {
        indices.push(reader.readU8());
    }
    player.sellItems(indices);
}

function handleEquipAccessoryPacket(reader, player) {
    const itemType = reader.readU8();
    const fromSlot = reader.offset < reader.buffer.length ? reader.readU8() : 255;
    if (!player) return;
    if (itemType === 0) {
        player.unequipAccessory(fromSlot);
        return;
    }
    player.equipAccessoryFromItemType(itemType, fromSlot);
}

function handleUseAbilityPacket(reader, player) {
    if (!player || !player.isAlive) return;
    const ability = (player.activeAbility || '').toLowerCase();
    if (!ability) return;

    let targetX = null;
    let targetY = null;
    if (reader.offset + 4 <= reader.buffer.length) {
        targetX = reader.readU16();
        targetY = reader.readU16();
    }

    const cooldownMs = Math.max(0, player.abilityCooldownMs || 0);
    const now = performance.now();
    if (cooldownMs > 0 && now - (player.lastAbilityUseTime || 0) < cooldownMs) return;
    player.lastAbilityUseTime = now;
    cmdRun.activateAbility(player.id, ability, targetX, targetY);
    player.sendStatsUpdate();
}

function handleUseItemPacket(player) {
    if (!player || !player.isAlive) return;
    player.useItem();
}

function handleTutorialEventPacket(reader, player) {
    if (!player || !player.tutorial) return;
    const eventType = reader.readU8();
    if (eventType === 1 && player.tutorial.stage === 2 && player.tutorial.sequenceIndex >= 2) {
        player.tutorial.shopClosedAfterBuy = true;
    } else if (eventType === 3 && player.tutorial.stage === 0 && !player.tutorial.desktopMovementSequenceEnabled) {
        player.tutorial.desktopMovementSequenceEnabled = true;
        player.tutorial.movementHoldIndex = 0;
        player.tutorial.movementHoldStartedAt = 0;
        player.sendTutorialObjective('Hold the W key on your keyboard for 2 seconds.', 0, 0);
    }
}

function handleUiPanelVisibilityPacket(reader, ws) {
    const panelId = reader.readU8();
    const isOpen = reader.readU8() === 1;

    if (panelId === 1) {
        ws.wantsLeaderboard = isOpen;
        if (isOpen) ws._leaderboardDirty = true;
        return;
    }

    if (panelId === 2) {
        ws.wantsMinimap = isOpen;
        if (isOpen) {
            ws._lastMinimapSignature = null;
            ws._lastTopLeaderSignature = null;
            ws._lastOptionalSyncWorld = null;
            ws._minimapTickCounter = 999;
        }
    }
}

// --- Helper Classes ---

class PacketReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.offset = 0;
    }

    readU8() { return this.view.getUint8(this.offset++); }
    readU16() {
        const val = this.view.getUint16(this.offset);
        this.offset += 2;
        return val;
    }
    readF32() {
        // Server angle was using big-endian in original code (DataView default is usually big-endian but explicit is better)
        const val = this.view.getFloat32(this.offset, false);
        this.offset += 4;
        return val;
    }
    readString() {
        const len = this.readU8();
        const str = this.buffer.toString('utf8', this.offset, this.offset + len);
        this.offset += len;
        return str;
    }
}
