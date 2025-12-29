import {
    MAP_WIDTH, MAP_HEIGHT, TILE_COUNT, TILE_WIDTH, TILE_HEIGHT,
    GRID_CELLS_PER_TILE, GRID_CELL_WIDTH, GRID_CELL_HEIGHT,
    CENTRAL_INNER_RECT, FOG_GRID_SIZE, FOG_GRID_WIDTH, FOG_GRID_HEIGHT,
    VISION_STATE, PLAYER_COLORS, PLAYER_TEAMS, INITIAL_RESOURCES,
    maxSupplyCap, BUILDING_COSTS, BUNKER_SUPPLY_BONUS
} from '../shared/constants.js';

export class GameState {
    constructor() {
        this.gameObjects = [];
        this.players = {};
        this.playerUpgrades = {};
        this.fogOfWar = null;
        this.gameStartTime = null;
        this.gameTimeInSeconds = 0;
        this.isPaused = true;
        
        this.initializePlayers();
        this.initializeUpgrades();
    }

    initializePlayers() {
        // Initialize all 8 players
        for (let playerId = 1; playerId <= 8; playerId++) {
            this.players[playerId] = {
                team: PLAYER_TEAMS[playerId],
                supplyCap: maxSupplyCap,
                currentSupply: 0,
                workerSupplyCap: 1,
                currentWorkerSupply: 0,
                resources: INITIAL_RESOURCES,
                color: PLAYER_COLORS[playerId],
                killResourceScore: 0,
                workerRespawnTimers: []
            };
        }
    }

    initializeUpgrades() {
        // Initialize upgrades for all players
        for (let playerId = 1; playerId <= 8; playerId++) {
            this.playerUpgrades[playerId] = {
                armor: 0,
                attackDamage: 0,
                weaponRange: 0,
                healthRegen: 0,
                movementSpeed: 0,
                buildingArmor: 0,
                buildingRegen: 0,
                buildingCapacity: 0,
                turretDuration: 0,
                tankSplash: 0,
                combatShields: 0,
                jetpacks: 0,
                stim: 0,
                concussiveBlast: 0,
                tankArtillery: 0
            };
        }
    }

    initializeFogOfWar() {
        // FogOfWar will be initialized when GameObject classes are available
        // For now, create a placeholder structure
        this.fogOfWar = {
            teamFogGrids: {},
            initialized: false
        };
    }

    reset() {
        this.gameObjects = [];
        this.gameTimeInSeconds = 0;
        this.isPaused = true;
        
        // Reset players
        Object.keys(this.players).forEach(id => {
            this.players[id].currentSupply = 0;
            this.players[id].currentWorkerSupply = 0;
            this.players[id].killResourceScore = 0;
            this.players[id].resources = INITIAL_RESOURCES;
            this.players[id].workerRespawnTimers = [];
        });

        // Reset upgrades
        Object.keys(this.playerUpgrades).forEach(id => {
            Object.keys(this.playerUpgrades[id]).forEach(key => {
                this.playerUpgrades[id][key] = 0;
            });
        });
    }

    startGame() {
        this.gameStartTime = Date.now();
        this.gameTimeInSeconds = 0;
        this.isPaused = false;
    }

    pauseGame() {
        this.isPaused = true;
    }

    resumeGame() {
        this.isPaused = false;
    }

    updateGameTimer(now) {
        if (!this.isPaused && this.gameStartTime) {
            const elapsed = (now - this.gameStartTime) / 1000;
            this.gameTimeInSeconds = Math.floor(elapsed);
        }
    }

    getSnapshot() {
        // Create a serializable snapshot of game state
        return {
            gameObjects: this.gameObjects.map(obj => this.serializeGameObject(obj)),
            players: JSON.parse(JSON.stringify(this.players)),
            playerUpgrades: JSON.parse(JSON.stringify(this.playerUpgrades)),
            gameTimeInSeconds: this.gameTimeInSeconds,
            isPaused: this.isPaused
        };
    }

    serializeGameObject(obj) {
        // Serialize GameObject to plain object
        // This will be expanded when GameObject classes are extracted
        const serialized = {
            id: obj.id,
            type: obj.type,
            x: obj.x,
            y: obj.y,
            size: obj.size,
            playerId: obj.playerId,
            color: obj.color,
            health: obj.health,
            maxHealth: obj.maxHealth,
            armor: obj.armor,
            attackDamage: obj.attackDamage,
            attackSpeed: obj.attackSpeed,
            attackRange: obj.attackRange,
            hpRegen: obj.hpRegen,
            visionRange: obj.visionRange,
            supplyCost: obj.supplyCost,
            isDestroyed: obj.isDestroyed || false
        };

        // Add type-specific properties
        if (obj.type === 'bunker') {
            serialized.width = obj.width;
            serialized.height = obj.height;
            serialized.rallyPoint = obj.rallyPoint;
            serialized.isUnderConstruction = obj.isUnderConstruction;
            serialized.constructionProgress = obj.constructionProgress;
            serialized.garrisonedUnits = obj.garrisonedUnits?.map(u => u.id) || [];
        }

        if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || 
            obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || 
            obj.type === 'tank') {
            serialized.targetX = obj.targetX;
            serialized.targetY = obj.targetY;
            serialized.targetUnit = obj.targetUnit?.id || null;
            serialized.commandState = obj.commandState;
            serialized.movementSpeed = obj.movementSpeed;
            serialized.lastMoveAngle = obj.lastMoveAngle;
        }

        if (obj.type === 'tank') {
            serialized.isSieged = obj.isSieged || false;
            serialized.siegeTransformProgress = obj.siegeTransformProgress || 0;
        }

        return serialized;
    }

    addGameObject(obj) {
        this.gameObjects.push(obj);
    }

    removeGameObject(objId) {
        const index = this.gameObjects.findIndex(obj => obj.id === objId);
        if (index !== -1) {
            this.gameObjects.splice(index, 1);
            return true;
        }
        return false;
    }

    getGameObject(objId) {
        return this.gameObjects.find(obj => obj.id === objId);
    }

    getPlayer(playerId) {
        return this.players[playerId];
    }

    getPlayerUpgrades(playerId) {
        return this.playerUpgrades[playerId];
    }

    updateSupplyCounts() {
        // Reset all supply counts
        Object.keys(this.players).forEach(id => {
            this.players[id].currentSupply = 0;
            this.players[id].currentWorkerSupply = 0;
        });

        // Count units for each player
        this.gameObjects.forEach(obj => {
            if (obj.health > 0 && obj.type === 'worker') {
                const playerState = this.players[obj.playerId];
                if (playerState) {
                    playerState.currentWorkerSupply += obj.workerSupplyCost || 1;
                }
            } else if (obj.health > 0 && obj.supplyCost > 0) {
                const playerState = this.players[obj.playerId];
                if (playerState) {
                    playerState.currentSupply += obj.supplyCost;
                }
            }
        });
    }
}

