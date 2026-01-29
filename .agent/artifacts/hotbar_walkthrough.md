# Hotbar Implementation

I have implemented a hotbar at the bottom of the screen that displays the player's current sword.

## Changes

### 1. UI Module (`public/ui.js`)
- Added `createHotbar(parent)` function to generate the DOM elements for the hotbar.
- Added `updateHotbar(rank)` function to update the sword image based on the player's weapon rank.
- Integrated `createHotbar` into the `initializeUI` function.
- Used inline styles within `createEl` to style the hotbar with a glassmorphism look (blurred background, rounded corners).

### 2. Client Loop (`public/client.js`)
- Imported `updateHotbar` from `ui.js`.
- Called `updateHotbar(localPlayer.weaponRank || 1)` inside the main `render()` loop to ensure the hotbar stays in sync with the player's weapon.

## Features
- **Visuals**: Positioned at the bottom center with a sleek, semi-transparent design.
- **Dynamic Update**: Automatically updates when the player's weapon rank changes.
- **Asset Integration**: Uses the existing sword images from `dataMap.SWORDS.imgs`.
