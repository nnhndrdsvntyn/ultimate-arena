import {
    ENTITIES
} from '../game.js';
import {
    dataMap,
    ACCESSORY_KEYS,
    isChestObjectType,
    isWeaponRank,
    isSpearType,
    isBoomerangType,
    getWeaponSize,
    getWeaponAttackStats,
    getWeaponMeta,
    isWeaponProjectileType,
    getWeaponTypeByProjectileType,
    getWeaponProjectileType,
    AXE_10_TYPE,
    isRockStructureType
} from '../../public/shared/datamap.js';
import {
    colliding,
    playSfx,
    poison,
    emitCriticalHitFxToPlayer
} from '../helpers.js';
import { recordResolveCollisionCall } from '../debug.js';
import {
    Entity
} from './entity.js';
import { Player } from './players/player.js';

const VIKING_HIT_TARGET = 3;
const VIKING_BONUS_MULT = 1.3;
const MINOTAUR_PARRY_HALF_ANGLE = Math.PI / 3;
const MINOTAUR_CHARGE_DISTANCE_ON_PARRY = 90;
const MINOTAUR_PARRY_CHANCE_STAGE_1 = 0.5;
const MINOTAUR_PARRY_CHANCE_STAGE_2 = 0.65;
const MINOTAUR_PARRY_CHANCE_STAGE_3 = 0.85;
const THROWN_SWORD_HITBOX_MULT = 0.6;
const BOOMERANG_THROW_HITBOX_MULT = 0.36;
const BOOMERANG_RETURN_SPEED_MULT = 1.18;
const MINOTAUR_SLASH_PROJECTILE_TYPE = getWeaponProjectileType(AXE_10_TYPE);
const DEFAULT_ROCK_PUSH_STRENGTH = 85;
const BIG_ROCK_STRUCTURE_TYPE = 6;
const PROJECTILE_HIT_SFX_COOLDOWN_MS = 500;
const PROJECTILE_HIT_SFX_GROUP_CLEANUP_MS = 10000;
const PROJECTILE_HIT_SFX_GROUP_MAX_TARGETS = 20;

function getVikingHitInfo(shooter, baseDamage) {
    if (!shooter || !shooter.isAlive) return { damage: baseDamage, nextCount: 0, apply: false, isBonus: false };
    const accessoryKey = ACCESSORY_KEYS[shooter.accessoryId];
    if (accessoryKey !== 'viking_hat') return { damage: baseDamage, nextCount: 0, apply: false, isBonus: false };
    const next = (shooter.vikingHitCount || 0) + 1;
    const isBonus = next === VIKING_HIT_TARGET;
    const damage = isBonus ? baseDamage * VIKING_BONUS_MULT : baseDamage;
    return { damage, nextCount: isBonus ? 0 : next, apply: true, isBonus };
}

function commitVikingHit(shooter, nextCount) {
    if (!shooter) return;
    shooter.vikingHitCount = nextCount;
    shooter.lastVikingHitTime = performance.now();
    shooter.sendStatsUpdate();
}

function normalizeAngle(rad) {
    return ((rad + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
}

function canMinotaurParryThrow(mob, projectile) {
    if (!mob || !projectile || projectile.type !== -1 || mob.type !== 6) return false;

    // Must be within minotaur's sword swing reach.
    const [minotaurSwordWidth] = getWeaponSize(AXE_10_TYPE);
    const swingRange = minotaurSwordWidth * 2;
    const dx = projectile.x - mob.x;
    const dy = projectile.y - mob.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > swingRange * swingRange) return false;

    // Must be in front-ish cone so it can parry without rotating.
    const toProjectile = Math.atan2(dy, dx);
    const delta = Math.abs(normalizeAngle(toProjectile - mob.angle));
    return delta <= MINOTAUR_PARRY_HALF_ANGLE;
}

function canMinotaurParrySlash(mob, projectile) {
    if (!mob || !projectile || mob.type !== 6) return false;
    if (projectile.type === -1) return false; // throw uses separate parry logic
    if (!mob.swingState || mob.swingState <= 0) return false;

    const [minotaurSwordWidth] = getWeaponSize(AXE_10_TYPE);
    const swingRange = minotaurSwordWidth * 2;
    const dx = projectile.x - mob.x;
    const dy = projectile.y - mob.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > swingRange * swingRange) return false;

    const toProjectile = Math.atan2(dy, dx);
    const delta = Math.abs(normalizeAngle(toProjectile - mob.angle));
    return delta <= MINOTAUR_PARRY_HALF_ANGLE;
}

function chargeMinotaurTowardShooter(mob, shooter) {
    if (!mob || !shooter) return;
    const dx = shooter.x - mob.x;
    const dy = shooter.y - mob.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 0.001) return;
    mob.x += (dx / dist) * MINOTAUR_CHARGE_DISTANCE_ON_PARRY;
    mob.y += (dy / dist) * MINOTAUR_CHARGE_DISTANCE_ON_PARRY;
    if (typeof mob.clamp === 'function') mob.clamp();
}

function getProjectilePushAngle(projectile, structure) {
    const dx = structure.x - (projectile.lastX ?? projectile.x);
    const dy = structure.y - (projectile.lastY ?? projectile.y);
    if ((dx * dx + dy * dy) > 0.001) return Math.atan2(dy, dx);
    return projectile.angle || 0;
}

function tryPushStructureWithProjectile(projectile, structure) {
    if (!projectile || !structure || !isRockStructureType(structure.type)) return false;
    const pushTypes = projectile.rockPushTypes;
    if (!(pushTypes instanceof Set) || !pushTypes.has(Number(structure.type))) return false;

    const angle = getProjectilePushAngle(projectile, structure);
    const speedPush = Math.max(0, projectile.speed || projectile.expandPerTick || 0) * 0.45;
    const pushAmount = Math.max(12, Math.min(projectile.rockPushStrength || DEFAULT_ROCK_PUSH_STRENGTH, speedPush || DEFAULT_ROCK_PUSH_STRENGTH));
    structure.x += Math.cos(angle) * pushAmount;
    structure.y += Math.sin(angle) * pushAmount;
    if (typeof structure.clamp === 'function') structure.clamp();
    return true;
}

