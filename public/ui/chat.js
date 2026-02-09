import {
    sendChat,
    sendTpPosCommand,
    sendTpEntCommand,
    sendSetAttrCommand,
    sendKillCommand,
    sendBreakChestCommand,
    sendHealCommand,
    sendDamageCommand,
    sendClearDropsCommand,
    sendRovCommand,
    sendAgroCommand,
    sendMobTypeCommand,
    sendResetCommand,
    sendGiveAccessoryCommand,
    sendGrantAdminCommand,
    sendInvisCommand,
    sendUninvisCommand,
    encodeUsername
} from '../helpers.js';
import { ws, Vars } from '../client.js';
import { dataMap, isSwordRank, SWORD_IDS, ACCESSORY_KEYS, ACCESSORY_NAME_TO_ID } from '../shared/datamap.js';
import { ENTITIES } from '../game.js';
import { isMobile } from './config.js';
import { uiRefs, uiState } from './context.js';
import { createEl } from './dom.js';
import { showNotification } from './notifications.js';

export function createChatUI(parent) {
    uiRefs.chatInputWrapper = createEl('div', {}, parent, { id: 'chat-input-wrapper' });

    uiRefs.chatCommandHint = createEl('div', {}, uiRefs.chatInputWrapper, { id: 'chat-command-hint' });
    uiRefs.chatCommandList = createEl('div', {}, uiRefs.chatInputWrapper, { id: 'chat-command-list' });
    uiRefs.chatSuggestList = createEl('div', {}, uiRefs.chatInputWrapper, { id: 'chat-suggest-list' });

    uiRefs.chatInput = createEl('input', {}, uiRefs.chatInputWrapper, {
        id: 'chatInput',
        maxLength: 50,
        placeholder: 'Press Enter to send...',
        autocomplete: 'off'
    });

    uiRefs.chatInput.addEventListener('input', () => updateCommandUI());
}

const COMMANDS = [
    { name: '/tpent', params: '<@p[id|range|all]|@m[id|range|all]|@s> <@p[id|range|all]|@m[id|range|all]|@s>' },
    { name: '/tppos', params: '<@p[id|range|all]|@m[id|range|all]|@s> <[x, y]>' },
    { name: '/give', params: '<@p[id|range|all]|@s> <itemname> [amount]' },
    { name: '/kill', params: '<@p[id|range|all]|@m[id|range|all]|@s>' },
    { name: '/break', params: '<@o[chest]> <[id|range|all]> [dropLoot]' },
    { name: '/setattribute', params: '<@p[id|range|all]|@m[id|range|all]|@s> <attribute> <value>' },
    { name: '/heal', params: '<@p[id|range|all]|@m[id|range|all]|@s>' },
    { name: '/damage', params: '<@p[id|range|all]|@m[id|range|all]|@s> <amount[%]>' },
    { name: '/cleardrops', params: '' },
    { name: '/rov', params: '<number>' },
    { name: '/agro', params: '<id|range|all> <@p[id]|@s>' },
    { name: '/reset', params: '' },
    { name: '/admin', params: '<playerId>' },
    { name: '/invis', params: '<@s|@p[id|range|all]>' },
    { name: '/uninvis', params: '<@s|@p[id|range|all]>' }
];

const ENTITY_SUGGESTIONS_ALL = ['@s', '@p', '@m', '@o'];
const ENTITY_SUGGESTIONS_PM_S = ['@s', '@p', '@m'];
const ENTITY_SUGGESTIONS_P_S = ['@s', '@p'];
const AGRO_TARGET_SUGGESTIONS = ['@s', '@p'];
const MOB_TYPE_SUGGESTIONS = [
    '@m[type=chick]',
    '@m[type=pig]',
    '@m[type=cow]',
    '@m[type=hearty]',
    '@m[type=polar-bear]'
];
const ACCESSORY_SUGGESTIONS = ACCESSORY_KEYS.filter(k => k !== 'none');
const SETATTR_SUGGESTIONS = ['invincible', 'speed', 'damage', 'strength', 'maxhealth'];
const INVINCIBLE_VALUE_SUGGESTIONS = ['true', 'false'];
const ITEM_SUGGESTIONS = [
    ...SWORD_IDS.map(id => `sword${id}`),
    'gold-coin',
    ...ACCESSORY_SUGGESTIONS
];
const CHAT_AUTOCOMPLETE_DEBUG = false;

