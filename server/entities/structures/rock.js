import { Structure } from "./structure.js";

export class Rock extends Structure {
    constructor(id, x, y, type = 2) {
        super(id, x, y, type);
    }
}