function getProjectileHitSfxGroupState(targetEntity, groupId) {
    if (!targetEntity) return null;
    if (!targetEntity._projectileHitSfxGroups) targetEntity._projectileHitSfxGroups = new Map();
    const key = groupId ?? '__default__';
    let groupState = targetEntity._projectileHitSfxGroups.get(key);
    if (!groupState) {
        groupState = {
            lastSoundTime: 0,
            lastUsedAt: 0
        };
        targetEntity._projectileHitSfxGroups.set(key, groupState);
    }
    return groupState;
}

function shouldPlayProjectileHitSfx(targetEntity, groupId, now = performance.now()) {
    if (!targetEntity) return true;

    const groupState = getProjectileHitSfxGroupState(targetEntity, groupId);
    if (!groupState) return true;

    if (now - (groupState.lastSoundTime || 0) < PROJECTILE_HIT_SFX_COOLDOWN_MS) return false;

    groupState.lastSoundTime = now;
    groupState.lastUsedAt = now;

    if (targetEntity._projectileHitSfxGroups.size > PROJECTILE_HIT_SFX_GROUP_MAX_TARGETS) {
        for (const [gid, state] of targetEntity._projectileHitSfxGroups) {
            if (!state || now - (state.lastUsedAt || 0) > PROJECTILE_HIT_SFX_GROUP_CLEANUP_MS) {
                targetEntity._projectileHitSfxGroups.delete(gid);
            }
        }
    }

    return true;
}

function getStructureImpactCost(structure) {
    return Number(structure?.type) === BIG_ROCK_STRUCTURE_TYPE ? 2 : 1;
}

function getMinotaurParryChance(mob) {
    if (!mob || mob.type !== 6) return MINOTAUR_PARRY_CHANCE_STAGE_1;

    if (typeof mob.getDifficultyStage === 'function') {
        const stage = mob.getDifficultyStage();
        if (stage >= 3) return MINOTAUR_PARRY_CHANCE_STAGE_3;
        if (stage === 2) return MINOTAUR_PARRY_CHANCE_STAGE_2;
        return MINOTAUR_PARRY_CHANCE_STAGE_1;
    }

    const hp = Number.isFinite(mob.hp) ? mob.hp : 0;
    const maxHp = Number.isFinite(mob.maxHp) && mob.maxHp > 0 ? mob.maxHp : 1;
    const ratio = hp / maxHp;
    if (ratio <= 0.2) return MINOTAUR_PARRY_CHANCE_STAGE_3;
    if (ratio <= 0.6) return MINOTAUR_PARRY_CHANCE_STAGE_2;
    return MINOTAUR_PARRY_CHANCE_STAGE_1;
}

