import { camera, LC, Vars } from './client.js';

export const HIGH_ROV_THRESHOLD = 5;

export function getRenderQuality(entity, radius = entity?.radius || 0) {
    return getRenderQualityAt(entity?.x || 0, entity?.y || 0, radius);
}

export function getRenderQualityAt(x = 0, y = 0, radius = 0) {
    const viewRangeMult = Math.max(0.1, Number(Vars.viewRangeMult) || 1);
    const zoom = Math.max(0.001, Number(LC.zoom) || 1);
    const screenRadius = Math.max(0, radius || 0) * zoom;
    const dx = x - (camera.x + (LC.width / 2));
    const dy = y - (camera.y + (LC.height / 2));
    const screenDistance = Math.hypot(dx, dy) * zoom;
    const highRov = viewRangeMult >= HIGH_ROV_THRESHOLD;
    const tiny = highRov && screenRadius < 12;
    const far = highRov && (tiny || screenDistance > Math.max(LC.width, LC.height) * 0.34);
    const veryFar = highRov && (screenRadius < 7 || screenDistance > Math.max(LC.width, LC.height) * 0.48);

    return {
        viewRangeMult,
        screenRadius,
        highRov,
        far,
        veryFar,
        showNames: !highRov,
        showChat: !veryFar,
        showBars: !far,
        showAccessories: !veryFar,
        showStatusOverlays: !veryFar,
        stackRenderLimit: veryFar ? 1 : (far ? 2 : Infinity)
    };
}
