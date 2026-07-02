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
    RootWalker
} from './entities/mobs/root_walker.js';
import {
    Yeti
} from './entities/mobs/yeti.js';
import {
    DuneBehemoth
} from './entities/mobs/dune_behemoth.js';
import {
    InfernoBeast
} from './entities/mobs/inferno_beast.js';
import {
    Bunny
} from './entities/mobs/bunny.js';
import {
    Iguana
} from './entities/mobs/iguana.js';
import {
    Fox
} from './entities/mobs/fox.js';
import {
    Ostrich
} from './entities/mobs/ostrich.js';
import {
    Elephant
} from './entities/mobs/elephant.js';
import {
    Rat
} from './entities/mobs/rat.js';
import {
    Sandling
} from './entities/mobs/sandling.js';
import {
    Tortoise
} from './entities/mobs/tortoise.js';
import {
    Rock
} from './entities/structures/rock.js';
import {
    Base
} from './entities/structures/base.js';
import {
    Tree
} from './entities/structures/tree.js';
import {
    RootWalkerShrine,
    RootWalkerPortal,
    YetiShrine,
    DuneShrine,
    InfernoShrine
} from './entities/structures/boss_shrine.js';
import {
    Projectile
} from './entities/projectile.js';
import {
    GameObject
} from './entities/objects/object.js';
import {
    GoldCoin
} from './entities/objects/gold_coin.js';
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
import { logWorldStructureSeed } from './constants.js';
import {
    dataMap,
    isRockStructureType,
    isChestObjectType,
    isCoinObjectType,
    getChestObjectTypes,
    isWeaponRank,
    resolveObjectType
} from '../public/shared/datamap.js';
import { isPointInRiver, getRiverBoundsAtY, getRiverBoundsAtX } from '../public/shared/river.js';
import { generateSeededStructureLayout } from '../public/shared/structure_layout.js';
import {
    getWorldCenter,
    getWorldMapSize,
    worldHasRivers,
    worldUsesSeededStructures,
    WORLD_MAIN,
    WORLD_ROOT_DIMENSION,
    WORLD_YETI_DIMENSION,
    WORLD_DUNE_DIMENSION,
    WORLD_INFERNO_DIMENSION
} from '../public/shared/worlds.js';
import fs from 'fs';

export const BOSS_DIMENSION_SPAWN = Object.freeze({ x: 1500, y: 1500 });
export const BOSS_DIMENSION_BOSS_SPAWN = Object.freeze({ x: 1500, y: 500 });
export const BOSS_INTRO_COUNTDOWN_MS = 5000;
export const BOSS_ABILITY_GRACE_MS = 10000;
export const BOSS_HEALTH_MULTIPLIER = 1.5;
export const BOSS_INTRO_ROV = 3;
export const BOSS_FIGHT_ROV = 1;

const PERSISTED_SEED_PATH = './profile_runtime/last_seed.txt';
let persistedMainSeed = null;
try {
    if (fs.existsSync(PERSISTED_SEED_PATH)) {
        const parsed = parseInt(fs.readFileSync(PERSISTED_SEED_PATH, 'utf8'), 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            persistedMainSeed = parsed >>> 0;
        }
    }
} catch (e) {
    console.error('Failed to load persisted seed:', e);
}

function consumePersistedMainSeed() {
    const seed = persistedMainSeed;
    persistedMainSeed = null;
    try {
        fs.unlinkSync(PERSISTED_SEED_PATH);
    } catch (_e) {
        // ignore
    }
    return seed;
}

