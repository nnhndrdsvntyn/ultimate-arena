export const WORLD_MAIN = 'main';
export const WORLD_MAIN_COMMAND = 'main_world';
export const WORLD_TUTORIAL = 'tutorial';
export const WORLD_ROOT_DIMENSION = 'root_dimension';
export const WORLD_YETI_DIMENSION = 'yeti_dimension';
export const WORLD_DUNE_DIMENSION = 'dune_dimension';
export const WORLD_INFERNO_DIMENSION = 'inferno_dimension';

const WORLD_CONFIG = {
    [WORLD_MAIN]: {
        size: [10000, 10000],
        hasRivers: true,
        grassOnly: false,
        seededStructures: true
    },
    [WORLD_TUTORIAL]: {
        size: [10000, 10000],
        hasRivers: false,
        grassOnly: true,
        seededStructures: false
    },
    [WORLD_ROOT_DIMENSION]: {
        size: [3000, 3000],
        hasRivers: false,
        grassOnly: true,
        seededStructures: false
    },
    [WORLD_YETI_DIMENSION]: {
        size: [3000, 3000],
        hasRivers: false,
        grassOnly: false,
        snowOnly: true,
        seededStructures: false
    },
    [WORLD_DUNE_DIMENSION]: {
        size: [3000, 3000],
        hasRivers: false,
        grassOnly: false,
        desertOnly: true,
        seededStructures: false
    },
    [WORLD_INFERNO_DIMENSION]: {
        size: [3000, 3000],
        hasRivers: false,
        grassOnly: false,
        magmaOnly: true,
        seededStructures: false
    }
};

export function isTutorialWorld(world) {
    return typeof world === 'string' && world.startsWith(WORLD_TUTORIAL);
}

export function normalizeWorldId(world) {
    if (isTutorialWorld(world)) return WORLD_TUTORIAL;
    if (world === WORLD_MAIN_COMMAND) return WORLD_MAIN;
    if (world === WORLD_ROOT_DIMENSION) return WORLD_ROOT_DIMENSION;
    if (world === WORLD_YETI_DIMENSION) return WORLD_YETI_DIMENSION;
    if (world === WORLD_DUNE_DIMENSION) return WORLD_DUNE_DIMENSION;
    if (world === WORLD_INFERNO_DIMENSION) return WORLD_INFERNO_DIMENSION;
    if (world === WORLD_MAIN) return WORLD_MAIN;
    return WORLD_MAIN;
}

export function normalizeDimensionTarget(raw) {
    const lower = String(raw || '').trim().toLowerCase();
    if (lower === WORLD_MAIN || lower === WORLD_MAIN_COMMAND) return WORLD_MAIN;
    if (lower === WORLD_ROOT_DIMENSION) return WORLD_ROOT_DIMENSION;
    if (lower === WORLD_YETI_DIMENSION) return WORLD_YETI_DIMENSION;
    if (lower === WORLD_DUNE_DIMENSION) return WORLD_DUNE_DIMENSION;
    if (lower === WORLD_INFERNO_DIMENSION) return WORLD_INFERNO_DIMENSION;
    return null;
}

export function getWorldConfig(world) {
    return WORLD_CONFIG[normalizeWorldId(world)] || WORLD_CONFIG[WORLD_MAIN];
}

export function getWorldMapSize(world) {
    return getWorldConfig(world).size;
}

export function getWorldCenter(world) {
    const [width, height] = getWorldMapSize(world);
    return {
        x: Math.floor(width * 0.5),
        y: Math.floor(height * 0.5)
    };
}

export function worldHasRivers(world) {
    return !!getWorldConfig(world).hasRivers;
}

export function worldIsGrassOnly(world) {
    return !!getWorldConfig(world).grassOnly;
}

export function worldIsSnowOnly(world) {
    return !!getWorldConfig(world).snowOnly;
}

export function worldIsDesertOnly(world) {
    return !!getWorldConfig(world).desertOnly;
}

export function worldIsMagmaOnly(world) {
    return !!getWorldConfig(world).magmaOnly;
}

export function worldUsesSeededStructures(world) {
    return !!getWorldConfig(world).seededStructures;
}
