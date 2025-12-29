export class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.roomStates = {
            WAITING: 'WAITING',
            COUNTDOWN: 'COUNTDOWN',
            PLAYING: 'PLAYING',
            FINISHED: 'FINISHED'
        };
    }

    createRoom(roomId = null, roomName = null, hostPlayerId = null) {
        const id = roomId || `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const room = {
            id,
            name: roomName || id,
            hostPlayerId: hostPlayerId || null, // Player ID of the host
            state: this.roomStates.WAITING,
            players: new Map(), // playerId -> socketId
            playerTeams: new Map(), // playerId -> teamId (1-4)
            playerNames: new Map(), // playerId -> playerName
            spectators: new Set(), // socketIds
            gameEngine: null,
            gameState: null,
            readyStatus: new Map(), // playerId -> boolean
            countdownTimer: null,
            countdownSeconds: 0,
            createdAt: Date.now()
        };

        this.rooms.set(id, room);
        console.log(`Room created: ${id} (${room.name}) by host ${hostPlayerId}`);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    getOrCreateRoom(roomId = null) {
        if (roomId && this.rooms.has(roomId)) {
            return this.rooms.get(roomId);
        }
        return this.createRoom(roomId);
    }

    addPlayer(roomId, playerId, socketId, playerName = null, teamId = null) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        if (room.players.size >= 8) {
            return false; // Room full
        }

        room.players.set(playerId, socketId);
        room.readyStatus.set(playerId, false);
        
        // Set player name
        if (playerName) {
            room.playerNames.set(playerId, playerName);
        }
        
        // Assign team if provided, otherwise auto-assign based on player slot
        if (teamId !== null && teamId >= 1 && teamId <= 4) {
            room.playerTeams.set(playerId, teamId);
        } else {
            // Auto-assign team based on player ID (1-2 = team 1, 3-4 = team 2, etc.)
            const autoTeam = Math.floor((playerId - 1) / 2) + 1;
            room.playerTeams.set(playerId, autoTeam);
        }
        
        return true;
    }

    addSpectator(roomId, socketId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        room.spectators.add(socketId);
        return true;
    }

    removePlayer(roomId, playerId) {
        // Use removePlayerFromRoom instead
        return this.removePlayerFromRoom(roomId, playerId);
    }

    removeSpectator(roomId, socketId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        room.spectators.delete(socketId);
        return true;
    }

    removeSocket(roomId, socketId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        // Remove from players if present
        for (const [playerId, sid] of room.players.entries()) {
            if (sid === socketId) {
                room.players.delete(playerId);
                room.readyStatus.delete(playerId);
                return { type: 'player', playerId };
            }
        }

        // Remove from spectators if present
        if (room.spectators.has(socketId)) {
            room.spectators.delete(socketId);
            return { type: 'spectator' };
        }

        return null;
    }

    setReadyStatus(roomId, playerId, ready) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        room.readyStatus.set(playerId, ready);
        return true;
    }

    getAllReady(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        if (room.players.size === 0) return false;
        
        // Check that all players have ready status set to true
        for (const playerId of room.players.keys()) {
            if (!room.readyStatus.has(playerId) || !room.readyStatus.get(playerId)) {
                return false;
            }
        }

        return true;
    }

    setRoomState(roomId, state) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        if (!Object.values(this.roomStates).includes(state)) {
            return false;
        }

        room.state = state;
        return true;
    }

    cleanupRoom(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        // Stop any timers
        if (room.countdownTimer) {
            clearInterval(room.countdownTimer);
        }

        // Cleanup game engine if exists
        if (room.gameEngine && room.gameEngine.stop) {
            room.gameEngine.stop();
        }

        this.rooms.delete(roomId);
        console.log(`Room cleaned up: ${roomId}`);
        return true;
    }

    cleanupEmptyRooms() {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.players.size === 0 && room.spectators.size === 0) {
                this.cleanupRoom(roomId);
            }
        }
    }

    getAllRooms() {
        const roomsList = [];
        for (const [roomId, room] of this.rooms.entries()) {
            roomsList.push({
                id: roomId,
                name: room.name || roomId,
                state: room.state,
                playerCount: room.players.size,
                spectatorCount: room.spectators.size,
                maxPlayers: 8
            });
        }
        return roomsList;
    }

    getLobbyState(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return null;

        const players = [];
        for (const [playerId, socketId] of room.players.entries()) {
            players.push({
                playerId,
                socketId,
                name: room.playerNames.get(playerId) || `Player ${playerId}`,
                team: room.playerTeams.get(playerId) || Math.floor((playerId - 1) / 2) + 1,
                ready: room.readyStatus.get(playerId) || false
            });
        }

        return {
            roomId: room.id,
            name: room.name,
            hostPlayerId: room.hostPlayerId,
            state: room.state,
            players,
            spectators: Array.from(room.spectators),
            maxPlayers: 8,
            countdownSeconds: room.countdownSeconds || 0
        };
    }

    setPlayerTeam(roomId, playerId, teamId, targetPlayerId = null) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        if (teamId < 1 || teamId > 4) return false;
        if (!room.players.has(playerId)) return false;

        // Determine target player IDs for the team
        // Team 1: player IDs 1-2, Team 2: 3-4, Team 3: 5-6, Team 4: 7-8
        const teamPlayerIds = [];
        if (teamId === 1) teamPlayerIds.push(1, 2);
        else if (teamId === 2) teamPlayerIds.push(3, 4);
        else if (teamId === 3) teamPlayerIds.push(5, 6);
        else if (teamId === 4) teamPlayerIds.push(7, 8);

        // If specific target player ID is provided, use it (must be in team range)
        let newPlayerId = null;
        if (targetPlayerId !== null && teamPlayerIds.includes(targetPlayerId)) {
            newPlayerId = targetPlayerId;
        } else {
            // Find an available slot in the target team
            for (const id of teamPlayerIds) {
                if (!room.players.has(id)) {
                    newPlayerId = id;
                    break;
                }
            }
        }

        // If target slot is specified but occupied, swap players
        if (targetPlayerId !== null && teamPlayerIds.includes(targetPlayerId) && room.players.has(targetPlayerId) && targetPlayerId !== playerId) {
            // Swap the two players
            const targetSocketId = room.players.get(targetPlayerId);
            const targetPlayerName = room.playerNames.get(targetPlayerId);
            const targetReadyStatus = room.readyStatus.get(targetPlayerId) || false;
            const targetTeam = room.playerTeams.get(targetPlayerId);

            const sourceSocketId = room.players.get(playerId);
            const sourcePlayerName = room.playerNames.get(playerId);
            const sourceReadyStatus = room.readyStatus.get(playerId) || false;

            // Swap player data
            room.players.set(playerId, targetSocketId);
            room.players.set(targetPlayerId, sourceSocketId);
            
            if (targetPlayerName) room.playerNames.set(playerId, targetPlayerName);
            if (sourcePlayerName) room.playerNames.set(targetPlayerId, sourcePlayerName);
            
            room.readyStatus.set(playerId, targetReadyStatus);
            room.readyStatus.set(targetPlayerId, sourceReadyStatus);
            
            room.playerTeams.set(playerId, targetTeam);
            room.playerTeams.set(targetPlayerId, teamId);

            return { 
                reassigned: true, 
                swapped: true,
                oldPlayerId: playerId, 
                newPlayerId: targetPlayerId,
                swappedPlayerId: targetPlayerId,
                swappedOldPlayerId: playerId
            };
        }

        // If team is full and no swap, can't move player there
        if (newPlayerId === null) {
            return false;
        }

        // If player is already in the correct slot, just update team
        if (teamPlayerIds.includes(playerId) && newPlayerId === playerId) {
            room.playerTeams.set(playerId, teamId);
            return { reassigned: false };
        }

        // Reassign player to new ID
        const socketId = room.players.get(playerId);
        const playerName = room.playerNames.get(playerId);
        const readyStatus = room.readyStatus.get(playerId) || false;

        // Remove old player ID
        room.players.delete(playerId);
        room.playerNames.delete(playerId);
        room.readyStatus.delete(playerId);
        room.playerTeams.delete(playerId);

        // Add with new player ID
        room.players.set(newPlayerId, socketId);
        if (playerName) room.playerNames.set(newPlayerId, playerName);
        room.readyStatus.set(newPlayerId, readyStatus);
        room.playerTeams.set(newPlayerId, teamId);

        return { reassigned: true, oldPlayerId: playerId, newPlayerId };
    }

    removePlayerFromRoom(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        room.players.delete(playerId);
        room.playerTeams.delete(playerId);
        room.playerNames.delete(playerId);
        room.readyStatus.delete(playerId);

        // If host left, assign new host (first player in room)
        if (room.hostPlayerId === playerId && room.players.size > 0) {
            room.hostPlayerId = Array.from(room.players.keys())[0];
        }

        return true;
    }

    isHost(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room) return false;
        return room.hostPlayerId === playerId;
    }

    setRoomName(roomId, name) {
        const room = this.getRoom(roomId);
        if (!room) return false;
        room.name = name;
        return true;
    }
}

