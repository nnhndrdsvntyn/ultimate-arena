import { PacketWriter } from './server/helpers.js';
import { updateGame } from './server/loop.js';
import { spawnBotPlayers, updateBotPlayers } from './server/bots.js';
import { sendUpdates, saveHistory } from './server/network.js';
import { TPS } from './public/shared/datamap.js';
import { startHunterDebugInterval } from './server/debug.js';

const lbWriter = new PacketWriter();
spawnBotPlayers(15);
startHunterDebugInterval();
const start = performance.now();
const durationMs = 15000;
while (performance.now() - start < durationMs) {
  const now = performance.now();
  updateGame(now);
  updateBotPlayers(now);
  sendUpdates({ clients: [] }, lbWriter, now);
  saveHistory();
  await new Promise(r => setTimeout(r, 1000 / TPS.server));
}

