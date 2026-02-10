export class LibCanvas {
    constructor() {
        this.images = {};
        this.audios = {};
        [this.width, this.height] = [1440, 760];
        this.createDOM();

        this.zoom = 0.7;
        this._mouseX = window.innerWidth / 2;
        this._mouseY = window.innerHeight / 2;
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();

            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            this._mouseX = (e.clientX - rect.left) * scaleX;
            this._mouseY = (e.clientY - rect.top) * scaleY;
        });
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

        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.backgroundColor = 'white';

        this.container.appendChild(this.canvas);
        document.body.appendChild(this.container);

        document.body.style.margin = '0';
        document.body.style.padding = '0';
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.width, this.height);
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
        transparency = 1
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

        const [x, y] = pos;
        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = transparency;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
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
        this.ctx.font = font;
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

        this.ctx.font = font;
        const metrics = this.ctx.measureText(text);

        return {
            width: metrics.width,
            height: (metrics.actualBoundingBoxAscent ?? 0) +
                (metrics.actualBoundingBoxDescent ?? 0)
        };
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

        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => {
                this.audios[name] = audio;
                resolve(audio);
            };
            audio.onerror = reject;
            audio.src = src;
        });
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
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        this.ctx.save();
        this.ctx.translate(x + halfWidth, y + halfHeight);
        this.ctx.rotate(rotation);
        this.ctx.globalAlpha = transparency;
        this.ctx.drawImage(this.images[name], -halfWidth, -halfHeight, width, height);
        this.ctx.globalAlpha = 1;
        this.ctx.restore();
    }

    playAudio({
        name,
        volume = 1,
        timestamp = 0,
        speed = 1
    } = {}) {
        if (name === undefined) {
            throw new Error('name must be defined for playAudio');
        }
        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
            throw new Error('volume must be a number between 0 and 1 for playAudio');
        }
        if (!this.audios[name]) {
            return;
        }

        const audio = this.audios[name].cloneNode();
        audio.volume = volume;
        audio.currentTime = timestamp;
        audio.playbackRate = speed;
        audio.play().catch(e => console.error(e));
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
        // Canvas center
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Calculate angle
        return Math.atan2(this._mouseY - centerY, this._mouseX - centerX);
    }
}