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
        this.teamChangeCooldown = 0; // Timestamp when cooldown expires

        this.setupEventListeners();
        this.setupNetworkCallbacks();

        // Start cooldown update interval
        this.cooldownInterval = setInterval(() => {
            this.updateCooldownDisplay();
        }, 1000);
    }

    setupEventListeners() {
        if (this.startGameBtn) {
            this.startGameBtn.addEventListener('click', () => this.handleStartGame());
        }
        if (this.leaveLobbyBtn) {
            this.leaveLobbyBtn.addEventListener('click', () => this.handleLeaveLobby());
        }
    }

    setupNetworkCallbacks() {
        // Set up countdown callback for real-time updates
        if (window.clientNetwork) {
            window.clientNetwork.onCountdown = (seconds) => {
                this.handleCountdownUpdate(seconds);
            };
        }
    }

    handleCountdownUpdate(seconds) {
        // Update countdown seconds in current state for UI updates
        if (this.currentLobbyState) {
            this.currentLobbyState.countdownSeconds = seconds;
            this.updateUI();
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

        // Clear cooldown interval
        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
            this.cooldownInterval = null;
        }
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
            this.startGameBtn.classList.remove('hidden'); // Always show the button

            if (this.isHost) {
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
                // Non-host players: always disabled, show appropriate status
                this.startGameBtn.disabled = true;
                const isCountdown = this.currentLobbyState.state === 'COUNTDOWN';
                const isPlaying = this.currentLobbyState.state === 'PLAYING';

                if (isCountdown) {
                    this.startGameBtn.textContent = `Starting in ${this.currentLobbyState.countdownSeconds || 5}...`;
                } else if (isPlaying) {
                    this.startGameBtn.textContent = 'Game In Progress';
                } else {
                    this.startGameBtn.textContent = 'Waiting for Host';
                }
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

        // Find first player in team to get their color, or use team color as fallback
        const firstPlayer = players.length > 0 ? players[0] : null;
        const teamColor = firstPlayer ? PLAYER_COLORS[firstPlayer.playerId] || teamInfo.color : teamInfo.color;

        // Apply team color to section
        section.style.borderColor = `${teamInfo.color}80`;
        section.style.backgroundColor = `${teamInfo.color}10`;

        const teamHeader = document.createElement('div');
        teamHeader.className = 'lobby-team-header';
        teamHeader.innerHTML = `
            <span>
                <span class="lobby-team-name" style="color: ${teamColor}">${teamInfo.name}</span>
            </span>
            <div class="lobby-team-info">
                <span class="lobby-cooldown-text"></span>
                <span class="lobby-team-count">${players.length}/2</span>
            </div>
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

        // Add click handler for non-host players to join teams
        if (!this.isHost && this.myPlayerId) {
            const currentTeamId = this.currentLobbyState.players.find(p => p.playerId === this.myPlayerId)?.team;

            // Only add click handler if player is not already in this team
            if (currentTeamId !== teamId) {
                section.addEventListener('click', (e) => {
                    // Don't trigger if clicking on existing players or kick buttons
                    if (e.target.closest('.lobby-player-item') || e.target.closest('.lobby-player-kick')) {
                        return;
                    }

                    this.handleJoinTeam(teamId);
                });
            }
        }

        // Always update cooldown display for this team
        this.updateTeamCooldownDisplay(section, teamHeader, teamId);

        return section;
    }

    updateTeamCooldownDisplay(teamSection, teamHeader, teamId) {
        const cooldownText = teamHeader.querySelector('.lobby-cooldown-text');

        if (!this.isHost && this.myPlayerId) {
            const currentTeamId = this.currentLobbyState?.players.find(p => p.playerId === this.myPlayerId)?.team;

            // Only show cooldown for teams the player can join
            if (currentTeamId !== teamId) {
                if (this.teamChangeCooldown > Date.now()) {
                    const remainingTime = Math.ceil((this.teamChangeCooldown - Date.now()) / 1000);
                    cooldownText.textContent = `(${remainingTime}s)`;
                    cooldownText.classList.add('active');
                    teamSection.classList.add('cooldown-active');
                } else {
                    cooldownText.textContent = '';
                    cooldownText.classList.remove('active');
                    teamSection.classList.remove('cooldown-active');
                }
            } else {
                cooldownText.textContent = '';
                cooldownText.classList.remove('active');
                teamSection.classList.remove('cooldown-active');
            }
        } else {
            cooldownText.textContent = '';
            cooldownText.classList.remove('active');
            teamSection.classList.remove('cooldown-active');
        }
    }

    updateCooldownDisplay() {
        if (!this.playersContainer) return;

        const teamSections = this.playersContainer.querySelectorAll('.lobby-team-section');
        teamSections.forEach(section => {
            const teamId = parseInt(section.dataset.team);
            const teamHeader = section.querySelector('.lobby-team-header');
            if (teamHeader) {
                this.updateTeamCooldownDisplay(section, teamHeader, teamId);
            }
        });
    }

    createPlayerItem(player) {
        const item = document.createElement('div');

        const isMe = player.playerId === this.myPlayerId;
        const isHost = player.playerId === this.currentLobbyState.hostPlayerId;

        // Get player color from constants (matches game colors)
        const playerColor = PLAYER_COLORS[player.playerId] || '#fff';

        // Build class list for visual indicators
        let classList = 'lobby-player-item';
        if (isHost) classList += ' host-player';
        if (isMe) classList += ' my-player';
        item.className = classList;

        // Add background color for current player
        if (isMe) {
            // Convert HSL color to HSLA with alpha for background
            const hslaColor = playerColor.replace('hsl(', 'hsla(').replace(')', ', 0.125)'); // 0.125 = 20 in hex alpha
            item.style.backgroundColor = hslaColor;
        }

        item.dataset.playerId = player.playerId;
        item.draggable = this.isHost && player.playerId !== this.myPlayerId;

        item.innerHTML = `
            <div class="lobby-player-info">
                <span class="lobby-player-name" style="color: ${playerColor}">player${player.playerId}</span>
            </div>
            <div class="lobby-player-controls">
                ${this.isHost && !isMe ? '<button class="lobby-player-kick" title="Kick Player">Kick</button>' : ''}
                <div class="lobby-player-status">
                    <input type="checkbox" class="lobby-ready-checkbox" ${player.ready ? 'checked' : ''} ${!isMe ? 'disabled' : ''} title="${player.ready ? 'Mark Not Ready' : 'Mark Ready'}" style="--player-color: ${playerColor}">
                </div>
            </div>
        `;

        // Add ready toggle checkbox handler (for current player only)
        const readyCheckbox = item.querySelector('.lobby-ready-checkbox');
        if (readyCheckbox && isMe) {
            readyCheckbox.addEventListener('change', () => {
                this.handleToggleReady(readyCheckbox.checked);
            });
        }

        // Add kick button handler
        const kickBtn = item.querySelector('.lobby-player-kick');
        if (kickBtn) {
            kickBtn.addEventListener('click', () => {
                if (confirm(`Kick player${player.playerId}?`)) {
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

        // Disable dropping on existing players to prevent displacement bugs
        // Players can only be dropped on empty slots or empty team areas

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

    handleJoinTeam(teamId) {
        if (!window.clientNetwork || this.isHost || !this.myPlayerId) return;

        // Check cooldown
        if (this.teamChangeCooldown > Date.now()) {
            const remainingTime = Math.ceil((this.teamChangeCooldown - Date.now()) / 1000);
            console.log(`Team change on cooldown. ${remainingTime} seconds remaining.`);
            return;
        }

        // Check if team is full
        const teamPlayers = this.currentLobbyState.players.filter(p => p.team === teamId);
        if (teamPlayers.length >= 2) {
            console.log(`Team ${teamId} is full.`);
            return;
        }

        // Set cooldown (10 seconds)
        this.teamChangeCooldown = Date.now() + 10000;

        // Find available slot
        const teamPlayerIds = teamId === 1 ? [1, 2] :
                             teamId === 2 ? [3, 4] :
                             teamId === 3 ? [5, 6] : [7, 8];
        const usedIds = teamPlayers.map(p => p.playerId);
        const availableId = teamPlayerIds.find(id => !usedIds.includes(id));

        if (availableId) {
            console.log(`Joining team ${teamId} in slot ${availableId}`);
            window.clientNetwork.changePlayerTeam(this.myPlayerId, teamId, availableId);
        }
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
        this.myPlayerId = lobbyState.myPlayerId;
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

