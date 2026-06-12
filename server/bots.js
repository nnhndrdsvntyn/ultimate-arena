import fs from 'fs';
import { ENTITIES, MAP_SIZE } from './game.js';
import { getId, cmdRun, pushEntityOutOfSafeZone } from './helpers.js';
import { dataMap, TPS, ACCESSORY_KEYS, accessoryItemTypeFromId, isAccessoryItemType, isChestObjectType, isCoinObjectType, isWeaponRank, isWeaponTypeStronger, getWeaponOrder, getWeaponAttackStats, getWeaponCategory, isBoomerangType, DEFAULT_VIEW_RANGE_MULT, BOSS_PORTAL_MIN_SCORE, BOSS_PORTAL_MIN_SWORD_TYPE } from '../public/shared/datamap.js';
import { getWorldMapSize, WORLD_ROOT_DIMENSION, WORLD_YETI_DIMENSION, WORLD_DUNE_DIMENSION, WORLD_INFERNO_DIMENSION } from '../public/shared/worlds.js';
import { finalizePlayerLeaderboardRun } from './leaderboards.js';

export const BOT_POPULATION_TARGET = 20;
const BOT_RESPAWN_DELAY_MS = 3000;
const BOT_EDGE_PUSH_BUFFER = 2;
const BOT_CENTER_X = MAP_SIZE[0] / 2;
const BOT_CENTER_Y = MAP_SIZE[1] / 2;
const BOT_RIVER_LEFT = MAP_SIZE[0] * 0.47;
const BOT_RIVER_RIGHT = MAP_SIZE[0] * 0.53;
const BOT_AGGRO_RANGE = 850;
const BOT_ATTACK_RANGE = 170;
const BOT_THROW_RANGE_MIN = 240;
const BOT_THROW_RANGE_MAX = 760;
const BOT_PVE_RANGE = 1800;
const BOT_BOSS_LOOT_RANGE = 5000;
const BOT_COIN_RANGE = 1400;
const BOT_MOB_ATTACK_RANGE = 180;
const BOT_CHEST_ATTACK_RANGE = 190;
const BOT_POISON_AOE_RANGE = 300;
const BOT_ENERGY_BURST_RANGE = 500;
const BOT_SMOKE_AOE_RANGE = 320;
const BOT_LIGHTNING_RANGE = 500;
const MINOTAUR_MOB_TYPE = 6;
const POLAR_BEAR_MOB_TYPE = 5;
const HEARTY_MOB_TYPE = 4;
const ROOT_WALKER_MOB_TYPE = 7;
const YETI_MOB_TYPE = 8;
const DUNE_BEHEMOTH_MOB_TYPE = 16;
const INFERNO_BEAST_MOB_TYPE = 17;
const BOSS_DIMENSION_MOB_TYPES = new Set([ROOT_WALKER_MOB_TYPE, YETI_MOB_TYPE, DUNE_BEHEMOTH_MOB_TYPE, INFERNO_BEAST_MOB_TYPE]);
const BOSS_DIMENSION_WORLDS = new Set([WORLD_ROOT_DIMENSION, WORLD_YETI_DIMENSION, WORLD_DUNE_DIMENSION, WORLD_INFERNO_DIMENSION]);
const ROOT_WALKER_PRO_COMBAT_DIST = 235;
const ROOT_WALKER_CASUAL_COMBAT_DIST = 190;
const ROOT_WALKER_NOOB_COMBAT_DIST = 145;
const BOT_POLAR_BEAR_AVOID_RANGE = 380;
const BOT_LIFETIME_MIN_MS = 60 * 1000;
const BOT_LIFETIME_MAX_MS = 3 * 60 * 1000;
const BOT_SHOP_CHECK_MIN_MS = 5 * 1000;
const BOT_SHOP_CHECK_MAX_MS = 5 * 1000;
const BOT_DEBUG_SHOP = false;
const BOT_OFFSCREEN_ACTIVE_RANGE = 1700;
const BOT_DECISION_INTERVAL_MS = Math.max(1, Math.floor((1000 / Math.max(1, TPS.server || 20)) * 3));
const BOT_ROLE_PRO = 'pro';
const BOT_ROLE_CASUAL = 'casual';
const BOT_ROLE_NOOB = 'noob';
const BOT_ROLE_POOL = [BOT_ROLE_PRO, BOT_ROLE_CASUAL, BOT_ROLE_NOOB];
const BOT_WEAPON_CATEGORY_POOL = ['sword', 'spear', 'axe', 'boomerang'];
const ROOT_WALKER_PORTAL_STRUCTURE_TYPE = 5;
const ROOT_WALKER_SHRINE_STRUCTURE_TYPE = 4;
const BOT_RETALIATE_WINDOW_MS = 12000;
const BOT_KILL_TARGET_COOLDOWN_MS = 3 * 60 * 1000;
const BOT_KILL_LOOT_WINDOW_MS = 6000;
const BOT_KILL_LOOT_SEARCH_RADIUS = 220;
const BOT_KILL_LOOT_REACH_DIST = 40;
const BOT_IDLE_DESPAWN_SCORE = 1_000_000;
const BOT_IDLE_DESPAWN_RANGE = 2000;
const BOT_IDLE_DESPAWN_MS = 30 * 1000;
const BOT_STILL_DESPAWN_MS = 5000;
const BOT_STILL_POS_EPS_SQ = 0.01;
const BOT_STILL_ANGLE_EPS = 0.001;
const BOT_PICKUP_SPAWN_DELAY_MS = 220;
const BOT_STILL_MIN_TRAVEL = 30;
const BOT_STILL_MIN_TRAVEL_SQ = BOT_STILL_MIN_TRAVEL * BOT_STILL_MIN_TRAVEL;
const BOT_CLUSTER_RADIUS = 200;
const BOT_CLUSTER_RADIUS_SQ = BOT_CLUSTER_RADIUS * BOT_CLUSTER_RADIUS;
const BOT_CLUSTER_MIN_NEIGHBORS = 4;
const BOT_CLUSTER_DESPAWN_MS = 12000;
const BOT_OFFSCREEN_CONFLICT_RADIUS = 320;
const BOT_OFFSCREEN_CONFLICT_RADIUS_SQ = BOT_OFFSCREEN_CONFLICT_RADIUS * BOT_OFFSCREEN_CONFLICT_RADIUS;
const BOT_OFFSCREEN_CONFLICT_RELOCATE_MS = 6000;
const BOT_RELOCATION_MIN_BOT_DISTANCE = 520;
const BOT_RELOCATION_MIN_BOT_DISTANCE_SQ = BOT_RELOCATION_MIN_BOT_DISTANCE * BOT_RELOCATION_MIN_BOT_DISTANCE;
const BOT_RELOCATION_ATTEMPTS = 160;
const BOT_RELOCATION_RETRY_MIN_MS = 3000;
const BOT_RELOCATION_RETRY_MAX_MS = 6000;
const BOT_FARM_TARGET_MIN_MS = 6000;
const BOT_FARM_TARGET_MAX_MS = 12000;
const BOT_FARM_TARGET_REACH_DIST = 180;
const BOT_FARM_TARGET_REACH_DIST_SQ = BOT_FARM_TARGET_REACH_DIST * BOT_FARM_TARGET_REACH_DIST;
const TEAMER_TARGET_COUNT = 4;
const TEAM_GROUP_COUNT = 2;
const TEAM_GROUP_SIZE = 2;
const TEAM_SHUFFLE_INTERVAL_MS = 5 * 60 * 1000;
const HUNTER_REASSIGN_MS = 1000;
const PRO_HUNTER_MIN_SCORE = 3000;
const PRO_HUNTER_MIN_WEAPON_ORDER = 3;
const PRO_HUNTER_TARGET_MIN_SCORE = 3000;
const PRO_TARGET_SWORD_MAX_GAP = 2;
const HUNTER_TEAMUP_SCORE_MULT = 1.5;
const BOT_NAMES_FILE = new URL('./bot_names.txt', import.meta.url);

function loadBotNames() {
    try {
        const content = fs.readFileSync(BOT_NAMES_FILE, 'utf8');
        const names = content.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (names.length) return names;
    } catch (err) {
        // fall through to fallback
    }
    return [];
}

const BOT_USERNAMES = loadBotNames();
let botTargetPopulation = BOT_POPULATION_TARGET;
const teamGroupByBotId = new Map();
let lastTeamShuffleAt = 0;
let lastHunterAssignmentAt = 0;
const DEFAULT_PLAYER_SKIN = 2;
const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_WORLD_OBJECT_BUCKETS = Object.freeze({
    all: [],
    coins: [],
    activeCoins: [],
    chests: [],
    pickups: [],
    activePickups: []
});
const EMPTY_WORLD_MOB_BUCKETS = Object.freeze({
    polarBears: [],
    minotaurs: [],
    rootWalkers: [],
    bossDimensionMobs: [],
    hearties: [],
    polarBearsByTarget: new Map(),
    minotaursByTarget: new Map()
});

const MOVE_PATTERNS = [
    { w: 1, a: 0, s: 0, d: 0 },
    { w: 0, a: 1, s: 0, d: 0 },
    { w: 0, a: 0, s: 1, d: 0 },
    { w: 0, a: 0, s: 0, d: 1 },
    { w: 1, a: 1, s: 0, d: 0 },
    { w: 1, a: 0, s: 0, d: 1 },
    { w: 0, a: 1, s: 1, d: 0 },
    { w: 0, a: 0, s: 1, d: 1 },
    { w: 0, a: 0, s: 0, d: 0 }
];

function randomMainSpawn() {
    let x = MAP_SIZE[0] / 2;
    let y = MAP_SIZE[1] / 2;
    let attempts = 0;

    while (attempts < 120) {
        attempts++;
        x = Math.floor(300 + Math.random() * (MAP_SIZE[0] - 600));
        y = Math.floor(300 + Math.random() * (MAP_SIZE[1] - 600));

        const dx = x - BOT_CENTER_X;
        const dy = y - BOT_CENTER_Y;
        const outsideSpawnZone = (dx * dx + dy * dy) > (850 * 850);
        const outsideRiverCore = x < (BOT_RIVER_LEFT - 80) || x > (BOT_RIVER_RIGHT + 80);
        const hiddenFromPlayers = !isPositionInsideDefaultPlayerView('main', x, y);
        if (outsideSpawnZone && outsideRiverCore && hiddenFromPlayers) break;
    }

    return { x, y };
}

function isPositionInsideDefaultPlayerView(world, x, y) {
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        if (!player || player.isBot) continue;
        if ((player.world || 'main') !== world) continue;
        const dx = player.x - x;
        const dy = player.y - y;
        const range = 1500 * Math.max(DEFAULT_VIEW_RANGE_MULT, player.viewRangeMult || DEFAULT_VIEW_RANGE_MULT);
        if ((dx * dx) + (dy * dy) <= (range * range)) return true;
    }
    return false;
}

function getSpawnCandidateForWorld(world = 'main') {
    if (world === 'main') {
        const x = Math.floor(300 + Math.random() * (MAP_SIZE[0] - 600));
        const y = Math.floor(300 + Math.random() * (MAP_SIZE[1] - 600));
        return { x, y };
    }
    const [worldWidth, worldHeight] = getWorldMapSize(world);
    const margin = 220;
    const x = Math.floor(margin + Math.random() * Math.max(1, worldWidth - (margin * 2)));
    const y = Math.floor(margin + Math.random() * Math.max(1, worldHeight - (margin * 2)));
    return { x, y };
}

function isValidBotSpawnPosition(world, x, y) {
    if (world !== 'main') return true;
    const dx = x - BOT_CENTER_X;
    const dy = y - BOT_CENTER_Y;
    const outsideSpawnZone = (dx * dx + dy * dy) > (850 * 850);
    const outsideRiverCore = x < (BOT_RIVER_LEFT - 80) || x > (BOT_RIVER_RIGHT + 80);
    return outsideSpawnZone && outsideRiverCore;
}

function getNearestBotDistanceSq(world, x, y, botsToAvoid = null, ignoreBotId = 0) {
    const bots = Array.isArray(botsToAvoid) ? botsToAvoid : Object.values(ENTITIES.PLAYERS);
    let nearestDistSq = Infinity;
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot || !bot.isBot || !bot.isAlive || bot.id === ignoreBotId) continue;
        if ((bot.world || 'main') !== world) continue;
        const dx = bot.x - x;
        const dy = bot.y - y;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq < nearestDistSq) nearestDistSq = distSq;
    }
    return nearestDistSq;
}

function findHiddenSpreadSpawnForWorld(world = 'main', botsToAvoid = null, ignoreBotId = 0) {
    let best = null;
    let bestDistSq = -1;
    for (let attempts = 0; attempts < BOT_RELOCATION_ATTEMPTS; attempts++) {
        const pos = getSpawnCandidateForWorld(world);
        if (!isValidBotSpawnPosition(world, pos.x, pos.y)) continue;
        if (isPositionInsideDefaultPlayerView(world, pos.x, pos.y)) continue;
        const nearestBotDistSq = getNearestBotDistanceSq(world, pos.x, pos.y, botsToAvoid, ignoreBotId);
        if (nearestBotDistSq >= BOT_RELOCATION_MIN_BOT_DISTANCE_SQ) return pos;
        if (nearestBotDistSq > bestDistSq) {
            best = pos;
            bestDistSq = nearestBotDistSq;
        }
    }
    return bestDistSq >= BOT_CLUSTER_RADIUS_SQ ? best : null;
}

function getBotWorldSize(bot) {
    const world = bot?.world || 'main';
    return getWorldMapSize(world);
}

function getFarmTarget(bot, now = performance.now()) {
    const hasTarget = Number.isFinite(bot._botFarmTargetX) && Number.isFinite(bot._botFarmTargetY);
    if (hasTarget) {
        const dx = bot._botFarmTargetX - bot.x;
        const dy = bot._botFarmTargetY - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= BOT_FARM_TARGET_REACH_DIST_SQ) {
            bot._botFarmTargetUntil = 0;
        }
    }

    if (!hasTarget || now >= (bot._botFarmTargetUntil || 0)) {
        const target = randomMainSpawn();
        bot._botFarmTargetX = target.x;
        bot._botFarmTargetY = target.y;
        bot._botFarmTargetUntil = now + randomRangeInt(BOT_FARM_TARGET_MIN_MS, BOT_FARM_TARGET_MAX_MS);
    }

    return { x: bot._botFarmTargetX, y: bot._botFarmTargetY };
}

function applyMovePattern(bot, pattern) {
    bot.keys.w = pattern.w;
    bot.keys.a = pattern.a;
    bot.keys.s = pattern.s;
    bot.keys.d = pattern.d;
}

function chooseRandomMovePattern(bot) {
    const pattern = MOVE_PATTERNS[Math.floor(Math.random() * MOVE_PATTERNS.length)];
    applyMovePattern(bot, pattern);
}

function randomRangeInt(min, max) {
    return min + Math.floor(Math.random() * Math.max(1, (max - min + 1)));
}

function randomBotSkin() {
    return DEFAULT_PLAYER_SKIN;
}

function degToRad(deg) {
    return (deg * Math.PI) / 180;
}

function getRandomBotUsername() {
    if (BOT_USERNAMES.length === 0) return 'Bot';
    return BOT_USERNAMES[Math.floor(Math.random() * BOT_USERNAMES.length)] || 'Bot';
}

function getUniqueBotUsername(excludeBotId = null) {
    const used = new Set();
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isBot) continue;
        if (excludeBotId !== null && Number(id) === Number(excludeBotId)) continue;
        if (p.username) used.add(p.username);
    }

    const available = BOT_USERNAMES.filter(name => !used.has(name));
    if (available.length) {
        return available[Math.floor(Math.random() * available.length)];
    }

    const base = getRandomBotUsername();
    let suffix = 2;
    let candidate = `${base}${suffix}`;
    while (used.has(candidate)) {
        suffix++;
        candidate = `${base}${suffix}`;
    }
    return candidate;
}

function resetBotLifeTimers(bot, now = performance.now()) {
    bot._botBornAt = now;
    bot._botLifetimeMs = randomRangeInt(BOT_LIFETIME_MIN_MS, BOT_LIFETIME_MAX_MS);
    bot._botTargetedRealPlayerThisLife = false;
    bot._botBoughtAccessoryThisLife = false;
    bot._botNextShopCheckAt = now + randomRangeInt(BOT_SHOP_CHECK_MIN_MS, BOT_SHOP_CHECK_MAX_MS);
    bot._botPreferredCombatDist = randomRangeInt(30, 60);
    bot._botStrafeDir = Math.random() < 0.5 ? -1 : 1;
    bot._botNextStrafeFlipAt = now + randomRangeInt(700, 1800);
    bot._botAvoidOffsetSign = Math.random() < 0.5 ? -1 : 1;
    bot._botPrimitiveAngle = Math.random() * Math.PI * 2;
    bot._botPrimitiveTurnAt = now + randomRangeInt(1200, 3200);
}

function rerollBotWeaponCategory(bot) {
    const category = BOT_WEAPON_CATEGORY_POOL[Math.floor(Math.random() * BOT_WEAPON_CATEGORY_POOL.length)] || 'sword';
    bot._botWeaponCategory = category;
    return category;
}

function getBotWeaponCategory(bot) {
    if (!BOT_WEAPON_CATEGORY_POOL.includes(bot?._botWeaponCategory)) {
        return rerollBotWeaponCategory(bot);
    }
    return bot._botWeaponCategory;
}

function isBotPreferredWeapon(bot, weaponType) {
    return isWeaponRank(weaponType) && getWeaponCategory(weaponType) === getBotWeaponCategory(bot);
}

function getBestSwordRank(bot) {
    let best = 1;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const rank = bot.inventory[i] & 0x7F;
        if (!isWeaponRank(rank)) continue;
        if (isWeaponTypeStronger(rank, best)) best = rank;
    }
    return best;
}

function getBestBotPreferredWeaponRank(bot) {
    let best = 0;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const rank = bot.inventory[i] & 0x7F;
        if (!isBotPreferredWeapon(bot, rank)) continue;
        if (!best || isWeaponTypeStronger(rank, best)) best = rank;
    }
    return best || 1;
}

function getBotPreferredWeaponCap(bot, fallbackMaxType = 0) {
    const category = getBotWeaponCategory(bot);
    const roleCapOrder = getWeaponOrder(fallbackMaxType || 0) || Infinity;
    let cap = 0;
    for (const item of dataMap.SHOP_ITEMS || []) {
        if (item?.category !== category) continue;
        const id = item.id | 0;
        if (!isWeaponRank(id)) continue;
        if (getWeaponOrder(id) > roleCapOrder) continue;
        if (!cap || isWeaponTypeStronger(id, cap)) cap = id;
    }
    return cap || fallbackMaxType || getBestBotPreferredWeaponRank(bot);
}

function getNextBotPreferredWeaponType(bot, currentType, maxType = 0) {
    const category = getBotWeaponCategory(bot);
    const currentOrder = getWeaponOrder(currentType);
    const maxOrder = maxType > 0 ? getWeaponOrder(maxType) : Infinity;
    let next = 0;
    for (const item of dataMap.SHOP_ITEMS || []) {
        if (item?.category !== category) continue;
        const type = item.id | 0;
        if (!isWeaponRank(type)) continue;
        const order = getWeaponOrder(type);
        if (order <= currentOrder || order > maxOrder) continue;
        if (!next || order < getWeaponOrder(next)) next = type;
    }
    return next;
}