const initWriter = new PacketWriter(1024 * 512);
export const MAP_SIZE = [10000, 10000];
const WORLD_STRUCTURE_SEEDS = new Map();
let rootWalkerEncounterOpen = false;
let rootWalkerBossDefeated = false;
let rootWalkerEncounterOpenedAt = 0;
let rootWalkerEncounterLastEnteredAt = 0;
let rootWalkerIntroStarted = false;
let yetiEncounterOpen = false;
let yetiBossDefeated = false;
let yetiEncounterOpenedAt = 0;
let yetiEncounterLastEnteredAt = 0;
let yetiIntroStarted = false;
let duneEncounterOpen = false;
let duneBossDefeated = false;
let duneEncounterOpenedAt = 0;
let duneEncounterLastEnteredAt = 0;
let duneIntroStarted = false;
let infernoEncounterOpen = false;
let infernoBossDefeated = false;
let infernoEncounterOpenedAt = 0;
let infernoEncounterLastEnteredAt = 0;
let infernoIntroStarted = false;
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
                case 7:
                    new RootWalker(id, x, y);
                    break;
                case 8:
                    new Yeti(id, x, y);
                    break;
                case 9:
                    new Bunny(id, x, y);
                    break;
                case 10:
                    new Iguana(id, x, y);
                    break;
                case 11:
                    new Fox(id, x, y);
                    break;
                case 12:
                    new Ostrich(id, x, y);
                    break;
                case 13:
                    new Elephant(id, x, y);
                    break;
                case 14:
                    new Rat(id, x, y);
                    break;
                case 15:
                    new Tortoise(id, x, y);
                    break;
                case 18:
                    new Sandling(id, x, y);
                    break;
                case 16:
                    new DuneBehemoth(id, x, y);
                    break;
                case 17:
                    new InfernoBeast(id, x, y);
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
                    new Rock(id, x, y, type);
                    break;
                case 6:
                    new Rock(id, x, y, type);
                    break;
                case 7:
                    new Rock(id, x, y, type);
                    break;
                case 3:
                    new Tree(id, x, y);
                    break
                case 4:
                    new RootWalkerShrine(id, x, y);
                    break;
                case 5:
                    new RootWalkerPortal(id, x, y);
                    break;
                case 8:
                    new YetiShrine(id, x, y);
                    break;
                case 9:
                    new InfernoShrine(id, x, y);
                    break;
                case 10:
                    new DuneShrine(id, x, y);
                    break;
            }
            created = ENTITIES.STRUCTURES[id];
        } else if (entityType === 'object') {
            entityType = 5;
            if (isChestObjectType(type)) {
                new Chest(id, x, y, type);
            } else if (isCoinObjectType(type)) {
                new GoldCoin(id, x, y, type, amount, source);
            } else {
                new GameObject(id, x, y, type, amount);
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
    if (!worldUsesSeededStructures(world)) return;
    const seed = (world === 'main' && persistedMainSeed !== null)
        ? consumePersistedMainSeed()
        : ((Math.random() * 0x100000000) >>> 0);
    WORLD_STRUCTURE_SEEDS.set(world, seed);

    const layout = generateSeededStructureLayout(seed, getWorldMapSize(world), {
        rockCount: 78,
        smallRockCount: 32,
        bigRockCountPerBiome: 2,
        treeCount: 48,
        treeCountPerBiome: 12
    });

    for (const structure of layout) {
        if (structure.type === 1) {
            new Base(structure.id, structure.x, structure.y);
        } else if (isRockStructureType(structure.type)) {
            new Rock(structure.id, structure.x, structure.y, structure.type);
        } else if (structure.type === 3) {
            new Tree(structure.id, structure.x, structure.y);
        } else if (structure.type === 4) {
            new RootWalkerShrine(structure.id, structure.x, structure.y);
        } else if (structure.type === 8) {
            new YetiShrine(structure.id, structure.x, structure.y);
        } else if (structure.type === 10) {
            new DuneShrine(structure.id, structure.x, structure.y);
        } else if (structure.type === 9) {
            new InfernoShrine(structure.id, structure.x, structure.y);
        } else {
            continue;
        }
        const spawned = ENTITIES.STRUCTURES[structure.id];
        if (spawned) {
            spawned.world = world;
            spawned.isNatural = true;
        }
    }
    logWorldStructureSeed(world, seed, layout.length);
}
spawnSeededStructuresForWorld('main');

export function ensureRootDimensionEdgeTrees() {
    const world = WORLD_ROOT_DIMENSION;
    let hasTree = false;
    let bigRockCount = 0;
    let mediumRockCount = 0;
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || (structure.world || WORLD_MAIN) !== world) continue;
        if (structure.type === 3) hasTree = true;
        if (structure.type === 6) bigRockCount++;
        if (structure.type === 2) mediumRockCount++;
    }

    const [width, height] = getWorldMapSize(world);
    if (!hasTree) {
        const treeRadius = Math.max(1, Math.floor(dataMap.STRUCTURES?.[3]?.radius || 200));
        const spacing = Math.max(treeRadius * 0.95, 180);
        const maxX = Math.max(0, width);
        const maxY = Math.max(0, height);
        const perimeter = (maxX * 2) + (maxY * 2);
        const treeCount = Math.max(12, Math.round(perimeter / spacing));

        const positions = [];
        const seen = new Set();
        const addTreePos = (x, y) => {
            const clampedX = Math.max(0, Math.min(width, Math.round(x)));
            const clampedY = Math.max(0, Math.min(height, Math.round(y)));
            const key = `${clampedX}:${clampedY}`;
            if (seen.has(key)) return;
            seen.add(key);
            positions.push({ x: clampedX, y: clampedY });
        };

        for (let i = 0; i < treeCount; i++) {
            const distance = (i / treeCount) * perimeter;
            if (distance < maxX) {
                addTreePos(distance, 0);
                continue;
            }
            if (distance < maxX + maxY) {
                addTreePos(width, distance - maxX);
                continue;
            }
            if (distance < (maxX * 2) + maxY) {
                addTreePos(width - (distance - maxX - maxY), height);
                continue;
            }
            addTreePos(0, height - (distance - (maxX * 2) - maxY));
        }

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const id = getId('STRUCTURES');
            new Tree(id, pos.x, pos.y);
            const tree = ENTITIES.STRUCTURES[id];
            if (tree) {
                tree.world = world;
                tree.isNatural = true;
            }
        }
    }

    const desiredBigRockCount = 5;
    const desiredMediumRockCount = 7;
    if (bigRockCount < desiredBigRockCount || mediumRockCount < desiredMediumRockCount) {
        const createSeededRng = (seed) => {
            let state = (seed >>> 0) || 1;
            return () => {
                state = (state + 0x6D2B79F5) >>> 0;
                let t = Math.imul(state ^ (state >>> 15), state | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        };
        const randomInt = (rng, min, max) => {
            if (max <= min) return min;
            return Math.floor(min + (rng() * (max - min + 1)));
        };
        const rootSeedBase = ((WORLD_STRUCTURE_SEEDS.get(WORLD_MAIN) ?? 0x51f15eed) ^ 0x6a09e667) >>> 0;
        const rng = createSeededRng(rootSeedBase);
        const rockPadding = 420;
        const rockGap = 140;
        const spawnRockClearRadius = 900;
        const existingRootRocks = Object.values(ENTITIES.STRUCTURES).filter((structure) =>
            structure
            && (structure.world || WORLD_MAIN) === world
            && (structure.type === 2 || structure.type === 6)
        );
        const canPlaceRock = (x, y, type) => {
            const radius = Math.max(1, dataMap.STRUCTURES?.[type]?.radius || 0);
            if (x < rockPadding || x > (width - rockPadding) || y < rockPadding || y > (height - rockPadding)) return false;
            const spawnDx = x - BOSS_DIMENSION_SPAWN.x;
            const spawnDy = y - BOSS_DIMENSION_SPAWN.y;
            if ((spawnDx * spawnDx + spawnDy * spawnDy) < ((spawnRockClearRadius + radius) * (spawnRockClearRadius + radius))) return false;
            for (let i = 0; i < existingRootRocks.length; i++) {
                const rock = existingRootRocks[i];
                const otherRadius = Math.max(1, rock.radius || dataMap.STRUCTURES?.[rock.type]?.radius || 0);
                const minDist = radius + otherRadius + rockGap;
                const dx = x - rock.x;
                const dy = y - rock.y;
                if ((dx * dx + dy * dy) < (minDist * minDist)) return false;
            }
            return true;
        };
        const spawnRootRock = (type) => {
            for (let attempt = 0; attempt < 5000; attempt++) {
                const x = randomInt(rng, rockPadding, width - rockPadding);
                const y = randomInt(rng, rockPadding, height - rockPadding);
                if (!canPlaceRock(x, y, type)) continue;
                const id = getId('STRUCTURES');
                new Rock(id, x, y, type);
                const rock = ENTITIES.STRUCTURES[id];
                if (!rock) return false;
                rock.world = world;
                rock.isNatural = true;
                existingRootRocks.push(rock);
                return true;
            }
            return false;
        };

        for (let i = bigRockCount; i < desiredBigRockCount; i++) {
            if (!spawnRootRock(6)) break;
        }
        for (let i = mediumRockCount; i < desiredMediumRockCount; i++) {
            if (!spawnRootRock(2)) break;
        }
    }
}

export function ensureYetiDimensionSnowStructures() {
    const world = WORLD_YETI_DIMENSION;
    let hasTree = false;
    let bigRockCount = 0;
    let mediumRockCount = 0;
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || (structure.world || WORLD_MAIN) !== world) continue;
        if (structure.type === 3) hasTree = true;
        if (structure.type === 6) bigRockCount++;
        if (structure.type === 2) mediumRockCount++;
    }

    const [width, height] = getWorldMapSize(world);
    if (!hasTree) {
        const treeRadius = Math.max(1, Math.floor(dataMap.STRUCTURES?.[3]?.radius || 200));
        const spacing = Math.max(treeRadius * 0.95, 180);
        const maxX = Math.max(0, width);
        const maxY = Math.max(0, height);
        const perimeter = (maxX * 2) + (maxY * 2);
        const treeCount = Math.max(12, Math.round(perimeter / spacing));

        const positions = [];
        const seen = new Set();
        const addTreePos = (x, y) => {
            const clampedX = Math.max(0, Math.min(width, Math.round(x)));
            const clampedY = Math.max(0, Math.min(height, Math.round(y)));
            const key = `${clampedX}:${clampedY}`;
            if (seen.has(key)) return;
            seen.add(key);
            positions.push({ x: clampedX, y: clampedY });
        };

        for (let i = 0; i < treeCount; i++) {
            const distance = (i / treeCount) * perimeter;
            if (distance < maxX) {
                addTreePos(distance, 0);
                continue;
            }
            if (distance < maxX + maxY) {
                addTreePos(width, distance - maxX);
                continue;
            }
            if (distance < (maxX * 2) + maxY) {
                addTreePos(width - (distance - maxX - maxY), height);
                continue;
            }
            addTreePos(0, height - (distance - (maxX * 2) - maxY));
        }

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const id = getId('STRUCTURES');
            new Tree(id, pos.x, pos.y);
            const tree = ENTITIES.STRUCTURES[id];
            if (tree) {
                tree.world = world;
                tree.isNatural = true;
            }
        }
    }

    const desiredBigRockCount = 5;
    const desiredMediumRockCount = 7;
    if (bigRockCount >= desiredBigRockCount && mediumRockCount >= desiredMediumRockCount) return;

    const createSeededRng = (seed) => {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = Math.imul(state ^ (state >>> 15), state | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const randomInt = (rng, min, max) => {
        if (max <= min) return min;
        return Math.floor(min + (rng() * (max - min + 1)));
    };
    const yetiSeedBase = ((WORLD_STRUCTURE_SEEDS.get(WORLD_MAIN) ?? 0x5f10e9ed) ^ 0xbb67ae85) >>> 0;
    const rng = createSeededRng(yetiSeedBase);
    const rockPadding = 420;
    const rockGap = 140;
    const spawnRockClearRadius = 900;
    const existingYetiRocks = Object.values(ENTITIES.STRUCTURES).filter((structure) =>
        structure
        && (structure.world || WORLD_MAIN) === world
        && (structure.type === 2 || structure.type === 6)
    );
    const canPlaceRock = (x, y, type) => {
        const radius = Math.max(1, dataMap.STRUCTURES?.[type]?.radius || 0);
        if (x < rockPadding || x > (width - rockPadding) || y < rockPadding || y > (height - rockPadding)) return false;
        const spawnDx = x - BOSS_DIMENSION_SPAWN.x;
        const spawnDy = y - BOSS_DIMENSION_SPAWN.y;
        if ((spawnDx * spawnDx + spawnDy * spawnDy) < ((spawnRockClearRadius + radius) * (spawnRockClearRadius + radius))) return false;
        for (let i = 0; i < existingYetiRocks.length; i++) {
            const rock = existingYetiRocks[i];
            const otherRadius = Math.max(1, rock.radius || dataMap.STRUCTURES?.[rock.type]?.radius || 0);
            const minDist = radius + otherRadius + rockGap;
            const dx = x - rock.x;
            const dy = y - rock.y;
            if ((dx * dx + dy * dy) < (minDist * minDist)) return false;
        }
        return true;
    };
    const spawnYetiRock = (type) => {
        for (let attempt = 0; attempt < 5000; attempt++) {
            const x = randomInt(rng, rockPadding, width - rockPadding);
            const y = randomInt(rng, rockPadding, height - rockPadding);
            if (!canPlaceRock(x, y, type)) continue;
            const id = getId('STRUCTURES');
            new Rock(id, x, y, type);
            const rock = ENTITIES.STRUCTURES[id];
            if (!rock) return false;
            rock.world = world;
            rock.isNatural = true;
            existingYetiRocks.push(rock);
            return true;
        }
        return false;
    };

    for (let i = bigRockCount; i < desiredBigRockCount; i++) {
        if (!spawnYetiRock(6)) break;
    }
    for (let i = mediumRockCount; i < desiredMediumRockCount; i++) {
        if (!spawnYetiRock(2)) break;
    }
}

export function ensureDuneDimensionDesertStructures() {
    const world = WORLD_DUNE_DIMENSION;
    let hasTree = false;
    let bigRockCount = 0;
    let mediumRockCount = 0;
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || (structure.world || WORLD_MAIN) !== world) continue;
        if (structure.type === 3) hasTree = true;
        if (structure.type === 6) bigRockCount++;
        if (structure.type === 2) mediumRockCount++;
    }

    const [width, height] = getWorldMapSize(world);
    if (!hasTree) {
        const treeRadius = Math.max(1, Math.floor(dataMap.STRUCTURES?.[3]?.radius || 200));
        const spacing = Math.max(treeRadius * 0.95, 180);
        const maxX = Math.max(0, width);
        const maxY = Math.max(0, height);
        const perimeter = (maxX * 2) + (maxY * 2);
        const treeCount = Math.max(12, Math.round(perimeter / spacing));

        const positions = [];
        const seen = new Set();
        const addTreePos = (x, y) => {
            const clampedX = Math.max(0, Math.min(width, Math.round(x)));
            const clampedY = Math.max(0, Math.min(height, Math.round(y)));
            const key = `${clampedX}:${clampedY}`;
            if (seen.has(key)) return;
            seen.add(key);
            positions.push({ x: clampedX, y: clampedY });
        };

        for (let i = 0; i < treeCount; i++) {
            const distance = (i / treeCount) * perimeter;
            if (distance < maxX) {
                addTreePos(distance, 0);
                continue;
            }
            if (distance < maxX + maxY) {
                addTreePos(width, distance - maxX);
                continue;
            }
            if (distance < (maxX * 2) + maxY) {
                addTreePos(width - (distance - maxX - maxY), height);
                continue;
            }
            addTreePos(0, height - (distance - (maxX * 2) - maxY));
        }

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const id = getId('STRUCTURES');
            new Tree(id, pos.x, pos.y);
            const tree = ENTITIES.STRUCTURES[id];
            if (tree) {
                tree.world = world;
                tree.isNatural = true;
            }
        }
    }

    const desiredBigRockCount = 5;
    const desiredMediumRockCount = 7;
    if (bigRockCount < desiredBigRockCount || mediumRockCount < desiredMediumRockCount) {
        const createSeededRng = (seed) => {
            let state = (seed >>> 0) || 1;
            return () => {
                state = (state + 0x6D2B79F5) >>> 0;
                let t = Math.imul(state ^ (state >>> 15), state | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        };
        const randomInt = (rng, min, max) => {
            if (max <= min) return min;
            return Math.floor(min + (rng() * (max - min + 1)));
        };
        const duneSeedBase = ((WORLD_STRUCTURE_SEEDS.get(WORLD_MAIN) ?? 0xd00d51de) ^ 0x3c6ef372) >>> 0;
        const rng = createSeededRng(duneSeedBase);
        const rockPadding = 420;
        const rockGap = 140;
        const spawnRockClearRadius = 900;
        const existingDuneRocks = Object.values(ENTITIES.STRUCTURES).filter((structure) =>
            structure
            && (structure.world || WORLD_MAIN) === world
            && (structure.type === 2 || structure.type === 6)
        );
        const canPlaceRock = (x, y, type) => {
            const radius = Math.max(1, dataMap.STRUCTURES?.[type]?.radius || 0);
            if (x < rockPadding || x > (width - rockPadding) || y < rockPadding || y > (height - rockPadding)) return false;
            const spawnDx = x - BOSS_DIMENSION_SPAWN.x;
            const spawnDy = y - BOSS_DIMENSION_SPAWN.y;
            if ((spawnDx * spawnDx + spawnDy * spawnDy) < ((spawnRockClearRadius + radius) * (spawnRockClearRadius + radius))) return false;
            for (let i = 0; i < existingDuneRocks.length; i++) {
                const rock = existingDuneRocks[i];
                const otherRadius = Math.max(1, rock.radius || dataMap.STRUCTURES?.[rock.type]?.radius || 0);
                const minDist = radius + otherRadius + rockGap;
                const dx = x - rock.x;
                const dy = y - rock.y;
                if ((dx * dx + dy * dy) < (minDist * minDist)) return false;
            }
            return true;
        };
        const spawnDuneRock = (type) => {
            for (let attempt = 0; attempt < 5000; attempt++) {
                const x = randomInt(rng, rockPadding, width - rockPadding);
                const y = randomInt(rng, rockPadding, height - rockPadding);
                if (!canPlaceRock(x, y, type)) continue;
                const id = getId('STRUCTURES');
                new Rock(id, x, y, type);
                const rock = ENTITIES.STRUCTURES[id];
                if (!rock) return false;
                rock.world = world;
                rock.isNatural = true;
                existingDuneRocks.push(rock);
                return true;
            }
            return false;
        };

        for (let i = bigRockCount; i < desiredBigRockCount; i++) {
            if (!spawnDuneRock(6)) break;
        }
        for (let i = mediumRockCount; i < desiredMediumRockCount; i++) {
            if (!spawnDuneRock(2)) break;
        }
    }
}

export function ensureInfernoDimensionMagmaStructures() {
    const world = WORLD_INFERNO_DIMENSION;
    let hasTree = false;
    let bigRockCount = 0;
    let mediumRockCount = 0;
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || (structure.world || WORLD_MAIN) !== world) continue;
        if (structure.type === 3) hasTree = true;
        if (structure.type === 6) bigRockCount++;
        if (structure.type === 2) mediumRockCount++;
    }

    const [width, height] = getWorldMapSize(world);
    if (!hasTree) {
        const treeRadius = Math.max(1, Math.floor(dataMap.STRUCTURES?.[3]?.radius || 200));
        const spacing = Math.max(treeRadius * 0.95, 180);
        const maxX = Math.max(0, width);
        const maxY = Math.max(0, height);
        const perimeter = (maxX * 2) + (maxY * 2);
        const treeCount = Math.max(12, Math.round(perimeter / spacing));

        const positions = [];
        const seen = new Set();
        const addTreePos = (x, y) => {
            const clampedX = Math.max(0, Math.min(width, Math.round(x)));
            const clampedY = Math.max(0, Math.min(height, Math.round(y)));
            const key = `${clampedX}:${clampedY}`;
            if (seen.has(key)) return;
            seen.add(key);
            positions.push({ x: clampedX, y: clampedY });
        };

        for (let i = 0; i < treeCount; i++) {
            const distance = (i / treeCount) * perimeter;
            if (distance < maxX) {
                addTreePos(distance, 0);
                continue;
            }
            if (distance < maxX + maxY) {
                addTreePos(width, distance - maxX);
                continue;
            }
            if (distance < (maxX * 2) + maxY) {
                addTreePos(width - (distance - maxX - maxY), height);
                continue;
            }
            addTreePos(0, height - (distance - (maxX * 2) - maxY));
        }

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const id = getId('STRUCTURES');
            new Tree(id, pos.x, pos.y);
            const tree = ENTITIES.STRUCTURES[id];
            if (tree) {
                tree.world = world;
                tree.isNatural = true;
            }
        }
    }

    const desiredBigRockCount = 5;
    const desiredMediumRockCount = 7;
    if (bigRockCount >= desiredBigRockCount && mediumRockCount >= desiredMediumRockCount) return;

    const createSeededRng = (seed) => {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = Math.imul(state ^ (state >>> 15), state | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const randomInt = (rng, min, max) => {
        if (max <= min) return min;
        return Math.floor(min + (rng() * (max - min + 1)));
    };
    const infernoSeedBase = ((WORLD_STRUCTURE_SEEDS.get(WORLD_MAIN) ?? 0x1f3f10be) ^ 0xa54ff53a) >>> 0;
    const rng = createSeededRng(infernoSeedBase);
    const rockPadding = 420;
    const rockGap = 140;
    const spawnRockClearRadius = 900;
    const existingInfernoRocks = Object.values(ENTITIES.STRUCTURES).filter((structure) =>
        structure
        && (structure.world || WORLD_MAIN) === world
        && (structure.type === 2 || structure.type === 6)
    );
    const canPlaceRock = (x, y, type) => {
        const radius = Math.max(1, dataMap.STRUCTURES?.[type]?.radius || 0);
        if (x < rockPadding || x > (width - rockPadding) || y < rockPadding || y > (height - rockPadding)) return false;
        const spawnDx = x - BOSS_DIMENSION_SPAWN.x;
        const spawnDy = y - BOSS_DIMENSION_SPAWN.y;
        if ((spawnDx * spawnDx + spawnDy * spawnDy) < ((spawnRockClearRadius + radius) * (spawnRockClearRadius + radius))) return false;
        for (let i = 0; i < existingInfernoRocks.length; i++) {
            const rock = existingInfernoRocks[i];
            const otherRadius = Math.max(1, rock.radius || dataMap.STRUCTURES?.[rock.type]?.radius || 0);
            const minDist = radius + otherRadius + rockGap;
            const dx = x - rock.x;
            const dy = y - rock.y;
            if ((dx * dx + dy * dy) < (minDist * minDist)) return false;
        }
        return true;
    };
    const spawnInfernoRock = (type) => {
        for (let attempt = 0; attempt < 5000; attempt++) {
            const x = randomInt(rng, rockPadding, width - rockPadding);
            const y = randomInt(rng, rockPadding, height - rockPadding);
            if (!canPlaceRock(x, y, type)) continue;
            const id = getId('STRUCTURES');
            new Rock(id, x, y, type);
            const rock = ENTITIES.STRUCTURES[id];
            if (!rock) return false;
            rock.world = world;
            rock.isNatural = true;
            existingInfernoRocks.push(rock);
            return true;
        }
        return false;
    };

    for (let i = bigRockCount; i < desiredBigRockCount; i++) {
        if (!spawnInfernoRock(6)) break;
    }
    for (let i = mediumRockCount; i < desiredMediumRockCount; i++) {
        if (!spawnInfernoRock(2)) break;
    }
}

export function buildInitPacket(wsId, world = 'main') {
    // console.log("Building init packet for", wsId);
    initWriter.reset();
    initWriter.writeU8(1);
    const worldSize = getWorldMapSize(world);
    initWriter.writeStr(world.startsWith('tutorial') ? 'tutorial' : world);
    initWriter.writeU16(worldSize[0]);
    initWriter.writeU16(worldSize[1]);

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
    if (worldUsesSeededStructures(world) && Number.isInteger(structureSeed) && worldMatchesSeededStructureLayout(world, structureSeed)) {
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

function worldMatchesSeededStructureLayout(world, structureSeed) {
    const liveStructures = [];
    for (const id in ENTITIES.STRUCTURES) {
        const structure = ENTITIES.STRUCTURES[id];
        if (!structure || (structure.world || 'main') !== world) continue;
        liveStructures.push(structure);
    }

    const seededLayout = generateSeededStructureLayout(structureSeed >>> 0, getWorldMapSize(world), {
        rockCount: 78,
        smallRockCount: 32,
        bigRockCountPerBiome: 2,
        treeCount: 48,
        treeCountPerBiome: 12
    });

    if (liveStructures.length !== seededLayout.length) return false;

    const liveById = new Map();
    for (let i = 0; i < liveStructures.length; i++) {
        const structure = liveStructures[i];
        liveById.set(structure.id, structure);
    }

    for (let i = 0; i < seededLayout.length; i++) {
        const seeded = seededLayout[i];
        const live = liveById.get(seeded.id);
        if (!live) return false;
        if (live.type !== seeded.type) return false;
        if (live.x !== seeded.x || live.y !== seeded.y) return false;
    }

    return true;
}
export const deadMobs = {};
const CHEST_WORLD_SPAWN_QUADRANTS = {
    20: ['tl'], // chest1 -> top-left
    21: ['bl'], // chest2 -> bottom-left
    22: ['tr'], // chest3 -> top-right
    23: ['br']  // chest4 -> bottom-right
};
const CHEST_MIN_SPAWN_GAP = 220;

function getMapQuadrant(x, y) {
    const cx = MAP_SIZE[0] * 0.5;
    const cy = MAP_SIZE[1] * 0.5;
    const left = x < cx;
    const top = y < cy;
    if (top && left) return 'tl';
    if (top && !left) return 'tr';
    if (!top && left) return 'bl';
    return 'br';
}

function isOutOfBoundsForSpawn(x, y, margin = 120) {
    return x < margin || x > (MAP_SIZE[0] - margin) || y < margin || y > (MAP_SIZE[1] - margin);
}

function isInsideSafeZoneForSpawn(x, y, extra = 0) {
    const safeRadius = Math.max(1, Math.floor(dataMap.STRUCTURES?.[1]?.radius || 500));
    const cx = MAP_SIZE[0] * 0.5;
    const cy = MAP_SIZE[1] * 0.5;
    const dx = x - cx;
    const dy = y - cy;
    const maxDist = safeRadius + Math.max(0, extra);
    return (dx * dx + dy * dy) <= (maxDist * maxDist);
}

function isValidMobSpawnPosition(type, x, y) {
    return isValidMobSpawnPositionForWorld(type, x, y, WORLD_MAIN);
}

function buildChestSpawnCandidates(type, mapSize, preferredX = null, preferredY = null) {
    const candidates = [];
    const [mapW, mapH] = mapSize;
    const step = 220;
    const margin = 140;
    const allowedChestQuadrants = CHEST_WORLD_SPAWN_QUADRANTS[type] || null;

    const addCandidate = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < margin || x > (mapW - margin) || y < margin || y > (mapH - margin)) return;
        if (Array.isArray(allowedChestQuadrants) && !allowedChestQuadrants.includes(getMapQuadrant(x, y))) return;
        candidates.push({ x: Math.round(x), y: Math.round(y) });
    };

    if (Number.isFinite(preferredX) && Number.isFinite(preferredY)) {
        addCandidate(preferredX, preferredY);
        addCandidate(preferredX + step, preferredY);
        addCandidate(preferredX - step, preferredY);
        addCandidate(preferredX, preferredY + step);
        addCandidate(preferredX, preferredY - step);
        addCandidate(preferredX + step, preferredY + step);
        addCandidate(preferredX - step, preferredY - step);
        addCandidate(preferredX + step, preferredY - step);
        addCandidate(preferredX - step, preferredY + step);
    }

    const midX = mapW * 0.5;
    const midY = mapH * 0.5;
    const boundsByQuadrant = {
        tl: [margin, midX - margin, margin, midY - margin],
        tr: [midX + margin, mapW - margin, margin, midY - margin],
        bl: [margin, midX - margin, midY + margin, mapH - margin],
        br: [midX + margin, mapW - margin, midY + margin, mapH - margin]
    };

    if (Array.isArray(allowedChestQuadrants) && allowedChestQuadrants.length > 0) {
        for (let i = 0; i < allowedChestQuadrants.length; i++) {
            const bounds = boundsByQuadrant[allowedChestQuadrants[i]];
            if (!bounds) continue;
            const [minX, maxX, minY, maxY] = bounds;
            for (let y = minY; y <= maxY; y += step) {
                for (let x = minX; x <= maxX; x += step) {
                    addCandidate(x, y);
                }
            }
        }
    } else {
        for (let y = margin; y <= mapH - margin; y += step) {
            for (let x = margin; x <= mapW - margin; x += step) {
                addCandidate(x, y);
            }
        }
    }

    return candidates;
}

function isValidMobSpawnPositionForWorld(type, x, y, world = WORLD_MAIN) {
    const mapSize = getWorldMapSize(world);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 120 || x > (mapSize[0] - 120) || y < 120 || y > (mapSize[1] - 120)) return false;
    if (worldHasRivers(world) && isPointInRiver(mapSize, x, y, 8)) return false;

    const mobRadius = Math.max(1, Math.floor(dataMap.MOBS?.[type]?.radius || 30));
    if (worldUsesSeededStructures(world) && isInsideSafeZoneForSpawn(x, y, mobRadius + 60)) return false;

    if (!worldHasRivers(world)) return true;

    const verticalBounds = getRiverBoundsAtY(mapSize, y);
    const horizontalBounds = getRiverBoundsAtX(mapSize, x);
    const isLeftOfVerticalRiver = x < verticalBounds.left;
    const isRightOfVerticalRiver = x > verticalBounds.right;
    const isAboveHorizontalRiver = y < horizontalBounds.top;
    const isBelowHorizontalRiver = y > horizontalBounds.bottom;

    if (type === 4) return true; // Hearty: any non-river land
    if (type === 5 || type === 9 || type === 11) return isRightOfVerticalRiver && isAboveHorizontalRiver; // Polar Bear/Bunny/Fox: top-right
    if (type === 6 || type === 10 || type === 17) return isRightOfVerticalRiver && isBelowHorizontalRiver; // Minotaur/Iguana/Inferno Beast: bottom-right
    if (type === 12 || type === 13 || type === 15 || type === 18) return isLeftOfVerticalRiver && isBelowHorizontalRiver; // Ostrich/Elephant/Tortoise/Sandling: bottom-left
    if (type === 14) return isRightOfVerticalRiver && isBelowHorizontalRiver; // Rat: bottom-right / volcano
    if (type === 1 || type === 2 || type === 3 || type === 7) {
        return isLeftOfVerticalRiver && isAboveHorizontalRiver; // Chick/Pig/Cow/Root Walker: top-left
    }
    return false;
}

