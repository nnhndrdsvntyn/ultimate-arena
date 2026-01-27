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

        this.health = dataMap.OBJECTS[type].maxHealth;
        this.lastDamagedTime = 0;
    }

    damage(health, attacker) {
        if (performance.now() - this.lastDamagedTime < 200) return; // invincible for 10 ticks (200 / 20)

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
    }

    die(killer) {
        super.die(killer);

        const coinDropRange = dataMap.OBJECTS[this.type].coinDropRange;
        const [min, max] = coinDropRange;
        const coinCount = Math.floor(Math.random() * (max - min + 1)) + min;

        // spawn coins in random positions 
        for (let i = 0; i < coinCount; i++) {
            const x = Math.random() * (this.radius * 2) + (this.x - this.radius);
            const y = Math.random() * (this.radius * 2) + (this.y - this.radius);

            spawnObject(5, x, y); // gold-coin is type 5
        }

        // weapon drops based on rank probabilities (3 attempts)
        const dropWeights = dataMap.OBJECTS[this.type].swordRankDrops;

        for (let i = 0; i < 3; i++) {
            const roll = Math.random();
            let cumulative = 0;
            let selectedRank = null;

            for (const rank in dropWeights) {
                cumulative += dropWeights[rank];
                if (roll < cumulative) {
                    selectedRank = Number(rank);
                    break;
                }
            }

            if (selectedRank !== null) {
                const x = Math.random() * (this.radius * 2) + (this.x - this.radius);
                const y = Math.random() * (this.radius * 2) + (this.y - this.radius);
                spawnObject(selectedRank + 5, x, y); // sword types are 6-12 (rank+5)
            }
        }
    }
}