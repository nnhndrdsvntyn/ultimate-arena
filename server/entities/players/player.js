import {
    ENTITIES
} from '../../game.js';
import {
    dataMap,
    isWeaponRank,
    isWeaponTypeStronger,
    isSpearRank,
    isCoinObjectType,
    isChestObjectType,
    getCoinObjectType,
    getChestObjectTypes,
    isAccessoryItemType,
    accessoryIdFromItemType,
    accessoryItemTypeFromId,
    isAccessoryId,
    ACCESSORY_KEYS,
    DEFAULT_VIEW_RANGE_MULT,
    getLevelFromXp,
    getXpShopItemConfig,
    getWeaponSize,
    getWeaponOffset,
    getWeaponRenderTuning,
    getWeaponSwingStepCount,
    isSpearForwardSwingState,
    getSpearThrustProgress,
    getWeaponShopPrice,
    getWeaponSellPrice,
    getWeaponOrder,
    getWeaponAttackStats,
    getWeaponProjectileType,
    getWeaponMeta,
    isBoomerangType
} from '../../../public/shared/datamap.js';
import {
    wss,
    wsById
} from '../../../server.js';
import {
    playSfx,
    colliding,
    getId,
    PacketWriter,
    poison,
    pushEntityOutOfSafeZone,
    getSafeZoneStructure,
    getWorldEnvironmentData,
    emitDamageIndicatorFx,
    clearWorldCaches
} from '../../helpers.js';
import { recordResolveCollisionCall } from '../../debug.js';
import {
    Entity
} from '../entity.js';
import {
    MAP_SIZE,
    buildInitPacket,
    spawnObject,
    deleteWorldState
} from '../../game.js';
import { isPointInRiver, getRiverBoundsAtY, getRiverBoundsAtX } from '../../../public/shared/river.js';
import { getWorldCenter, getWorldMapSize, worldHasRivers } from '../../../public/shared/worlds.js';
import { WORLD_MAIN } from '../../../public/shared/worlds.js';
import { observePlayerLeaderboardScore } from '../../leaderboards.js';

const TUTORIAL_PACKET_OBJECTIVE = 26;
const TUTORIAL_PACKET_COMPLETE = 27;
const PACKET_COLLISION_DEBUG = 40;
const COLLISION_DEBUG_NONE = 0;
const COLLISION_DEBUG_PLAYER = 1;
const COLLISION_DEBUG_MOB = 2;
const COLLISION_DEBUG_PROJECTILE = 3;
const COLLISION_DEBUG_STRUCTURE = 4;
const COLLISION_DEBUG_OBJECT = 5;
const DROP_OWNER_PICKUP_LOCK_MS = 700;
const DROP_INITIAL_PUSH = 18;
const DROP_FINAL_PUSH = 90;
const DROP_TRAVEL_TICKS = 4;
const BUFF_STAGE_MAX = 15;
const BUFF_POINTS_PER_LEVEL_UP = 1;
const STRENGTH_BUFF_PER_STAGE = 2;
const MAX_HP_BUFF_PER_STAGE = 20;
const REGEN_BUFF_PER_STAGE = 1;
const BASE_REGEN_AMOUNT = 5;
const DIAGONAL_MOVE_SCALE = Math.SQRT1_2 * 1.1;
const BOOMERANG_THROW_MOVE_STUN_MS = 500;
const PICKUP_DELAY_MS = 200;
const TUTORIAL_MOVEMENT_HOLD_MS = 2000;
const PVP_PROTECTION_SCORE = 1000; // players below this score cannot deal or receive PvP damage
const TUTORIAL_MOVEMENT_SEQUENCE = [
    { key: 'w', label: 'W', direction: 'NORTH' },
    { key: 'a', label: 'A', direction: 'WEST' },
    { key: 's', label: 'S', direction: 'SOUTH' },
    { key: 'd', label: 'D', direction: 'EAST' }
];
const TUTORIAL_STEP_TEXT = [
    'Hold the "W" key on your keyboard for 2 seconds (your player will move NORTH)',
    'Attack by holding down space or your left mouse button.',
    `Throw your weapon by pressing the "E" key on your keyboard.`,
    'Attack and break this chest.',
    'Pick up the dropped coins by touching them.',
    'Open the shop and buy sword1.',
    "Equip sword1 by clicking its slot or pressing the number of the slot on your keyboard. (1-5)",
    'Eliminate the pig!',
    'Good job! Tutorial complete.'
];
const DEFAULT_PLAYER_SKIN = 2;
const ENTITY_KEY_MOB = 2 << 20;

function getTutorialMovementText(index = 0) {
    const step = TUTORIAL_MOVEMENT_SEQUENCE[index] || TUTORIAL_MOVEMENT_SEQUENCE[0];
    return `Hold the "${step.label}" key on your keyboard for 2 seconds (your player will move ${step.direction})`;
}

function markBotKillTargetCooldown(bot, targetId, now = performance.now()) {
    if (!bot?.isBot || (bot._botRole !== 'pro' && bot._botRole !== 'casual')) return;
    const safeTargetId = Number(targetId) | 0;
    if (safeTargetId <= 0) return;
    if (!bot._botKillTargetCooldowns) bot._botKillTargetCooldowns = new Map();
    bot._botKillTargetCooldowns.set(safeTargetId, now + (3 * 60 * 1000));
}

function pointToSegmentDistanceSq(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const lenSq = (vx * vx) + (vy * vy);
    if (lenSq <= 0.000001) {
        const dx = px - x1;
        const dy = py - y1;
        return (dx * dx) + (dy * dy);
    }
    const t = Math.max(0, Math.min(1, ((wx * vx) + (wy * vy)) / lenSq));
    const nx = x1 + (vx * t);
    const ny = y1 + (vy * t);
    const dx = px - nx;
    const dy = py - ny;
    return (dx * dx) + (dy * dy);
}

function getInventoryStackLimit(itemType) {
    const baseType = itemType & 0x7F;
    if (isWeaponRank(baseType)) return 256;
    const objectCfg = dataMap.OBJECTS?.[baseType];
    if (objectCfg?.stackable) {
        return Math.max(1, Math.floor(objectCfg.stackLimit || 256));
    }
    return 1;
}

export class Player extends Entity {
    constructor(id, x, y) {
        super(id, x, y, dataMap.PLAYERS.baseRadius, dataMap.PLAYERS.baseMovementSpeed, 100, 100);

        // --- State Variables ---
        this.isAdmin = false;
        this.invincible = false;
        this.angle = 0;
        this.isAlive = true;
        this.hasShield = false;
        this.inWater = false;
        this.isHidden = false;
        this.isInvisible = false;
        this.touchingSafeZone = false;
        this.updateCount = -2;
        this.accessoryId = 0;
        this.equippedAccessoryItemType = 0;
        this.baseViewRangeMult = DEFAULT_VIEW_RANGE_MULT;
        this.viewRangeMult = DEFAULT_VIEW_RANGE_MULT;
        this.viewRangeOverride = null;
        this.blindAppliedAt = 0;
        this.blindUntil = 0;
        this.blindMinMult = 1;
        this.frozenUntil = 0;
        this.boomerangMoveStunnedUntil = 0;
        this.iceEncasedUntil = 0;
        this.knockbackVelocityX = 0;
        this.knockbackVelocityY = 0;
        this.lastKnockbackProcessTime = 0;

        // --- Inventory & Combat ---
        this.inventory = new Array(35).fill(0);
        this.inventoryCounts = new Array(35).fill(0);
        this.inventory[0] = 1;
        this.inventoryCounts[0] = 1;
        this.selectedSlot = 0;
        this.weapon = {
            get rank() { return this.owner.inventory[this.owner.selectedSlot] & 0x7F; },
            owner: this
        };
        this.hasWeapon = true;
        this.manuallyUnequippedWeapon = false;
        this.attacking = false;
        this.swingState = 0;
        this.activeSwingWeaponRank = 0;
        this.activeAttackGroupId = 0;
        this.lastAttackTime = 0;
        this.lastThrowSwordTime = 0;

        // --- Attributes & Buffs ---
        this.defaultSpeed = dataMap.PLAYERS.baseMovementSpeed;
        this.speed = this.defaultSpeed;
        this.baseStrength = dataMap.PLAYERS.baseStrength;
        this.baseMaxHp = dataMap.PLAYERS.maxHealth;
        this.strength = this.baseStrength;
        this.maxHp = this.baseMaxHp;
        this.hp = this.maxHp;
        this.score = 0;
        this.level = 1;
        this.killCount = 0;
        this.sessionPlayerKills = 0;
        this.sessionDeaths = 0;
        this.goldCoins = 0;
        this.buffLevels = { strength: 0, maxHealth: 0, regenSpeed: 0 };
        this.lastStatsSpeed = Math.round(this.speed);
        this.vikingHitCount = 0;
        this.lastVikingHitTime = 0;
        this._cachedAccessoryState = null;
        this.growthSpurtUntil = 0;
        this.growthSpurtOriginalRadius = null;
        this.progressShieldActive = false;
        this.damageDebuffMult = 1;

        // --- Timers & Cooldowns ---
        this.lastDamagedTime = 0;
        this.lastDamager = null;
        this.lastHealedTime = 0;
        this.lastDiedTime = 0;
        this.lastChatTime = 0;
        this.lastProcessTime = 0;
        this.lastCombatTime = -Infinity;
        this.wasInCombat = false;

        this.attackCooldownTime = dataMap.PLAYERS.baseAttackCooldown;
        this.throwSwordCoolDownTime = dataMap.PLAYERS.baseThrowSwordCooldown;
        this.activeAbility = '';
        this.abilityCooldownMs = 0;
        this.lastAbilityUseTime = 0;
        this.staminaBoostUntil = 0;
        this.minotaurSpeedBoostUntil = 0;
        this.minotaurSpeedBoostMult = 1;
        this.pendingWeaponReturnTimer = null;
        this.lastSwingAnimStepTime = 0;
        this.tutorial = null;
        this.heartShadesBoostUntil = 0;
        this._delayedMainWorldSwitchTimer = null;

        // --- Social & Movement ---
        this.username = '';
        this.accountUsername = '';
        this.chatMessage = '';
        this.color = DEFAULT_PLAYER_SKIN;
        this.keys = { w: 0, a: 0, s: 0, d: 0 };
        this.sessionBestScore = 0;
        this.sessionStartedAt = Date.now();
        this.sessionLeaderboardKey = `player:${id}:${this.sessionStartedAt}`;
        this._latestCollisionDebugType = COLLISION_DEBUG_NONE;
        this._latestCollisionDebugId = 0;

        ENTITIES.PLAYERS[id] = this;

        // Sync initial state
        setTimeout(() => {
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }, 100);
    }

    recordLatestCollisionDebug(type, id) {
        const safeType = Math.max(0, Math.min(255, Math.floor(Number(type) || 0)));
        const safeId = Math.max(0, Math.floor(Number(id) || 0));
        if (safeType === this._latestCollisionDebugType && safeId === this._latestCollisionDebugId) return;
        this._latestCollisionDebugType = safeType;
        this._latestCollisionDebugId = safeId;
        this.sendCollisionDebugPacket();
    }

    sendCollisionDebugPacket() {
        const ws = wsById.get(this.id);
        if (!ws || ws.readyState !== 1) return;
        const pw = new PacketWriter(8);
        pw.writeU8(PACKET_COLLISION_DEBUG);
        pw.writeU8(this._latestCollisionDebugType || COLLISION_DEBUG_NONE);
        pw.writeU32(this._latestCollisionDebugId || 0);
        ws.send(pw.getBuffer());
    }

    // --- Core Logic ---

    process(worldPlayers = null, worldMobs = null, worldCoins = null, worldStructures = null) {
        const now = performance.now();
        this.move(now);
        this.resolveCollisions(worldPlayers, worldMobs, worldStructures, now);
        this.clamp();
        this.updateEnvironment(now, worldStructures);
        this.updateProgressShield();
        this.updateEquippedState(now);
        this.applyAccessoryEffects(now);
        this.updateAnimations(now);
        this.syncSpeedStat();
        this.heal(now);
        this.attack(now);
        this.updateChat(now);
        this.handleAutoPickup(now, worldCoins);
        this.processTutorial(now);
        this.updateGrowthSpurt(now);

        this.updateCombatState(now);
    }

