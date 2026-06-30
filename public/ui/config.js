// --- Configuration & Constants ---
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const MOBILE_SHORT_EDGE = Math.min(window.innerWidth || 0, window.innerHeight || 0);
const IS_COMPACT_MOBILE = isMobile && MOBILE_SHORT_EDGE > 0 && MOBILE_SHORT_EDGE <= 430;

export const THROW_BTN_CONFIG = { xOffset: IS_COMPACT_MOBILE ? 58 : 66, yOffset: IS_COMPACT_MOBILE ? 124 : 136, radius: IS_COMPACT_MOBILE ? 40 : 44, touchPadding: 15 };
export const PICKUP_BTN_CONFIG = { xOffset: IS_COMPACT_MOBILE ? 156 : 176, yOffset: IS_COMPACT_MOBILE ? 124 : 136, radius: IS_COMPACT_MOBILE ? 40 : 44, touchPadding: 20 };
export const DROP_BTN_CONFIG = { xOffset: IS_COMPACT_MOBILE ? 58 : 66, yOffset: IS_COMPACT_MOBILE ? 226 : 248, radius: IS_COMPACT_MOBILE ? 36 : 40, touchPadding: 15 };
export const ATTACK_BTN_CONFIG = { xOffset: IS_COMPACT_MOBILE ? 146 : 158, yOffset: IS_COMPACT_MOBILE ? 226 : 248, radius: IS_COMPACT_MOBILE ? 50 : 54, touchPadding: 20 };

export const HOTBAR_CONFIG = {
    slotSize: isMobile ? (IS_COMPACT_MOBILE ? 62 : 68) : 60,
    gap: isMobile ? (IS_COMPACT_MOBILE ? 8 : 10) : 10,
    padding: isMobile ? (IS_COMPACT_MOBILE ? 10 : 11) : 10,
    marginBottom: isMobile ? (IS_COMPACT_MOBILE ? 18 : 22) : 20,
    touchPadding: isMobile ? 30 : 20
};

