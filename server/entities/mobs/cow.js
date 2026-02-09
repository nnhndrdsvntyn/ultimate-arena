import {
    Mob
} from "./mob.js";
import {
    ENTITIES
} from '../../game.js';
import {
    dataMap,
    ACCESSORY_KEYS
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
            const liveTarget = this.target ? ENTITIES.PLAYERS[this.target.id] : null;
            if (!this.target || !liveTarget || liveTarget !== this.target) {
                this.isAlarmed = false;
                this.target = null;
                this.speed = dataMap.MOBS[this.type].speed;
                super.turn();
                return;
            }
            if (!this.target.isAlive) {
                this.isAlarmed = false;
                this.target = null;
                this.speed = dataMap.MOBS[this.type].speed;
                return;
            }

            let targetInBush = false;
            if (this.target) {
                Object.values(ENTITIES.STRUCTURES).forEach(structure => {
                    if (structure.type === 3 && colliding(structure, this.target, 100)) {
                        targetInBush = true;
                    }
                });
            }

            // If target is valid, decide behavior based on health
            if (this.target && ENTITIES.PLAYERS[this.target.id] && this.target.isAlive) {
                const targetHidden = targetInBush || this.target.isHidden || this.target.isInvisible;
                const distanceSq = (this.target.x - this.x) ** 2 + (this.target.y - this.y) ** 2;
                if (targetHidden) {
                    if (performance.now() - this.lastTurnTime > this.nextTurnDelay) {
                        super.turn();
                    }
                    return;
                }
                const cloakMult = ACCESSORY_KEYS[this.target.accessoryId] === 'dark-cloak' ? 0.5 : 1;
                const range = 1000 * cloakMult;
                if (distanceSq < range ** 2 && this.x < MAP_SIZE[0] * 0.47 && !this.target.hasShield) {
                    const healthRatio = this.maxHp ? (this.hp / this.maxHp) : 1;
                    if (healthRatio < 0.6) {
                        // Passive mode: run away when below 60% health
                        this.angle = Math.atan2(this.y - this.target.y, this.x - this.target.x);
                    } else {
                        // Agro mode: face target when >= 60% health
                        this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                    }
                    return;
                }
            }

            // If lost target/target dead/out of range, stop being alarmed
            this.isAlarmed = false;
            this.target = null;
            this.speed = dataMap.MOBS[this.type].speed;
            return;
        }

        // Default wander behavior
        super.turn();
    }
}
