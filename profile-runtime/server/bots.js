import { ENTITIES, MAP_SIZE } from './game.js';
import { getId, cmdRun } from './helpers.js';
import { dataMap, TPS, ACCESSORY_KEYS, accessoryItemTypeFromId, isAccessoryItemType, isChestObjectType, isCoinObjectType, isSwordRank } from '../public/shared/datamap.js';

const DEFAULT_BOT_COUNT = 5;
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
const BOT_COIN_RANGE = 1400;
const BOT_MOB_ATTACK_RANGE = 180;
const BOT_CHEST_ATTACK_RANGE = 190;
const BOT_POISON_AOE_RANGE = 300;
const BOT_ENERGY_BURST_RANGE = 500;
const MINOTAUR_MOB_TYPE = 6;
const POLAR_BEAR_MOB_TYPE = 5;
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
const BOT_RETALIATE_WINDOW_MS = 12000;
const BOT_KILL_TARGET_COOLDOWN_MS = 3 * 60 * 1000;
const TEAMER_TARGET_COUNT = 4;
const TEAM_GROUP_COUNT = 2;
const TEAM_GROUP_SIZE = 2;
const TEAM_SHUFFLE_INTERVAL_MS = 5 * 60 * 1000;
const HUNTER_REASSIGN_MS = 1000;
const PRO_HUNTER_MIN_SCORE = 3000;
const PRO_HUNTER_MIN_SWORD_RANK = 3;
const PRO_HUNTER_TARGET_MIN_SCORE = 3000;
const PRO_TARGET_SWORD_MAX_GAP = 2;
const HUNTER_TEAMUP_SCORE_MULT = 1.5;
const BOT_USERNAMES = [
    '𝓩ombie🥀',
    'xXVoidSlayerXx',
    'Ƭhunder⚡Boi',
    '꧁FrostByte꧂',
    'sammy',
    'salmon',
    'el',
    'b0i',
    'Aurora',
    '._.',
    'buddy',
    'rack',
    'ℓ_Hero哦',
    'Σternal',
    '𝕹ight🩸Crawler',
    'xXPizzaGoblinXx',
    'VΛMPIRE💀',
    '๖ۣۜPixelGhost',
    'Ŧornado🌪',
    'Cr@bNebula69',
    '⚡M0nster',
    'bruh',
    '=)',
    'real',
    'ez',
    'nnhn71',
    'Br0ther',
    'gaming',
    'indefinite',
    'T-T',
    '...',
    '!?',
    'MrBeast',
    'Adrian',
    'Dieg0 :)',
    'ru serious',
    'эта игра легкая'
];
let botTargetPopulation = DEFAULT_BOT_COUNT;
const teamGroupByBotId = new Map();
let lastTeamShuffleAt = 0;
let lastHunterAssignmentAt = 0;

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

    while (attempts < 60) {
        attempts++;
        x = Math.floor(300 + Math.random() * (MAP_SIZE[0] - 600));
        y = Math.floor(300 + Math.random() * (MAP_SIZE[1] - 600));

        const dx = x - BOT_CENTER_X;
        const dy = y - BOT_CENTER_Y;
        const outsideSpawnZone = (dx * dx + dy * dy) > (850 * 850);
        const outsideRiverCore = x < (BOT_RIVER_LEFT - 80) || x > (BOT_RIVER_RIGHT + 80);
        if (outsideSpawnZone && outsideRiverCore) break;
    }

    return { x, y };
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

function getRandomBotUsername() {
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

function getBestSwordRank(bot) {
    let best = 1;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const rank = bot.inventory[i] & 0x7F;
        if (!isSwordRank(rank)) continue;
        if (rank > best) best = rank;
    }
    return best;
}

