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

export function sendPausePacket() {
    if (!ws || ws.readyState !== ws.OPEN) return;
    writer.reset();
    writer.writeU8(6); // Pause packet (re-use death type)
    ws.send(writer.getBuffer());
}

export function sendTpPosCommand(entityType, startId, endId, x, y) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(1); // tppos type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    writer.writeU16(x);
    writer.writeU16(y);
    ws.send(writer.getBuffer());
}

export function sendTpEntCommand(entityType, startId, endId, targetEntityType, targetStartId, targetEndId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(2); // tpent type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    writer.writeU8(targetEntityType);
    writer.writeU16(targetStartId);
    writer.writeU16(targetEndId);
    ws.send(writer.getBuffer());
}

export function sendSetAttrCommand(entityType, startId, endId, attrIdx, value) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(4); // set attribute type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    writer.writeU8(attrIdx);
    writer.writeF32(value);
    ws.send(writer.getBuffer());
}

export function sendKillCommand(entityType, startId, endId) {
    console.log(`[Client CMD] sendKillCommand -> type=${entityType}, range=${startId}-${endId}`);
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(8); // kill command type
    writer.writeU8(entityType); // entity type
    writer.writeU16(startId);
    writer.writeU16(endId);
    ws.send(writer.getBuffer());
}

export function sendBreakChestCommand(startId, endId, dropLoot = false) {
    console.log(`[Client CMD] sendBreakChestCommand -> range=${startId}-${endId}, dropLoot=${dropLoot}`);
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(9); // break chest command type
    writer.writeU16(startId);
    writer.writeU16(endId);
    writer.writeU8(dropLoot ? 1 : 0);
    ws.send(writer.getBuffer());
}

export function sendHealCommand(entityType, startId, endId) {
    console.log(`[Client CMD] sendHealCommand -> type=${entityType}, range=${startId}-${endId}`);
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(10); // heal command type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    ws.send(writer.getBuffer());
}

export function sendPickupCommand() {
    writer.reset();
    writer.writeU8(12); // Type 12: Pickup
    ws.send(writer.getBuffer());
}

export function sendTpChestCommand(playerId, chestType = 0) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(6); // tpchest type
    writer.writeU8(playerId);
    if (chestType !== 0) {
        writer.writeU8(chestType);
    }
    ws.send(writer.getBuffer());
}

export function sendBreakAllChestsCommand(dropLoot = false) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(7); // breakChests type
    writer.writeU8(dropLoot ? 1 : 0);
    ws.send(writer.getBuffer());
}

export function sendClearDropsCommand() {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(12); // clear drops type
    ws.send(writer.getBuffer());
}

export function sendDamageCommand(entityType, startId, endId, damage, isPercentage = false) {
    console.log(`[Client CMD] sendDamageCommand -> type=${entityType}, range=${startId}-${endId}, damage=${damage}, isPct=${isPercentage}`);
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(11); // damage command type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    writer.writeF32(damage);
    writer.writeU8(isPercentage ? 1 : 0);
    ws.send(writer.getBuffer());
}

export function sendAgroCommand(mobId, playerId, mobType = 0, mobSpeedMult = 0) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(5); // agro command type
    writer.writeU16(mobId);
    writer.writeU8(playerId);
    writer.writeU8(mobType);
    writer.writeU8(mobSpeedMult);
    ws.send(writer.getBuffer());
}

export function sendMobTypeCommand(subType, mobType, payload = {}) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(14); // mob-type command
    writer.writeU8(subType);
    writer.writeU8(mobType);

    switch (subType) {
        case 1: // tppos
            writer.writeU16(payload.x);
            writer.writeU16(payload.y);
            break;
        case 2: // tpent
            writer.writeU8(payload.targetType);
            writer.writeU16(payload.targetId);
            break;
        case 4: // setattr
            writer.writeU8(payload.attrIdx);
            writer.writeF32(payload.value);
            break;
        case 8: // kill
        case 10: // heal
            break;
        case 11: // damage
            writer.writeF32(payload.damage);
            writer.writeU8(payload.isPercentage ? 1 : 0);
            break;
    }
    ws.send(writer.getBuffer());
}

export function sendRovCommand(rangeMult) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(13); // rov command type
    writer.writeF32(rangeMult);
    ws.send(writer.getBuffer());
}

export function sendGiveAccessoryCommand(entityType, startId, endId, accessoryId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(16); // give accessory command type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    writer.writeU8(accessoryId);
    ws.send(writer.getBuffer());
}

export function sendGrantAdminCommand(targetId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(17); // grant admin command type
    writer.writeU8(targetId);
    ws.send(writer.getBuffer());
}

export function sendInvisCommand(entityType, startId, endId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(18); // invis command type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    ws.send(writer.getBuffer());
}

export function sendUninvisCommand(entityType, startId, endId) {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(19); // uninvis command type
    writer.writeU8(entityType);
    writer.writeU16(startId);
    writer.writeU16(endId);
    ws.send(writer.getBuffer());
}

export function sendActivateAbilityCommand(abilityName, options = {}) {
    const targetX = options?.targetX ?? null;
    const targetY = options?.targetY ?? null;
    const durationSeconds = options?.durationSeconds ?? null;
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(20); // activate ability command type
    writer.writeStr(abilityName);
    if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
        writer.writeU16(Math.max(0, Math.min(65535, Math.round(targetX))));
        writer.writeU16(Math.max(0, Math.min(65535, Math.round(targetY))));
    } else if (Number.isFinite(durationSeconds)) {
        writer.writeU16(Math.max(1, Math.min(65535, Math.round(durationSeconds))));
    }
    ws.send(writer.getBuffer());
}

export function sendUseAbilityPacket(targetX = null, targetY = null) {
    writer.reset();
    writer.writeU8(24); // use equipped ability packet
    if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
        writer.writeU16(Math.max(0, Math.min(65535, Math.round(targetX))));
        writer.writeU16(Math.max(0, Math.min(65535, Math.round(targetY))));
    }
    ws.send(writer.getBuffer());
}

export function sendResetCommand() {
    writer.reset();
    writer.writeU8(8); // Command packet
    writer.writeU8(15); // reset command type
    ws.send(writer.getBuffer());
}

export function sendBuyPacket(rank) {
    writer.reset();
    writer.writeU8(20); // Type 20: Buy
    writer.writeU8(rank);
    ws.send(writer.getBuffer());
}

export function sendSellAllPacket(slotIndices) {
    writer.reset();
    writer.writeU8(21); // Type 21: Sell
    writer.writeU8(slotIndices.length);
    slotIndices.forEach(idx => writer.writeU8(idx));
    ws.send(writer.getBuffer());
}

export function sendEquipAccessoryPacket(itemType, fromSlot = 255) {
    writer.reset();
    writer.writeU8(23); // Type 23: Equip accessory
    writer.writeU8(itemType);
    writer.writeU8(fromSlot);
    ws.send(writer.getBuffer());
}
