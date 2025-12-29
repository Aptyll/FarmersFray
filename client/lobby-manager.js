// Lobby Management System
import { TEAM_INFO, PLAYER_COLORS } from '../shared/constants.js';

export class LobbyManager {
    constructor() {
        this.overlay = document.getElementById('lobbyManagerOverlay');
        this.lobbyNameEl = document.getElementById('lobbyManagerName');
        this.playersContainer = document.getElementById('lobbyManagerPlayers');
        this.startGameBtn = document.getElementById('lobbyManagerStartBtn');
        this.leaveLobbyBtn = document.getElementById('lobbyManagerLeaveBtn');
        
        this.currentLobbyState = null;
        this.isHost = false;
        this.myPlayerId = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.startGameBtn) {
            this.startGameBtn.addEventListener('click', () => this.handleStartGame());
        }
        if (this.leaveLobbyBtn) {
            this.leaveLobbyBtn.addEventListener('click', () => this.handleLeaveLobby());
        }
    }

    show(lobbyState) {
        if (!this.overlay) {
            console.error('Lobby manager overlay not found');
            return;
        }
        
        this.currentLobbyState = lobbyState;
        this.isHost = lobbyState.hostPlayerId === lobbyState.myPlayerId;
        this.myPlayerId = lobbyState.myPlayerId;
        
        console.log('Showing lobby manager:', { 
            isHost: this.isHost, 
            myPlayerId: this.myPlayerId, 
            hostPlayerId: lobbyState.hostPlayerId,
            players: lobbyState.players?.length || 0
        });
        
        this.updateUI();
        this.overlay.classList.remove('hidden');
    }

    hide() {
        if (!this.overlay) return;
        this.overlay.classList.add('hidden');
    }

    updateUI() {
        if (!this.currentLobbyState) return;

        // Update lobby name
        if (this.lobbyNameEl) {
            this.lobbyNameEl.textContent = this.currentLobbyState.name || 'Lobby';
        }

        // Update players list
        this.updatePlayersList();

        // Update start button visibility
        if (this.startGameBtn) {
            if (this.isHost) {
                this.startGameBtn.classList.remove('hidden');
                // Disable button if countdown is active or game is playing
                const isCountdown = this.currentLobbyState.state === 'COUNTDOWN';
                const isPlaying = this.currentLobbyState.state === 'PLAYING';
                this.startGameBtn.disabled = isCountdown || isPlaying;
                
                if (isCountdown) {
                    this.startGameBtn.textContent = `Starting in ${this.currentLobbyState.countdownSeconds || 5}...`;
                } else if (isPlaying) {
                    this.startGameBtn.textContent = 'Game In Progress';
                } else {
                    this.startGameBtn.textContent = 'Start Game';
                }
            } else {
                this.startGameBtn.classList.add('hidden');
            }
        }
    }

    updatePlayersList() {
        if (!this.playersContainer || !this.currentLobbyState) return;

        // Group players by team
        const teams = { 1: [], 2: [], 3: [], 4: [] };
        this.currentLobbyState.players.forEach(player => {
            const team = player.team || 1;
            if (!teams[team]) teams[team] = [];
            teams[team].push(player);
        });

        this.playersContainer.innerHTML = '';

        // Create team sections
        for (let teamId = 1; teamId <= 4; teamId++) {
            const teamSection = this.createTeamSection(teamId, teams[teamId] || []);
            this.playersContainer.appendChild(teamSection);
        }
    }

    createTeamSection(teamId, players) {
        const section = document.createElement('div');
        section.className = 'lobby-team-section';
        section.dataset.team = teamId;

        // Get team info from constants
        const teamInfo = TEAM_INFO[teamId] || { name: `Team ${teamId}`, color: '#fff', displayName: `Team ${teamId}` };
        
        // Apply team color to section
        section.style.borderColor = `${teamInfo.color}80`;
        section.style.backgroundColor = `${teamInfo.color}10`;

        const teamHeader = document.createElement('div');
        teamHeader.className = 'lobby-team-header';
        teamHeader.innerHTML = `
            <span>
                <span class="lobby-team-name" style="color: ${teamInfo.color}">${teamInfo.displayName}</span>
                <span class="lobby-team-subtitle" style="color: ${teamInfo.color}80; font-size: 12px;">${teamInfo.name}</span>
            </span>
            <span class="lobby-team-count">${players.length}/2</span>
        `;
        section.appendChild(teamHeader);

        const playersList = document.createElement('div');
        playersList.className = 'lobby-team-players';

        // Add drop handlers to team section if host
        if (this.isHost) {
            playersList.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            playersList.addEventListener('drop', (e) => {
                e.preventDefault();
                
                // Only handle if dropped directly on players list (not on a slot or player item)
                if (e.target === playersList || (e.target.classList.contains('lobby-team-players') && !e.target.closest('.lobby-player-item'))) {
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        const targetTeamId = parseInt(teamId);
                        
                        if (data.playerId && targetTeamId) {
                            // Find first available slot in team
                            const teamPlayerIds = targetTeamId === 1 ? [1, 2] : 
                                                 targetTeamId === 2 ? [3, 4] :
                                                 targetTeamId === 3 ? [5, 6] : [7, 8];
                            
                            // Find empty slot
                            const currentPlayers = this.currentLobbyState.players.filter(p => p.team === targetTeamId);
                            const usedIds = currentPlayers.map(p => p.playerId);
                            const availableId = teamPlayerIds.find(id => !usedIds.includes(id));
                            
                            if (availableId) {
                                this.handleChangeTeam(data.playerId, targetTeamId, availableId);
                            }
                        }
                    } catch (err) {
                        console.error('Error handling drop:', err);
                    }
                }
            });
        }

        // Add empty slots if team not full
        for (let i = 0; i < 2; i++) {
            if (players[i]) {
                playersList.appendChild(this.createPlayerItem(players[i]));
            } else {
                playersList.appendChild(this.createEmptySlot(teamId));
            }
        }

        section.appendChild(playersList);
        return section;
    }

    createPlayerItem(player) {
        const item = document.createElement('div');
        item.className = `lobby-player-item ${player.ready ? 'ready' : ''}`;
        item.dataset.playerId = player.playerId;
        item.draggable = this.isHost && player.playerId !== this.myPlayerId;

        const isMe = player.playerId === this.myPlayerId;
        const isHost = player.playerId === this.currentLobbyState.hostPlayerId;
        
        // Get player color from constants (matches game colors)
        const playerColor = PLAYER_COLORS[player.playerId] || '#fff';

        item.innerHTML = `
            <div class="lobby-player-info">
                <span class="lobby-player-name" style="color: ${playerColor}">${player.name || `Player ${player.playerId}`}</span>
                ${isHost ? '<span class="lobby-player-badge host">Host</span>' : ''}
                ${isMe ? '<span class="lobby-player-badge you">You</span>' : ''}
            </div>
            <div class="lobby-player-status">
                ${player.ready ? '<span class="ready-indicator">✓ Ready</span>' : '<span class="ready-indicator not-ready">Not Ready</span>'}
                ${isMe ? `<button class="lobby-ready-toggle ${player.ready ? 'ready' : ''}" title="${player.ready ? 'Mark Not Ready' : 'Mark Ready'}">${player.ready ? 'Not Ready' : 'Ready'}</button>` : ''}
            </div>
            ${this.isHost && !isMe ? '<button class="lobby-player-kick" title="Kick Player">×</button>' : ''}
        `;

        // Add ready toggle button handler (for current player)
        const readyToggleBtn = item.querySelector('.lobby-ready-toggle');
        if (readyToggleBtn) {
            readyToggleBtn.addEventListener('click', () => {
                const newReadyState = !player.ready;
                this.handleToggleReady(newReadyState);
            });
        }

        // Add kick button handler
        const kickBtn = item.querySelector('.lobby-player-kick');
        if (kickBtn) {
            kickBtn.addEventListener('click', () => {
                if (confirm(`Kick ${player.name || `Player ${player.playerId}`}?`)) {
                    this.handleKickPlayer(player.playerId);
                }
            });
        }

        // Add drag handlers if host
        if (this.isHost && !isMe) {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    playerId: player.playerId,
                    currentTeam: player.team,
                    currentPlayerId: player.playerId
                }));
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
        }

        // Add drop handlers to allow swapping players (for host)
        if (this.isHost) {
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!isMe) {
                    item.classList.add('drag-over');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                
                if (isMe) return; // Can't drop on yourself
                
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const targetPlayerId = player.playerId;
                    const targetTeamId = player.team;
                    
                    // If dragging to a different player, swap or move
                    if (data.playerId && data.playerId !== targetPlayerId) {
                        this.handleChangeTeam(data.playerId, targetTeamId, targetPlayerId);
                    }
                } catch (err) {
                    console.error('Error handling drop on player:', err);
                }
            });
        }

        // Keep context menu as alternative method
        if (this.isHost && !isMe) {
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showTeamChangeMenu(e, player);
            });
        }

        return item;
    }

    createEmptySlot(teamId, slotIndex) {
        const slot = document.createElement('div');
        slot.className = 'lobby-player-slot empty';
        slot.dataset.team = teamId;
        slot.dataset.slotIndex = slotIndex;
        
        // Calculate target player ID for this slot
        // Team 1: slot 0 = ID 1, slot 1 = ID 2
        // Team 2: slot 0 = ID 3, slot 1 = ID 4
        // etc.
        const targetPlayerId = (teamId - 1) * 2 + slotIndex + 1;
        slot.dataset.targetPlayerId = targetPlayerId;
        slot.textContent = `Player ${targetPlayerId}`;
        
        // Add drop handlers if host
        if (this.isHost) {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                slot.classList.add('drag-over');
            });

            slot.addEventListener('dragleave', () => {
                slot.classList.remove('drag-over');
            });

            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const targetTeamId = parseInt(slot.dataset.team);
                    const targetSlotPlayerId = parseInt(slot.dataset.targetPlayerId);
                    
                    if (data.playerId && targetTeamId) {
                        this.handleChangeTeam(data.playerId, targetTeamId, targetSlotPlayerId);
                    }
                } catch (err) {
                    console.error('Error handling drop:', err);
                }
            });
        }
        
        return slot;
    }

    showTeamChangeMenu(event, player) {
        if (!this.isHost) return;

        // Remove existing menu if any
        const existingMenu = document.querySelector('.team-change-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'team-change-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;

        menu.innerHTML = '<div class="team-change-title">Move to Team:</div>';

        for (let teamId = 1; teamId <= 4; teamId++) {
            if (teamId === player.team) continue; // Skip current team

            const teamOption = document.createElement('button');
            teamOption.className = 'team-change-option';
            teamOption.textContent = `Team ${teamId}`;
            teamOption.addEventListener('click', () => {
                this.handleChangeTeam(player.playerId, teamId);
                menu.remove();
            });
            menu.appendChild(teamOption);
        }

        document.body.appendChild(menu);

        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    handleChangeTeam(playerId, newTeamId, targetSlotPlayerId = null) {
        if (!window.clientNetwork || !this.isHost) return;

        window.clientNetwork.changePlayerTeam(playerId, newTeamId, targetSlotPlayerId);
    }

    handleToggleReady(ready) {
        if (!window.clientNetwork) return;

        console.log(`Setting ready status to: ${ready}`);
        window.clientNetwork.setReadyStatus(ready);
    }

    handleKickPlayer(playerId) {
        if (!window.clientNetwork || !this.isHost) return;

        window.clientNetwork.kickPlayer(playerId);
    }

    handleStartGame() {
        if (!window.clientNetwork || !this.isHost) {
            console.warn('Only host can start the game');
            return;
        }

        console.log('Host attempting to start game...');
        const result = window.clientNetwork.startGame();
        if (!result) {
            console.error('Failed to send start game request');
            alert('Failed to start game. Please try again.');
        }
    }

    handleLeaveLobby() {
        if (!window.clientNetwork) return;

        if (confirm('Leave this lobby?')) {
            window.clientNetwork.leaveRoom();
            this.hide();
            if (window.mainMenu) {
                window.mainMenu.show();
            }
        }
    }

    updateLobbyState(lobbyState) {
        this.currentLobbyState = lobbyState;
        this.isHost = lobbyState.hostPlayerId === lobbyState.myPlayerId;
        this.updateUI();
    }
}

// Create global instance
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.lobbyManager = new LobbyManager();
    });
} else {
    window.lobbyManager = new LobbyManager();
}