function equipBestSword(bot) {
    let bestSlot = -1;
    let bestRank = 1;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const rank = bot.inventory[i] & 0x7F;
        if (!isSwordRank(rank)) continue;
        if (rank > bestRank) {
            bestRank = rank;
            bestSlot = i;
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
const PRO_ACCESSORY_IDS = new Set(['bush-cloak', 'viking-hat', 'pirate-hat']
    .map(key => ACCESSORY_ID_BY_KEY[key])
    .filter(id => Number.isInteger(id) && id > 0));
const CASUAL_BIASED_ACCESSORY_IDS = new Set(['sunglasses', 'bush-cloak', 'pirate-hat', 'viking-hat', 'alien-antennas', 'dark-cloak']
    .map(key => ACCESSORY_ID_BY_KEY[key])
    .filter(id => Number.isInteger(id) && id > 0));
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

function hasEquippedAccessory(bot) {
    return (bot.accessoryId || 0) > 0 || (bot.equippedAccessoryItemType || 0) > 0;
}

function isInventoryFillingUp(bot) {
    let emptySlots = 0;
    for (let i = 0; i < bot.inventory.length; i++) {
        if ((bot.inventory[i] & 0x7F) === 0 || bot.inventoryCounts[i] <= 0) emptySlots++;
    }
    if (emptySlots <= 4) return true;
    return !canBotStoreMoreCoins(bot);
}

function chooseAccessoryForRole(bot, affordableAccessoryIds) {
    const role = getBotRole(bot);
    if (!affordableAccessoryIds.length) return null;

    if (role === BOT_ROLE_PRO) {
        const allowed = affordableAccessoryIds.filter(id => PRO_ACCESSORY_IDS.has(id));
        if (!allowed.length) return null;
        return allowed[Math.floor(Math.random() * allowed.length)];
    }

    if (role === BOT_ROLE_CASUAL) {
        const biased = affordableAccessoryIds.filter(id => CASUAL_BIASED_ACCESSORY_IDS.has(id));
        const pool = (biased.length && Math.random() < 0.75) ? biased : affordableAccessoryIds;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    return affordableAccessoryIds[Math.floor(Math.random() * affordableAccessoryIds.length)];
}

function getBotTeamGroup(bot) {
    return teamGroupByBotId.get(bot.id) || 0;
}

function shouldIgnoreCombatBetween(bot, other) {
    if (!bot || !other || !bot.isBot || !other.isBot) return false;
    const myGroup = getBotTeamGroup(bot);
    const otherGroup = getBotTeamGroup(other);
    return myGroup > 0 && myGroup === otherGroup;
}

function getTargetSwordRankForHunt(target) {
    const rank = target?.weapon?.rank;
    if (!Number.isFinite(rank)) return 1;
    return Math.max(1, rank | 0);
}

function canHunterEngageTarget(bot, target) {
    if (!bot || !target) return false;
    if (isBotTargetTemporarilyIgnored(bot, target)) return false;
    const hunterRank = getBestSwordRank(bot);
    if (hunterRank < PRO_HUNTER_MIN_SWORD_RANK) return false;
    if ((target.score || 0) < PRO_HUNTER_TARGET_MIN_SCORE) return false;
    const targetRank = getTargetSwordRankForHunt(target);
    const requiredHunterRank = Math.max(1, targetRank - 2);
    const minTargetRank = Math.max(1, hunterRank - PRO_TARGET_SWORD_MAX_GAP);
    return hunterRank >= requiredHunterRank && targetRank >= minTargetRank;
}

function getRetaliationTarget(bot) {
    const attacker = bot.lastDamager;
    if (!attacker || attacker.id === bot.id || !attacker.isAlive) return null;
    if ((attacker.world || 'main') !== (bot.world || 'main')) return null;

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
        if (!p || !p.isAlive || p.isBot || p.hasShield || (p.world || 'main') !== 'main') continue;
        aliveRealPlayers.push(p);
        realIds.add(p.id);
    }
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

function buildWorldObjectBuckets() {
    const buckets = new Map();
    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj) continue;
        const world = obj.world || 'main';
        let bucket = buckets.get(world);
        if (!bucket) {
            bucket = { all: [], coins: [], chests: [] };
            buckets.set(world, bucket);
        }
        bucket.all.push(obj);
        if (isCoinObjectType(obj.type)) bucket.coins.push(obj);
        if (isChestObjectType(obj.type)) bucket.chests.push(obj);
    }
    return buckets;
}

function buildWorldMobBuckets() {
    const buckets = new Map();
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.hp <= 0) continue;
        const world = mob.world || 'main';
        let bucket = buckets.get(world);
        if (!bucket) {
            bucket = { polarBears: [] };
            buckets.set(world, bucket);
        }
        if (mob.type === POLAR_BEAR_MOB_TYPE) bucket.polarBears.push(mob);
    }
    return buckets;
}

