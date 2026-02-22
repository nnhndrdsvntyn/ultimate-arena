import {
    Player
} from './entities/players/player.js';
import {
    Chick
} from './entities/mobs/chick.js';
import {
    Cow
} from './entities/mobs/cow.js';
import {
    Pig
} from './entities/mobs/pig.js';
import {
    Hearty
} from './entities/mobs/hearty.js';
import {
    PolarBear
} from './entities/mobs/polarbear.js';
import {
    Minotaur
} from './entities/mobs/minotaur.js';
import {
    Rock
} from './entities/structures/rock.js';
import {
    Base
} from './entities/structures/base.js';
import {
    Bush
} from './entities/structures/bush.js';
import {
    Projectile
} from './entities/projectile.js';
import {
    GameObject
} from './entities/objects/object.js';
import {
    GoldCoin
} from './entities/objects/gold-coin.js';
import {
    Chest
} from './entities/objects/chest.js';
import {
    wss
} from '../server.js';
import {
    PacketWriter,
    getId
} from './helpers.js';
const initWriter = new PacketWriter(1024 * 512);
import {
    dataMap
} from '../public/shared/datamap.js';
export const MAP_SIZE = [15000, 15000];
export const ENTITIES = {
    PLAYERS: {},
    MOBS: {},
    STRUCTURES: {},
    PROJECTILES: {},
    OBJECTS: {},
    playerIds: new Set,
    newEntity: ({
        entityType,
        id,
        x,
        y,
        angle,
        type,
        shooter,
        username,
        groupId,
        amount = 1,
        source = null
    }) => {
        if (entityType === 'player') {
            entityType = 1;
            new Player(id, x, y);
            ENTITIES.PLAYERS[id].username = username || 'player' + id; // Default username
            ENTITIES.playerIds.add(id)
        } else if (entityType === 'projectile') {
            entityType = 2;
            new Projectile(id, x, y, angle, type, shooter, groupId)
        } else if (entityType === 'mob') {
            entityType = 3;
            switch (type) {
                case 1:
                    new Chick(id, x, y);
                    break;
                case 2:
                    new Pig(id, x, y);
                    break;
                case 3:
                    new Cow(id, x, y);
                    break;
                case 4:
                    new Hearty(id, x, y);
                    break
                case 5:
                    new PolarBear(id, x, y);
                    break;
                case 6:
                    new Minotaur(id, x, y);
                    break;
            }
        } else if (entityType === 'structure') {
            entityType = 4;
            switch (type) {
                case 1:
                    new Base(id, x, y);
                    break;
                case 2:
                    new Rock(id, x, y);
                    break;
                case 3:
                    new Bush(id, x, y);
                    break
            }
        } else if (entityType === 'object') {
            entityType = 5;
            if (dataMap.CHEST_IDS.includes(type)) {
                new Chest(id, x, y, type);
            } else if (type === dataMap.COIN_ID) {
                new GoldCoin(id, x, y, type, amount, source);
            } else {
                new GameObject(id, x, y, type);
            }
        }


        if (entityType === 1) wss.clients.forEach(client => {
            if (client.id === id && entityType === 1) {
                client.send(buildInitPacket(client.id));
                return
            }
            // no more sending add packets... clients automatically handle adding / deleting based on the update state.
            /*
            if (entityType === 2 || entityType === 3) {
                client.send(buildPacket('u8', 3, 'u8', entityType, 'u32', id, 'u16', x, 'u16', y, 'f32', angle, 'u8', type));
            } else {
                client.send(buildPacket('u8', 3, 'u8', entityType, 'u32', id, 'u16', x, 'u16', y));
            }
            */
        })
    },
    deleteEntity: (type, id) => {
        if (type === 'player') {
            type = 1;
            delete ENTITIES.PLAYERS[id];
            ENTITIES.playerIds["delete"](id)
        }
        if (type === 'projectile') {
            const proj = ENTITIES.PROJECTILES[id];
            if (proj && proj.type === -1 && proj.shooter) {
                proj.shooter.returnWeapon(proj.weaponRank);
            }
            type = 2;
            delete ENTITIES.PROJECTILES[id]
        }
        if (type === 'mob') {
            type = 3;
            delete ENTITIES.MOBS[id]
        }
        if (type === 'object') {
            type = 5;
            delete ENTITIES.OBJECTS[id]
        }
        // no more sending delete packets... clients automatically handle adding / deleting based on the update state.
        /*
        const packet = buildPacket('u8', 4, 'u8', type, 'u32', id);
        wss.clients.forEach(client => {
            client.send(packet);
        });
        */
    }
};
// create some structures
new Base(1, MAP_SIZE[0] * 0.5, MAP_SIZE[1] * 0.5); // spawn zone
// rock structures (make sure to not spawn within spawnzoneradius + 100 distance from a spawn zon)
for (let i = 0; i < 100; i++) {
    let x, y;
    let validPosition = false;
    while (!validPosition) {
        x = Math.floor(Math.random() * MAP_SIZE[0]);
        y = Math.floor(Math.random() * MAP_SIZE[1]);
        const spawnZone = ENTITIES.STRUCTURES[1]; // Assuming spawn zone is structure with id 1
        const dx = x - spawnZone.x;
        const dy = y - spawnZone.y;
        const distanceSq = dx * dx + dy * dy;
        const radius = dataMap.STRUCTURES[2].radius;
        const invalid = x >= (MAP_SIZE[0] * 0.47 - radius) && x <= (MAP_SIZE[0] * 0.53 + radius);
        const minDistanceSq = (spawnZone.radius + 100) * (spawnZone.radius + 100);

        // Ensure not near spawn zone and not near map edges
        if (distanceSq > minDistanceSq && x > 500 && x < 9500 && y > 500 && y < 9500 && !invalid) {
            validPosition = true
        }
    }
    new Rock(getId('STRUCTURES'), x, y)
}
// bush structures (make sure to not spawn within spawnzoneradius + 100 distance from a spawn zone AND rock)
for (let i = 101; i < 201; i++) {
    let x, y;
    let validPosition = false;
    while (!validPosition) {
        x = Math.floor(Math.random() * MAP_SIZE[0]);
        y = Math.floor(Math.random() * MAP_SIZE[1]);
        const spawnZone = ENTITIES.STRUCTURES[1]; // Assuming spawn zone is structure with id 1
        const dx = x - spawnZone.x;
        const dy = y - spawnZone.y;
        const distanceSq = dx * dx + dy * dy;
        const radius = dataMap.STRUCTURES[3].radius;
        const invalid = x >= (MAP_SIZE[0] * 0.47 - radius) && x <= (MAP_SIZE[0] * 0.53 + radius);
        const minDistanceSq = (spawnZone.radius + 100) * (spawnZone.radius + 100);

        // Ensure not near spawn zone and not near map edges
        if (distanceSq > minDistanceSq && x > 500 && x < MAP_SIZE[0] * 0.95 && y > 500 && y < MAP_SIZE[1] * 0.95 && !invalid) {
            validPosition = true
        }
    }
    new Bush(getId('STRUCTURES'), x, y)
}
export function buildInitPacket(wsId) {
    // console.log("Building init packet for", wsId);
    initWriter.reset();
    initWriter.writeU8(1);

    const players = Object.values(ENTITIES.PLAYERS);
    initWriter.writeU8(players.length);
    for (const player of players) {
        initWriter.writeU8(player.id);
        initWriter.writeU16(player.x);
        initWriter.writeU16(player.y);
        initWriter.writeF32(player.angle);
        initWriter.writeStr(player.username);
    }
    const mobs = Object.values(ENTITIES.MOBS);
    initWriter.writeU16(mobs.length);
    for (const mob of mobs) {
        initWriter.writeU16(mob.id);
        initWriter.writeU16(mob.x);
        initWriter.writeU16(mob.y);
        initWriter.writeF32(mob.angle);
        initWriter.writeU8(mob.type);
    }
    const structures = Object.values(ENTITIES.STRUCTURES);
    initWriter.writeU16(structures.length);
    for (const structure of structures) {
        initWriter.writeU16(structure.id);
        initWriter.writeU16(structure.x);
        initWriter.writeU16(structure.y);
        initWriter.writeU8(structure.type);
    }

    const objects = Object.values(ENTITIES.OBJECTS);
    initWriter.writeU16(objects.length);
    for (const object of objects) {
        initWriter.writeU16(object.id);
        initWriter.writeU16(object.x);
        initWriter.writeU16(object.y);
        initWriter.writeU8(object.type);
    }

    return initWriter.getBuffer();
}
export const deadMobs = {};

