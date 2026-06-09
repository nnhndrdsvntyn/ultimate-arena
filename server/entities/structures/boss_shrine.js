import { Structure } from "./structure.js";
import { dataMap, getBossPortalEntryBlockMessage } from "../../../public/shared/datamap.js";
import { WORLD_MAIN, WORLD_ROOT_DIMENSION, WORLD_YETI_DIMENSION, WORLD_DUNE_DIMENSION, WORLD_INFERNO_DIMENSION } from "../../../public/shared/worlds.js";
import {
    ENTITIES,
    deleteWorldState,
    isRootWalkerEncounterOpen,
    shouldCloseRootWalkerEncounter,
    closeRootWalkerEncounterState,
    spawnRootWalkerBoss,
    ensureRootDimensionEdgeTrees,
    isRootWalkerEncounterSpawnLocked,
    openRootWalkerEncounter,
    isYetiEncounterOpen,
    shouldCloseYetiEncounter,
    closeYetiEncounterState,
    spawnYetiBoss,
    ensureYetiDimensionSnowStructures,
    isYetiEncounterSpawnLocked,
    openYetiEncounter,
    isDuneEncounterOpen,
    shouldCloseDuneEncounter,
    closeDuneEncounterState,
    spawnDuneBoss,
    ensureDuneDimensionDesertStructures,
    isDuneEncounterSpawnLocked,
    openDuneEncounter,
    isInfernoEncounterOpen,
    shouldCloseInfernoEncounter,
    closeInfernoEncounterState,
    spawnInfernoBoss,
    ensureInfernoDimensionMagmaStructures,
    isInfernoEncounterSpawnLocked,
    openInfernoEncounter
} from "../../game.js";
import { clearWorldCaches, cmdRun, PacketWriter } from "../../helpers.js";
import { wss } from "../../../server.js";

const BOSS_PORTAL_HOLD_MS = 3000;

const BOSS_ENCOUNTERS = {
    rootWalker: {
        shrineType: 4,
        dimension: WORLD_ROOT_DIMENSION,
        isOpen: isRootWalkerEncounterOpen,
        shouldClose: shouldCloseRootWalkerEncounter,
        closeState: closeRootWalkerEncounterState,
        spawnBoss: spawnRootWalkerBoss,
        ensureDimensionStructures: ensureRootDimensionEdgeTrees,
        isSpawnLocked: isRootWalkerEncounterSpawnLocked,
        open: openRootWalkerEncounter
    },
    yeti: {
        shrineType: 8,
        dimension: WORLD_YETI_DIMENSION,
        isOpen: isYetiEncounterOpen,
        shouldClose: shouldCloseYetiEncounter,
        closeState: closeYetiEncounterState,
        spawnBoss: spawnYetiBoss,
        ensureDimensionStructures: ensureYetiDimensionSnowStructures,
        isSpawnLocked: isYetiEncounterSpawnLocked,
        open: openYetiEncounter
    },
    dune: {
        shrineType: 10,
        dimension: WORLD_DUNE_DIMENSION,
        isOpen: isDuneEncounterOpen,
        shouldClose: shouldCloseDuneEncounter,
        closeState: closeDuneEncounterState,
        spawnBoss: spawnDuneBoss,
        ensureDimensionStructures: ensureDuneDimensionDesertStructures,
        isSpawnLocked: isDuneEncounterSpawnLocked,
        open: openDuneEncounter
    },
    inferno: {
        shrineType: 9,
        dimension: WORLD_INFERNO_DIMENSION,
        isOpen: isInfernoEncounterOpen,
        shouldClose: shouldCloseInfernoEncounter,
        closeState: closeInfernoEncounterState,
        spawnBoss: spawnInfernoBoss,
        ensureDimensionStructures: ensureInfernoDimensionMagmaStructures,
        isSpawnLocked: isInfernoEncounterSpawnLocked,
        open: openInfernoEncounter
    }
};

function getEncounter(bossKey) {
    return BOSS_ENCOUNTERS[bossKey] || BOSS_ENCOUNTERS.rootWalker;
}

function getEncounterKey(bossKey) {
    return BOSS_ENCOUNTERS[bossKey] ? bossKey : 'rootWalker';
}

function resetPlayerPortalHold(player) {
    player._bossPortalSince = 0;
    player._bossPortalId = 0;
    player._rootWalkerPortalSince = 0;
}

export class BossPortal extends Structure {
    constructor(id, x, y, bossKey = 'rootWalker', portalMode = 'entry') {
        super(id, x, y, 5);
        this.bossKey = getEncounterKey(bossKey);
        this.portalMode = portalMode === 'exit' ? 'exit' : 'entry';
    }

    get encounter() {
        return getEncounter(this.bossKey);
    }

    isEncounterActive() {
        return this.encounter.isOpen();
    }

