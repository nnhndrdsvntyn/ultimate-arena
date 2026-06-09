export function getRiverBoundsAtY(mapSize, y, options = {}) {
    const width = mapSize?.[0] || 0;
    const height = mapSize?.[1] || 0;
    const baseLeft = width * 0.47;
    const baseRight = width * 0.53;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Number.isFinite(options.radius) ? options.radius : 1400;

    const dy = y - centerY;
    const dySq = dy * dy;
    if (dySq >= radius * radius) {
        return { left: baseLeft, right: baseRight };
    }
    const halfWidth = Math.sqrt((radius * radius) - dySq);
    const left = Math.min(baseLeft, centerX - halfWidth);
    const right = Math.max(baseRight, centerX + halfWidth);
    return { left, right };
}

export function getRiverBoundsAtX(mapSize, x, options = {}) {
    const width = mapSize?.[0] || 0;
    const height = mapSize?.[1] || 0;
    const baseTop = height * 0.47;
    const baseBottom = height * 0.53;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Number.isFinite(options.radius) ? options.radius : 1400;

    const dx = x - centerX;
    const dxSq = dx * dx;
    if (dxSq >= radius * radius) {
        return { top: baseTop, bottom: baseBottom };
    }
    const halfWidth = Math.sqrt((radius * radius) - dxSq);
    const top = Math.min(baseTop, centerY - halfWidth);
    const bottom = Math.max(baseBottom, centerY + halfWidth);
    return { top, bottom };
}

export function isPointInRiver(mapSize, x, y, padding = 0, options = {}) {
    const boundsV = getRiverBoundsAtY(mapSize, y, options);
    const inVertical = x >= (boundsV.left - padding) && x <= (boundsV.right + padding);
    const boundsH = getRiverBoundsAtX(mapSize, x, options);
    const inHorizontal = y >= (boundsH.top - padding) && y <= (boundsH.bottom + padding);
    return inVertical || inHorizontal;
}

export function getCenterDiagonalBridgeSegments(mapSize, safeZoneRadius, options = {}) {
    const width = mapSize?.[0] || 0;
    const height = mapSize?.[1] || 0;
    if (!width || !height) return [];

    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Math.max(1, Number.isFinite(safeZoneRadius) ? safeZoneRadius : 500);
    const step = Math.max(2, Number.isFinite(options.step) ? options.step : 8);
    const landPad = Math.max(0, Number.isFinite(options.landPad) ? options.landPad : 24);
    const maxDistance = Math.max(width, height) * 2;
    const invSqrt2 = Math.SQRT1_2;

    const dirs = [
        { x: -invSqrt2, y: -invSqrt2 }, // top-left
        { x: invSqrt2, y: -invSqrt2 },  // top-right
        { x: -invSqrt2, y: invSqrt2 },  // bottom-left
        { x: invSqrt2, y: invSqrt2 }    // bottom-right
    ];

    const segments = [];
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const startDist = radius;
        const startX = centerX + dir.x * startDist;
        const startY = centerY + dir.y * startDist;
        let endDist = null;

        for (let dist = startDist; dist <= maxDistance; dist += step) {
            const x = centerX + dir.x * dist;
            const y = centerY + dir.y * dist;
            if (!isPointInRiver(mapSize, x, y)) {
                endDist = dist + landPad;
                break;
            }
        }

        if (!Number.isFinite(endDist)) continue;
        segments.push({
            x1: startX,
            y1: startY,
            x2: centerX + dir.x * endDist,
            y2: centerY + dir.y * endDist
        });
    }

    return segments;
}
