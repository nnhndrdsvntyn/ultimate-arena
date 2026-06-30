import { Mob } from "./mob.js";
import { SWORD_7_TYPE, BOOMERANG_7_TYPE, BOOMERANG_10_TYPE, dataMap, getCoinObjectType, isRockStructureType } from '../../../public/shared/datamap.js';
import { getWorldCenter, getWorldMapSize, WORLD_DUNE_DIMENSION } from '../../../public/shared/worlds.js';
import { ENTITIES, markDuneBossDefeated, spawnObject } from '../../game.js';
import { getId, cmdRun, playSfx, pushEntityOutOfSafeZone } from '../../helpers.js';
import { DunePortal } from '../structures/boss_shrine.js';

const SANDLING_MOB_TYPE = 18;
const SANDLING_SPAWN_ABILITY = 1;
const SANDLING_SPAWN_COOLDOWN_MS = 30000;
const SANDLING_SPAWN_INTERVAL_MS = 150 * 5;
const SANDLING_SPAWN_FULL_DURATION_MS = 10000;
const SANDLING_SPAWN_ENRAGED_DURATION_MS = 5000;
const SANDLING_SPAWN_SPEED_MULT = 1.5;
const SANDLING_SPAWN_BURST_SPEED_MULT = 4.25;
const SANDLING_SPAWN_BURST_DURATION_MS = 320;
const SANDLING_SPAWN_HP_MULT = 2;
const SANDLING_SPAWN_ENRAGED_HP_MULT = 5;
const SANDLING_SPAWN_DAMAGE = 7;
const SANDLING_SPAWN_ENRAGED_DAMAGE = 7;
const SANDSPIN_ABILITY = 2;
const SANDSPIN_COOLDOWN_MS = 150000;
const SANDSPIN_WINDUP_MS = 250;
const SANDSPIN_RAMP_MS = 5000;
const SANDSPIN_DASH_MS = 5000;
const SANDSPIN_DASH_INTERVAL_MS = 1000;
const SANDSPIN_MAX_DEGREES_PER_SECOND = 1800;
const SANDSPIN_MIN_DAMAGE = 20;
const SANDSPIN_MAX_DAMAGE = 70;
const SANDSPIN_CONTACT_BUFFER = 45;
const SANDSPIN_MIN_KNOCKBACK_DISTANCE = 300;
const SANDSPIN_MAX_KNOCKBACK_DISTANCE = 1500;
const SANDSPIN_KNOCKBACK_DURATION_MS = 250;
const SANDSPIN_LAUNCH_DISTANCE = 1000;
const GLOBAL_ABILITY_COOLDOWN_MS = 5000;
const ROCK_MEDIUM_TYPE = 2;
const ROCK_BIG_TYPE = 6;
const ROCK_SMALL_TYPE = 7;
const SANDSPIN_SMALL_ROCK_KNOCKBACK_MULT = 1;
const SANDSPIN_MEDIUM_ROCK_KNOCKBACK_MULT = 1 / 3;
const SANDSPIN_BIG_ROCK_KNOCKBACK_MULT = 1 / 6;
const ROCK_TORNADO_ABILITY = 3;
const ROCK_TORNADO_COOLDOWN_MS = 40000;
const ROCK_TORNADO_EDGE_MARGIN = 700;
const ROCK_TORNADO_GATHER_MAX_MS = 6500;
const ROCK_TORNADO_SPIN_MS = 7000;
const ROCK_TORNADO_SPIN_RAMP_MS = 3000;
const ROCK_TORNADO_FLING_MS = 3200;
const ROCK_TORNADO_PULL_SPEED_PER_SEC = 1200;
const ROCK_TORNADO_ORBIT_DEGREES_PER_SECOND = 840;
const ROCK_TORNADO_FLING_SPEED_PER_SEC = 2100;
const ROCK_TORNADO_NEAR_DISTANCE = 18;
const ROCK_TORNADO_HIT_BUFFER = 8;
const ROCK_TORNADO_MIN_ORBIT_RADIUS = 430;
const ROCK_TORNADO_ORBIT_RING_GAP = 260;
const ROCK_TORNADO_ORBIT_SLOT_SPACING = 500;
const ROCK_TORNADO_COLLISION_BUFFER = 40;
const ROCK_TORNADO_COLLISION_PASSES = 3;
const ROCK_TORNADO_SMALL_DAMAGE = 15;
const ROCK_TORNADO_MEDIUM_DAMAGE = 30;
const ROCK_TORNADO_BIG_DAMAGE = 60;
const ROCK_CANNON_ABILITY = 4;
const ROCK_CANNON_COOLDOWN_MS = 40000;
const ROCK_CANNON_DURATION_MS = 10000;
const ROCK_CANNON_SHOT_COUNT = 3;
const ROCK_CANNON_SHOT_INTERVAL_MS = 1000;
const ROCK_CANNON_MAX_GATHER_MS = 1000;
const ROCK_CANNON_PULL_SPEED_PER_SEC = 2600;
const ROCK_CANNON_LAUNCH_SPEED_PER_SEC = ROCK_TORNADO_FLING_SPEED_PER_SEC * 2;
const ROCK_CANNON_FLIGHT_MS = 1800;
const ROCK_CANNON_FRONT_BUFFER = 55;
const ROCK_CANNON_NEAR_DISTANCE = 20;
const ROCK_CANNON_KNOCKBACK_DURATION_MS = 250;
const ROCK_CANNON_SMALL_KNOCKBACK = 220;
const ROCK_CANNON_MEDIUM_KNOCKBACK = 380;
const ROCK_CANNON_BIG_KNOCKBACK = 620;