export function getRandomMobPosition(type) {
    let x, y;
    if (type === 5) { // Polar Bear (Right side / Snow)
        x = Math.floor(MAP_SIZE[0] * 0.53 + Math.random() * (MAP_SIZE[0] * 0.47));
        y = Math.floor(Math.random() * MAP_SIZE[1]);
    } else if (type === 6) { // Minotaur (Left side / Green)
        x = Math.floor(Math.random() * 4700);
        y = Math.floor(Math.random() * 10000);
    } else if (type === 4) { // Hearty (Middle-ish)
        x = Math.floor(Math.random() * 10000);
        y = Math.floor(Math.random() * 10000);
    } else { // Chick (1), Pig (2), Cow (3) (Left side / Green)
        x = Math.floor(Math.random() * 4700);
        y = Math.floor(Math.random() * 10000);
    }
    return { x, y };
}

// spawn some mobs in random positions!
setTimeout(() => {
    const counts = {
        mob1: 50, // Chick
        mob2: 50, // Pig
        mob3: 50, // Cow
        mob4: 25, // Hearty
        mob5: 20, // Polar Bear (changed from 50 => 20)
        mob6: 3   // Minotaur
    };

    for (let type = 1; type <= 6; type++) {
        const count = counts[`mob${type}`];
        for (let i = 0; i < count; i++) {
            const { x, y } = getRandomMobPosition(type);
            ENTITIES.newEntity({
                entityType: 'mob',
                id: getId('MOBS'),
                x,
                y,
                type
            });
        }
    }
}, 100);