function getMobSpawnAnchor(type) {
    return getMobSpawnAnchorForWorld(type, WORLD_MAIN);
}

function getMobSpawnAnchorForWorld(type, world = WORLD_MAIN) {
    const mapSize = getWorldMapSize(world);
    if (!worldHasRivers(world)) return { x: mapSize[0] * 0.5, y: mapSize[1] * 0.5 };
    if (type === 5 || type === 9 || type === 11) return { x: mapSize[0] * 0.75, y: mapSize[1] * 0.25 };
    if (type === 6 || type === 10 || type === 17) return { x: mapSize[0] * 0.75, y: mapSize[1] * 0.75 };
    if (type === 12 || type === 13 || type === 15 || type === 18) return { x: mapSize[0] * 0.25, y: mapSize[1] * 0.75 };
    if (type === 14) return { x: mapSize[0] * 0.75, y: mapSize[1] * 0.75 };
    if (type === 1 || type === 2 || type === 3 || type === 7) return { x: mapSize[0] * 0.25, y: mapSize[1] * 0.25 };
    return { x: mapSize[0] * 0.5, y: mapSize[1] * 0.5 };
}

function findGuaranteedMobSpawn(type, world = WORLD_MAIN) {
    const anchor = getMobSpawnAnchorForWorld(type, world);
    const mapSize = getWorldMapSize(world);
    const maxRadius = Math.max(mapSize[0], mapSize[1]);
    const ringStep = 140;
    const angleStep = Math.PI / 12;
    for (let r = 0; r <= maxRadius; r += ringStep) {
        for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
            const x = Math.floor(Math.max(0, Math.min(mapSize[0], anchor.x + Math.cos(angle) * r)));
            const y = Math.floor(Math.max(0, Math.min(mapSize[1], anchor.y + Math.sin(angle) * r)));
            if (isValidMobSpawnPositionForWorld(type, x, y, world)) return { x, y };
        }
    }

    // Absolute fallback: dense sweep to guarantee a legal coordinate.
    const step = 120;
    for (let y = step; y <= mapSize[1] - step; y += step) {
        for (let x = step; x <= mapSize[0] - step; x += step) {
            if (isValidMobSpawnPositionForWorld(type, x, y, world)) return { x, y };
        }
    }

    // Should never happen, but keep a deterministic safe return.
    return { x: Math.floor(anchor.x), y: Math.floor(anchor.y) };
}

