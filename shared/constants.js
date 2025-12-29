// Gameplay map boundaries
export const MAP_WIDTH = 4800;
export const MAP_HEIGHT = 4800;
export const TILE_COUNT = 8;
export const TILE_WIDTH = MAP_WIDTH / TILE_COUNT;
export const TILE_HEIGHT = MAP_HEIGHT / TILE_COUNT;

// Central 4x4 tile rect for Sight Tower vision
export const CENTRAL_INNER_RECT = {
    left: TILE_WIDTH * 2,
    top: TILE_HEIGHT * 2,
    width: TILE_WIDTH * 4,
    height: TILE_HEIGHT * 4
};

// Visual boundaries
export const VISUAL_BOUNDARY_EXTENSION = 1200;
export const VISUAL_MAP_WIDTH = MAP_WIDTH + (VISUAL_BOUNDARY_EXTENSION * 2);
export const VISUAL_MAP_HEIGHT = MAP_HEIGHT + (VISUAL_BOUNDARY_EXTENSION * 2);

// Building grid constants
export const GRID_CELLS_PER_TILE = 4;
export const INNER_TILE_RATIO = 0.45;
export const INNER_TILE_WIDTH = Math.floor(TILE_WIDTH * INNER_TILE_RATIO);
export const INNER_TILE_HEIGHT = Math.floor(TILE_HEIGHT * INNER_TILE_RATIO);
export const INNER_TILE_OFFSET_X = Math.floor((TILE_WIDTH - INNER_TILE_WIDTH) / 2);
export const INNER_TILE_OFFSET_Y = Math.floor((TILE_HEIGHT - INNER_TILE_HEIGHT) / 2);
export const GRID_CELL_WIDTH = Math.floor(INNER_TILE_WIDTH / GRID_CELLS_PER_TILE);
export const GRID_CELL_HEIGHT = Math.floor(INNER_TILE_HEIGHT / GRID_CELLS_PER_TILE);
export const ADJUSTED_INNER_TILE_WIDTH = GRID_CELL_WIDTH * GRID_CELLS_PER_TILE;
export const ADJUSTED_INNER_TILE_HEIGHT = GRID_CELL_HEIGHT * GRID_CELLS_PER_TILE;

// Building grid sizes
export const BUILDING_GRID_SIZES = {
    bunker: { width: 3, height: 3 },
    supplyDepot: { width: 3, height: 2 },
    shieldTower: { width: 1, height: 1 },
    sensorTower: { width: 1, height: 1 },
    tank: { width: 4, height: 4 }
};

// Neutral/map object constants
export const NEUTRAL_PLAYER_ID = 0;
export const NEUTRAL_PLAYER_COLOR = 'hsl(210, 10%, 55%)';
export const SIGHT_TOWER_SIZE_RATIO = 0.5;
export const SIGHT_TOWER_COLOR = '#5b6a7a';

// Unit default sizes
export const UNIT_DEFAULT_SIZES = {
    'marine': 27,
    'reaper': 28,
    'marauder': 32,
    'ghost': 25,
    'tank': 40
};

// Tank constants
export const TANK_COST = 50;
export const TANK_SUPPLY_COST = 3;
export const TANK_BUILD_TIME = 5500; // ms
export const TANK_SIEGE_TRANSFORM_TIME = 650; // ms
export const TANK_SIEGE_RANGE_BONUS = 220;
export const TANK_SIEGE_DAMAGE_BONUS = 14;
export const TANK_UNIT_GRID_FOOTPRINT = { width: 1, height: 2 };

// Building costs
export const BUILDING_COSTS = {
    bunker: 50,
    supplyDepot: 30,
    shieldTower: 10,
    sensorTower: 10,
    tank: TANK_COST
};

// Game timing constants
export const BUNKER_SPAWN_COOLDOWN = 1500; // ms
export const BUILD_TIME = 15000; // ms
export const TURRET_THROW_RANGE = 400;
export const TURRET_EXPIRATION_TIME = 30000; // ms
export const TURRET_COST = 20;
export const WORKER_RESPAWN_DELAY = 5000; // ms
export const WORKER_FALL_HEIGHT = 800;

