import {
    Mob
} from "./mob.js";
import {
    ENTITIES,
    MAP_SIZE
} from '../../game.js';
import {
    dataMap,
    ACCESSORY_KEYS
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
            const liveTarget = this.target ? ENTITIES.PLAYERS[this.target.id] : null;
            if (!this.target || !liveTarget || liveTarget !== this.target) {
                this.isAlarmed = false;
                this.speed = dataMap.MOBS[this.type].speed;
                this.target = null;
                super.turn();
                return;
            }
            if (!this.target.isAlive) {
                this.isAlarmed = false;
                this.speed = dataMap.MOBS[this.type].speed;
                this.target = null;
                return;
            }

            // Turn towards target if alarmed
            const targetHidden = this.target.isHidden || this.target.isInvisible;
            const cloakMult = ACCESSORY_KEYS[this.target.accessoryId] === 'dark-cloak' ? 0.5 : 1;
            const detectRange = 400 * cloakMult;
            const hitRange = 800 * cloakMult;
            const distanceSq = (this.target.x - this.x) ** 2 + (this.target.y - this.y) ** 2;
            const wasHitTarget = this.alarmReason === 'hit' && this.lastHitById === this.target.id;

            // Check right side boundary (Snow Biome): this.x > MAP_SIZE[0] * 0.53
            if (this.target && ENTITIES.PLAYERS[this.target.id] && this.target.isAlive) {
                if (targetHidden) {
                    if (performance.now() - this.lastTurnTime > this.nextTurnDelay) {
                        super.turn();
                    }
                    return;
                }
                const inRange = wasHitTarget ? (distanceSq < hitRange ** 2) : (distanceSq < detectRange ** 2);
                if (inRange && this.x > MAP_SIZE[0] * 0.47 && !this.target.hasShield) {
                    this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
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
