export const TPS = {
    clientReal: 0,
    clientCapped: 75,
    server: 20
};

export const DEFAULT_VIEW_RANGE_MULT = 2 / 3;

const createAsset = (name, src, type) => ({ name, src, type });

export const dataMap = {
    otherImgs: {
        'spawn-zone-shield': { name: 'spawn-zone-shield', src: './images/spawn-zone-shield.png' },
        'water': { name: 'water', src: './images/water.png' },
        'rock1-snow': { name: 'rock1-snow', src: './images/rock1-snow.png' },
        'ground-texture1': { name: 'ground-texture1', src: './images/ground-texture1.png' },
        'ground-texture2': { name: 'ground-texture2', src: './images/ground-texture2.png' },
        'ground-texture3': { name: 'ground-texture3', src: './images/ground-texture3.png' }
    },
    CHEST_IDS: [10, 11, 12, 13],
    COIN_ID: 99,
    SHOP_ITEMS: [
        { id: 1, name: "Bone", price: 30, img: "sword1" },
        { id: 2, name: "Branch", price: 50, img: "sword2" },
        { id: 3, name: "Iron Dagger", price: 90, img: "sword3" },
        { id: 4, name: "Iron Axe", price: 150, img: "sword4" },
        { id: 5, name: "Iron Saber", price: 200, img: "sword5" },
        { id: 6, name: "Iron Scythe", price: 260, img: "sword6" },
        { id: 7, name: "Boulder Blade", price: 340, img: "sword7" },
        { id: 8, name: "Icicle Blade", price: 400, img: "sword8" }
    ],
    ACCESSORY_PRICE: 30,
    AUDIO: {
        'throw': { name: 'throw', src: './audios/throw.mp3', defaultTimestamp: 0.3, defaultVolume: 0.3 },
        'sword-slash': { name: 'sword-slash', src: './audios/sword-slash.mp3', defaultTimestamp: 0.6, defaultVolume: 0.2 },
        'hurt': { name: 'hurt', src: './audios/hurt.mp3', defaultTimestamp: 0, defaultVolume: 0.2 },
        'bubble-pop': { name: 'bubble-pop', src: './audios/bubble-pop.mp3', defaultTimestamp: 0, defaultVolume: 0.1 },
        'wood-hit': { name: 'wood-hit', src: './audios/wood-hit.mp3', defaultTimestamp: 0, defaultVolume: 0.3 },
        'coin-collect': { name: 'coin-collect', src: './audios/coin-collect.mp3', defaultTimestamp: 0, defaultVolume: 0.7 },
        'heart-beat': { name: 'heart-beat', src: './audios/heart-beat.mp3', defaultTimestamp: 0, defaultVolume: 0.7, defaultSpeed: 1.5 },
        'slash-clash': { name: 'slash-clash', src: './audios/slash-clash.mp3', defaultTimestamp: 0.7, defaultVolume: 0.15 },
        'electric-sfx1': { name: 'electric-sfx1', src: './audios/electric-sfx1.mp3', defaultTimestamp: 0.1, endTime: 0.7, defaultVolume: 0.5 },

    },
    sfxMap: [
        0, 'throw', 'sword-slash', 'hurt', 'bubble-pop', 'wood-hit', 'coin-collect', 'heart-beat', 'slash-clash', 'electric-sfx1'
    ],
    UI: {
        'pause-button': { name: 'pause-button', src: './images/ui/pause-button.png' },
        'settings-gear': { name: 'settings-gear', src: './images/ui/settings-gear.png' },
        'fullscreen-button': { name: 'fullscreen-button', src: './images/ui/fullscreen-button.png' },
        'loading-background': { name: 'loading-background', src: './images/ui/background.png' },
        'eye': { name: 'eye', src: './images/ui/eye.png' },
        'crossed-eye': { name: 'crossed-eye', src: './images/ui/crossed-eye.png' }
    },
    ACCESSORIES: {
        'bush-cloak': { name: 'bush-cloak', src: './images/accessories/bush-cloak.png', hatOffset: { x: -10, y: -1 }, size: [75, 80], rotation: 0 },
        'sunglasses': { name: 'sunglasses', src: './images/accessories/sunglasses.png', hatOffset: { x: 16, y: -2 }, size: [26, 60], rotation: 0 },
        'pirate-hat': { name: 'pirate-hat', src: './images/accessories/pirate-hat.png', hatOffset: { x: -18, y: -2 }, size: [40, 75], rotation: 0 },
        'viking-hat': { name: 'viking-hat', src: './images/accessories/viking-hat.png', hatOffset: { x: -18, y: -0.5 }, size: [90, 70], rotation: 0 },
        'alien-antennas': { name: 'alien-antennas', src: './images/accessories/alien-antennas.png', hatOffset: { x: -33, y: 0 }, size: [45, 96], rotation: 0, viewRangeMult: 1.5 },
        'dark-cloak': { name: 'dark-cloak', src: './images/accessories/dark-cloak.png', hatOffset: { x: -11, y: 0 }, size: [85, 82], rotation: 0 }
    },
    PLAYERS: {
        baseRadius: 30,
        baseMovementSpeed: 20,
        baseStrength: 10,
        baseAttackCooldown: 900,
        baseThrowSwordCooldown: 1500,
        maxHealth: 100,
        imgs: { '1': { name: 'player-default', src: './images/player/player-default.png' } }
    },
    SWORDS: {
        'imgs': {
            '0': { name: 'swords-wipsword', src: './images/swords/wipsword.png', swordWidth: 100, swordHeight: 50 },
            '1': { name: 'swords-sword1', src: './images/swords/sword1.png', swordWidth: 100, swordHeight: 50 },
            '2': { name: 'swords-sword2', src: './images/swords/sword2.png', swordWidth: 110, swordHeight: 55 },
            '3': { name: 'swords-sword3', src: './images/swords/sword3.png', swordWidth: 120, swordHeight: 60 },
            '4': { name: 'swords-sword4', src: './images/swords/sword4.png', swordWidth: 130, swordHeight: 65 },
            '5': { name: 'swords-sword5', src: './images/swords/sword5.png', swordWidth: 140, swordHeight: 70 },
            '6': { name: 'swords-sword6', src: './images/swords/sword6.png', swordWidth: 150, swordHeight: 120 },
            '7': { name: 'swords-sword7', src: './images/swords/sword7.png', swordWidth: 170, swordHeight: 90 },
            '8': { name: 'swords-sword8', src: './images/swords/sword8.png', swordWidth: 180, swordHeight: 50 },
            '9': { name: 'swords-sword9', src: './images/swords/sword9.png', swordWidth: 200, swordHeight: 100 },
        }
    },
    MOBS: {
        '1': { radius: 25, speed: 7, baseHealth: 15, score: 10, alarmDuration: 5000, imgProportions: [2, 2], imgSrc: './images/mobs/chick.png', imgName: 'mobs-chick', deathAction: (killer) => { const maxScore = 10; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '2': { radius: 35, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 2], imgSrc: './images/mobs/pig.png', imgName: 'mobs-pig', deathAction: (killer) => { const maxScore = 25; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '3': { radius: 50, speed: 7, baseHealth: 150, score: 75, isNeutral: true, alarmDuration: Infinity, damage: 15, imgProportions: [3, 2.5], imgSrc: './images/mobs/cow.png', imgName: 'mobs-cow', deathAction: (killer) => { const maxScore = 75; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '4': { radius: 45, speed: 9, baseHealth: 50, score: 10, alarmDuration: 10000, imgProportions: [2, 2], imgSrc: './images/mobs/hearty.png', imgName: 'mobs-hearty', deathAction: (killer) => { const maxScore = 10; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1); killer.health = Math.min(killer.health + 50, killer.maxHealth) } },
        '5': { radius: 65, speed: 9, baseHealth: 250, score: 150, isNeutral: true, alarmDuration: Infinity, damage: 15, imgProportions: [3, 2.5], imgSrc: './images/mobs/polar-bear.png', imgName: 'mobs-polar-bear', deathAction: (killer) => { const maxScore = 75; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '6': { radius: 75, speed: 7, baseHealth: 600, score: 200, alarmDuration: Infinity, damage: 20, imgProportions: [3, 3.5], imgSrc: './images/mobs/minotaur.png', imgName: 'mobs-minotaur', deathAction: (killer) => { const maxScore = 120; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } }
    },
    PROJECTILES: {
        '1': { radius: 10, speed: 30, damage: 3, maxDistance: 100, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash1.png', imgName: 'projectiles-airslash1' },
        '2': { radius: 10, speed: 35, damage: 5, maxDistance: 110, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash2.png', imgName: 'projectiles-airslash2' },
        '3': { radius: 10, speed: 40, damage: 8, maxDistance: 120, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash3.png', imgName: 'projectiles-airslash3' },
        '4': { radius: 10, speed: 45, damage: 12, maxDistance: 130, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash4.png', imgName: 'projectiles-airslash4' },
        '5': { radius: 10, speed: 50, damage: 15, maxDistance: 140, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash5.png', imgName: 'projectiles-airslash5' },
        '6': { radius: 10, speed: 55, damage: 18, maxDistance: 150, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash6.png', imgName: 'projectiles-airslash6' },
        '7': { radius: 10, speed: 60, damage: 23, maxDistance: 170, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash7.png', imgName: 'projectiles-airslash7' },
        '8': { radius: 10, speed: 65, damage: 27, maxDistance: 180, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash8.png', imgName: 'projectiles-airslash8' },
        '9': { radius: 15, speed: 70, damage: 32, maxDistance: 200, knockbackStrength: 25, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash9.png', imgName: 'projectiles-airslash9' },
        '10': { radius: 30, speed: 100, damage: 20, maxDistance: 500, knockbackStrength: 25, imgProportions: [10, 2.5], imgSrc: './images/projectiles/lightning-black-red.png', imgName: 'projectiles-lightning-black-red'}
    },
    STRUCTURES: {
        '1': { radius: 500, isSafeZone: true, imgSrc: './images/spawn-zone.png', imgName: 'structures-spawn-zone' },
        '2': { radius: 150, imgSrc: './images/rock1.png', imgName: 'structures-rock1' },
        '3': { radius: 120, noCollisions: true, imgSrc: './images/bush1.png', imgName: 'structures-bush1' }
    },
    OBJECTS: {
        '10': { isChest: true, radius: 50, maxHealth: 50, score: 10, coinDropRange: [10, 15], swordRankDrops: { 1: 0.5, 2: 0.25, 3: 0.1, 4: 0.05, 5: 0.04, 6: 0.03, 7: 0.03 }, imgSrc: './images/objects/chest1.png', imgName: 'chest1', imgProportions: [3, 2] },
        '11': { isChest: true, radius: 60, maxHealth: 125, score: 25, coinDropRange: [25, 75], swordRankDrops: { 1: 0.2, 2: 0.3, 3: 0.25, 4: 0.1, 5: 0.05, 6: 0.05, 7: 0.05 }, imgSrc: './images/objects/chest2.png', imgName: 'chest2', imgProportions: [3, 2] },
        '12': { isChest: true, radius: 75, maxHealth: 250, score: 75, coinDropRange: [50, 150], swordRankDrops: { 8: 0.1 }, imgSrc: './images/objects/chest3.png', imgName: 'chest3', imgProportions: [3, 2] },
        '13': { isChest: true, radius: 100, maxHealth: 500, score: 100, coinDropRange: [100, 300], swordRankDrops: { 1: 0.02, 2: 0.03, 3: 0.05, 4: 0.1, 5: 0.2, 6: 0.35, 7: 0.25 }, imgSrc: './images/objects/chest4.png', imgName: 'chest4', imgProportions: [3, 2] },
        '99': { isEphemeral: true, stackable: true, radius: 15, maxHealth: 1, score: 5, imgSrc: './images/objects/gold-coin.png', imgName: 'gold-coin', imgProportions: [2, 2] },
        '1': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword1.png', imgName: 'swords-sword1', imgProportions: [2, 1] },
        '2': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword2.png', imgName: 'swords-sword2', imgProportions: [2, 1] },
        '3': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword3.png', imgName: 'swords-sword3', imgProportions: [2, 1] },
        '4': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword4.png', imgName: 'swords-sword4', imgProportions: [2, 1] },
        '5': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword5.png', imgName: 'swords-sword5', imgProportions: [2, 1] },
        '6': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword6.png', imgName: 'swords-sword6', imgProportions: [2, 1] },
        '7': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword7.png', imgName: 'swords-sword7', imgProportions: [2, 1] },
        '8': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword8.png', imgName: 'swords-sword8', imgProportions: [2, 1] },
        '9': { isEphemeral: true, radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword9.png', imgName: 'swords-sword9', imgProportions: [2, 1] }
    }
};

export const ACCESSORY_KEYS = ['none', ...Object.keys(dataMap.ACCESSORIES)];
export const ACCESSORY_NAME_TO_ID = ACCESSORY_KEYS.reduce((acc, name, idx) => {
    acc[name] = idx;
    return acc;
}, {});
export const ACCESSORY_DESCRIPTIONS = {
    'bush-cloak': 'Poisons melee attackers',
    'sunglasses': 'Coming Soon',
    'pirate-hat': 'Swing cooldown is reduced by 30%',
    'viking-hat': 'Every 3 hits, you do 30% more damage.',
    'alien-antennas': 'Allows you to view more of the map',
    'dark-cloak': 'Mobs have slightly more difficulty spotting you'
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

export const SWORD_IDS = Object.keys(dataMap.SWORDS.imgs)
    .map(k => parseInt(k))
    .filter(id => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);

const SWORD_ID_SET = new Set(SWORD_IDS);

export function isSwordRank(rank) {
    return SWORD_ID_SET.has(rank);
}

export function isSellableItem(type) {
    return isSwordRank(type);
}

if (typeof window !== 'undefined') {
    // window.datamap = dataMap;
}