function getBestWeaponDamage(bot) {
    let bestDamage = 0;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const rank = bot.inventory[i] & 0x7F;
        if (!isWeaponRank(rank)) continue;
        const damage = Number(getWeaponAttackStats(rank)?.damage) || 0;
        if (damage > bestDamage) bestDamage = damage;
    }
    return bestDamage;
}

function getOpenRootWalkerPortal() {
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || structure.type !== ROOT_WALKER_PORTAL_STRUCTURE_TYPE) continue;
        if ((structure.world || 'main') !== 'main') continue;
        return structure;
    }
    return null;
}

function getBossDimensionExitPortal(world) {
    if (!isBossDimensionWorld(world)) return null;
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || structure.type !== ROOT_WALKER_PORTAL_STRUCTURE_TYPE) continue;
        if ((structure.world || 'main') !== world) continue;
        if (structure.portalMode !== 'exit') continue;
        return structure;
    }
    return null;
}

function getRootWalkerShrine() {
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || structure.type !== ROOT_WALKER_SHRINE_STRUCTURE_TYPE) continue;
        if ((structure.world || 'main') !== 'main') continue;
        return structure;
    }
    return null;
}

function isBossDimensionWorld(world) {
    return BOSS_DIMENSION_WORLDS.has(world || 'main');
}

function isBossDimensionBossMob(mob) {
    return !!mob && BOSS_DIMENSION_MOB_TYPES.has(mob.type);
}

function getBossDimensionCombatDistance(role) {
    return role === BOT_ROLE_PRO
        ? ROOT_WALKER_PRO_COMBAT_DIST
        : (role === BOT_ROLE_CASUAL ? ROOT_WALKER_CASUAL_COMBAT_DIST : ROOT_WALKER_NOOB_COMBAT_DIST);
}

function getInventorySlotForItemType(bot, itemType) {
    if (!bot?.inventory || !bot?.inventoryCounts) return -1;
    const desiredType = itemType & 0x7F;
    for (let i = 0; i < bot.inventory.length; i++) {
        if ((bot.inventoryCounts[i] || 0) <= 0) continue;
        const rawType = (bot.inventory[i] || 0) & 0x7F;
        if (rawType === desiredType) return i;
    }
    return -1;
}

function tryOpenRootWalkerPortal(bot, now = performance.now()) {
    if (!bot?.isBot || !bot.isAlive) return false;
    const role = getBotRole(bot);
    if (role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL) return false;
    if ((bot.world || 'main') !== 'main') return false;

    const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
    if (!goldenSkullType) return false;
    const skullSlot = getInventorySlotForItemType(bot, goldenSkullType);
    if (skullSlot < 0) return false;

    const shrine = getRootWalkerShrine();
    if (!shrine) return false;

    bot._botHasLockedTarget = true;
    bot.attacking = 0;
    const dx = shrine.x - bot.x;
    const dy = shrine.y - bot.y;
    const nearShrineSq = 90 * 90;
    if ((dx * dx + dy * dy) > nearShrineSq) {
        moveToward(bot, shrine.x, shrine.y);
        bot._botNextMoveAt = now + 120 + Math.floor(Math.random() * 180);
        return true;
    }

    bot.keys.w = 0;
    bot.keys.a = 0;
    bot.keys.s = 0;
    bot.keys.d = 0;
    if (bot.selectedSlot !== skullSlot && typeof bot.selectSlot === 'function') {
        bot.selectSlot(skullSlot);
    }
    if (typeof bot.useItem === 'function') {
        bot.useItem();
    }
    bot._botNextMoveAt = now + 250 + Math.floor(Math.random() * 250);
    return true;
}

function canBotEnterRootWalkerPortal(bot) {
    if (!bot?.isBot || !bot.isAlive) return false;
    const role = getBotRole(bot);
    if (role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL) return false;
    if ((bot.world || 'main') !== 'main') return false;
    if ((Number(bot.score) || 0) < BOSS_PORTAL_MIN_SCORE) return false;
    const requiredDamage = Number(getWeaponAttackStats(BOSS_PORTAL_MIN_SWORD_TYPE)?.damage) || 0;
    if (getBestWeaponDamage(bot) < requiredDamage) return false;
    if (role === BOT_ROLE_CASUAL && (bot.accessoryId || 0) <= 0 && (bot.equippedAccessoryItemType || 0) <= 0) return false;
    return !!getOpenRootWalkerPortal();
}

function trySendBotToRootWalkerPortal(bot, now = performance.now()) {
    if (!canBotEnterRootWalkerPortal(bot)) return false;
    const retaliationTarget = bot.lastDamager;
    if (retaliationTarget && retaliationTarget.isAlive && !retaliationTarget.isBot) {
        const attackerWorld = retaliationTarget.world || 'main';
        if (attackerWorld === (bot.world || 'main') && (now - (bot.lastDamagedTime || 0)) <= BOT_RETALIATE_WINDOW_MS) {
            return false;
        }
    }

    const portal = getOpenRootWalkerPortal();
    if (!portal) return false;

    bot._botHasLockedTarget = true;
    bot.attacking = 0;
    const dx = portal.x - bot.x;
    const dy = portal.y - bot.y;
    if ((dx * dx + dy * dy) <= (70 * 70)) {
        bot.keys.w = 0;
        bot.keys.a = 0;
        bot.keys.s = 0;
        bot.keys.d = 0;
    } else {
        moveToward(bot, portal.x, portal.y);
    }
    if (typeof bot.tryPickup === 'function') {
        bot.tryPickup(now);
    }
    bot._botNextMoveAt = now + 120 + Math.floor(Math.random() * 180);
    return true;
}

function trySendBotToBossExitPortal(bot, now = performance.now(), moveTowardFn = null) {
    if (!bot?.isBot || !bot.isAlive) return false;
    const world = bot.world || 'main';
    if (!isBossDimensionWorld(world)) return false;

    const portal = getBossDimensionExitPortal(world);
    if (!portal) return false;

    bot._botHasLockedTarget = true;
    bot.attacking = 0;
    const dx = portal.x - bot.x;
    const dy = portal.y - bot.y;
    const distSq = (dx * dx) + (dy * dy);
    if (distSq <= (70 * 70)) {
        bot.keys.w = 0;
        bot.keys.a = 0;
        bot.keys.s = 0;
        bot.keys.d = 0;
        bot.angle = Math.atan2(dy, dx);
        bot._rootWalkerPortalSince = bot._rootWalkerPortalSince || now;
    } else {
        bot._rootWalkerPortalSince = 0;
        if (typeof moveTowardFn === 'function') {
            moveTowardFn(portal.x, portal.y);
        } else {
            moveToward(bot, portal.x, portal.y);
        }
    }
    bot._botNextMoveAt = now + 120 + Math.floor(Math.random() * 180);
    return true;
}

function equipBestSword(bot) {
    let bestSlot = -1;
    let bestRank = 0;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const rank = bot.inventory[i] & 0x7F;
        if (!isBotPreferredWeapon(bot, rank)) continue;
        if (isWeaponTypeStronger(rank, bestRank)) {
            bestRank = rank;
            bestSlot = i;
        }
    }
    if (bestSlot === -1) {
        for (let i = 0; i < bot.inventory.length; i++) {
            if (bot.inventoryCounts[i] <= 0) continue;
            const rank = bot.inventory[i] & 0x7F;
            if (!isWeaponRank(rank)) continue;
            if (isWeaponTypeStronger(rank, bestRank)) {
                bestRank = rank;
                bestSlot = i;
            }
        }
    }
    if (bestSlot >= 0 && bot.selectedSlot !== bestSlot) {
        bot.selectSlot(bestSlot);
    }
}

function getBuyableAccessoryIds() {
    const ids = [];
    for (let id = 1; id < ACCESSORY_KEYS.length; id++) {
        const key = ACCESSORY_KEYS[id];
        if (!key) continue;
        if (dataMap.ACCESSORIES[key]?.shopHidden) continue;
        ids.push(id);
    }
    return ids;
}

const BUYABLE_ACCESSORY_IDS = getBuyableAccessoryIds();
const ACCESSORY_ID_BY_KEY = ACCESSORY_KEYS.reduce((acc, key, idx) => {
    if (key) acc[key] = idx;
    return acc;
}, {});
const BOT_ALLOWED_ACCESSORY_KEYS = ['bush_cloak', 'pirate_hat', 'viking_hat', 'alien_antennas', 'dark_cloak', 'heart_shades'];
const BOT_ALLOWED_ACCESSORY_IDS = BOT_ALLOWED_ACCESSORY_KEYS
    .map(key => ACCESSORY_ID_BY_KEY[key])
    .filter(id => Number.isInteger(id) && id > 0);
const HEART_SHADES_ID = ACCESSORY_ID_BY_KEY['heart_shades'] || 0;
const XP_SHOP_ITEMS = Array.isArray(dataMap.XP_SHOP_ITEMS)
    ? dataMap.XP_SHOP_ITEMS
        .map(item => ({
            id: item?.id | 0,
            price: Math.max(0, Math.floor(item?.price || 0)),
            xp: Math.max(0, Math.floor(item?.xp || 0))
        }))
        .filter(item => item.id > 0 && item.price > 0 && item.xp > 0)
    : [];

function getBotRole(bot) {
    if (bot._botRole === BOT_ROLE_PRO || bot._botRole === BOT_ROLE_CASUAL || bot._botRole === BOT_ROLE_NOOB) {
        return bot._botRole;
    }
    const role = BOT_ROLE_POOL[Math.floor(Math.random() * BOT_ROLE_POOL.length)] || BOT_ROLE_CASUAL;
    bot._botRole = role;
    return role;
}

function assignBotPreferredAccessory(bot) {
    if (!BOT_ALLOWED_ACCESSORY_IDS.length) {
        bot._botPreferredAccessoryId = 0;
        return 0;
    }
    const pick = BOT_ALLOWED_ACCESSORY_IDS[Math.floor(Math.random() * BOT_ALLOWED_ACCESSORY_IDS.length)];
    bot._botPreferredAccessoryId = pick || 0;
    return bot._botPreferredAccessoryId;
}

function clearExpiredBotKillImmunities(bot, now = performance.now()) {
    const immunityMap = bot?._botKillTargetCooldowns;
    if (!immunityMap) return;
    for (const [playerId, expiresAt] of immunityMap.entries()) {
        if (expiresAt <= now) immunityMap.delete(playerId);
    }
}

function hasRecentAggroFromTarget(bot, target, now = performance.now()) {
    if (!bot || !target) return false;
    if ((target.lastDiedTime || 0) >= (bot.lastDamagedTime || 0)) {
        if (bot.lastDamager?.id === target.id) bot.lastDamager = null;
        return false;
    }
    return bot.lastDamager?.id === target.id &&
        (now - (bot.lastDamagedTime || 0)) <= BOT_RETALIATE_WINDOW_MS;
}

function isBotTargetTemporarilyIgnored(bot, target, now = performance.now()) {
    const role = getBotRole(bot);
    if (!bot?.isBot || (role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL)) return false;
    if (!target || target.isBot || !target.isAlive) return false;
    if (typeof target.isPvpProtected === 'function' && target.isPvpProtected()) return true;
    if (hasRecentAggroFromTarget(bot, target, now)) {
        bot._botKillTargetCooldowns?.delete(target.id);
        return false;
    }

    clearExpiredBotKillImmunities(bot, now);
    const immunityUntil = bot._botKillTargetCooldowns?.get(target.id) || 0;
    return immunityUntil > now;
}

function getBotSwordCap(bot) {
    const role = getBotRole(bot);
    if (role === BOT_ROLE_NOOB) return 5;
    if (role === BOT_ROLE_CASUAL) return 7;
    return 8;
}

function getBotScoreCap(bot) {
    const role = getBotRole(bot);
    if (role === BOT_ROLE_NOOB) return 10000;
    if (role === BOT_ROLE_CASUAL) return 25000;
    return 50000;
}

function hasReachedScoreCap(bot) {
    const cap = getBotScoreCap(bot);
    const score = Math.max(0, bot?.score || 0);
    return score >= cap;
}

function shouldEngagePlayer(bot, target, now = performance.now()) {
    if (!bot || !target || !target.isAlive) return false;
    if (target.isInvisible) return false;
    if (bot.touchingSafeZone || target.touchingSafeZone) return false;
    if (typeof bot.isPvpProtected === 'function' && bot.isPvpProtected()) return false;
    if (typeof target.isPvpProtected === 'function' && target.isPvpProtected()) return false;
    if (shouldIgnoreCombatBetween(bot, target)) return false;
    if (hasRecentAggroFromTarget(bot, target, now)) return true;
    const role = getBotRole(bot);
    if (role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL) return true;
    const botScore = Math.max(0, bot.score || 0);
    if (botScore <= 0) return true;
    const targetScore = Math.max(0, target.score || 0);
    return targetScore >= botScore * 0.5;
}

function hasEquippedAccessory(bot) {
    return (bot.accessoryId || 0) > 0 || (bot.equippedAccessoryItemType || 0) > 0;
}

function chooseAccessoryForRole(bot, affordableAccessoryIds) {
    if (!affordableAccessoryIds.length) return null;
    const preferred = bot?._botPreferredAccessoryId || 0;
    if (preferred > 0 && affordableAccessoryIds.includes(preferred)) return preferred;
    return null;
}

function getBotTeamGroup(bot) {
    return teamGroupByBotId.get(bot.id) || 0;
}

function shouldIgnoreCombatBetween(bot, other) {
    if (!bot || !other) return false;
    // Never fight protected entities.
    if (typeof bot.isPvpProtected === 'function' && bot.isPvpProtected()) return true;
    if (typeof other.isPvpProtected === 'function' && other.isPvpProtected()) return true;
    if (!bot.isBot || !other.isBot) return false;
    const myGroup = getBotTeamGroup(bot);
    const otherGroup = getBotTeamGroup(other);
    return myGroup > 0 && myGroup === otherGroup;
}

function isBotPossiblySpectated(bot) {
    if (!bot) return false;
    const worldId = bot.world || 'main';
    let hasDeadSpectator = false;
    let topPlayer = null;
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || (p.world || 'main') !== worldId) continue;
        if (!p.isBot && !p.isAlive) hasDeadSpectator = true;
        if (p.isAlive) {
            if (!topPlayer || (p.score || 0) > (topPlayer.score || 0)) topPlayer = p;
        }
    }
    if (!hasDeadSpectator) return false;
    return topPlayer && topPlayer.id === bot.id;
}

function getTargetSwordRankForHunt(target) {
    const rank = target?.weapon?.rank;
    if (!Number.isFinite(rank)) return 1;
    return Math.max(1, rank | 0);
}

function canHunterEngageTarget(bot, target) {
    if (!bot || !target) return false;
    if (target.isInvisible) return false;
    if (bot.touchingSafeZone || target.touchingSafeZone) return false;
    if (typeof bot.isPvpProtected === 'function' && bot.isPvpProtected()) return false;
    if (typeof target.isPvpProtected === 'function' && target.isPvpProtected()) return false;
    if (isBotTargetTemporarilyIgnored(bot, target)) return false;
    const hunterRank = getBestSwordRank(bot);
    const hunterOrder = getWeaponOrder(hunterRank);
    if (hunterOrder < PRO_HUNTER_MIN_WEAPON_ORDER) return false;
    if ((target.score || 0) < PRO_HUNTER_TARGET_MIN_SCORE) return false;
    const targetRank = getTargetSwordRankForHunt(target);
    const targetOrder = getWeaponOrder(targetRank);
    const requiredHunterOrder = Math.max(1, targetOrder - 2);
    const minTargetOrder = Math.max(1, hunterOrder - PRO_TARGET_SWORD_MAX_GAP);
    return hunterOrder >= requiredHunterOrder && targetOrder >= minTargetOrder;
}

function getRetaliationTarget(bot) {
    const attacker = bot.lastDamager;
    if (!attacker || attacker.id === bot.id || !attacker.isAlive) return null;
    if (attacker.isInvisible) return null;
    if ((attacker.world || 'main') !== (bot.world || 'main')) return null;
    if (bot.touchingSafeZone || attacker.touchingSafeZone) return null;
    if (typeof attacker.isPvpProtected === 'function' && attacker.isPvpProtected()) return null;
    if (typeof bot.isPvpProtected === 'function' && bot.isPvpProtected()) return null;

    const dx = attacker.x - bot.x;
    const dy = attacker.y - bot.y;
    const distSq = dx * dx + dy * dy;
    const isPlayerTarget = !!attacker.inventory;
    if (isPlayerTarget) {
        if (ENTITIES.PLAYERS[attacker.id] !== attacker) {
            if (bot.lastDamager?.id === attacker.id) bot.lastDamager = null;
            return null;
        }
        if (isBotTargetTemporarilyIgnored(bot, attacker)) return null;
        if (shouldIgnoreCombatBetween(bot, attacker)) return null;
        return { kind: 'player', target: attacker, distSq };
    }
    return { kind: 'mob', target: attacker, distSq };
}

function getBotHeartyEssenceCount(bot) {
    const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
    if (!essenceType) return 0;
    if (typeof bot.getTotalItemCount === 'function') {
        return bot.getTotalItemCount(essenceType);
    }
    let total = 0;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventory[i] === essenceType) {
            total += bot.inventoryCounts[i] || 0;
        }
    }
    return total;
}

function needsHeartShades(bot) {
    if (!bot || !bot.isBot) return false;
    if (bot._botBoughtAccessoryThisLife) return false;
    const preferredId = bot?._botPreferredAccessoryId || 0;
    if (preferredId !== HEART_SHADES_ID || HEART_SHADES_ID <= 0) return false;
    const costConfig = dataMap.ACCESSORY_COSTS?.['heart_shades'];
    if (!costConfig || costConfig.currency !== 'hearty_essence') return false;
    const required = Math.max(1, Math.floor(costConfig.amount || 0));
    if (required <= 0) return false;
    return getBotHeartyEssenceCount(bot) < required;
}

