import {
    Mob
} from "./mob.js";
import {
    MAP_SIZE
} from '../../game.js';
import {
    ACCESSORY_KEYS
} from '../../../public/shared/datamap.js';

export class PolarBear extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 5);
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget(true);
            if (!target) {
                this.resetAlarmState();
                super.turn();
                return;
            }

            // Turn towards target if alarmed
            const targetHidden = this.isTargetHidden(target);
            const cloakMult = ACCESSORY_KEYS[target.accessoryId] === 'dark-cloak' ? 0.5 : 1;
            const detectRange = 400 * cloakMult;
            const hitRange = 800 * cloakMult;
            const distanceSq = (target.x - this.x) ** 2 + (target.y - this.y) ** 2;
            const wasHitTarget = this.alarmReason === 'hit' && this.lastHitById === target.id;

            // Check right side boundary (Snow Biome): this.x > MAP_SIZE[0] * 0.53
            if (targetHidden) {
                if (this.shouldWanderTurn()) super.turn();
                return;
            }

            const inRange = wasHitTarget ? (distanceSq < hitRange ** 2) : (distanceSq < detectRange ** 2);
            if (inRange && this.x > MAP_SIZE[0] * 0.47 && !target.hasShield) {
                this.angle = Math.atan2(target.y - this.y, target.x - this.x);
                return;
            }
            // If lost target/target dead/out of range, stop being alarmed
            this.resetAlarmState();
            return;
        }

        // Default wander behavior
        super.turn();
    }
}
