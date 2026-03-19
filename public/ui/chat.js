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
    sendSpawnCommand,
    sendBreakStructureCommand,
    sendResetCommand,
    sendGiveAccessoryCommand,
    sendGrantAdminCommand,
    sendInvisCommand,
    sendUninvisCommand,
    sendActivateAbilityCommand,
    encodeUsername,
    writer
} from '../helpers.js';
import {
    ws,
    Vars,
    Settings,
    LC,
    camera,
    JOIN_ACTION_COOLDOWN_MS,
    startJoinActionCooldown
} from '../client.js';
import {
    dataMap,
    isSwordRank,
    SWORD_IDS,
    ACCESSORY_KEYS,
    ACCESSORY_NAME_TO_ID,
    getChestObjectTypes
} from '../shared/datamap.js';
import {
    ENTITIES
} from '../game.js';
import {
    isMobile
} from './config.js';
import {
    uiInput,
    uiRefs,
    uiState
} from './context.js';
import {
    createEl
} from './dom.js';
import {
    showNotification
} from './notifications.js';

export function createChatUI(parent) {
    uiRefs.chatInputWrapper = createEl('div', {}, parent, {
        id: 'chat-input-wrapper'
    });

    uiRefs.chatCommandHint = createEl('div', {}, uiRefs.chatInputWrapper, {
        id: 'chat-command-hint'
    });
    uiRefs.chatCommandList = createEl('div', {}, uiRefs.chatInputWrapper, {
        id: 'chat-command-list'
    });
    uiRefs.chatSuggestList = createEl('div', {}, uiRefs.chatInputWrapper, {
        id: 'chat-suggest-list'
    });

    uiRefs.chatInput = createEl('input', {}, uiRefs.chatInputWrapper, {
        id: 'chatInput',
        maxLength: 50,
        placeholder: 'Press Enter to send...',
        autocomplete: 'off'
    });

    uiRefs.chatInput.addEventListener('input', () => {
        commandAutocompletePrefix = '';
        updateCommandUI();
    });
}

const COMMANDS = [{
        name: '/tpent',
        params: '<@p[id|range|all]|@m[id|range|all]|@s> <@p[id|range|all]|@m[id|range|all]|@s>'
    },
    {
        name: '/tppos',
        params: '<@p[id|range|all]|@m[id|range|all]|@s> <x y>'
    },
    {
        name: '/give',
        params: '<@p[id|range|all]|@s> <itemname> [amount]'
    },
    {
        name: '/kill',
        params: '<@p[id|range|all]|@m[id|range|all]|@s>'
    },
    {
        name: '/spawn',
        params: '<entity> [x y]'
    },
    {
        name: '/break',
        params: '<@o[chest]> <[id|range|all]> [dropLoot]'
    },
    {
        name: '/setattribute',
        params: '<@p[id|range|all]|@m[id|range|all]|@s> <attribute> <value>'
    },
    {
        name: '/heal',
        params: '<@p[id|range|all]|@m[id|range|all]|@s>'
    },
    {
        name: '/damage',
        params: '<@p[id|range|all]|@m[id|range|all]|@s> <amount[%]>'
    },
    {
        name: '/cleardrops',
        params: ''
    },
    {
        name: '/rov',
        params: '<number>'
    },
    {
        name: '/agro',
        params: '<id|range|all> <@p[id]|@s>'
    },
    {
        name: '/reset',
        params: '[seed]'
    },
    {
        name: '/admin',
        params: '<playerId>'
    },
    {
        name: '/invis',
        params: '<@s|@p[id|range|all]>'
    },
    {
        name: '/uninvis',
        params: '<@s|@p[id|range|all]>'
    },
    {
        name: '/activateability',
        params: '<energy_burst|lightning_shot|poison_blast|stamina_boost|speed_boost|smoke_blast> [durationSec]'
    },
    {
        name: '/debug',
        params: '<showHitboxes|showPlayerIds|showChestIds> <true|false>'
    }
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
    '@m[type=polar-bear]',
    '@m[type=minotaur]'
];
const STRUCTURE_SUGGESTIONS = ['@s[tree]', '@s[rock]'];
const SPAWN_ENTITY_SUGGESTIONS = ['chick', 'pig', 'cow', 'hearty', 'minotaur', 'polar_bear', 'polar-bear', 'tree', 'rock'];
const ACCESSORY_SUGGESTIONS = ACCESSORY_KEYS.filter(k => k !== 'none');
const SETATTR_SUGGESTIONS = ['invincible', 'speed', 'damage', 'strength', 'maxhealth', 'score', 'radius'];
const INVINCIBLE_VALUE_SUGGESTIONS = ['true', 'false'];
const SETATTR_COMMON_VALUE_SUGGESTIONS = ['default'];
const ITEM_SUGGESTIONS = [
    ...SWORD_IDS.map(id => `sword${id}`),
    'gold-coin',
    ...ACCESSORY_SUGGESTIONS
];
const ABILITY_SUGGESTIONS = ['energy_burst', 'lightning_shot', 'poison_blast', 'stamina_boost', 'speed_boost', 'smoke_blast', 'growth_spurt', 'invisibility'];
const DEBUG_SETTING_SUGGESTIONS = ['showHitboxes', 'showPlayerIds', 'showChestIds'];
const BOOLEAN_SUGGESTIONS = ['true', 'false'];
const CHAT_AUTOCOMPLETE_DEBUG = false;
let activeAutocompleteItems = [];
let activeAutocompleteIndex = -1;
let activeAutocompleteListEl = null;
let commandAutocompletePrefix = '';
const CHAT_HISTORY_LIMIT = 50;
const chatHistory = [];
let chatHistoryIndex = chatHistory.length;

