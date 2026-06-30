import { worldIsGrassOnly, worldIsSnowOnly, worldIsDesertOnly, worldIsMagmaOnly } from './worlds.js';

export const TPS = {
    clientReal: 0,
    clientCapped: 75,
    server: 20
};

export const DEFAULT_VIEW_RANGE_MULT = 2 / 3;
export const MAX_LEVEL = 45;
export const BOSS_PORTAL_MIN_SCORE = 1000;
export const BOSS_PORTAL_MIN_SWORD_TYPE = 4;
export const BOSS_PORTAL_LOW_SCORE_MESSAGE = 'You are not experienced enough!';
export const BOSS_PORTAL_LOW_WEAPON_MESSAGE = "Your weapon isn't powerful enough!";
export const SPEAR_12_TYPE = 29;
export const SPEAR_11_TYPE = 28;
export const SPEAR_10_TYPE = 27;
export const SPEAR_7_TYPE = 24;
export const SPEAR_2_TYPE = 15;
export const AXE_7_TYPE = 36;
export const AXE_10_TYPE = 39;
export const SWORD_3_TYPE = 4;
export const SWORD_7_TYPE = 8;
export const SWORD_9_TYPE = 10;
export const SWORD_10_TYPE = 11;
export const SWORD_12_TYPE = 13;
export const BOOMERANG_7_TYPE = 48;
export const BOOMERANG_10_TYPE = 51;
export const SPEAR_FORWARD_SWING_STEPS = 6;
export const SPEAR_RETRACT_SWING_STEPS = 6;
const XP_REQUIREMENTS = [
    9, 11, 15, 19, 25, 32, 42, 55, 71, 93, 120, 156, 203, 264, 344,
    447, 581, 755, 981, 1275, 1658, 2156, 2802, 3643, 4736, 6156, 8003,
    10404, 13525, 17583, 22858, 29716, 38630, 50219, 65285, 84870, 110332,
    143431, 186460, 242399, 315118, 409654, 532550, 692314
];

export const xpForLevel = (level) => {
    const idx = Math.max(1, Math.min(MAX_LEVEL - 1, level | 0)) - 1;
    return XP_REQUIREMENTS[idx] || 1;
};
export const XP_SHOP_ITEMS = [
    { id: 201, name: '1,000 XP', xp: 1000, price: 100 },
    { id: 202, name: '2,500 XP', xp: 2500, price: 250 },
    { id: 203, name: '5,000 XP', xp: 5000, price: 500 },
    { id: 204, name: '10,000 XP', xp: 10000, price: 1000 }
];
export const SPECIAL_SHOP_ITEMS = [
    { id: 122, key: 'golden_skull', name: 'Golden Skull', category: 'special', itemType: 122, coinCost: 500, itemCosts: [{ key: 'skull', amount: 1 }] }
];

const createAsset = (name, src, type) => ({ name, src, type });
const SWORD_MELEE_DAMAGE_BY_INDEX = [6, 9, 12, 15, 19, 24, 29, 34, 40, 47, 54, 62];
const SPEAR_MELEE_DAMAGE_BY_INDEX = [5, 7, 10, 13, 16, 20, 24, 29, 34, 40, 47, 54];
const AXE_MELEE_DAMAGE_BY_INDEX = [8, 12, 15, 19, 24, 30, 36, 42, 49, 56, 63, 70];
const BOOMERANG_MELEE_DAMAGE_BY_INDEX = [3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 24, 28];
const AXE_MELEE_MAX_DISTANCE_BY_INDEX = AXE_MELEE_DAMAGE_BY_INDEX.map((_, idx) => 100 + Math.min(210, (idx + 1) * 14));
const BOOMERANG_MELEE_MAX_DISTANCE_BY_INDEX = [
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[0] * 0.5,
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[0] * 0.5,
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[0] * 0.75,
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[0] * 0.75,
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[0],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[0],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[1],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[1],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[2],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[2],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[3],
    AXE_MELEE_MAX_DISTANCE_BY_INDEX[3]
];
const SWORD_THROW_DAMAGE_BY_INDEX = [3, 4, 5, 7, 9, 11, 14, 17, 20, 24, 28, 33];
const SPEAR_THROW_DAMAGE_BY_INDEX = [5, 7, 10, 13, 16, 20, 24, 29, 34, 40, 47, 54];
const AXE_THROW_DAMAGE_BY_INDEX = [5, 7, 10, 13, 16, 20, 24, 29, 34, 40, 47, 54];
const BOOMERANG_THROW_DAMAGE_BY_INDEX = [6, 9, 12, 15, 19, 24, 29, 34, 40, 47, 54, 62];
const WEAPON_COOLDOWN_MULT_BY_CATEGORY = {
    axe: 1.5,
    sword: 1,
    boomerang: 1,
    spear: 0.75
};
const WEAPON_TOUGHNESS_BY_INDEX = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
const BOOMERANG_TOUGHNESS_BY_INDEX = WEAPON_TOUGHNESS_BY_INDEX;
const SWORD_SLASH_BY_INDEX = [
    'woody',
    'stony',
    'metallic',
    'light_metallic',
    'light_metallic',
    'light_metallic',
    'icy',
    'light_metallic',
    'light_metallic',
    'icy',
    'light_metallic',
    'fiery'
];
const AXE_SLASH_BY_INDEX = [
    'woody',
    'stony',
    'metallic',
    'light_metallic',
    'light_metallic',
    'metallic',
    'fiery',
    'light_metallic',
    'light_metallic',
    'fiery',
    'light_metallic',
    'fiery'
];

function getSwordType(index) {
    return index + 1;
}

function getSpearType(index) {
    return index <= 6 ? index + 13 : index + 17;
}

function getAxeType(index) {
    return index + 29;
}

function getBoomerangType(index) {
    return index + 41;
}

function createWeaponAttack({ type, category, index = 0, damage, throwDamage = damage, projectileType, slashKeyOverride = '', maxDistanceOverride = 0 }) {
    const slashMap = category === 'axe' ? AXE_SLASH_BY_INDEX : SWORD_SLASH_BY_INDEX;
    const slashKey = slashKeyOverride || ((category === 'sword' || category === 'axe' || category === 'boomerang') && index > 0
        ? `slashattack_${slashMap[index - 1]}`
        : 'slashattack_woody');
    return {
        radius: index >= 9 ? 15 : 10,
        speed: 30 + Math.min(60, (index || 0) * 4),
        damage,
        throwDamage,
        maxDistance: maxDistanceOverride > 0 ? maxDistanceOverride : 100 + Math.min(210, (index || 0) * 14),
        knockbackStrength: 25,
        imgProportions: [1, 10],
        imgSrc: `./images/projectiles/${slashKey}.png`,
        imgName: `projectiles_${slashKey}_${type}`
    };
}

