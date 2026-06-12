import { ENTITIES } from '../game.js';
import { Vars, LC, startJoinActionCooldown, PAUSE_SPECTATE_START_DELAY_MS, playUITapSound } from '../client.js';
import { sendAccountLeaderboardRefreshPacket, sendPausePacket } from '../helpers.js';
import { createEl } from './dom.js';
import { uiRefs, uiState } from './context.js';
import { isMobile, HOTBAR_CONFIG, UPDATES_LOG, version } from './config.js';

const DID_YOU_KNOW_HINTS = [
    "You can buy accessories in the shop... some have special abilities!",
    "You automatically pick coins up... unless your inventory is full!",
    "You can drop coins, swords, and even accessories by dragging them out of your invetory or by pressing the Q key!",
    "You can hide under trees!",
    "If you want to level up quicker you can trade your coins for XP in the shop!",
    "You can sell swords you no longer need in the shop to earn coins.",
    "The Minotaur miniboss drops a ton of coins and also maybe a sword, an accessory... or both!",
];
const HOME_INFO_TABS = ['account', 'leaderboards', 'updates'];
const HOME_LEADERBOARD_SCOPES = ['daily', 'weekly', 'monthly'];
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

function setHomeInfoTab(tab) {
    const nextTab = HOME_INFO_TABS.includes(tab) ? tab : 'account';
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
        createEl('div', {}, copy, {
            className: 'home_leaderboard_name',
            textContent: String(entry.username || 'Player')
        });
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
        color: '#fbbf24',
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
            marginTop: '5px',
            opacity: '0.6',
            letterSpacing: '0.05rem',
            textAlign: 'center',
            width: '100%'
        }, credits, { textContent: `v${version}` });
    }
}

export function setupUpdateLog() {
    const homeScreen = document.getElementById('home_screen');
    const infoPanel = document.getElementById('auth_panel');
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
        btn.addEventListener('click', () => setHomeInfoTab(btn.dataset.tab || 'account'));
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

    setHomeInfoTab(uiState.activeHomeInfoTab || 'account');
    renderHomeLeaderboardScopeButtons();
    renderHomeLeaderboardList();
}

export function setupDidYouKnowBox() {
    const homeScreen = document.getElementById('home_screen');
    if (!homeScreen) return;

    const box = createEl('div', {
        position: 'absolute',
        top: isMobile ? '60px' : '2rem',
        right: isMobile ? '0.75rem' : '2rem',
        width: isMobile ? '180px' : '320px',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        padding: isMobile ? '8px' : '14px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        color: 'white',
        zIndex: '3'
    }, homeScreen, { id: 'did_you_know_box' });

    createEl('div', {
        fontSize: isMobile ? '0.65rem' : '0.8rem',
        fontWeight: '900',
        letterSpacing: '0.08rem',
        marginBottom: isMobile ? '5px' : '8px',
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.95)'
    }, box, { textContent: 'DID YOU KNOW:' });

    const hintText = createEl('div', {
        fontSize: isMobile ? '0.58rem' : '0.78rem',
        lineHeight: isMobile ? '1.25' : '1.4',
        color: 'rgba(255, 255, 255, 0.82)'
    }, box, { textContent: DID_YOU_KNOW_HINTS[0] });

    let hintIndex = 0;
    setInterval(() => {
        hintIndex = (hintIndex + 1) % DID_YOU_KNOW_HINTS.length;
        hintText.textContent = DID_YOU_KNOW_HINTS[hintIndex];
    }, 7000);
}