function resetAutocompleteSelection() {
    activeAutocompleteItems = [];
    activeAutocompleteIndex = -1;
    activeAutocompleteListEl = null;
    commandAutocompletePrefix = '';
}

function resetChatHistoryNavigation() {
    chatHistoryIndex = chatHistory.length;
}

function pushChatHistory(entry) {
    const trimmed = (entry || '').trim();
    if (!trimmed) return;
    const last = chatHistory[chatHistory.length - 1];
    if (last === trimmed) {
        resetChatHistoryNavigation();
        return;
    }
    chatHistory.push(trimmed);
    if (chatHistory.length > CHAT_HISTORY_LIMIT) {
        chatHistory.shift();
    }
    resetChatHistoryNavigation();
}

function resetCommandAutocompleteSelection() {
    commandAutocompletePrefix = '';
    if (activeAutocompleteListEl !== uiRefs.chatCommandList) return;
    activeAutocompleteItems = [];
    activeAutocompleteIndex = -1;
    activeAutocompleteListEl = null;
}

function setAutocompleteItems(listEl, items) {
    const previousValue = activeAutocompleteIndex >= 0 ? activeAutocompleteItems[activeAutocompleteIndex] : null;
    activeAutocompleteListEl = listEl || null;
    activeAutocompleteItems = Array.isArray(items) ? items.slice() : [];
    activeAutocompleteIndex = previousValue ? activeAutocompleteItems.indexOf(previousValue) : -1;
}

function renderAutocompleteSelection() {
    if (!activeAutocompleteListEl) return;
    const children = Array.from(activeAutocompleteListEl.children || []);
    children.forEach((child, idx) => {
        child.classList.toggle('active', idx === activeAutocompleteIndex);
        if (idx === activeAutocompleteIndex) {
            child.scrollIntoView({ block: 'nearest' });
        }
    });
}

function filterSuggestionPool(pool, currentLower) {
    const safePool = Array.isArray(pool) ? pool : [];
    if (!currentLower) return safePool;
    const normalizedCurrent = currentLower.toLowerCase();
    const exactMatch = safePool.some(s => s.toLowerCase() === normalizedCurrent);
    if (exactMatch) return safePool;
    return safePool.filter(s => s.toLowerCase().startsWith(normalizedCurrent));
}

function getCommandToken(raw) {
    const trimmedLeft = (raw || '').trimStart();
    const match = trimmedLeft.match(/^(\/\S*)/);
    return match ? match[1].toLowerCase() : '';
}

function isEditingCommandName(raw) {
    const trimmedLeft = (raw || '').trimStart();
    if (!trimmedLeft.startsWith('/')) return false;
    return !/\s/.test(trimmedLeft);
}

