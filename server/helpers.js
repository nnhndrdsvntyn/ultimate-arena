import {
    ENTITIES
} from './game.js';
import {
    wss
} from '../server.js';

// networking
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

export function getId(entityType) {
    let id = 1;
    while (ENTITIES[entityType][id]) {
        id++;
    }
    return id;
}

export function getRandomUsername() {
    const adjectives = ['Fast', 'Slow', 'Quick', 'Lazy', 'Happy', 'Sad', 'Angry', 'Calm', 'Brave', 'Shy'];
    const nouns = ['Dog', 'Cat', 'Bird', 'Fish', 'Lion', 'Tiger', 'Bear', 'Wolf', 'Fox', 'Deer'];

    return adjectives[Math.floor(Math.random() * adjectives.length)] +
        nouns[Math.floor(Math.random() * nouns.length)] +
        Math.floor(Math.random() * 1000);
}

export function validateUsername(username) {
    if (username.length > 15) {
        return false;
    } else {
        return true;
    }
}

const helperWriter = new PacketWriter();

export function playSfx(xorigin, yorigin, type, range) {
    const rangeSqrd = range * range;

    wss.clients.forEach(client => {
        const player = ENTITIES.PLAYERS[client.id];
        const dx = player.x - xorigin;
        const dy = player.y - yorigin;
        const distanceSqrd = dx * dx + dy * dy;

        if (distanceSqrd <= rangeSqrd) {
            const volume = Math.max(0.1, 1 - distanceSqrd / rangeSqrd);

            helperWriter.reset();
            helperWriter.writeU8(7);
            helperWriter.writeU8(type);
            helperWriter.writeU8(Math.floor(volume * 100));

            client.send(helperWriter.getBuffer());
        }
    });
}

class CommandMap {
    constructor() {
        this.entityTypeMap = {
            '1': 'PLAYERS',
            '2': 'MOBS',
        }
    }

    // admin commands
    tppos(entityType, entityId, x, y) {
        const entityListName = this.entityTypeMap[entityType];
        if (entityId === 0) // teleport all of that type to the position
        {
            for (const id in ENTITIES[entityListName]) {
                const entity = ENTITIES[entityListName][id];
                entity.x = x;
                entity.y = y;
            }
        } else if (ENTITIES[entityListName][entityId]) { // teleport specific entity
            ENTITIES[entityListName][entityId].x = x;
            ENTITIES[entityListName][entityId].y = y;
        }
    }
    tpent(entityType, entityId, targetEntityType, targetEntityId) {
        const entityListName = this.entityTypeMap[entityType];
        const targetEntityListName = this.entityTypeMap[targetEntityType];
        if (ENTITIES[entityListName][entityId] && ENTITIES[targetEntityListName][targetEntityId]) {
            ENTITIES[entityListName][entityId].x = ENTITIES[targetEntityListName][targetEntityId].x;
            ENTITIES[entityListName][entityId].y = ENTITIES[targetEntityListName][targetEntityId].y;
        }
    }
    setattr(playerId, attrIdx, value) {
        const player = ENTITIES.PLAYERS[playerId];
        if (player) {
            if (attrIdx === 1) { // defaultSpeed
                player.defaultSpeed = value;
            } else if (attrIdx === 2) { // score
                player.score = 0;
                player.addScore(Math.floor(value));
            } else if (attrIdx === 3) { // invincible
                player.invincible = value;
            } else if (attrIdx === 4) { // weapon rank
                player.weapon.rank = Math.max(1, Math.min(7, Math.floor(value)));
            } else if (attrIdx === 5) { // strength
                player.strength = Math.floor(value);
            }
        }
    }
    agro(mobId, playerId, mobType, mobSpeedMult) {
        const mob = ENTITIES.MOBS[mobId];
        const player = ENTITIES.PLAYERS[playerId]; // Assuming playerId is always a valid player

        if (mobId === 0) { // All mobs of a specific type
            for (const m of Object.values(ENTITIES.MOBS)) {
                if (m.type === mobType && player) {
                    m.alarm(player);
                    m.speed = m.speed * mobSpeedMult;
                }
            }
        } else if (mob && player) { // Specific mob
            mob.alarm(player);
        }
    }
    tpchest(playerId) {
        const player = ENTITIES.PLAYERS[playerId];
        if (!player) return;

        let nearestChest = null;
        let minDistanceSq = Infinity;

        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (object.type >= 1 && object.type <= 4) { // Types 1-4 are chests
                const dx = object.x - player.x;
                const dy = object.y - player.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    nearestChest = object;
                }
            }
        }

        if (nearestChest) {
            player.x = nearestChest.x;
            player.y = nearestChest.y;
        }
    }

    // regular commands
    upgrade(ws, attributeType) {
        let attributeMap = [0, 'maxHp', 'speed', 'damage'];
        const player = ENTITIES.PLAYERS[ws.id];
        if (player) {
            player.attributeBuffs[attributeMap[attributeType]] += 1;
            helperWriter.reset();
            helperWriter.writeU8(10);
            helperWriter.writeU8(attributeType);
            helperWriter.writeU8(1);
            ws.send(helperWriter.getBuffer());
        }
    }
}

export const cmdRun = new CommandMap();

export function colliding(e1, e2, buffer = 0) {
    const e1lastX = e1.lastX !== undefined ? e1.lastX : e1.x;
    const e1lastY = e1.lastY !== undefined ? e1.lastY : e1.y;
    const e2lastX = e2.lastX !== undefined ? e2.lastX : e2.x;
    const e2lastY = e2.lastY !== undefined ? e2.lastY : e2.y;

    const rSum = Math.max(0, e1.radius + e2.radius - buffer);
    const rSumSq = rSum * rSum;

    const fx = e1lastX - e2lastX;
    const fy = e1lastY - e2lastY;

    // Check if initially overlapping (t=0)
    const c = fx * fx + fy * fy;
    if (c <= rSumSq) return true;

    // Check if overlapping at end of tick (t=1)
    const gx = e1.x - e2.x;
    const gy = e1.y - e2.y;
    if (gx * gx + gy * gy <= rSumSq) return true;

    // Relative movement (delta velocity)
    const dx = (e1.x - e1lastX) - (e2.x - e2lastX);
    const dy = (e1.y - e1lastY) - (e2.y - e2lastY);

    const a = dx * dx + dy * dy;
    if (a < 0.001) return false; // No significant relative movement

    const b = 2 * (fx * dx + fy * dy);

    // Solve for time t where distance is minimized: t = -b / (2a)
    const tMin = -b / (2 * a);

    // If the closest point occurs between the start and end of the tick
    if (tMin > 0 && tMin < 1) {
        const minDistSq = a * (tMin ** 2) + b * tMin + c;
        return minDistSq <= rSumSq;
    }

    return false;
}