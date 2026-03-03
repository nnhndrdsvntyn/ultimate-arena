import {
    Mob
} from "./mob.js";

export class Chick extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 1);
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget();
            if (target) {
                if (this.isTargetHidden(target, -100)) {
                    if (this.shouldWanderTurn()) super.turn();
                    return;
                }
                this.angle = Math.atan2(this.y - target.y, this.x - target.x);
                return;
            }

            // If lost target/target dead, stop being alarmed
            this.resetAlarmState();
            return;
        }

        super.turn();
    }

    checkBiome() {
        if (this.x > 4700 - this.radius) {
            this.angle = Math.PI - 0.5 + Math.random(); // Force turn leftish
        }
    }
}