function updateCommandUI() {
    if (!uiRefs.chatInput || !uiRefs.chatCommandHint || !uiRefs.chatCommandList) return;

    const raw = uiRefs.chatInput.value;
    const value = raw.trim().toLowerCase();
    const editingCommandName = isEditingCommandName(raw);
    const commandFilterValue = (commandAutocompletePrefix && editingCommandName)
        ? commandAutocompletePrefix
        : getCommandToken(raw);

    if (!value.startsWith('/')) {
        uiRefs.chatCommandHint.textContent = '';
        uiRefs.chatCommandHint.style.display = 'none';
        uiRefs.chatCommandList.innerHTML = '';
        uiRefs.chatCommandList.style.display = 'none';
        resetAutocompleteSelection();
        if (uiRefs.chatSuggestList) {
            uiRefs.chatSuggestList.innerHTML = '';
            uiRefs.chatSuggestList.style.display = 'none';
        }
        return;
    }

    const visibleCommands = Vars.isAdmin ? COMMANDS : COMMANDS.filter(cmd => cmd.name === '/kill' || cmd.name === '/debug');
    const matches = editingCommandName
        ? visibleCommands.filter(cmd => cmd.name.startsWith(commandFilterValue))
        : [];
    uiRefs.chatCommandList.innerHTML = '';

    if (matches.length > 0) {
        matches.forEach(cmd => {
            const item = createEl('div', {}, uiRefs.chatCommandList, {
                className: 'chat-command-item',
                textContent: cmd.name
            });
            item.onclick = () => {
                uiRefs.chatInput.value = cmd.name;
                uiRefs.chatInput.focus();
                updateCommandUI();
            };
        });
        uiRefs.chatCommandList.style.display = 'flex';
        setAutocompleteItems(uiRefs.chatCommandList, matches.map(cmd => cmd.name));
        renderAutocompleteSelection();
    } else {
        uiRefs.chatCommandList.style.display = 'none';
        resetCommandAutocompleteSelection();
    }

    const exact = visibleCommands.find(cmd => value.startsWith(cmd.name));
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
    if (!activeCommand) {
        suggestEl.innerHTML = '';
        suggestEl.style.display = 'none';
        if (activeAutocompleteListEl === suggestEl) {
            resetAutocompleteSelection();
        }
        return;
    }

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
            suggestions = filterSuggestionPool(MOB_TYPE_SUGGESTIONS, currentLower);
        } else {
            suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_ALL, currentLower);
        }
    }

    // Command-specific suggestions
    const tokenIndex = getTokenIndex(raw);
    const tokens = getTokens(raw);
    if (activeCommand?.name === '/give') {
        const entityToken = (tokens[1] || '').toLowerCase();
        const entityComplete = isEntityTokenComplete(entityToken, ENTITY_SUGGESTIONS_P_S);
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_P_S, currentLower);
        } else if (tokenIndex === 2) {
            if (entityComplete) {
                suggestions = filterSuggestionPool(ITEM_SUGGESTIONS, currentLower);
            } else {
                suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_P_S, currentLower);
            }
        } else if (tokenIndex > 2 && entityComplete) {
            suggestions = filterSuggestionPool(ITEM_SUGGESTIONS, currentLower);
        }
    } else if (activeCommand?.name === '/tpent') {
        if (tokenIndex === 1 || tokenIndex === 2) {
            if (currentLower.startsWith('@')) {
                if (currentLower.startsWith('@m[')) {
                    suggestions = filterSuggestionPool(MOB_TYPE_SUGGESTIONS, currentLower);
                } else {
                    suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_PM_S, currentLower);
                }
            }
        }
    } else if (activeCommand?.name === '/spawn') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(SPAWN_ENTITY_SUGGESTIONS, currentLower);
        }
    } else if (activeCommand?.name === '/break') {
        if (tokenIndex === 1) {
            const pool = [...STRUCTURE_SUGGESTIONS, '@o[chest]'];
            suggestions = filterSuggestionPool(pool, currentLower);
        }
    } else if (['/tppos', '/kill', '/heal', '/damage', '/invis', '/uninvis'].includes(activeCommand?.name)) {
        if (tokenIndex === 1) {
            if (activeCommand?.name === '/kill' && !Vars.isAdmin) {
                suggestions = filterSuggestionPool(['@s'], currentLower);
            } else if (currentLower.startsWith('@m[')) {
                suggestions = filterSuggestionPool(MOB_TYPE_SUGGESTIONS, currentLower);
            } else {
                const allowed = (activeCommand?.name === '/invis' || activeCommand?.name === '/uninvis') ? ENTITY_SUGGESTIONS_P_S : ENTITY_SUGGESTIONS_PM_S;
                suggestions = filterSuggestionPool(allowed, currentLower);
            }
        }
    } else if (activeCommand?.name === '/break') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(['@o[chest]'], currentLower);
        }
    } else if (activeCommand?.name === '/agro') {
        if (tokenIndex === 2) {
            suggestions = filterSuggestionPool(AGRO_TARGET_SUGGESTIONS, currentLower);
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
                suggestions = filterSuggestionPool(MOB_TYPE_SUGGESTIONS, currentLower);
            } else {
                suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_PM_S, currentLower);
            }
        } else if (tokenIndex === 2) {
            suggestions = filterSuggestionPool(SETATTR_SUGGESTIONS, currentLower);
        } else if (tokenIndex >= 3) {
            const attrToken = (tokens[2] || '').toLowerCase();
            if (attrToken === 'invincible') {
                suggestions = filterSuggestionPool([...INVINCIBLE_VALUE_SUGGESTIONS, ...SETATTR_COMMON_VALUE_SUGGESTIONS], currentLower);
            } else {
                suggestions = filterSuggestionPool(SETATTR_COMMON_VALUE_SUGGESTIONS, currentLower);
            }
        }
        if (tokenIndex === 2 && suggestions.length === 0) {
            suggestions = SETATTR_SUGGESTIONS;
        }
        if (CHAT_AUTOCOMPLETE_DEBUG) {
            console.log('[ChatSuggest] /setattribute suggestions', suggestions);
        }
    } else if (activeCommand?.name === '/activateability') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(ABILITY_SUGGESTIONS, currentLower);
        }
    } else if (activeCommand?.name === '/debug') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(DEBUG_SETTING_SUGGESTIONS, currentLower);
        } else if (tokenIndex === 2) {
            suggestions = filterSuggestionPool(BOOLEAN_SUGGESTIONS, currentLower);
        }
    }

    if (CHAT_AUTOCOMPLETE_DEBUG) {
        console.log('[ChatSuggest] final', {
            active: activeCommand?.name || null,
            suggestions
        });
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
        setAutocompleteItems(suggestEl, suggestions);
        renderAutocompleteSelection();
    } else {
        suggestEl.style.display = 'none';
        if (activeAutocompleteListEl === suggestEl) {
            resetAutocompleteSelection();
        }
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

function replaceCurrentToken(replacement, appendSpace = false) {
    const raw = uiRefs.chatInput.value;
    const match = raw.match(/^(.*?)(\S*)$/);
    const before = match ? match[1] : '';
    uiRefs.chatInput.value = `${before}${replacement}${appendSpace ? ' ' : ''}`;
}

function replaceCommandName(replacement, appendSpace = false) {
    const raw = uiRefs.chatInput.value;
    const trimmedLeft = raw.trimStart();
    if (!trimmedLeft.startsWith('/')) {
        uiRefs.chatInput.value = `${replacement}${appendSpace ? ' ' : ''}`;
        return;
    }
    const parts = raw.match(/^(\s*)(\/\S*)(.*)$/);
    if (!parts) {
        uiRefs.chatInput.value = `${replacement}${appendSpace ? ' ' : ''}`;
        return;
    }
    const [, leadingWs, , rest] = parts;
    uiRefs.chatInput.value = `${leadingWs}${replacement}${appendSpace ? ' ' : ''}${rest}`;
}

export function handleChatAutocompleteTab(reverse = false) {
    const input = uiRefs.chatInput;
    if (!input || !uiState.isChatOpen) return false;
    updateCommandUI();

    const suggestVisible = uiRefs.chatSuggestList && uiRefs.chatSuggestList.style.display !== 'none' && uiRefs.chatSuggestList.children.length > 0;
    const commandVisible = uiRefs.chatCommandList && uiRefs.chatCommandList.style.display !== 'none' && uiRefs.chatCommandList.children.length > 0;
    const targetList = suggestVisible ? uiRefs.chatSuggestList : (commandVisible ? uiRefs.chatCommandList : null);
    if (!targetList) return false;

    const items = Array.from(targetList.children)
        .map(el => el.textContent || '')
        .filter(Boolean);
    if (!items.length) return false;

    if (activeAutocompleteListEl !== targetList || activeAutocompleteItems.join('\n') !== items.join('\n')) {
        setAutocompleteItems(targetList, items);
    }

    if (activeAutocompleteIndex < 0) {
        activeAutocompleteIndex = reverse ? (activeAutocompleteItems.length - 1) : 0;
    }
    const replacement = activeAutocompleteItems[activeAutocompleteIndex];
    if (targetList === uiRefs.chatCommandList) {
        replaceCommandName(replacement, true);
    } else {
        replaceCurrentToken(replacement, true);
    }
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    updateCommandUI();
    return true;
}

export function handleChatAutocompleteMoveSelection(reverse = false) {
    const input = uiRefs.chatInput;
    if (!input || !uiState.isChatOpen) return false;
    updateCommandUI();

    const suggestVisible = uiRefs.chatSuggestList && uiRefs.chatSuggestList.style.display !== 'none' && uiRefs.chatSuggestList.children.length > 0;
    const commandVisible = uiRefs.chatCommandList && uiRefs.chatCommandList.style.display !== 'none' && uiRefs.chatCommandList.children.length > 0;
    const targetList = suggestVisible ? uiRefs.chatSuggestList : (commandVisible ? uiRefs.chatCommandList : null);
    if (!targetList) return false;

    const items = Array.from(targetList.children)
        .map(el => el.textContent || '')
        .filter(Boolean);
    if (!items.length) return false;

    if (activeAutocompleteListEl !== targetList || activeAutocompleteItems.join('\n') !== items.join('\n')) {
        setAutocompleteItems(targetList, items);
    }

    const delta = reverse ? -1 : 1;
    activeAutocompleteIndex = activeAutocompleteIndex < 0
        ? (reverse ? (activeAutocompleteItems.length - 1) : 0)
        : (activeAutocompleteIndex + delta + activeAutocompleteItems.length) % activeAutocompleteItems.length;

    renderAutocompleteSelection();
    input.focus();
    return true;
}

export function parseEntityRange(entityToken) {
    // Parse @s, @p[5], @m[1-100], @p[all], @m[all], etc.
    // Returns { type: 1|2, ids: [ids...] }

    if (/^@s$/i.test(entityToken)) {
        return {
            type: 1,
            ids: [Vars.myId]
        };
    }

    // Handle [type=...] syntax for mobs
    const typeMatch = entityToken.match(/^@m\[type=([a-z\-]+)\]$/i);
    if (typeMatch) {
        const typeName = typeMatch[1].toLowerCase();
        const typeMap = {
            chick: 1,
            pig: 2,
            cow: 3,
            hearty: 4,
            'polar-bear': 5,
            minotaur: 6
        };
        const mobType = typeMap[typeName];
        if (!mobType) return null;
        const ids = Object.values(ENTITIES.MOBS)
            .filter(m => m && m.type === mobType)
            .map(m => m.id);
        return {
            type: 2,
            ids,
            isFiltered: true,
            mobType
        };
    }

    // Handle [all] syntax
    const allMatch = entityToken.match(/^@([pm])\[all\]$/i);
    if (allMatch) {
        const type = allMatch[1].toLowerCase() === 'p' ? 1 : 2;
        return {
            type,
            ids: [0, 65535]
        };
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

    return {
        type,
        ids
    };
}

const ENTITY_TOKEN_RE = '@s|@p\\[(?:[\\d\\-]+|all)\\]|@m\\[(?:[\\d\\-]+|all|type=[a-z\\-]+)\\]';
const PLAYER_ENTITY_TOKEN_RE = '@s|@p\\[(?:[\\d\\-]+|all)\\]';

function showChatParamError() {
    showNotification("Make sure to write the parameters properly.", 'red');
}

function hideMobileChatButton() {
    const mobileChatBtn = document.getElementById('mobile-chat-btn');
    if (mobileChatBtn) mobileChatBtn.style.display = 'none';
}

function showMobileChatButton() {
    const mobileChatBtn = document.getElementById('mobile-chat-btn');
    if (mobileChatBtn && isMobile) mobileChatBtn.style.display = 'flex';
}

function stopAllMovementForChat() {
    if (!ws || ws.readyState !== ws.OPEN) return;
    const keyToDir = { w: 1, a: 2, s: 3, d: 4 };
    for (const [key, dir] of Object.entries(keyToDir)) {
        if (!uiInput.keys.has(key)) continue;
        uiInput.keys.delete(key);
        writer.reset();
        writer.writeU8(3);
        writer.writeU8(dir);
        writer.writeU8(0);
        ws.send(writer.getBuffer());
    }
}

function openChatInput() {
    stopAllMovementForChat();
    uiState.isChatOpen = true;
    uiRefs.chatInputWrapper.style.display = 'block';
    uiRefs.chatInput.focus();
    updateCommandUI();
    hideMobileChatButton();
    resetChatHistoryNavigation();
}

export function closeChatInput() {
    if (!uiRefs.chatInput || !uiRefs.chatInputWrapper) {
        uiState.isChatOpen = false;
        uiState.lastChatCloseTime = performance.now();
        return;
    }
    uiRefs.chatInput.value = '';
    uiRefs.chatInputWrapper.style.display = 'none';
    uiRefs.chatInput.blur();
    uiState.isChatOpen = false;
    uiState.lastChatCloseTime = performance.now();
    resetChatHistoryNavigation();
    updateCommandUI();
    showMobileChatButton();
}

function tryJoinFromLogin(homeUsrnInput) {
    if (document.activeElement !== homeUsrnInput) return;
    if (performance.now() < (Vars.joinActionLockedUntil || 0)) return;
    if (Vars.lastDiedTime + JOIN_ACTION_COOLDOWN_MS < performance.now()) {
        startJoinActionCooldown();
        const username = homeUsrnInput.value || localStorage.username;
        ws.send(encodeUsername(username));
    }
}

function getIdBounds(parsed) {
    return {
        startId: Math.min(...parsed.ids),
        endId: Math.max(...parsed.ids)
    };
}

function isNonAdminAllowedSlash(raw, rawLower) {
    const isSelfKill = /^\/kill\s+@s$/i.test(raw);
    const isKillCommand = rawLower.startsWith('/kill');
    const isDebugCommand = rawLower.startsWith('/debug');
    return isSelfKill || isKillCommand || isDebugCommand;
}

function handleActivateAbility(raw) {
    const activateAbilityMatch = raw.match(/^\/activateability\s+([a-z_]+)(?:\s+(\d+))?$/i);
    if (!activateAbilityMatch) return false;

    if (Vars.isAdmin) {
        const ability = activateAbilityMatch[1].toLowerCase();
        const durationSeconds = activateAbilityMatch[2] ? Math.max(1, Math.min(65535, parseInt(activateAbilityMatch[2], 10))) : null;
        if (ability === 'lightning_shot') {
            const { x: screenX, y: screenY } = LC.clientToLogical(Vars.mouseX, Vars.mouseY);
            const centerX = LC.width / 2;
            const centerY = LC.height / 2;
            const worldX = camera.x + centerX + ((screenX - centerX) / Math.max(0.001, LC.zoom));
            const worldY = camera.y + centerY + ((screenY - centerY) / Math.max(0.001, LC.zoom));
            sendActivateAbilityCommand(ability, { targetX: worldX, targetY: worldY });
        } else if (ability === 'stamina_boost' || ability === 'speed_boost') {
            const fallbackDuration = ability === 'speed_boost' ? 3 : 5;
            sendActivateAbilityCommand(ability, { durationSeconds: durationSeconds ?? fallbackDuration });
        } else {
            sendActivateAbilityCommand(ability);
        }
    } else {
        showNotification("Invalid command.", 'red');
    }
    return true;
}

function handleGive(raw) {
    const giveTokens = raw.split(/\s+/);
    if (giveTokens[0]?.toLowerCase() !== '/give' || giveTokens.length < 3) return false;

    const parsed = parseEntityRange(giveTokens[1]);
    const itemName = (giveTokens[2] || '').toLowerCase();
    const amount = Math.max(1, parseInt(giveTokens[3]) || 1);
    const swordMatch = itemName.match(/^sword(\d+)$/i);
    const swordRank = swordMatch ? parseInt(swordMatch[1]) : NaN;

    if (!parsed) {
        showChatParamError();
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);

    if (itemName.startsWith('sword') && isSwordRank(swordRank)) {
        for (let i = 0; i < amount; i++) {
            sendSetAttrCommand(parsed.type, startId, endId, 4, swordRank);
        }
        return true;
    }

    if (itemName === 'gold-coin') {
        sendSetAttrCommand(parsed.type, startId, endId, 8, amount);
        return true;
    }

    if (itemName in ACCESSORY_NAME_TO_ID) {
        for (let i = 0; i < amount; i++) {
            sendGiveAccessoryCommand(parsed.type, startId, endId, ACCESSORY_NAME_TO_ID[itemName]);
        }
        return true;
    }

    showChatParamError();
    return true;
}

function handleKill(raw) {
    const killMatch = raw.match(new RegExp(`^\\/kill\\s+(${ENTITY_TOKEN_RE})$`, 'i'));
    if (!killMatch) return false;

    const parsed = parseEntityRange(killMatch[1]);
    if (!parsed) {
        sendChat(raw);
        return true;
    }

    if (!Vars.isAdmin) {
        if (!(parsed.type === 1 && parsed.ids.length === 1 && parsed.ids[0] === Vars.myId)) {
            showChatParamError();
        } else {
            sendKillCommand(1, Vars.myId, Vars.myId);
        }
        return true;
    }

    if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
        sendMobTypeCommand(8, parsed.mobType);
        return true;
    }

    if (parsed.isFiltered) {
        parsed.ids.forEach(id => sendKillCommand(parsed.type, id, id));
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);
    sendKillCommand(parsed.type, startId, endId);
    return true;
}

function handleSpawn(raw) {
    const spawnMatch = raw.match(/^\/spawn\s+([a-z_\-]+)(?:\s+(-?\d+)\s+(-?\d+))?$/i);
    if (!spawnMatch) return false;

    if (!Vars.isAdmin) return true;

    const entityKey = spawnMatch[1].toLowerCase();
    const isSpawnable = SPAWN_ENTITY_SUGGESTIONS.some(s => s.toLowerCase() === entityKey);
    if (!isSpawnable) {
        showChatParamError();
        return true;
    }

    const x = spawnMatch[2] !== undefined ? parseInt(spawnMatch[2], 10) : null;
    const y = spawnMatch[3] !== undefined ? parseInt(spawnMatch[3], 10) : null;

    if (Number.isFinite(x) && Number.isFinite(y)) {
        sendSpawnCommand(entityKey, x, y);
    } else {
        sendSpawnCommand(entityKey);
    }
    return true;
}

function handleTpPos(raw) {
    const tpposMatch = raw.match(new RegExp(`^\\/tppos\\s+(${ENTITY_TOKEN_RE})\\s+(\\-?\\d+)\\s+(\\-?\\d+)$`, 'i'));
    if (!tpposMatch) return false;

    const parsed = parseEntityRange(tpposMatch[1]);
    const x = parseInt(tpposMatch[2]);
    const y = parseInt(tpposMatch[3]);
    if (!parsed || isNaN(x) || isNaN(y)) {
        sendChat(raw);
        return true;
    }

    if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
        sendMobTypeCommand(1, parsed.mobType, {
            x,
            y
        });
        return true;
    }

    if (parsed.isFiltered) {
        parsed.ids.forEach(id => sendTpPosCommand(parsed.type, id, id, x, y));
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);
    sendTpPosCommand(parsed.type, startId, endId, x, y);
    return true;
}

