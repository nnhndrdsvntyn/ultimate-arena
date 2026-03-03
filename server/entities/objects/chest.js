import {
    ENTITIES,
    MAP_SIZE
} from '../../game.js';
import {
    dataMap,
    getCoinObjectType,
    ACCESSORY_KEYS
} from '../../../public/shared/datamap.js';
import {
    playSfx
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

        if (Number.isFinite(this.tutorialCoinDrop) && this.tutorialCoinDrop > 0) {
            spawnObject(getCoinObjectType(), this.x, this.y, Math.floor(this.tutorialCoinDrop), 'chest', this.world || 'main');
            return;
        }

        if (!this.shouldDropLoop) return;

        const coinDropRange = dataMap.OBJECTS[this.type].coinDropRange;
        const [min, max] = coinDropRange;
        const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
        const killerAccessory = ACCESSORY_KEYS[killer?.accessoryId || 0];
        const totalGold = killerAccessory === 'pirate-hat'
            ? Math.floor(baseGold * 1.2)
            : baseGold;
        const coinType = getCoinObjectType();
        if (!coinType) return;
        const coinRadius = dataMap.OBJECTS[coinType]?.radius || 50;
        const dropSpread = this.radius + 45;

        for (let i = 0; i < totalGold; i++) {
            let dropX = this.x;
            let dropY = this.y;

            // Scatter coins in a disk and retry a few times to avoid bad placements (rocks/map edge).
            for (let attempt = 0; attempt < 6; attempt++) {
                const dropAngle = Math.random() * Math.PI * 2;
                const dropDistance = Math.sqrt(Math.random()) * dropSpread;
                const candidateX = Math.max(coinRadius, Math.min(MAP_SIZE[0] - coinRadius, this.x + Math.cos(dropAngle) * dropDistance));
                const candidateY = Math.max(coinRadius, Math.min(MAP_SIZE[1] - coinRadius, this.y + Math.sin(dropAngle) * dropDistance));

                let blockedByRock = false;
                for (const sid in ENTITIES.STRUCTURES) {
                    const s = ENTITIES.STRUCTURES[sid];
                    if (!s || s.type !== 2) continue;
                    if ((s.world || 'main') !== (this.world || 'main')) continue;
                    const dx = candidateX - s.x;
                    const dy = candidateY - s.y;
                    const minDist = (s.radius || 0) + coinRadius + 8;
                    if ((dx * dx + dy * dy) < (minDist * minDist)) {
                        blockedByRock = true;
                        break;
                    }
                }
                if (!blockedByRock) {
                    dropX = candidateX;
                    dropY = candidateY;
                    break;
                }
            }

            spawnObject(coinType, dropX, dropY, 1, 'chest', this.world || 'main');
        }

    }
}
