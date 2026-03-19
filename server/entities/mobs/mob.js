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
import {
    MAP_SIZE
} from '../../game.js';

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

        this.type = type;

        this.blindUntil = 0;
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
    getAlarmSpeedMultiplier() {
        return 1.5;
    }
    damage(health, attacker) {
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
            const sfx = dataMap.sfxMap.indexOf('bubble-pop');
            playSfx(this.x, this.y, sfx, 1000);
        } else {
            const sfx = dataMap.sfxMap.indexOf('hurt');
            playSfx(this.x, this.y, sfx, 1000);
        }

        if (attacker && attacker instanceof Player && ![1, 2, 4].includes(this.type)) {
            attacker.lastCombatTime = performance.now();
            attacker.sendStatsUpdate();
        }
        return true;
    }
    alarm(shooter, reason = 'proximity') {
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
        this.speed = dataMap.MOBS[this.type].speed;
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
    isTargetHidden(target, bushCollisionPadding = null) {
        if (!target) return true;

        let targetInBush = false;
        if (typeof bushCollisionPadding === 'number') {
            for (const id in ENTITIES.STRUCTURES) {
                const structure = ENTITIES.STRUCTURES[id];
                if ((structure.world || 'main') !== (this.world || 'main')) continue;
                if (structure.type === 3 && colliding(structure, target, bushCollisionPadding)) {
                    targetInBush = true;
                    break;
                }
            }
        }

        return targetInBush || target.isHidden || target.isInvisible;
    }
    die(killer) {
        // activate the mobs death action
        if (killer && typeof killer.addScore === 'function' && typeof dataMap.MOBS[this.type].deathAction === 'function') {
            dataMap.MOBS[this.type].deathAction(killer);
        }
        this.lastDiedTime = performance.now();

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
        return {
            waterLeft: MAP_SIZE[0] * 0.47,
            waterRight: MAP_SIZE[0] * 0.53,
            streamCenter: MAP_SIZE[0] / 2
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
    applyRiverFlow(streamCenter) {
        const dx = streamCenter - this.x;
        this.x += dx * 0.001;
        this.y += 3;
    }
    updateWaterState(inTutorialWorld, inBase, waterBounds) {
        const { waterLeft, waterRight, streamCenter } = waterBounds;
        this.inWater = !inTutorialWorld && this.x > waterLeft && this.x < waterRight && !inBase;
        if (this.inWater) {
            if (this.type === 5) {
                this.speed = dataMap.MOBS[this.type].speed * 1.5; // polar bears speed up in water
            } else {
                this.speed = dataMap.MOBS[this.type].speed * 0.5; // others slow down in water
            }
            this.applyRiverFlow(streamCenter);
            return;
        }

        const baseSpeed = dataMap.MOBS[this.type].speed;
        this.speed = this.isAlarmed ? baseSpeed * this.getAlarmSpeedMultiplier() : baseSpeed;
    }
    applyLeftBiomeConstraint(inTutorialWorld, waterLeft) {
        // Keep left-side mobs on left biome edge.
        // Minotaur is exempt while alarmed so it can chase/swim across the map.
        const keepOnLeftSide = !inTutorialWorld && (this.type === 1 || this.type === 2 || this.type === 3 || (this.type === 6 && !this.isAlarmed));
        if (keepOnLeftSide && this.x > waterLeft - this.radius) {
            this.angle = Math.PI; // return straight left
            this.target = null;
            return true;
        }
        return false;
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
            this.angle = 0;
            this.target = null;
            this.resetAlarmState();
        }
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
            const { streamCenter } = this.getWaterBounds();
            this.applyRiverFlow(streamCenter);
        }
        this.move();
        this.clamp();
        pushEntityOutOfSafeZone(this, this.getWorld());
    }
    process(runDecisionLogic = true) {
        const currentTime = performance.now();
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

        const returningToSide = this.applyLeftBiomeConstraint(inTutorialWorld, waterBounds.waterLeft);
        this.updateAlarmState(currentTime);
        this.applyPolarBearBoundary(inTutorialWorld, waterBounds.waterLeft, waterBounds.waterRight);
        this.maybeTurn(currentTime, returningToSide);

        this.move();
        this.clamp();
        pushEntityOutOfSafeZone(this, world);
    }
}