export function spawnObject(type, x, y, amount = 1, source = null) {
    const radius = dataMap.OBJECTS[type]?.radius || 50;

    // If x or y is missing, find a valid random position
    if (x === undefined || y === undefined) {
        let validPosition = false;
        while (!validPosition) {
            x = Math.floor(Math.random() * MAP_SIZE[0]);
            y = Math.floor(Math.random() * MAP_SIZE[1]);

            const spawnZone = ENTITIES.STRUCTURES[1];
            const distanceToSpawnSq = spawnZone ? (x - spawnZone.x) ** 2 + (y - spawnZone.y) ** 2 : 2000 ** 2;

            const riverLeft = MAP_SIZE[0] * 0.47;
            const riverRight = MAP_SIZE[0] * 0.53;

            let riverBuffer = 0;
            if (dataMap.CHEST_IDS.includes(type)) { // chests especially make sure they are at least 200 distance from the river
                riverBuffer = 200;
            }

            const inRiver = x >= (riverLeft - radius - riverBuffer) && x <= (riverRight + radius + riverBuffer);
            const nearSpawn = spawnZone ? distanceToSpawnSq < (spawnZone.radius + 200) ** 2 : false;
            const outOfBounds = x < 100 || x > (MAP_SIZE[0] - 100) || y < 100 || y > (MAP_SIZE[1] - 100);

            let inRock = false;
            for (const struct of Object.values(ENTITIES.STRUCTURES)) {
                if (struct.type === 2) { // Rock
                    const dx = x - struct.x;
                    const dy = y - struct.y;
                    if (dx * dx + dy * dy < (radius + struct.radius) ** 2) {
                        inRock = true;
                        break;
                    }
                }
            }

            let validSide = true;
            if (type === 10 || type === 11 || type === 13) {
                if (x > riverLeft - radius - riverBuffer) validSide = false;
            } else if (type === 12) {
                if (x < riverRight + radius + riverBuffer) validSide = false;
            }

            if (!inRiver && !nearSpawn && !outOfBounds && !inRock && validSide) {
                validPosition = true;
            }
        }
    }

    // Generate a unique ID (within 16-bit range)
    let id = getId('OBJECTS');

    ENTITIES.newEntity({
        entityType: 'object',
        id,
        x,
        y,
        type,
        amount,
        source
    });
    return ENTITIES.OBJECTS[id];
}

// spawn chests (types 1-4)
for (const type of dataMap.CHEST_IDS) {
    switch (type) {
        case 10:
            for (let i = 0; i < 75; i++) {
                spawnObject(type);
            }
            break;
        case 11:
            for (let i = 0; i < 50; i++) {
                spawnObject(type);
            }
            break;
        case 12:
            for (let i = 0; i < 25; i++) {
                spawnObject(type);
            }
            break;
        case 13:
            for (let i = 0; i < 10; i++) {
                spawnObject(type);
            }
            break;
    }
}

export const brokenObjects = {};
