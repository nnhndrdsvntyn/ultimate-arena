import {
    Mob
} from "./mob.js";
import {
    ENTITIES,
    spawnObject,
    markRootWalkerBossDefeated
} from '../../game.js';
import {
    dataMap,
    getCoinObjectType,
    getWeaponSize,
    SPEAR_2_TYPE,
    SPEAR_7_TYPE,
    SPEAR_10_TYPE,
    getWeaponAttackStats
} from '../../../public/shared/datamap.js';
import {
    emitPoisonAoeFx,
    getId,
    poison,
    cmdRun
} from '../../helpers.js';
import { getWorldCenter, getWorldMapSize, WORLD_ROOT_DIMENSION } from '../../../public/shared/worlds.js';
import { RootWalkerPortal } from '../structures/boss_shrine.js';

const BONE_BARRAGE_COOLDOWN_MS = 15000;
const POISON_SPLASH_COOLDOWN_MS = 20000;
const GLOBAL_ABILITY_COOLDOWN_MS = 5000;
const BONE_BARRAGE_DURATION_MS = 5000;
const BONE_BARRAGE_INTERVAL_MS = 250;
const BONE_BARRAGE_DAMAGE_MULT = 1;
const BONE_BARRAGE_SIZE_MULT = 3;
const BONE_BARRAGE_SPEED_DIVISOR = 1.3;
const SWORD_9_BLAST_COOLDOWN_MS = 18000;
const SWORD_9_BLAST_COUNT = 3;
const ROOT_WALKER_THROW_WEAPON_TYPE = SPEAR_2_TYPE;
const ROCK_MEDIUM_TYPE = 2;
const ROCK_BIG_TYPE = 6;
const ROCK_SMALL_TYPE = 7;
const POISON_SPLASH_AOE_DURATION_MS = 750;
const POISON_SPLASH_INITIAL_DAMAGE = 40;
const POISON_SPLASH_TICK_DAMAGE = 7;
const POISON_SPLASH_TICK_RATE_MS = 750;
const POISON_SPLASH_DURATION_MS = 5000;
const POISON_SPLASH_PULSE_INTERVAL_MS = 50;

