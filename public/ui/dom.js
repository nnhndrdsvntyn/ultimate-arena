export function createEl(tag, styles = {}, parent = null, props = {}) {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    Object.assign(el, props);
    if (parent) parent.appendChild(el);
    return el;
}

export function makeDraggable(el, handle) {
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    const start = (clientX, clientY) => {
        isDragging = true;
        const rect = el.getBoundingClientRect();
        offset.x = clientX - rect.left;
        offset.y = clientY - rect.top;

        const overlay = el.parentElement;
        if (overlay && overlay.classList.contains('modal-overlay')) {
            overlay.style.alignItems = 'flex-start';
            overlay.style.justifyContent = 'flex-start';
        }

        el.style.position = 'absolute';
        el.style.left = rect.left + 'px';
        el.style.top = rect.top + 'px';
        el.style.margin = '0';
    };

    const move = (clientX, clientY) => {
        if (!isDragging) return;
        el.style.left = (clientX - offset.x) + 'px';
        el.style.top = (clientY - offset.y) + 'px';
    };

    const end = () => {
        isDragging = false;
    };

    handle.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        start(e.clientX, e.clientY);
    };

    handle.ontouchstart = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const touch = e.touches[0];
        start(touch.clientX, touch.clientY);
    };

    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const touch = e.touches[0];
            move(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
}
