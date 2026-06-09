import { dataMap, isRockStructureType } from './datamap.js';
import { isPointInRiver, getRiverBoundsAtX } from './river.js';

const ROCK_EXTRA_GAP = 100;
const ROCK_SPAWN_PADDING = 500;
const TREE_ROCK_EXTRA_GAP = 90;
const SHRINE_STRUCTURE_TYPES = new Set([4, 8, 9, 10]);

function getBiomeBounds(quadrant, mapSize, radius, gap = ROCK_EXTRA_GAP, edgePadding = ROCK_SPAWN_PADDING) {
    const leftBiomeMaxX = mapSize[0] * 0.47;
    const rightBiomeMinX = mapSize[0] * 0.53;
    const topBiomeMaxY = mapSize[1] * 0.47;
    const bottomBiomeMinY = mapSize[1] * 0.53;
    const isRight = quadrant === 'tr' || quadrant === 'br';
    const isBottom = quadrant === 'bl' || quadrant === 'br';

    return {
        minX: isRight
            ? Math.ceil(rightBiomeMinX + radius + gap)
            : edgePadding,
        maxX: isRight
            ? mapSize[0] - edgePadding
            : Math.floor(leftBiomeMaxX - radius - gap),
        minY: isBottom
            ? Math.ceil(bottomBiomeMinY + radius + gap)
            : edgePadding,
        maxY: isBottom
            ? mapSize[1] - edgePadding
            : Math.floor(topBiomeMaxY - radius - gap)
    };
}

function isInsideReservedStructure(x, y, radius, structure, extraGap = 0) {
    if (!structure) return false;
    const structureCfg = dataMap.STRUCTURES[structure.type] || {};
    const reservedRadius = Math.max(
        Number(structure.reservedSpawnRadius) || 0,
        Number(structureCfg.reservedSpawnRadius) || 0,
        Number(structure.radius) || 0
    );
    if (reservedRadius <= 0) return false;
    const dx = x - structure.x;
    const dy = y - structure.y;
    const minDist = radius + reservedRadius + Math.max(0, extraGap);
    return (dx * dx + dy * dy) < (minDist * minDist);
}

function isShrineStructureType(type) {
    return SHRINE_STRUCTURE_TYPES.has(Number(type));
}

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

function getRandomRockPosition(rng, radius, quadrant, mapSize, gap = ROCK_EXTRA_GAP) {
    const {
        minX,
        maxX,
        minY,
        maxY
    } = getBiomeBounds(quadrant, mapSize, radius, gap);

    return {
        x: randomInt(rng, minX, Math.max(minX, maxX)),
        y: randomInt(rng, minY, Math.max(minY, maxY))
    };
}

function isValidRockPosition(x, y, radius, spawnZone, quadrant, mapSize, structures, gap = ROCK_EXTRA_GAP) {
    const dx = x - spawnZone.x;
    const dy = y - spawnZone.y;
    const distanceSq = dx * dx + dy * dy;
    const {
        minX,
        maxX,
        minY,
        maxY
    } = getBiomeBounds(quadrant, mapSize, radius, gap);
    const spawnZoneRadius = spawnZone.radius || spawnZone.safeZoneHalfSize || 500;
    const minSpawnZoneDistanceSq = (spawnZoneRadius + 100) * (spawnZoneRadius + 100);
    if (isPointInRiver(mapSize, x, y, radius + gap)) return false;

    if (!(distanceSq > minSpawnZoneDistanceSq &&
        x >= minX && x <= maxX &&
        y >= minY && y <= maxY)) {
        return false;
    }

    for (const existing of structures) {
        if (isShrineStructureType(existing.type) && isInsideReservedStructure(x, y, radius, existing, gap)) {
            return false;
        }
        if (existing.type === 3) {
            const existingRadius = dataMap.STRUCTURES[existing.type]?.radius || 0;
            const minCenterDist = radius + existingRadius + TREE_ROCK_EXTRA_GAP;
            const ex = x - existing.x;
            const ey = y - existing.y;
            if ((ex * ex + ey * ey) < (minCenterDist * minCenterDist)) {
                return false;
            }
            continue;
        }
        if (!isRockStructureType(existing.type)) continue;
        const existingRadius = dataMap.STRUCTURES[existing.type]?.radius || 0;
        const minCenterDist = radius + existingRadius + gap;
        const ex = x - existing.x;
        const ey = y - existing.y;
        if ((ex * ex + ey * ey) < (minCenterDist * minCenterDist)) {
            return false;
        }
    }

    return true;
}

function isTreeTooCloseToLargeRock(x, y, radius, structures, extraGap = TREE_ROCK_EXTRA_GAP) {
    for (const structure of structures) {
        if (!structure || (structure.type !== 2 && structure.type !== 6)) continue;
        const rockRadius = dataMap.STRUCTURES[structure.type]?.radius || structure.radius || 0;
        const minDist = radius + rockRadius + Math.max(0, extraGap);
        const dx = x - structure.x;
        const dy = y - structure.y;
        if ((dx * dx + dy * dy) < (minDist * minDist)) {
            return true;
        }
    }
    return false;
}

