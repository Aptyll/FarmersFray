import { INPUT_TYPES } from '../shared/inputTypes.js';
import {
    BUILDING_COSTS, upgradeBasePrice, maxSupplyCap, MAP_WIDTH, MAP_HEIGHT
} from '../shared/constants.js';

export class InputHandler {
    constructor(gameState) {
        this.gameState = gameState;
        this.inputQueue = []; // Array of { playerId, eventName, data, tick }
        this.lastInputTick = {}; // Track last input tick per player for rate limiting
        this.maxInputsPerTick = 10; // Max inputs per player per tick
    }

    queueInput(playerId, eventName, data, currentTick) {
        // Rate limiting: prevent spam
        if (!this.lastInputTick[playerId]) {
            this.lastInputTick[playerId] = {};
        }
        
        const playerTickInputs = this.lastInputTick[playerId][currentTick] || 0;
        if (playerTickInputs >= this.maxInputsPerTick) {
            console.warn(`Rate limit exceeded for player ${playerId} at tick ${currentTick}`);
            return false;
        }
        
        this.lastInputTick[playerId][currentTick] = playerTickInputs + 1;
        
        this.inputQueue.push({
            playerId,
            eventName,
            data,
            tick: currentTick
        });
        
        return true;
    }

    processInputs(currentTick) {
        // Process all inputs queued for this tick
        const inputsToProcess = this.inputQueue.filter(input => input.tick <= currentTick);
        this.inputQueue = this.inputQueue.filter(input => input.tick > currentTick);
        
        inputsToProcess.forEach(input => {
            this.processInput(input);
        });
        
        // Cleanup old tick data (keep last 10 ticks)
        Object.keys(this.lastInputTick).forEach(playerId => {
            Object.keys(this.lastInputTick[playerId]).forEach(tick => {
                if (parseInt(tick) < currentTick - 10) {
                    delete this.lastInputTick[playerId][tick];
                }
            });
        });
    }

    processInput(input) {
        const { playerId, eventName, data } = input;
        
        // Validate player exists
        if (!this.gameState.players[playerId]) {
            return false;
        }
        
        switch (eventName) {
            case INPUT_TYPES.SELECT_UNITS:
                return this.handleSelectUnits(playerId, data);
            case INPUT_TYPES.MOVE_COMMAND:
                return this.handleMoveCommand(playerId, data);
            case INPUT_TYPES.ATTACK_COMMAND:
                return this.handleAttackCommand(playerId, data);
            case INPUT_TYPES.BUILD_COMMAND:
                return this.handleBuildCommand(playerId, data);
            case INPUT_TYPES.UPGRADE_COMMAND:
                return this.handleUpgradeCommand(playerId, data);
            case INPUT_TYPES.SIEGE_COMMAND:
                return this.handleSiegeCommand(playerId, data);
            case INPUT_TYPES.CHAT_MESSAGE:
                return this.handleChatMessage(playerId, data);
            default:
                console.warn(`Unknown input type: ${eventName}`);
                return false;
        }
    }

    handleSelectUnits(playerId, data) {
        // Selection is client-side only for visual feedback
        // Server doesn't need to track selections
        return true;
    }

    handleMoveCommand(playerId, data) {
        const { unitIds, targetX, targetY } = data;
        
        if (!Array.isArray(unitIds) || unitIds.length === 0) {
            return false;
        }
        
        // Validate units belong to player
        const units = unitIds
            .map(id => this.gameState.getGameObject(id))
            .filter(obj => obj && obj.playerId === playerId && obj.health > 0);
        
        if (units.length === 0) {
            return false;
        }
        
        // Validate target position is within map bounds
        if (targetX < 0 || targetX > MAP_WIDTH || targetY < 0 || targetY > MAP_HEIGHT) {
            return false;
        }
        
        // Apply move command
        units.forEach(unit => {
            if (unit.targetX !== undefined && unit.targetY !== undefined) {
                unit.targetX = targetX;
                unit.targetY = targetY;
                unit.commandState = 'moving';
                unit.targetUnit = null;
            }
        });
        
        return true;
    }

