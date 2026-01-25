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
    colliding
} from '../../helpers.js';
import {
    Entity
} from '../entity.js';
import { MAP_SIZE } from '../../game.js';

export class Player extends Entity {
    constructor(id, x, y) {
        super(id, x, y, dataMap.PLAYERS.baseRadius, dataMap.PLAYERS.baseMovementSpeed, 100, 100);

        this.isAdmin = false;
        this.angle = 0;

        this.hasShield = false;
        this.isAlive = true;

        this.score = 10;
        this.level = 1;

        this.speed = dataMap.PLAYERS.baseMovementSpeed;
        this.defaultSpeed = dataMap.PLAYERS.baseMovementSpeed;

        this.attributeBuffs = {
            speed: 0,
            maxHealth: 0,
        }

        this.updateCount = -2;

        this.lastDamagedTime = 0;
        this.lastEntToDmg = null;
        this.lastDiedTime = 0;
        this.recentKiller = null;

        this.lastHealedTime = 0;

        this.swingState = 0;

        this.touchingSafeZone = false;

        this.username;
        this.chatMessage = '';
        this.lastChatTime = 0;

        this.lastThrowSwordTime = 0;
        this.hasWeapon = true;
        this.throwSwordCoolDownTime = dataMap.PLAYERS.baseThrowSwordCooldown;

        this.lastAttackTime = 0;
        this.attackCooldownTime = dataMap.PLAYERS.baseAttackCooldown;
        this.attacking = false;
        this.keys = {
            w: 0,
            a: 0,
            s: 0,
            d: 0
        };

        this.inWater = false;

        this.lastProcessTime = 0;

        ENTITIES.PLAYERS[id] = this;

        this.spawnProjectile = (angleOffset, shooter, thrown) => {
            let projectileId = Math.floor(Math.random() * 100000); // Use a larger range for IDs
            while (projectileId in ENTITIES.PROJECTILES) {
                projectileId = Math.floor(Math.random() * 100000);
            }

            const projectileAngle = shooter.angle + angleOffset;
            const xOffset = Math.cos(projectileAngle) * shooter.radius; // spawn outside player
            const yOffset = Math.sin(projectileAngle) * shooter.radius; // spawn outside player
            let projectileType;
            if (thrown) {
                projectileType = -1;
            } else {
                projectileType = 1;
            }
            if (dataMap.PROJECTILES[this.level] && !thrown) {
                projectileType = this.level;
            }


            ENTITIES.newEntity({
                entityType: 'projectile',
                id: projectileId,
                x: shooter.x + xOffset,
                y: shooter.y + yOffset,
                angle: projectileAngle,
                type: projectileType,
                shooter: shooter
            });
        }
    }
    move() {
        if (performance.now() - this.lastDiedTime < 1000) {
            // stay in place for a few seconds (don't continue with other logic below)
            return;
        }

        // for players that are dead
        let bestScore = -Infinity;
        let topPlayer = null;
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (player.score > bestScore && player.isAlive) {
                bestScore = player.score;
                topPlayer = player;
            }
        }

        if (!this.isAlive) {
            if (topPlayer) {
                // Follow the top player smoothly
                this.x = topPlayer.x;
                this.y = topPlayer.y;
            } else {
                // If no alive players, roam randomly
                const roamSpeed = 10; // Speed of random roaming
                const roamChangeDirectionDelay = 7500; // milliseconds

                if (performance.now() - this.lastProcessTime > roamChangeDirectionDelay) {
                    this.lastProcessTime = performance.now();
                    this.angle = Math.random() * Math.PI * 2; // New random angle
                }

                this.x += Math.cos(this.angle) * roamSpeed;
                this.y += Math.sin(this.angle) * roamSpeed;

                // Keep within map bounds
                this.x = Math.max(0, Math.min(MAP_SIZE[0], this.x));
                this.y = Math.max(0, Math.min(MAP_SIZE[1], this.y));
            }
            return;
        }

