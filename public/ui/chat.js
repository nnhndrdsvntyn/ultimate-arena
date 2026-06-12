import {
    sendChat,
    sendTpPosCommand,
    sendTpEntCommand,
    sendTpDimCommand,
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
    sendGiveItemCommand,
    sendGrantAdminCommand,
    sendGrantAccountAdminCommand,
    sendInvisCommand,
    sendUninvisCommand,
    sendActivateAbilityCommand,
    sendYetiAbilityCommand,
    sendDuneBehemothAbilityCommand,
    sendInfernoBeastAbilityCommand,
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
    startJoinActionCooldown,
    getMinimapWorldPositionAtClientPos,
    setSimulatedPing
} from '../client.js';
import {
    dataMap,
    WEAPON_IDS,
    getWeaponConfig,
    getWeaponDisplayName,
    isWeaponRank,
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
import { getStoredAdminKey, setStoredAdminKey } from '../admin_key.js';
import { getStoredAccountAuthToken, getStoredAccountUsername } from '../auth/client_auth.js';

const COMMANDS = [{
        name: '/tpent',
        params: '<@p[id=...|all]|@m[id=...|type=...|all]|@s> <@p[id=...|all]|@m[id=...|type=...|all]|@s>'
    },
    {
        name: '/tppos',
        params: '<@p[id=...|all]|@m[id=...|type=...|all]|@s> <x y>'
    },
    {
        name: '/tpcursor',
        params: ''
    },
    {
        name: '/tpcursor_minimap',
        params: ''
    },
    {
        name: '/tpdim',
        params: '<@s|@p[id=...|all]> <main_world|root_dimension|yeti_dimension|dune_dimension|inferno_dimension>'
    },
    {
        name: '/give',
        params: '<@p[id|range|all]|@s> <itemname> [amount]'
    },
    {
        name: '/kill',
        params: '<@p[id=...|all]|@m[id=...|type=...|all]|@s>'
    },
    {
        name: '/spawn',
        params: '<mob|yeti|dune_behemoth|inferno_beast|tree_big|rock_small|rock_medium|rock_big|chest1_4> [x y]'
    },
    {
        name: '/break',
        params: '<@s[tree_big|rock_small|rock_medium|rock_big]> | <@o[chest]> <[id|range|all]> [dropLoot]'
    },
    {
        name: '/setattribute',
        params: '<@p[id=...|all]|@m[id=...|type=...|all]|@s> <attribute> <value>'
    },
    {
        name: '/heal',
        params: '<@p[id=...|all]|@m[id=...|type=...|all]|@s>'
    },
    {
        name: '/damage',
        params: '<@p[id=...|all]|@m[id=...|type=...|all]|@s> <amount[%]>'
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
        name: '/simulateping',
        params: '<number|default>'
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
        name: '/adminacc',
        params: '<accountUsername>'
    },
    {
        name: '/pmonitor',
        params: ''
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
        params: '<on|off>'
    },
    {
        name: '/y',
        params: '<1|2|3|4>'
    },
    {
        name: '/db',
        params: '<1|2|3|4>'
    },
    {
        name: '/ib',
        params: '<1|2|3|4>'
    }
];

const ENTITY_SUGGESTIONS_ALL = ['@s', '@p', '@m', '@o'];
const ENTITY_SUGGESTIONS_PM_S = ['@s', '@p', '@m'];
const ENTITY_SUGGESTIONS_P_S = ['@s', '@p'];
const AGRO_TARGET_SUGGESTIONS = ['@s', '@p'];
const MOB_TYPE_SUGGESTIONS = [
    'chick',
    'pig',
    'cow',
    'hearty',
    'polar_bear',
    'minotaur',
    'root_walker',
    'yeti',
    'dune_behemoth',
    'inferno_beast'
];
const STRUCTURE_SUGGESTIONS = ['@s[tree_big]', '@s[rock_small]', '@s[rock_medium]', '@s[rock_big]'];
const SPAWN_ENTITY_SUGGESTIONS = ['chick', 'pig', 'cow', 'hearty', 'minotaur', 'root_walker', 'yeti', 'dune_behemoth', 'inferno_beast', 'polar_bear', 'tree_big', 'rock_small', 'rock_medium', 'rock_big', 'chest1', 'chest2', 'chest3', 'chest4'];
const STRUCTURE_COMMAND_TYPE_MAP = {
    'rock_small': 7,
    'rock_medium': 2,
    'rock_big': 6,
    'tree_big': 3
};
const ACCESSORY_SUGGESTIONS = ACCESSORY_KEYS.filter(k => k !== 'none');
const SETATTR_SUGGESTIONS = ['invincible', 'speed', 'damage', 'strength', 'maxhealth', 'score', 'radius'];
const SETATTR_PLAYER_SUGGESTIONS = ['invincible', 'speed', 'damage', 'strength', 'maxhealth', 'score', 'radius'];
const SETATTR_MOB_SUGGESTIONS = ['invincible', 'speed', 'damage', 'maxhealth', 'radius'];
const INVINCIBLE_VALUE_SUGGESTIONS = ['true', 'false'];
const SETATTR_COMMON_VALUE_SUGGESTIONS = ['default'];
function normalizeGiveItemToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^(swords|spears|axes|boomerangs)[-_]/, '')
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
}

