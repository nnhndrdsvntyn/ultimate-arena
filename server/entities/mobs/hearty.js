import {
    Mob
} from "./mob.js";
import {
    dataMap
} from '../../../public/shared/datamap.js';

import {
    playSfx
} from '../../helpers.js';

export class Hearty extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 4);
        this.lastLungeTime = 0;
    }

    turn() {
        if (this.isAlarmed) {
            // Turn AWAY from target if alarmed
            const target = this.getLiveTarget();
            if (target) {
                if (this.isTargetHidden(target)) {
                    if (this.shouldWanderTurn()) super.turn();
                    return;
                }
                this.angle = Math.atan2(this.y - target.y, this.x - target.x);
                this.lunge();
                return;
            }

            // If lost target/target dead, stop being alarmed
            this.resetAlarmState();
            return;
        }

        super.turn();
    }

    lunge() {
        if (performance.now() - this.lastLungeTime < 500) {
            this.speed = dataMap.MOBS[this.type].speed; // set normal speed
            return;
        }
        this.lastLungeTime = performance.now();
        this.speed = dataMap.MOBS[this.type].speed * 8;
        const sfx = dataMap.sfxMap.indexOf('heart-beat');
        playSfx(this.x, this.y, sfx, 1000);
    }
}
