// Main Menu and Lobby Discovery System

export class MainMenu {
    constructor() {
        this.overlay = document.getElementById('mainMenuOverlay');
        this.playerNameInput = document.getElementById('playerNameInput');
        this.lobbyNameInput = document.getElementById('lobbyNameInput');
        this.createLobbyBtn = document.getElementById('createLobbyBtn');
        this.refreshLobbiesBtn = document.getElementById('refreshLobbiesBtn');
        this.lobbyList = document.getElementById('lobbyList');
        this.connectionStatus = document.getElementById('connectionStatus');
        
        if (!this.overlay) {
            console.error('Main menu overlay not found!');
            return;
        }
        
        if (this.connectionStatus) {
            this.statusIndicator = this.connectionStatus.querySelector('.status-indicator');
            this.statusText = this.connectionStatus.querySelector('.status-text');
        }
        
        this.lobbies = [];
        this.refreshInterval = null;
        
        // Load player name from localStorage
        this.loadPlayerName();
        
        // Show menu by default
        this.show();
        
        this.setupEventListeners();
    }

    loadPlayerName() {
        const savedName = localStorage.getItem('playerName');
        if (this.playerNameInput && savedName) {
            this.playerNameInput.value = savedName;
        }
    }

    savePlayerName() {
        if (this.playerNameInput) {
            const name = this.playerNameInput.value.trim();
            if (name) {
                localStorage.setItem('playerName', name);
            } else {
                localStorage.removeItem('playerName');
            }
        }
    }

    getPlayerName() {
        if (this.playerNameInput) {
            const name = this.playerNameInput.value.trim();
            return name || `Player ${Date.now()}`;
        }
        return `Player ${Date.now()}`;
    }

    setupEventListeners() {
        if (this.createLobbyBtn) {
            this.createLobbyBtn.addEventListener('click', () => this.handleCreateLobby());
        }
        if (this.refreshLobbiesBtn) {
            this.refreshLobbiesBtn.addEventListener('click', () => this.refreshLobbies());
        }
        if (this.lobbyNameInput) {
            this.lobbyNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleCreateLobby();
                }
            });
        }
        if (this.playerNameInput) {
            // Save player name to localStorage when it changes
            this.playerNameInput.addEventListener('blur', () => {
                this.savePlayerName();
            });
            this.playerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.playerNameInput.blur();
                }
            });
        }
    }

    show() {
        if (!this.overlay) {
            console.error('Cannot show main menu: overlay not found');
            return;
        }
        this.overlay.classList.remove('hidden');
        this.refreshLobbies();
        this.startAutoRefresh();
    }

    hide() {
        this.overlay.classList.add('hidden');
        this.stopAutoRefresh();
    }

    handleCreateLobby() {
        const lobbyName = this.lobbyNameInput.value.trim();
        if (!lobbyName) {
            alert('Please enter a lobby name');
            return;
        }

        if (!window.clientNetwork || !window.clientNetwork.isConnected()) {
            alert('Not connected to server. Please wait...');
            return;
        }

        // Save player name before creating lobby
        this.savePlayerName();
        const playerName = this.getPlayerName();

        // Create lobby and join it
        window.clientNetwork.createLobby(lobbyName, playerName, (success, roomId) => {
            if (success) {
                this.lobbyNameInput.value = '';
                this.hide();
                // The pregame overlay will be shown by the game
            } else {
                alert('Failed to create lobby');
            }
        });
    }

    refreshLobbies() {
        if (!window.clientNetwork || !window.clientNetwork.isConnected()) {
            this.updateLobbyList([]);
            return;
        }

        window.clientNetwork.requestLobbyList((lobbies) => {
            this.lobbies = lobbies || [];
            this.updateLobbyList(this.lobbies);
        });
    }

    updateLobbyList(lobbies) {
        this.lobbyList.innerHTML = '';

        if (lobbies.length === 0) {
            this.lobbyList.innerHTML = '<div class="lobby-list-empty">No lobbies available. Create one to get started!</div>';
            return;
        }

        lobbies.forEach(lobby => {
            const item = this.createLobbyItem(lobby);
            this.lobbyList.appendChild(item);
        });
    }

    createLobbyItem(lobby) {
        const item = document.createElement('div');
        item.className = 'lobby-item';

        const info = document.createElement('div');
        info.className = 'lobby-item-info';

        const name = document.createElement('div');
        name.className = 'lobby-item-name';
        name.textContent = lobby.name || lobby.id;

        const details = document.createElement('div');
        details.className = 'lobby-item-details';

        const players = document.createElement('div');
        players.className = 'lobby-item-players';
        players.innerHTML = `<span>👥</span> <span>${lobby.playerCount || 0}/8</span>`;

        const spectators = document.createElement('div');
        spectators.className = 'lobby-item-spectators';
        spectators.innerHTML = `<span>👁️</span> <span>${lobby.spectatorCount || 0}</span>`;

        details.appendChild(players);
        details.appendChild(spectators);

        info.appendChild(name);
        info.appendChild(details);

        const status = document.createElement('div');
        status.className = `lobby-item-status ${lobby.state.toLowerCase()}`;
        
        let statusText = lobby.state;
        if (lobby.state === 'WAITING') {
            statusText = 'Waiting';
        } else if (lobby.state === 'PLAYING') {
            statusText = 'In Game';
        } else if (lobby.state === 'COUNTDOWN') {
            statusText = 'Starting';
        }

        if (lobby.playerCount >= 8 && lobby.state === 'WAITING') {
            status.className = 'lobby-item-status full';
            statusText = 'Full';
        }

        status.textContent = statusText;

        const actions = document.createElement('div');
        actions.className = 'lobby-item-actions';

        const joinBtn = document.createElement('button');
        joinBtn.className = 'menu-btn';
        joinBtn.textContent = lobby.state === 'PLAYING' ? 'Spectate' : 'Join';
        joinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleJoinLobby(lobby.id, lobby.state === 'PLAYING');
        });

        actions.appendChild(joinBtn);

        item.appendChild(info);
        item.appendChild(status);
        item.appendChild(actions);

        // Click entire item to join
        item.addEventListener('click', () => {
            if (lobby.state !== 'PLAYING' || lobby.playerCount < 8) {
                this.handleJoinLobby(lobby.id, lobby.state === 'PLAYING');
            }
        });

        return item;
    }

    handleJoinLobby(roomId, asSpectator = false) {
        if (!window.clientNetwork || !window.clientNetwork.isConnected()) {
            alert('Not connected to server');
            return;
        }

        // Save player name before joining
        this.savePlayerName();
        const playerName = this.getPlayerName();

        window.clientNetwork.joinRoom(roomId, playerName, asSpectator);
        this.hide();
    }

    startAutoRefresh() {
        // Refresh lobby list every 3 seconds
        this.refreshInterval = setInterval(() => {
            this.refreshLobbies();
        }, 3000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    updateConnectionStatus(connected, connecting = false) {
        if (!this.statusIndicator || !this.statusText) return;
        
        this.statusIndicator.className = 'status-indicator';
        if (connected) {
            this.statusIndicator.classList.add('connected');
            this.statusText.textContent = 'Connected';
        } else if (connecting) {
            this.statusIndicator.classList.add('connecting');
            this.statusText.textContent = 'Connecting...';
        } else {
            this.statusIndicator.classList.add('disconnected');
            this.statusText.textContent = 'Disconnected';
        }
    }
}

// Create global instance when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.mainMenu = new MainMenu();
    });
} else {
    // DOM already loaded
    window.mainMenu = new MainMenu();
}