    updateCombatState(now) {
        // Dead players should never remain flagged as "in combat".
        if (!this.isAlive) {
            this.lastCombatTime = -Infinity;
        }
        const currentlyInCombat = now - this.lastCombatTime < 10000;
        if (this.wasInCombat !== currentlyInCombat) {
            this.sendStatsUpdate();
        }
        this.wasInCombat = currentlyInCombat;
    }

    isTutorialWorld() {
        return (this.world || '').startsWith('tutorial');
    }

    isFrozen(now = performance.now()) {
        return now < (this.frozenUntil || 0);
    }

    isMovementLocked(now = performance.now()) {
        return this.isFrozen(now) || now < (this.boomerangMoveStunnedUntil || 0);
    }

    canDropItems() {
        return !this.isTutorialWorld();
    }

    ensureTutorialState() {
        if (!this.isTutorialWorld()) return;
        if (this.tutorial) return;
        this.tutorial = {
            stage: 0,
            lastAttackTimeSeen: 0,
            lastThrowTimeSeen: 0,
            originX: this.x,
            originY: this.y,
            desktopMovementSequenceEnabled: false,
            movementHoldIndex: 0,
            movementHoldStartedAt: 0,
            chestId: null,
            pigId: null,
            pigSpawned: false,
            stage7StartedAt: 0,
            shopClosedAfterBuy: false,
            finished: false
        };
        this.sendTutorialObjective(TUTORIAL_STEP_TEXT[0], 0);
    }

    sendTutorialObjective(text, status = 0, step = this.tutorial?.stage ?? 0) {
        const ws = wsById.get(this.id);
        if (!ws) return;
        ws.packetWriter.reset();
        ws.packetWriter.writeU8(TUTORIAL_PACKET_OBJECTIVE);
        ws.packetWriter.writeU8(status);
        ws.packetWriter.writeU8(step);
        ws.packetWriter.writeStr(text || '');
        ws.send(ws.packetWriter.getBuffer());
    }

    completeTutorial() {
        if (!this.tutorial || this.tutorial.finished) return;
        this.tutorial.finished = true;
        const ws = wsById.get(this.id);
        if (!ws) return;
        ws.packetWriter.reset();
        ws.packetWriter.writeU8(TUTORIAL_PACKET_COMPLETE);
        ws.send(ws.packetWriter.getBuffer());
        const world = this.world || 'main';
        if (world.startsWith('tutorial')) {
            deleteWorldState(world);
            clearWorldCaches(world);
        }
    }

    advanceTutorialStep() {
        if (!this.tutorial || this.tutorial.finished) return;
        this.tutorial.stage++;
        const nextText = TUTORIAL_STEP_TEXT[this.tutorial.stage];
        if (!nextText) {
            this.completeTutorial();
            return;
        }
        this.sendTutorialObjective(nextText, 0, this.tutorial.stage);
    }

    ensureTutorialChest() {
        if (!this.tutorial) return;
        const existing = this.tutorial.chestId ? ENTITIES.OBJECTS[this.tutorial.chestId] : null;
        if (existing) return;
        const chestType = getChestObjectTypes()[0];
        if (!chestType) return;
        const spawnDist = this.radius + 170;
        const chestX = Math.max(100, Math.min(MAP_SIZE[0] - 100, Math.round(this.x + Math.cos(this.angle || 0) * spawnDist)));
        const chestY = Math.max(100, Math.min(MAP_SIZE[1] - 100, Math.round(this.y + Math.sin(this.angle || 0) * spawnDist)));
        const chest = spawnObject(chestType, chestX, chestY, 1, null, this.world || 'main');
        if (!chest) return;
        chest.shouldDropLoop = false;
        chest.tutorialCoinDrop = 50;
        chest.noRespawn = true;
        this.tutorial.chestId = chest.id;
    }

    ensureTutorialPig() {
        if (!this.tutorial) return;
        if (this.tutorial.pigSpawned) return;
        const existing = this.tutorial.pigId ? ENTITIES.MOBS[this.tutorial.pigId] : null;
        if (existing) return;
        const spawnDist = this.radius + 220;
        const pigX = Math.max(100, Math.min(MAP_SIZE[0] - 100, Math.round(this.x + Math.cos(this.angle || 0) * spawnDist)));
        const pigY = Math.max(100, Math.min(MAP_SIZE[1] - 100, Math.round(this.y + Math.sin(this.angle || 0) * spawnDist)));
        const pigId = getId('MOBS');
        ENTITIES.newEntity({
            entityType: 'mob',
            id: pigId,
            x: pigX,
            y: pigY,
            type: 2,
            world: this.world || 'main'
        });
        const pig = ENTITIES.MOBS[pigId];
        if (!pig) return;
        pig.noRespawn = true;
        // Ensure first render orientation is deterministic and matches movement.
        pig.angle = Math.atan2(this.y - pig.y, this.x - pig.x);
        pig.lastTurnTime = performance.now();
        pig.nextTurnDelay = Math.floor(Math.random() * 3001) + 3000;
        this.tutorial.pigId = pig.id;
        this.tutorial.pigSpawned = true;

        // Force a full mob sync for this specific pig (ID may be reused).
        const seenKey = ENTITY_KEY_MOB + pigId;
        for (const client of wss.clients) {
            if (client.id !== this.id) continue;
            if (!client.seenEntities) continue;
            client.seenEntities.delete(seenKey);
            if (client._pendingSeenEntities instanceof Set) client._pendingSeenEntities.delete(seenKey);
        }
    }

    processTutorial(now = performance.now()) {
        this.ensureTutorialState();
        if (!this.tutorial || this.tutorial.finished) return;
        if (!this.isAlive && this.tutorial.stage < 8) return;

        switch (this.tutorial.stage) {
            case 0: {
                if (this.tutorial.desktopMovementSequenceEnabled) {
                    const currentStep = TUTORIAL_MOVEMENT_SEQUENCE[this.tutorial.movementHoldIndex];
                    if (!currentStep) {
                        this.advanceTutorialStep();
                        break;
                    }

                    const isHoldingOnlyTarget = TUTORIAL_MOVEMENT_SEQUENCE.every((step) => (
                        step.key === currentStep.key ? !!this.keys[step.key] : !this.keys[step.key]
                    ));

                    if (!isHoldingOnlyTarget) {
                        this.tutorial.movementHoldStartedAt = 0;
                        break;
                    }

                    if (!this.tutorial.movementHoldStartedAt) {
                        this.tutorial.movementHoldStartedAt = now;
                        break;
                    }

                    if (now - this.tutorial.movementHoldStartedAt >= TUTORIAL_MOVEMENT_HOLD_MS) {
                        this.tutorial.movementHoldIndex += 1;
                        this.tutorial.movementHoldStartedAt = 0;
                        if (this.tutorial.movementHoldIndex >= TUTORIAL_MOVEMENT_SEQUENCE.length) {
                            this.advanceTutorialStep();
                        } else {
                            this.sendTutorialObjective(getTutorialMovementText(this.tutorial.movementHoldIndex), 0, 0);
                        }
                    }
                    break;
                }

                const dx = this.x - this.tutorial.originX;
                const dy = this.y - this.tutorial.originY;
                if (dx * dx + dy * dy >= 1000) {
                    this.advanceTutorialStep();
                }
                break;
            }
            case 1:
                if (this.lastAttackTime > this.tutorial.lastAttackTimeSeen) {
                    this.tutorial.lastAttackTimeSeen = this.lastAttackTime;
                    this.advanceTutorialStep();
                }
                break;
            case 2:
                if (this.lastThrowSwordTime > this.tutorial.lastThrowTimeSeen) {
                    this.tutorial.lastThrowTimeSeen = this.lastThrowSwordTime;
                    this.advanceTutorialStep();
                }
                break;
            case 3:
                this.ensureTutorialChest();
                if (this.tutorial.chestId) {
                    const chestEntity = ENTITIES.OBJECTS[this.tutorial.chestId];
                    if (!chestEntity || !isChestObjectType(chestEntity.type)) {
                        this.advanceTutorialStep();
                    }
                }
                break;
            case 4:
                if (this.getTotalCoins() >= 50) {
                    this.advanceTutorialStep();
                }
                break;
            case 5: {
                const hasRank2 = this.inventory.some((itemType, idx) => (itemType & 0x7F) === 2 && this.inventoryCounts[idx] > 0);
                if (hasRank2 && this.tutorial.shopClosedAfterBuy) {
                    this.advanceTutorialStep();
                }
                break;
            }
            case 6: {
                const slotHasRank2 = (this.inventory[2] & 0x7F) === 2 && this.inventoryCounts[2] > 0;
                if (this.selectedSlot === 2 && slotHasRank2) {
                    this.advanceTutorialStep();
                }
                break;
            }
            case 7:
                if (!this.tutorial.pigSpawned) {
                    this.ensureTutorialPig();
                    break;
                }
                if (this.tutorial.pigId) {
                    const pig = ENTITIES.MOBS[this.tutorial.pigId];
                    if (!pig) {
                        this.advanceTutorialStep();
                        if (!this.tutorial.stage7StartedAt) {
                            this.tutorial.stage7StartedAt = now;
                        }
                    }
                }
                break;
            case 8:
                if (!this.tutorial.stage7StartedAt) {
                    this.tutorial.stage7StartedAt = now;
                }
                if (now - this.tutorial.stage7StartedAt >= 1200) {
                    this.completeTutorial();
                }
                break;
            default:
                break;
        }
    }

    move(now = performance.now()) {
        if (now - this.lastDiedTime < 1000) return;

        if (!this.isAlive) {
            this.spectate(now);
            return;
        }

        this.lastX = this.x;
        this.lastY = this.y;
        const movementLocked = this.isMovementLocked(now);
        let dx = 0;
        let dy = 0;
        if (!movementLocked) {
            if (this.keys.w) dy -= 1;
            if (this.keys.s) dy += 1;
            if (this.keys.a) dx -= 1;
            if (this.keys.d) dx += 1;
        }

        if (dx !== 0 || dy !== 0) {
            const moveScale = (dx !== 0 && dy !== 0) ? (this.speed * DIAGONAL_MOVE_SCALE) : this.speed;
            dx *= moveScale;
            dy *= moveScale;
            this.x += dx;
            this.y += dy;
        }

        this.processKnockback(now);
    }

    applyKnockback(dirX, dirY, distance, durationMs = 450) {
        const dist = Math.max(0, Number(distance) || 0);
        if (dist <= 0) return false;

        const len = Math.hypot(dirX, dirY) || 1;
        const tickMs = 50;
        const ticks = Math.max(1, Math.round(Math.max(tickMs, durationMs) / tickMs));
        const speedPerTick = dist / ticks;
        this.knockbackVelocityX += (dirX / len) * speedPerTick;
        this.knockbackVelocityY += (dirY / len) * speedPerTick;
        this.lastKnockbackProcessTime = performance.now();
        return true;
    }

    processKnockback(now = performance.now()) {
        const vx = this.knockbackVelocityX || 0;
        const vy = this.knockbackVelocityY || 0;
        const speed = Math.hypot(vx, vy);
        if (speed <= 0.05) {
            this.knockbackVelocityX = 0;
            this.knockbackVelocityY = 0;
            this.lastKnockbackProcessTime = now;
            return;
        }

        const previous = this.lastKnockbackProcessTime || now;
        const tickScale = Math.max(0.25, Math.min(2, (now - previous) / 50 || 1));
        this.lastKnockbackProcessTime = now;
        this.x += vx * tickScale;
        this.y += vy * tickScale;
        const decay = Math.pow(0.78, tickScale);
        this.knockbackVelocityX = vx * decay;
        this.knockbackVelocityY = vy * decay;
    }

