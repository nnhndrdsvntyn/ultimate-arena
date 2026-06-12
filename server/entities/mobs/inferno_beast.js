import { Mob } from "./mob.js";
import { AXE_7_TYPE, AXE_10_TYPE, ACCESSORY_NAME_TO_ID, accessoryItemTypeFromId, dataMap, getCoinObjectType, isRockStructureType } from '../../../public/shared/datamap.js';
import { getWorldCenter, getWorldMapSize, WORLD_INFERNO_DIMENSION } from '../../../public/shared/worlds.js';
import { ENTITIES, markInfernoBossDefeated, spawnObject } from '../../game.js';
import { cmdRun, emitInfernoBeamFx, emitLightningShotFx, emitPoisonAoeFx, getId, playSfx, pushEntityOutOfSafeZone, spawnEnergyBurstProjectiles } from '../../helpers.js';
import { InfernoPortal } from '../structures/boss_shrine.js';

const CHARGE_ABILITY = 1;
const ENRAGE_ABILITY = 2;
const FLAME_RELEASE_ABILITY = 3;
const INFERNO_BEAM_ABILITY = 4;
const CHARGE_COOLDOWN_MS = 45000;
const ENRAGE_COOLDOWN_MS = 25000;
const FLAME_RELEASE_COOLDOWN_MS = 35000;
const INFERNO_BEAM_COOLDOWN_MS = 40000;
const ENRAGE_DURATION_MS = 5000;
const ENRAGE_SPEED_MULT = 3;
const ENRAGE_DAMAGE_MULT = 1.5;
const CHARGE_WINDUP_MS = 1000;
const CHARGE_BURST_COUNT = 3;
const CHARGE_MAX_DISTANCE = 1000;
const CHARGE_MIN_DAMAGE = 50;
const CHARGE_MAX_DAMAGE = 150;
const CHARGE_KNOCKBACK_MIN_DISTANCE = 180;
const CHARGE_KNOCKBACK_DURATION_MS = 450;
const GLOBAL_ABILITY_COOLDOWN_MS = 5000;
const FLAME_RELEASE_TARGET_RANGE = 700;
const FLAME_RELEASE_CHANNEL_MS = 2000;
const FLAME_RELEASE_PULSE_COUNT = 3;
const FLAME_RELEASE_FX_DURATION_MS = 750;
const FLAME_RELEASE_FX_RADIUS = 700;
const FLAME_RELEASE_AOE_COLOR = 2;
const LIGHTNING_SHOT_PROJECTILE_TYPE = 14;
const INFERNO_BEAM_CHARGE_MS = 3000;
const INFERNO_BEAM_COLLAPSE_MS = 100;
const INFERNO_BEAM_DURATION_MS = 420;
const INFERNO_BEAM_LENGTH = 2500;
const INFERNO_BEAM_WIDTH = 300;
const INFERNO_BEAM_MAX_DAMAGE = 150;
const INFERNO_BEAM_MIN_DAMAGE = 50;
const INFERNO_BEAM_KNOCKBACK_DISTANCE = 1000;
const INFERNO_BEAM_KNOCKBACK_DURATION_MS = 250;

