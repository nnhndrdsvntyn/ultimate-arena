import {
    ENTITIES
} from '../../game.js';
import {
    GameObject
} from './object.js';
import {
    emitCoinPickupFx
} from '../../helpers.js';
export class GoldCoin extends GameObject {
    constructor(id, x, y, type, amount = 1, source = null) {
        super(id, x, y, type);
        this.amount = amount;
        this.source = source;
        this.spawnTime = performance.now();
    }

    process() {
        // Coins do not need structure collision resolution.
        // Keep only teleport completion behavior used by dropped-item animation.
        if (this.teleportTicks > 0) {
            this.teleportTicks--;
            if (this.teleportTicks === 0 && this.targetX !== undefined && this.targetY !== undefined) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.targetX = undefined;
                this.targetY = undefined;
            }
        }
    }

    startCollection(player) {
        if (!player || !player.isAlive) return false;
        this.die(player);
        return true;
    }

    die(killer) {
        const amount = this.amount || 1;
        if (killer && typeof killer.addGoldCoins === 'function') {
            killer.addGoldCoins(amount);
            if (this.source === 'chest' && typeof killer.addScore === 'function') {
                killer.addScore(amount * 10);
            }
            emitCoinPickupFx(this.x, this.y, killer.id, amount);
            killer.sendStatsUpdate();
        }

        if (killer && performance.now() - (killer.lastPickUpCoinTime || 0) > 20) {
            killer.lastPickUpCoinTime = performance.now();
        }

        ENTITIES.deleteEntity('object', this.id);
    }
}
