import { ENTITIES } from '../game.js';
import { Vars, LC, startJoinActionCooldown, PAUSE_SPECTATE_START_DELAY_MS, playUITapSound, playWheelClickSound, getDoubleXpStatusText, formatCountdownMs } from '../client.js';
import { sendAccountLeaderboardRefreshPacket, sendAuthSessionPacket, sendHomeWheelSpinRequestPacket, sendPausePacket } from '../helpers.js';
import { createEl } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { isMobile, HOTBAR_CONFIG, UPDATES_LOG, version } from './config.js';
import { getCurrentAuthenticatedAccountNameStyle } from '../auth/client_auth.js';
import { getAccountWheelSpinState, getStoredAccountAuthToken, hasStoredAccountSession } from '../auth/client_auth.js';
import { showNotification } from './notifications.js';

const DID_YOU_KNOW_HINTS = [
    "There are are various weapon types with different combat mechanics!",
    "You can buy accessories in the shop... some have special abilities!",
    "You automatically pick coins up.",
    "You can drop swords and accessories by dragging them out of your inventory or by pressing the Q key!",
    "You can hide under trees!",
    "You can open and close your inventory by pressing the I key!",
    "You can use the golden skull to open the portal to a boss fight dimension!",
    "If you want to level up quicker you can trade your coins for XP in the shop!",
    "You can sell swords you no longer need in the shop to earn coins.",
    "The Minotaur miniboss drops a ton of coins and also maybe a sword, an accessory... or both!",
];
const HOME_INFO_TABS = ['leaderboards', 'updates'];
const HOME_LEADERBOARD_SCOPES = ['daily', 'weekly', 'monthly'];
const HOME_WHEEL_SEGMENT_RARITIES = [
    { color: '#6ee7b7', rarity: 'Common', chance: 35, reward: '500 coins' },
    { color: '#34d399', rarity: 'Uncommon', chance: 22, reward: '2x XP (3 MIN)' },
    { color: '#38bdf8', rarity: 'Rare', chance: 15, reward: '50 Hearty Essence' },
    { color: '#60a5fa', rarity: 'Elite', chance: 12, reward: '10 Golden Skulls' },
    { color: '#ffd166', rarity: 'Epic', chance: 7, reward: 'A random Rank 12 Weapon' },
    { color: '#ff9f43', rarity: 'Mythic', chance: 5, reward: '5000 coins' },
    { color: '#ec4899', rarity: 'Ultra', chance: 3, reward: '+15 Levels' },
    { color: '#ff5f57', rarity: 'Legendary', chance: 1, reward: 'All Rank 12 Weapons' }
];
const HOME_WHEEL_SEGMENT_COUNT = HOME_WHEEL_SEGMENT_RARITIES.length;
const homeWheelState = {
    spinning: false,
    angle: 0,
    angularVelocity: 0,
    lastFrameTime: 0,
    rafId: 0,
    startAngle: 0,
    targetAngle: 0,
    targetIndex: -1,
    targetLabel: '',
    spinStartTime: 0,
    spinDuration: 0,
    lastSegmentIndex: 0,
    resultText: 'Click wheel to spin',
    hoverText: '',
    wheelSpinsRemaining: 0,
    wheelSpinsResetAtSec: 0,
    accessTimerId: 0,
    lastRefreshRequestedResetAtSec: 0
};
const homeLeaderboardState = {
    activeScope: 'daily',
    loading: true,
    loaded: false,
    data: {
        daily: [],
        weekly: [],
        monthly: []
    }
};
const hudVisibilityCache = { key: '' };
const mobileUiStateCache = { show: null };

function getHomeWheelElement() {
    return uiRefs.homeWheel || document.getElementById('home_wheel');
}

function getHomeAccountPanel() {
    return uiRefs.homeAccountPanel || document.getElementById('auth_panel');
}