function refreshTeamerAssignments(now = performance.now(), allBots = null) {
    const bots = Array.isArray(allBots)
        ? allBots
        : (() => {
            const collected = [];
            for (const id in ENTITIES.PLAYERS) {
                const p = ENTITIES.PLAYERS[id];
                if (!p || !p.isBot || (p.world || 'main') !== 'main') continue;
                collected.push(p);
            }
            return collected;
        })();
    const allBotIds = [];
    for (let i = 0; i < bots.length; i++) {
        allBotIds.push(bots[i].id);
    }

    const shouldShuffle =
        teamGroupByBotId.size === 0 ||
        (now - lastTeamShuffleAt >= TEAM_SHUFFLE_INTERVAL_MS);
    if (shouldShuffle) {
        teamGroupByBotId.clear();
        lastTeamShuffleAt = now;
    }

    const aliveBotSet = new Set(allBotIds);
    for (const botId of teamGroupByBotId.keys()) {
        if (!aliveBotSet.has(botId)) teamGroupByBotId.delete(botId);
    }

    const desiredTeamers = Math.min(TEAMER_TARGET_COUNT, allBotIds.length);
    if (teamGroupByBotId.size > desiredTeamers) {
        const assigned = Array.from(teamGroupByBotId.keys());
        while (teamGroupByBotId.size > desiredTeamers) {
            const idx = Math.floor(Math.random() * assigned.length);
            const [removed] = assigned.splice(idx, 1);
            teamGroupByBotId.delete(removed);
        }
    }

    const groupCounts = new Array(TEAM_GROUP_COUNT + 1).fill(0);
    for (const group of teamGroupByBotId.values()) {
        if (group >= 1 && group <= TEAM_GROUP_COUNT) groupCounts[group]++;
    }

    while (teamGroupByBotId.size < desiredTeamers) {
        const unassigned = [];
        for (let i = 0; i < allBotIds.length; i++) {
            const candidateId = allBotIds[i];
            if (!teamGroupByBotId.has(candidateId)) unassigned.push(candidateId);
        }
        if (!unassigned.length) break;
        const chosenBotId = unassigned[Math.floor(Math.random() * unassigned.length)];
        const availableGroups = [];
        for (let group = 1; group <= TEAM_GROUP_COUNT; group++) {
            if (groupCounts[group] < TEAM_GROUP_SIZE) availableGroups.push(group);
        }
        if (!availableGroups.length) break;
        const group = availableGroups[Math.floor(Math.random() * availableGroups.length)];
        teamGroupByBotId.set(chosenBotId, group);
        groupCounts[group]++;
    }

    // Ensure at least one teamer is a pro bot (if any pro exists).
    const assignedIds = new Set(teamGroupByBotId.keys());
    let hasProTeamer = false;
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (assignedIds.has(bot.id) && getBotRole(bot) === BOT_ROLE_PRO) {
            hasProTeamer = true;
            break;
        }
    }
    if (!hasProTeamer) {
        const proCandidates = [];
        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            if (assignedIds.has(bot.id)) continue;
            if (getBotRole(bot) === BOT_ROLE_PRO) proCandidates.push(bot);
        }
        if (proCandidates.length && teamGroupByBotId.size > 0) {
            const incomingPro = proCandidates[Math.floor(Math.random() * proCandidates.length)];
            const outgoingIds = Array.from(teamGroupByBotId.keys());
            const outgoingId = outgoingIds[Math.floor(Math.random() * outgoingIds.length)];
            const outgoingGroup = teamGroupByBotId.get(outgoingId);
            teamGroupByBotId.delete(outgoingId);
            teamGroupByBotId.set(incomingPro.id, outgoingGroup);
        }
    }

    // Mirror group membership onto bot objects for debugging/inspection.
    for (const bot of bots) {
        bot._botTeamGroup = teamGroupByBotId.get(bot.id) || 0;
    }
}

function refreshHunterAssignments(realPlayers, now = performance.now(), context = null) {
    if (now - lastHunterAssignmentAt < HUNTER_REASSIGN_MS) return;
    lastHunterAssignmentAt = now;

    const aliveRealPlayers = [];
    const realIds = new Set();
    for (let i = 0; i < realPlayers.length; i++) {
        const p = realPlayers[i];
        if (!p || !p.isAlive || p.isBot || p.hasShield || p.touchingSafeZone || (p.world || 'main') !== 'main' || (typeof p.isPvpProtected === 'function' && p.isPvpProtected())) continue;
        aliveRealPlayers.push(p);
        realIds.add(p.id);
    }
    // Prioritize highest-score players so hunters focus the top leaderboard first.
    aliveRealPlayers.sort((a, b) => (b.score || 0) - (a.score || 0));
    const proBots = Array.isArray(context?.proBots)
        ? context.proBots
        : (() => {
            const collected = [];
            for (const id in ENTITIES.PLAYERS) {
                const b = ENTITIES.PLAYERS[id];
                if (!b || !b.isBot || !b.isAlive || (b.world || 'main') !== 'main') continue;
                if (getBotRole(b) === BOT_ROLE_PRO) collected.push(b);
            }
            return collected;
        })();
    const allBots = Array.isArray(context?.allBots)
        ? context.allBots
        : (() => {
            const collected = [];
            for (const id in ENTITIES.PLAYERS) {
                const b = ENTITIES.PLAYERS[id];
                if (b && b.isBot) collected.push(b);
            }
            return collected;
        })();

    const groupAliveBots = new Map();
    for (const bot of allBots) {
        if (!bot || !bot.isAlive || (bot.world || 'main') !== 'main') continue;
        const group = getBotTeamGroup(bot);
        if (!group) continue;
        if (!groupAliveBots.has(group)) groupAliveBots.set(group, []);
        groupAliveBots.get(group).push(bot);
    }
    const teammateByBotId = new Map();
    for (const botsInGroup of groupAliveBots.values()) {
        for (let i = 0; i < botsInGroup.length; i++) {
            const bot = botsInGroup[i];
            let teammate = null;
            for (let j = 0; j < botsInGroup.length; j++) {
                if (i === j) continue;
                teammate = botsInGroup[j];
                break;
            }
            teammateByBotId.set(bot.id, teammate);
        }
    }
    const getCachedTeammate = (bot) => teammateByBotId.get(bot?.id) || null;

    for (const bot of allBots) {
        bot._botAssistTargetId = 0;
    }

    const claimedTargets = new Set();
    const targetToHunterId = new Map();
    for (const bot of proBots) {
        const targetId = bot._botHunterTargetId || 0;
        const target = targetId ? ENTITIES.PLAYERS[targetId] : null;
        const stillValid =
            !!target &&
            realIds.has(targetId) &&
            !claimedTargets.has(targetId) &&
            canHunterEngageTarget(bot, target);
        if (!stillValid) {
            bot._botHunterTargetId = 0;
            continue;
        }
        claimedTargets.add(targetId);
        targetToHunterId.set(targetId, bot.id);
    }

    const unassignedHunters = proBots.filter(bot =>
        !bot._botHunterTargetId &&
        (bot.score || 0) >= PRO_HUNTER_MIN_SCORE
    );
    for (const player of aliveRealPlayers) {
        if (!unassignedHunters.length) break;
        if (claimedTargets.has(player.id)) continue;

        let bestIdx = -1;
        let bestDistSq = Infinity;
        let bestPriority = Infinity;
        for (let i = 0; i < unassignedHunters.length; i++) {
            const bot = unassignedHunters[i];
            if (!canHunterEngageTarget(bot, player)) continue;
            const teammate = getCachedTeammate(bot);
            const canBringTeammate = !!teammate && ((player.score || 0) > ((bot.score || 0) * HUNTER_TEAMUP_SCORE_MULT));
            const priority = canBringTeammate ? 0 : 1;
            const dx = player.x - bot.x;
            const dy = player.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (priority < bestPriority || (priority === bestPriority && distSq < bestDistSq)) {
                bestPriority = priority;
                bestDistSq = distSq;
                bestIdx = i;
            }
        }

        if (bestIdx < 0) continue;
        const hunter = unassignedHunters.splice(bestIdx, 1)[0];
        if (!hunter) continue;
        hunter._botHunterTargetId = player.id;
        claimedTargets.add(player.id);
        targetToHunterId.set(player.id, hunter.id);
    }

    // If score condition demands teammate pressure, prefer a hunter that has a teammate.
    // This can hand off from a solo hunter to a teammate-capable pro.
    for (const player of aliveRealPlayers) {
        const targetId = player.id;
        const currentHunterId = targetToHunterId.get(targetId);
        if (!currentHunterId) continue;
        const currentHunter = ENTITIES.PLAYERS[currentHunterId];
        if (!currentHunter || !currentHunter.isAlive) continue;

        const needsTeammatePressure = (player.score || 0) > ((currentHunter.score || 0) * HUNTER_TEAMUP_SCORE_MULT);
        if (!needsTeammatePressure) continue;
        if (getCachedTeammate(currentHunter)) continue;

        // Find best reassignment candidate that can bring a teammate.
        let bestCandidate = null;
        let bestDistSq = Infinity;
        for (const candidate of proBots) {
            if (!candidate || !candidate.isAlive) continue;
            if (candidate.id === currentHunter.id) continue;
            if (candidate._botHunterTargetId) continue;
            if ((candidate.score || 0) < PRO_HUNTER_MIN_SCORE) continue;
            if (!canHunterEngageTarget(candidate, player)) continue;
            if (!getCachedTeammate(candidate)) continue;

            const dx = player.x - candidate.x;
            const dy = player.y - candidate.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestCandidate = candidate;
            }
        }

        if (!bestCandidate) continue;
        currentHunter._botHunterTargetId = 0;
        bestCandidate._botHunterTargetId = targetId;
        targetToHunterId.set(targetId, bestCandidate.id);
    }

    // Optional teammate assist: only when target score is > 1.5x hunter score and hunter has a teammate.
    for (const hunter of proBots) {
        const targetId = hunter._botHunterTargetId || 0;
        if (!targetId) continue;
        const target = ENTITIES.PLAYERS[targetId];
        if (!target || !target.isAlive || target.isBot) continue;
        const teammate = getCachedTeammate(hunter);
        if (!teammate) continue;
        if ((target.score || 0) <= ((hunter.score || 0) * HUNTER_TEAMUP_SCORE_MULT)) continue;
        teammate._botAssistTargetId = targetId;
    }
}

function ensureTopPlayerHasHunter(allBots = []) {
    if (!allBots.length) return;
    let topPlayer = null;
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive) continue;
        if (p.hasShield || p.touchingSafeZone) continue;
        if ((p.world || 'main') !== 'main') continue;
        if (!topPlayer || (p.score || 0) > (topPlayer.score || 0)) topPlayer = p;
    }
    if (!topPlayer) return;
    const topId = topPlayer.id;
    const alreadyTargeted = allBots.some(b => b && b.isAlive && b._botHunterTargetId === topId);
    if (alreadyTargeted) return;

    let candidate = null;
    for (const bot of allBots) {
        if (!bot || !bot.isAlive || (bot.world || 'main') !== (topPlayer.world || 'main')) continue;
        const role = getBotRole(bot);
        if (role === BOT_ROLE_PRO) {
            candidate = bot;
            break;
        }
        if (!candidate && role === BOT_ROLE_CASUAL) candidate = bot;
    }
    if (candidate) candidate._botHunterTargetId = topId;
}

function collectBotTickState() {
    const realPlayers = [];
    const allBots = [];
    const allMainBots = [];
    const proMainBots = [];

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p) continue;
        if (p.isBot) {
            allBots.push(p);
            if ((p.world || 'main') === 'main') {
                allMainBots.push(p);
                if (p.isAlive && getBotRole(p) === BOT_ROLE_PRO) {
                    proMainBots.push(p);
                }
            }
            continue;
        }
        realPlayers.push(p);
    }

    return { realPlayers, allBots, allMainBots, proMainBots };
}

function buildPlayersByWorld(players) {
    const playersByWorld = new Map();
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        if (!player) continue;
        const world = player.world || 'main';
        let worldPlayers = playersByWorld.get(world);
        if (!worldPlayers) {
            worldPlayers = [];
            playersByWorld.set(world, worldPlayers);
        }
        worldPlayers.push(player);
    }
    return playersByWorld;
}

function buildBotsByWorld(bots) {
    const botsByWorld = new Map();
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot) continue;
        const world = bot.world || 'main';
        let worldBots = botsByWorld.get(world);
        if (!worldBots) {
            worldBots = [];
            botsByWorld.set(world, worldBots);
        }
        worldBots.push(bot);
    }
    return botsByWorld;
}

function buildWorldObjectBuckets() {
    const buckets = new Map();
    const now = performance.now();
    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj) continue;
        const world = obj.world || 'main';
        let bucket = buckets.get(world);
        if (!bucket) {
            bucket = { all: [], coins: [], activeCoins: [], chests: [], pickups: [], activePickups: [] };
            buckets.set(world, bucket);
        }
        bucket.all.push(obj);
        const objectCfg = dataMap.OBJECTS[obj.type];
        const isActivePickup =
            !!objectCfg?.isEphemeral &&
            (obj.teleportTicks || 0) <= 0 &&
            (now - (obj.spawnTime || 0)) >= BOT_PICKUP_SPAWN_DELAY_MS;
        if (isCoinObjectType(obj.type)) {
            bucket.coins.push(obj);
            if (!obj.collectorId && isActivePickup) bucket.activeCoins.push(obj);
        }
        if (isChestObjectType(obj.type)) bucket.chests.push(obj);
        if (objectCfg?.isEphemeral) {
            bucket.pickups.push(obj);
            if (isActivePickup) bucket.activePickups.push(obj);
        }
    }
    return buckets;
}

function clearBotLootFocus(bot) {
    if (!bot) return;
    bot._botLootTargetUntil = 0;
    bot._botLootTargetX = 0;
    bot._botLootTargetY = 0;
    bot._botLootTargetWorld = '';
}

function hasLowerSwordToReplace(bot, incomingRank) {
    if (!bot || !isBotPreferredWeapon(bot, incomingRank)) return false;
    for (let i = 0; i < bot.inventory.length; i++) {
        if ((bot.inventoryCounts[i] || 0) <= 0) continue;
        const heldRank = (bot.inventory[i] || 0) & 0x7F;
        if (!isBotPreferredWeapon(bot, heldRank)) continue;
        if (heldRank < incomingRank) return true;
    }
    return false;
}

function canBotBenefitFromDroppedObject(bot, obj) {
    if (!bot || !obj) return false;
    const objectCfg = dataMap.OBJECTS[obj.type];
    if (!objectCfg?.isEphemeral) return false;
    const role = getBotRole(bot);

    const rawType = obj.type & 0x7F;
    const skullType = dataMap.OBJECT_TYPE_BY_KEY?.['skull'] || 0;
    if (isCoinObjectType(obj.type)) {
        return canBotStoreMoreCoins(bot);
    }
    if (isWeaponRank(rawType)) {
        if (!isBotPreferredWeapon(bot, rawType)) return false;
        return !isInventoryFull(bot) || hasLowerSwordToReplace(bot, rawType);
    }
    if (isAccessoryItemType(rawType)) {
        if (!isInventoryFull(bot)) return true;
        const preferredId = bot?._botPreferredAccessoryId || 0;
        const preferredItemType = preferredId > 0 ? accessoryItemTypeFromId(preferredId) : 0;
        return (bot.accessoryId || 0) === 0 &&
            (bot.equippedAccessoryItemType || 0) === 0 &&
            preferredItemType > 0 &&
            rawType === preferredItemType;
    }
    if (skullType > 0 && rawType === skullType) {
        if (role === BOT_ROLE_NOOB) return false;
        return canBotStoreMoreOfType(bot, skullType);
    }
    return objectCfg.stackable ? !isInventoryFull(bot) : !isInventoryFull(bot);
}

function getBotDroppedLootPriority(bot, obj) {
    if (!canBotBenefitFromDroppedObject(bot, obj)) return Infinity;

    const role = getBotRole(bot);
    const rawType = obj.type & 0x7F;
    const bestSword = getBestBotPreferredWeaponRank(bot);
    const skullType = dataMap.OBJECT_TYPE_BY_KEY?.['skull'] || 0;
    const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
    const preferredId = bot?._botPreferredAccessoryId || 0;
    const preferredItemType = preferredId > 0 ? accessoryItemTypeFromId(preferredId) : 0;

    if ((role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL) &&
        goldenSkullType > 0 &&
        rawType === goldenSkullType &&
        canBotStoreMoreOfType(bot, goldenSkullType)) {
        return 0;
    }

    if (isBotPreferredWeapon(bot, rawType) && isWeaponTypeStronger(rawType, bestSword)) {
        return 1;
    }

    if (isAccessoryItemType(rawType)) {
        if (preferredItemType > 0 && rawType === preferredItemType) return 2;
        return 3;
    }

    if ((role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL) &&
        skullType > 0 &&
        rawType === skullType &&
        canBotStoreMoreOfType(bot, skullType)) {
        return 4;
    }

    if (isCoinObjectType(obj.type)) return 5;
    return 6;
}

function assignBotDepartureFromLootFocus(bot, fromX, fromY, now = performance.now()) {
    if (!bot) return null;
    const [worldWidth, worldHeight] = getBotWorldSize(bot);
    const dx = bot.x - fromX;
    const dy = bot.y - fromY;
    const baseAngle = (dx * dx + dy * dy) <= 1
        ? Math.random() * Math.PI * 2
        : Math.atan2(dy, dx);
    const departureAngle = baseAngle + ((Math.random() * 0.8) - 0.4);
    const departureDistance = randomRangeInt(260, 520);
    const targetX = Math.max(80, Math.min(worldWidth - 80, bot.x + Math.cos(departureAngle) * departureDistance));
    const targetY = Math.max(80, Math.min(worldHeight - 80, bot.y + Math.sin(departureAngle) * departureDistance));
    bot._botFarmTargetX = targetX;
    bot._botFarmTargetY = targetY;
    bot._botFarmTargetUntil = now + randomRangeInt(4000, 7000);
    bot._botNextMoveAt = 0;
    return { x: targetX, y: targetY };
}

function findNearestLootNearFocus(bot, now = performance.now(), pickupObjects = null) {
    if (!bot || !Number.isFinite(bot._botLootTargetX) || !Number.isFinite(bot._botLootTargetY)) return null;
    const world = bot._botLootTargetWorld || bot.world || 'main';
    const focusX = bot._botLootTargetX;
    const focusY = bot._botLootTargetY;
    const searchRadiusSq = BOT_KILL_LOOT_SEARCH_RADIUS * BOT_KILL_LOOT_SEARCH_RADIUS;
    const objects = Array.isArray(pickupObjects) ? pickupObjects : Object.values(ENTITIES.OBJECTS);
    let bestTarget = null;
    let bestDistSq = Infinity;
    let bestPriority = Infinity;

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj) continue;
        if ((obj.world || 'main') !== world) continue;
        if ((obj.teleportTicks || 0) > 0) continue;
        if ((now - (obj.spawnTime || 0)) < 220) continue;
        const priority = getBotDroppedLootPriority(bot, obj);
        if (!Number.isFinite(priority)) continue;

        const focusDx = obj.x - focusX;
        const focusDy = obj.y - focusY;
        const focusDistSq = (focusDx * focusDx) + (focusDy * focusDy);
        if (focusDistSq > searchRadiusSq) continue;

        const dx = obj.x - bot.x;
        const dy = obj.y - bot.y;
        const distSq = (dx * dx) + (dy * dy);
        if (priority < bestPriority || (priority === bestPriority && distSq < bestDistSq)) {
            bestPriority = priority;
            bestTarget = obj;
            bestDistSq = distSq;
        }
    }

    return bestTarget ? { target: bestTarget, distSq: bestDistSq } : null;
}

