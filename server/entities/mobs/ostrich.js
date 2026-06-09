import {
    Mob
} from "./mob.js";

export class Ostrich extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 12);
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget();
            this.handleAlarmedTarget(target, -100, t => {
                this.angle = Math.atan2(this.y - t.y, this.x - t.x);
            });
            return;
        }

        super.turn();
    }
}
