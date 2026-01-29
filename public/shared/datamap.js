export const TPS = {
    clientReal: 0,
    clientCapped: 75,
    server: 20
};

export const version = '1.2.0';

const createAsset = (name, src, type) => ({ name, src, type });

export const dataMap = {
    otherImgs: {
        'spawn-zone-shield': { name: 'spawn-zone-shield', src: './images/spawn-zone-shield.png' },
        'water': { name: 'water', src: './images/water.png' },
        'rock1-snow': { name: 'rock1-snow', src: './images/rock1-snow.png' }
    },
    AUDIO: {
        'throw': { name: 'throw', src: './audios/throw.mp3', defaultTimestamp: 0.3, defaultVolume: 0.3 },
        'sword-slash': { name: 'sword-slash', src: './audios/sword-slash.mp3', defaultTimestamp: 0.6, defaultVolume: 0.2 },
        'hurt': { name: 'hurt', src: './audios/hurt.mp3', defaultTimestamp: 0, defaultVolume: 0.2 },
        'bubble-pop': { name: 'bubble-pop', src: './audios/bubble-pop.mp3', defaultTimestamp: 0, defaultVolume: 0.1 },
        'wood-hit': { name: 'wood-hit', src: './audios/wood-hit.mp3', defaultTimestamp: 0, defaultVolume: 0.3 },
        'coin-collect': { name: 'coin-collect', src: './audios/coin-collect.mp3', defaultTimestamp: 0, defaultVolume: 0.7 },
        'heart-beat': { name: 'heart-beat', src: './audios/heart-beat.mp3', defaultTimestamp: 0, defaultVolume: 0.7, defaultSpeed: 1.5 },
        'slash-clash': { name: 'slash-clash', src: './audios/slash-clash.mp3', defaultTimestamp: 0.7, defaultVolume: 0.15 }
    },
    sfxMap: [
        0, 'throw', 'sword-slash', 'hurt', 'bubble-pop', 'wood-hit', 'coin-collect', 'heart-beat', 'slash-clash'
    ],
    UI: {
        'pause-button': { name: 'pause-button', src: './images/ui/pause-button.png' },
        'settings-gear': { name: 'settings-gear', src: './images/ui/settings-gear.png' },
        'fullscreen-button': { name: 'fullscreen-button', src: './images/ui/fullscreen-button.png' },
        'eye': { name: 'eye', src: './images/ui/eye.png' },
        'crossed-eye': { name: 'crossed-eye', src: './images/ui/crossed-eye.png' }
    },
    ACCESSORIES: {
        'bush-cloak': { name: 'bush-cloak', src: './images/accessories/bush-cloak.png', hatOffset: { x: -15, y: 0 }, size: [65, 70], rotation: 0 },
        'sunglasses': { name: 'sunglasses', src: './images/accessories/sunglasses.png', hatOffset: { x: 12, y: 0 }, size: [22, 60], rotation: 0 },
        'pirate-hat': { name: 'pirate-hat', src: './images/accessories/pirate-hat.png', hatOffset: { x: -15, y: -2 }, size: [45, 75], rotation: 0 },
        'viking-hat': { name: 'viking-hat', src: './images/accessories/viking-hat.png', hatOffset: { x: -18, y: -0.5 }, size: [70, 65], rotation: 0 },
        'alien-antennas': { name: 'alien-antennas', src: './images/accessories/alien-antennas.png', hatOffset: { x: -33, y: 0 }, size: [25, 96], rotation: 0 },
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
            '7': { name: 'swords-sword7', src: './images/swords/sword7.png', swordWidth: 170, swordHeight: 90 }
        }
    },
    MOBS: {
        '1': { radius: 25, speed: 7, baseHealth: 15, score: 10, alarmDuration: 5000, imgProportions: [2, 2], imgSrc: './images/mobs/chick.png', imgName: 'mobs-chick', deathAction: (killer) => { const maxScore = 10; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '2': { radius: 40, speed: 7, baseHealth: 50, score: 25, alarmDuration: 5000, imgProportions: [3, 2], imgSrc: './images/mobs/pig.png', imgName: 'mobs-pig', deathAction: (killer) => { const maxScore = 25; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '3': { radius: 50, speed: 7, baseHealth: 150, score: 75, isNeutral: true, alarmDuration: Infinity, damage: 15, imgProportions: [3, 2], imgSrc: './images/mobs/cow.png', imgName: 'mobs-cow', deathAction: (killer) => { const maxScore = 75; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) } },
        '4': { radius: 50, speed: 9, baseHealth: 50, score: 10, alarmDuration: 10000, imgProportions: [2, 2], imgSrc: './images/mobs/hearty.png', imgName: 'mobs-hearty', deathAction: (killer) => { const maxScore = 10; killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1); killer.health = Math.min(killer.health + 50, killer.maxHealth) } }
    },
    PROJECTILES: {
        '1': { radius: 10, speed: 30, damage: 3, maxDistance: 100, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash1.png', imgName: 'projectiles-airslash1' },
        '2': { radius: 10, speed: 35, damage: 5, maxDistance: 110, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash2.png', imgName: 'projectiles-airslash2' },
        '3': { radius: 10, speed: 40, damage: 8, maxDistance: 120, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash3.png', imgName: 'projectiles-airslash3' },
        '4': { radius: 10, speed: 45, damage: 12, maxDistance: 130, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash4.png', imgName: 'projectiles-airslash4' },
        '5': { radius: 10, speed: 50, damage: 15, maxDistance: 140, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash5.png', imgName: 'projectiles-airslash5' },
        '6': { radius: 10, speed: 55, damage: 18, maxDistance: 150, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash5.png', imgName: 'projectiles-airslash5' },
        '7': { radius: 10, speed: 60, damage: 23, maxDistance: 160, knockbackStrength: 50, imgProportions: [1, 10], imgSrc: './images/projectiles/airslash3.png', imgName: 'projectiles-airslash3' }
    },
    STRUCTURES: {
        '1': { radius: 500, isSafeZone: true, imgSrc: './images/spawn-zone.png', imgName: 'structures-spawn-zone' },
        '2': { radius: 150, imgSrc: './images/rock1.png', imgName: 'structures-rock1' },
        '3': { radius: 120, noCollisions: true, imgSrc: './images/bush1.png', imgName: 'structures-bush1' }
    },
    OBJECTS: {
        '1': { radius: 50, maxHealth: 100, score: 10, coinDropRange: [10, 15], swordRankDrops: { 1: 0.5, 2: 0.25, 3: 0.1, 4: 0.05, 5: 0.04, 6: 0.03, 7: 0.03 }, imgSrc: './images/objects/chest1.png', imgName: 'chest1', imgProportions: [3, 2] },
        '2': { radius: 60, maxHealth: 250, score: 25, coinDropRange: [25, 75], swordRankDrops: { 1: 0.2, 2: 0.3, 3: 0.25, 4: 0.1, 5: 0.05, 6: 0.05, 7: 0.05 }, imgSrc: './images/objects/chest2.png', imgName: 'chest2', imgProportions: [3, 2] },
        '3': { radius: 75, maxHealth: 500, score: 75, coinDropRange: [50, 150], swordRankDrops: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25, 5: 0.15, 6: 0.1, 7: 0.05 }, imgSrc: './images/objects/chest3.png', imgName: 'chest3', imgProportions: [3, 2] },
        '4': { radius: 100, maxHealth: 1000, score: 100, coinDropRange: [100, 300], swordRankDrops: { 1: 0.02, 2: 0.03, 3: 0.05, 4: 0.1, 5: 0.2, 6: 0.3, 7: 0.3 }, imgSrc: './images/objects/chest4.png', imgName: 'chest4', imgProportions: [3, 2] },
        '5': { radius: 15, maxHealth: 1, score: 5, imgSrc: './images/objects/gold-coin.png', imgName: 'gold-coin', imgProportions: [2, 2] },
        '6': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword1.png', imgName: 'swords-sword1', imgProportions: [2, 1] },
        '7': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword2.png', imgName: 'swords-sword2', imgProportions: [2, 1] },
        '8': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword3.png', imgName: 'swords-sword3', imgProportions: [2, 1] },
        '9': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword4.png', imgName: 'swords-sword4', imgProportions: [2, 1] },
        '10': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword5.png', imgName: 'swords-sword5', imgProportions: [2, 1] },
        '11': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword6.png', imgName: 'swords-sword6', imgProportions: [2, 1] },
        '12': { radius: 45, maxHealth: 1, score: 0, imgSrc: './images/swords/sword7.png', imgName: 'swords-sword7', imgProportions: [2, 1] }
    }
};

/*
if (typeof window !== 'undefined') {
    window.datamap = dataMap;
}
*/