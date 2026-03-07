import { dataMap } from './datamap.js';

const ROCK_EXTRA_GAP = 100;
const ROCK_SPAWN_PADDING = 500;

function createSeededRng(seed) {
    let state = (seed >>> 0) || 1;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomInt(rng, min, max) {
    if (max <= min) return min;
    return Math.floor(min + (rng() * (max - min + 1)));
}

function getRandomRockPosition(rng, radius, side, mapSize) {
    const leftBiomeMaxX = mapSize[0] * 0.47;
    const rightBiomeMinX = mapSize[0] * 0.53;
    const minX = side === 'right'
        ? Math.ceil(rightBiomeMinX + radius + ROCK_EXTRA_GAP)
        : ROCK_SPAWN_PADDING;
    const maxX = side === 'right'
        ? mapSize[0] - ROCK_SPAWN_PADDING
        : Math.floor(leftBiomeMaxX - radius - ROCK_EXTRA_GAP);
    const minY = ROCK_SPAWN_PADDING;
    const maxY = mapSize[1] - ROCK_SPAWN_PADDING;

    return {
        x: randomInt(rng, minX, Math.max(minX, maxX)),
        y: randomInt(rng, minY, Math.max(minY, maxY))
    };
}

function isValidRockPosition(x, y, radius, spawnZone, side, mapSize, structures) {
    const leftBiomeMaxX = mapSize[0] * 0.47;
    const rightBiomeMinX = mapSize[0] * 0.53;
    const dx = x - spawnZone.x;
    const dy = y - spawnZone.y;
    const distanceSq = dx * dx + dy * dy;
    const minX = side === 'right'
        ? Math.ceil(rightBiomeMinX + radius + ROCK_EXTRA_GAP)
        : ROCK_SPAWN_PADDING;
    const maxX = side === 'right'
        ? mapSize[0] - ROCK_SPAWN_PADDING
        : Math.floor(leftBiomeMaxX - radius - ROCK_EXTRA_GAP);
    const spawnZoneHalf = spawnZone.safeZoneHalfSize || spawnZone.radius || 500;
    const minSpawnZoneDistanceSq = (spawnZoneHalf + 100) * (spawnZoneHalf + 100);
    if (!(distanceSq > minSpawnZoneDistanceSq &&
        x >= minX && x <= maxX &&
        y >= ROCK_SPAWN_PADDING && y <= (mapSize[1] - ROCK_SPAWN_PADDING))) {
        return false;
    }

    for (const existing of structures) {
        if (existing.type !== 2) continue;
        const existingRadius = dataMap.STRUCTURES[existing.type]?.radius || 0;
        const minCenterDist = radius + existingRadius + ROCK_EXTRA_GAP;
        const ex = x - existing.x;
        const ey = y - existing.y;
        if ((ex * ex + ey * ey) < (minCenterDist * minCenterDist)) {
            return false;
        }
    }

    return true;
}

export function generateSeededStructureLayout(seed, mapSize, options = {}) {
    const rockCount = Math.max(0, Math.floor(options.rockCount ?? 100));
    const bushCount = Math.max(0, Math.floor(options.bushCount ?? 100));
    const rng = createSeededRng(seed);

    const structures = [];
    let nextId = 1;

    const spawnX = Math.floor(mapSize[0] * 0.5);
    const spawnY = Math.floor(mapSize[1] * 0.5);
    const spawnCfg = dataMap.STRUCTURES[1] || {};
    const spawnZone = {
        id: nextId++,
        x: spawnX,
        y: spawnY,
        type: 1,
        radius: spawnCfg.radius || 500,
        safeZoneHalfSize: Math.max(1, Math.floor(spawnCfg.safeZoneHalfSize || spawnCfg.radius || 500))
    };
    structures.push(spawnZone);

    const rockRadius = dataMap.STRUCTURES[2]?.radius || 0;
    for (let i = 0; i < rockCount; i++) {
        let x = 0;
        let y = 0;
        let validPosition = false;
        const side = i % 2 === 0 ? 'left' : 'right';
        let attempts = 0;
        while (!validPosition) {
            attempts++;
            const pos = getRandomRockPosition(rng, rockRadius, side, mapSize);
            x = pos.x;
            y = pos.y;
            validPosition = isValidRockPosition(x, y, rockRadius, spawnZone, side, mapSize, structures);
            if (!validPosition && attempts > 5000) break;
        }
        if (!validPosition) continue;
        structures.push({ id: nextId++, x, y, type: 2 });
    }

    const bushRadius = dataMap.STRUCTURES[3]?.radius || 0;
    const leftBiomeMaxX = mapSize[0] * 0.47;
    const maxTreeX = Math.floor(leftBiomeMaxX - bushRadius);
    for (let i = 0; i < bushCount; i++) {
        let x = 0;
        let y = 0;
        let validPosition = false;
        let attempts = 0;
        while (!validPosition) {
            attempts++;
            x = randomInt(rng, ROCK_SPAWN_PADDING, Math.max(ROCK_SPAWN_PADDING, maxTreeX));
            y = randomInt(rng, ROCK_SPAWN_PADDING, mapSize[1] - ROCK_SPAWN_PADDING);
            const dx = x - spawnZone.x;
            const dy = y - spawnZone.y;
            const distanceSq = dx * dx + dy * dy;
            const spawnZoneHalf = spawnZone.safeZoneHalfSize || spawnZone.radius || 500;
            const minDistanceSq = (spawnZoneHalf + 100) * (spawnZoneHalf + 100);

            if (distanceSq > minDistanceSq &&
                x >= ROCK_SPAWN_PADDING && x <= maxTreeX &&
                y >= ROCK_SPAWN_PADDING && y <= (mapSize[1] - ROCK_SPAWN_PADDING)) {
                validPosition = true;
            }
            if (!validPosition && attempts > 5000) break;
        }
        if (!validPosition) continue;
        structures.push({ id: nextId++, x, y, type: 3 });
    }

    return structures;
}
