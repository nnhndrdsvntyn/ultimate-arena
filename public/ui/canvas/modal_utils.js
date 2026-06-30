export function resetCanvasModalState(state, resetValues = {}) {
    state.visible = false;
    state.rect = null;
    state.hitboxes = [];

    Object.entries(resetValues).forEach(([key, value]) => {
        if (value === '__clear_map__') {
            state[key]?.clear?.();
        } else {
            state[key] = value;
        }
    });
}

export function setupCanvasModalLayout(LC, state, { maxWidth, maxHeight, marginX, marginY }) {
    const panelW = Math.min(maxWidth, LC.width - marginX);
    const panelH = Math.min(maxHeight, LC.height - marginY);
    if (state.panelX === null || state.panelY === null) {
        state.panelX = Math.floor((LC.width - panelW) / 2);
        state.panelY = Math.floor((LC.height - panelH) / 2);
    }

    const rect = {
        x: state.panelX,
        y: state.panelY,
        width: panelW,
        height: panelH
    };

    const clientTopLeft = LC.logicalToClient(rect.x, rect.y);
    const clientBottomRight = LC.logicalToClient(rect.x + rect.width, rect.y + rect.height);
    rect.clientRect = {
        left: clientTopLeft.x,
        top: clientTopLeft.y,
        right: clientBottomRight.x,
        bottom: clientBottomRight.y,
        width: clientBottomRight.x - clientTopLeft.x,
        height: clientBottomRight.y - clientTopLeft.y
    };

    state.visible = true;
    state.hitboxes = [];
    state.rect = rect;
    return rect;
}

export function drawCanvasModalBackdrop(LC, color) {
    LC.ctx.save();
    LC.ctx.fillStyle = color;
    LC.ctx.fillRect(0, 0, LC.width, LC.height);
    LC.ctx.restore();
}

export function drawCanvasModalCloseButton(LC, x, y, size = 26) {
    LC.drawRect({
        pos: [x, y],
        size: [size, size],
        color: 'transparent',
        cornerRadius: 8
    });
    LC.drawText({
        text: '✕',
        pos: [x + size / 2, y + size / 2 + 6],
        font: '900 20px Nunito',
        color: '#ef4444',
        textAlign: 'center'
    });

    return { x, y, width: size, height: size };
}

export function getClientRectFromLogicalRect(LC, x, y, width, height) {
    const clientTopLeft = LC.logicalToClient(x, y);
    const clientBottomRight = LC.logicalToClient(x + width, y + height);
    return {
        left: clientTopLeft.x,
        top: clientTopLeft.y,
        right: clientBottomRight.x,
        bottom: clientBottomRight.y,
        width: clientBottomRight.x - clientTopLeft.x,
        height: clientBottomRight.y - clientTopLeft.y
    };
}

export function drawCanvasModalTabs(LC, tabs, activeTab, { x, y, width, height }) {
    const tabW = Math.floor(width / tabs.length);
    tabs.forEach((tab, i) => {
        const tx = x + i * tabW;
        const isActive = activeTab === tab;
        LC.drawRect({
            pos: [tx, y],
            size: [tabW - 8, height],
            color: isActive ? '#3b82f6' : '#334155',
            stroke: '#111827',
            strokeWidth: 4,
            cornerRadius: 10
        });
        LC.drawText({
            text: tab.toUpperCase(),
            pos: [tx + (tabW - 8) / 2, y + 20],
            font: '900 12px Nunito',
            color: '#ffffff',
            textAlign: 'center'
        });
    });
    return tabW;
}

export function createClippedBodyRegion(LC, { x, y, width, height, padding, scrollY }) {
    const bodyRect = { x, y, width, height };
    const bodyContentStart = y + padding;
    const body = {
        rect: bodyRect,
        x: x + padding,
        y: bodyContentStart - scrollY,
        width: width - (padding * 2),
        visibleHeight: height - (padding * 2),
        contentStart: bodyContentStart
    };

    LC.ctx.save();
    LC.ctx.beginPath();
    LC.ctx.rect(x, y, width, height);
    LC.ctx.clip();
    return body;
}

export function finishClippedBodyRegion(LC) {
    LC.ctx.restore();
}

export function clampModalScroll(state, contentHeight, visibleHeight) {
    state.scrollMax = Math.max(0, (contentHeight - visibleHeight) + 10);
    if (state.scrollY > state.scrollMax) state.scrollY = state.scrollMax;
    if (state.scrollY < 0) state.scrollY = 0;
}

export function drawModalScrollbar(LC, scrollY, scrollMax, contentHeight, bodyRect, trackX) {
    if (scrollMax <= 0) return;
    const trackY = bodyRect.y + 2;
    const trackH = bodyRect.height;
    LC.drawRect({
        pos: [trackX, trackY],
        size: [4, trackH - 4],
        color: 'rgba(255,255,255,0.08)',
        cornerRadius: 3
    });
    const thumbH = Math.max(28, (bodyRect.height * bodyRect.height) / (contentHeight + 1));
    const thumbY = trackY + (scrollY / scrollMax) * ((trackH - 4) - thumbH);
    LC.drawRect({
        pos: [trackX, thumbY],
        size: [4, thumbH],
        color: 'rgba(255,255,255,0.4)',
        cornerRadius: 3
    });
}

export function wrapCanvasText(LC, text, maxWidth, font) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (LC.measureText({ text: next, font }).width <= maxWidth) {
            line = next;
        } else {
            if (line) lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}