export function getRandomMobPosition(type, world = WORLD_MAIN) {
    const mapSize = getWorldMapSize(world);
    // Fast random sampling first.
    for (let attempts = 0; attempts < 1000; attempts++) {
        const x = Math.floor(Math.random() * mapSize[0]);
        const y = Math.floor(Math.random() * mapSize[1]);
        if (isValidMobSpawnPositionForWorld(type, x, y, world)) return { x, y };
    }

    // Guaranteed strict fallback (never returns outside designated area).
    return findGuaranteedMobSpawn(type, world);
}

// spawn some mobs in random positions!
setTimeout(() => {
    const counts = {
        mob1: 18, // Chick
        mob2: 18, // Pig
        mob3: 18, // Cow
        mob4: 25, // Hearty
        mob5: 20, // Polar Bear
        mob6: 3,  // Minotaur
        mob9: 18, // Bunny
        mob10: 18, // Iguana
        mob11: 18, // Fox
        mob12: 18, // Ostrich
        mob13: 10, // Elephant
        mob14: 18, // Rat
        mob15: 18, // Tortoise
        mob18: 18 // Sandling
    };

    for (const type of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]) {
        const count = counts[`mob${type}`];
        for (let i = 0; i < count; i++) {
            const { x, y } = getRandomMobPosition(type, WORLD_MAIN);
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

export function getRootWalkerBoss() {
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== 7) continue;
        if ((mob.world || WORLD_MAIN) !== WORLD_ROOT_DIMENSION) continue;
        if (mob.hp <= 0) continue;
        return mob;
    }
    return null;
}

function getBossIntroState(world) {
    if (world === WORLD_ROOT_DIMENSION) {
        return {
            isOpen: rootWalkerEncounterOpen,
            started: rootWalkerIntroStarted,
            setStarted(value) { rootWalkerIntroStarted = !!value; },
            getBoss: getRootWalkerBoss
        };
    }
    if (world === WORLD_YETI_DIMENSION) {
        return {
            isOpen: yetiEncounterOpen,
            started: yetiIntroStarted,
            setStarted(value) { yetiIntroStarted = !!value; },
            getBoss: getYetiBoss
        };
    }
    if (world === WORLD_DUNE_DIMENSION) {
        return {
            isOpen: duneEncounterOpen,
            started: duneIntroStarted,
            setStarted(value) { duneIntroStarted = !!value; },
            getBoss: getDuneBoss
        };
    }
    if (world === WORLD_INFERNO_DIMENSION) {
        return {
            isOpen: infernoEncounterOpen,
            started: infernoIntroStarted,
            setStarted(value) { infernoIntroStarted = !!value; },
            getBoss: getInfernoBoss
        };
    }
    return null;
}

function pauseBossUntilFirstEntry(boss) {
    if (!boss) return boss;
    boss.bossIntroPaused = true;
    boss.bossIntroUntil = 0;
    boss.bossAbilityLockedUntil = 0;
    boss.isAlarmed = false;
    boss.target = null;
    boss.alarmReason = null;
    if (typeof boss.faceBossIntroDirection === 'function') boss.faceBossIntroDirection();
    return boss;
}

function strengthenEncounterBoss(boss) {
    if (!boss || boss._bossHealthScaled) return boss;
    const nextMaxHp = Math.max(1, Math.round((boss.maxHp || boss.hp || 1) * BOSS_HEALTH_MULTIPLIER));
    boss.maxHp = nextMaxHp;
    boss.hp = nextMaxHp;
    boss._bossHealthScaled = true;
    boss._forceFullSync = true;
    return boss;
}

export function beginBossIntroForWorld(world, now = performance.now()) {
    const state = getBossIntroState(world);
    if (!state || !state.isOpen || state.started) return 0;
    state.setStarted(true);
    const introUntil = now + BOSS_INTRO_COUNTDOWN_MS;
    const boss = state.getBoss();
    if (boss) {
        boss.bossIntroPaused = false;
        boss.bossIntroUntil = introUntil;
        boss.bossAbilityLockedUntil = introUntil + BOSS_ABILITY_GRACE_MS;
        boss.freezeUntil = Math.max(boss.freezeUntil || 0, introUntil);
        boss.isAlarmed = false;
        boss.target = null;
        boss.alarmReason = null;
        if (typeof boss.faceBossIntroDirection === 'function') boss.faceBossIntroDirection();
        boss._forceFullSync = true;
    }
    return introUntil;
}

export function getBossIntroUntilForWorld(world) {
    const state = getBossIntroState(world);
    if (!state || !state.isOpen || !state.started) return 0;
    const boss = state.getBoss();
    return Math.max(0, boss?.bossIntroUntil || 0);
}

export function hasActiveRootWalkerDimensionPlayers() {
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        if (!player || !player.isAlive) continue;
        if ((player.world || WORLD_MAIN) !== WORLD_ROOT_DIMENSION) continue;
        return true;
    }
    return false;
}