function tryFollowBotLootFocus(bot, now = performance.now(), pickupObjects = null, moveTowardFn = null) {
    if (!bot || !bot.isBot) return false;
    if (now >= (bot._botLootTargetUntil || 0)) {
        clearBotLootFocus(bot);
        return false;
    }
    const focusWorld = bot._botLootTargetWorld || bot.world || 'main';
    if ((bot.world || 'main') !== focusWorld) {
        clearBotLootFocus(bot);
        return false;
    }

    const lootTarget = findNearestLootNearFocus(bot, now, pickupObjects);
    const targetX = lootTarget?.target?.x ?? bot._botLootTargetX;
    const targetY = lootTarget?.target?.y ?? bot._botLootTargetY;
    if (typeof moveTowardFn === 'function') {
        moveTowardFn(targetX, targetY);
    } else {
        moveToward(bot, targetX, targetY);
    }

    bot.attacking = 0;
    bot._botHasLockedTarget = true;
    bot.tryPickup(now, pickupObjects || null);
    maybeEquipAccessoryFromInventory(bot);

    if (!lootTarget) {
        const dx = bot._botLootTargetX - bot.x;
        const dy = bot._botLootTargetY - bot.y;
        if ((dx * dx) + (dy * dy) <= (BOT_KILL_LOOT_REACH_DIST * BOT_KILL_LOOT_REACH_DIST)) {
            const departure = assignBotDepartureFromLootFocus(bot, bot._botLootTargetX, bot._botLootTargetY, now);
            clearBotLootFocus(bot);
            if (departure) {
                if (typeof moveTowardFn === 'function') {
                    moveTowardFn(departure.x, departure.y);
                } else {
                    moveToward(bot, departure.x, departure.y);
                }
            }
        }
    }

    return true;
}

function buildWorldMobBuckets() {
    const buckets = new Map();
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.hp <= 0) continue;
        const world = mob.world || 'main';
        let bucket = buckets.get(world);
        if (!bucket) {
            bucket = {
                polarBears: [],
                minotaurs: [],
                rootWalkers: [],
                bossDimensionMobs: [],
                hearties: [],
                polarBearsByTarget: new Map(),
                minotaursByTarget: new Map()
            };
            buckets.set(world, bucket);
        }
        if (mob.type === POLAR_BEAR_MOB_TYPE) {
            bucket.polarBears.push(mob);
            const targetId = getAggroTargetId(mob);
            if (targetId > 0) {
                let targeted = bucket.polarBearsByTarget.get(targetId);
                if (!targeted) {
                    targeted = [];
                    bucket.polarBearsByTarget.set(targetId, targeted);
                }
                targeted.push(mob);
            }
        }
        if (mob.type === MINOTAUR_MOB_TYPE) {
            bucket.minotaurs.push(mob);
            const targetId = getAggroTargetId(mob);
            if (targetId > 0) {
                let targeted = bucket.minotaursByTarget.get(targetId);
                if (!targeted) {
                    targeted = [];
                    bucket.minotaursByTarget.set(targetId, targeted);
                }
                targeted.push(mob);
            }
        }
        if (mob.type === ROOT_WALKER_MOB_TYPE) bucket.rootWalkers.push(mob);
        if (isBossDimensionWorld(world)) bucket.bossDimensionMobs.push(mob);
        if (mob.type === HEARTY_MOB_TYPE) bucket.hearties.push(mob);
    }
    return buckets;
}

function getHunterTarget(bot) {
    const role = getBotRole(bot);
    if (!bot || !bot.isBot || (role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL)) return null;
    const targetId = bot._botHunterTargetId || 0;
    if (!targetId) return null;
    const target = ENTITIES.PLAYERS[targetId];
    const validTarget =
        !!target &&
        target.isAlive &&
        !target.isBot &&
        !target.touchingSafeZone &&
        !target.hasShield &&
        !(typeof target.isPvpProtected === 'function' && target.isPvpProtected()) &&
        (target.world || 'main') === (bot.world || 'main') &&
        !isBotTargetTemporarilyIgnored(bot, target);
    if (!validTarget) {
        bot._botHunterTargetId = 0;
        return null;
    }

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    return { player: target, distSq: (dx * dx + dy * dy) };
}

function getAssistTarget(bot) {
    if (!bot || !bot.isBot) return null;
    const targetId = bot._botAssistTargetId || 0;
    if (!targetId) return null;
    const target = ENTITIES.PLAYERS[targetId];
    const validTarget =
        !!target &&
        target.isAlive &&
        !target.isBot &&
        !target.touchingSafeZone &&
        !target.hasShield &&
        (target.world || 'main') === (bot.world || 'main') &&
        !isBotTargetTemporarilyIgnored(bot, target);
    if (!validTarget) {
        bot._botAssistTargetId = 0;
        return null;
    }

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    return { player: target, distSq: (dx * dx + dy * dy) };
}

function tryBotBuyNextSwordUpgrade(bot, maxSwordRank = 8) {
    const coins = bot.getTotalCoins();
    const bestSword = getBestBotPreferredWeaponRank(bot);
    const category = getBotWeaponCategory(bot);
    const cap = getBotPreferredWeaponCap(bot, maxSwordRank);
    const nextSword = getNextBotPreferredWeaponType(bot, bestSword, cap);
    const nextSwordCfg = dataMap.SHOP_ITEMS.find(item => item.id === nextSword);
    if (BOT_DEBUG_SHOP) {
        const nextPrice = nextSwordCfg?.price ?? 'n/a';
        console.log(`[BOT ${bot.id}] weapon-check category=${category} best=${bestSword} next=${nextSword} nextPrice=${nextPrice} coins=${coins}`);
    }
    if (!nextSwordCfg || nextSwordCfg.category !== category || nextSword <= bestSword) return false;
    if (coins < nextSwordCfg.price) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] weapon-skip reason=insufficient_coins coins=${coins} needed=${nextSwordCfg.price}`);
        }
        return false;
    }

    // First try normal shop flow.
    bot.buyItem(nextSword);
    if (isWeaponTypeStronger(getBestBotPreferredWeaponRank(bot), bestSword)) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] weapon-buy success method=buyItem rank=${nextSword}`);
        }
        return true;
    }
    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] weapon-buy fallback reason=buyItem_no_effect`);
    }

    let targetSlot = bot.inventory.indexOf(0);
    if (targetSlot === -1) {
        // No empty slot: replace the weakest same-category weapon slot if possible.
        let weakestSlot = -1;
        let weakestRank = Infinity;
        for (let i = 0; i < bot.inventory.length; i++) {
            if (bot.inventoryCounts[i] <= 0) continue;
            const rank = bot.inventory[i] & 0x7F;
            if (!isBotPreferredWeapon(bot, rank)) continue;
            if (weakestRank === Infinity || isWeaponTypeStronger(weakestRank, rank)) {
                weakestRank = rank;
                weakestSlot = i;
            }
        }
        if (weakestSlot !== -1 && isWeaponTypeStronger(nextSword, weakestRank)) {
            targetSlot = weakestSlot;
        }
    }

    if (targetSlot === -1) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] weapon-skip reason=no_slot_for_upgrade`);
        }
        return false;
    }
    if (bot.getTotalCoins() < nextSwordCfg.price) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] weapon-skip reason=coins_spent_before_fallback coins=${bot.getTotalCoins()} needed=${nextSwordCfg.price}`);
        }
        return false;
    }
    bot.deductCoins(nextSwordCfg.price);
    bot.inventory[targetSlot] = nextSword;
    bot.inventoryCounts[targetSlot] = 1;
    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] weapon-buy success method=fallback_replace slot=${targetSlot} rank=${nextSword}`);
    }
    return true;
}

function tryBotShopUpgrade(bot, now = performance.now()) {
    if (now < (bot._botNextShopCheckAt || 0)) return;
    bot._botNextShopCheckAt = now + randomRangeInt(BOT_SHOP_CHECK_MIN_MS, BOT_SHOP_CHECK_MAX_MS);

    const coins = bot.getTotalCoins();
    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] shop-tick coins=${coins} category=${getBotWeaponCategory(bot)} selectedSlot=${bot.selectedSlot} selectedRank=${(bot.inventory[bot.selectedSlot] || 0) & 0x7F} best=${getBestBotPreferredWeaponRank(bot)}`);
    }
    const canConsiderAccessory =
        !bot._botBoughtAccessoryThisLife &&
        BOT_ALLOWED_ACCESSORY_IDS.length > 0 &&
        getWeaponOrder(getBestBotPreferredWeaponRank(bot)) >= 2;
    let affordableAccessoryIds = [];
    if (canConsiderAccessory) {
        affordableAccessoryIds = BOT_ALLOWED_ACCESSORY_IDS.filter(id => {
            const key = ACCESSORY_KEYS[id];
            const costConfig = dataMap.ACCESSORY_COSTS?.[key];
            const currency = costConfig?.currency || 'coin';
            const price = Math.max(0, Math.floor(costConfig?.amount || dataMap.ACCESSORY_PRICE || 30));
            if (currency === 'hearty_essence') {
                return getBotHeartyEssenceCount(bot) >= price;
            }
            if (currency !== 'coin') return false;
            return coins >= price;
        });
    }
    const canBuyAccessory = affordableAccessoryIds.length > 0;

    let boughtSomething = false;
    if (canBuyAccessory) {
        const accessoryId = chooseAccessoryForRole(bot, affordableAccessoryIds);
        if (accessoryId) {
            if (BOT_DEBUG_SHOP) {
                const key = ACCESSORY_KEYS[accessoryId];
                const price = Math.max(0, Math.floor(dataMap.ACCESSORY_COSTS?.[key]?.amount || dataMap.ACCESSORY_PRICE || 30));
                console.log(`[BOT ${bot.id}] accessory-attempt id=${accessoryId} key=${key} price=${price} coins=${coins}`);
            }
            bot.buyAccessory(accessoryId);
            const expectedItemType = accessoryItemTypeFromId(accessoryId);
            for (let i = 0; i < bot.inventory.length; i++) {
                if (bot.inventoryCounts[i] <= 0) continue;
                const type = bot.inventory[i];
                if (type === expectedItemType) {
                    bot.equipAccessoryFromItemType(type, i);
                    bot._botBoughtAccessoryThisLife = true;
                    boughtSomething = true;
                    if (BOT_DEBUG_SHOP) {
                        console.log(`[BOT ${bot.id}] accessory-buy success id=${accessoryId} slot=${i}`);
                    }
                    break;
                }
            }
        }
    }

    if (boughtSomething) {
        equipBestSword(bot);
        bot.sendInventoryUpdate();
        bot.sendStatsUpdate();
        return;
    }

    const boughtSword = tryBotBuyNextSwordUpgrade(bot, getBotSwordCap(bot));
    if (boughtSword) {
        equipBestSword(bot);
        bot.sendInventoryUpdate();
        bot.sendStatsUpdate();
        return;
    }

    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] shop-no-purchase coins=${coins} best=${getBestBotPreferredWeaponRank(bot)} canBuyAccessory=${canBuyAccessory}`);
    }

    tryBotConvertCoinsToXp(bot);
}

function tryBotConvertCoinsToXp(bot) {
    const role = getBotRole(bot);
    if ((role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL) || XP_SHOP_ITEMS.length === 0) return false;

    const latestCoins = bot.getTotalCoins();
    if (latestCoins < 700) return false;

    const affordableXp = XP_SHOP_ITEMS.filter(item => latestCoins >= item.price);
    if (!affordableXp.length) return false;
    const chosen = affordableXp[affordableXp.length - 1];
    if (!chosen) return false;
    bot.buyXp(chosen.id);
    return true;
}

function getAggroTargetId(mob) {
    if (!mob || !mob.isAlarmed) return 0;
    if (typeof mob.getLiveTarget === 'function') {
        return mob.getLiveTarget(true)?.id || 0;
    }
    return mob.target?.id || 0;
}

function isMobAggroOnBot(mob, bot) {
    if (!mob || !mob.isAlarmed) return false;
    if (typeof mob.getLiveTarget === 'function') {
        const target = mob.getLiveTarget(true);
        return target && target.id === bot.id;
    }
    return mob.target && mob.target.id === bot.id;
}

function isBotLowHealth(bot) {
    const hp = Number.isFinite(bot?.hp) ? bot.hp : 0;
    const maxHp = Number.isFinite(bot?.maxHp) && bot.maxHp > 0 ? bot.maxHp : 1;
    return (hp / maxHp) < 0.3;
}

function findNearestPolarBear(bot, maxRange, polarBears = null) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const source = Array.isArray(polarBears) ? polarBears : ENTITIES.MOBS;
    if (Array.isArray(source)) {
        for (let i = 0; i < source.length; i++) {
            const mob = source[i];
            if (!mob) continue;
            const dx = mob.x - bot.x;
            const dy = mob.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = mob;
                nearestDistSq = distSq;
            }
        }
        return nearest ? { target: nearest, distSq: nearestDistSq } : null;
    }
    for (const id in source) {
        const mob = source[id];
        if (!mob || mob.hp <= 0 || mob.type !== POLAR_BEAR_MOB_TYPE) continue;
        if ((mob.world || 'main') !== (bot.world || 'main')) continue;
        if (!isMobAggroOnBot(mob, bot)) continue;
        const dx = mob.x - bot.x;
        const dy = mob.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = mob;
            nearestDistSq = distSq;
        }
    }
    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestAggroMinotaur(bot, maxRange, minotaurs = null) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const source = Array.isArray(minotaurs) ? minotaurs : ENTITIES.MOBS;
    if (Array.isArray(source)) {
        for (let i = 0; i < source.length; i++) {
            const mob = source[i];
            if (!mob) continue;
            const dx = mob.x - bot.x;
            const dy = mob.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = mob;
                nearestDistSq = distSq;
            }
        }
        return nearest ? { target: nearest, distSq: nearestDistSq } : null;
    }
    for (const id in source) {
        const mob = source[id];
        if (!mob || mob.hp <= 0 || mob.type !== MINOTAUR_MOB_TYPE) continue;
        if ((mob.world || 'main') !== (bot.world || 'main')) continue;
        if (!isMobAggroOnBot(mob, bot)) continue;
        const dx = mob.x - bot.x;
        const dy = mob.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = mob;
            nearestDistSq = distSq;
        }
    }
    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function moveAwayFrom(bot, fromX, fromY) {
    const dx = bot.x - fromX;
    const dy = bot.y - fromY;
    const angle = Math.atan2(dy, dx);
    bot.angle = angle;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const axisDeadzone = 0.12;
    bot.keys.a = ux < -axisDeadzone ? 1 : 0;
    bot.keys.d = ux > axisDeadzone ? 1 : 0;
    bot.keys.w = uy < -axisDeadzone ? 1 : 0;
    bot.keys.s = uy > axisDeadzone ? 1 : 0;
}

function moveOffscreenAwayFrom(bot, fromX, fromY, speedScale = 0.7) {
    const dx = bot.x - fromX;
    const dy = bot.y - fromY;
    const distSq = (dx * dx) + (dy * dy);
    const angle = distSq <= 1 ? ((bot.angle || 0) + Math.PI) : Math.atan2(dy, dx);
    const speed = (bot.defaultSpeed || bot.speed || 17) * speedScale;
    bot.angle = angle;
    bot.x += Math.cos(angle) * speed;
    bot.y += Math.sin(angle) * speed;
}

function markOffscreenBotProgress(bot, now = performance.now()) {
    if (!bot || !bot.isBot) return;
    const state = bot._botOffscreenProgress || (bot._botOffscreenProgress = {
        anchorX: bot.x,
        anchorY: bot.y,
        since: now
    });
    const dx = bot.x - state.anchorX;
    const dy = bot.y - state.anchorY;
    if ((dx * dx + dy * dy) >= 400) {
        state.anchorX = bot.x;
        state.anchorY = bot.y;
        state.since = now;
    }
}

function recoverOffscreenStuckBot(bot, now = performance.now()) {
    if (!bot || !bot.isBot) return false;
    const state = bot._botOffscreenProgress || (bot._botOffscreenProgress = {
        anchorX: bot.x,
        anchorY: bot.y,
        since: now
    });
    const dx = bot.x - state.anchorX;
    const dy = bot.y - state.anchorY;
    if ((dx * dx + dy * dy) >= 400) {
        state.anchorX = bot.x;
        state.anchorY = bot.y;
        state.since = now;
        return false;
    }
    if (now - (state.since || now) < 2200) {
        return false;
    }

    const escapeAngle = Math.random() * Math.PI * 2;
    const escapeDist = randomRangeInt(220, 520);
    const [worldWidth, worldHeight] = getBotWorldSize(bot);
    const targetX = Math.max(80, Math.min(worldWidth - 80, bot.x + Math.cos(escapeAngle) * escapeDist));
    const targetY = Math.max(80, Math.min(worldHeight - 80, bot.y + Math.sin(escapeAngle) * escapeDist));
    bot._botPrimitiveAngle = escapeAngle;
    bot._botPrimitiveTurnAt = now + randomRangeInt(900, 2200);
    bot._botFarmTargetX = targetX;
    bot._botFarmTargetY = targetY;
    bot._botFarmTargetUntil = now + randomRangeInt(4000, 7000);
    bot._botLootTargetUntil = 0;
    bot._botNextMoveAt = now + randomRangeInt(120, 260);
    bot.attacking = 0;
    state.anchorX = bot.x;
    state.anchorY = bot.y;
    state.since = now;
    return true;
}

function ensureBotAlwaysArmed(bot, now = performance.now()) {
    let bestSwordSlot = -1;
    let bestSwordRank = 0;
    let fallbackWeaponSlot = -1;
    let fallbackWeaponRank = 0;

    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const raw = bot.inventory[i];
        const rank = raw & 0x7F;
        if (!isWeaponRank(rank)) continue;

        // Recover from a stuck ghosted throw state.
        if (raw >= 128 && now - (bot.lastThrowSwordTime || 0) > (bot.throwSwordCoolDownTime || 1500) + 250) {
            bot.inventory[i] = rank;
        }

        if (isWeaponTypeStronger(rank, fallbackWeaponRank)) {
            fallbackWeaponRank = rank;
            fallbackWeaponSlot = i;
        }

        if (isBotPreferredWeapon(bot, rank) && isWeaponTypeStronger(rank, bestSwordRank)) {
            bestSwordRank = rank;
            bestSwordSlot = i;
        }
    }
    if (bestSwordSlot === -1) {
        bestSwordSlot = fallbackWeaponSlot;
        bestSwordRank = fallbackWeaponRank;
    }

    if (bestSwordSlot === -1) {
        const emptySlot = bot.inventory.indexOf(0);
        const slot = emptySlot >= 0 ? emptySlot : 0;
        bot.inventory[slot] = 1;
        bot.inventoryCounts[slot] = Math.max(1, bot.inventoryCounts[slot] || 1);
        bestSwordSlot = slot;
    }

    const selectedRaw = bot.inventory[bot.selectedSlot] || 0;
    const selectedRank = selectedRaw & 0x7F;
    const selectedPreferred = isBotPreferredWeapon(bot, selectedRank);
    const shouldUpgradeSelection = isWeaponRank(selectedRank) && (
        (!selectedPreferred && bestSwordSlot !== fallbackWeaponSlot) ||
        (selectedPreferred && isWeaponTypeStronger(bestSwordRank, selectedRank))
    );
    if (!isWeaponRank(selectedRank) || bot.inventoryCounts[bot.selectedSlot] <= 0 || shouldUpgradeSelection) {
        bot.selectedSlot = bestSwordSlot;
    }

    bot.manuallyUnequippedWeapon = false;
}

function isInventoryFull(bot) {
    return bot.inventory.indexOf(0) === -1;
}

function canBotStoreMoreCoins(bot) {
    for (let i = 0; i < bot.inventory.length; i++) {
        const type = bot.inventory[i] & 0x7F;
        if (type === 0) return true;
        if (isCoinObjectType(type) && bot.inventoryCounts[i] < 256) return true;
    }
    return false;
}

