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
import { dataMap } from '../../../public/shared/datamap.js';

export class GoldCoin extends GameObject {
    constructor(id, x, y, type) {
        super(id, x, y, type);
    }

    process() {
        // Check collisions with players to "pick up" the coin
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (player.isAlive) {
                if (colliding(player, this)) {
                    this.die(player);
                    return; // Coin is gone, stop processing
                }
            }
        }

        // Optional: Keep structure collisions if you want coins to pop out of rocks
        this.resolveCollisions();
    }

    die(killer) {
        super.die(killer);

        const sfx = dataMap.sfxMap.indexOf('coin-collect');
        playSfx(this.x, this.y, sfx, this.radius + killer.radius);
    }
}