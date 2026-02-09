import {
    Mob
} from "./mob.js";
import {
    ENTITIES
} from '../../game.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';

import {
    colliding,
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
            if (this.target && ENTITIES.PLAYERS[this.target.id] && this.target.isAlive) {
                const targetHidden = this.target.isHidden || this.target.isInvisible;
                if (targetHidden) {
                    if (performance.now() - this.lastTurnTime > this.nextTurnDelay) {
                        super.turn();
                    }
                    return;
                }
                this.angle = Math.atan2(this.y - this.target.y, this.x - this.target.x);
                this.lunge();
                return;
            }

            // If lost target/target dead, stop being alarmed
            this.isAlarmed = false;
            this.target = null;
            this.speed = dataMap.MOBS[this.type].speed;
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
