import {
    ENTITIES
} from './game.js';
import {
    validateUsername,
    getRandomUsername,
    cmdRun
} from './helpers.js';
import {
    wss
} from '../server.js';
import {
    adminKey
} from './constants.js';
import {
    MAP_SIZE
} from './game.js';

// --- Packet Type Map ---
const PACKET_TYPES = {
    JOIN: 1,
    ANGLE: 2,
    MOVE: 3,
    ATTACK: 4,
    CHAT: 5,
    PAUSE: 6,
    THROW: 7,
    COMMAND: 8,
    PING: 9,
    UPGRADE: 10,
    ADMIN_AUTH: 11,
    PICKUP: 12,
    EQUIP: 13,
    DROP: 14,
    SELECT_SLOT: 16,
    SWAP_SLOTS: 17
};

export function parsePacket(buffer, ws) {
    const reader = new PacketReader(buffer);
    const packetType = reader.readU8();

    if (packetType !== PACKET_TYPES.PING) {
        ws.lastPacketTime = performance.now();
    }

    // Special case for JOIN: Player might not exist yet
    if (packetType === PACKET_TYPES.JOIN) {
        handleJoinPacket(reader, ws);
        return;
    }

    // Guard: All other packets require a player entry
    const player = ENTITIES.PLAYERS[ws.id];
    if (!player) return;

    switch (packetType) {
        case PACKET_TYPES.ANGLE:
            handleAnglePacket(reader, player);
            break;
        case PACKET_TYPES.MOVE:
            handleMovePacket(reader, player);
            break;
        case PACKET_TYPES.ATTACK:
            handleAttackPacket(reader, player);
            break;
        case PACKET_TYPES.CHAT:
            handleChatPacket(reader, player, buffer);
            break;
        case PACKET_TYPES.PAUSE:
            handlePausePacket(player);
            break;
        case PACKET_TYPES.THROW:
            player.throwSword();
            break;
        case PACKET_TYPES.COMMAND:
            handleCommandPacket(reader, ws, buffer);
            break;
        case PACKET_TYPES.PING:
            handlePingPacket(ws);
            break;
        case PACKET_TYPES.UPGRADE:
            handleUpgradePacket(reader, ws);
            break;
        case PACKET_TYPES.ADMIN_AUTH:
            handleAdminAuthPacket(reader, ws, buffer);
            break;
        case PACKET_TYPES.PICKUP:
            player.tryPickup();
            break;
        case PACKET_TYPES.EQUIP:
            handleEquipPacket(player);
            break;
        case PACKET_TYPES.DROP:
            player.dropItem();
            break;
        case PACKET_TYPES.SELECT_SLOT:
            player.selectSlot(reader.readU8());
            break;
        case PACKET_TYPES.SWAP_SLOTS:
            player.swapSlots(reader.readU8(), reader.readU8());
            break;
        default:
            // console.warn(`Unknown packet from client ${ws.id}: ${packetType}`);
            break;
    }
}

// --- Packet Handlers ---

function handleJoinPacket(reader, ws) {
    const player = ENTITIES.PLAYERS[ws.id];
    if (player && player.isAlive) {
        ws.kick("Do not modify your client.");
        return;
    }

    // Cooldown check if they just died
    if (player && performance.now() - player.lastDiedTime < 1000) {
        ws.kick("Do not modify your client.");
        return;
    }

    let username = reader.readString();
    if (!validateUsername(username)) {
        ws.kick("Do not modify your client.");
        return;
    }

    if (username.length === 0) {
        username = getRandomUsername();
    }

    if (!player) {
        ENTITIES.newEntity({
            entityType: 'player',
            id: ws.id,
            x: MAP_SIZE[0] / 2,
            y: MAP_SIZE[1] / 2,
            username: username
        });
    } else {
        player.username = username;
        player.isAlive = true;
        player.health = player.maxHealth;
        player.x = MAP_SIZE[0] / 2;
        player.y = MAP_SIZE[1] / 2;
    }

    ENTITIES.PLAYERS[ws.id].isAlive = true;
    ENTITIES.PLAYERS[ws.id].sendInventoryUpdate();
}

function handleAnglePacket(reader, player) {
    if (player.swingState !== 0) return;
    player.angle = reader.readF32();
}

function handleMovePacket(reader, player) {
    const keyMap = { 1: 'w', 2: 'a', 3: 's', 4: 'd' };
    const keyIdx = reader.readU8();
    const state = reader.readU8();
    if (keyMap[keyIdx]) {
        player.keys[keyMap[keyIdx]] = state;
    }
}

