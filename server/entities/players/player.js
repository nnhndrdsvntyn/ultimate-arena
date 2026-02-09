import {
    ENTITIES
} from '../../game.js';
import {
    dataMap,
    isSwordRank,
    isAccessoryItemType,
    accessoryIdFromItemType,
    accessoryItemTypeFromId,
    isAccessoryId,
    ACCESSORY_KEYS,
    DEFAULT_VIEW_RANGE_MULT
} from '../../../public/shared/datamap.js';
import {
    wss
} from '../../../server.js';
import {
    playSfx,
    colliding,
    getId,
    poison
} from '../../helpers.js';
import {
    Entity
} from '../entity.js';
import {
    MAP_SIZE,
    spawnObject
} from '../../game.js';

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
        this.strength = dataMap.PLAYERS.baseStrength;
        this.score = 0;
        this.goldCoins = 0;
        this.attributeBuffs = { speed: 0, maxHp: 0, damage: 0 };
        this.lastStatsSpeed = Math.round(this.speed);
        this.vikingHitCount = 0;

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

        const currentlyInCombat = performance.now() - this.lastCombatTime < 10000;
        if (this.wasInCombat !== currentlyInCombat) {
            this.sendStatsUpdate();
        }
        this.wasInCombat = currentlyInCombat;
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
            .filter(p => p.isAlive)
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
        const waterxr = [MAP_SIZE[0] * 0.47, MAP_SIZE[0] * 0.53];
        this.inWater = this.x > waterxr[0] && this.x < waterxr[1] && !this.touchingSafeZone;

        this.isHidden = false;
        for (const id in ENTITIES.STRUCTURES) {
            const s = ENTITIES.STRUCTURES[id];
            if (s.type === 3 && colliding(s, this)) {
                this.isHidden = true;
                break;
            }
        }

        if (this.inWater) {
            this.speed = (this.defaultSpeed + this.attributeBuffs.speed) * 0.5;
            const dx = (MAP_SIZE[0] / 2) - this.x;
            this.x += dx * 0.005;
            this.y += 3;
        } else {
            this.speed = this.defaultSpeed + this.attributeBuffs.speed;
        }
    }

    updateEquippedState() {
        const cooldown = performance.now() - this.lastThrowSwordTime < this.throwSwordCoolDownTime;
        const invalidEnv = this.inWater || this.touchingSafeZone;
        this.hasWeapon = !cooldown && !invalidEnv && !this.manuallyUnequippedWeapon && isSwordRank(this.weapon.rank);
        this.hasShield = this.touchingSafeZone;
    }

    applyAccessoryEffects() {
        const accessoryKey = ACCESSORY_KEYS[this.accessoryId];
        const accessoryMult = dataMap.ACCESSORIES[accessoryKey]?.viewRangeMult || 1;
        const base = (typeof this.viewRangeOverride === 'number')
            ? this.viewRangeOverride
            : this.baseViewRangeMult;
        this.viewRangeMult = Math.max(0.1, base * accessoryMult);
        const swingMult = accessoryKey === 'pirate-hat' ? 0.7 : 1;
        this.attackCooldownTime = Math.max(100, dataMap.PLAYERS.baseAttackCooldown * swingMult);
        if (accessoryKey !== 'viking-hat' && this.vikingHitCount !== 0) {
            this.vikingHitCount = 0;
            this.sendStatsUpdate();
        }
    }

    updateAnimations() {
        if (this.swingState > 0) {
            this.swingState = Math.floor(this.swingState + 1);
            this.speed = 0;
        }
        if (this.swingState >= 7) {
            this.swingState = 0;
            this.speed = this.defaultSpeed + this.attributeBuffs.speed;
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

    // --- Actions ---

    attack() {
        const now = Date.now();
        const curRank = this.inventory[this.selectedSlot];
        const baseRank = curRank & 0x7F;
        const canAttack = this.attacking && !this.hasShield && this.isAlive && this.hasWeapon && !this.inWater && curRank < 128 && isSwordRank(baseRank);

        if (!canAttack || now - this.lastAttackTime < this.attackCooldownTime) return;

        this.lastAttackTime = now;
        this.swingState = 1;
        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('sword-slash'), 1000);

        const groupId = Math.random();
        for (let angleOffset = -Math.PI / 3; angleOffset <= Math.PI / 3; angleOffset += Math.PI / 12) {
            this.spawnProjectile(angleOffset, false, groupId);
        }
    }

    throwSword() {
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
        const canFitMoreCoins = this.inventory.some((type, i) => (type === 0) || (type === 9 && this.inventoryCounts[i] < 256));
        if (!canFitMoreCoins) return;

        for (const id in ENTITIES.OBJECTS) {
            const obj = ENTITIES.OBJECTS[id];
            // Only auto-pickup coins (Type 9)
            if (obj && obj.type === 9 && colliding(this, obj)) {
                // Ensure 1s delay since spawn (prevents instant re-pickup on drop)
                if (now - (obj.spawnTime || 0) > 1000) {
                    const amount = obj.amount || 1;
                    this.addGoldCoins(amount);
                    if (obj.source === 'chest') {
                        this.addScore(amount * 10);
                    }
                    ENTITIES.deleteEntity('object', obj.id);
                }
            }
        }
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
        if (isAccessoryItemType(baseType)) return;

        const dropObj = spawnObject(baseType, this.x, this.y, count, baseType === 9 ? 'player' : null);
        if (dropObj) {
            dropObj.targetX = this.x + Math.cos(this.angle) * 100;
            dropObj.targetY = this.y + Math.sin(this.angle) * 100;
            dropObj.teleportTicks = 2;
        }

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

        for (const id in ENTITIES.OBJECTS) {
            const obj = ENTITIES.OBJECTS[id];
            if (obj && colliding(this, obj)) {
                // Ensure the object is pickable (isEphemeral)
                if (!dataMap.OBJECTS[obj.type]?.isEphemeral) continue;

                // Respect 1s pickup delay for everything manually picked up too
                if (performance.now() - (obj.spawnTime || 0) < 1000) continue;

                const isCoin = obj.type === 9;
                if (isCoin) continue; // Coins are auto-picked up, no manual pickup needed.

                const stackable = dataMap.OBJECTS[obj.type]?.stackable;

                if (stackable) {
                    // For coins, we use the addGoldCoins logic which handles the 256 limit and multiple slots
                    if (obj.type === 9) {
                        const amount = obj.amount || 1;
                        this.addGoldCoins(amount);
                        ENTITIES.deleteEntity('object', obj.id);
                        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
                        return;
                    }

                    // Try to stack non-coin items
                    const existingSlot = this.inventory.indexOf(obj.type);
                    if (existingSlot !== -1) {
                        this.inventoryCounts[existingSlot] += (obj.amount || 1);
                        ENTITIES.deleteEntity('object', obj.id);
                        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
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
                    playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
                    this.sendInventoryUpdate();
                    this.sendStatsUpdate();
                    return;
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
            // Find any empty slot
            const emptyIdx = this.inventory.indexOf(0);
            if (emptyIdx !== -1) {
                this.inventory[emptyIdx] = rank;
                this.inventoryCounts[emptyIdx] = 1;
            }
            else spawnObject(rank, this.x, this.y); // Floor if full
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
                playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
                this.sendInventoryUpdate();
                this.sendStatsUpdate();
            }
        }
    }

    buyAccessory(accessoryId) {
        if (!this.isAlive || !isAccessoryId(accessoryId) || accessoryId === 0) return;

        const cost = dataMap.ACCESSORY_PRICE || 30;
        if (this.getTotalCoins() < cost) return;

        const emptySlot = this.inventory.indexOf(0);
        if (emptySlot === -1) return;

        this.deductCoins(cost);
        this.inventory[emptySlot] = accessoryItemTypeFromId(accessoryId);
        this.inventoryCounts[emptySlot] = 1;
        playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
        this.sendInventoryUpdate();
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
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    addGoldCoins(amount) {
        let remaining = amount;
        // Try to fill existing stacks (up to 256)
        for (let i = 0; i < 35; i++) {
            if (this.inventory[i] === 9 && this.inventoryCounts[i] < 256) {
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
            this.inventory[emptySlot] = 9;
            this.inventoryCounts[emptySlot] = toAdd;
            remaining -= toAdd;
        }

        // If still remaining (inventory full), drop on floor in clusters of 256
        while (remaining > 0) {
            const toDrop = Math.min(256, remaining);
            const dropObj = spawnObject(9, this.x, this.y, toDrop, 'player');
            if (dropObj) {
                dropObj.targetX = this.x + (Math.random() - 0.5) * 100;
                dropObj.targetY = this.y + (Math.random() - 0.5) * 100;
                dropObj.teleportTicks = 2;
            }
            remaining -= toDrop;
        }

        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    getTotalCoins() {
        let total = 0;
        for (let i = 0; i < 35; i++) {
            if (this.inventory[i] === 9) {
                total += this.inventoryCounts[i];
            }
        }
        return total;
    }

    deductCoins(amount) {
        let remaining = amount;
        for (let i = 34; i >= 0; i--) { // Deduct from end of inventory first
            if (this.inventory[i] === 9) {
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

        this.lastDamagedTime = performance.now();
        this.hp -= health;
        if (attacker && attacker instanceof Player && !attacker?.noKillCredit) {
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

        this.sendStatsUpdate();
        this.isAlive = false;

        const lost = Math.max(1, Math.floor(this.score * 0.3));
        if (killer instanceof Player) killer.addScore(lost);

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
            if (type > 1 && !isAccessoryItemType(type)) { // Drop everything except default blade (rank 1) and accessories
                spawnObject(type, this.x, this.y, count, type === 9 ? 'player' : null);
            }
        }

        // Reset state
        this.inventory = new Array(35).fill(0);
        this.inventoryCounts = new Array(35).fill(0);
        this.inventory[0] = 1;
        this.inventoryCounts[0] = 1;
        this.hp = 100;
        this.maxHp = 100;
        this.score = Math.max(0, this.score - lost);
        this.attributeBuffs = { speed: 0, maxHp: 0, damage: 0 };
        this.attacking = false;
        this.keys = { w: 0, a: 0, s: 0, d: 0 };
        this.lastDamager = null;

        this.sendInventoryUpdate();
    }

    heal() {
        if (performance.now() - this.lastHealedTime > 1000) {
            this.hp = Math.min(this.hp + 5, this.maxHp);
            this.lastHealedTime = performance.now();
        }
    }

    addScore(points) {
        this.score = Math.min(1000000000, this.score + points);
    }

    resolveCollisions() {
        if (!this.isAlive) return;

        // Player vs Player
        for (const id in ENTITIES.PLAYERS) {
            const p = ENTITIES.PLAYERS[id];
            if (p.id !== this.id && p.isAlive && colliding(this, p, 15)) {
                const ang = Math.atan2(p.y - this.y, p.x - this.x);
                const dx = Math.cos(ang) * 3, dy = Math.sin(ang) * 3;
                this.x -= dx; this.y -= dy;
                p.x += dx; p.y += dy;
            }
        }

        // Safe Zones
        this.touchingSafeZone = Object.values(ENTITIES.STRUCTURES).some(s =>
            dataMap.STRUCTURES[s.type].isSafeZone && colliding(s, this, 15) && performance.now() - 10000 > this.lastCombatTime
        );

        // Player vs Mobs
        for (const id in ENTITIES.MOBS) {
            const m = ENTITIES.MOBS[id];

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
            if (colliding(m, this, buffer)) {
                const ang = Math.atan2(m.y - this.y, m.x - this.x);
                const dx = Math.cos(ang) * 10, dy = Math.sin(ang) * 10;
                this.x -= dx; this.y -= dy;
                m.x += dx; m.y += dy;

                const mHealthRatio = m.maxHp ? (m.hp / m.maxHp) : 1;

                if (m.isAlarmed && dataMap.MOBS[m.type].isNeutral && m.target?.id === this.id && !this.hasShield && !this.isHidden && !this.isInvisible && mHealthRatio >= 0.6) {
                    const tookDamage = this.damage(dataMap.MOBS[m.type].damage, m);
                    if (tookDamage && ACCESSORY_KEYS[this.accessoryId] === 'bush-cloak') {
                        poison(m, 5, 750, 2000);
                    }
                }
            }
        }
    }

    // --- Networking ---

    sendStatsUpdate() {
        const ws = Array.from(wss.clients).find(c => c.id === this.id);
        if (!ws) return;

        const weaponRank = this.weapon.rank || 1;
        const projDmg = dataMap.PROJECTILES[weaponRank]?.damage || 0;
        const dmgHit = Math.round((this.strength + projDmg) * 1.15);
        const inCombat = performance.now() - this.lastCombatTime < 10000;

        ws.packetWriter.reset();
        ws.packetWriter.writeU8(18);
        ws.packetWriter.writeU16(dmgHit);
        ws.packetWriter.writeU16(Math.round(dmgHit / 1.5)); // dmgThrow (1.5x weaker than hit)
        ws.packetWriter.writeU16(Math.round(this.speed));
        ws.packetWriter.writeU16(Math.floor(this.hp));
        ws.packetWriter.writeU16(Math.floor(this.maxHp));
        ws.packetWriter.writeU32(this.getTotalCoins());
        ws.packetWriter.writeU8(inCombat ? 1 : 0);
        ws.packetWriter.writeU8(this.vikingHitCount || 0);
        ws.send(ws.packetWriter.getBuffer());
    }

    sendInventoryUpdate() {
        const ws = Array.from(wss.clients).find(c => c.id === this.id);
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

    unequipAccessory() {
        if (!this.equippedAccessoryItemType) {
            this.accessoryId = 0;
            return;
        }

        const emptySlot = this.inventory.indexOf(0);
        if (emptySlot === -1) return;

        this.inventory[emptySlot] = this.equippedAccessoryItemType;
        this.inventoryCounts[emptySlot] = 1;
        this.equippedAccessoryItemType = 0;
        this.accessoryId = 0;
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }
}
