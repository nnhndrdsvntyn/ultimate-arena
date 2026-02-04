import {
    ENTITIES,
    brokenObjects
} from '../../game.js';
import {
    colliding
} from '../../helpers.js';
import {
    GameObject
} from './object.js';
import {
    playSfx
} from '../../helpers.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';

export class GoldCoin extends GameObject {
    constructor(id, x, y, type, amount = 1) {
        super(id, x, y, type);
        this.amount = amount;
        this.spawnTime = performance.now();
    }

    process() {
        // Auto-pickup is now handled by the Player class for better control over delays.
        super.process();
    }

    die(killer) {
        super.die(killer);

        if (killer && typeof killer.addGoldCoins === 'function') {
            killer.addGoldCoins(this.amount || 1);
            killer.sendStatsUpdate();
        }

        if (killer && performance.now() - killer.lastPickUpCoinTime > 20) { // don't spam sound packets too much
            killer.lastPickUpCoinTime = performance.now();
            const sfx = dataMap.sfxMap.indexOf('coin-collect');
            playSfx(this.x, this.y, sfx, this.radius + killer.radius);
        }
    }
}