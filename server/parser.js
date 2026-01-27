import {
    ENTITIES
} from './game.js';
import {
    StringDecoder
} from 'string_decoder';
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

export function parsePacket(buffer, ws) {
    let offset = 0;

    const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );

    const packetType = view.getUint8(offset++);
    if (packetType != 9) {
        ws.lastPacketTime = performance.now();
    }

    if (packetType === 1) { // type 1 is join game w/ username packet
        // check if player died recently or is already in game
        if (performance.now() - ENTITIES.PLAYERS[ws.id].lastDiedTime < 1000 || ENTITIES.PLAYERS[ws.id].isAlive) {
            ws.kick("Do not modify your client."); // kick them
            return;
        }

        const usernameLength = buffer.readUint8(offset++);
        const potentialUsername = buffer.toString('utf8', offset, offset + usernameLength);
        if (!validateUsername(potentialUsername)) {
            ws.kick("Do not modify your client.");
            return;
        }

        let username = '';
        if (usernameLength === 0) {
            username = getRandomUsername();
        } else {
            username = buffer.toString('utf8', offset, offset + usernameLength);
        }

        if (!ENTITIES.PLAYERS[ws.id]) {
            ENTITIES.newEntity({
                entityType: 'player',
                id: ws.id,
                x: MAP_SIZE[0] / 2,
                y: MAP_SIZE[1] / 2,
                username: username
            });
        } else {
            ENTITIES.PLAYERS[ws.id].username = username;
            ENTITIES.PLAYERS[ws.id].isAlive = true;
            ENTITIES.PLAYERS[ws.id].health = ENTITIES.PLAYERS[ws.id].maxHealth;
            ENTITIES.PLAYERS[ws.id].x = MAP_SIZE[0] / 2;
            ENTITIES.PLAYERS[ws.id].y = MAP_SIZE[1] / 2;
        }
        ENTITIES.PLAYERS[ws.id].isAlive = true;
        return;
    }

    if (!ENTITIES.PLAYERS[ws.id]) return;

    if (packetType === 2) { // angle packet
        if (ENTITIES.PLAYERS[ws.id].swingState != 0) return;

        const angle = view.getFloat32(1, false); // offset = 1, big-endian
        ENTITIES.PLAYERS[ws.id].angle = angle;
        return;
    }
    if (packetType === 3) { // type 3 is move packet
        const key = buffer.readUint8(offset++);
        const state = buffer.readUint8(offset++);

        if (key === 1) ENTITIES.PLAYERS[ws.id].keys.w = state; // 0 or 1
        if (key === 2) ENTITIES.PLAYERS[ws.id].keys.a = state; // 0 or 1
        if (key === 3) ENTITIES.PLAYERS[ws.id].keys.s = state; // 0 or 1
        if (key === 4) ENTITIES.PLAYERS[ws.id].keys.d = state; // 0 or 1
        return;
    }
    if (packetType === 4) { // type 4 is attack packet
        const state = buffer.readUint8(offset++);
        ENTITIES.PLAYERS[ws.id].attacking = state; // 1 or 0
        return;
    }
    if (packetType === 5) { // type 5 is chat message packet
        const messageLength = buffer.readUint8(offset++);
        let chatMessage = buffer.toString('utf8', offset, offset + messageLength);
        ENTITIES.PLAYERS[ws.id].chatMessage = chatMessage;
        ENTITIES.PLAYERS[ws.id].lastChatTime = performance.now();
        return;
    }
    if (packetType === 6) { // type 6 is pause packet
        const player = ENTITIES.PLAYERS[ws.id];

        if (!player.hasShield) return;

        player.isAlive = false;
        player.lastDiedTime = performance.now();
        return;
    }
    if (packetType === 7) { // type 7 is throw sword packet
        ENTITIES.PLAYERS[ws.id].throwSword();
        return;
    }
    if (packetType === 8) { // type 8 is command packet        
        if (!ws.isAdmin) return;

        const cmdType = buffer.readUint8(offset++);
        if (cmdType === 1) { // tp pos to entity packet
            const entityType = buffer.readUint8(offset++);
            const entityId = buffer.readUInt32BE(offset);
            offset += 4;
            const x = buffer.readUint16BE(offset);
            offset += 2;
            const y = buffer.readUint16BE(offset);
            offset += 2;
            cmdRun.tppos(entityType, entityId, x, y);
        } else if (cmdType === 2) { // tp entity to entity packet
            const entityType = buffer.readUint8(offset++);
            const entityId = buffer.readUInt32BE(offset);
            offset += 4;
            const targetEntityType = buffer.readUint8(offset++);
            const targetEntityId = buffer.readUInt32BE(offset);
            offset += 4;
            cmdRun.tpent(entityType, entityId, targetEntityType, targetEntityId);
        } else if (cmdType === 3) { // kick player packet
            const entityId = buffer.readUInt32BE(offset);
            offset += 4;
            wss.clients.forEach(client => {
                if (client.id === entityId) {
                    client.close();
                    delete ENTITIES.PLAYERS[entityId];
                }
            });
        } else if (cmdType === 4) { // set player attribute
            const playerId = buffer.readUInt32BE(offset);
            offset += 4;
            const attrIdx = buffer.readUint8(offset++);
            const value = view.getFloat32(offset, false);
            offset += 4;
            cmdRun.setattr(playerId, attrIdx, value);
        } else if (cmdType === 5) { // agro an entity towards a player
            const mobId = buffer.readUInt32BE(offset);
            offset += 4;
            const playerId = buffer.readUInt32BE(offset);
            offset += 4;
            const mobType = buffer.readUint8(offset++);
            const mobSpeedMult = buffer.readUint8(offset++);
            cmdRun.agro(mobId, playerId, mobType, mobSpeedMult);
        } else if (cmdType === 6) { // tp to nearest chest
            const playerId = buffer.readUInt32BE(offset);
            offset += 4;
            cmdRun.tpchest(playerId);
        }
    } else if (packetType == 9) { // receive ping request packet
        // send ping back
        const pw = ws.packetWriter;
        pw.reset();
        pw.writeU8(9);
        ws.send(pw.getBuffer());
    } else if (packetType == 10) { // receive upgrade attribute packet
        const attributeType = buffer.readUint8(offset++);
        cmdRun.upgrade(ws, attributeType);
    } else if (packetType == 11) { // receive admin key packet
        const pw = ws.packetWriter;
        pw.reset();
        let keyLength = view.getUint8(offset++);
        let attemptKey = new TextDecoder().decode(new Uint8Array(buffer.buffer, buffer.byteOffset + offset, keyLength));

        // console.log(`Admin key attempt from ${ws.id}. Attempt: "${attemptKey}" Expected: "${adminKey}"`);

        if (attemptKey === adminKey) {
            ws.isAdmin = true;
            pw.writeU8(11);
            pw.writeU8(1);
            // console.log("Player " + ws.id + " successfully authenticated as admin.");
        } else {
            // console.log("Player " + ws.id + " failed admin authentication.");
            if (performance.now() - ws.lastAdminKeyAttempt < 5000 || ws.isAdmin) return;
            ws.lastAdminKeyAttempt = performance.now();
            pw.writeU8(11);
            pw.writeU8(0);
        }
        ws.send(pw.getBuffer());
    } else if (packetType === 12) { // pick up packet
        ENTITIES.PLAYERS[ws.id].tryPickup();
    }
}