export const ACCESSORY_SLOT_CONFIG = {
    size: Math.round(HOTBAR_CONFIG.slotSize * (isMobile ? 1.1 : 1.05)),
    gap: isMobile ? (IS_COMPACT_MOBILE ? 10 : 12) : 12,
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
    { value: '480p', label: '480p (720x480)', width: 720, height: 480 },
    { value: '720p', label: '720p (1280x720)', width: 1280, height: 720 },
    { value: '1080p', label: '1080p (1920x1080) (recommended)', width: 1920, height: 1080 },
    { value: '1440p', label: '2K: 1440p (2560x1440)', width: 2560, height: 1440 },
    { value: '2160p', label: '4K (Ultra HD): 2160p (3840x2160)', width: 3840, height: 2160 },
    { value: '4320p', label: '8K (Ultra HD): 4320p (7680x4320)', width: 7680, height: 4320 }
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
            'Added sword3 (dropped only from snow biome chests)',
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
            "Added sword8."
        ],
        date: '2026-02-22'
    },
    {
        version: '1.4.0',
        changes: [
            "Added tutorial world for new players",
            "Revamped ground & obstacle textures.",
            "Accessories are droppable.",
            "Chest's do not drop weapons anymore, only coins.",
            "Green, yellow, and red health-bars.",
            "Slightly nerfed Minotaur miniboss, but it will grow more dangerous the closer it comes to death.",
            "Minotaur drops: coins, sword8 (25%), and the minotaur hat. (25%)",
            "Less lag when the an entity uses the energy burst ability.",
            "Some bug fixes",
        ],
        date: '2026-03-01'
    },
    {
        version: '1.4.1',
        changes: [
            "Added player kill counter in UI",
            "Processing optimization (better performance)",
            "Players regenerate 60% slower when in combat.",
            "Added NPC players!",
        ],
        date: '2026-03-03'
    },
    {
        version: '1.4.2',
        changes: [
            "Players can now buy XP in shop using coins!", 
            "Fixed coin hitbox bug",
            "Added Level system + attribute buffs. Level up, get upgrade points and get better stats!",
            "Mobile UI Fixes.",
            "Fixed extreme lag when energy burst ability is used.",
        ],
        date: '2026-03-05'
    },
    {
        version: '1.5.0',
        changes: [
            "Lower minotaur swing rate",
            "Early game players can neither attack or be attacked by other players.",
            "Slightly more realistic & advanced NPC logic",
            "Slight tutorial rework",
            "Added special abilities for the bush cloak, dark cloak, alien antennas, sunglasses and viking hat!",
            "Better performance; Less stuttering.",
            "New commands",
            "Better UX for commands",
            "Small bug fixes",
            "Added bridges to center river",
            "Longer agro mob melee cooldown time",
            "Fixed polar bear agro bug",
            "Other players can now be seen as red dots on the minimap."
        ],
        date: '2026-03-18'
    },
    {
        version: '1.6.0',
        changes: [
            "Less client lag!",
            "New weapon category: SPEARS!",
            "New swords!",
            "Users can now select their player's color",
            "More chest spawns!",
            "Biome Update: New Desert & Volcanic biomes!",
            "Structure Update: New horizantal river, and other river tweaks. ",
            "Smaller Map: 15000² -> 10000²",
            "New Dimension: Root Dimension",
            "First Main Boss: Root Walker",
            "Dropped items will now despawn after 100 seconds instead of 10.",
            "Accessories cost more and can also be sold.",
            "New Item: Hearty Essence. Can be consumed to gain 15 health or can be used to buy Heart Shades in the shop. Obtained from killing the hearty mob.",
            "New accessory: Heart Shades. Passive Ability: 30% faster regen speed. Active Ability: Gain 50% of your max health and faster regen speed is boosted to 60% for 3 seconds.",
            "Players can now use their sword while in the river, but it is debuffed.",
            "UI/UX Revamp",
            "Added logo.",
            "Better projectile collisions",
            "Fixed mobile crash bug",
            "Fixed bots clumping in safe zone.",
            "Fixed Bug: Early game NPCs fleeing from peaceful polar bears",
        ],
        date: '2026-04-05'
    },
    {
        version: '1.6.1',
        changes: [
            "New rock structures & new structure sprites!",
            "Less mobs",
            "Fixed spectate jitter bug",
            "Fixed bots clumping",
            "Improved clientside performance & serverside processing",
            "Fixed general pre-game tutorial bug.",
            "Fixed root walker dimension bug",
            "Fixed chests not respawning",
            "Fixed persistent invisible & ghost coins.",
            "Players can now register, sign in, and view the daily/week/monthly leaderboard along with other stats.",
            "Slight UI Tweaks",
            "Players can chat and view chats via the global chat.",
            "Minotaur miniboss now spawns in the magma biome.",
            "sword12 and spear12 both have longer cooldowns.",
            "Players now gain 20 total health added to their max health per upgrade instead of 12."
        ],
        date: '2026-04-16',
    },
    {
        version: '1.6.2',
        changes: [
            "Bots are now more spread out across the map.",
            "Fixed mob angle offset bug.",
            "Hearty essence now gives 15 hp instead of 5 when used.",
            "Fix interdimensional audio leak bug.",
            "Better performance on high ROV.",
            "New Mobs: Rat, Tortoise, Bunny, Iguana, Fox, Ostrich and Elephant!",
            "New Admin Commands.",
            "Revamped Boss Fights.",
            "Back to old UI!",
            "Bosses can now push obstacles, such as rocks.",
            "ALL BOSSES ADDED: There is one boss fight in every biome.",
            "New Boss: Inferno Beast (Volcanic Biome)",
            "New Boss: Dune Behemoth (Desert Biome)",
            "New Boss: The Yeti (Snow Biome)",
        ],
        date: '2026-06-9'
    },
    {
        version: '1.6.3',
        changes: [
            "Fixed chests not respawning (again)",
            "Fixed audio spam bug",
            "Coins are not stored in the inventory anymore.",
            "Minotaur's energy burst ability range & damage have been decreased.",
            "Improved Linear Interpolation",
            "Major client performance improvements",
            "Weapon Reworks!",
            "Spears now do 2x less damage per hit",
            "New Weapon Class: Axe",
            "New Weapon Class: Boomerang",
            "Max level increased to 45",
            "Minotaurs are now smaller",
            "Upgrade bars now have 15 stages instead of 10.",
            "Weapons and upgrades are more balanced."
        ],
        date: '2026-06-30'
    }
];

export const version = UPDATES_LOG[UPDATES_LOG.length - 1].version;