const SWORD_COMMAND_NAME_TO_RANK = WEAPON_IDS.reduce((acc, rank) => {
    const swordCfg = getWeaponConfig(rank);
    if (!swordCfg) return acc;

    const canonicalName = normalizeGiveItemToken(swordCfg.name);
    if (canonicalName) acc[canonicalName] = rank;

    const displayName = getWeaponDisplayName(rank);
    const shopAlias = normalizeGiveItemToken(displayName);
    if (shopAlias) acc[shopAlias] = rank;

    return acc;
}, {});
const SWORD_COMMAND_NAMES = Object.keys(SWORD_COMMAND_NAME_TO_RANK).sort((a, b) => a.localeCompare(b));
const ITEM_SUGGESTIONS = [
    ...SWORD_COMMAND_NAMES,
    'gold_coin',
    'hearty_essence',
    'skull',
    'golden_skull',
    ...ACCESSORY_SUGGESTIONS
];
const ABILITY_SUGGESTIONS = ['energy_burst', 'lightning_shot', 'poison_blast', 'stamina_boost', 'speed_boost', 'smoke_blast', 'growth_spurt', 'invisibility', 'burst_heal'];
const YETI_ABILITY_SUGGESTIONS = ['1', '2', '3', '4'];
const DUNE_BEHEMOTH_ABILITY_SUGGESTIONS = ['1', '2', '3', '4'];
const INFERNO_BEAST_ABILITY_SUGGESTIONS = ['1', '2', '3', '4'];
const DEBUG_TOGGLE_SUGGESTIONS = ['on', 'off'];
const DIMENSION_SUGGESTIONS = ['main_world', 'root_dimension', 'yeti_dimension', 'dune_dimension', 'inferno_dimension'];
const CHAT_AUTOCOMPLETE_DEBUG = false;
let activeAutocompleteItems = [];
let activeAutocompleteIndex = -1;
let activeAutocompleteListEl = null;
let commandAutocompletePrefix = '';
const CHAT_TEXT_MAX_LENGTH = 50;
const CHAT_HISTORY_LIMIT = 50;
const CHAT_FEED_LIMIT = 100;
const CHAT_INPUT_MIN_HEIGHT = 48;
const CHAT_INPUT_MAX_HEIGHT = 148;
const CHAT_PANEL_MAX_WIDTH = 720;
const CHAT_PANEL_MIN_HEIGHT = 210;
const CHAT_PANEL_MAX_HEIGHT = 340;
const CHAT_PANEL_TOP = 60;
const chatHistory = [];
let chatHistoryIndex = chatHistory.length;
const chatCanvasState = {
    panelRect: null,
    messagesRect: null,
    closeRect: null,
    bodyVisibleHeight: 0,
    contentHeight: 0
};

function getChatPanelLayout() {
    const width = Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(320, LC.width - 32));
    const height = Math.min(CHAT_PANEL_MAX_HEIGHT, Math.max(CHAT_PANEL_MIN_HEIGHT, Math.floor(LC.height * 0.38)));
    const x = Math.floor((LC.width - width) / 2);
    const y = CHAT_PANEL_TOP;
    return { x, y, width, height };
}

function getChatScrollMax() {
    return Math.max(0, chatCanvasState.contentHeight - chatCanvasState.bodyVisibleHeight);
}

function scrollChatFeedToBottom() {
    uiState.chatScrollY = getChatScrollMax();
}

function focusChatInput() {
    const input = uiRefs.chatInput;
    if (!input) return;
    try {
        input.focus({ preventScroll: true });
    } catch (e) {
        input.focus();
    }
    const end = input.value.length;
    try {
        input.setSelectionRange(end, end);
    } catch (e) {
        // Ignore selection errors on unfocused browsers.
    }
}

function syncChatVisibilityState() {
    uiState.isChatOpen = !!(uiState.isChatInputOpen || uiState.isChatHistoryOpen);
}

function updateMobileChatButtonVisibility() {
    if (uiState.isChatInputOpen || uiState.isChatHistoryOpen) hideMobileChatButton();
    else showMobileChatButton();
}

function setChatInputOpen(isOpen, focusInput = false) {
    uiState.isChatInputOpen = !!isOpen;
    syncChatVisibilityState();

    if (!uiRefs.chatInputWrapper) {
        if (!isOpen && !uiState.isChatHistoryOpen) uiState.lastChatCloseTime = performance.now();
        updateMobileChatButtonVisibility();
        return;
    }

    uiRefs.chatInputWrapper.style.display = isOpen ? 'block' : 'none';
    uiRefs.chatInputWrapper.style.pointerEvents = isOpen ? 'auto' : 'none';

    if (isOpen) {
        requestAnimationFrame(() => {
            if (focusInput) {
                focusChatInput();
                setTimeout(() => focusChatInput(), 0);
            }
        });
    } else {
        uiRefs.chatInput?.blur();
        if (!uiState.isChatHistoryOpen) uiState.lastChatCloseTime = performance.now();
    }

    updateMobileChatButtonVisibility();
}

function setChatHistoryOpen(isOpen) {
    uiState.isChatHistoryOpen = !!isOpen;
    syncChatVisibilityState();
    if (isOpen) {
        scrollChatFeedToBottom();
    } else if (!uiState.isChatInputOpen) {
        uiState.lastChatCloseTime = performance.now();
    }
    updateMobileChatButtonVisibility();
}

function clearChatInputValue() {
    if (!uiRefs.chatInput) return;
    uiRefs.chatInput.value = '';
    enforceChatInputLimit();
    resizeChatInput();
    updateCommandUI();
}

export function appendChatMessage(username, message) {
    const safeUsername = String(username || 'Unknown');
    const safeMessage = String(message || '').trim();
    if (!safeMessage) return;

    uiState.chatMessages.push({ username: safeUsername, message: safeMessage });
    if (uiState.chatMessages.length > CHAT_FEED_LIMIT) {
        uiState.chatMessages.splice(0, uiState.chatMessages.length - CHAT_FEED_LIMIT);
    }
    scrollChatFeedToBottom();
}

function hydrateChatFeed() {
    if (uiState.chatMessages.length > CHAT_FEED_LIMIT) {
        uiState.chatMessages.splice(0, uiState.chatMessages.length - CHAT_FEED_LIMIT);
    }
}

export function toggleChatDrawer(forceOpen = null) {
    const myPlayer = ENTITIES.PLAYERS[Vars.myId];
    if (!uiState.isChatHistoryOpen) {
        if (!myPlayer?.isAlive) return;
        if (forceOpen === false) return;
        setChatHistoryOpen(true);
        return;
    }

    if (forceOpen === true) {
        setChatHistoryOpen(true);
        return;
    }
    if (forceOpen === false || forceOpen === null) {
        closeChatDrawer();
    }
}

export function isChatInputActive() {
    return !!(uiState.isChatInputOpen
        && uiRefs.chatInputWrapper
        && uiRefs.chatInputWrapper.style.display !== 'none');
}