        // for players that are alive
        this.lastX = this.x;
        this.lastY = this.y;
        if (this.keys['w']) this.y -= this.speed;
        if (this.keys['a']) this.x -= this.speed;
        if (this.keys['s']) this.y += this.speed;
        if (this.keys['d']) this.x += this.speed;
    }
    heal() {
        const now = performance.now();
        if (now - this.lastHealedTime > 1000) {
            this.hp = Math.min(this.hp + 5, this.maxHp);
            this.lastHealedTime = now;
        }
    }
    throwSword() {
        const now = performance.now();
        if (now - this.lastThrowSwordTime < this.throwSwordCoolDownTime || this.hasShield || !this.isAlive || this.swingState != 0 || this.inWater) return;
        this.lastThrowSwordTime = now;

        const sfx = dataMap.sfxMap.indexOf('throw');
        playSfx(this.x, this.y, sfx, 1000);

        this.spawnProjectile(0, this, true);
    }
    attack() {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldownTime || !this.attacking || this.hasShield || !this.isAlive || !this.hasWeapon || this.inWater) return;
        this.lastAttackTime = now;
        this.swingState = 0.1;

        const sfx = dataMap.sfxMap.indexOf('sword-slash');
        playSfx(this.x, this.y, sfx, 1000);

        let angleOffset = -Math.PI / 3; // Start from -60 degrees
        while (angleOffset <= Math.PI / 3) { // Go up to 60 degrees
            this.spawnProjectile(angleOffset, this, false);
            angleOffset += Math.PI / 12; // Increment by 15 degrees (PI/12 radians)
        }
    }
    resolveCollisions() {
        if (!this.isAlive) return;

        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (player.id === this.id || !player.isAlive) continue; // don't check collisions with self or dead players.

            // check if touching
            if (colliding(this, player, 15)) {
                // resolve collision
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const dx = Math.cos(angle) * 3
                const dy = Math.sin(angle) * 3
                this.x -= dx;
                this.y -= dy;
                player.x += dx;
                player.y += dy;
            }
        }

        this.touchingSafeZone = false;

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (dataMap.STRUCTURES[structure.type].isSafeZone) {
                if (colliding(structure, this, 15)) {
                    this.touchingSafeZone = true;
                    break;
                }
            }
        }

        if (this.touchingSafeZone) {
            this.hasShield = true;
        } else {
            this.hasShield = false;
        }
    }
    addScore(points) {
        // determine new level
        this.score += points;

        const maxScore = 1000000000;
        if (this.score > maxScore) this.score = maxScore;

        let bestLevel = 1;
        for (const [level, data] of Object.entries(dataMap.PLAYERS.levels)) {
            if (this.score >= data.score) {
                const lvl = parseInt(level);
                if (lvl > bestLevel) bestLevel = lvl;
            }
        }
        const oldLevel = this.level
        this.level = bestLevel;
        if (this.level != oldLevel) {
            this.hp = this.maxHp;
        }
    }
    damage(health, attacker) {
        if (performance.now() - this.lastDamagedTime < 200) return false; // invincible for 10 ticks (200 / 20)

        this.lastDamagedTime = performance.now();
        this.lastEntToDmg = attacker;
        this.hp -= health;
        if (this.hp <= 0) {
            this.die(this.lastEntToDmg);
            const sfx = dataMap.sfxMap.indexOf('bubble-pop');
            playSfx(this.x, this.y, sfx, 1000);
        } else {
            const sfx = dataMap.sfxMap.indexOf('hurt');
            playSfx(this.x, this.y, sfx, 1000);
        }
        return true;
    }
    die(killer) {
        // set last died time
        this.lastDiedTime = performance.now();
        this.recentKiller = killer;
        this.isAlive = false;

        const scoreLost = Math.max(1, Math.floor(this.score * 0.3)); // lose 30%

        // give killer score if they are a player
        if (killer instanceof Player) {
            killer.addScore(scoreLost);
        }

        const entNumMap = [0, 'player', 'mob'];

        wss.clients.forEach(ws => {
            if (ws.id === this.id) {
                const pw = ws.packetWriter;
                pw.reset();
                pw.writeU8(6);
                const killerType = entNumMap.indexOf(killer.constructor.name.toLowerCase());
                // Handle case where killer type is not found (although unlikely given the context)
                pw.writeU8(killerType !== -1 ? killerType : 0);
                pw.writeU32(killer.id);
                ws.send(pw.getBuffer())
                return;
            }
        })

        this.hp = 100;
        this.maxHp = 100;

        this.attributeBuffs = {
            speed: 0,
            damage: 0,
        };

        this.score = Math.max(0, this.score - scoreLost); // lose score
        let bestLevel = 1;
        for (const [level, data] of Object.entries(dataMap.PLAYERS.levels)) {
            if (this.score >= data.score) {
                const lvl = parseInt(level);
                if (lvl > bestLevel) bestLevel = lvl;
            }
        }
        const oldLevel = this.level
        this.level = bestLevel;

        if (this.level != oldLevel) {
            this.hp = this.maxHp;
        }

        this.attacking = false;
        this.keys = {
            w: 0,
            a: 0,
            s: 0,
            d: 0
        };
    }
    process() {
        this.move();
        this.resolveCollisions();
        this.clamp();

        // check if inside center vertical river
        const waterxr = [MAP_SIZE[0] * 0.47, MAP_SIZE[0] * 0.53];
        const wateryr = [0, MAP_SIZE[1]];
        this.inWater = this.x > waterxr[0] && this.x < waterxr[1] && this.y > wateryr[0] && this.y < wateryr[1] && !this.touchingSafeZone;

        if (this.inWater) {
            this.speed = (this.defaultSpeed + this.attributeBuffs.speed) * 0.5;
            const streamCenter = MAP_SIZE[0] / 2;
            const dx = streamCenter - this.x;
            this.x += dx * 0.005;
            this.y += 3;
        } else {
            this.speed = this.defaultSpeed + this.attributeBuffs.speed;
        }

        // update weapon availability BEFORE attack
        if (performance.now() - this.lastThrowSwordTime < this.throwSwordCoolDownTime || this.inWater || this.touchingSafeZone) {
            this.hasWeapon = false;
        } else {
            this.hasWeapon = true;
        }

        // update shield availability
        if (this.touchingSafeZone) {
            this.hasShield = true;
        } else {
            this.hasShield = false;
        }

        this.heal();
        this.attack();

        if (this.chatMessage && performance.now() - this.lastChatTime > 10000) {
            this.chatMessage = '';
        }

        if (this.swingState > 0) {
            this.swingState += 1;
            this.speed = 0;
            this.swingState = Math.floor(this.swingState);
        }
        if (this.swingState === 7) {
            this.swingState = 0;
            this.speed = this.defaultSpeed + this.attributeBuffs.speed;
        }
    }
}
