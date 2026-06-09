import { worldIsGrassOnly, worldIsSnowOnly, worldIsDesertOnly, worldIsMagmaOnly } from './worlds.js';

export const TPS = {
    clientReal: 0,
    clientCapped: 75,
    server: 20
};

export const DEFAULT_VIEW_RANGE_MULT = 2 / 3;
export const MAX_LEVEL = 30;
export const BOSS_PORTAL_MIN_SCORE = 1000;
export const BOSS_PORTAL_MIN_SWORD_TYPE = 4;
export const BOSS_PORTAL_LOW_SCORE_MESSAGE = 'You are not experienced enough!';
export const BOSS_PORTAL_LOW_WEAPON_MESSAGE = "Your weapon isn't powerful enough!";
export const PLANT_SPEAR_RANK = 5;
export const PLANT_SPEAR_V2_TYPE = 15;
export const SPEAR_FORWARD_SWING_STEPS = 6;
export const SPEAR_RETRACT_SWING_STEPS = 6;
export const xpForLevel = (level) => Math.floor(100 * 1.3 ** (Math.max(1, level | 0) - 1));
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
const PLANT_SPEAR_CONFIG = {
    category: 'spear',
    name: 'spears_plant_spear_v1',
    src: './images/spears/plant_spear_v1.png',
    size: [170, 43],
    offset: { x: 42, y: -13 },
    renderTuning: {
        rotationOffset: 0,
        sideOffset: 0.35,
        forwardOffset: 0.08
    },
    swordWidth: 170,
    swordHeight: 43
};

const PLANT_SPEAR_V2_CONFIG = {
    category: 'spear',
    name: 'spears_plant_spear_v2',
    src: './images/spears/plant_spear_v2.png',
    size: [350, 88],
    offset: { x: 74, y: -32 },
    renderTuning: {
        rotationOffset: 0,
        sideOffset: 0.35,
        forwardOffset: 0.08
    },
    swordWidth: 350,
    swordHeight: 88
};