export function createChatUI(parent) {
    uiRefs.chatInputWrapper = createEl('div', {
        display: 'none',
        pointerEvents: 'none'
    }, parent, {
        id: 'chat_input_wrapper'
    });

    uiRefs.chatCommandHint = createEl('div', { display: 'none' }, uiRefs.chatInputWrapper, { id: 'chat_command_hint' });
    uiRefs.chatCommandList = createEl('div', { display: 'none' }, uiRefs.chatInputWrapper, { id: 'chat_command_list' });
    uiRefs.chatSuggestList = createEl('div', { display: 'none' }, uiRefs.chatInputWrapper, { id: 'chat_suggest_list' });

    uiRefs.chatInput = createEl('textarea', {
        display: 'block',
        pointerEvents: 'auto',
        boxSizing: 'border-box'
    }, uiRefs.chatInputWrapper, {
        id: 'chatInput',
        placeholder: 'Type a message or command...',
        autocomplete: 'off',
        rows: 1
    });
    uiRefs.chatInput.setAttribute('spellcheck', 'false');
    uiRefs.chatInput.setAttribute('wrap', 'soft');
    enforceChatInputLimit();
    resizeChatInput();
    hydrateChatFeed();

    uiRefs.chatInput.addEventListener('input', () => {
        commandAutocompletePrefix = '';
        normalizeChatInputLineMode();
        expandCommandChainInput();
        enforceChatInputLimit();
        resizeChatInput();
        updateCommandUI();
    });
}

function wrapPlainText(text, maxWidth, font) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (LC.measureText({ text: next, font }).width <= maxWidth) {
            line = next;
        } else {
            if (line) lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function buildChatMessageLines(entry, maxWidth) {
    const username = String(entry?.username || 'Unknown');
    const message = String(entry?.message || '');
    const cachedLayout = entry?._layoutCache;
    if (cachedLayout
        && cachedLayout.maxWidth === maxWidth
        && cachedLayout.username === username
        && cachedLayout.message === message) {
        return cachedLayout.layout;
    }

    const usernameFont = '800 13px Inter';
    const messageFont = '600 13px Inter';
    const prefix = `${username}: `;
    const prefixWidth = LC.measureText({ text: prefix, font: usernameFont }).width;
    const words = message.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        const allowedWidth = lines.length === 0 ? Math.max(10, maxWidth - prefixWidth) : maxWidth;
        if (LC.measureText({ text: candidate, font: messageFont }).width <= allowedWidth) {
            current = candidate;
        } else {
            if (!current) {
                lines.push(word);
            } else {
                lines.push(current);
                current = word;
            }
        }
    }
    if (current || !lines.length) lines.push(current || '');

    const layout = { username, prefix, prefixWidth, lines, usernameFont, messageFont };
    if (entry && typeof entry === 'object') {
        entry._layoutCache = {
            maxWidth,
            username,
            message,
            layout
        };
    }
    return layout;
}

function getAutocompletePreviewItems() {
    const listEl = uiRefs.chatSuggestList?.style.display !== 'none' && uiRefs.chatSuggestList?.children.length
        ? uiRefs.chatSuggestList
        : (uiRefs.chatCommandList?.style.display !== 'none' && uiRefs.chatCommandList?.children.length ? uiRefs.chatCommandList : null);
    if (!listEl) return [];
    return Array.from(listEl.children)
        .map((el) => el.textContent || '')
        .filter(Boolean)
        .slice(0, 4);
}

export function drawChatOverlay() {
    chatCanvasState.panelRect = null;
    chatCanvasState.messagesRect = null;
    chatCanvasState.closeRect = null;
    chatCanvasState.bodyVisibleHeight = 0;
    chatCanvasState.contentHeight = 0;

    if (!uiState.isChatHistoryOpen) return;

    const panel = getChatPanelLayout();
    const headerH = 34;
    const outerPad = 12;
    const bodyX = panel.x + outerPad;
    const bodyY = panel.y + headerH + 8;
    const bodyW = panel.width - outerPad * 2;
    const bodyH = panel.height - headerH - 20;
    const closeSize = 20;
    const closeX = panel.x + panel.width - closeSize - 12;
    const closeY = panel.y + 8;

    chatCanvasState.panelRect = panel;
    chatCanvasState.messagesRect = { x: bodyX, y: bodyY, width: bodyW, height: bodyH };
    chatCanvasState.closeRect = { x: closeX, y: closeY, width: closeSize, height: closeSize };

    LC.drawRect({
        pos: [panel.x, panel.y],
        size: [panel.width, panel.height],
        color: 'rgba(10, 16, 24, 0.58)',
        stroke: 'rgba(255,255,255,0.12)',
        strokeWidth: 2,
        cornerRadius: 18
    });

    LC.drawText({
        text: 'CHAT',
        pos: [panel.x + 16, panel.y + 23],
        font: '800 13px Inter',
        color: 'rgba(255,255,255,0.78)',
        textAlign: 'left'
    });

    LC.drawRect({
        pos: [closeX, closeY],
        size: [closeSize, closeSize],
        color: 'rgba(255,255,255,0.08)',
        cornerRadius: 6
    });
    LC.drawText({
        text: '×',
        pos: [closeX + closeSize / 2, closeY + 15],
        font: '800 16px Inter',
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center'
    });

    LC.drawRect({
        pos: [bodyX, bodyY],
        size: [bodyW, bodyH],
        color: 'rgba(255,255,255,0.04)',
        stroke: 'rgba(255,255,255,0.08)',
        strokeWidth: 1,
        cornerRadius: 12
    });

    const innerPad = 10;
    const messageX = bodyX + innerPad;
    const messageYStart = bodyY + innerPad;
    const messageW = bodyW - innerPad * 2 - 6;
    const lineHeight = 18;
    let cursorY = messageYStart;
    const entries = uiState.chatMessages.map((entry) => buildChatMessageLines(entry, messageW));
    chatCanvasState.contentHeight = entries.reduce((sum, entry) => sum + (entry.lines.length * lineHeight) + 8, 0);
    chatCanvasState.bodyVisibleHeight = Math.max(0, bodyH - innerPad * 2);
    const scrollMax = getChatScrollMax();
    uiState.chatScrollY = Math.max(0, Math.min(scrollMax, uiState.chatScrollY || 0));
    const scrollY = uiState.chatScrollY;

    LC.ctx.save();
    LC.ctx.beginPath();
    LC.ctx.rect(bodyX + 1, bodyY + 1, bodyW - 2, bodyH - 2);
    LC.ctx.clip();

    cursorY -= scrollY;
    for (const entry of entries) {
        const blockHeight = (entry.lines.length * lineHeight) + 8;
        if (cursorY + blockHeight >= bodyY && cursorY <= bodyY + bodyH) {
            LC.drawText({
                text: entry.username,
                pos: [messageX, cursorY + 14],
                font: entry.usernameFont,
                color: '#ffffff',
                textAlign: 'left'
            });

            for (let i = 0; i < entry.lines.length; i++) {
                LC.drawText({
                    text: i === 0 ? entry.lines[i] : entry.lines[i],
                    pos: [messageX + (i === 0 ? entry.prefixWidth : 0), cursorY + 14 + (i * lineHeight)],
                    font: entry.messageFont,
                    color: 'rgba(255,255,255,0.88)',
                    textAlign: 'left'
                });
            }
        }
        cursorY += blockHeight;
    }
    LC.ctx.restore();

    if (scrollMax > 0) {
        const trackX = bodyX + bodyW - 6;
        LC.drawRect({
            pos: [trackX, bodyY + 4],
            size: [3, bodyH - 8],
            color: 'rgba(255,255,255,0.08)',
            cornerRadius: 3
        });
        const thumbH = Math.max(24, (chatCanvasState.bodyVisibleHeight * chatCanvasState.bodyVisibleHeight) / Math.max(1, chatCanvasState.contentHeight));
        const thumbTravel = Math.max(0, bodyH - 8 - thumbH);
        const thumbY = bodyY + 4 + ((scrollY / scrollMax) * thumbTravel);
        LC.drawRect({
            pos: [trackX, thumbY],
            size: [3, thumbH],
            color: 'rgba(255,255,255,0.34)',
            cornerRadius: 3
        });
    }

}

