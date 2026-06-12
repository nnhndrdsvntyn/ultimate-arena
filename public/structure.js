import {
    ENTITIES,
    MAP_SIZE
} from './game.js';
import {
    dataMap,
    getStructureImageName
} from './shared/datamap.js';
import {
    LC,
    camera,
    CURRENT_WORLD,
    Settings,
    Vars
} from './client.js';
import { getRenderQuality } from './render_quality.js';
import {
    getEntityDeltaMs,
    getTimeLerpFactor
} from './interpolation.js';

export class Structure {
    constructor(id, x, y, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.newX = x;
        this.newY = y;
        this.type = type;

        this.radius = dataMap.STRUCTURES[type].radius;

        ENTITIES.STRUCTURES[id] = this;
    }
    update() {
        if (typeof this.newX !== 'number' || typeof this.newY !== 'number') return;
        const lerpFactor = getTimeLerpFactor(getEntityDeltaMs(this), 1.35);
        const dx = this.newX - this.x;
        const dy = this.newY - this.y;
        if (Math.abs(dx) < 0.5) {
            this.x = this.newX;
        } else {
            this.x += dx * lerpFactor;
        }
        if (Math.abs(dy) < 0.5) {
            this.y = this.newY;
        } else {
            this.y += dy * lerpFactor;
        }
    }
    draw() {
        // don't draw trees here; they are drawn in client.js separately for layering purposes
        if (this.type === 3) return;
        if (this.type === 5) {
            const screenPosX = this.x - camera.x;
            const screenPosY = this.y - camera.y;
            const renderQuality = getRenderQuality(this, this.radius);
            const t = performance.now() * 0.0035;
            const pulse = 0.9 + (Math.sin(t * 2.2) * 0.06);
            const outerRadius = this.radius * pulse;

            LC.drawCircleFast(screenPosX, screenPosY, outerRadius, 'rgba(10, 6, 14, 0.88)', 1, true, true, 'rgba(33, 22, 41, 0.95)', 4);
            LC.drawCircleFast(screenPosX, screenPosY, this.radius * 0.68, 'rgba(0, 0, 0, 0.96)');
            if (!renderQuality.far) {
                for (let i = 0; i < 3; i++) {
                    const ringPhase = t + (i * 0.9);
                    const ringRadius = this.radius * (0.3 + (((ringPhase % 1.8) / 1.8) * 0.65));
                    LC.drawCircleFast(screenPosX, screenPosY, ringRadius, 'rgba(38, 28, 48, 0.24)', 1, false, true, 'rgba(38, 28, 48, 0.42)', 2);
                }
            }
            return;
        }

        if (this.type === 1) {
            const screenPosX = this.x - camera.x;
            const screenPosY = this.y - camera.y;
            const hoverDx = Vars.mouseWorldX - this.x;
            const hoverDy = Vars.mouseWorldY - this.y;
            const isHoveringStructure = (hoverDx * hoverDx + hoverDy * hoverDy) <= ((this.radius + 12) * (this.radius + 12));
            LC.drawImageFast(dataMap.STRUCTURES[this.type].imgName, screenPosX - this.radius, screenPosY - this.radius, this.radius * 2, this.radius * 2);
            if (Settings.debugMode && isHoveringStructure) {
                const idText = `(${this.id})`;
                const idMetrics = LC.measureText({ text: idText, font: 'bold 15px Arial' });
                LC.drawText({
                    text: idText,
                    pos: [screenPosX - (idMetrics.width / 2), screenPosY - this.radius - 10],
                    color: 'lightgray',
                    font: 'bold 15px Arial'
                });
            }

            if (Settings.drawHitboxes) {
                LC.drawCircleFast(screenPosX, screenPosY, this.radius, 'blue', 0.2, true, true, null, 3);
            }
            return;
        }

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;
        const hoverDx = Vars.mouseWorldX - this.x;
        const hoverDy = Vars.mouseWorldY - this.y;
        const isHoveringStructure = (hoverDx * hoverDx + hoverDy * hoverDy) <= ((this.radius + 12) * (this.radius + 12));

        LC.drawImageFast(
            getStructureImageName(this.type, this.x, this.y, MAP_SIZE, this.world || CURRENT_WORLD),
            screenPosX - this.radius,
            screenPosY - this.radius,
            this.radius * 2,
            this.radius * 2
        );

        if (Settings.debugMode && isHoveringStructure) {
            const idText = `(${this.id})`;
            const idMetrics = LC.measureText({ text: idText, font: 'bold 15px Arial' });
            LC.drawText({
                text: idText,
                pos: [screenPosX - (idMetrics.width / 2), screenPosY - this.radius - 10],
                color: 'lightgray',
                font: 'bold 15px Arial'
            });
        }

        if (Settings.drawHitboxes) {
            LC.drawCircleFast(screenPosX, screenPosY, this.radius, 'blue', 0.2, true, true, null, 3);
        }

    }
}
