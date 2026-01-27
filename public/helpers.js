import {
    ws
} from './client.js';

// Pre-allocated packet writer for zero-allocation packet building
const sharedEncoder = new TextEncoder();

export class PacketWriter {
    constructor(initialSize = 8192) {
        this.buffer = new ArrayBuffer(initialSize);
        this.view = new DataView(this.buffer);
        this.uint8 = new Uint8Array(this.buffer);
        this.offset = 0;
        this.capacity = initialSize;
    }

    reset() {
        this.offset = 0;
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
        }
    }

    writeU8(value) {
        this.ensureCapacity(1);
        this.view.setUint8(this.offset, value);
        this.offset += 1;
    }

    writeI8(value) {
        this.ensureCapacity(1);
        this.view.setInt8(this.offset, value);
        this.offset += 1;
    }

    writeU16(value) {
        this.ensureCapacity(2);
        this.view.setUint16(this.offset, value, false);
        this.offset += 2;
    }

    writeU32(value) {
        this.ensureCapacity(4);
        this.view.setUint32(this.offset, value, false);
        this.offset += 4;
    }

    writeF32(value) {
        this.ensureCapacity(4);
        this.view.setFloat32(this.offset, value, false);
        this.offset += 4;
    }

    writeStr(value) {
        const encoded = sharedEncoder.encode(value);
        this.ensureCapacity(1 + encoded.byteLength);
        this.view.setUint8(this.offset, encoded.byteLength);
        this.offset += 1;
        this.uint8.set(encoded, this.offset);
        this.offset += encoded.byteLength;
    }

    // Returns the offset where the count should be written (for deferred count writing)
    reserveU8() {
        this.ensureCapacity(1);
        const pos = this.offset;
        this.offset += 1;
        return pos;
    }

    reserveU16() {
        this.ensureCapacity(2);
        const pos = this.offset;
        this.offset += 2;
        return pos;
    }

    writeU8At(pos, value) {
        this.view.setUint8(pos, value);
    }

    writeU16At(pos, value) {
        this.view.setUint16(pos, value, false);
    }

    getBuffer() {
        return this.buffer.slice(0, this.offset);
    }
}

export const writer = new PacketWriter();


export function encodeUsername(usernameStr) {
    writer.reset();
    writer.writeU8(1);
    writer.writeStr(usernameStr);
    return writer.getBuffer();
}


export function sendChat(chatStr) {
    writer.reset();
    writer.writeU8(5);
    writer.writeStr(chatStr);
    ws.send(writer.getBuffer());
}

export function sendAdminKey(key) {
    writer.reset();
    writer.writeU8(11);
    writer.writeStr(key);
    ws.send(writer.getBuffer());
}

export function sendTpPosCommand(entityType, entityId, x, y) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(1); // tppos type
    writer.writeU8(entityType);
    writer.writeU32(entityId); // writeU32 uses big-endian by default in PacketWriter
    writer.writeU16(x); // writeU16 uses big-endian
    writer.writeU16(y); // writeU16 uses big-endian
    ws.send(writer.getBuffer());
}

export function sendTpEntCommand(entityType, entityId, targetEntityType, targetEntityId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(2); // tpent type
    writer.writeU8(entityType);
    writer.writeU32(entityId);
    writer.writeU8(targetEntityType);
    writer.writeU32(targetEntityId);
    ws.send(writer.getBuffer());
}

export function sendSetPlayerAttrCommand(playerId, attrIdx, value) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(4); // set attribute type
    writer.writeU32(playerId);
    writer.writeU8(attrIdx);
    writer.writeF32(value);
    ws.send(writer.getBuffer());
}

export function sendPickupCommand() {
    writer.reset();
    writer.writeU8(12); // Type 12: Pickup
    ws.send(writer.getBuffer());
}

export function sendTpChestCommand(playerId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(6); // tpchest type
    writer.writeU32(playerId);
    ws.send(writer.getBuffer());
}