export class Projectile extends Entity {
    constructor(id, x, y, angle, type, shooter, groupId, options = null) {
        const weaponAttackType = type === -1
            ? (shooter?.weapon?.rank || 1)
            : (isWeaponProjectileType(type)
                ? getWeaponTypeByProjectileType(type)
                : (isWeaponRank(type) ? type : 0));
        const stats = weaponAttackType > 0
            ? (getWeaponAttackStats(weaponAttackType) || getWeaponAttackStats(1) || {})
            : (dataMap.PROJECTILES[type] || {});
        const speed = stats?.speed;
        const radius = stats?.radius;
        super(id, x, y, radius, speed, 0, 0);
        const basePlayerRadius = Math.max(1, dataMap.PLAYERS.baseRadius || 30);
        const isPlayerShooter = shooter && typeof shooter.accessoryId !== 'undefined';
        const playerScale = isPlayerShooter && Number.isFinite(shooter.radius)
            ? Math.max(0.2, shooter.radius / basePlayerRadius)
            : 1;

        this.groupId = groupId;
        this.angle = angle;
        this.type = type;
        const shooterDamageMult = (typeof shooter?.getAttackDamageMultiplier === 'function')
            ? shooter.getAttackDamageMultiplier()
            : 1;
        const statDamage = type === -1
            ? (Number(stats?.throwDamage) || Number(stats?.damage) || 0)
            : (Number(stats?.damage) || 0);
        this.damage = (shooter.strength + statDamage) * shooterDamageMult;
        if (isPlayerShooter) {
            this.damage *= playerScale;
        }
        if (this.shooter?.type === 6 && typeof this.shooter.getAttackDamageMultiplier === 'function') {
            this.damage *= this.shooter.getAttackDamageMultiplier();
        }
        if (this.shooter?.type === 6 && type === MINOTAUR_SLASH_PROJECTILE_TYPE) {
            this.damage *= 0.7;
        }
        this.maxDistance = stats?.maxDistance;

        if (type === -1) {
            const thrownWeaponRank = shooter.weapon.rank;
            const isBoomerangThrow = isBoomerangType(thrownWeaponRank);
            const [swordWidth, swordHeight] = getWeaponSize(thrownWeaponRank);
            this.radius = (swordWidth || this.radius || 100) * playerScale;
            this.radius *= isBoomerangThrow ? BOOMERANG_THROW_HITBOX_MULT : THROWN_SWORD_HITBOX_MULT;
            this.speed /= 1.25;
            this.maxDistance *= ((isBoomerangThrow ? 5 : 4) * playerScale);
            this.weaponRank = isSpearType(thrownWeaponRank)
                ? (thrownWeaponRank | 0x80)
                : thrownWeaponRank;
            if (isBoomerangThrow) {
                const meta = getWeaponMeta(thrownWeaponRank);
                const baseToughness = Math.max(1, Math.floor(Number(meta?.toughness) || 1));
                const toughness = baseToughness * Math.max(1, Math.floor(playerScale));
                this.boomerang = {
                    startX: x,
                    startY: y,
                    outboundDistance: Math.max(160, Math.min(this.maxDistance * 0.58, (swordWidth + swordHeight) * 3.2 * playerScale)),
                    toughness,
                    impacts: 0,
                    returning: false,
                    hitKeys: new Set()
                };
            }
            if (this.shooter?.inWater) {
                this.speed *= 0.4;
            }
        }
        if (type !== -1 && isWeaponProjectileType(type)) {
            this.radius *= playerScale;
            this.maxDistance *= playerScale;
        }
        this.distanceTraveled = 0;
        this.shooter = shooter;
        if (type !== -1) {
            this.weaponRank = shooter.weapon.rank;
        }
        this.knockbackStrength = stats?.knockbackStrength || 25;
        this.renderLength = null;
        this.staticRender = false;
        this.renderX = null;
        this.renderY = null;
        this.noMove = false;
        this.logicOnly = false;
        this.ttlMs = 0;
        this.spawnedAt = performance.now();
        this.expandPerTick = 0;
        this.persistentHits = false;
        this.hitEntities = null;
        this.impactDurability = 0;
        this.impactImpacts = 0;
        this.impactDamageHits = 0;
        this.impactHitKeys = null;
        this.ignoreStructureCollisions = false;
        this.rockPushTypes = null;
        this.rockPushStrength = DEFAULT_ROCK_PUSH_STRENGTH;

        if (!this.isThrownBoomerang()) {
            const weaponMeta = getWeaponMeta(this.weaponRank & 0x7F);
            if (weaponMeta && ['sword', 'spear', 'axe'].includes(weaponMeta.category)) {
                this.impactDurability = Math.max(0, Math.floor(Number(weaponMeta.toughness) || 0));
                this.impactHitKeys = new Set();
            }
        }

        this.fixedDistanceTravel = false;
        if (options && Number.isFinite(options.maxDistanceOverride) && options.maxDistanceOverride > 0) {
            this.maxDistance = options.maxDistanceOverride;
            this.fixedDistanceTravel = true;
        }
        if (options && Number.isFinite(options.speedOverride) && options.speedOverride > 0) {
            this.speed = options.speedOverride;
        }
        if (options?.staticRender) {
            this.staticRender = true;
            this.renderX = Number.isFinite(options.renderX) ? options.renderX : this.x;
            this.renderY = Number.isFinite(options.renderY) ? options.renderY : this.y;
        }
        if (options?.noMove) {
            this.noMove = true;
        }
        if (options?.logicOnly) {
            this.logicOnly = true;
        }
        if (Number.isFinite(options?.ttlMs) && options.ttlMs > 0) {
            this.ttlMs = options.ttlMs;
        }
        if (Number.isFinite(options?.radiusOverride) && options.radiusOverride > 0) {
            this.radius = options.radiusOverride;
        }
        if (Number.isFinite(options?.initialRadius) && options.initialRadius > 0) {
            this.radius = options.initialRadius;
        }
        if (Number.isFinite(options?.expandPerTick) && options.expandPerTick > 0) {
            this.expandPerTick = options.expandPerTick;
        }
        if (options?.persistentHits) {
            this.persistentHits = true;
            this.hitEntities = new Set();
        }
        if (Number.isFinite(options?.damageMult) && options.damageMult > 0) {
            this.damage *= options.damageMult;
        }
        if (options?.ignoreStructureCollisions) {
            this.ignoreStructureCollisions = true;
        }
        if (Array.isArray(options?.rockPushTypes)) {
            this.rockPushTypes = new Set(options.rockPushTypes.map(type => Number(type)).filter(isRockStructureType));
        }
        if (Number.isFinite(options?.rockPushStrength) && options.rockPushStrength > 0) {
            this.rockPushStrength = options.rockPushStrength;
        }
        if (type === 13) {
            const defaultBoltLength = (dataMap.PROJECTILES[13]?.imgProportions?.[0] || 10) * (dataMap.PROJECTILES[13]?.radius || 30);
            const visualLength = (options && Number.isFinite(options.visualLength) && options.visualLength > 0) ? options.visualLength : defaultBoltLength;
            this.renderLength = Math.max(1, Math.min(65535, Math.round(visualLength)));
        }

        // Minotaur slash projectiles hit harder in knockback than player slashes.
        if (this.type !== -1 && this.shooter?.type === 6) {
            this.knockbackStrength *= 2;
        }

        this.treesPassed = new Set();
        this.world = shooter?.world || 'main';
        ENTITIES.PROJECTILES[id] = this;
    }

    isThrownBoomerang() {
        return this.type === -1 && !!this.boomerang;
    }

    markBoomerangHit(hitKey) {
        if (!this.isThrownBoomerang() || !hitKey) return false;
        if (this.boomerang.hitKeys.has(hitKey)) return true;
        this.boomerang.hitKeys.add(hitKey);
        return false;
    }

    hasBoomerangHit(hitKey) {
        return this.isThrownBoomerang() && this.shouldDedupeBoomerangImpact(hitKey) && this.boomerang.hitKeys.has(hitKey);
    }

    hasImpactHit(hitKey) {
        if (!hitKey) return false;
        if (this.hasBoomerangHit(hitKey)) return true;
        return this.impactDurability > 0 && this.impactHitKeys?.has(hitKey);
    }

    shouldDedupeBoomerangImpact(hitKey = '') {
        return typeof hitKey === 'string' && (hitKey.startsWith('s:') || hitKey.startsWith('pr:'));
    }