const WEAPON_METADATA_DEFINITIONS = [
    { type: 1, category: 'sword', key: 'bone', displayName: 'Bone', order: 1, shopPrice: 30, sellPrice: 15, projectileType: 41, attack: { radius: 10, speed: 30, damage: 3, maxDistance: 100, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_bone.png', imgName: 'projectiles_slash_attack_bone' } },
    { type: 2, category: 'sword', key: 'branch', displayName: 'Branch', order: 2, shopPrice: 50, sellPrice: 25, projectileType: 42, attack: { radius: 10, speed: 35, damage: 5, maxDistance: 110, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_branch.png', imgName: 'projectiles_slash_attack_branch' } },
    { type: 3, category: 'sword', key: 'iron_dagger', displayName: 'Iron Dagger', order: 3, shopPrice: 80, sellPrice: 40, projectileType: 43, attack: { radius: 10, speed: 40, damage: 8, maxDistance: 120, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_iron_dagger.png', imgName: 'projectiles_slash_attack_iron_dagger' } },
    { type: 4, category: 'sword', key: 'icicle_blade_v1', displayName: 'Icicle Blade V1', order: 4, shopPrice: 150, sellPrice: 75, projectileType: 44, attack: { radius: 10, speed: 45, damage: 12, maxDistance: 130, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_icicle_blade_v1.png', imgName: 'projectiles_slash_attack_icicle_blade_v1' } },
    { type: 5, category: 'spear', key: 'plant_spear_v1', displayName: 'Plant Spear V1', order: 5, shopPrice: 175, sellPrice: 87, projectileType: 45, attack: { radius: 10, speed: 50, damage: 14, maxDistance: 140, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_branch.png', imgName: 'projectiles_slash_attack_plant_spear_v1' } },
    { type: 6, category: 'sword', key: 'iron_axe', displayName: 'Iron Axe', order: 6, shopPrice: 200, sellPrice: 100, projectileType: 46, attack: { radius: 10, speed: 55, damage: 16, maxDistance: 150, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_iron_axe.png', imgName: 'projectiles_slash_attack_iron_axe' } },
    { type: 7, category: 'sword', key: 'iron_saber', displayName: 'Iron Saber', order: 7, shopPrice: 250, sellPrice: 125, projectileType: 47, attack: { radius: 10, speed: 60, damage: 19, maxDistance: 170, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_iron_saber.png', imgName: 'projectiles_slash_attack_iron_saber' } },
    { type: 8, category: 'sword', key: 'minotaur_axe_v1', displayName: 'Minotaur Axe V1', order: 8, shopPrice: 315, sellPrice: 157, projectileType: 48, attack: { radius: 10, speed: 65, damage: 22, maxDistance: 180, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_minotaur_axe_v1.png', imgName: 'projectiles_slash_attack_minotaur_axe_v1' } },
    { type: 9, category: 'sword', key: 'iron_scythe', displayName: 'Iron Scythe', order: 9, shopPrice: 375, sellPrice: 187, projectileType: 49, attack: { radius: 15, speed: 70, damage: 25, maxDistance: 200, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_iron_scythe.png', imgName: 'projectiles_slash_attack_iron_scythe' } },
    { type: 10, category: 'sword', key: 'boulder_blade', displayName: 'Boulder Blade', order: 10, shopPrice: 430, sellPrice: 215, projectileType: 50, attack: { radius: 15, speed: 75, damage: 29, maxDistance: 220, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_boulder_blade.png', imgName: 'projectiles_slash_attack_boulder_blade' } },
    { type: 15, category: 'spear', key: 'plant_spear_v2', displayName: 'Plant Spear V2', order: 11, shopPrice: null, sellPrice: 240, projectileType: 51, cooldownMult: 1.6, attack: { radius: 26, speed: 78, damage: 33, maxDistance: 235, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_minotaur_axe_v2.png', imgName: 'projectiles_slash_attack_plant_spear_v2' } },
    { type: 11, category: 'sword', key: 'icicle_blade_v2', displayName: 'Icicle Blade V2', order: 12, shopPrice: null, sellPrice: 250, projectileType: 52, attack: { radius: 15, speed: 80, damage: 36, maxDistance: 240, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_icicle_blade_v2.png', imgName: 'projectiles_slash_attack_icicle_blade_v2' } },
    { type: 12, category: 'sword', key: 'minotaur_axe_v2', displayName: 'Minotaur Axe V2', order: 13, shopPrice: null, sellPrice: 325, projectileType: 53, cooldownMult: 1.6, attack: { radius: 15, speed: 85, damage: 42, maxDistance: 260, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/slash_attack_minotaur_axe_v2.png', imgName: 'projectiles_slash_attack_minotaur_axe_v2' } }
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
    { key: 'branch_drop', id: 2, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/branch.png', imgName: 'swords_branch', imgProportions: [2, 1] },
    { key: 'iron_dagger_drop', id: 3, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/iron_dagger.png', imgName: 'swords_iron_dagger', imgProportions: [2, 1] },
    { key: 'icicle_blade_v1_drop', id: 4, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/icicle_blade_v1.png', imgName: 'swords_icicle_blade_v1', imgProportions: [2, 1] },
    { key: 'plant_spear_v1_drop', id: 5, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/spears/plant_spear_v1.png', imgName: 'spears_plant_spear_v1', imgProportions: [2, 1] },
    { key: 'iron_axe_drop', id: 6, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/iron_axe.png', imgName: 'swords_iron_axe', imgProportions: [2, 1] },
    { key: 'iron_saber_drop', id: 7, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/iron_saber.png', imgName: 'swords_iron_saber', imgProportions: [2, 1] },
    { key: 'minotaur_axe_v1_drop', id: 8, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/minotaur_axe_v1.png', imgName: 'swords_minotaur_axe_v1', imgProportions: [2, 1] },
    { key: 'iron_scythe_drop', id: 9, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/iron_scythe.png', imgName: 'swords_iron_scythe', imgProportions: [2, 1] },
    { key: 'boulder_blade_drop', id: 10, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/boulder_blade.png', imgName: 'swords_boulder_blade', imgProportions: [2, 1] },
    { key: 'icicle_blade_v2_drop', id: 11, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/icicle_blade_v2.png', imgName: 'swords_icicle_blade_v2', imgProportions: [2, 1] },
    { key: 'minotaur_axe_v2_drop', id: 12, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/minotaur_axe_v2.png', imgName: 'swords_minotaur_axe_v2', imgProportions: [2, 1] },
    { key: 'plant_spear_v2_drop', id: 15, category: 'drop', isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/spears/plant_spear_v2.png', imgName: 'spears_plant_spear_v2', imgProportions: [2, 1] },
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
        'ui_tap': { name: 'ui_tap', src: './audios/ui_tap.mp3', defaultTimestamp: 0, defaultVolume: 0.4 },

    },
    sfxMap: [
        0, 'throw', 'sword_slash', 'hurt', 'bubble_pop', 'wood_hit', 'coin_collect', 'heart_beat', 'slash_clash', 'electric_sfx1'
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
            '0': { category: 'sword', name: 'swords_wipsword', src: './images/swords/wipsword.png', size: [100, 50], offset: { x: 0, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 100, swordHeight: 50 },
            '1': { category: 'sword', name: 'swords_bone', src: './images/swords/bone.png', size: [100, 50], offset: { x: -5, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 100, swordHeight: 50 },
            '2': { category: 'sword', name: 'swords_branch', src: './images/swords/branch.png', size: [110, 55], offset: { x: -1, y: -5 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 110, swordHeight: 55 },
            '3': { category: 'sword', name: 'swords_iron_dagger', src: './images/swords/iron_dagger.png', size: [120, 40], offset: { x: -4, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 120, swordHeight: 40 },
            '4': { category: 'sword', name: 'swords_icicle_blade_v1', src: './images/swords/icicle_blade_v1.png', size: [130, 30], offset: { x: -3, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 130, swordHeight: 30 },
            '6': { category: 'sword', name: 'swords_iron_axe', src: './images/swords/iron_axe.png', size: [140, 70], offset: { x: -5, y: -14 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 140, swordHeight: 70 },
            '7': { category: 'sword', name: 'swords_iron_saber', src: './images/swords/iron_saber.png', size: [150, 70], offset: { x: -2, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 150, swordHeight: 70 },
            '8': { category: 'sword', name: 'swords_minotaur_axe_v1', src: './images/swords/minotaur_axe_v1.png', size: [170, 90], offset: { x: -6, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 170, swordHeight: 90 },
            '9': { category: 'sword', name: 'swords_iron_scythe', src: './images/swords/iron_scythe.png', size: [180, 100], offset: { x: -4, y: 15 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 180, swordHeight: 100 },
            '10': { category: 'sword', name: 'swords_boulder_blade', src: './images/swords/boulder_blade.png', size: [200, 100], offset: { x: -6, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 200, swordHeight: 100 },
            '11': { category: 'sword', name: 'swords_icicle_blade_v2', src: './images/swords/icicle_blade_v2.png', size: [210, 40], offset: { x: -5, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 210, swordHeight: 40 },
            '12': { category: 'sword', name: 'swords_minotaur_axe_v2', src: './images/swords/minotaur_axe_v2.png', size: [290, 155], offset: { x: 0, y: 0 }, renderTuning: { rotationOffset: 0, sideOffset: 0, forwardOffset: 0 }, swordWidth: 290, swordHeight: 155 },
        }
    },
    SPEARS: {
        'imgs': {
            '5': PLANT_SPEAR_CONFIG,
            '15': PLANT_SPEAR_V2_CONFIG,
        }
    },
    MOBS: {
        '1': { radius: 25, speed: 7, baseHealth: 15, score: 10, alarmDuration: 5000, imgProportions: [2, 2], imgSrc: './images/mobs/chick.png', imgName: 'mobs_chick', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '2': { radius: 35, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 2], imgSrc: './images/mobs/pig.png', imgName: 'mobs_pig', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '3': { radius: 60, speed: 7, baseHealth: 150, score: 75, isNeutral: true, alarmDuration: Infinity, damage: 15, imgProportions: [3, 2.5], imgSrc: './images/mobs/cow.png', imgName: 'mobs_cow', deathAction: (killer) => { const maxScore = 400; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '4': { radius: 45, speed: 9, baseHealth: 50, score: 10, alarmDuration: 10000, imgProportions: [2, 2], imgSrc: './images/mobs/hearty.png', imgName: 'mobs_hearty', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1); killer.health = Math.min(killer.health + 50, killer.maxHealth) } },
        '5': { radius: 65, speed: 9, baseHealth: 250, score: 150, isNeutral: true, alarmDuration: 10000, damage: 15, imgProportions: [3, 2.5], imgSrc: './images/mobs/polar_bear.png', imgName: 'mobs_polar_bear', deathAction: (killer) => { const maxScore = 700; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '6': { radius: 110, speed: 7, baseHealth: 600, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/minotaur.png', imgName: 'mobs_minotaur', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '7': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/root_walker.png', imgName: 'mobs_root_walker', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '8': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/the_yeti.png', imgName: 'mobs_the_yeti', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '9': { radius: 25, speed: 7, baseHealth: 15, score: 10, alarmDuration: 5000, imgProportions: [2, 2], imgSrc: './images/mobs/bunny.png', imgName: 'mobs_bunny', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '10': { radius: 35, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 2], imgSrc: './images/mobs/iguana.png', imgName: 'mobs_iguana', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '11': { radius: 35, speed: 7, baseHealth: 50, score: 25, isNeutral: true, alarmDuration: 5000, damage: 10, imgProportions: [3, 2], imgSrc: './images/mobs/fox.png', imgName: 'mobs_fox', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '12': { radius: 35, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 3], imgSrc: './images/mobs/ostrich.png', imgName: 'mobs_ostrich', deathAction: (killer) => { const maxScore = 100; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '13': { radius: 100, speed: 10, baseHealth: 300, score: 200, isNeutral: true, alarmDuration: 10000, damage: 18, imgProportions: [3, 2.25], imgSrc: './images/mobs/elephant.png', imgName: 'mobs_elephant', deathAction: (killer) => { const maxScore = 850; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '14': { radius: 20, speed: 8, baseHealth: 15, score: 5, alarmDuration: 5000, imgProportions: [2.5, 2], imgSrc: './images/mobs/rat.png', imgName: 'mobs_rat', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '15': { radius: 35, speed: 2, baseHealth: 15, score: 20, alarmDuration: 5000, imgProportions: [2.5, 2], imgSrc: './images/mobs/tortoise.png', imgName: 'mobs_tortoise', deathAction: (killer) => { const maxScore = 50; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '16': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/dune_behemoth.png', imgName: 'mobs_dune_behemoth', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '17': { radius: 188, speed: 7, baseHealth: 1800, score: 200, alarmDuration: 20000, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/inferno_beast.png', imgName: 'mobs_inferno_beast', deathAction: (killer) => { const maxScore = 10000; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } }
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
    return dataMap.SPEARS.imgs[weaponType]
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

export const WEAPON_IDS = [...new Set([...SWORD_IDS, ...SPEAR_IDS])].sort((a, b) => a - b);
export const WEAPON_TYPES = WEAPON_TYPE_BY_KEY;

for (const weaponType of WEAPON_IDS) {
    const objectConfig = dataMap.OBJECTS?.[weaponType];
    if (!objectConfig?.isEphemeral) continue;
    objectConfig.radius = getWeaponDropPickupRadius(weaponType);
}

const WEAPON_ID_SET = new Set(WEAPON_IDS);
const SWORD_ID_SET = new Set(SWORD_IDS);
const SPEAR_ID_SET = new Set(SPEAR_IDS);
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

export function getStrongestInventorySwordDamage(inventory = [], inventoryCounts = []) {
    let bestDamage = 0;
    for (let i = 0; i < inventory.length; i++) {
        if ((inventoryCounts[i] || 0) <= 0) continue;
        const rank = (inventory[i] || 0) & 0x7F;
        if (!isSwordRank(rank)) continue;
        const damage = Number(getWeaponAttackStats(rank)?.damage) || 0;
        if (damage > bestDamage) bestDamage = damage;
    }
    return bestDamage;
}

export function getBossPortalEntryBlockMessage({ score = 0, inventory = [], inventoryCounts = [] } = {}) {
    if ((Number(score) || 0) < BOSS_PORTAL_MIN_SCORE) return BOSS_PORTAL_LOW_SCORE_MESSAGE;

    const requiredDamage = Number(getWeaponAttackStats(BOSS_PORTAL_MIN_SWORD_TYPE)?.damage) || 0;
    if (getStrongestInventorySwordDamage(inventory, inventoryCounts) < requiredDamage) {
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
    while (level < MAX_LEVEL && remaining > xpForLevel(level)) {
        remaining -= xpForLevel(level);
        level++;
    }
    return level;
}

if (typeof window !== 'undefined') {
    window.datamap = dataMap;
}
