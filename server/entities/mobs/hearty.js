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
            const target = this.getLiveTarget();
            this.handleAlarmedTarget(target, undefined, t => {
                // Turn AWAY from visible target if alarmed
                this.angle = Math.atan2(this.y - t.y, this.x - t.x);
                this.lunge();
            });
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
        this.speed = dataMap.MOBS[this.type].speed * 2.5;
        const sfx = dataMap.sfxMap.indexOf('heart-beat');
        playSfx(this.x, this.y, sfx, 1000);
    }
}