function openHomeAccountPanel() {
    const trigger = document.getElementById('home_account_toggle');
    if (trigger) {
        trigger.click();
        return true;
    }

    const panel = getHomeAccountPanel();
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    const backdrop = document.getElementById('home_overlay_backdrop');
    if (!panel || !homeScreen) return false;
    homeScreen.classList.add('home_overlay_open');
    panel.classList.add('is_open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop?.classList.add('is_open');
    return true;
}

function getWheelResetRemainingMs(now = Date.now()) {
    const resetAtSec = Math.max(0, Math.floor(Number(homeWheelState.wheelSpinsResetAtSec) || 0));
    if (resetAtSec <= 0) return 0;
    return Math.max(0, (resetAtSec * 1000) - now);
}

function updateHomeWheelStatusUi() {
    const loggedIn = hasStoredAccountSession();
    const wheelState = getAccountWheelSpinState();
    const profileLoaded = !!wheelState.loaded;
    homeWheelState.wheelSpinsRemaining = Math.max(0, Math.floor(Number(wheelState.spinsRemaining) || 0));
    homeWheelState.wheelSpinsResetAtSec = Math.max(0, Math.floor(Number(wheelState.resetAtSec) || 0));

    const statusEl = uiRefs.homeWheelStatus;
    const disabled = !loggedIn || !profileLoaded || homeWheelState.wheelSpinsRemaining <= 0;
    const remainingMs = getWheelResetRemainingMs();

    if (loggedIn && !profileLoaded) {
        if (statusEl && !homeWheelState.spinning) {
            statusEl.textContent = 'Checking your wheel balance...';
        }
    } else if (loggedIn) {
        if (homeWheelState.wheelSpinsRemaining > 0) {
            const spinsText = `${homeWheelState.wheelSpinsRemaining} spin${homeWheelState.wheelSpinsRemaining === 1 ? '' : 's'} left`;
            if (statusEl && !homeWheelState.spinning) {
                statusEl.textContent = `${spinsText}. Tap the wheel to spin.`;
            }
        } else {
            const resetText = remainingMs > 0 ? formatCountdownMs(remainingMs) : '0h 0m 0s';
            if (statusEl && !homeWheelState.spinning) {
                statusEl.textContent = `No spins left. Resets in ${resetText}.`;
            }
        }
    } else if (statusEl && !homeWheelState.spinning) {
        statusEl.textContent = 'Log in first to spin the prize wheel.';
    }

    if (loggedIn && profileLoaded && homeWheelState.wheelSpinsRemaining <= 0 && homeWheelState.wheelSpinsResetAtSec > 0 && remainingMs <= 0) {
        const refreshToken = getStoredAccountAuthToken();
        if (refreshToken && homeWheelState.lastRefreshRequestedResetAtSec !== homeWheelState.wheelSpinsResetAtSec) {
            homeWheelState.lastRefreshRequestedResetAtSec = homeWheelState.wheelSpinsResetAtSec;
            sendAuthSessionPacket(refreshToken);
        }
    }

    const shell = uiRefs.homeWheel?.querySelector?.('#home_wheel_shell');
    if (shell) {
        shell.classList.toggle('wheel_locked', disabled && !homeWheelState.spinning);
        shell.setAttribute('aria-disabled', disabled && !homeWheelState.spinning ? 'true' : 'false');
    }
}

function ensureHomeWheelStatusTimer() {
    if (homeWheelState.accessTimerId) return;
    homeWheelState.accessTimerId = window.setInterval(() => {
        updateHomeWheelStatusUi();
    }, 1000);
}

window.addEventListener('ua-account-profile-changed', () => {
    updateHomeWheelStatusUi();
});

function renderHomeWheelAngle() {
    const svg = uiRefs.homeWheelSvg;
    if (!svg) return;
    svg.style.transform = `rotate(${homeWheelState.angle}deg)`;
}

function renderHomeWheelResult(text) {
    homeWheelState.resultText = text;
    const resultEl = uiRefs.homeWheelResult;
    if (resultEl) resultEl.textContent = text;
}

function formatHomeWheelReward(segment, includeChance = true) {
    if (!segment) return '';
    if (!includeChance) return `${segment.reward || segment.rarity}`;
    return `${segment.reward || segment.rarity} (${segment.chance}%)`;
}

function getHomeWheelHoverSegment(clientX, clientY) {
    const shell = getHomeWheelElement()?.querySelector?.('#home_wheel_shell');
    if (!shell) return null;

    const rect = shell.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const outerRadius = Math.min(rect.width, rect.height) / 2;
    const innerRadius = outerRadius * 0.26;

    if (distance < innerRadius || distance > outerRadius) return null;

    const segmentSize = 360 / HOME_WHEEL_SEGMENT_COUNT;
    const screenAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const localAngle = ((screenAngle - homeWheelState.angle + 90) % 360 + 360) % 360;
    const index = Math.floor(localAngle / segmentSize) % HOME_WHEEL_SEGMENT_COUNT;
    return getHomeWheelSegmentData(index);
}

function updateHomeWheelHoverLabel(segment) {
    const labelEl = uiRefs.homeWheelHoverLabel;
    if (!segment) {
        homeWheelState.hoverText = '';
        if (labelEl) {
            labelEl.textContent = '';
            labelEl.style.opacity = '0';
        }
        return;
    }
    homeWheelState.hoverText = formatHomeWheelReward(segment, true);
    if (labelEl) {
        labelEl.textContent = homeWheelState.hoverText;
        labelEl.style.opacity = '1';
    }
}

function getHomeWheelSegmentIndex(angle = homeWheelState.angle) {
    const segmentSize = 360 / HOME_WHEEL_SEGMENT_COUNT;
    const normalized = ((360 - (Number(angle) || 0)) % 360 + 360) % 360;
    return Math.floor(normalized / segmentSize) % HOME_WHEEL_SEGMENT_COUNT;
}

function getHomeWheelSegmentData(index) {
    return HOME_WHEEL_SEGMENT_RARITIES[((Number(index) || 0) % HOME_WHEEL_SEGMENT_COUNT + HOME_WHEEL_SEGMENT_COUNT) % HOME_WHEEL_SEGMENT_COUNT];
}

function updateHomeStatsHud() {
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    const statsHud = uiRefs.homeStatsHud || document.getElementById('home_stats_hud');
    const killsEl = uiRefs.homeStatsKillsEl || document.getElementById('home_stats_kills');
    const coinsEl = uiRefs.homeStatsCoinsEl || document.getElementById('home_stats_coins');

    if (!uiRefs.homeScreen && homeScreen) uiRefs.homeScreen = homeScreen;
    if (!uiRefs.homeStatsHud && statsHud) uiRefs.homeStatsHud = statsHud;
    if (!uiRefs.homeStatsKillsEl && killsEl) uiRefs.homeStatsKillsEl = killsEl;
    if (!uiRefs.homeStatsCoinsEl && coinsEl) uiRefs.homeStatsCoinsEl = coinsEl;

    if (!statsHud || !killsEl || !coinsEl) return;

    const isHome = homeScreen?.style.display !== 'none';
    statsHud.style.display = isHome ? 'flex' : 'none';
    if (!isHome) return;

    killsEl.textContent = Math.max(0, Math.floor(Number(Vars.myStats.kills) || 0)).toLocaleString();
    coinsEl.textContent = Math.max(0, Math.floor(Number(Vars.myStats.goldCoins) || 0)).toLocaleString();
}

export function handleHomeWheelSpinResult(index, spinDurationMs = null) {
    if (!homeWheelState.spinning) return;

    const segmentSize = 360 / HOME_WHEEL_SEGMENT_COUNT;
    const chosenIndex = ((Number(index) || 0) % HOME_WHEEL_SEGMENT_COUNT + HOME_WHEEL_SEGMENT_COUNT) % HOME_WHEEL_SEGMENT_COUNT;
    const chosenSegment = getHomeWheelSegmentData(chosenIndex);
    const landingFraction = 0.18 + (Math.random() * 0.64);
    const currentAngle = homeWheelState.angle;
    const finalRotation = (360 - ((chosenIndex + landingFraction) * segmentSize)) % 360;
    const normalizedDelta = ((finalRotation - currentAngle) % 360 + 360) % 360;
    const extraTurns = 5 + Math.floor(Math.random() * 3);

    homeWheelState.startAngle = currentAngle;
    homeWheelState.targetAngle = currentAngle + normalizedDelta + (extraTurns * 360);
    homeWheelState.targetIndex = chosenIndex;
    homeWheelState.targetLabel = formatHomeWheelReward(chosenSegment, false);
    homeWheelState.spinStartTime = performance.now();
    homeWheelState.spinDuration = Math.max(1000, Math.min(65535, Number(spinDurationMs) || (8600 + Math.floor(Math.random() * 2400))));
    homeWheelState.angularVelocity = 0;
    homeWheelState.lastFrameTime = 0;
    homeWheelState.lastSegmentIndex = getHomeWheelSegmentIndex(currentAngle);
    updateHomeWheelHoverLabel(null);
    renderHomeWheelResult('Spinning...');

    const tick = (now) => {
        if (!homeWheelState.spinning) return;
        const elapsed = Math.max(0, now - homeWheelState.spinStartTime);
        const progress = Math.max(0, Math.min(1, elapsed / homeWheelState.spinDuration));
        const eased = 1 - Math.pow(1 - progress, 4);
        homeWheelState.angle = homeWheelState.startAngle + ((homeWheelState.targetAngle - homeWheelState.startAngle) * eased);
        homeWheelState.angularVelocity = Math.max(0, (homeWheelState.targetAngle - homeWheelState.startAngle) * (4 * Math.pow(1 - progress, 3)) / homeWheelState.spinDuration * 1000);
        renderHomeWheelAngle();

        const currentSegmentIndex = getHomeWheelSegmentIndex(homeWheelState.angle);
        if (currentSegmentIndex !== homeWheelState.lastSegmentIndex) {
            homeWheelState.lastSegmentIndex = currentSegmentIndex;
            playWheelClickSound();
        }

        if (progress >= 1) {
            homeWheelState.angle = ((homeWheelState.targetAngle % 360) + 360) % 360;
            renderHomeWheelAngle();
            const landedIndex = getHomeWheelSegmentIndex(homeWheelState.angle);

            homeWheelState.spinning = false;
            homeWheelState.angularVelocity = 0;
            homeWheelState.rafId = 0;
            homeWheelState.startAngle = 0;
            homeWheelState.targetAngle = 0;
            homeWheelState.spinStartTime = 0;
            homeWheelState.spinDuration = 0;
            homeWheelState.lastSegmentIndex = getHomeWheelSegmentIndex(homeWheelState.angle);
            const prizeText = formatHomeWheelReward(chosenSegment, false);
            renderHomeWheelResult(prizeText);
            showNotification(`You've been awarded ${prizeText}`, '#0ea5e9');
            updateHomeWheelHoverLabel(null);
            return;
        }

        homeWheelState.rafId = requestAnimationFrame(tick);
    };

    homeWheelState.rafId = requestAnimationFrame(tick);
}

function stopHomeWheel(immediate = false) {
    if (!homeWheelState.spinning && !homeWheelState.rafId) {
        return;
    }
    if (homeWheelState.rafId) {
        cancelAnimationFrame(homeWheelState.rafId);
        homeWheelState.rafId = 0;
    }
    homeWheelState.spinning = false;
    homeWheelState.angularVelocity = 0;
    homeWheelState.lastFrameTime = 0;
    homeWheelState.startAngle = 0;
    homeWheelState.targetAngle = 0;
    homeWheelState.targetIndex = -1;
    homeWheelState.targetLabel = '';
    homeWheelState.spinStartTime = 0;
    homeWheelState.spinDuration = 0;
    homeWheelState.lastSegmentIndex = getHomeWheelSegmentIndex(homeWheelState.angle);
    updateHomeWheelHoverLabel(null);
    if (immediate) {
        homeWheelState.angle = Math.round(homeWheelState.angle);
    }
    renderHomeWheelAngle();
}

function startHomeWheelSpin() {
    const shell = uiRefs.homeWheel;
    if (!shell) return;

    if (homeWheelState.spinning) {
        return;
    }

    if (!hasStoredAccountSession()) {
        showNotification('Log in first to spin the prize wheel.', 'red');
        openHomeAccountPanel();
        updateHomeWheelStatusUi();
        return;
    }

    if (!getAccountWheelSpinState().loaded) {
        showNotification('Checking your wheel balance. Try again in a moment.', 'red');
        openHomeAccountPanel();
        updateHomeWheelStatusUi();
        return;
    }

    if (homeWheelState.wheelSpinsRemaining <= 0) {
        const remainingMs = getWheelResetRemainingMs();
        const resetText = remainingMs > 0 ? formatCountdownMs(remainingMs) : '0h 0m 0s';
        showNotification(`You are out of spins. Try again in ${resetText}.`, 'red');
        updateHomeWheelStatusUi();
        return;
    }

    homeWheelState.spinning = true;
    updateHomeWheelHoverLabel(null);
    renderHomeWheelResult('Requesting spin...');
    if (!sendHomeWheelSpinRequestPacket()) {
        homeWheelState.spinning = false;
        renderHomeWheelResult('Click wheel to spin');
    }
}

function createWheelSegmentPath(cx, cy, radius, startAngle, endAngle) {
    const toPoint = (angleDeg) => {
        const rad = (Math.PI / 180) * angleDeg;
        return {
            x: cx + (Math.cos(rad) * radius),
            y: cy + (Math.sin(rad) * radius)
        };
    };
    const start = toPoint(startAngle);
    const end = toPoint(endAngle);
    const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

function appendHomeWheelRewardLabel(svgNS, wheel, segment, cx, cy, labelAngle) {
    if (!segment?.reward) return;
    const lines = segment.rarity === 'Legendary'
        ? ['All Rank 12', 'Weapons']
        : [segment.reward];
    const rewardText = String(segment.reward || '');
    const fontSize = segment.rarity === 'Legendary'
        ? 26
        : (rewardText.length > 20 ? 26 : (rewardText.length > 14 ? 30 : 36));
    const startX = 390;
    const lineGap = fontSize * 0.96;
    const startY = -((lines.length - 1) * lineGap) / 2;
    const group = document.createElementNS(svgNS, 'g');
    group.setAttribute('transform', `translate(${cx} ${cy}) rotate(${labelAngle})`);

    for (let i = 0; i < lines.length; i++) {
        const label = document.createElementNS(svgNS, 'text');
        label.textContent = lines[i];
        label.setAttribute('x', String(startX));
        label.setAttribute('y', String(startY + (i * lineGap)));
        label.setAttribute('fill', '#f8fafc');
        label.setAttribute('stroke', 'rgba(15, 23, 42, 0.86)');
        label.setAttribute('stroke-width', '8');
        label.setAttribute('paint-order', 'stroke fill');
        label.setAttribute('stroke-linejoin', 'round');
        label.setAttribute('font-family', 'Nunito, Inter, sans-serif');
        label.setAttribute('font-size', String(fontSize));
        label.setAttribute('font-weight', '900');
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('letter-spacing', '0');
        group.appendChild(label);
    }

    wheel.appendChild(group);
}

function createHomeWheelSvg(shell) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('home_wheel_svg');

    const defs = document.createElementNS(svgNS, 'defs');
    const shadowFilter = document.createElementNS(svgNS, 'filter');
    shadowFilter.setAttribute('id', 'home-wheel-shadow');
    shadowFilter.setAttribute('x', '-20%');
    shadowFilter.setAttribute('y', '-20%');
    shadowFilter.setAttribute('width', '140%');
    shadowFilter.setAttribute('height', '140%');
    const dropShadow = document.createElementNS(svgNS, 'feDropShadow');
    dropShadow.setAttribute('dx', '0');
    dropShadow.setAttribute('dy', '18');
    dropShadow.setAttribute('stdDeviation', '18');
    dropShadow.setAttribute('flood-color', '#020617');
    dropShadow.setAttribute('flood-opacity', '0.55');
    shadowFilter.appendChild(dropShadow);
    defs.appendChild(shadowFilter);
    svg.appendChild(defs);

    const wheel = document.createElementNS(svgNS, 'g');
    wheel.setAttribute('filter', 'url(#home-wheel-shadow)');
    wheel.setAttribute('transform', 'translate(0 0)');

    const cx = 500;
    const cy = 500;
    const radius = 432;
    const segmentSize = 360 / HOME_WHEEL_SEGMENT_COUNT;
    for (let i = 0; i < HOME_WHEEL_SEGMENT_COUNT; i++) {
        const startAngle = -90 + (i * segmentSize);
        const endAngle = startAngle + segmentSize;
        const segment = document.createElementNS(svgNS, 'path');
        segment.setAttribute('d', createWheelSegmentPath(cx, cy, radius, startAngle, endAngle));
        segment.setAttribute('fill', HOME_WHEEL_SEGMENT_RARITIES[i].color);
        segment.setAttribute('stroke', 'rgba(15, 23, 42, 0.85)');
        segment.setAttribute('stroke-width', '10');
        segment.setAttribute('stroke-linejoin', 'round');
        wheel.appendChild(segment);

        appendHomeWheelRewardLabel(svgNS, wheel, HOME_WHEEL_SEGMENT_RARITIES[i], cx, cy, startAngle + (segmentSize / 2));
    }

    const outerRing = document.createElementNS(svgNS, 'circle');
    outerRing.setAttribute('cx', cx);
    outerRing.setAttribute('cy', cy);
    outerRing.setAttribute('r', '436');
    outerRing.setAttribute('fill', 'none');
    outerRing.setAttribute('stroke', 'rgba(0, 0, 0, 0.55)');
    outerRing.setAttribute('stroke-width', '18');
    wheel.appendChild(outerRing);

    svg.appendChild(wheel);
    shell.appendChild(svg);
    uiRefs.homeWheelSvg = svg;
}

export function createHomeWheel(parent) {
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    if (!homeScreen || uiRefs.homeWheel) return;

    const wheel = createEl('section', {}, parent || homeScreen, { id: 'home_wheel' });
    uiRefs.homeWheel = wheel;
    wheel.classList.add('home_overlay_panel');
    wheel.setAttribute('aria-hidden', 'true');
    wheel.setAttribute('aria-label', 'Spin wheel');

    const wheelHeader = createEl('div', {}, wheel, { className: 'home_overlay_header' });
    createEl('div', {}, wheelHeader, {
        id: 'home_wheel_title',
        textContent: 'Prize Wheel'
    });
    createEl('button', {}, wheelHeader, {
        className: 'home_overlay_close',
        textContent: '×',
        type: 'button',
        ariaLabel: 'Close prize wheel'
    });

    const wheelShell = createEl('div', {}, wheel, { id: 'home_wheel_shell' });
    wheelShell.setAttribute('role', 'button');
    wheelShell.setAttribute('tabindex', '0');
    wheelShell.setAttribute('aria-label', 'Spin the wheel');
    createHomeWheelSvg(wheelShell);

    const marker = createEl('div', {}, wheelShell, { id: 'home_wheel_marker' });
    marker.setAttribute('aria-hidden', 'true');

    const wheelResult = createEl('div', {}, wheel, {
        id: 'home_wheel_result',
        textContent: 'Click wheel to spin'
    });
    uiRefs.homeWheelResult = wheelResult;
    wheelResult.setAttribute('aria-live', 'polite');

    const wheelStatus = createEl('div', {}, wheel, {
        id: 'home_wheel_status',
        textContent: ''
    });
    uiRefs.homeWheelStatus = wheelStatus;
    wheelStatus.setAttribute('aria-live', 'polite');

    const hoverLabel = createEl('div', {}, wheelShell, {
        id: 'home_wheel_hover_label',
        textContent: ''
    });
    uiRefs.homeWheelHoverLabel = hoverLabel;
    hoverLabel.setAttribute('aria-hidden', 'true');

    const triggerSpin = () => {
        if (homeWheelState.spinning) return;
        startHomeWheelSpin();
    };

    wheelShell.addEventListener('click', triggerSpin);
    wheelShell.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        triggerSpin();
    });
    wheelShell.addEventListener('pointermove', (event) => {
        if (homeWheelState.spinning) return;
        if (wheelShell.classList.contains('wheel_locked')) {
            updateHomeWheelHoverLabel(null);
            return;
        }
        updateHomeWheelHoverLabel(getHomeWheelHoverSegment(event.clientX, event.clientY));
    });
    wheelShell.addEventListener('pointerleave', () => {
        if (homeWheelState.spinning) return;
        updateHomeWheelHoverLabel(null);
    });

    renderHomeWheelAngle();
    updateHomeWheelStatusUi();
    ensureHomeWheelStatusTimer();
}

