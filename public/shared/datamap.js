// just some constants... doesn't really belong here.
export const TPS = {
    clientReal: 0,
    clientCapped: 75,
    server: 20
}

export const dataMap = {
    otherImgs: {
        'spawn-zone-shield': {
            name: 'spawn-zone-shield',
            src: './images/spawn-zone-shield.png'
        },
        'water': {
            name: 'water',
            src: './images/water.png'
        }
    },
    AUDIO: {
        'throw': {
            name: 'throw',
            src: './audios/throw.mp3',
            defaultTimestamp: 0.3,
            defaultVolume: 0.3
        },
        'sword-slash': {
            name: 'sword-slash',
            src: './audios/sword-slash.mp3',
            defaultTimestamp: 0.6,
            defaultVolume: 0.2
        },
        'hurt': {
            name: 'hurt',
            src: './audios/hurt.mp3',
            defaultTimestamp: 0,
            defaultVolume: 0.2
        },
        'bubble-pop': {
            name: 'bubble-pop',
            src: './audios/bubble-pop.mp3',
            defaultTimestamp: 0,
            defaultVolume: 0.1
        },
        'wood-hit': {
            name: 'wood-hit',
            src: './audios/wood-hit.mp3',
            defaultTimestamp: 0,
            defaultVolume: 0.3
        },
        'coin-collect': {
            name: 'coin-collect',
            src: './audios/coin-collect.mp3',
            defaultTimestamp: 0,
            defaultVolume: 0.7
        },
        'heart-beat': {
            name: 'heart-beat',
            src: './audios/heart-beat.mp3',
            defaultTimestamp: 0,
            defaultVolume: 0.7,
            defaultSpeed: 1.5,
        },
        'slash-clash': {
            name: 'slash-clash',
            src: './audios/slash-clash.mp3',
            defaultTimestamp: 0.7,
            defaultVolume: 0.15,
        }
    },
    sfxMap: [
        0, // padding
        'throw',
        'sword-slash',
        'hurt',
        'bubble-pop',
        'wood-hit',
        'coin-collect',
        'heart-beat',
        'slash-clash'
    ],
    UI: {
        'pause-button': {
            name: 'pause-button',
            src: './images/ui/pause-button.png'
        },
        'settings-gear': {
            name: 'settings-gear',
            src: './images/ui/settings-gear.png'
        },
        'fullscreen-button': {
            name: 'fullscreen-button',
            src: './images/ui/fullscreen-button.png'
        },
        'eye': {
            name: 'eye',
            src: './images/ui/eye.png'
        },
        'crossed-eye': {
            name: 'crossed-eye',
            src: './images/ui/crossed-eye.png'
        }
    },
    ACCESSORIES: {
        'bush-cloak': {
            name: 'bush-cloak',
            src: './images/accessories/bush-cloak.png',
            hatOffset: {
                x: -15,
                y: 0
            },
            size: [65, 70],
            rotation: 0,
        },
        'sunglasses': {
            name: 'sunglasses',
            src: './images/accessories/sunglasses.png',
            hatOffset: {
                x: 12,
                y: 0
            },
            size: [22, 60],
            rotation: 0,
        },
        'pirate-hat': {
            name: 'pirate-hat',
            src: './images/accessories/pirate-hat.png',
            hatOffset: {
                x: -15,
                y: -2
            },
            size: [45, 75],
            rotation: 0,
        },
        'viking-hat': {
            name: 'viking-hat',
            src: './images/accessories/viking-hat.png',
            hatOffset: {
                x: -14,
                y: -0.5
            },
            size: [70, 65],
            rotation: 0,
        },
        'alien-antennas': {
            name: 'alien-antennas',
            src: './images/accessories/alien-antennas.png',
            hatOffset: {
                x: -33,
                y: 0
            },
            size: [25, 96],
            rotation: 0,
        },
    },
    PLAYERS: {
        baseRadius: 30,
        baseMovementSpeed: 15,
        baseAttackCooldown: 900, // in milliseconds
        baseThrowSwordCooldown: 1500, // in milliseconds
        levels: {
            1: {
                score: 0,
                maxHealth: 100,
            }, // default
            2: {
                score: 100,
                maxHealth: 115,
                defaultAccessory: 'bush-cloak'
            }, // warrior
            3: {
                score: 250,
                maxHealth: 130,
                defaultAccessory: 'sunglasses'
            }, // hitman
            4: {
                score: 500,
                maxHealth: 145,
                defaultAccessory: 'viking-hat'
            }, // viking
            5: {
                score: 750,
                maxHealth: 160,
                defaultAccessory: 'pirate-hat'
            }, // pirate
            6: {
                score: 1000,
                maxHealth: 175,
                defaultAccessory: 'alien-antennas'
            }, // alien man
            7: {
                score: 1500,
                maxHealth: 200,
            }, // reaper
        },
        imgs: {
            '1': {
                name: 'player-default',
                src: './images/player/player-default.png'
            },
        }
    },
    SWORDS: {
        'imgs': {
            '0': {
                name: 'swords-wipsword',
                src: './images/swords/wipsword.png',
                swordWidth: 100,
                swordHeight: 50
            },
            '1': {
                name: 'swords-sword1',
                src: './images/swords/sword1.png',
                swordWidth: 100,
                swordHeight: 50
            },
            '2': {
                name: 'swords-sword2',
                src: './images/swords/sword2.png',
                swordWidth: 110,
                swordHeight: 55
            },
            '3': {
                name: 'swords-sword3',
                src: './images/swords/sword3.png',
                swordWidth: 120,
                swordHeight: 60
            },
            '4': {
                name: 'swords-sword4',
                src: './images/swords/sword4.png',
                swordWidth: 130,
                swordHeight: 65
            },
            '5': {
                name: 'swords-sword5',
                src: './images/swords/sword5.png',
                swordWidth: 140,
                swordHeight: 70
            },
            '6': {
                name: 'swords-sword6',
                src: './images/swords/sword6.png',
                swordWidth: 150,
                swordHeight: 75
            },
            '7': {
                name: 'swords-sword7',
                src: './images/swords/sword7.png',
                swordWidth: 160,
                swordHeight: 120
            }
        }

    },
    MOBS: {
        '1': {
            radius: 25,
            speed: 7,
            baseHealth: 15,
            score: 10,
            alarmDuration: 5000, // in ms
            deathAction: (killer) => {
                const maxScore = 10;
                killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1)
            }, // has to match with score.
            imgProportions: [2, 2],
            imgSrc: './images/mobs/chick.png',
            imgName: 'mobs-chick'
        },
        '2': {
            radius: 40,
            speed: 7,
            baseHealth: 50,
            score: 25,
            alarmDuration: 5000, // in ms
            deathAction: (killer) => {
                const maxScore = 25;
                killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1)
            }, // has to match with score.
            imgProportions: [3, 2], // pigs needs to wider than tall
            imgSrc: './images/mobs/pig.png',
            imgName: 'mobs-pig'
        },
        '3': {
            radius: 50,
            speed: 7,
            baseHealth: 150,
            score: 75,
            isNeutral: true,
            alarmDuration: Number.MAX_SAFE_INTEGER, // hunt player until it dies, basically infinitely
            deathAction: (killer) => {
                const maxScore = 75;
                killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1)
            }, // has to match with score.
            damage: 15,
            imgProportions: [3, 2], // cows needs to be wider than wall
            imgSrc: './images/mobs/cow.png',
            imgName: 'mobs-cow'
        },
        '4': {
            radius: 50,
            speed: 9,
            baseHealth: 50,
            score: 10,
            alarmDuration: 10000,
            deathAction: (killer) => {
                const maxScore = 10;
                killer.addScore(Math.floor(Math.random() * maxScore / 2) + maxScore / 2 + 1) // give 50-100% of the mobs score.
                killer.health = Math.min(killer.health + 50, killer.maxHealth) // 20 because it has to match with this mobs baseHealth
            },
            imgProportions: [2, 2],
            imgSrc: './images/mobs/hearty.png',
            imgName: 'mobs-hearty'
        },
    },
    PROJECTILES: {
        '1': {
            radius: 10,
            speed: 30,
            damage: 10,
            maxDistance: 100,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash1.png',
            imgName: 'projectiles-airslash1'
        },
        '2': {
            radius: 10,
            speed: 35,
            damage: 15,
            maxDistance: 110,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash2.png',
            imgName: 'projectiles-airslash2'
        },
        '3': {
            radius: 10,
            speed: 40,
            damage: 20,
            maxDistance: 120,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash3.png',
            imgName: 'projectiles-airslash3'
        },
        '4': {
            radius: 10,
            speed: 45,
            damage: 25,
            maxDistance: 130,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash4.png',
            imgName: 'projectiles-airslash4'
        },
        '5': {
            radius: 10,
            speed: 50,
            damage: 30,
            maxDistance: 140,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash5.png',
            imgName: 'projectiles-airslash5'
        },
        '6': {
            radius: 10,
            speed: 55,
            damage: 35,
            maxDistance: 150,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash6.png',
            imgName: 'projectiles-airslash6'
        },
        '7': {
            radius: 10,
            speed: 60,
            damage: 40,
            maxDistance: 160,
            knockbackStrength: 50,
            imgProportions: [1, 10],
            imgSrc: './images/projectiles/airslash6.png',
            imgName: 'projectiles-airslash6'
        }
    },
    STRUCTURES: {
        '1': {
            radius: 500,
            isSafeZone: true,
            imgSrc: './images/spawn-zone.png',
            imgName: 'structures-spawn-zone'
        },
        '2': {
            radius: 150,
            imgSrc: './images/rock1.png',
            imgName: 'structures-rock1'
        },
        '3': {
            radius: 120,
            noCollisions: true,
            imgSrc: './images/bush1.png',
            imgName: 'structures-bush1'
        }
    },
    OBJECTS: {
        '1': {
            radius: 50,
            maxHealth: 100,
            score: 10,
            imgSrc: './images/objects/chest1.png',
            imgName: 'chest1',
            imgProportions: [3, 2]
        },
        '2': {
            radius: 15,
            maxHealth: 1,
            score: 10,
            imgSrc: './images/objects/gold-coin.png',
            imgName: 'gold-coin',
            imgProportions: [2, 2]
        }
    }
};

// window.dataMap = dataMap;