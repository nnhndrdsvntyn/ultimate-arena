// --- Configuration & Constants ---
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
export const THROW_BTN_CONFIG = { xOffset: 70, yOffset: 140, radius: 45, touchPadding: 15 };
export const PICKUP_BTN_CONFIG = { xOffset: 180, yOffset: 140, radius: 45, touchPadding: 20 };
export const DROP_BTN_CONFIG = { xOffset: 70, yOffset: 260, radius: 40, touchPadding: 15 };
export const ATTACK_BTN_CONFIG = { xOffset: 160, yOffset: 260, radius: 55, touchPadding: 20 };

export const HOTBAR_CONFIG = {
    slotSize: isMobile ? 75 : 60,
    gap: isMobile ? 12 : 10,
    padding: isMobile ? 12 : 10,
    marginBottom: isMobile ? 25 : 20,
    touchPadding: isMobile ? 30 : 20
};

export const ACCESSORY_SLOT_CONFIG = {
    size: Math.round(HOTBAR_CONFIG.slotSize * (isMobile ? 1.15 : 1.05)),
    gap: isMobile ? 14 : 12,
    touchPadding: isMobile ? 20 : 10
};

export const INVENTORY_CONFIG = {
    cols: 6,
    rows: 5,
    slotSize: HOTBAR_CONFIG.slotSize,
    gap: HOTBAR_CONFIG.gap,
    padding: HOTBAR_CONFIG.padding,
    background: 'rgba(0,0,0,0.5)',
    cornerRadius: 12
};

export const BACK_BUFFER_QUALITIES = [
    { value: '480p', label: '480p (720×480)', width: 720, height: 480 },
    { value: '720p', label: '720p (1280×720)', width: 1280, height: 720 },
    { value: '1080p', label: '1080p (1920×1080) (recommended)', width: 1920, height: 1080 },
    { value: '1440p', label: '2K: 1440p (2560×1440)', width: 2560, height: 1440 },
    { value: '2160p', label: '4K (Ultra HD): 2160p (3840×2160)', width: 3840, height: 2160 },
    { value: '4320p', label: '8K (Ultra HD): 4320p (7680×4320)', width: 7680, height: 4320 }
];
export const BACK_BUFFER_DEFAULT = '1080p';
export const BACK_BUFFER_STORAGE_KEY = 'ua_back_buffer_quality';

export const UPDATES_LOG = [
    {
        version: '1.0.0',
        changes: ['More admin commands'],
        date: '2026-01-27'
    },
    {
        version: '1.1.0',
        changes: [
            'Added hotbar, players can now hold multiple items',
            'Revamped images (new snowy rocks)',
            'Manual dropping, and picking up items',
            'Better mobile controls',
            'Admin commands now work via chat, not ui.',
            'Adjusted chest drops',
        ],
        date: '2026-01-29'
    },
    {
        version: '1.2.0',
        changes: [
            'Fixed mobs spawning outside their biome',
            'Hotbar slots extended from 3 => 5 + extended inventory with 30 more slots',
            'Added shop, players buy using gold coins, and sell using items to get gold coins.',
            'Textured ground',
            'Added icicle sword (dropped only from snow biome chests)',
            'Added polar bear mob',
        ],
        date: '2026-01-31'
    },
    {
        version: '1.3.0',
        changes: [
            'Added accessories (Some give certain buffs)',
            'Fixed slash attack sprites',
            'New mob & chest sprites',
            'Some bugs fixed',
            'New admin commands: /rov (change range of view) and /agro (agro a mob towards a player)',
            'Revamped UI'
        ],
        date: '2026-02-08'
    },
    {
        version: '1.3.1',
        changes: [
            'Fixed some UI bugs',
            'More natrual mob sizes',
        ],
        date: '2026-02-09'
    },
    {
        version: '1.3.2',
        changes: [
            "Added pixel quality selection",
            "UI tweaks",
            "Added damage indicator text",
            "Better coin pick-up animation.",
            "Added minotaur mini-boss. (3 exist at any given time) on the grass side of the map.",
            "Added rank 9 sword (two-sided axe)."
        ],
        date: '2026-02-22'
    }
];

export const version = UPDATES_LOG[UPDATES_LOG.length - 1].version;
