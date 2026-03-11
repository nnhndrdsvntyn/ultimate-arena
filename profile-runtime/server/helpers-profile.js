const sharedEncoder = new TextEncoder();

export class PacketWriter {
    constructor(initialSize = 8192) {
        this.buffer = new ArrayBuffer(initialSize);
        this.view = new DataView(this.buffer);
        this.uint8 = new Uint8Array(this.buffer);
        this.offset = 0;
        this.capacity = initialSize;
        this.cachedBuffer = null;
    }

    reset() {
        this.offset = 0;
        this.cachedBuffer = null;
    }

    ensureCapacity(needed) {
        if (this.offset + needed > this.capacity) {
            const newCapacity = Math.max(this.capacity * 2, this.offset + needed);
            const newBuffer = new ArrayBuffer(newCapacity);
            new Uint8Array(newBuffer).set(this.uint8.subarray(0, this.offset));
            this.buffer = newBuffer;
            this.view = new DataView(this.buffer);
            this.uint8 = new Uint8Array(this.buffer);
            this.capacity = newCapacity;
            this.cachedBuffer = null;
        }
    }

    writeU8(value) {
        this.ensureCapacity(1);
        this.cachedBuffer = null;
        this.view.setUint8(this.offset, value);
        this.offset += 1;
    }

    writeU16(value) {
        this.ensureCapacity(2);
        this.cachedBuffer = null;
        this.view.setUint16(this.offset, value, false);
        this.offset += 2;
    }

    writeU32(value) {
        this.ensureCapacity(4);
        this.cachedBuffer = null;
        this.view.setUint32(this.offset, value, false);
        this.offset += 4;
    }

    writeF32(value) {
        this.ensureCapacity(4);
        this.cachedBuffer = null;
        this.view.setFloat32(this.offset, value, false);
        this.offset += 4;
    }

    writeStr(value) {
        const encoded = sharedEncoder.encode(value);
        this.ensureCapacity(1 + encoded.byteLength);
        this.cachedBuffer = null;
        this.view.setUint8(this.offset, encoded.byteLength);
        this.offset += 1;
        this.uint8.set(encoded, this.offset);
        this.offset += encoded.byteLength;
    }

    reserveU8() {
        this.ensureCapacity(1);
        this.cachedBuffer = null;
        const pos = this.offset;
        this.offset += 1;
        return pos;
    }

    reserveU16() {
        this.ensureCapacity(2);
        this.cachedBuffer = null;
        const pos = this.offset;
        this.offset += 2;
        return pos;
    }

    writeU8At(pos, value) {
        this.cachedBuffer = null;
        this.view.setUint8(pos, value);
    }

    writeU16At(pos, value) {
        this.cachedBuffer = null;
        this.view.setUint16(pos, value, false);
    }

    getBuffer() {
        if (!this.cachedBuffer) {
            this.cachedBuffer = this.buffer.slice(0, this.offset);
        }
        return this.cachedBuffer;
    }
}

const nextIds = new Map();

export function getId(entityType) {
    const next = nextIds.get(entityType) || 1;
    nextIds.set(entityType, next + 1);
    return next;
}