export function isRootWalkerEncounterSpawnLocked() {
    return rootWalkerEncounterOpen || hasRemainingRootWalkerLoot() || hasActiveRootWalkerDimensionPlayers();
}

export function openRootWalkerEncounter() {
    rootWalkerEncounterOpen = true;
    rootWalkerBossDefeated = false;
    rootWalkerEncounterOpenedAt = performance.now();
    rootWalkerEncounterLastEnteredAt = 0;
    rootWalkerIntroStarted = false;
}

export function markRootWalkerBossDefeated() {
    if (!rootWalkerEncounterOpen) return;
    rootWalkerBossDefeated = true;
}

export function isRootWalkerEncounterOpen() {
    return rootWalkerEncounterOpen;
}

export function markRootWalkerDimensionEntry(now = performance.now()) {
    if (!rootWalkerEncounterOpen) return;
    rootWalkerEncounterLastEnteredAt = now;
}

export function getRootWalkerEncounterLastActivityAt() {
    return rootWalkerEncounterLastEnteredAt || rootWalkerEncounterOpenedAt || 0;
}

export function shouldCloseRootWalkerEncounter() {
    if (!rootWalkerEncounterOpen) return false;
    const encounterTimedOut = (() => {
        const lastActivityAt = getRootWalkerEncounterLastActivityAt();
        if (lastActivityAt <= 0) return false;
        return (performance.now() - lastActivityAt) >= (5 * 60 * 1000);
    })();
    if (encounterTimedOut) return true;
    return rootWalkerBossDefeated && !hasRemainingRootWalkerLoot() && !hasActiveRootWalkerDimensionPlayers();
}