export function isChatCanvasInteractiveAtClientPos(clientX, clientY) {
    if (!uiState.isChatHistoryOpen || !chatCanvasState.panelRect) return false;
    const { x, y } = LC.clientToLogical(clientX, clientY);
    const panel = chatCanvasState.panelRect;
    return x >= panel.x && x <= panel.x + panel.width && y >= panel.y && y <= panel.y + panel.height;
}

export function handleChatCanvasPointerDown(clientX, clientY) {
    if (!isChatCanvasInteractiveAtClientPos(clientX, clientY)) return false;
    const { x, y } = LC.clientToLogical(clientX, clientY);
    const closeRect = chatCanvasState.closeRect;
    if (closeRect && x >= closeRect.x && x <= closeRect.x + closeRect.width && y >= closeRect.y && y <= closeRect.y + closeRect.height) {
        closeChatDrawer();
        return true;
    }
    return true;
}

export function handleChatCanvasWheel(clientX, clientY, deltaY) {
    if (!isChatCanvasInteractiveAtClientPos(clientX, clientY)) return false;
    const scrollMax = getChatScrollMax();
    if (scrollMax <= 0) return true;
    uiState.chatScrollY = Math.max(0, Math.min(scrollMax, uiState.chatScrollY + (deltaY * 0.8)));
    return true;
}

function isSlashPrefixedInput(raw) {
    return (raw || '').trimStart().startsWith('/');
}

function enforceChatInputLimit() {
    if (!uiRefs.chatInput) return;
    const value = uiRefs.chatInput.value || '';
    if (!isSlashPrefixedInput(value) && value.length > CHAT_TEXT_MAX_LENGTH) {
        uiRefs.chatInput.value = value.slice(0, CHAT_TEXT_MAX_LENGTH);
    }
}

function resizeChatInput() {
    const input = uiRefs.chatInput;
    if (!input) return;
    input.style.height = `${CHAT_INPUT_MIN_HEIGHT}px`;
    const nextHeight = Math.max(CHAT_INPUT_MIN_HEIGHT, Math.min(CHAT_INPUT_MAX_HEIGHT, input.scrollHeight || CHAT_INPUT_MIN_HEIGHT));
    input.style.height = `${nextHeight}px`;
}

function normalizeChatInputLineMode() {
    const input = uiRefs.chatInput;
    if (!input) return;
    const raw = input.value || '';
    if (isSlashPrefixedInput(raw) || !/[\r\n]/.test(raw)) return;

    const selectionStart = input.selectionStart ?? raw.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const beforeStart = raw.slice(0, selectionStart);
    const beforeEnd = raw.slice(0, selectionEnd);
    input.value = raw.replace(/[\r\n]+/g, ' ');

    const nextStart = beforeStart.replace(/[\r\n]+/g, ' ').length;
    const nextEnd = beforeEnd.replace(/[\r\n]+/g, ' ').length;
    try {
        input.setSelectionRange(nextStart, nextEnd);
    } catch (e) {
        // Ignore selection errors from transient browser state.
    }
}

function expandCommandChainInput() {
    const input = uiRefs.chatInput;
    if (!input) return;
    const raw = input.value || '';
    if (!raw.includes(';')) return;
    if (!isSlashPrefixedInput(raw)) return;

    const selectionStart = input.selectionStart ?? raw.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const beforeStart = raw.slice(0, selectionStart);
    const beforeEnd = raw.slice(0, selectionEnd);
    const expanded = raw.replace(/;[ \t]*(?!\r?\n)/g, ';\n');
    if (expanded === raw) return;

    input.value = expanded;
    const nextStart = beforeStart.replace(/;[ \t]*(?!\r?\n)/g, ';\n').length;
    const nextEnd = beforeEnd.replace(/;[ \t]*(?!\r?\n)/g, ';\n').length;
    try {
        input.setSelectionRange(nextStart, nextEnd);
    } catch (e) {
        // Ignore selection errors from transient browser state.
    }
}

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

