import {
    parsePacket
} from './parser.js';
import {
    LibCanvas
} from './libcanvas.js';
import {
    ENTITIES
} from './game.js';
import {
    dataMap
} from './shared/datamap.js';
// window.ENTITIES = ENTITIES;
import {
    MAP_SIZE
} from './game.js';
// settings
export const Settings = {
    renderGrid: false,
    drawHitboxes: false,
    showPlayerIds: false,
    showMobsOnMinimap: false,
    showPlayersOnMinimap: false,
    showChestsOnMinimap: false,
}
window.Settings = Settings;

import {
    initializeUI,
    updateShieldUI,
    updateHUDVisibility,
    THROW_BTN_CONFIG,
    isMobile
} from './ui.js';

import {
    encodeUsername
} from './helpers.js';

// variables
export const Vars = {
    lastDiedTime: 0,
    myId: 0,
    ping: 0,
    lastSentPing: 0
}

export const ws = new WebSocket(`ws://${location.host}`);
ws.binaryType = 'arraybuffer';
window.ws = ws;

export const camera = {
    x: 0,
    y: 0,
    target: {
        x: 0,
        y: 0
    }
}

export const LC = new LibCanvas();
// window.LC = LC;
LC.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Loading Screen State
const loadingState = {
    active: true,
    progress: 0,
    header: 'Initializing...',
    subText: '',
    totalAssets: 0,
    loadedAssets: 0,
    connected: false,
    alpha: 1,
    fadeOut: false
};

async function loadAssets() {
    const assets = [
        ...Object.values(dataMap.AUDIO).map(a => ({
            type: 'audio',
            ...a
        })),
        ...Object.values(dataMap.UI).map(i => ({
            type: 'image',
            ...i
        })),
        ...Object.values(dataMap.ACCESSORIES).map(i => ({
            type: 'image',
            ...i
        })),
        ...Object.values(dataMap.OBJECTS).map(i => ({
            type: 'image',
            ...i,
            name: i.imgName,
            src: i.imgSrc
        })),
        ...Object.values(dataMap.otherImgs).map(i => ({
            type: 'image',
            ...i
        })),
        ...Object.values(dataMap.PLAYERS.imgs).map(i => ({
            type: 'image',
            ...i
        })),
        ...Object.values(dataMap.SWORDS.imgs).map(i => ({
            type: 'image',
            ...i
        })),
        ...Object.values(dataMap.MOBS).map(i => ({
            type: 'image',
            ...i,
            name: i.imgName,
            src: i.imgSrc
        })),
        ...Object.values(dataMap.STRUCTURES).map(i => ({
            type: 'image',
            ...i,
            name: i.imgName,
            src: i.imgSrc
        })),
        ...Object.values(dataMap.PROJECTILES).map(i => ({
            type: 'image',
            ...i,
            name: i.imgName,
            src: i.imgSrc
        })),
    ];

    loadingState.totalAssets = assets.length;
    loadingState.header = 'Loading Assets';

    for (const asset of assets) {
        loadingState.subText = `Loading ${asset.src.split('/').pop()}...`;
        if (asset.type === 'audio') {
            await LC.loadAudio({
                name: asset.name,
                src: asset.src
            });
        } else {
            await LC.loadImage({
                name: asset.name,
                src: asset.src
            });
        }
        loadingState.loadedAssets++;
        loadingState.progress = (loadingState.loadedAssets / loadingState.totalAssets) * 0.99; // 99% for assets
        await new Promise(r => r());
    }

    loadingState.header = 'Loaded Assets';
    loadingState.subText = '';
    loadingState.progress = 0.99;
}