    consumeBoomerangImpact(hitKey = '', impactCost = 1) {
        if (!this.isThrownBoomerang()) return true;
        if (this.shouldDedupeBoomerangImpact(hitKey) && this.markBoomerangHit(hitKey)) return false;
        this.impactDamageHits = (this.impactDamageHits || 0) + 1;
        const cost = Math.max(1, Math.floor(Number(impactCost) || 1));
        this.boomerang.impacts = (this.boomerang.impacts || 0) + cost;
        if (this.boomerang.impacts <= (this.boomerang.toughness || 1)) {
            return false;
        }
        this.startBoomerangReturn();
        return true;
    }

    startBoomerangReturn() {
        if (!this.isThrownBoomerang() || this.boomerang.returning) return false;
        this.boomerang.returning = true;
        this.distanceTraveled = Math.min(this.distanceTraveled, this.maxDistance * 0.55);
        return true;
    }

    finishBoomerangReturnIfCaught() {
        if (!this.isThrownBoomerang() || !this.boomerang.returning || !this.shooter?.isAlive) return false;
        const dx = this.shooter.x - this.x;
        const dy = this.shooter.y - this.y;
        const catchRadius = Math.max(this.shooter.radius || 0, 30) + Math.max(12, (this.radius || 0) * 0.35);
        if ((dx * dx + dy * dy) > catchRadius * catchRadius) return false;

        const rank = this.weaponRank & 0x7F;
        if (this.shooter.pendingWeaponReturnTimer) {
            clearTimeout(this.shooter.pendingWeaponReturnTimer);
            this.shooter.pendingWeaponReturnTimer = null;
        }
        if (typeof this.shooter.returnWeapon === 'function') {
            this.shooter.returnWeapon(rank);
        }
        ENTITIES.deleteEntity('projectile', this.id);
        return true;
    }

    resolveProjectileImpact(hitKey = '', impactCost = 1) {
        if (this.isThrownBoomerang()) {
            return this.consumeBoomerangImpact(hitKey, impactCost);
        }
        if (this.impactDurability > 0) {
            if (hitKey && this.impactHitKeys?.has(hitKey)) return false;
            if (hitKey) this.impactHitKeys?.add(hitKey);
            this.impactDamageHits = (this.impactDamageHits || 0) + 1;
            const cost = Math.max(1, Math.floor(Number(impactCost) || 1));
            this.impactImpacts = (this.impactImpacts || 0) + cost;
            if (this.impactImpacts <= this.impactDurability) {
                return false;
            }
        }
        ENTITIES.deleteEntity('projectile', this.id);
        return true;
    }

    move() {
        if (this.expandPerTick > 0) {
            this.lastX = this.x;
            this.lastY = this.y;
            this.radius += this.expandPerTick;
            this.distanceTraveled += this.expandPerTick;
            return;
        }
        if (this.noMove) return;
        this.lastX = this.x;
        this.lastY = this.y;
        if (this.isThrownBoomerang()) {
            if (this.boomerang.returning) {
                const target = this.shooter?.isAlive ? this.shooter : null;
                if (!target) {
                    ENTITIES.deleteEntity('projectile', this.id);
                    return;
                }
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
                const step = Math.min(dist, this.speed * BOOMERANG_RETURN_SPEED_MULT);
                this.x += (dx / dist) * step;
                this.y += (dy / dist) * step;
                this.angle = Math.atan2(this.y - this.lastY, this.x - this.lastX);
                this.distanceTraveled += step;
                this.finishBoomerangReturnIfCaught();
                return;
            }

            if (Number.isFinite(this.shooter?.angle)) {
                this.angle = normalizeAngle(this.shooter.angle);
            }
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
            this.distanceTraveled += this.speed;
            const dx = this.x - this.boomerang.startX;
            const dy = this.y - this.boomerang.startY;
            if ((dx * dx + dy * dy) >= (this.boomerang.outboundDistance * this.boomerang.outboundDistance)) {
                this.startBoomerangReturn();
            }
            return;
        }
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        this.distanceTraveled += this.speed;
    }

    getTravelDamageMultiplier() {
        // Only energy burst projectiles should lose damage over distance.
        if (this.type !== 12) return 1;
        if (!Number.isFinite(this.maxDistance) || this.maxDistance <= 0) return 1;
        const traveledRatio = Math.max(0, Math.min(1, this.distanceTraveled / this.maxDistance));
        return 1 - traveledRatio;
    }

    getCurrentDamage() {
        const durabilityFalloff = (this.impactDurability > 0 || this.isThrownBoomerang())
            ? Math.pow(0.8, Math.max(0, this.impactDamageHits || 0))
            : 1;
        return this.damage * this.getTravelDamageMultiplier() * durabilityFalloff;
    }

    getPvpWeaponRank() {
        return (this.weaponRank || this.shooter?.weapon?.rank || 0) & 0x7F;
    }