function getMobSelectorSuggestions(currentLower) {
    const token = (currentLower || '').toLowerCase();
    if (!token.startsWith('@m[')) return [];

    const inner = token.slice(3);
    if (!inner) return ['type'];
    if ('type'.startsWith(inner)) return ['type'];
    if (inner === 'type' || inner === 'type=') return MOB_TYPE_SUGGESTIONS.slice();
    if (inner.startsWith('type=')) {
        const typed = inner.slice(5);
        return filterSuggestionPool(MOB_TYPE_SUGGESTIONS, typed);
    }
    return [];
}

function getActiveChainSegment(raw, cursorPos = null) {
    const safeRaw = raw || '';
    const pos = Number.isFinite(cursorPos) ? Math.max(0, Math.min(safeRaw.length, cursorPos)) : safeRaw.length;
    const beforeCursor = safeRaw.slice(0, pos);
    const semicolonIdx = beforeCursor.lastIndexOf(';');
    const newlineIdx = Math.max(beforeCursor.lastIndexOf('\n'), beforeCursor.lastIndexOf('\r'));
    const splitIdx = Math.max(semicolonIdx, newlineIdx);
    if (splitIdx === -1) {
        return {
            prefix: '',
            segment: safeRaw.slice(0, pos),
            suffix: safeRaw.slice(pos),
            hasChainPrefix: false
        };
    }
    return {
        prefix: safeRaw.slice(0, splitIdx + 1),
        segment: safeRaw.slice(splitIdx + 1, pos),
        suffix: safeRaw.slice(pos),
        hasChainPrefix: true
    };
}

