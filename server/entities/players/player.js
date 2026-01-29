import {
    ENTITIES
} from '../../game.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    wss
} from '../../../server.js';
import {
    playSfx,
    colliding,
    getId
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
        this.touchingSafeZone = false;
        this.updateCount = -2;

        // --- Inventory & Combat ---
        this.inventory = [1, 0, 0];
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
        this.attributeBuffs = { speed: 0, maxHp: 0, damage: 0 };

        // --- Timers & Cooldowns ---
        this.lastDamagedTime = 0;
        this.lastHealedTime = 0;
        this.lastDiedTime = 0;
        this.lastChatTime = 0;
        this.lastProcessTime = 0;

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
        this.updateAnimations();
        this.heal();
        this.attack();
        this.updateChat();
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
        if (this.keys.w) this.y -= this.speed;
        if (this.keys.a) this.x -= this.speed;
        if (this.keys.s) this.y += this.speed;
        if (this.keys.d) this.x += this.speed;
    }

    spectate() {
        const topPlayer = Object.values(ENTITIES.PLAYERS)
            .filter(p => p.isAlive)
            .sort((a, b) => b.score - a.score)[0];

        if (topPlayer) {
            this.x = topPlayer.x;
            this.y = topPlayer.y;
        } else {
            // Roam randomly if everyone is dead
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
        this.hasWeapon = !cooldown && !invalidEnv && !this.manuallyUnequippedWeapon && this.weapon.rank > 0;
        this.hasShield = this.touchingSafeZone;
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

    // --- Actions ---

    attack() {
        const now = Date.now();
        const curRank = this.inventory[this.selectedSlot];
        const canAttack = this.attacking && !this.hasShield && this.isAlive && this.hasWeapon && !this.inWater && curRank > 0 && curRank < 128;

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
        const canThrow = !this.hasShield && this.isAlive && this.swingState === 0 && !this.inWater && curRank > 0 && curRank < 128;

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

    dropItem() {
        const rank = this.inventory[this.selectedSlot];
        if (rank > 0 && rank < 128) {
            const dropObj = spawnObject(rank + 5, this.x, this.y);
            if (dropObj) {
                dropObj.targetX = this.x + Math.cos(this.angle) * 100;
                dropObj.targetY = this.y + Math.sin(this.angle) * 100;
                dropObj.teleportTicks = 2;
            }
            this.inventory[this.selectedSlot] = 0;
            this.manuallyUnequippedWeapon = false;
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    tryPickup() {
        if (!this.isAlive) return;

        const emptySlot = this.inventory.indexOf(0);
        if (emptySlot === -1) return;

        for (const id in ENTITIES.OBJECTS) {
            const obj = ENTITIES.OBJECTS[id];
            if (obj && obj.type >= 6 && obj.type <= 12 && colliding(this, obj)) {
                this.inventory[emptySlot] = obj.type - 5;
                ENTITIES.deleteEntity('object', obj.id);
                playSfx(this.x, this.y, dataMap.sfxMap.indexOf('coin-collect'), 1000);
                this.sendInventoryUpdate();
                this.sendStatsUpdate();
                return;
            }
        }
    }

    returnWeapon(rank) {
        if (!this.isAlive) return;

        // Try to return to ghost slot
        const ghostIdx = this.inventory.indexOf(rank | 0x80);
        if (ghostIdx !== -1) {
            this.inventory[ghostIdx] = rank;
        } else {
            // Find any empty slot
            const emptyIdx = this.inventory.indexOf(0);
            if (emptyIdx !== -1) this.inventory[emptyIdx] = rank;
            else spawnObject(rank + 5, this.x, this.y); // Floor if full
        }
        this.sendInventoryUpdate();
        this.sendStatsUpdate();
    }

    // --- Interaction ---

    damage(health, attacker) {
        if (this.invincible || performance.now() - this.lastDamagedTime < 200) return false;

        this.lastDamagedTime = performance.now();
        this.hp -= health;

        if (this.hp <= 0) {
            this.die(attacker);
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('bubble-pop'), 1000);
        } else {
            playSfx(this.x, this.y, dataMap.sfxMap.indexOf('hurt'), 1000);
        }
        return true;
    }

    die(killer) {
        this.lastDiedTime = performance.now();
        this.isAlive = false;

        const lost = Math.max(1, Math.floor(this.score * 0.3));
        if (killer instanceof Player) killer.addScore(lost);

        // Send death notification
        const killerTypeMap = { player: 1, mob: 2 };
        const killerType = killerTypeMap[killer.constructor.name.toLowerCase()] || 0;

        wss.clients.forEach(ws => {
            if (ws.id === this.id) {
                const pw = ws.packetWriter;
                pw.reset();
                pw.writeU8(6);
                pw.writeU8(killerType);
                if (killerType === 1) pw.writeU8(killer.id);
                else pw.writeU16(killer.id);
                ws.send(pw.getBuffer());
            }
        });

        // Reset state
        this.inventory = [1, 0, 0];
        this.selectedSlot = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.score = Math.max(0, this.score - lost);
        this.attributeBuffs = { speed: 0, maxHp: 0, damage: 0 };
        this.attacking = false;
        this.keys = { w: 0, a: 0, s: 0, d: 0 };

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
            dataMap.STRUCTURES[s.type].isSafeZone && colliding(s, this, 15)
        );

        // Player vs Mobs
        for (const id in ENTITIES.MOBS) {
            const m = ENTITIES.MOBS[id];
            if (colliding(m, this, 15)) {
                const ang = Math.atan2(m.y - this.y, m.x - this.x);
                const dx = Math.cos(ang) * 10, dy = Math.sin(ang) * 10;
                this.x -= dx; this.y -= dy;
                m.x += dx; m.y += dy;

                if (m.isAlarmed && dataMap.MOBS[m.type].isNeutral && m.target?.id === this.id && !this.hasShield) {
                    this.damage(dataMap.MOBS[m.type].damage, m);
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

        ws.packetWriter.reset();
        ws.packetWriter.writeU8(18);
        ws.packetWriter.writeU16(dmgHit);
        ws.packetWriter.writeU16(dmgHit * 2); // dmgThrow
        ws.packetWriter.writeU16(Math.round(this.speed));
        ws.packetWriter.writeU16(Math.floor(this.hp));
        ws.packetWriter.writeU16(Math.floor(this.maxHp));
        ws.send(ws.packetWriter.getBuffer());
    }

    sendInventoryUpdate() {
        const ws = Array.from(wss.clients).find(c => c.id === this.id);
        if (!ws) return;

        ws.packetWriter.reset();
        ws.packetWriter.writeU8(15);
        ws.packetWriter.writeU8(this.selectedSlot);
        this.inventory.forEach(rank => ws.packetWriter.writeU8(rank));
        ws.send(ws.packetWriter.getBuffer());
    }

    selectSlot(index) {
        if (index >= 0 && index < 3) {
            this.selectedSlot = index;
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }

    swapSlots(idx1, idx2) {
        if (idx1 >= 0 && idx1 < 3 && idx2 >= 0 && idx2 < 3 && idx1 !== idx2) {
            [this.inventory[idx1], this.inventory[idx2]] = [this.inventory[idx2], this.inventory[idx1]];
            this.sendInventoryUpdate();
            this.sendStatsUpdate();
        }
    }
}