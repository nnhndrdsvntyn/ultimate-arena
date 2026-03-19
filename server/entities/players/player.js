import {
    ENTITIES
} from '../../game.js';
import {
    dataMap,
    isSwordRank,
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
    getXpShopItemConfig
} from '../../../public/shared/datamap.js';
import {
    wss,
    wsById
} from '../../../server.js';
import {
    playSfx,
    colliding,
    getId,
    poison,
    pushEntityOutOfSafeZone,
    getSafeZoneStructure,
    getWorldEnvironmentData,
    emitDamageIndicatorFx
} from '../../helpers.js';
import { recordResolveCollisionCall } from '../../debug.js';
import {
    Entity
} from '../entity.js';
import {
    MAP_SIZE,
    spawnObject
} from '../../game.js';

const TUTORIAL_PACKET_OBJECTIVE = 26;
const TUTORIAL_PACKET_COMPLETE = 27;
const DROP_OWNER_PICKUP_LOCK_MS = 700;
const DROP_INITIAL_PUSH = 18;
const DROP_FINAL_PUSH = 90;
const DROP_TRAVEL_TICKS = 4;
const BUFF_STAGE_MAX = 10;
const BUFF_POINTS_PER_LEVEL_UP = 1;
const STRENGTH_BUFF_PER_STAGE = 2;
const MAX_HP_BUFF_PER_STAGE = 12;
const REGEN_BUFF_PER_STAGE = 1;
const BASE_REGEN_AMOUNT = 5;
const DIAGONAL_MOVE_SCALE = Math.SQRT1_2 * 1.1;
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
    'Attack by holding down your left mouse button.',
    `Throw your weapon by pressing the "E" key on your keyboard.`,
    'Attack and break this chest.',
    'Pick up the dropped coins by touching them.',
    'Open the shop and buy the branch sword.',
    "Equip the new branch sword by clicking its slot or pressing the number of the slot on your keyboard. (1-5)",
    'Eliminate the pig!',
    'Good job! Tutorial complete.'
];

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

        // --- Social & Movement ---
        this.username = '';
        this.chatMessage = '';
        this.keys = { w: 0, a: 0, s: 0, d: 0 };

        ENTITIES.PLAYERS[id] = this;

        // Sync initial state
        setTimeout(() => {
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }, 100);
    }

    // --- Core Logic ---

    process(worldPlayers = null, worldMobs = null, worldCoins = null) {
        const now = performance.now();
        this.move(now);
        this.resolveCollisions(worldPlayers, worldMobs, now);
        this.clamp();
        this.updateEnvironment(now);
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
            cowId: null,
            cowSpawned: false,
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

    ensureTutorialCow() {
        if (!this.tutorial) return;
        if (this.tutorial.cowSpawned) return;
        const existing = this.tutorial.cowId ? ENTITIES.MOBS[this.tutorial.cowId] : null;
        if (existing) return;
        const spawnDist = this.radius + 220;
        const cowX = Math.max(100, Math.min(MAP_SIZE[0] - 100, Math.round(this.x + Math.cos(this.angle || 0) * spawnDist)));
        const cowY = Math.max(100, Math.min(MAP_SIZE[1] - 100, Math.round(this.y + Math.sin(this.angle || 0) * spawnDist)));
        const cowId = getId('MOBS');
        ENTITIES.newEntity({
            entityType: 'mob',
            id: cowId,
            x: cowX,
            y: cowY,
            type: 2,
            world: this.world || 'main'
        });
        const cow = ENTITIES.MOBS[cowId];
        if (!cow) return;
        cow.noRespawn = true;
        // Ensure first render orientation is deterministic and matches movement.
        cow.angle = Math.atan2(this.y - cow.y, this.x - cow.x);
        cow.lastTurnTime = performance.now();
        cow.nextTurnDelay = Math.floor(Math.random() * 3001) + 3000;
        this.tutorial.cowId = cow.id;
        this.tutorial.cowSpawned = true;

        // Force a full mob sync for this specific cow (ID may be reused).
        for (const client of wss.clients) {
            if (client.id !== this.id) continue;
            if (!client.seenEntities) continue;
            client.seenEntities.delete('m' + cowId);
        }
    }

    processTutorial(now = performance.now()) {
        this.ensureTutorialState();
        if (!this.tutorial || this.tutorial.finished || !this.isAlive) return;

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
                if (!this.tutorial.cowSpawned) {
                    this.ensureTutorialCow();
                    break;
                }
                if (this.tutorial.cowId) {
                    const cow = ENTITIES.MOBS[this.tutorial.cowId];
                    if (!cow) this.advanceTutorialStep();
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
        let dx = 0;
        let dy = 0;
        if (this.keys.w) dy -= 1;
        if (this.keys.s) dy += 1;
        if (this.keys.a) dx -= 1;
        if (this.keys.d) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const moveScale = (dx !== 0 && dy !== 0) ? (this.speed * DIAGONAL_MOVE_SCALE) : this.speed;
            dx *= moveScale;
            dy *= moveScale;
            this.x += dx;
            this.y += dy;
        }
    }

    spectate(now = performance.now()) {
        const topPlayer = Object.values(ENTITIES.PLAYERS)
            .filter(p => p.isAlive && (p.world || 'main') === (this.world || 'main'))
            .sort((a, b) => b.score - a.score)[0];

        if (topPlayer) {
            this.x = topPlayer.x;
            this.y = topPlayer.y;
        } else {
            // Roam randomly if no other player is in game.
            if (now - this.lastProcessTime > 7500) {
                this.lastProcessTime = now;
                this.angle = Math.random() * Math.PI * 2;
            }
            this.x = Math.max(0, Math.min(MAP_SIZE[0], this.x + Math.cos(this.angle) * 10));
            this.y = Math.max(0, Math.min(MAP_SIZE[1], this.y + Math.sin(this.angle) * 10));
        }
    }

    updateEnvironment(now = performance.now()) {
        const inTutorial = this.isTutorialWorld();
        const waterXMin = MAP_SIZE[0] * 0.47;
        const waterXMax = MAP_SIZE[0] * 0.53;
        let onBridge = false;
        const world = this.world || 'main';
        if (!inTutorial) {
            const env = getWorldEnvironmentData(world);
            if (this.x >= waterXMin && this.x <= waterXMax) {
                for (let i = 0; i < env.bridgeBands.length; i++) {
                    const bridgeBand = env.bridgeBands[i];
                    if (this.y >= bridgeBand.minY && this.y <= bridgeBand.maxY) {
                        onBridge = true;
                        break;
                    }
                }
            }
            this.isHidden = false;
            for (let i = 0; i < env.bushIds.length; i++) {
                const bush = ENTITIES.STRUCTURES[env.bushIds[i]];
                if (!bush) continue;
                const range = (bush.radius || 0) + (this.radius || 0);
                const dx = bush.x - this.x;
                const dy = bush.y - this.y;
                if ((dx * dx + dy * dy) > (range * range)) continue;
                if (colliding(bush, this)) {
                    this.isHidden = true;
                    break;
                }
            }
        } else {
            this.isHidden = false;
        }

        this.inWater = !inTutorial && this.x > waterXMin && this.x < waterXMax && !this.touchingSafeZone && !onBridge;

        const baseSpeed = this.defaultSpeed;
        const speedBoostMult = this.isMinotaurSpeedBoostActive(now) ? this.minotaurSpeedBoostMult : 1;
        if (this.inWater) {
            this.speed = baseSpeed * 0.5 * speedBoostMult;
            const dx = (MAP_SIZE[0] / 2) - this.x;
            this.x += dx * 0.005;
            this.y += 3;
        } else {
            this.speed = baseSpeed * speedBoostMult;
        }
    }

    updateEquippedState(now = performance.now()) {
        const cooldown = now - this.lastThrowSwordTime < this.throwSwordCoolDownTime;
        const inCombat = now - this.lastCombatTime < 10000;
        // Weapons stay sheathed in safe zone unless in combat.
        const safeZoneLocksWeapon = this.touchingSafeZone && !inCombat;
        const invalidEnv = this.inWater || safeZoneLocksWeapon;
        this.hasWeapon = !cooldown && !invalidEnv && !this.manuallyUnequippedWeapon && isSwordRank(this.weapon.rank);
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
        const baseOverride = (typeof this.viewRangeOverride === 'number')
            ? this.viewRangeOverride
            : this.baseViewRangeMult;
        const needsRecompute = !accessoryState
            || accessoryState.accessoryId !== this.accessoryId
            || accessoryState.radius !== radius
            || accessoryState.baseOverride !== baseOverride
            || accessoryState.staminaBoostActive !== staminaBoostActive
            || Math.abs((accessoryState?.blindMult ?? 1) - blindMult) > 0.001;

        if (needsRecompute) {
            const accessoryMult = dataMap.ACCESSORIES[accessoryKey]?.viewRangeMult || 1;
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const radiusScale = Math.max(0.1, radius / baseRadius);
            this.viewRangeMult = Math.max(0.1, baseOverride * accessoryMult * radiusScale * blindMult);
            const swingMult = staminaBoostActive ? 0.7 : 1;
            this.attackCooldownTime = Math.max(100, dataMap.PLAYERS.baseAttackCooldown * swingMult * radiusScale);
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
                baseOverride,
                staminaBoostActive,
                blindMult
            };
        }
        if (accessoryKey !== 'viking-hat' && this.vikingHitCount !== 0) {
            this.vikingHitCount = 0;
            this.lastVikingHitTime = 0;
            this.sendStatsUpdate();
        }
        if (accessoryKey === 'viking-hat' && this.vikingHitCount > 0) {
            if (now - (this.lastVikingHitTime || 0) >= 5000) {
                this.vikingHitCount = 0;
                this.lastVikingHitTime = 0;
                this.sendStatsUpdate();
            }
        }
    }

    getEquippedAbility() {
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        if (accessoryKey === 'bush-cloak') return 'poison_blast';
        if (accessoryKey === 'pirate-hat') return 'stamina_boost';
        if (accessoryKey === 'minotaur-hat') return 'energy_burst';
        if (accessoryKey === 'alien-antennas') return 'lightning_shot';
        if (accessoryKey === 'dark-cloak') return 'smoke_blast';
        if (accessoryKey === 'viking-hat') return 'growth_spurt';
        if (accessoryKey === 'sunglasses') return 'invisibility';
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
            if (isSwordRank(rank) && rank > best) best = rank;
        }
        return best;
    }

    shouldHaveProgressShield() {
        const bestRank = this.getBestSwordRank();
        if (bestRank <= 1) return true;
        if ((this.score || 0) < 1000) return true;
        return false;
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
            const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
            const radiusScale = Math.max(0.1, (this.radius || baseRadius) / baseRadius);
            const stepIntervalMs = 50 * radiusScale;
            if (!this.lastSwingAnimStepTime) this.lastSwingAnimStepTime = now;
            if (now - this.lastSwingAnimStepTime >= stepIntervalMs) {
                const steps = Math.max(1, Math.floor((now - this.lastSwingAnimStepTime) / stepIntervalMs));
                this.swingState = Math.floor(this.swingState + steps);
                this.lastSwingAnimStepTime = now;
            }
            this.speed = 0;
        }
        if (this.swingState >= 7) {
            this.swingState = 0;
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
        const lowScore = this.score < PVP_PROTECTION_SCORE;
        const weakGear = this.getBestSwordRank() <= 1;
        return lowScore || weakGear;
    }

    canEngagePvpWith(otherPlayer) {
        if (!(otherPlayer instanceof Player)) return true;
        // Any protected entity (bot or human) blocks PvP damage in both directions.
        return !(this.isPvpProtected() || otherPlayer.isPvpProtected());
    }

    // --- Actions ---

    attack(now = performance.now()) {
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
        const canAttack = this.attacking && !shieldBlocksAttack && this.isAlive && this.hasWeapon && !this.inWater && curRank < 128 && isSwordRank(baseRank);

        if (!canAttack || now - this.lastAttackTime < this.attackCooldownTime) return;

        this.lastAttackTime = now;
        this.swingState = 1;
        this.lastSwingAnimStepTime = now;
        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('sword-slash'), 1000);

        const groupId = Math.random();
        for (let angleOffset = -Math.PI / 3; angleOffset <= Math.PI / 3; angleOffset += Math.PI / 12) {
            this.spawnProjectile(angleOffset, false, groupId);
        }
    }

    throwSword() {
        if (this.tutorial && !this.tutorial.finished && this.tutorial.stage < 2) return;

        const now = performance.now();
        const curRank = this.inventory[this.selectedSlot];
        const baseRank = curRank & 0x7F;
        // Throwing is blocked only by safe-zone weapon lock (hasWeapon covers that), water, cooldown, and ghost rank.
        const canThrow = this.isAlive && this.hasWeapon && this.swingState === 0 && !this.inWater && curRank < 128 && isSwordRank(baseRank);

        if (!canThrow || now - this.lastThrowSwordTime < this.throwSwordCoolDownTime) return;

        this.lastThrowSwordTime = now;
        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('throw'), 1000);

        this.spawnProjectile(0, true, Math.random());

        // Mark as ghost (thrown)
        this.inventory[this.selectedSlot] |= 0x80;

        if (this.pendingWeaponReturnTimer) {
            clearTimeout(this.pendingWeaponReturnTimer);
            this.pendingWeaponReturnTimer = null;
        }
        this.pendingWeaponReturnTimer = setTimeout(() => {
            this.pendingWeaponReturnTimer = null;
            this.returnWeapon(baseRank);
        }, this.throwSwordCoolDownTime);

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    spawnProjectile(angleOffset, thrown, groupId) {
        const projectileAngle = this.angle + angleOffset;
        let type = thrown ? -1 : this.weapon.rank;
        if (!dataMap.PROJECTILES[this.weapon.rank] && !thrown) type = 1;

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

    dropItemFromSlot(slot) {
        if (slot < 0 || slot >= this.inventory.length) return;
        const rank = this.inventory[slot];
        const count = this.inventoryCounts[slot];
        if (rank <= 0 || count <= 0) return;

        const baseType = rank & 0x7F;

        const dropObj = spawnObject(baseType, this.x, this.y, count, 'player', this.world || 'main');
        this.applyDropLaunch(dropObj, baseType);

        this.inventory[slot] = 0;
        this.inventoryCounts[slot] = 0;
        if (slot === this.selectedSlot) {
            this.manuallyUnequippedWeapon = false;
        }
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    tryPickup(now = performance.now(), worldObjects = null) {
        if (!this.isAlive) return;
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
        if ((now - (obj.spawnTime || 0)) < PICKUP_DELAY_MS) return false;
        if (!this.canPickupDroppedObject(obj, now)) return false;
        const objectCfg = dataMap.OBJECTS[obj.type];
        if (!objectCfg?.isEphemeral) return false;
        const pickupRange = (this.radius || 0) + (obj.radius || 0) + 15;
        const objDx = this.x - obj.x;
        const objDy = this.y - obj.y;
        if ((objDx * objDx + objDy * objDy) > (pickupRange * pickupRange)) return false;
        if (!colliding(this, obj)) return false;

        const isCoin = isCoinObjectType(obj.type);
        if (isCoin) {
            if (obj.collectorId) return false;
            return !!obj.startCollection(this);
        }

        if (objectCfg.stackable) {
            for (let i = 0; i < this.inventory.length; i++) {
                if (this.inventory[i] !== obj.type) continue;
                this.inventoryCounts[i] += (obj.amount || 1);
                ENTITIES.deleteEntity('object', obj.id);
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
        if (!isSwordRank(incomingRank)) return false;
        let replaceSlot = -1;
        let lowestRank = incomingRank;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventoryCounts[i] <= 0) continue;
            const heldRank = this.inventory[i] & 0x7F;
            if (!isSwordRank(heldRank)) continue;
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

    buyItem(rank) {
        if (!this.isAlive || !isSwordRank(rank)) return;

        const prices = [30, 50, 90, 150, 200, 260, 340, 400];
        const cost = prices[rank - 1];

        if (this.getTotalCoins() >= cost) {
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
        const cost = dataMap.ACCESSORY_PRICES?.[accessoryKey] || dataMap.ACCESSORY_PRICE || 30;
        if (this.getTotalCoins() < cost) return;

        const emptySlot = this.inventory.indexOf(0);
        if (emptySlot === -1) return;

        this.deductCoins(cost);
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

    sellItems(slotIndices) {
        if (!this.isAlive || !Array.isArray(slotIndices) || slotIndices.length === 0) return;

        let totalSellPrice = 0;
        let soldAny = false;

        for (const slotIndex of slotIndices) {
            if (slotIndex < 0 || slotIndex >= 35) continue;

            const rank = this.inventory[slotIndex] & 0x7F;
            if (!isSwordRank(rank)) continue;

            const shopItem = dataMap.SHOP_ITEMS.find(item => item.id === rank);
            const unitSellPrice = shopItem ? Math.floor(shopItem.price * 0.5) : (rank === 9 ? 500 : 0);
            if (unitSellPrice <= 0) continue;
            const sellPrice = unitSellPrice * this.inventoryCounts[slotIndex];
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

    // --- Interaction ---

    damage(health, attacker) {
        if (this.invincible || performance.now() - this.lastDamagedTime < 200) return false;
        if (attacker instanceof Player && !this.canEngagePvpWith(attacker)) {
            return false;
        }

        let finalHealthLoss = health;
        if (ACCESSORY_KEYS[this.accessoryId] === 'minotaur-hat') {
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
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('bubble-pop'), 1000);
        } else {
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('hurt'), 1000);
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

        this.lastCombatTime = -Infinity;
        this.wasInCombat = false;

        this.sendStatsUpdate();
        this.isAlive = false;

        const currentScore = this.score;
        const lossPercent = 0.25 + (Math.random() * 0.10); // 25% - 35%
        const lost = Math.min(currentScore, currentScore > 0 ? Math.max(1, Math.floor(currentScore * lossPercent)) : 0);
        if (killer instanceof Player && killer.id !== this.id) {
            if (lost > 0) {
                killer.addScore(lost);
            }
            killer.killCount = (killer.killCount || 0) + 1;
            if (killer.isBot) {
                markBotKillTargetCooldown(killer, this.id, this.lastDiedTime);
            }
            killer.sendStatsUpdate();
        }

        // Send death notification — handle cases where killer may be null (admin kill)
        const killerTypeMap = { player: 1, mob: 2 };
        let killerType = 0;
        if (killer && killer.constructor && killer.constructor.name) {
            killerType = killerTypeMap[killer.constructor.name.toLowerCase()] || 0;
        }

        wss.clients.forEach(ws => {
            if (ws.id === this.id) {
                const pw = ws.packetWriter;
                pw.reset();
                pw.writeU8(6);
                pw.writeU8(killerType);
                if (killerType === 1 && killer && typeof killer.id !== 'undefined') pw.writeU8(killer.id);
                else if (killerType === 2 && killer && typeof killer.id !== 'undefined') pw.writeU16(killer.id);
                ws.send(pw.getBuffer());
            }
        });

        // Drop inventory (except default blade)
        for (let i = 0; i < 35; i++) {
            const type = this.inventory[i] & 0x7F; // Handle thrown rank bit
            const count = this.inventoryCounts[i];
            if (type > 1) { // Drop everything except default blade (rank 1)
                spawnObject(type, this.x, this.y, count, 'player', this.world || 'main');
            }
        }
        // Drop equipped accessory (it is not stored in inventory while equipped).
        if (this.equippedAccessoryItemType > 0) {
            spawnObject(this.equippedAccessoryItemType, this.x, this.y, 1, 'player', this.world || 'main');
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
        const regenIntervalMs = inCombat ? 1600 : 1000; // 60% slower in combat
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
        this.syncLevelFromScore();
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

    resolveCollisions(worldPlayers = null, worldMobs = null, now = performance.now()) {
        recordResolveCollisionCall();
        if (!this.isAlive) return;
        const world = this.world || 'main';
        const players = Array.isArray(worldPlayers) ? worldPlayers : Object.values(ENTITIES.PLAYERS);
        const mobs = Array.isArray(worldMobs) ? worldMobs : Object.values(ENTITIES.MOBS);

        // Player vs Player
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (!p || p.id === this.id || !p.isAlive) continue;
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
        }

        this.touchingSafeZone = false;
        const safeZone = getSafeZoneStructure(world);
        if (safeZone) {
            const safeDx = safeZone.x - this.x;
            const safeDy = safeZone.y - this.y;
            // Keep the touch range tight so players quickly exit safe-zone state when they step out.
            const safeRange = (safeZone.radius || 0) + (this.radius || 0) + 2;
            if ((safeDx * safeDx + safeDy * safeDy) <= (safeRange * safeRange) && colliding(this, safeZone)) {
                this.touchingSafeZone = true;
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

            if (m.type === 5 && !m.isAlarmed && !this.hasShield && !this.invincible && !this.isHidden && !this.isInvisible && !this.isPvpProtected()) {
                const dx = m.x - this.x;
                const dy = m.y - this.y;
                const cloakMult = ACCESSORY_KEYS[this.accessoryId] === 'dark-cloak' ? 0.5 : 1;
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
                const dist = Math.sqrt((hitDx * hitDx) + (hitDy * hitDy)) || 1;
                const pushScale = 10 / dist;
                const dx = hitDx * pushScale;
                const dy = hitDy * pushScale;
                this.x -= dx; this.y -= dy;
                m.x += dx; m.y += dy;

                const mHealthRatio = m.maxHp ? (m.hp / m.maxHp) : 1;
                const isPolarBear = m.type === 5;
                const isCow = m.type === 3;
                const hasMeleeCooldown = isPolarBear || isCow;
                const meetsHealthGate = isPolarBear ? true : (mHealthRatio >= 0.6);
                const meleeReady = !hasMeleeCooldown || (now - (m.lastMeleeAttackTime || 0) >= 600);

                const allowPolarBearHit = isPolarBear
                    && this.progressShieldActive
                    && !this.touchingSafeZone
                    && m.alarmReason === 'hit'
                    && m.lastHitById === this.id;
                if (m.isAlarmed && dataMap.MOBS[m.type].isNeutral && m.target?.id === this.id && (!this.hasShield || allowPolarBearHit) && !this.isHidden && !this.isInvisible && meetsHealthGate && meleeReady) {
                    const mobDmgMult = Math.max(0.1, m.damageDebuffMult || 1);
                    const tookDamage = this.damage(dataMap.MOBS[m.type].damage * mobDmgMult, m);
                    if (tookDamage && hasMeleeCooldown) {
                        m.lastMeleeAttackTime = now;
                    }
                    if (tookDamage && ACCESSORY_KEYS[this.accessoryId] === 'bush-cloak') {
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
        const projDmg = dataMap.PROJECTILES[weaponRank]?.damage || 0;
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
        if (index >= 0 && index < 35) {
            this.selectedSlot = index;
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    swapSlots(idx1, idx2) {
        if (idx1 >= 0 && idx1 < 35 && idx2 >= 0 && idx2 < 35 && idx1 !== idx2) {
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