export function closeRootWalkerEncounterState() {
    rootWalkerEncounterOpen = false;
    rootWalkerBossDefeated = false;
    rootWalkerEncounterOpenedAt = 0;
    rootWalkerEncounterLastEnteredAt = 0;
    rootWalkerIntroStarted = false;
}

export function spawnRootWalkerBoss() {
    const existingBoss = getRootWalkerBoss();
    if (existingBoss || hasRemainingRootWalkerLoot()) {
        const boss = existingBoss;
        strengthenEncounterBoss(boss);
        if (boss && rootWalkerEncounterOpen && !rootWalkerIntroStarted) pauseBossUntilFirstEntry(boss);
        return boss;
    }
    const [worldWidth, worldHeight] = getWorldMapSize(WORLD_ROOT_DIMENSION);
    const rootWalkerRadius = Math.max(1, Math.floor(dataMap.MOBS?.[7]?.radius || 188));
    const rootWalkerSpawn = {
        x: Math.max(rootWalkerRadius + 120, Math.min(worldWidth - rootWalkerRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.x)),
        y: Math.max(rootWalkerRadius + 120, Math.min(worldHeight - rootWalkerRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.y))
    };
    ENTITIES.newEntity({
        entityType: 'mob',
        id: getId('MOBS'),
        x: rootWalkerSpawn.x,
        y: rootWalkerSpawn.y,
        type: 7,
        world: WORLD_ROOT_DIMENSION
    });
    const boss = getRootWalkerBoss();
    strengthenEncounterBoss(boss);
    if (boss && rootWalkerEncounterOpen && !rootWalkerIntroStarted) pauseBossUntilFirstEntry(boss);
    return boss;
}

export function hasRemainingRootWalkerLoot() {
    for (const id in ENTITIES.OBJECTS) {
        const object = ENTITIES.OBJECTS[id];
        if (!object) continue;
        if ((object.world || WORLD_MAIN) !== WORLD_ROOT_DIMENSION) continue;
        if (object.source === 'root_walker' || object.dropSource === 'root_walker') {
            return true;
        }
    }
    return false;
}

export function getYetiBoss() {
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== 8) continue;
        if ((mob.world || WORLD_MAIN) !== WORLD_YETI_DIMENSION) continue;
        if (mob.hp <= 0) continue;
        return mob;
    }
    return null;
}

export function hasActiveYetiDimensionPlayers() {
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        if (!player || !player.isAlive) continue;
        if ((player.world || WORLD_MAIN) !== WORLD_YETI_DIMENSION) continue;
        return true;
    }
    return false;
}

export function isYetiEncounterSpawnLocked() {
    return yetiEncounterOpen || hasActiveYetiDimensionPlayers();
}

export function openYetiEncounter() {
    yetiEncounterOpen = true;
    yetiBossDefeated = false;
    yetiEncounterOpenedAt = performance.now();
    yetiEncounterLastEnteredAt = 0;
    yetiIntroStarted = false;
}

export function markYetiBossDefeated() {
    if (!yetiEncounterOpen) return;
    yetiBossDefeated = true;
}

export function isYetiEncounterOpen() {
    return yetiEncounterOpen;
}

export function markYetiDimensionEntry(now = performance.now()) {
    if (!yetiEncounterOpen) return;
    yetiEncounterLastEnteredAt = now;
}

export function getYetiEncounterLastActivityAt() {
    return yetiEncounterLastEnteredAt || yetiEncounterOpenedAt || 0;
}

export function shouldCloseYetiEncounter() {
    if (!yetiEncounterOpen) return false;
    const lastActivityAt = getYetiEncounterLastActivityAt();
    if (lastActivityAt > 0 && (performance.now() - lastActivityAt) >= (5 * 60 * 1000)) return true;
    return yetiBossDefeated && !hasActiveYetiDimensionPlayers();
}

export function closeYetiEncounterState() {
    yetiEncounterOpen = false;
    yetiBossDefeated = false;
    yetiEncounterOpenedAt = 0;
    yetiEncounterLastEnteredAt = 0;
    yetiIntroStarted = false;
}