function handleTpEnt(raw) {
    const tpentMatch = raw.match(new RegExp(`^\\/tpent\\s+(${ENTITY_TOKEN_RE})\\s+(${ENTITY_TOKEN_RE})$`, 'i'));
    if (!tpentMatch) return false;

    const parsed1 = parseEntityRange(tpentMatch[1]);
    const parsed2 = parseEntityRange(tpentMatch[2]);
    if (!parsed1 || !parsed2) {
        sendChat(raw);
        return true;
    }

    if (parsed1.isFiltered && parsed1.type === 2 && parsed1.mobType && !parsed2.isFiltered && parsed2.type === 1) {
        const {
            startId: targetId
        } = getIdBounds(parsed2);
        sendMobTypeCommand(2, parsed1.mobType, {
            targetType: parsed2.type,
            targetId
        });
        return true;
    }

    if (parsed1.isFiltered && parsed2.isFiltered) {
        parsed1.ids.forEach(id1 => {
            parsed2.ids.forEach(id2 => {
                sendTpEntCommand(parsed1.type, id1, id1, parsed2.type, id2, id2);
            });
        });
        return true;
    }

    if (parsed1.isFiltered) {
        const {
            startId: startId2,
            endId: endId2
        } = getIdBounds(parsed2);
        parsed1.ids.forEach(id1 => {
            sendTpEntCommand(parsed1.type, id1, id1, parsed2.type, startId2, endId2);
        });
        return true;
    }

    if (parsed2.isFiltered) {
        const {
            startId: startId1,
            endId: endId1
        } = getIdBounds(parsed1);
        parsed2.ids.forEach(id2 => {
            sendTpEntCommand(parsed1.type, startId1, endId1, parsed2.type, id2, id2);
        });
        return true;
    }

    const {
        startId: startId1,
        endId: endId1
    } = getIdBounds(parsed1);
    const {
        startId: startId2,
        endId: endId2
    } = getIdBounds(parsed2);
    sendTpEntCommand(parsed1.type, startId1, endId1, parsed2.type, startId2, endId2);
    return true;
}

