import {
    Mob
} from "./mob.js";
import {
    ENTITIES,
    MAP_SIZE
} from '../../game.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    colliding
} from '../../helpers.js';

export class PolarBear extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 5);
    }

    turn() {
        if (this.isAlarmed) {
            if (!this.target) {
                this.isAlarmed = false;
                this.speed = dataMap.MOBS[this.type].speed;
                super.turn();
                return;
            }

            // Turn towards target if alarmed
            let distanceSq = (this.target.x - this.x) ** 2 + (this.target.y - this.y) ** 2;

            // Check right side boundary (Snow Biome): this.x > MAP_SIZE[0] * 0.53
            if (this.target && ENTITIES.PLAYERS[this.target.id] && this.target.isAlive && !this.target.isHidden && distanceSq < 1000 ** 2 && this.x > MAP_SIZE[0] * 0.47 && !this.target.hasShield) {
                this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                return;
            } else {
                // If lost target/target dead/in bush/ out of range, stop being alarmed
                this.isAlarmed = false;
                this.target = null;
                this.speed = dataMap.MOBS[this.type].speed;
                return;
            }
        }

        // Default wander behavior
        super.turn();
    }
}