import {
    ENTITIES
} from '../game.js';
import {
    dataMap
} from '../../public/shared/datamap.js';
import {
    colliding, playSfx
} from '../helpers.js';
import {
    Entity
} from './entity.js';

export class Projectile extends Entity {
    constructor(id, x, y, angle, type, shooter) {
        const statsType = (type === -1) ? (dataMap.PROJECTILES[shooter.level] ? shooter.level : 1) : type;
        const speed = dataMap.PROJECTILES[statsType]?.speed;
        const radius = dataMap.PROJECTILES[statsType]?.radius;
        super(id, x, y, radius, speed, 0, 0);

        this.angle = angle;
        this.type = type;
        this.damage = dataMap.PROJECTILES[statsType]?.damage;
        this.maxDistance = dataMap.PROJECTILES[statsType]?.maxDistance;

        if (type === -1) {
            this.damage *= 2;
            this.radius = dataMap.SWORDS.imgs[shooter.level].swordWidth;
            this.speed /= 1.25;
            this.maxDistance *= 4;
            this.level = shooter.level;
        }
        this.distanceTraveled = 0;

        this.shooter = shooter;

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
        // check structures
        for (const id in ENTITIES.STRUCTURES) {
            const structure = ENTITIES.STRUCTURES[id];
            let buffer = 0;
            if (this.type === -1) buffer += 50; // a little buffer for thrown swords

            if (colliding(this, structure, buffer)) {
                if (structure.type === 3) {
                    // bushes slow it down, and make its damage half
                    this.speed = dataMap.PROJECTILES[this.shooter.level].speed / 2;
                    this.damage = dataMap.PROJECTILES[this.shooter.level].damage / 2;
                    if (this.type == -1) {
                        this.maxDistance = dataMap.PROJECTILES[this.shooter.level].maxDistance / 1.25;
                    } else {
                        this.maxDistance = dataMap.PROJECTILES[this.shooter.level].maxDistance / 1.5;
                    }
                } else {
                    // other structures block the projectile
                    const sfx = dataMap.sfxMap.indexOf('slash-clash');
                    playSfx(this.x, this.y, sfx, 1000);
                    ENTITIES.deleteEntity('projectile', this.id);
                    return;
                }
            }
        }

        // check with players
        for (const id in ENTITIES.PLAYERS) {
            const player = ENTITIES.PLAYERS[id];
            if (player.id === this.shooter.id || !player.isAlive) continue;

            let buffer = 0;
            if (this.type === -1) buffer += 50; // a little buffer for thrown swords

            if (colliding(this, player, buffer)) {
                // damage player
                let tookDamage = false;
                if (!player.hasShield) {
                    tookDamage = player.damage(this.damage, this.shooter);
                }

                if (tookDamage) {
                    // knock player back
                    const knockbackAngle = Math.atan2(player.y - this.shooter.y, player.x - this.shooter.x);
                    player.x += Math.cos(knockbackAngle) * dataMap.PROJECTILES[this.shooter.level].knockbackStrength;
                    player.y += Math.sin(knockbackAngle) * dataMap.PROJECTILES[this.shooter.level].knockbackStrength;
                    player.clamp();
                }

                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }
        // check mobs
        for (const id in ENTITIES.MOBS) {
            const mob = ENTITIES.MOBS[id];
            if (mob.id === this.shooter.id) continue;

            let buffer = 0;
            if (this.type === -1) buffer += 50; // a little buffer for thrown swords

            if (colliding(this, mob, buffer)) {
                // damage mob
                const tookDamage = mob.damage(this.damage, this.shooter);

                if (tookDamage) {
                    // knock mob back
                    const knockbackAngle = Math.atan2(mob.y - this.shooter.y, mob.x - this.shooter.x);
                    mob.x += Math.cos(knockbackAngle) * dataMap.PROJECTILES[this.shooter.level].knockbackStrength;
                    mob.y += Math.sin(knockbackAngle) * dataMap.PROJECTILES[this.shooter.level].knockbackStrength;
                    mob.clamp();
                }

                mob.alarm(this.shooter);
                ENTITIES.deleteEntity('projectile', this.id);
                return;
            }
        }

        // check objects
        for (const id in ENTITIES.OBJECTS) {
            const object = ENTITIES.OBJECTS[id];
            if (![1].includes(object.type)) continue; // only collide with chests.

            let buffer = -10;
            if (this.type === -1) buffer += 30; // a little buffer for thrown swords

            if (colliding(this, object, buffer)) {
                // damage object
                object.damage(this.damage, this.shooter);
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