    spectate(now = performance.now()) {
        const mapSize = getWorldMapSize(this.world || 'main');
        let topPlayer = null;
        let topScore = -Infinity;
        for (const id in ENTITIES.PLAYERS) {
            const p = ENTITIES.PLAYERS[id];
            if (!p?.isAlive) continue;
            const score = p.score || 0;
            if (score <= topScore) continue;
            topPlayer = p;
            topScore = score;
        }

        if (topPlayer) {
            if ((topPlayer.world || WORLD_MAIN) !== (this.world || WORLD_MAIN)) {
                const liveWs = wsById.get(this.id);
                if (liveWs) {
                    this.world = topPlayer.world || WORLD_MAIN;
                    this.x = topPlayer.x;
                    this.y = topPlayer.y;
                    this.lastX = topPlayer.x;
                    this.lastY = topPlayer.y;
                    liveWs.world = this.world;
                    liveWs.seenEntities = new Set();
                    liveWs._pendingSeenEntities = new Set();
                    liveWs._lastOptionalSyncWorld = null;
                    liveWs._lastTopLeaderSignature = null;
                    liveWs._lastMinimapSignature = null;
                    liveWs._minimapTickCounter = 0;
                    liveWs.send(buildInitPacket(liveWs.id, this.world));
                }
            }
            this.x = topPlayer.x;
            this.y = topPlayer.y;
        } else {
            // Roam randomly if no other player is in game.
            if (now - this.lastProcessTime > 7500) {
                this.lastProcessTime = now;
                this.angle = Math.random() * Math.PI * 2;
            }
            this.x = Math.max(0, Math.min(mapSize[0], this.x + Math.cos(this.angle) * 10));
            this.y = Math.max(0, Math.min(mapSize[1], this.y + Math.sin(this.angle) * 10));
        }
    }

    updateEnvironment(now = performance.now(), worldStructures = null) {
        const inTutorial = this.isTutorialWorld();
        const world = this.world || 'main';
        const mapSize = getWorldMapSize(world);
        const hasRivers = worldHasRivers(world);
        if (!hasRivers) {
            this.inRiverVertical = false;
            this.inRiverHorizontal = false;
            this.inWater = false;
            this.isHidden = false;
            const speedBoostMult = this.isMinotaurSpeedBoostActive(now) ? this.minotaurSpeedBoostMult : 1;
            this.speed = this.defaultSpeed * speedBoostMult;
            this.damageDebuffMult = 1;
            return;
        }
        let onBridge = false;
        const boundsV = getRiverBoundsAtY(mapSize, this.y);
        const boundsH = getRiverBoundsAtX(mapSize, this.x);
        this.inRiverVertical = this.x > boundsV.left && this.x < boundsV.right;
        this.inRiverHorizontal = this.y > boundsH.top && this.y < boundsH.bottom;
        if (!inTutorial) {
            const env = getWorldEnvironmentData(world);
            if (isPointInRiver(mapSize, this.x, this.y)) {
                if (this.inRiverVertical) {
                    const bandsY = env.bridgeBandsY || env.bridgeBands || [];
                    for (let i = 0; i < bandsY.length; i++) {
                        const bridgeBand = bandsY[i];
                        if (this.y >= bridgeBand.minY && this.y <= bridgeBand.maxY) {
                            onBridge = true;
                            break;
                        }
                    }
                }
                if (!onBridge && this.inRiverHorizontal) {
                    const bandsX = env.bridgeBandsX || [];
                    for (let i = 0; i < bandsX.length; i++) {
                        const bridgeBand = bandsX[i];
                        if (this.x >= bridgeBand.minX && this.x <= bridgeBand.maxX) {
                            onBridge = true;
                            break;
                        }
                    }
                }
                if (!onBridge) {
                    const diagonal = env.diagonalBridgeSegments || [];
                    const halfWidth = Math.max(0, Math.floor(env.diagonalBridgeHalfWidth || 0));
                    if (halfWidth > 0 && diagonal.length) {
                        const passableHalfWidth = halfWidth + Math.max(0, (this.radius || 0) * 0.35);
                        const passableSq = passableHalfWidth * passableHalfWidth;
                        for (let i = 0; i < diagonal.length; i++) {
                            const seg = diagonal[i];
                            const distSq = pointToSegmentDistanceSq(this.x, this.y, seg.x1, seg.y1, seg.x2, seg.y2);
                            if (distSq <= passableSq) {
                                onBridge = true;
                                break;
                            }
                        }
                    }
                }
            }
            this.isHidden = false;
            const trees = Array.isArray(worldStructures?.trees)
                ? worldStructures.trees
                : env.treeIds.map(id => ENTITIES.STRUCTURES[id]).filter(Boolean);
            for (let i = 0; i < trees.length; i++) {
                const tree = trees[i];
                if (!tree) continue;
                const range = (tree.radius || 0) + (this.radius || 0);
                const dx = tree.x - this.x;
                const dy = tree.y - this.y;
                if ((dx * dx + dy * dy) > (range * range)) continue;
                if (colliding(tree, this)) {
                    this.isHidden = true;
                    break;
                }
            }
        } else {
            this.isHidden = false;
        }
        this.inWater = !inTutorial && (this.inRiverVertical || this.inRiverHorizontal) && !this.touchingSafeZone && !onBridge;

        const baseSpeed = this.defaultSpeed;
        const speedBoostMult = this.isMinotaurSpeedBoostActive(now) ? this.minotaurSpeedBoostMult : 1;
        if (this.inWater) {
            this.speed = baseSpeed * 0.5 * speedBoostMult;
            const center = getWorldCenter(world);
            const dx = center.x - this.x;
            const dy = center.y - this.y;
            if (this.inRiverVertical) {
                this.x += dx * 0.0004;
                this.y += 3;
            }
            if (this.inRiverHorizontal) {
                this.y += dy * 0.0004;
                this.x += 3;
            }
        } else {
            this.speed = baseSpeed * speedBoostMult;
        }
        this.damageDebuffMult = this.inWater ? 0.7 : 1;
    }

    updateEquippedState(now = performance.now()) {
        const cooldown = now - this.lastThrowSwordTime < this.throwSwordCoolDownTime;
        const inCombat = now - this.lastCombatTime < 10000;
        // Weapons stay sheathed in safe zone unless in combat.
        const safeZoneLocksWeapon = this.touchingSafeZone && !inCombat;
        const invalidEnv = safeZoneLocksWeapon;
        const selectedRaw = this.inventory[this.selectedSlot] || 0;
        this.hasWeapon = !cooldown && selectedRaw < 128 && !invalidEnv && !this.manuallyUnequippedWeapon && isWeaponRank(this.weapon.rank);
        const throwCooldownMult = this.inWater ? 1.5 : 1;
        this.throwSwordCoolDownTime = Math.max(100, Math.round(dataMap.PLAYERS.baseThrowSwordCooldown * throwCooldownMult));
        // Shields:
        // - envShield: inside safe zone and not in combat
        // - progressShieldActive: low-score/low-gear protection (does NOT block attacking/throwing)
        const envShield = this.touchingSafeZone && !inCombat;
        this.hasShield = envShield || this.progressShieldActive;
    }

    applyAccessoryEffects(now = performance.now()) {
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        const staminaBoostActive = this.isStaminaBoostActive(now);
        const blindMult = this.getBlindnessViewRangeMult(now);
        const accessoryState = this._cachedAccessoryState;
        const radius = this.radius || 0;
        const weaponRank = this.weapon?.rank || 1;
        const baseOverride = (typeof this.viewRangeOverride === 'number')
            ? this.viewRangeOverride
            : this.baseViewRangeMult;
        const needsRecompute = !accessoryState
            || accessoryState.accessoryId !== this.accessoryId
            || accessoryState.radius !== radius
            || accessoryState.weaponRank !== weaponRank
            || accessoryState.baseOverride !== baseOverride
            || accessoryState.staminaBoostActive !== staminaBoostActive
            || accessoryState.inWater !== this.inWater
            || Math.abs((accessoryState?.blindMult ?? 1) - blindMult) > 0.001;

        if (needsRecompute) {
            const accessoryMult = dataMap.ACCESSORIES[accessoryKey]?.viewRangeMult || 1;
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const radiusScale = Math.max(0.1, radius / baseRadius);
            const weaponCooldownMult = Math.max(0.1, Number(getWeaponMeta(weaponRank)?.cooldownMult) || 1);
            this.viewRangeMult = Math.max(0.1, baseOverride * accessoryMult * radiusScale * blindMult);
            const swingMult = staminaBoostActive ? 0.7 : 1;
            const riverMult = this.inWater ? 1.5 : 1;
            this.attackCooldownTime = Math.max(100, dataMap.PLAYERS.baseAttackCooldown * swingMult * radiusScale * riverMult * weaponCooldownMult);
            const nextAbility = this.getEquippedAbility();
            const nextAbilityCooldown = this.getAbilityCooldownMs(nextAbility);
            if (this.activeAbility !== nextAbility || this.abilityCooldownMs !== nextAbilityCooldown) {
                this.activeAbility = nextAbility;
                this.abilityCooldownMs = nextAbilityCooldown;
                this.sendStatsUpdate();
            }
            this._cachedAccessoryState = {
                accessoryId: this.accessoryId,
                radius,
                weaponRank,
                baseOverride,
                staminaBoostActive,
                blindMult,
                inWater: this.inWater
            };
        }
        if (accessoryKey !== 'viking_hat' && this.vikingHitCount !== 0) {
            this.vikingHitCount = 0;
            this.lastVikingHitTime = 0;
            this.sendStatsUpdate();
        }
        if (accessoryKey !== 'heart_shades' && this.heartShadesBoostUntil) {
            this.heartShadesBoostUntil = 0;
            this.sendStatsUpdate();
        }
        if (accessoryKey === 'viking_hat' && this.vikingHitCount > 0) {
            if (now - (this.lastVikingHitTime || 0) >= 5000) {
                this.vikingHitCount = 0;
                this.lastVikingHitTime = 0;
                this.sendStatsUpdate();
            }
        }
    }

    getEquippedAbility() {
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        if (accessoryKey === 'bush_cloak') return 'poison_blast';
        if (accessoryKey === 'pirate_hat') return 'stamina_boost';
        if (accessoryKey === 'minotaur_hat') return 'energy_burst';
        if (accessoryKey === 'alien_antennas') return 'lightning_shot';
        if (accessoryKey === 'dark_cloak') return 'smoke_blast';
        if (accessoryKey === 'viking_hat') return 'growth_spurt';
        if (accessoryKey === 'sunglasses') return 'invisibility';
        if (accessoryKey === 'heart_shades') return 'burst_heal';
        return '';
    }

    getAbilityCooldownMs(abilityName = this.activeAbility) {
        if (abilityName === 'poison_blast') return 30000;
        if (abilityName === 'stamina_boost') return 30000;
        if (abilityName === 'speed_boost') return 30000;
        if (abilityName === 'energy_burst') return 30000;
        if (abilityName === 'lightning_shot') return 30000;
        if (abilityName === 'smoke_blast') return 30000;
        if (abilityName === 'growth_spurt') return 30000;
        if (abilityName === 'invisibility') return 30000;
        if (abilityName === 'intimidation') return 30000;
        if (abilityName === 'burst_heal') return 30000;
        return 0;
    }

    getAttackDamageMultiplier() {
        return Math.max(0.1, this.damageDebuffMult || 1);
    }

    isBlinded(now = performance.now()) {
        return now < (this.blindUntil || 0);
    }

    getBlindnessViewRangeMult(now = performance.now()) {
        if (!this.blindUntil || now >= this.blindUntil) return 1;
        const start = this.blindAppliedAt || 0;
        const hold = Math.max(0, this.blindHoldMs || 0);
        const fade = Math.max(1, this.blindFadeMs || 1);
        const elapsed = now - start;
        const minMult = Math.max(0.1, Math.min(1, this.blindMinMult || 1));
        if (elapsed <= hold) return minMult;
        const t = Math.max(0, Math.min(1, (elapsed - hold) / fade));
        return minMult + (1 - minMult) * t;
    }

