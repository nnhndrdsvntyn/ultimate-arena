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

export const UPDATES_LOG = [
    {
        version: '1.1.1',
        changes: ['More admin commands'],
        date: '2026-01-27'
    },
    {
        version: '1.2.0',
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
        version: '1.2.1',
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
        version: '1.2.2',
        changes: [
            'Added accessories (Some give certain buffs)',
            'Fixed slash attack sprites',
            'New mob & chest sprites',
            'Some bugs fixed',
            'New admin commands: /rov (change range of view) and /agro (agro a mob towards a player)',
            'Revamped UI'
        ],
        date: '2026-02-08'
    }
];

export const version = UPDATES_LOG[UPDATES_LOG.length - 1].version;
