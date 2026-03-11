import { Structure } from "./structure.js";

export class Rock extends Structure {
    constructor(id, x, y) {
        super(id, x, y, 2);
    }
}
