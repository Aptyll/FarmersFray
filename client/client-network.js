// Client-side network module for Socket.io communication

export class ClientNetwork {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.isSpectator = false;
        this.roomId = null;
        this.serverGameState = null;
        this.inputQueue = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Event handlers
        this.onConnected = null;
        this.onDisconnected = null;
        this.onGameState = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onReadyUpdate = null;
        this.onCountdown = null;
        this.onGameStart = null;
        this.onChatMessage = null;
        this.onError = null;
    }

    connect(serverUrl = null) {
        // Default to current origin (for production) or localhost:3000 (for development)
        if (!serverUrl) {
            // Check if we're in production (Railway) or development
            const isProduction = window.location.hostname !== 'localhost' &&
                               !window.location.hostname.includes('127.0.0.1');

            if (isProduction) {
                // In production (Railway), connect to the same origin that served the page
                serverUrl = window.location.origin;
            } else {
                // In development, connect to localhost:3000
                serverUrl = `http://localhost:3000`;
            }
        }
        if (this.socket && this.socket.connected) {
            console.warn('Already connected to server');
            return;
        }

        // Check if socket.io client is loaded (from CDN)
        if (typeof io === 'undefined') {
            console.error('Socket.io client not loaded. Waiting for it to load...');
            // Wait a bit for script to load
            setTimeout(() => {
                if (typeof io !== 'undefined') {
                    this.connect(serverUrl);
                } else {
                    console.error('Socket.io client failed to load. Please refresh the page.');
                    alert('Socket.io client failed to load. Please check your internet connection and refresh the page.');
                    if (window.mainMenu) {
                        window.mainMenu.updateConnectionStatus(false);
                    }
                }
            }, 500);
            return;
        }

        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.connected = true;
            this.reconnectAttempts = 0;
            
            // Send queued inputs
            this.flushInputQueue();
            
            if (this.onConnected) {
                this.onConnected();
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connected = false;
            
            // Update connection status if main menu exists
            if (window.mainMenu) {
                window.mainMenu.updateConnectionStatus(false);
            }
            
            if (this.onDisconnected) {
                this.onDisconnected();
            }
        });

        this.socket.on('connect_error', () => {
            // Update connection status if main menu exists
            if (window.mainMenu) {
                window.mainMenu.updateConnectionStatus(false, true);
            }
        });

        this.socket.on('LOBBY_CREATED', (data) => {
            // Handled by createLobby callback
        });

        this.socket.on('LOBBY_LIST', (data) => {
            // Handled by requestLobbyList callback
        });

        this.socket.on('LOBBY_STATE', (data) => {
            console.log('LOBBY_STATE received:', data);
            if (window.lobbyManager) {
                // Add myPlayerId to state
                const stateWithMe = {
                    ...data,
                    myPlayerId: this.playerId
                };
                // Show lobby manager if it's not already visible, otherwise update
                if (window.lobbyManager.overlay && window.lobbyManager.overlay.classList.contains('hidden')) {
                    window.lobbyManager.show(stateWithMe);
                } else {
                    window.lobbyManager.updateLobbyState(stateWithMe);
                }
            }
        });

        this.socket.on('KICKED', (data) => {
            alert(data.message || 'You were kicked from the lobby');
            this.leaveRoom();
            if (window.mainMenu) {
                window.mainMenu.show();
            }
            if (window.lobbyManager) {
                window.lobbyManager.hide();
            }
        });

        this.socket.on('PLAYER_ID_CHANGED', (data) => {
            console.log('Player ID changed:', data);
            // Update our player ID if it's us
            if (this.playerId === data.oldPlayerId) {
                this.playerId = data.newPlayerId;
                console.log(`Your player ID changed from ${data.oldPlayerId} to ${data.newPlayerId}`);
            }
            // Request updated lobby state
            if (this.roomId && !this.isSpectator) {
                this.requestLobbyState();
            }
        });

        this.socket.on('CONNECTED', (data) => {
            this.playerId = data.playerId;
            this.isSpectator = data.isSpectator;
            this.roomId = data.roomId;
            
            console.log(`Connected as ${this.isSpectator ? 'spectator' : `player ${this.playerId}`} in room ${this.roomId}`);
            
            // Request lobby state if not spectator
            if (!this.isSpectator && this.roomId) {
                setTimeout(() => {
                    this.requestLobbyState();
                }, 100);
            }
        });

        this.socket.on('GAME_STATE', (data) => {
            this.serverGameState = data.state;
            
            if (this.onGameState) {
                this.onGameState(data.state, data.tick);
            }
        });

        this.socket.on('PLAYER_JOINED', (data) => {
            // Request updated lobby state
            if (this.roomId && !this.isSpectator) {
                this.requestLobbyState();
            }
            
            if (this.onPlayerJoined) {
                this.onPlayerJoined(data);
            }
        });

        this.socket.on('PLAYER_LEFT', (data) => {
            // Request updated lobby state
            if (this.roomId && !this.isSpectator) {
                this.requestLobbyState();
            }
            
            if (this.onPlayerLeft) {
                this.onPlayerLeft(data);
            }
        });

        this.socket.on('READY_UPDATE', (data) => {
            console.log('READY_UPDATE received:', data);
            // Update ready states from server (for pregame overlay)
            if (data.players && window.updateReadyStates) {
                window.updateReadyStates(data.players);
            }
            
            // Request updated lobby state
            if (this.roomId && !this.isSpectator) {
                this.requestLobbyState();
            }
            
            if (this.onReadyUpdate) {
                this.onReadyUpdate(data.players);
            }
        });

        this.socket.on('COUNTDOWN', (data) => {
            console.log('Countdown:', data.seconds);
            // Request updated lobby state to show countdown in UI
            if (this.roomId && !this.isSpectator) {
                this.requestLobbyState();
            }
            if (this.onCountdown) {
                this.onCountdown(data.seconds);
            }
        });

        this.socket.on('GAME_START', () => {
            console.log('GAME_START event received in client-network');
            // Trigger the handler in game.js
            if (this.onGameStart) {
                console.log('Calling onGameStart callback');
                this.onGameStart();
            }
            // Also trigger via custom event for game.js listener
            window.dispatchEvent(new CustomEvent('gameStart'));
        });

        this.socket.on('READY_UPDATE', (data) => {
            // Update ready states from server
            if (data.players && window.updateReadyStates) {
                window.updateReadyStates(data.players);
            }
        });

        this.socket.on('UNPAUSE_GAME', () => {
            console.log('UNPAUSE_GAME event received - starting game');
            // Unpause the game for all players
            if (window.finishPregameCountdown) {
                window.finishPregameCountdown();
            }
        });

        this.socket.on('CHAT_MESSAGE', (data) => {
            if (this.onChatMessage) {
                this.onChatMessage(data);
            }
        });

        this.socket.on('ERROR', (data) => {
            console.error('Server error:', data.message);
            alert(data.message || 'An error occurred');
            if (this.onError) {
                this.onError(data);
            }
        });
    }

    createLobby(lobbyName, playerName, callback) {
        if (!this.connected) {
            console.warn('Not connected to server');
            if (callback) callback(false, null);
            return;
        }

        // Set up one-time listener for lobby creation response
        const responseHandler = (data) => {
            if (callback) {
                callback(true, data.roomId);
            }
            this.socket.off('LOBBY_CREATED', responseHandler);
        };

        this.socket.on('LOBBY_CREATED', responseHandler);
        this.socket.once('ERROR', (error) => {
            if (callback) {
                callback(false, null);
            }
            this.socket.off('LOBBY_CREATED', responseHandler);
        });

        this.socket.emit('CREATE_LOBBY', {
            lobbyName: lobbyName || `Lobby ${Date.now()}`,
            playerName: playerName || `Player ${Date.now()}`
        });
    }

    requestLobbyList(callback) {
        if (!this.connected) {
            console.warn('Not connected to server');
            if (callback) callback([]);
            return;
        }

        const responseHandler = (data) => {
            if (callback) {
                callback(data.lobbies || []);
            }
        };

        this.socket.once('LOBBY_LIST', responseHandler);
        this.socket.emit('LIST_LOBBIES');
    }

    joinRoom(roomId = null, playerName = null, isSpectator = false) {
        if (!this.connected) {
            console.warn('Not connected to server');
            return;
        }

        this.socket.emit('JOIN_ROOM', {
            roomId,
            playerName: playerName || `Player ${Date.now()}`,
            isSpectator
        });
    }

    requestLobbyState() {
        if (!this.connected) return;
        this.socket.emit('GET_LOBBY_STATE');
    }

    changePlayerTeam(playerId, newTeamId, targetSlotPlayerId = null) {
        if (!this.connected) return;
        this.socket.emit('CHANGE_PLAYER_TEAM', {
            targetPlayerId: playerId,
            newTeamId,
            targetSlotPlayerId: targetSlotPlayerId
        });
    }

    kickPlayer(playerId) {
        if (!this.connected) return;
        this.socket.emit('KICK_PLAYER', {
            targetPlayerId: playerId
        });
    }

    leaveRoom() {
        if (!this.connected) return;
        
        this.socket.emit('LEAVE_ROOM');
        this.roomId = null;
        this.playerId = null;
    }

    sendInput(eventName, data) {
        if (!this.connected) {
            // Queue input for when connection is restored
            this.inputQueue.push({ eventName, data });
            return false;
        }

        this.socket.emit(eventName, data);
        return true;
    }

    flushInputQueue() {
        while (this.inputQueue.length > 0) {
            const input = this.inputQueue.shift();
            this.sendInput(input.eventName, input.data);
        }
    }

    // Convenience methods for common inputs
    selectUnits(unitIds) {
        return this.sendInput('SELECT_UNITS', {
            unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
            timestamp: Date.now()
        });
    }

    moveCommand(unitIds, targetX, targetY) {
        return this.sendInput('MOVE_COMMAND', {
            unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
            targetX,
            targetY,
            timestamp: Date.now()
        });
    }

    attackCommand(unitIds, targetId) {
        return this.sendInput('ATTACK_COMMAND', {
            unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
            targetId,
            timestamp: Date.now()
        });
    }

    buildCommand(buildingType, x, y, workerIds) {
        return this.sendInput('BUILD_COMMAND', {
            buildingType,
            x,
            y,
            workerIds: Array.isArray(workerIds) ? workerIds : [workerIds],
            timestamp: Date.now()
        });
    }

    upgradeCommand(upgradeType) {
        return this.sendInput('UPGRADE_COMMAND', {
            upgradeType,
            timestamp: Date.now()
        });
    }

    siegeCommand(unitIds) {
        return this.sendInput('SIEGE_COMMAND', {
            unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
            timestamp: Date.now()
        });
    }

    sendChatMessage(message, channel = 'all') {
        return this.sendInput('CHAT_MESSAGE', {
            message: String(message).substring(0, 200),
            channel: channel === 'team' ? 'team' : 'all',
            timestamp: Date.now()
        });
    }

    setReadyStatus(ready) {
        return this.sendInput('READY_STATUS', {
            ready: Boolean(ready),
            timestamp: Date.now()
        });
    }

    startGame() {
        return this.sendInput('START_GAME', {});
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
        this.playerId = null;
        this.roomId = null;
        this.serverGameState = null;
    }

    getServerGameState() {
        return this.serverGameState;
    }

    isConnected() {
        return this.connected && this.socket && this.socket.connected;
    }
}

// Create global instance
window.clientNetwork = new ClientNetwork();

