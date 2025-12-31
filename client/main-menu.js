// Main Menu and Lobby Discovery System

export class MainMenu {
    constructor() {
        this.overlay = document.getElementById('mainMenuOverlay');
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

        // Show menu by default
        this.show();
        
        this.setupEventListeners();
    }

    getPlayerName() {
        return `Player ${Date.now()}`;
    }

    setupEventListeners() {
        if (this.createLobbyBtn) {
            this.createLobbyBtn.addEventListener('click', () => this.handleCreateLobby());
        }
        if (this.refreshLobbiesBtn) {
            this.refreshLobbiesBtn.addEventListener('click', () => this.refreshLobbies());
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
        if (!window.clientNetwork || !window.clientNetwork.isConnected()) {
            alert('Not connected to server. Please wait...');
            return;
        }

        const playerName = this.getPlayerName();

        // Create lobby and join it
        window.clientNetwork.createLobby(null, playerName, (success, roomId) => {
            if (success) {
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
            // Show placeholder lobby
            const placeholderItem = this.createPlaceholderLobbyItem();
            this.lobbyList.appendChild(placeholderItem);
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

        info.appendChild(name);

        const actions = document.createElement('div');
        actions.className = 'lobby-item-actions';

        // Add player count beside join button
        const playerCount = document.createElement('span');
        playerCount.className = 'lobby-item-player-count';
        playerCount.textContent = `${lobby.playerCount || 0}/8`;

        const joinBtn = document.createElement('button');
        joinBtn.className = 'menu-btn';
        joinBtn.textContent = lobby.state === 'PLAYING' ? 'Spectate' : 'Join';
        joinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleJoinLobby(lobby.id, lobby.state === 'PLAYING');
        });

        actions.appendChild(playerCount);
        actions.appendChild(joinBtn);

        item.appendChild(info);
        item.appendChild(actions);

        // Click entire item to join
        item.addEventListener('click', () => {
            if (lobby.state !== 'PLAYING' || lobby.playerCount < 8) {
                this.handleJoinLobby(lobby.id, lobby.state === 'PLAYING');
            }
        });

        return item;
    }

    createPlaceholderLobbyItem() {
        const item = document.createElement('div');
        item.className = 'lobby-item lobby-item-placeholder';

        const info = document.createElement('div');
        info.className = 'lobby-item-info';

        const name = document.createElement('div');
        name.className = 'lobby-item-name placeholder-shimmer';

        info.appendChild(name);

        const actions = document.createElement('div');
        actions.className = 'lobby-item-actions';

        const playerCount = document.createElement('span');
        playerCount.className = 'lobby-item-player-count placeholder-shimmer';

        const joinBtn = document.createElement('button');
        joinBtn.className = 'menu-btn placeholder-shimmer';
        joinBtn.disabled = true;

        actions.appendChild(playerCount);
        actions.appendChild(joinBtn);

        item.appendChild(info);
        item.appendChild(actions);

        return item;
    }

    handleJoinLobby(roomId, asSpectator = false) {
        if (!window.clientNetwork || !window.clientNetwork.isConnected()) {
            alert('Not connected to server');
            return;
        }

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
        if (!this.statusIndicator) return;

        this.statusIndicator.className = 'status-indicator';
        if (connected) {
            this.statusIndicator.classList.add('connected');
            if (this.statusText) this.statusText.textContent = 'Online';
        } else if (connecting) {
            this.statusIndicator.classList.add('connecting');
            if (this.statusText) this.statusText.textContent = 'Connecting...';
        } else {
            this.statusIndicator.classList.add('disconnected');
            if (this.statusText) this.statusText.textContent = 'Offline';
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