function updateCommandUI() {
    if (!uiRefs.chatInput || !uiRefs.chatCommandHint || !uiRefs.chatCommandList) return;

    const raw = uiRefs.chatInput.value;
    const value = raw.trim().toLowerCase();

    if (!value.startsWith('/')) {
        uiRefs.chatCommandHint.textContent = '';
        uiRefs.chatCommandHint.style.display = 'none';
        uiRefs.chatCommandList.innerHTML = '';
        uiRefs.chatCommandList.style.display = 'none';
        if (uiRefs.chatSuggestList) {
            uiRefs.chatSuggestList.innerHTML = '';
            uiRefs.chatSuggestList.style.display = 'none';
        }
        return;
    }

    const allowedCommands = Vars.isAdmin ? COMMANDS : COMMANDS.filter(cmd => cmd.name === '/kill');
    const matches = allowedCommands.filter(cmd => cmd.name.startsWith(value));
    uiRefs.chatCommandList.innerHTML = '';

    if (matches.length > 0) {
        matches.forEach(cmd => {
            const item = createEl('div', {}, uiRefs.chatCommandList, {
                className: 'chat-command-item',
                textContent: cmd.name
            });
            item.onclick = () => {
                uiRefs.chatInput.value = `${cmd.name} `;
                uiRefs.chatInput.focus();
                updateCommandUI();
            };
        });
        uiRefs.chatCommandList.style.display = 'flex';
    } else {
        uiRefs.chatCommandList.style.display = 'none';
    }

    const exact = allowedCommands.find(cmd => value.startsWith(cmd.name));
    if (exact) {
        const hintParams = (!Vars.isAdmin && exact.name === '/kill') ? '<@s>' : exact.params;
        const hintText = hintParams ? `${exact.name} ${hintParams}` : exact.name;
        uiRefs.chatCommandHint.textContent = hintText;
        uiRefs.chatCommandHint.style.display = 'block';
    } else if (matches.length === 1) {
        const hintParams = (!Vars.isAdmin && matches[0].name === '/kill') ? '<@s>' : matches[0].params;
        const hintText = hintParams ? `${matches[0].name} ${hintParams}` : matches[0].name;
        uiRefs.chatCommandHint.textContent = hintText;
        uiRefs.chatCommandHint.style.display = 'block';
    } else {
        uiRefs.chatCommandHint.textContent = '';
        uiRefs.chatCommandHint.style.display = 'none';
    }

    if (uiRefs.chatSuggestList) {
        updateSuggestions(raw, exact || (matches.length === 1 ? matches[0] : null));
    }
}

