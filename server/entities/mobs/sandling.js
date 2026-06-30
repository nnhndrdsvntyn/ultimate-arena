import {
    Mob
} from "./mob.js";
import { ENTITIES } from "../../game.js";
import { WORLD_DUNE_DIMENSION } from "../../../public/shared/worlds.js";

export class Sandling extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 18);
    }

    isDuneDimension() {
        return (this.world || 'main') === WORLD_DUNE_DIMENSION;
    }

    findNearestTarget() {
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
        return nearest;
    }

    getLiveTarget(requireSameReference = false) {
        if (!this.isDuneDimension()) {
            return super.getLiveTarget(requireSameReference);
        }
        const target = this.findNearestTarget();
        this.target = target;
        this.isAlarmed = !!target;
        if (target) this.alarmReason = 'sandling_hunt';
        return target;
    }

    updateAlarmState(currentTime) {
        if (!this.isDuneDimension()) {
            super.updateAlarmState(currentTime);
            return;
        }
        const target = this.findNearestTarget();
        this.target = target;
        this.isAlarmed = !!target;
        this.alarmReason = target ? 'sandling_hunt' : null;
        if (target) this.startHuntingTime = currentTime;
    }

    turn() {
        if (!this.isDuneDimension()) {
            super.turn();
            return;
        }
        const target = this.getLiveTarget();
        if (target) {
            this.angle = Math.atan2(target.y - this.y, target.x - this.x);
            return;
        }
        super.turn();
    }
}