function handleBreak(raw) {
    const chestMatch = raw.match(/^\/break\s+@o\[(\w+)\]\s+\[([\d\-]+|all)\](?:\s+(dropLoot))?$/i);
    const structMatch = raw.match(/^\/break\s+@s\[(tree|rock)\]$/i);
    if (!chestMatch && !structMatch) return false;

    if (structMatch) {
        if (!Vars.isAdmin) return true;
        const key = structMatch[1].toLowerCase();
        const structTypeMap = { rock: 2, tree: 3 };
        sendBreakStructureCommand(structTypeMap[key] || 0);
        return true;
    }

    // chest path
    const chestType = chestMatch[1].toLowerCase();
    const rangeStr = chestMatch[2];
    const dropLoot = !!chestMatch[3];
    const typeMap = {
        chest: 10
    };
    getChestObjectTypes().forEach(id => {
        typeMap[`chest${id}`] = id;
    });

    if (!typeMap[chestType]) {
        sendChat(raw);
        return true;
    }

    let startId;
    let endId;
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
    return true;
}

function handleSetAttribute(raw) {
    const setAttrMatch = raw.match(new RegExp(`^\\/setattribute\\s+(${ENTITY_TOKEN_RE})\\s+(\\w+)\\s+(.+)$`, 'i'));
    if (!setAttrMatch) return false;

    const parsed = parseEntityRange(setAttrMatch[1]);
    const attributeName = setAttrMatch[2].toLowerCase();
    const rawValue = setAttrMatch[3].trim();
    if (!parsed) {
        sendChat(raw);
        return true;
    }

    const playerAttrMap = {
        speed: 1,
        maxhealth: 6,
        strength: 5,
        damage: 5,
        score: 2,
        invincible: 3,
        radius: 9
    };
    const mobAttrMap = {
        speed: 1,
        strength: 5,
        damage: 5,
        invincible: 7,
        radius: 9
    };

    const attrMap = parsed.type === 1 ? playerAttrMap : mobAttrMap;
    const attrIdx = attrMap[attributeName];
    let value;
    const lowerValue = rawValue.toLowerCase();
    if (lowerValue === 'default') {
        value = Number.NaN;
    } else if (lowerValue === 'true') {
        value = 1;
    } else if (lowerValue === 'false') {
        value = 0;
    } else {
        value = Number(rawValue);
    }

    if (!attrIdx || (Number.isNaN(value) && lowerValue !== 'default') || !Number.isFinite(value) && lowerValue !== 'default') {
        sendChat(raw);
        return true;
    }

    if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
        sendMobTypeCommand(4, parsed.mobType, {
            attrIdx,
            value
        });
        return true;
    }

    if (parsed.isFiltered) {
        parsed.ids.forEach(id => sendSetAttrCommand(parsed.type, id, id, attrIdx, value));
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);
    sendSetAttrCommand(parsed.type, startId, endId, attrIdx, value);
    return true;
}