function updateSuggestions(raw, activeCommand) {
    const suggestEl = uiRefs.chatSuggestList;
    if (!suggestEl) return;

    const current = getCurrentToken(raw);
    const currentLower = current.toLowerCase();

    let suggestions = [];
    if (CHAT_AUTOCOMPLETE_DEBUG) {
        console.log('[ChatSuggest] start', {
            raw,
            activeCommand: activeCommand?.name || null,
            current,
            currentLower,
            tokenIndex: getTokenIndex(raw),
            tokens: getTokens(raw)
        });
    }

    // Entity suggestions when typing @...
    if (currentLower.startsWith('@')) {
        if (currentLower.startsWith('@m[')) {
            suggestions = MOB_TYPE_SUGGESTIONS.filter(s => s.startsWith(currentLower));
        } else {
            suggestions = ENTITY_SUGGESTIONS_ALL.filter(s => s.startsWith(currentLower));
        }
    }

    // Command-specific suggestions
    const tokenIndex = getTokenIndex(raw);
    const tokens = getTokens(raw);
    if (activeCommand?.name === '/give') {
        const entityToken = (tokens[1] || '').toLowerCase();
        const entityComplete = isEntityTokenComplete(entityToken, ENTITY_SUGGESTIONS_P_S);
        if (tokenIndex === 1) {
            suggestions = ENTITY_SUGGESTIONS_P_S.filter(s => s.startsWith(currentLower));
        } else if (tokenIndex === 2) {
            if (entityComplete) {
                suggestions = ITEM_SUGGESTIONS.filter(s => s.startsWith(currentLower));
            } else {
                suggestions = ENTITY_SUGGESTIONS_P_S.filter(s => s.startsWith(currentLower));
            }
        } else if (tokenIndex > 2 && entityComplete) {
            suggestions = ITEM_SUGGESTIONS.filter(s => s.startsWith(currentLower));
        }
    } else if (activeCommand?.name === '/tpent') {
        if (tokenIndex === 1 || tokenIndex === 2) {
            if (currentLower.startsWith('@m[')) {
                suggestions = MOB_TYPE_SUGGESTIONS.filter(s => s.startsWith(currentLower));
            } else {
                suggestions = ENTITY_SUGGESTIONS_PM_S.filter(s => s.startsWith(currentLower));
            }
        }
    } else if (['/tppos', '/kill', '/heal', '/damage', '/invis', '/uninvis'].includes(activeCommand?.name)) {
        if (tokenIndex === 1) {
            if (activeCommand?.name === '/kill' && !Vars.isAdmin) {
                suggestions = ['@s'].filter(s => s.startsWith(currentLower));
            } else if (currentLower.startsWith('@m[')) {
                suggestions = MOB_TYPE_SUGGESTIONS.filter(s => s.startsWith(currentLower));
            } else {
                const allowed = (activeCommand?.name === '/invis' || activeCommand?.name === '/uninvis') ? ENTITY_SUGGESTIONS_P_S : ENTITY_SUGGESTIONS_PM_S;
                suggestions = allowed.filter(s => s.startsWith(currentLower));
            }
        }
    } else if (activeCommand?.name === '/break') {
        if (tokenIndex === 1) {
            suggestions = ['@o[chest]'].filter(s => s.startsWith(currentLower));
        }
    } else if (activeCommand?.name === '/agro') {
        if (tokenIndex === 2) {
            suggestions = AGRO_TARGET_SUGGESTIONS.filter(s => s.startsWith(currentLower));
        }
    } else if (activeCommand?.name === '/setattribute') {
        if (CHAT_AUTOCOMPLETE_DEBUG) {
            console.log('[ChatSuggest] /setattribute', {
                raw,
                tokenIndex,
                tokens,
                current,
                currentLower
            });
        }
        const entityToken = (tokens[1] || '').toLowerCase();
        const entityComplete = isEntityTokenComplete(entityToken, ENTITY_SUGGESTIONS_PM_S);
        if (tokenIndex === 1) {
            if (currentLower.startsWith('@m[')) {
                suggestions = MOB_TYPE_SUGGESTIONS.filter(s => s.startsWith(currentLower));
            } else {
                suggestions = ENTITY_SUGGESTIONS_PM_S.filter(s => s.startsWith(currentLower));
            }
        } else if (tokenIndex === 2) {
            suggestions = currentLower ? SETATTR_SUGGESTIONS.filter(s => s.startsWith(currentLower)) : SETATTR_SUGGESTIONS;
        } else if (tokenIndex >= 3) {
            const attrToken = (tokens[2] || '').toLowerCase();
            if (attrToken === 'invincible') {
                suggestions = INVINCIBLE_VALUE_SUGGESTIONS.filter(s => s.startsWith(currentLower));
            }
        }
        if (tokenIndex === 2 && suggestions.length === 0) {
            suggestions = SETATTR_SUGGESTIONS;
        }
        if (CHAT_AUTOCOMPLETE_DEBUG) {
            console.log('[ChatSuggest] /setattribute suggestions', suggestions);
        }
    }

    if (CHAT_AUTOCOMPLETE_DEBUG) {
        console.log('[ChatSuggest] final', { active: activeCommand?.name || null, suggestions });
    }

    suggestEl.innerHTML = '';
    if (suggestions.length > 0) {
        suggestions.forEach(text => {
            const item = createEl('div', {}, suggestEl, {
                className: 'chat-command-item',
                textContent: text
            });
            item.onclick = () => {
                replaceCurrentToken(text);
                uiRefs.chatInput.focus();
                updateCommandUI();
            };
        });
        suggestEl.style.display = 'flex';
    } else {
        suggestEl.style.display = 'none';
    }
}

function getCurrentToken(raw) {
    const match = raw.match(/^(.*?)(\S*)$/);
    return match ? match[2] : '';
}

function getTokenIndex(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const tokens = trimmed.split(/\s+/);
    if (/\s$/.test(raw)) tokens.push('');
    return tokens.length - 1;
}

