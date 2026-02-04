export const uiState = {
    isChatOpen: false,
    isSettingsOpen: false,
    isShopOpen: false,
    isInventoryOpen: false,
    activeTab: 'Visuals',
    activeShopTab: 'Buy',
    itemsInSellQueue: [],
    tempAdminKey: '',
    lastInvToggleTime: 0,
    lastChatCloseTime: 0
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
    combatText: null
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
