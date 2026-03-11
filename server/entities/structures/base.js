import {
    Structure
} from "./structure.js";
import {
    dataMap
} from '../../../public/shared/datamap.js';

export class Base extends Structure {
    constructor(id, x, y) {
        super(id, x, y, 1);
        const cfg = dataMap.STRUCTURES[1] || {};
        this.safeZoneHalfSize = Math.max(1, Math.floor(this.radius || cfg.radius || cfg.safeZoneHalfSize || 500));
    }
}
