import {
    ENTITIES
} from './game.js';
import { spawnObject } from './game.js';
import {
    wss
} from '../server.js';
import {
    dataMap,
    isSwordRank,
    isAccessoryId,
    accessoryItemTypeFromId
} from '../public/shared/datamap.js';

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
    const list = ENTITIES[entityType];
    let id = 1;

    // Find the smallest available ID
    while (list[id]) {
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

export function poison(entity, dmgPerRate, rate, duration) {
    if (!entity || typeof entity.damage !== 'function') return;
    if (dmgPerRate <= 0 || rate <= 0 || duration <= 0) return;
    if (entity.isAlive === false || entity.hp <= 0) return;

    const now = performance.now();
    const endTime = now + duration;

    if (!entity._poison) {
        entity._poison = { timer: null, endTime: 0 };
    }

    // If already poisoned, just reset the duration timer
    entity._poison.endTime = endTime;
    if (entity._poison.timer) return;

    const tick = () => {
        if (!entity._poison) return;
        if (entity.isAlive === false || entity.hp <= 0 || performance.now() >= entity._poison.endTime) {
            clearTimeout(entity._poison.timer);
            entity._poison.timer = null;
            return;
        }

        entity.damage(dmgPerRate, { noKillCredit: true });
        if (entity.isAlive === false || entity.hp <= 0) {
            clearTimeout(entity._poison.timer);
            entity._poison.timer = null;
            return;
        }
        entity._poison.timer = setTimeout(tick, rate);
    };

    entity._poison.timer = setTimeout(tick, rate);
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
    setattr(entityType, entityId, attrIdx, value) {
        const entityListName = this.entityTypeMap[entityType];
        if (!entityListName) return;
        const entity = ENTITIES[entityListName][entityId];

        if (entity && entityType === 1) { // Player
            const player = entity;
            if (attrIdx === 1) { // defaultSpeed
                player.defaultSpeed = value;
            } else if (attrIdx === 2) { // score
                player.score = 0;
                player.addScore(Math.floor(value));
            } else if (attrIdx === 3) { // invincible
                player.invincible = !!value;
            } else if (attrIdx === 4) { // weapon rank (admin give)
                const rank = Math.floor(value);
                if (isSwordRank(rank)) {
                    // Always place into a new slot; if full, drop on ground.
                    let placed = false;
                    for (let i = 0; i < player.inventory.length; i++) {
                        if (!player.inventory[i] || player.inventory[i] === 0) {
                            player.inventory[i] = rank;
                            player.inventoryCounts[i] = 1;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        spawnObject(rank, player.x, player.y, 1);
                    } else {
                        player.sendInventoryUpdate();
                    }
                }
            } else if (attrIdx === 5) { // strength
                player.strength = Math.floor(value);
            } else if (attrIdx === 6) { // maxHealth
                const oldMaxHp = player.maxHp;
                player.maxHp = Math.floor(value);
                player.hp = Math.min(player.hp, player.maxHp); // Cap current hp to new max
            } else if (attrIdx === 8) { // coins (admin give)
                player.addGoldCoins(Math.floor(value));
            }
            player.sendStatsUpdate();
        } else if (entity && entityType === 2) { // Mob
            const mob = entity;
            if (attrIdx === 7) { // invincible
                mob.invincible = !!value;
            }
        }
    }
    agro(mobId, playerId, mobType, mobSpeedMult) {
        const player = ENTITIES.PLAYERS[playerId];

        if (mobId === 0) {
            for (const id in ENTITIES.MOBS) {
                const m = ENTITIES.MOBS[id];
                if (mobType === 0 || m.type === mobType) {
                    if (player) m.alarm(player);
                    if (mobSpeedMult > 0) m.speed = m.speed * mobSpeedMult;
                }
            }
        } else {
            const mob = ENTITIES.MOBS[mobId];
            if (mob) {
                if (player) mob.alarm(player);
                if (mobSpeedMult > 0) mob.speed = mob.speed * mobSpeedMult;
            }
        }
    }
    tpchest(playerId, chestType = null) {
        const player = ENTITIES.PLAYERS[playerId];
        if (!player) return;

        let targetChest = null;
        let minDistanceSq = Infinity;

        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (dataMap.CHEST_IDS.includes(object.type)) {
                if (chestType !== null && object.type !== chestType) continue;

                const dx = object.x - player.x;
                const dy = object.y - player.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    targetChest = object;
                }
            }
        }

        if (targetChest) {
            player.x = targetChest.x;
            player.y = targetChest.y;
        }
    }
    breakChests(dropLoot = false) {
        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (dataMap.CHEST_IDS.includes(object.type)) {
                if (!dropLoot) object.shouldDropLoop = false;
                object.die(null);
            }
        }
    }

    clearDrops() {
        for (const objectId in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[objectId];
            if (!dataMap.CHEST_IDS.includes(object.type)) { // If not a chest, it's a drop (or coin)
                if (object.die) object.die(null);
            }
        }
    }

    giveAccessory(entityId, accessoryId) {
        const player = ENTITIES.PLAYERS[entityId];
        if (!player || !player.isAlive) return;
        if (!isAccessoryId(accessoryId) || accessoryId === 0) return;

        const emptySlot = player.inventory.indexOf(0);
        if (emptySlot === -1) return;

        player.inventory[emptySlot] = accessoryItemTypeFromId(accessoryId);
        player.inventoryCounts[emptySlot] = 1;
        player.sendInventoryUpdate();
        player.sendStatsUpdate();
    }

    resetServer() {
        setTimeout(() => {
            process.exit(0);
        }, 50);
    }

    grantAdmin(targetId) {
        wss.clients.forEach(client => {
            if (client.id === targetId) {
                client.isAdmin = true;
                const pw = client.packetWriter;
                pw.reset();
                pw.writeU8(11); // ADMIN_AUTH packet
                pw.writeU8(1);
                client.send(pw.getBuffer());
            }
        });
    }

    kill(entityType, entityId) {
        if (entityType === 1) {
            const player = ENTITIES.PLAYERS[entityId];
            if (!player) return;
            if (!player.isAlive) return;
            player.die(null);
        } else if (entityType === 2) {
            const mob = ENTITIES.MOBS[entityId];
            if (mob) mob.die(null);
        }
    }

    setInvis(entityId, isInvisible) {
        const player = ENTITIES.PLAYERS[entityId];
        if (!player) return;
        player.isInvisible = !!isInvisible;
    }

    invis(entityType, startId, endId) {
        if (entityType !== 1) return;
        if (startId === 0 && endId === 65535) {
            for (const id in ENTITIES.PLAYERS) {
                this.setInvis(Number(id), true);
            }
            return;
        }
        for (let i = startId; i <= endId; i++) {
            this.setInvis(i, true);
        }
    }

    uninvis(entityType, startId, endId) {
        if (entityType !== 1) return;
        if (startId === 0 && endId === 65535) {
            for (const id in ENTITIES.PLAYERS) {
                this.setInvis(Number(id), false);
            }
            return;
        }
        for (let i = startId; i <= endId; i++) {
            this.setInvis(i, false);
        }
    }

    breakChest(chestId, dropLoot = false) {
        const chest = ENTITIES.OBJECTS[chestId];
        if (!chest) {
            return;
        }
        if (!dataMap.CHEST_IDS.includes(chest.type)) {
            return; // Not a chest
        }
        chest.shouldDropLoop = dropLoot;
        chest.die(null);
    }

    heal(entityType, entityId) {
        const entityListName = entityType === 1 ? 'PLAYERS' : 'MOBS';
        const entity = ENTITIES[entityListName][entityId];

        if (entity) {
            if (entityType === 1) {
                // Player: use hp and maxHp
                entity.hp = entity.maxHp;
            } else {
                // Mob: use hp and maxHp
                if (entity.maxHp) {
                    entity.hp = entity.maxHp;
                }
            }
        }
    }

    damage(entityType, entityId, damage, isPercentage) {
        const entityListName = this.entityTypeMap[entityType];
        if (!entityListName) return;

        const entity = ENTITIES[entityListName][entityId];
        if (entity) {
            let finalDamage = damage;
            if (isPercentage) {
                const maxHp = entity.maxHp || entity.maxHealth || 100;
                finalDamage = maxHp * damage;
            }
            entity.damage(finalDamage, null);
        }
    }

    activateAbility(playerId, abilityName) {
        const player = ENTITIES.PLAYERS[playerId];
        if (!player || !player.isAlive) return;

        const ability = (abilityName || '').toLowerCase();
        if (ability !== 'static_burst') return;

        const electricSfx = dataMap.sfxMap.indexOf('electric-sfx1');
        if (electricSfx >= 0) {
            playSfx(player.x, player.y, electricSfx, 1200);
        }

        const count = 30;
        const groupId = Math.random();
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            ENTITIES.newEntity({
                entityType: 'projectile',
                id: getId('PROJECTILES'),
                x: player.x + Math.cos(angle) * player.radius,
                y: player.y + Math.sin(angle) * player.radius,
                angle,
                type: 10,
                shooter: player,
                groupId
            });
        }
    }

    // regular commands
    upgrade(ws, attributeType) {
        let attributeMap = [0, 'maxHp', 'speed', 'damage'];
        const player = ENTITIES.PLAYERS[ws.id];
        if (player) {
            player.attributeBuffs[attributeMap[attributeType]] += 1;

            // Apply buffs to base attributes
            if (attributeType === 1) { // maxHp
                player.maxHp += 10;
                player.hp += 10;
            } else if (attributeType === 3) { // damage
                player.strength += 1;
            }

            helperWriter.reset();
            helperWriter.writeU8(10);
            helperWriter.writeU8(attributeType);
            helperWriter.writeU8(1);
            ws.send(helperWriter.getBuffer());

            player.sendStatsUpdate();
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