function canBotStoreMoreOfType(bot, itemType) {
    if (!bot || !itemType) return false;
    const objectCfg = dataMap.OBJECTS?.[itemType];
    const isStackable = !!objectCfg?.stackable || isCoinObjectType(itemType) || isWeaponRank(itemType);
    const stackLimit = isWeaponRank(itemType) ? 256 : Math.max(1, Math.floor(objectCfg?.stackLimit || 256));
    for (let i = 0; i < bot.inventory.length; i++) {
        const type = bot.inventory[i] & 0x7F;
        if (type === 0) return true;
        if (type === itemType && isStackable && bot.inventoryCounts[i] < stackLimit) {
            return true;
        }
    }
    return false;
}

function canBotPickupBossLoot(bot, obj) {
    if (!bot || !obj) return false;
    const type = obj.type & 0x7F;
    if (!type) return false;
    if (isCoinObjectType(type)) return canBotStoreMoreCoins(bot);
    if (isWeaponRank(type)) {
        if (!isBotPreferredWeapon(bot, type)) return false;
        if (canBotStoreMoreOfType(bot, type)) return true;
        return isWeaponTypeStronger(type, getBestBotPreferredWeaponRank(bot));
    }
    return canBotStoreMoreOfType(bot, type);
}

function tryBotCraftGoldenSkull(bot) {
    if (!bot || !bot.isBot) return false;
    const role = getBotRole(bot);
    if (role !== BOT_ROLE_PRO && role !== BOT_ROLE_CASUAL) return false;
    const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
    const skullType = dataMap.OBJECT_TYPE_BY_KEY?.['skull'] || 0;
    if (!goldenSkullType || !skullType) return false;
    if (getInventorySlotForItemType(bot, goldenSkullType) >= 0) return false;
    if (bot.getTotalCoins() < 500) return false;
    if (bot.getTotalItemCount(skullType) < 1) return false;
    return !!bot.buySpecialItem(goldenSkullType);
}

function maybeEquipAccessoryFromInventory(bot) {
    if ((bot.accessoryId || 0) > 0 || (bot.equippedAccessoryItemType || 0) > 0) return false;
    const preferredId = bot?._botPreferredAccessoryId || 0;
    const preferredItemType = preferredId > 0 ? accessoryItemTypeFromId(preferredId) : 0;
    if (preferredItemType > 0) {
        for (let i = 0; i < bot.inventory.length; i++) {
            if (bot.inventoryCounts[i] <= 0) continue;
            const type = bot.inventory[i] & 0x7F;
            if (type === preferredItemType) {
                bot.equipAccessoryFromItemType(type, i);
                return true;
            }
        }
    }
    return false;
}

function canBotDropNow(bot, now = performance.now()) {
    if (!bot) return false;
    const last = bot._botLastDropAt || 0;
    if (now - last < 1000) return false;
    bot._botLastDropAt = now;
    return true;
}

function maintainBotInventory(bot, now = performance.now()) {
    if (now < (bot._botNextInventoryMaintenanceAt || 0)) return;
    bot._botNextInventoryMaintenanceAt = now + 900 + Math.floor(Math.random() * 700);
    const inCombat = now - (bot.lastCombatTime || 0) < 10000;

    maybeEquipAccessoryFromInventory(bot);

    const role = getBotRole(bot);
    const full = isInventoryFull(bot);
    const bestSword = getBestBotPreferredWeaponRank(bot);
    const hasPreferredWeapon = isBotPreferredWeapon(bot, bestSword);
    const hasAccessoryEquipped = hasEquippedAccessory(bot);
    const preferredId = bot?._botPreferredAccessoryId || 0;
    const preferredItemType = preferredId > 0 ? accessoryItemTypeFromId(preferredId) : 0;

    if (full && (role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL)) {
        tryBotConvertCoinsToXp(bot);
    }

    if (role === BOT_ROLE_PRO) {
        tryBotCraftGoldenSkull(bot);
    }

    const dropSlots = [];
    const sellSlots = [];

    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const type = bot.inventory[i] & 0x7F;
        if (type <= 0) continue;

        if (isAccessoryItemType(type)) {
            const isPreferred = preferredItemType > 0 && type === preferredItemType;
            if (!isPreferred || hasAccessoryEquipped) {
                sellSlots.push(i);
            }
            continue;
        }

        if (!isWeaponRank(type)) continue;
        if (!isBotPreferredWeapon(bot, type) && hasPreferredWeapon) {
            sellSlots.push(i);
            continue;
        }
        const isWorseSword = isWeaponTypeStronger(bestSword, type);
        if (!isWorseSword) continue;

        // Always sell worse swords immediately, regardless of role.
        sellSlots.push(i);
    }

    // Noob only: drop coin stacks once the inventory is full to keep making room.
    if (role === BOT_ROLE_NOOB && full) {
        for (let i = bot.inventory.length - 1; i >= 0; i--) {
            if (bot.inventoryCounts[i] <= 0) continue;
            const type = bot.inventory[i] & 0x7F;
            if (!isCoinObjectType(type)) continue;
            if (dropSlots.includes(i)) continue;
            dropSlots.push(i);
            if (dropSlots.length >= 2) break;
        }
    }

    if (sellSlots.length) {
        bot.sellItems(sellSlots);
    }

    if (dropSlots.length && !inCombat) {
        dropSlots.sort((a, b) => b - a);
        for (const slot of dropSlots) {
            if (bot.inventoryCounts[slot] > 0 && canBotDropNow(bot, now)) {
                bot.dropItemFromSlot(slot);
                break;
            }
        }
    }
}

function purgeUselessSwords(bot, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.inventory) return;
    const bestSword = getBestBotPreferredWeaponRank(bot);
    const hasPreferredWeapon = isBotPreferredWeapon(bot, bestSword);
    const sellSlots = [];
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const type = bot.inventory[i] & 0x7F;
        if (!isWeaponRank(type)) continue;
        if (!isBotPreferredWeapon(bot, type) && hasPreferredWeapon) {
            sellSlots.push(i);
            continue;
        }
        if (!isWeaponTypeStronger(bestSword, type)) continue;
        sellSlots.push(i);
    }
    if (sellSlots.length && typeof bot.sellItems === 'function') {
        bot.sellItems(sellSlots);
    }
}

function tryBotSpendBuffPoints(bot, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive) return;
    if (now < (bot._botNextBuffUpgradeAt || 0)) return;
    bot._botNextBuffUpgradeAt = now + 700 + Math.floor(Math.random() * 1700);

    const available = typeof bot.getAvailableBuffPoints === 'function'
        ? bot.getAvailableBuffPoints()
        : 0;
    if (available <= 0) return;

    const levelStrength = bot.buffLevels?.strength || 0;
    const levelMaxHealth = bot.buffLevels?.maxHealth || 0;
    const levelRegen = bot.buffLevels?.regenSpeed || 0;
    const choices = [];
    if (levelStrength < 10) choices.push(1);
    if (levelMaxHealth < 10) choices.push(2);
    if (levelRegen < 10) choices.push(3);
    if (!choices.length) return;

    const attr = choices[Math.floor(Math.random() * choices.length)];
    bot.tryUpgradeBuff(attr);
}

function findNearestDesiredLootFromObjects(bot, maxRange, worldObjects = null) {
    const maxRangeSq = maxRange * maxRange;
    const bestSword = getBestBotPreferredWeaponRank(bot);
    const role = getBotRole(bot);
    const skullType = dataMap.OBJECT_TYPE_BY_KEY?.['skull'] || 0;
    const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;
    const hasAccessoryEquipped = (bot.accessoryId || 0) > 0 || (bot.equippedAccessoryItemType || 0) > 0;
    const preferredId = bot?._botPreferredAccessoryId || 0;
    const preferredItemType = preferredId > 0 ? accessoryItemTypeFromId(preferredId) : 0;
    const world = bot.world || 'main';
    const objects = Array.isArray(worldObjects) ? worldObjects : Object.values(ENTITIES.OBJECTS);

    let bestTarget = null;
    let bestDistSq = Infinity;
    let bestKind = 99; // lower is better (0 golden skull, 1 sword upgrade, 2 accessory, 3 skull)

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj) continue;
        if ((obj.world || 'main') !== world) continue;

        const rawType = obj.type & 0x7F;
        let kind = -1;
        if ((role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL) && goldenSkullType > 0 && rawType === goldenSkullType && canBotStoreMoreOfType(bot, goldenSkullType)) {
            kind = 0;
        } else if (isBotPreferredWeapon(bot, rawType) && isWeaponTypeStronger(rawType, bestSword)) {
            kind = 1;
        } else if (isAccessoryItemType(rawType) && !hasAccessoryEquipped) {
            if (preferredItemType > 0 && rawType === preferredItemType) {
                kind = 2;
            } else {
                continue;
            }
        } else if ((role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL) && skullType > 0 && rawType === skullType && canBotStoreMoreOfType(bot, skullType)) {
            kind = 3;
        } else {
            continue;
        }

        const dx = obj.x - bot.x;
        const dy = obj.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxRangeSq) continue;

        if (kind < bestKind || (kind === bestKind && distSq < bestDistSq)) {
            bestKind = kind;
            bestDistSq = distSq;
            bestTarget = obj;
        }
    }

    return bestTarget ? { target: bestTarget, distSq: bestDistSq } : null;
}

function findNearestHeartyEssenceFromObjects(bot, maxRange, worldObjects = null) {
    if (!needsHeartShades(bot)) return null;
    const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
    if (!essenceType) return null;

    const maxRangeSq = maxRange * maxRange;
    const world = bot.world || 'main';
    const objects = Array.isArray(worldObjects) ? worldObjects : Object.values(ENTITIES.OBJECTS);
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj || obj.type !== essenceType) continue;
        if ((obj.world || 'main') !== world) continue;

        const dx = obj.x - bot.x;
        const dy = obj.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = obj;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestCombatPlayer(bot, maxRange, options = {}) {
    const realOnly = !!options.realOnly;
    const targetFilter = typeof options.targetFilter === 'function' ? options.targetFilter : null;
    const now = Number.isFinite(options.now) ? options.now : performance.now();
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const worldPlayers = Array.isArray(options.players) ? options.players : null;
    if (worldPlayers) {
        for (let i = 0; i < worldPlayers.length; i++) {
            const p = worldPlayers[i];
            if (!p || !p.isAlive || p.id === bot.id) continue;
            if (realOnly && p.isBot) continue;
            if (shouldIgnoreCombatBetween(bot, p)) continue;
            if (isBotTargetTemporarilyIgnored(bot, p)) continue;
            if (targetFilter && !targetFilter(p, now)) continue;
            if (!shouldEngagePlayer(bot, p, now)) continue;

            const dx = p.x - bot.x;
            const dy = p.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = p;
                nearestDistSq = distSq;
            }
        }
        return nearest ? { player: nearest, distSq: nearestDistSq } : null;
    }

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive || p.id === bot.id) continue;
        if (realOnly && p.isBot) continue;
        if ((p.world || 'main') !== (bot.world || 'main')) continue;
        if (shouldIgnoreCombatBetween(bot, p)) continue;
        if (isBotTargetTemporarilyIgnored(bot, p)) continue;
        if (targetFilter && !targetFilter(p, now)) continue;
        if (!shouldEngagePlayer(bot, p, now)) continue;

        const dx = p.x - bot.x;
        const dy = p.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = p;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { player: nearest, distSq: nearestDistSq } : null;
}

function findNearestEnemyBot(bot, maxRange, worldBots = null) {
    if (bot?.touchingSafeZone) return null;
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const worldId = bot.world || 'main';
    const source = Array.isArray(worldBots) ? worldBots : null;
    if (source) {
        for (let i = 0; i < source.length; i++) {
            const p = source[i];
            if (!p || !p.isAlive || !p.isBot || p.id === bot.id) continue;
            if (p.touchingSafeZone) continue;
            if (shouldIgnoreCombatBetween(bot, p)) continue;
            const dx = p.x - bot.x;
            const dy = p.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = p;
                nearestDistSq = distSq;
            }
        }
        return nearest ? { player: nearest, distSq: nearestDistSq } : null;
    }

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive || !p.isBot || p.id === bot.id) continue;
        if (p.touchingSafeZone) continue;
        if ((p.world || 'main') !== worldId) continue;
        if (shouldIgnoreCombatBetween(bot, p)) continue;
        const dx = p.x - bot.x;
        const dy = p.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = p;
            nearestDistSq = distSq;
        }
    }
    return nearest ? { player: nearest, distSq: nearestDistSq } : null;
}

function findNearestCoinFromObjects(bot, maxRange, excludedIds = null, coinObjects = null) {
    if (!canBotStoreMoreCoins(bot)) return null;
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const world = bot.world || 'main';
    const objects = Array.isArray(coinObjects) ? coinObjects : Object.values(ENTITIES.OBJECTS);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj || !isCoinObjectType(obj.type)) continue;
        if (excludedIds && excludedIds.has(obj.id)) continue;
        if ((obj.world || 'main') !== world) continue;

        const dx = obj.x - bot.x;
        const dy = obj.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = obj;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestBossDimensionLoot(bot, maxRange, objectBuckets = null) {
    const world = bot.world || 'main';
    if (!isBossDimensionWorld(world)) return null;
    const maxRangeSq = maxRange * maxRange;
    const activePickups = Array.isArray(objectBuckets?.activePickups) ? objectBuckets.activePickups : null;
    const pickups = Array.isArray(objectBuckets?.pickups) ? objectBuckets.pickups : Object.values(ENTITIES.OBJECTS);
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const scan = (objects) => {
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (!obj) continue;
            if ((obj.world || 'main') !== world) continue;
            const objectCfg = dataMap.OBJECTS?.[obj.type];
            if (!objectCfg?.isEphemeral) continue;
            if (!canBotPickupBossLoot(bot, obj)) continue;
            const dx = obj.x - bot.x;
            const dy = obj.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = obj;
                nearestDistSq = distSq;
            }
        }
    };

    if (activePickups && activePickups.length) scan(activePickups);
    if (!nearest) scan(pickups);

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestChestFromObjects(bot, maxRange, excludedIds = null, chestObjects = null) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const world = bot.world || 'main';
    const objects = Array.isArray(chestObjects) ? chestObjects : Object.values(ENTITIES.OBJECTS);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj || !isChestObjectType(obj.type)) continue;
        if (excludedIds && excludedIds.has(obj.id)) continue;
        if ((obj.world || 'main') !== world) continue;

        const dx = obj.x - bot.x;
        const dy = obj.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = obj;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestMinotaur(bot, maxRange, minotaurs = null) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const source = Array.isArray(minotaurs) ? minotaurs : null;
    if (source) {
        for (let i = 0; i < source.length; i++) {
            const mob = source[i];
            if (!mob || mob.hp <= 0) continue;
            const dx = mob.x - bot.x;
            const dy = mob.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = mob;
                nearestDistSq = distSq;
            }
        }
        return nearest ? { target: nearest, distSq: nearestDistSq } : null;
    }

    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.hp <= 0 || mob.type !== MINOTAUR_MOB_TYPE) continue;
        if ((mob.world || 'main') !== (bot.world || 'main')) continue;

        const dx = mob.x - bot.x;
        const dy = mob.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = mob;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestRootWalker(bot, maxRange, rootWalkers = null) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const world = bot.world || 'main';
    const source = Array.isArray(rootWalkers) ? rootWalkers : Object.values(ENTITIES.MOBS);

    for (let i = 0; i < source.length; i++) {
        const mob = source[i];
        if (!mob || mob.hp <= 0 || mob.type !== ROOT_WALKER_MOB_TYPE) continue;
        if ((mob.world || 'main') !== world) continue;

        const dx = mob.x - bot.x;
        const dy = mob.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = mob;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestBossDimensionMob(bot, maxRange, bossDimensionMobs = null) {
    if (!isBossDimensionWorld(bot.world || 'main')) return null;
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const world = bot.world || 'main';
    const source = Array.isArray(bossDimensionMobs) ? bossDimensionMobs : Object.values(ENTITIES.MOBS);

    for (let i = 0; i < source.length; i++) {
        const mob = source[i];
        if (!mob || mob.hp <= 0) continue;
        if ((mob.world || 'main') !== world) continue;

        const dx = mob.x - bot.x;
        const dy = mob.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = mob;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function findNearestHearty(bot, maxRange, hearties = null) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const source = Array.isArray(hearties) ? hearties : null;
    if (source) {
        for (let i = 0; i < source.length; i++) {
            const mob = source[i];
            if (!mob || mob.hp <= 0) continue;
            const dx = mob.x - bot.x;
            const dy = mob.y - bot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRangeSq && distSq < nearestDistSq) {
                nearest = mob;
                nearestDistSq = distSq;
            }
        }
        return nearest ? { target: nearest, distSq: nearestDistSq } : null;
    }

    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.hp <= 0 || mob.type !== HEARTY_MOB_TYPE) continue;
        if ((mob.world || 'main') !== (bot.world || 'main')) continue;

        const dx = mob.x - bot.x;
        const dy = mob.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = mob;
            nearestDistSq = distSq;
        }
    }

    return nearest ? { target: nearest, distSq: nearestDistSq } : null;
}

function moveToward(bot, targetX, targetY) {
    const steer = getSteerAngle(bot, targetX, targetY);
    bot.angle = steer.angle;
    const dx = Math.cos(steer.angle);
    const dy = Math.sin(steer.angle);
    const axisDeadzone = 0.12;
    bot.keys.a = dx < -axisDeadzone ? 1 : 0;
    bot.keys.d = dx > axisDeadzone ? 1 : 0;
    bot.keys.w = dy < -axisDeadzone ? 1 : 0;
    bot.keys.s = dy > axisDeadzone ? 1 : 0;
}

function moveAroundCombatTarget(bot, targetX, targetY, distSq, now = performance.now()) {
    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const dist = Math.sqrt(Math.max(1, distSq));
    const nx = dx / dist;
    const ny = dy / dist;
    const steer = getSteerAngle(bot, targetX, targetY);

    if (now >= (bot._botNextStrafeFlipAt || 0)) {
        bot._botStrafeDir = Math.random() < 0.5 ? -1 : 1;
        bot._botNextStrafeFlipAt = now + randomRangeInt(700, 1800);
    }

    const desired = bot._botPreferredCombatDist || 45;
    let radial = 0;
    if (dist > desired + 14) radial = dist > desired + 220 ? 1.5 : 1.0;
    else if (dist < desired - 8) radial = dist < desired - 25 ? -1.5 : -1.0;

    const dir = bot._botStrafeDir || 1;
    const tx = -ny * dir;
    const ty = nx * dir;
    const strafeWeight = radial === 0 ? 1.0 : 0.85;
    let vx = (nx * radial) + (tx * strafeWeight);
    let vy = (ny * radial) + (ty * strafeWeight);

    if (steer.blocked) {
        vx = Math.cos(steer.angle);
        vy = Math.sin(steer.angle);
    }

    bot.angle = steer.angle;
    const axisDeadzone = 0.12;
    bot.keys.a = vx < -axisDeadzone ? 1 : 0;
    bot.keys.d = vx > axisDeadzone ? 1 : 0;
    bot.keys.w = vy < -axisDeadzone ? 1 : 0;
    bot.keys.s = vy > axisDeadzone ? 1 : 0;
}

function moveAroundCombatTargetAtDistance(bot, targetX, targetY, distSq, desiredDistance, now = performance.now()) {
    const prev = bot._botPreferredCombatDist;
    bot._botPreferredCombatDist = desiredDistance;
    moveAroundCombatTarget(bot, targetX, targetY, distSq, now);
    bot._botPreferredCombatDist = prev;
}

