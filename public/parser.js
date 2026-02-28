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
    showNotification,
    uiState,
    updateSettingsBody,
    updateShopBody
} from './ui.js';
import {
    Vars,
    LC,
    startJoinActionCooldown,
    addDamageIndicator,
    addCriticalHitIndicator,
    spawnMobDeathFade,
    spawnCoinPickupVfxToPlayer,
    spawnEnergyBurstFx,
    spawnLightningShotFx
} from './client.js';
import {
    dataMap,
    isSwordRank,
    isChestObjectType,
    isCoinObjectType
} from './shared/datamap.js';

// --- Packet Type Map ---
const PACKET_TYPES = {
    INIT: 1,
    UPDATE: 2,
    LEADERBOARD: 5,
    DIED: 6,
    AUDIO: 7,
    KICKED: 8,
    PING: 9,
    UPGRADE: 10,
    ADMIN_AUTH: 11,
    INVENTORY: 15,
    STATS: 18,
    PLAYER_COUNT: 20,
    LIGHTNING_SHOT_FX: 21,
    COIN_PICKUP_FX: 22,
    ENERGY_BURST_FX: 23,
    CRITICAL_HIT_FX: 24
};

function triggerDamageIndicator(prevHp, newHp, x, y, radius = 0) {
    if (!Number.isFinite(prevHp)) return;
    const nextHp = Number.isFinite(newHp) ? newHp : 0;
    const delta = prevHp - nextHp;
    if (delta <= 0) return;
    const { px, py } = jitterOnEntity(x, y, radius);
    addDamageIndicator(px, py, delta);
}

function jitterOnEntity(x, y, radius) {
    if (!radius || radius <= 0) {
        return { px: x, py: y };
    }
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius * 0.75;
    return {
        px: x + Math.cos(angle) * dist,
        py: y + Math.sin(angle) * dist
    };
}

export function parsePacket(buffer) {
    const reader = new PacketReader(buffer);
    const packetType = reader.readU8();

    switch (packetType) {
        case PACKET_TYPES.INIT:
            handleInitPacket(reader);
            break;
        case PACKET_TYPES.UPDATE:
            handleUpdatePacket(reader);
            break;
        case PACKET_TYPES.LEADERBOARD:
            handleLeaderboardPacket(reader);
            break;
        case PACKET_TYPES.DIED:
            handleDiedPacket(reader);
            break;
        case PACKET_TYPES.AUDIO:
            handleAudioPacket(reader);
            break;
        case PACKET_TYPES.KICKED:
            handleKickedPacket(reader);
            break;
        case PACKET_TYPES.PING:
            handlePingPacket();
            break;
        case PACKET_TYPES.UPGRADE:
            handleUpgradePacket(reader);
            break;
        case PACKET_TYPES.ADMIN_AUTH:
            handleAdminAuthPacket(reader);
            break;
        case PACKET_TYPES.INVENTORY:
            handleInventoryPacket(reader);
            break;
        case PACKET_TYPES.STATS:
            handleStatsPacket(reader);
            break;
        case PACKET_TYPES.PLAYER_COUNT:
            handlePlayerCountPacket(reader);
            break;
        case PACKET_TYPES.LIGHTNING_SHOT_FX:
            handleLightningShotFxPacket(reader);
            break;
        case PACKET_TYPES.COIN_PICKUP_FX:
            handleCoinPickupFxPacket(reader);
            break;
        case PACKET_TYPES.ENERGY_BURST_FX:
            handleEnergyBurstFxPacket(reader);
            break;
        case PACKET_TYPES.CRITICAL_HIT_FX:
            handleCriticalHitFxPacket(reader);
            break;
        default:
            // console.warn(`Unknown packet type: ${packetType}`);
            break;
    }
}

// --- Packet Handlers ---

