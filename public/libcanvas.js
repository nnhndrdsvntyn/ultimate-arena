export const CANVAS_FONT_FAMILY = "'Inter', -apple-system, sans-serif";
const MIPMAP_TARGET_MARGIN = 1.12;

export function normalizeCanvasFont(font = '16px Arial') {
    if (typeof font !== 'string') return font;
    return font.replace(/(?:\s+)(?:Inter|Arial)(?:,\s*sans-serif)?$/i, ` ${CANVAS_FONT_FAMILY}`);
}

export class LibCanvas {
    constructor() {
        this.images = {};
        this.imageMipmaps = {};
        this.imageAverageColors = {};
        this.audios = {};
        this.audioBuffers = {};
        this.audioSrcs = {};
        this.audioContext = null;
        this.textMeasureCache = new Map();
        this.baseLogicalWidth = 1440;
        this.baseLogicalHeight = 760;
        this.logicalWidth = this.baseLogicalWidth;
        this.logicalHeight = this.baseLogicalHeight;
        this.renderPixelWidth = 1920;
        this.renderPixelHeight = 1080;
        this.targetPixelWidth = Math.round(this.renderPixelWidth);
        this.targetPixelHeight = Math.round(this.renderPixelHeight);
        this.clearColor = '#1f4d2e';
        this.width = this.logicalWidth;
        this.height = this.logicalHeight;
        this.offsetX = 0;
        this.offsetY = 0;
        this.uniformScale = 1;
        this.imageScaleX = 1;
        this.imageScaleY = 1;
        this.displayWidth = 0;
        this.displayHeight = 0;
        this.createDOM();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        window.addEventListener('orientationchange', () => this.resizeCanvas());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.resizeCanvas());
            window.visualViewport.addEventListener('scroll', () => this.resizeCanvas());
        }
        this.preventBrowserZoom = (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
        };
        this.preventGestureZoom = (e) => e.preventDefault();
        window.addEventListener('wheel', this.preventBrowserZoom, { passive: false });
        window.addEventListener('gesturestart', this.preventGestureZoom, { passive: false });
        window.addEventListener('gesturechange', this.preventGestureZoom, { passive: false });
        window.addEventListener('gestureend', this.preventGestureZoom, { passive: false });

        this.zoom = 0.7;
        this._mouseX = window.innerWidth / 2;
        this._mouseY = window.innerHeight / 2;
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this._mouseX = e.clientX - rect.left;
            this._mouseY = e.clientY - rect.top;
        });
    }

    createImageMipmapLevels(image) {
        const levels = [image];
        let current = image;

        // Build a small mip chain so heavily zoomed-out sprites do not resample
        // the full-resolution texture every frame.
        while ((current.width > 48 || current.height > 48) && levels.length < 6) {
            const nextWidth = Math.max(1, Math.round(current.width / 2));
            const nextHeight = Math.max(1, Math.round(current.height / 2));
            const canvas = document.createElement('canvas');
            canvas.width = nextWidth;
            canvas.height = nextHeight;
            const ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) break;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(current, 0, 0, nextWidth, nextHeight);
            levels.push(canvas);
            current = canvas;
        }

        return levels;
    }

    getBestImageSource(name, width, height) {
        const baseImage = this.images[name];
        if (!baseImage) return null;

        const levels = this.imageMipmaps[name];
        if (!levels?.length) return baseImage;

        const scaleX = this.imageScaleX || this.scaleX || 1;
        const scaleY = this.imageScaleY || this.scaleY || 1;
        const targetWidthPx = Math.max(1, Math.abs(width * scaleX));
        const targetHeightPx = Math.max(1, Math.abs(height * scaleY));
        let selected = levels[0];

        for (let i = 1; i < levels.length; i++) {
            const candidate = levels[i];
            if ((candidate.width >= targetWidthPx * MIPMAP_TARGET_MARGIN) && (candidate.height >= targetHeightPx * MIPMAP_TARGET_MARGIN)) {
                selected = candidate;
                continue;
            }
            break;
        }

        return selected;
    }

    getImageAverageColor(name, fallback = '#1f4d2e') {
        return this.imageAverageColors[name] || fallback;
    }

    sampleImageAverageColor(image, fallback = '#1f4d2e') {
        if (!image?.width || !image?.height) return fallback;
        const sampleSize = 16;
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return fallback;
        try {
            ctx.clearRect(0, 0, sampleSize, sampleSize);
            ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
            const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
            let r = 0;
            let g = 0;
            let b = 0;
            let count = 0;
            for (let i = 0; i < data.length; i += 4) {
                const a = data[i + 3];
                if (a === 0) continue;
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }
            if (!count) return fallback;
            return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
        } catch {
            return fallback;
        }
    }

    createDOM() {
        this.container = document.createElement('div');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.margin = '0';
        this.container.style.padding = '0';
        this.container.style.overflow = 'hidden';
        this.container.style.backgroundColor = 'transparent';

        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.backgroundColor = this.clearColor;
        this.canvas.style.display = 'block';

        this.container.appendChild(this.canvas);
        document.body.appendChild(this.container);

        document.body.style.margin = '0';
        document.body.style.padding = '0';
    }

    resizeCanvas() {
        if (!this.canvas || !this.ctx) return;
        const layoutWidth = document.documentElement?.clientWidth || window.innerWidth || this.targetPixelWidth;
        const layoutHeight = document.documentElement?.clientHeight || window.innerHeight || this.targetPixelHeight;
        const viewportWidth = layoutWidth;
        const viewportHeight = layoutHeight;
        const viewportAspect = viewportWidth / Math.max(1, viewportHeight);
        const baseAspect = this.baseLogicalWidth / Math.max(1, this.baseLogicalHeight);

        if (viewportAspect >= baseAspect) {
            this.height = this.baseLogicalHeight;
            this.width = this.height * viewportAspect;
        } else {
            this.width = this.baseLogicalWidth;
            this.height = this.width / viewportAspect;
        }

        const isFullscreen = !!document.fullscreenElement;
        const isDesktop = (window.innerWidth || 0) >= 900;
        const verticalCompression = (isFullscreen && isDesktop) ? 0.93 : 1;
        if (verticalCompression !== 1) {
            this.height = this.height * verticalCompression;
            this.width = this.height * viewportAspect;
        }

        this.logicalWidth = this.width;
        this.logicalHeight = this.height;

        const maxPixelWidth = Math.max(1, Math.round(this.renderPixelWidth || (this.renderPixelHeight * viewportAspect)));
        const maxPixelHeight = Math.max(1, Math.round(this.renderPixelHeight));
        // Keep world aspect matching the viewport, but fit inside the selected preset bounds.
        const fitScale = Math.min(
            maxPixelWidth / Math.max(1, viewportWidth),
            maxPixelHeight / Math.max(1, viewportHeight)
        );
        this.targetPixelWidth = Math.max(1, Math.round(viewportWidth * fitScale));
        this.targetPixelHeight = Math.max(1, Math.round(viewportHeight * fitScale));
        this.canvas.width = this.targetPixelWidth;
        this.canvas.height = this.targetPixelHeight;

        this.displayWidth = Math.max(1, viewportWidth);
        this.displayHeight = Math.max(1, viewportHeight);
        this.container.style.width = `${this.displayWidth}px`;
        this.container.style.height = `${this.displayHeight}px`;
        this.canvas.style.width = `${this.displayWidth}px`;
        this.canvas.style.height = `${this.displayHeight}px`;

        this.uniformScale = Math.min(
            this.canvas.width / Math.max(1, this.logicalWidth),
            this.canvas.height / Math.max(1, this.logicalHeight)
        );
        this.scaleX = this.uniformScale;
        this.scaleY = this.uniformScale;
        this.imageScaleX = this.scaleX;
        this.imageScaleY = this.scaleY;
        this.offsetX = 0;
        this.offsetY = 0;
        this.ctx.setTransform(this.scaleX, 0, 0, this.scaleY, this.offsetX, this.offsetY);
    }

    setBackBufferResolution(width, height) {
        this.renderPixelWidth = Math.max(1, Math.round(width || this.renderPixelWidth || 1920));
        this.renderPixelHeight = Math.max(1, Math.round(height));
        this.resizeCanvas();
    }

    setImageScale(scaleX = this.scaleX, scaleY = this.scaleY) {
        this.imageScaleX = Math.max(0.001, Number(scaleX) || this.scaleX || 1);
        this.imageScaleY = Math.max(0.001, Number(scaleY) || this.scaleY || 1);
    }

    clearCanvas() {
        if (!this.ctx) return;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.clearColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.setTransform(this.scaleX, 0, 0, this.scaleY, this.offsetX, this.offsetY);
        this.imageScaleX = this.scaleX;
        this.imageScaleY = this.scaleY;
    }

    getCanvasRect() {
        return this.canvas.getBoundingClientRect();
    }

    getContentDisplayRect() {
        const rect = this.getCanvasRect();
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom
        };
    }

    clientToLogical(clientX, clientY) {
        const rect = this.getContentDisplayRect();
        return {
            x: ((clientX - rect.left) / Math.max(1, rect.width)) * this.width,
            y: ((clientY - rect.top) / Math.max(1, rect.height)) * this.height
        };
    }

    logicalToClient(x, y) {
        const rect = this.getContentDisplayRect();
        return {
            x: rect.left + ((x / Math.max(1, this.width)) * rect.width),
            y: rect.top + ((y / Math.max(1, this.height)) * rect.height)
        };
    }

    drawLine({
        start = [0, 0],
        length = 100,
        angle = 0, // in radians
        color = 'black',
        lineWidth = 1,
        transparency = 1
    } = {}) {
        if (!Array.isArray(start) || start.length !== 2) {
            throw new Error('start must be a 2 element array for drawLine');
        }
        if (typeof length !== 'number' || length <= 0) {
            throw new Error('length must be a positive number for drawLine');
        }
        if (typeof angle !== 'number') {
            throw new Error('angle must be a number for drawLine');
        }
        if (typeof color !== 'string') {
            throw new Error('color must be a string for drawLine');
        }
        if (typeof lineWidth !== 'number' || lineWidth <= 0) {
            throw new Error('lineWidth must be a positive number for drawLine');
        }
        if (typeof transparency !== 'number' || transparency < 0 || transparency > 1) {
            throw new Error('transparency must be a number between 0 and 1 for drawLine');
        }

        const [startX, startY] = start;

        // Calculate end point using trigonometry
        const endX = startX + Math.cos(angle) * length;
        const endY = startY + Math.sin(angle) * length;

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.globalAlpha = transparency;
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;
        this.ctx.restore();
    }

    drawRect({
        pos = [0, 0],
        size = [100, 100],
        color = 'black',
        transparency = 1,
        cornerRadius = 0
    } = {}) {
        if (!Array.isArray(pos) || pos.length !== 2) {
            throw new Error('pos must be a 2 element array for drawRect');
        }
        if (!Array.isArray(size) || size.length !== 2) {
            throw new Error('size must be a 2 element array for drawRect');
        }
        if (typeof color !== 'string') {
            throw new Error('color must be a string for drawRect');
        }
        if (typeof transparency !== 'number' || transparency < 0 || transparency > 1) {
            throw new Error('transparency must be a number between 0 and 1 for drawRect');
        }
        if (typeof cornerRadius !== 'number' || cornerRadius < 0) {
            throw new Error('cornerRadius must be a non-negative number for drawRect');
        }

        const [x, y] = pos;
        const [width, height] = size;

        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = transparency;
        if (cornerRadius > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + cornerRadius, y);
            this.ctx.lineTo(x + width - cornerRadius, y);
            this.ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
            this.ctx.lineTo(x + width, y + height - cornerRadius);
            this.ctx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
            this.ctx.lineTo(x + cornerRadius, y + height);
            this.ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
            this.ctx.lineTo(x, y + cornerRadius);
            this.ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
            this.ctx.fill();
        } else {
            this.ctx.fillRect(x, y, width, height);
        }
        this.ctx.restore();
    }
    drawCircle({
        pos = [0, 0],
        radius = 50,
        color = 'black',
        transparency = 1,
        fill = true,
        stroke = false,
        strokeColor = null,
        strokeWidth = 1
    } = {}) {
        if (!Array.isArray(pos) || pos.length !== 2) {
            throw new Error('pos must be a 2 element array for drawCircle');
        }
        if (typeof radius !== 'number' || radius <= 0) {
            throw new Error('radius must be a positive number for drawCircle');
        }
        if (typeof color !== 'string') {
            throw new Error('color must be a string for drawCircle');
        }
        if (typeof transparency !== 'number' || transparency < 0 || transparency > 1) {
            throw new Error('transparency must be a number between 0 and 1 for drawCircle');
        }
        if (typeof fill !== 'boolean') {
            throw new Error('fill must be a boolean for drawCircle');
        }
        if (typeof stroke !== 'boolean' && typeof stroke !== 'string') {
            throw new Error('stroke must be a boolean or string for drawCircle');
        }
        if (strokeColor !== null && typeof strokeColor !== 'string') {
            throw new Error('strokeColor must be a string or null for drawCircle');
        }
        if (typeof strokeWidth !== 'number' || strokeWidth <= 0) {
            throw new Error('strokeWidth must be a positive number for drawCircle');
        }

        const [x, y] = pos;
        const shouldStroke = typeof stroke === 'string' ? true : stroke;
        const resolvedStrokeColor = typeof stroke === 'string'
            ? stroke
            : (strokeColor || color);
        this.ctx.save();
        this.ctx.globalAlpha = transparency;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (fill) {
            this.ctx.fillStyle = color;
            this.ctx.fill();
        }
        if (shouldStroke || !fill) {
            this.ctx.strokeStyle = resolvedStrokeColor;
            this.ctx.lineWidth = strokeWidth;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawText({
        text = '',
        pos = [0, 0],
        font = '16px Arial',
        color = 'black',
        textAlign = 'left',
        textBaseline = 'alphabetic',
        transparency = 1
    } = {}) {
        if (typeof text !== 'string') {
            throw new Error('text must be a string for drawText');
        }
        if (!Array.isArray(pos) || pos.length !== 2) {
            throw new Error('pos must be a 2 element array for drawText');
        }
        if (typeof font !== 'string') {
            throw new Error('font must be a string for drawText');
        }
        if (typeof color !== 'string') {
            throw new Error('color must be a string for drawText');
        }
        if (typeof transparency !== 'number' || transparency < 0 || transparency > 1) {
            throw new Error('transparency must be a number between 0 and 1 for drawText');
        }

        const [x, y] = pos;
        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.font = normalizeCanvasFont(font);
        this.ctx.textAlign = textAlign;
        this.ctx.textBaseline = textBaseline;
        this.ctx.globalAlpha = transparency;
        this.ctx.fillText(text, x, y);
        this.ctx.restore();
    }
    measureText({
        text = '',
        font = '16px Arial'
    } = {}) {
        if (typeof text !== 'string') {
            throw new Error('text must be a string for measureText');
        }
        if (typeof font !== 'string') {
            throw new Error('font must be a string for measureText');
        }

        const normalizedFont = normalizeCanvasFont(font);
        const cacheKey = `${normalizedFont}\u0000${text}`;
        const cached = this.textMeasureCache.get(cacheKey);
        if (cached) return cached;

        this.ctx.font = normalizedFont;
        const metrics = this.ctx.measureText(text);
        const result = {
            width: metrics.width,
            height: (metrics.actualBoundingBoxAscent ?? 0) +
                (metrics.actualBoundingBoxDescent ?? 0)
        };

        this.textMeasureCache.set(cacheKey, result);
        if (this.textMeasureCache.size > 2000) {
            const oldestKey = this.textMeasureCache.keys().next().value;
            if (oldestKey !== undefined) {
                this.textMeasureCache.delete(oldestKey);
            }
        }

        return result;
    }

    drawRectFast(x, y, width, height, color, transparency = 1, cornerRadius = 0) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = transparency;
        if (cornerRadius > 0) {
            const r = Math.min(cornerRadius, Math.abs(width) * 0.5, Math.abs(height) * 0.5);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + width - r, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + r);
            ctx.lineTo(x + width, y + height - r);
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
            ctx.lineTo(x + r, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, width, height);
        }
        ctx.restore();
    }

    drawCircleFast(x, y, radius, color, transparency = 1, fill = true, stroke = false, strokeColor = null, strokeWidth = 1) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = transparency;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        }
        if (stroke || !fill) {
            ctx.strokeStyle = strokeColor || color;
            ctx.lineWidth = strokeWidth;
            ctx.stroke();
        }
        ctx.restore();
    }

    drawLineFast(startX, startY, length, angle, color, lineWidth = 1, transparency = 1) {
        const endX = startX + Math.cos(angle) * length;
        const endY = startY + Math.sin(angle) * length;
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = transparency;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.restore();
    }

    drawTextFast(text, x, y, font = '16px Arial', color = 'black', textAlign = 'left', textBaseline = 'alphabetic', transparency = 1) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = normalizeCanvasFont(font);
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.globalAlpha = transparency;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    loadImage({
        name,
        src
    } = {}) {
        if (name === undefined) {
            throw new Error('name must be defined for loadImage');
        }
        if (src === undefined) {
            throw new Error('src must be defined for loadImage');
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images[name] = img;
                this.imageMipmaps[name] = this.createImageMipmapLevels(img);
                this.imageAverageColors[name] = this.sampleImageAverageColor(img);
                if (name === 'grass' && this.imageAverageColors[name]) {
                    this.clearColor = this.imageAverageColors[name];
                    if (this.canvas) {
                        this.canvas.style.backgroundColor = this.clearColor;
                    }
                }
                resolve(img);
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    loadAudio({
        name,
        src
    } = {}) {
        if (name === undefined) {
            throw new Error('name must be defined for loadAudio');
        }
        if (src === undefined) {
            throw new Error('src must be defined for loadAudio');
        }

        this.audioSrcs[name] = src;

        const cacheDecodedAudio = async () => {
            const response = await fetch(src);
            if (!response.ok) {
                throw new Error(`Failed to fetch audio asset "${name}" (${response.status})`);
            }

            const audioData = await response.arrayBuffer();
            const audioContext = this.getAudioContext();
            if (!audioContext?.decodeAudioData) {
                throw new Error('Web Audio API is not available');
            }

            const buffer = await new Promise((resolve, reject) => {
                const maybePromise = audioContext.decodeAudioData(
                    audioData,
                    resolve,
                    reject
                );
                if (maybePromise?.then) {
                    maybePromise.then(resolve, reject);
                }
            });
            this.audioBuffers[name] = buffer;
            this.audios[name] = { name, src, buffer };
            return buffer;
        };

        return cacheDecodedAudio().catch((bufferError) => {
            return new Promise((resolve, reject) => {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.oncanplaythrough = () => {
                    this.audios[name] = { name, src, element: audio };
                    resolve(audio);
                };
                audio.onerror = () => reject(bufferError);
                audio.src = src;
                audio.load();
            });
        });
    }

    getAudioContext() {
        if (typeof window === 'undefined') return null;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;
        if (!this.audioContext) {
            this.audioContext = new AudioContextCtor();
        }
        return this.audioContext;
    }

    playBufferedAudio({
        buffer,
        volume = 1,
        timestamp = 0,
        speed = 1,
        endTime = null
    } = {}) {
        const audioContext = this.getAudioContext();
        if (!audioContext || !buffer) return;

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = speed;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const startOffset = Math.max(0, Math.min(buffer.duration, timestamp));
        const remainingDuration = Math.max(0, buffer.duration - startOffset);
        const requestedDuration = Number.isFinite(endTime)
            ? Math.max(0, endTime - timestamp)
            : remainingDuration;
        const playbackDuration = Math.min(remainingDuration, requestedDuration / Math.max(0.01, speed));

        if (playbackDuration <= 0) return;

        try {
            source.start(0, startOffset, playbackDuration);
        } catch (error) {
            console.error(error);
        }
    }

    drawImage({
        name,
        pos = [0, 0],
        size,
        rotation = 0,
        transparency = 1
    } = {}) {
        if (name === undefined) {
            throw new Error('name must be defined for drawImage');
        }
        if (!Array.isArray(pos) || pos.length !== 2) {
            throw new Error('pos must be a 2 element array for drawImage');
        }
        if (!Array.isArray(size) || size.length !== 2) {
            throw new Error('size must be a 2 element array for drawImage');
        }
        if (typeof rotation !== 'number') {
            throw new Error('rotation must be a number for drawImage');
        }
        if (!this.images[name]) {
            // throw new Error(`image ${name} needs to be loaded before it can be drawn.`);

            // don't throw an error, just silently return
            return;
        }

        const [x, y] = pos;
        const [width, height] = size;
        const imageSource = this.getBestImageSource(name, width, height);
        if (!imageSource) return;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        this.ctx.save();
        this.ctx.translate(x + halfWidth, y + halfHeight);
        this.ctx.rotate(rotation);
        this.ctx.globalAlpha = transparency;
        this.ctx.drawImage(imageSource, -halfWidth, -halfHeight, width, height);
        this.ctx.globalAlpha = 1;
        this.ctx.restore();
    }

    drawImageFast(name, x, y, width, height, rotation = 0, transparency = 1) {
        if (!this.images[name]) return;
        const imageSource = this.getBestImageSource(name, width, height);
        if (!imageSource) return;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x + halfWidth, y + halfHeight);
        ctx.rotate(rotation);
        ctx.globalAlpha = transparency;
        ctx.drawImage(imageSource, -halfWidth, -halfHeight, width, height);
        ctx.restore();
    }

    playAudio({
        name,
        volume = 1,
        timestamp = 0,
        speed = 1,
        endTime = null
    } = {}) {
        if (name === undefined) {
            throw new Error('name must be defined for playAudio');
        }
        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
            throw new Error('volume must be a number between 0 and 1 for playAudio');
        }
        const audioAsset = this.audios[name];
        if (!audioAsset) {
            return;
        }

        if (this.audioBuffers[name]) {
            this.playBufferedAudio({
                buffer: this.audioBuffers[name],
                volume,
                timestamp,
                speed,
                endTime
            });
            return;
        }

        const legacyAudio = audioAsset.element?.cloneNode?.() || audioAsset.cloneNode?.() || new Audio(this.audioSrcs[name] || '');
        legacyAudio.volume = volume;
        legacyAudio.currentTime = timestamp;
        legacyAudio.playbackRate = speed;
        legacyAudio.play().catch(e => console.error(e));

        if (Number.isFinite(endTime)) {
            const cutoff = Math.max(0, endTime - timestamp);
            if (cutoff === 0) {
                legacyAudio.pause();
                return;
            }
            const stopDelayMs = (cutoff / Math.max(0.01, speed)) * 1000;
            setTimeout(() => {
                legacyAudio.pause();
                legacyAudio.currentTime = 0;
            }, stopDelayMs);
        }
    }

    get center() {
        return [this.width / 2, this.height / 2];
    }

    zoomOut() {
        this.zoom -= 0.005
    }
    zoomIn() {
        this.zoom += 0.005
    }

    get mouseAngle() {
        const rect = this.getContentDisplayRect();
        const centerX = rect.left + (rect.width / 2);
        const centerY = rect.top + (rect.height / 2);

        return Math.atan2(this._mouseY - centerY, this._mouseX - centerX);
    }
}
