import { Mob } from "./mob.js";
import { dataMap, getCoinObjectType } from '../../../public/shared/datamap.js';
import { getWorldCenter, getWorldMapSize, WORLD_YETI_DIMENSION } from '../../../public/shared/worlds.js';
import { ENTITIES, markYetiBossDefeated, spawnObject } from '../../game.js';
import { cmdRun, emitPoisonAoeFx, getId } from '../../helpers.js';
import { YetiPortal } from '../structures/boss_shrine.js';

const ICICLE_SHARD_PROJECTILE_TYPE = 15;
const SNOWBALL_PROJECTILE_TYPE = 16;
const ROCK_MEDIUM_TYPE = 2;
const ROCK_BIG_TYPE = 6;
const ROCK_SMALL_TYPE = 7;
const ICICLE_BLADE_V1_TYPE = 4;
const ICICLE_BLADE_V2_TYPE = 11;
const GLOBAL_ABILITY_COOLDOWN_MS = 5000;
const ICICLE_BLAST_COOLDOWN_MS = 15000;
const SNOWBALL_BLAST_COOLDOWN_MS = 15000;
const ICICLE_BURST_COOLDOWN_MS = 25000;
const GLACIAL_BURST_COOLDOWN_MS = 20000;
const ICICLE_BLAST_DURATION_MS = 3000;
const SNOWBALL_BLAST_DURATION_MS = 5000;
const YETI_BLAST_INTERVAL_MS = 200;
const ICICLE_BURST_COUNT = 15;
const ICICLE_BURST_DAMAGE = 50;
const ICICLE_BLAST_RADIUS_MULT = 1.3;
const ICICLE_BLAST_DISTANCE_MULT = 1.35;
const ICICLE_BURST_RADIUS_MULT = 1.55;
const ICICLE_BURST_DISTANCE_MULT = 1.55;
const GLACIAL_BURST_AOE_DURATION_MS = 750;
const GLACIAL_BURST_DAMAGE = 20;
const GLACIAL_BURST_FREEZE_MS = 2000;
const GLACIAL_BURST_PULSE_INTERVAL_MS = 50;

