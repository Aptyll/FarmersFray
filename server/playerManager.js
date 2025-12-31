import { RoomManager } from './roomManager.js';
import { GameEngine } from './gameEngine.js';

export class PlayerManager {
    constructor(io, roomManager) {
        this.io = io;
        this.roomManager = roomManager;
        this.socketToPlayer = new Map(); // socketId -> { playerId, roomId, isSpectator }
        this.playerToSocket = new Map(); // playerId -> socketId
        this.nextPlayerId = 1;
    }

    handleMessage(socket, eventName, data) {
        const playerInfo = this.socketToPlayer.get(socket.id);
        
        switch (eventName) {
            case 'JOIN_ROOM':
                this.handleJoinRoom(socket, data);
                break;
            case 'CREATE_LOBBY':
                this.handleCreateLobby(socket, data);
                break;
            case 'LIST_LOBBIES':
                this.handleListLobbies(socket);
                break;
            case 'GET_LOBBY_STATE':
                if (playerInfo && playerInfo.roomId) {
                    this.handleGetLobbyState(socket, playerInfo);
                }
                break;
            case 'CHANGE_PLAYER_TEAM':
                if (playerInfo && !playerInfo.isSpectator) {
                    this.handleChangePlayerTeam(socket, playerInfo, data);
                }
                break;
            case 'KICK_PLAYER':
                if (playerInfo && !playerInfo.isSpectator) {
                    this.handleKickPlayer(socket, playerInfo, data);
                }
                break;
            case 'LEAVE_ROOM':
                this.handleLeaveRoom(socket);
                break;
            case 'READY_STATUS':
                if (playerInfo && !playerInfo.isSpectator) {
                    this.handleReadyStatus(socket, data);
                }
                break;
            case 'START_GAME':
                if (playerInfo && !playerInfo.isSpectator) {
                    this.handleStartGame(socket);
                }
                break;
            case 'CHAT_MESSAGE':
                if (playerInfo) {
                    this.handleChatMessage(socket, playerInfo, data);
                }
                break;
            case 'START_PREGAME_GAME':
                if (playerInfo && !playerInfo.isSpectator) {
                    this.handleStartPregameGame(socket, playerInfo);
                }
                break;
            default:
                // Other messages will be handled by game engine
                if (playerInfo && playerInfo.roomId) {
                    const room = this.roomManager.getRoom(playerInfo.roomId);
                    if (room && room.gameEngine && room.gameEngine.isRunning) {
                        room.gameEngine.handleInput(playerInfo.playerId || 0, eventName, data);
                    }
                }
                break;
        }
    }

    handleCreateLobby(socket, data) {
        const { playerName } = data || {};

        // Find available player slot for host
        let hostPlayerId = null;
        for (let id = 1; id <= 8; id++) {
            // Check if this player ID is available in any room
            let available = true;
            for (const room of this.roomManager.rooms.values()) {
                if (room.players.has(id)) {
                    available = false;
                    break;
                }
            }
            if (available) {
                hostPlayerId = id;
                break;
            }
        }

        if (!hostPlayerId) {
            socket.emit('ERROR', { message: 'No available player slots' });
            return;
        }

        // Generate sequential lobby name (resets on server restart)
        const lobbyNumber = this.roomManager.rooms.size + 1;
        const autoLobbyName = `Lobby ${lobbyNumber}`;
        const room = this.roomManager.createRoom(null, autoLobbyName, hostPlayerId);
        
        // Join the newly created room as host
        this.handleJoinRoom(socket, { 
            roomId: room.id, 
            playerName: playerName || `Player ${hostPlayerId}`,
            isSpectator: false,
            playerId: hostPlayerId
        });
        
        socket.emit('LOBBY_CREATED', {
            roomId: room.id,
            roomName: room.name,
            hostPlayerId
        });
    }

    handleListLobbies(socket) {
        const lobbies = this.roomManager.getAllRooms();
        socket.emit('LOBBY_LIST', { lobbies });
    }

