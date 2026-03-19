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
import {
    isAccessoryItemType,
    accessoryIdFromItemType,
    isXpShopItemType,
    isSwordRank
} from '../public/shared/datamap.js';

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
    DROP_SLOT: 22,
    SELECT_SLOT: 16,
    SWAP_SLOTS: 17,
    BUY: 20,
    SELL: 21,
    EQUIP_ACCESSORY: 23,
    USE_ABILITY: 24,
    DROP_EQUIPPED_ACCESSORY: 25,
    TUTORIAL_EVENT: 28
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
        case PACKET_TYPES.DROP_SLOT:
            player.dropItemFromSlot(reader.readU8());
            break;
        case PACKET_TYPES.SELECT_SLOT:
            player.selectSlot(reader.readU8());
            break;
        case PACKET_TYPES.SWAP_SLOTS:
            player.swapSlots(reader.readU8(), reader.readU8());
            break;
        case PACKET_TYPES.BUY:
            handleBuyPacket(reader, player);
            break;
        case PACKET_TYPES.SELL:
            handleSellPacket(reader, player);
            break;
        case PACKET_TYPES.EQUIP_ACCESSORY:
            handleEquipAccessoryPacket(reader, player);
            break;
        case PACKET_TYPES.USE_ABILITY:
            handleUseAbilityPacket(reader, player);
            break;
        case PACKET_TYPES.DROP_EQUIPPED_ACCESSORY:
            player.dropEquippedAccessory();
            break;
        case PACKET_TYPES.TUTORIAL_EVENT:
            handleTutorialEventPacket(reader, player);
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
            username: username,
            world: ws.world || 'main'
        });
    } else {
        player.username = username;
        player.world = ws.world || player.world || 'main';
        player.isAlive = true;
        player.health = player.maxHealth;
        player.x = MAP_SIZE[0] / 2;
        player.y = MAP_SIZE[1] / 2;
    }

    ws.seenEntities = new Set();
    ENTITIES.PLAYERS[ws.id].isAlive = true;
    ENTITIES.PLAYERS[ws.id].sendInventoryUpdate();
    ENTITIES.PLAYERS[ws.id].updateProgressShield();
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
    if (player.hasShield && player.touchingSafeZone) {
        player.isAlive = false;
        player.lastDiedTime = performance.now();
    }
}

function readU16BE(reader, buffer) {
    const value = buffer.readUint16BE(reader.offset);
    reader.offset += 2;
    return value;
}

function readRangeU16(reader, buffer) {
    const startId = readU16BE(reader, buffer);
    const endId = readU16BE(reader, buffer);
    return { startId, endId };
}

function readEntityRange(reader, buffer) {
    const entType = reader.readU8();
    const { startId, endId } = readRangeU16(reader, buffer);
    return { entType, startId, endId };
}

function forRange(startId, endId, fn) {
    for (let i = startId; i <= endId; i++) {
        fn(i);
    }
}

function forMobType(mobType, fn) {
    for (const id in ENTITIES.MOBS) {
        const mob = ENTITIES.MOBS[id];
        if (!mob || mob.type !== mobType) continue;
        fn(mob);
    }
}

