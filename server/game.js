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
import {
    dataMap,
    isChestObjectType,
    isCoinObjectType,
    getChestObjectTypes,
    resolveObjectType
} from '../public/shared/datamap.js';
import { generateSeededStructureLayout } from '../public/shared/structure-layout.js';

const initWriter = new PacketWriter(1024 * 512);
export const MAP_SIZE = [15000, 15000];
const WORLD_STRUCTURE_SEEDS = new Map();
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
        projectileOptions = null,
        amount = 1,
        source = null,
        world = null
    }) => {
        const worldId = world || shooter?.world || source?.world || 'main';
        let created = null;
        if (entityType === 'player') {
            entityType = 1;
            new Player(id, x, y);
            created = ENTITIES.PLAYERS[id];
            ENTITIES.PLAYERS[id].username = username || 'player' + id; // Default username
            ENTITIES.playerIds.add(id)
        } else if (entityType === 'projectile') {
            entityType = 2;
            new Projectile(id, x, y, angle, type, shooter, groupId, projectileOptions)
            created = ENTITIES.PROJECTILES[id];
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
            created = ENTITIES.MOBS[id];
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
            created = ENTITIES.STRUCTURES[id];
        } else if (entityType === 'object') {
            entityType = 5;
            if (isChestObjectType(type)) {
                new Chest(id, x, y, type);
            } else if (isCoinObjectType(type)) {
                new GoldCoin(id, x, y, type, amount, source);
            } else {
                new GameObject(id, x, y, type);
            }
            created = ENTITIES.OBJECTS[id];
        }

        if (created) {
            created.world = worldId;
        }


        if (entityType === 1) wss.clients.forEach(client => {
            if (client.id === id && entityType === 1) {
                client.send(buildInitPacket(client.id, client.world || 'main'));
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
function spawnSeededStructuresForWorld(world = 'main') {
    const seed = ((Math.random() * 0x100000000) >>> 0);
    WORLD_STRUCTURE_SEEDS.set(world, seed);

    const layout = generateSeededStructureLayout(seed, MAP_SIZE, {
        rockCount: 100,
        bushCount: 100
    });

    for (const structure of layout) {
        if (structure.type === 1) {
            new Base(structure.id, structure.x, structure.y);
        } else if (structure.type === 2) {
            new Rock(structure.id, structure.x, structure.y);
        } else if (structure.type === 3) {
            new Bush(structure.id, structure.x, structure.y);
        } else {
            continue;
        }
        const spawned = ENTITIES.STRUCTURES[structure.id];
        if (spawned) spawned.world = world;
    }

    console.log(`[WORLD ${world}] structure seed=${seed} structures=${layout.length}`);
}
spawnSeededStructuresForWorld('main');

export function buildInitPacket(wsId, world = 'main') {
    // console.log("Building init packet for", wsId);
    initWriter.reset();
    initWriter.writeU8(1);

    const players = [];
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        if (!player || (player.world || 'main') !== world) continue;
        players.push(player);
    }
    initWriter.writeU8(players.length);
    for (const player of players) {
        initWriter.writeU8(player.id);
        initWriter.writeU16(player.x);
        initWriter.writeU16(player.y);
        initWriter.writeF32(player.angle);
        initWriter.writeStr(player.username);
    }

    // Mobs are synced entirely by update packets (create/delete by presence in each tick).
    initWriter.writeU16(0);
    const structureSeed = WORLD_STRUCTURE_SEEDS.get(world);
    if (Number.isInteger(structureSeed)) {
        initWriter.writeU8(1); // seeded structure layout
        initWriter.writeU32(structureSeed >>> 0);
    } else {
        initWriter.writeU8(0); // raw structure list
        const structures = [];
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure || (structure.world || 'main') !== world) continue;
            structures.push(structure);
        }
        initWriter.writeU16(structures.length);
        for (const structure of structures) {
            initWriter.writeU16(structure.id);
            initWriter.writeU16(structure.x);
            initWriter.writeU16(structure.y);
            initWriter.writeU8(structure.type);
        }
    }

    // Objects are synced entirely by update packets (create/delete by presence in each tick).
    initWriter.writeU16(0);

    return initWriter.getBuffer();
}
export const deadMobs = {};

export function getRandomMobPosition(type) {
    let x, y;
    if (type === 5) { // Polar Bear (Right side / Snow)
        x = Math.floor(MAP_SIZE[0] * 0.53 + Math.random() * (MAP_SIZE[0] * 0.47));
        y = Math.floor(Math.random() * MAP_SIZE[1]);
    } else if (type === 6) { // Minotaur (Left side / Green)
        x = Math.floor(Math.random() * MAP_SIZE[0] * 0.47);
        y = Math.floor(Math.random() * MAP_SIZE[1]);
    } else if (type === 4) { // Hearty (Middle-ish)
        x = Math.floor(Math.random() * 10000);
        y = Math.floor(Math.random() * 10000);
    } else { // Chick (1), Pig (2), Cow (3) (Left side / Green)
        x = Math.floor(Math.random() * MAP_SIZE[0] * 0.47);
        y = Math.floor(Math.random() * MAP_SIZE[1]);
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


export function spawnObject(type, x, y, amount = 1, source = null, world = null) {
    type = resolveObjectType(type);
    const objectConfig = dataMap.OBJECTS[type];
    if (!objectConfig) return null;
    const worldId = world || source?.world || 'main';
    const radius = objectConfig.radius || 50;
    let spawnZone = null;
    const rockStructures = [];
    for (const id in ENTITIES.STRUCTURES) {
        const struct = ENTITIES.STRUCTURES[id];
        if (!struct || (struct.world || 'main') !== worldId) continue;
        if (struct.type === 1 && !spawnZone) {
            spawnZone = struct;
            continue;
        }
        if (struct.type === 2) rockStructures.push(struct);
    }

    // If x or y is missing, find a valid random position
    if (x === undefined || y === undefined) {
        let validPosition = false;
        while (!validPosition) {
            x = Math.floor(Math.random() * MAP_SIZE[0]);
            y = Math.floor(Math.random() * MAP_SIZE[1]);

            const distanceToSpawnSq = spawnZone ? (x - spawnZone.x) ** 2 + (y - spawnZone.y) ** 2 : 2000 ** 2;

            const riverLeft = MAP_SIZE[0] * 0.47;
            const riverRight = MAP_SIZE[0] * 0.53;

            const riverBuffer = objectConfig.riverBuffer || 0;

            const inRiver = x >= (riverLeft - radius - riverBuffer) && x <= (riverRight + radius + riverBuffer);
            const nearSpawn = spawnZone ? distanceToSpawnSq < (spawnZone.radius + 200) ** 2 : false;
            const outOfBounds = x < 100 || x > (MAP_SIZE[0] - 100) || y < 100 || y > (MAP_SIZE[1] - 100);

            let inRock = false;
            for (let i = 0; i < rockStructures.length; i++) {
                const struct = rockStructures[i];
                const dx = x - struct.x;
                const dy = y - struct.y;
                if (dx * dx + dy * dy < (radius + struct.radius) ** 2) {
                    inRock = true;
                    break;
                }
            }

            let validSide = true;
            if (objectConfig.spawnSide === 'left') {
                if (x > riverLeft - radius - riverBuffer) validSide = false;
            } else if (objectConfig.spawnSide === 'right') {
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
        source,
        world: worldId
    });
    if (ENTITIES.OBJECTS[id]) {
        ENTITIES.OBJECTS[id].dropSource = source;
    }
    return ENTITIES.OBJECTS[id];
}

// spawn chests
for (const type of getChestObjectTypes()) {
    const count = dataMap.OBJECTS[type]?.worldSpawnCount || 0;
    for (let i = 0; i < count; i++) {
        spawnObject(type);
    }
}

export const brokenObjects = {};





