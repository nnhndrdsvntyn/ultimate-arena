export const MAP_SIZE = [10000, 10000];

export function setMapSize(width, height) {
    MAP_SIZE[0] = Math.max(1, Math.round(width || 1));
    MAP_SIZE[1] = Math.max(1, Math.round(height || 1));
}

export const ENTITIES = {
    PLAYERS: {},
    leaderboard: [],
    MOBS: {},
    STRUCTURES: {},
    PROJECTILES: {},
    OBJECTS: {},
}

export let STRUCTURE_STATE_VERSION = 0;

export function bumpStructureStateVersion() {
    STRUCTURE_STATE_VERSION++;
    return STRUCTURE_STATE_VERSION;
}

export function resetEntities() {
    ENTITIES.PLAYERS = {};
    ENTITIES.leaderboard = [];
    ENTITIES.MOBS = {};
    ENTITIES.STRUCTURES = {};
    ENTITIES.PROJECTILES = {};
    ENTITIES.OBJECTS = {};
    STRUCTURE_STATE_VERSION++;
}

window.ENTITIES = ENTITIES;