export class RootWalker extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 7);
        this.noRespawn = true;
        this.weapon = { rank: 1 };
        this.strength = 0;
        this.lastAbilityUseTime = 0;
        this.lastBoneBarrageTime = -Infinity;
        this.lastPoisonSplashTime = -Infinity;
        this.lastSword9BlastTime = -Infinity;
        this._boneBarrageTimer = null;
        this._boneBarrageEndsAt = 0;
        this._sword9BlastTimer = null;
        this._sword9BlastEndsAt = 0;
        this._nextAbilityCheckAt = 0;
        this._roamTargetX = x;
        this._roamTargetY = y;
        this._nextRoamRetargetAt = 0;
    }

    alarm(shooter, reason = 'hit') {
        if (this.isBossIntroLocked()) return;
        if ((shooter?.world || 'main') !== (this.world || 'main')) return;
        if (shooter?.isInvisible) return;
        this.target = shooter;
        this.alarmReason = reason;

        if (this.isAlarmed) return;
        this.isAlarmed = true;
        this.startHuntingTime = performance.now();
        this.speed = dataMap.MOBS[this.type].speed * this.getAlarmSpeedMultiplier();
    }

    getLiveTarget(requireSameReference = false) {
        if (!this.target) return null;
        const target = ENTITIES.PLAYERS[this.target.id];
        if (!target || !target.isAlive) return null;
        if ((target.world || 'main') !== (this.world || 'main')) return null;
        if (target.isInvisible) return null;
        if (requireSameReference && target !== this.target) return null;
        return target;
    }

    findPreferredTarget() {
        const world = this.world || 'main';
        const lastHitTarget = this.lastHitById ? ENTITIES.PLAYERS[this.lastHitById] : null;
        if (lastHitTarget && lastHitTarget.isAlive && !lastHitTarget.isInvisible && (lastHitTarget.world || 'main') === world) {
            return lastHitTarget;
        }

        let nearest = null;
        let nearestDistSq = Infinity;
        for (const id in ENTITIES.PLAYERS) {
            const candidate = ENTITIES.PLAYERS[id];
            if (!candidate || !candidate.isAlive) continue;
            if ((candidate.world || 'main') !== world) continue;
            if (candidate.isInvisible) continue;
            const dx = candidate.x - this.x;
            const dy = candidate.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq >= nearestDistSq) continue;
            nearest = candidate;
            nearestDistSq = distSq;
        }
        return nearest;
    }

    isTargetHidden(target, treeCollisionPadding = null) {
        if (!target) return true;
        // Root Walker should keep aggro through tree stealth, but true invisibility still hides players.
        return !!target.isInvisible;
    }

    updateAlarmState(currentTime) {
        if (!this.isAlarmed) return;
        const target = this.getLiveTarget(true);
        if (!target) {
            const nextTarget = this.findPreferredTarget();
            if (!nextTarget) {
                this.resetAlarmState();
                return;
            }
            this.target = nextTarget;
            this.alarmReason = this.lastHitById === nextTarget.id ? 'hit' : 'proximity';
            this.startHuntingTime = currentTime;
        }
    }

    resetAlarmState() {
        super.resetAlarmState();
        this.clearBoneBarrage();
        this.clearSword9Blast();
        this.lastHitById = null;
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget(true);
            this.handleAlarmedTarget(target, null, t => {
                this.angle = Math.atan2(t.y - this.y, t.x - this.x);
            });
            return;
        }

        super.turn();
    }

    process(runDecisionLogic = true) {
        if (this.isBossIntroLocked()) {
            this.lastX = this.x;
            this.lastY = this.y;
            this.isAlarmed = false;
            this.target = null;
            this.alarmReason = null;
            this.speed = 0;
            return;
        }
        if (!this.processRootDimensionMovement(runDecisionLogic)) {
            super.process(runDecisionLogic);
        }
        if (!runDecisionLogic) return;
        if (!this.isAlarmed) return;
        const target = this.getLiveTarget(true);
        if (!target) return;

        const now = performance.now();
        if (now < (this._nextAbilityCheckAt || 0)) return;
        this._nextAbilityCheckAt = now + 400;
        this.tryTriggerReactiveAbility(target);
    }

    processRootDimensionMovement(runDecisionLogic = true) {
        if ((this.world || 'main') !== WORLD_ROOT_DIMENSION) return false;

        const now = performance.now();
        const [worldWidth, worldHeight] = getWorldMapSize(WORLD_ROOT_DIMENSION);
        const edgeMargin = Math.max(220, (this.radius || 0) + 120);
        const minX = edgeMargin;
        const minY = edgeMargin;
        const maxX = Math.max(minX, worldWidth - edgeMargin);
        const maxY = Math.max(minY, worldHeight - edgeMargin);
        const baseSpeed = dataMap.MOBS[this.type].speed;

        this.inRiverVertical = false;
        this.inRiverHorizontal = false;
        this.inWater = false;

        if (!this.isBlinded(now) && this._blindStored) {
            this.restoreBlindState();
        }

        if (this.isBlinded(now)) {
            this.storeBlindState();
            this.isAlarmed = false;
            this.target = null;
            this.alarmReason = null;
            this.speed = baseSpeed * (this.blindSpeedMult || 1.5);
            if (!this._blindNextTurnAt || now >= this._blindNextTurnAt) {
                this.defaultTurn();
                this._blindNextTurnAt = now + 160 + Math.floor(Math.random() * 220);
            }
            this.move();
            this.clamp();
            return true;
        }

        let target = this.getLiveTarget(true);
        if (!target) {
            const preferredTarget = this.findPreferredTarget();
            if (preferredTarget) {
                this.target = preferredTarget;
                this.alarmReason = this.lastHitById === preferredTarget.id ? 'hit' : 'proximity';
                this.isAlarmed = true;
                this.startHuntingTime = now;
                target = preferredTarget;
            }
        }

        if (target) {
            this.speed = baseSpeed * this.getAlarmSpeedMultiplier();
            this.steerToward(target.x, target.y, 0.03);
        } else {
            if (this.isAlarmed) {
                this.resetAlarmState();
            }
            this.speed = baseSpeed;
            const closeToTarget = Math.hypot((this._roamTargetX || this.x) - this.x, (this._roamTargetY || this.y) - this.y) <= 80;
            const nearEdge = this.x <= minX || this.x >= maxX || this.y <= minY || this.y >= maxY;
            if (
                !Number.isFinite(this._roamTargetX)
                || !Number.isFinite(this._roamTargetY)
                || closeToTarget
                || nearEdge
                || now >= (this._nextRoamRetargetAt || 0)
            ) {
                this._roamTargetX = minX + Math.random() * Math.max(1, maxX - minX);
                this._roamTargetY = minY + Math.random() * Math.max(1, maxY - minY);
                this._nextRoamRetargetAt = now + 1800 + Math.floor(Math.random() * 2200);
            }
            this.steerToward(this._roamTargetX, this._roamTargetY, 0.08);
        }

        this.move();
        this.clamp();
        return true;
    }

    damage(health, attacker) {
        if (this.isBossIntroLocked()) return false;
        const tookDamage = super.damage(health, attacker);
        if (tookDamage) {
            if (attacker && attacker.isAlive && !attacker.isInvisible && (attacker.world || 'main') === (this.world || 'main')) {
                this.target = attacker;
                this.alarmReason = 'hit';
                if (!this.isAlarmed) {
                    this.isAlarmed = true;
                    this.startHuntingTime = performance.now();
                    this.speed = dataMap.MOBS[this.type].speed * this.getAlarmSpeedMultiplier();
                }
            }
            this.tryTriggerReactiveAbility(attacker);
        }
        return tookDamage;
    }

    die(killer) {
        this.clearBoneBarrage();
        this.clearSword9Blast();
        markRootWalkerBossDefeated();
        this.scatterDeathCoins();
        this.scatterAccessoryDrops();
        this.scatterBoneSwords();
        this.scatterSpear7Drops();
        this.scatterSpear10Drops();
        this.spawnExitPortal();
        super.die(killer);
    }

    spawnExitPortal() {
        const world = this.world || 'main';
        if (world !== WORLD_ROOT_DIMENSION) return;

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            if ((structure.world || 'main') !== world) continue;
            if (structure.type !== 5) continue;
            if (structure.portalMode === 'exit') return;
        }

        const center = getWorldCenter(world);
        const portalId = getId('STRUCTURES');
        new RootWalkerPortal(portalId, center.x, center.y, 'exit');
        const portal = ENTITIES.STRUCTURES[portalId];
        if (!portal) return;
        portal.world = world;
        portal.isNatural = false;
        cmdRun.broadcastStructureSpawn(portal);
    }

    scatterDeathCoins() {
        const coinType = getCoinObjectType();
        if (!coinType) return;

        const MIN_DEATH_COIN_DROP = 800 * 5;
        const MAX_DEATH_COIN_DROP = 1500 * 5;
        const MIN_DEATH_COIN_STACK = 5;
        const MAX_DEATH_COIN_STACK = 25;
        const DEATH_COIN_SPREAD = 180;

        let remaining = getRandomIntInclusive(MIN_DEATH_COIN_DROP, MAX_DEATH_COIN_DROP);
        while (remaining > 0) {
            const stackSize = Math.min(remaining, getRandomIntInclusive(MIN_DEATH_COIN_STACK, MAX_DEATH_COIN_STACK));
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * DEATH_COIN_SPREAD;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(coinType, dropX, dropY, stackSize, 'root_walker', this.world || 'main');
            remaining -= stackSize;
        }
    }

    scatterAccessoryDrops() {
        const cloakType = dataMap.OBJECT_TYPE_BY_KEY?.['bush_cloak_drop'] || 0;
        if (!cloakType) return;
        const count = getRandomIntInclusive(5, 10);
        const spread = 140;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(cloakType, dropX, dropY, 1, 'root_walker', this.world || 'main');
        }
    }

    scatterBoneSwords() {
        const count = getRandomIntInclusive(5, 10);
        const spread = 140;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(1, dropX, dropY, 1, 'root_walker', this.world || 'main');
        }
    }

    scatterSpear7Drops() {
        const count = getRandomIntInclusive(3, 5);
        const spread = 140;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(SPEAR_7_TYPE, dropX, dropY, 1, 'root_walker', this.world || 'main');
        }
    }

    scatterSpear10Drops() {
        const rollCount = 3;
        const dropChance = 0.5;
        const spread = 140;
        for (let i = 0; i < rollCount; i++) {
            if (Math.random() >= dropChance) continue;
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(SPEAR_10_TYPE, dropX, dropY, 1, 'root_walker', this.world || 'main');
        }
    }

    tryTriggerReactiveAbility(attacker) {
        if (this.hp <= 0) return;
        const now = performance.now();
        if (this.isBossAbilityLocked(now)) return;
        if (now - this.lastAbilityUseTime < GLOBAL_ABILITY_COOLDOWN_MS) return;

        const options = [];
        if (now - this.lastBoneBarrageTime >= BONE_BARRAGE_COOLDOWN_MS) {
            options.push('bone_barrage');
        }
        if (now - this.lastPoisonSplashTime >= POISON_SPLASH_COOLDOWN_MS) {
            options.push('poison_splash');
        }
        if (now - this.lastSword9BlastTime >= SWORD_9_BLAST_COOLDOWN_MS) {
            options.push('sword9_blast');
        }
        if (options.length === 0) return;

        const choice = options[Math.floor(Math.random() * options.length)];
        if (choice === 'bone_barrage') {
            this.lastAbilityUseTime = now;
            this.lastBoneBarrageTime = now;
            this.startBoneBarrage();
            return;
        }

        if (choice === 'poison_splash') {
            this.lastAbilityUseTime = now;
            this.lastPoisonSplashTime = now;
            this.castPoisonSplash(attacker);
            return;
        }

        if (choice === 'sword9_blast') {
            this.lastAbilityUseTime = now;
            this.lastSword9BlastTime = now;
            this.startSword9Blast();
        }
    }

    startBoneBarrage() {
        this.clearBoneBarrage();
        const now = performance.now();
        this._boneBarrageEndsAt = now + BONE_BARRAGE_DURATION_MS;
        const groupId = Math.random();

        this.throwBoneBarrageSword(groupId);
        this._boneBarrageTimer = setInterval(() => {
            if (this.hp <= 0) {
                this.clearBoneBarrage();
                return;
            }
            if (!this.getLatestHitter()) {
                this.clearBoneBarrage();
                return;
            }
            const nowTick = performance.now();
            if (nowTick >= this._boneBarrageEndsAt) {
                this.clearBoneBarrage();
                return;
            }
            this.throwBoneBarrageSword(groupId);
        }, BONE_BARRAGE_INTERVAL_MS);
    }

    clearBoneBarrage() {
        if (this._boneBarrageTimer) {
            clearInterval(this._boneBarrageTimer);
            this._boneBarrageTimer = null;
        }
        this._boneBarrageEndsAt = 0;
    }

    startSword9Blast() {
        this.clearSword9Blast();
        const groupId = Math.random();
        if (!this.getLatestHitter()) return;
        const offsets = [0, -30, 30].map(deg => deg * (Math.PI / 180));
        for (let i = 0; i < SWORD_9_BLAST_COUNT; i++) {
            const offset = offsets[i % offsets.length] || 0;
            this.throwSword9(groupId, offset);
        }
    }

    clearSword9Blast() {
        if (this._sword9BlastTimer) {
            clearInterval(this._sword9BlastTimer);
            this._sword9BlastTimer = null;
        }
        this._sword9BlastEndsAt = 0;
    }

    getLatestHitter() {
        return this.getLiveTarget();
    }

    throwBoneBarrageSword(groupId) {
        const angle = this.angle;

        const projId = getId('PROJECTILES');
        ENTITIES.newEntity({
            entityType: 'projectile',
            id: projId,
            x: this.x + Math.cos(angle) * (this.radius || 0),
            y: this.y + Math.sin(angle) * (this.radius || 0),
            angle,
            type: -1,
            shooter: this,
            groupId
        });

        const proj = ENTITIES.PROJECTILES[projId];
        if (!proj) return;
        proj.damage = 15;
        proj.radius *= BONE_BARRAGE_SIZE_MULT;
        proj.speed *= (2.25 / BONE_BARRAGE_SPEED_DIVISOR);
        proj.maxDistance *= 3;
        proj.rockPushTypes = new Set([ROCK_MEDIUM_TYPE, ROCK_SMALL_TYPE]);
    }

    throwSword9(groupId, angleOffset = 0) {
        const angle = this.angle + angleOffset;
        const rank = ROOT_WALKER_THROW_WEAPON_TYPE;
        const projId = getId('PROJECTILES');
        ENTITIES.newEntity({
            entityType: 'projectile',
            id: projId,
            x: this.x + Math.cos(angle) * (this.radius || 0),
            y: this.y + Math.sin(angle) * (this.radius || 0),
            angle,
            type: -1,
            shooter: this,
            groupId
        });

        const proj = ENTITIES.PROJECTILES[projId];
        if (!proj) return;
        const stats = getWeaponAttackStats(rank) || getWeaponAttackStats(1) || {};
        const weaponCfg = dataMap.SPEARS?.imgs?.[rank] || dataMap.SWORDS?.imgs?.[1];
        const baseDamage = (this.strength + (stats?.damage || 0)) * 1.15;
        proj.damage = baseDamage / 1.5;
        proj.speed = (stats?.speed || proj.speed || 0) / 1.25;
        proj.maxDistance = (stats?.maxDistance || proj.maxDistance || 0) * 2.5;
        if (this.inWater) {
            proj.speed *= 0.4;
        }
        if (weaponCfg) {
            const [swordWidth] = getWeaponSize(rank);
            proj.radius = swordWidth * 2;
        }
        proj.weaponRank = (rank | 0x80);
        proj.persistentHits = true;
        proj.hitEntities = new Set();
        proj.ignoreProjectileCollisions = true;
        proj.rockPushTypes = new Set([ROCK_MEDIUM_TYPE, ROCK_BIG_TYPE, ROCK_SMALL_TYPE]);
    }

    castPoisonSplash() {
        const sourceWorld = this.world || 'main';
        const originX = this.x;
        const originY = this.y;
        const sourceRadius = Math.max(0, this.radius || 0);
        const baseRadius = dataMap.PLAYERS?.baseRadius || 30;
        const radiusScale = Math.max(0, sourceRadius) / Math.max(1, baseRadius);
        const aoeRadius = 300 * radiusScale;
        const initialBlastDamage = POISON_SPLASH_INITIAL_DAMAGE;
        const poisonDamage = POISON_SPLASH_TICK_DAMAGE;
        const startedAt = performance.now();
        const endsAt = startedAt + POISON_SPLASH_AOE_DURATION_MS;

        const hitSet = new Set();
        const applyPulse = () => {
            const now = performance.now();
            const progress = Math.max(0, Math.min(1, (now - startedAt) / POISON_SPLASH_AOE_DURATION_MS));
            const currentRadius = aoeRadius * progress;

            for (const id in ENTITIES.PLAYERS) {
                const target = ENTITIES.PLAYERS[id];
                if (!target || !target.isAlive) continue;
                if ((target.world || 'main') !== sourceWorld) continue;
                const hitKey = `p:${target.id}`;
                if (hitSet.has(hitKey)) continue;
                const dx = target.x - originX;
                const dy = target.y - originY;
                const allowed = currentRadius + sourceRadius + Math.max(0, target.radius || 0);
                if (dx * dx + dy * dy <= (allowed * allowed)) {
                    target.damage(initialBlastDamage, this);
                    poison(target, poisonDamage, POISON_SPLASH_TICK_RATE_MS, POISON_SPLASH_DURATION_MS, this, true);
                    hitSet.add(hitKey);
                }
            }

            for (const id in ENTITIES.MOBS) {
                const target = ENTITIES.MOBS[id];
                if (!target || target.hp <= 0 || target.id === this.id) continue;
                if ((target.world || 'main') !== sourceWorld) continue;
                const hitKey = `m:${target.id}`;
                if (hitSet.has(hitKey)) continue;
                const dx = target.x - originX;
                const dy = target.y - originY;
                const allowed = currentRadius + sourceRadius + Math.max(0, target.radius || 0);
                if (dx * dx + dy * dy <= (allowed * allowed)) {
                    target.damage(initialBlastDamage, this);
                    poison(target, poisonDamage, POISON_SPLASH_TICK_RATE_MS, POISON_SPLASH_DURATION_MS, this, true);
                    hitSet.add(hitKey);
                }
            }
        };

        applyPulse();
        const pulseTimer = setInterval(() => {
            if (this.hp <= 0) {
                clearInterval(pulseTimer);
                return;
            }
            applyPulse();
            if (performance.now() >= endsAt) {
                clearInterval(pulseTimer);
            }
        }, POISON_SPLASH_PULSE_INTERVAL_MS);

        emitPoisonAoeFx(this.x, this.y, aoeRadius, POISON_SPLASH_AOE_DURATION_MS, 2, sourceWorld);
    }
}

function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
