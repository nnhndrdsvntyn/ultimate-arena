import {
    Structure
} from "./structure.js";

export class Base extends Structure {
    constructor(id, x, y) {
        super(id, x, y, 1);
    }
}