function getTokens(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const tokens = trimmed.split(/\s+/);
    if (/\s$/.test(raw)) tokens.push('');
    return tokens;
}

function isEntityTokenComplete(tokenLower, allowedBaseTokens = ENTITY_SUGGESTIONS_PM_S) {
    if (!tokenLower) return false;
    if (allowedBaseTokens.includes(tokenLower)) return true;
    if (tokenLower.startsWith('@m[') && !allowedBaseTokens.includes('@m')) return false;
    if (tokenLower.startsWith('@p[') && !allowedBaseTokens.includes('@p')) return false;
    if (/^@m\[type=[a-z\-]+\]$/.test(tokenLower)) return true;
    if (/^@([pm])\[(?:\d+(?:-\d+)?|all)\]$/.test(tokenLower)) return true;
    return false;
}

function replaceCurrentToken(replacement) {
    const raw = uiRefs.chatInput.value;
    const match = raw.match(/^(.*?)(\S*)$/);
    const before = match ? match[1] : '';
    uiRefs.chatInput.value = `${before}${replacement} `;
}

export function parseEntityRange(entityToken) {
    // Parse @s, @p[5], @m[1-100], @p[all], @m[all], etc.
    // Returns { type: 1|2, ids: [ids...] }

    if (/^@s$/i.test(entityToken)) {
        return { type: 1, ids: [Vars.myId] };
    }

    // Handle [type=...] syntax for mobs
    const typeMatch = entityToken.match(/^@m\[type=([a-z\-]+)\]$/i);
    if (typeMatch) {
        const typeName = typeMatch[1].toLowerCase();
        const typeMap = { chick: 1, pig: 2, cow: 3, hearty: 4, 'polar-bear': 5 };
        const mobType = typeMap[typeName];
        if (!mobType) return null;
        const ids = Object.values(ENTITIES.MOBS)
            .filter(m => m && m.type === mobType)
            .map(m => m.id);
        return { type: 2, ids, isFiltered: true, mobType };
    }

    // Handle [all] syntax
    const allMatch = entityToken.match(/^@([pm])\[all\]$/i);
    if (allMatch) {
        const type = allMatch[1].toLowerCase() === 'p' ? 1 : 2;
        return { type, ids: [0, 65535] };
    }

    const match = entityToken.match(/^@([pm])\[(\d+)(?:-(\d+))?\]$/i);
    if (!match) return null;

    const type = match[1].toLowerCase() === 'p' ? 1 : 2;
    const start = parseInt(match[2]);
    const end = match[3] ? parseInt(match[3]) : start;

    const ids = [];
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        ids.push(i);
    }

    return { type, ids };
}

