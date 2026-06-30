import {
    ENTITIES,
    MAP_SIZE
} from '../../game.js';
import {
    dataMap,
    getCoinObjectType,
    ACCESSORY_KEYS,
    WEAPON_IDS,
    accessoryItemTypeFromId
} from '../../../public/shared/datamap.js';
import {
    playSfx,
    emitChestCoinSeed,
    emitDamageIndicatorFx
} from '../../helpers.js';
import {
    GameObject
} from './object.js';
import {
    spawnObject
} from '../../game.js';

const RARE_CHEST_TYPE = 22;
const ELITE_CHEST_TYPE = 23;
const ELITE_CHEST_COIN_DROP = 3500;
const CHEST_COIN_STACK_SIZE = 25;

function getRandomEntry(items) {
    if (!Array.isArray(items) || items.length <= 0) return 0;
    return items[Math.floor(Math.random() * items.length)] || 0;
}

export class Chest extends GameObject {
    constructor(id, x, y, type) {
        super(id, x, y, type);

        this.shouldDropLoop = true;

        this.health = dataMap.OBJECTS[type].maxHealth;
        this.lastDamagedTime = 0;
    }

    damage(health, attacker) {
        if (performance.now() - this.lastDamagedTime < 200) return false; // invincible for 10 ticks (200 / 20)
        const indicatorDamage = Math.max(0, Math.round(health));

        this.lastDamagedTime = performance.now();
        this.health = Math.max(0, this.health - health);

        if (this.health <= 0) {
            emitDamageIndicatorFx(this.x, this.y, indicatorDamage, this.radius || dataMap.OBJECTS[this.type]?.radius || 0, this.world || 'main');
            this.die(attacker);
            const sfx = dataMap.sfxMap.indexOf('bubble_pop');
            playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
        } else {
            const sfx = dataMap.sfxMap.indexOf('wood_hit');
            playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
        }
        return true;
    }

    die(killer) {
        super.die(killer);

        const totalGold = this.computeCoinDrop(killer);
        this.dropRareChestItems();
        if (totalGold <= 0) return;

        const coinType = getCoinObjectType();
        if (!coinType) return;
        const coinRadius = dataMap.OBJECTS[coinType]?.radius || 50;
        const dropSpread = this.radius + 45;
        const worldId = this.world || 'main';
        const seed = ((Math.random() * 0x100000000) >>> 0);
        let rngState = seed;
        const nextRand = () => {
            rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0;
            return rngState / 4294967296;
        };

        emitChestCoinSeed(this.x, this.y, dropSpread, totalGold, seed, 100000, worldId);

        const coinStackSize = totalGold > 500 ? CHEST_COIN_STACK_SIZE : 1;
        let remainingGold = totalGold;
        while (remainingGold > 0) {
            const amount = Math.min(coinStackSize, remainingGold);
            const dropAngle = nextRand() * Math.PI * 2;
            const dropDistance = Math.sqrt(nextRand()) * dropSpread;
            const dropX = Math.max(coinRadius, Math.min(MAP_SIZE[0] - coinRadius, this.x + Math.cos(dropAngle) * dropDistance));
            const dropY = Math.max(coinRadius, Math.min(MAP_SIZE[1] - coinRadius, this.y + Math.sin(dropAngle) * dropDistance));
            spawnObject(coinType, dropX, dropY, amount, 'chest', worldId);
            remainingGold -= amount;
        }

    }

    computeCoinDrop(killer) {
        if (Number.isFinite(this.tutorialCoinDrop) && this.tutorialCoinDrop > 0) {
            return Math.max(1, Math.floor(this.tutorialCoinDrop));
        }
        if (!this.shouldDropLoop) return 0;

        if (this.type === ELITE_CHEST_TYPE) {
            return ELITE_CHEST_COIN_DROP;
        }

        const [min, max] = dataMap.OBJECTS[this.type].coinDropRange;
        const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
        const killerAccessory = ACCESSORY_KEYS[killer?.accessoryId || 0];
        return killerAccessory === 'pirate_hat'
            ? Math.floor(baseGold * 1.2)
            : baseGold;
    }

    dropRareChestItems() {
        if (!this.shouldDropLoop || this.type !== RARE_CHEST_TYPE) return;

        const worldId = this.world || 'main';
        const weaponType = getRandomEntry(WEAPON_IDS);
        if (weaponType) {
            this.spawnChestItemDrop(weaponType, worldId);
        }

        const accessoryIds = ACCESSORY_KEYS
            .map((_, id) => id)
            .filter(id => id > 0 && accessoryItemTypeFromId(id));
        const accessoryType = accessoryItemTypeFromId(getRandomEntry(accessoryIds));
        if (accessoryType) {
            this.spawnChestItemDrop(accessoryType, worldId);
        }
    }

    spawnChestItemDrop(type, worldId) {
        const itemRadius = dataMap.OBJECTS[type]?.radius || 45;
        const spread = this.radius + 75;
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * spread;
        const dropX = Math.max(itemRadius, Math.min(MAP_SIZE[0] - itemRadius, this.x + Math.cos(angle) * distance));
        const dropY = Math.max(itemRadius, Math.min(MAP_SIZE[1] - itemRadius, this.y + Math.sin(angle) * distance));
        spawnObject(type, dropX, dropY, 1, 'chest_loot', worldId);
    }
}