function handleHeal(raw) {
    const healMatch = raw.match(new RegExp(`^\\/heal\\s+(${ENTITY_TOKEN_RE})$`, 'i'));
    if (!healMatch) return false;

    const parsed = parseEntityRange(healMatch[1]);
    if (!parsed) {
        sendChat(raw);
        return true;
    }

    if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
        sendMobTypeCommand(10, parsed.mobType);
        return true;
    }

    if (parsed.isFiltered) {
        parsed.ids.forEach(id => sendHealCommand(parsed.type, id, id));
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);
    sendHealCommand(parsed.type, startId, endId);
    return true;
}

function handleDamage(raw) {
    const damageMatch = raw.match(new RegExp(`^\\/damage\\s+(${ENTITY_TOKEN_RE})\\s+(\\d+(\\.\\d+)?)(%)?$`, 'i'));
    if (!damageMatch) return false;

    const parsed = parseEntityRange(damageMatch[1]);
    let amount = parseFloat(damageMatch[2]);
    const isPercentage = !!damageMatch[4];
    if (isPercentage) amount /= 100;
    if (!parsed || isNaN(amount)) {
        sendChat(raw);
        return true;
    }

    if (parsed.isFiltered && parsed.type === 2 && parsed.mobType) {
        sendMobTypeCommand(11, parsed.mobType, {
            damage: amount,
            isPercentage
        });
        return true;
    }

    if (parsed.isFiltered) {
        parsed.ids.forEach(id => sendDamageCommand(parsed.type, id, id, amount, isPercentage));
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);
    sendDamageCommand(parsed.type, startId, endId, amount, isPercentage);
    return true;
}