export function handleChatToggle(myPlayer, homeUsrnInput) {
    if (uiState.isChatOpen) {
        // Intercept admin-style give commands: /give {target} {item}
        const raw = uiRefs.chatInput.value.trim();
        const rawLower = raw.toLowerCase();
        const matchedCmd = COMMANDS.find(cmd => rawLower.startsWith(cmd.name));
        const isCommand = !!matchedCmd;
        const isSelfKill = /^\/kill\s+@s$/i.test(raw);
        const isKillCommand = rawLower.startsWith('/kill');
        if (raw.startsWith('/') && !Vars.isAdmin && !isSelfKill && !isKillCommand) {
            showNotification("Invalid command.", 'red');
            uiRefs.chatInput.value = '';
            uiRefs.chatInputWrapper.style.display = 'none';
            uiRefs.chatInput.blur();
            uiState.isChatOpen = false;
            uiState.lastChatCloseTime = performance.now();
            updateCommandUI();

            const mobileChatBtn = document.getElementById('mobile-chat-btn');
            if (mobileChatBtn && isMobile) mobileChatBtn.style.display = 'flex';
            return;
        }
        const ENTITY_TOKEN_RE = '@s|@p\\[(?:[\\d\\-]+|all)\\]|@m\\[(?:[\\d\\-]+|all|type=[a-z\\-]+)\\]';
        const PLAYER_ENTITY_TOKEN_RE = '@s|@p\\[(?:[\\d\\-]+|all)\\]';

        // /give command: /give {target} {item} [amount]
        const giveTokens = raw.split(/\s+/);
        if (giveTokens[0]?.toLowerCase() === '/give' && giveTokens.length >= 3) {
            const parsed = parseEntityRange(giveTokens[1]);
            const itemName = (giveTokens[2] || '').toLowerCase();
            const amount = Math.max(1, parseInt(giveTokens[3]) || 1);
            const swordMatch = itemName.match(/^sword(\d+)$/i);
            const swordRank = swordMatch ? parseInt(swordMatch[1]) : NaN;

            if (parsed) {
                const startId = Math.min(...parsed.ids);
                const endId = Math.max(...parsed.ids);

                if (itemName.startsWith('sword') && isSwordRank(swordRank)) {
                    for (let i = 0; i < amount; i++) {
                        sendSetAttrCommand(parsed.type, startId, endId, 4, swordRank);
                    }
                } else if (itemName === 'gold-coin') {
                    sendSetAttrCommand(parsed.type, startId, endId, 8, amount);
                } else if (itemName in ACCESSORY_NAME_TO_ID) {
                    for (let i = 0; i < amount; i++) {
                        sendGiveAccessoryCommand(parsed.type, startId, endId, ACCESSORY_NAME_TO_ID[itemName]);
                    }
                } else {
                    showNotification("Make sure to write the parameters properly.", 'red');
                }
            } else {
                showNotification("Make sure to write the parameters properly.", 'red');
            }
        } else {
            // /kill command: /kill @s|@p[...]|@m[...]
            const killMatch = raw.match(new RegExp(`^\\/kill\\s+(${ENTITY_TOKEN_RE})$`, 'i'));
            if (killMatch) {
                const parsed = parseEntityRange(killMatch[1]);

                if (parsed) {
                    if (!Vars.isAdmin) {
                        if (!(parsed.type === 1 && parsed.ids.length === 1 && parsed.ids[0] === Vars.myId)) {
                            showNotification("Make sure to write the parameters properly.", 'red');
                        } else {
                            sendKillCommand(1, Vars.myId, Vars.myId);
                        }
                    } else if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
                        sendMobTypeCommand(8, parsed.mobType);
                    } else if (parsed.isFiltered) {
                        parsed.ids.forEach(id => sendKillCommand(parsed.type, id, id));
                    } else {
                        const startId = Math.min(...parsed.ids);
                        const endId = Math.max(...parsed.ids);
                        sendKillCommand(parsed.type, startId, endId);
                    }
                } else {
                    sendChat(raw);
                }
            } else {
                // /tppos command: /tppos @s|@p[id-range]|@m[id-range]|@p[all]|@m[all] [x, y]
                const tpposMatch = raw.match(new RegExp(`^\\/tppos\\s+(${ENTITY_TOKEN_RE})\\s*\\[\\s*(\\-?\\d+)\\s*,\\s*(\\-?\\d+)\\s*\\]$`, 'i'));
                if (tpposMatch) {
                    const parsed = parseEntityRange(tpposMatch[1]);
                    const x = parseInt(tpposMatch[2]);
                    const y = parseInt(tpposMatch[3]);

                    if (parsed && !isNaN(x) && !isNaN(y)) {
                        if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
                            sendMobTypeCommand(1, parsed.mobType, { x, y });
                        } else if (parsed.isFiltered) {
                            parsed.ids.forEach(id => sendTpPosCommand(parsed.type, id, id, x, y));
                        } else {
                            const startId = Math.min(...parsed.ids);
                            const endId = Math.max(...parsed.ids);
                            sendTpPosCommand(parsed.type, startId, endId, x, y);
                        }
                    } else {
                        sendChat(raw);
                    }
                } else {
                    // /tpent command: /tpent @s|@p[id-range]|@m[id-range]|@p[all]|@m[all] @s|@p[id-range]|@m[id-range]|@p[all]|@m[all]
                    const tpentMatch = raw.match(new RegExp(`^\\/tpent\\s+(${ENTITY_TOKEN_RE})\\s+(${ENTITY_TOKEN_RE})$`, 'i'));
                    if (tpentMatch) {
                        const parsed1 = parseEntityRange(tpentMatch[1]);
                        const parsed2 = parseEntityRange(tpentMatch[2]);

                        if (parsed1 && parsed2) {
                            if (parsed1.isFiltered && parsed1.type === 2 && parsed1.mobType && !parsed2.isFiltered && parsed2.type === 1) {
                                const targetId = Math.min(...parsed2.ids);
                                sendMobTypeCommand(2, parsed1.mobType, { targetType: parsed2.type, targetId });
                            } else if (parsed1.isFiltered && parsed2.isFiltered) {
                                parsed1.ids.forEach(id1 => {
                                    parsed2.ids.forEach(id2 => {
                                        sendTpEntCommand(parsed1.type, id1, id1, parsed2.type, id2, id2);
                                    });
                                });
                            } else if (parsed1.isFiltered) {
                                const startId2 = Math.min(...parsed2.ids);
                                const endId2 = Math.max(...parsed2.ids);
                                parsed1.ids.forEach(id1 => {
                                    sendTpEntCommand(parsed1.type, id1, id1, parsed2.type, startId2, endId2);
                                });
                            } else if (parsed2.isFiltered) {
                                const startId1 = Math.min(...parsed1.ids);
                                const endId1 = Math.max(...parsed1.ids);
                                parsed2.ids.forEach(id2 => {
                                    sendTpEntCommand(parsed1.type, startId1, endId1, parsed2.type, id2, id2);
                                });
                            } else {
                                const startId1 = Math.min(...parsed1.ids);
                                const endId1 = Math.max(...parsed1.ids);
                                const startId2 = Math.min(...parsed2.ids);
                                const endId2 = Math.max(...parsed2.ids);
                                sendTpEntCommand(parsed1.type, startId1, endId1, parsed2.type, startId2, endId2);
                            }
                        } else {
                            sendChat(raw);
                        }
                    } else {
                        // /break command: /break @o[type] [id-range] or /break @o[type] [id-range] dropLoot
                        const breakMatch = raw.match(/^\/break\s+@o\[(\w+)\]\s+\[([\d\-]+|all)\](?:\s+(dropLoot))?$/i);
                        if (breakMatch) {
                            const chestType = breakMatch[1].toLowerCase();
                            const rangeStr = breakMatch[2];
                            const dropLoot = !!breakMatch[3];

                            // Map chest types: chest, chest1, chest2, etc.
                            const typeMap = { 'chest': 10 };
                            dataMap.CHEST_IDS.forEach(id => typeMap[`chest${id}`] = id);

                            if (typeMap[chestType]) {
                                let startId, endId;
                                if (rangeStr.toLowerCase() === 'all') {
                                    startId = 0;
                                    endId = 65535;
                                } else {
                                    const parts = rangeStr.split('-');
                                    startId = parseInt(parts[0]);
                                    endId = parts[1] ? parseInt(parts[1]) : startId;
                                }

                                if (!isNaN(startId) && !isNaN(endId)) {
                                    sendBreakChestCommand(startId, endId, dropLoot);
                                } else {
                                    sendChat(raw);
                                }
                            } else {
                                sendChat(raw);
                            }
                        } else {
                            // /setattribute command: /setattribute <selector> <attribute> <value>
                            const setAttrMatch = raw.match(new RegExp(`^\\/setattribute\\s+(${ENTITY_TOKEN_RE})\\s+(\\w+)\\s+(.+)$`, 'i'));
                            if (setAttrMatch) {
                                const parsed = parseEntityRange(setAttrMatch[1]);
                                const attributeName = setAttrMatch[2].toLowerCase();
                                const rawValue = setAttrMatch[3].trim();

                                let value;
                                let attrIdx;

                                // Map attribute names to indices (different for players vs mobs)
                                const playerAttrMap = { 'speed': 1, 'maxhealth': 6, 'strength': 5, 'damage': 5, 'invincible': 3 };
                                const mobAttrMap = { 'speed': 1, 'strength': 5, 'damage': 5, 'invincible': 7 };

                                // Choose map based on entity type
                                const attrMap = parsed.type === 1 ? playerAttrMap : mobAttrMap;
                                attrIdx = attrMap[attributeName];

                                // Parse value (number or boolean)
                                if (rawValue.toLowerCase() === 'true') {
                                    value = 1;
                                } else if (rawValue.toLowerCase() === 'false') {
                                    value = 0;
                                } else {
                                    value = parseInt(rawValue);
                                }

                                if (parsed && attrIdx && !isNaN(value)) {
                                    if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
                                        sendMobTypeCommand(4, parsed.mobType, { attrIdx, value });
                                    } else if (parsed.isFiltered) {
                                        parsed.ids.forEach(id => sendSetAttrCommand(parsed.type, id, id, attrIdx, value));
                                    } else {
                                        const startId = Math.min(...parsed.ids);
                                        const endId = Math.max(...parsed.ids);
                                        sendSetAttrCommand(parsed.type, startId, endId, attrIdx, value);
                                    }
                                } else {
                                    sendChat(raw);
                                }
                            } else {
                                // /heal command: /heal @s|@p[id-range]|@m[id-range]|@p[all]|@m[all]
                                const healMatch = raw.match(new RegExp(`^\\/heal\\s+(${ENTITY_TOKEN_RE})$`, 'i'));
                                if (healMatch) {
                                    const parsed = parseEntityRange(healMatch[1]);

                                    if (parsed) {
                                        if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
                                            sendMobTypeCommand(10, parsed.mobType);
                                        } else if (parsed.isFiltered) {
                                            parsed.ids.forEach(id => sendHealCommand(parsed.type, id, id));
                                        } else {
                                            const startId = Math.min(...parsed.ids);
                                            const endId = Math.max(...parsed.ids);
                                            sendHealCommand(parsed.type, startId, endId);
                                        }
                                    } else {
                                        sendChat(raw);
                                    }
                                } else {
                                    // /damage command: /damage @s|@p[id-range]|@m[id-range]|@p[all]|@m[all] <amount>[%]
                                    const damageMatch = raw.match(new RegExp(`^\\/damage\\s+(${ENTITY_TOKEN_RE})\\s+(\\d+(\\.\\d+)?)(%)?$`, 'i'));
                                    if (damageMatch) {
                                        const parsed = parseEntityRange(damageMatch[1]);
                                        let amount = parseFloat(damageMatch[2]);
                                        const isPercentage = !!damageMatch[4];

                                        if (isPercentage) {
                                            amount = amount / 100;
                                        }

                                        if (parsed && !isNaN(amount)) {
                                            if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
                                                sendMobTypeCommand(11, parsed.mobType, { damage: amount, isPercentage });
                                            } else if (parsed.isFiltered) {
                                                parsed.ids.forEach(id => sendDamageCommand(parsed.type, id, id, amount, isPercentage));
                                            } else {
                                                const startId = Math.min(...parsed.ids);
                                                const endId = Math.max(...parsed.ids);
                                                sendDamageCommand(parsed.type, startId, endId, amount, isPercentage);
                                            }
                                        } else {
                                            sendChat(raw);
                                        }
                                    } else {
                                        const rovMatch = raw.match(/^\/rov\s+(\d+(?:\.\d+)?)$/i);
                                        if (rovMatch) {
                                            if (Vars.isAdmin) {
                                                const rangeMult = Math.max(0.1, parseFloat(rovMatch[1]));
                                                Vars.viewRangeMult = rangeMult;
                                                sendRovCommand(rangeMult);
                                            }
                                        } else {
                                            const adminMatch = raw.match(/^\/admin\s+(\d+)$/i);
                                            if (adminMatch) {
                                                if (Vars.isAdmin) {
                                                    const targetId = parseInt(adminMatch[1]);
                                                    if (!isNaN(targetId)) {
                                                        sendGrantAdminCommand(targetId);
                                                    } else {
                                                        showNotification("Make sure to write the parameters properly.", 'red');
                                                    }
                                                }
                                            } else {
                                                const invisMatch = raw.match(new RegExp(`^\\/invis\\s+(${PLAYER_ENTITY_TOKEN_RE})$`, 'i'));
                                                if (invisMatch) {
                                                    if (Vars.isAdmin) {
                                                        const parsed = parseEntityRange(invisMatch[1]);
                                                        if (parsed && parsed.type === 1) {
                                                            const startId = Math.min(...parsed.ids);
                                                            const endId = Math.max(...parsed.ids);
                                                            sendInvisCommand(parsed.type, startId, endId);
                                                        } else {
                                                            showNotification("Make sure to write the parameters properly.", 'red');
                                                        }
                                                    }
                                                } else {
                                                    const uninvisMatch = raw.match(new RegExp(`^\\/uninvis\\s+(${PLAYER_ENTITY_TOKEN_RE})$`, 'i'));
                                                    if (uninvisMatch) {
                                                        if (Vars.isAdmin) {
                                                            const parsed = parseEntityRange(uninvisMatch[1]);
                                                            if (parsed && parsed.type === 1) {
                                                                const startId = Math.min(...parsed.ids);
                                                                const endId = Math.max(...parsed.ids);
                                                                sendUninvisCommand(parsed.type, startId, endId);
                                                            } else {
                                                                showNotification("Make sure to write the parameters properly.", 'red');
                                                            }
                                                        }
                                                    } else {
                                                        const agroMatch = raw.match(/^\/agro\s+(\d+(?:-\d+)?|all)\s+(@s|@p\[(?:\d+)\])$/i);
                                                        if (agroMatch) {
                                                            if (Vars.isAdmin) {
                                                                const targetToken = agroMatch[2];
                                                                let targetId = Vars.myId;
                                                                if (!/^@s$/i.test(targetToken)) {
                                                                    const parsedTarget = parseEntityRange(targetToken);
                                                                    if (!parsedTarget || parsedTarget.type !== 1 || parsedTarget.ids.length === 0) {
                                                                        sendChat(raw);
                                                                        return;
                                                                    }
                                                                    targetId = parsedTarget.ids[0];
                                                                }

                                                                const rangeToken = agroMatch[1].toLowerCase();
                                                                let mobIds = [];
                                                                if (rangeToken === 'all') {
                                                                    mobIds = Object.keys(ENTITIES.MOBS).map(id => parseInt(id));
                                                                } else {
                                                                    const parts = rangeToken.split('-').map(n => parseInt(n));
                                                                    const startId = parts[0];
                                                                    const endId = parts[1] ?? startId;
                                                                    if (!isNaN(startId) && !isNaN(endId)) {
                                                                        for (let i = Math.min(startId, endId); i <= Math.max(startId, endId); i++) {
                                                                            mobIds.push(i);
                                                                        }
                                                                    }
                                                                }

                                                                mobIds.forEach(id => {
                                                                    const mob = ENTITIES.MOBS[id];
                                                                    if (!mob) return;
                                                                    if (mob.type !== 3 && mob.type !== 5) return;
                                                                    sendAgroCommand(id, targetId, 0, 0);
                                                                });
                                                            }
                                                        } else if (raw.toLowerCase() === '/cleardrops') {
                                                            sendClearDropsCommand();
                                                        } else if (raw.toLowerCase() === '/reset') {
                                                            if (Vars.isAdmin) {
                                                                const now = performance.now();
                                                                if (now < (uiState.resetConfirmUntil || 0)) {
                                                                    uiState.resetConfirmUntil = 0;
                                                                    sendResetCommand();
                                                                } else {
                                                                    uiState.resetConfirmUntil = now + 5000;
                                                                    showNotification("Type /reset again within 5s to confirm server restart.", 'red');
                                                                }
                                                            }
                                                        } else {
                                                            if (raw.startsWith('/')) {
                                                                showNotification(isCommand ? "Make sure to write the parameters properly." : "Invalid command.", 'red');
                                                            } else {
                                                                // Normal chat
                                                                sendChat(raw);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        uiRefs.chatInput.value = '';
        uiRefs.chatInputWrapper.style.display = 'none';
        uiRefs.chatInput.blur();
        uiState.isChatOpen = false;
        uiState.lastChatCloseTime = performance.now();
        updateCommandUI();

        const mobileChatBtn = document.getElementById('mobile-chat-btn');
        if (mobileChatBtn && isMobile) mobileChatBtn.style.display = 'flex';
    } else if (myPlayer?.isAlive) {
        // Open Chat
        uiState.isChatOpen = true;
        uiRefs.chatInputWrapper.style.display = 'block';
        uiRefs.chatInput.focus();
        updateCommandUI();

        const mobileChatBtn = document.getElementById('mobile-chat-btn');
        if (mobileChatBtn) mobileChatBtn.style.display = 'none';
    } else if (!myPlayer?.isAlive) {
        // Join Game if on login screen
        if (Vars.lastDiedTime + 1700 < performance.now() && document.activeElement === homeUsrnInput) {
            const username = homeUsrnInput.value || localStorage.username;
            ws.send(encodeUsername(username));
        }
    }
}