export class InfernoBeast extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 17);
        this.noRespawn = true;
        this.weapon = { rank: 1 };
        this.strength = 0;
        this.lastHitById = null;
        this._roamTargetX = x;
        this._roamTargetY = y;
        this._nextRoamRetargetAt = 0;
        this.lastAbilityUseTime = 0;
        this.lastChargeTime = -Infinity;
        this.lastEnrageTime = -Infinity;
        this.lastFlameReleaseTime = -Infinity;
        this.lastInfernoBeamTime = -Infinity;
        this._enrageEndsAt = 0;
        this._nextAbilityCheckAt = 0;
        this._chargeState = null;
        this._infernoBeamState = null;
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
        this.clearEnrage();
        markInfernoBossDefeated();
        this.scatterDeathCoins();
        this.scatterAxe7Drops();
        this.scatterAxe10Drop();
        this.scatterMinotaurHatDrop();
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
            spawnObject(coinType, dropX, dropY, stackSize, 'inferno_beast', this.world || 'main');
            remaining -= stackSize;
        }
    }

    scatterAxe7Drops() {
        this.scatterWeaponDrops(AXE_7_TYPE, getRandomIntInclusive(5, 10));
    }

    scatterAxe10Drop() {
        this.scatterWeaponDrops(AXE_10_TYPE, 1);
    }

    scatterMinotaurHatDrop() {
        const accessoryId = ACCESSORY_NAME_TO_ID['minotaur_hat'];
        const itemType = accessoryItemTypeFromId(accessoryId);
        if (!itemType) return;
        this.scatterWeaponDrops(itemType, 1);
    }

    scatterWeaponDrops(itemType, count) {
        const spread = 140;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spread;
            const dropX = this.x + Math.cos(angle) * distance;
            const dropY = this.y + Math.sin(angle) * distance;
            spawnObject(itemType, dropX, dropY, 1, 'inferno_beast', this.world || 'main');
        }
    }

    spawnExitPortal() {
        const world = this.world || 'main';
        if (world !== WORLD_INFERNO_DIMENSION) return;

        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            if ((structure.world || 'main') !== world) continue;
            if (structure.type !== 5) continue;
            if (structure.portalMode === 'exit') return;
        }

        const center = getWorldCenter(world);
        const portalId = getId('STRUCTURES');
        new InfernoPortal(portalId, center.x, center.y, 'exit');
        const portal = ENTITIES.STRUCTURES[portalId];
        if (!portal) return;
        portal.world = world;
        portal.isNatural = false;
        cmdRun.broadcastStructureSpawn(portal);
    }

    process(runDecisionLogic = true) {
        if (this.isBossIntroLocked()) {
            this.clearEnrage();
            this.lastX = this.x;
            this.lastY = this.y;
            this.isAlarmed = false;
            this.target = null;
            this.alarmReason = null;
            this.speed = 0;
            return;
        }
        if ((this.world || 'main') !== WORLD_INFERNO_DIMENSION) {
            super.process(runDecisionLogic);
            return;
        }

        const now = performance.now();
        const [worldWidth, worldHeight] = getWorldMapSize(WORLD_INFERNO_DIMENSION);
        const edgeMargin = Math.max(220, (this.radius || 0) + 120);
        const minX = edgeMargin;
        const minY = edgeMargin;
        const maxX = Math.max(minX, worldWidth - edgeMargin);
        const maxY = Math.max(minY, worldHeight - edgeMargin);
        const baseSpeed = dataMap.MOBS[this.type].speed;
        const speedMult = this.getEnrageSpeedMultiplier(now);
        this.updateEnrageContactDamage(now);

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

        if (this.processInfernoBeam(now)) return;
        if (this.processCharge(now, target)) return;

        if (runDecisionLogic) {
            if (target) {
                this.speed = baseSpeed * this.getAlarmSpeedMultiplier() * speedMult;
                this.steerToward(target.x, target.y, 0.03);
            } else {
                this.speed = baseSpeed * speedMult;
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
        if ((this.world || 'main') !== WORLD_INFERNO_DIMENSION) return false;
        if (this.isBossAbilityLocked(now)) return false;
        if (this._infernoBeamState) return false;
        if (this._chargeState && ability !== ENRAGE_ABILITY) return false;

        if (ability === CHARGE_ABILITY) {
            if (respectCooldowns && now - this.lastChargeTime < CHARGE_COOLDOWN_MS) return false;
            const target = this.getChargeTarget();
            if (!target) return false;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist > CHARGE_MAX_DISTANCE) return false;

            this.lastAbilityUseTime = now;
            this.startCharge(target, now);
            return true;
        }

        if (ability === ENRAGE_ABILITY) {
            if (respectCooldowns && now - this.lastEnrageTime < ENRAGE_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastEnrageTime = now;
            this.startEnrage(now);
            return true;
        }

        if (ability === FLAME_RELEASE_ABILITY) {
            if (respectCooldowns && now - this.lastFlameReleaseTime < FLAME_RELEASE_COOLDOWN_MS) return false;
            this.lastAbilityUseTime = now;
            this.lastFlameReleaseTime = now;
            this.castFlameRelease();
            return true;
        }

        if (ability === INFERNO_BEAM_ABILITY) {
            if (respectCooldowns && now - this.lastInfernoBeamTime < INFERNO_BEAM_COOLDOWN_MS) return false;
            const target = this.getChargeTarget();
            if (!target) return false;
            this.lastAbilityUseTime = now;
            this.lastInfernoBeamTime = now;
            this.startInfernoBeam(target, now);
            return true;
        }

        return false;
    }

    startEnrage(now = performance.now()) {
        this._enrageEndsAt = Math.max(this._enrageEndsAt || 0, now + ENRAGE_DURATION_MS);
        this.updateEnrageContactDamage(now);
    }

    clearEnrage() {
        this._enrageEndsAt = 0;
        delete this.contactDamage;
    }

    getEnrageSpeedMultiplier(now = performance.now()) {
        if (this.hp <= 0 || now >= (this._enrageEndsAt || 0)) {
            if (this._enrageEndsAt) this.clearEnrage();
            return 1;
        }
        return ENRAGE_SPEED_MULT;
    }

    getDamageMultiplier(now = performance.now()) {
        if (this.hp > 0 && now < (this._enrageEndsAt || 0)) return ENRAGE_DAMAGE_MULT;
        if (this._enrageEndsAt) this.clearEnrage();
        return 1;
    }

    updateEnrageContactDamage(now = performance.now()) {
        const baseDamage = dataMap.MOBS[this.type]?.damage || 0;
        if (this.getDamageMultiplier(now) > 1) {
            this.contactDamage = baseDamage * ENRAGE_DAMAGE_MULT;
        } else {
            delete this.contactDamage;
        }
    }

    getChargeTarget() {
        const target = this.getLiveTarget(true) || this.findPreferredTarget();
        if (!target || !target.isAlive) return null;
        if ((target.world || 'main') !== (this.world || 'main')) return null;
        if (target.isInvisible) return null;
        this.target = target;
        this.isAlarmed = true;
        this.alarmReason = this.lastHitById === target.id ? 'hit' : 'proximity';
        return target;
    }

    startCharge(target, now = performance.now()) {
        this._chargeState = {
            targetId: target.id,
            lungesDone: 0,
            windupEndsAt: now + CHARGE_WINDUP_MS
        };
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + CHARGE_WINDUP_MS);
        this.speed = 0;
        this.steerToward(target.x, target.y, 0);
    }

    processCharge(now = performance.now(), currentTarget = null) {
        const state = this._chargeState;
        if (!state) return false;

        const target = ENTITIES.PLAYERS[state.targetId] || currentTarget || this.getChargeTarget();
        if (!target || !target.isAlive || target.isInvisible || (target.world || 'main') !== (this.world || 'main')) {
            this._chargeState = null;
            this.lastChargeTime = now;
            return false;
        }

        this.lastX = this.x;
        this.lastY = this.y;
        this.speed = 0;
        this.steerToward(target.x, target.y, 0);

        if (now < state.windupEndsAt) {
            this.freezeUntil = Math.max(this.freezeUntil || 0, state.windupEndsAt);
            return true;
        }

        this.performChargeLunge(target);
        state.lungesDone += 1;

        if (state.lungesDone >= CHARGE_BURST_COUNT || this.hp <= 0) {
            this._chargeState = null;
            this.lastChargeTime = now;
            return true;
        }

        state.windupEndsAt = now + CHARGE_WINDUP_MS;
        this.freezeUntil = Math.max(this.freezeUntil || 0, state.windupEndsAt);
        return true;
    }

    performChargeLunge(target) {
        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.001) {
            dx = Math.cos(this.angle);
            dy = Math.sin(this.angle);
            dist = 0;
        }

        const aimDist = dist > 0 ? dist : 1;
        const ux = dx / aimDist;
        const uy = dy / aimDist;
        const lungeDistance = Math.min(dist, CHARGE_MAX_DISTANCE);

        this.lastX = this.x;
        this.lastY = this.y;
        this.x += ux * lungeDistance;
        this.y += uy * lungeDistance;
        this.clamp();
        pushEntityOutOfSafeZone(this, this.world || 'main');

        if (dist > CHARGE_MAX_DISTANCE) return;

        const damage = getChargeDamage(dist);
        const tookDamage = target.damage(damage * this.getDamageMultiplier(), this);
        if (!tookDamage) return;

        const knockbackDistance = Math.max(CHARGE_KNOCKBACK_MIN_DISTANCE, dist);
        if (typeof target.applyKnockback === 'function') {
            target.applyKnockback(ux, uy, knockbackDistance, CHARGE_KNOCKBACK_DURATION_MS);
        }
    }

    tryTriggerReactiveAbility(target = null) {
        if (this.hp <= 0) return false;
        if ((this.world || 'main') !== WORLD_INFERNO_DIMENSION) return false;
        if (!target || !target.isAlive || (target.world || 'main') !== (this.world || 'main')) return false;

        const now = performance.now();
        if (this.isBossAbilityLocked(now)) return false;
        if (this._chargeState) return false;
        if (this._infernoBeamState) return false;
        if (now - this.lastAbilityUseTime < GLOBAL_ABILITY_COOLDOWN_MS) return false;

        const options = [];
        if (now - this.lastChargeTime >= CHARGE_COOLDOWN_MS && Math.hypot(target.x - this.x, target.y - this.y) <= CHARGE_MAX_DISTANCE) {
            options.push(CHARGE_ABILITY);
        }
        if (now - this.lastEnrageTime >= ENRAGE_COOLDOWN_MS && now >= (this._enrageEndsAt || 0)) {
            options.push(ENRAGE_ABILITY);
        }
        if (now - this.lastFlameReleaseTime >= FLAME_RELEASE_COOLDOWN_MS && Math.hypot(target.x - this.x, target.y - this.y) <= FLAME_RELEASE_TARGET_RANGE) {
            options.push(FLAME_RELEASE_ABILITY);
        }
        if (now - this.lastInfernoBeamTime >= INFERNO_BEAM_COOLDOWN_MS && Math.hypot(target.x - this.x, target.y - this.y) <= INFERNO_BEAM_LENGTH) {
            options.push(INFERNO_BEAM_ABILITY);
        }
        if (options.length === 0) return false;

        const ability = options[Math.floor(Math.random() * options.length)];
        return this.activateAbility(ability, now, { respectCooldowns: false });
    }

    castFlameRelease() {
        const world = this.world || 'main';
        const startedAt = performance.now();
        this.freezeUntil = Math.max(this.freezeUntil || 0, startedAt + FLAME_RELEASE_CHANNEL_MS);
        this.speed = 0;

        const electricSfx = dataMap.sfxMap.indexOf('electric_sfx1');
        if (electricSfx >= 0) {
            playSfx(this.x, this.y, electricSfx, 1400, world);
        }

        const targets = this.findFlameReleaseTargets();
        for (const target of targets) {
            this.castLightningShotAt(target);
        }

        const pulseSpacingMs = FLAME_RELEASE_CHANNEL_MS / FLAME_RELEASE_PULSE_COUNT;
        for (let i = 0; i < FLAME_RELEASE_PULSE_COUNT; i++) {
            const delayMs = Math.round(i * pulseSpacingMs);
            if (delayMs <= 0) {
                this.emitFlameReleasePulse(world);
            } else {
                setTimeout(() => this.emitFlameReleasePulse(world), delayMs);
            }
        }
    }

    emitFlameReleasePulse(world) {
        if (this.hp <= 0) return;
        if ((this.world || 'main') !== world) return;

        spawnEnergyBurstProjectiles(this);
        emitPoisonAoeFx(this.x, this.y, FLAME_RELEASE_FX_RADIUS, FLAME_RELEASE_FX_DURATION_MS, 2, world, FLAME_RELEASE_AOE_COLOR);
    }

    findFlameReleaseTargets() {
        const world = this.world || 'main';
        const maxDistSq = FLAME_RELEASE_TARGET_RANGE * FLAME_RELEASE_TARGET_RANGE;
        const targets = [];

        for (const id in ENTITIES.PLAYERS) {
            const target = ENTITIES.PLAYERS[id];
            if (!target || !target.isAlive) continue;
            if ((target.world || 'main') !== world) continue;
            if (target.isInvisible) continue;
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > maxDistSq) continue;
            targets.push({ target, distSq });
        }

        for (const id in ENTITIES.MOBS) {
            const target = ENTITIES.MOBS[id];
            if (!target || target.hp <= 0 || target.id === this.id) continue;
            if ((target.world || 'main') !== world) continue;
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > maxDistSq) continue;
            targets.push({ target, distSq });
        }

        targets.sort((a, b) => a.distSq - b.distSq);
        return targets.map(entry => entry.target);
    }

    castLightningShotAt(target) {
        if (!target) return;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= 1) return;

        const distance = Math.sqrt(distanceSq);
        const radiusScale = 1;
        emitLightningShotFx(this.x, this.y, target.x, target.y, 500 * radiusScale, this.world || 'main', radiusScale);

        const angle = Math.atan2(dy, dx);
        const hitboxSpacing = 20;
        const steps = Math.max(1, Math.ceil(distance / hitboxSpacing));
        const groupId = Math.random();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            ENTITIES.newEntity({
                entityType: 'projectile',
                id: getId('PROJECTILES'),
                x: this.x + dx * t,
                y: this.y + dy * t,
                angle,
                type: LIGHTNING_SHOT_PROJECTILE_TYPE,
                shooter: this,
                groupId,
                projectileOptions: {
                    speedOverride: 0,
                    noMove: true,
                    logicOnly: true,
                    ttlMs: 500,
                    radiusOverride: 10 * radiusScale
                }
            });
        }
    }

    startInfernoBeam(target, now = performance.now()) {
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.angle = angle;
        this._infernoBeamState = {
            targetId: target.id,
            angle,
            firesAt: now + INFERNO_BEAM_CHARGE_MS + INFERNO_BEAM_COLLAPSE_MS,
            fired: false
        };
        this.freezeUntil = Math.max(this.freezeUntil || 0, now + INFERNO_BEAM_CHARGE_MS);
        this.speed = 0;
        emitInfernoBeamFx(
            this.x,
            this.y,
            angle,
            INFERNO_BEAM_LENGTH,
            INFERNO_BEAM_WIDTH,
            INFERNO_BEAM_CHARGE_MS,
            INFERNO_BEAM_COLLAPSE_MS,
            INFERNO_BEAM_DURATION_MS,
            this.world || 'main',
            this.id,
            target.id
        );
    }

    processInfernoBeam(now = performance.now()) {
        const state = this._infernoBeamState;
        if (!state) return false;

        this.lastX = this.x;
        this.lastY = this.y;
        this.speed = 0;
        this.updateInfernoBeamAim(state);

        if (!state.fired && now >= state.firesAt) {
            state.fired = true;
            this.fireInfernoBeam(state.angle, now);
            this._infernoBeamState = null;
            return false;
        }

        if (this.hp <= 0) {
            this._infernoBeamState = null;
            return false;
        }

        this.freezeUntil = Math.max(this.freezeUntil || 0, now + Math.max(0, state.firesAt - now));
        return true;
    }

    updateInfernoBeamAim(state) {
        if (!state) return;
        let target = state.targetId ? ENTITIES.PLAYERS[state.targetId] : null;
        if (!target || !target.isAlive || target.isInvisible || (target.world || 'main') !== (this.world || 'main')) {
            target = this.findPreferredTarget();
            state.targetId = target?.id ?? 0;
        }
        if (!target) return;

        state.angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.angle = state.angle;
        this.target = target;
        this.isAlarmed = true;
        this.alarmReason = this.lastHitById === target.id ? 'hit' : 'proximity';
    }

    fireInfernoBeam(angle, now = performance.now()) {
        const world = this.world || 'main';
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const hitTargets = [];

        for (const id in ENTITIES.PLAYERS) {
            const target = ENTITIES.PLAYERS[id];
            if (this.isValidInfernoBeamTarget(target, world)) hitTargets.push(target);
        }

        for (const id in ENTITIES.MOBS) {
            const target = ENTITIES.MOBS[id];
            if (!target || target.id === this.id) continue;
            if (this.isValidInfernoBeamTarget(target, world)) hitTargets.push(target);
        }

        for (const target of hitTargets) {
            const local = getInfernoBeamLocalPosition(this, target, angle);
            const damage = getInfernoBeamDamage(local.x);
            const tookDamage = target.damage(damage * this.getDamageMultiplier(), this);
            if (!tookDamage) continue;
            this.knockInfernoBeamTarget(target, ux, uy, now);
        }

        for (const id in ENTITIES.STRUCTURES) {
            const rock = ENTITIES.STRUCTURES[id];
            if (!this.isValidInfernoBeamRock(rock, world, angle)) continue;
            this.pushInfernoBeamRock(rock, ux, uy);
        }
    }

    isValidInfernoBeamTarget(target, world) {
        if (!target || typeof target.damage !== 'function') return false;
        if ((target.world || 'main') !== world) return false;
        if (typeof target.isAlive !== 'undefined' && !target.isAlive) return false;
        if (typeof target.hp !== 'undefined' && target.hp <= 0) return false;
        if (target.isInvisible) return false;
        return isInsideInfernoBeam(this, target, this._infernoBeamState?.angle ?? this.angle ?? 0);
    }

    isValidInfernoBeamRock(rock, world, angle) {
        if (!rock || !isRockStructureType(rock.type)) return false;
        if ((rock.world || 'main') !== world) return false;
        return isInsideInfernoBeam(this, rock, angle);
    }

    knockInfernoBeamTarget(target, ux, uy, now = performance.now()) {
        if (typeof target.applyKnockback === 'function') {
            target.applyKnockback(ux, uy, INFERNO_BEAM_KNOCKBACK_DISTANCE, INFERNO_BEAM_KNOCKBACK_DURATION_MS);
            return;
        }

        target.lastX = target.x;
        target.lastY = target.y;
        target.x += ux * INFERNO_BEAM_KNOCKBACK_DISTANCE;
        target.y += uy * INFERNO_BEAM_KNOCKBACK_DISTANCE;
        if (typeof target.clamp === 'function') target.clamp();
        target.freezeUntil = Math.max(target.freezeUntil || 0, now + INFERNO_BEAM_KNOCKBACK_DURATION_MS);
    }

    pushInfernoBeamRock(rock, ux, uy) {
        rock.lastX = rock.x;
        rock.lastY = rock.y;
        rock.x += ux * INFERNO_BEAM_KNOCKBACK_DISTANCE;
        rock.y += uy * INFERNO_BEAM_KNOCKBACK_DISTANCE;
        if (typeof rock.clamp === 'function') rock.clamp();
    }
}

