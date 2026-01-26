import {
    ENTITIES
} from './game.js';
import {
    Player
} from './player.js';
import {
    Mob
} from './mob.js';
import {
    Projectile
} from './projectile.js';
import {
    Structure
} from './structure.js';

import {
    GameObject
} from './object.js';

import {
    showNotification
} from './ui.js';
import { Vars } from './client.js';
import { dataMap } from './shared/datamap.js';
import { LC } from './client.js';

export function parsePacket(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    const packetType = view.getUint8(offset++);
    if (packetType === 1) { // init packet
        // init players
        const playerCount = view.getUint8(offset++);
        for (let i = 0; i < playerCount; i++) {
            // read data
            const id = view.getUint32(offset);
            offset += 4;
            const x = view.getUint16(offset);
            offset += 2;
            const y = view.getUint16(offset);
            offset += 2;
            const angle = view.getFloat32(offset);
            offset += 4;

            const usernameLength = view.getUint8(offset++);
            const username = new TextDecoder().decode(new Uint8Array(view.buffer, offset, usernameLength));
            offset += usernameLength;

            // set data
            const player = new Player(id, x, y);
            player.angle = angle;
            player.username = username;
        }

        // init mobs
        const mobCount = view.getUint16(offset);
        offset += 2;
        for (let i = 0; i < mobCount; i++) {
            // read data
            const id = view.getUint32(offset);
            offset += 4;
            const x = view.getUint16(offset);
            offset += 2;
            const y = view.getUint16(offset);
            offset += 2;
            const angle = view.getFloat32(offset);
            offset += 4;
            const type = view.getInt8(offset++);

            // set data
            const mob = new Mob(id, x, y, type);
            mob.angle = angle;
        }

        // init structures
        const structureCount = view.getUint16(offset);
        offset += 2;
        for (let i = 0; i < structureCount; i++) {
            const id = view.getUint32(offset);
            offset += 4;
            const x = view.getUint16(offset);
            offset += 2;
            const y = view.getUint16(offset);
            offset += 2;
            const type = view.getInt8(offset++);

            new Structure(id, x, y, type);
        }
    } else if (packetType === 2) { // update packet
        // update players
        const playerCount = view.getUint8(offset++);
        const playerIdsThisUpdate = [];
        for (let i = 0; i < playerCount; i++) {
            const id = view.getUint32(offset); offset += 4;
            playerIdsThisUpdate.push(id);
            const mask = view.getUint16(offset); offset += 2;

            let p = ENTITIES.PLAYERS[id];

            if (mask & 0x8000) { // Full Update
                const x = view.getUint16(offset); offset += 2;
                const y = view.getUint16(offset); offset += 2;
                const angle = view.getFloat32(offset); offset += 4;
                const hp = view.getUint16(offset); offset += 2;
                const maxHp = view.getUint16(offset); offset += 2;
                const score = view.getUint32(offset); offset += 4;
                const level = view.getUint8(offset++);
                const swingState = view.getUint8(offset++);
                const hasShield = view.getUint8(offset++);
                const isAlive = view.getUint8(offset++);
                const hasWeapon = view.getUint8(offset++);

                const uLen = view.getUint8(offset++);
                const username = new TextDecoder().decode(new Uint8Array(view.buffer, offset, uLen));
                offset += uLen;

                const cLen = view.getUint8(offset++);
                const chatMessage = new TextDecoder().decode(new Uint8Array(view.buffer, offset, cLen));
                offset += cLen;

                if (!p) {
                    p = new Player(id, x, y);
                }

                p.newX = x;
                p.newY = y;
                p.newAngle = angle;
                p.health = hp;
                p.maxHealth = maxHp;
                p.newScore = score;
                p.level = level;
                p.newSwingState = swingState;
                p.hasShield = hasShield;
                p.isAlive = isAlive;
                p.hasWeapon = hasWeapon;
                p.username = username;
                p.chatMessage = chatMessage;

            } else { // Delta
                if (mask & 0x01) {
                    const x = view.getUint16(offset); offset += 2;
                    if (p) p.newX = x;
                }
                if (mask & 0x02) {
                    const y = view.getUint16(offset); offset += 2;
                    if (p) p.newY = y;
                }
                if (mask & 0x04) {
                    const angle = view.getFloat32(offset); offset += 4;
                    if (p) p.newAngle = angle;
                }
                if (mask & 0x08) {
                    const hp = view.getUint16(offset); offset += 2;
                    if (p) p.health = hp;
                }
                if (mask & 0x10) {
                    const maxHp = view.getUint16(offset); offset += 2;
                    if (p) p.maxHealth = maxHp;
                }
                if (mask & 0x20) {
                    const score = view.getUint32(offset); offset += 4;
                    if (p) p.newScore = score;
                }
                if (mask & 0x40) {
                    const level = view.getUint8(offset++);
                    if (p) p.level = level;
                }
                if (mask & 0x80) {
                    const swingState = view.getUint8(offset++);
                    if (p) p.newSwingState = swingState;
                }
                if (mask & 0x100) {
                    const hasWeapon = view.getUint8(offset++);
                    if (p) p.hasWeapon = hasWeapon;
                }
                if (mask & 0x200) {
                    const hasShield = view.getUint8(offset++);
                    if (p) p.hasShield = hasShield;
                }
                if (mask & 0x400) {
                    const isAlive = view.getUint8(offset++);
                    if (p) p.isAlive = isAlive;
                }
                if (mask & 0x800) {
                    const cLen = view.getUint8(offset++);
                    const chatMessage = new TextDecoder().decode(new Uint8Array(view.buffer, offset, cLen));
                    offset += cLen;
                    if (p) p.chatMessage = chatMessage;
                }
                if (mask & 0x1000) {
                    const uLen = view.getUint8(offset++);
                    const username = new TextDecoder().decode(new Uint8Array(view.buffer, offset, uLen));
                    offset += uLen;
                    if (p) p.username = username;
                }
            }
        }
        for (const player of Object.values(ENTITIES.PLAYERS)) {
            if (!playerIdsThisUpdate.includes(player.id)) delete ENTITIES.PLAYERS[player.id];
        }

        // update mobs
        const mobCount = view.getUint16(offset); offset += 2;
        const mobIdsThisUpdate = [];
        for (let i = 0; i < mobCount; i++) {
            const id = view.getUint32(offset); offset += 4;
            mobIdsThisUpdate.push(id);
            const mask = view.getUint8(offset++);

            let m = ENTITIES.MOBS[id];

            if (mask & 0x80) { // Full
                const x = view.getUint16(offset); offset += 2;
                const y = view.getUint16(offset); offset += 2;
                const angle = view.getFloat32(offset); offset += 4;
                const hp = view.getUint16(offset); offset += 2;
                const maxHp = view.getUint16(offset); offset += 2;
                const type = view.getUint8(offset++);

                if (!m) {
                    m = new Mob(id, x, y, type);
                }
                m.newX = x;
                m.newY = y;
                m.newAngle = angle;
                m.health = hp;
                m.maxHealth = maxHp;
                m.type = type;
                // Ensure helper works for texture if type changes
                if (m.type !== m.lastType) { m.lastType = m.type; /* update texture if needed */ }
            } else { // Delta
                if (mask & 0x01) {
                    const x = view.getUint16(offset); offset += 2;
                    if (m) m.newX = x;
                }
                if (mask & 0x02) {
                    const y = view.getUint16(offset); offset += 2;
                    if (m) m.newY = y;
                }
                if (mask & 0x04) {
                    const angle = view.getFloat32(offset); offset += 4;
                    if (m) m.newAngle = angle;
                }
                if (mask & 0x08) {
                    const hp = view.getUint16(offset); offset += 2;
                    if (m) m.health = hp;
                }
                if (mask & 0x10) {
                    const maxHp = view.getUint16(offset); offset += 2;
                    if (m) m.maxHealth = maxHp;
                }
                if (mask & 0x20) {
                    const type = view.getUint8(offset++);
                    if (m) m.type = type;
                }
            }
        }
        for (const mob of Object.values(ENTITIES.MOBS)) {
            if (!mobIdsThisUpdate.includes(mob.id)) delete ENTITIES.MOBS[mob.id];
        }

        // update projectiles
        const projCount = view.getUint16(offset); offset += 2;
        const projIdsThisUpdate = [];
        for (let i = 0; i < projCount; i++) {
            const id = view.getUint32(offset); offset += 4;
            projIdsThisUpdate.push(id);
            const mask = view.getUint8(offset++);

            let p = ENTITIES.PROJECTILES[id];

            if (mask & 0x80) {
                const x = view.getUint16(offset); offset += 2;
                const y = view.getUint16(offset); offset += 2;
                const angle = view.getFloat32(offset); offset += 4;
                const type = view.getInt8(offset++);
                const level = view.getUint8(offset++);

                if (!p) {
                    p = new Projectile(id, x, y, angle, type, level);
                }
                p.newX = x;
                p.newY = y;
                p.newAngle = angle;
                p.type = type;
                p.level = level;
            } else {
                if (mask & 0x01) {
                    const x = view.getUint16(offset); offset += 2;
                    if (p) p.newX = x;
                }
                if (mask & 0x02) {
                    const y = view.getUint16(offset); offset += 2;
                    if (p) p.newY = y;
                }
                if (mask & 0x04) {
                    const angle = view.getFloat32(offset); offset += 4;
                    if (p) p.newAngle = angle;
                }
                if (mask & 0x08) {
                    const type = view.getInt8(offset++);
                    if (p) p.type = type;
                }
                if (mask & 0x10) {
                    const level = view.getUint8(offset++);
                    if (p) p.level = level;
                }
            }
        }
        for (const p of Object.values(ENTITIES.PROJECTILES)) {
            if (!projIdsThisUpdate.includes(p.id)) delete ENTITIES.PROJECTILES[p.id];
        }

        // update objects
        const objCount = view.getUint16(offset); offset += 2;
        const objIdsThisUpdate = [];
        for (let i = 0; i < objCount; i++) {
            const id = view.getUint32(offset); offset += 4;
            objIdsThisUpdate.push(id);
            const mask = view.getUint8(offset++);

            let o = ENTITIES.OBJECTS[id];

            if (mask & 0x80) {
                const x = view.getUint16(offset); offset += 2;
                const y = view.getUint16(offset); offset += 2;
                const type = view.getInt8(offset++);
                const health = view.getUint16(offset); offset += 2;

                if (!o) {
                    o = new GameObject(id, x, y, type);
                }
                o.x = x;
                o.y = y;
                o.type = type;
                o.health = health;
            } else {
                if (mask & 0x01) {
                    const x = view.getUint16(offset); offset += 2;
                    if (o) o.x = x;
                }
                if (mask & 0x02) {
                    const y = view.getUint16(offset); offset += 2;
                    if (o) o.y = y;
                }
                if (mask & 0x04) {
                    const health = view.getUint16(offset); offset += 2;
                    if (o) o.health = health;
                }
                if (mask & 0x08) {
                    const type = view.getInt8(offset++);
                    if (o) o.type = type;
                }
            }
        }
        for (const o of Object.values(ENTITIES.OBJECTS)) {
            if (!objIdsThisUpdate.includes(o.id)) delete ENTITIES.OBJECTS[o.id];
        }

    }
    /*else if (packetType === 3) { // add packet
           // make new entity based on entity type
           const entityType = view.getUint8(offset++); // entity type to add
           const entityId = view.getUint32(offset); offset += 4; // entity id to add
           const x = view.getUint16(offset); offset += 2; // x
           const y = view.getUint16(offset); offset += 2; // y
           let angle;
           if (buffer.byteLength > 10)  {
               angle = view.getFloat32(offset); offset += 4; // angle
           }// greater than 10 means its not a player add packet, its a projectile / mob
           if (entityType === 1) {
               new Player(entityId, x, y);
           } else if (entityType === 2) {
               const type = view.getInt8(offset++); // projectile type
               new Projectile(entityId, x, y, angle, type);
           } else if (entityType === 3) { // if its a mob, then look for the type attribute packet.
               const type = view.getInt8(offset++); // mob type
               new Mob(entityId, x, y, type);
           }

           // console.log("add", entityType, entityId);
       } else if (packetType === 4) { // delete packet
           const entityType = view.getUint8(offset++); // entity type to delete
           const entityId = view.getUint32(offset); offset += 4; // entity id to delete
           
           if (entityType === 1) {
               delete ENTITIES.PLAYERS[entityId];
           } else if (entityType === 2) {
               delete ENTITIES.PROJECTILES[entityId];
           } else if (entityType === 3) {
               delete ENTITIES.MOBS[entityId];
           }

           // console.log("delete", entityType, entityId);
       }*/
    else if (packetType === 5) { // leaderboard packet
        const leaderboard = [];
        const playerCount = view.getUint8(offset++);
        for (let i = 0; i < playerCount; i++) {
            const id = view.getUint32(offset);
            offset += 4;
            const score = view.getUint32(offset);
            offset += 4;
            const usernameLength = view.getUint8(offset++);

            const username = new TextDecoder().decode(new Uint8Array(view.buffer, offset, usernameLength));
            offset += usernameLength;

            const player = {
                id,
                username,
                score
            }
            leaderboard.push(player);
        }
        ENTITIES.leaderboard = leaderboard;
    } else if (packetType === 6) { // died to something packet
        LC.zoomOut();
        Vars.lastDiedTime = performance.now();

        const entType = view.getUint8(offset++);
        const entId = view.getUint32(offset);
        offset += 4;

        if (entType === 1) {
            showNotification("You died to " + ENTITIES.PLAYERS[entId].username + "!", 'red');
        } else if (entType === 2) {
            const ent = ENTITIES.MOBS[entId];
            if (ent.type === 3) {
                showNotification("You died to a cow!", 'red');
            }
        }

        ENTITIES.PLAYERS[Vars.myId].serverAttributes = {
            speed: dataMap.PLAYERS.baseMovementSpeed,
            damage: 0,
        };
    } else if (packetType === 7) { // play audio packet
        const type = view.getUint8(offset++);
        const volume = view.getUint8(offset++);
        LC.playAudio({
            name: dataMap.sfxMap[type],
            timestamp: dataMap.AUDIO[dataMap.sfxMap[type]].defaultTimestamp,
            volume: volume / 100 * dataMap.AUDIO[dataMap.sfxMap[type]].defaultVolume
        });
    } else if (packetType === 8) { // kicked packet
        const messageLength = view.getUint8(offset++);
        const message = new TextDecoder().decode(new Uint8Array(view.buffer, offset, messageLength));
        offset += messageLength;

        alert(`KICKED: ${message}`);
        console.log(message);
    } else if (packetType === 9) { // ping response packet
        Vars.ping = Date.now() - Vars.lastSentPing;
    } else if (packetType === 10) { // upgrade response packet
        const attributeMap = [0, 'maxHp', 'speed', 'damage'];
        const attributeType = view.getUint8(offset++);
        const amount = view.getUint8(offset++);
        const player = ENTITIES.PLAYERS[Vars.myId];
        if (player) {
            player.serverAttributes[attributeMap[attributeType]] += amount;
        }
    }
}