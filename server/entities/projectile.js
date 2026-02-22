import {
    ENTITIES
} from '../game.js';
import {
    dataMap,
    ACCESSORY_KEYS
} from '../../public/shared/datamap.js';
import {
    colliding,
    playSfx,
    poison
} from '../helpers.js';
import {
    Entity
} from './entity.js';

const VIKING_HIT_TARGET = 3;
const VIKING_BONUS_MULT = 1.3;
const MINOTAUR_PARRY_HALF_ANGLE = Math.PI / 3;
const MINOTAUR_CHARGE_DISTANCE_ON_PARRY = 90;

function getVikingHitInfo(shooter, baseDamage) {
    if (!shooter || !shooter.isAlive) return { damage: baseDamage, nextCount: 0, apply: false };
    const accessoryKey = ACCESSORY_KEYS[shooter.accessoryId];
    if (accessoryKey !== 'viking-hat') return { damage: baseDamage, nextCount: 0, apply: false };
    const next = (shooter.vikingHitCount || 0) + 1;
    const isBonus = next === VIKING_HIT_TARGET;
    const damage = isBonus ? baseDamage * VIKING_BONUS_MULT : baseDamage;
    return { damage, nextCount: isBonus ? 0 : next, apply: true };
}

function commitVikingHit(shooter, nextCount) {
    if (!shooter) return;
    shooter.vikingHitCount = nextCount;
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

export class Projectile extends Entity {
    constructor(id, x, y, angle, type, shooter, groupId) {
        const statsType = (type === -1) ? (dataMap.PROJECTILES[shooter.weapon.rank] ? shooter.weapon.rank : 1) : type;
        const speed = dataMap.PROJECTILES[statsType]?.speed;
        const radius = dataMap.PROJECTILES[statsType]?.radius;
        super(id, x, y, radius, speed, 0, 0);

        this.groupId = groupId;
        this.angle = angle;
        this.type = type;
        this.damage = (shooter.strength + dataMap.PROJECTILES[statsType]?.damage) * 1.15;
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
        this.knockbackStrength = dataMap.PROJECTILES[this.weaponRank]?.knockbackStrength || 25;

        // Minotaur slash projectiles hit harder in knockback than player slashes.
        if (this.type !== -1 && this.shooter?.type === 6) {
            this.knockbackStrength *= 2;
        }

        ENTITIES.PROJECTILES[id] = this;
    }

    move() {
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        this.distanceTraveled += this.speed;

        if (this.distanceTraveled < this.maxDistance / 2) {
            this.speed *= 1.01;
        } else if (this.distanceTraveled > this.maxDistance / 2) {
            this.speed /= 1.05;
            if (this.speed < 10) this.maxDistance = 0; // abort when it gets too slow.
        }
    }

    resolveCollisions() {
        const shooterIsMob = typeof this.shooter?.type !== 'undefined';

        // check structures
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            if (!structure) continue;
            let buffer = 0;
            if (this.type === -1) buffer += 50; // a little buffer for thrown swords

            if (colliding(this, structure, buffer)) {
                if (structure.type === 3) {
                    // bushes slow it down, and make its damage half
                    const projStats = dataMap.PROJECTILES[this.weaponRank] || dataMap.PROJECTILES[this.type] || dataMap.PROJECTILES[1];
                    this.speed = (projStats?.speed || this.speed || 30) / 2;
                    const baseDamage = ((this.shooter?.strength || 0) + (projStats?.damage || 0)) * 1.15;
                    this.damage = baseDamage / 2;
                    if (this.type === -1) {
                        this.damage /= 1.5;
                    }
                    if (this.type == -1) {
                        this.maxDistance = (projStats?.maxDistance || this.maxDistance || 100) / 1.25;
                    } else {
                        this.maxDistance = (projStats?.maxDistance || this.maxDistance || 100) / 1.5;
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
                    const viking = getVikingHitInfo(this.shooter, this.damage);
                    tookDamage = player.damage(viking.damage, this.shooter);
                    if (tookDamage && viking.apply) {
                        commitVikingHit(this.shooter, viking.nextCount);
                    }
                    if (this.type !== -1 && ACCESSORY_KEYS[player.accessoryId] === 'bush-cloak' && this.shooter && tookDamage) {
                        poison(this.shooter, 5, 750, 2000);
                    }
                    // knock player back
                    const knockbackAngle = Math.atan2(player.y - this.shooter.y, player.x - this.shooter.x);
                    player.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                    player.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                    player.clamp();
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
                // Minotaur can parry thrown swords from the front without turning.
                if (canMinotaurParryThrow(mob, this)) {
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
                const viking = getVikingHitInfo(this.shooter, this.damage);
                const tookDamage = mob.damage(viking.damage, this.shooter);

                // knock mob back based on projectile knockback strength.
                const knockbackAngle = Math.atan2(mob.y - this.shooter.y, mob.x - this.shooter.x);
                mob.x += Math.cos(knockbackAngle) * this.knockbackStrength;
                mob.y += Math.sin(knockbackAngle) * this.knockbackStrength;
                mob.clamp();
                if (tookDamage && viking.apply) {
                    commitVikingHit(this.shooter, viking.nextCount);
                }

                mob.alarm(this.shooter, 'hit');
                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }

        // check objects
        for (const id in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[id];
            if (!object || !dataMap.CHEST_IDS.includes(object.type)) continue;

            let buffer = -10;
            if (this.type === -1) buffer += 30; // a little buffer for thrown swords

            if (colliding(this, object, buffer)) {
                // damage object
                const viking = getVikingHitInfo(this.shooter, this.damage);
                const didDamage = object.damage(viking.damage, this.shooter);
                if (didDamage && viking.apply) {
                    commitVikingHit(this.shooter, viking.nextCount);
                }
                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }
    }

    process() {
        if (this.distanceTraveled > this.maxDistance) {
            ENTITIES.deleteEntity('projectile', this.id);
        }

        this.move();
        this.resolveCollisions();
    }
}
