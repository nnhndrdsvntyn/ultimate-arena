import {
    ENTITIES
} from '../../game.js';
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
    constructor(id, x, y, type, amount = 1, source = null) {
        super(id, x, y, type);
        this.amount = amount;
        this.source = source;
        this.spawnTime = performance.now();
    }

    process() {
        super.process();
    }

    startCollection(player) {
        if (!player || !player.isAlive) return false;
        this.die(player);
        return true;
    }

    die(killer) {
        if (killer && typeof killer.addGoldCoins === 'function') {
            const amount = this.amount || 1;
            killer.addGoldCoins(amount);
            if (this.source === 'chest' && typeof killer.addScore === 'function') {
                killer.addScore(amount * 10);
            }
            killer.sendStatsUpdate();
        }

        if (killer && performance.now() - (killer.lastPickUpCoinTime || 0) > 20) {
            killer.lastPickUpCoinTime = performance.now();
            const sfx = dataMap.sfxMap.indexOf('coin-collect');
            playSfx(this.x, this.y, sfx, this.radius + killer.radius);
        }

        ENTITIES.deleteEntity('object', this.id);
    }
}
