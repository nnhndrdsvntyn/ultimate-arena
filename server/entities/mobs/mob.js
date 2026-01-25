import {
    ENTITIES
} from '../../game.js';
import {
    Player
} from '../players/player.js';
import {
    dataMap
} from '../../../public/shared/datamap.js';
import {
    playSfx,
    colliding
} from '../../helpers.js';
import {
    Entity
} from '../entity.js';
import { MAP_SIZE } from '../../game.js';

export class Mob extends Entity {
    constructor(id, x, y, type) {
        const mobData = dataMap.MOBS[type];
        super(id, x, y, mobData.radius, mobData.speed, mobData.baseHealth, mobData.baseHealth);

        this.score = mobData.score;
        this.angle = Math.random() * Math.PI * 2 - Math.PI;

        this.lastDiedTime = 0;
        this.lastDamagedTime = 0;
        this.lastEntToDmg = null;

        this.isAlarmed = false;
        this.startHuntingTime = 0;
        this.lastTurnTime = 0
        this.nextTurnDelay = Math.floor(Math.random() * 3001) + 3000;
        this.target = null;
        this.alarmDuration = mobData.alarmDuration;

        this.inWater = false;

        this.type = type;

        ENTITIES.MOBS[id] = this;
    }
    move() {
        // move
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
    }
    turn() {
        if (performance.now() - this.lastTurnTime > this.nextTurnDelay) {
            this.angle = Math.random() * Math.PI * 2 - Math.PI; // rand angle between -PI and PI
            this.lastTurnTime = performance.now();

            this.nextTurnDelay = Math.floor(Math.random() * 3001) + 3000;
        }
    }
    damage(health, attacker) {
        if (performance.now() - this.lastDamagedTime < 200) return false; // invincible for 10 ticks (200 / 20)

        this.lastDamagedTime = performance.now();
        this.lastEntToDmg = attacker;
        this.hp = Math.max(0, this.hp - health);
        if (this.hp <= 0) {
            this.die(this.lastEntToDmg);
            const sfx = dataMap.sfxMap.indexOf('bubble-pop');
            playSfx(this.x, this.y, sfx, 1000);
        } else {
            const sfx = dataMap.sfxMap.indexOf('hurt');
            playSfx(this.x, this.y, sfx, 1000);
        }
        return true;
    }
    alarm(shooter) {
        this.target = shooter;

        if (this.isAlarmed) return; // already alarmed

        this.isAlarmed = true;
        this.startHuntingTime = performance.now();

        // speed boost
        this.speed = dataMap.MOBS[this.type].speed * 1.5;

    }
    die(killer) {
        // activate the mobs death action
        dataMap.MOBS[this.type].deathAction(killer);
        this.lastDiedTime = performance.now();
        ENTITIES.deleteEntity('mob', this.id);
    }
    process() {
        const currentTime = performance.now();

        // check if inside center vertical river
        const waterxr = [MAP_SIZE[0] * 0.47, MAP_SIZE[0] * 0.53];
        const wateryr = [0, MAP_SIZE[1]];
        let inBase = false;
        for (const structure of Object.values(ENTITIES.STRUCTURES)) {
            if (dataMap.STRUCTURES[structure.type].isSafeZone) {
                if (colliding(structure, this)) {
                    inBase = true;
                    break;
                }
            }
        }
        this.inWater = this.x > waterxr[0] && this.x < waterxr[1] && this.y > wateryr[0] && this.y < wateryr[1] && !inBase;
        if (this.inWater) {
            this.speed = dataMap.MOBS[this.type].speed * 0.5
            const streamCenter = MAP_SIZE[0] / 2;
            const dx = streamCenter - this.x;

            // push to center and downstream
            this.x += dx * 0.001;
            this.y += 3;
        }

        // for chick, pig and cow when in water.
        if ([1, 2, 3].includes(this.type)) {
            if (this.x > MAP_SIZE[0] * 0.47 - this.radius) {
                this.angle = Math.PI - 0.5 + Math.random(); // Force turn leftish
                this.target = null;
            }
        }

        if (this.isAlarmed) {
            if (currentTime - this.startHuntingTime > this.alarmDuration) {
                this.isAlarmed = false;
                this.speed = dataMap.MOBS[this.type].speed;
                this.target = null;
            } else if (this.target) {
                if (this.target.lastDiedTime > this.startHuntingTime) {
                    this.isAlarmed = false;
                    this.speed = dataMap.MOBS[this.type].speed;
                    this.target = null;
                }
            } else {
                this.isAlarmed = false;
                this.target = null;
                this.speed = dataMap.MOBS[this.type].speed;
            }
        }
        // main stuff
        this.turn();
        this.move();
        this.clamp();
    }
}
