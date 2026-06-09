import {
    Mob
} from "./mob.js";

export class Fox extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 11);
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget();
            this.handleAlarmedTarget(target, -100, t => {
                this.angle = Math.atan2(t.y - this.y, t.x - this.x);
            });
            return;
        }

        super.turn();
    }
}