export class Yeti extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 8);
        this.noRespawn = true;
        this.weapon = { rank: 1 };
        this.strength = 0;
        this.lastHitById = null;
        this.lastAbilityUseTime = 0;
        this.lastIcicleBlastTime = -Infinity;
        this.lastSnowballBlastTime = -Infinity;
        this.lastIcicleBurstTime = -Infinity;
        this.lastGlacialBurstTime = -Infinity;
        this._nextAbilityCheckAt = 0;
        this._icicleBlastTimer = null;
        this._icicleBlastEndsAt = 0;
        this._snowballBlastTimer = null;
        this._snowballBlastEndsAt = 0;
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
        this.clearIcicleBlast();
        this.clearSnowballBlast();
        markYetiBossDefeated();
        this.scatterDeathCoins();
        this.scatterIcicleBladeV1Drops();
        this.scatterIcicleBladeV2Drops();
        this.spawnExitPortal();
        super.die(killer);
    }

    scatterDeathCoins() {
        const coinType = getCoinObjectType();
        if (!coinType) return;

        const MIN_DEATH_COIN_DROP = Math.round(800 * 5 * 1.5);
        const MAX_DEATH_COIN_DROP = Math.round(1500 * 5 * 1.5);
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
            spawnObject(coinType, dropX, dropY, stackSize, 'yeti', this.world || 'main');
            remaining -= stackSize;
        }
    }

    scatterIcicleBladeV1Drops() {
        const count = getRandomIntInclusive(5, 10);
        this.scatterWeaponDrops(ICICLE_BLADE_V1_TYPE, count);
    }

    scatterIcicleBladeV2Drops() {
        const count = getRandomIntInclusive(3, 5);
        this.scatterWeaponDrops(ICICLE_BLADE_V2_TYPE, count);
    }

    scatterWeaponDrops(itemType, count) {
        const spread = 140;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(itemType, dropX, dropY, 1, 'yeti', this.world || 'main');
        }
    }

    spawnExitPortal() {
        const world = this.world || 'main';
        if (world !== WORLD_YETI_DIMENSION) return;

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            if ((structure.world || 'main') !== world) continue;
            if (structure.type !== 5) continue;
            if (structure.portalMode === 'exit') return;
        }

        const center = getWorldCenter(world);
        const portalId = getId('STRUCTURES');
        new YetiPortal(portalId, center.x, center.y, 'exit');
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
        if ((this.world || 'main') !== WORLD_YETI_DIMENSION) {
            super.process(runDecisionLogic);
            return;
        }

        const now = performance.now();
        const [worldWidth, worldHeight] = getWorldMapSize(WORLD_YETI_DIMENSION);
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

    tryTriggerReactiveAbility(target = null) {
        if (this.hp <= 0) return false;
        if ((this.world || 'main') !== WORLD_YETI_DIMENSION) return false;
        if (!target || !target.isAlive || (target.world || 'main') !== (this.world || 'main')) return false;

        const now = performance.now();
        if (this.isBossAbilityLocked(now)) return false;
        if (now - this.lastAbilityUseTime < GLOBAL_ABILITY_COOLDOWN_MS) return false;

        const options = [];
        if (now - this.lastIcicleBlastTime >= ICICLE_BLAST_COOLDOWN_MS) options.push(1);
        if (now - this.lastSnowballBlastTime >= SNOWBALL_BLAST_COOLDOWN_MS) options.push(2);
        if (now - this.lastIcicleBurstTime >= ICICLE_BURST_COOLDOWN_MS) options.push(3);
        if (now - this.lastGlacialBurstTime >= GLACIAL_BURST_COOLDOWN_MS) options.push(4);
        if (options.length === 0) return false;

        const ability = options[Math.floor(Math.random() * options.length)];
        return this.activateAbility(ability, now, { respectCooldowns: false });
    }

    activateAbility(abilityNumber, now = performance.now(), options = {}) {
        const ability = Math.max(1, Math.min(4, Math.round(Number(abilityNumber) || 0)));
        const respectCooldowns = options.respectCooldowns !== false;
        if (this.hp <= 0) return false;
        if (this.isBossAbilityLocked(now)) return false;
        if (respectCooldowns && now - this.lastAbilityUseTime < GLOBAL_ABILITY_COOLDOWN_MS) return false;

        if (ability === 1) {
            if (respectCooldowns && now - this.lastIcicleBlastTime < ICICLE_BLAST_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastIcicleBlastTime = now;
            this.startIcicleBlast();
            return true;
        }

        if (ability === 2) {
            if (respectCooldowns && now - this.lastSnowballBlastTime < SNOWBALL_BLAST_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastSnowballBlastTime = now;
            this.startSnowballBlast();
            return true;
        }

        if (ability === 3) {
            if (respectCooldowns && now - this.lastIcicleBurstTime < ICICLE_BURST_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastIcicleBurstTime = now;
            this.castIcicleBurst();
            return true;
        }

        if (ability === 4) {
            if (respectCooldowns && now - this.lastGlacialBurstTime < GLACIAL_BURST_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastGlacialBurstTime = now;
            this.castGlacialBurst();
            return true;
        }

        return false;
    }

    startIcicleBlast() {
        this.startAimedProjectileBlast(ICICLE_SHARD_PROJECTILE_TYPE, ICICLE_BLAST_DURATION_MS, 'icicle', {
            radiusMult: ICICLE_BLAST_RADIUS_MULT,
            maxDistanceMult: ICICLE_BLAST_DISTANCE_MULT
        });
    }

    startSnowballBlast() {
        this.startAimedProjectileBlast(SNOWBALL_PROJECTILE_TYPE, SNOWBALL_BLAST_DURATION_MS, 'snowball');
    }

    startAimedProjectileBlast(projectileType, durationMs, blastKey, projectileOverrides = {}) {
        if (blastKey === 'icicle') this.clearIcicleBlast();
        if (blastKey === 'snowball') this.clearSnowballBlast();

        const endsAt = performance.now() + durationMs;
        const groupId = Math.random();
        const shoot = () => {
            if (this.hp <= 0 || (this.world || 'main') !== WORLD_YETI_DIMENSION) {
                if (blastKey === 'icicle') this.clearIcicleBlast();
                if (blastKey === 'snowball') this.clearSnowballBlast();
                return;
            }
            this.shootProjectile(projectileType, this.angle, groupId, projectileOverrides);
        };

        shoot();
        const timer = setInterval(() => {
            if (performance.now() >= endsAt) {
                if (blastKey === 'icicle') this.clearIcicleBlast();
                if (blastKey === 'snowball') this.clearSnowballBlast();
                return;
            }
            shoot();
        }, YETI_BLAST_INTERVAL_MS);

        if (blastKey === 'icicle') {
            this._icicleBlastTimer = timer;
            this._icicleBlastEndsAt = endsAt;
        } else {
            this._snowballBlastTimer = timer;
            this._snowballBlastEndsAt = endsAt;
        }
    }

    clearIcicleBlast() {
        if (this._icicleBlastTimer) {
            clearInterval(this._icicleBlastTimer);
            this._icicleBlastTimer = null;
        }
        this._icicleBlastEndsAt = 0;
    }

    clearSnowballBlast() {
        if (this._snowballBlastTimer) {
            clearInterval(this._snowballBlastTimer);
            this._snowballBlastTimer = null;
        }
        this._snowballBlastEndsAt = 0;
    }

    castIcicleBurst() {
        const groupId = Math.random();
        for (let i = 0; i < ICICLE_BURST_COUNT; i++) {
            const angle = (i / ICICLE_BURST_COUNT) * Math.PI * 2;
            this.shootProjectile(ICICLE_SHARD_PROJECTILE_TYPE, angle, groupId, {
                damage: ICICLE_BURST_DAMAGE,
                radiusMult: ICICLE_BURST_RADIUS_MULT,
                maxDistanceMult: ICICLE_BURST_DISTANCE_MULT
            });
        }
    }

    shootProjectile(projectileType, angle, groupId, overrides = {}) {
        const projId = getId('PROJECTILES');
        ENTITIES.newEntity({
            entityType: 'projectile',
            id: projId,
            x: this.x + Math.cos(angle) * (this.radius || 0),
            y: this.y + Math.sin(angle) * (this.radius || 0),
            angle,
            type: projectileType,
            shooter: this,
            groupId
        });

        const proj = ENTITIES.PROJECTILES[projId];
        if (!proj) return;
        const projectileCfg = dataMap.PROJECTILES?.[projectileType] || {};
        proj.damage = Number.isFinite(overrides.damage) ? overrides.damage : (projectileCfg.damage || proj.damage);
        if (Number.isFinite(overrides.radiusMult) && overrides.radiusMult > 0) {
            proj.radius *= overrides.radiusMult;
        }
        if (Number.isFinite(overrides.maxDistanceMult) && overrides.maxDistanceMult > 0) {
            proj.maxDistance *= overrides.maxDistanceMult;
        }
        if (projectileType === ICICLE_SHARD_PROJECTILE_TYPE) {
            proj.persistentHits = true;
            proj.hitEntities = new Set();
            proj.rockPushTypes = new Set([ROCK_MEDIUM_TYPE, ROCK_BIG_TYPE, ROCK_SMALL_TYPE]);
        } else if (projectileType === SNOWBALL_PROJECTILE_TYPE) {
            proj.rockPushTypes = new Set([ROCK_MEDIUM_TYPE, ROCK_SMALL_TYPE]);
        }
        proj.ignoreProjectileCollisions = true;
    }

    castGlacialBurst() {
        const sourceWorld = this.world || 'main';
        const originX = this.x;
        const originY = this.y;
        const sourceRadius = Math.max(0, this.radius || 0);
        const baseRadius = dataMap.PLAYERS?.baseRadius || 30;
        const radiusScale = Math.max(0, sourceRadius) / Math.max(1, baseRadius);
        const aoeRadius = 300 * radiusScale;
        const startedAt = performance.now();
        const endsAt = startedAt + GLACIAL_BURST_AOE_DURATION_MS;
        const hitSet = new Set();

        const freezeTarget = (target) => {
            if (!target || typeof target.damage !== 'function') return;
            target.damage(GLACIAL_BURST_DAMAGE, this);
            const until = performance.now() + GLACIAL_BURST_FREEZE_MS;
            if (typeof target.frozenUntil !== 'undefined') {
                target.frozenUntil = Math.max(target.frozenUntil || 0, until);
            } else {
                target.freezeUntil = Math.max(target.freezeUntil || 0, until);
            }
            target.iceEncasedUntil = Math.max(target.iceEncasedUntil || 0, until);
        };

        const applyPulse = () => {
            const now = performance.now();
            const progress = Math.max(0, Math.min(1, (now - startedAt) / GLACIAL_BURST_AOE_DURATION_MS));
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
                    freezeTarget(target);
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
                    freezeTarget(target);
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
        }, GLACIAL_BURST_PULSE_INTERVAL_MS);

        emitPoisonAoeFx(this.x, this.y, aoeRadius, GLACIAL_BURST_AOE_DURATION_MS, 2, sourceWorld, 1);
    }
}

function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