export class DuneBehemoth extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 16);
        this.noRespawn = true;
        this.weapon = { rank: 1 };
        this.strength = 0;
        this.lastHitById = null;
        this._roamTargetX = x;
        this._roamTargetY = y;
        this._nextRoamRetargetAt = 0;
        this.lastAbilityUseTime = 0;
        this.lastSandlingSpawnTime = -Infinity;
        this.lastSandspinTime = -Infinity;
        this.lastRockTornadoTime = -Infinity;
        this.lastRockCannonTime = -Infinity;
        this._sandlingSpawnTimer = null;
        this._sandlingSpawnEndsAt = 0;
        this._nextAbilityCheckAt = 0;
        this._sandspinState = null;
        this._rockTornadoState = null;
        this._rockCannonState = null;
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

    damage(health, attacker) {
        if (this.isBossIntroLocked()) return false;
        const tookDamage = Mob.prototype.damage.call(this, health, attacker);
        if (tookDamage && attacker && attacker.isAlive && !attacker.isInvisible && (attacker.world || 'main') === (this.world || 'main')) {
            this.target = attacker;
            this.alarmReason = 'hit';
            this.isAlarmed = true;
            this.startHuntingTime = performance.now();
            this.speed = dataMap.MOBS[this.type].speed * this.getAlarmSpeedMultiplier();
            this.tryTriggerReactiveAbility(attacker);
        }
        return tookDamage;
    }

    die(killer) {
        this.clearSandlingSpawn();
        this.clearSandspin();
        this.clearRockTornado();
        this.clearRockCannon();
        markDuneBossDefeated();
        this.scatterDeathCoins();
        this.scatterBoomerang7Drops();
        this.scatterSword7Drops();
        this.scatterBoomerang10Drop();
        this.spawnExitPortal();
        super.die(killer);
    }

    scatterDeathCoins() {
        const coinType = getCoinObjectType();
        if (!coinType) return;

        const MIN_DEATH_COIN_DROP = Math.round(800 * 5 * 1.25);
        const MAX_DEATH_COIN_DROP = Math.round(1500 * 5 * 1.25);
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
            spawnObject(coinType, dropX, dropY, stackSize, 'dune_behemoth', this.world || 'main');
            remaining -= stackSize;
        }
    }

    scatterBoomerang7Drops() {
        const count = getRandomIntInclusive(5, 10);
        this.scatterWeaponDrops(BOOMERANG_7_TYPE, count);
    }

    scatterSword7Drops() {
        const count = getRandomIntInclusive(3, 5);
        this.scatterWeaponDrops(SWORD_7_TYPE, count);
    }

    scatterBoomerang10Drop() {
        this.scatterWeaponDrops(BOOMERANG_10_TYPE, 1);
    }

    scatterWeaponDrops(itemType, count) {
        const spread = 140;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(itemType, dropX, dropY, 1, 'dune_behemoth', this.world || 'main');
        }
    }

    spawnExitPortal() {
        const world = this.world || 'main';
        if (world !== WORLD_DUNE_DIMENSION) return;

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            if ((structure.world || 'main') !== world) continue;
            if (structure.type !== 5) continue;
            if (structure.portalMode === 'exit') return;
        }

        const center = getWorldCenter(world);
        const portalId = getId('STRUCTURES');
        new DunePortal(portalId, center.x, center.y, 'exit');
        const portal = ENTITIES.STRUCTURES[portalId];
        if (!portal) return;
        portal.world = world;
        portal.isNatural = false;
        cmdRun.broadcastStructureSpawn(portal);
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
        if ((this.world || 'main') !== WORLD_DUNE_DIMENSION) {
            super.process(runDecisionLogic);
            return;
        }

        const now = performance.now();
        const [worldWidth, worldHeight] = getWorldMapSize(WORLD_DUNE_DIMENSION);
        const edgeMargin = Math.max(220, (this.radius || 0) + 120);
        const minX = edgeMargin;
        const minY = edgeMargin;
        const maxX = Math.max(minX, worldWidth - edgeMargin);
        const maxY = Math.max(minY, worldHeight - edgeMargin);
        const baseSpeed = dataMap.MOBS[this.type].speed;

        this.inRiverVertical = false;
        this.inRiverHorizontal = false;
        this.inWater = false;

        let target = this.getLiveTarget(true);
        if (!target) {
            const preferredTarget = this.findPreferredTarget();
            if (preferredTarget) {
                this.target = preferredTarget;
                this.alarmReason = this.lastHitById === preferredTarget.id ? 'hit' : 'proximity';
                this.isAlarmed = true;
                this.startHuntingTime = now;
                target = preferredTarget;
            } else if (this.isAlarmed) {
                this.resetAlarmState();
            }
        }

        if (this.processRockCannon(now)) return;
        if (this.processRockTornado(now)) return;
        if (this.processSandspin(now, target)) return;

        if (runDecisionLogic) {
            if (target) {
                this.speed = baseSpeed * this.getAlarmSpeedMultiplier();
                this.steerToward(target.x, target.y, 0.03);
            } else {
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
        }

        this.move();
        this.clamp();

        if (!runDecisionLogic || !target) return;
        if (now < (this._nextAbilityCheckAt || 0)) return;
        this._nextAbilityCheckAt = now + 400;
        this.tryTriggerReactiveAbility(target);
    }

    activateAbility(abilityNumber, now = performance.now(), options = {}) {
        const ability = Math.max(1, Math.min(4, Math.round(Number(abilityNumber) || 0)));
        const respectCooldowns = options.respectCooldowns !== false;
        if (this.hp <= 0) return false;
        if ((this.world || 'main') !== WORLD_DUNE_DIMENSION) return false;
        if (this.isBossAbilityLocked(now)) return false;
        if (this._sandspinState) return false;
        if (this._rockTornadoState) return false;
        if (this._rockCannonState) return false;

        if (ability === SANDLING_SPAWN_ABILITY) {
            if (respectCooldowns && now - this.lastSandlingSpawnTime < SANDLING_SPAWN_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastSandlingSpawnTime = now;
            this.startSandlingSpawn(now);
            return true;
        }

        if (ability === SANDSPIN_ABILITY) {
            if (respectCooldowns && now - this.lastSandspinTime < SANDSPIN_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastSandspinTime = now;
            this.startSandspin(now);
            return true;
        }

        if (ability === ROCK_TORNADO_ABILITY) {
            if (!this.canUseRockTornado()) return false;
            if (respectCooldowns && now - this.lastRockTornadoTime < ROCK_TORNADO_COOLDOWN_MS) return false;
            const started = this.startRockTornado(now);
            if (!started) return false;
            this.lastAbilityUseTime = now;
            this.lastRockTornadoTime = now;
            return true;
        }

        if (ability === ROCK_CANNON_ABILITY) {
            if (respectCooldowns && now - this.lastRockCannonTime < ROCK_CANNON_COOLDOWN_MS) return false;
            const started = this.startRockCannon(now);
            if (!started) return false;
            this.lastAbilityUseTime = now;
            this.lastRockCannonTime = now;
            return true;
        }

        return false;
    }

    startSandlingSpawn(now = performance.now()) {
        this.clearSandlingSpawn();

        const enraged = this.hp <= (this.maxHp || dataMap.MOBS[this.type].baseHealth) * 0.5;
        const durationMs = enraged ? SANDLING_SPAWN_ENRAGED_DURATION_MS : SANDLING_SPAWN_FULL_DURATION_MS;
        const hpMult = enraged ? SANDLING_SPAWN_ENRAGED_HP_MULT : SANDLING_SPAWN_HP_MULT;
        const damage = dataMap.MOBS[SANDLING_MOB_TYPE]?.damage || SANDLING_SPAWN_DAMAGE;
        const endsAt = now + durationMs;

        this.freezeUntil = Math.max(this.freezeUntil || 0, endsAt);
        this.speed = 0;
        this._sandlingSpawnEndsAt = endsAt;

        const spawn = () => {
            if (this.hp <= 0 || (this.world || 'main') !== WORLD_DUNE_DIMENSION) {
                this.clearSandlingSpawn();
                return;
            }
            if (performance.now() >= endsAt) {
                this.clearSandlingSpawn();
                return;
            }
            this.spawnSandlingSpawn(hpMult, damage);
        };

        spawn();
        this._sandlingSpawnTimer = setInterval(spawn, SANDLING_SPAWN_INTERVAL_MS);
    }

    clearSandlingSpawn() {
        if (this._sandlingSpawnTimer) {
            clearInterval(this._sandlingSpawnTimer);
            this._sandlingSpawnTimer = null;
        }
        this._sandlingSpawnEndsAt = 0;
    }

    startSandspin(now = performance.now()) {
        this.clearSandlingSpawn();
        this._sandspinState = {
            startedAt: now,
            lastTickAt: now,
            nextLaunchAt: now + SANDSPIN_WINDUP_MS + SANDSPIN_RAMP_MS,
            endsAt: now + SANDSPIN_WINDUP_MS + SANDSPIN_RAMP_MS + SANDSPIN_DASH_MS
        };
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + SANDSPIN_WINDUP_MS);
        this.speed = 0;
    }

    clearSandspin() {
        this._sandspinState = null;
    }

    canUseRockTornado() {
        const [worldWidth, worldHeight] = getWorldMapSize(WORLD_DUNE_DIMENSION);
        return (
            this.x >= ROCK_TORNADO_EDGE_MARGIN
            && this.y >= ROCK_TORNADO_EDGE_MARGIN
            && this.x <= worldWidth - ROCK_TORNADO_EDGE_MARGIN
            && this.y <= worldHeight - ROCK_TORNADO_EDGE_MARGIN
        );
    }

    startRockTornado(now = performance.now()) {
        this.clearSandlingSpawn();
        const rocks = this.getDuneRockTornadoRocks(now);
        if (rocks.length === 0) return false;

        this._rockTornadoState = {
            phase: 'gather',
            startedAt: now,
            phaseStartedAt: now,
            lastTickAt: now,
            rocks
        };
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + ROCK_TORNADO_GATHER_MAX_MS + ROCK_TORNADO_SPIN_MS + ROCK_TORNADO_FLING_MS);
        this.speed = 0;
        return true;
    }

    clearRockTornado() {
        this._rockTornadoState = null;
    }

    startRockCannon(now = performance.now()) {
        this.clearSandlingSpawn();
        const target = this.getLiveTarget(true) || this.findPreferredTarget();
        if (!target) return false;
        const rock = this.findNearestRockCannonRock();
        if (!rock) return false;

        this.target = target;
        this.isAlarmed = true;
        this.alarmReason = this.lastHitById === target.id ? 'hit' : 'proximity';
        this._rockCannonState = {
            startedAt: now,
            endsAt: now + ROCK_CANNON_DURATION_MS,
            nextShotAt: now + ROCK_CANNON_SHOT_INTERVAL_MS,
            lastTickAt: now,
            shotsStarted: 0,
            shotsCompleted: 0,
            usedRockIds: new Set(),
            activeShots: [],
            current: null
        };
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + ROCK_CANNON_DURATION_MS);
        this.speed = 0;
        this.aimRockCannonAtTarget(target);
        this.startRockCannonShot(this._rockCannonState, now);
        return true;
    }

    clearRockCannon() {
        this._rockCannonState = null;
    }

    processRockCannon(now = performance.now()) {
        const state = this._rockCannonState;
        if (!state) return false;

        if (this.hp <= 0 || (this.world || 'main') !== WORLD_DUNE_DIMENSION) {
            this.clearRockCannon();
            return false;
        }

        this.lastX = this.x;
        this.lastY = this.y;
        this.speed = 0;
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + 250);

        const deltaMs = Math.max(0, Math.min(250, now - (state.lastTickAt || now)));
        state.lastTickAt = now;
        const deltaSeconds = deltaMs / 1000;
        this.aimRockCannonAtTarget(this.getLiveTarget(true) || this.findPreferredTarget());

        if (Array.isArray(state.activeShots) && state.activeShots.length > 0) {
            state.activeShots = state.activeShots.filter((entry) => {
                const active = this.processRockCannonFling(entry, deltaSeconds, now);
                if (!active) state.shotsCompleted++;
                return active;
            });
        }

        if (state.current) {
            if (state.current.phase === 'gather') {
                if (this.processRockCannonGather(state, state.current, deltaSeconds, now)) {
                    this.launchRockCannonShot(state, state.current, now);
                }
                if (state.current) return true;
            } else {
                state.current = null;
                state.shotsCompleted++;
            }
        }

        if (state.shotsCompleted >= ROCK_CANNON_SHOT_COUNT) {
            this.clearRockCannon();
            return false;
        }

        const activeShotCount = Array.isArray(state.activeShots) ? state.activeShots.length : 0;
        if (now >= state.endsAt && state.shotsStarted >= ROCK_CANNON_SHOT_COUNT && !state.current && activeShotCount === 0) {
            this.clearRockCannon();
            return false;
        }

        if (!state.current && state.shotsStarted < ROCK_CANNON_SHOT_COUNT && now >= (state.nextShotAt || now) && now < state.endsAt) {
            if (!this.startRockCannonShot(state, now)) {
                this.clearRockCannon();
                return false;
            }
            state.nextShotAt = now + ROCK_CANNON_SHOT_INTERVAL_MS;
        }

        return true;
    }

    startRockCannonShot(state, now = performance.now()) {
        const target = this.getLiveTarget(true) || this.findPreferredTarget();
        if (!target) return false;

        let rock = this.findNearestRockCannonRock(state.usedRockIds);
        if (!rock) rock = this.findNearestRockCannonRock();
        if (!rock) return false;

        state.usedRockIds.add(rock.id);
        state.current = {
            id: rock.id,
            targetId: target.id,
            phase: 'gather',
            startedAt: now,
            hitTargets: new Set(),
            lastVx: 0,
            lastVy: 0,
            flightEndsAt: 0
        };
        state.shotsStarted++;
        this.target = target;
        this.isAlarmed = true;
        this.alarmReason = this.lastHitById === target.id ? 'hit' : 'proximity';
        this.aimRockCannonAtTarget(target);
        return true;
    }

    processRockCannonGather(_state, entry, deltaSeconds, now = performance.now()) {
        const rock = ENTITIES.STRUCTURES[entry.id];
        if (!rock || (rock.world || 'main') !== (this.world || 'main')) return true;

        const target = this.getRockCannonTarget(entry);
        this.aimRockCannonAtTarget(target);
        const frontPoint = this.getRockCannonFrontPoint(rock, target);
        const dx = frontPoint.x - rock.x;
        const dy = frontPoint.y - rock.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= ROCK_CANNON_NEAR_DISTANCE) return true;

        const step = Math.min(dist, ROCK_CANNON_PULL_SPEED_PER_SEC * Math.max(0.001, deltaSeconds));
        rock.lastX = rock.x;
        rock.lastY = rock.y;
        rock.x += (dx / dist) * step;
        rock.y += (dy / dist) * step;
        entry.lastVx = rock.x - rock.lastX;
        entry.lastVy = rock.y - rock.lastY;
        if (typeof rock.clamp === 'function') rock.clamp();
        return now >= entry.startedAt + ROCK_CANNON_MAX_GATHER_MS;
    }

    launchRockCannonShot(_state, entry, now = performance.now()) {
        const rock = ENTITIES.STRUCTURES[entry.id];
        if (!rock || (rock.world || 'main') !== (this.world || 'main')) {
            entry.phase = 'done';
            return;
        }

        const target = this.getRockCannonTarget(entry);
        this.aimRockCannonAtTarget(target);
        let dx = (target?.x ?? (this.x + Math.cos(this.angle || 0))) - rock.x;
        let dy = (target?.y ?? (this.y + Math.sin(this.angle || 0))) - rock.y;
        let dist = Math.hypot(dx, dy);
        if (dist <= 0.001) {
            dx = Math.cos(this.angle || 0);
            dy = Math.sin(this.angle || 0);
            dist = 1;
        }

        entry.phase = 'fling';
        entry.lastVx = dx / dist;
        entry.lastVy = dy / dist;
        entry.hitTargets = new Set();
        entry.flightEndsAt = now + ROCK_CANNON_FLIGHT_MS;
        rock.lastX = rock.x;
        rock.lastY = rock.y;
        const impactSfx = dataMap.sfxMap.indexOf('ground_impact');
        if (impactSfx >= 0) {
            playSfx(rock.x, rock.y, impactSfx, 1800, this.world || 'main');
        }
        if (Array.isArray(_state.activeShots)) _state.activeShots.push(entry);
        _state.current = null;
    }

    processRockCannonFling(entry, deltaSeconds, now = performance.now()) {
        if (now >= (entry.flightEndsAt || 0)) return false;
        const rock = ENTITIES.STRUCTURES[entry.id];
        if (!rock || (rock.world || 'main') !== (this.world || 'main')) return false;

        rock.lastX = rock.x;
        rock.lastY = rock.y;
        const stepDistance = ROCK_CANNON_LAUNCH_SPEED_PER_SEC * Math.max(0.001, deltaSeconds);
        rock.x += (entry.lastVx || 0) * stepDistance;
        rock.y += (entry.lastVy || 0) * stepDistance;
        if (typeof rock.clamp === 'function') rock.clamp();
        this.applyRockTornadoHits(rock, entry, {
            knockbackDistance: this.getRockCannonKnockbackDistance(rock.type),
            knockbackDurationMs: ROCK_CANNON_KNOCKBACK_DURATION_MS,
            dirX: entry.lastVx || 0,
            dirY: entry.lastVy || 0
        });
        return Math.abs(rock.x - rock.lastX) >= 0.001 || Math.abs(rock.y - rock.lastY) >= 0.001;
    }

    getRockCannonTarget(entry) {
        const target = entry?.targetId ? ENTITIES.PLAYERS[entry.targetId] : null;
        if (target && target.isAlive && !target.isInvisible && (target.world || 'main') === (this.world || 'main')) return target;
        return this.getLiveTarget(true) || this.findPreferredTarget();
    }

    aimRockCannonAtTarget(target = null) {
        if (!target || (target.world || 'main') !== (this.world || 'main')) return;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        if (Math.hypot(dx, dy) <= 0.001) return;
        this.angle = Math.atan2(dy, dx);
    }

    getRockCannonFrontPoint(rock, target = null) {
        let dx = (target?.x ?? (this.x + Math.cos(this.angle || 0))) - this.x;
        let dy = (target?.y ?? (this.y + Math.sin(this.angle || 0))) - this.y;
        let dist = Math.hypot(dx, dy);
        if (dist <= 0.001) {
            dx = Math.cos(this.angle || 0);
            dy = Math.sin(this.angle || 0);
            dist = 1;
        }
        const frontDistance = (this.radius || 0) + this.getRockTornadoRockRadius(rock) + ROCK_CANNON_FRONT_BUFFER;
        return {
            x: this.x + (dx / dist) * frontDistance,
            y: this.y + (dy / dist) * frontDistance
        };
    }

    findNearestRockCannonRock(excludeIds = null) {
        const world = this.world || 'main';
        let nearest = null;
        let nearestDistSq = Infinity;
        for (const id in ENTITIES.STRUCTURES) {
            const rock = ENTITIES.STRUCTURES[id];
            if (!rock || !isRockStructureType(rock.type)) continue;
            if ((rock.world || 'main') !== world) continue;
            const rockType = Number(rock.type);
            if (rockType !== ROCK_SMALL_TYPE && rockType !== ROCK_MEDIUM_TYPE && rockType !== ROCK_BIG_TYPE) continue;
            if (excludeIds?.has(rock.id)) continue;
            const dx = rock.x - this.x;
            const dy = rock.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq >= nearestDistSq) continue;
            nearest = rock;
            nearestDistSq = distSq;
        }
        return nearest;
    }

    getDuneRockTornadoRocks(now = performance.now()) {
        const rocks = [];
        const world = this.world || 'main';
        for (const id in ENTITIES.STRUCTURES) {
            const rock = ENTITIES.STRUCTURES[id];
            if (!rock || !isRockStructureType(rock.type)) continue;
            if ((rock.world || 'main') !== world) continue;
            const rockType = Number(rock.type);
            if (rockType !== ROCK_SMALL_TYPE && rockType !== ROCK_MEDIUM_TYPE && rockType !== ROCK_BIG_TYPE) continue;
            rocks.push(rock);
        }

        rocks.sort((a, b) => {
            const ar = this.getRockTornadoRockRadius(a);
            const br = this.getRockTornadoRockRadius(b);
            if (br !== ar) return br - ar;
            const aa = Math.atan2(a.y - this.y, a.x - this.x);
            const ba = Math.atan2(b.y - this.y, b.x - this.x);
            return aa - ba;
        });

        let ring = 0;
        let slot = 0;
        let slotsInRing = this.getRockTornadoRingCapacity(ROCK_TORNADO_MIN_ORBIT_RADIUS);
        return rocks.map((rock) => {
            if (slot >= slotsInRing) {
                ring++;
                slot = 0;
                slotsInRing = this.getRockTornadoRingCapacity(ROCK_TORNADO_MIN_ORBIT_RADIUS + (ring * ROCK_TORNADO_ORBIT_RING_GAP));
            }
            const ringRadius = ROCK_TORNADO_MIN_ORBIT_RADIUS + (ring * ROCK_TORNADO_ORBIT_RING_GAP);
            const angleOffset = ring % 2 === 0 ? 0 : Math.PI / Math.max(1, slotsInRing);
            const orbitAngle = ((slot / Math.max(1, slotsInRing)) * Math.PI * 2) + angleOffset;
            slot++;
            return {
                id: rock.id,
                orbitAngle,
                orbitRadius: ringRadius,
                lastVx: Math.cos(orbitAngle),
                lastVy: Math.sin(orbitAngle),
                hitTargets: new Set(),
                flightEndsAt: 0,
                lastHitAt: now
            };
        });
    }

    processRockTornado(now = performance.now()) {
        const state = this._rockTornadoState;
        if (!state) return false;

        if (this.hp <= 0 || (this.world || 'main') !== WORLD_DUNE_DIMENSION) {
            this.clearRockTornado();
            return false;
        }

        this.lastX = this.x;
        this.lastY = this.y;
        this.speed = 0;
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + 250);

        const deltaMs = Math.max(0, Math.min(250, now - (state.lastTickAt || now)));
        state.lastTickAt = now;
        const deltaSeconds = deltaMs / 1000;

        if (state.phase === 'gather') {
            const allNear = this.processRockTornadoGather(state, deltaSeconds);
            if (allNear || now - state.phaseStartedAt >= ROCK_TORNADO_GATHER_MAX_MS) {
                state.phase = 'spin';
                state.phaseStartedAt = now;
            }
            return true;
        }

        if (state.phase === 'spin') {
            this.processRockTornadoSpin(state, deltaSeconds, now);
            if (!state.releaseSfxPlayed && now - state.phaseStartedAt >= ROCK_TORNADO_SPIN_MS - 500) {
                state.releaseSfxPlayed = true;
                const explosionSfx = dataMap.sfxMap.indexOf('underwater_explosion');
                if (explosionSfx >= 0) {
                    playSfx(this.x, this.y, explosionSfx, 1800, this.world || 'main');
                }
            }
            if (now - state.phaseStartedAt >= ROCK_TORNADO_SPIN_MS) {
                this.releaseRockTornado(state, now);
            }
            return true;
        }

        if (state.phase === 'fling') {
            const active = this.processRockTornadoFling(state, deltaSeconds, now);
            if (!active) this.clearRockTornado();
            return active;
        }

        this.clearRockTornado();
        return false;
    }

    processRockTornadoGather(state, deltaSeconds) {
        let allNear = true;
        const maxStep = ROCK_TORNADO_PULL_SPEED_PER_SEC * Math.max(0.001, deltaSeconds);
        for (let i = 0; i < state.rocks.length; i++) {
            const entry = state.rocks[i];
            const rock = ENTITIES.STRUCTURES[entry.id];
            if (!rock || (rock.world || 'main') !== (this.world || 'main')) continue;

            const target = this.getRockTornadoOrbitPoint(entry);
            const dx = target.x - rock.x;
            const dy = target.y - rock.y;
            const dist = Math.hypot(dx, dy);
            if (dist > ROCK_TORNADO_NEAR_DISTANCE) allNear = false;
            if (dist <= 0.001) continue;

            const step = Math.min(maxStep, dist);
            rock.lastX = rock.x;
            rock.lastY = rock.y;
            entry.previousX = rock.x;
            entry.previousY = rock.y;
            const vx = (dx / dist) * step;
            const vy = (dy / dist) * step;
            rock.x += vx;
            rock.y += vy;
            entry.lastVx = vx;
            entry.lastVy = vy;
            if (typeof rock.clamp === 'function') rock.clamp();
        }
        this.resolveRockTornadoRockCollisions(state);
        this.updateRockTornadoEntryVelocities(state);
        return allNear;
    }

    processRockTornadoSpin(state, deltaSeconds, now = performance.now()) {
        const rampProgress = Math.max(0, Math.min(1, (now - state.phaseStartedAt) / ROCK_TORNADO_SPIN_RAMP_MS));
        const spinDegreesPerSecond = ROCK_TORNADO_ORBIT_DEGREES_PER_SECOND * rampProgress;
        const angleStep = (spinDegreesPerSecond * Math.PI / 180) * Math.max(0.001, deltaSeconds);
        for (let i = 0; i < state.rocks.length; i++) {
            const entry = state.rocks[i];
            const rock = ENTITIES.STRUCTURES[entry.id];
            if (!rock || (rock.world || 'main') !== (this.world || 'main')) continue;

            entry.orbitAngle += angleStep;
            const target = this.getRockTornadoOrbitPoint(entry);
            rock.lastX = rock.x;
            rock.lastY = rock.y;
            entry.previousX = rock.x;
            entry.previousY = rock.y;
            rock.x = target.x;
            rock.y = target.y;
            if (typeof rock.clamp === 'function') rock.clamp();
        }
        this.resolveRockTornadoRockCollisions(state);
        this.updateRockTornadoEntryVelocities(state);
        for (let i = 0; i < state.rocks.length; i++) {
            const entry = state.rocks[i];
            const rock = ENTITIES.STRUCTURES[entry.id];
            if (!rock || (rock.world || 'main') !== (this.world || 'main')) continue;
            this.applyRockTornadoHits(rock, entry);
        }
    }

    releaseRockTornado(state, now = performance.now()) {
        state.phase = 'fling';
        state.phaseStartedAt = now;
        for (let i = 0; i < state.rocks.length; i++) {
            const entry = state.rocks[i];
            const rock = ENTITIES.STRUCTURES[entry.id];
            if (!rock) continue;
            let vx = entry.lastVx;
            let vy = entry.lastVy;
            let mag = Math.hypot(vx, vy);
            if (mag <= 0.001) {
                vx = -Math.sin(entry.orbitAngle || 0);
                vy = Math.cos(entry.orbitAngle || 0);
                mag = 1;
            }
            entry.lastVx = vx / mag;
            entry.lastVy = vy / mag;
            entry.hitTargets = new Set();
            entry.flightEndsAt = now + ROCK_TORNADO_FLING_MS;
            rock.lastX = rock.x;
            rock.lastY = rock.y;
        }
    }

    processRockTornadoFling(state, deltaSeconds, now = performance.now()) {
        let active = false;
        const stepDistance = ROCK_TORNADO_FLING_SPEED_PER_SEC * Math.max(0.001, deltaSeconds);
        for (let i = 0; i < state.rocks.length; i++) {
            const entry = state.rocks[i];
            if (now >= (entry.flightEndsAt || 0)) continue;
            const rock = ENTITIES.STRUCTURES[entry.id];
            if (!rock || (rock.world || 'main') !== (this.world || 'main')) continue;

            active = true;
            rock.lastX = rock.x;
            rock.lastY = rock.y;
            rock.x += (entry.lastVx || 0) * stepDistance;
            rock.y += (entry.lastVy || 0) * stepDistance;
            if (typeof rock.clamp === 'function') rock.clamp();
            if (Math.abs(rock.x - rock.lastX) < 0.001 && Math.abs(rock.y - rock.lastY) < 0.001) {
                entry.flightEndsAt = 0;
            }
            this.applyRockTornadoHits(rock, entry);
        }
        return active;
    }

    getRockTornadoOrbitPoint(entry) {
        return {
            x: this.x + Math.cos(entry.orbitAngle || 0) * Math.max(1, entry.orbitRadius || ROCK_TORNADO_MIN_ORBIT_RADIUS),
            y: this.y + Math.sin(entry.orbitAngle || 0) * Math.max(1, entry.orbitRadius || ROCK_TORNADO_MIN_ORBIT_RADIUS)
        };
    }

    getRockTornadoRingCapacity(orbitRadius) {
        const circumference = Math.max(1, Math.PI * 2 * Math.max(1, orbitRadius || ROCK_TORNADO_MIN_ORBIT_RADIUS));
        return Math.max(3, Math.floor(circumference / ROCK_TORNADO_ORBIT_SLOT_SPACING));
    }

    getRockTornadoRockRadius(rock) {
        return Math.max(1, rock?.radius || dataMap.STRUCTURES?.[rock?.type]?.radius || 1);
    }

    resolveRockTornadoRockCollisions(state) {
        const entries = state.rocks
            .map((entry) => ({ entry, rock: ENTITIES.STRUCTURES[entry.id] }))
            .filter(({ rock }) => rock && (rock.world || 'main') === (this.world || 'main'));

        for (let pass = 0; pass < ROCK_TORNADO_COLLISION_PASSES; pass++) {
            for (let i = 0; i < entries.length; i++) {
                const a = entries[i].rock;
                for (let j = i + 1; j < entries.length; j++) {
                    const b = entries[j].rock;
                    const minDist = this.getRockTornadoRockRadius(a) + this.getRockTornadoRockRadius(b) + ROCK_TORNADO_COLLISION_BUFFER;
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let dist = Math.hypot(dx, dy);
                    if (dist >= minDist) continue;
                    if (dist <= 0.001) {
                        const angle = ((i + j + pass) / Math.max(1, entries.length)) * Math.PI * 2;
                        dx = Math.cos(angle);
                        dy = Math.sin(angle);
                        dist = 1;
                    }
                    const push = (minDist - dist) * 0.5;
                    const ux = dx / dist;
                    const uy = dy / dist;
                    a.x -= ux * push;
                    a.y -= uy * push;
                    b.x += ux * push;
                    b.y += uy * push;
                    if (typeof a.clamp === 'function') a.clamp();
                    if (typeof b.clamp === 'function') b.clamp();
                }
            }
        }
    }

    updateRockTornadoEntryVelocities(state) {
        for (let i = 0; i < state.rocks.length; i++) {
            const entry = state.rocks[i];
            const rock = ENTITIES.STRUCTURES[entry.id];
            if (!rock || (rock.world || 'main') !== (this.world || 'main')) continue;
            if (!Number.isFinite(entry.previousX) || !Number.isFinite(entry.previousY)) continue;
            entry.lastVx = rock.x - entry.previousX;
            entry.lastVy = rock.y - entry.previousY;
        }
    }

    applyRockTornadoHits(rock, entry, options = {}) {
        const damage = this.getRockTornadoDamage(rock.type);
        if (damage <= 0) return;

        for (const id in ENTITIES.PLAYERS) {
            const target = ENTITIES.PLAYERS[id];
            if (!this.isValidRockTornadoTarget(target, entry, rock)) continue;
            this.hitRockTornadoTarget(target, entry, damage, options);
        }

        for (const id in ENTITIES.MOBS) {
            const target = ENTITIES.MOBS[id];
            if (!target || target.id === this.id) continue;
            if (!this.isValidRockTornadoTarget(target, entry, rock)) continue;
            this.hitRockTornadoTarget(target, entry, damage, options);
        }
    }

    isValidRockTornadoTarget(target, entry, rock) {
        if (!target || typeof target.damage !== 'function') return false;
        if ((target.world || 'main') !== (this.world || 'main')) return false;
        if (typeof target.isAlive !== 'undefined' && !target.isAlive) return false;
        if (typeof target.hp !== 'undefined' && target.hp <= 0) return false;
        if (entry.hitTargets?.has(`${target instanceof Mob ? 'm' : 'p'}:${target.id}`)) return false;

        const dx = target.x - rock.x;
        const dy = target.y - rock.y;
        const range = Math.max(0, (target.radius || 0) + (rock.radius || 0) + ROCK_TORNADO_HIT_BUFFER);
        return dx * dx + dy * dy <= range * range;
    }

    hitRockTornadoTarget(target, entry, damage, options = {}) {
        const key = `${target instanceof Mob ? 'm' : 'p'}:${target.id}`;
        entry.hitTargets.add(key);
        const tookDamage = target.damage(damage, this);
        if (tookDamage && options.knockbackDistance > 0) {
            this.applyRockCannonKnockback(target, options);
        }
        if (tookDamage && typeof target.alarm === 'function') target.alarm(this, 'hit');
    }

    getRockTornadoDamage(type) {
        const rockType = Number(type);
        if (rockType === ROCK_BIG_TYPE) return ROCK_TORNADO_BIG_DAMAGE;
        if (rockType === ROCK_MEDIUM_TYPE) return ROCK_TORNADO_MEDIUM_DAMAGE;
        if (rockType === ROCK_SMALL_TYPE) return ROCK_TORNADO_SMALL_DAMAGE;
        return 0;
    }

    getRockCannonKnockbackDistance(type) {
        const rockType = Number(type);
        if (rockType === ROCK_BIG_TYPE) return ROCK_CANNON_BIG_KNOCKBACK;
        if (rockType === ROCK_MEDIUM_TYPE) return ROCK_CANNON_MEDIUM_KNOCKBACK;
        if (rockType === ROCK_SMALL_TYPE) return ROCK_CANNON_SMALL_KNOCKBACK;
        return 0;
    }

    applyRockCannonKnockback(target, options = {}) {
        const distance = Math.max(0, options.knockbackDistance || 0);
        if (distance <= 0) return;
        let ux = Number(options.dirX) || 0;
        let uy = Number(options.dirY) || 0;
        let len = Math.hypot(ux, uy);
        if (len <= 0.001) {
            ux = target.x - this.x;
            uy = target.y - this.y;
            len = Math.hypot(ux, uy) || 1;
        }
        ux /= len;
        uy /= len;

        if (typeof target.applyKnockback === 'function') {
            target.applyKnockback(ux, uy, distance, options.knockbackDurationMs || ROCK_CANNON_KNOCKBACK_DURATION_MS);
            return;
        }

        target.lastX = target.x;
        target.lastY = target.y;
        target.x += ux * distance;
        target.y += uy * distance;
        if (typeof target.clamp === 'function') target.clamp();
    }

    processSandspin(now = performance.now(), currentTarget = null) {
        const state = this._sandspinState;
        if (!state) return false;

        if (this.hp <= 0 || (this.world || 'main') !== WORLD_DUNE_DIMENSION || now >= state.endsAt) {
            this.clearSandspin();
            return false;
        }

        this.lastX = this.x;
        this.lastY = this.y;
        this.speed = 0;

        const spinProgress = this.getSandspinProgress(now);
        const spinDegreesPerSecond = SANDSPIN_MAX_DEGREES_PER_SECOND * spinProgress;
        const deltaMs = Math.max(0, Math.min(250, now - (state.lastTickAt || now)));
        state.lastTickAt = now;
        if (spinDegreesPerSecond > 0 && deltaMs > 0) {
            this.angle += (spinDegreesPerSecond * Math.PI / 180) * (deltaMs / 1000);
        }

        if (now < state.startedAt + SANDSPIN_WINDUP_MS) {
            this.freezeUntil = Math.max(this.freezeUntil || 0, state.startedAt + SANDSPIN_WINDUP_MS);
            return true;
        }

        this.applySandspinContact(now, spinProgress);

        if (now >= state.startedAt + SANDSPIN_WINDUP_MS + SANDSPIN_RAMP_MS) {
            while (now >= state.nextLaunchAt && state.nextLaunchAt < state.endsAt) {
                this.performSandspinLaunch(currentTarget);
                state.nextLaunchAt += SANDSPIN_DASH_INTERVAL_MS;
            }
        }

        this.clamp();
        pushEntityOutOfSafeZone(this, this.world || 'main');
        return true;
    }

    getSandspinProgress(now = performance.now()) {
        const state = this._sandspinState;
        if (!state) return 0;
        const rampStartedAt = state.startedAt + SANDSPIN_WINDUP_MS;
        if (now <= rampStartedAt) return 0;
        return Math.max(0, Math.min(1, (now - rampStartedAt) / SANDSPIN_RAMP_MS));
    }

    getSandspinDamage(spinProgress) {
        const t = Math.max(0, Math.min(1, Number(spinProgress) || 0));
        return SANDSPIN_MIN_DAMAGE + ((SANDSPIN_MAX_DAMAGE - SANDSPIN_MIN_DAMAGE) * t);
    }

    applySandspinContact(now = performance.now(), spinProgress = 1) {
        const damage = this.getSandspinDamage(spinProgress);
        const knockbackDistance = SANDSPIN_MIN_KNOCKBACK_DISTANCE
            + ((SANDSPIN_MAX_KNOCKBACK_DISTANCE - SANDSPIN_MIN_KNOCKBACK_DISTANCE) * Math.max(0, Math.min(1, spinProgress)));

        for (const id in ENTITIES.PLAYERS) {
            const target = ENTITIES.PLAYERS[id];
            if (!this.isValidSandspinTarget(target)) continue;
            this.hitSandspinTarget(target, damage, knockbackDistance, now);
        }

        for (const id in ENTITIES.MOBS) {
            const target = ENTITIES.MOBS[id];
            if (!target || target.id === this.id) continue;
            if (!this.isValidSandspinTarget(target)) continue;
            this.hitSandspinTarget(target, damage, knockbackDistance, now);
        }

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!this.isValidSandspinRockTarget(structure)) continue;
            this.flingSandspinRock(structure, knockbackDistance);
        }
    }

    isValidSandspinTarget(target) {
        if (!target || typeof target.damage !== 'function') return false;
        if ((target.world || 'main') !== (this.world || 'main')) return false;
        if (typeof target.isAlive !== 'undefined' && !target.isAlive) return false;
        if (typeof target.hp !== 'undefined' && target.hp <= 0) return false;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const range = (this.radius || 0) + Math.max(0, target.radius || 0) + SANDSPIN_CONTACT_BUFFER;
        return dx * dx + dy * dy <= range * range;
    }

    isValidSandspinRockTarget(structure) {
        if (!structure || !isRockStructureType(structure.type)) return false;
        if ((structure.world || 'main') !== (this.world || 'main')) return false;

        const dx = structure.x - this.x;
        const dy = structure.y - this.y;
        const range = (this.radius || 0) + Math.max(0, structure.radius || 0) + SANDSPIN_CONTACT_BUFFER;
        return dx * dx + dy * dy <= range * range;
    }

    hitSandspinTarget(target, damage, knockbackDistance, now = performance.now()) {
        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let dist = Math.hypot(dx, dy);
        if (dist <= 0.001) {
            dx = Math.cos(this.angle || 0);
            dy = Math.sin(this.angle || 0);
            dist = 1;
        }

        const ux = dx / dist;
        const uy = dy / dist;
        const tookDamage = target.damage(damage, this);
        if (!tookDamage) return;

        if (typeof target.applyKnockback === 'function') {
            target.applyKnockback(ux, uy, knockbackDistance, SANDSPIN_KNOCKBACK_DURATION_MS);
            return;
        }

        target.lastX = target.x;
        target.lastY = target.y;
        target.x += ux * knockbackDistance;
        target.y += uy * knockbackDistance;
        if (typeof target.clamp === 'function') target.clamp();
        target.freezeUntil = Math.max(target.freezeUntil || 0, now + SANDSPIN_KNOCKBACK_DURATION_MS);
    }

    flingSandspinRock(rock, playerKnockbackDistance) {
        let dx = rock.x - this.x;
        let dy = rock.y - this.y;
        let dist = Math.hypot(dx, dy);
        if (dist <= 0.001) {
            dx = Math.cos(this.angle || 0);
            dy = Math.sin(this.angle || 0);
            dist = 1;
        }

        const type = Number(rock.type);
        let strengthMult = SANDSPIN_SMALL_ROCK_KNOCKBACK_MULT;
        if (type === ROCK_MEDIUM_TYPE) strengthMult = SANDSPIN_MEDIUM_ROCK_KNOCKBACK_MULT;
        if (type === ROCK_BIG_TYPE) strengthMult = SANDSPIN_BIG_ROCK_KNOCKBACK_MULT;
        if (type !== ROCK_SMALL_TYPE && type !== ROCK_MEDIUM_TYPE && type !== ROCK_BIG_TYPE) return;

        const distance = Math.max(0, playerKnockbackDistance * strengthMult);
        rock.lastX = rock.x;
        rock.lastY = rock.y;
        rock.x += (dx / dist) * distance;
        rock.y += (dy / dist) * distance;
        if (typeof rock.clamp === 'function') rock.clamp();
    }

    performSandspinLaunch(currentTarget = null) {
        const target = this.getSandspinLaunchTarget(currentTarget);
        if (!target) return;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.001) return;

        const ux = dx / dist;
        const uy = dy / dist;
        const travel = Math.min(SANDSPIN_LAUNCH_DISTANCE, dist);
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += ux * travel;
        this.y += uy * travel;
        this.clamp();
        pushEntityOutOfSafeZone(this, this.world || 'main');
        this.applySandspinContact(performance.now(), 1);
    }

    getSandspinLaunchTarget(currentTarget = null) {
        let target = currentTarget;
        if (!target || !target.isAlive || target.isInvisible || (target.world || 'main') !== (this.world || 'main')) {
            target = this.getLiveTarget(true) || this.findPreferredTarget();
        }
        if (!target || !target.isAlive || target.isInvisible || (target.world || 'main') !== (this.world || 'main')) return null;
        this.target = target;
        this.isAlarmed = true;
        this.alarmReason = this.lastHitById === target.id ? 'hit' : 'proximity';
        return target;
    }

    spawnSandlingSpawn(hpMult, damage) {
        const origin = this.getSandlingSpawnOrigin();
        const angle = Math.random() * Math.PI * 2;
        const originRadius = Math.max(0, origin.radius || 0);
        const spawnDistance = origin.kind === 'rock'
            ? Math.sqrt(Math.random()) * originRadius * 0.45
            : Math.max(0, originRadius * (0.18 + Math.random() * 0.34));
        const sandlingId = getId('MOBS');
        ENTITIES.newEntity({
            entityType: 'mob',
            id: sandlingId,
            x: origin.x + Math.cos(angle) * spawnDistance,
            y: origin.y + Math.sin(angle) * spawnDistance,
            type: SANDLING_MOB_TYPE,
            source: this,
            world: this.world || 'main'
        });

        const sandling = ENTITIES.MOBS[sandlingId];
        if (!sandling) return;

        const sandlingBase = dataMap.MOBS[SANDLING_MOB_TYPE];
        const hp = Math.max(1, Math.round((sandlingBase?.baseHealth || sandling.hp || 1) * hpMult));
        sandling.hp = hp;
        sandling.maxHp = hp;
        sandling.spawnBaseSpeedOverride = (sandlingBase?.speed || sandling.speed || 0) * SANDLING_SPAWN_SPEED_MULT;
        sandling.speedOverride = sandling.spawnBaseSpeedOverride;
        sandling.spawnBurstSpeed = (sandlingBase?.speed || sandling.speed || 0) * SANDLING_SPAWN_BURST_SPEED_MULT;
        sandling.spawnBurstUntil = performance.now() + SANDLING_SPAWN_BURST_DURATION_MS;
        sandling.lastDuneSandlingLungeTime = sandling.spawnBurstUntil;
        sandling.speed = sandling.speedOverride;
        sandling.contactDamage = damage;
        sandling.angle = angle;
        sandling.aggroTowardPlayers = true;
        sandling.noRespawn = true;

        const target = this.findNearestPlayerForSandling(sandling);
        if (target) {
            sandling.target = target;
            sandling.isAlarmed = true;
            sandling.alarmReason = 'sandling_spawn';
            sandling.startHuntingTime = performance.now();
        }
    }

    getSandlingSpawnOrigin() {
        const world = this.world || 'main';
        const rocks = [];
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure || !isRockStructureType(structure.type)) continue;
            if ((structure.world || 'main') !== world) continue;
            rocks.push(structure);
        }

        if (rocks.length > 0 && Math.random() < 0.5) {
            const rock = rocks[Math.floor(Math.random() * rocks.length)];
            return {
                kind: 'rock',
                x: rock.x,
                y: rock.y,
                radius: rock.radius || dataMap.STRUCTURES?.[rock.type]?.radius || 0
            };
        }

        return {
            kind: 'boss',
            x: this.x,
            y: this.y,
            radius: this.radius || 0
        };
    }

    findNearestPlayerForSandling(sandling) {
        const world = sandling.world || this.world || 'main';
        let nearest = null;
        let nearestDistSq = Infinity;
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player || !player.isAlive) continue;
            if ((player.world || 'main') !== world) continue;
            if (player.isInvisible) continue;
            const dx = player.x - sandling.x;
            const dy = player.y - sandling.y;
            const distSq = dx * dx + dy * dy;
            if (distSq >= nearestDistSq) continue;
            nearest = player;
            nearestDistSq = distSq;
        }
        return nearest;
    }

    tryTriggerReactiveAbility(target = null) {
        if (this.hp <= 0) return false;
        if ((this.world || 'main') !== WORLD_DUNE_DIMENSION) return false;
        if (!target || !target.isAlive || (target.world || 'main') !== (this.world || 'main')) return false;

        const now = performance.now();
        if (this.isBossAbilityLocked(now)) return false;
        if (this._sandspinState) return false;
        if (this._rockTornadoState) return false;
        if (this._rockCannonState) return false;
        if (now - this.lastAbilityUseTime < GLOBAL_ABILITY_COOLDOWN_MS) return false;

        const options = [];
        if (now - this.lastSandlingSpawnTime >= SANDLING_SPAWN_COOLDOWN_MS) options.push(SANDLING_SPAWN_ABILITY);
        if (now - this.lastSandspinTime >= SANDSPIN_COOLDOWN_MS) options.push(SANDSPIN_ABILITY);
        if (this.canUseRockTornado() && now - this.lastRockTornadoTime >= ROCK_TORNADO_COOLDOWN_MS) options.push(ROCK_TORNADO_ABILITY);
        if (now - this.lastRockCannonTime >= ROCK_CANNON_COOLDOWN_MS && this.findNearestRockCannonRock()) options.push(ROCK_CANNON_ABILITY);
        if (options.length === 0) return false;

        const ability = options[Math.floor(Math.random() * options.length)];
        return this.activateAbility(ability, now, { respectCooldowns: false });
    }

}

function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