export function setupHomeOverlays() {
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    const accountPanel = document.getElementById('auth_panel');
    const infoPanel = document.getElementById('home_info_panel');
    const wheel = getHomeWheelElement();
    if (!homeScreen || !accountPanel || !infoPanel || !wheel) return;

    uiRefs.homeScreen = homeScreen;
    uiRefs.homeAccountPanel = accountPanel;
    uiRefs.homeInfoPanel = infoPanel;

    let backdrop = document.getElementById('home_overlay_backdrop');
    if (!backdrop) {
        backdrop = createEl('div', {}, homeScreen, { id: 'home_overlay_backdrop' });
    }

    let triggerStack = document.getElementById('home_overlay_triggers');
    if (!triggerStack) {
        triggerStack = createEl('div', {}, homeScreen, { id: 'home_overlay_triggers' });
    }

    const panels = [accountPanel, infoPanel, wheel];
    const triggers = [];

    const closeAll = () => {
        if (homeWheelState.spinning) return;
        stopHomeWheel(true);
        homeScreen.classList.remove('home_overlay_open');
        for (let i = 0; i < panels.length; i++) {
            panels[i].classList.remove('is_open');
            panels[i].setAttribute('aria-hidden', 'true');
        }
        for (let i = 0; i < triggers.length; i++) {
            triggers[i].classList.remove('active');
            triggers[i].setAttribute('aria-expanded', 'false');
        }
        backdrop.classList.remove('is_open');
    };

    const openPanel = (panel, trigger) => {
        closeAll();
        homeScreen.classList.add('home_overlay_open');
        panel.classList.add('is_open');
        panel.setAttribute('aria-hidden', 'false');
        trigger.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
        backdrop.classList.add('is_open');
    };

    const ensureTrigger = (id, textContent, panel) => {
        let btn = document.getElementById(id);
        if (!btn) {
            btn = createEl('button', {}, triggerStack, {
                id,
                className: 'home_overlay_trigger',
                textContent
            });
        } else if (btn.parentElement !== triggerStack) {
            triggerStack.appendChild(btn);
        }
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-controls', panel.id);
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', () => {
            if (panel.classList.contains('is_open')) {
                closeAll();
            } else {
                openPanel(panel, btn);
            }
        });
        triggers.push(btn);
        return btn;
    };

    ensureTrigger('home_account_toggle', 'Account', accountPanel);
    ensureTrigger('home_info_toggle', 'Info', infoPanel);
    ensureTrigger('home_wheel_toggle', 'Prize Wheel', wheel);

    const closeButtons = homeScreen.querySelectorAll('.home_overlay_close');
    for (let i = 0; i < closeButtons.length; i++) {
        closeButtons[i].addEventListener('click', closeAll);
    }
    backdrop.addEventListener('click', closeAll);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAll();
    });
}

