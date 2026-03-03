import { ENTITIES } from './game.js';

const HUNTER_DEBUG_INTERVAL_MS = 1000;
let loggedGroupsOnce = false;

export function startHunterDebugInterval() {
    setInterval(() => {
        const lines = [];
        const group1 = [];
        const group2 = [];

        for (const id in ENTITIES.PLAYERS) {
            const bot = ENTITIES.PLAYERS[id];
            if (!bot || !bot.isBot) continue;
            if ((bot._botTeamGroup || 0) === 1) group1.push(bot.username || `bot#${bot.id}`);
            if ((bot._botTeamGroup || 0) === 2) group2.push(bot.username || `bot#${bot.id}`);
        }

        if (!loggedGroupsOnce) {
            lines.push(`GROUP 1: ${group1.length ? group1.join(', ') : 'none'}`);
            lines.push(`GROUP 2: ${group2.length ? group2.join(', ') : 'none'}`);
            loggedGroupsOnce = true;
        }

        for (const id in ENTITIES.PLAYERS) {
            const bot = ENTITIES.PLAYERS[id];
            if (!bot || !bot.isBot) continue;
            if (bot._botRole !== 'pro') continue;

            const targetId = bot._botHunterTargetId || 0;
            if (!targetId) continue;

            const target = ENTITIES.PLAYERS[targetId];
            if (!target || !target.isAlive || target.isBot) continue;

            const myGroup = bot._botTeamGroup || 0;
            const hasAssistTeammate = Object.values(ENTITIES.PLAYERS).some(other =>
                other &&
                other.isBot &&
                other.id !== bot.id &&
                (other._botTeamGroup || 0) > 0 &&
                (other._botTeamGroup || 0) === myGroup &&
                other._botAssistTargetId === targetId
            );
            const hasTeammate = Object.values(ENTITIES.PLAYERS).some(other =>
                other &&
                other.isBot &&
                other.id !== bot.id &&
                (other._botTeamGroup || 0) > 0 &&
                (other._botTeamGroup || 0) === myGroup
            );

            const botName = bot.username || `bot#${bot.id}`;
            const targetName = target.username || `player#${target.id}`;
            const dx = (target.x || 0) - (bot.x || 0);
            const dy = (target.y || 0) - (bot.y || 0);
            const dist = Math.round(Math.sqrt((dx * dx) + (dy * dy)));
            const hunterScore = Math.floor(bot.score || 0);
            const targetScore = Math.floor(target.score || 0);
            lines.push(
                `[HunterDebug] ${botName} -> ${targetName} (${dist}) broughtTeamate=${hasAssistTeammate ? 'true' : 'false'} hasTeammate=${hasTeammate ? 'true' : 'false'} teamGroup=${myGroup} hunterScore=${hunterScore} targetScore=${targetScore}`
            );
        }

        for (const line of lines) {
            console.log(line);
        }
    }, HUNTER_DEBUG_INTERVAL_MS);
}
