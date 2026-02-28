import {
    ENTITIES
} from '../game.js';
import {
    dataMap,
    ACCESSORY_KEYS,
    isChestObjectType
} from '../../public/shared/datamap.js';
import {
    colliding,
    playSfx,
    poison,
    emitCriticalHitFxToPlayer
} from '../helpers.js';
import {
    Entity
} from './entity.js';

const VIKING_HIT_TARGET = 3;
const VIKING_BONUS_MULT = 1.3;
const MINOTAUR_PARRY_HALF_ANGLE = Math.PI / 3;
const MINOTAUR_CHARGE_DISTANCE_ON_PARRY = 90;
const MINOTAUR_PARRY_CHANCE_STAGE_1 = 0.5;
const MINOTAUR_PARRY_CHANCE_STAGE_2 = 0.65;
const MINOTAUR_PARRY_CHANCE_STAGE_3 = 0.85;

function getVikingHitInfo(shooter, baseDamage) {
    if (!shooter || !shooter.isAlive) return { damage: baseDamage, nextCount: 0, apply: false, isBonus: false };
    const accessoryKey = ACCESSORY_KEYS[shooter.accessoryId];
    if (accessoryKey !== 'viking-hat') return { damage: baseDamage, nextCount: 0, apply: false, isBonus: false };
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
    const swingRange = (dataMap.SWORDS.imgs[9]?.swordWidth || 200) * 2;
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

    const swingRange = (dataMap.SWORDS.imgs[9]?.swordWidth || 200) * 2;
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
        const statsType = (type === -1) ? (dataMap.PROJECTILES[shooter.weapon.rank] ? shooter.weapon.rank : 1) : type;
        const speed = dataMap.PROJECTILES[statsType]?.speed;
        const radius = dataMap.PROJECTILES[statsType]?.radius;
        super(id, x, y, radius, speed, 0, 0);

        this.groupId = groupId;
        this.angle = angle;
        this.type = type;
        this.damage = (shooter.strength + dataMap.PROJECTILES[statsType]?.damage) * 1.15;
        if (this.shooter?.type === 6 && typeof this.shooter.getAttackDamageMultiplier === 'function') {
            this.damage *= this.shooter.getAttackDamageMultiplier();
        }
        this.maxDistance = dataMap.PROJECTILES[statsType]?.maxDistance;

        if (type === -1) {
            this.damage /= 1.5;
            this.radius = dataMap.SWORDS.imgs[shooter.weapon.rank].swordWidth;
            this.speed /= 1.25;
            this.maxDistance *= 4;
            this.weaponRank = shooter.weapon.rank;
        }
        this.distanceTraveled = 0;
        this.shooter = shooter;
        this.weaponRank = shooter.weapon.rank;
        this.knockbackStrength = dataMap.PROJECTILES[statsType]?.knockbackStrength || 25;
        this.renderLength = null;
        this.staticRender = false;
        this.renderX = null;
        this.renderY = null;
        this.noMove = false;
        this.logicOnly = false;
        this.ttlMs = 0;
        this.spawnedAt = performance.now();

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
        if (type === 10) {
            const defaultBoltLength = (dataMap.PROJECTILES[10]?.imgProportions?.[0] || 10) * (dataMap.PROJECTILES[10]?.radius || 30);
            const visualLength = (options && Number.isFinite(options.visualLength) && options.visualLength > 0) ? options.visualLength : defaultBoltLength;
            this.renderLength = Math.max(1, Math.min(65535, Math.round(visualLength)));
        }

        // Minotaur slash projectiles hit harder in knockback than player slashes.
        if (this.type !== -1 && this.shooter?.type === 6) {
            this.knockbackStrength *= 2;
        }

        this.bushesPassed = new Set();
        ENTITIES.PROJECTILES[id] = this;
    }

    move() {
        if (this.noMove) return;
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        this.distanceTraveled += this.speed;
    }

    getTravelDamageMultiplier() {
        return 1;
    }

    getCurrentDamage() {
        return this.damage * this.getTravelDamageMultiplier();
    }

    resolveCollisions() {
        const shooterIsMob = typeof this.shooter?.type !== 'undefined';

        // check structures
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            let buffer = 0;
            if (this.type === -1) buffer += this.radius * 0.7; // thrown swords use 70% of their size as structure-collision buffer

            if (colliding(this, structure, buffer)) {
                if (structure.type === 3) {
                    // Bushes drain projectile power once per bush crossed.
                    if (!this.bushesPassed.has(structure.id)) {
                        this.bushesPassed.add(structure.id);
                        this.damage *= 0.5;
                    }
                } else {
                    // other structures block the projectile
                    const sfx = dataMap.sfxMap.indexOf('slash-clash');

                    const now = performance.now();
                    if (this.shooter) {
                        if (!this.shooter._groupHitSounds) this.shooter._groupHitSounds = new Map();
                        const lastSoundTime = this.shooter._groupHitSounds.get(this.groupId) || 0;

                        if (now - lastSoundTime > 50) { // only play one sound every 50ms for this group
                            playSfx(this.x, this.y, sfx, 1000);
                            this.shooter._groupHitSounds.set(this.groupId, now);

                            // basic cleanup
                            if (this.shooter._groupHitSounds.size > 20) {
                                for (const [gid, time] of this.shooter._groupHitSounds) {
                                    if (now - time > 10000) this.shooter._groupHitSounds.delete(gid);
                                }
                            }
                        }
                    }

                    ENTITIES.deleteEntity('projectile', this.id);
                    return;
                }
            }
        }

        // check with other projectiles
        for (const pid in ENTITIES.PROJECTILES) {
            const other = ENTITIES.PROJECTILES[pid];
            if (!other || other.id === this.id) continue;
            // Ignore only true same-owner projectiles (same shooter object),
            // not merely matching numeric ids across entity types.
            if (other.shooter === this.shooter) continue;

            if (colliding(this, other)) {
                // If either is a throw, both disappear
                if (this.type === -1 || other.type === -1) {
                    ENTITIES.deleteEntity('projectile', this.id);
                    ENTITIES.deleteEntity('projectile', other.id);
                    this.shooter.lastCombatTime = performance.now();
                    other.shooter.lastCombatTime = performance.now();
                    return;
                }

                // Both are slashes - handle clash
                const sfx = dataMap.sfxMap.indexOf('slash-clash');

                const now = performance.now();
                // Throttle clash sound and knockback per group
                if (this.shooter && (!this.shooter._groupClashSounds || !this.shooter._groupClashSounds.has(this.groupId) || now - this.shooter._groupClashSounds.get(this.groupId) > 100)) {
                    if (!this.shooter._groupClashSounds) this.shooter._groupClashSounds = new Map();
                    this.shooter._groupClashSounds.set(this.groupId, now);

                    playSfx(this.x, this.y, sfx, 1000);

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
                }

                ENTITIES.deleteEntity('projectile', this.id);
                ENTITIES.deleteEntity('projectile', other.id);
                this.shooter.lastCombatTime = performance.now();
                other.shooter.lastCombatTime = performance.now();
                return;
            }
        }

        // check with players
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (!player || !player.isAlive) continue;
            // Ignore true self-hit only when shooter is also a player.
            if (!shooterIsMob && player.id === this.shooter.id) continue;

            let buffer = 0;
            if (this.type === -1) buffer += 50; // a little buffer for thrown swords

            if (colliding(this, player, buffer)) {
                // damage player
                let tookDamage = false;
                if (!player.hasShield) {
                    const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                    tookDamage = player.damage(viking.damage, this.shooter);
                    if (tookDamage && viking.apply) {
                        commitVikingHit(this.shooter, viking.nextCount);
                        if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, player.x, player.y);
                    }
                    if (this.type !== -1 && ACCESSORY_KEYS[player.accessoryId] === 'bush-cloak' && this.shooter && tookDamage) {
                        poison(this.shooter, 5, 750, 2000);
                    }
                    // Keep knockback synchronized with damage cooldown: only apply when damage lands.
                    if (tookDamage) {
                        const knockbackAngle = Math.atan2(player.y - this.shooter.y, player.x - this.shooter.x);
                        player.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                        player.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                        player.clamp();
                    }
                }

                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }
        // check mobs
        for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            if (!mob) continue;
            // Ignore true self-hit only when shooter is also a mob.
            if (shooterIsMob && mob.id === this.shooter.id) continue;

            let buffer = 0;
            if (this.type === -1) buffer += 50; // a little buffer for thrown swords

            if (colliding(this, mob, buffer)) {
                // Close swing parry: while minotaur is swinging, front-cone slash hits should clash and not leak damage.
                if (!shooterIsMob && canMinotaurParrySlash(mob, this)) {
                    if (this.shooter && typeof mob.alarm === 'function') {
                        mob.alarm(this.shooter, 'hit');
                    }
                    const sfx = dataMap.sfxMap.indexOf('slash-clash');
                    playSfx(mob.x, mob.y, sfx, 1000);
                    if (this.shooter?.isAlive) {
                        const knockbackAngle = Math.atan2(this.shooter.y - mob.y, this.shooter.x - mob.x);
                        this.shooter.x += Math.cos(knockbackAngle) * 60;
                        this.shooter.y += Math.sin(knockbackAngle) * 60;
                        if (typeof this.shooter.clamp === 'function') this.shooter.clamp();
                    }
                    ENTITIES.deleteEntity('projectile', this.id);
                    return;
                }

                // Minotaur can parry thrown swords from the front without turning.
                if (canMinotaurParryThrow(mob, this) && Math.random() < getMinotaurParryChance(mob)) {
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
                    const sfx = dataMap.sfxMap.indexOf('slash-clash');
                    playSfx(mob.x, mob.y, sfx, 1000);
                    ENTITIES.deleteEntity('projectile', this.id);
                    return;
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

                mob.alarm(this.shooter, 'hit');
                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }

        // check objects
        for (const id in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[id];
            if (!object || !isChestObjectType(object.type)) continue;

            let buffer = -10;
            if (this.type === -1) buffer += 30; // a little buffer for thrown swords

            if (colliding(this, object, buffer)) {
                // damage object
                const viking = getVikingHitInfo(this.shooter, this.getCurrentDamage());
                const didDamage = object.damage(viking.damage, this.shooter);
                if (didDamage && viking.apply) {
                    commitVikingHit(this.shooter, viking.nextCount);
                    if (viking.isBonus) emitCriticalHitFxToPlayer(this.shooter.id, object.x, object.y);
                }
                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }
    }

    process() {
        if (this.ttlMs > 0 && performance.now() - this.spawnedAt >= this.ttlMs) {
            ENTITIES.deleteEntity('projectile', this.id);
            return;
        }
        if (this.distanceTraveled > this.maxDistance) {
            ENTITIES.deleteEntity('projectile', this.id);
        }

        this.move();
        this.resolveCollisions();
    }
}