function handleInitPacket(reader) {
    // Players
    const playerCount = reader.readU8();
    for (let i = 0; i < playerCount; i++) {
        const id = reader.readU8();
        const x = reader.readU16();
        const y = reader.readU16();
        const angle = reader.readF32();
        const username = reader.readString();

        const player = new Player(id, x, y);
        player.angle = angle;
        player.username = username;
    }

    // Mobs
    const mobCount = reader.readU16();
    for (let i = 0; i < mobCount; i++) {
        const id = reader.readU16();
        const x = reader.readU16();
        const y = reader.readU16();
        const angle = reader.readF32();
        const type = reader.readI8();

        const mob = new Mob(id, x, y, type);
        mob.angle = angle;
    }

    // Structures
    const structureCount = reader.readU16();
    for (let i = 0; i < structureCount; i++) {
        const id = reader.readU16();
        const x = reader.readU16();
        const y = reader.readU16();
        const type = reader.readI8();

        new Structure(id, x, y, type);
    }

    // Objects
    const objectCount = reader.readU16();
    for (let i = 0; i < objectCount; i++) {
        const id = reader.readU16();
        const x = reader.readU16();
        const y = reader.readU16();
        const type = reader.readI8();

        new GameObject(id, x, y, type);
    }
}

function handleUpdatePacket(reader) {
    // Update Players
    const playerCount = reader.readU8();
    const playerIdsThisUpdate = new Set();
    for (let i = 0; i < playerCount; i++) {
        const id = reader.readU8();
        playerIdsThisUpdate.add(id);
        const mask = reader.readU16();
        let p = ENTITIES.PLAYERS[id];
        const prevPlayerHp = p?.health;

        if (mask & 0x8000) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const angle = reader.readF32();
            const hp = reader.readU16();
            const maxHp = reader.readU16();
            const score = reader.readU32();
            const weaponRank = reader.readU8();
            const swingState = reader.readU8();
            const hasShield = reader.readU8();
            const isAlive = reader.readU8();
            const hasWeapon = reader.readU8();
            const accessoryId = reader.readU8();
            const isInvisible = reader.readU8();
            const username = reader.readString();
            const chatMessage = reader.readString();

            if (!p) p = new Player(id, x, y);
            p.newX = x;
            p.newY = y;
            p.newAngle = angle;
            p.health = hp;
            p.maxHealth = maxHp;
            p.newScore = score;
            p.weaponRank = weaponRank;
            p.newSwingState = swingState;
            p.hasShield = hasShield;
            p.isAlive = isAlive;
            p.hasWeapon = hasWeapon;
            p.accessoryId = accessoryId;
            p.isInvisible = isInvisible;
            p.username = username;
            p.chatMessage = chatMessage;
            triggerDamageIndicator(prevPlayerHp, hp, x, y, dataMap.PLAYERS.baseRadius);
        } else { // Delta Update
            if (!p) continue; // Should not happen with well-behaved server
            if (mask & 0x01) p.newX = reader.readU16();
            if (mask & 0x02) p.newY = reader.readU16();
            if (mask & 0x04) p.newAngle = reader.readF32();
            if (mask & 0x08) {
                const newHp = reader.readU16();
                triggerDamageIndicator(p.health, newHp, p.newX ?? p.x ?? 0, p.newY ?? p.y ?? 0, p.radius || dataMap.PLAYERS.baseRadius);
                p.health = newHp;
            }
            if (mask & 0x10) p.maxHealth = reader.readU16();
            if (mask & 0x20) p.newScore = reader.readU32();
            if (mask & 0x40) p.weaponRank = reader.readU8();
            if (mask & 0x80) p.newSwingState = reader.readU8();
            if (mask & 0x100) p.hasWeapon = reader.readU8();
            if (mask & 0x200) p.hasShield = reader.readU8();
            if (mask & 0x400) p.isAlive = reader.readU8();
            if (mask & 0x800) p.chatMessage = reader.readString();
            if (mask & 0x1000) p.username = reader.readString();
            if (mask & 0x2000) p.accessoryId = reader.readU8();
            if (mask & 0x4000) p.isInvisible = reader.readU8();
        }
    }

    // Cleanup players
    for (const id in ENTITIES.PLAYERS) {
        if (!playerIdsThisUpdate.has(Number(id))) delete ENTITIES.PLAYERS[id];
    }

    // Sync my stats
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        Vars.myStats.hp = myPlayer.health;
        Vars.myStats.maxHp = myPlayer.maxHealth;
    }

    // Update Mobs
    const mobCount = reader.readU16();
    const mobIdsThisUpdate = new Set();
    for (let i = 0; i < mobCount; i++) {
        const id = reader.readU16();
        mobIdsThisUpdate.add(id);
        const mask = reader.readU8();
        let m = ENTITIES.MOBS[id];
        const prevMobHp = m?.health;

        if (mask & 0x80) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const angle = reader.readF32();
            const hp = reader.readU16();
            const maxHp = reader.readU16();
            const type = reader.readU8();
            const swingState = reader.readU8();

            if (!m) m = new Mob(id, x, y, type);
            m.newX = x; m.newY = y; m.newAngle = angle;
            m.health = hp; m.maxHealth = maxHp; m.type = type;
            m.newSwingState = swingState;
            if (m.type !== m.lastType) m.lastType = m.type;
            triggerDamageIndicator(prevMobHp, hp, x, y, dataMap.MOBS[type]?.radius);
        } else { // Delta Update
            if (!m) continue;
            if (mask & 0x01) m.newX = reader.readU16();
            if (mask & 0x02) m.newY = reader.readU16();
            if (mask & 0x04) m.newAngle = reader.readF32();
            if (mask & 0x08) {
                const newHp = reader.readU16();
                triggerDamageIndicator(m.health, newHp, m.newX ?? m.x ?? 0, m.newY ?? m.y ?? 0, dataMap.MOBS[m.type]?.radius);
                m.health = newHp;
            }
            if (mask & 0x10) m.maxHealth = reader.readU16();
            if (mask & 0x20) m.type = reader.readU8();
            if (mask & 0x40) m.newSwingState = reader.readU8();
        }
    }
    for (const id in ENTITIES.MOBS) {
        if (!mobIdsThisUpdate.has(Number(id))) {
            const mob = ENTITIES.MOBS[id];
            if (mob?.type === 6) spawnMobDeathFade(mob);
            delete ENTITIES.MOBS[id];
        }
    }

    // Update Projectiles
    const projCount = reader.readU16();
    const projIdsThisUpdate = new Set();
    for (let i = 0; i < projCount; i++) {
        const id = reader.readU16();
        projIdsThisUpdate.add(id);
        const mask = reader.readU8();
        let p = ENTITIES.PROJECTILES[id];

        if (mask & 0x80) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const angle = reader.readF32();
            const type = reader.readI8();
            const rank = reader.readU8();
            if (!p) p = new Projectile(id, x, y, angle, type, rank);
            p.newX = x; p.newY = y; p.newAngle = angle;
            p.type = type; p.weaponRank = rank;
            p.renderLength = (type === 10) ? reader.readU16() : 0;
        } else { // Delta Update
            if (!p) continue;
            if (mask & 0x01) p.newX = reader.readU16();
            if (mask & 0x02) p.newY = reader.readU16();
            if (mask & 0x04) p.newAngle = reader.readF32();
            if (mask & 0x08) p.type = reader.readI8();
            if (mask & 0x10) p.weaponRank = reader.readU8();
            if (mask & 0x20) p.renderLength = reader.readU16();
        }
    }
    for (const id in ENTITIES.PROJECTILES) {
        if (!projIdsThisUpdate.has(Number(id))) delete ENTITIES.PROJECTILES[id];
    }

    // Update Objects
    const objCount = reader.readU16();
    const objIdsThisUpdate = new Set();
    for (let i = 0; i < objCount; i++) {
        const id = reader.readU16();
        objIdsThisUpdate.add(id);
        const mask = reader.readU8();
        let o = ENTITIES.OBJECTS[id];
        const prevObjHp = o?.health;

        if (mask & 0x80) { // Full Update
            const x = reader.readU16();
            const y = reader.readU16();
            const type = reader.readI8();
            const health = reader.readU16();
            const amount = reader.readU32();
            const isChestType = isChestObjectType(type);
            if (!o) o = new GameObject(id, x, y, type);
            o.newX = x; o.newY = y; o.setType(type); o.health = health;
            o.amount = amount;
            if (isChestType) {
                triggerDamageIndicator(prevObjHp, health, x, y, dataMap.OBJECTS[type]?.radius);
            }
        } else { // Delta Update
            if (!o) continue;
            if (mask & 0x01) o.newX = reader.readU16();
            if (mask & 0x02) o.newY = reader.readU16();
            if (mask & 0x04) {
                const newHp = reader.readU16();
                if (isChestObjectType(o.type)) {
                    triggerDamageIndicator(o.health, newHp, o.newX ?? o.x ?? 0, o.newY ?? o.y ?? 0, dataMap.OBJECTS[o.type]?.radius);
                }
                o.health = newHp;
            }
            if (mask & 0x08) o.setType(reader.readI8());
            if (mask & 0x10) o.amount = reader.readU32();
        }
    }
    for (const id in ENTITIES.OBJECTS) {
        if (!objIdsThisUpdate.has(Number(id))) {
            delete ENTITIES.OBJECTS[id];
        }
    }
}