function normalizeAngle(angle) {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function clampSegmentProjection(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
}

function getClosestBlockingRock(bot, targetX, targetY) {
    const world = bot.world || 'main';
    const sx = bot.x;
    const sy = bot.y;
    const ex = targetX;
    const ey = targetY;
    const segX = ex - sx;
    const segY = ey - sy;
    const segLenSq = (segX * segX) + (segY * segY);
    if (segLenSq <= 1) return null;

    let closest = null;
    let closestT = Infinity;
    const padding = bot.radius || 30;

    for (const id in ENTITIES.STRUCTURES) {
        const s = ENTITIES.STRUCTURES[id];
        if (!s || s.type !== 2) continue; // Rock only for now
        if ((s.world || 'main') !== world) continue;

        const toCenterX = s.x - sx;
        const toCenterY = s.y - sy;
        const t = clampSegmentProjection((toCenterX * segX + toCenterY * segY) / segLenSq);
        const px = sx + segX * t;
        const py = sy + segY * t;
        const dx = s.x - px;
        const dy = s.y - py;
        const blockRadius = (s.radius || 0) + padding;
        if ((dx * dx + dy * dy) <= (blockRadius * blockRadius)) {
            if (t < closestT) {
                closestT = t;
                closest = s;
            }
        }
    }

    return closest;
}

function getSteerAngle(bot, targetX, targetY) {
    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const baseAngle = Math.atan2(dy, dx);
    const blocker = getClosestBlockingRock(bot, targetX, targetY);
    if (!blocker) {
        return { angle: baseAngle, blocked: false };
    }

    const toBlockerX = blocker.x - bot.x;
    const toBlockerY = blocker.y - bot.y;
    const cross = (dx * toBlockerY) - (dy * toBlockerX);
    const sign = cross >= 0 ? -1 : 1;
    bot._botAvoidOffsetSign = sign;
    const offset = 0.45 * sign;
    return { angle: normalizeAngle(baseAngle + offset), blocked: true };
}

function getBotParryChance(bot, kind) {
    const role = getBotRole(bot);
    if (role === BOT_ROLE_PRO) return kind === 'throw' ? 0.9 : 0.7;
    if (role === BOT_ROLE_CASUAL) return kind === 'throw' ? 0.7 : 0.5;
    return 0;
}

function getEquippedSwordRank(entity) {
    if (!entity?.inventory || !Number.isInteger(entity.selectedSlot)) return 1;
    const raw = entity.inventory[entity.selectedSlot] || 0;
    const rank = raw & 0x7F;
    return isWeaponRank(rank) ? rank : 1;
}

function isEquippedBoomerang(entity) {
    return isBoomerangType(getEquippedSwordRank(entity));
}

function getBoomerangKeepDistance(bot) {
    const role = getBotRole(bot);
    if (role === BOT_ROLE_PRO) return 430;
    if (role === BOT_ROLE_CASUAL) return 300;
    return 0;
}

function getSwordReach(entity) {
    const rank = getEquippedSwordRank(entity);
    return getWeaponAttackStats(rank)?.maxDistance || BOT_ATTACK_RANGE;
}

function isTargetWithinMeleeReach(attacker, target, meleeReach, distSq) {
    if (!attacker || !target || !Number.isFinite(distSq)) return false;
    const centerDist = Math.sqrt(Math.max(0, distSq));
    const edgeDist = Math.max(0, centerDist - (attacker.radius || 0) - (target.radius || 0));
    return edgeDist <= Math.max(0, meleeReach);
}

function shouldBotParryMelee(bot, target, distSq, now = performance.now()) {
    const chance = getBotParryChance(bot, 'melee');
    if (chance <= 0 || !target?.isAlive) return false;
    if ((target.swingState || 0) <= 0) return false;

    const botReach = getSwordReach(bot);
    const targetReach = getSwordReach(target);
    if (targetReach < (botReach + 20)) return false;

    const dangerRange = targetReach + (bot.radius || 30) + (target.radius || 30) + 12;
    if (distSq > (dangerRange * dangerRange)) return false;

    const attackKey = `${target.id}:${target.lastAttackTime || 0}`;
    if (bot._botParryMeleeAttackKey !== attackKey) {
        bot._botParryMeleeAttackKey = attackKey;
        bot._botParryMeleeShould = Math.random() < chance;
        bot._botParryMeleeEvaluatedAt = now;
    }

    return bot._botParryMeleeShould === true;
}

function findThreateningThrowProjectile(bot, target) {
    const world = bot.world || 'main';
    const parryReach = getSwordReach(bot) + (bot.radius || 30) + 30;
    const parryReachSq = parryReach * parryReach;

    for (const id in ENTITIES.PROJECTILES) {
        const projectile = ENTITIES.PROJECTILES[id];
        if (!projectile || projectile.type !== -1) continue;
        if ((projectile.world || 'main') !== world) continue;
        if (projectile.shooter !== target) continue;

        const dx = bot.x - projectile.x;
        const dy = bot.y - projectile.y;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq > parryReachSq) continue;

        const toBot = Math.atan2(dy, dx);
        const delta = Math.abs(normalizeAngle(toBot - projectile.angle));
        if (delta > (Math.PI / 4)) continue;

        return projectile;
    }

    return null;
}

function shouldBotParryThrow(bot, target) {
    const chance = getBotParryChance(bot, 'throw');
    if (chance <= 0 || !target?.isAlive) return false;

    const projectile = findThreateningThrowProjectile(bot, target);
    if (!projectile) return false;

    const throwKey = `${target.id}:${target.lastThrowSwordTime || 0}`;
    if (bot._botParryThrowKey !== throwKey) {
        bot._botParryThrowKey = throwKey;
        bot._botParryThrowShould = Math.random() < chance;
    }

    if (bot._botParryThrowShould === true) {
        bot.angle = Math.atan2(projectile.y - bot.y, projectile.x - bot.x);
        return true;
    }

    return false;
}

function chasePlayer(bot, target, distSq, now = performance.now()) {
    const usingBoomerang = isEquippedBoomerang(bot);
    if (usingBoomerang) {
        const keepDistance = getBoomerangKeepDistance(bot);
        if (keepDistance > 0) {
            moveAroundCombatTargetAtDistance(bot, target.x, target.y, distSq, keepDistance, now);
        } else {
            moveAroundCombatTarget(bot, target.x, target.y, distSq, now);
        }
    } else {
        moveAroundCombatTarget(bot, target.x, target.y, distSq, now);
    }
    const desired = bot._botPreferredCombatDist || 45;
    const attackRadius = Math.max(BOT_ATTACK_RANGE, desired + 16);
    const inNormalAttackRange = distSq <= (attackRadius * attackRadius);
    const botReach = getSwordReach(bot);
    const targetReach = getSwordReach(target);
    const isOutranged = targetReach >= (botReach + 20);
    const parryThrow = shouldBotParryThrow(bot, target);
    const parryMelee = shouldBotParryMelee(bot, target, distSq, now);

    if (parryThrow || parryMelee) {
        bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
        bot.attacking = 1;
        return;
    }

    if (usingBoomerang) {
        bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
        bot.attacking = 0;
        tryThrowAtTarget(bot, distSq, now, 0, BOT_THROW_RANGE_MAX + 180);
        return;
    }

    if (isOutranged && inNormalAttackRange) {
        // If the bot is out-ranged, still take swings unless the target is actively swinging and the bot is a noob.
        const targetSwinging = (target.swingState || 0) > 0;
        const role = getBotRole(bot);
        const shouldHold = targetSwinging && role === BOT_ROLE_NOOB;
        bot.attacking = shouldHold ? 0 : 1;
        return;
    }

    bot.attacking = inNormalAttackRange ? 1 : 0;
}

function tryThrowAtTarget(bot, distSq, now, minRange, maxRange) {
    const usingBoomerang = isEquippedBoomerang(bot);
    const minSq = usingBoomerang ? 0 : minRange * minRange;
    const maxSq = maxRange * maxRange;
    if (distSq < minSq || distSq > maxSq) return;
    if (now < (bot._botNextThrowAt || 0)) return;

    const role = getBotRole(bot);
    if (role === BOT_ROLE_NOOB && !usingBoomerang) {
        // Noobs never throw; skip entirely.
        bot._botNextThrowAt = now + 800 + Math.floor(Math.random() * 1200);
        return;
    }

    if (usingBoomerang) {
        bot.throwSword();
        bot._botNextThrowAt = now + 650 + Math.floor(Math.random() * 850);
        return;
    }

    if (role === BOT_ROLE_CASUAL) {
        if (Math.random() < 0.85) {
            bot.throwSword();
            bot._botNextThrowAt = now + 800 + Math.floor(Math.random() * 1000);
        } else {
            bot._botNextThrowAt = now + 250 + Math.floor(Math.random() * 450);
        }
        return;
    }

    // Pro: keep existing throw behavior.
    bot.throwSword();
    bot._botNextThrowAt = now + 900 + Math.floor(Math.random() * 1300);
}

function handleLowHealthRetreat(bot, target, distSq, now = performance.now(), speedScale = 0.8) {
    const role = getBotRole(bot);
    bot.attacking = 0;
    moveOffscreenAwayFrom(bot, target.x, target.y, speedScale);
    if (role === BOT_ROLE_NOOB) return;
    bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
    tryUseBotAbility(bot, target, distSq, now, BOT_MOB_ATTACK_RANGE);
    tryThrowAtTarget(bot, distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
}

function tryUseBotAbility(bot, target, distSq, now = performance.now(), meleeRange = BOT_ATTACK_RANGE) {
    if (!bot?.isAlive || !target || !Number.isFinite(distSq)) return false;
    if (getBotRole(bot) === BOT_ROLE_NOOB) return false; // No active abilities for noobs.
    const ability = (bot.activeAbility || '').toLowerCase();
    if (!ability) return false;

    const cooldownMs = Math.max(0, bot.abilityCooldownMs || 0);
    if (cooldownMs > 0 && now - (bot.lastAbilityUseTime || 0) < cooldownMs) return false;

    let inRange = false;
    if (ability === 'stamina_boost' || ability === 'speed_boost' || ability === 'growth_spurt' || ability === 'invisibility') {
        inRange = distSq <= (meleeRange * meleeRange);
    } else if (ability === 'poison_blast') {
        inRange = distSq <= (BOT_POISON_AOE_RANGE * BOT_POISON_AOE_RANGE);
    } else if (ability === 'smoke_blast') {
        inRange = distSq <= (BOT_SMOKE_AOE_RANGE * BOT_SMOKE_AOE_RANGE);
    } else if (ability === 'energy_burst') {
        inRange = distSq <= (BOT_ENERGY_BURST_RANGE * BOT_ENERGY_BURST_RANGE);
    } else if (ability === 'lightning_shot') {
        inRange = distSq <= (BOT_LIGHTNING_RANGE * BOT_LIGHTNING_RANGE);
    } else {
        return false;
    }

    if (!inRange) return false;

    bot.lastAbilityUseTime = now;
    let aimX = target.x;
    let aimY = target.y;
    if (ability === 'lightning_shot') {
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const dist = Math.sqrt(Math.max(1, dx * dx + dy * dy));
        const baseAngle = Math.atan2(dy, dx);
        const role = getBotRole(bot);
        let angleOffset = 0;
        let distOffset = 0;
        if (role === BOT_ROLE_NOOB) {
            angleOffset = degToRad(randomRangeInt(10, 15)) * (Math.random() < 0.5 ? -1 : 1);
            distOffset = randomRangeInt(30, 50) * (Math.random() < 0.5 ? -1 : 1);
        } else if (role === BOT_ROLE_CASUAL) {
            angleOffset = degToRad(randomRangeInt(3, 7)) * (Math.random() < 0.5 ? -1 : 1);
            distOffset = randomRangeInt(15, 20) * (Math.random() < 0.5 ? -1 : 1);
        }
        const finalAngle = baseAngle + angleOffset;
        const finalDist = Math.max(10, dist + distOffset);
        aimX = bot.x + Math.cos(finalAngle) * finalDist;
        aimY = bot.y + Math.sin(finalAngle) * finalDist;
    }
    cmdRun.activateAbility(bot.id, ability, aimX, aimY);
    bot.sendStatsUpdate();
    return true;
}

function forceBotBackInBounds(bot) {
    const [worldWidth, worldHeight] = getBotWorldSize(bot);
    const radius = Math.max(5, bot.radius || 30);
    const minX = radius + BOT_EDGE_PUSH_BUFFER;
    const maxX = worldWidth - radius - BOT_EDGE_PUSH_BUFFER;
    const minY = radius + BOT_EDGE_PUSH_BUFFER;
    const maxY = worldHeight - radius - BOT_EDGE_PUSH_BUFFER;

    if (bot.x <= minX) {
        applyMovePattern(bot, { w: 0, a: 0, s: 0, d: 1 });
        bot.angle = 0;
        return true;
    }
    if (bot.x >= maxX) {
        applyMovePattern(bot, { w: 0, a: 1, s: 0, d: 0 });
        bot.angle = Math.PI;
        return true;
    }
    if (bot.y <= minY) {
        applyMovePattern(bot, { w: 0, a: 0, s: 1, d: 0 });
        bot.angle = Math.PI / 2;
        return true;
    }
    if (bot.y >= maxY) {
        applyMovePattern(bot, { w: 1, a: 0, s: 0, d: 0 });
        bot.angle = -Math.PI / 2;
        return true;
    }
    return false;
}

function configureBotPlayer(bot) {
    bot.isBot = true;
    const role = getBotRole(bot);
    const baseName = bot._botBaseUsername || getUniqueBotUsername(bot.id);
    bot._botBaseUsername = baseName;
    bot.username = baseName;
    bot.world = 'main';
    bot.isAlive = true;
    bot.attacking = 0;
    bot.chatMessage = '';
    bot.accessoryId = 0;
    bot.equippedAccessoryItemType = 0;
    bot.color = randomBotSkin();

    // Keep only the default bone sword.
    bot.inventory = new Array(35).fill(0);
    bot.inventoryCounts = new Array(35).fill(0);
    bot.inventory[0] = 1;
    bot.inventoryCounts[0] = 1;
    bot.selectedSlot = 0;
    bot.manuallyUnequippedWeapon = false;
    rerollBotWeaponCategory(bot);

    bot.keys = { w: 0, a: 0, s: 0, d: 0 };
    bot._botNextMoveAt = 0;
    bot._botNextLookAt = 0;
    bot._botNextThrowAt = 0;
    bot._botNextDecisionAt = 0;
    bot._botNextBuffUpgradeAt = 0;
    bot._botHunterTargetId = role === BOT_ROLE_PRO ? (bot._botHunterTargetId || 0) : 0;
    bot._botAssistTargetId = 0;
    bot._botLastNearRealPlayerAt = performance.now();
    bot.lastX = bot.x;
    bot.lastY = bot.y;
    resetBotLifeTimers(bot);
    assignBotPreferredAccessory(bot);
    equipBestSword(bot);
}

function spawnOneBot() {
    const id = getId('PLAYERS');
    const pos = randomMainSpawn();
    ENTITIES.newEntity({
        entityType: 'player',
        id,
        x: pos.x,
        y: pos.y,
        angle: Math.random() * Math.PI * 2,
        username: 'Bot',
        world: 'main'
    });
    const bot = ENTITIES.PLAYERS[id];
    if (!bot) return null;
    configureBotPlayer(bot);
    return bot;
}

function respawnBot(bot) {
    const role = getBotRole(bot);
    const prevHunterTargetId = bot._botHunterTargetId || 0;
    const pos = randomMainSpawn();
    const baseName = bot._botBaseUsername || bot.username || getUniqueBotUsername(bot.id);
    bot.world = 'main';
    bot.x = pos.x;
    bot.y = pos.y;
    bot.lastX = pos.x;
    bot.lastY = pos.y;
    bot.angle = Math.random() * Math.PI * 2;
    bot.maxHp = 100;
    bot.hp = bot.maxHp;
    bot.invincible = false;
    bot.lastDamagedTime = 0;
    bot.lastDamager = null;
    bot.lastCombatTime = -Infinity;
    bot.hasShield = false;
    bot.touchingSafeZone = false;
    bot.inWater = false;
    bot.accessoryId = 0;
    bot.equippedAccessoryItemType = 0;
    bot.color = randomBotSkin();
    bot._botBaseUsername = baseName;
    bot.username = baseName;
    bot.isAlive = true;
    bot.lastDiedTime = 0;
    bot.attacking = 0;
    bot.keys = { w: 0, a: 0, s: 0, d: 0 };
    bot._botNextMoveAt = 0;
    bot._botNextLookAt = 0;
    bot._botNextThrowAt = 0;
    bot._botNextDecisionAt = 0;
    bot._botNextBuffUpgradeAt = 0;
    bot._botHunterTargetId = role === BOT_ROLE_PRO ? prevHunterTargetId : 0;
    bot._botAssistTargetId = 0;
    bot._botLastNearRealPlayerAt = performance.now();

    bot.inventory = new Array(35).fill(0);
    bot.inventoryCounts = new Array(35).fill(0);
    bot.inventory[0] = 1;
    bot.inventoryCounts[0] = 1;
    bot.selectedSlot = 0;
    bot.manuallyUnequippedWeapon = false;
    rerollBotWeaponCategory(bot);
    resetBotLifeTimers(bot);
    assignBotPreferredAccessory(bot);
    equipBestSword(bot);
}

function relocateClusteredBot(bot) {
    if (!bot || !bot.isBot) return false;
    const world = bot.world || 'main';
    const worldBots = [];
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (p && p.isBot && p.id !== bot.id && (p.world || 'main') === world) worldBots.push(p);
    }
    const pos = findHiddenSpreadSpawnForWorld(world, worldBots, bot.id);
    if (!pos) {
        bot._botNextRelocationAttemptAt = performance.now() + randomRangeInt(BOT_RELOCATION_RETRY_MIN_MS, BOT_RELOCATION_RETRY_MAX_MS);
        return false;
    }
    bot.x = pos.x;
    bot.y = pos.y;
    bot.lastX = pos.x;
    bot.lastY = pos.y;
    bot.angle = Math.random() * Math.PI * 2;
    bot.attacking = 0;
    bot.keys = { w: 0, a: 0, s: 0, d: 0 };
    bot.lastDamagedTime = 0;
    bot.lastDamager = null;
    bot.lastCombatTime = -Infinity;
    bot.touchingSafeZone = false;
    bot.inWater = false;
    bot.hasShield = false;
    bot._botClusteredAt = 0;
    bot._botHasLockedTarget = false;
    bot._botNextMoveAt = 0;
    bot._botNextLookAt = 0;
    bot._botNextDecisionAt = 0;
    bot._botAssistTargetId = 0;
    bot._botLootTargetUntil = 0;
    bot._botOffscreenConflictWithId = 0;
    bot._botOffscreenConflictAt = 0;
    bot._botNextRelocationAttemptAt = 0;
    return true;
}

export function spawnBotPlayers(count = BOT_POPULATION_TARGET) {
    const safeCount = Math.max(0, Math.floor(count));
    botTargetPopulation = safeCount;
    for (let i = 0; i < safeCount; i++) {
        spawnOneBot();
    }
}

