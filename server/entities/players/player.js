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
    poison
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
const TUTORIAL_STEP_TEXT = [
    'Move around using the AWSD Keys.',
    'Attack using your left mouse button.',
    "Throw your weapon using the 'E' button.",
    'Attack and break this chest.',
    'Pick up the dropped coins by touching them.',
    'Open the shop and buy the branch sword.',
    "Equip the new branch sword by clicking its slot or pressing the number of the slot on your keyboard. (1-5)",
    'Eliminate the pig!',
    'Good job! Tutorial complete.'
];

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

    process() {
        this.move();
        this.resolveCollisions();
        this.clamp();
        this.updateEnvironment();
        this.updateEquippedState();
        this.applyAccessoryEffects();
        this.updateAnimations();
        this.syncSpeedStat();
        this.heal();
        this.attack();
        this.updateChat();
        this.handleAutoPickup();
        this.processTutorial();

        const currentlyInCombat = performance.now() - this.lastCombatTime < 10000;
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

    processTutorial() {
        this.ensureTutorialState();
        if (!this.tutorial || this.tutorial.finished || !this.isAlive) return;

        switch (this.tutorial.stage) {
            case 0: {
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
                    this.tutorial.stage7StartedAt = performance.now();
                }
                if (performance.now() - this.tutorial.stage7StartedAt >= 1200) {
                    this.completeTutorial();
                }
                break;
            default:
                break;
        }
    }

    move() {
        const now = performance.now();
        if (now - this.lastDiedTime < 1000) return;

        if (!this.isAlive) {
            this.spectate();
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
            const invLen = 1 / Math.sqrt((dx * dx) + (dy * dy));
            const diagonalBoost = (dx !== 0 && dy !== 0) ? 1.1 : 1;
            dx *= invLen * this.speed * diagonalBoost;
            dy *= invLen * this.speed * diagonalBoost;
            this.x += dx;
            this.y += dy;
        }
    }

    spectate() {
        const topPlayer = Object.values(ENTITIES.PLAYERS)
            .filter(p => p.isAlive && (p.world || 'main') === (this.world || 'main'))
            .sort((a, b) => b.score - a.score)[0];

        if (topPlayer) {
            this.x = topPlayer.x;
            this.y = topPlayer.y;
        } else {
            // Roam randomly if no other player is in game.
            if (performance.now() - this.lastProcessTime > 7500) {
                this.lastProcessTime = performance.now();
                this.angle = Math.random() * Math.PI * 2;
            }
            this.x = Math.max(0, Math.min(MAP_SIZE[0], this.x + Math.cos(this.angle) * 10));
            this.y = Math.max(0, Math.min(MAP_SIZE[1], this.y + Math.sin(this.angle) * 10));
        }
    }

    updateEnvironment() {
        const inTutorial = this.isTutorialWorld();
        const waterxr = [MAP_SIZE[0] * 0.47, MAP_SIZE[0] * 0.53];
        let onBridge = false;
        if (!inTutorial) {
            for (const id in ENTITIES.STRUCTURES) {
                const s = ENTITIES.STRUCTURES[id];
                if (!s || s.type !== 1) continue;
                if ((s.world || 'main') !== (this.world || 'main')) continue;
                const cfg = dataMap.STRUCTURES[s.type] || {};
                const bridgeHalfHeight = Math.max(1, Math.floor(cfg.bridgeHalfHeight || 70));
                const bridgeCount = Math.max(1, Math.floor(cfg.bridgeCount || 5));
                const centerBridgeIndex = Math.ceil(bridgeCount / 2);
                const bridgeXMin = waterxr[0];
                const bridgeXMax = waterxr[1];
                const segmentHeight = MAP_SIZE[1] / (bridgeCount + 1);
                for (let i = 1; i <= bridgeCount; i++) {
                    if (i === centerBridgeIndex) continue;
                    const bridgeCenterY = segmentHeight * i;
                    const bridgeBandYMin = bridgeCenterY - bridgeHalfHeight;
                    const bridgeBandYMax = bridgeCenterY + bridgeHalfHeight;
                    const inBridgeBand = this.y >= bridgeBandYMin && this.y <= bridgeBandYMax && this.x >= bridgeXMin && this.x <= bridgeXMax;
                    if (inBridgeBand) {
                        onBridge = true;
                        break;
                    }
                }
                if (onBridge) {
                    break;
                }
            }
        }

        this.inWater = !inTutorial && this.x > waterxr[0] && this.x < waterxr[1] && !this.touchingSafeZone && !onBridge;

        this.isHidden = false;
        for (const id in ENTITIES.STRUCTURES) {
            const s = ENTITIES.STRUCTURES[id];
            if ((s.world || 'main') !== (this.world || 'main')) continue;
            if (s.type === 3 && colliding(s, this)) {
                this.isHidden = true;
                break;
            }
        }

        const baseSpeed = this.defaultSpeed;
        const speedBoostMult = this.isMinotaurSpeedBoostActive() ? this.minotaurSpeedBoostMult : 1;
        if (this.inWater) {
            this.speed = baseSpeed * 0.5 * speedBoostMult;
            const dx = (MAP_SIZE[0] / 2) - this.x;
            this.x += dx * 0.005;
            this.y += 3;
        } else {
            this.speed = baseSpeed * speedBoostMult;
        }
    }

    updateEquippedState() {
        const cooldown = performance.now() - this.lastThrowSwordTime < this.throwSwordCoolDownTime;
        const invalidEnv = this.inWater || this.touchingSafeZone;
        this.hasWeapon = !cooldown && !invalidEnv && !this.manuallyUnequippedWeapon && isSwordRank(this.weapon.rank);
        this.hasShield = this.touchingSafeZone;
    }

    applyAccessoryEffects() {
        const now = performance.now();
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        const accessoryMult = dataMap.ACCESSORIES[accessoryKey]?.viewRangeMult || 1;
        const baseRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        const radiusScale = Math.max(0.1, (this.radius || baseRadius) / baseRadius);
        const base = (typeof this.viewRangeOverride === 'number')
            ? this.viewRangeOverride
            : this.baseViewRangeMult;
        this.viewRangeMult = Math.max(0.1, base * accessoryMult * radiusScale);
        const swingMult = this.isStaminaBoostActive() ? 0.7 : 1;
        this.attackCooldownTime = Math.max(100, dataMap.PLAYERS.baseAttackCooldown * swingMult * radiusScale);
        const nextAbility = this.getEquippedAbility();
        const nextAbilityCooldown = this.getAbilityCooldownMs(nextAbility);
        if (this.activeAbility !== nextAbility || this.abilityCooldownMs !== nextAbilityCooldown) {
            this.activeAbility = nextAbility;
            this.abilityCooldownMs = nextAbilityCooldown;
            this.sendStatsUpdate();
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
        if (accessoryKey === 'bush-cloak') return 'poison_aoe';
        if (accessoryKey === 'pirate-hat') return 'stamina_boost';
        if (accessoryKey === 'minotaur-hat') return 'energy_burst';
        return '';
    }

    getAbilityCooldownMs(abilityName = this.activeAbility) {
        if (abilityName === 'poison_aoe') return 5000;
        if (abilityName === 'stamina_boost') return 10000;
        if (abilityName === 'speed_boost') return 10000;
        if (abilityName === 'energy_burst') return 5000;
        return 0;
    }

    isStaminaBoostActive() {
        return performance.now() < (this.staminaBoostUntil || 0);
    }

    activateStaminaBoost(durationSeconds = 5) {
        const clampedDuration = Math.max(1, Math.min(60, Math.round(durationSeconds)));
        this.staminaBoostUntil = performance.now() + (clampedDuration * 1000);
        this.sendStatsUpdate();
    }

    isMinotaurSpeedBoostActive() {
        return performance.now() < (this.minotaurSpeedBoostUntil || 0);
    }

    activateMinotaurSpeedBoost(multiplier = 1.25, durationSeconds = 3) {
        const safeMult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.25;
        const clampedDuration = Math.max(1, Math.min(60, Math.round(durationSeconds)));
        this.minotaurSpeedBoostMult = safeMult;
        this.minotaurSpeedBoostUntil = performance.now() + (clampedDuration * 1000);
        this.sendStatsUpdate();
    }

    updateAnimations() {
        if (this.swingState > 0) {
            const now = performance.now();
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

    updateChat() {
        if (this.chatMessage && performance.now() - this.lastChatTime > 10000) {
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

    // --- Actions ---

    attack() {
        if (this.tutorial && !this.tutorial.finished && this.tutorial.stage < 1) {
            // Prevent pre-holding attack from auto-completing the objective once stage 1 begins.
            this.attacking = 0;
            return;
        }

        const now = Date.now();
        const curRank = this.inventory[this.selectedSlot];
        const baseRank = curRank & 0x7F;
        const canAttack = this.attacking && !this.hasShield && this.isAlive && this.hasWeapon && !this.inWater && curRank < 128 && isSwordRank(baseRank);

        if (!canAttack || now - this.lastAttackTime < this.attackCooldownTime) return;

        this.lastAttackTime = now;
        this.swingState = 1;
        this.lastSwingAnimStepTime = performance.now();
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
        const canThrow = !this.hasShield && this.isAlive && this.swingState === 0 && !this.inWater && curRank < 128 && isSwordRank(baseRank);

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

    handleAutoPickup() {
        if (!this.isAlive) return;
        const now = performance.now();

        // If inventory is full (no empty slots AND no coin slots with room < 256), don't auto-pickup
        const canFitMoreCoins = this.inventory.some((type, i) => (type === 0) || (isCoinObjectType(type) && this.inventoryCounts[i] < 256));
        if (!canFitMoreCoins) return;

        for (const id in ENTITIES.OBJECTS) {
            const obj = ENTITIES.OBJECTS[id];
            if ((obj.world || 'main') !== (this.world || 'main')) continue;
            if (!this.canPickupDroppedObject(obj, now)) continue;
            if (!obj || !isCoinObjectType(obj.type) || obj.collectorId || !colliding(this, obj)) continue;
            if (now - (obj.spawnTime || 0) <= 200) continue;
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

    tryPickup() {
        if (!this.isAlive) return;
        const now = performance.now();

        for (const id in ENTITIES.OBJECTS) {
            const obj = ENTITIES.OBJECTS[id];
            if ((obj.world || 'main') !== (this.world || 'main')) continue;
            if (!this.canPickupDroppedObject(obj, now)) continue;
            if (obj && colliding(this, obj)) {
                // Ensure the object is pickable (isEphemeral)
                if (!dataMap.OBJECTS[obj.type]?.isEphemeral) continue;

                // Respect 200ms pickup delay for everything manually picked up too
                if (now - (obj.spawnTime || 0) < 200) continue;

                const isCoin = isCoinObjectType(obj.type);
                if (isCoin) {
                    if (obj.collectorId) continue;
                    if (obj.startCollection(this)) {
                        return;
                    }
                    continue;
                }

                const stackable = dataMap.OBJECTS[obj.type]?.stackable;

                if (stackable) {
                    // Try to stack non-coin items
                    const existingSlot = this.inventory.indexOf(obj.type);
                    if (existingSlot !== -1) {
                        this.inventoryCounts[existingSlot] += (obj.amount || 1);
                        ENTITIES.deleteEntity('object', obj.id);
                        this.sendInventoryUpdate();
                        this.sendStatsUpdate();
                        return;
                    }
                }

                // Try to find empty slot
                const emptySlot = this.inventory.indexOf(0);
                if (emptySlot !== -1) {
                    this.inventory[emptySlot] = obj.type;
                    this.inventoryCounts[emptySlot] = (obj.amount || 1);
                    ENTITIES.deleteEntity('object', obj.id);
                    this.sendInventoryUpdate();
                    this.sendStatsUpdate();
                    return;
                }

                // Bot upgrade path: replace weaker sword when inventory is full.
                if (this.isBot) {
                    const incomingRank = obj.type & 0x7F;
                    if (isSwordRank(incomingRank)) {
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

                        if (replaceSlot !== -1) {
                            const oldType = this.inventory[replaceSlot] & 0x7F;
                            const oldCount = Math.max(1, this.inventoryCounts[replaceSlot] || 1);
                            const dropObj = spawnObject(oldType, this.x, this.y, oldCount, 'player', this.world || 'main');
                            this.applyDropLaunch(dropObj, oldType);
                            this.inventory[replaceSlot] = obj.type;
                            this.inventoryCounts[replaceSlot] = Math.max(1, obj.amount || 1);
                            ENTITIES.deleteEntity('object', obj.id);
                            this.sendInventoryUpdate();
                            this.sendStatsUpdate();
                            return;
                        }
                    }
                }
            }
        }
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
            if (shopItem) {
                const sellPrice = Math.floor(shopItem.price * 0.5) * this.inventoryCounts[slotIndex];
                totalSellPrice += sellPrice;
                this.inventory[slotIndex] = 0;
                this.inventoryCounts[slotIndex] = 0;

                if (this.selectedSlot === slotIndex) {
                    // Logic for weapon rank update if needed, but this.weapon.rank is a getter
                }
                soldAny = true;
            }
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

        let finalHealthLoss = health;
        if (ACCESSORY_KEYS[this.accessoryId] === 'minotaur-hat') {
            finalHealthLoss *= 0.8;
        }

        this.lastDamagedTime = performance.now();
        this.hp -= finalHealthLoss;
        if (attacker && typeof attacker.id !== 'undefined' && !attacker?.noKillCredit) {
            this.lastDamager = attacker;
        }

        if (this.hp <= 0) {
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

        const lost = Math.max(1, Math.floor(this.score * 0.3));
        if (killer instanceof Player && killer.id !== this.id) {
            killer.addScore(lost);
            killer.killCount = (killer.killCount || 0) + 1;
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
        this.setScore(this.score - lost);
        this.killCount = 0;
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

    heal() {
        const inCombat = performance.now() - this.lastCombatTime < 10000;
        const regenIntervalMs = inCombat ? 1600 : 1000; // 60% slower in combat
        if (performance.now() - this.lastHealedTime > regenIntervalMs) {
            this.hp = Math.min(this.hp + this.getRegenAmountPerTick(), this.maxHp);
            this.lastHealedTime = performance.now();
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

    resolveCollisions() {
        recordResolveCollisionCall();
        if (!this.isAlive) return;
        const world = this.world || 'main';

        // Player vs Player
        for (const id in ENTITIES.PLAYERS) {
            const p = ENTITIES.PLAYERS[id];
            if (!p || p.id === this.id || !p.isAlive) continue;
            if ((p.world || 'main') !== world) continue;
            const nearDx = p.x - this.x;
            const nearDy = p.y - this.y;
            const nearRadius = (this.radius || 30) + (p.radius || 30) + 20;
            if ((nearDx * nearDx + nearDy * nearDy) > (nearRadius * nearRadius)) continue;
            if (!colliding(this, p, 15)) continue;
            const dist = Math.hypot(nearDx, nearDy) || 1;
            const pushScale = 3 / dist;
            const dx = nearDx * pushScale;
            const dy = nearDy * pushScale;
            this.x -= dx; this.y -= dy;
            p.x += dx; p.y += dy;
        }

        this.touchingSafeZone = false;
        for (const id in ENTITIES.STRUCTURES) {
            const s = ENTITIES.STRUCTURES[id];
            if (!s || s.type !== 1) continue;
            if ((s.world || 'main') !== world) continue;
            const safeDx = s.x - this.x;
            const safeDy = s.y - this.y;
            const safeRange = (s.radius || 0) + (this.radius || 0) + 10;
            if ((safeDx * safeDx + safeDy * safeDy) > (safeRange * safeRange)) continue;
            if (colliding(this, s)) {
                this.touchingSafeZone = true;
                break;
            }
        }

        // Player vs Mobs
        for (const id in ENTITIES.MOBS) {
            const m = ENTITIES.MOBS[id];
            if (!m) continue;
            if ((m.world || 'main') !== world) continue;

            if (m.type === 5 && !m.isAlarmed && !this.hasShield && !this.invincible && !this.isHidden && !this.isInvisible) {
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
                const dist = Math.hypot(hitDx, hitDy) || 1;
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
                const now = performance.now();
                const meleeReady = !hasMeleeCooldown || (now - (m.lastMeleeAttackTime || 0) >= 600);

                if (m.isAlarmed && dataMap.MOBS[m.type].isNeutral && m.target?.id === this.id && !this.hasShield && !this.isHidden && !this.isInvisible && meetsHealthGate && meleeReady) {
                    const tookDamage = this.damage(dataMap.MOBS[m.type].damage, m);
                    if (tookDamage && hasMeleeCooldown) {
                        m.lastMeleeAttackTime = now;
                    }
                    if (tookDamage && ACCESSORY_KEYS[this.accessoryId] === 'bush-cloak') {
                        poison(m, 5, 750, 2000);
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
