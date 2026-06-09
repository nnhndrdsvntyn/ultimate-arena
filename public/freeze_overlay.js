const ICE_ENCASING_IMAGE = 'ice_encasing';
const ICE_ENCASING_ALPHA = 0.7;
const ICE_ENCASING_PADDING_SCALE = 1.5;

export function isFrozen(entity) {
    return performance.now() < (entity?.frozenUntil || 0);
}

export function drawIceEncasingOverlay(LC, screenX, screenY, radius, alpha = 1, entitySize = null) {
    if (!LC || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
    const safeRadius = Math.max(1, Number(radius) || 1);
    const baseWidth = Array.isArray(entitySize) && Number.isFinite(entitySize[0]) && entitySize[0] > 0
        ? entitySize[0]
        : safeRadius * 2;
    const baseHeight = Array.isArray(entitySize) && Number.isFinite(entitySize[1]) && entitySize[1] > 0
        ? entitySize[1]
        : safeRadius * 2;
    const width = baseWidth * ICE_ENCASING_PADDING_SCALE;
    const height = baseHeight * ICE_ENCASING_PADDING_SCALE;
    LC.drawImage({
        name: ICE_ENCASING_IMAGE,
        pos: [screenX - (width / 2), screenY - (height / 2)],
        size: [width, height],
        transparency: ICE_ENCASING_ALPHA * Math.max(0, Math.min(1, alpha))
    });
}