function ensureBotPopulation() {
    let botCount = 0;
    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (p && p.isBot) botCount++;
    }
    while (botCount < botTargetPopulation) {
        if (!spawnOneBot()) break;
        botCount++;
    }
}

export function isBotNearAnyRealPlayer(bot, realPlayers, range = BOT_OFFSCREEN_ACTIVE_RANGE) {
    if (!bot || !bot.isBot) return true;
    const world = bot.world || 'main';
    const rangeSq = range * range;
    const worldPlayers = realPlayers instanceof Map ? (realPlayers.get(world) || []) : realPlayers;
    for (const p of worldPlayers) {
        if (!p || p.isBot) continue;
        const dx = p.x - bot.x;
        const dy = p.y - bot.y;
        if ((dx * dx + dy * dy) <= rangeSq) return true;
    }
    return false;
}

function getBotPlayerProximity(bot, realPlayers) {
    if (!bot || !bot.isBot) {
        return { nearActive: true, nearDespawn: true };
    }
    const world = bot.world || 'main';
    const activeRangeSq = BOT_OFFSCREEN_ACTIVE_RANGE * BOT_OFFSCREEN_ACTIVE_RANGE;
    const despawnRangeSq = BOT_IDLE_DESPAWN_RANGE * BOT_IDLE_DESPAWN_RANGE;
    let nearActive = false;
    let nearDespawn = false;
    const worldPlayers = realPlayers instanceof Map ? (realPlayers.get(world) || []) : realPlayers;
    for (let i = 0; i < worldPlayers.length; i++) {
        const p = worldPlayers[i];
        if (!p || p.isBot) continue;
        const dx = p.x - bot.x;
        const dy = p.y - bot.y;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq <= activeRangeSq) {
            nearActive = true;
            nearDespawn = true;
            break;
        }
        if (distSq <= despawnRangeSq) {
            nearDespawn = true;
        }
    }
    return { nearActive, nearDespawn };
}

export function processOffscreenBot(bot, now = performance.now(), objectBuckets = null, mobBuckets = null) {
    if (!bot || !bot.isBot || !bot.isAlive) return;
    if (typeof bot.updateGrowthSpurt === 'function') {
        bot.updateGrowthSpurt(now);
    }
    bot.lastX = bot.x;
    bot.lastY = bot.y;
    bot.attacking = 0;
    bot._botHasLockedTarget = false;
    const role = getBotRole(bot);
    const needsSwordProgress = isWeaponTypeStronger(getBotPreferredWeaponCap(bot, getBotSwordCap(bot)), getBestBotPreferredWeaponRank(bot));
    const pickupObjects = objectBuckets?.pickups || null;
    const [worldWidth, worldHeight] = getBotWorldSize(bot);

    const speed = (bot.defaultSpeed || bot.speed || 17) * 0.7;
    const primitiveMoveToward = (tx, ty) => {
        const dx = tx - bot.x;
        const dy = ty - bot.y;
        bot.angle = Math.atan2(dy, dx);
        bot.x += Math.cos(bot.angle) * speed;
        bot.y += Math.sin(bot.angle) * speed;
    };

    if (tryFollowBotLootFocus(bot, now, pickupObjects, primitiveMoveToward)) {
        bot.x = Math.max(0, Math.min(worldWidth, bot.x));
        bot.y = Math.max(0, Math.min(worldHeight, bot.y));
        pushEntityOutOfSafeZone(bot, bot.world || 'main');
        bot.touchingSafeZone = false;
        return;
    }

    if (isBossDimensionWorld(bot.world || 'main')) {
        const bossMobTarget = findNearestBossDimensionMob(bot, BOT_PVE_RANGE, mobBuckets?.bossDimensionMobs || null);
        if (bossMobTarget) {
            const role = getBotRole(bot);
            const isBossBody = isBossDimensionBossMob(bossMobTarget.target);
            const preferredDist = getBossDimensionCombatDistance(role);
            if (isBotLowHealth(bot)) {
                moveOffscreenAwayFrom(bot, bossMobTarget.target.x, bossMobTarget.target.y, 0.9);
                bot.attacking = 0;
            } else {
                const currentDist = Math.sqrt(Math.max(1, bossMobTarget.distSq));
                if (isBossBody && currentDist < Math.max(80, preferredDist - 12)) {
                    moveOffscreenAwayFrom(bot, bossMobTarget.target.x, bossMobTarget.target.y, 0.8);
                } else if (!isBossBody || currentDist > preferredDist + 20) {
                    primitiveMoveToward(bossMobTarget.target.x, bossMobTarget.target.y);
                }
                const meleeAttackRange = role === BOT_ROLE_PRO ? Math.min(BOT_MOB_ATTACK_RANGE, 135) : BOT_MOB_ATTACK_RANGE;
                bot.attacking = isTargetWithinMeleeReach(bot, bossMobTarget.target, meleeAttackRange, bossMobTarget.distSq) ? 1 : 0;
            }
            bot.angle = Math.atan2(bossMobTarget.target.y - bot.y, bossMobTarget.target.x - bot.x);
            tryUseBotAbility(bot, bossMobTarget.target, bossMobTarget.distSq, now, BOT_MOB_ATTACK_RANGE);
            tryThrowAtTarget(bot, bossMobTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
            bot.x = Math.max(0, Math.min(worldWidth, bot.x));
            bot.y = Math.max(0, Math.min(worldHeight, bot.y));
            pushEntityOutOfSafeZone(bot, bot.world || 'main');
            bot.touchingSafeZone = false;
            return;
        }

        const bossLootTarget = findNearestBossDimensionLoot(bot, BOT_BOSS_LOOT_RANGE, objectBuckets);
        if (bossLootTarget) {
            bot.attacking = 0;
            bot._botHasLockedTarget = true;
            primitiveMoveToward(bossLootTarget.target.x, bossLootTarget.target.y);
            if (typeof bot.tryPickup === 'function') {
                bot.tryPickup(now, objectBuckets?.pickups || null);
            }
            bot.x = Math.max(0, Math.min(worldWidth, bot.x));
            bot.y = Math.max(0, Math.min(worldHeight, bot.y));
            pushEntityOutOfSafeZone(bot, bot.world || 'main');
            bot.touchingSafeZone = false;
            return;
        }

        if (trySendBotToBossExitPortal(bot, now, primitiveMoveToward)) {
            bot.x = Math.max(0, Math.min(worldWidth, bot.x));
            bot.y = Math.max(0, Math.min(worldHeight, bot.y));
            pushEntityOutOfSafeZone(bot, bot.world || 'main');
            bot.touchingSafeZone = false;
            return;
        }
    }

    const polarThreat = findNearestPolarBear(bot, BOT_POLAR_BEAR_AVOID_RANGE, mobBuckets?.polarBearsByTarget?.get(bot.id) || EMPTY_ARRAY);
    if (polarThreat) {
        const dx = bot.x - polarThreat.target.x;
        const dy = bot.y - polarThreat.target.y;
        bot.angle = Math.atan2(dy, dx);
        bot.x += Math.cos(bot.angle) * speed;
        bot.y += Math.sin(bot.angle) * speed;
        bot.attacking = 0;
    } else {
        const retaliationTarget = (role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL)
            ? getRetaliationTarget(bot)
            : null;
        if (retaliationTarget) {
            primitiveMoveToward(retaliationTarget.target.x, retaliationTarget.target.y);
            const attackRange = retaliationTarget.kind === 'mob' ? BOT_MOB_ATTACK_RANGE : BOT_ATTACK_RANGE;
            bot.attacking = retaliationTarget.distSq <= (attackRange * attackRange) ? 1 : 0;
            tryUseBotAbility(bot, retaliationTarget.target, retaliationTarget.distSq, now, attackRange);
        } else {
            const coinTarget = findNearestCoinFromObjects(bot, 1500, null, objectBuckets?.coins || null);
            if (coinTarget) {
                bot.attacking = 0;
                primitiveMoveToward(coinTarget.target.x, coinTarget.target.y);
            } else {
                const chestTarget = findNearestChestFromObjects(bot, 1900, null, objectBuckets?.chests || null);
                if (chestTarget) {
                    primitiveMoveToward(chestTarget.target.x, chestTarget.target.y);
                    bot.attacking = 1;
                    tryUseBotAbility(bot, chestTarget.target, chestTarget.distSq, now, BOT_CHEST_ATTACK_RANGE);

                    const chest = chestTarget.target;
                    const hitRange = (bot.radius + chest.radius + 35);
                    const dx = chest.x - bot.x;
                    const dy = chest.y - bot.y;
                    const distSq = dx * dx + dy * dy;
                    const canHit = distSq <= (hitRange * hitRange);
                    if (canHit && now - (bot._botPrimitiveLastChestHitAt || 0) >= 220) {
                        const primitiveDamage = Math.max(8, Math.round((bot.strength || 10) * 0.8));
                        if (typeof chest.damage === 'function') {
                            chest.damage(primitiveDamage, bot);
                        }
                        bot._botPrimitiveLastChestHitAt = now;
                    }
                } else if (needsSwordProgress) {
                    bot.attacking = 0;
                    // Keep offscreen farming behavior consistent with on-screen logic:
                    // roam toward a target away from base instead of drifting into safe zone.
                    const farmTarget = getFarmTarget(bot, now);
                    primitiveMoveToward(farmTarget.x, farmTarget.y);
                } else {
                    bot.attacking = 0;
                    if (now >= (bot._botPrimitiveTurnAt || 0)) {
                        bot._botPrimitiveAngle = (bot._botPrimitiveAngle || 0) + ((Math.random() * 1.2) - 0.6);
                        bot._botPrimitiveTurnAt = now + randomRangeInt(1200, 3200);
                    }
                    bot.angle = bot._botPrimitiveAngle || bot.angle || 0;
                    bot.x += Math.cos(bot.angle) * speed;
                    bot.y += Math.sin(bot.angle) * speed;
                }
            }
        }
    }

    if (pickupObjects) {
        bot.tryPickup(now, pickupObjects);
    } else {
        bot.tryPickup(now);
    }

    const margin = Math.max(12, (bot.radius || 30) + 8);
    if (bot.x < margin || bot.x > (worldWidth - margin)) {
        bot._botPrimitiveAngle = Math.PI - (bot._botPrimitiveAngle || 0);
    }
    if (bot.y < margin || bot.y > (worldHeight - margin)) {
        bot._botPrimitiveAngle = -(bot._botPrimitiveAngle || 0);
    }

    bot.x = Math.max(0, Math.min(worldWidth, bot.x));
    bot.y = Math.max(0, Math.min(worldHeight, bot.y));
    // Offscreen simulation skips full player environment updates, so force-safe-zone ejection here
    // to prevent idle clumping inside base when bots are far from real players.
    pushEntityOutOfSafeZone(bot, bot.world || 'main');
    bot.touchingSafeZone = false;
    bot.angle = bot.angle || bot._botPrimitiveAngle || 0;
    markOffscreenBotProgress(bot, now);
    recoverOffscreenStuckBot(bot, now);
}

export function processOffscreenHunterBot(bot, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive) return;
    if (typeof bot.updateGrowthSpurt === 'function') {
        bot.updateGrowthSpurt(now);
    }
    const [worldWidth, worldHeight] = getBotWorldSize(bot);

    const retaliationTarget = (getBotRole(bot) === BOT_ROLE_PRO || getBotRole(bot) === BOT_ROLE_CASUAL)
        ? getRetaliationTarget(bot)
        : null;
    if (retaliationTarget) {
        bot.lastX = bot.x;
        bot.lastY = bot.y;
        bot._botHasLockedTarget = true;
        const dx = retaliationTarget.target.x - bot.x;
        const dy = retaliationTarget.target.y - bot.y;
        if ((dx * dx + dy * dy) <= 1) return;
        bot.angle = Math.atan2(dy, dx);
        const speed = (bot.defaultSpeed || bot.speed || 17) * 0.9;
        bot.x += Math.cos(bot.angle) * speed;
        bot.y += Math.sin(bot.angle) * speed;
        const attackRange = retaliationTarget.kind === 'mob' ? BOT_MOB_ATTACK_RANGE : BOT_ATTACK_RANGE;
        bot.attacking = retaliationTarget.distSq <= (attackRange * attackRange) ? 1 : 0;
        tryUseBotAbility(bot, retaliationTarget.target, retaliationTarget.distSq, now, attackRange);
        bot.x = Math.max(0, Math.min(worldWidth, bot.x));
        bot.y = Math.max(0, Math.min(worldHeight, bot.y));
        return;
    }

    if (tryFollowBotLootFocus(bot, now, null, (tx, ty) => {
        bot.lastX = bot.x;
        bot.lastY = bot.y;
        bot.angle = Math.atan2(ty - bot.y, tx - bot.x);
        const speed = (bot.defaultSpeed || bot.speed || 17) * 0.9;
        bot.x += Math.cos(bot.angle) * speed;
        bot.y += Math.sin(bot.angle) * speed;
        bot.x = Math.max(0, Math.min(worldWidth, bot.x));
        bot.y = Math.max(0, Math.min(worldHeight, bot.y));
        pushEntityOutOfSafeZone(bot, bot.world || 'main');
        bot.touchingSafeZone = false;
    })) {
        return;
    }

    const targetId = bot._botHunterTargetId || bot._botAssistTargetId || 0;
    if (!targetId) return;
    const target = ENTITIES.PLAYERS[targetId];
    const isHunterTarget = targetId === (bot._botHunterTargetId || 0);
    const validTarget =
        !!target &&
        target.isAlive &&
        !target.isBot &&
        !target.isInvisible &&
        !target.hasShield &&
        !(typeof target.isPvpProtected === 'function' && target.isPvpProtected()) &&
        (target.world || 'main') === (bot.world || 'main');
    if (!validTarget) {
        if (isHunterTarget) bot._botHunterTargetId = 0;
        if (targetId === (bot._botAssistTargetId || 0)) bot._botAssistTargetId = 0;
        bot._botHasLockedTarget = false;
        bot.attacking = 0;
        return;
    }

    bot.lastX = bot.x;
    bot.lastY = bot.y;
    bot.attacking = 0;
    bot._botHasLockedTarget = true;
    bot.keys = { w: 0, a: 0, s: 0, d: 0 };

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 1) return;

    bot.angle = Math.atan2(dy, dx);
    const speed = (bot.defaultSpeed || bot.speed || 17) * 0.9;
    bot.x += Math.cos(bot.angle) * speed;
    bot.y += Math.sin(bot.angle) * speed;
    bot.x = Math.max(0, Math.min(worldWidth, bot.x));
    bot.y = Math.max(0, Math.min(worldHeight, bot.y));
    pushEntityOutOfSafeZone(bot, bot.world || 'main');
    bot.touchingSafeZone = false;
}

function shouldRespawnStillBot(bot, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive) return false;
    const state = bot._botStillState || null;
    if (!state) {
        bot._botStillState = {
            lastX: bot.x,
            lastY: bot.y,
            lastAngle: bot.angle,
            windowStartX: bot.x,
            windowStartY: bot.y,
            windowStartAngle: bot.angle,
            windowStartAt: now
        };
        return false;
    }

    const dx = bot.x - state.lastX;
    const dy = bot.y - state.lastY;
    const angleDelta = Math.abs((bot.angle || 0) - (state.lastAngle || 0));

    state.lastX = bot.x;
    state.lastY = bot.y;
    state.lastAngle = bot.angle;

    const startDx = bot.x - (state.windowStartX || bot.x);
    const startDy = bot.y - (state.windowStartY || bot.y);
    const distFromStartSq = (startDx * startDx) + (startDy * startDy);
    const angleFromStart = Math.abs((bot.angle || 0) - (state.windowStartAngle || 0));

    if (distFromStartSq >= BOT_STILL_MIN_TRAVEL_SQ || angleFromStart > BOT_STILL_ANGLE_EPS) {
        state.windowStartX = bot.x;
        state.windowStartY = bot.y;
        state.windowStartAngle = bot.angle;
        state.windowStartAt = now;
        return false;
    }

    const windowMs = now - (state.windowStartAt || now);
    const tinyMove = (dx * dx + dy * dy) <= BOT_STILL_POS_EPS_SQ;
    const tinyAngle = angleDelta <= BOT_STILL_ANGLE_EPS;
    return windowMs >= BOT_STILL_DESPAWN_MS && distFromStartSq < BOT_STILL_MIN_TRAVEL_SQ && tinyMove && tinyAngle;
}

function shouldRespawnClusteredBot(bot, allBots, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive) return false;
    let nearbyBots = 0;

    for (let i = 0; i < allBots.length; i++) {
        const other = allBots[i];
        if (!other || other.id === bot.id || !other.isAlive) continue;

        const dx = other.x - bot.x;
        const dy = other.y - bot.y;
        if ((dx * dx) + (dy * dy) > BOT_CLUSTER_RADIUS_SQ) continue;

        nearbyBots++;
        if (nearbyBots >= BOT_CLUSTER_MIN_NEIGHBORS) break;
    }

    if (nearbyBots < BOT_CLUSTER_MIN_NEIGHBORS) {
        bot._botClusteredAt = 0;
        return false;
    }

    if (!bot._botClusteredAt) {
        bot._botClusteredAt = now;
        return false;
    }

    return now - bot._botClusteredAt >= BOT_CLUSTER_DESPAWN_MS;
}

function shouldBotsFightOffscreen(bot, other, now = performance.now()) {
    if (!bot || !other || bot.id === other.id) return false;
    if (!bot.isBot || !other.isBot || !bot.isAlive || !other.isAlive) return false;
    if ((bot.world || 'main') !== (other.world || 'main')) return false;
    if (bot.touchingSafeZone || other.touchingSafeZone) return false;
    if (shouldIgnoreCombatBetween(bot, other)) return false;
    return shouldEngagePlayer(bot, other, now) || shouldEngagePlayer(other, bot, now);
}

function shouldRelocateOffscreenBotConflict(bot, allBots, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive || !Array.isArray(allBots)) return false;
    let nearestEnemy = null;
    let nearestDistSq = BOT_OFFSCREEN_CONFLICT_RADIUS_SQ + 1;

    for (let i = 0; i < allBots.length; i++) {
        const other = allBots[i];
        if (!shouldBotsFightOffscreen(bot, other, now)) continue;
        const dx = other.x - bot.x;
        const dy = other.y - bot.y;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq <= BOT_OFFSCREEN_CONFLICT_RADIUS_SQ && distSq < nearestDistSq) {
            nearestEnemy = other;
            nearestDistSq = distSq;
        }
    }

    if (!nearestEnemy) {
        bot._botOffscreenConflictWithId = 0;
        bot._botOffscreenConflictAt = 0;
        return false;
    }

    if (bot._botOffscreenConflictWithId !== nearestEnemy.id) {
        bot._botOffscreenConflictWithId = nearestEnemy.id;
        bot._botOffscreenConflictAt = now;
        return false;
    }

    if (!bot._botOffscreenConflictAt) {
        bot._botOffscreenConflictAt = now;
        return false;
    }

    return now - bot._botOffscreenConflictAt >= BOT_OFFSCREEN_CONFLICT_RELOCATE_MS;
}

function replaceStillBot(bot) {
    if (!bot || !bot.isBot) return;
    void finalizePlayerLeaderboardRun(bot, Date.now());
    ENTITIES.deleteEntity('player', bot.id);
    spawnOneBot();
}