function handleRov(raw) {
    const rovMatch = raw.match(/^\/rov\s+(\d+(?:\.\d+)?)$/i);
    if (!rovMatch) return false;

    if (Vars.isAdmin) {
        const rangeMult = Math.max(0.1, parseFloat(rovMatch[1]));
        Vars.viewRangeMult = rangeMult;
        sendRovCommand(rangeMult);
    }
    return true;
}

function handleAdmin(raw) {
    const adminMatch = raw.match(/^\/admin\s+(\d+)$/i);
    if (!adminMatch) return false;

    if (!Vars.isAdmin) return true;

    const targetId = parseInt(adminMatch[1]);
    if (!isNaN(targetId)) {
        sendGrantAdminCommand(targetId);
    } else {
        showChatParamError();
    }
    return true;
}

function handleInvis(raw) {
    const invisMatch = raw.match(new RegExp(`^\\/invis\\s+(${PLAYER_ENTITY_TOKEN_RE})$`, 'i'));
    if (!invisMatch) return false;

    if (!Vars.isAdmin) return true;

    const parsed = parseEntityRange(invisMatch[1]);
    if (parsed && parsed.type === 1) {
        const {
            startId,
            endId
        } = getIdBounds(parsed);
        sendInvisCommand(parsed.type, startId, endId);
    } else {
        showChatParamError();
    }
    return true;
}

function handleUninvis(raw) {
    const uninvisMatch = raw.match(new RegExp(`^\\/uninvis\\s+(${PLAYER_ENTITY_TOKEN_RE})$`, 'i'));
    if (!uninvisMatch) return false;

    if (!Vars.isAdmin) return true;

    const parsed = parseEntityRange(uninvisMatch[1]);
    if (parsed && parsed.type === 1) {
        const {
            startId,
            endId
        } = getIdBounds(parsed);
        sendUninvisCommand(parsed.type, startId, endId);
    } else {
        showChatParamError();
    }
    return true;
}