export function spawnYetiBoss() {
    ensureYetiDimensionSnowStructures();
    const existingBoss = getYetiBoss();
    if (existingBoss) {
        const boss = existingBoss;
        strengthenEncounterBoss(boss);
        if (boss && yetiEncounterOpen && !yetiIntroStarted) pauseBossUntilFirstEntry(boss);
        return boss;
    }
    const [worldWidth, worldHeight] = getWorldMapSize(WORLD_YETI_DIMENSION);
    const yetiRadius = Math.max(1, Math.floor(dataMap.MOBS?.[8]?.radius || 188));
    const yetiSpawn = {
        x: Math.max(yetiRadius + 120, Math.min(worldWidth - yetiRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.x)),
        y: Math.max(yetiRadius + 120, Math.min(worldHeight - yetiRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.y))
    };
    ENTITIES.newEntity({
        entityType: 'mob',
        id: getId('MOBS'),
        x: yetiSpawn.x,
        y: yetiSpawn.y,
        type: 8,
        world: WORLD_YETI_DIMENSION
    });
    const boss = getYetiBoss();
    strengthenEncounterBoss(boss);
    if (boss && yetiEncounterOpen && !yetiIntroStarted) pauseBossUntilFirstEntry(boss);
    return boss;
}

export function hasActiveDuneDimensionPlayers() {
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        if (!player || !player.isAlive) continue;
        if ((player.world || WORLD_MAIN) !== WORLD_DUNE_DIMENSION) continue;
        return true;
    }
    return false;
}

export function getDuneBoss() {
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== 16) continue;
        if ((mob.world || WORLD_MAIN) !== WORLD_DUNE_DIMENSION) continue;
        if (mob.hp <= 0) continue;
        return mob;
    }
    return null;
}

export function isDuneEncounterSpawnLocked() {
    return duneEncounterOpen || hasActiveDuneDimensionPlayers();
}

export function openDuneEncounter() {
    duneEncounterOpen = true;
    duneBossDefeated = false;
    duneEncounterOpenedAt = performance.now();
    duneEncounterLastEnteredAt = 0;
    duneIntroStarted = false;
}

export function markDuneBossDefeated() {
    if (!duneEncounterOpen) return;
    duneBossDefeated = true;
}

export function isDuneEncounterOpen() {
    return duneEncounterOpen;
}

export function markDuneDimensionEntry(now = performance.now()) {
    if (!duneEncounterOpen) return;
    duneEncounterLastEnteredAt = now;
}

export function getDuneEncounterLastActivityAt() {
    return duneEncounterLastEnteredAt || duneEncounterOpenedAt || 0;
}

export function shouldCloseDuneEncounter() {
    if (!duneEncounterOpen) return false;
    const lastActivityAt = getDuneEncounterLastActivityAt();
    if (lastActivityAt > 0 && (performance.now() - lastActivityAt) >= (5 * 60 * 1000)) return true;
    return duneBossDefeated && !hasActiveDuneDimensionPlayers();
}

export function closeDuneEncounterState() {
    duneEncounterOpen = false;
    duneBossDefeated = false;
    duneEncounterOpenedAt = 0;
    duneEncounterLastEnteredAt = 0;
    duneIntroStarted = false;
}

export function spawnDuneBoss() {
    ensureDuneDimensionDesertStructures();
    if (duneBossDefeated) return null;
    const existingBoss = getDuneBoss();
    if (existingBoss) {
        const boss = existingBoss;
        strengthenEncounterBoss(boss);
        if (boss && duneEncounterOpen && !duneIntroStarted) pauseBossUntilFirstEntry(boss);
        return boss;
    }
    const [worldWidth, worldHeight] = getWorldMapSize(WORLD_DUNE_DIMENSION);
    const bossRadius = Math.max(1, Math.floor(dataMap.MOBS?.[16]?.radius || 188));
    const bossSpawn = {
        x: Math.max(bossRadius + 120, Math.min(worldWidth - bossRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.x)),
        y: Math.max(bossRadius + 120, Math.min(worldHeight - bossRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.y))
    };
    ENTITIES.newEntity({
        entityType: 'mob',
        id: getId('MOBS'),
        x: bossSpawn.x,
        y: bossSpawn.y,
        type: 16,
        world: WORLD_DUNE_DIMENSION
    });
    const boss = getDuneBoss();
    strengthenEncounterBoss(boss);
    if (boss && duneEncounterOpen && !duneIntroStarted) pauseBossUntilFirstEntry(boss);
    return boss;
}

export function hasActiveInfernoDimensionPlayers() {
    for (const id in ENTITIES.PLAYERS) {
        const player = ENTITIES.PLAYERS[id];
        if (!player || !player.isAlive) continue;
        if ((player.world || WORLD_MAIN) !== WORLD_INFERNO_DIMENSION) continue;
        return true;
    }
    return false;
}

export function getInfernoBoss() {
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== 17) continue;
        if ((mob.world || WORLD_MAIN) !== WORLD_INFERNO_DIMENSION) continue;
        if (mob.hp <= 0) continue;
        return mob;
    }
    return null;
}

export function isInfernoEncounterSpawnLocked() {
    return infernoEncounterOpen || hasActiveInfernoDimensionPlayers();
}

export function openInfernoEncounter() {
    infernoEncounterOpen = true;
    infernoBossDefeated = false;
    infernoEncounterOpenedAt = performance.now();
    infernoEncounterLastEnteredAt = 0;
    infernoIntroStarted = false;
}

export function markInfernoBossDefeated() {
    if (!infernoEncounterOpen) return;
    infernoBossDefeated = true;
}

export function isInfernoEncounterOpen() {
    return infernoEncounterOpen;
}

export function markInfernoDimensionEntry(now = performance.now()) {
    if (!infernoEncounterOpen) return;
    infernoEncounterLastEnteredAt = now;
}

export function getInfernoEncounterLastActivityAt() {
    return infernoEncounterLastEnteredAt || infernoEncounterOpenedAt || 0;
}

export function shouldCloseInfernoEncounter() {
    if (!infernoEncounterOpen) return false;
    const lastActivityAt = getInfernoEncounterLastActivityAt();
    if (lastActivityAt > 0 && (performance.now() - lastActivityAt) >= (5 * 60 * 1000)) return true;
    return infernoBossDefeated && !hasActiveInfernoDimensionPlayers();
}

export function closeInfernoEncounterState() {
    infernoEncounterOpen = false;
    infernoBossDefeated = false;
    infernoEncounterOpenedAt = 0;
    infernoEncounterLastEnteredAt = 0;
    infernoIntroStarted = false;
}

export function spawnInfernoBoss() {
    ensureInfernoDimensionMagmaStructures();
    if (infernoBossDefeated) return null;
    const existingBoss = getInfernoBoss();
    if (existingBoss) {
        const boss = existingBoss;
        strengthenEncounterBoss(boss);
        if (boss && infernoEncounterOpen && !infernoIntroStarted) pauseBossUntilFirstEntry(boss);
        return boss;
    }
    const [worldWidth, worldHeight] = getWorldMapSize(WORLD_INFERNO_DIMENSION);
    const bossRadius = Math.max(1, Math.floor(dataMap.MOBS?.[17]?.radius || 188));
    const bossSpawn = {
        x: Math.max(bossRadius + 120, Math.min(worldWidth - bossRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.x)),
        y: Math.max(bossRadius + 120, Math.min(worldHeight - bossRadius - 120, BOSS_DIMENSION_BOSS_SPAWN.y))
    };
    ENTITIES.newEntity({
        entityType: 'mob',
        id: getId('MOBS'),
        x: bossSpawn.x,
        y: bossSpawn.y,
        type: 17,
        world: WORLD_INFERNO_DIMENSION
    });
    const boss = getInfernoBoss();
    strengthenEncounterBoss(boss);
    if (boss && infernoEncounterOpen && !infernoIntroStarted) pauseBossUntilFirstEntry(boss);
    return boss;
}


