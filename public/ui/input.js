import { writer } from '../helpers.js';
import { ws } from '../client.js';
import { uiInput } from './context.js';

export function resetInputs() {
    if (ws?.readyState !== ws.OPEN) return;

    // Reset movement keys (W, A, S, D)
    [1, 2, 3, 4].forEach(keyCode => {
        writer.reset();
        writer.writeU8(3);
        writer.writeU8(keyCode);
        writer.writeU8(0);
        ws.send(writer.getBuffer());
    });

    // Reset attack state
    writer.reset();
    writer.writeU8(4);
    writer.writeU8(0);
    ws.send(writer.getBuffer());

    // Clear local input state
    uiInput.keys.clear();
    Object.keys(uiInput.activeJoystickKeys).forEach(k => uiInput.activeJoystickKeys[k] = 0);
}