function normalizeActiveSegmentForCommandUI(raw, cursorPos = null) {
    const active = getActiveChainSegment(raw, cursorPos);
    const trimmedLeft = active.segment.trimStart();
    if (active.hasChainPrefix && trimmedLeft && !trimmedLeft.startsWith('/')) {
        const leading = active.segment.slice(0, active.segment.length - trimmedLeft.length);
        return {
            ...active,
            segmentForCommand: `${leading}/${trimmedLeft}`
        };
    }
    return {
        ...active,
        segmentForCommand: active.segment
    };
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
    const {
        prefix,
        segment,
        segmentForCommand
    } = normalizeActiveSegmentForCommandUI(raw, uiRefs.chatInput.selectionStart ?? raw.length);
    const value = segmentForCommand.trim().toLowerCase();
    const editingCommandName = isEditingCommandName(segmentForCommand);
    const commandFilterValue = (commandAutocompletePrefix && editingCommandName)
        ? commandAutocompletePrefix
        : getCommandToken(segmentForCommand);

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
                className: 'chat_command_item',
                textContent: cmd.name
            });
            item.onclick = () => {
                replaceCommandName(cmd.name);
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
        updateSuggestions(segmentForCommand, exact || (matches.length === 1 ? matches[0] : null));
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
            suggestions = getMobSelectorSuggestions(currentLower);
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
            if (!currentLower) {
                suggestions = ENTITY_SUGGESTIONS_PM_S;
            } else if (currentLower.startsWith('@m[')) {
                suggestions = getMobSelectorSuggestions(currentLower);
            } else {
                suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_PM_S, currentLower);
            }
        }
    } else if (activeCommand?.name === '/tpdim') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_P_S, currentLower);
        } else if (tokenIndex === 2) {
            suggestions = filterSuggestionPool(DIMENSION_SUGGESTIONS, currentLower);
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
                suggestions = getMobSelectorSuggestions(currentLower);
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
                suggestions = getMobSelectorSuggestions(currentLower);
            } else {
                suggestions = filterSuggestionPool(ENTITY_SUGGESTIONS_PM_S, currentLower);
            }
        } else if (tokenIndex === 2) {
            const isMobSelector = entityToken.startsWith('@m[');
            const pool = isMobSelector ? SETATTR_MOB_SUGGESTIONS : SETATTR_PLAYER_SUGGESTIONS;
            suggestions = filterSuggestionPool(pool, currentLower);
        } else if (tokenIndex >= 3) {
            const attrToken = (tokens[2] || '').toLowerCase();
            if (attrToken === 'invincible') {
                suggestions = filterSuggestionPool([...INVINCIBLE_VALUE_SUGGESTIONS, ...SETATTR_COMMON_VALUE_SUGGESTIONS], currentLower);
            } else {
                suggestions = filterSuggestionPool(SETATTR_COMMON_VALUE_SUGGESTIONS, currentLower);
            }
        }
        if (tokenIndex === 2 && suggestions.length === 0) {
            const isMobSelector = entityToken.startsWith('@m[');
            suggestions = isMobSelector ? SETATTR_MOB_SUGGESTIONS : SETATTR_PLAYER_SUGGESTIONS;
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
            suggestions = filterSuggestionPool(DEBUG_TOGGLE_SUGGESTIONS, currentLower);
        }
    } else if (activeCommand?.name === '/y') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(YETI_ABILITY_SUGGESTIONS, currentLower);
        }
    } else if (activeCommand?.name === '/db') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(DUNE_BEHEMOTH_ABILITY_SUGGESTIONS, currentLower);
        }
    } else if (activeCommand?.name === '/ib') {
        if (tokenIndex === 1) {
            suggestions = filterSuggestionPool(INFERNO_BEAST_ABILITY_SUGGESTIONS, currentLower);
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
                className: 'chat_command_item',
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
    if (/^@([pm])\[(?:id=\d+(?:-\d+)?|all)\]$/.test(tokenLower)) return true;
    return false;
}

function replaceCurrentToken(replacement, appendSpace = false) {
    const raw = uiRefs.chatInput.value;
    const cursor = uiRefs.chatInput.selectionStart ?? raw.length;
    const { prefix, segment, suffix } = getActiveChainSegment(raw, cursor);
    const match = segment.match(/^(.*?)(\S*)$/);
    const before = match ? match[1] : '';
    const currentToken = match ? (match[2] || '') : '';
    let resolvedReplacement = replacement;
    const replacementLower = (replacement || '').toLowerCase();
    const currentLower = currentToken.toLowerCase();
    if (currentLower.startsWith('@m[')) {
        if (replacementLower === 'type') {
            resolvedReplacement = '@m[type=';
        } else if (MOB_TYPE_SUGGESTIONS.includes(replacementLower) && currentLower.startsWith('@m[type=')) {
            resolvedReplacement = `@m[type=${replacementLower}]`;
        }
    }
    const nextValue = `${prefix}${before}${resolvedReplacement}${appendSpace ? ' ' : ''}${suffix || ''}`;
    const nextCursor = (nextValue.length - (suffix || '').length);
    uiRefs.chatInput.value = nextValue;
    uiRefs.chatInput.setSelectionRange(nextCursor, nextCursor);
    resizeChatInput();
}

function replaceCommandName(replacement, appendSpace = false) {
    const raw = uiRefs.chatInput.value;
    const cursor = uiRefs.chatInput.selectionStart ?? raw.length;
    const { prefix, segment, suffix } = getActiveChainSegment(raw, cursor);
    const parts = segment.match(/^(\s*)(\/?\S*)(.*)$/);
    if (!parts) {
        const nextValue = `${prefix}${replacement}${appendSpace ? ' ' : ''}${suffix || ''}`;
        const nextCursor = (nextValue.length - (suffix || '').length);
        uiRefs.chatInput.value = nextValue;
        uiRefs.chatInput.setSelectionRange(nextCursor, nextCursor);
        resizeChatInput();
        return;
    }
    const [, leadingWs, , rest] = parts;
    const nextValue = `${prefix}${leadingWs}${replacement}${appendSpace ? ' ' : ''}${rest}${suffix || ''}`;
    const nextCursor = (nextValue.length - (suffix || '').length);
    uiRefs.chatInput.value = nextValue;
    uiRefs.chatInput.setSelectionRange(nextCursor, nextCursor);
    resizeChatInput();
}

export function handleChatAutocompleteTab(reverse = false) {
    const input = uiRefs.chatInput;
    if (!input || !uiState.isChatInputOpen) return false;
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
    updateCommandUI();
    return true;
}

export function handleChatAutocompleteMoveSelection(reverse = false) {
    const input = uiRefs.chatInput;
    if (!input || !uiState.isChatInputOpen) return false;
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
    // Parse @s, @p[id=5], @m[id=1-100], @m[type=cow], @p[all], @m[all], etc.
    // Returns { type: 1|2, ids: [ids...] }

    if (/^@s$/i.test(entityToken)) {
        return {
            type: 1,
            ids: [Vars.myId]
        };
    }

    // Handle [type=...] syntax for mobs
    const typeMatch = entityToken.match(/^@m\[type=([a-z_]+)\]$/i);
    if (typeMatch) {
        const typeName = typeMatch[1].toLowerCase();
        const typeMap = {
            chick: 1,
            pig: 2,
            cow: 3,
            hearty: 4,
            'polar_bear': 5,
            minotaur: 6,
            'root_walker': 7,
            yeti: 8,
            'dune_behemoth': 16,
            'inferno_beast': 17
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

    const match = entityToken.match(/^@([pm])\[id=(\d+)(?:-(\d+))?\]$/i);
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

const ENTITY_TOKEN_RE = '@s|@p\\[(?:id=\\d+(?:-\\d+)?|all)\\]|@m\\[(?:id=\\d+(?:-\\d+)?|all|type=[a-z_]+)\\]';
const PLAYER_ENTITY_TOKEN_RE = '@s|@p\\[(?:id=\\d+(?:-\\d+)?|all)\\]';

function isSingleEntitySelection(parsed) {
    if (!parsed || !Array.isArray(parsed.ids)) return false;
    if (parsed.isFiltered) return parsed.ids.length === 1;
    return parsed.ids.length === 1;
}

function showChatParamError() {
    showNotification("Make sure to write the parameters properly.", 'red');
}

function hideMobileChatButton() {
    return;
}

function showMobileChatButton() {
    return;
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
    enforceChatInputLimit();
    resizeChatInput();
    updateCommandUI();
    setChatInputOpen(true, true);
    resetChatHistoryNavigation();
    scrollChatFeedToBottom();
}

function openChatHistoryOnly() {
    stopAllMovementForChat();
    updateCommandUI();
    setChatHistoryOpen(true);
    resetChatHistoryNavigation();
    scrollChatFeedToBottom();
}

export function openChatInputOnly() {
    openChatInput();
}

export function closeChatInput() {
    if (!uiRefs.chatInput || !uiRefs.chatInputWrapper) {
        uiState.isChatInputOpen = false;
        syncChatVisibilityState();
        if (!uiState.isChatHistoryOpen) uiState.lastChatCloseTime = performance.now();
        updateMobileChatButtonVisibility();
        return;
    }
    clearChatInputValue();
    setChatInputOpen(false);
    resetChatHistoryNavigation();
    updateCommandUI();
}

export function closeChatDrawer() {
    if (!uiRefs.chatInput || !uiRefs.chatInputWrapper) {
        uiState.isChatHistoryOpen = false;
        syncChatVisibilityState();
        if (!uiState.isChatInputOpen) uiState.lastChatCloseTime = performance.now();
        updateMobileChatButtonVisibility();
        return;
    }
    setChatHistoryOpen(false);
    resetChatHistoryNavigation();
    updateCommandUI();
}

function tryJoinFromLogin(homeUsrnInput) {
    if (document.activeElement !== homeUsrnInput) return;
    if (performance.now() < (Vars.joinActionLockedUntil || 0)) return;
    if (Vars.lastDiedTime + JOIN_ACTION_COOLDOWN_MS < performance.now()) {
        startJoinActionCooldown();
        const username = getStoredAccountUsername() || homeUsrnInput.value || localStorage.username;
        ws.send(encodeUsername(username, getStoredAccountAuthToken(), CURRENT_WORLD));
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

function splitCommandChain(raw) {
    return (raw || '')
        .split(/[;\r\n]+/)
        .map(part => part.trim())
        .filter(Boolean);
}

function normalizeChainedCommandToken(token) {
    if (!token) return '';
    return token.startsWith('/') ? token : `/${token}`;
}

function getCursorWorldPosition() {
    const { x: screenX, y: screenY } = LC.clientToLogical(Vars.mouseX, Vars.mouseY);
    const centerX = LC.width / 2;
    const centerY = LC.height / 2;
    const worldX = camera.x + centerX + ((screenX - centerX) / Math.max(0.001, LC.zoom));
    const worldY = camera.y + centerY + ((screenY - centerY) / Math.max(0.001, LC.zoom));
    return {
        x: Math.max(0, Math.min(65535, Math.round(worldX))),
        y: Math.max(0, Math.min(65535, Math.round(worldY)))
    };
}

function handleActivateAbility(raw) {
    const activateAbilityMatch = raw.match(/^\/activateability\s+([a-z_]+)(?:\s+(\d+))?$/i);
    if (!activateAbilityMatch) return false;

    if (Vars.isAdmin) {
        const ability = activateAbilityMatch[1].toLowerCase();
        const durationSeconds = activateAbilityMatch[2] ? Math.max(1, Math.min(65535, parseInt(activateAbilityMatch[2], 10))) : null;
        if (ability === 'lightning_shot') {
            const cursorWorld = getCursorWorldPosition();
            sendActivateAbilityCommand(ability, { targetX: cursorWorld.x, targetY: cursorWorld.y });
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

function handleTpCursor(raw) {
    if (!/^\/tpcursor$/i.test(raw)) return false;

    if (!Vars.isAdmin) return true;

    const cursorWorld = getCursorWorldPosition();
    sendTpPosCommand(1, Vars.myId, Vars.myId, cursorWorld.x, cursorWorld.y);
    return true;
}

function handleTpCursorMinimap(raw) {
    if (!/^\/tpcursor_minimap$/i.test(raw)) return false;

    if (!Vars.isAdmin) return true;

    const minimapWorld = getMinimapWorldPositionAtClientPos(Vars.mouseX, Vars.mouseY);
    if (!minimapWorld) {
        showNotification("Your cursor needs to be on the minimap to run this command", 'red');
        return true;
    }

    sendTpPosCommand(1, Vars.myId, Vars.myId, minimapWorld.x, minimapWorld.y);
    return true;
}

function handleGive(raw) {
    const giveTokens = raw.split(/\s+/);
    if (giveTokens[0]?.toLowerCase() !== '/give' || giveTokens.length < 3) return false;

    const parsed = parseEntityRange(giveTokens[1]);
    let itemName = normalizeGiveItemToken(giveTokens[2] || '');
    const amount = Math.max(1, parseInt(giveTokens[3]) || 1);
    const normalizedItemName = itemName.replace(/_/g, '-');
    const swordRank = SWORD_COMMAND_NAME_TO_RANK[itemName] || 0;

    if (!parsed) {
        showChatParamError();
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);

    if (isWeaponRank(swordRank)) {
        for (let i = 0; i < amount; i++) {
            sendSetAttrCommand(parsed.type, startId, endId, 4, swordRank);
        }
        return true;
    }

    if (itemName === 'gold_coin') {
        sendSetAttrCommand(parsed.type, startId, endId, 8, amount);
        return true;
    }

    const objectType = dataMap.OBJECT_TYPE_BY_KEY?.[itemName] || dataMap.OBJECT_TYPE_BY_KEY?.[normalizedItemName] || 0;
    if (objectType) {
        sendGiveItemCommand(parsed.type, startId, endId, objectType, amount);
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
    const spawnMatch = raw.match(/^\/spawn\s+([a-z0-9_\-]+)(?:\s+(-?\d+)\s+(-?\d+))?$/i);
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
    if (!isSingleEntitySelection(parsed2)) {
        showChatParamError();
        return true;
    }

    const targetId = parsed2.ids[0];

    if (parsed1.isFiltered && parsed1.type === 2 && parsed1.mobType && !parsed2.isFiltered && parsed2.type === 1) {
        sendMobTypeCommand(2, parsed1.mobType, {
            targetType: parsed2.type,
            targetId
        });
        return true;
    }

    if (parsed1.isFiltered && parsed2.isFiltered) {
        parsed1.ids.forEach(id1 => {
            sendTpEntCommand(parsed1.type, id1, id1, parsed2.type, targetId, targetId);
        });
        return true;
    }

    if (parsed1.isFiltered) {
        parsed1.ids.forEach(id1 => {
            sendTpEntCommand(parsed1.type, id1, id1, parsed2.type, targetId, targetId);
        });
        return true;
    }

    const {
        startId: startId1,
        endId: endId1
    } = getIdBounds(parsed1);
    sendTpEntCommand(parsed1.type, startId1, endId1, parsed2.type, targetId, targetId);
    return true;
}

function handleTpDim(raw) {
    const tpdimMatch = raw.match(new RegExp(`^\\/tpdim\\s+(${PLAYER_ENTITY_TOKEN_RE})\\s+(main_world|root_dimension|yeti_dimension|dune_dimension|inferno_dimension)$`, 'i'));
    if (!tpdimMatch) return false;

    const parsed = parseEntityRange(tpdimMatch[1]);
    const dimensionTarget = tpdimMatch[2].toLowerCase();
    if (!parsed || parsed.type !== 1) {
        sendChat(raw);
        return true;
    }

    if (parsed.isFiltered) {
        parsed.ids.forEach(id => sendTpDimCommand(parsed.type, id, id, dimensionTarget));
        return true;
    }

    const {
        startId,
        endId
    } = getIdBounds(parsed);
    sendTpDimCommand(parsed.type, startId, endId, dimensionTarget);
    return true;
}

function handleBreak(raw) {
    const chestMatch = raw.match(/^\/break\s+@o\[(\w+)\]\s+\[([\d\-]+|all)\](?:\s+(dropLoot))?$/i);
    const structMatch = raw.match(/^\/break\s+@s\[(tree_big|rock_small|rock_medium|rock_big)\]$/i);
    if (!chestMatch && !structMatch) return false;

    if (structMatch) {
        if (!Vars.isAdmin) return true;
        const key = structMatch[1].toLowerCase();
        sendBreakStructureCommand(STRUCTURE_COMMAND_TYPE_MAP[key] || 0);
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
    const tokens = raw.trim().split(/\s+/);
    if (tokens.length < 4 || tokens[0].toLowerCase() !== '/setattribute') return false;

    const parsed = parseEntityRange(tokens[1]);
    const attributeName = (tokens[2] || '').toLowerCase();
    const rawValue = tokens.slice(3).join(' ').trim();
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
        radius: 9,
        maxhealth: 6
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

function handleSimulatePing(raw) {
    const match = raw.match(/^\/simulateping\s+(\d+(?:\.\d+)?|default)$/i);
    if (!match) return false;

    if (!Vars.isAdmin) {
        showNotification("Invalid command.", 'red');
        return true;
    }

    const value = match[1].toLowerCase();
    if (value === 'default') {
        setSimulatedPing(0);
        showNotification('Simulated ping disabled.', '#2ecc71');
        return true;
    }

    const pingMs = Math.max(0, Math.min(10000, Math.round(parseFloat(value))));
    setSimulatedPing(pingMs);
    showNotification(`Simulated ping: ${pingMs}ms`, '#eab308');
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

function handleAdminAcc(raw) {
    const adminAccMatch = raw.match(/^\/adminacc\s+([A-Za-z0-9_\-]{1,15})$/i);
    if (!adminAccMatch) return false;

    if (!Vars.isAdmin) return true;

    const accountUsername = String(adminAccMatch[1] || '').trim();
    if (!accountUsername) {
        showChatParamError();
        return true;
    }

    sendGrantAccountAdminCommand(accountUsername);
    return true;
}

function handlePmonitor(raw) {
    if (!/^\/pmonitor$/i.test(raw)) return false;

    if (!Vars.isAdmin) return true;

    const accountToken = getStoredAccountAuthToken();
    const storedKey = getStoredAdminKey();
    const fallbackKey = (uiState.tempAdminKey || '').trim();
    const adminKey = storedKey || fallbackKey;
    if (!accountToken && !adminKey) {
        showNotification('No admin session or saved admin key is available for /pmonitor.', 'red');
        return true;
    }

    if (!storedKey && fallbackKey) {
        setStoredAdminKey(fallbackKey);
    }

    if (!window.open('./pmonitor', '_blank', 'noopener')) {
        showNotification('Pop-up blocked. Allow pop-ups for this site and try again.', 'red');
        return true;
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
        if (mob.type !== 3 && mob.type !== 5 && mob.type !== 6 && mob.type !== 7) return;
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
    const debugMatch = raw.match(/^\/debug\s+(on|off)$/i);
    if (!debugMatch) return false;

    const nextValue = debugMatch[1].toLowerCase() === 'on';
    Settings.debugMode = nextValue;
    showNotification(`Debug mode ${nextValue ? 'enabled' : 'disabled'}.`, nextValue ? '#2ecc71' : '#eab308');
    return true;
}

function handleYetiAbility(raw) {
    const match = raw.match(/^\/y\s+([1-4])$/i);
    if (!match) return false;
    if (!Vars.isAdmin) {
        showNotification("Invalid command.", 'red');
        return true;
    }
    sendYetiAbilityCommand(parseInt(match[1], 10));
    return true;
}

function handleDuneBehemothAbility(raw) {
    const match = raw.match(/^\/db\s+([1-4])$/i);
    if (!match) return false;
    if (!Vars.isAdmin) {
        showNotification("Invalid command.", 'red');
        return true;
    }
    sendDuneBehemothAbilityCommand(parseInt(match[1], 10));
    return true;
}

function handleInfernoBeastAbility(raw) {
    const match = raw.match(/^\/ib\s+([1-4])$/i);
    if (!match) return false;
    if (!Vars.isAdmin) {
        showNotification("Invalid command.", 'red');
        return true;
    }
    sendInfernoBeastAbilityCommand(parseInt(match[1], 10));
    return true;
}

function executeChatInput(raw, rawLower, isCommand) {
    if (handleActivateAbility(raw)) return;
    if (handleDebug(raw)) return;
    if (handleYetiAbility(raw)) return;
    if (handleDuneBehemothAbility(raw)) return;
    if (handleInfernoBeastAbility(raw)) return;
    if (handleGive(raw)) return;
    if (handleKill(raw)) return;
    if (handleSpawn(raw)) return;
    if (handleTpCursorMinimap(raw)) return;
    if (handleTpCursor(raw)) return;
    if (handleTpPos(raw)) return;
    if (handleTpEnt(raw)) return;
    if (handleTpDim(raw)) return;
    if (handleBreak(raw)) return;
    if (handleSetAttribute(raw)) return;
    if (handleHeal(raw)) return;
    if (handleDamage(raw)) return;
    if (handleRov(raw)) return;
    if (handleSimulatePing(raw)) return;
    if (handleAdmin(raw)) return;
    if (handleAdminAcc(raw)) return;
    if (handlePmonitor(raw)) return;
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
    if (!uiState.isChatInputOpen) {
        if (myPlayer?.isAlive) {
            openChatInputOnly();
            return;
        }

        if (!myPlayer?.isAlive) {
            tryJoinFromLogin(homeUsrnInput);
            return;
        }
    }

    if (!uiState.isChatInputOpen) return;

    const raw = uiRefs.chatInput.value.trim();
    if (!raw) {
        closeChatInput();
        return;
    }
    const rawLower = raw.toLowerCase();

    pushChatHistory(raw);

    if (raw.startsWith('/')) {
        const chain = splitCommandChain(raw).map(normalizeChainedCommandToken);
        for (let i = 0; i < chain.length; i++) {
            const cmdRaw = chain[i];
            const cmdLower = cmdRaw.toLowerCase();
            const matchedCmd = COMMANDS.find(cmd => cmdLower.startsWith(cmd.name));
            const isCommand = !!matchedCmd;

            if (!Vars.isAdmin && !isNonAdminAllowedSlash(cmdRaw, cmdLower)) {
                showNotification("Invalid command.", 'red');
                break;
            }
            executeChatInput(cmdRaw, cmdLower, isCommand);
        }
        clearChatInputValue();
        uiRefs.chatInput?.focus();
        closeChatInput();
        return;
    }

    const matchedCmd = COMMANDS.find(cmd => rawLower.startsWith(cmd.name));
    const isCommand = !!matchedCmd;
    executeChatInput(raw, rawLower, isCommand);
    clearChatInputValue();
    uiRefs.chatInput?.focus();
    closeChatInput();
}

export function handleChatHistoryNavigate(goUp = true) {
    const input = uiRefs.chatInput;
    if (!input || !uiState.isChatInputOpen) return false;

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