function setHomeInfoTab(tab) {
    const nextTab = HOME_INFO_TABS.includes(tab) ? tab : 'leaderboards';
    const tabs = uiRefs.homeInfoTabs || [];
    const panels = uiRefs.homeInfoPanels || [];
    for (let i = 0; i < tabs.length; i++) {
        const btn = tabs[i];
        const isActive = btn?.dataset?.tab === nextTab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        panel.classList.toggle('active', panel?.dataset?.panel === nextTab);
    }
    uiState.activeHomeInfoTab = nextTab;
}

function renderHomeLeaderboardScopeButtons() {
    const buttons = uiRefs.homeLeaderboardScopeButtons || [];
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        btn.classList.toggle('active', btn?.dataset?.scope === homeLeaderboardState.activeScope);
    }
}

function renderHomeLeaderboardList() {
    const listEl = uiRefs.homeLeaderboardList;
    const statusEl = uiRefs.homeLeaderboardStatus;
    if (!listEl || !statusEl) return;

    const entries = Array.isArray(homeLeaderboardState.data[homeLeaderboardState.activeScope])
        ? homeLeaderboardState.data[homeLeaderboardState.activeScope]
        : [];
    listEl.innerHTML = '';

    if (homeLeaderboardState.loading && !homeLeaderboardState.loaded) {
        statusEl.textContent = 'Loading leaderboards from the server...';
        return;
    }

    statusEl.textContent = homeLeaderboardState.loading
        ? 'Refreshing leaderboards...'
        : `Top 10 ${homeLeaderboardState.activeScope} runs`;

    if (!entries.length) {
        createEl('div', {}, listEl, {
            className: 'home_leaderboard_empty',
            textContent: 'No scores yet for this period.'
        });
        return;
    }

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const row = createEl('div', {}, listEl, { className: 'home_leaderboard_entry' });
        createEl('div', {}, row, {
            className: 'home_leaderboard_rank',
            textContent: `#${entry.rank || (i + 1)}`
        });
        const copy = createEl('div', {}, row, { className: 'home_leaderboard_entry_copy' });
        const nameEl = createEl('div', {}, copy, {
            className: 'home_leaderboard_name',
            textContent: String(entry.username || 'Player')
        });
        const nameStyle = getCurrentAuthenticatedAccountNameStyle(entry.username, Vars.isAdmin, performance.now());
        if (nameStyle?.kind === 'rainbow') {
            nameEl.classList.add('home_leaderboard_name_rainbow');
        } else if (nameStyle?.kind === 'admin') {
            nameEl.classList.add('home_leaderboard_name_admin');
            nameEl.style.color = nameStyle.color;
        }
        createEl('div', {}, copy, {
            className: 'home_leaderboard_score',
            textContent: `${Math.max(0, Number(entry.score) || 0).toLocaleString()} score`
        });
    }
}

