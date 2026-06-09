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
            this.handleAlarmedTarget(target, -100, t => {
                this.angle = Math.atan2(this.y - t.y, this.x - t.x);
            });
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