const WEAPON_METADATA_DEFINITIONS = [
    {
        type: 1,
        category: 'sword',
        key: 'bone',
        displayName: 'Bone',
        order: 5,
        shopPrice: null,
        sellPrice: 0,
        projectileType: 41,
        toughness: 0,
        attack: createWeaponAttack({
            type: 1,
            category: 'sword',
            damage: 3,
            throwDamage: 2,
            projectileType: 41,
            slashKeyOverride: 'slashattack_light_metallic',
            maxDistanceOverride: 100
        })
    },
    ...SWORD_MELEE_DAMAGE_BY_INDEX.map((damage, idx) => {
        const index = idx + 1;
        const type = getSwordType(index);
        const projectileType = 41 + type;
        return {
            type,
            category: 'sword',
            key: `sword${index}`,
            displayName: `sword${index}`,
            order: damage,
            shopPrice: 50 + (idx * idx * 35) + (idx * 60),
            sellPrice: Math.floor((50 + (idx * idx * 35) + (idx * 60)) / 2),
            projectileType,
            cooldownMult: WEAPON_COOLDOWN_MULT_BY_CATEGORY.sword,
            toughness: WEAPON_TOUGHNESS_BY_INDEX[idx] || 1,
            attack: createWeaponAttack({ type, category: 'sword', index, damage, throwDamage: SWORD_THROW_DAMAGE_BY_INDEX[idx] || damage, projectileType })
        };
    }),
    ...SPEAR_MELEE_DAMAGE_BY_INDEX.map((damage, idx) => {
        const index = idx + 1;
        const type = getSpearType(index);
        const projectileType = 60 + index;
        return {
            type,
            category: 'spear',
            key: `spear${index}`,
            displayName: `spear${index}`,
            order: damage,
            shopPrice: 55 + (idx * idx * 28) + (idx * 55),
            sellPrice: Math.floor((55 + (idx * idx * 28) + (idx * 55)) / 2),
            projectileType,
            cooldownMult: WEAPON_COOLDOWN_MULT_BY_CATEGORY.spear,
            toughness: WEAPON_TOUGHNESS_BY_INDEX[idx] || 1,
            attack: createWeaponAttack({ type, category: 'spear', index, damage, throwDamage: SPEAR_THROW_DAMAGE_BY_INDEX[idx] || damage, projectileType })
        };
    }),
    ...AXE_MELEE_DAMAGE_BY_INDEX.map((damage, idx) => {
        const index = idx + 1;
        const type = getAxeType(index);
        const projectileType = 80 + index;
        const shopPrice = Math.floor((50 + (idx * idx * 35) + (idx * 60)) * 1.35);
        return {
            type,
            category: 'axe',
            key: `axe${index}`,
            displayName: `axe${index}`,
            order: damage,
            shopPrice,
            sellPrice: Math.floor(shopPrice / 2),
            projectileType,
            cooldownMult: WEAPON_COOLDOWN_MULT_BY_CATEGORY.axe,
            toughness: WEAPON_TOUGHNESS_BY_INDEX[idx] || 1,
            attack: createWeaponAttack({ type, category: 'axe', index, damage, throwDamage: AXE_THROW_DAMAGE_BY_INDEX[idx] || damage, projectileType })
        };
    }),
    ...BOOMERANG_MELEE_DAMAGE_BY_INDEX.map((damage, idx) => {
        const index = idx + 1;
        const type = getBoomerangType(index);
        const projectileType = 100 + index;
        const shopPrice = Math.floor((50 + (idx * idx * 35) + (idx * 60)) * 1.15);
        return {
            type,
            category: 'boomerang',
            key: `boomerang${index}`,
            displayName: `boomerang${index}`,
            order: damage,
            shopPrice,
            sellPrice: Math.floor(shopPrice / 2),
            projectileType,
            cooldownMult: WEAPON_COOLDOWN_MULT_BY_CATEGORY.boomerang,
            toughness: BOOMERANG_TOUGHNESS_BY_INDEX[idx] || 1,
            attack: createWeaponAttack({
                type,
                category: 'boomerang',
                index,
                damage,
                throwDamage: BOOMERANG_THROW_DAMAGE_BY_INDEX[idx] || damage,
                projectileType,
                maxDistanceOverride: BOOMERANG_MELEE_MAX_DISTANCE_BY_INDEX[idx]
            })
        };
    })
];

const WEAPON_METADATA_BY_TYPE = new Map(WEAPON_METADATA_DEFINITIONS.map(def => [def.type, def]));
const WEAPON_TYPE_BY_PROJECTILE_TYPE = new Map(WEAPON_METADATA_DEFINITIONS.map(def => [def.projectileType, def.type]));
const WEAPON_TYPE_BY_KEY = Object.freeze(WEAPON_METADATA_DEFINITIONS.reduce((acc, def) => {
    acc[def.key] = def.type;
    return acc;
}, {}));
const WEAPON_ATTACK_PROJECTILES = WEAPON_METADATA_DEFINITIONS.reduce((acc, def) => {
    const attack = def.attack;
    if (!attack || !attack.imgName || !attack.imgSrc) return acc;
    acc[attack.imgName] = { name: attack.imgName, src: attack.imgSrc };
    return acc;
}, {});