export function setHomeLeaderboardsLoading(loading) {
    homeLeaderboardState.loading = !!loading;
    renderHomeLeaderboardList();
}

export function updateHomeLeaderboards(payload = {}) {
    for (let i = 0; i < HOME_LEADERBOARD_SCOPES.length; i++) {
        const scope = HOME_LEADERBOARD_SCOPES[i];
        const entries = Array.isArray(payload[scope]) ? payload[scope] : [];
        homeLeaderboardState.data[scope] = entries.slice(0, 10).map((entry, index) => ({
            rank: index + 1,
            username: String(entry?.username || 'Player'),
            score: Math.max(0, Math.floor(Number(entry?.score) || 0))
        }));
    }
    homeLeaderboardState.loaded = true;
    homeLeaderboardState.loading = false;
    renderHomeLeaderboardScopeButtons();
    renderHomeLeaderboardList();
}

function setPauseState(paused) {
    if (uiState.isPaused === paused) return;
    uiState.isPaused = paused;
    if (paused) {
        uiState.pendingPause = true;
        uiState.pendingPauseStartedAt = performance.now();
        Vars.pauseSpectateStartAt = performance.now() + PAUSE_SPECTATE_START_DELAY_MS;
        startJoinActionCooldown();
        sendPausePacket();
    } else {
        uiState.pendingPause = false;
        uiState.pendingPauseStartedAt = 0;
        uiState.forceHomeScreen = false;
        Vars.pauseSpectateStartAt = 0;
    }
}