// Supply and resource constants
export const SUPPLY_DEPOT_SUPPLY_BONUS = 5;
export const BUNKER_SUPPLY_BONUS = 5;
export const SHIELD_TOWER_ARMOR_BONUS = 5;
export const SHIELD_TOWER_RADIUS = 300;
export const resourceIncomeRate = 5; // Resources per second
export const resourceUpdateInterval = 1000; // ms
export const maxSupplyCap = 10;
export const WORKER_SUPPLY_CAP = 10;
export const WORKER_SUPPLY_COST = 1;
export const REPAIR_COST_PER_SECOND = 1;

// Resource gain constants
export const RESOURCE_GAIN_UNIT = 5;
export const RESOURCE_GAIN_WORKER = 50;
export const RESOURCE_GAIN_BUNKER = 25;
export const RESOURCE_GAIN_SUPPLY_DEPOT = 15;
export const RESOURCE_GAIN_TOWER = 5;
export const RESOURCE_GAIN_TURRET = 5;

// Combat constants
export const TARGET_ACQUISITION_RANGE_FACTOR = 1.5;

// Fog of War constants
export const FOG_GRID_SIZE = 40;
export const FOG_GRID_WIDTH = Math.ceil(MAP_WIDTH / FOG_GRID_SIZE);
export const FOG_GRID_HEIGHT = Math.ceil(MAP_HEIGHT / FOG_GRID_SIZE);
export const VISION_STATE = {
    EXPLORED: 0,
    VISIBLE: 1
};

// Upgrade system constants
export const upgradeBasePrice = 25;
export const upgradeTypes = {
    ARMOR: 'armor',
    ATTACK_DAMAGE: 'attackDamage',
    WEAPON_RANGE: 'weaponRange',
    HEALTH_REGEN: 'healthRegen',
    MOVEMENT_SPEED: 'movementSpeed'
};

// Server tick constants
export const SERVER_TICK_RATE = 60; // ticks per second
export const SERVER_TICK_INTERVAL = 1000 / SERVER_TICK_RATE; // ms
export const STATE_BROADCAST_RATE = 20; // broadcasts per second
export const STATE_BROADCAST_INTERVAL = 1000 / STATE_BROADCAST_RATE; // ms
export const TICKS_PER_STATE_BROADCAST = SERVER_TICK_RATE / STATE_BROADCAST_RATE; // 3 ticks

// Player colors (for teams)
export const PLAYER_COLORS = {
    1: 'hsl(0, 75%, 65%)',    // Team 1 - Light red
    2: 'hsl(0, 75%, 40%)',    // Team 1 - Dark red
    3: 'hsl(210, 75%, 65%)',  // Team 2 - Light blue
    4: 'hsl(210, 75%, 40%)',  // Team 2 - Dark blue
    5: 'hsl(120, 75%, 60%)',  // Team 3 - Light green
    6: 'hsl(120, 75%, 35%)',  // Team 3 - Dark green
    7: 'hsl(30, 70%, 60%)',   // Team 4 - Light brown
    8: 'hsl(30, 70%, 35%)'    // Team 4 - Dark brown
};

// Player teams
export const PLAYER_TEAMS = {
    1: 1, 2: 1,  // Team 1
    3: 2, 4: 2,  // Team 2
    5: 3, 6: 3,  // Team 3
    7: 4, 8: 4   // Team 4
};

// Team information (names and colors)
export const TEAM_INFO = {
    1: { name: "Top Left", color: 'hsl(0, 75%, 50%)', displayName: "Red Team" },
    2: { name: "Top Right", color: 'hsl(210, 75%, 50%)', displayName: "Blue Team" },
    3: { name: "Bottom Left", color: 'hsl(120, 75%, 45%)', displayName: "Green Team" },
    4: { name: "Bottom Right", color: 'hsl(30, 70%, 45%)', displayName: "Brown Team" }
};

// Initial player resources
export const INITIAL_RESOURCES = 50;