function handleCommandPacket(reader, ws, buffer) {
    const cmdType = reader.readU8();

    if (!ws.isAdmin) {
        // Allow non-admin self-kill only: /kill @s
        if (cmdType === 8) {
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            if (entType === 1 && startId === ws.id && endId === ws.id) {
                const player = ENTITIES.PLAYERS[ws.id];
                if (player && player.isAlive) {
                    const inCombat = performance.now() - player.lastCombatTime < 10000;
                    const killer = inCombat && player.lastDamager ? player.lastDamager : null;
                    player.die(killer);
                }
            }
        }
        return;
    }

    switch (cmdType) {
        case 1: { // TP Pos
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const x = readU16BE(reader, buffer);
            const y = readU16BE(reader, buffer);
            forRange(startId, endId, i => {
                cmdRun.tppos(entType, i, x, y);
            });
            break;
        }
        case 2: { // TP Ent
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const targetType = reader.readU8();
            const { startId: targetStartId, endId: targetEndId } = readRangeU16(reader, buffer);
            forRange(startId, endId, i => {
                forRange(targetStartId, targetEndId, j => {
                    cmdRun.tpent(entType, i, targetType, j);
                });
            });
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
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const attr = reader.readU8();
            const val = reader.readF32();
            forRange(startId, endId, i => {
                cmdRun.setattr(entType, i, attr, val);
            });
            break;
        }
        case 5: { // Agro
            const mobId = readU16BE(reader, buffer);
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
        case 8: { // Kill player range
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            forRange(startId, endId, i => {
                cmdRun.kill(entType, i);
            });
            break;
        }
        case 9: { // Break Chests range
            const { startId, endId } = readRangeU16(reader, buffer);
            const dropLoot = reader.readU8() === 1;
            forRange(startId, endId, i => {
                cmdRun.breakChest(i, dropLoot);
            });
            break;
        }
        case 10: { // Heal entity range
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            forRange(startId, endId, i => {
                cmdRun.heal(entType, i);
            });
            break;
        }
        case 11: { // Damage entity range
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const damage = reader.readF32();
            const isPercentage = reader.readU8() === 1;
            forRange(startId, endId, i => {
                cmdRun.damage(entType, i, damage, isPercentage);
            });
            break;
        }
        case 12: { // Clear Drops
            cmdRun.clearDrops();
            break;
        }
        case 14: { // Mob-type commands
            const subType = reader.readU8();
            const mobType = reader.readU8();

            if (subType === 1) { // tppos
                const x = readU16BE(reader, buffer);
                const y = readU16BE(reader, buffer);
                forMobType(mobType, mob => cmdRun.tppos(2, mob.id, x, y));
            } else if (subType === 2) { // tpent
                const targetType = reader.readU8();
                const targetId = readU16BE(reader, buffer);
                forMobType(mobType, mob => cmdRun.tpent(2, mob.id, targetType, targetId));
            } else if (subType === 4) { // setattr
                const attrIdx = reader.readU8();
                const value = reader.readF32();
                forMobType(mobType, mob => cmdRun.setattr(2, mob.id, attrIdx, value));
            } else if (subType === 8) { // kill
                forMobType(mobType, mob => cmdRun.kill(2, mob.id));
            } else if (subType === 10) { // heal
                forMobType(mobType, mob => cmdRun.heal(2, mob.id));
            } else if (subType === 11) { // damage
                const damage = reader.readF32();
                const isPercentage = reader.readU8() === 1;
                forMobType(mobType, mob => cmdRun.damage(2, mob.id, damage, isPercentage));
            }
            break;
        }
        case 13: { // Render/View range override
            const rangeMult = reader.readF32();
            const p = ENTITIES.PLAYERS[ws.id];
            if (p && rangeMult > 0) {
                const clamped = Math.max(0.1, Math.min(rangeMult, 10));
                p.viewRangeOverride = clamped;
                p.viewRangeMult = clamped;
                ws.viewRangeMult = clamped;
            }
            break;
        }
        case 15: { // Reset server
            let seed = null;
            if (reader.offset + 4 <= buffer.length) {
                seed = buffer.readUint32BE(reader.offset);
                reader.offset += 4;
            }
            cmdRun.resetServer(seed);
            break;
        }
        case 16: { // Give accessory
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            const accessoryId = reader.readU8();
            if (entType !== 1) break;
            forRange(startId, endId, i => {
                cmdRun.giveAccessory(i, accessoryId);
            });
            break;
        }
        case 17: { // Grant admin
            const targetId = reader.readU8();
            cmdRun.grantAdmin(targetId);
            break;
        }
        case 18: { // Invis
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            cmdRun.invis(entType, startId, endId);
            break;
        }
        case 19: { // Uninvis
            const { entType, startId, endId } = readEntityRange(reader, buffer);
            cmdRun.uninvis(entType, startId, endId);
            break;
        }
        case 20: { // Activate ability (admin self-cast)
            const abilityName = reader.readString();
            let targetX = null;
            let targetY = null;
            let durationSeconds = null;
            const normalizedAbility = (abilityName || '').toLowerCase();
            if (normalizedAbility === 'lightning_shot' && reader.offset + 4 <= buffer.length) {
                targetX = reader.readU16();
                targetY = reader.readU16();
            } else if ((normalizedAbility === 'stamina_boost' || normalizedAbility === 'speed_boost') && reader.offset + 2 <= buffer.length) {
                durationSeconds = reader.readU16();
            }
            cmdRun.activateAbility(ws.id, abilityName, targetX, targetY, durationSeconds);
            break;
        }
        case 21: { // Creative inventory item
            const itemType = reader.readU8();
            const amount = buffer.readUint16BE(reader.offset);
            reader.offset += 2;
            const slot = reader.readU8();
            const drop = reader.readU8() === 1;
            cmdRun.creativeItem(ws.id, itemType, amount, slot, drop);
            break;
        }
        case 22: { // Spawn mob/structure
            const entityKey = reader.readString();
            let x = null;
            let y = null;
            if (reader.offset + 4 <= buffer.length) {
                x = reader.readU16();
                y = reader.readU16();
            }
            const player = ENTITIES.PLAYERS[ws.id];
            const fallbackX = Math.max(0, Math.min(MAP_SIZE[0], Math.round(player?.x ?? MAP_SIZE[0] / 2)));
            const fallbackY = Math.max(0, Math.min(MAP_SIZE[1], Math.round(player?.y ?? MAP_SIZE[1] / 2)));
            cmdRun.spawn(
                entityKey,
                Number.isFinite(x) ? x : fallbackX,
                Number.isFinite(y) ? y : fallbackY,
                player?.world || 'main'
            );
            break;
        }
        case 23: { // Break structures (non-natural)
            const structType = reader.readU8();
            cmdRun.breakStructures(structType || 0);
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

function handleBuyPacket(reader, player) {
    const itemType = reader.readU8();
    if (player) {
        if (isSwordRank(itemType)) {
            player.buyItem(itemType);
        } else if (isAccessoryItemType(itemType)) {
            const accessoryId = accessoryIdFromItemType(itemType);
            player.buyAccessory(accessoryId);
        } else if (isXpShopItemType(itemType)) {
            player.buyXp(itemType);
        }
    }
}

function handleSellPacket(reader, player) {
    const count = reader.readU8();
    const indices = [];
    for (let i = 0; i < count; i++) {
        indices.push(reader.readU8());
    }
    player.sellItems(indices);
}

function handleEquipAccessoryPacket(reader, player) {
    const itemType = reader.readU8();
    const fromSlot = reader.offset < reader.buffer.length ? reader.readU8() : 255;
    if (!player) return;
    if (itemType === 0) {
        player.unequipAccessory(fromSlot);
        return;
    }
    player.equipAccessoryFromItemType(itemType, fromSlot);
}

function handleUseAbilityPacket(reader, player) {
    if (!player || !player.isAlive) return;
    const ability = (player.activeAbility || '').toLowerCase();
    if (!ability) return;

    let targetX = null;
    let targetY = null;
    if (reader.offset + 4 <= reader.buffer.length) {
        targetX = reader.readU16();
        targetY = reader.readU16();
    }

    const cooldownMs = Math.max(0, player.abilityCooldownMs || 0);
    const now = performance.now();
    if (cooldownMs > 0 && now - (player.lastAbilityUseTime || 0) < cooldownMs) return;
    player.lastAbilityUseTime = now;
    cmdRun.activateAbility(player.id, ability, targetX, targetY);
    player.sendStatsUpdate();
}

function handleTutorialEventPacket(reader, player) {
    if (!player || !player.tutorial) return;
    const eventType = reader.readU8();
    if (eventType === 1 && player.tutorial.stage === 5) {
        player.tutorial.shopClosedAfterBuy = true;
    } else if (eventType === 3 && player.tutorial.stage === 0 && !player.tutorial.desktopMovementSequenceEnabled) {
        player.tutorial.desktopMovementSequenceEnabled = true;
        player.tutorial.movementHoldIndex = 0;
        player.tutorial.movementHoldStartedAt = 0;
        player.sendTutorialObjective('Hold the "W" key on your keyboard for 2 seconds (your player will move NORTH)', 0, 0);
    }
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