    resolveCollisions(worldStructures = null, worldPlayers = null, worldMobs = null, worldChests = null, worldProjectiles = null) {
        recordResolveCollisionCall();
        const shooterIsMob = typeof this.shooter?.type !== 'undefined';
        const isPersistentWave = this.persistentHits === true;
        const world = this.world || 'main';
        const structures = Array.isArray(worldStructures) ? worldStructures : null;
        const players = Array.isArray(worldPlayers) ? worldPlayers : null;
        const mobs = Array.isArray(worldMobs) ? worldMobs : null;
        const chests = Array.isArray(worldChests) ? worldChests : null;
        const projectiles = Array.isArray(worldProjectiles) ? worldProjectiles : null;

        // check structures
        if (!this.ignoreStructureCollisions) {
            if (structures) {
                for (let i = 0; i < structures.length; i++) {
                    const structure = structures[i];
                    if (!structure) continue;
                    let buffer = 0;
                    const structureRange = Math.max(0, this.radius + structure.radius - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
                    const structureDx = structure.x - this.x;
                    const structureDy = structure.y - this.y;
                    if ((structureDx * structureDx + structureDy * structureDy) > (structureRange * structureRange)) continue;

                    if (colliding(this, structure, buffer)) {
                        if (structure.type === 3) {
                            if (this.isThrownBoomerang()) continue;
                            if (!this.treesPassed.has(structure.id)) {
                                this.treesPassed.add(structure.id);
                                this.damage *= 0.5;
                            }
                        } else if (tryPushStructureWithProjectile(this, structure)) {
                            continue;
                        } else {
                            const sfx = dataMap.sfxMap.indexOf('slash_clash');
                            const now = performance.now();
                            if (shouldPlayProjectileHitSfx(structure, this.groupId, now)) {
                                playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
                            }
                            if (this.resolveProjectileImpact(`s:${structure.id}`, getStructureImpactCost(structure))) return;
                            continue;
                        }
                    }
                }
            } else for (const id in ENTITIES.STRUCTURES) {
                const structure = ENTITIES.STRUCTURES[id];
                if (!structure) continue;
                if ((structure.world || 'main') !== world) continue;
                let buffer = 0;
                const structureRange = Math.max(0, this.radius + structure.radius - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
                const structureDx = structure.x - this.x;
                const structureDy = structure.y - this.y;
                if ((structureDx * structureDx + structureDy * structureDy) > (structureRange * structureRange)) continue;

                if (colliding(this, structure, buffer)) {
                    if (structure.type === 3) {
                        if (this.isThrownBoomerang()) continue;
                        // Trees drain projectile power once per tree crossed.
                        if (!this.treesPassed.has(structure.id)) {
                            this.treesPassed.add(structure.id);
                            this.damage *= 0.5;
                        }
                    } else if (tryPushStructureWithProjectile(this, structure)) {
                        continue;
                    } else {
                        // other structures block the projectile
                        const sfx = dataMap.sfxMap.indexOf('slash_clash');
                        const now = performance.now();
                        if (shouldPlayProjectileHitSfx(structure, this.groupId, now)) {
                            playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
                        }

                        if (this.resolveProjectileImpact(`s:${structure.id}`, getStructureImpactCost(structure))) return;
                        continue;
                    }
                }
            }
        }

        if (!isPersistentWave) {
            // check with other projectiles
            if (projectiles) {
                for (let i = 0; i < projectiles.length; i++) {
                    const other = projectiles[i];
                    if (!other || other.id === this.id) continue;
                    if (this.ignoreProjectileCollisions || other.ignoreProjectileCollisions) continue;
                    if (other.id < this.id) continue;
                    if (other.shooter === this.shooter) continue;
                    const projectileRange = (this.radius || 0) + (other.radius || 0) + Math.max(this.speed || 0, other.speed || 0, this.expandPerTick || 0, other.expandPerTick || 0);
                    const projectileDx = other.x - this.x;
                    const projectileDy = other.y - this.y;
                    if ((projectileDx * projectileDx + projectileDy * projectileDy) > (projectileRange * projectileRange)) continue;

                    if (colliding(this, other)) {
                        const canTriggerPvpCombat = !(this.shooter instanceof Player && other.shooter instanceof Player)
                            || (this.shooter.canEngagePvpWith(other.shooter, this.getPvpWeaponRank())
                                && other.shooter.canEngagePvpWith(this.shooter, other.getPvpWeaponRank?.() || other.weaponRank || 0));
                        if (this.type === -1 || other.type === -1) {
                            if (this.isThrownBoomerang()) this.resolveProjectileImpact(`pr:${other.id}`);
                            else ENTITIES.deleteEntity('projectile', this.id);
                            if (other.isThrownBoomerang?.()) other.resolveProjectileImpact(`pr:${this.id}`);
                            else ENTITIES.deleteEntity('projectile', other.id);
                            if (canTriggerPvpCombat) {
                                this.shooter.lastCombatTime = performance.now();
                                other.shooter.lastCombatTime = performance.now();
                            }
                            return;
                        }

                        const sfx = dataMap.sfxMap.indexOf('slash_clash');
                        const now = performance.now();
                        if (shouldPlayProjectileHitSfx(other, this.groupId, now)) {
                            playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
                        }
                        const kbStrength = 60;
                        const angle = Math.atan2(this.shooter.y - other.shooter.y, this.shooter.x - other.shooter.x);
                        if (this.shooter.isAlive) {
                            this.shooter.x += Math.cos(angle) * kbStrength;
                            this.shooter.y += Math.sin(angle) * kbStrength;
                            this.shooter.clamp();
                        }
                        if (other.shooter.isAlive) {
                            other.shooter.x -= Math.cos(angle) * kbStrength;
                            other.shooter.y -= Math.sin(angle) * kbStrength;
                            other.shooter.clamp();
                        }

                        this.resolveProjectileImpact();
                        ENTITIES.deleteEntity('projectile', other.id);
                        if (canTriggerPvpCombat) {
                            this.shooter.lastCombatTime = performance.now();
                            other.shooter.lastCombatTime = performance.now();
                        }
                        return;
                    }
                }
            } else for (const pid in ENTITIES.PROJECTILES) {
                const other = ENTITIES.PROJECTILES[pid];
                if (!other || other.id === this.id) continue;
                if (this.ignoreProjectileCollisions || other.ignoreProjectileCollisions) continue;
                if (other.id < this.id) continue;
                if ((other.world || 'main') !== world) continue;
                // Ignore only true same-owner projectiles (same shooter object),
                // not merely matching numeric ids across entity types.
                if (other.shooter === this.shooter) continue;
                const projectileRange = (this.radius || 0) + (other.radius || 0) + Math.max(this.speed || 0, other.speed || 0, this.expandPerTick || 0, other.expandPerTick || 0);
                const projectileDx = other.x - this.x;
                const projectileDy = other.y - this.y;
                if ((projectileDx * projectileDx + projectileDy * projectileDy) > (projectileRange * projectileRange)) continue;

                if (colliding(this, other)) {
                    const canTriggerPvpCombat = !(this.shooter instanceof Player && other.shooter instanceof Player)
                        || (this.shooter.canEngagePvpWith(other.shooter, this.getPvpWeaponRank())
                            && other.shooter.canEngagePvpWith(this.shooter, other.getPvpWeaponRank?.() || other.weaponRank || 0));
                    // If either is a throw, both disappear
                    if (this.type === -1 || other.type === -1) {
                        if (this.isThrownBoomerang()) this.resolveProjectileImpact(`pr:${other.id}`);
                        else ENTITIES.deleteEntity('projectile', this.id);
                        if (other.isThrownBoomerang?.()) other.resolveProjectileImpact(`pr:${this.id}`);
                        else ENTITIES.deleteEntity('projectile', other.id);
                        if (canTriggerPvpCombat) {
                            this.shooter.lastCombatTime = performance.now();
                            other.shooter.lastCombatTime = performance.now();
                        }
                        return;
                    }

                    // Both are slashes - handle clash
                    const sfx = dataMap.sfxMap.indexOf('slash_clash');

                    const now = performance.now();
                    // Throttle clash sound per projectile group and per collided entity.
                    if (shouldPlayProjectileHitSfx(other, this.groupId, now)) {
                        playSfx(this.x, this.y, sfx, 1000, this.world || 'main');
                    }

                    // Knockback shooters (don't damage)
                    const kbStrength = 60;
                    const angle = Math.atan2(this.shooter.y - other.shooter.y, this.shooter.x - other.shooter.x);

                    if (this.shooter.isAlive) {
                        this.shooter.x += Math.cos(angle) * kbStrength;
                        this.shooter.y += Math.sin(angle) * kbStrength;
                        this.shooter.clamp();
                    }
                    if (other.shooter.isAlive) {
                        other.shooter.x -= Math.cos(angle) * kbStrength;
                        other.shooter.y -= Math.sin(angle) * kbStrength;
                        other.shooter.clamp();
                    }

                    this.resolveProjectileImpact();
                    ENTITIES.deleteEntity('projectile', other.id);
                    if (canTriggerPvpCombat) {
                        this.shooter.lastCombatTime = performance.now();
                        other.shooter.lastCombatTime = performance.now();
                    }
                    return;
                }
            }
        }

        // check with players
        if (players) {
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                if (!player || !player.isAlive) continue;
                if (!shooterIsMob && player.id === this.shooter.id) continue;
                let buffer = 0;
                const playerRange = Math.max(0, (this.radius || 0) + (player.radius || 0) - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
                const playerDx = player.x - this.x;
                const playerDy = player.y - this.y;
                if ((playerDx * playerDx + playerDy * playerDy) > (playerRange * playerRange)) continue;

                if (colliding(this, player, buffer)) {
                    if (typeof player.recordLatestCollisionDebug === 'function') {
                        player.recordLatestCollisionDebug(3, this.id);
                    }
                    if (this.shooter instanceof Player && player instanceof Player && !this.shooter.canEngagePvpWith(player, this.getPvpWeaponRank())) {
                        continue;
                    }
                    const hitKey = `p:${player.id}`;
                    if (isPersistentWave && this.hitEntities?.has(hitKey)) continue;
                    if (isPersistentWave) this.hitEntities?.add(hitKey);
                    if (this.hasImpactHit(hitKey)) continue;
                    let tookDamage = false;
                    const allowMinotaurHit = player.progressShieldActive && !player.touchingSafeZone && this.shooter?.type === 6;
                    const allowBossHit = this.shooter?.type === 7 || this.shooter?.type === 8;
                    if (!player.hasShield || allowMinotaurHit || allowBossHit) {
                        const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                        tookDamage = player.damage(viking.damage, this.shooter, { weaponRank: this.getPvpWeaponRank() });
                        if (tookDamage && viking.apply) {
                            commitVikingHit(this.shooter, viking.nextCount);
                            if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, player.x, player.y);
                        }
                        if (tookDamage && this.type !== -1 && ACCESSORY_KEYS[this.shooter?.accessoryId] === 'bush_cloak') {
                            poison(player, 5, 750, 2000, this.shooter, true);
                        }
                        if (this.type !== -1 && ACCESSORY_KEYS[player.accessoryId] === 'bush_cloak' && this.shooter && tookDamage) {
                            poison(this.shooter, 5, 750, 2000, player, true);
                        }
                        if (tookDamage) {
                            const knockbackAngle = Math.atan2(player.y - this.shooter.y, player.x - this.shooter.x);
                            player.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                            player.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                            player.clamp();
                        }
                    }

                    if (!isPersistentWave) {
                        if (this.resolveProjectileImpact(hitKey)) return;
                        continue;
                    }
                }
            }
        } else for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player || !player.isAlive) continue;
            if ((player.world || 'main') !== world) continue;
            // Ignore true self-hit only when shooter is also a player.
            if (!shooterIsMob && player.id === this.shooter.id) continue;

            let buffer = 0;
            const playerRange = Math.max(0, (this.radius || 0) + (player.radius || 0) - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
            const playerDx = player.x - this.x;
            const playerDy = player.y - this.y;
            if ((playerDx * playerDx + playerDy * playerDy) > (playerRange * playerRange)) continue;

            if (colliding(this, player, buffer)) {
                if (typeof player.recordLatestCollisionDebug === 'function') {
                    player.recordLatestCollisionDebug(3, this.id);
                }
                // Skip damage when either side is PvP-protected, but keep collision and let projectile continue.
                if (this.shooter instanceof Player && player instanceof Player && !this.shooter.canEngagePvpWith(player, this.getPvpWeaponRank())) {
                    continue;
                }
                const hitKey = `p:${player.id}`;
                if (isPersistentWave && this.hitEntities?.has(hitKey)) continue;
                if (isPersistentWave) this.hitEntities?.add(hitKey);
                if (this.hasImpactHit(hitKey)) continue;
                // damage player
                let tookDamage = false;
                const allowMinotaurHit = player.progressShieldActive && !player.touchingSafeZone && this.shooter?.type === 6;
                const allowBossHit = this.shooter?.type === 7 || this.shooter?.type === 8;
                if (!player.hasShield || allowMinotaurHit || allowBossHit) {
                    const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                    tookDamage = player.damage(viking.damage, this.shooter, { weaponRank: this.getPvpWeaponRank() });
                    if (tookDamage && viking.apply) {
                        commitVikingHit(this.shooter, viking.nextCount);
                        if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, player.x, player.y);
                    }
                    if (tookDamage && this.type !== -1 && ACCESSORY_KEYS[this.shooter?.accessoryId] === 'bush_cloak') {
                        poison(player, 5, 750, 2000, this.shooter, true);
                    }
                    if (this.type !== -1 && ACCESSORY_KEYS[player.accessoryId] === 'bush_cloak' && this.shooter && tookDamage) {
                        poison(this.shooter, 5, 750, 2000, player, true);
                    }
                    // Keep knockback synchronized with damage cooldown: only apply when damage lands.
                    if (tookDamage) {
                        const knockbackAngle = Math.atan2(player.y - this.shooter.y, player.x - this.shooter.x);
                        player.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                        player.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                        player.clamp();
                    }
                }

                if (!isPersistentWave) {
                    if (this.resolveProjectileImpact(hitKey)) return;
                    continue;
                }
            }
        }
        // check mobs
        if (mobs) {
            for (let i = 0; i < mobs.length; i++) {
                const mob = mobs[i];
                if (!mob) continue;
                if (shooterIsMob && mob.id === this.shooter.id) continue;
                let buffer = 0;
                const mobRange = Math.max(0, (this.radius || 0) + (mob.radius || 0) - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
                const mobDx = mob.x - this.x;
                const mobDy = mob.y - this.y;
                if ((mobDx * mobDx + mobDy * mobDy) > (mobRange * mobRange)) continue;

                if (colliding(this, mob, buffer)) {
                    const now = performance.now();
                    const hitKey = `m:${mob.id}`;
                    if (isPersistentWave && this.hitEntities?.has(hitKey)) continue;
                    if (isPersistentWave) this.hitEntities?.add(hitKey);
                    if (this.hasImpactHit(hitKey)) continue;
                    if (!isPersistentWave && !shooterIsMob && canMinotaurParrySlash(mob, this)) {
                        if (this.shooter && typeof mob.alarm === 'function') {
                            mob.alarm(this.shooter, 'hit');
                        }
                        const sfx = dataMap.sfxMap.indexOf('slash_clash');
                        if (shouldPlayProjectileHitSfx(mob, this.groupId, now)) {
                            playSfx(mob.x, mob.y, sfx, 1000, mob.world || 'main');
                        }
                        if (this.shooter?.isAlive) {
                            const knockbackAngle = Math.atan2(this.shooter.y - mob.y, this.shooter.x - mob.x);
                            this.shooter.x += Math.cos(knockbackAngle) * 60;
                            this.shooter.y += Math.sin(knockbackAngle) * 60;
                            if (typeof this.shooter.clamp === 'function') this.shooter.clamp();
                        }
                        if (this.resolveProjectileImpact(hitKey)) return;
                        continue;
                    }

                    if (!isPersistentWave && canMinotaurParryThrow(mob, this) && Math.random() < getMinotaurParryChance(mob)) {
                        if (typeof mob.performSwing === 'function') {
                            mob.performSwing(true);
                        } else {
                            mob.swingState = 1;
                        }
                        if (this.shooter && typeof mob.alarm === 'function') {
                            mob.alarm(this.shooter, 'hit');
                        }
                        chargeMinotaurTowardShooter(mob, this.shooter);
                        const sfx = dataMap.sfxMap.indexOf('slash_clash');
                        if (shouldPlayProjectileHitSfx(mob, this.groupId, now)) {
                            playSfx(mob.x, mob.y, sfx, 1000, mob.world || 'main');
                        }
                        if (this.resolveProjectileImpact(hitKey)) return;
                        continue;
                    }

                    const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                    const tookDamage = mob.damage(viking.damage, this.shooter);
                    if (tookDamage) {
                        const knockbackAngle = Math.atan2(mob.y - this.shooter.y, mob.x - this.shooter.x);
                        mob.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                        mob.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                        mob.clamp();
                    }
                    if (tookDamage && viking.apply) {
                        commitVikingHit(this.shooter, viking.nextCount);
                        if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, mob.x, mob.y);
                    }
                    if (tookDamage && this.type !== -1 && ACCESSORY_KEYS[this.shooter?.accessoryId] === 'bush_cloak') {
                        poison(mob, 5, 750, 2000, this.shooter, true);
                    }
                    mob.alarm(this.shooter, 'hit');
                    if (!isPersistentWave) {
                        if (this.resolveProjectileImpact(hitKey)) return;
                        continue;
                    }
                }
            }
        } else for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            if (!mob) continue;
            if ((mob.world || 'main') !== world) continue;
            // Ignore true self-hit only when shooter is also a mob.
            if (shooterIsMob && mob.id === this.shooter.id) continue;

