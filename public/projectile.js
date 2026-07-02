import {
    ENTITIES
} from './game.js';
import {
    dataMap,
    getWeaponConfig,
    getWeaponSize,
    getProjectileVisualConfig,
    isBoomerangType
} from './shared/datamap.js';
import {
    LC,
    camera,
    Settings
} from './client.js';
import { getRenderQuality } from './render_quality.js';
import {
    getEntityDeltaMs,
    getTimeLerpFactor,
    lerpAngle,
    lerpEntityPosition,
    normalizeAngle
} from './interpolation.js';

const BOOMERANG_THROW_HITBOX_MULT = 0.36;

function getConfiguredProjectileRadius(type, fallback = 10) {
    if (type === -1) return fallback;
    return Math.max(1, Number(dataMap.PROJECTILES[type]?.radius) || fallback);
}

export class Projectile {
    constructor(id, x, y, angle, type, weaponRank) {
        this.id = id;

        this.x = x;
        this.newX = x;
        this.y = y;
        this.newY = y;

        this.angle = angle;
        this.angleOffset = 0;
        this.newAngle = angle;

        this.type = type;
        this.weaponRank = weaponRank;
        this.radius = getConfiguredProjectileRadius(type, 10);
        this.renderLength = 0;

        ENTITIES.PROJECTILES[id] = this;
    }
    update() {
        const dt = getEntityDeltaMs(this);
        const lerpFactor = getTimeLerpFactor(dt, 1);

        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;

        if (this.type !== -1) {
            this.radius = Math.max(Number(this.radius) || 0, getConfiguredProjectileRadius(this.type, 10));
        }

        lerpEntityPosition(this, dt, 1, 0.25);

        // lerp angle for projectiles
        this.angle = lerpAngle(this.angle, this.newAngle, lerpFactor);

        // keep angle within range
        this.angle = normalizeAngle(this.angle);

        // for thrown swords
        if (this.type === -1) {
            const noSpin = (this.weaponRank & 0x80) !== 0;
            // spin a little bit
            if (!noSpin) {
                this.angleOffset += 15 * (Math.PI / 180);
                this.angleOffset %= Math.PI * 2;
            }
        }
    }
    draw() {
        if (typeof this.x === 'undefined' || typeof this.y === 'undefined') return;

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;
        const renderQuality = getRenderQuality(this, this.radius);

        // for thrown swords
        if (this.type === -1) {
            const noSpin = (this.weaponRank & 0x80) !== 0;
            const baseRank = this.weaponRank & 0x7F;
            const isBoomerang = isBoomerangType(baseRank);
            // Draw sword
            let swordWidth = 100;
            let swordHeight = 33;
            const weaponCfg = getWeaponConfig(baseRank);
            if (weaponCfg?.name) {
                const [baseWidth, baseHeight] = getWeaponSize(baseRank);
                const radiusWidth = Number.isFinite(this.radius) && this.radius > 0
                    ? (isBoomerang ? this.radius / BOOMERANG_THROW_HITBOX_MULT : this.radius)
                    : baseWidth;
                const drawWidth = Math.max(baseWidth, radiusWidth);
                const scale = drawWidth / Math.max(1, baseWidth);
                swordWidth = drawWidth;
                swordHeight = baseHeight * scale;
            }

            LC.drawImageFast(
                weaponCfg?.name || getWeaponConfig(1).name,
                screenPosX - swordWidth / 2,
                screenPosY - swordHeight / 2,
                swordWidth,
                swordHeight,
                (noSpin || renderQuality.veryFar) ? this.angle : (this.angle + this.angleOffset)
            );
        } else {
            const projectileCfg = getProjectileVisualConfig(this.type) || dataMap.PROJECTILES[13];
            const proportions = projectileCfg.imgProportions;
            let drawWidth = proportions[0] * this.radius;
            let drawHeight = proportions[1] * this.radius;
            if (this.type === 13) {
                if ((this.renderLength || 0) > 0) {
                    drawWidth = this.renderLength;
                }
            }
            LC.drawImageFast(projectileCfg.imgName, screenPosX - (drawWidth / 2), screenPosY - (drawHeight / 2), drawWidth, drawHeight, this.angle);
        }

        if (Settings.drawHitboxes) {
            if (this.type == -1) {
                let swordWidth = Number.isFinite(this.radius) && this.radius > 0 ? this.radius : 100;
                LC.drawCircleFast(screenPosX, screenPosY, swordWidth, 'purple', 0.2, true, true, null, 3);
            } else {
                LC.drawCircleFast(screenPosX, screenPosY, this.radius, 'purple', 0.2, true, true, null, 3);
            }
        }
    }
}
