// Input message type definitions for client-server communication

export const INPUT_TYPES = {
    // Connection
    JOIN_ROOM: 'JOIN_ROOM',
    LEAVE_ROOM: 'LEAVE_ROOM',

    // Game Inputs
    SELECT_UNITS: 'SELECT_UNITS',
    MOVE_COMMAND: 'MOVE_COMMAND',
    ATTACK_COMMAND: 'ATTACK_COMMAND',
    BUILD_COMMAND: 'BUILD_COMMAND',
    UPGRADE_COMMAND: 'UPGRADE_COMMAND',
    CHAT_MESSAGE: 'CHAT_MESSAGE',
    READY_STATUS: 'READY_STATUS',
    START_GAME: 'START_GAME',

    // Unit-specific commands
    SIEGE_COMMAND: 'SIEGE_COMMAND',
    REPAIR_COMMAND: 'REPAIR_COMMAND',
    STOP_COMMAND: 'STOP_COMMAND',
    HOLD_COMMAND: 'HOLD_COMMAND',
    PATROL_COMMAND: 'PATROL_COMMAND',

    // Building commands
    SET_RALLY_POINT: 'SET_RALLY_POINT',
    GARRISON_UNIT: 'GARRISON_UNIT',
    UNGARRISON_UNIT: 'UNGARRISON_UNIT'
};

// Input message schemas
export const createSelectUnitsInput = (unitIds, timestamp) => ({
    type: INPUT_TYPES.SELECT_UNITS,
    unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
    timestamp: timestamp || Date.now()
});

export const createMoveCommandInput = (unitIds, targetX, targetY, timestamp) => ({
    type: INPUT_TYPES.MOVE_COMMAND,
    unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
    targetX,
    targetY,
    timestamp: timestamp || Date.now()
});

export const createAttackCommandInput = (unitIds, targetId, timestamp) => ({
    type: INPUT_TYPES.ATTACK_COMMAND,
    unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
    targetId,
    timestamp: timestamp || Date.now()
});

export const createBuildCommandInput = (buildingType, x, y, workerIds, timestamp) => ({
    type: INPUT_TYPES.BUILD_COMMAND,
    buildingType,
    x,
    y,
    workerIds: Array.isArray(workerIds) ? workerIds : [workerIds],
    timestamp: timestamp || Date.now()
});

export const createUpgradeCommandInput = (upgradeType, timestamp) => ({
    type: INPUT_TYPES.UPGRADE_COMMAND,
    upgradeType,
    timestamp: timestamp || Date.now()
});

export const createChatMessageInput = (message, channel) => ({
    type: INPUT_TYPES.CHAT_MESSAGE,
    message: String(message).substring(0, 200), // Max 200 chars
    channel: channel === 'team' ? 'team' : 'all',
    timestamp: Date.now()
});

export const createReadyStatusInput = (ready) => ({
    type: INPUT_TYPES.READY_STATUS,
    ready: Boolean(ready),
    timestamp: Date.now()
});

export const createSiegeCommandInput = (unitIds, timestamp) => ({
    type: INPUT_TYPES.SIEGE_COMMAND,
    unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
    timestamp: timestamp || Date.now()
});

