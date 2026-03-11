import {
    Mob
} from "./mob.js";
import {
    MAP_SIZE
} from '../../game.js';
import {
    ACCESSORY_KEYS
} from '../../../public/shared/datamap.js';

export class Cow extends Mob {
    constructor(id, x, y) {
        super(id, x, y, 3);
    }

    turn() {
        if (this.isAlarmed) {
            const target = this.getLiveTarget(true);
            this.handleAlarmedTarget(target, 100, t => {
                const distanceSq = (t.x - this.x) ** 2 + (t.y - this.y) ** 2;
                const cloakMult = ACCESSORY_KEYS[t.accessoryId] === 'dark-cloak' ? 0.5 : 1;
                const range = 1000 * cloakMult;
                const inTutorialWorld = (this.world || '').startsWith('tutorial');
                const withinBiome = inTutorialWorld || this.x < MAP_SIZE[0] * 0.47;
                if (distanceSq < range ** 2 && withinBiome && !t.hasShield) {
                    const healthRatio = this.maxHp ? (this.hp / this.maxHp) : 1;
                    this.angle = healthRatio < 0.6
                        ? Math.atan2(this.y - t.y, this.x - t.x) // flee
                        : Math.atan2(t.y - this.y, t.x - this.x); // face
                } else {
                    this.resetAlarmState();
                }
            });
            return;
        }

        // Default wander behavior
        super.turn();
    }
}