function handleAttackPacket(reader, player) {
    player.attacking = reader.readU8();
}

function handleChatPacket(reader, player, buffer) {
    const len = reader.readU8();
    player.chatMessage = buffer.toString('utf8', reader.offset, reader.offset + len);
    player.lastChatTime = performance.now();
}

function handlePausePacket(player) {
    if (player.hasShield) {
        player.isAlive = false;
        player.lastDiedTime = performance.now();
    }
}

function handleCommandPacket(reader, ws, buffer) {
    if (!ws.isAdmin) return;

    const cmdType = reader.readU8();
    switch (cmdType) {
        case 1: { // TP Pos
            const entType = reader.readU8();
            const entId = entType === 1 ? reader.readU8() : buffer.readUint16BE(reader.offset);
            if (entType !== 1) reader.offset += 2;
            const x = buffer.readUint16BE(reader.offset);
            reader.offset += 2;
            const y = buffer.readUint16BE(reader.offset);
            reader.offset += 2;
            cmdRun.tppos(entType, entId, x, y);
            break;
        }
        case 2: { // TP Ent
            const entType = reader.readU8();
            const entId = entType === 1 ? reader.readU8() : buffer.readUint16BE(reader.offset);
            if (entType !== 1) reader.offset += 2;
            const targetType = reader.readU8();
            const targetId = targetType === 1 ? reader.readU8() : buffer.readUint16BE(reader.offset);
            if (targetType !== 1) reader.offset += 2;
            cmdRun.tpent(entType, entId, targetType, targetId);
            break;
        }
        case 3: { // Kick
            const id = reader.readU8();
            wss.clients.forEach(c => {
                if (c.id === id) {
                    c.close();
                    delete ENTITIES.PLAYERS[id];
                }
            });
            break;
        }
        case 4: { // Set Attr
            const id = reader.readU8();
            const attr = reader.readU8();
            const val = reader.readF32();
            cmdRun.setattr(id, attr, val);
            break;
        }
        case 5: { // Agro
            const mobId = buffer.readUint16BE(reader.offset);
            reader.offset += 2;
            const pId = reader.readU8();
            const mType = reader.readU8();
            const mSpeed = reader.readU8();
            cmdRun.agro(mobId, pId, mType, mSpeed);
            break;
        }
        case 6: { // TP Chest
            const pId = reader.readU8();
            let cType = null;
            if (reader.offset < buffer.length) {
                cType = reader.readU8() || null;
            }
            cmdRun.tpchest(pId, cType);
            break;
        }
        case 7: { // Break Chests
            cmdRun.breakChests(reader.readU8() === 1);
            break;
        }
    }
}

function handlePingPacket(ws) {
    const pw = ws.packetWriter;
    pw.reset();
    pw.writeU8(PACKET_TYPES.PING);
    ws.send(pw.getBuffer());
}

function handleUpgradePacket(reader, ws) {
    cmdRun.upgrade(ws, reader.readU8());
}

function handleAdminAuthPacket(reader, ws, buffer) {
    const pw = ws.packetWriter;
    const keyLen = reader.readU8();
    const key = buffer.toString('utf8', reader.offset, reader.offset + keyLen);

    pw.reset();
    pw.writeU8(PACKET_TYPES.ADMIN_AUTH);

    if (key === adminKey) {
        ws.isAdmin = true;
        pw.writeU8(1);
    } else {
        if (performance.now() - (ws.lastAdminKeyAttempt || 0) < 5000 || ws.isAdmin) return;
        ws.lastAdminKeyAttempt = performance.now();
        pw.writeU8(0);
    }
    ws.send(pw.getBuffer());
}

function handleEquipPacket(player) {
    player.hasWeapon = !player.hasWeapon;
    player.manuallyUnequippedWeapon = !player.hasWeapon;
}

// --- Helper Classes ---

class PacketReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.offset = 0;
    }

    readU8() { return this.view.getUint8(this.offset++); }
    readU16() {
        const val = this.view.getUint16(this.offset);
        this.offset += 2;
        return val;
    }
    readF32() {
        // Server angle was using big-endian in original code (DataView default is usually big-endian but explicit is better)
        const val = this.view.getFloat32(this.offset, false);
        this.offset += 4;
        return val;
    }
    readString() {
        const len = this.readU8();
        const str = this.buffer.toString('utf8', this.offset, this.offset + len);
        this.offset += len;
        return str;
    }
}