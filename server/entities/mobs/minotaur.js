import {
    Mob
} from "./mob.js";
import {
    ENTITIES
} from '../../game.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    colliding,
    playSfx,
    getId
} from '../../helpers.js';

export class Minotaur extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 6);
        this.attackCooldownTime = dataMap.PLAYERS.baseAttackCooldown;
        this.lastAttackTime = 0;
        this.swingState = 0;
        this.strength = 0;
        this.weapon = { rank: 9 };
        this.targetId = null;
        this.burstActive = false;
        this.burstStartTime = 0;
        this.lastBurstLeapTime = 0;
        this.nextBurstTime = performance.now() + (3000 + Math.random() * 2000);
        this.nextShockwaveRollTime = performance.now() + (2000 + Math.random() * 3000);
        this.freezeUntil = 0;
        this.shockwaveActive = false;
        this.shockwaveWavesEmitted = 0;
        this.nextShockwaveWaveTime = 0;
    }

    alarm(shooter, reason = 'hit') {
        super.alarm(shooter, reason);
        this.targetId = shooter?.id ?? this.targetId;
        if (this.isAlarmed) {
            this.speed = dataMap.MOBS[this.type].speed * 2;
        }
    }

    turn() {
        if (this.isAlarmed) {
            const resolvedTarget = ENTITIES.PLAYERS[this.targetId] || (this.target ? ENTITIES.PLAYERS[this.target.id] : null);
            if (!resolvedTarget || !resolvedTarget.isAlive) {
                this.isAlarmed = false;
                this.target = null;
                this.targetId = null;
                this.speed = dataMap.MOBS[this.type].speed;
                return;
            }
            this.target = resolvedTarget;
            this.targetId = resolvedTarget.id;

            // Angry Minotaur always faces and chases its target.
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            return;
        }

        super.turn();
    }

    process() {
        const preX = this.x;
        const preY = this.y;
        super.process();
        const now = performance.now();
        this.processShockwaveWaves(now);

        if (now < this.freezeUntil) {
            this.x = preX;
            this.y = preY;
            this.clamp();
            return;
        }

        this.tryShockwave(now);
        if (now < this.freezeUntil) {
            // Start standing still immediately when shockwave procs.
            this.x = preX;
            this.y = preY;
            this.clamp();
            return;
        }

        this.resolveMobCollisions();
        this.processLeapBurst();
        this.updateSwingState();
        this.trySwingAttack();
    }

    resolveMobCollisions() {
        for (const id in ENTITIES.MOBS) {
            const other = ENTITIES.MOBS[id];
            if (!other || other.id === this.id) continue;
            // Resolve each pair once per tick to avoid double-separation.
            if (this.id > other.id) continue;
            if (!colliding(this, other, 10)) continue;

            const angle = Math.atan2(other.y - this.y, other.x - this.x);
            const push = 8;
            const dx = Math.cos(angle) * push;
            const dy = Math.sin(angle) * push;

            this.x -= dx;
            this.y -= dy;
            other.x += dx;
            other.y += dy;

            this.clamp();
            if (typeof other.clamp === 'function') other.clamp();
        }
    }

    processLeapBurst() {
        if (!this.isAlarmed || !this.target) return;

        const target = ENTITIES.PLAYERS[this.target.id];
        if (!target || !target.isAlive) return;

        const now = performance.now();
        if (!this.burstActive) {
            if (now < this.nextBurstTime) return;
            this.burstActive = true;
            this.burstStartTime = now;
            this.lastBurstLeapTime = now - 1000;
        }

        if (now - this.burstStartTime >= 3000) {
            this.burstActive = false;
            this.nextBurstTime = now + (3000 + Math.random() * 2000);
            return;
        }

        if (now - this.lastBurstLeapTime < 1000) return;
        this.lastBurstLeapTime = now;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.001) return;

        const leapDistance = 75;
        this.x += (dx / dist) * leapDistance;
        this.y += (dy / dist) * leapDistance;
        this.clamp();
    }

    updateSwingState() {
        if (this.swingState > 0) {
            this.swingState = Math.floor(this.swingState + 1);
            if (this.swingState >= 7) {
                this.swingState = 0;
            }
        }
    }

    trySwingAttack() {
        if (!this.isAlarmed || !this.target) return;

        const target = ENTITIES.PLAYERS[this.target.id];
        if (!target || !target.isAlive || target.hasShield || target.isInvisible) return;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distSq = dx * dx + dy * dy;
        const swingRange = dataMap.SWORDS['imgs'][9].swordWidth * 1.5;
        if (distSq > swingRange * swingRange) return;
        if (!this.hasClearSwingLine(target)) return;

        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldownTime) return;
        this.performSwing();
    }

    performSwing(ignoreCooldown = false) {
        const now = Date.now();
        if (!ignoreCooldown && now - this.lastAttackTime < this.attackCooldownTime) return false;

        this.lastAttackTime = now;
        this.swingState = 1;
        this.spawnSlashProjectiles();

        const sfx = dataMap.sfxMap.indexOf('sword-slash');
        playSfx(this.x, this.y, sfx, 1000);
        return true;
    }

    hasClearSwingLine(target) {
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            const config = dataMap.STRUCTURES[structure.type];
            if (!config || config.noCollisions || structure.type === 3) continue;

            // Ignore obstacle if either actor is already inside it.
            if (colliding(this, structure) || colliding(target, structure)) continue;

            if (segmentIntersectsCircle(this.x, this.y, target.x, target.y, structure.x, structure.y, structure.radius)) {
                return false;
            }
        }
        return true;
    }

    spawnSlashProjectiles() {
        const groupId = Math.random();
        const offsets = [-Math.PI / 10, 0, Math.PI / 10];
        for (const angleOffset of offsets) {
            const projectileAngle = this.angle + angleOffset;
            ENTITIES.newEntity({
                entityType: 'projectile',
                id: getId('PROJECTILES'),
                x: this.x + Math.cos(projectileAngle) * this.radius,
                y: this.y + Math.sin(projectileAngle) * this.radius,
                angle: projectileAngle,
                type: 9,
                shooter: this,
                groupId
            });
        }
    }

    tryShockwave(now) {
        if (!this.isAlarmed) return;
        if (now < this.nextShockwaveRollTime) return;

        this.nextShockwaveRollTime = now + (2000 + Math.random() * 3000);

        // "have a chance" every 2-5s
        const procChance = 0.4;
        if (Math.random() > procChance) return;

        this.freezeUntil = now + 900;
        this.swingState = 0; // reset swing while frozen
        this.shockwaveActive = true;
        this.shockwaveWavesEmitted = 0;
        this.nextShockwaveWaveTime = now; // fire first wave immediately
        const electricSfx = dataMap.sfxMap.indexOf('electric-sfx1');
        if (electricSfx >= 0) {
            playSfx(this.x, this.y, electricSfx, 1200);
        }
        this.processShockwaveWaves(now);
    }

    processShockwaveWaves(now) {
        if (!this.shockwaveActive) return;

        while (this.shockwaveWavesEmitted < 3 && now >= this.nextShockwaveWaveTime) {
            this.spawnShockwaveProjectiles();
            this.shockwaveWavesEmitted++;
            this.nextShockwaveWaveTime += 300;
        }

        if (this.shockwaveWavesEmitted >= 3 || now > this.freezeUntil) {
            this.shockwaveActive = false;
        }
    }

    spawnShockwaveProjectiles() {
        const groupId = Math.random();
        const count = 30;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            ENTITIES.newEntity({
                entityType: 'projectile',
                id: getId('PROJECTILES'),
                x: this.x + Math.cos(angle) * this.radius,
                y: this.y + Math.sin(angle) * this.radius,
                angle,
                type: 10,
                shooter: this,
                groupId
            });
        }
    }
}

function segmentIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = cx - x1;
    const wy = cy - y1;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) {
        const dx = cx - x1;
        const dy = cy - y1;
        return dx * dx + dy * dy <= r * r;
    }

    let t = (wx * vx + wy * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * vx;
    const py = y1 + t * vy;
    const dx = cx - px;
    const dy = cy - py;
    return dx * dx + dy * dy <= r * r;
}