function handleLeaderboardPacket(reader) {
    const leaderboard = [];
    const playerCount = reader.readU8();
    for (let i = 0; i < playerCount; i++) {
        leaderboard.push({
            id: reader.readU8(),
            score: reader.readU32(),
            username: reader.readString()
        });
    }
    ENTITIES.leaderboard = leaderboard;
}

function handleDiedPacket(reader) {
    LC.zoomOut();
    Vars.lastDiedTime = performance.now();
    startJoinActionCooldown();

    const victimType = reader.readU8();
    const victimId = victimType === 1 ? reader.readU8() : reader.readU16();

    if (victimType === 1) { // Died to player
        const killer = ENTITIES.PLAYERS[victimId];
        if (killer) showNotification(`You died to ${killer.username}!`, 'red');
    } else if (victimType === 2) { // Died to mob
        const mob = ENTITIES.MOBS[victimId];
        if (mob?.type === 3) showNotification("You died to a cow!", 'red');
    }

    // Reset local predicted stats
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        myPlayer.serverAttributes = {
            speed: dataMap.PLAYERS.baseMovementSpeed,
            damage: 0
        };
    }
}

function handleAudioPacket(reader) {
    const type = reader.readU8();
    const volume = reader.readU8();
    const sfxName = dataMap.sfxMap[type];
    if (!sfxName) return;
    const sfxCfg = dataMap.AUDIO[sfxName] || {};

    LC.playAudio({
        name: sfxName,
        timestamp: sfxCfg.defaultTimestamp ?? 0,
        endTime: sfxCfg.defaultEndTime ?? sfxCfg.endTime ?? null,
        volume: (volume / 100) * (sfxCfg.defaultVolume ?? 1),
        speed: sfxCfg.defaultSpeed ?? 1
    });
}

