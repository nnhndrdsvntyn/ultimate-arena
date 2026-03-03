import { ENTITIES, MAP_SIZE } from './game.js';
import { getId } from './helpers.js';
import { dataMap, ACCESSORY_KEYS, accessoryItemTypeFromId, isChestObjectType, isCoinObjectType, isSwordRank } from '../public/shared/datamap.js';

const DEFAULT_BOT_COUNT = 5;
const BOT_RESPAWN_DELAY_MS = 0;
const BOT_EDGE_MARGIN = 250;
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
const MINOTAUR_MOB_TYPE = 6;
const BOT_LIFETIME_MIN_MS = 60 * 1000;
const BOT_LIFETIME_MAX_MS = 3 * 60 * 1000;
const BOT_SHOP_CHECK_MIN_MS = 5 * 1000;
const BOT_SHOP_CHECK_MAX_MS = 5 * 1000;
const BOT_DEBUG_SHOP = false;
const BOT_OFFSCREEN_ACTIVE_RANGE = 1700;
const BOT_USERNAMES = [
    '𝓩ombie🥀',
    'xXVoidSlayerXx',
    'Ƭhunder⚡Boi',
    '꧁FrostByte꧂',
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
    'Br0ther...',
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

function tryBotBuyNextSwordUpgrade(bot) {
    const coins = bot.getTotalCoins();
    const bestSword = getBestSwordRank(bot);
    const nextSword = Math.min(8, bestSword + 1);
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
    const boughtSword = tryBotBuyNextSwordUpgrade(bot);
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
        const accessoryId = affordableAccessoryIds[Math.floor(Math.random() * affordableAccessoryIds.length)];
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

    if (boughtSomething) {
        equipBestSword(bot);
    } else if (BOT_DEBUG_SHOP) {
        console.log(`[BOT ${bot.id}] shop-no-purchase coins=${coins} best=${getBestSwordRank(bot)} canBuyAccessory=${canBuyAccessory}`);
    }
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

function findNearestCombatPlayer(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.PLAYERS) {
        const p = ENTITIES.PLAYERS[id];
        if (!p || !p.isAlive || p.id === bot.id) continue;
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

function findNearestCoin(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj || !isCoinObjectType(obj.type)) continue;
        if ((obj.world || 'main') !== (bot.world || 'main')) continue;
        if (obj.collectorId) continue;

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
    const maxRangeSq = maxRange * maxRange;
    const currentBest = getBestSwordRank(bot);
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj) continue;
        if ((obj.world || 'main') !== (bot.world || 'main')) continue;
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

function findNearestChest(bot, maxRange) {
    const maxRangeSq = maxRange * maxRange;
    let nearest = null;
    let nearestDistSq = maxRangeSq + 1;

    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj || !isChestObjectType(obj.type)) continue;
        if ((obj.world || 'main') !== (bot.world || 'main')) continue;

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

function chasePlayer(bot, target, distSq, now = performance.now()) {
    moveAroundCombatTarget(bot, target.x, target.y, distSq, now);
    const desired = bot._botPreferredCombatDist || 45;
    const attackRadius = Math.max(BOT_ATTACK_RANGE, desired + 16);
    bot.attacking = distSq <= (attackRadius * attackRadius) ? 1 : 0;
}

function tryThrowAtTarget(bot, distSq, now, minRange, maxRange) {
    const minSq = minRange * minRange;
    const maxSq = maxRange * maxRange;
    if (distSq < minSq || distSq > maxSq) return;
    if (now < (bot._botNextThrowAt || 0)) return;
    bot.throwSword();
    bot._botNextThrowAt = now + 900 + Math.floor(Math.random() * 1300);
}

function forceBotBackInBounds(bot) {
    if (bot.x < BOT_EDGE_MARGIN) {
        applyMovePattern(bot, { w: 0, a: 0, s: 0, d: 1 });
        bot.angle = 0;
        return true;
    }
    if (bot.x > MAP_SIZE[0] - BOT_EDGE_MARGIN) {
        applyMovePattern(bot, { w: 0, a: 1, s: 0, d: 0 });
        bot.angle = Math.PI;
        return true;
    }
    if (bot.y < BOT_EDGE_MARGIN) {
        applyMovePattern(bot, { w: 0, a: 0, s: 1, d: 0 });
        bot.angle = Math.PI / 2;
        return true;
    }
    if (bot.y > MAP_SIZE[1] - BOT_EDGE_MARGIN) {
        applyMovePattern(bot, { w: 1, a: 0, s: 0, d: 0 });
        bot.angle = -Math.PI / 2;
        return true;
    }
    return false;
}

function configureBotPlayer(bot) {
    bot.isBot = true;
    bot.username = getRandomBotUsername();
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
    const pos = randomMainSpawn();
    bot.x = pos.x;
    bot.y = pos.y;
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
    bot.username = getRandomBotUsername();
    bot.isAlive = true;
    bot.lastDiedTime = 0;
    bot.attacking = 0;
    bot.keys = { w: 0, a: 0, s: 0, d: 0 };
    bot._botNextMoveAt = 0;
    bot._botNextLookAt = 0;
    bot._botNextThrowAt = 0;

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

export function processOffscreenBot(bot, now = performance.now()) {
    if (!bot || !bot.isBot || !bot.isAlive) return;
    bot.attacking = 0;
    bot._botHasLockedTarget = false;

    const speed = (bot.defaultSpeed || bot.speed || 17) * 0.7;
    const primitiveMoveToward = (tx, ty) => {
        const dx = tx - bot.x;
        const dy = ty - bot.y;
        bot.angle = Math.atan2(dy, dx);
        bot.x += Math.cos(bot.angle) * speed;
        bot.y += Math.sin(bot.angle) * speed;
    };

    const coinTarget = findNearestCoin(bot, 1500);
    if (coinTarget) {
        bot.attacking = 0;
        primitiveMoveToward(coinTarget.target.x, coinTarget.target.y);
        bot.tryPickup();
    } else {
        const chestTarget = findNearestChest(bot, 1900);
        if (chestTarget) {
            primitiveMoveToward(chestTarget.target.x, chestTarget.target.y);
            bot.attacking = 1;
            bot.tryPickup();

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

    const margin = 140;
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

export function updateBotPlayers(now = performance.now()) {
    ensureBotPopulation();
    const realPlayers = Object.values(ENTITIES.PLAYERS).filter(p => p && !p.isBot);
    for (const id in ENTITIES.PLAYERS) {
        const bot = ENTITIES.PLAYERS[id];
        if (!bot || !bot.isBot) continue;
        if ((bot.world || 'main') !== 'main') continue;
        bot._botHasLockedTarget = false;

        if (!bot.isAlive) {
            if (now - (bot.lastDiedTime || 0) >= BOT_RESPAWN_DELAY_MS) {
                respawnBot(bot);
            }
            continue;
        }

        if (!isBotNearAnyRealPlayer(bot, realPlayers)) {
            bot.attacking = 0;
            continue;
        }

        if (!bot._botTargetedRealPlayerThisLife && now - (bot._botBornAt || now) >= (bot._botLifetimeMs || BOT_LIFETIME_MAX_MS)) {
            respawnBot(bot);
            continue;
        }

        ensureBotAlwaysArmed(bot, now);
        tryBotShopUpgrade(bot, now);

        const forced = forceBotBackInBounds(bot);
        if (forced) {
            bot.attacking = 0;
            bot._botHasLockedTarget = true;
        } else {
            // Priority 1: Bot & Real Player
            const playerTarget = findNearestCombatPlayer(bot, BOT_AGGRO_RANGE);
            if (playerTarget) {
                if (!playerTarget.player.isBot) {
                    bot._botTargetedRealPlayerThisLife = true;
                }
                bot._botHasLockedTarget = true;
                chasePlayer(bot, playerTarget.player, playerTarget.distSq, now);
                tryThrowAtTarget(bot, playerTarget.distSq, now, BOT_THROW_RANGE_MIN, BOT_THROW_RANGE_MAX);
                bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 120);
            } else {
                // Priority 2: Aggro hostile mob
                const hostileMobTarget = findNearestAggroHostileMob(bot, BOT_PVE_RANGE);
                if (hostileMobTarget) {
                    bot._botHasLockedTarget = true;
                    moveAroundCombatTarget(bot, hostileMobTarget.target.x, hostileMobTarget.target.y, hostileMobTarget.distSq, now);
                    const desired = bot._botPreferredCombatDist || 45;
                    const attackRadius = Math.max(BOT_MOB_ATTACK_RANGE, desired + 16);
                    bot.attacking = hostileMobTarget.distSq <= (attackRadius * attackRadius) ? 1 : 0;
                    tryThrowAtTarget(bot, hostileMobTarget.distSq, now, 230, 900);
                    bot._botNextMoveAt = now + 90 + Math.floor(Math.random() * 140);
                    continue;
                }

                // Priority 3: Chest & Coins
                const swordLootTarget = findNearestBetterSwordLoot(bot, BOT_PVE_RANGE);
                if (swordLootTarget) {
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveAroundCombatTarget(bot, swordLootTarget.target.x, swordLootTarget.target.y, swordLootTarget.distSq, now);
                    bot.tryPickup();
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 120);
                    continue;
                }

                const coinTarget = findNearestCoin(bot, BOT_COIN_RANGE);
                const chestTarget = findNearestChest(bot, BOT_PVE_RANGE);
                const pickCoin = coinTarget && (!chestTarget || coinTarget.distSq <= chestTarget.distSq);

                if (pickCoin) {
                    bot._botHasLockedTarget = true;
                    bot.attacking = 0;
                    moveToward(bot, coinTarget.target.x, coinTarget.target.y);
                    bot.tryPickup();
                    bot._botNextMoveAt = now + 80 + Math.floor(Math.random() * 140);
                } else if (chestTarget) {
                    bot._botHasLockedTarget = true;
                    moveAroundCombatTarget(bot, chestTarget.target.x, chestTarget.target.y, chestTarget.distSq, now);
                    bot.attacking = chestTarget.distSq <= (BOT_CHEST_ATTACK_RANGE * BOT_CHEST_ATTACK_RANGE) ? 1 : 0;
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
