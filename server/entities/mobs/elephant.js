import {
    Mob
} from "./mob.js";
import {
    dataMap
} from '../../../public/shared/datamap.js';

export class Elephant extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 13);
        this.speedOverride = dataMap.MOBS[this.type].speed * 0.5;
        this.speed = this.speedOverride;
    }

    getAlarmSpeedMultiplier() {
        return 3;
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget(true);
            this.handleAlarmedTarget(target, 100, t => {
                this.angle = Math.atan2(t.y - this.y, t.x - this.x);
            });
            return;
        }

        super.turn();
    }
}