    handleGetLobbyState(socket, playerInfo) {
        const lobbyState = this.roomManager.getLobbyState(playerInfo.roomId);
        if (lobbyState) {
            socket.emit('LOBBY_STATE', lobbyState);
        }
    }

    handleChangePlayerTeam(socket, playerInfo, data) {
        const { targetPlayerId, newTeamId, targetSlotPlayerId } = data || {};
        const room = this.roomManager.getRoom(playerInfo.roomId);
        
        if (!room) {
            socket.emit('ERROR', { message: 'Room not found' });
            return;
        }

        // Only host can change other players' teams, but players can change their own teams
        const isHost = this.roomManager.isHost(playerInfo.roomId, playerInfo.playerId);
        const isChangingOwnTeam = targetPlayerId === playerInfo.playerId;

        if (!isHost && !isChangingOwnTeam) {
            socket.emit('ERROR', { message: 'Only the host can change other players\' teams' });
            return;
        }

        if (!targetPlayerId || !newTeamId || newTeamId < 1 || newTeamId > 4) {
            socket.emit('ERROR', { message: 'Invalid team change request' });
            return;
        }

        const result = this.roomManager.setPlayerTeam(playerInfo.roomId, targetPlayerId, newTeamId, targetSlotPlayerId);
        if (result && result !== false) {
            // Handle player ID reassignment or swap
            if (result.reassigned) {
                if (result.swapped) {
                    // Handle swap - update both players
                    const socketId1 = room.players.get(result.newPlayerId);
                    const socketId2 = room.players.get(result.swappedOldPlayerId);
                    
                    if (socketId1) {
                        const playerInfo1 = this.socketToPlayer.get(socketId1);
                        if (playerInfo1) {
                            playerInfo1.playerId = result.newPlayerId;
                            this.socketToPlayer.set(socketId1, playerInfo1);
                        }
                        this.playerToSocket.delete(result.oldPlayerId);
                        this.playerToSocket.set(result.newPlayerId, socketId1);
                        
                        this.io.to(socketId1).emit('PLAYER_ID_CHANGED', {
                            oldPlayerId: result.oldPlayerId,
                            newPlayerId: result.newPlayerId,
                            newTeamId: newTeamId
                        });
                    }
                    
                    if (socketId2) {
                        const playerInfo2 = this.socketToPlayer.get(socketId2);
                        if (playerInfo2) {
                            playerInfo2.playerId = result.swappedOldPlayerId;
                            this.socketToPlayer.set(socketId2, playerInfo2);
                        }
                        this.playerToSocket.delete(result.swappedPlayerId);
                        this.playerToSocket.set(result.swappedOldPlayerId, socketId2);
                        
                        this.io.to(socketId2).emit('PLAYER_ID_CHANGED', {
                            oldPlayerId: result.swappedPlayerId,
                            newPlayerId: result.swappedOldPlayerId,
                            newTeamId: room.playerTeams.get(result.swappedOldPlayerId)
                        });
                    }
                } else {
                    // Handle simple reassignment
                    const targetSocketId = room.players.get(result.newPlayerId);
                    if (targetSocketId) {
                        const oldPlayerInfo = this.socketToPlayer.get(targetSocketId);
                        if (oldPlayerInfo) {
                            oldPlayerInfo.playerId = result.newPlayerId;
                            this.socketToPlayer.set(targetSocketId, oldPlayerInfo);
                        }
                        
                        this.playerToSocket.delete(result.oldPlayerId);
                        this.playerToSocket.set(result.newPlayerId, targetSocketId);
                        
                        this.io.to(targetSocketId).emit('PLAYER_ID_CHANGED', {
                            oldPlayerId: result.oldPlayerId,
                            newPlayerId: result.newPlayerId,
                            newTeamId: newTeamId
                        });
                    }
                }
            }
            
            // Broadcast updated lobby state
            this.broadcastLobbyState(playerInfo.roomId);
        } else {
            socket.emit('ERROR', { message: 'Failed to change team (team may be full)' });
        }
    }