export function spawnObject(type, x, y, amount = 1, source = null, world = null) {
    type = resolveObjectType(type);
    const objectConfig = dataMap.OBJECTS[type];
    if (!objectConfig) return null;
    const worldId = world || source?.world || 'main';
    const mapSize = getWorldMapSize(worldId);
    const radius = objectConfig.radius || 50;
    const isChestSpawn = !!objectConfig.isChest;
    let spawnZone = null;
    const blockingStructures = [];
    for (const id in ENTITIES.STRUCTURES) {
        const struct = ENTITIES.STRUCTURES[id];
        if (!struct || (struct.world || 'main') !== worldId) continue;
        if (struct.type === 1 && !spawnZone) {
            spawnZone = struct;
            continue;
        }
        // Shrines (4, 8, 9, 10), Portals (5), and Rocks (2, 6, 7) should block spawns.
        if (isRockStructureType(struct.type) || [4, 5, 8, 9, 10].includes(struct.type)) {
            blockingStructures.push(struct);
        }
    }

    const allowedChestQuadrants = objectConfig.isChest
        ? CHEST_WORLD_SPAWN_QUADRANTS[type] || null
        : null;

    const isSpawnPositionValid = (candidateX, candidateY) => {
        const distanceToSpawnSq = spawnZone ? (candidateX - spawnZone.x) ** 2 + (candidateY - spawnZone.y) ** 2 : 2000 ** 2;

        const riverBuffer = objectConfig.riverBuffer || 0;
        const inRiver = worldHasRivers(worldId) ? isPointInRiver(mapSize, candidateX, candidateY, radius + riverBuffer) : false;
        const nearSpawn = spawnZone ? distanceToSpawnSq < (spawnZone.radius + 200) ** 2 : false;
        const outOfBounds = candidateX < 100 || candidateX > (mapSize[0] - 100) || candidateY < 100 || candidateY > (mapSize[1] - 100);

        let obstructed = false;
        for (let i = 0; i < blockingStructures.length; i++) {
            const struct = blockingStructures[i];
            const dx = candidateX - struct.x;
            const dy = candidateY - struct.y;
            const structConfig = dataMap.STRUCTURES[struct.type];
            const avoidanceRadius = structConfig?.reservedSpawnRadius || struct.radius || 0;
            if (dx * dx + dy * dy < (radius + avoidanceRadius) ** 2) {
                obstructed = true;
                break;
            }
        }

        let validSide = true;
        // For quadrant-locked world chest spawns, quadrant rules are the source of truth.
        // This avoids legacy spawnSide flags (e.g. chest4 left) blocking intended quadrants.
        if (!Array.isArray(allowedChestQuadrants)) {
            if (objectConfig.spawnSide === 'left') {
                const { left } = getRiverBoundsAtY(mapSize, candidateY);
                if (candidateX > left - radius - riverBuffer) validSide = false;
            } else if (objectConfig.spawnSide === 'right') {
                const { right } = getRiverBoundsAtY(mapSize, candidateY);
                if (candidateX < right + radius + riverBuffer) validSide = false;
            }
        }

        let validQuadrant = true;
        if (Array.isArray(allowedChestQuadrants)) {
            validQuadrant = allowedChestQuadrants.includes(getMapQuadrant(candidateX, candidateY));
        }

        let nearChest = false;
        if (isChestSpawn) {
            for (const id in ENTITIES.OBJECTS) {
                const obj = ENTITIES.OBJECTS[id];
                if (!obj || (obj.world || 'main') !== worldId || !dataMap.OBJECTS[obj.type]?.isChest) continue;
                const existingRadius = dataMap.OBJECTS[obj.type]?.radius || obj.radius || 50;
                const minChestDistance = radius + existingRadius + CHEST_MIN_SPAWN_GAP;
                const dx = candidateX - obj.x;
                const dy = candidateY - obj.y;
                if (dx * dx + dy * dy < minChestDistance * minChestDistance) {
                    nearChest = true;
                    break;
                }
            }
        }

        return !inRiver && !nearSpawn && !outOfBounds && !obstructed && !nearChest && validSide && validQuadrant;
    };

    // If x or y is missing, find a valid position.
    if (x === undefined || y === undefined) {
        let validPosition = false;
        let attempts = 0;

        if (isChestSpawn) {
            const candidatePositions = buildChestSpawnCandidates(type, mapSize, x, y);
            for (let i = 0; i < candidatePositions.length; i++) {
                const candidate = candidatePositions[i];
                if (isSpawnPositionValid(candidate.x, candidate.y)) {
                    x = candidate.x;
                    y = candidate.y;
                    validPosition = true;
                    break;
                }
            }
        }

        while (!validPosition && attempts < 5000) {
            attempts++;
            const candidateX = Math.floor(Math.random() * mapSize[0]);
            const candidateY = Math.floor(Math.random() * mapSize[1]);
            if (isSpawnPositionValid(candidateX, candidateY)) {
                x = candidateX;
                y = candidateY;
                validPosition = true;
            }
        }
        if (!validPosition) return null;
    } else if (!isSpawnPositionValid(x, y)) {
        return null;
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
    const spawned = ENTITIES.OBJECTS[id];
    if (spawned && isWeaponRank(type)) {
        stackNearbySwordDrops(spawned);
    }
    return spawned;
}

function stackNearbySwordDrops(spawned) {
    if (!spawned || !isWeaponRank(spawned.type)) return;
    if ((spawned.amount || 1) >= 3) return;
    const world = spawned.world || 'main';
    const radius = 30;
    const radiusSq = radius * radius;
    const singles = [];
    for (const id in ENTITIES.OBJECTS) {
        const obj = ENTITIES.OBJECTS[id];
        if (!obj) continue;
        if ((obj.world || 'main') !== world) continue;
        if (!isWeaponRank(obj.type) || obj.type !== spawned.type) continue;
        const amount = Math.max(1, Math.floor(obj.amount || 1));
        if (amount > 1) continue;
        singles.push(obj);
    }

    if (singles.length < 3) return;

    // Build a linked cluster starting from the spawned drop (chain-link support).
    const cluster = new Set();
    const queue = [spawned];
    while (queue.length) {
        const cur = queue.pop();
        if (!cur || cluster.has(cur)) continue;
        cluster.add(cur);
        for (let i = 0; i < singles.length; i++) {
            const other = singles[i];
            if (!other || cluster.has(other)) continue;
            const dx = other.x - cur.x;
            const dy = other.y - cur.y;
            if ((dx * dx + dy * dy) <= radiusSq) {
                queue.push(other);
            }
        }
    }

    if (cluster.size < 3) return;

    const clusterArr = Array.from(cluster);
    clusterArr.sort((a, b) => {
        const adx = a.x - spawned.x;
        const ady = a.y - spawned.y;
        const bdx = b.x - spawned.x;
        const bdy = b.y - spawned.y;
        return (adx * adx + ady * ady) - (bdx * bdx + bdy * bdy);
    });

    const toConsume = clusterArr.slice(0, 3);
    for (let i = 0; i < toConsume.length; i++) {
        const obj = toConsume[i];
        if (obj === spawned) continue;
        ENTITIES.deleteEntity('object', obj.id);
    }
    spawned.amount = 3;
}

// spawn chests
for (const type of getChestObjectTypes()) {
    // Quadrant rules for world chest spawning:
    // TL: chest1, BL: chest2, TR: chest3, BR: chest4.
    if (!CHEST_WORLD_SPAWN_QUADRANTS[type]) continue;
    const count = dataMap.OBJECTS[type]?.worldSpawnCount || 0;
    for (let i = 0; i < count; i++) {
        spawnObject(type);
    }
}

export const brokenObjects = {};

export function clearWorldEntities(world) {
    if (!world) return;
    for (const id in ENTITIES.MOBS) {
        if ((ENTITIES.MOBS[id].world || 'main') === world) delete ENTITIES.MOBS[id];
    }
    for (const id in ENTITIES.STRUCTURES) {
        if ((ENTITIES.STRUCTURES[id].world || 'main') === world) delete ENTITIES.STRUCTURES[id];
    }
    for (const id in ENTITIES.OBJECTS) {
        if ((ENTITIES.OBJECTS[id].world || 'main') === world) delete ENTITIES.OBJECTS[id];
    }
    for (const id in ENTITIES.PROJECTILES) {
        if ((ENTITIES.PROJECTILES[id].world || 'main') === world) delete ENTITIES.PROJECTILES[id];
    }
    for (const id in deadMobs) {
        if ((deadMobs[id].world || 'main') === world) delete deadMobs[id];
    }
    for (const id in brokenObjects) {
        if ((brokenObjects[id].world || 'main') === world) delete brokenObjects[id];
    }
}

export function deleteWorldState(world) {
    if (!world) return;
    clearWorldEntities(world);
    WORLD_STRUCTURE_SEEDS.delete(world);
}
