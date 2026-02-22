import {
    ENTITIES,
    brokenObjects
} from '../../game.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    playSfx,
    colliding
} from '../../helpers.js';
import {
    GameObject
} from './object.js';
import {
    spawnObject
} from '../../game.js';

export class Chest extends GameObject {
    constructor(id, x, y, type) {
        super(id, x, y, type);

        this.shouldDropLoop = true;

        this.health = dataMap.OBJECTS[type].maxHealth;
        this.lastDamagedTime = 0;
    }

    damage(health, attacker) {
        if (performance.now() - this.lastDamagedTime < 200) return false; // invincible for 10 ticks (200 / 20)

        this.lastDamagedTime = performance.now();
        this.health = Math.max(0, this.health - health);

        if (this.health <= 0) {
            this.die(attacker);
            const sfx = dataMap.sfxMap.indexOf('bubble-pop');
            playSfx(this.x, this.y, sfx, 1000);
        } else {
            const sfx = dataMap.sfxMap.indexOf('wood-hit');
            playSfx(this.x, this.y, sfx, 1000);
        }
        return true;
    }

    die(killer) {
        super.die(killer);

        if (!this.shouldDropLoop) return;

        const coinDropRange = dataMap.OBJECTS[this.type].coinDropRange;
        const [min, max] = coinDropRange;
        const totalGold = Math.floor(Math.random() * (max - min + 1)) + min;
        const dropSpread = 30;
        for (let i = 0; i < totalGold; i++) {
            const dropAngle = Math.random() * Math.PI * 2;
            const dropDistance = this.radius + Math.random() * dropSpread;
            const dropX = this.x + Math.cos(dropAngle) * dropDistance;
            const dropY = this.y + Math.sin(dropAngle) * dropDistance;
            const dropObj = spawnObject(dataMap.COIN_ID, dropX, dropY, 1, 'chest');
            if (dropObj) {
            }
        }

        const dropWeights = dataMap.OBJECTS[this.type].swordRankDrops;
        const numDrops = Math.floor(Math.random() * 3) + 1;

        // Precompute cumulative probabilities (sorted by rank)
        const ranks = Object.keys(dropWeights).map(Number).sort((a, b) => a - b);
        const cumulativeProbs = [];
        let cumulative = 0;

        for (const rank of ranks) {
            cumulative += dropWeights[rank];
            cumulativeProbs.push({ rank, cumulative });
        }

        for (let i = 0; i < numDrops; i++) {
            const roll = Math.random(); // 0 ≤ roll < 1
            // Find the first rank where roll < cumulative probability
            const selectedEntry = cumulativeProbs.find(p => roll < p.cumulative);

            if (selectedEntry) {
                const selectedRank = selectedEntry.rank;
                const x = Math.random() * (this.radius * 2) + (this.x - this.radius);
                const y = Math.random() * (this.radius * 2) + (this.y - this.radius);
                spawnObject(selectedRank, x, y);
            }
        }

    }
}