    handleAttackCommand(playerId, data) {
        const { unitIds, targetId } = data;
        
        if (!Array.isArray(unitIds) || unitIds.length === 0 || !targetId) {
            return false;
        }
        
        const target = this.gameState.getGameObject(targetId);
        if (!target || target.health <= 0) {
            return false;
        }
        
        // Validate units belong to player
        const units = unitIds
            .map(id => this.gameState.getGameObject(id))
            .filter(obj => obj && obj.playerId === playerId && obj.health > 0);
        
        if (units.length === 0) {
            return false;
        }
        
        // Check if target is enemy
        const targetPlayer = this.gameState.players[target.playerId];
        const attackerPlayer = this.gameState.players[playerId];
        
        if (!targetPlayer || !attackerPlayer || targetPlayer.team === attackerPlayer.team) {
            return false; // Can't attack allies
        }
        
        // Apply attack command
        units.forEach(unit => {
            if (unit.targetUnit !== undefined) {
                unit.targetUnit = target;
                unit.commandState = 'attacking';
            }
        });
        
        return true;
    }

    handleBuildCommand(playerId, data) {
        const { buildingType, x, y, workerIds } = data;
        
        if (!buildingType || !BUILDING_COSTS[buildingType]) {
            return false;
        }
        
        const cost = BUILDING_COSTS[buildingType];
        const player = this.gameState.players[playerId];
        
        // Validate resources
        if (!player || player.resources < cost) {
            return false;
        }
        
        // Validate workers belong to player
        const workers = workerIds
            .map(id => this.gameState.getGameObject(id))
            .filter(obj => obj && obj.type === 'worker' && obj.playerId === playerId && obj.health > 0);
        
        if (workers.length === 0) {
            return false;
        }
        
        // Validate position is within map bounds
        if (x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT) {
            return false;
        }
        
        // TODO: Validate building placement (no overlap, valid grid position)
        // This will be implemented when building placement logic is extracted
        
        // Deduct resources
        player.resources -= cost;
        
        // TODO: Create building object
        // This will be implemented when GameObject classes are extracted
        
        return true;
    }

    handleUpgradeCommand(playerId, data) {
        const { upgradeType } = data;
        
        const player = this.gameState.players[playerId];
        const upgrades = this.gameState.playerUpgrades[playerId];
        
        if (!player || !upgrades || !upgrades.hasOwnProperty(upgradeType)) {
            return false;
        }
        
        // Calculate upgrade price
        const currentLevel = upgrades[upgradeType];
        const price = upgradeBasePrice * (currentLevel + 1);
        
        // Validate resources
        if (player.resources < price) {
            return false;
        }
        
        // Validate max levels
        const maxLevels = {
            armor: 20,
            attackDamage: 20,
            weaponRange: 20,
            healthRegen: 20,
            movementSpeed: 20,
            buildingArmor: 20,
            buildingRegen: 20,
            buildingCapacity: 20,
            turretDuration: 1,
            tankSplash: 1,
            combatShields: 1,
            jetpacks: 1,
            stim: 1,
            concussiveBlast: 1,
            tankArtillery: 1
        };
        
        if (currentLevel >= (maxLevels[upgradeType] || 20)) {
            return false; // Already maxed
        }
        
        // Apply upgrade
        upgrades[upgradeType]++;
        player.resources -= price;
        
        return true;
    }

    handleSiegeCommand(playerId, data) {
        const { unitIds } = data;
        
        if (!Array.isArray(unitIds) || unitIds.length === 0) {
            return false;
        }
        
        // Validate units are tanks and belong to player
        const tanks = unitIds
            .map(id => this.gameState.getGameObject(id))
            .filter(obj => obj && obj.type === 'tank' && obj.playerId === playerId && obj.health > 0);
        
        if (tanks.length === 0) {
            return false;
        }
        
        // Toggle siege mode
        tanks.forEach(tank => {
            if (tank.toggleSiege && typeof tank.toggleSiege === 'function') {
                tank.toggleSiege();
            } else if (tank.isSieged !== undefined) {
                tank.isSieged = !tank.isSieged;
            }
        });
        
        return true;
    }

    handleChatMessage(playerId, data) {
        // Chat validation is minimal - just check message length
        const { message, channel } = data;
        
        if (!message || message.length === 0 || message.length > 200) {
            return false;
        }
        
        // Chat will be broadcast by playerManager
        return true;
    }
}