function getHunterTarget(bot) {
    if (!bot || !bot.isBot || getBotRole(bot) !== BOT_ROLE_PRO) return null;
    const targetId = bot._botHunterTargetId || 0;
    if (!targetId) return null;
    const target = ENTITIES.PLAYERS[targetId];
    const validTarget =
        !!target &&
        target.isAlive &&
        !target.isBot &&
        !target.hasShield &&
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
    const bestSword = getBestSwordRank(bot);
    const nextSword = Math.min(maxSwordRank, bestSword + 1);
    const nextSwordCfg = dataMap.SHOP_ITEMS.find(item => item.id === nextSword);
    if (BOT_DEBUG_SHOP) {
        const nextPrice = nextSwordCfg?.price ?? 'n/a';
        console.log(`[BOT ${bot.id}] sword-check best=${bestSword} next=${nextSword} nextPrice=${nextPrice} coins=${coins}`);
    }
    if (!nextSwordCfg || nextSword <= bestSword) return false;
    if (coins < nextSwordCfg.price) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] sword-skip reason=insufficient_coins coins=${coins} needed=${nextSwordCfg.price}`);
        }
        return false;
    }

    // First try normal shop flow.
    bot.buyItem(nextSword);
    if (getBestSwordRank(bot) > bestSword) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] sword-buy success method=buyItem rank=${nextSword}`);
        }
        return true;
    }
    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] sword-buy fallback reason=buyItem_no_effect`);
    }

    let targetSlot = bot.inventory.indexOf(0);
    if (targetSlot === -1) {
        // No empty slot: replace the weakest sword slot if possible.
        let weakestSlot = -1;
        let weakestRank = Infinity;
        for (let i = 0; i < bot.inventory.length; i++) {
            if (bot.inventoryCounts[i] <= 0) continue;
            const rank = bot.inventory[i] & 0x7F;
            if (!isSwordRank(rank)) continue;
            if (rank < weakestRank) {
                weakestRank = rank;
                weakestSlot = i;
            }
        }
        if (weakestSlot !== -1 && weakestRank < nextSword) {
            targetSlot = weakestSlot;
        }
    }

    if (targetSlot === -1) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] sword-skip reason=no_slot_for_upgrade`);
        }
        return false;
    }
    if (bot.getTotalCoins() < nextSwordCfg.price) {
        if (BOT_DEBUG_SHOP) {
            console.log(`[BOT ${bot.id}] sword-skip reason=coins_spent_before_fallback coins=${bot.getTotalCoins()} needed=${nextSwordCfg.price}`);
        }
        return false;
    }
    bot.deductCoins(nextSwordCfg.price);
    bot.inventory[targetSlot] = nextSword;
    bot.inventoryCounts[targetSlot] = 1;
    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] sword-buy success method=fallback_replace slot=${targetSlot} rank=${nextSword}`);
    }
    return true;
}

function tryBotShopUpgrade(bot, now = performance.now()) {
    if (now < (bot._botNextShopCheckAt || 0)) return;
    bot._botNextShopCheckAt = now + randomRangeInt(BOT_SHOP_CHECK_MIN_MS, BOT_SHOP_CHECK_MAX_MS);

    const coins = bot.getTotalCoins();
    if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] shop-tick coins=${coins} selectedSlot=${bot.selectedSlot} selectedRank=${(bot.inventory[bot.selectedSlot] || 0) & 0x7F} best=${getBestSwordRank(bot)}`);
    }
    const boughtSword = tryBotBuyNextSwordUpgrade(bot, getBotSwordCap(bot));
    if (boughtSword) {
        equipBestSword(bot);
        bot.sendInventoryUpdate();
        bot.sendStatsUpdate();
        return;
    }

    const canConsiderAccessory =
        !bot._botBoughtAccessoryThisLife &&
        BUYABLE_ACCESSORY_IDS.length > 0 &&
        getBestSwordRank(bot) >= 2;
    let affordableAccessoryIds = [];
    if (canConsiderAccessory) {
        affordableAccessoryIds = BUYABLE_ACCESSORY_IDS.filter(id => {
            const key = ACCESSORY_KEYS[id];
            const price = dataMap.ACCESSORY_PRICES?.[key] || dataMap.ACCESSORY_PRICE || 30;
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
                const price = dataMap.ACCESSORY_PRICES?.[key] || dataMap.ACCESSORY_PRICE || 30;
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
    } else if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] shop-no-purchase coins=${coins} best=${getBestSwordRank(bot)} canBuyAccessory=${canBuyAccessory}`);
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

function ensureBotAlwaysArmed(bot, now = performance.now()) {
    let bestSwordSlot = -1;
    let bestSwordRank = 0;

    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const raw = bot.inventory[i];
        const rank = raw & 0x7F;
        if (!isSwordRank(rank)) continue;

        // Recover from a stuck ghosted throw state.
        if (raw >= 128 && now - (bot.lastThrowSwordTime || 0) > (bot.throwSwordCoolDownTime || 1500) + 250) {
            bot.inventory[i] = rank;
        }

        if (rank > bestSwordRank) {
            bestSwordRank = rank;
            bestSwordSlot = i;
        }
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
    const shouldUpgradeSelection = isSwordRank(selectedRank) && bestSwordRank > selectedRank;
    if (!isSwordRank(selectedRank) || bot.inventoryCounts[bot.selectedSlot] <= 0 || shouldUpgradeSelection) {
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

function maybeEquipAccessoryFromInventory(bot) {
    if ((bot.accessoryId || 0) > 0 || (bot.equippedAccessoryItemType || 0) > 0) return false;
    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const type = bot.inventory[i] & 0x7F;
        if (!isAccessoryItemType(type)) continue;
        bot.equipAccessoryFromItemType(type, i);
        return true;
    }
    return false;
}

function maintainBotInventory(bot, now = performance.now()) {
    if (now < (bot._botNextInventoryMaintenanceAt || 0)) return;
    bot._botNextInventoryMaintenanceAt = now + 900 + Math.floor(Math.random() * 700);

    maybeEquipAccessoryFromInventory(bot);

    const role = getBotRole(bot);
    const full = isInventoryFull(bot);
    const bestSword = getBestSwordRank(bot);
    const hasAccessoryEquipped = hasEquippedAccessory(bot);

    if (full && (role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL)) {
        tryBotConvertCoinsToXp(bot);
    }

    const dropSlots = [];
    const sellSlots = [];

    for (let i = 0; i < bot.inventory.length; i++) {
        if (bot.inventoryCounts[i] <= 0) continue;
        const type = bot.inventory[i] & 0x7F;
        if (type <= 0) continue;

        if (isAccessoryItemType(type)) {
            // Extra accessories are useless once one is equipped.
            if (hasAccessoryEquipped) {
                if (full || role !== BOT_ROLE_PRO) {
                    dropSlots.push(i);
                }
            }
            continue;
        }

        if (!isSwordRank(type)) continue;
        const isWorseSword = type < bestSword;
        if (!isWorseSword) continue;

        if (full) {
            dropSlots.push(i);
            continue;
        }

        if (role === BOT_ROLE_PRO) {
            sellSlots.push(i);
            continue;
        }

        if (role === BOT_ROLE_CASUAL) {
            if (type <= 3) dropSlots.push(i);
            continue;
        }

        // Noob: drop useless swords.
        dropSlots.push(i);
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

    if (dropSlots.length) {
        dropSlots.sort((a, b) => b - a);
        for (const slot of dropSlots) {
            if (bot.inventoryCounts[slot] > 0) {
                bot.dropItemFromSlot(slot);
            }
        }
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

function findNearestDesiredLoot(bot, maxRange) {
    return findNearestDesiredLootFromObjects(bot, maxRange, null);
}

function findNearestDesiredLootFromObjects(bot, maxRange, worldObjects = null) {
    const maxRangeSq = maxRange * maxRange;
    const bestSword = getBestSwordRank(bot);
    const hasAccessoryEquipped = (bot.accessoryId || 0) > 0 || (bot.equippedAccessoryItemType || 0) > 0;
    const world = bot.world || 'main';
    const objects = Array.isArray(worldObjects) ? worldObjects : Object.values(ENTITIES.OBJECTS);

    let bestTarget = null;
    let bestDistSq = Infinity;
    let bestKind = 99; // lower is better (0 sword upgrade, 1 accessory)

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj) continue;
        if ((obj.world || 'main') !== world) continue;

        const rawType = obj.type & 0x7F;
        let kind = -1;
        if (isSwordRank(rawType) && rawType > bestSword) {
            kind = 0;
        } else if (isAccessoryItemType(rawType) && !hasAccessoryEquipped) {
            kind = 1;
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

function findNearestHumanPlayer(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive || p.isBot) continue;
        if ((p.world || 'main') !== (bot.world || 'main')) continue;

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

function findNearestCombatPlayer(bot, maxRange, options = {}) {
    const realOnly = !!options.realOnly;
    const targetFilter = typeof options.targetFilter === 'function' ? options.targetFilter : null;
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive || p.id === bot.id) continue;
        if (realOnly && p.isBot) continue;
        if ((p.world || 'main') !== (bot.world || 'main')) continue;
        if (shouldIgnoreCombatBetween(bot, p)) continue;
        if (isBotTargetTemporarilyIgnored(bot, p)) continue;
        if (targetFilter && !targetFilter(p)) continue;

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

function findNearestCoin(bot, maxRange, excludedIds = null) {
    return findNearestCoinFromObjects(bot, maxRange, excludedIds, null);
}

function findNearestCoinFromObjects(bot, maxRange, excludedIds = null, coinObjects = null) {
    if (!canBotStoreMoreCoins(bot)) return null;
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const now = performance.now();
    const world = bot.world || 'main';
    const objects = Array.isArray(coinObjects) ? coinObjects : Object.values(ENTITIES.OBJECTS);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj || !isCoinObjectType(obj.type)) continue;
        if (excludedIds && excludedIds.has(obj.id)) continue;
        if ((obj.world || 'main') !== world) continue;
        if (obj.collectorId) continue;
        if ((obj.teleportTicks || 0) > 0) continue;
        if (now - (obj.spawnTime || 0) < 220) continue;

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

function findNearestBetterSwordLoot(bot, maxRange) {
    return findNearestBetterSwordLootFromObjects(bot, maxRange, null);
}

function findNearestBetterSwordLootFromObjects(bot, maxRange, worldObjects = null) {
    const maxRangeSq = maxRange * maxRange;
    const currentBest = getBestSwordRank(bot);
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const world = bot.world || 'main';
    const objects = Array.isArray(worldObjects) ? worldObjects : Object.values(ENTITIES.OBJECTS);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj) continue;
        if ((obj.world || 'main') !== world) continue;
        const rank = obj.type & 0x7F;
        if (!isSwordRank(rank) || rank <= currentBest) continue;

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

function findNearestChest(bot, maxRange, excludedIds = null) {
    return findNearestChestFromObjects(bot, maxRange, excludedIds, null);
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

function findNearestMob(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.hp <= 0) continue;
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

function findNearestAggroHostileMob(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;
    const bestSword = getBestSwordRank(bot);

    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.hp <= 0) continue;
        if ((mob.world || 'main') !== (bot.world || 'main')) continue;
        if (mob.type === MINOTAUR_MOB_TYPE && bestSword < 6) continue;

        const cfg = dataMap.MOBS[mob.type] || {};
        const isNeutral = !!cfg.isNeutral;
        const isAggro = !!mob.isAlarmed || (mob.target && mob.target.id === bot.id);
        const isHostileMinotaur = mob.type === MINOTAUR_MOB_TYPE;
        const shouldFight = isHostileMinotaur || (!isNeutral && isAggro) || (isNeutral && isAggro);
        if (!shouldFight) continue;

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

function findNearestMinotaur(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

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

function findNearestOtherBot(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.PLAYERS) {
        const other = ENTITIES.PLAYERS[id];
        if (!other || !other.isAlive || !other.isBot || other.id === bot.id) continue;
        if ((other.world || 'main') !== (bot.world || 'main')) continue;

        const dx = other.x - bot.x;
        const dy = other.y - bot.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxRangeSq && distSq < nearestDistSq) {
            nearest = other;
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

function moveAtDistance(bot, targetX, targetY, distSq, desiredDist = 40) {
    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const dist = Math.sqrt(Math.max(1, distSq));
    bot.angle = Math.atan2(dy, dx);

    const nx = dx / dist;
    const ny = dy / dist;
    let radial = 0;
    if (dist > desiredDist + 8) radial = 1;
    else if (dist < desiredDist - 8) radial = -1;

    const vx = nx * radial;
    const vy = ny * radial;
    const axisDeadzone = 0.12;
    bot.keys.a = vx < -axisDeadzone ? 1 : 0;
    bot.keys.d = vx > axisDeadzone ? 1 : 0;
    bot.keys.w = vy < -axisDeadzone ? 1 : 0;
    bot.keys.s = vy > axisDeadzone ? 1 : 0;
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
    return isSwordRank(rank) ? rank : 1;
}

function getSwordReach(entity) {
    const rank = getEquippedSwordRank(entity);
    return dataMap.PROJECTILES[rank]?.maxDistance || BOT_ATTACK_RANGE;
}

function getCombatDistanceSq(bot, target) {
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    return (dx * dx) + (dy * dy);
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
    moveAroundCombatTarget(bot, target.x, target.y, distSq, now);
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

    if (isOutranged && inNormalAttackRange) {
        bot.attacking = 0;
        return;
    }

    bot.attacking = inNormalAttackRange ? 1 : 0;
}

function tryThrowAtTarget(bot, distSq, now, minRange, maxRange) {
    const minSq = minRange * minRange;
    const maxSq = maxRange * maxRange;
    if (distSq < minSq || distSq > maxSq) return;
    if (now < (bot._botNextThrowAt || 0)) return;

    const role = getBotRole(bot);
    if (role === BOT_ROLE_NOOB) {
        if (Math.random() < 0.35) {
            bot.throwSword();
            bot._botNextThrowAt = now + 1500 + Math.floor(Math.random() * 2400);
        } else {
            bot._botNextThrowAt = now + 500 + Math.floor(Math.random() * 900);
        }
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

function tryUseBotAbility(bot, target, distSq, now = performance.now(), meleeRange = BOT_ATTACK_RANGE) {
    if (!bot?.isAlive || !target || !Number.isFinite(distSq)) return false;
    const ability = (bot.activeAbility || '').toLowerCase();
    if (!ability) return false;

    const cooldownMs = Math.max(0, bot.abilityCooldownMs || 0);
    if (cooldownMs > 0 && now - (bot.lastAbilityUseTime || 0) < cooldownMs) return false;

    let inRange = false;
    if (ability === 'stamina_boost' || ability === 'speed_boost') {
        inRange = distSq <= (meleeRange * meleeRange);
    } else if (ability === 'poison_blast') {
        inRange = distSq <= (BOT_POISON_AOE_RANGE * BOT_POISON_AOE_RANGE);
    } else if (ability === 'energy_burst') {
        inRange = distSq <= (BOT_ENERGY_BURST_RANGE * BOT_ENERGY_BURST_RANGE);
    } else {
        return false;
    }

    if (!inRange) return false;

    bot.lastAbilityUseTime = now;
    cmdRun.activateAbility(bot.id, ability, target.x, target.y);
    bot.sendStatsUpdate();
    return true;
}

function forceBotBackInBounds(bot) {
    const radius = Math.max(5, bot.radius || 30);
    const minX = radius + BOT_EDGE_PUSH_BUFFER;
    const maxX = MAP_SIZE[0] - radius - BOT_EDGE_PUSH_BUFFER;
    const minY = radius + BOT_EDGE_PUSH_BUFFER;
    const maxY = MAP_SIZE[1] - radius - BOT_EDGE_PUSH_BUFFER;

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
    bot.username = getUniqueBotUsername(bot.id);
    bot.world = 'main';
    bot.isAlive = true;
    bot.attacking = 0;
    bot.chatMessage = '';
    bot.accessoryId = 0;
    bot.equippedAccessoryItemType = 0;

    // Keep only the default bone sword.
    bot.inventory = new Array(35).fill(0);
    bot.inventoryCounts = new Array(35).fill(0);
    bot.inventory[0] = 1;
    bot.inventoryCounts[0] = 1;
    bot.selectedSlot = 0;
    bot.manuallyUnequippedWeapon = false;

    bot.keys = { w: 0, a: 0, s: 0, d: 0 };
    bot._botNextMoveAt = 0;
    bot._botNextLookAt = 0;
    bot._botNextThrowAt = 0;
    bot._botNextDecisionAt = 0;
    bot._botNextBuffUpgradeAt = 0;
    bot._botHunterTargetId = role === BOT_ROLE_PRO ? (bot._botHunterTargetId || 0) : 0;
    bot._botAssistTargetId = 0;
    bot.lastX = bot.x;
    bot.lastY = bot.y;
    resetBotLifeTimers(bot);
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
    bot.username = getUniqueBotUsername(bot.id);
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

    bot.inventory = new Array(35).fill(0);
    bot.inventoryCounts = new Array(35).fill(0);
    bot.inventory[0] = 1;
    bot.inventoryCounts[0] = 1;
    bot.selectedSlot = 0;
    resetBotLifeTimers(bot);
}

export function spawnBotPlayers(count = DEFAULT_BOT_COUNT) {
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
    for (const p of realPlayers) {
        if (!p || p.isBot) continue;
        if ((p.world || 'main') !== world) continue;
        const dx = p.x - bot.x;
        const dy = p.y - bot.y;
        if ((dx * dx + dy * dy) <= rangeSq) return true;
    }
    return false;
}

export function processOffscreenBot(bot, now = performance.now(), objectBuckets = null, mobBuckets = null) {
    if (!bot || !bot.isBot || !bot.isAlive) return;
    bot.lastX = bot.x;
    bot.lastY = bot.y;
    bot.attacking = 0;
    bot._botHasLockedTarget = false;
    const role = getBotRole(bot);
    const pickupObjects = objectBuckets?.pickups || null;

    const speed = (bot.defaultSpeed || bot.speed || 17) * 0.7;
    const primitiveMoveToward = (tx, ty) => {
        const dx = tx - bot.x;
        const dy = ty - bot.y;
        bot.angle = Math.atan2(dy, dx);
        bot.x += Math.cos(bot.angle) * speed;
        bot.y += Math.sin(bot.angle) * speed;
    };

    const polarThreat = findNearestPolarBear(bot, BOT_POLAR_BEAR_AVOID_RANGE, mobBuckets?.polarBears || null);
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
    if (bot.x < margin || bot.x > (MAP_SIZE[0] - margin)) {
        bot._botPrimitiveAngle = Math.PI - (bot._botPrimitiveAngle || 0);
    }
    if (bot.y < margin || bot.y > (MAP_SIZE[1] - margin)) {
        bot._botPrimitiveAngle = -(bot._botPrimitiveAngle || 0);
    }

    bot.x = Math.max(0, Math.min(MAP_SIZE[0], bot.x));
    bot.y = Math.max(0, Math.min(MAP_SIZE[1], bot.y));
    bot.angle = bot.angle || bot._botPrimitiveAngle || 0;
}

export function processOffscreenHunterBot(bot, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive) return;

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
        bot.x = Math.max(0, Math.min(MAP_SIZE[0], bot.x));
        bot.y = Math.max(0, Math.min(MAP_SIZE[1], bot.y));
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
        !target.hasShield &&
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
    bot.x = Math.max(0, Math.min(MAP_SIZE[0], bot.x));
    bot.y = Math.max(0, Math.min(MAP_SIZE[1], bot.y));
}

export function updateBotPlayers(now = performance.now()) {
    ensureBotPopulation();
    const tickState = collectBotTickState();
    const { realPlayers, allBots, allMainBots, proMainBots } = tickState;
    const worldObjectBuckets = buildWorldObjectBuckets();
    const worldMobBuckets = buildWorldMobBuckets();
    refreshTeamerAssignments(now, allMainBots);
    refreshHunterAssignments(realPlayers, now, {
        allBots,
        proBots: proMainBots
    });
    const teamCoinReservations = new Map();
    const teamChestReservations = new Map();
    const getTeamReservationSet = (store, group) => {
        if (!store.has(group)) store.set(group, new Set());
        return store.get(group);
    };
    for (const bot of allMainBots) {
        if (!bot) continue;
        const worldId = bot.world || 'main';
        const objectBuckets = worldObjectBuckets.get(worldId) || { all: [], coins: [], chests: [] };
        const mobBuckets = worldMobBuckets.get(worldId) || { polarBears: [] };
        const role = getBotRole(bot);
        const teamGroup = getBotTeamGroup(bot);
        const reservedCoins = teamGroup > 0 ? getTeamReservationSet(teamCoinReservations, teamGroup) : null;
        const reservedChests = teamGroup > 0 ? getTeamReservationSet(teamChestReservations, teamGroup) : null;
        bot._botHasLockedTarget = false;

        if (!bot.isAlive) {
            if (now - (bot.lastDiedTime || 0) >= BOT_RESPAWN_DELAY_MS) {
                respawnBot(bot);
            }
            continue;
        }

        if (now < (bot._botNextDecisionAt || 0)) {
            continue;
        }
        bot._botNextDecisionAt = now + BOT_DECISION_INTERVAL_MS;
        tryBotSpendBuffPoints(bot, now);

        ensureBotAlwaysArmed(bot, now);
        tryBotShopUpgrade(bot, now);
        maintainBotInventory(bot, now);

        const hunterTargetId = bot._botHunterTargetId || 0;
        const hunterTarget = getHunterTarget(bot);
        const assistTargetId = bot._botAssistTargetId || 0;
        const assistTarget = getAssistTarget(bot);
        const nearRealPlayer = isBotNearAnyRealPlayer(bot, realPlayers);
        if (!nearRealPlayer && !hunterTarget && !assistTarget) {
            bot.attacking = 0;
            continue;
        }

        if (!bot._botTargetedRealPlayerThisLife && now - (bot._botBornAt || now) >= (bot._botLifetimeMs || BOT_LIFETIME_MAX_MS)) {
            respawnBot(bot);
            continue;
        }

        const forced = forceBotBackInBounds(bot);
        if (forced) {
            bot.attacking = 0;
            bot._botHasLockedTarget = true;
        } else {
            const polarThreat = findNearestPolarBear(bot, BOT_POLAR_BEAR_AVOID_RANGE, mobBuckets.polarBears);
            if (polarThreat) {
                bot._botHasLockedTarget = true;
                bot.attacking = 0;
                moveAwayFrom(bot, polarThreat.target.x, polarThreat.target.y);
                bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                continue;
            }

            const retaliationTarget = (role === BOT_ROLE_PRO || role === BOT_ROLE_CASUAL)
                ? getRetaliationTarget(bot)
                : null;

            // If this bot is assigned as a hunter, it may only target its assigned real player
            // unless it is currently retaliating against the latest attacker.
            if (hunterTargetId && !hunterTarget && !retaliationTarget) {
                bot.attacking = 0;
                continue;
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
                    targetFilter: (target) => canHunterEngageTarget(bot, target)
                });
            }

            if (playerTarget) {
                if (!playerTarget.player.isBot) bot._botTargetedRealPlayerThisLife = true;
                bot._botHasLockedTarget = true;
                chasePlayer(bot, playerTarget.player, playerTarget.distSq, now);
                tryUseBotAbility(bot, playerTarget.player, playerTarget.distSq, now, BOT_ATTACK_RANGE);
                tryThrowAtTarget(bot, playerTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 120);
            } else if (retaliationTarget?.kind === 'mob') {
                bot._botHasLockedTarget = true;
                moveAroundCombatTarget(bot, retaliationTarget.target.x, retaliationTarget.target.y, retaliationTarget.distSq, now);
                bot.attacking = retaliationTarget.distSq <= (BOT_MOB_ATTACK_RANGE * BOT_MOB_ATTACK_RANGE) ? 1 : 0;
                tryUseBotAbility(bot, retaliationTarget.target, retaliationTarget.distSq, now, BOT_MOB_ATTACK_RANGE);
                tryThrowAtTarget(bot, retaliationTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 120);
            } else {
                // Priority 2: Desired loot (better sword or accessory when unequipped)
                const desiredLootTarget = findNearestDesiredLootFromObjects(bot, BOT_PVE_RANGE, objectBuckets.all);
                if (desiredLootTarget) {
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveToward(bot, desiredLootTarget.target.x, desiredLootTarget.target.y);
                    bot.tryPickup();
                    maybeEquipAccessoryFromInventory(bot);
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                    continue;
                }

                // Priority 2: Chest & Coins
                const coinTarget = findNearestCoinFromObjects(bot, BOT_COIN_RANGE, reservedCoins, objectBuckets.coins);
                const chestTarget = findNearestChestFromObjects(bot, BOT_PVE_RANGE, reservedChests, objectBuckets.chests);
                const pickCoin = coinTarget && (!chestTarget || coinTarget.distSq <= chestTarget.distSq);

                if (pickCoin) {
                    if (reservedCoins) reservedCoins.add(coinTarget.target.id);
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveToward(bot, coinTarget.target.x, coinTarget.target.y);
                    bot.tryPickup();
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 140);
                } else if (chestTarget) {
                    if (reservedChests) reservedChests.add(chestTarget.target.id);
                    bot._botHasLockedTarget = true;
                    moveAroundCombatTarget(bot, chestTarget.target.x, chestTarget.target.y, chestTarget.distSq, now);
                    bot.attacking = chestTarget.distSq <= (BOT_CHEST_ATTACK_RANGE * BOT_CHEST_ATTACK_RANGE) ? 1 : 0;
                    tryUseBotAbility(bot, chestTarget.target, chestTarget.distSq, now, BOT_CHEST_ATTACK_RANGE);
                    tryThrowAtTarget(bot, chestTarget.distSq, now, 260, 900);
                    bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 140);
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