export function requestPause() {
    setPauseState(true);
}

export function createComboText(parent) {
    const hb = HOTBAR_CONFIG;
    const bottomLift = 50; // sit between level bar and in-combat label
    const bottom = hb.marginBottom + hb.slotSize + (hb.padding * 2) + 45 + bottomLift;

    uiRefs.comboText = createEl('div', {
        position: 'fixed',
        bottom: bottom + 'px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#dbeafe',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
        display: 'none',
        pointerEvents: 'none',
        zIndex: '90'
    }, parent, { textContent: 'Combo: 0/3' });
}

export function createShieldIcon(parent) {
    const shieldIcon = createEl('div', {
        backgroundImage: 'url("./images/ui/pause_button.png")',
        backgroundSize: '75%', // Perfectly balanced to match other top icons
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        display: 'none',
        zIndex: '100000',
        pointerEvents: 'auto',
        cursor: 'pointer'
    }, parent, { id: 'pauseBtn' });

    shieldIcon.onclick = () => {
        playUITapSound();
        requestPause();
    };
}

export function createTopBarHint(parent) {
    uiRefs.topBarHint = createEl('div', {
        position: 'fixed',
        top: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(520px, 92vw)',
        padding: '6px 10px',
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '10px',
        color: '#f8fafc',
        fontSize: '0.8rem',
        fontWeight: '600',
        textAlign: 'center',
        pointerEvents: 'none',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
        zIndex: '100000',
        display: 'none'
    }, parent, { id: 'top_left_hint' });
    uiRefs.topLeftHint = uiRefs.topBarHint;
}

