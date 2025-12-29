import { GameState } from './gameState.js';
import { InputHandler } from './inputHandler.js';
import {
    SERVER_TICK_RATE, SERVER_TICK_INTERVAL,
    STATE_BROADCAST_RATE, TICKS_PER_STATE_BROADCAST,
    resourceIncomeRate, resourceUpdateInterval
} from '../shared/constants.js';

export class GameEngine {
    constructor(roomId, io, room) {
        this.roomId = roomId;
        this.io = io;
        this.room = room;
        this.gameState = new GameState();
        this.inputHandler = new InputHandler(this.gameState);
        
        this.currentTick = 0;
        this.tickInterval = null;
        this.lastStateBroadcast = 0;
        this.isRunning = false;
        
        // Timing
        this.lastResourceUpdate = Date.now();
        this.lastUpdateTime = Date.now();
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.gameState.startGame();
        this.setupGame();
        
        // Start tick loop
        this.tickInterval = setInterval(() => {
            this.tick();
        }, SERVER_TICK_INTERVAL);
        
        console.log(`Game engine started for room: ${this.roomId}`);
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        this.gameState.pauseGame();
        
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        
        console.log(`Game engine stopped for room: ${this.roomId}`);
    }

    setupGame() {
        // Initialize game state
        this.gameState.reset();
        
        // TODO: Initialize game objects (bunkers, workers, sight tower)
        // This will be implemented when GameObject classes are extracted
        // For now, this is a placeholder
        
        // Initialize fog of war
        this.gameState.initializeFogOfWar();
        
        // Update supply counts
        this.gameState.updateSupplyCounts();
    }

    tick() {
        if (!this.isRunning || this.gameState.isPaused) return;
        
        const now = Date.now();
        const deltaTime = now - this.lastUpdateTime;
        this.lastUpdateTime = now;
        
        this.currentTick++;
        
        // Process queued inputs
        this.inputHandler.processInputs(this.currentTick);
        
        // Update resources
        this.updateResources(now);
        
        // Update game timer
        if (!this.gameState.isPaused && this.gameState.gameStartTime) {
            const elapsed = (now - this.gameState.gameStartTime) / 1000;
            this.gameState.gameTimeInSeconds = Math.floor(elapsed);
        }
        
        // Update all game objects
        this.updateGameObjects(now);
        
        // Resolve collisions
        this.resolveCollisions();
        
        // Update fog of war
        this.updateFogOfWar();
        
        // Handle deaths and cleanup
        this.handleDeaths();
        
        // Broadcast state every N ticks (20Hz)
        if (this.currentTick % TICKS_PER_STATE_BROADCAST === 0) {
            this.broadcastState();
        }
    }

    updateResources(now) {
        if (now - this.lastResourceUpdate >= resourceUpdateInterval) {
            Object.keys(this.gameState.players).forEach(playerId => {
                const player = this.gameState.players[playerId];
                player.resources += resourceIncomeRate;
            });
            this.lastResourceUpdate = now;
        }
    }

    updateGameObjects(now) {
        // TODO: Update all game objects
        // This will call obj.update(now, this.gameState.gameObjects, this.gameState.players)
        // For now, this is a placeholder
        this.gameState.gameObjects.forEach(obj => {
            if (obj.update && typeof obj.update === 'function') {
                if (obj.type === 'bunker') {
                    obj.update(now, this.gameState.gameObjects, this.gameState.players);
                } else {
                    obj.update(now, this.gameState.gameObjects);
                }
            }
        });
    }

    resolveCollisions() {
        // TODO: Implement collision resolution
        // This will be moved from client game.js
        // For now, this is a placeholder
    }

    updateFogOfWar() {
        // TODO: Update fog of war for all teams
        // This will call fogOfWar.updateTeamVision(teamId, gameObjects)
        // For now, this is a placeholder
    }

    handleDeaths() {
        // Remove dead objects and handle cleanup
        const livingObjects = [];
        
        this.gameState.gameObjects.forEach(obj => {
            if (obj.health > 0) {
                livingObjects.push(obj);
            } else {
                // Handle death logic (award resources, update supply, etc.)
                this.handleObjectDeath(obj);
            }
        });
        
        this.gameState.gameObjects = livingObjects;
        this.gameState.updateSupplyCounts();
    }

    handleObjectDeath(obj) {
        // Find killer and award resources
        // TODO: Implement death handling logic
        // This will be moved from client game.js
    }

    broadcastState() {
        const snapshot = this.gameState.getSnapshot();
        
        // Broadcast to all players and spectators in the room
        this.room.players.forEach((socketId, playerId) => {
            this.io.to(socketId).emit('GAME_STATE', {
                state: snapshot,
                tick: this.currentTick
            });
        });
        
        this.room.spectators.forEach(socketId => {
            this.io.to(socketId).emit('GAME_STATE', {
                state: snapshot,
                tick: this.currentTick
            });
        });
    }

    handleInput(playerId, eventName, data) {
        // Queue input for processing in next tick
        this.inputHandler.queueInput(playerId, eventName, data, this.currentTick);
    }
}