export function generateSeededStructureLayout(seed, mapSize, options = {}) {
    const rockCount = Math.max(0, Math.floor(options.rockCount ?? 100));
    const smallRockCount = Math.max(0, Math.floor(options.smallRockCount ?? Math.round(rockCount * 0.5)));
    const bigRockCountPerBiome = Math.max(0, Math.floor(options.bigRockCountPerBiome ?? 2));
    const treeBiomes = ['tl', 'tr', 'bl', 'br'];
    const treeCount = Math.max(0, Math.floor(options.treeCount ?? 100));
    const treeCountPerBiome = Math.max(0, Math.floor(options.treeCountPerBiome ?? Math.floor(treeCount / treeBiomes.length)));
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
        safeZoneHalfSize: Math.max(1, Math.floor(spawnCfg.radius || spawnCfg.safeZoneHalfSize || 500))
    };
    structures.push(spawnZone);

    const shrineCfg = dataMap.STRUCTURES[4] || {};
    const shrine = {
        id: nextId++,
        x: Math.floor(mapSize[0] * 0.25),
        y: Math.floor(mapSize[1] * 0.25),
        type: 4,
        radius: shrineCfg.radius || 50,
        reservedSpawnRadius: shrineCfg.reservedSpawnRadius || 300
    };
    structures.push(shrine);

    const yetiShrineCfg = dataMap.STRUCTURES[8] || {};
    structures.push({
        id: nextId++,
        x: Math.floor(mapSize[0] * 0.75),
        y: Math.floor(mapSize[1] * 0.25),
        type: 8,
        radius: yetiShrineCfg.radius || 80
    });

    const infernoShrineCfg = dataMap.STRUCTURES[9] || {};
    structures.push({
        id: nextId++,
        x: Math.floor(mapSize[0] * 0.75),
        y: Math.floor(mapSize[1] * 0.75),
        type: 9,
        radius: infernoShrineCfg.radius || 80
    });

    const desertShrineCfg = dataMap.STRUCTURES[10] || {};
    structures.push({
        id: nextId++,
        x: Math.floor(mapSize[0] * 0.25),
        y: Math.floor(mapSize[1] * 0.75),
        type: 10,
        radius: desertShrineCfg.radius || 80
    });

    const treeRadius = dataMap.STRUCTURES[3]?.radius || 0;
    for (let biomeIndex = 0; biomeIndex < treeBiomes.length; biomeIndex++) {
        const quadrant = treeBiomes[biomeIndex];
        const bounds = getBiomeBounds(quadrant, mapSize, treeRadius, ROCK_EXTRA_GAP);
        const isBottom = quadrant === 'bl' || quadrant === 'br';
        for (let i = 0; i < treeCountPerBiome; i++) {
            let x = 0;
            let y = 0;
            let validPosition = false;
            let attempts = 0;
            while (!validPosition) {
                attempts++;
                x = randomInt(rng, bounds.minX, Math.max(bounds.minX, bounds.maxX));
                y = randomInt(rng, bounds.minY, Math.max(bounds.minY, bounds.maxY));
                const dx = x - spawnZone.x;
                const dy = y - spawnZone.y;
                const distanceSq = dx * dx + dy * dy;
                const spawnZoneHalf = spawnZone.safeZoneHalfSize || spawnZone.radius || 500;
                const minDistanceSq = (spawnZoneHalf + 100) * (spawnZoneHalf + 100);
                const horizontalBounds = getRiverBoundsAtX(mapSize, x);
                const maxAllowedY = Math.floor(horizontalBounds.top - treeRadius - ROCK_EXTRA_GAP);
                const minAllowedY = Math.ceil(horizontalBounds.bottom + treeRadius + ROCK_EXTRA_GAP);
                const withinVerticalBounds = isBottom
                    ? y >= Math.max(bounds.minY, minAllowedY) && y <= bounds.maxY
                    : y >= bounds.minY && y <= Math.min(bounds.maxY, Math.max(bounds.minY, maxAllowedY));

                const overlapsShrine = structures.some(structure =>
                    isShrineStructureType(structure?.type) && isInsideReservedStructure(x, y, treeRadius, structure, ROCK_EXTRA_GAP)
                );

                if (isPointInRiver(mapSize, x, y, treeRadius + ROCK_EXTRA_GAP)) {
                    validPosition = false;
                } else if (overlapsShrine) {
                    validPosition = false;
                } else if (isTreeTooCloseToLargeRock(x, y, treeRadius, structures, TREE_ROCK_EXTRA_GAP)) {
                    validPosition = false;
                } else if (distanceSq > minDistanceSq &&
                    x >= bounds.minX && x <= bounds.maxX &&
                    withinVerticalBounds) {
                    validPosition = true;
                }
                if (!validPosition && attempts > 5000) break;
            }
            if (!validPosition) continue;
            structures.push({ id: nextId++, x, y, type: 3 });
        }
    }

    const rockBiomes = ['tl', 'tr', 'bl', 'br'];
    const spawnRockGroup = (type, count, quadrants = rockBiomes) => {
        const rockRadius = dataMap.STRUCTURES[type]?.radius || 0;
        for (let i = 0; i < count; i++) {
            let x = 0;
            let y = 0;
            let validPosition = false;
            const quadrant = quadrants[i % quadrants.length];
            let attempts = 0;
            while (!validPosition) {
                attempts++;
                const pos = getRandomRockPosition(rng, rockRadius, quadrant, mapSize);
                x = pos.x;
                y = pos.y;
                validPosition = isValidRockPosition(x, y, rockRadius, spawnZone, quadrant, mapSize, structures);
                if (!validPosition && attempts > 5000) break;
            }
            if (!validPosition) continue;
            structures.push({ id: nextId++, x, y, type });
        }
    };

    for (let i = 0; i < rockBiomes.length; i++) {
        spawnRockGroup(6, bigRockCountPerBiome, [rockBiomes[i]]);
    }
    spawnRockGroup(2, rockCount);
    spawnRockGroup(7, smallRockCount);

    return structures;
}