function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getChargeDamage(distance) {
    const t = Math.max(0, Math.min(1, distance / Math.max(1, CHARGE_MAX_DISTANCE - 1)));
    return CHARGE_MAX_DAMAGE - ((CHARGE_MAX_DAMAGE - CHARGE_MIN_DAMAGE) * t);
}

function getInfernoBeamLocalPosition(source, target, angle) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    return {
        x: (dx * ux) + (dy * uy),
        y: (dx * -uy) + (dy * ux)
    };
}

function isInsideInfernoBeam(source, target, angle) {
    const local = getInfernoBeamLocalPosition(source, target, angle);
    const targetRadius = Math.max(0, target?.radius || 0);
    const halfLength = INFERNO_BEAM_LENGTH * 0.5;
    const halfWidth = (INFERNO_BEAM_WIDTH * 0.5) + targetRadius;
    if (local.x < -targetRadius || local.x > INFERNO_BEAM_LENGTH + targetRadius) return false;
    const normalizedX = (local.x - halfLength) / Math.max(1, halfLength + targetRadius);
    const normalizedY = local.y / Math.max(1, halfWidth);
    return (normalizedX * normalizedX) + (normalizedY * normalizedY) <= 1;
}

function getInfernoBeamDamage(distanceAlongBeam) {
    const t = Math.max(0, Math.min(1, distanceAlongBeam / Math.max(1, INFERNO_BEAM_LENGTH)));
    return INFERNO_BEAM_MAX_DAMAGE - ((INFERNO_BEAM_MAX_DAMAGE - INFERNO_BEAM_MIN_DAMAGE) * t);
}
