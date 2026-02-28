import {
    Mob
} from "./mob.js";
import {
    Player
} from "../players/player.js";
import {
    ENTITIES,
    spawnObject
} from '../../game.js';
import {
    dataMap,
    getCoinObjectType,
    ACCESSORY_NAME_TO_ID,
    accessoryItemTypeFromId
} from '../../../public/shared/datamap.js';
import {
    colliding,
    playSfx,
    getId,
    spawnEnergyBurstProjectiles
} from '../../helpers.js';

const BURST_COOLDOWN_MIN_MS = 3000;
const BURST_COOLDOWN_RANDOM_MS = 2000;
const BURST_DURATION_MS = 3000;
const BURST_LEAP_INTERVAL_MS = 1000;
const BURST_LEAP_DISTANCE = 75;
const SHOCKWAVE_ROLL_MIN_MS = 2000;
const SHOCKWAVE_ROLL_RANDOM_MS = 3000;
const SHOCKWAVE_PROC_CHANCE = 0.25;
const SHOCKWAVE_FREEZE_MS = 900;
const SHOCKWAVE_WAVE_COUNT = 3;
const SHOCKWAVE_WAVE_INTERVAL_MS = 300;
const TURN_RATE_RAD = 10 * (Math.PI / 180);
const SWING_FACING_HALF_ARC = Math.PI / 2;
const SLASH_OFFSETS = [-Math.PI / 10, 0, Math.PI / 10];
const CLOSE_PROXIMITY_BURST_RANGE = 180;
const CLOSE_PROXIMITY_BURST_DELAY_MS = 5000;
const CLOSE_PROXIMITY_PUSHBACK = 60;
const MIN_DEATH_COIN_DROP = 800;
const MAX_DEATH_COIN_DROP = 1500;
const MIN_DEATH_COIN_STACK = 5;
const MAX_DEATH_COIN_STACK = 25;
const DEATH_COIN_SPREAD = 140;
const SWORD9_DROP_CHANCE = 0.25;
const BONUS_DROP_SPREAD = 80;

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
        this.nextBurstTime = performance.now() + this.getRandomBurstCooldownMs();
        this.nextShockwaveRollTime = performance.now() + this.getRandomShockwaveCooldownMs();
        this.freezeUntil = 0;
        this.shockwaveActive = false;
        this.shockwaveWavesEmitted = 0;
        this.nextShockwaveWaveTime = 0;
        this.closeProximityStartTime = 0;
    }

    getHealthRatio() {
        if (!this.maxHp || this.maxHp <= 0) return 1;
        return Math.max(0, Math.min(1, this.hp / this.maxHp));
    }

    getDifficultyStage() {
        const ratio = this.getHealthRatio();
        if (ratio <= 0.2) return 3;
        if (ratio <= 0.6) return 2;
        return 1;
    }

    getAttackDamageMultiplier() {
        const stage = this.getDifficultyStage();
        if (stage === 3) return 1.5;
        if (stage === 2) return 1.25;
        return 1;
    }

    getBurstCooldownWindowMs() {
        const stage = this.getDifficultyStage();
        if (stage === 3) return { min: 1000, max: 3000 }; // 1-3s
        if (stage === 2) return { min: 2000, max: 4000 }; // 2-4s
        return { min: BURST_COOLDOWN_MIN_MS, max: BURST_COOLDOWN_MIN_MS + BURST_COOLDOWN_RANDOM_MS }; // 3-5s
    }

    getShockwaveCooldownWindowMs() {
        const stage = this.getDifficultyStage();
        if (stage === 3) return { min: 2000, max: 4000 }; // 2-4s
        return { min: SHOCKWAVE_ROLL_MIN_MS, max: SHOCKWAVE_ROLL_MIN_MS + SHOCKWAVE_ROLL_RANDOM_MS }; // 2-5s
    }

    getShockwaveProcChance() {
        const stage = this.getDifficultyStage();
        if (stage === 3) return 0.4;
        if (stage === 2) return 0.35;
        return SHOCKWAVE_PROC_CHANCE;
    }

    getRandomBurstCooldownMs() {
        const { min, max } = this.getBurstCooldownWindowMs();
        return getRandomIntInclusive(min, max);
    }

    getRandomShockwaveCooldownMs() {
        const { min, max } = this.getShockwaveCooldownWindowMs();
        return getRandomIntInclusive(min, max);
    }

    clampStageTimers(now) {
        const burstWindow = this.getBurstCooldownWindowMs();
        if (!this.burstActive && this.nextBurstTime - now > burstWindow.max) {
            this.nextBurstTime = now + burstWindow.max;
        }

        const shockwaveWindow = this.getShockwaveCooldownWindowMs();
        if (this.nextShockwaveRollTime - now > shockwaveWindow.max) {
            this.nextShockwaveRollTime = now + shockwaveWindow.max;
        }
    }

    alarm(shooter, reason = 'hit') {
        const isPlayerShooter = shooter instanceof Player;

        if (isPlayerShooter && shooter?.isInvisible) return;

        if (isPlayerShooter) {
            this.target = shooter;
            this.targetId = shooter.id;
            this.alarmReason = reason;
        } else if (!this.target && this.targetId != null) {
            this.target = ENTITIES.PLAYERS[this.targetId] || null;
        }

        if (!this.isAlarmed) {
            this.isAlarmed = true;
            this.startHuntingTime = performance.now();
        }

        this.speed = dataMap.MOBS[this.type].speed * 2;
    }

    getAlarmSpeedMultiplier() {
        return 2;
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getAlarmedTarget();
            if (!target) {
                this.resetAlarmState();
                this.targetId = null;
                return;
            }

            // Angry Minotaur turns toward its target with a capped turn rate.
            const desiredAngle = Math.atan2(target.y - this.y, target.x - this.x);
            const angleDelta = normalizeAngle(desiredAngle - this.angle);
            const clampedDelta = Math.max(-TURN_RATE_RAD, Math.min(TURN_RATE_RAD, angleDelta));
            this.angle = normalizeAngle(this.angle + clampedDelta);
            return;
        }

        super.turn();
    }

    process() {
        const preX = this.x;
        const preY = this.y;
        super.process();
        const now = performance.now();
        this.clampStageTimers(now);
        this.processShockwaveWaves(now);
        this.processForcedCloseRangeBurst(now);

        if (now < this.freezeUntil) {
            this.freezeInPlace(preX, preY);
            return;
        }

        this.tryShockwave(now);
        if (now < this.freezeUntil) {
            // Start standing still immediately when shockwave procs.
            this.freezeInPlace(preX, preY);
            return;
        }

        this.resolveMobCollisions();
        this.processLeapBurst();
        this.updateSwingState();
        this.trySwingAttack();
    }

    processForcedCloseRangeBurst(now) {
        if (!this.isAlarmed) {
            this.closeProximityStartTime = 0;
            return;
        }
        const target = this.getAlarmedTarget();
        if (!target || !target.isAlive) {
            this.closeProximityStartTime = 0;
            return;
        }

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > CLOSE_PROXIMITY_BURST_RANGE * CLOSE_PROXIMITY_BURST_RANGE) {
            this.closeProximityStartTime = 0;
            return;
        }

        if (!this.closeProximityStartTime) {
            this.closeProximityStartTime = now;
            return;
        }
        if (now - this.closeProximityStartTime < CLOSE_PROXIMITY_BURST_DELAY_MS) return;

        // Trigger guaranteed burst when a target camps too close for too long.
        this.spawnShockwaveProjectiles();
        this.pushTargetAway(target, CLOSE_PROXIMITY_PUSHBACK);
        this.closeProximityStartTime = now;
    }

    pushTargetAway(target, distance) {
        if (!target) return;
        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.001) {
            dx = Math.cos(this.angle);
            dy = Math.sin(this.angle);
            dist = 1;
        }
        target.x += (dx / dist) * distance;
        target.y += (dy / dist) * distance;
        if (typeof target.clamp === 'function') target.clamp();
    }

    freezeInPlace(x, y) {
        this.x = x;
        this.y = y;
        this.clamp();
    }

    getAlarmedTarget() {
        const targetFromId = this.targetId != null ? ENTITIES.PLAYERS[this.targetId] : null;
        const targetFromRef = this.getLiveTarget();
        const target = targetFromId || targetFromRef;
        if (!target || !target.isAlive) return null;
        this.target = target;
        this.targetId = target.id;
        return target;
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
        if (!this.isAlarmed) return;
        const target = this.getAlarmedTarget();
        if (!target) return;

        const now = performance.now();
        if (!this.burstActive) {
            if (now < this.nextBurstTime) return;
            this.burstActive = true;
            this.burstStartTime = now;
            this.lastBurstLeapTime = now - BURST_LEAP_INTERVAL_MS;
        }

        if (now - this.burstStartTime >= BURST_DURATION_MS) {
            this.burstActive = false;
            this.nextBurstTime = now + this.getRandomBurstCooldownMs();
            return;
        }

        if (now - this.lastBurstLeapTime < BURST_LEAP_INTERVAL_MS) return;
        this.lastBurstLeapTime = now;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.001) return;

        this.x += (dx / dist) * BURST_LEAP_DISTANCE;
        this.y += (dy / dist) * BURST_LEAP_DISTANCE;
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
        if (!this.isAlarmed) return;
        const target = this.getAlarmedTarget();
        if (!target || !target.isAlive || target.hasShield || target.isInvisible) return;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distSq = dx * dx + dy * dy;
        const swingRange = dataMap.SWORDS['imgs'][9].swordWidth * 1.5;
        if (distSq > swingRange * swingRange) return;
        const targetAngle = Math.atan2(dy, dx);
        const facingDelta = Math.abs(normalizeAngle(targetAngle - this.angle));
        if (facingDelta > SWING_FACING_HALF_ARC) return; // target must be in front hemisphere
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
        for (const angleOffset of SLASH_OFFSETS) {
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

        this.nextShockwaveRollTime = now + this.getRandomShockwaveCooldownMs();

        // "have a chance" every 2-5s
        if (Math.random() > this.getShockwaveProcChance()) return;

        this.freezeUntil = now + SHOCKWAVE_FREEZE_MS;
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

        while (this.shockwaveWavesEmitted < SHOCKWAVE_WAVE_COUNT && now >= this.nextShockwaveWaveTime) {
            this.spawnShockwaveProjectiles();
            this.shockwaveWavesEmitted++;
            this.nextShockwaveWaveTime += SHOCKWAVE_WAVE_INTERVAL_MS;
        }

        if (this.shockwaveWavesEmitted >= SHOCKWAVE_WAVE_COUNT || now > this.freezeUntil) {
            this.shockwaveActive = false;
        }
    }

    spawnShockwaveProjectiles() {
        spawnEnergyBurstProjectiles(this);
    }

    die(killer) {
        this.scatterDeathCoins();
        this.rollBonusDrops();
        super.die(killer);
    }

    rollBonusDrops() {
        if (Math.random() < SWORD9_DROP_CHANCE) {
            this.spawnDropAtDeathPosition(9);
        }
        this.spawnMinotaurHatDrop();
    }

    spawnDropAtDeathPosition(type) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * BONUS_DROP_SPREAD;
        const dropX = this.x + Math.cos(angle) * distance;
        const dropY = this.y + Math.sin(angle) * distance;
        spawnObject(type, dropX, dropY, 1, 'minotaur');
    }

    spawnMinotaurHatDrop() {
        const accessoryId = ACCESSORY_NAME_TO_ID['minotaur-hat'];
        const itemType = accessoryItemTypeFromId(accessoryId);
        if (!itemType) return;
        this.spawnDropAtDeathPosition(itemType);
    }

    scatterDeathCoins() {
        const coinType = getCoinObjectType();
        if (!coinType) return;

        let remaining = getRandomIntInclusive(MIN_DEATH_COIN_DROP, MAX_DEATH_COIN_DROP);
        while (remaining > 0) {
            const stackSize = Math.min(remaining, getRandomIntInclusive(MIN_DEATH_COIN_STACK, MAX_DEATH_COIN_STACK));
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * DEATH_COIN_SPREAD;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(coinType, dropX, dropY, stackSize, 'minotaur');
            remaining -= stackSize;
        }
    }
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