function handleAgro(raw) {
    const agroMatch = raw.match(/^\/agro\s+(\d+(?:-\d+)?|all)\s+(@s|@p\[(?:\d+)\])$/i);
    if (!agroMatch) return false;

    if (!Vars.isAdmin) return true;

    const targetToken = agroMatch[2];
    let targetId = Vars.myId;
    if (!/^@s$/i.test(targetToken)) {
        const parsedTarget = parseEntityRange(targetToken);
        if (!parsedTarget || parsedTarget.type !== 1 || parsedTarget.ids.length === 0) {
            sendChat(raw);
            return true;
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
        if (mob.type !== 3 && mob.type !== 5 && mob.type !== 6) return;
        sendAgroCommand(id, targetId, 0, 0);
    });
    return true;
}

function handleReset(raw) {
    const match = raw.match(/^\/reset(?:\s+(\d+))?$/i);
    if (!match) return false;

    if (!Vars.isAdmin) return true;

    const seedStr = match[1];
    let seed = null;
    if (seedStr !== undefined) {
        seed = parseInt(seedStr, 10);
        const valid = Number.isFinite(seed) && seed >= 0 && seed <= 0xFFFFFFFF;
        if (!valid) {
            showNotification('Invalid seed. Use a number between 0 and 4294967295.', 'red');
            return true;
        }
    }

    const now = performance.now();
    if (now < (uiState.resetConfirmUntil || 0)) {
        const finalSeed = seed !== null ? seed : uiState.resetPendingSeed;
        uiState.resetConfirmUntil = 0;
        uiState.resetPendingSeed = null;
        sendResetCommand(finalSeed);
    } else {
        uiState.resetConfirmUntil = now + 5000;
        uiState.resetPendingSeed = seed !== null ? seed : uiState.resetPendingSeed;
        const message = seed !== null
            ? `Type /reset again within 5s to confirm restart with seed ${seed}.`
            : 'Type /reset again within 5s to confirm server restart.';
        showNotification(message, 'red');
    }
    return true;
}

function handleDebug(raw) {
    const debugMatch = raw.match(/^\/debug\s+(showHitboxes|showPlayerIds|showChestIds)\s+(true|false)$/i);
    if (!debugMatch) return false;

    const settingKey = debugMatch[1];
    const nextValue = debugMatch[2].toLowerCase() === 'true';
    Settings[settingKey] = nextValue;
    showNotification(`${settingKey} ${nextValue ? 'enabled' : 'disabled'}.`, nextValue ? '#2ecc71' : '#eab308');
    return true;
}

function executeChatInput(raw, rawLower, isCommand) {
    if (handleActivateAbility(raw)) return;
    if (handleDebug(raw)) return;
    if (handleGive(raw)) return;
    if (handleKill(raw)) return;
    if (handleSpawn(raw)) return;
    if (handleTpPos(raw)) return;
    if (handleTpEnt(raw)) return;
    if (handleBreak(raw)) return;
    if (handleSetAttribute(raw)) return;
    if (handleHeal(raw)) return;
    if (handleDamage(raw)) return;
    if (handleRov(raw)) return;
    if (handleAdmin(raw)) return;
    if (handleInvis(raw)) return;
    if (handleUninvis(raw)) return;
    if (handleAgro(raw)) return;

    if (rawLower === '/cleardrops') {
        sendClearDropsCommand();
        return;
    }

    if (handleReset(raw)) return;

    if (raw.startsWith('/')) {
        showNotification(isCommand ? "Make sure to write the parameters properly." : "Invalid command.", 'red');
        return;
    }

    sendChat(raw);
}

export function handleChatToggle(myPlayer, homeUsrnInput) {
    if (!uiState.isChatOpen) {
        if (myPlayer?.isAlive) {
            openChatInput();
            return;
        }

        if (!myPlayer?.isAlive) {
            tryJoinFromLogin(homeUsrnInput);
            return;
        }
    }

    if (!uiState.isChatOpen) return;

    const raw = uiRefs.chatInput.value.trim();
    const rawLower = raw.toLowerCase();
    const matchedCmd = COMMANDS.find(cmd => rawLower.startsWith(cmd.name));
    const isCommand = !!matchedCmd;

    if (raw.startsWith('/') && !Vars.isAdmin && !isNonAdminAllowedSlash(raw, rawLower)) {
        showNotification("Invalid command.", 'red');
        closeChatInput();
        return;
    }

    if (raw) {
        pushChatHistory(raw);
    }

    executeChatInput(raw, rawLower, isCommand);
    closeChatInput();
}

export function handleChatHistoryNavigate(goUp = true) {
    const input = uiRefs.chatInput;
    if (!input || !uiState.isChatOpen) return false;

    const trimmed = input.value.trim();
    const isBrowsingHistory = chatHistoryIndex !== chatHistory.length;
    const canStartBrowsing = trimmed === '' && chatHistory.length > 0;

    if (!isBrowsingHistory && !canStartBrowsing) return false;

    let nextIndex = isBrowsingHistory ? chatHistoryIndex : chatHistory.length;
    nextIndex += goUp ? -1 : 1;
    nextIndex = Math.max(0, Math.min(chatHistory.length, nextIndex));
    if (nextIndex === chatHistoryIndex) return false;

    chatHistoryIndex = nextIndex;
    const nextValue = chatHistoryIndex === chatHistory.length ? '' : chatHistory[chatHistoryIndex];
    input.value = nextValue;
    const end = input.value.length;
    input.setSelectionRange(end, end);
    updateCommandUI();
    return true;
}