export function createFullscreenButton(parent) {
    const btn = createEl('button', {
        backgroundImage: 'url("./images/ui/fullscreen_button.png")',
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    }, parent, {
        id: 'fullscreenBtn'
    });

    btn.onclick = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };
}

export function updateHUDVisibility(isAlive) {
    const homeBlurBtn = uiRefs.homeBlurBtn || document.getElementById('homeBlurBtn');
    if (!uiRefs.homeBlurBtn && homeBlurBtn) uiRefs.homeBlurBtn = homeBlurBtn;
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    const respawnScreen = uiRefs.respawnScreen || document.getElementById('respawn_screen');
    if (!uiRefs.homeScreen && homeScreen) uiRefs.homeScreen = homeScreen;
    if (!uiRefs.respawnScreen && respawnScreen) uiRefs.respawnScreen = respawnScreen;

    const isHome = homeScreen?.style.display !== 'none';
    const isRespawn = respawnScreen?.style.display !== 'none';
    const shouldShowTopBar = (!isHome && !isRespawn && isAlive && !uiState.pendingPause);
    const topLeftBar = uiRefs.topLeftBar;

    if (!isHome) {
        stopHomeWheel(true);
    }

    const nextKey = `${isAlive ? 1 : 0}|${isHome ? 1 : 0}|${isRespawn ? 1 : 0}|${uiState.pendingPause ? 1 : 0}|${shouldShowTopBar ? 1 : 0}`;
    if (hudVisibilityCache.key !== nextKey) {
        hudVisibilityCache.key = nextKey;
        uiRefs.topBar.visible = shouldShowTopBar;
        uiRefs.topBar.showSettings = shouldShowTopBar;
        uiRefs.topBar.showFullscreen = shouldShowTopBar;
        uiRefs.topBar.showShop = shouldShowTopBar;
        uiRefs.topBar.showChat = shouldShowTopBar;
        if (topLeftBar && topLeftBar.style.display !== (shouldShowTopBar ? 'block' : 'none')) {
            topLeftBar.style.display = shouldShowTopBar ? 'block' : 'none';
        }
        if (homeBlurBtn && homeBlurBtn.style.display !== (isAlive ? 'none' : 'flex')) {
            homeBlurBtn.style.display = isAlive ? 'none' : 'flex';
        }
        if (!shouldShowTopBar) {
            Vars.mobileAccessoryAbilityArmed = false;
        }
    }
    updateHomeStatsHud();
    updateMobileUIState();
}

export function updateShieldUI(active) {
    const isAlive = ENTITIES.PLAYERS[Vars.myId]?.isAlive;
    uiRefs.topBar.showPause = !!(active && isAlive);
}

export function updateMobileUIState() {
    const joy = uiRefs.joystickContainer || document.getElementById('joystick_container');
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    const respawnScreen = uiRefs.respawnScreen || document.getElementById('respawn_screen');
    if (!uiRefs.joystickContainer && joy) uiRefs.joystickContainer = joy;
    if (!uiRefs.homeScreen && homeScreen) uiRefs.homeScreen = homeScreen;
    if (!uiRefs.respawnScreen && respawnScreen) uiRefs.respawnScreen = respawnScreen;
    const isHome = homeScreen?.style.display !== 'none';
    const isRespawn = respawnScreen?.style.display !== 'none';
    const show = isMobile && !isHome && !isRespawn && !uiState.pendingPause && !uiState.isPaused;
    if (mobileUiStateCache.show === show) return;
    mobileUiStateCache.show = show;

    if (joy && joy.style.display !== (show ? 'block' : 'none')) {
        joy.style.display = show ? 'block' : 'none';
    }
}

