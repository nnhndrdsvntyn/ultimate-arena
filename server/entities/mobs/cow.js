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
    colliding
} from '../../helpers.js';
import {
    MAP_SIZE
} from '../../game.js';

export class Cow extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 3);
    }

    turn() {
        if (this.isAlarmed) {
            let targetInBush = false;
            Object.values(ENTITIES.STRUCTURES).forEach(structure => {
                if (structure.type === 3 && colliding(structure, this.target, 100)) {
                    targetInBush = true;
                }
            });

            // Turn towards target if alarmed
            let distanceSq = (this.target.x - this.x) ** 2 + (this.target.y - this.y) ** 2;
            if (this.target && ENTITIES.PLAYERS[this.target.id] && this.target.isAlive && !targetInBush && distanceSq < 1000 ** 2 && this.x < MAP_SIZE[0] * 0.47 && !this.target.hasShield) {
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