    process(now = performance.now(), worldPlayers = null) {
        if (this.shouldCloseEncounterPortal()) {
            this.closeEncounterPortal();
            return;
        }

        const players = Array.isArray(worldPlayers) ? worldPlayers : [];
        const portalRadius = Math.max(1, this.radius || dataMap.STRUCTURES?.[5]?.radius || 90);
        const radiusSq = portalRadius * portalRadius;

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (!player || !player.isAlive) continue;
            if ((player.world || WORLD_MAIN) !== (this.world || WORLD_MAIN)) continue;

            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const insidePortal = (dx * dx + dy * dy) <= radiusSq;

            if (!insidePortal) {
                if (player._bossPortalId === this.id) resetPlayerPortalHold(player);
                continue;
            }

            if (this.portalMode === 'entry' && !this.isEncounterActive()) {
                if (player._bossPortalId === this.id) resetPlayerPortalHold(player);
                continue;
            }

            if (player._bossPortalId !== this.id) {
                player._bossPortalSince = now;
                player._bossPortalId = this.id;
                player._rootWalkerPortalSince = now;
                continue;
            }

            if (now - player._bossPortalSince < BOSS_PORTAL_HOLD_MS) continue;
            resetPlayerPortalHold(player);

            if (!this.canPlayerEnter(player, portalRadius, dx, dy)) continue;

            const targetWorld = this.portalMode === 'exit' ? WORLD_MAIN : this.encounter.dimension;
            cmdRun.tpdim(1, player.id, targetWorld);
        }
    }

    canPlayerEnter(player, portalRadius, dx, dy) {
        if (this.portalMode === 'exit') return true;

        const blockMessage = getBossPortalEntryBlockMessage({
            score: player.score,
            inventory: player.inventory,
            inventoryCounts: player.inventoryCounts
        });
        if (!blockMessage) return true;

        this.rejectPlayerEntry(player, portalRadius, dx, dy, blockMessage);
        return false;
    }

    rejectPlayerEntry(player, portalRadius, dx, dy, message) {
        const entityRadius = Math.max(0, player.radius || 0);
        const minDistance = portalRadius + entityRadius + 2;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        const dirX = dist > 0 ? (dx / dist) : 1;
        const dirY = dist > 0 ? (dy / dist) : 0;
        player.x = Math.round(this.x + (dirX * minDistance));
        player.y = Math.round(this.y + (dirY * minDistance));
        cmdRun.markTeleported(1, player);
        this.notifyEntryBlocked(player, message);
    }

    notifyEntryBlocked(player, message) {
        const client = [...wss.clients].find(c => c.id === player.id);
        if (!client || client.readyState !== 1) return;

        const pw = new PacketWriter(256);
        pw.writeU8(39);
        pw.writeU8(1);
        pw.writeStr(message);
        try { client.send(pw.getBuffer()); } catch (e) { }
    }

    shouldCloseEncounterPortal() {
        return this.portalMode === 'entry' && this.encounter.shouldClose();
    }

    closeEncounterPortal() {
        const encounter = this.encounter;
        const dimensionPlayers = [];
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player) continue;
            if ((player.world || WORLD_MAIN) !== encounter.dimension) continue;
            dimensionPlayers.push(player);
        }

        for (let i = 0; i < dimensionPlayers.length; i++) {
            const player = dimensionPlayers[i];
            resetPlayerPortalHold(player);
            cmdRun.tpdim(1, player.id, WORLD_MAIN);
        }

        deleteWorldState(encounter.dimension);
        clearWorldCaches(encounter.dimension);
        encounter.ensureDimensionStructures();
        encounter.spawnBoss();
        encounter.closeState();
        this.restoreShrine();
    }

    restoreShrine() {
        if (!ENTITIES.STRUCTURES[this.id]) return false;

        const world = this.world || WORLD_MAIN;
        const wasNatural = !!this.isNatural;
        const shrineType = this.encounter.shrineType;

        cmdRun.broadcastStructureRemove(this);
        delete ENTITIES.STRUCTURES[this.id];

        ENTITIES.newEntity({
            entityType: 'structure',
            id: this.id,
            x: this.x,
            y: this.y,
            type: shrineType,
            world
        });

        const shrine = ENTITIES.STRUCTURES[this.id];
        if (!shrine) return false;
        shrine.world = world;
        shrine.isNatural = wasNatural;
        cmdRun.broadcastStructureSpawn(shrine);
        return true;
    }
}

export class BossShrine extends Structure {
    constructor(id, x, y, bossKey = 'rootWalker') {
        const encounter = getEncounter(bossKey);
        super(id, x, y, encounter.shrineType);
        this.bossKey = getEncounterKey(bossKey);
    }

    get encounter() {
        return getEncounter(this.bossKey);
    }

    activate(player = null) {
        if (!ENTITIES.STRUCTURES[this.id]) return false;
        if (this.encounter.isSpawnLocked()) return false;
        this.encounter.open();
        this.encounter.spawnBoss();

        const world = this.world || WORLD_MAIN;
        const wasNatural = !!this.isNatural;

        cmdRun.broadcastStructureRemove(this);
        delete ENTITIES.STRUCTURES[this.id];

        new BossPortal(this.id, this.x, this.y, this.bossKey, 'entry');
        const portal = ENTITIES.STRUCTURES[this.id];
        if (!portal) return false;
        portal.world = world;
        portal.isNatural = wasNatural;
        cmdRun.broadcastStructureSpawn(portal);

        if (player) resetPlayerPortalHold(player);
        return true;
    }
}

export class RootWalkerShrine extends BossShrine {
    constructor(id, x, y) {
        super(id, x, y, 'rootWalker');
    }
}

export class YetiShrine extends BossShrine {
    constructor(id, x, y) {
        super(id, x, y, 'yeti');
    }
}

export class DuneShrine extends BossShrine {
    constructor(id, x, y) {
        super(id, x, y, 'dune');
    }
}

export class InfernoShrine extends BossShrine {
    constructor(id, x, y) {
        super(id, x, y, 'inferno');
    }
}

export class RootWalkerPortal extends BossPortal {
    constructor(id, x, y, portalMode = 'entry') {
        super(id, x, y, 'rootWalker', portalMode);
    }
}

export class YetiPortal extends BossPortal {
    constructor(id, x, y, portalMode = 'entry') {
        super(id, x, y, 'yeti', portalMode);
    }
}

export class DunePortal extends BossPortal {
    constructor(id, x, y, portalMode = 'entry') {
        super(id, x, y, 'dune', portalMode);
    }
}

export class InfernoPortal extends BossPortal {
    constructor(id, x, y, portalMode = 'entry') {
        super(id, x, y, 'inferno', portalMode);
    }
}