export function createHomeBlurButton() {
    const homeScreen = uiRefs.homeScreen || document.getElementById('home_screen');
    if (!homeScreen) return;
    uiRefs.homeScreen = homeScreen;

    const btn = createEl('button', {
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    }, homeScreen, {
        id: 'homeBlurBtn'
    });
    uiRefs.homeBlurBtn = btn;

    let isBlurred = true;
    const setBlurState = (blurred) => {
        isBlurred = !!blurred;
        if (isBlurred) {
            homeScreen.classList.remove('unblurred');
            btn.classList.remove('is_unblurred');
        } else {
            homeScreen.classList.add('unblurred');
            btn.classList.add('is_unblurred');
        }
    };

    btn.onclick = () => {
        setBlurState(!isBlurred);
    };

    // When home UI is hidden, clicking anywhere on the home screen restores it.
    homeScreen.addEventListener('click', (event) => {
        if (isBlurred) return;
        if (event.target === btn) return;
        setBlurState(true);
    });
}

export function setupVersion() {
    const credits = document.getElementById('credits');
    if (credits) {
        createEl('div', {
            fontSize: '0.7rem',
            marginTop: '8px',
            opacity: '0.6',
            letterSpacing: '0.05rem',
            textAlign: 'center',
            width: '100%'
        }, credits, { textContent: `v${version}` });
    }
}

export function setupUpdateLog() {
    const homeScreen = document.getElementById('home_screen');
    const infoPanel = document.getElementById('home_info_panel');
    const updateLog = document.getElementById('home_updates_log');
    if (!homeScreen || !infoPanel || !updateLog) return;

    uiRefs.homeInfoTabs = Array.from(infoPanel.querySelectorAll('.home_info_tab'));
    uiRefs.homeInfoPanels = Array.from(infoPanel.querySelectorAll('.home_info_panel_section'));
    uiRefs.homeLeaderboardScopeButtons = Array.from(infoPanel.querySelectorAll('.home_leaderboard_scope_btn'));
    uiRefs.homeLeaderboardList = document.getElementById('home_leaderboard_list');
    uiRefs.homeLeaderboardStatus = document.getElementById('home_leaderboard_status');
    uiRefs.homeLeaderboardRefreshBtn = document.getElementById('leaderboardRefreshBtn');

    for (let i = 0; i < uiRefs.homeInfoTabs.length; i++) {
        const btn = uiRefs.homeInfoTabs[i];
        btn.addEventListener('click', () => setHomeInfoTab(btn.dataset.tab || 'leaderboards'));
    }

    for (let i = 0; i < uiRefs.homeLeaderboardScopeButtons.length; i++) {
        const btn = uiRefs.homeLeaderboardScopeButtons[i];
        btn.addEventListener('click', () => {
            homeLeaderboardState.activeScope = btn.dataset.scope || 'daily';
            renderHomeLeaderboardScopeButtons();
            renderHomeLeaderboardList();
        });
    }

    uiRefs.homeLeaderboardRefreshBtn?.addEventListener('click', () => {
        setHomeLeaderboardsLoading(true);
        if (!sendAccountLeaderboardRefreshPacket()) {
            setHomeLeaderboardsLoading(false);
        }
    });

    updateLog.innerHTML = '';
    [...UPDATES_LOG].reverse().forEach(update => {
        const item = createEl('div', {}, updateLog, { className: 'home_update_entry' });
        createEl('div', {}, item, { className: 'home_update_version', textContent: update.version });
        for (let i = 0; i < update.changes.length; i++) {
            createEl('div', {}, item, {
                className: 'home_update_change',
                textContent: `• ${update.changes[i]}`
            });
        }
        createEl('div', {}, item, { className: 'home_update_date', textContent: update.date });
    });

    setHomeInfoTab(uiState.activeHomeInfoTab || 'leaderboards');
    renderHomeLeaderboardScopeButtons();
    renderHomeLeaderboardList();
}

export function setupDidYouKnowBox() {
    const playPanel = document.getElementById('play_panel');
    if (!playPanel) return;

    let timerBox = document.getElementById('double_xp_timer_box');
    if (!timerBox) {
        timerBox = createEl('div', {}, playPanel, { id: 'double_xp_timer_box' });
    }
    uiRefs.homeXpBoostTimerEl = timerBox;
    let timerValue = uiRefs.homeXpBoostTimerValueEl || timerBox.querySelector('.double_xp_timer_value');
    if (!timerValue) {
        timerBox.innerHTML = '';
        createEl('span', {}, timerBox, { className: 'double_xp_timer_label', textContent: '2X XP' });
        timerValue = createEl('span', {}, timerBox, { className: 'double_xp_timer_value', textContent: '' });
    }
    uiRefs.homeXpBoostTimerValueEl = timerValue;

    const box = createEl('div', {}, playPanel, { id: 'did_you_know_box' });
    createEl('span', {}, box, { className: 'did_you_know_label', textContent: 'DID YOU KNOW:' });
    const hintText = createEl('span', {}, box, {
        className: 'did_you_know_text',
        textContent: DID_YOU_KNOW_HINTS[0]
    });

    const updateTimerBox = () => {
        if (!uiRefs.homeXpBoostTimerEl || !uiRefs.homeXpBoostTimerValueEl) return;
        const text = getDoubleXpStatusText();
        uiRefs.homeXpBoostTimerEl.style.display = text ? 'flex' : 'none';
        if (text) {
            uiRefs.homeXpBoostTimerValueEl.textContent = text.replace(/^2X XP\s*/i, '');
        }
    };

    let hintIndex = 0;
    setInterval(updateTimerBox, 250);
    setInterval(() => {
        hintIndex = (hintIndex + 1) % DID_YOU_KNOW_HINTS.length;
        hintText.textContent = DID_YOU_KNOW_HINTS[hintIndex];
    }, 7000);
    updateTimerBox();
}
