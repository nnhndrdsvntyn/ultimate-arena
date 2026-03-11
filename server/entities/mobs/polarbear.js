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
            this.handleAlarmedTarget(target, 0, t => {
                const cloakMult = ACCESSORY_KEYS[t.accessoryId] === 'dark-cloak' ? 0.5 : 1;
                const detectRange = 400 * cloakMult;
                const hitRange = 800 * cloakMult;
                const distanceSq = (t.x - this.x) ** 2 + (t.y - this.y) ** 2;
                const wasHitTarget = this.alarmReason === 'hit' && this.lastHitById === t.id;
                const inRange = wasHitTarget ? (distanceSq < hitRange ** 2) : (distanceSq < detectRange ** 2);
                if (inRange && this.x > MAP_SIZE[0] * 0.47 && !t.hasShield) {
                    this.angle = Math.atan2(t.y - this.y, t.x - this.x);
                } else {
                    this.resetAlarmState();
                }
            });
            return;
        }

        // Default wander behavior
        super.turn();
    }
}