function drawLoadingScreen() {
    if (!loadingState.active) return;

    LC.ctx.save();
    LC.ctx.setTransform(1, 0, 0, 1, 0, 0);
    LC.ctx.fillStyle = '#0f172a'; // Match sleek dark mode
    LC.ctx.fillRect(0, 0, LC.width, LC.height);

    const barWidth = 400;
    const barHeight = 6;
    const x = LC.width / 2 - barWidth / 2;
    const y = LC.height / 2 + 50;

    // Progress Bar Background
    LC.drawRect({
        pos: [x, y],
        size: [barWidth, barHeight],
        color: 'rgba(255, 255, 255, 0.05)',
        cornerRadius: 3
    });

    // Progress Bar Fill
    LC.drawRect({
        pos: [x, y],
        size: [barWidth * loadingState.progress, barHeight],
        color: '#38bdf8', // Theme blue
        cornerRadius: 3
    });

    // Header
    LC.drawText({
        text: loadingState.header.toUpperCase(),
        pos: [LC.width / 2, y - 45],
        font: '900 32px Inter, sans-serif',
        color: 'white',
        textAlign: 'center'
    });

    // Fine Print / SubText
    if (loadingState.subText) {
        LC.drawText({
            text: loadingState.subText,
            pos: [LC.width / 2, y - 15],
            font: '400 13px Inter, sans-serif',
            color: 'rgba(255, 255, 255, 0.35)',
            textAlign: 'center'
        });
    }

    // Percentage
    LC.drawText({
        text: `${Math.floor(loadingState.progress * 100)}%`,
        pos: [LC.width / 2, y + 25],
        font: '600 12px Inter, sans-serif',
        color: 'rgba(56, 189, 248, 0.5)',
        textAlign: 'center'
    });

    if (loadingState.fadeOut) {
        loadingState.alpha -= 0.05;
        if (loadingState.alpha <= 0) {
            loadingState.active = false;
        }
        LC.ctx.globalAlpha = loadingState.alpha;
    }
    LC.ctx.restore();
}

// Override render to include loading screen
const originalRender = render;
window.render = function () {
    if (loadingState.active) {
        LC.clearCanvas();
        drawLoadingScreen();
        if (loadingState.connected && loadingState.loadedAssets === loadingState.totalAssets && !loadingState.fadeOut) {
            setTimeout(() => {
                loadingState.fadeOut = true;
            }, 500);
        }
        requestAnimationFrame(window.render);
    } else {
        LC.ctx.globalAlpha = 1;
        document.getElementById('game-hud').style.display = 'block';
        originalRender();
    }
};

(async () => {
    // Start Loading Screen Animation
    requestAnimationFrame(window.render);

    // Setup WebSocket Handlers IMMEDIATELY to avoid missing the ID message
    ws.onopen = () => {
        console.log('%cConnected to server', 'color: lime; font-weight: bold;');
        if (loadingState.loadedAssets === loadingState.totalAssets) {
            loadingState.header = 'Connected!';
            loadingState.subText = '';
            loadingState.progress = 1;
        }
    };

    ws.onclose = () => {
        console.log('%cDisconnected from server', 'color: red; font-weight: bold;');
        if (!cantJoin) {
            // window.location.reload();
        }
    };

    ws.onmessage = (event) => {
        if (!Vars.myId) {
            // If it's a string, it's our ID
            if (typeof event.data === 'string') {
                Vars.myId = parseInt(event.data);
                console.log("My ID:", event.data);
                loadingState.connected = true;
                return;
            }
            // If it's not a string (i.e. binary), it's likely an error/kick packet
            // Parse it to show the alert, then stop processing
            parsePacket(event.data);
            cantJoin = true;
            return;
        }
        parsePacket(event.data);
    };

    await loadAssets();

    if (loadingState.connected) {
        loadingState.header = 'Connected!';
        loadingState.subText = '';
        loadingState.progress = 1;
    } else {
        if (cantJoin) {
            loadingState.header = 'Unable to join server';
            loadingState.subText = 'Either the game is full, or you have too many connections on this IP.';
        } else {
            loadingState.header = 'Connecting to server...';
            loadingState.subText = '';
        }
    }
})();

let cantJoin = false;

const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('homeUsrnInput');
usernameInput.value = localStorage.username || '';
const homeScreen = document.getElementById('home-screen');

