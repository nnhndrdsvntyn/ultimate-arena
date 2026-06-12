export const uiState = {
    isChatOpen: false,
    isChatInputOpen: false,
    isChatHistoryOpen: false,
    isSettingsOpen: false,
    isShopOpen: false,
    isInventoryOpen: false,
    activeTab: 'Visuals',
    activeShopTab: 'Buy',
    tempWeaponEditor: {
        category: 'sword',
        level: 1
    },
    itemsInSellQueue: [],
    shopAttentionRank: null,
    tempAdminKey: '',
    resetConfirmUntil: 0,
    resetPendingSeed: null,
    forceHomeScreen: false,
    pendingJoin: false,
    pendingJoinStartedAt: 0,
    pendingPause: false,
    pendingPauseStartedAt: 0,
    dimensionTransitionUntil: 0,
    lastInvToggleTime: 0,
    lastChatCloseTime: 0,
    isPaused: false,
    chatMessages: [],
    chatScrollY: 0,
    activeHomeInfoTab: 'account'
};

export const uiRefs = {
    settingsBody: null,
    shopBody: null,
    inventoryBody: null,
    chatInput: null,
    chatInputWrapper: null,
    chatCommandHint: null,
    chatCommandList: null,
    chatSuggestList: null,
    settingsModal: null,
    settingsOverlay: null,
    shopModal: null,
    shopOverlay: null,
    inventoryModal: null,
    inventoryOverlay: null,
    comboText: null,
    homeScreen: null,
    respawnScreen: null,
    homeBlurBtn: null,
    joystickContainer: null,
    mobileChatBtn: null,
    topLeftBar: null,
    topLeftHint: null,
    homeOnlineCount: null,
    homeInfoTabs: null,
    homeInfoPanels: null,
    homeLeaderboardScopeButtons: null,
    homeLeaderboardList: null,
    homeLeaderboardStatus: null,
    homeLeaderboardRefreshBtn: null,
    topBar: {
        visible: false,
        showPause: false,
        showChat: false,
        showSettings: false,
        showFullscreen: false,
        showShop: false,
        shopDisabled: false
    }
};

export const uiInput = {
    keys: new Set(),
    activeJoystickKeys: { w: 0, a: 0, s: 0, d: 0 }
};

export const uiRotation = {
    lastRotationTime: 0,
    rotationQueue: null,
    rotationTimeout: null
};
