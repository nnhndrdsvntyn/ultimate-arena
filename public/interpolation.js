import { TPS } from './shared/datamap.js';

const TWO_PI = Math.PI * 2;
const DEFAULT_FRAME_MS = 1000 / 60;
const SNAP_DISTANCE_SQ = 900 * 900;

export function getEntityDeltaMs(entity) {
    const now = performance.now();
    const last = Number.isFinite(entity?._lastInterpAt) ? entity._lastInterpAt : now - DEFAULT_FRAME_MS;
    entity._lastInterpAt = now;
    return Math.max(1, Math.min(100, now - last));
}

export function getTimeLerpFactor(dtMs, speed = 1) {
    const serverFrameMs = 1000 / Math.max(1, TPS.server || 20);
    return Math.max(0, Math.min(1, 1 - Math.exp(-(dtMs * Math.max(0.01, speed)) / serverFrameMs)));
}

export function lerpEntityPosition(entity, dtMs, speed = 1, settleThreshold = 0.25) {
    if (typeof entity.newX === 'undefined' || typeof entity.newY === 'undefined') return false;
    if (typeof entity.x === 'undefined' || typeof entity.y === 'undefined') {
        entity.x = entity.newX;
        entity.y = entity.newY;
        return true;
    }

    const dx = entity.newX - entity.x;
    const dy = entity.newY - entity.y;
    if ((dx * dx + dy * dy) > SNAP_DISTANCE_SQ) {
        entity.x = entity.newX;
        entity.y = entity.newY;
        return true;
    }

    const factor = getTimeLerpFactor(dtMs, speed);
    if (Math.abs(dx) <= settleThreshold) {
        entity.x = entity.newX;
    } else {
        entity.x += dx * factor;
    }
    if (Math.abs(dy) <= settleThreshold) {
        entity.y = entity.newY;
    } else {
        entity.y += dy * factor;
    }
    return true;
}

export function lerpAngle(current, target, factor) {
    return current + ((((target - current) + Math.PI * 3) % TWO_PI) - Math.PI) * factor;
}

export function normalizeAngle(angle) {
    return ((angle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}
