import {
    ENTITIES,
    brokenObjects
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

        if (!this.shouldDropLoop) return;

        const coinDropRange = dataMap.OBJECTS[this.type].coinDropRange;
        const [min, max] = coinDropRange;
        const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
        const killerAccessory = ACCESSORY_KEYS[killer?.accessoryId || 0];
        const totalGold = killerAccessory === 'pirate-hat'
            ? Math.floor(baseGold * 1.2)
            : baseGold;
        const dropSpread = 30;
        for (let i = 0; i < totalGold; i++) {
            const dropAngle = Math.random() * Math.PI * 2;
            const dropDistance = this.radius + Math.random() * dropSpread;
            const dropX = this.x + Math.cos(dropAngle) * dropDistance;
            const dropY = this.y + Math.sin(dropAngle) * dropDistance;
            const dropObj = spawnObject(getCoinObjectType(), dropX, dropY, 1, 'chest');
            if (dropObj) {
            }
        }

    }
}