// Add or edit drop/chest/coin types here.
// - Use a unique `key`.
// - `id` is optional; omit it to auto-assign the next free u8 type.
// - Set `category` (`chest`, `coin`, `drop`) and behavior flags in this one place.
const OBJECT_DEFINITIONS = [
    {
        key: 'chest1',
        id: 20,
        category: 'chest',
        isChest: true,
        radius: 50,
        maxHealth: 50,
        score: 10,
        coinDropRange: [10, 15],
        swordRankDrops: { 1: 0.5, 2: 0.25, 3: 0.1, 4: 0.05, 5: 0.04, 6: 0.03, 7: 0.03 },
        worldSpawnCount: 75,
        spawnSide: 'left',
        riverBuffer: 200,
        imgSrc: './images/objects/chest1.png',
        imgName: 'chest1',
        imgProportions: [3, 2]
    },
    {
        key: 'chest2',
        id: 21,
        category: 'chest',
        isChest: true,
        radius: 50,
        maxHealth: 125,
        score: 25,
        coinDropRange: [25, 75],
        swordRankDrops: { 1: 0.2, 2: 0.3, 3: 0.25, 4: 0.1, 5: 0.05, 6: 0.05, 7: 0.05 },
        worldSpawnCount: 30,
        spawnSide: 'left',
        riverBuffer: 200,
        imgSrc: './images/objects/chest2.png',
        imgName: 'chest2',
        imgProportions: [3, 2]
    },
    {
        key: 'chest3',
        id: 22,
        category: 'chest',
        isChest: true,
        radius: 50,
        maxHealth: 250,
        score: 75,
        coinDropRange: [50, 150],
        swordRankDrops: { 8: 0.1 },
        worldSpawnCount: 25,
        spawnSide: 'right',
        riverBuffer: 200,
        imgSrc: './images/objects/chest3.png',
        imgName: 'chest3',
        imgProportions: [3, 2]
    },
    {
        key: 'chest4',
        id: 23,
        category: 'chest',
        isChest: true,
        radius: 70,
        maxHealth: 500,
        score: 100,
        coinDropRange: [100, 300],
        swordRankDrops: { 1: 0.02, 2: 0.03, 3: 0.05, 4: 0.1, 5: 0.2, 6: 0.35, 7: 0.25 },
        worldSpawnCount: 10,
        spawnSide: 'left',
        riverBuffer: 200,
        imgSrc: './images/objects/chest4.png',
        imgName: 'chest4',
        imgProportions: [3, 2]
    },
    {
        key: 'gold_coin',
        id: 99,
        category: 'coin',
        isEphemeral: true,
        stackable: true,
        radius: 15,
        maxHealth: 1,
        score: 5,
        imgSrc: './images/objects/gold_coin.png',
        imgName: 'gold_coin',
        imgProportions: [2, 2]
    },
    { key: 'bone_drop', id: 1, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/bone.png', imgName: 'swords_bone', imgProportions: [2, 1] },
    ...Array.from({ length: 12 }, (_, idx) => {
        const index = idx + 1;
        return {
            key: `sword${index}_drop`,
            id: getSwordType(index),
            category: 'drop',
            isEphemeral: true,
            radius: 45,
            maxHealth: 1,
            score: 0,
            imgSrc: `./images/swords/sword${index}.png`,
            imgName: `swords_sword${index}`,
            imgProportions: [2, 1]
        };
    }),
    ...Array.from({ length: 12 }, (_, idx) => {
        const index = idx + 1;
        return {
            key: `spear${index}_drop`,
            id: getSpearType(index),
            category: 'drop',
            isEphemeral: true,
            radius: 45,
            maxHealth: 1,
            score: 0,
            imgSrc: `./images/spears/spear${index}.png`,
            imgName: `spears_spear${index}`,
            imgProportions: [2, 1]
        };
    }),
    ...Array.from({ length: 12 }, (_, idx) => {
        const index = idx + 1;
        return {
            key: `axe${index}_drop`,
            id: getAxeType(index),
            category: 'drop',
            isEphemeral: true,
            radius: 45,
            maxHealth: 1,
            score: 0,
            imgSrc: `./images/axes/axe${index}.png`,
            imgName: `axes_axe${index}`,
            imgProportions: [2, 1]
        };
    }),
    ...Array.from({ length: 12 }, (_, idx) => {
        const index = idx + 1;
        return {
            key: `boomerang${index}_drop`,
            id: getBoomerangType(index),
            category: 'drop',
            isEphemeral: true,
            radius: 45,
            maxHealth: 1,
            score: 0,
            imgSrc: `./images/boomerangs/boomerang${index}.png`,
            imgName: `boomerangs_boomerang${index}`,
            imgProportions: [1.25, 1]
        };
    }),
    { key: 'bush_cloak_drop', id: 101, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/bush_cloak.png', imgName: 'objects_bush_cloak', imgProportions: [1, 1] },
    { key: 'sunglasses_drop', id: 102, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/sunglasses.png', imgName: 'objects_sunglasses', imgProportions: [1, 1] },
    { key: 'pirate_hat_drop', id: 103, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/pirate_hat.png', imgName: 'objects_pirate_hat', imgProportions: [1, 1] },
    { key: 'viking_hat_drop', id: 104, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/viking_hat.png', imgName: 'objects_viking_hat', imgProportions: [1, 1] },
    { key: 'alien_antennas_drop', id: 105, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/alien_antennas.png', imgName: 'objects_alien_antennas', imgProportions: [1, 1] },
    { key: 'dark_cloak_drop', id: 106, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/dark_cloak.png', imgName: 'objects_dark_cloak', imgProportions: [1, 1] },
    { key: 'minotaur_hat_drop', id: 107, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/minotaur_hat.png', imgName: 'objects_minotaur_hat', imgProportions: [1, 1] },
    { key: 'heart_shades_drop', id: 108, category: 'drop', isEphemeral: true, radius: 60, maxHealth: 1, score: 0, imgSrc: './images/accessories/heart_shades.png', imgName: 'objects_heart_shades', imgProportions: [1, 1] },
    { key: 'hearty_essence', id: 120, category: 'drop', isEphemeral: true, stackable: true, stackLimit: 256, radius: 35, maxHealth: 1, score: 0, imgSrc: './images/objects/hearty_essence.png', imgName: 'objects_hearty_essence', imgProportions: [0.9, 2] },
    { key: 'skull', id: 121, category: 'drop', isEphemeral: true, stackable: true, stackLimit: 256, radius: 40, maxHealth: 1, score: 0, imgSrc: './images/objects/skull.png', imgName: 'objects_skull', imgProportions: [1.28, 2] },
    { key: 'golden_skull', id: 122, category: 'drop', isEphemeral: true, stackable: true, stackLimit: 256, radius: 44, maxHealth: 1, score: 0, imgSrc: './images/objects/golden_skull.png', imgName: 'objects_golden_skull', imgProportions: [1.28, 2] }
];

function buildObjectRegistry(definitions) {
    const usedIds = new Set();
    const objects = {};
    const keyToType = {};
    const categoryToTypes = {};
    let nextAutoId = 1;

    const claimNextType = () => {
        while (usedIds.has(nextAutoId)) nextAutoId++;
        if (nextAutoId > 255) {
            throw new Error('Object type overflow: object types must stay within u8 range (1..255).');
        }
        const id = nextAutoId;
        usedIds.add(id);
        nextAutoId++;
        return id;
    };

    for (const definition of definitions) {
        if (!definition || typeof definition !== 'object') continue;
        const { key, id: configuredId, category = 'drop', ...rest } = definition;

        if (!key) {
            throw new Error('Object definition is missing a "key".');
        }
        if (Object.prototype.hasOwnProperty.call(keyToType, key)) {
            throw new Error(`Duplicate object key "${key}" in OBJECT_DEFINITIONS.`);
        }

        let id = configuredId;
        if (!Number.isInteger(id)) {
            id = claimNextType();
        } else {
            if (id < 1 || id > 255) {
                throw new Error(`Invalid object type ${id} for "${key}". Must be 1..255.`);
            }
            if (usedIds.has(id)) {
                throw new Error(`Duplicate object type ${id} for "${key}".`);
            }
            usedIds.add(id);
            if (id >= nextAutoId) nextAutoId = id + 1;
        }

        objects[id] = { ...rest, category };
        keyToType[key] = id;
        if (!categoryToTypes[category]) categoryToTypes[category] = [];
        categoryToTypes[category].push(id);
    }

    for (const category of Object.keys(categoryToTypes)) {
        categoryToTypes[category].sort((a, b) => a - b);
    }

    return { objects, keyToType, categoryToTypes };
}

const objectRegistry = buildObjectRegistry(OBJECT_DEFINITIONS);

export const dataMap = {
    otherImgs: {
        'spawn_zone_shield': { name: 'spawn_zone_shield', src: './images/spawn_zone_shield.png' },
        'water': { name: 'water', src: './images/water.png' },
        'grass': { name: 'grass', src: './images/grass.png' },
        'sand': { name: 'sand', src: './images/sand.png' },
        'magma': { name: 'magma', src: './images/magma.png' },
        'grass_snow': { name: 'grass_snow', src: './images/grass_snow.png' },
        'snow_big_rock': { name: 'snow_big_rock', src: './images/structures/rocks/snow_big_rock.png' },
        'snow_med_rock': { name: 'snow_med_rock', src: './images/structures/rocks/snow_med_rock.png' },
        'snow_small_rock': { name: 'snow_small_rock', src: './images/structures/rocks/snow_small_rock.png' },
        'desert_big_rock': { name: 'desert_big_rock', src: './images/structures/rocks/desert_big_rock.png' },
        'desert_medium_rock': { name: 'desert_medium_rock', src: './images/structures/rocks/desert_medium_rock.png' },
        'desert_small_rock': { name: 'desert_small_rock', src: './images/structures/rocks/desert_small_rock.png' },
        'desert_big_plant': { name: 'desert_big_plant', src: './images/structures/greenery/desert_big_plant.png' },
        'snow_big_plant': { name: 'snow_big_plant', src: './images/structures/greenery/snow_big_plant.png' },
        'magma_big_plant': { name: 'magma_big_plant', src: './images/structures/greenery/magma_big_plant.png' },
        'magma_med_rock': { name: 'magma_med_rock', src: './images/structures/rocks/magma_med_rock.png' },
        'magma_big_rock': { name: 'magma_big_rock', src: './images/structures/rocks/magma_big_rock.png' },
        'magma_small_rock': { name: 'magma_small_rock', src: './images/structures/rocks/magma_small_rock.png' },
        'plank': { name: 'plank', src: './images/objects/plank.png' }
    },
    CHEST_IDS: objectRegistry.categoryToTypes.chest || [],
    COIN_ID: (objectRegistry.categoryToTypes.coin || [])[0] || 0,
    OBJECT_TYPE_BY_KEY: objectRegistry.keyToType,
    SHOP_ITEMS: WEAPON_METADATA_DEFINITIONS
        .filter(def => Number.isFinite(def.shopPrice) && def.shopPrice > 0)
        .sort((a, b) => a.order - b.order)
        .map(def => ({
            id: def.type,
            category: def.category,
            name: def.displayName,
            price: def.shopPrice,
            img: def.key
        })),
    XP_SHOP_ITEMS,
    SPECIAL_SHOP_ITEMS,
    ACCESSORY_COSTS: {
        'bush_cloak': { currency: 'coin', amount: 250 },
        'sunglasses': { currency: 'coin', amount: 150 },
        'pirate_hat': { currency: 'coin', amount: 350 },
        'viking_hat': { currency: 'coin', amount: 450 },
        'alien_antennas': { currency: 'coin', amount: 500 },
        'dark_cloak': { currency: 'coin', amount: 300 },
        'heart_shades': { currency: 'hearty_essence', amount: 15 }
    },
    AUDIO: {
        'throw': { name: 'throw', src: './audios/throw.mp3', defaultTimestamp: 0.3, defaultVolume: 0.3 },
        'sword_slash': { name: 'sword_slash', src: './audios/sword_slash.mp3', defaultTimestamp: 0.6, defaultVolume: 0.2 },
        'hurt': { name: 'hurt', src: './audios/hurt.mp3', defaultTimestamp: 0, defaultVolume: 0.2 },
        'bubble_pop': { name: 'bubble_pop', src: './audios/bubble_pop.mp3', defaultTimestamp: 0, defaultVolume: 0.1 },
        'wood_hit': { name: 'wood_hit', src: './audios/wood_hit.mp3', defaultTimestamp: 0, defaultVolume: 0.3 },
        'coin_collect': { name: 'coin_collect', src: './audios/coin_collect.mp3', defaultTimestamp: 0, defaultVolume: 0.7 },
        'heart_beat': { name: 'heart_beat', src: './audios/heart_beat.mp3', defaultTimestamp: 0, defaultVolume: 0.7, defaultSpeed: 1.5 },
        'slash_clash': { name: 'slash_clash', src: './audios/slash_clash.mp3', defaultTimestamp: 0.7, defaultVolume: 0.15 },
        'electric_sfx1': { name: 'electric_sfx1', src: './audios/electric_sfx1.mp3', defaultTimestamp: 0.1, endTime: 0.7, defaultVolume: 0.5 },
        'ground_impact': { name: 'ground_impact', src: './audios/ground_impact.mp3', defaultTimestamp: 0, defaultVolume: 0.7 },
        'underwater_explosion': { name: 'underwater_explosion', src: './audios/underwater_explosion.mp3', defaultTimestamp: 0, defaultVolume: 0.7 },
        'ui_tap': { name: 'ui_tap', src: './audios/ui_tap.mp3', defaultTimestamp: 0, defaultVolume: 0.4 },
        'wheel_click': { name: 'wheel_click', src: './audios/wheel_click.mp3', defaultTimestamp: 0, defaultVolume: 0.35 },

    },
    sfxMap: [
        0, 'throw', 'sword_slash', 'hurt', 'bubble_pop', 'wood_hit', 'coin_collect', 'heart_beat', 'slash_clash', 'electric_sfx1', 'ground_impact', 'underwater_explosion'
    ],
    UI: {
        'pause_button': { name: 'pause_button', src: './images/ui/pause_button.png' },
        'chat_button': { name: 'chat_button', src: './images/ui/chat_button.png' },
        'settings_gear': { name: 'settings_gear', src: './images/ui/settings_gear.png' },
        'fullscreen_button': { name: 'fullscreen_button', src: './images/ui/fullscreen_button.png' },
        'shopping_cart': { name: 'shopping_cart', src: './images/ui/shopping_cart.png' },
        'loading_background': { name: 'loading_background', src: './images/ui/background.png' },
        'eye': { name: 'eye', src: './images/ui/eye.png' },
        'crossed_eye': { name: 'crossed_eye', src: './images/ui/crossed_eye.png' }
    },
    ACCESSORIES: {
        'bush_cloak': { name: 'bush_cloak', src: './images/accessories/bush_cloak.png', hatOffset: { x: -10, y: -1 }, size: [75, 80], rotation: 0 },
        'sunglasses': { name: 'sunglasses', src: './images/accessories/sunglasses.png', hatOffset: { x: 16, y: -2 }, size: [26, 60], rotation: 0 },
        'pirate_hat': { name: 'pirate_hat', src: './images/accessories/pirate_hat.png', hatOffset: { x: -18, y: -2 }, size: [40, 75], rotation: 0 },
        'viking_hat': { name: 'viking_hat', src: './images/accessories/viking_hat.png', hatOffset: { x: -18, y: -0.5 }, size: [90, 70], rotation: 0 },
        'alien_antennas': { name: 'alien_antennas', src: './images/accessories/alien_antennas.png', hatOffset: { x: -33, y: 0 }, size: [45, 96], rotation: 0, viewRangeMult: 1.5 },
        'dark_cloak': { name: 'dark_cloak', src: './images/accessories/dark_cloak.png', hatOffset: { x: -11, y: 0 }, size: [85, 82], rotation: 0 },
        'minotaur_hat': { name: 'minotaur_hat', src: './images/accessories/minotaur_hat.png', hatOffset: { x: -30, y: 0 }, size: [95, 115], rotation: 0, shopHidden: true },
        'heart_shades': { name: 'heart_shades', src: './images/accessories/heart_shades.png', hatOffset: { x: 16, y: 0 }, size: [30, 60], rotation: 0, displayName: 'Heart Shades' }
    },
    PLAYERS: {
        baseRadius: 30,
        baseMovementSpeed: 17,
        baseStrength: 10,
        baseAttackCooldown: 900,
        baseThrowSwordCooldown: 1500,
        maxHealth: 100,
        imgs: { '1': { name: 'player_default', src: './images/player/player_default.png' } }
    },
    SWORDS: {
        'imgs': {
            '0': { category: 'sword', name: 'swords_bone', src: './images/swords/bone.png', size: [100, 50], offset: { x: 0, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 100, swordHeight: 50 },
            '1': { category: 'sword', name: 'swords_bone', src: './images/swords/bone.png', size: [100, 50], offset: { x: -5, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 100, swordHeight: 50 },
            '2': { category: 'sword', name: 'swords_sword1', src: './images/swords/sword1.png', size: [105, 35], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 105, swordHeight: 35 },
            '3': { category: 'sword', name: 'swords_sword2', src: './images/swords/sword2.png', size: [120, 35], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 120, swordHeight: 35 },
            '4': { category: 'sword', name: 'swords_sword3', src: './images/swords/sword3.png', size: [135, 35], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 135, swordHeight: 35 },
            '5': { category: 'sword', name: 'swords_sword4', src: './images/swords/sword4.png', size: [150, 20], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 150, swordHeight: 20 },
            '6': { category: 'sword', name: 'swords_sword5', src: './images/swords/sword5.png', size: [165, 60], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 165, swordHeight: 60 },
            '7': { category: 'sword', name: 'swords_sword6', src: './images/swords/sword6.png', size: [180, 50], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 180, swordHeight: 50 },
            '8': { category: 'sword', name: 'swords_sword7', src: './images/swords/sword7.png', size: [195, 30], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 195, swordHeight: 30 },
            '9': { category: 'sword', name: 'swords_sword8', src: './images/swords/sword8.png', size: [210, 60], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 210, swordHeight: 60 },
            '10': { category: 'sword', name: 'swords_sword9', src: './images/swords/sword9.png', size: [225, 60], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 225, swordHeight: 60 },
            '11': { category: 'sword', name: 'swords_sword10', src: './images/swords/sword10.png', size: [240, 53], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 240, swordHeight: 53 },
            '12': { category: 'sword', name: 'swords_sword11', src: './images/swords/sword11.png', size: [255, 56], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 255, swordHeight: 56 },
            '13': { category: 'sword', name: 'swords_sword12', src: './images/swords/sword12.png', size: [300, 65], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 300, swordHeight: 65 },
        }
    },
    SPEARS: {
        'imgs': {
            '14': { category: 'spear', name: 'spears_spear1', src: './images/spears/spear1.png', size: [165, 30], offset: { x: 46, y: -9 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 165, swordHeight: 30 },
            '15': { category: 'spear', name: 'spears_spear2', src: './images/spears/spear2.png', size: [182, 30], offset: { x: 51, y: -9 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 182, swordHeight: 30 },
            '16': { category: 'spear', name: 'spears_spear3', src: './images/spears/spear3.png', size: [199, 32], offset: { x: 56, y: -10 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 199, swordHeight: 32 },
            '17': { category: 'spear', name: 'spears_spear4', src: './images/spears/spear4.png', size: [216, 35], offset: { x: 60, y: -11 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 216, swordHeight: 35 },
            '18': { category: 'spear', name: 'spears_spear5', src: './images/spears/spear5.png', size: [233, 37], offset: { x: 65, y: -11 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 233, swordHeight: 37 },
            '19': { category: 'spear', name: 'spears_spear6', src: './images/spears/spear6.png', size: [250, 40], offset: { x: 70, y: -12 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 250, swordHeight: 40 },
            '24': { category: 'spear', name: 'spears_spear7', src: './images/spears/spear7.png', size: [267, 43], offset: { x: 75, y: -13 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 267, swordHeight: 43 },
            '25': { category: 'spear', name: 'spears_spear8', src: './images/spears/spear8.png', size: [284, 45], offset: { x: 80, y: -14 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 284, swordHeight: 45 },
            '26': { category: 'spear', name: 'spears_spear9', src: './images/spears/spear9.png', size: [301, 48], offset: { x: 84, y: -14 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 301, swordHeight: 48 },
            '27': { category: 'spear', name: 'spears_spear10', src: './images/spears/spear10.png', size: [318, 80], offset: { x: 89, y: -15 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 318, swordHeight: 80 },
            '28': { category: 'spear', name: 'spears_spear11', src: './images/spears/spear11.png', size: [335, 54], offset: { x: 94, y: -16 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 335, swordHeight: 54 },
            '29': { category: 'spear', name: 'spears_spear12', src: './images/spears/spear12.png', size: [352, 80], offset: { x: 99, y: -17 }, renderTuning: { rotationOffset: 0, sideOffset: 0.35, forwardOffset: 0.08 }, swordWidth: 352, swordHeight: 80 },
        }
    },
    AXES: {
        'imgs': {
            '30': { category: 'axe', name: 'axes_axe1', src: './images/axes/axe1.png', size: [120, 55], offset: { x: -4, y: -5 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 120, swordHeight: 55 },
            '31': { category: 'axe', name: 'axes_axe2', src: './images/axes/axe2.png', size: [135, 59], offset: { x: -4, y: -5 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 135, swordHeight: 59 },
            '32': { category: 'axe', name: 'axes_axe3', src: './images/axes/axe3.png', size: [150, 66], offset: { x: -4, y: -5 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 150, swordHeight: 66 },
            '33': { category: 'axe', name: 'axes_axe4', src: './images/axes/axe4.png', size: [165, 73], offset: { x: -4, y: -13 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 165, swordHeight: 73 },
            '34': { category: 'axe', name: 'axes_axe5', src: './images/axes/axe5.png', size: [180, 79], offset: { x: -4, y: -5 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 180, swordHeight: 79 },
            '35': { category: 'axe', name: 'axes_axe6', src: './images/axes/axe6.png', size: [195, 86], offset: { x: -4, y: -15 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 195, swordHeight: 86 },
            '36': { category: 'axe', name: 'axes_axe7', src: './images/axes/axe7.png', size: [210, 92], offset: { x: -4, y: -15 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 210, swordHeight: 92 },
            '37': { category: 'axe', name: 'axes_axe8', src: './images/axes/axe8.png', size: [225, 99], offset: { x: -4, y: -25 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 225, swordHeight: 99 },
            '38': { category: 'axe', name: 'axes_axe9', src: './images/axes/axe9.png', size: [240, 106], offset: { x: -4, y: -25 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 240, swordHeight: 106 },
            '39': { category: 'axe', name: 'axes_axe10', src: './images/axes/axe10.png', size: [255, 112], offset: { x: -4, y: -25 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 255, swordHeight: 112 },
            '40': { category: 'axe', name: 'axes_axe11', src: './images/axes/axe11.png', size: [270, 119], offset: { x: -10, y: -35 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 270, swordHeight: 119 },
            '41': { category: 'axe', name: 'axes_axe12', src: './images/axes/axe12.png', size: [285, 125], offset: { x: -20, y: -60 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 285, swordHeight: 125 },
        }
    },
    BOOMERANGS: {
        'imgs': {
            '42': { category: 'boomerang', name: 'boomerangs_boomerang1', src: './images/boomerangs/boomerang1.png', size: [78, 64], offset: { x: -2, y: -3 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 78, swordHeight: 64 },
            '43': { category: 'boomerang', name: 'boomerangs_boomerang2', src: './images/boomerangs/boomerang2.png', size: [86, 70], offset: { x: -2, y: -3 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 86, swordHeight: 70 },
            '44': { category: 'boomerang', name: 'boomerangs_boomerang3', src: './images/boomerangs/boomerang3.png', size: [94, 76], offset: { x: -2, y: -4 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 94, swordHeight: 76 },
            '45': { category: 'boomerang', name: 'boomerangs_boomerang4', src: './images/boomerangs/boomerang4.png', size: [102, 82], offset: { x: -3, y: -4 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 102, swordHeight: 82 },
            '46': { category: 'boomerang', name: 'boomerangs_boomerang5', src: './images/boomerangs/boomerang5.png', size: [110, 88], offset: { x: -3, y: -4 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 110, swordHeight: 88 },
            '47': { category: 'boomerang', name: 'boomerangs_boomerang6', src: './images/boomerangs/boomerang6.png', size: [118, 94], offset: { x: -3, y: -5 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 118, swordHeight: 94 },
            '48': { category: 'boomerang', name: 'boomerangs_boomerang7', src: './images/boomerangs/boomerang7.png', size: [126, 100], offset: { x: -3, y: -5 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 126, swordHeight: 100 },
            '49': { category: 'boomerang', name: 'boomerangs_boomerang8', src: './images/boomerangs/boomerang8.png', size: [134, 106], offset: { x: -4, y: -5 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 134, swordHeight: 106 },
            '50': { category: 'boomerang', name: 'boomerangs_boomerang9', src: './images/boomerangs/boomerang9.png', size: [142, 112], offset: { x: -4, y: -6 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 142, swordHeight: 112 },
            '51': { category: 'boomerang', name: 'boomerangs_boomerang10', src: './images/boomerangs/boomerang10.png', size: [150, 118], offset: { x: -4, y: -6 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 150, swordHeight: 118 },
            '52': { category: 'boomerang', name: 'boomerangs_boomerang11', src: './images/boomerangs/boomerang11.png', size: [158, 124], offset: { x: -4, y: -6 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 158, swordHeight: 124 },
            '53': { category: 'boomerang', name: 'boomerangs_boomerang12', src: './images/boomerangs/boomerang12.png', size: [170, 132], offset: { x: -5, y: -7 }, renderTuning: { rotationOffset: -0.35, sideOffset: 0, forwardOffset: 0 }, swordWidth: 170, swordHeight: 132 },
        }
    },
    MOBS: {
        '1': { radius: 25, speed: 7, baseHealth: 15, score: 10, alarmDuration: 5000, imgProportions: [2, 2], imgSrc: './images/mobs/chick.png', imgName: 'mobs_chick', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '2': { radius: 35, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 2], imgSrc: './images/mobs/pig.png', imgName: 'mobs_pig', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '3': { radius: 60, speed: 7, baseHealth: 150, score: 75, isNeutral: true, alarmDuration: Infinity, damage: 15, imgProportions: [3, 2.5], imgSrc: './images/mobs/cow.png', imgName: 'mobs_cow', deathAction: (killer) => { const maxScore = 400; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '4': { radius: 45, speed: 9, baseHealth: 50, score: 10, alarmDuration: 10000, imgProportions: [2, 2], imgSrc: './images/mobs/hearty.png', imgName: 'mobs_hearty', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1); killer.health = Math.min(killer.health + 50, killer.maxHealth) } },
        '5': { radius: 65, speed: 9, baseHealth: 250, score: 150, isNeutral: true, alarmDuration: 10000, damage: 15, imgProportions: [3, 2.5], imgSrc: './images/mobs/polar_bear.png', imgName: 'mobs_polar_bear', deathAction: (killer) => { const maxScore = 700; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '6': { radius: 73, speed: 7, baseHealth: 600, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/minotaur.png', imgName: 'mobs_minotaur', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '7': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/root_walker.png', imgName: 'mobs_root_walker', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '8': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/the_yeti.png', imgName: 'mobs_the_yeti', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '9': { radius: 25, speed: 7, baseHealth: 15, score: 10, alarmDuration: 5000, imgProportions: [2, 2], imgSrc: './images/mobs/bunny.png', imgName: 'mobs_bunny', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '10': { radius: 50, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 2], imgSrc: './images/mobs/iguana.png', imgName: 'mobs_iguana', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '11': { radius: 35, speed: 7, baseHealth: 50, score: 25, isNeutral: true, alarmDuration: 5000, damage: 10, imgProportions: [3.75, 2], imgSrc: './images/mobs/fox.png', imgName: 'mobs_fox', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '12': { radius: 45, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 3], imgSrc: './images/mobs/ostrich.png', imgName: 'mobs_ostrich', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '13': { radius: 100, speed: 10, baseHealth: 300, score: 200, isNeutral: true, alarmDuration: 10000, damage: 18, imgProportions: [3, 2.25], imgSrc: './images/mobs/elephant.png', imgName: 'mobs_elephant', deathAction: (killer) => { const maxScore = 850; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '14': { radius: 20, speed: 8, baseHealth: 15, score: 5, alarmDuration: 5000, imgProportions: [2.5, 2], imgSrc: './images/mobs/rat.png', imgName: 'mobs_rat', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '15': { radius: 20, speed: 2, baseHealth: 15, score: 20, alarmDuration: 5000, imgProportions: [2.5, 2], imgSrc: './images/mobs/tortoise.png', imgName: 'mobs_tortoise', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '16': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/dune_behemoth.png', imgName: 'mobs_dune_behemoth', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '17': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/inferno_beast.png', imgName: 'mobs_inferno_beast', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '18': { radius: 45, speed: 9, baseHealth: 50, score: 10, isNeutral: true, alarmDuration: 15000, damage: 7, imgProportions: [2, 3], imgSrc: './images/mobs/sandling.png', imgName: 'mobs_sandling', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } }
    },
    PROJECTILES: {
        '13': { radius: 30, speed: 100, damage: 20, maxDistance: 500, knockbackStrength: 25, imgProportions: [10, 2.5], imgSrc: './images/projectiles/lightning_black_red.png', imgName: 'projectiles_lightning_black_red'},
        '14': { radius: 30, speed: 100, damage: 35, maxDistance: 500, knockbackStrength: 25, imgProportions: [10, 2.5], imgSrc: './images/projectiles/lightning.png', imgName: 'projectiles_lightning'},
        '15': { radius: 14, speed: 60, damage: 20, maxDistance: 1100, knockbackStrength: 15, imgProportions: [7, 1.2], imgSrc: './images/projectiles/icicle_shard.png', imgName: 'projectiles_icicle_shard'},
        '16': { radius: 45, speed: 42, damage: 10, maxDistance: 850, knockbackStrength: 35, imgProportions: [2, 2], imgSrc: './images/projectiles/snowball.png', imgName: 'projectiles_snowball'}
    },
    ATTACK_PROJECTILES: WEAPON_ATTACK_PROJECTILES,
    STRUCTURES: {
        '1': {
            radius: 750,
            isSafeZone: true,
            noCollisions: true,
            safeZoneHalfSize: 330,
            bridgeCount: 5,
            bridgeHalfHeight: 80,
            diagonalBridgeHalfWidth: 80,
            bridgeColor: 'rgba(120, 85, 48, 0.96)',
            safeZoneColor: 'rgba(150, 108, 62, 0.96)',
            safeZoneBorderColor: 'rgba(84, 57, 30, 1)',
            imgSrc: './images/spawn_zone.png',
            imgName: 'structures_spawn_zone'
        },
        '2': { radius: 150, imgSrc: './images/structures/rocks/grass_med_rock.png', imgName: 'structures_grass_med_rock' },
        '3': { radius: 200, noCollisions: true, imgSrc: './images/structures/greenery/grass_big_plant.png', imgName: 'structures_grass_big_plant' },
        '4': { radius: 160, noCollisions: true, imgSrc: './images/structures/shrines/root_walker_shrine.png', imgName: 'structures_root_walker_shrine', reservedSpawnRadius: 600 },
        '5': { radius: 180, noCollisions: true, imgSrc: './images/structures/shrines/root_walker_shrine.png', imgName: 'structures_root_walker_portal' },
        '6': { radius: 230, imgSrc: './images/structures/rocks/grass_big_rock.png', imgName: 'structures_grass_big_rock' },
        '7': { radius: 60, imgSrc: './images/structures/rocks/grass_small_rock.png', imgName: 'structures_grass_small_rock' },
        '8': { radius: 160, noCollisions: true, imgSrc: './images/structures/shrines/the_yeti_shrine.png', imgName: 'structures_the_yeti_shrine', reservedSpawnRadius: 600 },
        '9': { radius: 160, noCollisions: true, imgSrc: './images/structures/shrines/inferno_beast_shrine.png', imgName: 'structures_inferno_beast_shrine', reservedSpawnRadius: 600 },
        '10': { radius: 160, noCollisions: true, imgSrc: './images/structures/shrines/dune_behemoth_shrine.png', imgName: 'structures_desert_shrine', reservedSpawnRadius: 600 }
    },
    OBJECTS: objectRegistry.objects
};

export const ROCK_STRUCTURE_TYPES = new Set([2, 6, 7]);
export function isRockStructureType(type) {
    return ROCK_STRUCTURE_TYPES.has(Number(type));
}

export function getBiomeQuadrantForPosition(x, y, mapSize) {
    const width = Math.max(1, Number(mapSize?.[0]) || 1);
    const height = Math.max(1, Number(mapSize?.[1]) || 1);
    const isRight = x >= (width * 0.53);
    const isBottom = y >= (height * 0.53);
    if (isRight) return isBottom ? 'br' : 'tr';
    return isBottom ? 'bl' : 'tl';
}

export function getStructureImageName(type, x, y, mapSize, world = 'main') {
    const numericType = Number(type);
    const defaultImgName = dataMap.STRUCTURES?.[numericType]?.imgName;
    if (!defaultImgName) return defaultImgName;
    if (worldIsSnowOnly(world)) {
        if (numericType === 3) return 'snow_big_plant';
        if (numericType === 6) return 'snow_big_rock';
        if (numericType === 7) return 'snow_small_rock';
        if (numericType === 2) return 'snow_med_rock';
        return defaultImgName;
    }
    if (worldIsDesertOnly(world)) {
        if (numericType === 3) return 'desert_big_plant';
        if (numericType === 6) return 'desert_big_rock';
        if (numericType === 7) return 'desert_small_rock';
        if (numericType === 2) return 'desert_medium_rock';
        return defaultImgName;
    }
    if (worldIsMagmaOnly(world)) {
        if (numericType === 3) return 'magma_big_plant';
        if (numericType === 6) return 'magma_big_rock';
        if (numericType === 7) return 'magma_small_rock';
        if (numericType === 2) return 'magma_med_rock';
        return defaultImgName;
    }
    if (worldIsGrassOnly(world)) return defaultImgName;

    const quadrant = getBiomeQuadrantForPosition(x, y, mapSize);
    if (numericType === 3) {
        if (quadrant === 'bl') return 'desert_big_plant';
        if (quadrant === 'tr') return 'snow_big_plant';
        if (quadrant === 'br') return 'magma_big_plant';
        return defaultImgName;
    }
    if (!isRockStructureType(numericType)) return defaultImgName;
    if (quadrant === 'bl') {
        if (numericType === 6) return 'desert_big_rock';
        if (numericType === 7) return 'desert_small_rock';
        return 'desert_medium_rock';
    }
    if (quadrant === 'tr') {
        if (numericType === 6) return 'snow_big_rock';
        if (numericType === 7) return 'snow_small_rock';
        return 'snow_med_rock';
    }
    if (quadrant === 'br') {
        if (numericType === 6) return 'magma_big_rock';
        if (numericType === 7) return 'magma_small_rock';
        return 'magma_med_rock';
    }
    return defaultImgName;
}

export const ACCESSORY_KEYS = ['none', ...Object.keys(dataMap.ACCESSORIES)];
export const ACCESSORY_NAME_TO_ID = ACCESSORY_KEYS.reduce((acc, name, idx) => {
    acc[name] = idx;
    return acc;
}, {});

function ensureMutableWeaponSize(config) {
    if (!config || typeof config !== 'object') return config;

    let width = 100;
    let height = 50;
    if (Array.isArray(config.size)) {
        width = Math.max(1, Number(config.size[0]) || width);
        height = Math.max(1, Number(config.size[1]) || height);
    } else {
        width = Math.max(1, Number(config.swordWidth) || width);
        height = Math.max(1, Number(config.swordHeight) || height);
    }

    const setWidth = (next) => {
        width = Math.max(1, Number(next) || width);
    };
    const setHeight = (next) => {
        height = Math.max(1, Number(next) || height);
    };

    Object.defineProperty(config, 'size', {
        configurable: true,
        enumerable: true,
        get() {
            return [width, height];
        },
        set(next) {
            if (Array.isArray(next)) {
                setWidth(next[0]);
                setHeight(next[1]);
            }
        }
    });

    Object.defineProperty(config, 'swordWidth', {
        configurable: true,
        enumerable: true,
        get() {
            return width;
        },
        set(next) {
            setWidth(next);
        }
    });

    Object.defineProperty(config, 'swordHeight', {
        configurable: true,
        enumerable: true,
        get() {
            return height;
        },
        set(next) {
            setHeight(next);
        }
    });

    return config;
}

function getWeaponDropPickupRadius(weaponType) {
    const [width, height] = getWeaponSize(weaponType);
    // Use an area-equivalent circle so long and short weapons get distinct
    // pickup hitboxes without becoming as large as their full bounding box.
    return Math.max(24, Math.round(Math.sqrt((width * height) / Math.PI)));
}

for (const config of Object.values(dataMap.SWORDS?.imgs || {})) {
    ensureMutableWeaponSize(config);
}
for (const config of Object.values(dataMap.SPEARS?.imgs || {})) {
    ensureMutableWeaponSize(config);
}
for (const config of Object.values(dataMap.AXES?.imgs || {})) {
    ensureMutableWeaponSize(config);
}
for (const config of Object.values(dataMap.BOOMERANGS?.imgs || {})) {
    ensureMutableWeaponSize(config);
}

export const ACCESSORY_DESCRIPTIONS = {
    'bush_cloak': 'Passive: Melee attacks poison living entities you hit. Active: Poison Blast (F) Poisons entities near you.',
    'sunglasses': 'Active: Invisibility (F) Become invisible for 5s.',
    'pirate_hat': 'Passive: Chests you break drop 20% more coins. Active: Stamina Boost (F) lowers your swing cooldown.',
    'viking_hat': 'Passive: On a 3 hit combo, you do 30% more damage. Active: Growth Spurt (F) doubles your size for 8s.',
    'alien_antennas': 'Passive: +50% view range. Active: Lightning Shot (F) to strike a target point.',
    'dark_cloak': 'Passive: Mobs struggle to spot you. Active: Smoke Blast (F) blinds nearby entities for 8s.',
    'minotaur_hat': 'Passive: 20% damage reduction. Active: Energy Burst (F) emits waves of energy around your player!',
    'heart_shades': 'Passive: Regen ticks 30% faster. Active: Burst Heal (F) restores 50% max HP (up to full) and boosts regen tick speed to 60% faster for 3s.'
};
export const ACCESSORY_ITEM_OFFSET = 100;

export function isAccessoryId(id) {
    return Number.isInteger(id) && id >= 0 && id < ACCESSORY_KEYS.length;
}

export function accessoryItemTypeFromId(id) {
    if (!isAccessoryId(id) || id === 0) return 0;
    return ACCESSORY_ITEM_OFFSET + id;
}

export function accessoryIdFromItemType(type) {
    return type - ACCESSORY_ITEM_OFFSET;
}

export function isAccessoryItemType(type) {
    return Number.isInteger(type) &&
        type >= ACCESSORY_ITEM_OFFSET + 1 &&
        type < ACCESSORY_ITEM_OFFSET + ACCESSORY_KEYS.length;
}

const XP_SHOP_ID_SET = new Set(XP_SHOP_ITEMS.map(item => item.id));
const XP_SHOP_BY_ID = new Map(XP_SHOP_ITEMS.map(item => [item.id, item]));

export function isXpShopItemType(type) {
    return XP_SHOP_ID_SET.has(type);
}

export function getXpShopItemConfig(type) {
    return XP_SHOP_BY_ID.get(type) || null;
}

export function getWeaponConfig(weaponType) {
    return dataMap.BOOMERANGS.imgs[weaponType]
        || dataMap.AXES.imgs[weaponType]
        || dataMap.SPEARS.imgs[weaponType]
        || dataMap.SWORDS.imgs[weaponType]
        || dataMap.SWORDS.imgs[1]
        || dataMap.SWORDS.imgs[0]
        || {};
}

export function getWeaponCategory(weaponType) {
    return getWeaponConfig(weaponType).category || 'sword';
}

export function getWeaponSize(weaponType) {
    const weapon = getWeaponConfig(weaponType);
    const size = Array.isArray(weapon.size) ? weapon.size : [weapon.swordWidth || 100, weapon.swordHeight || 50];
    return [
        Math.max(1, Number(size[0]) || 100),
        Math.max(1, Number(size[1]) || 50)
    ];
}

export function getWeaponOffset(weaponType) {
    const weapon = getWeaponConfig(weaponType);
    const offset = weapon.offset || {};
    return {
        x: Number(offset.x) || 0,
        y: Number(offset.y) || 0
    };
}

export function getWeaponRenderTuning(weaponType) {
    const weapon = getWeaponConfig(weaponType);
    const tuning = weapon.renderTuning || {};
    return {
        rotationOffset: Number(tuning.rotationOffset) || 0,
        sideOffset: Number(tuning.sideOffset) || 0,
        forwardOffset: Number(tuning.forwardOffset) || 0
    };
}

export function getSwordSize(weaponType) {
    return getWeaponSize(weaponType);
}

export function getSwordOffset(weaponType) {
    return getWeaponOffset(weaponType);
}

export const SWORD_IDS = Object.keys(dataMap.SWORDS.imgs)
    .map(k => parseInt(k))
    .filter(id => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);

export const SPEAR_IDS = Object.keys(dataMap.SPEARS.imgs)
    .map(k => parseInt(k))
    .filter(id => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);

export const AXE_IDS = Object.keys(dataMap.AXES.imgs)
    .map(k => parseInt(k))
    .filter(id => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);

export const BOOMERANG_IDS = Object.keys(dataMap.BOOMERANGS.imgs)
    .map(k => parseInt(k))
    .filter(id => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);

export const WEAPON_IDS = [...new Set([...SWORD_IDS, ...SPEAR_IDS, ...AXE_IDS, ...BOOMERANG_IDS])].sort((a, b) => a - b);
export const WEAPON_TYPES = WEAPON_TYPE_BY_KEY;

for (const weaponType of WEAPON_IDS) {
    const objectConfig = dataMap.OBJECTS?.[weaponType];
    if (!objectConfig?.isEphemeral) continue;
    objectConfig.radius = getWeaponDropPickupRadius(weaponType);
}

const WEAPON_ID_SET = new Set(WEAPON_IDS);
const SWORD_ID_SET = new Set(SWORD_IDS);
const SPEAR_ID_SET = new Set(SPEAR_IDS);
const AXE_ID_SET = new Set(AXE_IDS);
const BOOMERANG_ID_SET = new Set(BOOMERANG_IDS);
const CHEST_ID_SET = new Set(dataMap.CHEST_IDS);

export function isWeaponType(weaponType) {
    return WEAPON_ID_SET.has(weaponType);
}

export function isWeaponRank(weaponType) {
    return isWeaponType(weaponType);
}

export function isSwordType(weaponType) {
    return SWORD_ID_SET.has(weaponType);
}

export function isSwordRank(weaponType) {
    return isSwordType(weaponType);
}

export function isSpearType(weaponType) {
    return SPEAR_ID_SET.has(weaponType);
}

export function isSpearRank(weaponType) {
    return isSpearType(weaponType);
}

export function isAxeType(weaponType) {
    return AXE_ID_SET.has(weaponType);
}

export function isAxeRank(weaponType) {
    return isAxeType(weaponType);
}

export function isBoomerangType(weaponType) {
    return BOOMERANG_ID_SET.has(weaponType);
}

export function isBoomerangRank(weaponType) {
    return isBoomerangType(weaponType);
}

export function getWeaponMeta(weaponType) {
    return WEAPON_METADATA_BY_TYPE.get(weaponType) || null;
}

export function getWeaponOrder(weaponType) {
    if (!isWeaponType(weaponType)) return 0;
    return getWeaponMeta(weaponType)?.order || 0;
}

export function isWeaponTypeStronger(candidateType, currentType) {
    return getWeaponOrder(candidateType) > getWeaponOrder(currentType);
}

export function getWeaponDisplayName(weaponType) {
    return getWeaponMeta(weaponType)?.displayName || '';
}

export function getWeaponShopPrice(weaponType) {
    const price = getWeaponMeta(weaponType)?.shopPrice;
    return Number.isFinite(price) && price > 0 ? Math.floor(price) : 0;
}

export function getWeaponSellPrice(weaponType) {
    const price = getWeaponMeta(weaponType)?.sellPrice;
    return Number.isFinite(price) && price > 0 ? Math.floor(price) : 0;
}

export function getWeaponProjectileType(weaponType) {
    return getWeaponMeta(weaponType)?.projectileType || 0;
}

export function getWeaponTypeByProjectileType(projectileType) {
    return WEAPON_TYPE_BY_PROJECTILE_TYPE.get(projectileType) || 0;
}

export function isWeaponProjectileType(projectileType) {
    return WEAPON_TYPE_BY_PROJECTILE_TYPE.has(projectileType);
}

export function getWeaponAttackStats(weaponType) {
    const attack = getWeaponMeta(weaponType)?.attack;
    return attack || null;
}

export function getStrongestInventoryWeaponDamage(inventory = [], inventoryCounts = []) {
    let bestDamage = 0;
    for (let i = 0; i < inventory.length; i++) {
        if ((inventoryCounts[i] || 0) <= 0) continue;
        const rank = (inventory[i] || 0) & 0x7F;
        if (!isWeaponRank(rank)) continue;
        const damage = Number(getWeaponAttackStats(rank)?.damage) || 0;
        if (damage > bestDamage) bestDamage = damage;
    }
    return bestDamage;
}

export const getStrongestInventorySwordDamage = getStrongestInventoryWeaponDamage;

export function getBossPortalEntryBlockMessage({ score = 0, inventory = [], inventoryCounts = [] } = {}) {
    if ((Number(score) || 0) < BOSS_PORTAL_MIN_SCORE) return BOSS_PORTAL_LOW_SCORE_MESSAGE;

    const requiredDamage = Number(getWeaponAttackStats(BOSS_PORTAL_MIN_SWORD_TYPE)?.damage) || 0;
    if (getStrongestInventoryWeaponDamage(inventory, inventoryCounts) < requiredDamage) {
        return BOSS_PORTAL_LOW_WEAPON_MESSAGE;
    }

    return '';
}

export function getProjectileVisualConfig(projectileType) {
    if (isWeaponProjectileType(projectileType)) {
        const weaponType = getWeaponTypeByProjectileType(projectileType);
        return getWeaponAttackStats(weaponType) || null;
    }
    return dataMap.PROJECTILES[projectileType] || null;
}

export function getWeaponTypesInOrder({ shopOnly = false } = {}) {
    return WEAPON_METADATA_DEFINITIONS
        .filter(def => !shopOnly || getWeaponShopPrice(def.type) > 0)
        .sort((a, b) => a.order - b.order)
        .map(def => def.type);
}

export function getNextWeaponType(currentType, { shopOnly = false, maxType = 0 } = {}) {
    const types = getWeaponTypesInOrder({ shopOnly });
    const maxOrder = maxType > 0 ? getWeaponOrder(maxType) : Infinity;
    const currentOrder = getWeaponOrder(currentType);
    for (const weaponType of types) {
        const order = getWeaponOrder(weaponType);
        if (order <= currentOrder) continue;
        if (order > maxOrder) break;
        return weaponType;
    }
    return 0;
}

export function getWeaponSwingStepCount(weaponType) {
    if (isSpearType(weaponType)) return SPEAR_FORWARD_SWING_STEPS + SPEAR_RETRACT_SWING_STEPS;
    return 6;
}

export function isSpearForwardSwingState(weaponType, swingState) {
    return isSpearType(weaponType) && swingState > 0 && swingState <= SPEAR_FORWARD_SWING_STEPS;
}

export function getSpearThrustProgress(weaponType, swingState) {
    if (!isSpearType(weaponType) || swingState <= 0) return 0;
    if (swingState <= SPEAR_FORWARD_SWING_STEPS) {
        return Math.max(0, Math.min(1, swingState / SPEAR_FORWARD_SWING_STEPS));
    }
    const retractStep = swingState - SPEAR_FORWARD_SWING_STEPS;
    const remaining = SPEAR_RETRACT_SWING_STEPS - retractStep;
    return Math.max(0, Math.min(1, remaining / SPEAR_RETRACT_SWING_STEPS));
}

export function getObjectTypeByKey(key) {
    return dataMap.OBJECT_TYPE_BY_KEY[key] || 0;
}

export function resolveObjectType(typeOrKey) {
    if (Number.isInteger(typeOrKey)) return typeOrKey;
    if (typeof typeOrKey === 'string') return getObjectTypeByKey(typeOrKey);
    return 0;
}

export function getCoinObjectType() {
    return dataMap.COIN_ID;
}

export function isCoinObjectType(type) {
    return type === dataMap.COIN_ID;
}

export function getChestObjectTypes() {
    return dataMap.CHEST_IDS.slice();
}

export function isChestObjectType(type) {
    return CHEST_ID_SET.has(type);
}

export function isSellableItem(type) {
    return isWeaponRank(type) || isAccessoryItemType(type);
}

export function getLevelFromXp(xp) {
    let remaining = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
    let level = 1;
    while (level < MAX_LEVEL && remaining >= xpForLevel(level)) {
        remaining -= xpForLevel(level);
        level++;
    }
    return level;
}

if (typeof window !== 'undefined') {
    window.datamap = dataMap;
}
