import {
    Mob
} from "./mob.js";
import {
    MAP_SIZE
} from '../../game.js';
import {
    ACCESSORY_KEYS
} from '../../../public/shared/datamap.js';

export class Cow extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 3);
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget(true);
            if (!target) {
                this.resetAlarmState();
                super.turn();
                return;
            }

            // If target is valid, decide behavior based on health
            if (this.isTargetHidden(target, 100)) {
                if (this.shouldWanderTurn()) super.turn();
                return;
            }

            const distanceSq = (target.x - this.x) ** 2 + (target.y - this.y) ** 2;
            const cloakMult = ACCESSORY_KEYS[target.accessoryId] === 'dark-cloak' ? 0.5 : 1;
            const range = 1000 * cloakMult;
            if (distanceSq < range ** 2 && this.x < MAP_SIZE[0] * 0.47 && !target.hasShield) {
                const healthRatio = this.maxHp ? (this.hp / this.maxHp) : 1;
                if (healthRatio < 0.6) {
                    // Passive mode: run away when below 60% health
                    this.angle = Math.atan2(this.y - target.y, this.x - target.x);
                } else {
                    // Agro mode: face target when >= 60% health
                    this.angle = Math.atan2(target.y - this.y, target.x - this.x);
                }
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