export function updateBotPlayers(now = performance.now()) {
    ensureBotPopulation();
    const tickState = collectBotTickState();
    const { realPlayers, allBots, allMainBots, proMainBots } = tickState;
    const realPlayersByWorld = buildPlayersByWorld(realPlayers);
    const allBotsByWorld = buildBotsByWorld(allBots);
    const combatPlayersByWorld = buildPlayersByWorld(realPlayers.concat(allBots));
    const worldObjectBuckets = buildWorldObjectBuckets();
    const worldMobBuckets = buildWorldMobBuckets();
    refreshTeamerAssignments(now, allMainBots);
    refreshHunterAssignments(realPlayers, now, {
        allBots,
        proBots: proMainBots
    });
    ensureTopPlayerHasHunter(allMainBots);
    const teamCoinReservations = new Map();
    const teamChestReservations = new Map();
    const getTeamReservationSet = (store, group) => {
        if (!store.has(group)) store.set(group, new Set());
        return store.get(group);
    };
    for (const bot of allBots) {
        if (!bot) continue;
        const worldId = bot.world || 'main';
        const objectBuckets = worldObjectBuckets.get(worldId) || EMPTY_WORLD_OBJECT_BUCKETS;
        const mobBuckets = worldMobBuckets.get(worldId) || EMPTY_WORLD_MOB_BUCKETS;
        const worldBots = allBotsByWorld.get(worldId) || [];
        const combatPlayers = combatPlayersByWorld.get(worldId) || [];
        const role = getBotRole(bot);
        const bestSwordRank = getBestBotPreferredWeaponRank(bot);
        const swordCap = getBotPreferredWeaponCap(bot, getBotSwordCap(bot));
        const needsSwordProgress = isWeaponTypeStronger(swordCap, bestSwordRank);
        const teamGroup = worldId === 'main' ? getBotTeamGroup(bot) : 0;
        const reservedCoins = teamGroup > 0 ? getTeamReservationSet(teamCoinReservations, teamGroup) : null;
        const reservedChests = teamGroup > 0 ? getTeamReservationSet(teamChestReservations, teamGroup) : null;
        bot._botHasLockedTarget = false;
        const reachedScoreCap = hasReachedScoreCap(bot);
        const { nearActive: nearRealPlayer, nearDespawn: nearDespawnRange } = getBotPlayerProximity(bot, realPlayersByWorld);
        if (nearDespawnRange) {
            bot._botLastNearRealPlayerAt = now;
        } else if (!bot._botLastNearRealPlayerAt) {
            bot._botLastNearRealPlayerAt = now;
        }

        if (!bot.isAlive) {
            if (now - (bot.lastDiedTime || 0) >= BOT_RESPAWN_DELAY_MS) {
                respawnBot(bot);
            }
            continue;
        }

        if (shouldRespawnStillBot(bot, now)) {
            replaceStillBot(bot);
            continue;
        }

        const canTryRelocate = !nearRealPlayer &&
            !isBotPossiblySpectated(bot) &&
            now >= (bot._botNextRelocationAttemptAt || 0);
        if (canTryRelocate && shouldRespawnClusteredBot(bot, worldBots, now)) {
            if (relocateClusteredBot(bot)) continue;
        }

        if (canTryRelocate && shouldRelocateOffscreenBotConflict(bot, worldBots, now)) {
            if (relocateClusteredBot(bot)) continue;
        }

        // Always purge worse swords quickly, even if bot is offscreen.
        purgeUselessSwords(bot, now);

        if ((bot.score || 0) >= BOT_IDLE_DESPAWN_SCORE &&
            !isBotPossiblySpectated(bot) &&
            !nearDespawnRange &&
            now - (bot._botLastNearRealPlayerAt || 0) >= BOT_IDLE_DESPAWN_MS) {
            respawnBot(bot);
            continue;
        }

        if (now < (bot._botNextDecisionAt || 0)) {
            continue;
        }
        bot._botNextDecisionAt = now + BOT_DECISION_INTERVAL_MS;
        tryBotSpendBuffPoints(bot, now);

        // Blinded bots go rogue for the blindness duration: random movement and swings.
        if (typeof bot.isBlinded === 'function' && bot.isBlinded(now)) {
            bot._botHasLockedTarget = false;
            if (now >= (bot._botNextMoveAt || 0)) {
                chooseRandomMovePattern(bot);
                bot._botNextMoveAt = now + 120 + Math.floor(Math.random() * 260);
            }
            // Occasionally swing while blinded.
            bot.attacking = Math.random() < 0.45 ? 1 : 0;
            if (now >= (bot._botNextLookAt || 0)) {
                bot.angle = Math.random() * Math.PI * 2;
                bot._botNextLookAt = now + 140 + Math.floor(Math.random() * 360);
            }
            continue;
        }

        if (!nearRealPlayer) {
            // Offscreen bots get their lightweight simulation in processPlayers().
            // Skip expensive nearby-target scans here to reduce server churn.
            bot._botHasLockedTarget = false;
            bot.attacking = 0;
            ensureBotAlwaysArmed(bot, now);
            tryBotShopUpgrade(bot, now);
            maintainBotInventory(bot, now);
            continue;
        }

        ensureBotAlwaysArmed(bot, now);
        tryBotShopUpgrade(bot, now);
        maintainBotInventory(bot, now);

        const hunterTargetId = bot._botHunterTargetId || 0;
        let hunterTarget = getHunterTarget(bot);
        const assistTargetId = bot._botAssistTargetId || 0;
        let assistTarget = getAssistTarget(bot);
        if (!nearRealPlayer && !hunterTarget && !assistTarget) {
            bot.attacking = 0;
            // If the bot is already fully progressed, let it drift idly; otherwise fall through to loot logic.
            if (reachedScoreCap && !needsSwordProgress) {
                if (now >= (bot._botNextMoveAt || 0)) {
                    chooseRandomMovePattern(bot);
                    bot._botNextMoveAt = now + 250 + Math.floor(Math.random() * 900);
                }
                continue;
            }
            // When no players are around and progression is still needed, keep running the normal loot loop.
        }

        const lifetimeExpired = !bot._botTargetedRealPlayerThisLife &&
            now - (bot._botBornAt || now) >= (bot._botLifetimeMs || BOT_LIFETIME_MAX_MS);
        if (lifetimeExpired) {
            const inCombatRecently = (now - (bot.lastCombatTime || 0)) < 8000;
            // Only recycle bots that are idle/offscreen to avoid them vanishing near players.
            if (!nearRealPlayer && !inCombatRecently) {
                respawnBot(bot);
                continue;
            }
            // Give active bots more time before the next recycle check.
            bot._botBornAt = now;
        }

        const forced = forceBotBackInBounds(bot);
        if (forced) {
            bot.attacking = 0;
            bot._botHasLockedTarget = true;
        } else {
            const lowHealth = isBotLowHealth(bot);
            const polarThreat = findNearestPolarBear(bot, BOT_POLAR_BEAR_AVOID_RANGE, mobBuckets.polarBearsByTarget.get(bot.id) || EMPTY_ARRAY);
            if (polarThreat) {
                bot._botHasLockedTarget = true;
                if (lowHealth) {
                    handleLowHealthRetreat(bot, polarThreat.target, polarThreat.distSq, now, 0.8);
                } else {
                    moveAroundCombatTarget(bot, polarThreat.target.x, polarThreat.target.y, polarThreat.distSq, now);
                    bot.attacking = polarThreat.distSq <= (BOT_MOB_ATTACK_RANGE * BOT_MOB_ATTACK_RANGE) ? 1 : 0;
                    tryUseBotAbility(bot, polarThreat.target, polarThreat.distSq, now, BOT_MOB_ATTACK_RANGE);
                    tryThrowAtTarget(bot, polarThreat.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                }
                bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                continue;
            }

            const minotaurThreat = findNearestAggroMinotaur(bot, BOT_PVE_RANGE, mobBuckets.minotaursByTarget.get(bot.id) || EMPTY_ARRAY);
            if (minotaurThreat) {
                bot._botHasLockedTarget = true;
                if (lowHealth) {
                    handleLowHealthRetreat(bot, minotaurThreat.target, minotaurThreat.distSq, now, 0.8);
                } else {
                    moveAroundCombatTarget(bot, minotaurThreat.target.x, minotaurThreat.target.y, minotaurThreat.distSq, now);
                    bot.attacking = minotaurThreat.distSq <= (BOT_MOB_ATTACK_RANGE * BOT_MOB_ATTACK_RANGE) ? 1 : 0;
                    tryUseBotAbility(bot, minotaurThreat.target, minotaurThreat.distSq, now, BOT_MOB_ATTACK_RANGE);
                    tryThrowAtTarget(bot, minotaurThreat.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                }
                bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                continue;
            }

            if (isBossDimensionWorld(worldId)) {
                const bossMobTarget = findNearestBossDimensionMob(bot, BOT_PVE_RANGE, mobBuckets.bossDimensionMobs);
                if (bossMobTarget) {
                    bot._botHasLockedTarget = true;
                    if (lowHealth) {
                        handleLowHealthRetreat(bot, bossMobTarget.target, bossMobTarget.distSq, now, 0.9);
                    } else {
                        const bossCombatDist = getBossDimensionCombatDistance(role);
                        if (isBossDimensionBossMob(bossMobTarget.target)) {
                            moveAroundCombatTargetAtDistance(bot, bossMobTarget.target.x, bossMobTarget.target.y, bossMobTarget.distSq, bossCombatDist, now);
                        } else {
                            moveAroundCombatTarget(bot, bossMobTarget.target.x, bossMobTarget.target.y, bossMobTarget.distSq, now);
                        }
                        const meleeAttackRange = role === BOT_ROLE_PRO
                            ? Math.min(BOT_MOB_ATTACK_RANGE, 135)
                            : BOT_MOB_ATTACK_RANGE;
                        bot.attacking = isTargetWithinMeleeReach(bot, bossMobTarget.target, meleeAttackRange, bossMobTarget.distSq) ? 1 : 0;
                    }
                    tryUseBotAbility(bot, bossMobTarget.target, bossMobTarget.distSq, now, BOT_MOB_ATTACK_RANGE);
                    tryThrowAtTarget(bot, bossMobTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                    continue;
                }

                const bossLootTarget = findNearestBossDimensionLoot(bot, BOT_BOSS_LOOT_RANGE, objectBuckets);
                if (bossLootTarget) {
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveToward(bot, bossLootTarget.target.x, bossLootTarget.target.y);
                    bot.tryPickup(now, objectBuckets.pickups || null);
                    maybeEquipAccessoryFromInventory(bot);
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                    continue;
                }

                if (trySendBotToBossExitPortal(bot, now)) {
                    continue;
                }
            }

            const retaliationTarget = ((role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL) || (role === BOT_ROLE_NOOB && reachedScoreCap))
                ? getRetaliationTarget(bot)
                : null;

            if (!retaliationTarget && tryOpenRootWalkerPortal(bot, now)) {
                continue;
            }

            if (!retaliationTarget && trySendBotToRootWalkerPortal(bot, now)) {
                continue;
            }

            // If this bot is assigned as a hunter, it may only target its assigned real player
            // unless it is currently retaliating against the latest attacker.
            if (hunterTargetId && !hunterTarget && !retaliationTarget) {
                bot.attacking = 0;
                continue;
            }

            if (hunterTarget && !shouldEngagePlayer(bot, hunterTarget.player, now)) {
                hunterTarget = null;
            }
            if (assistTarget && !shouldEngagePlayer(bot, assistTarget.player, now)) {
                assistTarget = null;
            }

            // Priority 1: Retaliation / role-based PvP logic
            let playerTarget = null;
            if (retaliationTarget?.kind === 'player') {
                playerTarget = { player: retaliationTarget.target, distSq: retaliationTarget.distSq };
            } else if (hunterTarget) {
                playerTarget = hunterTarget;
            } else if (assistTarget) {
                playerTarget = assistTarget;
            } else if (role === BOT_ROLE_PRO) {
                playerTarget = findNearestCombatPlayer(bot, BOT_AGGRO_RANGE, {
                    now,
                    players: combatPlayers,
                    targetFilter: (target) => canHunterEngageTarget(bot, target)
                });
            } else if (role === BOT_ROLE_CASUAL && !reachedScoreCap) {
                playerTarget = findNearestCombatPlayer(bot, BOT_AGGRO_RANGE, {
                    now,
                    players: combatPlayers
                });
            }

            if (playerTarget) {
                if (!playerTarget.player.isBot) bot._botTargetedRealPlayerThisLife = true;
                bot._botHasLockedTarget = true;
                chasePlayer(bot, playerTarget.player, playerTarget.distSq, now);
                tryUseBotAbility(bot, playerTarget.player, playerTarget.distSq, now, BOT_ATTACK_RANGE);
                tryThrowAtTarget(bot, playerTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 120);
                continue; // stay focused on combat target
            } else if (retaliationTarget?.kind === 'mob') {
                bot._botHasLockedTarget = true;
                moveAroundCombatTarget(bot, retaliationTarget.target.x, retaliationTarget.target.y, retaliationTarget.distSq, now);
                bot.attacking = retaliationTarget.distSq <= (BOT_MOB_ATTACK_RANGE * BOT_MOB_ATTACK_RANGE) ? 1 : 0;
                tryUseBotAbility(bot, retaliationTarget.target, retaliationTarget.distSq, now, BOT_MOB_ATTACK_RANGE);
                tryThrowAtTarget(bot, retaliationTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 120);
                continue;
            } else {
                // If no player target, look for enemy bots to fight.
                const botEnemy = findNearestEnemyBot(bot, BOT_AGGRO_RANGE, worldBots);
                if (botEnemy) {
                    bot._botHasLockedTarget = true;
                    chasePlayer(bot, botEnemy.player, botEnemy.distSq, now);
                    tryUseBotAbility(bot, botEnemy.player, botEnemy.distSq, now, BOT_ATTACK_RANGE);
                    tryThrowAtTarget(bot, botEnemy.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                    bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 120);
                    continue;
                }
            }
            // Looting / roaming
            if (reachedScoreCap && !needsSwordProgress) {
                bot._botHasLockedTarget = false;
                bot.attacking = 0;
                const minotaurTarget = !lowHealth ? findNearestMinotaur(bot, BOT_PVE_RANGE, mobBuckets.minotaurs) : null;
                if (minotaurTarget) {
                    bot._botHasLockedTarget = true;
                    moveAroundCombatTarget(bot, minotaurTarget.target.x, minotaurTarget.target.y, minotaurTarget.distSq, now);
                    bot.attacking = minotaurTarget.distSq <= (BOT_MOB_ATTACK_RANGE * BOT_MOB_ATTACK_RANGE) ? 1 : 0;
                    tryUseBotAbility(bot, minotaurTarget.target, minotaurTarget.distSq, now, BOT_MOB_ATTACK_RANGE);
                    tryThrowAtTarget(bot, minotaurTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                    bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 140);
                    continue;
                }
                if (now >= (bot._botNextMoveAt || 0)) {
                    chooseRandomMovePattern(bot);
                    bot._botNextMoveAt = now + 250 + Math.floor(Math.random() * 900);
                }
            } else {
                if (tryFollowBotLootFocus(bot, now, objectBuckets.activePickups || objectBuckets.pickups || null)) {
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                    continue;
                }

                // Priority 2: Desired loot (better sword or accessory when unequipped)
                if (needsHeartShades(bot)) {
                    const essenceTarget = findNearestHeartyEssenceFromObjects(bot, BOT_PVE_RANGE, objectBuckets.activePickups);
                    if (essenceTarget) {
                        bot._botHasLockedTarget = true;
                        bot.attacking = 0;
                        moveToward(bot, essenceTarget.target.x, essenceTarget.target.y);
                        bot.tryPickup(now, objectBuckets.pickups || null);
                        bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                        continue;
                    }
                    const heartyTarget = findNearestHearty(bot, BOT_PVE_RANGE, mobBuckets.hearties);
                    if (heartyTarget) {
                        bot._botHasLockedTarget = true;
                        moveAroundCombatTarget(bot, heartyTarget.target.x, heartyTarget.target.y, heartyTarget.distSq, now);
                        bot.attacking = heartyTarget.distSq <= (BOT_MOB_ATTACK_RANGE * BOT_MOB_ATTACK_RANGE) ? 1 : 0;
                        tryUseBotAbility(bot, heartyTarget.target, heartyTarget.distSq, now, BOT_MOB_ATTACK_RANGE);
                        tryThrowAtTarget(bot, heartyTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                        bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 140);
                        continue;
                    }
                }

                // Priority 2: Desired loot (better sword or accessory when unequipped)
                const desiredLootTarget = findNearestDesiredLootFromObjects(bot, BOT_PVE_RANGE, objectBuckets.activePickups);
                if (desiredLootTarget) {
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveToward(bot, desiredLootTarget.target.x, desiredLootTarget.target.y);
                    bot.tryPickup(now, objectBuckets.pickups || null);
                    maybeEquipAccessoryFromInventory(bot);
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                    continue;
                }

                // Priority 2: Chest & Coins
                const coinTarget = findNearestCoinFromObjects(bot, BOT_COIN_RANGE, reservedCoins, objectBuckets.activeCoins);
                const chestTarget = findNearestChestFromObjects(bot, BOT_PVE_RANGE, reservedChests, objectBuckets.chests);
                const pickCoin = coinTarget && (!chestTarget || coinTarget.distSq <= chestTarget.distSq);

                if (pickCoin) {
                    if (reservedCoins) reservedCoins.add(coinTarget.target.id);
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveToward(bot, coinTarget.target.x, coinTarget.target.y);
                    bot.tryPickup(now, objectBuckets.pickups || null);
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 140);
                } else if (chestTarget) {
                    if (reservedChests) reservedChests.add(chestTarget.target.id);
                    bot._botHasLockedTarget = true;
                    moveAroundCombatTarget(bot, chestTarget.target.x, chestTarget.target.y, chestTarget.distSq, now);
                    bot.attacking = chestTarget.distSq <= (BOT_CHEST_ATTACK_RANGE * BOT_CHEST_ATTACK_RANGE) ? 1 : 0;
                    tryUseBotAbility(bot, chestTarget.target, chestTarget.distSq, now, BOT_CHEST_ATTACK_RANGE);
                    tryThrowAtTarget(bot, chestTarget.distSq, now, 260, 900);
                    bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 140);
                } else if (needsSwordProgress && now >= (bot._botNextMoveAt || 0)) {
                    // Keep farming toward a roaming target (away from base) until the bot reaches its sword cap.
                    bot._botHasLockedTarget = false;
                    bot.attacking = 0;
                    const farmTarget = getFarmTarget(bot, now);
                    moveToward(bot, farmTarget.x, farmTarget.y);
                    bot._botNextMoveAt = now + 140 + Math.floor(Math.random() * 240);
                } else if (now >= (bot._botNextMoveAt || 0)) {
                    bot.attacking = 0;
                    chooseRandomMovePattern(bot);
                    bot._botNextMoveAt = now + 350 + Math.floor(Math.random() * 1250);
                }
            }
        }

        if (now >= (bot._botNextLookAt || 0) && !bot._botHasLockedTarget && !bot.attacking) {
            bot.angle = Math.random() * Math.PI * 2;
            bot._botNextLookAt = now + 180 + Math.floor(Math.random() * 800);
        }
    }
}