if (joinBtn) {
    joinBtn.onclick = () => {
        const username = usernameInput.value;
        // save username to local storage.
        localStorage.username = username;
        if (performance.now() - Vars.lastDiedTime > 1700) {
            ws.send(encodeUsername(username));
            LC.zoomIn();
        }
    }
}

// render loop
function beginWorld() {
    LC.ctx.save();
    LC.ctx.translate(LC.width / 2, LC.height / 2);
    LC.ctx.scale(LC.zoom, LC.zoom);
    LC.ctx.translate(-LC.width / 2, -LC.height / 2);
}

function endWorld() {
    LC.ctx.restore();
}

// water offset
let offset = 0;

function render() {
    let localPlayer = ENTITIES['PLAYERS'][Vars.myId];
    // 1. Update all entity states (lerps) FIRST
    for (const player of Object.values(ENTITIES.PLAYERS)) player.update?.();
    for (const mob of Object.values(ENTITIES.MOBS)) mob.update?.();
    for (const projectile of Object.values(ENTITIES.PROJECTILES)) projectile.update?.();

    // 2. Smooth Zoom Logic (Fixes dilation jitter)
    let targetZoom = 0.7; // default for dead
    if (localPlayer?.isAlive) {
        targetZoom = 1.0;
        const inWater = localPlayer.x > MAP_SIZE[0] * 0.47 && localPlayer.x < MAP_SIZE[0] * 0.53;
        const inShield = localPlayer.hasShield;
        if (inWater || inShield) {
            targetZoom = 1.3;
        }
    }

    if (Math.abs(LC.zoom - targetZoom) > 0.001) {
        if (LC.zoom < targetZoom) LC.zoomIn();
        else LC.zoomOut();
    } else {
        LC.zoom = targetZoom; // Snap to target to avoid floating point drift
    }


    // 3. Centralized Camera Update (Fixes jitter)
    if (localPlayer) {
        camera.target.x = localPlayer.x;
        camera.target.y = localPlayer.y;
        camera.x = camera.target.x - (LC.width / 2);
        camera.y = camera.target.y - (LC.height / 2);
    }


    LC.ctx.setTransform(1, 0, 0, 1, 0, 0);

    LC.clearCanvas();
    beginWorld();

    LC.drawRect({
        pos: [-MAP_SIZE[0] / 2 - camera.x, -MAP_SIZE[1] / 2 - camera.y],
        size: [MAP_SIZE[0] * 0.97, MAP_SIZE[1] + MAP_SIZE[1] / 2 + 2500],
        color: 'rgba(20, 80, 20, 1)'
    });
    LC.drawRect({
        pos: [(MAP_SIZE[0] * 0.47) - camera.x, -(MAP_SIZE[1] * 0.5) - camera.y],
        size: [MAP_SIZE[0] * 0.06, MAP_SIZE[1] + MAP_SIZE[1] / 2 + 2500],
        color: 'rgba(20, 80, 150, 1)'
    });
    LC.drawRect({
        pos: [MAP_SIZE[0] * 0.53 - camera.x, -MAP_SIZE[1] / 2 - camera.y],
        size: [MAP_SIZE[0] * 0.97, MAP_SIZE[1] + MAP_SIZE[1] / 2 + 2500],
        color: 'rgba(120, 120, 120, 1)'
    });

    LC.drawRect({
        pos: [0 - camera.x, 0 - camera.y],
        size: [MAP_SIZE[0] * 0.47, MAP_SIZE[1]],
        color: 'rgba(34, 139, 34, 0.61)'
    });
    // Draw Water Background
    LC.drawRect({
        pos: [MAP_SIZE[0] * 0.47 - camera.x, 0 - camera.y],
        size: [MAP_SIZE[0] * 0.06, MAP_SIZE[1]],
        color: 'rgba(40, 113, 254, 0.5)'
    });
    const waterStartX = MAP_SIZE[0] * 0.47;
    const waterStartY = -1000;
    const waterWidth = MAP_SIZE[0] * 0.06;
    const waterHeight = MAP_SIZE[1] + 2000;
    const segmentHeight = 400; // Fixed segment height for consistent tiling

    // Update offset (conveyor belt speed)
    offset = (offset || 0) + 2;
    if (offset >= segmentHeight) offset -= segmentHeight;

    // Draw enough segments to cover the height plus one for the conveyor wrap
    for (let i = -1; i <= Math.ceil(waterHeight / segmentHeight); i++) {
        const segmentY = waterStartY + (i * segmentHeight) + offset;

        // Only draw if within reasonable bounds of the water area
        if (segmentY + segmentHeight < waterStartY - segmentHeight || segmentY > waterStartY + waterHeight + segmentHeight) continue;

        LC.drawImage({
            name: 'water',
            pos: [waterStartX - camera.x, segmentY - camera.y],
            size: [waterWidth, segmentHeight],
            transparency: 0.5
        });
    }
    LC.drawRect({
        pos: [MAP_SIZE[0] * 0.53 - camera.x, 0 - camera.y],
        size: [MAP_SIZE[0] * 0.47, MAP_SIZE[1]],
        color: 'rgba(200, 200, 200, 1)'
    });

    if (localPlayer && Settings.renderGrid) {
        const gridSize = 100;
        const renderDistance = 2500; // Render grid 2500 units around the player

        const playerGridX = Math.floor(localPlayer.x / gridSize) * gridSize;
        const playerGridY = Math.floor(localPlayer.y / gridSize) * gridSize;

        const worldMinX = playerGridX - renderDistance;
        const worldMaxX = playerGridX + renderDistance;
        const worldMinY = playerGridY - renderDistance;
        const worldMaxY = playerGridY + renderDistance;

        LC.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; // Grid line color
        LC.ctx.lineWidth = 1;

        // Draw vertical grid lines
        for (let x = worldMinX; x <= worldMaxX; x += gridSize) {
            LC.ctx.beginPath();
            LC.ctx.moveTo(x - camera.x, worldMinY - camera.y);
            LC.ctx.lineTo(x - camera.x, worldMaxY - camera.y);
            LC.ctx.stroke();
        }

        // Draw horizontal grid lines 
        for (let y = worldMinY; y <= worldMaxY; y += gridSize) {
            LC.ctx.beginPath();
            LC.ctx.moveTo(worldMinX - camera.x, y - camera.y);
            LC.ctx.lineTo(worldMaxX - camera.x, y - camera.y);
            LC.ctx.stroke();
        }
    }
    for (const structure of Object.values(ENTITIES.STRUCTURES)) {
        structure.draw();
    }
    for (const object of Object.values(ENTITIES.OBJECTS)) {
        object.draw();
    }
    for (const mob of Object.values(ENTITIES.MOBS)) {
        mob.draw();
    }
    for (const projectile of Object.values(ENTITIES.PROJECTILES)) {
        projectile.draw();
    }
    for (const player of Object.values(ENTITIES.PLAYERS)) {
        player.draw();
    }

    // draw bushes on top of players
    for (const structure of Object.values(ENTITIES.STRUCTURES)) {
        if (structure.type === 3) {
            const screenPosX = structure.x - camera.x;
            const screenPosY = structure.y - camera.y;
            let transparency = 0.5;
            let distSqrd = (structure.x - localPlayer.x) ** 2 + (structure.y - localPlayer.y) ** 2;
            if (structure.radius ** 2 + localPlayer.radius ** 2 < distSqrd) transparency = 1;
            LC.drawImage({
                name: 'structures-bush1',
                pos: [screenPosX - structure.radius, screenPosY - structure.radius],
                size: [structure.radius * 2, structure.radius * 2],
                transparency: transparency
            });
            if (Settings.drawHitboxes) {
                LC.drawCircle({
                    color: 'blue',
                    pos: [screenPosX, screenPosY],
                    radius: structure.radius,
                    transparency: 0.5
                });
            }
        }
    }

    endWorld();

    if (homeScreen) {
        const isAlive = localPlayer && localPlayer.isAlive;
        updateHUDVisibility(isAlive);
        if (isAlive) {
            homeScreen.style.display = 'none';
        } else {
            homeScreen.style.display = 'flex';
            if (joinBtn) {
                joinBtn.style.transition = 'transform 0.1s, opacity 0.2s';
                if (performance.now() - Vars.lastDiedTime < 1700) {
                    joinBtn.style.opacity = 0.5;
                    joinBtn.style.cursor = 'default';
                    joinBtn.style.pointerEvents = 'none';
                    joinBtn.style.transform = 'scale(1)';
                } else {
                    joinBtn.style.opacity = 1;
                    joinBtn.style.cursor = 'pointer';
                    joinBtn.style.pointerEvents = 'auto';
                    if (joinBtn.matches(':hover')) {
                        joinBtn.style.transform = 'scale(1.1)';
                    } else {
                        joinBtn.style.transform = 'scale(1)';
                    }
                }
            }
        }
    }

    if (!localPlayer || !localPlayer.isAlive) {
        updateShieldUI(false);
        setTimeout(() => {
            render();
        }, 1000 / TPS.clientCapped)
        return;
    }
    updateShieldUI(localPlayer.hasShield);

    // lerp local player's score
    const lerpFactor = (TPS.clientCapped / TPS.server) / 10;
    const targetScore = Number(localPlayer?.newScore);
    localPlayer.score += (targetScore - localPlayer.score) * (lerpFactor / 3);
    if (targetScore - localPlayer.score < 0.01) {
        localPlayer.score = targetScore; // automatically set score to newScore if difference is close enough to new score
    }

    // info box (top left of screen)
    if (localPlayer) {
        const textX = `x: ${localPlayer.x.toFixed(0)}`;
        const textY = `y: ${localPlayer.y.toFixed(0)}`;
        const textScore = `score: ${Number(localPlayer.score).toFixed(0)}`;
        const textPing = `ping: ${Vars.ping.toFixed(0)}`;

        const metricsX = LC.measureText({
            text: textX,
            font: '20px Arial'
        });
        const metricsY = LC.measureText({
            text: textY,
            font: '20px Arial'
        });
        const metricsScore = LC.measureText({
            text: textScore,
            font: '20px Arial'
        });
        const metricsPing = LC.measureText({
            text: textPing,
            font: '20px Arial'
        });

        const maxWidth = Math.max(metricsX.width, metricsY.width, metricsScore.width + metricsPing.width);
        const totalHeight = metricsX.height + metricsY.height + metricsScore.height + metricsPing.height + 30; // 15px padding between lines and 10px for top/bottom padding

        LC.drawRect({
            pos: [5, 5],
            size: [maxWidth + 20, totalHeight],
            color: 'rgba(128, 128, 128, 0.5)',
            cornerRadius: 5
        });

        LC.drawText({
            text: textX,
            pos: [15, 25],
            font: '20px Arial',
            color: 'white'
        });
        LC.drawText({
            text: textY,
            pos: [15, 25 + metricsX.height + 5],
            font: '20px Arial',
            color: 'white'
        });
        LC.drawText({
            text: textScore,
            pos: [15, 25 + metricsX.height + 5 + metricsY.height + 5],
            font: '20px Arial',
            color: 'white'
        });
        LC.drawText({
            text: textPing,
            pos: [15, 25 + metricsX.height + 5 + metricsY.height + 5 + metricsScore.height + 5],
            font: '20px Arial',
            color: 'white'
        });
    }

    // level percentage bar
    const currentLevelScore = dataMap.PLAYERS.levels[localPlayer.level].score;
    let nextLevelScore = dataMap.PLAYERS.levels[localPlayer.level + 1]?.score;
    if (nextLevelScore === undefined) {
        nextLevelScore = currentLevelScore; // Use current score if next level doesn't exist
    }

    let percentage = Math.max(0, (localPlayer.score - currentLevelScore) / (nextLevelScore - currentLevelScore));
    if (percentage === Infinity || nextLevelScore === currentLevelScore) {
        percentage = 1;
    }
    const barWidth = LC.width / 1.15;
    const barHeight = LC.height / 20;
    LC.drawRect({
        pos: [LC.width / 2 - barWidth / 2, LC.height - barHeight - 30],
        size: [barWidth, barHeight],
        color: 'gray',
        cornerRadius: 15
    });
    if (percentage > 0) {
        LC.drawRect({
            pos: [LC.width / 2 - barWidth / 2, LC.height - barHeight - 30],
            size: [barWidth * percentage, barHeight],
            color: 'rgba(0, 186, 199, 1)',
            cornerRadius: 15
        });
    }
    LC.drawText({
        text: (percentage * 100).toFixed() + '%',
        pos: [LC.width / 2, LC.height - barHeight],
        font: 'bold 30px Arial',
        color: 'white'
    });

    // Draw Throw Button
    if (localPlayer.hasWeapon && isMobile) {
        const scaleX = LC.width / window.innerWidth;
        const scaleY = LC.height / window.innerHeight;

        const btnX = LC.width - (THROW_BTN_CONFIG.xOffset * scaleX);
        const btnY = LC.height - (THROW_BTN_CONFIG.yOffset * scaleY);
        const radius = THROW_BTN_CONFIG.radius * Math.max(scaleX, scaleY);

        LC.drawCircle({
            pos: [btnX, btnY],
            radius: radius,
            color: 'rgb(69, 69, 69)',
            transparency: 0.8
        });

        // Draw border
        LC.ctx.save();
        LC.ctx.strokeStyle = 'white';
        LC.ctx.lineWidth = 2 * Math.max(scaleX, scaleY);
        LC.ctx.beginPath();
        LC.ctx.arc(btnX, btnY, radius, 0, Math.PI * 2);
        LC.ctx.stroke();
        LC.ctx.restore();

        const fontSize = 13 * Math.max(scaleX, scaleY);
        const textMetrics = LC.measureText({
            text: 'THROW',
            font: `bold ${fontSize}px Arial`
        });
        LC.drawText({
            text: 'THROW',
            pos: [btnX - textMetrics.width / 2, btnY + (fontSize / 3)],
            font: `bold ${fontSize}px Arial`,
            color: 'white'
        });
    }

    // leaderboard
    const leaderboard = ENTITIES.leaderboard
    LC.drawRect({
        color: '#333333',
        pos: [LC.width - 255, 5],
        size: [250, 25 * leaderboard.length + 50],
        transparency: 0.9,
        cornerRadius: 5
    });
    for (let i = 0; i < leaderboard.length; i++) {
        const player = leaderboard[i];
        const score = Number(player.score);
        let formattedScore;
        if (score.toString().includes('e')) {
            formattedScore = score.toExponential(2);
        } else if (score >= 1e15) {
            formattedScore = (score / 1e15).toFixed(2) + 'Q';
        } else if (score >= 1e12) {
            formattedScore = (score / 1e12).toFixed(2) + 'T';
        } else if (score >= 1e9) {
            formattedScore = (score / 1e9).toFixed(2) + 'B';
        } else if (score >= 1e6) {
            formattedScore = (score / 1e6).toFixed(2) + 'M';
        } else if (score >= 1e3) {
            formattedScore = (score / 1e3).toFixed(2) + 'k';
        } else {
            formattedScore = score.toFixed(0);
        }

        let rankText = `${i + 1}. ${player.username.slice(0, 10)}`;
        if (player.username.length > 10) {
            rankText += '...';
        }
        const scoreText = formattedScore;

        const color = player.id === Vars.myId ? 'lime' : 'white';

        // Measure rank text to position score text correctly
        const rankMetrics = LC.measureText({
            text: rankText,
            font: '18px Arial'
        });

        LC.drawText({
            text: rankText,
            pos: [LC.width - 245, 60 + i * 25],
            font: '18px Arial',
            color: color
        });
        LC.drawText({
            text: scoreText,
            pos: [LC.width - 245 + 230 - LC.measureText({
                text: scoreText,
                font: '18px Arial'
            }).width, 60 + i * 25], // Align right
            font: '18px Arial',
            color: color
        });
    }

    LC.drawText({
        text: 'Leaderboard',
        pos: [LC.width - 190, 30],
        font: 'bold 20px Arial',
        color: 'white'
    });

    // Minimap
    const mmSize = 200;
    const mmPadding = 5;
    const mmPosX = LC.width - mmSize - 15;
    const mmPosY = LC.height - mmSize - 120; // Above level bar

    // grayish padding container
    LC.drawRect({
        pos: [mmPosX - mmPadding, mmPosY - mmPadding],
        size: [mmSize + mmPadding * 2, mmSize + mmPadding * 2],
        color: 'rgba(50, 50, 50, 0.4)',
        cornerRadius: 2
    });

    // Left Biome (Green)
    LC.drawRect({
        pos: [mmPosX, mmPosY],
        size: [mmSize * 0.47, mmSize],
        color: 'rgba(34, 139, 34, 0.9)'
    });
    // River (Blue)
    LC.drawRect({
        pos: [mmPosX + (mmSize * 0.47), mmPosY],
        size: [mmSize * 0.06, mmSize],
        color: 'rgba(40, 113, 254, 0.9)'
    });
    // Right Biome (White/Grey)
    LC.drawRect({
        pos: [mmPosX + (mmSize * 0.53), mmPosY],
        size: [mmSize * 0.47, mmSize],
        color: 'rgba(200, 200, 200, 0.9)'
    });

    // Mobs (orange)
    if (Settings.showMobsOnMinimap) {
        for (const mob of Object.values(ENTITIES.MOBS)) {
            const mmX = mmPosX + (mob.x / MAP_SIZE[0]) * mmSize;
            const mmY = mmPosY + (mob.y / MAP_SIZE[1]) * mmSize;
            LC.drawCircle({
                pos: [mmX, mmY],
                radius: 3,
                color: 'orange'
            });
        }
    }

    // Chests (brown)
    if (Settings.showChestsOnMinimap) {
        for (const object of Object.values(ENTITIES.OBJECTS)) {
            if (object.type !== 1) continue; // Only chests
            const mmX = mmPosX + (object.x / MAP_SIZE[0]) * mmSize;
            const mmY = mmPosY + (object.y / MAP_SIZE[1]) * mmSize;
            LC.drawCircle({
                pos: [mmX, mmY],
                radius: 3,
                color: 'brown'
            });
        }
    }

    // Other Players (red)
    if (Settings.showPlayersOnMinimap) {
        for (const player of Object.values(ENTITIES.PLAYERS)) {
            if (!player.isAlive || player.id === Vars.myId) continue;
            const mmX = mmPosX + (player.x / MAP_SIZE[0]) * mmSize;
            const mmY = mmPosY + (player.y / MAP_SIZE[1]) * mmSize;
            LC.drawCircle({
                pos: [mmX, mmY],
                radius: 3,
                color: 'red'
            });
        }
    }

    // Local player position (always show for navigation)
    if (localPlayer) {
        const pMmX = mmPosX + (localPlayer.x / MAP_SIZE[0]) * mmSize;
        const pMmY = mmPosY + (localPlayer.y / MAP_SIZE[1]) * mmSize;
        LC.drawCircle({
            pos: [pMmX, pMmY],
            radius: 3,
            color: 'white'
        });
    }

    setTimeout(() => {
        render();
    }, 1000 / TPS.clientCapped)
}

// update client FPS
initializeUI();
import {
    TPS
} from './shared/datamap.js';
// window.TPS = TPS;
(() => {
    let frames = 0;
    setInterval(() => {
        TPS.clientReal = frames;
        // console.log(TPS.clientReal);
        frames = 0;
    }, 1000);

    function fps() {
        frames++;
        requestAnimationFrame(fps);
    }
    requestAnimationFrame(fps);
})();