import { ENTITIES } from './game.js';

const HUNTER_DEBUG_INTERVAL_MS = 1000;
let loggedGroupsOnce = false;
let resolveCollisionCalls = 0;
let collisionFrames = 0;
let collisionWindowStart = performance.now();

export function startHunterDebugInterval() {
    return;
}

export function recordResolveCollisionCall() {
    resolveCollisionCalls++;
}

export function recordCollisionFrame() {
    collisionFrames++;
    const now = performance.now();
    if (now - collisionWindowStart < 1000) return;

    resolveCollisionCalls = 0;
    collisionFrames = 0;
    collisionWindowStart = now;
}