            let buffer = 0;
            const mobRange = Math.max(0, (this.radius || 0) + (mob.radius || 0) - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
            const mobDx = mob.x - this.x;
            const mobDy = mob.y - this.y;
            if ((mobDx * mobDx + mobDy * mobDy) > (mobRange * mobRange)) continue;

            if (colliding(this, mob, buffer)) {
                const now = performance.now();
                const hitKey = `m:${mob.id}`;
                if (isPersistentWave && this.hitEntities?.has(hitKey)) continue;
                if (isPersistentWave) this.hitEntities?.add(hitKey);
                if (this.hasImpactHit(hitKey)) continue;
                // Close swing parry: while minotaur is swinging, front-cone slash hits should clash and not leak damage.
                if (!isPersistentWave && !shooterIsMob && canMinotaurParrySlash(mob, this)) {
                    if (this.shooter && typeof mob.alarm === 'function') {
                        mob.alarm(this.shooter, 'hit');
                    }
                    const sfx = dataMap.sfxMap.indexOf('slash_clash');
                    if (shouldPlayProjectileHitSfx(mob, this.groupId, now)) {
                        playSfx(mob.x, mob.y, sfx, 1000, mob.world || 'main');
                    }
                    if (this.shooter?.isAlive) {
                        const knockbackAngle = Math.atan2(this.shooter.y - mob.y, this.shooter.x - mob.x);
                        this.shooter.x += Math.cos(knockbackAngle) * 60;
                        this.shooter.y += Math.sin(knockbackAngle) * 60;
                        if (typeof this.shooter.clamp === 'function') this.shooter.clamp();
                    }
                    if (this.resolveProjectileImpact(hitKey)) return;
                    continue;
                }

                // Minotaur can parry thrown swords from the front without turning.
                if (!isPersistentWave && canMinotaurParryThrow(mob, this) && Math.random() < getMinotaurParryChance(mob)) {
                    if (typeof mob.performSwing === 'function') {
                        // Parry must be a real swing (spawns slash projectiles), not animation-only.
                        mob.performSwing(true);
                    } else {
                        mob.swingState = 1;
                    }
                    if (this.shooter && typeof mob.alarm === 'function') {
                        mob.alarm(this.shooter, 'hit');
                    }
                    chargeMinotaurTowardShooter(mob, this.shooter);
                    const sfx = dataMap.sfxMap.indexOf('slash_clash');
                    if (shouldPlayProjectileHitSfx(mob, this.groupId, now)) {
                        playSfx(mob.x, mob.y, sfx, 1000, mob.world || 'main');
                    }
                    if (this.resolveProjectileImpact(hitKey)) return;
                    continue;
                }

                // damage mob
                const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                const tookDamage = mob.damage(viking.damage, this.shooter);

                // Keep knockback synchronized with damage cooldown: only apply when damage lands.
                if (tookDamage) {
                    const knockbackAngle = Math.atan2(mob.y - this.shooter.y, mob.x - this.shooter.x);
                    mob.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                    mob.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                    mob.clamp();
                }
                if (tookDamage && viking.apply) {
                    commitVikingHit(this.shooter, viking.nextCount);
                    if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, mob.x, mob.y);
                }
                if (tookDamage && this.type !== -1 && ACCESSORY_KEYS[this.shooter?.accessoryId] === 'bush_cloak') {
                    poison(mob, 5, 750, 2000, this.shooter, true);
                }

                mob.alarm(this.shooter, 'hit');
                if (!isPersistentWave) {
                    if (this.resolveProjectileImpact(hitKey)) return;
                    continue;
                }
            }
        }

        // check objects
        if (chests) {
            for (let i = 0; i < chests.length; i++) {
                const object = chests[i];
                if (!object) continue;
                let buffer = -10;
                const objectRange = Math.max(0, (this.radius || 0) + (object.radius || 0) - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
                const objectDx = object.x - this.x;
                const objectDy = object.y - this.y;
                if ((objectDx * objectDx + objectDy * objectDy) > (objectRange * objectRange)) continue;

                if (colliding(this, object, buffer)) {
                    const hitKey = `o:${object.id}`;
                    if (isPersistentWave && this.hitEntities?.has(hitKey)) continue;
                    if (isPersistentWave) this.hitEntities?.add(hitKey);
                    if (this.hasImpactHit(hitKey)) continue;
                    const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                    const didDamage = object.damage(viking.damage, this.shooter);
                    if (didDamage && viking.apply) {
                        commitVikingHit(this.shooter, viking.nextCount);
                        if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, object.x, object.y);
                    }
                    if (!isPersistentWave) {
                        if (this.resolveProjectileImpact(hitKey)) return;
                        continue;
                    }
                }
            }
        } else for (const id in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[id];
            if (!object || !isChestObjectType(object.type)) continue;
            if ((object.world || 'main') !== world) continue;

            let buffer = -10;
            const objectRange = Math.max(0, (this.radius || 0) + (object.radius || 0) - buffer) + Math.max(this.speed || 0, this.expandPerTick || 0);
            const objectDx = object.x - this.x;
            const objectDy = object.y - this.y;
            if ((objectDx * objectDx + objectDy * objectDy) > (objectRange * objectRange)) continue;

            if (colliding(this, object, buffer)) {
                const hitKey = `o:${object.id}`;
                if (isPersistentWave && this.hitEntities?.has(hitKey)) continue;
                if (isPersistentWave) this.hitEntities?.add(hitKey);
                if (this.hasImpactHit(hitKey)) continue;
                // damage object
                const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                const didDamage = object.damage(viking.damage, this.shooter);
                if (didDamage && viking.apply) {
                    commitVikingHit(this.shooter, viking.nextCount);
                    if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, object.x, object.y);
                }
                if (!isPersistentWave) {
                    if (this.resolveProjectileImpact(hitKey)) return;
                    continue;
                }
            }
        }
    }

    process(worldStructures = null, worldPlayers = null, worldMobs = null, worldChests = null, worldProjectiles = null) {
        if (this.isExpired()) {
            ENTITIES.deleteEntity('projectile', this.id);
            return;
        }

        this.move();
        this.resolveCollisions(worldStructures, worldPlayers, worldMobs, worldChests, worldProjectiles);
    }

    isExpired() {
        if (this.isThrownBoomerang()) return false;
        if (this.ttlMs > 0 && performance.now() - this.spawnedAt >= this.ttlMs) {
            return true;
        }
        return this.distanceTraveled > this.maxDistance;
    }
}
