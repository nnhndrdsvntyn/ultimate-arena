import {
    ENTITIES
} from './game.js';
import {
    Vars,
    camera,
    LC,
    Settings
} from './client.js';
import {
    TPS,
    dataMap,
    isSwordRank
} from './shared/datamap.js';

export class Player {
    constructor(id, x, y) {
        this.id = id;

        this.x = x;
        this.newX = x;
        this.y = y;
        this.newY = y;

        this.score = 0;
        this.newScore = 0;

        this.swingState = 0;
        this.newSwingState = 0;
        this.swordAngleOffset = -Math.PI / 2;

        this.hasWeapon = true;

        this.serverAttributes = {
            speed: dataMap.PLAYERS.baseMovementSpeed,
            damage: 0,
        };

        this.weaponRank = 1;

        this.health = undefined;
        this.maxHealth = undefined;

        this.hasShield = false;
        this.isAlive = false;

        this.username = "";
        this.chatMessage = "";

        this.newAngle = 0;
        this.angle = 0;

        this.radius = dataMap.PLAYERS.baseRadius;

        ENTITIES.PLAYERS[id] = this;
    }
    update() {
        const lerpFactor = (TPS.clientCapped / TPS.server) / 10;

        if (typeof this.newX === 'undefined' || typeof this.newY === 'undefined') return;

        // lerp if x, y is NOT UNDEFINED, else don't lerp and change x, y directly.
        if (typeof this.x !== 'undefined') {
            this.x = this.x + (this.newX - this.x) * lerpFactor;
        } else {
            this.x = this.newX
        }
        if (typeof this.y !== 'undefined') {
            this.y = this.y + (this.newY - this.y) * lerpFactor;
        } else {
            this.y = this.newY
        };

        // update score
        this.score = this.newScore;

        // lerp swing state
        const delta = this.newSwingState - this.swingState;

        // snap if delta is tiny
        if (Math.abs(delta) < 0.01) {
            this.swingState = this.newSwingState;
        } else if (this.newSwingState < this.swingState) {
            // if the new swing state is lower than the current, then automcailly just set it, dont lerp.
            this.swingState = this.newSwingState;
        } else {
            this.swingState += delta * lerpFactor;
        }

        // lerp angle for other players
        if (this.id != Vars.myId) {
            this.angle += (((this.newAngle - this.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI) * lerpFactor);
        }

        // keep angle within range
        this.angle = ((this.angle + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
    }
    draw() {
        if (typeof this.x === 'undefined' || typeof this.y === 'undefined') return;

        const screenPosX = this.x - camera.x;
        const screenPosY = this.y - camera.y;

        if (!this.isAlive) return;

        if (this.hasShield) {
            LC.drawImage({
                name: 'spawn-zone-shield',
                pos: [screenPosX - this.radius * 1.5, screenPosY - this.radius * 1.5],
                size: [this.radius * 3, this.radius * 3],
                transparency: 0.5
            });
        }

        this.swordAngleOffset = (this.swingState * (Math.PI / 6)) - (Math.PI / 2);
        const angleRad = this.angle + this.swordAngleOffset;

        let currentRank = this.weaponRank || 0;
        // If we are dragging the currently selected item OR if it's currently thrown, hide it from the player's hand
        if ((this.id === Vars.myId && Vars.dragSlot !== -1 && Vars.dragSlot === Vars.selectedSlot) || currentRank > 127) {
            currentRank = 0;
        }

        if (isSwordRank(currentRank)) {
            const swordWidth = dataMap.SWORDS.imgs[currentRank]?.swordWidth || 100;
            const swordHeight = dataMap.SWORDS.imgs[currentRank]?.swordHeight || 50;

            // move origin to the handle instead of center
            const offsetX = Math.cos(angleRad) * (this.radius + swordWidth / 2);
            const offsetY = Math.sin(angleRad) * (this.radius + swordWidth / 2);

            let swordImgName = `swords-sword${currentRank}`;
            if (!LC.images[swordImgName]) {
                swordImgName = `swords-wipsword`;
            }

            if (this.hasWeapon) {
                LC.drawImage({
                    name: swordImgName,
                    pos: [
                        screenPosX + offsetX - swordWidth / 2,
                        screenPosY + offsetY - swordHeight / 2
                    ],
                    size: [swordWidth, swordHeight],
                    rotation: angleRad
                });
            }
        }

        // actual image
        LC.drawImage({
            name: dataMap.PLAYERS.imgs[1].name, // player default
            pos: [screenPosX - this.radius, screenPosY - this.radius],
            size: [this.radius * 2, this.radius * 2],
            rotation: this.angle,
        });

        // draw health as bar
        if (this.health !== undefined && this.maxHealth !== undefined) {
            const barWidth = this.radius * 2;
            const barHeight = 5;
            const healthPercentage = this.health / this.maxHealth;

            // Background of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 5],
                size: [barWidth, barHeight],
                color: 'red',
                cornerRadius: 2
            });

            // Foreground of the health bar
            LC.drawRect({
                pos: [screenPosX - barWidth / 2, screenPosY + this.radius + 5],
                size: [barWidth * healthPercentage, barHeight],
                color: 'lime',
                cornerRadius: 2
            });
        }

        // draw chat
        if (this.chatMessage !== "") {
            const chatText = this.chatMessage;
            const chatMetrics = LC.measureText({
                text: chatText,
                font: '17px Arial'
            });
            const padding = 5;
            LC.drawRect({ // chat bubble
                pos: [screenPosX - chatMetrics.width / 2 - padding, screenPosY - this.radius - 30 - 20 - padding],
                size: [chatMetrics.width + padding * 2, 20 + padding * 1.5],
                color: 'rgba(64, 64, 64, 0.7)',
                cornerRadius: 5
            });


            LC.drawText({
                text: chatText,
                pos: [screenPosX - chatMetrics.width / 2, screenPosY - this.radius - 35],
                color: 'white',
                font: '17px Arial'
            });
        }

        // draw username as text
        const usernameText = this.username;
        const usernameMetrics = LC.measureText({
            text: usernameText,
            font: 'bold 16px Arial'
        });
        let idText = "";
        let idMetrics = {
            width: 0
        };

        if (Settings.showPlayerIds) {
            idText = ` (${this.id})`;
            idMetrics = LC.measureText({
                text: idText,
                font: 'bold 16px Arial'
            });
        }

        const totalWidth = usernameMetrics.width + idMetrics.width;

        LC.drawText({
            text: usernameText,
            pos: [screenPosX - totalWidth / 2, screenPosY - this.radius - 5],
            color: 'white',
            font: 'bold 16px Arial'
        });

        if (Settings.showPlayerIds) {
            LC.drawText({
                text: idText,
                pos: [screenPosX - totalWidth / 2 + usernameMetrics.width, screenPosY - this.radius - 5],
                color: 'lightgray',
                font: 'bold 16px Arial'
            });
        };

        if (Settings.drawHitboxes) {
            LC.drawCircle({
                pos: [screenPosX, screenPosY],
                radius: this.radius,
                color: 'red',
                transparency: 0.5
            });
        }
    }
}
