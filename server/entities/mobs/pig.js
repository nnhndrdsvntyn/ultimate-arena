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

export class Pig extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 2);
    }

    turn() {
        if (this.isAlarmed) {
            let targetInBush = false;
            Object.values(ENTITIES.STRUCTURES).forEach(structure => {
                if (structure.type === 3 && colliding(structure, this.target, -100)) {
                    targetInBush = true;
                }
            });

            // Turn AWAY from target if alarmed
            if (this.target && ENTITIES.PLAYERS[this.target.id] && this.target.isAlive && !targetInBush) {
                this.angle = Math.atan2(this.y - this.target.y, this.x - this.target.x);
                return;
            } else {
                // If lost target/target dead/in bush, stop being alarmed
                this.isAlarmed = false;
                this.target = null;
                this.speed = dataMap.MOBS[this.type].speed;
                return;
            }
        }

        super.turn();
    }

    checkBiome() {
        if (this.x > 4700 - this.radius) {
            this.angle = Math.PI - 0.5 + Math.random(); // Force turn leftish
        }
    }
}