    handleKickPlayer(socket, playerInfo, data) {
        const { targetPlayerId } = data || {};
        const room = this.roomManager.getRoom(playerInfo.roomId);
        
        if (!room) {
            socket.emit('ERROR', { message: 'Room not found' });
            return;
        }

        // Only host can kick players
        if (!this.roomManager.isHost(playerInfo.roomId, playerInfo.playerId)) {
            socket.emit('ERROR', { message: 'Only the host can kick players' });
            return;
        }

        if (!targetPlayerId || targetPlayerId === playerInfo.playerId) {
            socket.emit('ERROR', { message: 'Invalid kick request' });
            return;
        }

        // Get target player's socket
        const targetSocketId = room.players.get(targetPlayerId);
        if (!targetSocketId) {
            socket.emit('ERROR', { message: 'Player not found' });
            return;
        }

        // Remove player from room
        this.roomManager.removePlayerFromRoom(playerInfo.roomId, targetPlayerId);
        this.playerToSocket.delete(targetPlayerId);
        
        // Get target socket and disconnect them
        const targetSocket = this.io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.emit('KICKED', { message: 'You were kicked from the lobby' });
            this.handleLeaveRoom(targetSocket);
        }

        // Broadcast updated lobby state
        this.broadcastLobbyState(playerInfo.roomId);
    }

    broadcastLobbyState(roomId) {
        const lobbyState = this.roomManager.getLobbyState(roomId);
        if (!lobbyState) return;

        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        // Broadcast to all players and spectators
        for (const [playerId, socketId] of room.players.entries()) {
            this.io.to(socketId).emit('LOBBY_STATE', lobbyState);
        }

        for (const socketId of room.spectators) {
            this.io.to(socketId).emit('LOBBY_STATE', lobbyState);
        }
    }

    handleJoinRoom(socket, data) {
        const { roomId, playerName, isSpectator = false, playerId: requestedPlayerId = null } = data || {};
        
        if (!roomId) {
            socket.emit('ERROR', { message: 'Room ID required' });
            return;
        }
        
        // Get or create room (only create if roomId is 'default')
        const room = roomId === 'default' 
            ? this.roomManager.getOrCreateRoom(roomId)
            : this.roomManager.getRoom(roomId);
        
        if (!room) {
            socket.emit('ERROR', { message: 'Room not found' });
            return;
        }

        if (isSpectator) {
            // Add as spectator
            if (this.roomManager.addSpectator(room.id, socket.id)) {
                this.socketToPlayer.set(socket.id, {
                    playerId: null,
                    roomId: room.id,
                    isSpectator: true,
                    playerName: playerName || 'Spectator'
                });

                socket.emit('CONNECTED', {
                    playerId: null,
                    isSpectator: true,
                    roomId: room.id,
                    roomState: {
                        state: room.state,
                        players: Array.from(room.players.keys()),
                        readyStatus: Object.fromEntries(room.readyStatus)
                    }
                });

                // Send current game state if game is in progress
                if (room.gameEngine && room.gameEngine.isRunning) {
                    const snapshot = room.gameEngine.gameState.getSnapshot();
                    socket.emit('GAME_STATE', {
                        state: snapshot,
                        tick: room.gameEngine.currentTick
                    });
                }
            } else {
                socket.emit('ERROR', { message: 'Failed to join room' });
            }
        } else {
            // Add as player
            let playerId = requestedPlayerId;
            
            // If no playerId requested, find available slot
            if (!playerId) {
                for (let id = 1; id <= 8; id++) {
                    if (!room.players.has(id)) {
                        playerId = id;
                        break;
                    }
                }
            }

            if (!playerId) {
                socket.emit('ERROR', { message: 'Room is full (max 8 players)' });
                return;
            }

            // Check if playerId is already taken in this room
            if (room.players.has(playerId)) {
                socket.emit('ERROR', { message: 'Player slot already taken' });
                return;
            }

            if (this.roomManager.addPlayer(room.id, playerId, socket.id, playerName)) {
                this.socketToPlayer.set(socket.id, {
                    playerId,
                    roomId: room.id,
                    isSpectator: false,
                    playerName: playerName || `Player ${playerId}`
                });
                this.playerToSocket.set(playerId, socket.id);

                socket.emit('CONNECTED', {
                    playerId,
                    isSpectator: false,
                    roomId: room.id,
                    roomState: {
                        state: room.state,
                        players: Array.from(room.players.keys()),
                        readyStatus: Object.fromEntries(room.readyStatus)
                    }
                });
                
                // Broadcast player joined to others in room
                this.broadcastToRoom(room.id, socket.id, 'PLAYER_JOINED', {
                    playerId,
                    playerName: playerName || `Player ${playerId}`
                });

                // Send lobby state update to all players in room
                this.broadcastLobbyState(room.id);

                // Send current game state if game is in progress
                if (room.gameEngine && room.gameEngine.isRunning) {
                    const snapshot = room.gameEngine.gameState.getSnapshot();
                    socket.emit('GAME_STATE', {
                        state: snapshot,
                        tick: room.gameEngine.currentTick
                    });
                }
            } else {
                socket.emit('ERROR', { message: 'Failed to join room' });
            }
        }
    }

    handleLeaveRoom(socket) {
        const playerInfo = this.socketToPlayer.get(socket.id);
        if (!playerInfo) return;

        const room = this.roomManager.getRoom(playerInfo.roomId);
        if (!room) return;

        const removed = this.roomManager.removeSocket(playerInfo.roomId, socket.id);
        
        if (removed && removed.type === 'player') {
            this.broadcastToRoom(playerInfo.roomId, socket.id, 'PLAYER_LEFT', {
                playerId: removed.playerId
            });
            this.playerToSocket.delete(removed.playerId);
        }

        this.socketToPlayer.delete(socket.id);

        // Cleanup empty rooms
        this.roomManager.cleanupEmptyRooms();
    }

    handleReadyStatus(socket, data) {
        const playerInfo = this.socketToPlayer.get(socket.id);
        if (!playerInfo || playerInfo.isSpectator) return;

        const { ready } = data;
        const room = this.roomManager.getRoom(playerInfo.roomId);
        if (!room) return;

        this.roomManager.setReadyStatus(playerInfo.roomId, playerInfo.playerId, ready);

        // Broadcast ready status update
        this.broadcastToRoom(playerInfo.roomId, null, 'READY_UPDATE', {
            players: Object.fromEntries(room.readyStatus)
        });
        
        // Also broadcast full lobby state
        this.broadcastLobbyState(playerInfo.roomId);
    }

    handleStartGame(socket) {
        const playerInfo = this.socketToPlayer.get(socket.id);
        if (!playerInfo || playerInfo.isSpectator) {
            socket.emit('ERROR', { message: 'Only players can start the game' });
            return;
        }

        const room = this.roomManager.getRoom(playerInfo.roomId);
        if (!room) {
            socket.emit('ERROR', { message: 'Room not found' });
            return;
        }

        // Only host can start the game
        if (!this.roomManager.isHost(playerInfo.roomId, playerInfo.playerId)) {
            socket.emit('ERROR', { message: 'Only the host can start the game' });
            return;
        }

        // Host can start anytime - no restrictions
        // Start countdown
        this.startCountdown(playerInfo.roomId);
    }

    startCountdown(roomId) {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        // Prevent starting countdown if already counting down or playing
        if (room.state === this.roomManager.roomStates.COUNTDOWN || 
            room.state === this.roomManager.roomStates.PLAYING) {
            console.log(`Cannot start countdown: room is already ${room.state}`);
            return;
        }

        // Clear any existing timer
        if (room.countdownTimer) {
            clearInterval(room.countdownTimer);
        }

        this.roomManager.setRoomState(roomId, this.roomManager.roomStates.COUNTDOWN);
        
        let countdown = 5;
        room.countdownSeconds = countdown;

        this.broadcastToRoom(roomId, null, 'COUNTDOWN', { seconds: countdown });

        room.countdownTimer = setInterval(() => {
            countdown--;
            room.countdownSeconds = countdown;

            if (countdown > 0) {
                this.broadcastToRoom(roomId, null, 'COUNTDOWN', { seconds: countdown });
            } else {
                clearInterval(room.countdownTimer);
                room.countdownTimer = null;
                this.startGame(roomId);
            }
        }, 1000);
    }

    handleStartPregameGame(socket, playerInfo) {
        const room = this.roomManager.getRoom(playerInfo.roomId);
        if (!room) return;

        // Only host can start the pregame game
        if (!this.roomManager.isHost(playerInfo.roomId, playerInfo.playerId)) {
            socket.emit('ERROR', { message: 'Only the host can start the game' });
            return;
        }

        // Broadcast unpause game to all players
        console.log(`Host starting pregame game in room: ${playerInfo.roomId}`);
        this.broadcastToRoom(playerInfo.roomId, null, 'UNPAUSE_GAME', {});
    }

    startGame(roomId) {
        const room = this.roomManager.getRoom(roomId);
        if (!room) {
            console.error(`Cannot start game: room ${roomId} not found`);
            return;
        }

        // Prevent starting if already playing
        if (room.state === this.roomManager.roomStates.PLAYING) {
            console.log(`Game already started in room: ${roomId}`);
            return;
        }

        console.log(`Starting game in room: ${roomId} with ${room.players.size} players`);

        this.roomManager.setRoomState(roomId, this.roomManager.roomStates.PLAYING);

        // Initialize game engine if not already initialized
        if (!room.gameEngine) {
            console.log('Creating new GameEngine instance...');
            room.gameEngine = new GameEngine(roomId, this.io, room);
            room.gameEngine.start();
            console.log('GameEngine started');
        } else {
            console.log('GameEngine already exists, restarting...');
            room.gameEngine.start();
        }

        // Broadcast game start to ALL players (including sender)
        console.log('Broadcasting GAME_START to all players...');
        this.broadcastToRoom(roomId, null, 'GAME_START', {});

        console.log(`Game started successfully in room: ${roomId}`);
    }

    handleDisconnect(socket) {
        this.handleLeaveRoom(socket);
    }

    broadcastToRoom(roomId, excludeSocketId, eventName, data) {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        // Broadcast to all players (including sender if excludeSocketId is null)
        for (const [playerId, socketId] of room.players.entries()) {
            if (excludeSocketId === null || socketId !== excludeSocketId) {
                this.io.to(socketId).emit(eventName, data);
            }
        }

        // Broadcast to all spectators
        for (const socketId of room.spectators) {
            if (excludeSocketId === null || socketId !== excludeSocketId) {
                this.io.to(socketId).emit(eventName, data);
            }
        }
    }

    handleChatMessage(socket, playerInfo, data) {
        const room = this.roomManager.getRoom(playerInfo.roomId);
        if (!room) return;

        // Validate message
        const { message, channel } = data;
        if (!message || message.length === 0 || message.length > 200) {
            return;
        }

        const chatData = {
            playerId: playerInfo.playerId,
            playerName: playerInfo.playerName || `Player ${playerInfo.playerId}`,
            message: String(message).substring(0, 200),
            channel: channel === 'team' ? 'team' : 'all',
            timestamp: Date.now()
        };

        // Broadcast to appropriate recipients
        if (channel === 'team' && playerInfo.playerId) {
            // Team chat: only send to players on same team
            const playerTeam = this.getPlayerTeam(playerInfo.playerId);
            if (playerTeam) {
                room.players.forEach((socketId, pid) => {
                    if (this.getPlayerTeam(pid) === playerTeam) {
                        this.io.to(socketId).emit('CHAT_MESSAGE', chatData);
                    }
                });
            }
        } else {
            // All chat: send to everyone
            this.broadcastToRoom(playerInfo.roomId, null, 'CHAT_MESSAGE', chatData);
        }
    }

    getPlayerTeam(playerId) {
        // This will be replaced when gameState is available
        // For now, use team mapping from constants
        const teams = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4 };
        return teams[playerId] || null;
    }

    getPlayerInfo(socketId) {
        return this.socketToPlayer.get(socketId);
    }
}