function handleKickedPacket(reader) {
    const message = reader.readString();
    Vars.lastDiedTime = performance.now();
    startJoinActionCooldown();
    uiState.forceHomeScreen = true;
    alert(`KICKED: ${message}`);
}

function handlePingPacket() {
    Vars.ping = Date.now() - Vars.lastSentPing;
}

function handleUpgradePacket(reader) {
    const attributeMap = [null, 'maxHp', 'speed', 'damage'];
    const attrType = reader.readU8();
    const amount = reader.readU8();
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer && attributeMap[attrType]) {
        myPlayer.serverAttributes[attributeMap[attrType]] += amount;
    }
}

function handleAdminAuthPacket(reader) {
    const success = reader.readU8();
    if (success) {
        Vars.isAdmin = true;
        showNotification("You're now admin!", 'green');
        if (typeof updateSettingsBody === 'function') {
            updateSettingsBody();
        }
    } else {
        showNotification("That key is invalid!", 'red');
    }
}

function handleInventoryPacket(reader) {
    const serverSelected = reader.readU8();
    // 200ms buffer to prevent local selection flicker
    if (!Vars.lastSelectionTime || performance.now() - Vars.lastSelectionTime > 200) {
        Vars.selectedSlot = serverSelected;
    }

    for (let i = 0; i < 35; i++) {
        Vars.myInventory[i] = reader.readU8();
        Vars.myInventoryCounts[i] = reader.readU32();
    }

    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (myPlayer) {
        myPlayer.weaponRank = Vars.myInventory[Vars.selectedSlot];
    }

    if (uiState.isShopOpen) updateShopBody();
}

