import {
    ENTITIES,
    deadMobs
} from '../../game.js';
import {
    Player
} from '../players/player.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    playSfx,
    colliding,
    pushEntityOutOfSafeZone,
    getSafeZoneStructure,
    emitDamageIndicatorFx
} from '../../helpers.js';
import {
    Entity
} from '../entity.js';
import { getWorldMapSize, worldHasRivers } from '../../../public/shared/worlds.js';
import { getRiverBoundsAtY, getRiverBoundsAtX } from '../../../public/shared/river.js';

const BOSS_INTRO_FACING_DOWN_ANGLE = Math.PI / 2;

function markBotLootPickupIntent(bot, x, y, world, now = performance.now()) {
    if (!bot?.isBot) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    bot._botLootTargetX = x;
    bot._botLootTargetY = y;
    bot._botLootTargetWorld = world || bot.world || 'main';
    bot._botLootTargetUntil = now + 6000;
}

export class Mob extends Entity {
    constructor(id, x, y, type) {
        const mobData = dataMap.MOBS[type];
        super(id, x, y, mobData.radius, mobData.speed, mobData.baseHealth, mobData.baseHealth);

        this.score = mobData.score;
        this.angle = Math.random() * Math.PI * 2 - Math.PI;

        this.lastDiedTime = 0;
        this.lastDamagedTime = 0;
        this.lastEntToDmg = null;

        this.isAlarmed = false;
        this.startHuntingTime = 0;
        this.lastTurnTime = 0
        this.nextTurnDelay = Math.floor(Math.random() * 3001) + 3000;
        this.target = null;
        this.alarmDuration = mobData.alarmDuration;
        this.alarmReason = null;
        this.lastHitById = null;
        this.targetShieldedSince = 0;

        this.inWater = false;
        this.invincible = false;
        this.speedOverride = null;

        this.type = type;

        this.blindUntil = 0;
        this.freezeUntil = 0;
        this.iceEncasedUntil = 0;
        this.blindSpeedMult = 1;
        this._blindStored = false;
        this._blindStoredAlarmed = false;
        this._blindStoredTarget = null;
        this._blindStoredAlarmReason = null;

        ENTITIES.MOBS[id] = this;
    }
    isBlinded(now = performance.now()) {
        return now < (this.blindUntil || 0);
    }
    faceBossIntroDirection() {
        if (Math.abs((this.angle || 0) - BOSS_INTRO_FACING_DOWN_ANGLE) <= 0.0001) return;
        this.angle = BOSS_INTRO_FACING_DOWN_ANGLE;
        this._forceFullSync = true;
    }
    isBossIntroLocked(now = performance.now()) {
        const locked = this.bossIntroPaused || now < (this.bossIntroUntil || 0);
        if (locked) this.faceBossIntroDirection();
        return locked;
    }
    isBossAbilityLocked(now = performance.now()) {
        return now < (this.bossAbilityLockedUntil || 0);
    }
    applyBlindness(durationMs = 8000, speedMult = 1.5) {
        const now = performance.now();
        this.blindUntil = now + Math.max(1, Math.round(durationMs));
        this.blindSpeedMult = Math.max(1, Number.isFinite(speedMult) ? speedMult : 1.5);
    }
    storeBlindState() {
        if (this._blindStored) return;
        this._blindStored = true;
        this._blindStoredAlarmed = this.isAlarmed;
        this._blindStoredTarget = this.target;
        this._blindStoredAlarmReason = this.alarmReason;
    }
    restoreBlindState() {
        if (!this._blindStored) return;
        this._blindStored = false;
        this.isAlarmed = this._blindStoredAlarmed;
        this.target = this._blindStoredTarget;
        this.alarmReason = this._blindStoredAlarmReason;
        this._blindStoredTarget = null;
        this._blindStoredAlarmReason = null;
    }
    move() {
        // move
        this.lastX = this.x;
        this.lastY = this.y;
        const now = performance.now();
        if (this.isBossIntroLocked(now)) return;
        if (now < (this.freezeUntil || 0)) return;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
    }
    turn() {
        this.defaultTurn();
    }
    defaultTurn() {
        this.angle = Math.random() * Math.PI * 2 - Math.PI; // rand angle between -PI and PI
        this.lastTurnTime = performance.now();
        this.nextTurnDelay = Math.floor(Math.random() * 3001) + 3000;
    }
    steerToward(targetX, targetY, jitter = 0.28) {
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx === 0 && dy === 0) return;
        const base = Math.atan2(dy, dx);
        const spread = Math.max(0, Math.min(0.8, Number.isFinite(jitter) ? jitter : 0.28));
        this.angle = base + ((Math.random() * 2 - 1) * spread);
    }
    getBiomeRecoveryPoint() {
        const [w, h] = getWorldMapSize(this.world || 'main');
        if (this.type === 6 || this.type === 10 || this.type === 17) {
            return { x: w * 0.75, y: h * 0.75 }; // minotaur biome center-ish
        }
        if (this.type === 5 || this.type === 9 || this.type === 11) {
            return { x: w * 0.75, y: h * 0.25 }; // polar bear top-right biome center-ish
        }
        if (this.type === 12 || this.type === 13 || this.type === 14 || this.type === 15) {
            return { x: w * 0.25, y: h * 0.75 }; // desert biome center-ish
        }
        return { x: w * 0.25, y: h * 0.25 }; // top-left biome center-ish
    }
    getAlarmSpeedMultiplier() {
        return 1.5;
    }
    damage(health, attacker) {
        if (this.isBossIntroLocked()) return false;
        if (this.invincible) return false;
        if (performance.now() - this.lastDamagedTime < 200) return false; // invincible for 10 ticks (200 / 20)
        const indicatorDamage = Math.max(0, Math.round(health));

        this.lastDamagedTime = performance.now();
        if (!attacker?.noKillCredit) {
            this.lastEntToDmg = attacker;
        }
        if (attacker && attacker instanceof Player) {
            this.lastHitById = attacker.id;
        }
        this.hp = Math.max(0, this.hp - health);
        if (this.hp <= 0) {
            emitDamageIndicatorFx(this.x, this.y, indicatorDamage, this.radius || dataMap.MOBS[this.type]?.radius || 0, this.world || 'main');
            const killer = this.lastEntToDmg || null;
            this.die(killer);
            const sfx = dataMap.sfxMap.indexOf('bubble_pop');
            playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
        } else {
            const sfx = dataMap.sfxMap.indexOf('hurt');
            playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
        }

        if (attacker && attacker instanceof Player && ![1, 2, 4, 9, 10, 12, 14, 15].includes(this.type)) {
            attacker.lastCombatTime = performance.now();
            attacker.sendStatsUpdate();
        }
        return true;
    }
    alarm(shooter, reason = 'proximity') {
        if (this.isBossIntroLocked()) return;
        if ((shooter?.world || 'main') !== (this.world || 'main')) return;
        if (shooter?.isInvisible) return;
        const isPolarBearHit = this.type === 5 && reason === 'hit' && shooter instanceof Player;
        const bypassProgressShield = isPolarBearHit && shooter.progressShieldActive && !shooter.touchingSafeZone;
        if (shooter?.hasShield && !bypassProgressShield) return; // don't target shielded players
        if (shooter instanceof Player && typeof shooter.isPvpProtected === 'function' && shooter.isPvpProtected() && !isPolarBearHit) return;
        this.target = shooter;
        this.alarmReason = reason;

        if (this.isAlarmed) return; // already alarmed

        this.isAlarmed = true;
        this.startHuntingTime = performance.now();

        // speed boost
        this.speed = dataMap.MOBS[this.type].speed * 1.5;

    }
    resetAlarmState() {
        this.isAlarmed = false;
        this.target = null;
        const baseSpeed = Number.isFinite(this.speedOverride) ? this.speedOverride : dataMap.MOBS[this.type].speed;
        this.speed = baseSpeed;
    }
    getLiveTarget(requireSameReference = false) {
        if (!this.target) return null;
        const target = ENTITIES.PLAYERS[this.target.id];
        if (!target || !target.isAlive) return null;
        if ((target.world || 'main') !== (this.world || 'main')) return null;
        const isPolarBearHitTarget = this.type === 5 && this.alarmReason === 'hit' && this.lastHitById === target.id;
        const allowProgressShieldTarget = isPolarBearHitTarget && target.progressShieldActive && !target.touchingSafeZone;
        if (target.hasShield && !allowProgressShieldTarget) return null; // ignore shielded players
        if (typeof target.isPvpProtected === 'function' && target.isPvpProtected() && !isPolarBearHitTarget) return null; // ignore protected players/bots
        if (requireSameReference && target !== this.target) return null;
        return target;
    }
    shouldWanderTurn() {
        return performance.now() - this.lastTurnTime > this.nextTurnDelay;
    }
    isTargetHidden(target, treeCollisionPadding = null) {
        if (!target) return true;

        let targetInTree = false;
        if (typeof treeCollisionPadding === 'number') {
            for (const id in ENTITIES.STRUCTURES) {
                const structure = ENTITIES.STRUCTURES[id];
                if ((structure.world || 'main') !== (this.world || 'main')) continue;
                if (structure.type === 3 && colliding(structure, target, treeCollisionPadding)) {
                    targetInTree = true;
                    break;
                }
            }
        }

        return targetInTree || target.isHidden || target.isInvisible;
    }
    die(killer) {
        // activate the mobs death action
        if (killer && typeof killer.addScore === 'function' && typeof dataMap.MOBS[this.type].deathAction === 'function') {
            dataMap.MOBS[this.type].deathAction(killer);
        }
        this.lastDiedTime = performance.now();
        if (killer?.isBot) {
            markBotLootPickupIntent(killer, this.x, this.y, this.world || 'main', this.lastDiedTime);
        }

        deadMobs[this.id] = {
            id: this.id,
            type: this.type,
            lastDiedTime: this.lastDiedTime,
            world: this.world || 'main',
            noRespawn: this.noRespawn === true
        };

        ENTITIES.deleteEntity('mob', this.id);
    }
    getWorld() {
        return this.world || 'main';
    }
    isTutorialWorld() {
        return (this.world || '').startsWith('tutorial');
    }
    getWaterBounds() {
        const world = this.world || 'main';
        const mapSize = getWorldMapSize(world);
        const baseLeft = mapSize[0] * 0.47;
        const baseRight = mapSize[0] * 0.53;
        const baseTop = mapSize[1] * 0.47;
        const baseBottom = mapSize[1] * 0.53;
        const streamCenterX = mapSize[0] / 2;
        const streamCenterY = mapSize[1] / 2;
        return {
            waterLeft: baseLeft,
            waterRight: baseRight,
            waterTop: baseTop,
            waterBottom: baseBottom,
            streamCenterX,
            streamCenterY,
            getRiverBoundsAtY: worldHasRivers(world) ? (y) => getRiverBoundsAtY(mapSize, y) : null,
            getRiverBoundsAtX: worldHasRivers(world) ? (x) => getRiverBoundsAtX(mapSize, x) : null
        };
    }
    isInsideSafeZone(safeZone) {
        if (!safeZone) return false;
        const maxRange = (safeZone.radius || 0) + (this.radius || 0) + 10;
        const dx = safeZone.x - this.x;
        const dy = safeZone.y - this.y;
        if ((dx * dx + dy * dy) > (maxRange * maxRange)) return false;
        return colliding(safeZone, this);
    }
    applyRiverFlow(streamCenterX) {
        const dx = streamCenterX - this.x;
        this.x += dx * 0.0004;
        this.y += 3;
    }
    applyRiverFlowHorizontal(streamCenterY) {
        const dy = streamCenterY - this.y;
        this.y += dy * 0.0004;
        this.x += 3;
    }
    updateWaterState(inTutorialWorld, inBase, waterBounds) {
        const hasRivers = worldHasRivers(this.world || 'main');
        if (!hasRivers) {
            this.inRiverVertical = false;
            this.inRiverHorizontal = false;
            this.inWater = false;
            const baseSpeed = Number.isFinite(this.speedOverride) ? this.speedOverride : dataMap.MOBS[this.type].speed;
            this.speed = this.isAlarmed ? baseSpeed * this.getAlarmSpeedMultiplier() : baseSpeed;
            return;
        }
        const { waterLeft, waterRight, waterTop, waterBottom, streamCenterX, streamCenterY, getRiverBoundsAtY, getRiverBoundsAtX } = waterBounds;
        let inVertical = this.x > waterLeft && this.x < waterRight;
        let inHorizontal = this.y > waterTop && this.y < waterBottom;
        if (typeof getRiverBoundsAtY === 'function') {
            const bounds = getRiverBoundsAtY(this.y);
            inVertical = this.x > bounds.left && this.x < bounds.right;
        }
        if (typeof getRiverBoundsAtX === 'function') {
            const bounds = getRiverBoundsAtX(this.x);
            inHorizontal = this.y > bounds.top && this.y < bounds.bottom;
        }
        this.inRiverVertical = inVertical;
        this.inRiverHorizontal = inHorizontal;
        this.inWater = !inTutorialWorld && (inVertical || inHorizontal) && !inBase;
        const baseSpeed = Number.isFinite(this.speedOverride) ? this.speedOverride : dataMap.MOBS[this.type].speed;
        if (this.inWater) {
            if (this.type === 5) {
                this.speed = baseSpeed * 1.5; // polar bears speed up in water
            } else {
                this.speed = baseSpeed * 0.5; // others slow down in water
            }
            if (this.inRiverVertical) this.applyRiverFlow(streamCenterX);
            if (this.inRiverHorizontal) this.applyRiverFlowHorizontal(streamCenterY);
            return;
        }
        this.speed = this.isAlarmed ? baseSpeed * this.getAlarmSpeedMultiplier() : baseSpeed;
    }
    applyLeftBiomeConstraint(inTutorialWorld, waterBounds) {
        if (!worldHasRivers(this.world || 'main')) return false;
        if (inTutorialWorld) return false;

        const radius = this.radius || 0;
        const boundsAtY = typeof waterBounds.getRiverBoundsAtY === 'function'
            ? waterBounds.getRiverBoundsAtY(this.y)
            : { left: waterBounds.waterLeft, right: waterBounds.waterRight };
        const boundsAtX = typeof waterBounds.getRiverBoundsAtX === 'function'
            ? waterBounds.getRiverBoundsAtX(this.x)
            : { top: waterBounds.waterTop, bottom: waterBounds.waterBottom };

        const leftLimit = boundsAtY.left - radius;
        const rightLimit = boundsAtY.right + radius;
        const topLimit = boundsAtX.top - radius;
        const bottomLimit = boundsAtX.bottom + radius;

        let constrained = false;

        // Chick/Pig/Cow/Root Walker: top-left only.
        if (this.type === 1 || this.type === 2 || this.type === 3 || this.type === 7) {
            if (this.x > leftLimit) {
                this.x = leftLimit;
                constrained = true;
            }
            if (this.y > topLimit) {
                this.y = topLimit;
                constrained = true;
            }
        }

        // Minotaur: bottom-right only.
        if (this.type === 6 || this.type === 10 || this.type === 17) {
            if (this.x < rightLimit) {
                this.x = rightLimit;
                constrained = true;
            }
            if (this.y < bottomLimit) {
                this.y = bottomLimit;
                constrained = true;
            }
        }

        // Polar bear, bunny, fox: top-right only.
        if (this.type === 5 || this.type === 9 || this.type === 11) {
            if (this.x < rightLimit) {
                this.x = rightLimit;
                constrained = true;
            }
            if (this.y > topLimit) {
                this.y = topLimit;
                constrained = true;
            }
        }

        // Ostrich, elephant, rat, tortoise: bottom-left only.
        if (this.type === 12 || this.type === 13 || this.type === 14 || this.type === 15) {
            if (this.x > leftLimit) {
                this.x = leftLimit;
                constrained = true;
            }
            if (this.y < bottomLimit) {
                this.y = bottomLimit;
                constrained = true;
            }
        }

        if (constrained) {
            this.target = null;
            if (this.type === 5 || this.type === 11 || this.type === 13) {
                this.resetAlarmState();
            }
            const recovery = this.getBiomeRecoveryPoint();
            this.steerToward(recovery.x, recovery.y, 0.22);
        }

        return constrained;
    }
    updateAlarmState(currentTime) {
        if (!this.isAlarmed) return;
        if (currentTime - this.startHuntingTime > this.alarmDuration) {
            this.resetAlarmState();
            return;
        }
        if (this.target && this.target.lastDiedTime <= this.startHuntingTime) return;

        // De-aggro if target stays shielded in base for too long.
        if (this.target?.hasShield && this.target.touchingSafeZone) {
            if (!this.targetShieldedSince) this.targetShieldedSince = currentTime;
            if (currentTime - this.targetShieldedSince >= 5000) {
                this.resetAlarmState();
                return;
            }
        } else {
            this.targetShieldedSince = 0;
        }

        this.resetAlarmState();
    }
    applyPolarBearBoundary(inTutorialWorld, waterLeft, waterRight) {
        if (inTutorialWorld || this.type !== 5) return;
        const boundary = this.isAlarmed ? waterLeft : waterRight;
        if (this.x < boundary + this.radius) {
            this.target = null;
            this.resetAlarmState();
            const recovery = this.getBiomeRecoveryPoint();
            this.steerToward(recovery.x, recovery.y, 0.2);
        }
    }
    applyRiverAvoidance(inTutorialWorld, inBase, waterBounds) {
        if (inTutorialWorld || inBase) return false;
        if (this.isAlarmed || this.target) return false;
        if (this.inWater) return false;

        const radius = this.radius || 0;
        let turned = false;

        if (typeof waterBounds.getRiverBoundsAtY === 'function') {
            const bounds = waterBounds.getRiverBoundsAtY(this.y);
            if (this.x > bounds.left - radius && this.x < bounds.left) {
                this.steerToward(bounds.left - (radius + 220), this.y, 0.18);
                turned = true;
            } else if (this.x < bounds.right + radius && this.x > bounds.right) {
                this.steerToward(bounds.right + (radius + 220), this.y, 0.18);
                turned = true;
            }
        }

        if (typeof waterBounds.getRiverBoundsAtX === 'function') {
            const bounds = waterBounds.getRiverBoundsAtX(this.x);
            if (this.y > bounds.top - radius && this.y < bounds.top) {
                this.steerToward(this.x, bounds.top - (radius + 220), 0.18);
                turned = true;
            } else if (this.y < bounds.bottom + radius && this.y > bounds.bottom) {
                this.steerToward(this.x, bounds.bottom + (radius + 220), 0.18);
                turned = true;
            }
        }

        if (turned) {
            this.target = null;
        }
        return turned;
    }
    maybeTurn(currentTime, returningToSide) {
        if (!returningToSide && (currentTime - this.lastTurnTime > this.nextTurnDelay || this.isAlarmed)) {
            this.turn();
        }
    }
    handleAlarmedTarget(target, hiddenPadding, onVisible) {
        if (!target) {
            this.resetAlarmState();
            return true;
        }
        if (this.isTargetHidden(target, hiddenPadding)) {
            if (this.shouldWanderTurn()) this.defaultTurn();
            return true;
        }
        if (typeof onVisible === 'function') onVisible(target);
        return true;
    }
    processMovementOnly() {
        if (this.inWater) {
            const { streamCenterX, streamCenterY } = this.getWaterBounds();
            if (this.inRiverVertical) this.applyRiverFlow(streamCenterX);
            if (this.inRiverHorizontal) this.applyRiverFlowHorizontal(streamCenterY);
        }
        this.move();
        this.clamp();
        pushEntityOutOfSafeZone(this, this.getWorld());
    }
    process(runDecisionLogic = true) {
        const currentTime = performance.now();
        if (this.isBossIntroLocked(currentTime)) {
            this.lastX = this.x;
            this.lastY = this.y;
            this.isAlarmed = false;
            this.target = null;
            this.alarmReason = null;
            this.speed = 0;
            return;
        }
        if (!this.isBlinded(currentTime) && this._blindStored) {
            this.restoreBlindState();
        }
        if (!runDecisionLogic) {
            // Keep movement full-rate; AI/turning runs on throttled ticks.
            this.processMovementOnly();
            return;
        }

        if (this.isBlinded(currentTime)) {
            this.storeBlindState();
            this.isAlarmed = false;
            this.target = null;
            this.alarmReason = null;

            const world = this.getWorld();
            const inTutorialWorld = this.isTutorialWorld();
            const waterBounds = this.getWaterBounds();
            const safeZone = getSafeZoneStructure(world);
            const inBase = this.isInsideSafeZone(safeZone);

            this.updateWaterState(inTutorialWorld, inBase, waterBounds);
            this.speed = dataMap.MOBS[this.type].speed * (this.blindSpeedMult || 1.5);
            if (currentTime - this.lastTurnTime > 200) this.defaultTurn();
            this.move();
            this.clamp();
            this.applyPolarBearBoundary(inTutorialWorld, waterBounds.waterLeft, waterBounds.waterRight);
            pushEntityOutOfSafeZone(this, world);
            return;
        }

        const world = this.getWorld();
        const inTutorialWorld = this.isTutorialWorld();
        const waterBounds = this.getWaterBounds();
        const safeZone = getSafeZoneStructure(world);
        const inBase = this.isInsideSafeZone(safeZone);

        this.updateWaterState(inTutorialWorld, inBase, waterBounds);

        const returningToSide = this.applyLeftBiomeConstraint(inTutorialWorld, waterBounds);
        const avoidingRiver = this.applyRiverAvoidance(inTutorialWorld, inBase, waterBounds);
        this.updateAlarmState(currentTime);
        this.applyPolarBearBoundary(inTutorialWorld, waterBounds.waterLeft, waterBounds.waterRight);
        this.maybeTurn(currentTime, returningToSide || avoidingRiver);

        this.move();
        this.clamp();
        pushEntityOutOfSafeZone(this, world);
    }
}