    applyBlindness(durationMs = 5000, minViewRangeMult = 0.35, holdMs = 0, fadeMs = null) {
        const now = performance.now();
        const safeHold = Math.max(0, Math.round(holdMs));
        const safeFade = Math.max(1, Math.round(Number.isFinite(fadeMs) ? fadeMs : Math.max(1, durationMs - safeHold)));
        const total = safeHold + safeFade;
        this.blindAppliedAt = now;
        this.blindHoldMs = safeHold;
        this.blindFadeMs = safeFade;
        this.blindUntil = now + Math.max(1, total);
        this.blindMinMult = Math.max(0.1, Math.min(1, minViewRangeMult));
        this.lastCombatTime = now;
        this._cachedAccessoryState = null;
        this.sendStatsUpdate();
    }

    getBestSwordRank() {
        let best = 0;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventoryCounts[i] <= 0) continue;
            const rank = this.inventory[i] & 0x7F;
            if (isWeaponRank(rank) && isWeaponTypeStronger(rank, best)) best = rank;
        }
        return best;
    }

    hasNonBoneInventoryWeapon() {
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventoryCounts[i] <= 0) continue;
            const rank = this.inventory[i] & 0x7F;
            if (rank !== 1 && isWeaponRank(rank)) return true;
        }
        return false;
    }

    meetsPvpEntryRequirements() {
        return (this.score || 0) >= PVP_PROTECTION_SCORE && this.hasNonBoneInventoryWeapon();
    }

    shouldHaveProgressShield() {
        return !this.meetsPvpEntryRequirements();
    }

    updateProgressShield() {
        const active = this.shouldHaveProgressShield();
        if (active !== this.progressShieldActive) {
            this.progressShieldActive = active;
            this._forceFullSync = true;
            this.sendStatsUpdate();
        }
        if (!active && this.hasShield && !(this.touchingSafeZone && (performance.now() - this.lastCombatTime >= 10000))) {
            // If progress shield fell off, keep environment shield logic.
            this.hasShield = this.touchingSafeZone && (performance.now() - this.lastCombatTime >= 10000);
        }
    }

    activateGrowthSpurt(durationMs = 8000) {
        const now = performance.now();
        const safeDuration = Math.max(1, Math.round(durationMs));
        const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        if (now < (this.growthSpurtUntil || 0)) {
            this.growthSpurtUntil = now + safeDuration;
            if (!Number.isFinite(this.growthSpurtOriginalRadius)) {
                const currentRadius = Number.isFinite(this.radius) ? this.radius : baseRadius;
                this.growthSpurtOriginalRadius = Math.max(1, currentRadius / 2);
            }
            return;
        }
        const startingRadius = Number.isFinite(this.radius) ? this.radius : baseRadius;
        this.growthSpurtOriginalRadius = startingRadius;
        this.radius = Math.max(1, startingRadius * 2);
        this.growthSpurtUntil = now + safeDuration;
        this._cachedAccessoryState = null;
        this._forceFullSync = true;
        this.sendStatsUpdate();
    }

    activateHeartShadesBurst(durationMs = 3000) {
        const now = performance.now();
        const safeDuration = Math.max(1, Math.round(durationMs));
        const healAmount = Math.max(0, (this.maxHp || 0) * 0.5);
        if (healAmount > 0) {
            this.hp = Math.min(this.maxHp, this.hp + healAmount);
        }
        this.heartShadesBoostUntil = now + safeDuration;
        this.sendStatsUpdate();
    }

    updateGrowthSpurt(now = performance.now()) {
        if (!this.growthSpurtUntil) return;
        if (now < this.growthSpurtUntil) return;
        if (Number.isFinite(this.growthSpurtOriginalRadius)) {
            this.radius = this.growthSpurtOriginalRadius;
        } else {
            this.radius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        }
        this.growthSpurtOriginalRadius = null;
        this.growthSpurtUntil = 0;
        this._cachedAccessoryState = null;
        this._forceFullSync = true;
        this.sendStatsUpdate();
    }

    isStaminaBoostActive(now = performance.now()) {
        return now < (this.staminaBoostUntil || 0);
    }

    activateStaminaBoost(durationSeconds = 5) {
        const clampedDuration = Math.max(1, Math.min(60, Math.round(durationSeconds)));
        this.staminaBoostUntil = performance.now() + (clampedDuration * 1000);
        this.sendStatsUpdate();
    }

    isMinotaurSpeedBoostActive(now = performance.now()) {
        return now < (this.minotaurSpeedBoostUntil || 0);
    }

    activateMinotaurSpeedBoost(multiplier = 1.25, durationSeconds = 3) {
        const safeMult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.25;
        const clampedDuration = Math.max(1, Math.min(60, Math.round(durationSeconds)));
        this.minotaurSpeedBoostMult = safeMult;
        this.minotaurSpeedBoostUntil = performance.now() + (clampedDuration * 1000);
        this.sendStatsUpdate();
    }

    updateAnimations(now = performance.now()) {
        if (this.swingState > 0) {
            const swingRank = this.activeSwingWeaponRank || this.weapon.rank;
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const radiusScale = Math.max(0.1, (this.radius || baseRadius) / baseRadius);
            const riverMult = this.inWater ? 1.5 : 1;
            const weaponAnimMult = Math.max(0.1, Number(getWeaponMeta(swingRank)?.cooldownMult) || 1);
            const stepIntervalMs = 50 * radiusScale * riverMult * weaponAnimMult;
            if (!this.lastSwingAnimStepTime) this.lastSwingAnimStepTime = now;
            if (isSpearForwardSwingState(swingRank, this.swingState)) {
                this.spawnSpearThrustHitboxes();
            }
            if (now - this.lastSwingAnimStepTime >= stepIntervalMs) {
                const steps = Math.max(1, Math.floor((now - this.lastSwingAnimStepTime) / stepIntervalMs));
                this.swingState = Math.floor(this.swingState + steps);
                this.lastSwingAnimStepTime = now;
            }
            this.speed = 0;
        }
        if (this.swingState >= (getWeaponSwingStepCount(this.activeSwingWeaponRank || this.weapon.rank) + 1)) {
            this.swingState = 0;
            this.activeSwingWeaponRank = 0;
            this.activeAttackGroupId = 0;
            this.lastSwingAnimStepTime = 0;
            this.speed = this.defaultSpeed;
        }
    }

    updateChat(now = performance.now()) {
        if (this.chatMessage && now - this.lastChatTime > 10000) {
            this.chatMessage = '';
        }
    }

    syncSpeedStat() {
        const currentSpeed = Math.round(this.speed);
        if (currentSpeed !== this.lastStatsSpeed) {
            this.lastStatsSpeed = currentSpeed;
            this.sendStatsUpdate();
        }
    }

    getCombatScale() {
        const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        return Math.max(0.1, (this.radius || baseRadius) / baseRadius);
    }

    isPvpProtected() {
        return !this.meetsPvpEntryRequirements();
    }

    hasInventoryWeaponRank(weaponRank) {
        const rank = weaponRank & 0x7F;
        if (!isWeaponRank(rank)) return false;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventoryCounts[i] <= 0) continue;
            if ((this.inventory[i] & 0x7F) === rank) return true;
        }
        return false;
    }

    canDealPvpDamageWithWeapon(weaponRank = this.weapon.rank) {
        const rank = weaponRank & 0x7F;
        if (!this.meetsPvpEntryRequirements()) return false;
        if (rank === 1 || !isWeaponRank(rank)) return false;
        if (!this.hasInventoryWeaponRank(rank)) return false;
        return true;
    }

    canEngagePvpWith(otherPlayer, weaponRank = this.weapon.rank) {
        if (!(otherPlayer instanceof Player)) return true;
        return this.canDealPvpDamageWithWeapon(weaponRank) && !otherPlayer.isPvpProtected();
    }

    // --- Actions ---

    attack(now = performance.now()) {
        if (this.isFrozen(now)) {
            this.attacking = 0;
            return;
        }

        if (this.tutorial && !this.tutorial.finished && this.tutorial.stage < 1) {
            // Prevent pre-holding attack from auto-completing the objective once stage 1 begins.
            this.attacking = 0;
            return;
        }

        const curRank = this.inventory[this.selectedSlot];
        const baseRank = curRank & 0x7F;
        // Safe-zone shield always blocks attacking; progress shield alone does not.
        const inCombat = now - this.lastCombatTime < 10000;
        const envShieldActive = this.touchingSafeZone && !inCombat;
        const shieldBlocksAttack = envShieldActive;
        const canAttack = this.attacking && !shieldBlocksAttack && this.isAlive && this.hasWeapon && curRank < 128 && isWeaponRank(baseRank) && !isBoomerangType(baseRank);

        if (!canAttack || now - this.lastAttackTime < this.attackCooldownTime) {
            if (isBoomerangType(baseRank)) this.attacking = 0;
            return;
        }

        this.lastAttackTime = now;
        this.swingState = 1;
        this.activeSwingWeaponRank = baseRank;
        this.activeAttackGroupId = Math.random();
        this.lastSwingAnimStepTime = now;
        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('sword_slash'), 1000, this.world || 'main');

        if (isSpearRank(baseRank)) {
            this.spawnSpearThrustHitboxes();
            return;
        }

        const groupId = this.activeAttackGroupId;
        for (let angleOffset = -Math.PI / 3; angleOffset <= Math.PI / 3; angleOffset += Math.PI / 12) {
            this.spawnProjectile(angleOffset, false, groupId);
        }
    }

    throwSword() {
        if (this.tutorial && !this.tutorial.finished && this.tutorial.stage < 2) return;

        const now = performance.now();
        if (this.isFrozen(now)) return;
        const curRank = this.inventory[this.selectedSlot];
        const baseRank = curRank & 0x7F;
        // Throwing is blocked only by safe-zone weapon lock (hasWeapon covers that), water, cooldown, and ghost rank.
        const canThrow = this.isAlive && this.hasWeapon && this.swingState === 0 && curRank < 128 && isWeaponRank(baseRank);

        if (!canThrow || now - this.lastThrowSwordTime < this.throwSwordCoolDownTime) return;

        this.lastThrowSwordTime = now;
        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('throw'), 1000, this.world || 'main');

        this.spawnProjectile(0, true, Math.random());

        // Mark as ghost (thrown)
        this.inventory[this.selectedSlot] |= 0x80;
        if (isBoomerangType(baseRank)) {
            this.boomerangMoveStunnedUntil = Math.max(this.boomerangMoveStunnedUntil || 0, now + BOOMERANG_THROW_MOVE_STUN_MS);
        }

        if (this.pendingWeaponReturnTimer) {
            clearTimeout(this.pendingWeaponReturnTimer);
            this.pendingWeaponReturnTimer = null;
        }
        if (!isBoomerangType(baseRank)) {
            this.pendingWeaponReturnTimer = setTimeout(() => {
                this.pendingWeaponReturnTimer = null;
                this.returnWeapon(baseRank);
            }, this.throwSwordCoolDownTime);
        }

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    spawnProjectile(angleOffset, thrown, groupId) {
        const projectileAngle = this.angle + angleOffset;
        let type = thrown ? -1 : getWeaponProjectileType(this.weapon.rank);
        if (!thrown && type <= 0) type = getWeaponProjectileType(1);

        ENTITIES.newEntity({
            entityType: 'projectile',
            id: getId('PROJECTILES'),
            x: this.x + Math.cos(projectileAngle) * this.radius,
            y: this.y + Math.sin(projectileAngle) * this.radius,
            angle: projectileAngle,
            type: type,
            shooter: this,
            groupId: groupId
        });
    }

    spawnSpearThrustHitboxes() {
        const rank = this.activeSwingWeaponRank || this.weapon.rank;
        if (!isSpearForwardSwingState(rank, this.swingState)) return;

        const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        const scale = Math.max(0.1, (this.radius || baseRadius) / baseRadius);
        const [baseWidth, baseHeight] = getWeaponSize(rank);
        const weaponOffset = getWeaponOffset(rank);
        const renderTuning = getWeaponRenderTuning(rank);
        const weaponWidth = baseWidth * scale;
        const weaponHeight = baseHeight * scale;
        const forwardAngle = this.angle;
        const sideAngle = forwardAngle + (Math.PI / 2);
        const thrustDistance = weaponWidth * 0.2925 * getSpearThrustProgress(rank, this.swingState);
        const localOffsetX = (weaponOffset.x || 0) * scale;
        const localOffsetY = (weaponOffset.y || 0) * scale;
        const rotatedOffsetX = (Math.cos(forwardAngle) * localOffsetX) - (Math.sin(forwardAngle) * localOffsetY);
        const rotatedOffsetY = (Math.sin(forwardAngle) * localOffsetX) + (Math.cos(forwardAngle) * localOffsetY);
        const sideDistance = this.radius + (weaponHeight * renderTuning.sideOffset);
        const baseForwardOffset = weaponWidth * renderTuning.forwardOffset;
        const centerX =
            this.x +
            (Math.cos(sideAngle) * sideDistance) +
            (Math.cos(forwardAngle) * (baseForwardOffset + thrustDistance)) +
            rotatedOffsetX;
        const centerY =
            this.y +
            (Math.sin(sideAngle) * sideDistance) +
            (Math.sin(forwardAngle) * (baseForwardOffset + thrustDistance)) +
            rotatedOffsetY;
        const segmentRadius = Math.max(10, Math.round(weaponHeight * 0.28));
        const segmentCount = 5;
        const startAlong = 0;
        const alongStep = (weaponWidth * 0.5) / Math.max(1, segmentCount - 1);

        for (let i = 0; i < segmentCount; i++) {
            const along = startAlong + (alongStep * i);
            ENTITIES.newEntity({
                entityType: 'projectile',
                id: getId('PROJECTILES'),
                x: centerX + (Math.cos(forwardAngle) * along),
                y: centerY + (Math.sin(forwardAngle) * along),
                angle: forwardAngle,
                type: rank,
                shooter: this,
                groupId: this.activeAttackGroupId || Math.random(),
                projectileOptions: {
                    noMove: true,
                    logicOnly: true,
                    ttlMs: 40,
                    radiusOverride: segmentRadius
                }
            });
        }
    }

    handleAutoPickup(now = performance.now(), worldCoins = null) {
        if (!this.isAlive) return;

        // If inventory is full (no empty slots AND no coin slots with room < 256), don't auto-pickup
        let canFitMoreCoins = false;
        for (let i = 0; i < this.inventory.length; i++) {
            const type = this.inventory[i];
            if (type === 0 || (isCoinObjectType(type) && this.inventoryCounts[i] < 256)) {
                canFitMoreCoins = true;
                break;
            }
        }
        if (!canFitMoreCoins) return;
        const objects = Array.isArray(worldCoins) ? worldCoins : ENTITIES.OBJECTS;
        if (Array.isArray(objects)) {
            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (!obj || obj.collectorId) continue;
                if ((now - (obj.spawnTime || 0)) <= PICKUP_DELAY_MS) continue;
                if (!this.canPickupDroppedObject(obj, now)) continue;
                const range = (this.radius || 0) + (obj.radius || 0);
                const dx = this.x - obj.x;
                const dy = this.y - obj.y;
                if ((dx * dx + dy * dy) > (range * range)) continue;
                if (!colliding(this, obj)) continue;
                obj.startCollection(this);
            }
            return;
        }

        const world = this.world || 'main';
        for (const id in objects) {
            const obj = objects[id];
            if (!obj || !isCoinObjectType(obj.type) || obj.collectorId) continue;
            if ((obj.world || 'main') !== world) continue;
            if ((now - (obj.spawnTime || 0)) <= PICKUP_DELAY_MS) continue;
            if (!this.canPickupDroppedObject(obj, now)) continue;
            const range = (this.radius || 0) + (obj.radius || 0);
            const dx = this.x - obj.x;
            const dy = this.y - obj.y;
            if ((dx * dx + dy * dy) > (range * range)) continue;
            if (!colliding(this, obj)) continue;
            obj.startCollection(this);
        }
    }

    canPickupDroppedObject(obj, now = performance.now()) {
        if (!obj) return false;
        return !(obj.dropOwnerId === this.id && now < (obj.dropOwnerPickupLockUntil || 0));
    }

    applyDropLaunch(dropObj, itemType, angle = this.angle, now = performance.now()) {
        if (!dropObj) return;
        const a = Number.isFinite(angle) ? angle : 0;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const itemRadius = dataMap.OBJECTS[itemType]?.radius || 25;
        const clampPos = (x, y) => ({
            x: Math.max(itemRadius, Math.min(MAP_SIZE[0] - itemRadius, Math.round(x))),
            y: Math.max(itemRadius, Math.min(MAP_SIZE[1] - itemRadius, Math.round(y)))
        });
        const start = clampPos(this.x + cos * DROP_INITIAL_PUSH, this.y + sin * DROP_INITIAL_PUSH);
        const end = clampPos(this.x + cos * DROP_FINAL_PUSH, this.y + sin * DROP_FINAL_PUSH);
        dropObj.x = start.x;
        dropObj.y = start.y;
        dropObj.lastX = start.x;
        dropObj.lastY = start.y;
        dropObj.targetX = end.x;
        dropObj.targetY = end.y;
        dropObj.teleportTicks = DROP_TRAVEL_TICKS;
        dropObj.dropOwnerId = this.id;
        dropObj.dropOwnerPickupLockUntil = now + DROP_OWNER_PICKUP_LOCK_MS;
    }

    dropItem() {
        this.dropItemFromSlot(this.selectedSlot);
    }

    dropSingleItem() {
        this.dropSingleItemFromSlot(this.selectedSlot);
    }

    dropItemFromSlot(slot, angleOverride = null) {
        this.dropItemsFromSlot(slot, angleOverride, null);
    }

    dropSingleItemFromSlot(slot, angleOverride = null) {
        this.dropItemsFromSlot(slot, angleOverride, 1);
    }

    dropItemsFromSlot(slot, angleOverride = null, requestedAmount = null) {
        if (!this.canDropItems()) return;
        if (slot < 0 || slot >= this.inventory.length) return;
        const rank = this.inventory[slot];
        const count = this.inventoryCounts[slot];
        if (rank <= 0 || count <= 0) return;

        const baseType = rank & 0x7F;
        const objectCfg = dataMap.OBJECTS?.[baseType];
        const stackLimit = getInventoryStackLimit(baseType);
        const baseAngle = Number.isFinite(angleOverride) ? angleOverride : this.angle;
        const dropCount = Math.max(1, Math.min(count, Number.isFinite(requestedAmount) ? Math.floor(requestedAmount) : count));

        if (stackLimit > 1) {
            let remaining = dropCount;
            let stackIndex = 0;
            while (remaining > 0) {
                const stackCount = Math.min(stackLimit, remaining);
                const dropObj = spawnObject(baseType, this.x, this.y, stackCount, 'player', this.world || 'main');
                const scatter = baseAngle + (stackIndex * 0.5);
                this.applyDropLaunch(dropObj, baseType, scatter);
                remaining -= stackCount;
                stackIndex++;
            }
        } else {
            const dropObj = spawnObject(baseType, this.x, this.y, dropCount, 'player', this.world || 'main');
            this.applyDropLaunch(dropObj, baseType, baseAngle);
        }

        this.inventoryCounts[slot] -= dropCount;
        if (this.inventoryCounts[slot] <= 0) {
            this.inventory[slot] = 0;
            this.inventoryCounts[slot] = 0;
        }
        if (slot === this.selectedSlot && this.inventoryCounts[slot] <= 0) {
            this.manuallyUnequippedWeapon = false;
        }
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    useItem() {
        if (!this.isAlive) return;
        const slot = this.selectedSlot;
        if (slot < 0 || slot >= this.inventory.length) return;
        const baseType = this.inventory[slot] & 0x7F;
        const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
        const goldenSkullType = dataMap.OBJECT_TYPE_BY_KEY?.['golden_skull'] || 0;

        if (goldenSkullType && baseType === goldenSkullType) {
            const shrine = this.findNearbyBossShrine(90);
            if (!shrine || this.inventoryCounts[slot] <= 0) return;
            if (typeof shrine.activate !== 'function') return;
            const activated = shrine.activate(this);
            if (!activated) return;
            this.inventoryCounts[slot] -= 1;
            if (this.inventoryCounts[slot] <= 0) {
                this.inventory[slot] = 0;
                this.inventoryCounts[slot] = 0;
            }
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
            return;
        }

        if (!essenceType || baseType !== essenceType) return;

        if (this.hp >= this.maxHp) return;
        if (this.inventoryCounts[slot] <= 0) return;
        this.inventoryCounts[slot] -= 1;
        if (this.inventoryCounts[slot] <= 0) {
            this.inventory[slot] = 0;
            this.inventoryCounts[slot] = 0;
        }
        this.hp = Math.min(this.maxHp, this.hp + 15);
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    findNearbyBossShrine(range = 90) {
        const world = this.world || 'main';
        const rangeSq = range * range;
        let nearest = null;
        let nearestDistSq = Infinity;

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure || (structure.type !== 4 && structure.type !== 8 && structure.type !== 9 && structure.type !== 10)) continue;
            if ((structure.world || 'main') !== world) continue;
            const dx = structure.x - this.x;
            const dy = structure.y - this.y;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq > rangeSq || distSq >= nearestDistSq) continue;
            nearest = structure;
            nearestDistSq = distSq;
        }

        return nearest;
    }

    tryPickup(now = performance.now(), worldObjects = null) {
        if (!this.isAlive) return;
        if (this.isBot) {
            const nextPickupScanAt = this._botNextPickupScanAt || 0;
            if (now < nextPickupScanAt) return;
            this._botNextPickupScanAt = now + (Array.isArray(worldObjects) ? 120 : 180);
        }
        const world = this.world || 'main';
        let emptySlot = -1;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventory[i] === 0) {
                emptySlot = i;
                break;
            }
        }

        const objects = Array.isArray(worldObjects) ? worldObjects : null;
        if (objects) {
            for (let i = 0; i < objects.length; i++) {
                if (this.tryPickupObject(objects[i], now, emptySlot)) return;
            }
            return;
        }

        for (const id in ENTITIES.OBJECTS) {
            if (this.tryPickupObject(ENTITIES.OBJECTS[id], now, emptySlot, world)) return;
        }
    }

    tryPickupObject(obj, now, emptySlot = -1, world = this.world || 'main') {
        if (!obj) return false;
        if ((obj.world || 'main') !== world) return false;
        const objectCfg = dataMap.OBJECTS[obj.type];
        if (!objectCfg?.isEphemeral) return false;
        if ((now - (obj.spawnTime || 0)) < PICKUP_DELAY_MS) return false;
        const pickupRange = (this.radius || 0) + (obj.radius || 0) + 15;
        const objDx = this.x - obj.x;
        const objDy = this.y - obj.y;
        if ((objDx * objDx + objDy * objDy) > (pickupRange * pickupRange)) return false;
        if (!this.canPickupDroppedObject(obj, now)) return false;
        this.recordLatestCollisionDebug(COLLISION_DEBUG_OBJECT, obj.id);

        const isCoin = isCoinObjectType(obj.type);
        if (isCoin) {
            if (obj.collectorId) return false;
            return !!obj.startCollection(this);
        }

        const stackLimit = getInventoryStackLimit(obj.type);
        if (stackLimit > 1) {
            let remaining = Math.max(1, Math.floor(obj.amount || 1));
            let pickedAny = false;

            for (let i = 0; i < this.inventory.length; i++) {
                if (this.inventory[i] !== obj.type) continue;
                if (this.inventoryCounts[i] >= stackLimit) continue;
                const space = stackLimit - this.inventoryCounts[i];
                const toAdd = Math.min(space, remaining);
                this.inventoryCounts[i] += toAdd;
                remaining -= toAdd;
                pickedAny = true;
                if (remaining <= 0) break;
            }

            while (remaining > 0 && emptySlot !== -1) {
                this.inventory[emptySlot] = obj.type;
                const toAdd = Math.min(stackLimit, remaining);
                this.inventoryCounts[emptySlot] = toAdd;
                remaining -= toAdd;
                pickedAny = true;
                emptySlot = this.inventory.indexOf(0);
            }

            if (pickedAny) {
                if (remaining <= 0) {
                    ENTITIES.deleteEntity('object', obj.id);
                } else {
                    obj.amount = remaining;
                }
                this.sendInventoryUpdate();
                this.sendStatsUpdate();
                return true;
            }
        }

        if (emptySlot !== -1) {
            this.inventory[emptySlot] = obj.type;
            this.inventoryCounts[emptySlot] = (obj.amount || 1);
            ENTITIES.deleteEntity('object', obj.id);
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
            return true;
        }

        if (!this.isBot) return false;

        const incomingRank = obj.type & 0x7F;
        if (!isWeaponRank(incomingRank)) return false;
        let replaceSlot = -1;
        let lowestRank = incomingRank;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventoryCounts[i] <= 0) continue;
            const heldRank = this.inventory[i] & 0x7F;
            if (!isWeaponRank(heldRank)) continue;
            if (heldRank < lowestRank) {
                lowestRank = heldRank;
                replaceSlot = i;
            }
        }

        if (replaceSlot === -1) return false;

        const oldType = this.inventory[replaceSlot] & 0x7F;
        const oldCount = Math.max(1, this.inventoryCounts[replaceSlot] || 1);
        const dropObj = spawnObject(oldType, this.x, this.y, oldCount, 'player', this.world || 'main');
        this.applyDropLaunch(dropObj, oldType);
        this.inventory[replaceSlot] = obj.type;
        this.inventoryCounts[replaceSlot] = Math.max(1, obj.amount || 1);
        ENTITIES.deleteEntity('object', obj.id);
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
        return true;
    }

    returnWeapon(rank) {
        if (!this.isAlive) return;

        // Try to return to ghost slot
        const ghostIdx = this.inventory.indexOf(rank | 0x80);
        if (ghostIdx !== -1) {
            this.inventory[ghostIdx] = rank;
            this.inventoryCounts[ghostIdx] = 1;
        } else {
            return;
        }
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    recallThrownBoomerangs() {
        let recalledAny = false;
        for (const id in ENTITIES.PROJECTILES) {
            const projectile = ENTITIES.PROJECTILES[id];
            if (!projectile || projectile.shooter !== this || !projectile.isThrownBoomerang?.()) continue;

            const rank = projectile.weaponRank & 0x7F;
            ENTITIES.deleteEntity('projectile', projectile.id);
            if (rank > 0) {
                this.returnWeapon(rank);
                recalledAny = true;
            }
        }

        for (let i = 0; i < this.inventory.length; i++) {
            const rawType = this.inventory[i] || 0;
            const rank = rawType & 0x7F;
            if (rawType < 128 || !isBoomerangType(rank)) continue;
            this.inventory[i] = rank;
            this.inventoryCounts[i] = Math.max(1, this.inventoryCounts[i] || 1);
            recalledAny = true;
        }

        if (recalledAny) {
            this.lastThrowSwordTime = 0;
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    buyItem(rank) {
        if (!this.isAlive || !isWeaponRank(rank)) return;
        const cost = getWeaponShopPrice(rank);

        if (cost > 0 && this.getTotalCoins() >= cost) {
            const emptySlot = this.inventory.indexOf(0);
            if (emptySlot !== -1) {
                this.deductCoins(cost);
                this.inventory[emptySlot] = rank;
                this.inventoryCounts[emptySlot] = 1;
                this.sendInventoryUpdate();
                this.sendStatsUpdate();
            }
        }
    }

    buyAccessory(accessoryId) {
        if (!this.isAlive || !isAccessoryId(accessoryId) || accessoryId === 0) return;

        const accessoryKey = ACCESSORY_KEYS[accessoryId];
        const costConfig = dataMap.ACCESSORY_COSTS?.[accessoryKey];
        const usesEssence = costConfig?.currency === 'hearty_essence';
        const cost = Math.max(0, Math.floor(costConfig?.amount || (dataMap.ACCESSORY_PRICE || 30)));
        if (cost <= 0) return;

        if (usesEssence) {
            const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
            if (!essenceType) return;
            if (this.getTotalItemCount(essenceType) < cost) return;
        } else {
            if (this.getTotalCoins() < cost) return;
        }

        const emptySlot = this.inventory.indexOf(0);
        if (emptySlot === -1) return;

        if (usesEssence) {
            const essenceType = dataMap.OBJECT_TYPE_BY_KEY?.['hearty_essence'] || 0;
            this.deductItemCount(essenceType, cost);
        } else {
            this.deductCoins(cost);
        }
        this.inventory[emptySlot] = accessoryItemTypeFromId(accessoryId);
        this.inventoryCounts[emptySlot] = 1;
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    buyXp(itemType) {
        if (!this.isAlive) return;
        const itemConfig = getXpShopItemConfig(itemType);
        if (!itemConfig) return;
        const cost = Math.max(0, Math.floor(itemConfig.price || 0));
        const xp = Math.max(0, Math.floor(itemConfig.xp || 0));
        if (cost <= 0 || xp <= 0) return;
        if (this.getTotalCoins() < cost) return;

        this.deductCoins(cost);
        this.addScore(xp);
        this.sendStatsUpdate();
    }

    buySpecialItem(itemType) {
        if (!this.isAlive) return false;
        const specialItems = Array.isArray(dataMap.SPECIAL_SHOP_ITEMS) ? dataMap.SPECIAL_SHOP_ITEMS : [];
        const itemConfig = specialItems.find(item => (item?.itemType | 0) === (itemType | 0));
        if (!itemConfig) return false;

        const coinCost = Math.max(0, Math.floor(itemConfig.coinCost || 0));
        if (coinCost > 0 && this.getTotalCoins() < coinCost) return false;

        const itemCosts = Array.isArray(itemConfig.itemCosts) ? itemConfig.itemCosts : [];
        for (const cost of itemCosts) {
            const ingredientType = dataMap.OBJECT_TYPE_BY_KEY?.[cost?.key] || 0;
            const ingredientAmount = Math.max(0, Math.floor(cost?.amount || 0));
            if (!ingredientType || ingredientAmount <= 0) return false;
            if (this.getTotalItemCount(ingredientType) < ingredientAmount) return false;
        }

        const objectCfg = dataMap.OBJECTS?.[itemType];
        if (!objectCfg) return false;
        const stackLimit = Math.max(1, Math.floor(objectCfg.stackLimit || 256));
        let targetSlot = -1;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventory[i] === itemType && this.inventoryCounts[i] < stackLimit) {
                targetSlot = i;
                break;
            }
        }
        if (targetSlot === -1) targetSlot = this.inventory.indexOf(0);
        if (targetSlot === -1) return false;

        if (coinCost > 0) this.deductCoins(coinCost);
        for (const cost of itemCosts) {
            const ingredientType = dataMap.OBJECT_TYPE_BY_KEY?.[cost?.key] || 0;
            const ingredientAmount = Math.max(0, Math.floor(cost?.amount || 0));
            if (ingredientType && ingredientAmount > 0) this.deductItemCount(ingredientType, ingredientAmount);
        }

        if (this.inventory[targetSlot] === itemType) {
            this.inventoryCounts[targetSlot] += 1;
        } else {
            this.inventory[targetSlot] = itemType;
            this.inventoryCounts[targetSlot] = 1;
        }
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
        return true;
    }

    sellItems(slotIndices) {
        if (!this.isAlive || !Array.isArray(slotIndices) || slotIndices.length === 0) return;

        let totalSellPrice = 0;
        let soldAny = false;

        for (const slotIndex of slotIndices) {
            if (slotIndex < 0 || slotIndex >= 35) continue;

            const rawType = this.inventory[slotIndex] & 0x7F;
            const count = this.inventoryCounts[slotIndex];
            if (count <= 0) continue;

            let unitSellPrice = 0;
            if (isWeaponRank(rawType)) {
                unitSellPrice = getWeaponSellPrice(rawType);
            } else if (isAccessoryItemType(rawType)) {
                const accessoryId = accessoryIdFromItemType(rawType);
                const accessoryKey = ACCESSORY_KEYS[accessoryId];
                if (accessoryKey === 'minotaur_hat') {
                    unitSellPrice = 300;
                } else {
                    const costConfig = dataMap.ACCESSORY_COSTS?.[accessoryKey];
                    const baseCost = Math.max(0, Math.floor(costConfig?.amount || (dataMap.ACCESSORY_PRICE || 30)));
                    unitSellPrice = Math.floor(baseCost * 0.5);
                }
            }

            if (unitSellPrice <= 0) continue;
            const sellPrice = unitSellPrice * count;
            totalSellPrice += sellPrice;
            this.inventory[slotIndex] = 0;
            this.inventoryCounts[slotIndex] = 0;

            if (this.selectedSlot === slotIndex) {
                // Logic for weapon rank update if needed, but this.weapon.rank is a getter
            }
            soldAny = true;
        }

        if (soldAny) {
            this.addGoldCoins(totalSellPrice);
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    addGoldCoins(amount) {
        let remaining = amount;
        // Try to fill existing stacks (up to 256)
        for (let i = 0; i < 35; i++) {
            if (isCoinObjectType(this.inventory[i]) && this.inventoryCounts[i] < 256) {
                const space = 256 - this.inventoryCounts[i];
                const toAdd = Math.min(space, remaining);
                this.inventoryCounts[i] += toAdd;
                remaining -= toAdd;
                if (remaining <= 0) break;
            }
        }

        // Fill empty slots with new stacks
        while (remaining > 0) {
            const emptySlot = this.inventory.indexOf(0);
            if (emptySlot === -1) break;

            const toAdd = Math.min(256, remaining);
            this.inventory[emptySlot] = getCoinObjectType();
            this.inventoryCounts[emptySlot] = toAdd;
            remaining -= toAdd;
        }

        // If still remaining (inventory full), drop on floor in clusters of 256
        while (remaining > 0) {
            const toDrop = Math.min(256, remaining);
            const dropObj = spawnObject(getCoinObjectType(), this.x, this.y, toDrop, 'player', this.world || 'main');
            if (dropObj) {
                const scatterAngle = Math.random() * Math.PI * 2;
                this.applyDropLaunch(dropObj, getCoinObjectType(), scatterAngle);
            }
            remaining -= toDrop;
        }

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    getTotalCoins() {
        let total = 0;
        for (let i = 0; i < 35; i++) {
            if (isCoinObjectType(this.inventory[i])) {
                total += this.inventoryCounts[i];
            }
        }
        return total;
    }

    getTotalItemCount(itemType) {
        let total = 0;
        for (let i = 0; i < 35; i++) {
            if (this.inventory[i] === itemType) {
                total += this.inventoryCounts[i];
            }
        }
        return total;
    }

    deductCoins(amount) {
        let remaining = amount;
        for (let i = 34; i >= 0; i--) { // Deduct from end of inventory first
            if (isCoinObjectType(this.inventory[i])) {
                const toDeduct = Math.min(this.inventoryCounts[i], remaining);
                this.inventoryCounts[i] -= toDeduct;
                remaining -= toDeduct;
                if (this.inventoryCounts[i] <= 0) {
                    this.inventory[i] = 0;
                }
                if (remaining <= 0) break;
            }
        }

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    deductItemCount(itemType, amount) {
        let remaining = amount;
        for (let i = 34; i >= 0; i--) {
            if (this.inventory[i] === itemType) {
                const toDeduct = Math.min(this.inventoryCounts[i], remaining);
                this.inventoryCounts[i] -= toDeduct;
                remaining -= toDeduct;
                if (this.inventoryCounts[i] <= 0) {
                    this.inventory[i] = 0;
                }
                if (remaining <= 0) break;
            }
        }

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    // --- Interaction ---

    damage(health, attacker, options = null) {
        if (this.invincible || performance.now() - this.lastDamagedTime < 200) return false;
        if (attacker instanceof Player && !attacker.canEngagePvpWith(this, options?.weaponRank || attacker.weapon?.rank || 0)) {
            return false;
        }

        let finalHealthLoss = health;
        if (ACCESSORY_KEYS[this.accessoryId] === 'minotaur_hat') {
            finalHealthLoss *= 0.8;
        }
        const indicatorDamage = Math.max(0, Math.round(finalHealthLoss));

        this.lastDamagedTime = performance.now();
        this.hp -= finalHealthLoss;
        if (attacker && typeof attacker.id !== 'undefined' && !attacker?.noKillCredit) {
            this.lastDamager = attacker;
        }

        if (this.hp <= 0) {
            emitDamageIndicatorFx(this.x, this.y, indicatorDamage, this.radius || dataMap.PLAYERS.baseRadius, this.world || 'main');
            const killer = attacker?.noKillCredit ? this.lastDamager : attacker;
            this.die(killer || null);
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('bubble_pop'), 1000, this.world || 'main');
        } else {
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('hurt'), 1000, this.world || 'main');
            this.lastCombatTime = performance.now();
            this.sendStatsUpdate();
        }

        if (attacker && attacker instanceof Player) {
            attacker.lastCombatTime = performance.now();
        }
        return true;
    }

    die(killer) {
        this.lastDiedTime = performance.now();
        const deathWorld = this.world || WORLD_MAIN;
        const deathX = this.x;
        const deathY = this.y;
        const deathStamp = this.lastDiedTime;
        const skullItemType = dataMap.OBJECT_TYPE_BY_KEY?.['skull'] || 0;
        const wasKilledByPlayer = killer instanceof Player && killer.id !== this.id;

        this.lastCombatTime = -Infinity;
        this.wasInCombat = false;
        this.sessionDeaths = (this.sessionDeaths || 0) + 1;
        this.recordLatestCollisionDebug(COLLISION_DEBUG_NONE, 0);

        this.sendStatsUpdate();
        this.isAlive = false;

        if (this._delayedMainWorldSwitchTimer) {
            clearTimeout(this._delayedMainWorldSwitchTimer);
            this._delayedMainWorldSwitchTimer = null;
        }

        for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            if (!mob) continue;
            if ((mob.world || WORLD_MAIN) !== deathWorld) continue;
            const wasTargetingThisPlayer = mob.target?.id === this.id;
            const wasLastHitByThisPlayer = mob.lastHitById === this.id;
            if (!wasTargetingThisPlayer && !wasLastHitByThisPlayer) continue;

            if (wasTargetingThisPlayer) {
                mob.target = null;
                mob.alarmReason = null;
            }
            if (wasLastHitByThisPlayer) {
                mob.lastHitById = null;
            }
            if (mob.isAlarmed && !mob.target) {
                if (typeof mob.resetAlarmState === 'function') {
                    mob.resetAlarmState();
                } else {
                    mob.isAlarmed = false;
                }
            }
        }

        if (!this.isBot) {
            const ws = wsById.get(this.id);
            if (ws) {
                ws._respawnWorld = WORLD_MAIN;
            }
            if (deathWorld !== WORLD_MAIN) {
                this._delayedMainWorldSwitchTimer = setTimeout(() => {
                    this._delayedMainWorldSwitchTimer = null;
                    if (this.isAlive) return;
                    if (this.lastDiedTime !== deathStamp) return;
                    const liveWs = wsById.get(this.id);
                    if (!liveWs) return;
                    const mainCenter = getWorldCenter(WORLD_MAIN);
                    this.world = WORLD_MAIN;
                    this.x = mainCenter.x;
                    this.y = mainCenter.y;
                    liveWs.world = WORLD_MAIN;
                    liveWs.seenEntities = new Set();
                    liveWs._pendingSeenEntities = new Set();
                    liveWs._lastOptionalSyncWorld = null;
                    liveWs._lastTopLeaderSignature = null;
                    liveWs._lastMinimapSignature = null;
                    liveWs._minimapTickCounter = 0;
                    liveWs.send(buildInitPacket(liveWs.id, WORLD_MAIN));
                }, 5000);
            }
        }

        const currentScore = this.score;
        const lossPercent = 0.25 + (Math.random() * 0.10); // 25% - 35%
        const lost = Math.min(currentScore, currentScore > 0 ? Math.max(1, Math.floor(currentScore * lossPercent)) : 0);
        if (wasKilledByPlayer) {
            if (lost > 0) {
                killer.addScore(lost);
            }
            killer.killCount = (killer.killCount || 0) + 1;
            killer.sessionPlayerKills = (killer.sessionPlayerKills || 0) + 1;
            if (killer.isBot) {
                markBotKillTargetCooldown(killer, this.id, this.lastDiedTime);
            }
            killer.sendStatsUpdate();
        }

        // Send death notification — handle cases where killer may be null (admin kill)
        let killerType = 0;
        if (killer instanceof Player) killerType = 1;
        else if (killer && typeof killer.type !== 'undefined') killerType = 2;

        wss.clients.forEach(ws => {
            if (ws.id === this.id) {
                const pw = ws.packetWriter;
                pw.reset();
                pw.writeU8(6);
                pw.writeU8(killerType);
                if (killerType === 1 && killer && typeof killer.id !== 'undefined') {
                    pw.writeU8(killer.id);
                } else if (killerType === 2 && killer && typeof killer.id !== 'undefined') {
                    pw.writeU16(killer.id);
                } else {
                    pw.writeU16(0);
                }
                ws.send(pw.getBuffer());
                if (deathWorld === WORLD_MAIN) {
                    ws.seenEntities = new Set();
                    ws._pendingSeenEntities = new Set();
                    ws._lastOptionalSyncWorld = null;
                    ws._lastTopLeaderSignature = null;
                    ws._lastMinimapSignature = null;
                    ws._minimapTickCounter = 0;
                    ws.send(buildInitPacket(ws.id, WORLD_MAIN));
                }
            }
        });

        // Drop inventory (except default blade)
        for (let i = 0; i < 35; i++) {
            const type = this.inventory[i] & 0x7F; // Handle thrown rank bit
            const count = this.inventoryCounts[i];
            if (type > 1) { // Drop everything except default blade (rank 1)
                spawnObject(type, deathX, deathY, count, 'player', deathWorld);
            }
        }
        // Drop equipped accessory (it is not stored in inventory while equipped).
        if (this.equippedAccessoryItemType > 0) {
            spawnObject(this.equippedAccessoryItemType, deathX, deathY, 1, 'player', deathWorld);
        }
        if (skullItemType > 0 && wasKilledByPlayer) {
            const skullDrop = spawnObject(skullItemType, deathX, deathY, 1, 'player', deathWorld);
            this.applyDropLaunch(skullDrop, skullItemType, Math.random() * Math.PI * 2, this.lastDiedTime);
        }

        // Reset state
        this.inventory = new Array(35).fill(0);
        this.inventoryCounts = new Array(35).fill(0);
        this.inventory[0] = 1;
        this.inventoryCounts[0] = 1;
        this.baseStrength = dataMap.PLAYERS.baseStrength;
        this.baseMaxHp = dataMap.PLAYERS.maxHealth;
        this.setScore(currentScore - lost);
        this.killCount = 0;
        this.radius = dataMap.PLAYERS.baseRadius;
        this.growthSpurtUntil = 0;
        this.growthSpurtOriginalRadius = null;
        this.damageDebuffMult = 1;
        this.progressShieldActive = false;
        this.knockbackVelocityX = 0;
        this.knockbackVelocityY = 0;
        this.lastKnockbackProcessTime = 0;
        this._forceFullSync = true;
        this.resetBuffs();
        this.recomputeBuffedAttributes({ healByMaxIncrease: false });
        this.hp = this.maxHp;
        this.attacking = false;
        this.keys = { w: 0, a: 0, s: 0, d: 0 };
        this.lastDamager = null;
        this.vikingHitCount = 0;
        this.lastVikingHitTime = 0;
        this.activeAbility = '';
        this.abilityCooldownMs = 0;
        this.lastAbilityUseTime = 0;
        this.staminaBoostUntil = 0;
        this.minotaurSpeedBoostUntil = 0;
        this.minotaurSpeedBoostMult = 1;
        this.equippedAccessoryItemType = 0;
        this.accessoryId = 0;
        if (this.pendingWeaponReturnTimer) {
            clearTimeout(this.pendingWeaponReturnTimer);
            this.pendingWeaponReturnTimer = null;
        }

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    heal(now = performance.now()) {
        const inCombat = now - this.lastCombatTime < 10000;
        const baseRegenIntervalMs = inCombat ? 1600 : 1000; // 60% slower in combat
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        let regenIntervalMs = baseRegenIntervalMs;
        if (accessoryKey === 'heart_shades') {
            const boostActive = now < (this.heartShadesBoostUntil || 0);
            const speedMult = boostActive ? 1.6 : 1.3; // 60% or 30% faster ticks
            regenIntervalMs = Math.max(1, Math.round(baseRegenIntervalMs / speedMult));
        }
        if (now - this.lastHealedTime > regenIntervalMs) {
            this.hp = Math.min(this.hp + this.getRegenAmountPerTick(), this.maxHp);
            this.lastHealedTime = now;
        }
    }

    addScore(points) {
        this.setScore(this.score + points);
    }

    syncLevelFromScore() {
        this.level = Math.max(1, getLevelFromXp(this.score));
    }

    setScore(nextScore) {
        const safeScore = Math.min(1000000000, Math.max(0, Math.floor(Number.isFinite(nextScore) ? nextScore : 0)));
        this.score = safeScore;
        if (safeScore > (this.sessionBestScore || 0)) {
            this.sessionBestScore = safeScore;
        }
        this.syncLevelFromScore();
        void observePlayerLeaderboardScore(this, Date.now());
    }

    resetBuffs() {
        this.buffLevels = { strength: 0, maxHealth: 0, regenSpeed: 0 };
    }

    getTotalBuffPointsEarned() {
        return Math.max(0, ((this.level - 1) * BUFF_POINTS_PER_LEVEL_UP) + BUFF_POINTS_PER_LEVEL_UP);
    }

    getBuffPointsSpent() {
        return (this.buffLevels.strength || 0) +
            (this.buffLevels.maxHealth || 0) +
            (this.buffLevels.regenSpeed || 0);
    }

    getAvailableBuffPoints() {
        return Math.max(0, this.getTotalBuffPointsEarned() - this.getBuffPointsSpent());
    }

    getRegenAmountPerTick() {
        return BASE_REGEN_AMOUNT + ((this.buffLevels.regenSpeed || 0) * REGEN_BUFF_PER_STAGE);
    }

    recomputeBuffedAttributes({ healByMaxIncrease = false } = {}) {
        const prevMaxHp = this.maxHp;
        this.strength = this.baseStrength + ((this.buffLevels.strength || 0) * STRENGTH_BUFF_PER_STAGE);
        const healthScale = this.getCombatScale();
        const rawMaxHp = this.baseMaxHp + ((this.buffLevels.maxHealth || 0) * MAX_HP_BUFF_PER_STAGE);
        this.maxHp = Math.max(1, Math.round(rawMaxHp * healthScale));
        if (healByMaxIncrease && this.maxHp > prevMaxHp) {
            this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - prevMaxHp));
        } else {
            this.hp = Math.min(this.hp, this.maxHp);
        }
    }

    tryUpgradeBuff(attributeType) {
        const attributeMap = {
            1: 'strength',
            2: 'maxHealth',
            3: 'regenSpeed'
        };
        const key = attributeMap[attributeType];
        if (!key) return false;
        if ((this.buffLevels[key] || 0) >= BUFF_STAGE_MAX) return false;
        if (this.getAvailableBuffPoints() <= 0) return false;

        this.buffLevels[key] += 1;
        this.recomputeBuffedAttributes({ healByMaxIncrease: key === 'maxHealth' });
        this.sendStatsUpdate();
        return true;
    }

    resolveCollisions(worldPlayers = null, worldMobs = null, worldStructures = null, now = performance.now()) {
        recordResolveCollisionCall();
        if (!this.isAlive) return;
        const world = this.world || 'main';
        const players = Array.isArray(worldPlayers) ? worldPlayers : Object.values(ENTITIES.PLAYERS);
        const mobs = Array.isArray(worldMobs) ? worldMobs : Object.values(ENTITIES.MOBS);

        // Player vs Player
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (!p || p.id === this.id || !p.isAlive) continue;
            if ((p.world || 'main') !== world) continue;
            if (this.isInvisible || p.isInvisible) continue;
            if (p.id < this.id) continue;
            const nearDx = p.x - this.x;
            const nearDy = p.y - this.y;
            const nearRadius = (this.radius || 30) + (p.radius || 30) + 20;
            if ((nearDx * nearDx + nearDy * nearDy) > (nearRadius * nearRadius)) continue;
            if (!colliding(this, p, 15)) continue;
            const dist = Math.sqrt((nearDx * nearDx) + (nearDy * nearDy)) || 1;
            const pushScale = 3 / dist;
            const dx = nearDx * pushScale;
            const dy = nearDy * pushScale;
            this.x -= dx; this.y -= dy;
            p.x += dx; p.y += dy;
            this.recordLatestCollisionDebug(COLLISION_DEBUG_PLAYER, p.id);
        }

        this.touchingSafeZone = false;
        const safeZone = worldStructures?.safeZone || getSafeZoneStructure(world);
        if (safeZone) {
            const safeDx = safeZone.x - this.x;
            const safeDy = safeZone.y - this.y;
            // Keep the touch range tight so players quickly exit safe-zone state when they step out.
            const safeRange = (safeZone.radius || 0) + (this.radius || 0) + 2;
            if ((safeDx * safeDx + safeDy * safeDy) <= (safeRange * safeRange) && colliding(this, safeZone)) {
                this.touchingSafeZone = true;
                this.recordLatestCollisionDebug(COLLISION_DEBUG_STRUCTURE, safeZone.id);
            }
        }

        const inCombat = now - this.lastCombatTime < 10000;
        if (inCombat && pushEntityOutOfSafeZone(this, world)) {
            this.touchingSafeZone = false;
        }

        // Player vs Mobs
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            if (!m) continue;
            if ((m.world || 'main') !== world) continue;
            if (m.hp <= 0) continue;

            if (m.type === 5 && !m.isAlarmed && !this.hasShield && !this.invincible && !this.isHidden && !this.isInvisible && !this.isPvpProtected()) {
                const dx = m.x - this.x;
                const dy = m.y - this.y;
                const cloakMult = ACCESSORY_KEYS[this.accessoryId] === 'dark_cloak' ? 0.5 : 1;
                const detectRange = 400 * cloakMult;
                if (dx * dx + dy * dy < detectRange * detectRange && m.x > MAP_SIZE[0] * 0.47 && this.x > MAP_SIZE[0] * 0.47) {
                    m.alarm(this, 'proximity');
                }
            }

            let buffer = 15;
            if (m.type == 5) buffer -= 20; // polar bear larger collision buffer
            const hitDx = m.x - this.x;
            const hitDy = m.y - this.y;
            const nearRange = (m.radius || 0) + (this.radius || 0) + 25;
            if ((hitDx * hitDx + hitDy * hitDy) > (nearRange * nearRange)) continue;
            if (colliding(m, this, buffer)) {
                this.recordLatestCollisionDebug(COLLISION_DEBUG_MOB, m.id);
                const dist = Math.sqrt((hitDx * hitDx) + (hitDy * hitDy)) || 1;
                const pushScale = 10 / dist;
                const dx = hitDx * pushScale;
                const dy = hitDy * pushScale;
                this.x -= dx; this.y -= dy;
                m.x += dx; m.y += dy;

                const mHealthRatio = m.maxHp ? (m.hp / m.maxHp) : 1;
                const mobConfig = dataMap.MOBS[m.type] || {};
                const contactDamage = Number.isFinite(m.contactDamage) ? m.contactDamage : mobConfig.damage;
                const isPolarBear = m.type === 5;
                const isCow = m.type === 3;
                const hasMeleeCooldown = isPolarBear || isCow || Number.isFinite(contactDamage);
                const meetsHealthGate = (isPolarBear || m.aggroTowardPlayers || m.type === 8 || m.type === 11 || m.type === 13 || m.type === 16 || m.type === 17) ? true : (mHealthRatio >= 0.6);
                const meleeReady = !hasMeleeCooldown || (now - (m.lastMeleeAttackTime || 0) >= 600);

                const allowPolarBearHit = isPolarBear
                    && this.progressShieldActive
                    && !this.touchingSafeZone
                    && m.alarmReason === 'hit'
                    && m.lastHitById === this.id;
                const allowRootWalkerHit = m.type === 7 && (m.target?.id === this.id || m.lastHitById === this.id);
                const allowYetiHit = m.type === 8 && (m.target?.id === this.id || m.lastHitById === this.id);
                const allowDuneHit = m.type === 16 && (m.target?.id === this.id || m.lastHitById === this.id);
                const allowInfernoHit = m.type === 17 && (m.target?.id === this.id || m.lastHitById === this.id);
                const isTargetedByMob = m.target?.id === this.id || ((m.type === 7 || m.type === 8 || m.type === 16 || m.type === 17) && m.lastHitById === this.id);
                const canMobDealContactDamage = mobConfig.isNeutral || m.aggroTowardPlayers || m.type === 7 || m.type === 8 || m.type === 16 || m.type === 17;
                if (m.isAlarmed && canMobDealContactDamage && isTargetedByMob && (!this.hasShield || allowPolarBearHit || allowRootWalkerHit || allowYetiHit || allowDuneHit || allowInfernoHit) && !this.isHidden && !this.isInvisible && meetsHealthGate && meleeReady) {
                    const mobDmgMult = Math.max(0.1, m.damageDebuffMult || 1);
                    const tookDamage = this.damage((contactDamage || 0) * mobDmgMult, m);
                    if (tookDamage && hasMeleeCooldown) {
                        m.lastMeleeAttackTime = now;
                    }
                    if (tookDamage && ACCESSORY_KEYS[this.accessoryId] === 'bush_cloak') {
                        poison(m, 5, 750, 2000, this, true);
                    }
                }
            }
        }
    }

    // --- Networking ---

    sendStatsUpdate() {
        const ws = wsById.get(this.id);
        if (!ws) return;

        const weaponRank = this.weapon.rank || 1;
        const projDmg = getWeaponAttackStats(weaponRank)?.damage || 0;
        const damageScale = this.getCombatScale();
        const dmgHit = Math.round((this.strength + projDmg) * 1.15 * damageScale);
        const inCombat = performance.now() - this.lastCombatTime < 10000;
        const abilityCooldownMs = Math.max(0, this.abilityCooldownMs || 0);
        const elapsedSinceAbilityUse = performance.now() - (this.lastAbilityUseTime || 0);
        const abilityCooldownRemainingMs = abilityCooldownMs > 0
            ? Math.max(0, abilityCooldownMs - elapsedSinceAbilityUse)
            : 0;

        ws.packetWriter.reset();
        ws.packetWriter.writeU8(18);
        ws.packetWriter.writeU16(dmgHit);
        ws.packetWriter.writeU16(Math.round(dmgHit / 1.5)); // dmgThrow (1.5x weaker than hit)
        ws.packetWriter.writeU16(Math.round(this.speed));
        ws.packetWriter.writeU16(Math.floor(this.hp));
        ws.packetWriter.writeU16(Math.floor(this.maxHp));
        ws.packetWriter.writeU32(this.getTotalCoins());
        ws.packetWriter.writeU16(Math.max(0, this.killCount || 0));
        ws.packetWriter.writeU8(inCombat ? 1 : 0);
        ws.packetWriter.writeU8(this.vikingHitCount || 0);
        ws.packetWriter.writeU16(Math.min(65535, Math.floor(abilityCooldownMs)));
        ws.packetWriter.writeU16(Math.min(65535, Math.floor(abilityCooldownRemainingMs)));
        ws.packetWriter.writeU16(Math.min(65535, this.level | 0));
        ws.packetWriter.writeU16(Math.min(65535, this.getAvailableBuffPoints()));
        ws.packetWriter.writeU8(Math.min(BUFF_STAGE_MAX, this.buffLevels.strength || 0));
        ws.packetWriter.writeU8(Math.min(BUFF_STAGE_MAX, this.buffLevels.maxHealth || 0));
        ws.packetWriter.writeU8(Math.min(BUFF_STAGE_MAX, this.buffLevels.regenSpeed || 0));
        ws.packetWriter.writeU16(Math.min(65535, this.getRegenAmountPerTick()));
        ws.send(ws.packetWriter.getBuffer());
    }

    sendInventoryUpdate() {
        const ws = wsById.get(this.id);
        if (!ws) return;

        ws.packetWriter.reset();
        ws.packetWriter.writeU8(15);
        ws.packetWriter.writeU8(this.selectedSlot);
        for (let i = 0; i < 35; i++) {
            ws.packetWriter.writeU8(this.inventory[i]);
            ws.packetWriter.writeU32(this.inventoryCounts[i]);
        }
        ws.send(ws.packetWriter.getBuffer());
    }

    selectSlot(index) {
        if (this.swingState > 0) return;
        if (index >= 0 && index < 35) {
            this.selectedSlot = index;
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    swapSlots(idx1, idx2) {
        if (this.swingState > 0 && (idx1 === this.selectedSlot || idx2 === this.selectedSlot)) return;
        if (idx1 >= 0 && idx1 < 35 && idx2 >= 0 && idx2 < 35 && idx1 !== idx2) {
            const item1 = this.inventory[idx1];
            const item2 = this.inventory[idx2];
            const count1 = this.inventoryCounts[idx1];
            const count2 = this.inventoryCounts[idx2];
            if (item1 > 0 && item1 === item2 && count1 > 0 && count2 > 0) {
                const stackLimit = getInventoryStackLimit(item1);
                if (stackLimit > 1 && count2 < stackLimit) {
                    const moved = Math.min(count1, stackLimit - count2);
                    if (moved > 0) {
                        this.inventoryCounts[idx2] += moved;
                        this.inventoryCounts[idx1] -= moved;
                        if (this.inventoryCounts[idx1] <= 0) {
                            this.inventory[idx1] = 0;
                            this.inventoryCounts[idx1] = 0;
                            if (idx1 === this.selectedSlot) {
                                this.manuallyUnequippedWeapon = false;
                            }
                        }
                        this.sendInventoryUpdate();
                        this.sendStatsUpdate();
                        return;
                    }
                }
            }
            [this.inventory[idx1], this.inventory[idx2]] = [this.inventory[idx2], this.inventory[idx1]];
            [this.inventoryCounts[idx1], this.inventoryCounts[idx2]] = [this.inventoryCounts[idx2], this.inventoryCounts[idx1]];
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    equipAccessoryFromItemType(itemType, fromSlot = -1) {
        if (!isAccessoryItemType(itemType)) return;
        const accessoryId = accessoryIdFromItemType(itemType);
        if (!isAccessoryId(accessoryId)) return;

        if (fromSlot < 0 || fromSlot >= this.inventory.length) return;
        if (this.inventory[fromSlot] !== itemType || this.inventoryCounts[fromSlot] <= 0) return;

        if (this.equippedAccessoryItemType) {
            const emptySlot = this.inventory.indexOf(0);
            if (emptySlot === -1) return;
            this.inventory[emptySlot] = this.equippedAccessoryItemType;
            this.inventoryCounts[emptySlot] = 1;
        }

        this.inventory[fromSlot] = 0;
        this.inventoryCounts[fromSlot] = 0;
        this.accessoryId = accessoryId;
        this.equippedAccessoryItemType = itemType;
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    unequipAccessory(preferredSlot = -1) {
        if (!this.equippedAccessoryItemType) {
            this.accessoryId = 0;
            return;
        }

        let targetSlot = -1;
        if (Number.isInteger(preferredSlot) &&
            preferredSlot >= 0 &&
            preferredSlot < this.inventory.length &&
            this.inventory[preferredSlot] === 0) {
            targetSlot = preferredSlot;
        } else {
            targetSlot = this.inventory.indexOf(0);
        }
        if (targetSlot === -1) return;

        this.inventory[targetSlot] = this.equippedAccessoryItemType;
        this.inventoryCounts[targetSlot] = 1;
        this.equippedAccessoryItemType = 0;
        this.accessoryId = 0;
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    dropEquippedAccessory() {
        if (!this.canDropItems()) return;
        if (!this.equippedAccessoryItemType) {
            this.accessoryId = 0;
            return;
        }

        const itemType = this.equippedAccessoryItemType;
        const dropObj = spawnObject(itemType, this.x, this.y, 1, 'player', this.world || 'main');
        this.applyDropLaunch(dropObj, itemType);

        this.equippedAccessoryItemType = 0;
        this.accessoryId = 0;
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }
}
