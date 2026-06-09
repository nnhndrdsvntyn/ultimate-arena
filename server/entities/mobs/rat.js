import {
    Mob
} from "./mob.js";
import {
    ENTITIES
} from "../../game.js";

const DUNE_RAT_LUNGE_INTERVAL_MS = 700;
const DUNE_RAT_LUNGE_DISTANCE = 75;

export class Rat extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 14);
    }

    process(runDecisionLogic = true) {
        const now = performance.now();
        const baseSpeedOverride = this.spawnBaseSpeedOverride;
        if (this.aggroTowardPlayers && Number.isFinite(baseSpeedOverride)) {
            this.acquireDuneRatTarget(now);
            this.speedOverride = now < (this.spawnBurstUntil || 0)
                ? Math.max(baseSpeedOverride, this.spawnBurstSpeed || baseSpeedOverride)
                : baseSpeedOverride;
            const target = this.getLiveTarget();
            if (target && now >= (this.spawnBurstUntil || 0)) {
                this.angle = Math.atan2(target.y - this.y, target.x - this.x);
            }
        }
        super.process(runDecisionLogic);
        this.processDuneRatLunge(now);
    }

    acquireDuneRatTarget(now = performance.now()) {
        if (!this.aggroTowardPlayers) return null;
        const currentTarget = this.getLiveTarget();
        if (currentTarget) {
            this.isAlarmed = true;
            return currentTarget;
        }

        const world = this.world || 'main';
        let nearest = null;
        let nearestDistSq = Infinity;
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player || !player.isAlive) continue;
            if ((player.world || 'main') !== world) continue;
            if (player.isInvisible) continue;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq >= nearestDistSq) continue;
            nearest = player;
            nearestDistSq = distSq;
        }

        if (!nearest) return null;
        this.target = nearest;
        this.isAlarmed = true;
        this.alarmReason = 'rat_spawn';
        this.startHuntingTime = now;
        return nearest;
    }

    getAlarmSpeedMultiplier() {
        return this.aggroTowardPlayers ? 1 : super.getAlarmSpeedMultiplier();
    }

    getLiveTarget(requireSameReference = false) {
        if (!this.aggroTowardPlayers) return super.getLiveTarget(requireSameReference);
        if (!this.target) return null;
        const target = this.target;
        if (!target || !target.isAlive) return null;
        if (requireSameReference && target !== this.target) return null;
        return target;
    }

    updateAlarmState() {
        if (!this.aggroTowardPlayers) {
            super.updateAlarmState(performance.now());
            return;
        }
        if (!this.getLiveTarget()) {
            this.acquireDuneRatTarget(performance.now());
        }
    }

    processDuneRatLunge(now = performance.now()) {
        if (!this.aggroTowardPlayers || !this.isAlarmed) return;
        if (now < (this.spawnBurstUntil || 0)) return;
        if (now - (this.lastDuneRatLungeTime || 0) < DUNE_RAT_LUNGE_INTERVAL_MS) return;

        const target = this.getLiveTarget();
        if (!target) {
            this.resetAlarmState();
            return;
        }

        this.lastDuneRatLungeTime = now;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.001) return;

        this.angle = Math.atan2(dy, dx);
        this.x += (dx / dist) * DUNE_RAT_LUNGE_DISTANCE;
        this.y += (dy / dist) * DUNE_RAT_LUNGE_DISTANCE;
        this.clamp();
    }

    turn() {
        if (this.isAlarmed) {
            if (this.aggroTowardPlayers && performance.now() < (this.spawnBurstUntil || 0)) return;
            const target = this.getLiveTarget();
            if (this.aggroTowardPlayers) {
                if (!target) {
                    this.resetAlarmState();
                    return;
                }
                this.angle = Math.atan2(target.y - this.y, target.x - this.x);
                return;
            }
            this.handleAlarmedTarget(target, -100, t => {
                this.angle = Math.atan2(this.y - t.y, this.x - t.x);
            });
            return;
        }

        super.turn();
    }
}