function handleStatsPacket(reader) {
    Vars.myStats.dmgHit = reader.readU16();
    Vars.myStats.dmgThrow = reader.readU16();
    Vars.myStats.speed = reader.readU16();
    Vars.myStats.hp = reader.readU16();
    Vars.myStats.maxHp = reader.readU16();
    Vars.myStats.goldCoins = reader.readU32();
    Vars.inCombat = reader.readU8();
    Vars.vikingComboCount = reader.readU8();
    Vars.abilityCooldownMs = reader.readU16();
    Vars.abilityCooldownRemainingMs = reader.readU16();
    Vars.abilityCooldownEndsAt = performance.now() + Vars.abilityCooldownRemainingMs;

    // Re-render stats if they are visible
    if (uiState.isSettingsOpen && uiState.activeTab === 'Stats') {
        updateSettingsBody();
    }
    if (uiState.isShopOpen) {
        updateShopBody();
    }
}

function handlePlayerCountPacket(reader) {
    Vars.onlineCount = reader.readU8();
    const countEl = document.getElementById('home-online-count');
    if (!countEl) return;
    const homeScreen = document.getElementById('home-screen');
    if (!homeScreen || homeScreen.style.display === 'none') return;
    const count = Math.max(0, Vars.onlineCount || 0);
    countEl.textContent = `${count} player${count === 1 ? '' : 's'} online`;
}

function handleLightningShotFxPacket(reader) {
    const startX = reader.readU16();
    const startY = reader.readU16();
    const endX = reader.readU16();
    const endY = reader.readU16();
    const durationMs = reader.readU16();
    spawnLightningShotFx(startX, startY, endX, endY, durationMs);
}

function handleCoinPickupFxPacket(reader) {
    const startX = reader.readU16();
    const startY = reader.readU16();
    const targetPlayerId = reader.readU8();
    const amount = reader.readU16();
    spawnCoinPickupVfxToPlayer(startX, startY, targetPlayerId, amount);
}

function handleEnergyBurstFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    const radius = reader.readU16();
    const durationMs = reader.readU16();
    const waves = reader.readU8();
    spawnEnergyBurstFx(x, y, radius, durationMs, waves);
}

function handleCriticalHitFxPacket(reader) {
    const x = reader.readU16();
    const y = reader.readU16();
    addCriticalHitIndicator(x, y);
}

// --- Helper Classes ---

class PacketReader {
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.offset = 0;
        this.decoder = new TextDecoder();
    }

    readU8() { return this.view.getUint8(this.offset++); }
    readI8() { return this.view.getInt8(this.offset++); }
    readU16() {
        const val = this.view.getUint16(this.offset);
        this.offset += 2;
        return val;
    }
    readU32() {
        const val = this.view.getUint32(this.offset);
        this.offset += 4;
        return val;
    }
    readF32() {
        const val = this.view.getFloat32(this.offset);
        this.offset += 4;
        return val;
    }
    readString() {
        const len = this.readU8();
        const str = this.decoder.decode(new Uint8Array(this.view.buffer, this.offset, len));
        this.offset += len;
        return str;
    }
}

