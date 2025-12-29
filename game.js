const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');

// Minimap setup
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapContext = minimapCanvas.getContext('2d');
let minimapScale = 0; // Will be calculated based on map size

// Add roundRect polyfill if not supported
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        this.beginPath();
        this.moveTo(x + radius, y);
        this.arcTo(x + width, y, x + width, y + height, radius);
        this.arcTo(x + width, y + height, x, y + height, radius);
        this.arcTo(x, y + height, x, y, radius);
        this.arcTo(x, y, x + width, y, radius);
        this.closePath();
        return this;
    };
}

// --- Constants ---
// Gameplay map boundaries (where units can move and buildings can be placed)
const MAP_WIDTH = 4800;  // Reduced map size (75% of original)
const MAP_HEIGHT = 4800; // Reduced map size (75% of original)
const TILE_COUNT = 8; // 8x8 grid
const TILE_WIDTH = MAP_WIDTH / TILE_COUNT;
const TILE_HEIGHT = MAP_HEIGHT / TILE_COUNT;

// Central 4x4 tile rect (tiles 2-5) for Sight Tower vision
const CENTRAL_INNER_RECT = {
    left: TILE_WIDTH * 2,
    top: TILE_HEIGHT * 2,
    width: TILE_WIDTH * 4,
    height: TILE_HEIGHT * 4
};

// Visual boundaries (extended area where camera can pan)
const VISUAL_BOUNDARY_EXTENSION = 1200; // 1200 pixels of extra space on each side (reduced 25%)
const VISUAL_MAP_WIDTH = MAP_WIDTH + (VISUAL_BOUNDARY_EXTENSION * 2);
const VISUAL_MAP_HEIGHT = MAP_HEIGHT + (VISUAL_BOUNDARY_EXTENSION * 2);

// Visual boundary colors
const VISUAL_BOUNDARY_COLOR = '#0A0B1A'; // Dark blue-gray color for the extended area
const BOUNDARY_INDICATOR_COLOR = 'rgba(77, 166, 255, 0.6)'; // Enhanced blue line for the gameplay boundary
const BOUNDARY_INDICATOR_GLOW = 'rgba(77, 166, 255, 0.2)'; // Glow effect for boundary
const BOUNDARY_LINE_WIDTH = 3; // Thicker boundary line

// Camera System Constants
const EDGE_SCROLL_MARGIN = 20; // Pixels from edge that triggers scrolling
const CAMERA_SPEED = 8; // Speed of camera movement (reduced for better control)

// Tile colors for each perimeter ring (high-contrast, minimal, no glow)
const PERIMETER_COLORS = [
    '#0F1013', // Outer ring - near black
    '#15171C', // Ring 2 - deep graphite
    '#1D2027', // Ring 3 - dark slate
    '#262A33'  // Center - soft charcoal
];

// Tile grid + sub-grid styling (continuous grid lines, thicker outer frame)
const TILE_GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.12)';
const TILE_GRID_LINE_WIDTH = 2;
const TILE_OUTER_FRAME_COLOR = 'rgba(255, 255, 255, 0.12)'; // match grid color
const TILE_OUTER_FRAME_WIDTH = 2; // same thickness as grid lines
const TILE_SUBGRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const TILE_SUBGRID_LINE_WIDTH = 1;
// Vent styling for center 2x2 block (SC2-style vents made of squares)
const VENT_RING_COLOR = 'rgba(255, 255, 255, 0.12)';
const VENT_RING_INSET = 0;
const VENT_SQUARE_SIZE = 40;
const VENT_SQUARE_SPACING = 40;
const VENT_RING_BORDER_COLOR = 'rgba(255, 255, 255, 0.16)';
const VENT_RING_BORDER_WIDTH = 1;
const MINIMAP_GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.18)';
const MINIMAP_GRID_LINE_WIDTH = 1;
const MINIMAP_OUTER_FRAME_COLOR = 'rgba(255, 255, 255, 0.18)'; // match minimap grid
const MINIMAP_OUTER_FRAME_WIDTH = 1;
const MINIMAP_SUBGRID_COLOR = 'rgba(255, 255, 255, 0.14)';

const MOVEMENT_MARKER_START_RADIUS = 15;
const MOVEMENT_MARKER_DURATION = 750; // Shorten duration slightly for faster fade

// Performance Monitor Constants
const PERFORMANCE_UPDATE_INTERVAL = 500; // Update every 500ms
const FPS_SAMPLE_SIZE = 60; // Number of frames to average FPS over

// --- Canvas Setup ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Initialize minimap
minimapCanvas.width = 300;
minimapCanvas.height = 300;
minimapScale = Math.min(
    minimapCanvas.width / MAP_WIDTH,
    minimapCanvas.height / MAP_HEIGHT
);

// Camera System
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Update minimap canvas size
    minimapCanvas.width = 300;
    minimapCanvas.height = 300;

    // Calculate minimap scale
    minimapScale = Math.min(
        minimapCanvas.width / MAP_WIDTH,
        minimapCanvas.height / MAP_HEIGHT
    );

    // Reset mouse position to center to avoid edge scroll drift on resize
    mousePos = { x: canvas.width / 2, y: canvas.height / 2 };
});

// --- Game State ---
const gameObjects = []; // Holds all units and bunkers
let selectedUnits = [];
let currentPlayerId = 1; // Start as Player 1
let repairEffects = []; // Visual effects for repair operations
let isDragging = false;
let isMinimapDragging = false; // Track minimap dragging state
let dragStartX = 0;
let cachedBoundaryTexture = null; // Cached texture pattern for visual boundary
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
const movementMarkers = []; // To store {x, y, timestamp, playerId}
const attackEffects = []; // Store temporary attack visuals (LASER LINES)
const floatingTexts = []; // Store floating text elements for resource gains
const fallingWorkers = []; // Store falling worker animations {x, y, startY, targetY, playerId, startTime, duration}
const throwingTurrets = []; // Store throwing turret animations {startX, startY, targetX, targetY, playerId, startTime, duration}

// Minimap timing variables for reduced frequency updates
let lastMinimapUpdate = 0;
const MINIMAP_UPDATE_INTERVAL = 1000 / 12; // 30fps = ~33.33ms

// Game timer variables
let gameStartTime = Date.now();
let gameTimeInSeconds = 0;
const gameTimerElement = document.getElementById('gameTimer');
const MARKER_DURATION_MS = 1000; // How long movement markers last
const CLICK_DRAG_THRESHOLD = 5; // Pixels to differentiate click vs drag
const CHECKER_SIZE = 100; // Size of background checker squares (doubled)
const BACKGROUND_COLOR_1 = '#222222';
const BACKGROUND_COLOR_2 = '#282828';
const SELECTION_COLOR = 'white';
const MOVEMENT_MARKER_COLOR = 'hsl(60, 50%, 60%)'; // Softer yellow
let isAMoveMode = false; // Tracks if we are waiting for A-move click
const TARGET_ACQUISITION_RANGE_FACTOR = 1.5; // How much farther units look than they shoot
const BUNKER_SPAWN_COOLDOWN = 1500; // ms (1.5 seconds) - Increased spawn rate
const BUILD_TIME = 15000; // 15 seconds to build a structure
const SUPPLY_DEPOT_SUPPLY_BONUS = 5; // Supply bonus from a supply depot
const BUNKER_SUPPLY_BONUS = 5; // Supply bonus from a bunker
const SHIELD_TOWER_ARMOR_BONUS = 5; // Armor bonus from shield tower
const SHIELD_TOWER_RADIUS = 300; // Shield tower radius (3 tiles - doubled from 1.5 tiles)

// Unit default sizes for spawning calculations
const UNIT_DEFAULT_SIZES = {
    'marine': 27,
    'reaper': 28,
    'marauder': 32,
    'ghost': 25,
    'tank': 40
};

// Tank constants
const TANK_COST = 50;
const TANK_SUPPLY_COST = 3;
const TANK_BUILD_TIME = 5500; // ms
const TANK_SIEGE_TRANSFORM_TIME = 650; // ms
const TANK_SIEGE_RANGE_BONUS = 220;
const TANK_SIEGE_DAMAGE_BONUS = 14;
const TANK_UNIT_GRID_FOOTPRINT = { width: 1, height: 2 }; // in-game unit size (after construction)

// Building costs
const BUILDING_COSTS = {
    bunker: 50,
    supplyDepot: 30,
    shieldTower: 10,
    sensorTower: 10,
    tank: TANK_COST
};

function findClearSpawnPointNear(originX, originY, unitSize, allGameObjects) {
    const spawnOffset = unitSize * 0.9 + 10;
    let angle = 0;

    // Try 8 directions around the origin
    for (let attempts = 0; attempts < 8; attempts++) {
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const spawnX = originX + dirX * spawnOffset;
        const spawnY = originY + dirY * spawnOffset;

        // Keep inside gameplay bounds
        const half = unitSize / 2;
        if (spawnX < half || spawnX > MAP_WIDTH - half || spawnY < half || spawnY > MAP_HEIGHT - half) {
            angle += Math.PI / 4;
            continue;
        }

        let blocked = false;
        for (const obj of allGameObjects) {
            if (obj.health <= 0) continue;
            if (Math.hypot(obj.x - spawnX, obj.y - spawnY) < (obj.size / 2 + half)) {
                blocked = true;
                break;
            }
        }
        if (!blocked) return { x: spawnX, y: spawnY };

        angle += Math.PI / 4;
    }

    return null;
}

// Building grid sizes (width x height in grid cells)
const BUILDING_GRID_SIZES = {
    bunker: { width: 3, height: 3 },         // 3x3 grid cells (large structure)
    supplyDepot: { width: 3, height: 2 },    // 3x2 grid cells (horizontal structure)
    shieldTower: { width: 1, height: 1 },    // 1x1 grid cells (compact structure)
    sensorTower: { width: 1, height: 1 },    // 1x1 grid cells (compact structure)
    tank: { width: 4, height: 4 }            // 4x4 footprint during construction (full tile)
};

// Neutral/map object constants
const NEUTRAL_PLAYER_ID = 0; // Non-playable, allied-with-all marker
const NEUTRAL_PLAYER_COLOR = 'hsl(210, 10%, 55%)';
const SIGHT_TOWER_SIZE_RATIO = 0.5; // 1/2 bunker width/height => 1/4 bunker area
const SIGHT_TOWER_COLOR = '#5b6a7a';

// Building grid constants
const GRID_CELLS_PER_TILE = 4; // 4x4 grid within each tile

// Define the inner area of each tile (where the grid will be placed)
// This corresponds to the centered building area of each tile
const INNER_TILE_RATIO = 0.45; // The inner area is 45% of the tile size (25% smaller than original 60%)
const INNER_TILE_WIDTH = Math.floor(TILE_WIDTH * INNER_TILE_RATIO);
const INNER_TILE_HEIGHT = Math.floor(TILE_HEIGHT * INNER_TILE_RATIO);

// Calculate the offset from tile edge to the inner area (ensure it's centered)
const INNER_TILE_OFFSET_X = Math.floor((TILE_WIDTH - INNER_TILE_WIDTH) / 2);
const INNER_TILE_OFFSET_Y = Math.floor((TILE_HEIGHT - INNER_TILE_HEIGHT) / 2);

// Size of each grid cell within the inner area (ensure they're even)
const GRID_CELL_WIDTH = Math.floor(INNER_TILE_WIDTH / GRID_CELLS_PER_TILE);
const GRID_CELL_HEIGHT = Math.floor(INNER_TILE_HEIGHT / GRID_CELLS_PER_TILE);

// Recalculate inner area to ensure it's exactly divisible by grid cells
const ADJUSTED_INNER_TILE_WIDTH = GRID_CELL_WIDTH * GRID_CELLS_PER_TILE;
const ADJUSTED_INNER_TILE_HEIGHT = GRID_CELL_HEIGHT * GRID_CELLS_PER_TILE;

// Building placement mode
let buildingPlacementMode = false;
let buildingTypeToPlace = null;
let buildingWorkers = []; // Workers assigned to build
let buildingPlacementX = 0;
let buildingPlacementY = 0;
let buildingGridX = 0; // Grid cell X coordinate for preview
let buildingGridY = 0; // Grid cell Y coordinate for preview
let buildingPlacementGridX = 0; // Stored grid X for actual placement
let buildingPlacementGridY = 0; // Stored grid Y for actual placement
let isValidPlacement = false; // Whether current placement is valid

// Nuke placement mode
let nukePlacementMode = false;
let nukePlacementX = 0;
let nukePlacementY = 0;

// Turret placement mode
let turretPlacementMode = false;
let turretPlacementX = 0;
let turretPlacementY = 0;
let turretPlacementWorker = null; // Worker that will throw the turret
const TURRET_THROW_RANGE = 400; // Range workers can throw turrets
const TURRET_EXPIRATION_TIME = 30000; // 30 seconds in milliseconds
const TURRET_COST = 20; // Cost to place a turret

// Worker placement mode (for "More Workers" ability)
let workerPlacementMode = false;
let workerPlacementX = 0;
let workerPlacementY = 0;
const WORKER_FALL_HEIGHT = 800; // Height from which worker falls
const RALLY_POINT_MARKER_COLOR = 'lime';
const REPAIR_COST_PER_SECOND = 1; // Resources cost per second of repair time
let repairModeEnabled = false; // Global repair mode toggle
const HEALTH_BAR_COLOR = 'white';
const HEALTH_BAR_FONT = '10px Arial';
const BUNKER_HEALTH_FONT = '12px Arial';
const ATTACK_RANGE_INDICATOR_COLOR = 'rgba(255, 0, 0, 0.2)'; // Semi-transparent red
const ATTACK_EFFECT_COLOR = 'red';
const ATTACK_EFFECT_DURATION = 100; // ms
const SPARK_BURST_COLOR = 'white';
const SPARK_BURST_DURATION = 150; // ms, slightly longer than laser
const SPARK_COUNT = 5;
const SPARK_LENGTH = 4;

// Constants for styling
const DASH_PATTERN = [6, 4]; // 6px line, 4px gap
const ROTATION_SPEED_FACTOR = 0.05; // Slower is faster denominator, adjust as needed
const RALLY_LINE_DASH_PATTERN = [5, 5];
const RALLY_LINE_ANIMATION_SPEED = 0.08;
const RALLY_PULSE_DURATION = 1000; // ms for one pulse cycle
const RALLY_PULSE_START_RADIUS = 10;

// New Ripple Effect Constants
const RIPPLE_RING_COUNT = 3;
const RIPPLE_START_RADIUS_FACTOR = 1.8; // Multiplier for base start radius
const RIPPLE_RING_SPACING_FACTOR = 0.3;
const RIPPLE_LINE_WIDTH = 2; // Increased line width for boldness
// New constants for staggered/dotted rings
const RIPPLE_RING_DELAY_FACTOR = 0.15; // Delay between rings starting (fraction of total duration)
const RIPPLE_DASH_PATTERN = [4, 4];   // Dashes for the rings
const RIPPLE_ROTATION_SPEED = 0.06;  // Speed for rotating ring dashes
const A_MOVE_MARKER_COLOR = 'hsl(0, 0%, 100%)'; // White for A-Move
const A_MOVE_RIPPLE_RING_COUNT = 5; // More rings for A-Move

// New Selection Animation Constants
// Note: an empty dash pattern breaks dashOffset math in multiple selection renderers.
// [1, 0] effectively renders as a solid line while keeping the math safe.
const SELECTION_DASH_PATTERN = [1, 0]; // Solid line (safe)
const SELECTION_ANIMATION_SPEED = 0; // Static selection
const SELECTION_LINE_WIDTH_UNIT = 2; // Thin for units
const SELECTION_LINE_WIDTH_BUNKER = 2; // Thin for bunkers
const SELECTION_GLOW_COLOR = 'rgba(255, 255, 255, 0.1)'; // Subtle glow behind selection

// New Health Bar Constants
const HEALTHBAR_UNIT_WIDTH = 30;
const HEALTHBAR_UNIT_HEIGHT = 5;
const HEALTHBAR_UNIT_OFFSET_Y = 10; // Distance above unit center
const HEALTHBAR_BUNKER_WIDTH = 150;
const HEALTHBAR_BUNKER_HEIGHT = 18;
const HEALTHBAR_BUNKER_OFFSET_Y = 36; // Distance above bunker center
const HEALTHBAR_TURRET_WIDTH = 50; // Larger than units (30), smaller than bunkers (150)
const HEALTHBAR_TURRET_HEIGHT = 8; // Larger than units (5), smaller than bunkers (18)
const HEALTHBAR_TURRET_OFFSET_Y = 20; // Distance above turret center
const HEALTHBAR_BACKGROUND_COLOR = '#444444';
const HEALTHBAR_BORDER_COLOR = '#111111';
const HEALTHBAR_DIVIDER_COLOR = '#111111';
const HEALTHBAR_BORDER_WIDTH = 1;
const COOLDOWN_BAR_HEIGHT = 3;
const EXPIRATION_BAR_HEIGHT = 8; // Larger expiration bar for turrets
const COOLDOWN_BAR_GAP = -1;
const COOLDOWN_BAR_BACKGROUND_COLOR = 'rgba(255, 255, 255, 0.08)';
const COOLDOWN_BAR_BORDER_COLOR = 'rgba(0, 0, 0, 0.55)';
const COOLDOWN_BAR_BORDER_WIDTH = 1;

// Resource and Supply System
const resourceIncomeRate = 5; // Resources per second
let lastResourceUpdateTime = 0;
const resourceUpdateInterval = 1000; // Update resources every second
const maxSupplyCap = 10; // Maximum supply cap
const WORKER_SUPPLY_CAP = 10; // Separate worker supply cap (assumed equal to combat cap)
const WORKER_SUPPLY_COST = 1; // Workers' own supply value
const WORKER_RESPAWN_DELAY = 5000; // ms delay before a worker respawns

// Resource gain constants
const RESOURCE_TEXT_DURATION = 1000; // Duration in ms for resource text animation
const RESOURCE_TEXT_SPEED = 0.5; // Speed at which resource text floats upward
const RESOURCE_TEXT_FONT_UNIT = '20px Arial'; // Font for unit kills (increased size)
const RESOURCE_TEXT_FONT_BUILDING = '28px Arial'; // Font for building kills (increased size)
const RESOURCE_GAIN_UNIT = 5; // Resources gained from killing a unit
const RESOURCE_GAIN_WORKER = 50; // Resources gained from killing a worker
const RESOURCE_GAIN_BUNKER = 25; // Resources gained from killing a bunker
const RESOURCE_GAIN_SUPPLY_DEPOT = 15; // Resources gained from killing a supply depot
const RESOURCE_GAIN_TOWER = 5; // Resources gained from killing a tower
const RESOURCE_GAIN_TURRET = 5; // Resources gained from killing a turret

// Fog of War Constants
// FOG_GRID_SIZE is set to divide evenly into TILE_WIDTH (600) for perfect alignment
// 600 / 40 = 15 fog cells per tile, creating symmetrical alignment
const FOG_GRID_SIZE = 40; // Size of each fog grid cell in world units (15 cells per tile)
const FOG_GRID_WIDTH = Math.ceil(MAP_WIDTH / FOG_GRID_SIZE);
const FOG_GRID_HEIGHT = Math.ceil(MAP_HEIGHT / FOG_GRID_SIZE);

// Vision states
const VISION_STATE = {
    EXPLORED: 0,    // Previously seen - grayed out
    VISIBLE: 1      // Currently visible - full color
};

// Fog rendering constants
const FOG_EXPLORED_COLOR = 'rgba(0, 0, 0, 0.5)';          // Semi-transparent overlay for explored but not visible
const FOG_TRANSITION_ALPHA = 0.3;                          // Smooth transition at fog edges

// Upgrade System
const upgradeBasePrice = 25; // Base price for upgrades
const upgradeTypes = {
    ARMOR: 'armor',
    ATTACK_DAMAGE: 'attackDamage',
    WEAPON_RANGE: 'weaponRange',
    HEALTH_REGEN: 'healthRegen',
    MOVEMENT_SPEED: 'movementSpeed'
};

// Store player upgrades
const playerUpgrades = {
    1: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    2: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    3: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    4: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    5: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    6: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    7: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 },
    8: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0, buildingArmor: 0, buildingRegen: 0, buildingCapacity: 0, turretDuration: 0, tankSplash: 0, combatShields: 0, jetpacks: 0, stim: 0, concussiveBlast: 0, tankArtillery: 0 }
};

// Function to calculate upgrade price based on current level
function getUpgradePrice(upgradeLevel) {
    return upgradeBasePrice * (upgradeLevel + 1);
}

// Function to apply upgrade effects to a unit
function applyUpgradesToUnit(unit) {
    if (!unit || !unit.playerId) return;

    const upgrades = playerUpgrades[unit.playerId];
    if (!upgrades) return;

    // Apply armor upgrade (each level adds 1 armor)
    unit.armor = unit.baseArmor + upgrades.armor;

    // Apply attack damage upgrade (each level adds 2 damage)
    unit.attackDamage = unit.baseAttackDamage + (upgrades.attackDamage * 2);

    // Apply weapon range upgrade (each level adds 20 range)
    unit.attackRange = unit.baseAttackRange + (upgrades.weaponRange * 20);

    // Apply health regen upgrade (each level increases regen by 10% - percentage-based)
    unit.hpRegen = unit.baseHpRegen * (1 + upgrades.healthRegen * 0.1);

    // Apply movement speed upgrade (each level adds 0.3 speed) - only for units, not turrets
    if (unit.movementSpeed !== undefined) {
        unit.movementSpeed = unit.baseMovementSpeed + (upgrades.movementSpeed * 0.3);
    }

    // Apply Combat Shields upgrade (adds 50 HP to marines)
    if (unit.type === 'marine' && upgrades.combatShields > 0) {
        const shieldBonus = upgrades.combatShields * 50;
        const oldMaxHealth = unit.maxHealth;
        unit.maxHealth = unit.baseMaxHealth + shieldBonus;
        // Increase current health proportionally if unit is alive
        if (unit.health > 0 && oldMaxHealth > 0) {
            const healthRatio = unit.health / oldMaxHealth;
            unit.health = Math.min(unit.maxHealth, unit.baseMaxHealth * healthRatio + shieldBonus);
        }
    } else if (unit.type === 'marine') {
        // Reset to base if shields not purchased
        unit.maxHealth = unit.baseMaxHealth;
    }

    // Apply Jetpacks upgrade (adds 0.2 movement speed to reapers)
    if (unit.type === 'reaper' && upgrades.jetpacks > 0 && unit.movementSpeed !== undefined) {
        unit.movementSpeed = unit.baseMovementSpeed + (upgrades.movementSpeed * 0.3) + (upgrades.jetpacks * 0.2);
    }

    // Apply Tank Artillery upgrade (increases damage and range by 10%)
    if (unit.type === 'tank' && upgrades.tankArtillery > 0) {
        // Calculate base damage with other upgrades first
        const baseDamageWithUpgrades = unit.baseAttackDamage + (upgrades.attackDamage * 2);
        const baseRangeWithUpgrades = unit.baseAttackRange + (upgrades.weaponRange * 20);
        // Then apply 10% bonus
        unit.attackDamage = baseDamageWithUpgrades * 1.1;
        unit.attackRange = baseRangeWithUpgrades * 1.1;
    }
}

// Function to apply building upgrade effects
function applyBuildingUpgrades(building) {
    if (!building || !building.playerId) return;

    const upgrades = playerUpgrades[building.playerId];
    if (!upgrades) return;

    // Apply building armor upgrade (each level adds 1 armor)
    // Applies to: Bunkers, Supply Depots, Sensor Towers, Shield Towers, and Tanks
    if (building.type === 'bunker' || building.type === 'supplyDepot' || 
        building.type === 'sensorTower' || building.type === 'shieldTower' || 
        building.type === 'tank') {
        if (building.baseArmor !== undefined) {
            building.armor = building.baseArmor + upgrades.buildingArmor;
        }
    }

    // Apply building regen upgrade (each level adds 0.2 regen)
    // Applies to: Bunkers, Supply Depots, Sensor Towers, and Turrets
    if (building.type === 'bunker' || building.type === 'supplyDepot' || 
        building.type === 'sensorTower' || building.type === 'turret') {
        if (building.baseHpRegen !== undefined) {
            building.hpRegen = building.baseHpRegen + (upgrades.buildingRegen * 0.2);
        }
    }
}

// Store player-specific data including resources, supply, color, and team
const players = {
    // Team 1 (Red)
    1: { team: 1, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(0, 75%, 65%)', killResourceScore: 0, workerRespawnTimers: [] },    // Light red
    2: { team: 1, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(0, 75%, 40%)', killResourceScore: 0, workerRespawnTimers: [] },    // Dark red

    // Team 2 (Blue)
    3: { team: 2, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(210, 75%, 65%)', killResourceScore: 0, workerRespawnTimers: [] },  // Light blue
    4: { team: 2, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(210, 75%, 40%)', killResourceScore: 0, workerRespawnTimers: [] },  // Dark blue

    // Team 3 (Green)
    5: { team: 3, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(120, 75%, 60%)', killResourceScore: 0, workerRespawnTimers: [] },  // Light green
    6: { team: 3, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(120, 75%, 35%)', killResourceScore: 0, workerRespawnTimers: [] },  // Dark green

    // Team 4 (Brown)
    7: { team: 4, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(30, 70%, 60%)', killResourceScore: 0, workerRespawnTimers: [] },   // Light brown
    8: { team: 4, supplyCap: maxSupplyCap, currentSupply: 0, workerSupplyCap: 1, currentWorkerSupply: 0, resources: 50, color: 'hsl(30, 70%, 35%)', killResourceScore: 0, workerRespawnTimers: [] }    // Dark brown
};


// Pregame / pause state
let isGamePaused = true;
window.isGamePaused = isGamePaused;
let isPregameCountdownActive = false;
let pregameCountdownRemaining = 0;
let pregameCountdownTimer = null;
const readyStates = Object.keys(players).reduce((state, id) => {
    state[id] = false;
    return state;
}, {});

// Team information
const teams = {
    1: { name: "Top Left", color: 'hsl(0, 75%, 50%)' },
    2: { name: "Top Right", color: 'hsl(210, 75%, 50%)' },
    3: { name: "Bottom Left", color: 'hsl(120, 75%, 45%)' },
    4: { name: "Bottom Right", color: 'hsl(30, 70%, 45%)' }
};

// Performance Monitor State
let isPerformanceMonitorVisible = false;
let lastFrameTime = performance.now();
let frameTimes = [];
let lastPerformanceUpdate = 0;

// Performance Monitor Elements
const performanceMonitor = document.getElementById('performanceMonitor');
const fpsCounter = document.getElementById('fpsCounter');
const frameTimeElement = document.getElementById('frameTime');
const memoryUsageElement = document.getElementById('memoryUsage');

// Player Controls State
let isPlayerControlsVisible = false; // Start with player controls hidden
const playerControls = document.getElementById('playerControls');

// Pregame overlay elements
const pregameOverlay = document.getElementById('pregameOverlay');
const pregameReadyListEl = document.getElementById('pregameReadyList');
const pregameCountdownEl = document.getElementById('pregameCountdown');
const pregameNotReadyBtn = document.getElementById('pregameNotReadyBtn');
const pregameReadyBtn = document.getElementById('pregameReadyBtn');
const pregameGoBtn = document.getElementById('pregameGoBtn');

// UI System
let uiSystem;

// Fog of War System
let fogOfWar;

// Hotkey double-click detection
let lastHotkeyPressed = null;
let lastHotkeyTime = 0;
const DOUBLE_CLICK_WINDOW = 500; // 500ms window for double-click detection

// Tank rotation state (for cycling through tanks when pressing 5 multiple times)
let tankRotationIndex = 0;
let lastTankSelection = [];

// Camera state
const camera = {
    x: MAP_WIDTH / 2 - window.innerWidth / 2, // Start centered
    y: MAP_HEIGHT / 2 - window.innerHeight / 2,
    velX: 0,
    velY: 0,
    update: function() {
        // Update camera position based on velocity
        this.x += this.velX;
        this.y += this.velY;

        // Constrain camera to visual map boundaries (extended area)
        // The visual boundaries start at -VISUAL_BOUNDARY_EXTENSION
        this.x = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(this.x, MAP_WIDTH + VISUAL_BOUNDARY_EXTENSION - canvas.width));
        this.y = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(this.y, MAP_HEIGHT + VISUAL_BOUNDARY_EXTENSION - canvas.height));
    }
};

// Coordinate conversion functions
function worldToScreen(worldX, worldY) {
    return {
        x: worldX - camera.x,
        y: worldY - camera.y
    };
}

// --- Fog of War System ---
class FogOfWar {
    constructor() {
        // Initialize fog grids for each team instead of each player
        this.teamFogGrids = {};
        
        // Initialize all teams
        Object.keys(teams).forEach(teamId => {
            this.teamFogGrids[teamId] = this.createFogGrid();
        });
    }
    
    createFogGrid() {
        const grid = [];
        for (let y = 0; y < FOG_GRID_HEIGHT; y++) {
            grid[y] = [];
            for (let x = 0; x < FOG_GRID_WIDTH; x++) {
                grid[y][x] = VISION_STATE.EXPLORED; // Start with whole map explored
            }
        }
        return grid;
    }
    
    // Convert world coordinates to fog grid coordinates
    worldToFogGrid(worldX, worldY) {
        return {
            x: Math.floor(worldX / FOG_GRID_SIZE),
            y: Math.floor(worldY / FOG_GRID_SIZE)
        };
    }
    
    // Check if fog grid coordinates are valid
    isValidFogCoords(gridX, gridY) {
        return gridX >= 0 && gridX < FOG_GRID_WIDTH && gridY >= 0 && gridY < FOG_GRID_HEIGHT;
    }
    
    // Add vision in a rectangular area
    addVisionRect(teamId, left, top, width, height) {
        const fogGrid = this.teamFogGrids[teamId];
        if (!fogGrid) return;

        const startGrid = this.worldToFogGrid(left, top);
        const endGrid = this.worldToFogGrid(left + width, top + height);

        const startX = Math.max(0, startGrid.x);
        const startY = Math.max(0, startGrid.y);
        const endX = Math.min(FOG_GRID_WIDTH - 1, endGrid.x);
        const endY = Math.min(FOG_GRID_HEIGHT - 1, endGrid.y);

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                fogGrid[y][x] = VISION_STATE.VISIBLE;
            }
        }
    }
    
    // Update vision for a specific team based on all their players' units and buildings
    updateTeamVision(teamId, gameObjects) {
        const fogGrid = this.teamFogGrids[teamId];
        if (!fogGrid) return;
        
        // First pass: mark all currently visible areas as explored (preserve history)
        for (let y = 0; y < FOG_GRID_HEIGHT; y++) {
            for (let x = 0; x < FOG_GRID_WIDTH; x++) {
                if (fogGrid[y][x] === VISION_STATE.VISIBLE) {
                    fogGrid[y][x] = VISION_STATE.EXPLORED;
                }
            }
        }
        
        // Second pass: mark areas visible by team members' units/buildings and controlled map features
        gameObjects.forEach(obj => {
            // Controlled Sight Tower grants central vision
            if (obj.type === 'sightTower' && obj.controllerTeamId === parseInt(teamId) && obj.isGrantingVision) {
                this.addVisionRect(teamId, CENTRAL_INNER_RECT.left, CENTRAL_INNER_RECT.top, CENTRAL_INNER_RECT.width, CENTRAL_INNER_RECT.height);
                return;
            }

            // Check if this object belongs to any player on this team
            const objPlayerData = players[obj.playerId];
            if (objPlayerData && objPlayerData.team == teamId && obj.health > 0 && obj.visionRange > 0) {
                this.addVisionCircle(teamId, obj.x, obj.y, obj.visionRange);
            }
        });
    }
    
    // Add vision in a circular area around a point
    addVisionCircle(teamId, centerX, centerY, radius) {
        const fogGrid = this.teamFogGrids[teamId];
        if (!fogGrid) return;
        
        const centerGridCoords = this.worldToFogGrid(centerX, centerY);
        const gridRadius = Math.ceil(radius / FOG_GRID_SIZE);
        
        for (let dy = -gridRadius; dy <= gridRadius; dy++) {
            for (let dx = -gridRadius; dx <= gridRadius; dx++) {
                const gridX = centerGridCoords.x + dx;
                const gridY = centerGridCoords.y + dy;
                
                if (!this.isValidFogCoords(gridX, gridY)) continue;
                
                // Check if this grid cell is within the vision circle
                const worldX = gridX * FOG_GRID_SIZE + FOG_GRID_SIZE / 2;
                const worldY = gridY * FOG_GRID_SIZE + FOG_GRID_SIZE / 2;
                const distance = Math.hypot(worldX - centerX, worldY - centerY);
                
                if (distance <= radius) {
                    fogGrid[gridY][gridX] = VISION_STATE.VISIBLE;
                }
            }
        }
    }
    
    // Get vision state at world coordinates for a specific team
    getVisionState(teamId, worldX, worldY) {
        const fogGrid = this.teamFogGrids[teamId];
        if (!fogGrid) return VISION_STATE.EXPLORED;
        
        const gridCoords = this.worldToFogGrid(worldX, worldY);
        if (!this.isValidFogCoords(gridCoords.x, gridCoords.y)) {
            return VISION_STATE.EXPLORED;
        }
        
        return fogGrid[gridCoords.y][gridCoords.x];
    }
    
    // Check if a point is visible to a team
    isVisible(teamId, worldX, worldY) {
        return this.getVisionState(teamId, worldX, worldY) === VISION_STATE.VISIBLE;
    }
    
    // Helper methods for working with player IDs
    getPlayerTeam(playerId) {
        const playerData = players[playerId];
        return playerData ? playerData.team : null;
    }
    
    // Get vision state for a player (converts to team internally)
    getPlayerVisionState(playerId, worldX, worldY) {
        const teamId = this.getPlayerTeam(playerId);
        if (teamId === null) return VISION_STATE.EXPLORED;
        return this.getVisionState(teamId, worldX, worldY);
    }
    
    // Check if a point is visible to a player (converts to team internally)
    isVisibleToPlayer(playerId, worldX, worldY) {
        const teamId = this.getPlayerTeam(playerId);
        if (teamId === null) return false;
        return this.isVisible(teamId, worldX, worldY);
    }
    
    // Render fog of war overlay for current player's team
    renderFogOverlay(ctx, playerId) {
        // Get the team ID for the current player
        const playerData = players[playerId];
        if (!playerData) return;
        
        const teamId = playerData.team;
        const fogGrid = this.teamFogGrids[teamId];
        if (!fogGrid) return;
        
        // Save context state
        const originalGlobalCompositeOperation = ctx.globalCompositeOperation;
        
        // Use source-over to draw fog on top
        ctx.globalCompositeOperation = 'source-over';
        
        // Draw fog cells
        for (let y = 0; y < FOG_GRID_HEIGHT; y++) {
            for (let x = 0; x < FOG_GRID_WIDTH; x++) {
                const visionState = fogGrid[y][x];
                
                if (visionState === VISION_STATE.VISIBLE) {
                    continue; // No fog needed for visible areas
                }
                
                // Calculate world coordinates for this fog cell
                const worldX = x * FOG_GRID_SIZE;
                const worldY = y * FOG_GRID_SIZE;
                
                // Convert to screen coordinates
                const screenPos = worldToScreen(worldX, worldY);
                
                // Skip if offscreen
                if (screenPos.x + FOG_GRID_SIZE < 0 || screenPos.x > canvas.width ||
                    screenPos.y + FOG_GRID_SIZE < 0 || screenPos.y > canvas.height) {
                    continue;
                }
                
                // Only draw fog for explored areas (not visible)
                if (visionState === VISION_STATE.EXPLORED) {
                    ctx.fillStyle = FOG_EXPLORED_COLOR;
                }
                
                // Draw fog cell
                ctx.fillRect(screenPos.x, screenPos.y, FOG_GRID_SIZE, FOG_GRID_SIZE);
            }
        }
        
        // Restore context state
        ctx.globalCompositeOperation = originalGlobalCompositeOperation;
    }
}

function screenToWorld(screenX, screenY) {
    return {
        x: screenX + camera.x,
        y: screenY + camera.y
    };
}

// Convert world coordinates to grid coordinates
function worldToGrid(worldX, worldY) {
    // First determine which tile this is in
    const tileX = Math.floor(worldX / TILE_WIDTH);
    const tileY = Math.floor(worldY / TILE_HEIGHT);

    // Calculate position within the tile
    const tileRelativeX = worldX - tileX * TILE_WIDTH;
    const tileRelativeY = worldY - tileY * TILE_HEIGHT;

    // Calculate position relative to the inner area
    const innerRelativeX = tileRelativeX - INNER_TILE_OFFSET_X;
    const innerRelativeY = tileRelativeY - INNER_TILE_OFFSET_Y;

    // Check if the position is within the inner area of the tile
    const isInInnerArea =
        innerRelativeX >= 0 &&
        innerRelativeX < ADJUSTED_INNER_TILE_WIDTH &&
        innerRelativeY >= 0 &&
        innerRelativeY < ADJUSTED_INNER_TILE_HEIGHT;

    // Calculate which grid cell within the inner area
    let gridXInTile, gridYInTile;

    if (isInInnerArea) {
        // If inside the inner area, calculate the exact grid cell
        gridXInTile = Math.floor(innerRelativeX / GRID_CELL_WIDTH);
        gridYInTile = Math.floor(innerRelativeY / GRID_CELL_HEIGHT);
    } else {
        // If outside, find the closest grid cell in the inner area
        // Clamp innerRelativeX/Y to the inner area boundaries
        const clampedInnerX = Math.max(0, Math.min(innerRelativeX, ADJUSTED_INNER_TILE_WIDTH - 1));
        const clampedInnerY = Math.max(0, Math.min(innerRelativeY, ADJUSTED_INNER_TILE_HEIGHT - 1));

        gridXInTile = Math.floor(clampedInnerX / GRID_CELL_WIDTH);
        gridYInTile = Math.floor(clampedInnerY / GRID_CELL_HEIGHT);
    }

    // Ensure grid coordinates are within valid range
    gridXInTile = Math.max(0, Math.min(gridXInTile, GRID_CELLS_PER_TILE - 1));
    gridYInTile = Math.max(0, Math.min(gridYInTile, GRID_CELLS_PER_TILE - 1));

    // Calculate global grid coordinates
    const gridX = tileX * GRID_CELLS_PER_TILE + gridXInTile;
    const gridY = tileY * GRID_CELLS_PER_TILE + gridYInTile;

    return {
        gridX,
        gridY,
        tileX,
        tileY,
        gridXInTile,
        gridYInTile,
        isInInnerArea
    };
}

// Convert grid coordinates to world coordinates (center of grid cell)
function gridToWorld(gridX, gridY) {
    // Calculate which tile this grid cell is in
    const tileX = Math.floor(gridX / GRID_CELLS_PER_TILE);
    const tileY = Math.floor(gridY / GRID_CELLS_PER_TILE);

    // Calculate grid position within the tile
    const gridXInTile = gridX % GRID_CELLS_PER_TILE;
    const gridYInTile = gridY % GRID_CELLS_PER_TILE;

    // Calculate world coordinates (center of the grid cell)
    // Start with the tile position
    const tileWorldX = tileX * TILE_WIDTH;
    const tileWorldY = tileY * TILE_HEIGHT;

    // Add the offset to the inner area
    const innerAreaX = tileWorldX + INNER_TILE_OFFSET_X;
    const innerAreaY = tileWorldY + INNER_TILE_OFFSET_Y;

    // Add the position within the inner grid
    const worldX = innerAreaX + gridXInTile * GRID_CELL_WIDTH + GRID_CELL_WIDTH / 2;
    const worldY = innerAreaY + gridYInTile * GRID_CELL_HEIGHT + GRID_CELL_HEIGHT / 2;

    return { x: worldX, y: worldY };
}

// Function to check if a point is within the map boundaries
function isWithinMapBoundaries(x, y) {
    return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

// Function to check if a building placement is valid
function isValidBuildingPlacement(gridX, gridY, buildingType) {
    if (!buildingType || !BUILDING_GRID_SIZES[buildingType]) return false;

    const { width, height } = BUILDING_GRID_SIZES[buildingType];
    const topLeftWorld = gridToWorld(gridX, gridY);
    const candidateLeft = topLeftWorld.x - GRID_CELL_WIDTH / 2;
    const candidateTop = topLeftWorld.y - GRID_CELL_HEIGHT / 2;
    const candidateWorldWidth = width * GRID_CELL_WIDTH;
    const candidateWorldHeight = height * GRID_CELL_HEIGHT;
    const candidateRight = candidateLeft + candidateWorldWidth;
    const candidateBottom = candidateTop + candidateWorldHeight;

    // Get the tile this grid cell belongs to
    const tileX = Math.floor(gridX / GRID_CELLS_PER_TILE);
    const tileY = Math.floor(gridY / GRID_CELLS_PER_TILE);

    // Check if the building stays within the 4x4 grid of this tile
    // This ensures buildings don't cross tile boundaries
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellGridX = gridX + x;
            const cellGridY = gridY + y;

            // Calculate which tile this cell belongs to
            const cellTileX = Math.floor(cellGridX / GRID_CELLS_PER_TILE);
            const cellTileY = Math.floor(cellGridY / GRID_CELLS_PER_TILE);

            // If the cell is in a different tile, the placement is invalid
            if (cellTileX !== tileX || cellTileY !== tileY) {
                return false;
            }

            // Check if the cell is within the 4x4 grid
            const gridXInTile = cellGridX % GRID_CELLS_PER_TILE;
            const gridYInTile = cellGridY % GRID_CELLS_PER_TILE;

            if (gridXInTile >= GRID_CELLS_PER_TILE || gridYInTile >= GRID_CELLS_PER_TILE) {
                return false;
            }
        }
    }

    // Check if the building is within map boundaries
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const worldPos = gridToWorld(gridX + x, gridY + y);
            if (!isWithinMapBoundaries(worldPos.x, worldPos.y)) {
                return false;
            }
        }
    }

    // Check if the building overlaps with any existing buildings
    // We'll create a set of occupied grid cells
    const occupiedGridCells = new Set();

    // First, mark all grid cells occupied by existing buildings
    for (const obj of gameObjects) {
        if (obj.isNeutralStructure) {
            const objHalfWidth = (obj.width || obj.size) / 2;
            const objHalfHeight = (obj.height || obj.size) / 2;
            const objLeft = obj.x - objHalfWidth;
            const objRight = obj.x + objHalfWidth;
            const objTop = obj.y - objHalfHeight;
            const objBottom = obj.y + objHalfHeight;

            // Simple bounding-box overlap check to reserve space around map features
            if (candidateLeft < objRight && candidateRight > objLeft &&
                candidateTop < objBottom && candidateBottom > objTop) {
                return false;
            }
            continue;
        }

        if ((obj.type === 'bunker' || obj.type === 'supplyDepot' ||
             obj.type === 'shieldTower' || obj.type === 'sensorTower' ||
             obj.type === 'tankConstruction') &&
             obj.health > 0) {

            // If the building has stored grid coordinates, use those
            if (obj.gridX !== undefined && obj.gridY !== undefined &&
                obj.gridWidth !== undefined && obj.gridHeight !== undefined) {

                // Mark all grid cells occupied by this building
                for (let y = 0; y < obj.gridHeight; y++) {
                    for (let x = 0; x < obj.gridWidth; x++) {
                        const cellKey = `${obj.gridX + x},${obj.gridY + y}`;
                        occupiedGridCells.add(cellKey);
                    }
                }
            } else {
                // Fallback for older buildings without grid info
                // Determine building size based on type
                let objWidth = 1;
                let objHeight = 1;

                if (obj.type === 'bunker') {
                    objWidth = BUILDING_GRID_SIZES.bunker.width;
                    objHeight = BUILDING_GRID_SIZES.bunker.height;
                } else if (obj.type === 'supplyDepot') {
                    objWidth = BUILDING_GRID_SIZES.supplyDepot.width;
                    objHeight = BUILDING_GRID_SIZES.supplyDepot.height;
                } else if (obj.type === 'shieldTower') {
                    objWidth = BUILDING_GRID_SIZES.shieldTower.width;
                    objHeight = BUILDING_GRID_SIZES.shieldTower.height;
                } else if (obj.type === 'sensorTower') {
                    objWidth = BUILDING_GRID_SIZES.sensorTower.width;
                    objHeight = BUILDING_GRID_SIZES.sensorTower.height;
                } else if (obj.type === 'tankConstruction') {
                    objWidth = BUILDING_GRID_SIZES.tank.width;
                    objHeight = BUILDING_GRID_SIZES.tank.height;
                }

                // Convert building position to grid coordinates
                const objGridPos = worldToGrid(obj.x, obj.y);

                // Calculate the top-left grid cell of the building
                const objBaseGridX = objGridPos.gridX - Math.floor(objWidth / 2);
                const objBaseGridY = objGridPos.gridY - Math.floor(objHeight / 2);

                // Mark all grid cells occupied by this building
                for (let y = 0; y < objHeight; y++) {
                    for (let x = 0; x < objWidth; x++) {
                        const cellKey = `${objBaseGridX + x},${objBaseGridY + y}`;
                        occupiedGridCells.add(cellKey);
                    }
                }
            }
        }
    }

    // Now check if any of the cells we want to place on are occupied
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellKey = `${gridX + x},${gridY + y}`;
            if (occupiedGridCells.has(cellKey)) {
                return false; // Cell is already occupied
            }
        }
    }

    return true;
}

// --- Helper Functions (Add Color Helper) ---
function getDarkerHslColor(hslColor, reduction = 20) {
    // Simple parsing assuming "hsl(H, S%, L%)" format
    const parts = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return '#000000'; // Fallback

    const h = parseInt(parts[1]);
    const s = parseInt(parts[2]);
    let l = parseInt(parts[3]);

    l = Math.max(0, l - reduction); // Reduce lightness, clamp at 0

    return `hsl(${h}, ${s}%, ${l}%)`;
}

function applyAlphaToColor(color, alpha) {
    if (!color) return `rgba(255, 255, 255, ${alpha})`;

    if (color.startsWith('hsl')) {
        return color.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
    }

    if (color.startsWith('rgb')) {
        return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }

    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return color;
}

function getCooldownBarColor(baseColor, readiness) {
    const clampedReadiness = Math.min(1, Math.max(0, readiness));
    // Make the bar more opaque as it becomes ready
    const alpha = 0.35 + 0.45 * clampedReadiness;
    return applyAlphaToColor(baseColor, alpha);
}

// --- New Health Bar Helper Functions ---
function getHealthBasedColor(baseHslColor, healthRatio) {
    const parts = baseHslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return '#CCCCCC'; // Fallback grey

    const h = parseInt(parts[1]);
    let s = parseInt(parts[2]);
    let l = parseInt(parts[3]);

    // Adjust Lightness and Saturation based on health
    // Full health: original L, S
    // Low health: Lower L, slightly lower S
    // Lerp (linear interpolation)
    const minL = Math.max(0, l - 25); // Don't go too dark
    const minS = Math.max(0, s - 30); // Reduce saturation slightly

    const currentL = minL + (l - minL) * healthRatio;
    const currentS = minS + (s - minS) * healthRatio;

    return `hsl(${h}, ${Math.round(currentS)}%, ${Math.round(currentL)}%)`;
}

function drawHealthBar(ctx, worldX, worldY, currentHealth, maxHealth, width, height, basePlayerColor) {
    if (currentHealth <= 0) return; // Don't draw if dead

    // Convert world position to screen position
    const screenPos = worldToScreen(worldX, worldY);

    // Skip if offscreen
    if (screenPos.x < -width ||
        screenPos.x > canvas.width + width ||
        screenPos.y < -height ||
        screenPos.y > canvas.height + height) {
        return;
    }

    const healthRatio = Math.max(0, currentHealth / maxHealth);
    const barX = screenPos.x - width / 2;
    const barY = screenPos.y - height; // Adjust Y based on top coordinate

    // 1. Get dynamic fill color
    const fillColor = getHealthBasedColor(basePlayerColor, healthRatio);

    // Save context state
    const originalFill = ctx.fillStyle;
    const originalStroke = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // 2. Draw Background
    ctx.fillStyle = HEALTHBAR_BACKGROUND_COLOR;
    ctx.fillRect(barX, barY, width, height);

    // 3. Draw Filled Portion
    ctx.fillStyle = fillColor;
    const filledWidth = width * healthRatio;
    ctx.fillRect(barX, barY, filledWidth, height);

    // 4. Draw Dividers
    ctx.strokeStyle = HEALTHBAR_DIVIDER_COLOR;
    ctx.lineWidth = HEALTHBAR_BORDER_WIDTH; // Use border width for dividers too
    const thirdWidth = width / 3;
    // Line 1 (1/3)
    ctx.beginPath();
    ctx.moveTo(barX + thirdWidth, barY);
    ctx.lineTo(barX + thirdWidth, barY + height);
    ctx.stroke();
    // Line 2 (2/3)
    ctx.beginPath();
    ctx.moveTo(barX + 2 * thirdWidth, barY);
    ctx.lineTo(barX + 2 * thirdWidth, barY + height);
    ctx.stroke();

    // 5. Draw Border
    ctx.strokeStyle = HEALTHBAR_BORDER_COLOR;
    ctx.lineWidth = HEALTHBAR_BORDER_WIDTH;
    ctx.strokeRect(barX, barY, width, height);

    // Restore context state
    ctx.fillStyle = originalFill;
    ctx.strokeStyle = originalStroke;
    ctx.lineWidth = originalLineWidth;
}

function drawCooldownBar(ctx, worldX, worldY, readiness, width, height, basePlayerColor) {
    // Convert world position to screen position
    const screenPos = worldToScreen(worldX, worldY);

    // Skip if offscreen
    if (screenPos.x < -width ||
        screenPos.x > canvas.width + width ||
        screenPos.y < -height ||
        screenPos.y > canvas.height + height) {
        return;
    }

    const clampedReadiness = Math.min(1, Math.max(0, readiness));
    const barX = screenPos.x - width / 2;
    const barY = screenPos.y - height; // Provided top coordinate

    const originalFill = ctx.fillStyle;
    const originalStroke = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // Background
    ctx.fillStyle = COOLDOWN_BAR_BACKGROUND_COLOR;
    ctx.fillRect(barX, barY, width, height);

    // Fill
    ctx.fillStyle = getCooldownBarColor(basePlayerColor, clampedReadiness);
    const filledWidth = width * clampedReadiness;
    ctx.fillRect(barX, barY, filledWidth, height);

    // Border
    ctx.strokeStyle = COOLDOWN_BAR_BORDER_COLOR;
    ctx.lineWidth = COOLDOWN_BAR_BORDER_WIDTH;
    ctx.strokeRect(barX, barY, width, height);

    ctx.fillStyle = originalFill;
    ctx.strokeStyle = originalStroke;
    ctx.lineWidth = originalLineWidth;
}

function drawCapacityBar(ctx, worldX, worldY, capacity, width, height, basePlayerColor) {
    // Convert world position to screen position
    const screenPos = worldToScreen(worldX, worldY);

    // Skip if offscreen
    if (screenPos.x < -width ||
        screenPos.x > canvas.width + width ||
        screenPos.y < -height ||
        screenPos.y > canvas.height + height) {
        return;
    }

    const clampedCapacity = Math.min(1, Math.max(0, capacity));
    const barX = screenPos.x - width / 2;
    const barY = screenPos.y - height; // Provided top coordinate

    const originalFill = ctx.fillStyle;
    const originalStroke = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // Background (different from health bar - darker)
    ctx.fillStyle = 'rgba(40, 40, 40, 0.8)';
    ctx.fillRect(barX, barY, width, height);

    // Fill (different color from health - use a distinct color like cyan/blue)
    const capacityColor = basePlayerColor.startsWith('hsl') 
        ? basePlayerColor.replace('hsl', 'hsla').replace(')', ', 0.7)')
        : 'rgba(0, 200, 255, 0.7)';
    ctx.fillStyle = capacityColor;
    const filledWidth = width * clampedCapacity;
    ctx.fillRect(barX, barY, filledWidth, height);

    // Border (different from health bar)
    ctx.strokeStyle = 'rgba(0, 150, 200, 0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, width, height);

    ctx.fillStyle = originalFill;
    ctx.strokeStyle = originalStroke;
    ctx.lineWidth = originalLineWidth;
}

// --- GameObject Class ---
class GameObject {
    constructor(x, y, playerId, size, stats = {}) {
        this.id = `${this.constructor.name}_${playerId}_${Math.random().toString(16).slice(2)}`;
        this.x = x;
        this.y = y;
        this.size = size;
        this.playerId = playerId;
        const playerData = players[playerId];
        this.color = playerData?.color || NEUTRAL_PLAYER_COLOR;

        // Core stats with defaults
        this.maxHealth = stats.maxHealth || 100;
        this.health = this.maxHealth;
        this.armor = stats.armor || 0;
        this.attackDamage = stats.attackDamage || 0;
        this.attackSpeed = stats.attackSpeed || 1;
        this.attackRange = stats.attackRange || 0;
        this.hpRegen = stats.hpRegen || 0;
        this.visionRange = stats.visionRange || 200;
        this.supplyCost = stats.supplyCost || 0;

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
        this.lastRegenTime = 0;

        // Shield bonus from shield towers
        this.shieldBonus = 0;
    }

    takeDamage(damage) {
        // Calculate total armor including shield bonus
        const totalArmor = (this.armor || 0) + (this.shieldBonus || 0);
        const actualDamage = Math.max(1, damage - totalArmor);
        this.health = Math.max(0, this.health - actualDamage);

        if (this.health <= 0) {
            this.isDestroyed = true;

            // Grant resources to the killer
            const killer = gameObjects.find(obj => obj.targetUnit === this);
            if (killer && killer.playerId !== this.playerId) {
                const playerState = players[killer.playerId];
                let resourceAmount = 0;

                if (this.type === 'worker') {
                    resourceAmount = RESOURCE_GAIN_WORKER;
                } else if (this.type === 'marine' || this.type === 'reaper' || this.type === 'marauder' || this.type === 'ghost') {
                    resourceAmount = RESOURCE_GAIN_UNIT;
                } else                 if (this.isBuilding) {
                    if (this instanceof Bunker) resourceAmount = RESOURCE_GAIN_BUNKER;
                    else if (this instanceof SupplyDepot) resourceAmount = RESOURCE_GAIN_SUPPLY_DEPOT;
                    else if (this instanceof ShieldTower || this instanceof SensorTower) resourceAmount = RESOURCE_GAIN_TOWER;
                    else if (this.type === 'turret') resourceAmount = RESOURCE_GAIN_TURRET;
                }

                if (resourceAmount > 0) {
                    playerState.resources += resourceAmount;
                    createResourceGainText(this.x, this.y, `+${resourceAmount}`, this.isBuilding, killer.playerId);
                }
            }
            return true; // Is dead
        }
        return false; // Is not dead
    }

    update(now, gameObjects) {
        if (this.isDestroyed) return;

        // Handle HP regeneration
        if (this.hpRegen > 0 && this.health < this.maxHealth && this.health > 0) {
            // Initialize lastRegenTime if not set (use current time minus interval to allow immediate first tick)
            if (!this.lastRegenTime || this.lastRegenTime === 0) {
                this.lastRegenTime = now - 1000; // Set to 1 second ago so first tick happens immediately
            }
            
            const regenInterval = 1000; // Regen tick every second
            const timeSinceLastRegen = now - this.lastRegenTime;
            if (timeSinceLastRegen >= regenInterval) {
                // Apply regen (can apply multiple ticks if frame rate is low)
                const ticksToApply = Math.floor(timeSinceLastRegen / regenInterval);
                if (ticksToApply > 0) {
                    this.health = Math.min(this.maxHealth, this.health + (this.hpRegen * ticksToApply));
                    this.lastRegenTime = now - (timeSinceLastRegen % regenInterval); // Preserve remainder
                }
            }
        }

        // Apply upgrades if this is the first update
        if (this.firstUpdate === undefined) {
            this.firstUpdate = true;
            if (this.type === 'marine' || this.type === 'worker' || this.type === 'reaper' || this.type === 'marauder' || this.type === 'ghost') {
                applyUpgradesToUnit(this);
            }
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (
            pointX >= this.x - halfSize &&
            pointX <= this.x + halfSize &&
            pointY >= this.y - halfSize &&
            pointY <= this.y + halfSize
        );
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        return [{
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - this.size/2 - HEALTHBAR_UNIT_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color
        }];
    }
}

// --- FloatingText Class ---
class FloatingText {
    constructor(x, y, text, color, font, duration) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.font = font;
        this.duration = duration;
        this.startTime = performance.now();
        this.opacity = 1.0;
    }

    update(now) {
        // Calculate progress (0 to 1)
        const elapsed = now - this.startTime;
        const progress = Math.min(1.0, elapsed / this.duration);

        // Update position (float upward)
        this.y -= RESOURCE_TEXT_SPEED;

        // Update opacity (fade out)
        this.opacity = 1.0 - progress;

        // Return true if still active, false if expired
        return progress < 1.0;
    }

    draw(ctx) {
        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Skip if offscreen
        if (screenPos.x < 0 || screenPos.x > canvas.width ||
            screenPos.y < 0 || screenPos.y > canvas.height) {
            return;
        }

        // Draw text with current opacity
        ctx.font = this.font;
        ctx.textAlign = 'center';

        // Handle HSL color format from player colors
        if (this.color.startsWith('hsl')) {
            ctx.fillStyle = this.color.replace('hsl', 'hsla').replace(')', `, ${this.opacity})`);
        } else {
            // Handle RGB or other color formats
            ctx.fillStyle = this.color.replace(')', `, ${this.opacity})`).replace('rgb', 'rgba');
        }

        // Add text shadow for better visibility
        ctx.shadowColor = 'rgba(0, 0, 0, ' + this.opacity * 0.7 + ')';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // Draw the text
        ctx.fillText(this.text, screenPos.x, screenPos.y);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
}

// --- Building Classes ---

// --- Sight Tower (Neutral Map Feature) ---
class SightTower extends GameObject {
    constructor(x, y) {
        const bunkerSize = GRID_CELL_WIDTH * BUILDING_GRID_SIZES.bunker.width;
        const towerSize = Math.floor(bunkerSize * SIGHT_TOWER_SIZE_RATIO);
        const towerStats = {
            maxHealth: Number.MAX_SAFE_INTEGER,
            armor: 9999,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0,
            visionRange: 0,
            supplyCost: 0
        };
        super(x, y, NEUTRAL_PLAYER_ID, towerSize, towerStats);

        this.type = 'sightTower';
        this.isNeutralStructure = true;
        this.isMapFeature = true;
        this.isInvulnerable = true;
        this.width = towerSize;
        this.height = towerSize;
        this.controllerTeamId = null;
        this.controllerPlayerId = null;
        this.isContested = false;
        this.isGrantingVision = false;
    }

    // Immutable map object
    takeDamage() { return false; }

    // Static visuals only — no UI chrome like health bars
    getUIDrawCommands() { return []; }

    drawBody(ctx) {
        const screenPos = worldToScreen(this.x, this.y);
        const halfSize = this.size / 2;

        // Skip rendering if offscreen
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return;
        }

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // Soft drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(drawX + 3, drawY + 3, this.size, this.size);

        // Base
        const baseColor = this.color || SIGHT_TOWER_COLOR;
        ctx.fillStyle = baseColor;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // Inner highlight for minimal depth
        const outlineColor = getDarkerHslColor(baseColor, 20);
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX + 6, drawY + 6, this.size - 12, this.size - 12);
    }

    update(now, allGameObjects) {
        // Determine which teams have units touching the tower
        const halfSize = this.size / 2;
        const towerLeft = this.x - halfSize;
        const towerRight = this.x + halfSize;
        const towerTop = this.y - halfSize;
        const towerBottom = this.y + halfSize;

        const teamHits = new Map();

        allGameObjects.forEach(obj => {
            if (!obj || obj.health <= 0) return;
            if (!(obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank')) return;

            const objHalf = obj.size / 2;
            const objLeft = obj.x - objHalf;
            const objRight = obj.x + objHalf;
            const objTop = obj.y - objHalf;
            const objBottom = obj.y + objHalf;

            const overlaps = objLeft < towerRight && objRight > towerLeft && objTop < towerBottom && objBottom > towerTop;
            if (!overlaps) return;

            const playerData = players[obj.playerId];
            if (!playerData) return;
            const teamId = playerData.team;

            if (!teamHits.has(teamId)) {
                teamHits.set(teamId, obj.playerId);
            }
        });

        if (teamHits.size === 1) {
            // Exactly one team controls
            const [[teamId, controllerPlayerId]] = teamHits.entries();
            this.controllerTeamId = teamId;
            this.controllerPlayerId = controllerPlayerId;
            this.isContested = false;
            this.isGrantingVision = true;
            this.color = players[controllerPlayerId]?.color || NEUTRAL_PLAYER_COLOR;
        } else {
            // Contested or empty
            this.controllerTeamId = null;
            this.controllerPlayerId = null;
            this.isContested = teamHits.size > 1;
            this.isGrantingVision = false;
            this.color = NEUTRAL_PLAYER_COLOR;
        }
    }
}

// --- Bunker Class ---
class Bunker extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const bunkerStats = {
            maxHealth: 500,
            armor: 3,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 1,
            visionRange: 800, // Bunkers have excellent vision range for defensive structures
            supplyCost: 0
        };

        // Size based on grid cells (3x3)
        const width = GRID_CELL_WIDTH * 3;
        const height = GRID_CELL_HEIGHT * 3;
        const size = Math.max(width, height);
        super(x, y, playerId, size, bunkerStats);

        // Store base stats for upgrades
        this.baseArmor = bunkerStats.armor;
        this.baseHpRegen = bunkerStats.hpRegen;

        // Store actual width and height for drawing and click detection
        this.width = width;
        this.height = height;

        // Store grid dimensions for placement validation
        this.gridWidth = 3;
        this.gridHeight = 3;

        // Bunker-specific properties
        this.type = 'bunker';
        this.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
        this.spawnCooldown = BUNKER_SPAWN_COOLDOWN;
        this.lastSpawnTime = 0;
        this.supplyBonus = BUNKER_SUPPLY_BONUS;
        this.lastLoggedRing = -1; // For debug logging of ring changes

        // Building Capacity: units that are inside the bunker
        this.garrisonedUnits = []; // Array of units inside the bunker
        const upgrades = playerUpgrades[playerId] || { buildingCapacity: 0 };
        this.capacityBonus = upgrades.buildingCapacity * 50; // Attack range bonus for garrisoned units (50 per level)

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1

        // Only add supply bonus when construction is complete
        if (!isUnderConstruction && players[playerId]) {
            players[playerId].supplyCap += this.supplyBonus;
        }

        // Apply building upgrades
        applyBuildingUpgrades(this);
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the bunker is visible on screen
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        if (screenPos.x + halfWidth < 0 ||
            screenPos.x - halfWidth > canvas.width ||
            screenPos.y + halfHeight < 0 ||
            screenPos.y - halfHeight > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfWidth;
        const drawY = screenPos.y - halfHeight;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.width, this.height);

        // Draw Bunker Body
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Add inner highlight for 3D effect
        const highlightColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.7)');
        ctx.fillStyle = highlightColor;
        ctx.fillRect(drawX + 5, drawY + 5, this.width - 10, this.height - 10);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 3; // Increased bunker border thickness
        ctx.strokeRect(drawX, drawY, this.width, this.height);

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(drawX - 5, drawY - 5, this.width + 10, this.height + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.width * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfHeight - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern for 3x3 grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // Horizontal lines - 2 internal lines for 3x3 grid
            const horizontalSpacing = this.size / 3;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(drawX, drawY + i * horizontalSpacing);
                ctx.lineTo(drawX + this.size, drawY + i * horizontalSpacing);
                ctx.stroke();
            }

            // Vertical lines - 2 internal lines for 3x3 grid
            const verticalSpacing = this.size / 3;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(drawX + i * verticalSpacing, drawY);
                ctx.lineTo(drawX + i * verticalSpacing, drawY + this.size);
                ctx.stroke();
            }

            ctx.setLineDash([]);
        }

        // Draw directional triangle pointing toward rally point
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

        // Calculate direction to rally point
        const dx = this.rallyPoint.x - this.x;
        const dy = this.rallyPoint.y - this.y;
        const angle = Math.atan2(dy, dx);
        const ring = getTileRing(this.x, this.y);
        
        // Debug: Always log ring info when drawing visual indicators
        if (this.lastLoggedRing !== ring) {

            this.lastLoggedRing = ring;
        }

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(angle);

        const indicatorSize = Math.min(this.width, this.height) * 0.3;

        switch (ring) {
            case 0: // Ring 1 - Marine (single triangle)
            default:
                ctx.beginPath();
                ctx.moveTo(indicatorSize, 0);
                ctx.lineTo(-indicatorSize / 2, -indicatorSize / 2);
                ctx.lineTo(-indicatorSize / 2, indicatorSize / 2);
                ctx.closePath();
                ctx.fill();
                break;
            case 1: // Ring 2 - Reaper (two triangles)
                const reaperTriangleSize = indicatorSize * 0.7;
                const reaperOffsetY = indicatorSize * 0.4;
                // Gun 1
                ctx.beginPath();
                ctx.moveTo(reaperTriangleSize, -reaperOffsetY);
                ctx.lineTo(-reaperTriangleSize / 2, -reaperOffsetY - reaperTriangleSize / 2);
                ctx.lineTo(-reaperTriangleSize / 2, -reaperOffsetY + reaperTriangleSize / 2);
                ctx.closePath();
                ctx.fill();
                // Gun 2
                ctx.beginPath();
                ctx.moveTo(reaperTriangleSize, reaperOffsetY);
                ctx.lineTo(-reaperTriangleSize / 2, reaperOffsetY - reaperTriangleSize / 2);
                ctx.lineTo(-reaperTriangleSize / 2, reaperOffsetY + reaperTriangleSize / 2);
                ctx.closePath();
                ctx.fill();
                break;
            case 2: // Ring 3 - Marauder (square)
                ctx.fillRect(-indicatorSize / 2, -indicatorSize / 2, indicatorSize, indicatorSize);
                break;
            case 3: // Ring 4 - Ghost (circle)
                ctx.beginPath();
                ctx.arc(0, 0, indicatorSize / 1.5, 0, Math.PI * 2);
                ctx.fill();
                break;
        }

        ctx.restore();

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state we are about to change
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 6;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_BUNKER; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN); // Apply dash pattern
            ctx.lineDashOffset = dashOffset; // Apply animation offset

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const now = performance.now(); // Needed for animations and cooldown
        const halfHeight = this.height / 2;
        const healthTopY = this.y - halfHeight - HEALTHBAR_BUNKER_OFFSET_Y;

        // Production cooldown bar sits directly beneath the health bar
        if (!this.isUnderConstruction && this.spawnCooldown > 0) {
            const timeSinceLastSpawn = now - this.lastSpawnTime;
            const readiness = Math.min(1, Math.max(0, timeSinceLastSpawn / this.spawnCooldown));
            const cooldownTopY = healthTopY + HEALTHBAR_BUNKER_HEIGHT + COOLDOWN_BAR_GAP;

            commands.push({
                type: 'cooldownBar',
                centerX: this.x,
                topY: cooldownTopY,
                readiness,
                width: HEALTHBAR_BUNKER_WIDTH,
                height: COOLDOWN_BAR_HEIGHT,
                basePlayerColor: this.color
            });
        }

        // --- Generate Health Bar Command --- Changed from text
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: healthTopY,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_BUNKER_WIDTH,
            height: HEALTHBAR_BUNKER_HEIGHT,
            basePlayerColor: this.color // Pass player color
        });

        // Building Capacity indicator (if upgrade is purchased and units are garrisoned)
        const upgrades = playerUpgrades[this.playerId] || { buildingCapacity: 0 };
        if (upgrades.buildingCapacity > 0 && this.garrisonedUnits && this.garrisonedUnits.length > 0) {
            const capacityTopY = healthTopY - HEALTHBAR_BUNKER_HEIGHT - COOLDOWN_BAR_GAP - HEALTHBAR_BUNKER_HEIGHT;
            const capacityRatio = this.garrisonedUnits.length / (upgrades.buildingCapacity * 4); // Max 4 units per level
            commands.push({
                type: 'capacityBar',
                centerX: this.x,
                topY: capacityTopY,
                capacity: Math.min(1, capacityRatio),
                width: HEALTHBAR_BUNKER_WIDTH,
                height: HEALTHBAR_BUNKER_HEIGHT,
                basePlayerColor: this.color
            });
        }
        /* Original Text Health:
        commands.push({
            type: 'text',
            content: this.health,
            x: this.x,
            y: this.y - halfSize - 8,
            color: HEALTH_BAR_COLOR,
            font: BUNKER_HEALTH_FONT,
            textAlign: 'center'
        });
        */

        if (isSelected && this.playerId === currentPlayerId) {
            const lineDashOffset = -(now * RALLY_LINE_ANIMATION_SPEED) % (RALLY_LINE_DASH_PATTERN[0] + RALLY_LINE_DASH_PATTERN[1]);

            commands.push({
                type: 'rally',
                startX: this.x,
                startY: this.y,
                endX: this.rallyPoint.x,
                endY: this.rallyPoint.y,
                color: this.color,
                playerId: this.playerId,
                lineWidth: 1,
                lineDash: RALLY_LINE_DASH_PATTERN,
                lineDashOffset: lineDashOffset,
                pulseDuration: RALLY_PULSE_DURATION,
                rippleStartRadius: RALLY_PULSE_START_RADIUS
            });
        }

        return commands;
    }

    update(now, allGameObjects, playersState) {
        if (this.health <= 0 || this.isUnderConstruction) return;

        const playerState = playersState[this.playerId];
        if (!playerState) {
            
            return;
        }

        const timeSinceLastSpawn = now - this.lastSpawnTime;
        if (timeSinceLastSpawn >= this.spawnCooldown) {
            if (playerState.currentSupply < playerState.supplyCap) {
                // 1. Determine unit type and size first
                const ring = getTileRing(this.x, this.y);
                let unitClass;
                let unitType;

                switch (ring) {
                    case 0: unitClass = Marine; unitType = 'marine'; break; // Ring 1 (outermost) - Marines
                    case 1: unitClass = Reaper; unitType = 'reaper'; break; // Ring 2 - Reapers
                    case 2: unitClass = Marauder; unitType = 'marauder'; break; // Ring 3 - Marauders
                    case 3: unitClass = Ghost; unitType = 'ghost'; break; // Ring 4 (innermost) - Ghosts
                    default: unitClass = Marine; unitType = 'marine'; break;
                }
                
                // Debug: Log spawning info with more detail

                const unitSize = UNIT_DEFAULT_SIZES[unitType];

                // 2. Use the original dynamic spawn finding logic, but with the correct size
                const dx = this.rallyPoint.x - this.x;
                const dy = this.rallyPoint.y - this.y;
                const distance = Math.hypot(dx, dy);

                let angle = Math.atan2(dy, dx);
                if (distance < 1) { // If rally point is on or inside the bunker
                    angle = Math.random() * Math.PI * 2; // Pick a random direction
                }

                // Use the actual unit's size for the offset
                const spawnOffset = (this.width / 2) + (unitSize / 2) + 5; // 5px buffer

                let spawnX, spawnY;
                let blocked = true;
                let attempts = 0;
                const maxAttempts = 8; // 8 directions (45 degrees)

                while (blocked && attempts < maxAttempts) {
                    const dirX = Math.cos(angle);
                    const dirY = Math.sin(angle);
                    spawnX = this.x + dirX * spawnOffset;
                    spawnY = this.y + dirY * spawnOffset;

                    blocked = false;
                    for (const obj of allGameObjects) {
                        // Check collision with other objects, using the correct size for the unit being spawned
                        if (obj.health > 0 && Math.hypot(obj.x - spawnX, obj.y - spawnY) < (obj.size / 2 + unitSize / 2)) {
                            blocked = true;
                            break;
                        }
                    }

                    if (blocked) {
                        angle += Math.PI / 4; // 45 degrees
                        attempts++;
                    }
                }

                // If all positions are blocked, skip this spawn cycle
                if (blocked) {
        
                    this.lastSpawnTime = now;
                    return;
                }

                // 3. Spawn the unit at the clear location
                const newUnit = new unitClass(spawnX, spawnY, this.playerId);
                allGameObjects.push(newUnit);
                playerState.currentSupply += newUnit.supplyCost;
                newUnit.attackMoveTo(this.rallyPoint.x, this.rallyPoint.y);
                this.lastSpawnTime = now;
                
                // Debug: Confirm what was actually created

                return;

            } else {
     
            }
            this.lastSpawnTime = now;
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        return (pointX >= this.x - halfWidth && pointX <= this.x + halfWidth &&
                pointY >= this.y - halfHeight && pointY <= this.y + halfHeight);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Supply Depot Class ---
class SupplyDepot extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const supplyDepotStats = {
            maxHealth: 400,
            armor: 2,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 5.0,
            visionRange: 560, // Supply depots provide good vision coverage
            supplyCost: 0
        };

        // Size based on grid cells (3x2)
        const width = GRID_CELL_WIDTH * 3;
        const height = GRID_CELL_HEIGHT * 2;
        // Use max size for collision detection, but store actual width and height
        const size = Math.max(width, height);
        super(x, y, playerId, size, supplyDepotStats);

        // Store base stats for upgrades
        this.baseArmor = supplyDepotStats.armor;
        this.baseHpRegen = supplyDepotStats.hpRegen;

        // Store actual width and height for drawing
        this.width = width;
        this.height = height;

        // Store grid dimensions for placement validation
        this.gridWidth = 3;
        this.gridHeight = 2;

        // Calculate and store grid coordinates
        const gridPos = worldToGrid(x, y);
        this.gridX = gridPos.gridX - Math.floor(this.gridWidth / 2);
        this.gridY = gridPos.gridY - Math.floor(this.gridHeight / 2);

        // Supply Depot specific properties
        this.type = 'supplyDepot';
        this.supplyBonus = SUPPLY_DEPOT_SUPPLY_BONUS;

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1

        // Only add supply bonus when construction is complete
        if (!isUnderConstruction && players[playerId]) {
            players[playerId].supplyCap += this.supplyBonus;
        }

        // Apply building upgrades
        applyBuildingUpgrades(this);
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Calculate half width and height for the rectangular shape
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;

        // Check if visible on screen
        if (screenPos.x + halfWidth < 0 ||
            screenPos.x - halfWidth > canvas.width ||
            screenPos.y + halfHeight < 0 ||
            screenPos.y - halfHeight > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfWidth;
        const drawY = screenPos.y - halfHeight;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.width, this.height);

        // Draw Supply Depot Body
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Draw supply symbol (S)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', screenPos.x, screenPos.y);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX, drawY, this.width, this.height);

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(drawX - 5, drawY - 5, this.width + 10, this.height + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.width * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfHeight - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern for 3x2 grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // Horizontal lines - 1 internal line for 3x2 grid
            const horizontalLineSpacing = this.height / 2;
            ctx.beginPath();
            ctx.moveTo(drawX, drawY + horizontalLineSpacing);
            ctx.lineTo(drawX + this.width, drawY + horizontalLineSpacing);
            ctx.stroke();

            // Vertical lines - 2 internal lines for 3x2 grid
            const verticalLineSpacing = this.width / 3;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(drawX + i * verticalLineSpacing, drawY);
                ctx.lineTo(drawX + i * verticalLineSpacing, drawY + this.height);
                ctx.stroke();
            }

            ctx.setLineDash([]);
        }

        // Draw selection if selected
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 6;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_BUNKER; // Use same thickness as bunker
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const halfHeight = this.height / 2;

        // Health Bar command
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfHeight - HEALTHBAR_BUNKER_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_BUNKER_WIDTH,
            height: HEALTHBAR_BUNKER_HEIGHT,
            basePlayerColor: this.color
        });

        return commands;
    }

    isUnderPoint(pointX, pointY) {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        return (pointX >= this.x - halfWidth && pointX <= this.x + halfWidth &&
                pointY >= this.y - halfHeight && pointY <= this.y + halfHeight);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Shield Tower Class ---
class ShieldTower extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const shieldTowerStats = {
            maxHealth: 300,
            armor: 1,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 5.0,
            visionRange: 640, // Excellent vision for shield towers
            supplyCost: 0
        };

        // Size based on grid cells (1x1)
        const size = GRID_CELL_WIDTH * 1;
        super(x, y, playerId, size, shieldTowerStats);

        // Store base stats for upgrades
        this.baseArmor = shieldTowerStats.armor;
        this.baseHpRegen = shieldTowerStats.hpRegen;

        // Shield Tower specific properties
        this.type = 'shieldTower';
        this.shieldRadius = SHIELD_TOWER_RADIUS;
        this.armorBonus = SHIELD_TOWER_ARMOR_BONUS;

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1

        // Apply building upgrades
        applyBuildingUpgrades(this);
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.size, this.size);

        // Draw Shield Tower Body (square instead of circle)
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // Draw shield symbol
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛨', screenPos.x, screenPos.y);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // Draw shield aura field (square shape, always visible)
        if (!this.isUnderConstruction) {
            // Calculate the shield field size (1.5 tiles)
            const shieldFieldSize = this.shieldRadius * 2;
            const shieldFieldX = screenPos.x - this.shieldRadius;
            const shieldFieldY = screenPos.y - this.shieldRadius;

            // Draw semi-transparent shield field with player color
            ctx.fillStyle = this.color.replace(')', ', 0.15)').replace('hsl', 'hsla');
            ctx.fillRect(shieldFieldX, shieldFieldY, shieldFieldSize, shieldFieldSize);

            // Draw shield field border
            ctx.strokeStyle = this.color.replace(')', ', 0.3)').replace('hsl', 'hsla');
            ctx.lineWidth = 1;
            ctx.strokeRect(shieldFieldX, shieldFieldY, shieldFieldSize, shieldFieldSize);
        }

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(drawX - 5, drawY - 5, this.size + 10, this.size + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.size * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfSize - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // For 1x1 grid, no internal grid lines needed
            // Just draw a simple cross pattern to indicate construction
            ctx.beginPath();
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(drawX + this.size, drawY + this.size);
            ctx.moveTo(drawX + this.size, drawY);
            ctx.lineTo(drawX, drawY + this.size);
            ctx.stroke();

            ctx.setLineDash([]);
        }

        // Draw shield radius when selected
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            // We no longer need to draw the shield radius here since it's always visible
            // Just keep the selection indicator

            // Draw selection
            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, halfSize + padding, 0, Math.PI * 2);
            ctx.fill();

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, halfSize + padding, 0, Math.PI * 2);
            ctx.stroke();

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const halfSize = this.size / 2;

        // Health Bar command
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfSize - HEALTHBAR_UNIT_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color
        });

        return commands;
    }

    update(now, allGameObjects) {
        super.update(now, allGameObjects);

        // Apply shield effect to nearby allied units
        if (this.health > 0) {
            allGameObjects.forEach(obj => {
                // Only apply to allied units that are alive
                if (obj.health > 0 && areAllies(this.playerId, obj.playerId) &&
                    (obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank')) {

                    // Check if unit is within shield radius (square boundary check)
                    const dx = Math.abs(obj.x - this.x);
                    const dy = Math.abs(obj.y - this.y);

                    // Unit is within the square shield field if both dx and dy are less than shieldRadius
                    if (dx <= this.shieldRadius && dy <= this.shieldRadius) {
                        // Apply shield effect (temporary armor bonus)
                        obj.shieldBonus = this.armorBonus;
                    } else {
                        // Remove shield effect if unit moves out of range
                        obj.shieldBonus = 0;
                    }
                }
            });
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Sensor Tower Class ---
class SensorTower extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const sensorTowerStats = {
            maxHealth: 200,
            armor: 0,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 5.0,
            visionRange: 800, // Same vision range as bunker
            supplyCost: 0
        };

        // Size based on grid cells (1x1)
        const size = GRID_CELL_WIDTH * 1;
        super(x, y, playerId, size, sensorTowerStats);

        // Store base stats for upgrades
        this.baseArmor = sensorTowerStats.armor;
        this.baseHpRegen = sensorTowerStats.hpRegen;

        // Sensor Tower specific properties
        this.type = 'sensorTower';
        
        // Sensor radius: 2.5 tiles from center to edge (like SC2)
        // Total square size is 5x5 tiles (2.5 tiles on each side)
        this.sensorRadius = TILE_WIDTH * 2.5; // 2.5 tiles = 1500 pixels

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1

        // Apply building upgrades
        applyBuildingUpgrades(this);
    }
    
    // Check if a point is within sensor range (square radius)
    isInSensorRange(worldX, worldY) {
        if (this.isUnderConstruction || this.health <= 0) return false;
        
        // Square detection: check if point is within sensorRadius distance from center in both X and Y
        return (worldX >= this.x - this.sensorRadius && worldX <= this.x + this.sensorRadius &&
                worldY >= this.y - this.sensorRadius && worldY <= this.y + this.sensorRadius);
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.size, this.size);

        // Draw Sensor Tower Body (square instead of triangle)
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            // Draw pulsing square outline for 1x1 grid
            ctx.strokeRect(drawX - 5, drawY - 5, this.size + 10, this.size + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.size * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfSize - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // For 1x1 grid, no internal grid lines needed
            // Just draw a simple cross pattern to indicate construction
            ctx.beginPath();
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(drawX + this.size, drawY + this.size);
            ctx.moveTo(drawX + this.size, drawY);
            ctx.lineTo(drawX, drawY + this.size);
            ctx.stroke();

            ctx.setLineDash([]);
        }

        // Draw radar symbol
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', screenPos.x, screenPos.y);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // Draw sensor radius indicator (always visible, static white dotted line)
        if (!this.isUnderConstruction) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            // Convert sensor range corners from world to screen coordinates
            const topLeft = worldToScreen(this.x - this.sensorRadius, this.y - this.sensorRadius);
            const bottomRight = worldToScreen(this.x + this.sensorRadius, this.y + this.sensorRadius);
            
            const sensorRangeScreenX = topLeft.x;
            const sensorRangeScreenY = topLeft.y;
            const sensorRangeScreenWidth = bottomRight.x - topLeft.x;
            const sensorRangeScreenHeight = bottomRight.y - topLeft.y;
            
            // Draw static white dotted line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // White, semi-transparent
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); // Static dotted pattern
            ctx.lineDashOffset = 0; // No animation offset
            
            ctx.strokeRect(sensorRangeScreenX, sensorRangeScreenY, sensorRangeScreenWidth, sensorRangeScreenHeight);

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }

        // Draw selection if selected
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow for square shape
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );


            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const halfSize = this.size / 2;

        // Health Bar command
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfSize,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color
        });

        return commands;
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Turret Class ---
class Turret extends GameObject {
    constructor(x, y, playerId) {
        const playerState = players[playerId];
        const turretUpgrades = playerUpgrades[playerId] || { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, turretDuration: 0 };
        
        // Base stats
        const baseStats = {
            maxHealth: 200,
            armor: 2,
            attackDamage: 15,
            attackSpeed: 1.5, // Attacks per second
            attackRange: 300,
            hpRegen: 5.0,
            visionRange: 440, // Same as units
            supplyCost: 0
        };
        
        const size = 40; // Turret size
        super(x, y, playerId, size, baseStats);
        
        // Store base stats for upgrades (before applying upgrades)
        this.baseArmor = baseStats.armor;
        this.baseAttackDamage = baseStats.attackDamage;
        this.baseAttackRange = baseStats.attackRange;
        this.baseHpRegen = baseStats.hpRegen;
        
        // Apply upgrades immediately
        applyUpgradesToUnit(this);
        
        this.type = 'turret';
        this.isBuilding = true;
        this.targetUnit = null;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000 / baseStats.attackSpeed; // Convert attacks per second to cooldown
        this.shootingAngle = 0; // Angle the turret is facing/shooting
        this.spawnTime = performance.now(); // Track when turret was created
        // Apply turret duration upgrade (double duration per level)
        this.expirationTime = TURRET_EXPIRATION_TIME * Math.pow(2, turretUpgrades.turretDuration); // Double per level
        this.lastRegenTime = performance.now(); // Track last regen time
        
        // Apply building upgrades (for building regen)
        applyBuildingUpgrades(this);
    }
    
    update(now, allGameObjects) {
        if (this.health <= 0) return;
        
        // Check expiration
        const elapsed = now - this.spawnTime;
        if (elapsed >= this.expirationTime) {
            this.health = 0;
            this.isDestroyed = true;
            return;
        }
        
        // Apply regen
        if (this.hpRegen > 0 && this.health < this.maxHealth) {
            const regenAmount = (this.hpRegen * (now - (this.lastRegenTime || now))) / 1000;
            this.health = Math.min(this.maxHealth, this.health + regenAmount);
            this.lastRegenTime = now;
        }
        
        // Find target
        if (!this.targetUnit || this.targetUnit.health <= 0 || 
            Math.hypot(this.targetUnit.x - this.x, this.targetUnit.y - this.y) > this.attackRange) {
            this.targetUnit = null;
            
            // Find nearest enemy in range
            let nearestEnemy = null;
            let nearestDist = Infinity;
            
            for (const obj of allGameObjects) {
                if (obj.health <= 0) continue;
                if (obj === this) continue;
                if (areAllies(this.playerId, obj.playerId)) continue;
                
                // Only target units (not buildings)
                if (obj.type !== 'marine' && obj.type !== 'reaper' && obj.type !== 'marauder' && 
                    obj.type !== 'ghost' && obj.type !== 'tank' && obj.type !== 'worker' && obj.type !== 'unit') {
                    continue;
                }
                
                const dist = Math.hypot(obj.x - this.x, obj.y - this.y);
                if (dist <= this.attackRange && dist < nearestDist) {
                    nearestEnemy = obj;
                    nearestDist = dist;
                }
            }
            
            this.targetUnit = nearestEnemy;
        }
        
        // Attack target
        if (this.targetUnit && this.targetUnit.health > 0) {
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                // Calculate angle to target
                const dx = this.targetUnit.x - this.x;
                const dy = this.targetUnit.y - this.y;
                this.shootingAngle = Math.atan2(dy, dx);
                
                // Deal damage
                this.targetUnit.takeDamage(this.attackDamage);
                
                // Create attack effect with spark burst
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: this.targetUnit.x,
                    endY: this.targetUnit.y,
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION,
                    color: this.color
                });
                
                // Add spark burst effect at target
                attackEffects.push({
                    type: 'burst',
                    x: this.targetUnit.x,
                    y: this.targetUnit.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
                
                this.lastAttackTime = now;
                
                // If target dies, clear it
                if (this.targetUnit.health <= 0) {
                    this.targetUnit = null;
                }
            }
        }
    }
    
    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;
        
        const screenPos = worldToScreen(this.x, this.y);
        const radius = this.size / 2;
        
        // Skip if offscreen
        if (screenPos.x + radius < 0 ||
            screenPos.x - radius > canvas.width ||
            screenPos.y + radius < 0 ||
            screenPos.y - radius > canvas.height) {
            return;
        }
        
        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(screenPos.x + 2, screenPos.y + 2, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw circle border
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw inner circle fill
        ctx.fillStyle = applyAlphaToColor(this.color, 0.3);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw rotating triangle (shooting direction)
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(this.shootingAngle);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        const triangleSize = radius * 0.5;
        ctx.beginPath();
        ctx.moveTo(triangleSize, 0);
        ctx.lineTo(-triangleSize / 2, -triangleSize / 2);
        ctx.lineTo(-triangleSize / 2, triangleSize / 2);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // Draw selection
        if (isSelected && this.playerId === currentPlayerId) {
            const now = performance.now();
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;
            
            const padding = 5;
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, radius + padding, 0, Math.PI * 2);
            ctx.fill();
            
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, radius + padding, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }
    
    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];
        
        const commands = [];
        const now = performance.now();
        const halfSize = this.size / 2;
        
        // Calculate expiration timer (time remaining)
        const elapsed = now - this.spawnTime;
        const timeRemaining = Math.max(0, this.expirationTime - elapsed);
        const expirationRatio = timeRemaining / this.expirationTime;
        
        // Expiration timer bar (above health bar) - larger size
        const expirationTopY = this.y - halfSize - HEALTHBAR_TURRET_OFFSET_Y - HEALTHBAR_TURRET_HEIGHT - COOLDOWN_BAR_GAP - EXPIRATION_BAR_HEIGHT;
        commands.push({
            type: 'expirationBar',
            centerX: this.x,
            topY: expirationTopY,
            readiness: expirationRatio,
            width: HEALTHBAR_TURRET_WIDTH,
            height: EXPIRATION_BAR_HEIGHT,
            basePlayerColor: this.color
        });
        
        const healthTopY = this.y - halfSize - HEALTHBAR_TURRET_OFFSET_Y;
        
        // Health bar
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: healthTopY,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_TURRET_WIDTH,
            height: HEALTHBAR_TURRET_HEIGHT,
            basePlayerColor: this.color
        });
        
        // Attack cooldown bar (beneath health bar)
        if (this.targetUnit && this.attackCooldown > 0) {
            const timeSinceLastAttack = now - this.lastAttackTime;
            const readiness = Math.min(1, Math.max(0, timeSinceLastAttack / this.attackCooldown));
            const cooldownTopY = healthTopY + HEALTHBAR_TURRET_HEIGHT + COOLDOWN_BAR_GAP;
            
            commands.push({
                type: 'cooldownBar',
                centerX: this.x,
                topY: cooldownTopY,
                readiness,
                width: HEALTHBAR_TURRET_WIDTH,
                height: COOLDOWN_BAR_HEIGHT,
                basePlayerColor: this.color
            });
        }
        
        return commands;
    }
    
    isUnderPoint(pointX, pointY) {
        const dist = Math.hypot(pointX - this.x, pointY - this.y);
        return dist <= this.size / 2;
    }
}

// --- Tank Construction Footprint (4x4 while building) ---
class TankConstruction extends GameObject {
    constructor(x, y, playerId) {
        const stats = {
            maxHealth: 260,
            armor: 1,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0,
            visionRange: 0,
            supplyCost: 0 // Tanks do not require supply
        };

        // 1x2 grid cells (slim footprint)
        const width = GRID_CELL_WIDTH * BUILDING_GRID_SIZES.tank.width;
        const height = GRID_CELL_HEIGHT * BUILDING_GRID_SIZES.tank.height;
        const size = Math.max(width, height);
        super(x, y, playerId, size, stats);

        this.type = 'tankConstruction';
        this.buildType = 'tank';

        this.width = width;
        this.height = height;
        this.gridWidth = BUILDING_GRID_SIZES.tank.width;
        this.gridHeight = BUILDING_GRID_SIZES.tank.height;

        this.isBuilding = true;
        this.isUnderConstruction = true;
        this.constructionProgress = 0;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        const screenPos = worldToScreen(this.x, this.y);
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        if (screenPos.x + halfW < 0 ||
            screenPos.x - halfW > canvas.width ||
            screenPos.y + halfH < 0 ||
            screenPos.y - halfH > canvas.height) {
            return;
        }

        const drawX = screenPos.x - halfW;
        const drawY = screenPos.y - halfH;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(drawX + 4, drawY + 4, this.width, this.height);

        // Base plate
        const base = this.color || players?.[this.playerId]?.color || 'rgba(255,255,255,0.6)';
        const alpha = 0.35 + 0.45 * Math.min(1, Math.max(0, this.constructionProgress || 0));
        ctx.fillStyle = applyAlphaToColor(base, alpha);
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Minimal inner grid lines (match footprint)
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        for (let i = 1; i < this.gridWidth; i++) {
            const x = drawX + i * GRID_CELL_WIDTH;
            ctx.beginPath();
            ctx.moveTo(x, drawY);
            ctx.lineTo(x, drawY + this.height);
            ctx.stroke();
        }
        for (let i = 1; i < this.gridHeight; i++) {
            const y = drawY + i * GRID_CELL_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(drawX, y);
            ctx.lineTo(drawX + this.width, y);
            ctx.stroke();
        }

        // Outline
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.width, this.height);

        // Tiny "TK" mark
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.font = '800 18px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TK', screenPos.x, screenPos.y);

        // Selection
        if (isSelected && this.playerId === currentPlayerId) {
            const now = performance.now();
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 6;
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(drawX - padding, drawY - padding, this.width + padding * 2, this.height + padding * 2);

            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = SELECTION_LINE_WIDTH_BUNKER;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;
            ctx.strokeRect(drawX - padding, drawY - padding, this.width + padding * 2, this.height + padding * 2);

            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }
}

// --- Unit Base Class ---
class Unit extends GameObject {
    constructor(x, y, playerId, unitStats = {}, size = 30, type = 'unit') {
        // Apply default stats with any overrides
        const stats = {
            maxHealth: 100,
            armor: 1,
            attackDamage: 0,
            attackSpeed: 1,
            attackRange: 0,
            hpRegen: 5.0,
            movementSpeed: 1.125, // Reduced by 25% again (was 1.5)
            visionRange: 440, // Increased base vision for units
            supplyCost: 1,
            ...unitStats
        };

        super(x, y, playerId, size, stats);

        // Store base stats for upgrades
        this.baseMaxHealth = stats.maxHealth || 100;
        this.baseArmor = stats.armor;
        this.baseAttackDamage = stats.attackDamage;
        this.baseAttackRange = stats.attackRange;
        this.baseHpRegen = stats.hpRegen;
        this.baseMovementSpeed = stats.movementSpeed;

        // Unit-specific properties
        this.type = type;
        this.speed = stats.movementSpeed;
        this.targetX = x;
        this.targetY = y;
        this.targetUnit = null;
        this.commandState = 'idle';
        this.aMoveTargetX = x;
        this.aMoveTargetY = y;
        this.lastMoveAngle = 0;
        this.targetAcquisitionRange = this.attackRange * TARGET_ACQUISITION_RANGE_FACTOR;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(drawX + 3, drawY + 3, this.size, this.size);

        // --- Draw Unit Body ---
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Draw Unit Symbol (Direction Indicator) ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

        // Use the stored lastMoveAngle property instead of calculating it dynamically
        const angle = this.lastMoveAngle;

        // Draw triangle pointing in movement direction
        const triangleSize = halfSize * 0.7;
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(triangleSize, 0);
        ctx.lineTo(-triangleSize/2, -triangleSize/2);
        ctx.lineTo(-triangleSize/2, triangleSize/2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- Draw Darker Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2; // Increased unit border thickness
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Combat Shields indicator (for marines) ---
        if (this.type === 'marine') {
            const upgrades = playerUpgrades[this.playerId];
            if (upgrades && upgrades.combatShields > 0) {
                // Draw a rectangular box attached to the right side edge (full height, player color)
                ctx.save();
                const playerColor = this.color;
                ctx.fillStyle = playerColor;
                const shieldBoxWidth = this.size * 0.12; // Thin box
                const shieldBoxHeight = this.size; // Full height of marine edge
                const shieldBoxX = drawX + this.size; // Attached to right edge, not overlapping
                const shieldBoxY = screenPos.y - shieldBoxHeight / 2;
                ctx.fillRect(shieldBoxX, shieldBoxY, shieldBoxWidth, shieldBoxHeight);
                ctx.restore();
            }
        }

        // --- Draw Jetpacks indicator (for reapers) ---
        if (this.type === 'reaper') {
            const upgrades = playerUpgrades[this.playerId];
            if (upgrades && upgrades.jetpacks > 0) {
                // Draw small triangles below the reaper to indicate jetpacks
                ctx.save();
                ctx.fillStyle = 'rgba(150, 150, 255, 0.7)';
                const jetpackSize = halfSize * 0.3;
                const jetpackY = screenPos.y + halfSize + 2;
                // Left jetpack
                ctx.beginPath();
                ctx.moveTo(screenPos.x - halfSize * 0.3, jetpackY);
                ctx.lineTo(screenPos.x - halfSize * 0.3 - jetpackSize, jetpackY + jetpackSize);
                ctx.lineTo(screenPos.x - halfSize * 0.3 + jetpackSize, jetpackY + jetpackSize);
                ctx.closePath();
                ctx.fill();
                // Right jetpack
                ctx.beginPath();
                ctx.moveTo(screenPos.x + halfSize * 0.3, jetpackY);
                ctx.lineTo(screenPos.x + halfSize * 0.3 - jetpackSize, jetpackY + jetpackSize);
                ctx.lineTo(screenPos.x + halfSize * 0.3 + jetpackSize, jetpackY + jetpackSize);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }

        // --- Draw Stim indicator (for marines and marauders) ---
        if ((this.type === 'marine' || this.type === 'marauder') && this.isStimmed && this.stimStartTime !== undefined) {
            // Calculate remaining time and fade out effect
            const stimElapsed = now - this.stimStartTime;
            const stimRemaining = Math.max(0, this.stimDuration - stimElapsed);
            const fadeOutFactor = stimRemaining / this.stimDuration; // Fades from 1.0 to 0.0
            
            // Only draw if there's time remaining
            if (stimRemaining > 0) {
                // Draw a pulsing red/orange glow around the unit with fade-out
                const stimPulse = Math.sin(now * 0.015) * 0.4 + 0.6;
                ctx.save();
                // Outer glow (fades out as time expires)
                ctx.strokeStyle = `rgba(255, 80, 40, ${stimPulse * 0.9 * fadeOutFactor})`;
                ctx.lineWidth = 4;
                ctx.strokeRect(drawX - 4, drawY - 4, this.size + 8, this.size + 8);
                // Inner glow (fades out as time expires)
                ctx.strokeStyle = `rgba(255, 150, 80, ${stimPulse * 0.7 * fadeOutFactor})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(drawX - 2, drawY - 2, this.size + 4, this.size + 4);
                ctx.restore();
            }
        }

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
             // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

             // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        const commands = [];
        if (this.health <= 0) return commands;

        const now = performance.now();
        const halfSize = this.size / 2;
        const healthTopY = this.y - halfSize - HEALTHBAR_UNIT_OFFSET_Y;

        // Attack cooldown bar sits directly beneath the health bar (non-workers only)
        const shouldShowCooldown = (
            this.type !== 'worker' &&
            Number.isFinite(this.attackCooldown) &&
            this.attackCooldown > 0
        );
        if (shouldShowCooldown) {
            const cooldownDuration = Math.max(1, this.attackCooldown);
            const timeSinceLastAttack = now - this.lastAttackTime;
            const readiness = Math.min(1, Math.max(0, timeSinceLastAttack / cooldownDuration));
            const cooldownTopY = healthTopY + HEALTHBAR_UNIT_HEIGHT + COOLDOWN_BAR_GAP;

            commands.push({
                type: 'cooldownBar',
                centerX: this.x,
                topY: cooldownTopY,
                readiness,
                width: HEALTHBAR_UNIT_WIDTH,
                height: COOLDOWN_BAR_HEIGHT,
                basePlayerColor: this.color
            });
        }

        // Health Bar command - Changed from text
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: healthTopY,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color // Pass player color
        });
        /* Original Text Health:
        commands.push({
            type: 'text',
            content: this.health,
            x: this.x,
            y: this.y - halfSize - 5,
            color: HEALTH_BAR_COLOR,
            font: HEALTH_BAR_FONT,
            textAlign: 'center'
        });
        */



        return commands;
    }

    update(now, allGameObjects) {
        // Call parent update to handle health regen and other base functionality
        super.update(now, allGameObjects);
        
        if (this.health <= 0) { this.commandState = 'idle'; return; }
        if (this.targetUnit && this.targetUnit.health <= 0) {
             this.targetUnit = null;
             if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }
        
        // Handle Stim expiration
        if (this.isStimmed && this.stimStartTime !== undefined) {
            const stimElapsed = now - this.stimStartTime;
            if (stimElapsed >= this.stimDuration) {
                // Stim expired - restore normal stats
                this.isStimmed = false;
                if (this.baseAttackSpeed !== undefined) {
                    this.attackSpeed = this.baseAttackSpeed;
                    this.attackCooldown = 1000 / this.attackSpeed;
                }
                if (this.baseMovementSpeedStim !== undefined) {
                    this.movementSpeed = this.baseMovementSpeedStim;
                }
                if (this.baseSpeedStim !== undefined) {
                    this.speed = this.baseSpeedStim; // Restore speed property
                }
            }
        }

        // Handle Concussive Blast slow expiration
        if (this.concussiveSlowEndTime !== undefined && now >= this.concussiveSlowEndTime) {
            // Restore normal movement speed
            if (this.concussiveBaseMovementSpeed !== undefined) {
                this.movementSpeed = this.concussiveBaseMovementSpeed;
            }
            this.concussiveSlowEndTime = undefined;
            this.concussiveBaseMovementSpeed = undefined;
        }
        
        // Handle idle units being attacked - run away from attacker
        if (this.commandState === 'idle') {
            const attacker = allGameObjects.find(obj => 
                obj.targetUnit === this && 
                !areAllies(this.playerId, obj.playerId) &&
                obj.health > 0
            );
            if (attacker) {
                // Run opposite direction from attacker
                const dx = this.x - attacker.x;
                const dy = this.y - attacker.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    const runDistance = 100;
                    this.targetX = this.x + (dx / dist) * runDistance;
                    this.targetY = this.y + (dy / dist) * runDistance;
                    this.commandState = 'moving';
                }
            }
        }
        
         switch (this.commandState) {
             case 'idle': break;
             case 'moving':
                 this.targetUnit = null;
                 this.performMovement();
                 if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                 break;
             case 'hold':
                 // Hold position - can attack but won't move
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     // Look for enemies in range to attack
                     const enemy = findNearestEnemyInRange(this, this.attackRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     }
                 }
                 // Reset position to current location to prevent movement
                 this.targetX = this.x;
                 this.targetY = this.y;
                 break;
             case 'patrol':
                 // Patrol between patrol points
                 if (!this.patrolPoints || this.patrolPoints.length === 0) {
                     this.commandState = 'idle';
                     break;
                 }
                 
                 const currentPatrolPoint = this.patrolPoints[this.currentPatrolIndex || 0];
                 const distToPoint = Math.hypot(this.x - currentPatrolPoint.x, this.y - currentPatrolPoint.y);
                 
                 if (distToPoint < 5) {
                     // Reached patrol point, move to next
                     this.currentPatrolIndex = ((this.currentPatrolIndex || 0) + 1) % this.patrolPoints.length;
                     const nextPoint = this.patrolPoints[this.currentPatrolIndex];
                     this.targetX = nextPoint.x;
                     this.targetY = nextPoint.y;
                 } else {
                     // Move towards current patrol point
                     this.targetX = currentPatrolPoint.x;
                     this.targetY = currentPatrolPoint.y;
                     this.performMovement();
                 }
                 
                 // Can still attack while patrolling
                 if (this.targetUnit) {
                     // If unit is garrisoned, use enhanced range
                     if (this.isGarrisoned && this.garrisonedIn && this.garrisonedIn.capacityBonus) {
                         const originalRange = this.attackRange;
                         this.attackRange = originalRange + this.garrisonedIn.capacityBonus;
                     this.handleCombat(now, this.targetUnit);
                         this.attackRange = originalRange;
                 } else {
                         this.handleCombat(now, this.targetUnit);
                     }
                 } else {
                     const effectiveRange = this.isGarrisoned && this.garrisonedIn && this.garrisonedIn.capacityBonus
                         ? this.targetAcquisitionRange + this.garrisonedIn.capacityBonus
                         : this.targetAcquisitionRange;
                     const enemy = findNearestEnemyInRange(this, effectiveRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         if (this.isGarrisoned && this.garrisonedIn && this.garrisonedIn.capacityBonus) {
                             const originalRange = this.attackRange;
                             this.attackRange = originalRange + this.garrisonedIn.capacityBonus;
                             this.handleCombat(now, this.targetUnit);
                             this.attackRange = originalRange;
                         } else {
                         this.handleCombat(now, this.targetUnit);
                         }
                     }
                 }
                 break;
             case 'attacking':
                 if (!this.targetUnit) { this.commandState = 'idle'; break; }
                 this.handleCombat(now, this.targetUnit);
                 break;
             case 'attackMoving':
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     } else {
                         this.targetX = this.aMoveTargetX;
                         this.targetY = this.aMoveTargetY;
                         this.performMovement();
                         if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                     }
                 }
                 break;
         }
    }

    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage);
                this.lastAttackTime = now;

                // Add laser effect (with color and duration)
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color, // Use unit's color
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                // Add spark burst effect at target (with duration)
                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    // Helper for standard movement towards targetX, targetY
    performMovement() {
        // If we're at the target, there's no need to move
        if (this.x === this.targetX && this.y === this.targetY) return;

        // Calculate direction to move
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.hypot(dx, dy);

        // Normalize direction and multiply by speed
        let moveX = (dx / distance) * this.speed;
        let moveY = (dy / distance) * this.speed;

        // Check if we'd overshoot the target
        if (Math.abs(moveX) > Math.abs(dx)) moveX = dx;
        if (Math.abs(moveY) > Math.abs(dy)) moveY = dy;

        // Update position
        const finalX = this.x + moveX;
        const finalY = this.y + moveY;

        // Store last movement angle before updating position
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }

        this.x = finalX;
        this.y = finalY;
    }

    // Set movement target (basic move)
    moveTo(targetX, targetY) {
        this.targetX = targetX;
        this.targetY = targetY;
        this.commandState = 'moving';
        this.targetUnit = null;

        // Immediately update the direction angle for responsive visual feedback
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }
    }

    // Set attack-move target
    attackMoveTo(targetX, targetY) {
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
        this.commandState = 'attackMoving';
        this.targetUnit = null;

        // Immediately update the direction angle for responsive visual feedback
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }
    }

    attackUnit(target) {
        this.commandState = 'attacking';
        this.targetUnit = target;
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize && pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Marine Class (Combat Unit) ---
class Marine extends Unit {
    constructor(x, y, playerId) {
        const marineStats = {
            maxHealth: 100,
            armor: 1,
            attackDamage: 10,
            attackSpeed: 1,
            attackRange: 100,
            hpRegen: 5.0,
            movementSpeed: 0.50625, // Reduced by 25% again (was 0.675)
            visionRange: 480, // Enhanced military vision
            supplyCost: 1
        };

        super(x, y, playerId, marineStats, 27, 'marine'); // size was 30, now 27

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
    }

    isUnderPoint(pointX, pointY) {
        const distance = Math.sqrt(Math.pow(this.x - pointX, 2) + Math.pow(this.y - pointY, 2));
        return distance <= this.size / 2;
    }

    // Set attack-move target
    attackMoveTo(targetX, targetY) {
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
        this.commandState = 'attackMoving';
        this.targetUnit = null;

        // Immediately update the direction angle for responsive visual feedback
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }
    }

    // Attack a specific unit
    attackUnit(target) {
        this.commandState = 'attacking';
        this.targetUnit = target;
    }

    // Handle combat with a target
    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage);
                this.lastAttackTime = now;

                // Add laser effect (with color and duration)
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color, // Use unit's color
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                // Add spark burst effect at target (with duration)
                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    update(now, allGameObjects) {
        if (this.health <= 0) { this.commandState = 'idle'; return; }
        if (this.targetUnit && this.targetUnit.health <= 0) {
             this.targetUnit = null;
             if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }
         switch (this.commandState) {
             case 'idle': break;
             case 'moving':
                 this.targetUnit = null;
                 this.performMovement();
                 if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                 break;
             case 'attacking':
                 if (!this.targetUnit) { this.commandState = 'idle'; break; }
                 this.handleCombat(now, this.targetUnit);
                 break;
             case 'attackMoving':
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     } else {
                         this.targetX = this.aMoveTargetX;
                         this.targetY = this.aMoveTargetY;
                         this.performMovement();
                         if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                     }
                 }
                 break;
         }
    }

    getUIDrawCommands(isSelected) {
        const commands = super.getUIDrawCommands(isSelected);



        return commands;
    }
}

// --- Marauder Class (Combat Unit) ---
class Marauder extends Unit {
    constructor(x, y, playerId) {
        const marauderStats = {
            maxHealth: 125,
            armor: 1,
            attackDamage: 12,
            attackSpeed: 0.7,
            attackRange: 80,
            hpRegen: 5.0,
            movementSpeed: 0.45, // Reduced by 25% again (was 0.6)
            visionRange: 480, // Enhanced military vision like Marines
            supplyCost: 2,
        };
        super(x, y, playerId, marauderStats, 32, 'marauder'); // Properly call Unit constructor

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(drawX + 3, drawY + 3, this.size, this.size);

        // --- Draw Unit Body ---
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Draw Marauder's Square Indicator ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        const squareSize = halfSize * 0.6;
        ctx.fillRect(screenPos.x - squareSize / 2, screenPos.y - squareSize / 2, squareSize, squareSize);

        // --- Draw Darker Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Animated Selection ---
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color;
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }
}

// --- Ghost Class (Combat Unit) ---
class Ghost extends Unit {
    constructor(x, y, playerId) {
        const ghostStats = {
            maxHealth: 80,
            armor: 0,
            attackDamage: 15,
            attackSpeed: 1.2,
            attackRange: 120,
            hpRegen: 5.0,
            movementSpeed: 0.61875, // Reduced by 25% again (was 0.825)
            visionRange: 640, // Massive vision for stealth/sniper role
            supplyCost: 2,
        };
        super(x, y, playerId, ghostStats, 25, 'ghost'); // Properly call Unit constructor

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(drawX + 3, drawY + 3, this.size, this.size);

        // --- Draw Unit Body ---
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Draw Ghost's Circle Indicator ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        const circleRadius = halfSize * 0.4;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, circleRadius, 0, Math.PI * 2);
        ctx.fill();

        // --- Draw Darker Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Animated Selection ---
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color;
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage);
                this.lastAttackTime = now;

                // Apply Concussive Blast slow effect
                const upgrades = playerUpgrades[this.playerId];
                if (upgrades && upgrades.concussiveBlast > 0 && target.movementSpeed !== undefined) {
                    // Apply 30% slow to enemy movement speed for 3 seconds
                    if (!target.concussiveBaseMovementSpeed) {
                        target.concussiveBaseMovementSpeed = target.movementSpeed;
                    }
                    target.movementSpeed = target.concussiveBaseMovementSpeed * 0.7;
                    target.concussiveSlowEndTime = now + 3000; // 3 seconds
                }

                // Add laser effect (with color and duration)
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color, // Use unit's color
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                // Add spark burst effect at target (with duration)
                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }
}

// --- Reaper Class (Combat Unit) ---
class Reaper extends Unit {
    constructor(x, y, playerId) {
        const reaperStats = {
            maxHealth: 110,
            armor: 0,
            attackDamage: 8, // Damage per projectile
            attackSpeed: 1,
            attackRange: 100,
            hpRegen: 5.0,
            movementSpeed: 0.5625, // Reduced by 25% again (was 0.75)
            visionRange: 560, // Excellent vision for scouting and harassment
            supplyCost: 2
        };
        super(x, y, playerId, reaperStats, 28, 'reaper');
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(drawX + 3, drawY + 3, this.size, this.size);

        // --- Draw Unit Body ---
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Draw Reaper's dual gun indicators ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        const angle = this.lastMoveAngle;
        const triangleSize = halfSize * 0.5;
        const triangleOffsetY = halfSize * 0.4;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(angle);

        // Gun 1 (top)
        ctx.beginPath();
        ctx.moveTo(triangleSize, -triangleOffsetY);
        ctx.lineTo(-triangleSize / 2, -triangleOffsetY - triangleSize / 2);
        ctx.lineTo(-triangleSize / 2, -triangleOffsetY + triangleSize / 2);
        ctx.closePath();
        ctx.fill();

        // Gun 2 (bottom)
        ctx.beginPath();
        ctx.moveTo(triangleSize, triangleOffsetY);
        ctx.lineTo(-triangleSize / 2, triangleOffsetY - triangleSize / 2);
        ctx.lineTo(-triangleSize / 2, triangleOffsetY + triangleSize / 2);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();

        // --- Draw Darker Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2; // Increased unit border thickness
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Animated Selection --- (Copied from Unit.drawBody)
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    update(now, allGameObjects) {
        if (this.health <= 0) { this.commandState = 'idle'; return; }
        if (this.targetUnit && this.targetUnit.health <= 0) {
             this.targetUnit = null;
             if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }
         switch (this.commandState) {
             case 'idle': break;
             case 'moving':
                 this.targetUnit = null;
                 this.performMovement();
                 if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                 break;
             case 'attacking':
                 if (!this.targetUnit) { this.commandState = 'idle'; break; }
                 this.handleCombat(now, this.targetUnit);
                 break;
             case 'attackMoving':
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     } else {
                         this.targetX = this.aMoveTargetX;
                         this.targetY = this.aMoveTargetY;
                         this.performMovement();
                         if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                     }
                 }
                 break;
         }
    }

    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;

            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage * 2); // Both projectiles hit
                this.lastAttackTime = now;

                const angle = Math.atan2(dy, dx);
                const offset = 5;
                const perpendicularAngle = angle + Math.PI / 2;
                const offsetX = Math.cos(perpendicularAngle) * offset;
                const offsetY = Math.sin(perpendicularAngle) * offset;

                // First projectile
                attackEffects.push({
                    type: 'laser',
                    startX: this.x + offsetX,
                    startY: this.y + offsetY,
                    endX: target.x,
                    endY: target.y,
                    color: this.color,
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                // Second projectile
                attackEffects.push({
                    type: 'laser',
                    startX: this.x - offsetX,
                    startY: this.y - offsetY,
                    endX: target.x,
                    endY: target.y,
                    color: this.color,
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    performMovement() {
        // If we're at the target, there's no need to move
        if (this.x === this.targetX && this.y === this.targetY) return;

        // Calculate direction to move
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.hypot(dx, dy);

        // Normalize direction and multiply by speed
        let moveX = (dx / distance) * this.speed;
        let moveY = (dy / distance) * this.speed;

        // Check if we'd overshoot the target
        if (Math.abs(moveX) > Math.abs(dx)) moveX = dx;
        if (Math.abs(moveY) > Math.abs(dy)) moveY = dy;

        // Update position
        const finalX = this.x + moveX;
        const finalY = this.y + moveY;

        // Store last movement angle before updating position
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }

        this.x = finalX;
        this.y = finalY;
    }
}

// --- Tank Class (Mobile + Siege) ---
class Tank extends Unit {
    constructor(x, y, playerId, isUnderConstruction = true) {
        const tankStats = {
            maxHealth: 240,
            armor: 2,
            attackDamage: 14,
            attackSpeed: 0.6,
            attackRange: 130,
            hpRegen: 0.3,
            movementSpeed: 0.42,
            visionRange: 560,
            supplyCost: 0 // Tanks do not require supply
        };

        super(x, y, playerId, tankStats, 40, 'tank');

        // In-game footprint: 1x2 building-grid cells (rectangular)
        this.width = GRID_CELL_WIDTH * TANK_UNIT_GRID_FOOTPRINT.width;
        this.height = GRID_CELL_HEIGHT * TANK_UNIT_GRID_FOOTPRINT.height;
        this.size = Math.max(this.width, this.height); // collision approximation stays square-ish

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;

        // Build state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionStartTime = performance.now();
        this.constructionDuration = TANK_BUILD_TIME;

        // Siege state
        this.isSieged = false;
        this.siegeTarget = 0; // 0 mobile -> 1 sieged
        this.siegeProgress = 0;
        this.siegeStartTime = 0;

        // Turret visuals
        this.turretAngle = 0;

        // Hull rotation (smooth turning + move delay until aligned)
        this.hullAngle = 0;
        this._lastHullTurnTime = performance.now();

        // Barrel visuals (lags hull rotation + subtle internal motion)
        this.barrelAngle = 0;
        this._lastBarrelUpdateTime = performance.now();

        // Apply building upgrades (for building armor)
        applyBuildingUpgrades(this);
    }

    isUnderPoint(pointX, pointY) {
        const halfW = (this.width || this.size) / 2;
        const halfH = (this.height || this.size) / 2;
        return (
            pointX >= this.x - halfW && pointX <= this.x + halfW &&
            pointY >= this.y - halfH && pointY <= this.y + halfH
        );
    }

    toggleSiege() {
        if (this.health <= 0) return;
        if (this.isUnderConstruction) return;

        const now = performance.now();
        this.siegeStartTime = now;
        this.siegeTarget = this.isSieged ? 0 : 1;

        // Stop current movement when transforming
        this.commandState = 'idle';
        this.targetUnit = null;
    }

    updateSiege(now) {
        // Animate siegeProgress toward siegeTarget
        const dt = Math.min(1, Math.max(0, (now - this.siegeStartTime) / TANK_SIEGE_TRANSFORM_TIME));
        const target = this.siegeTarget;

        // If we haven't started a transform yet, keep as-is
        if (this.siegeStartTime === 0) {
            this.siegeProgress = this.isSieged ? 1 : 0;
            return;
        }

        // Smoothstep easing
        const t = dt * dt * (3 - 2 * dt);
        const from = this.isSieged ? 1 : 0;
        this.siegeProgress = from + (target - from) * t;

        // Commit when finished
        if (dt >= 1) {
            this.isSieged = target === 1;
            this.siegeStartTime = 0;
            this.siegeProgress = this.isSieged ? 1 : 0;
        }

        // Apply siege stat deltas (stacking with upgrades via base values)
        const upgrades = playerUpgrades?.[this.playerId] || { weaponRange: 0, attackDamage: 0 };
        const upgradedRange = this.baseAttackRange + (upgrades.weaponRange * 20);
        const upgradedDamage = this.baseAttackDamage + (upgrades.attackDamage * 2);

        const siegeFrac = this.siegeProgress;
        this.attackRange = upgradedRange + Math.round(TANK_SIEGE_RANGE_BONUS * siegeFrac);
        this.attackDamage = upgradedDamage + Math.round(TANK_SIEGE_DAMAGE_BONUS * siegeFrac);

        // Movement lock as we approach sieged
        this.speed = this.isSieged ? 0 : this.baseMovementSpeed;
    }

    // Override default movement to: rotate first, then move (tank-like turning)
    performMovement() {
        // If we're at the target, there's no need to move
        if (this.x === this.targetX && this.y === this.targetY) return;

        // Calculate direction to move
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 0) return;

        const desired = Math.atan2(dy, dx);
        const normalize = (a) => ((a + Math.PI) % (Math.PI * 2)) - Math.PI;

        // Smooth hull turning (time-based)
        const now = performance.now();
        const prev = this._lastHullTurnTime || now;
        const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
        this._lastHullTurnTime = now;

        let delta = normalize(desired - this.hullAngle);
        const turnSpeed = 6.0; // rad/sec (snappy but readable)
        const maxTurn = turnSpeed * dt;
        if (delta > maxTurn) delta = maxTurn;
        if (delta < -maxTurn) delta = -maxTurn;
        this.hullAngle = normalize(this.hullAngle + delta);

        // Keep lastMoveAngle aligned for any systems that reference it (e.g. turret fallback)
        this.lastMoveAngle = this.hullAngle;

        // Delay translation while the hull is still rotating significantly
        const remaining = normalize(desired - this.hullAngle);
        const turnThreshold = 0.35; // ~20 degrees
        if (Math.abs(remaining) > turnThreshold) return;

        // Move (slightly slower if not perfectly aligned)
        const alignFactor = Math.max(0.25, Math.cos(remaining)); // 0.25..1
        let moveX = (dx / distance) * this.speed * alignFactor;
        let moveY = (dy / distance) * this.speed * alignFactor;

        // Check if we'd overshoot the target
        if (Math.abs(moveX) > Math.abs(dx)) moveX = dx;
        if (Math.abs(moveY) > Math.abs(dy)) moveY = dy;

        this.x += moveX;
        this.y += moveY;
    }

    // Override move commands to avoid snapping the hull angle instantly
    moveTo(targetX, targetY) {
        this.targetX = targetX;
        this.targetY = targetY;
        this.commandState = 'moving';
        this.targetUnit = null;
    }

    attackMoveTo(targetX, targetY) {
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
        this.commandState = 'attackMoving';
        this.targetUnit = null;
    }

    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;

            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                const upgrades = playerUpgrades[this.playerId] || { tankSplash: 0 };
                const hasSplash = upgrades.tankSplash > 0 && this.isSieged;
                
                if (hasSplash) {
                    // Splash damage: hit multiple units in area
                    const splashRadius = 40 * 2; // 2x radius (80 pixels)
                    const hitUnits = [];
                    
                    // Find all units in splash radius
                    gameObjects.forEach(obj => {
                        if (obj === target || obj.health <= 0) return;
                        if (obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || 
                            obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' ||
                            obj.type === 'turret' || obj.isBuilding) {
                            const dist = Math.hypot(obj.x - target.x, obj.y - target.y);
                            if (dist <= splashRadius) {
                                hitUnits.push(obj);
                            }
                        }
                    });
                    
                    // Damage all units in splash radius
                    hitUnits.forEach(unit => {
                        unit.takeDamage(this.attackDamage);
                    });
                    
                    // Visual indicator: explosion effect at target location
                    attackEffects.push({
                        type: 'splash',
                        x: target.x,
                        y: target.y,
                        radius: splashRadius,
                        color: this.color,
                        timestamp: now,
                        duration: ATTACK_EFFECT_DURATION + 100
                    });
                } else {
                    // Normal single-target damage
                target.takeDamage(this.attackDamage);
                }
                
                this.lastAttackTime = now;

                // Heavier shot feel: slightly longer visuals
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color,
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION + 35
                });

                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION + 50
                });
            }
        } else {
            // Sieged tanks don't chase; mobile tanks do.
            if (this.isSieged || this.siegeProgress > 0.85) {
                this.commandState = 'idle';
                this.targetUnit = null;
                return;
            }
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    update(now, allGameObjects) {
        if (this.health <= 0) { this.commandState = 'idle'; return; }

        // Construction gate
        if (this.isUnderConstruction) {
            const progress = Math.min(1, Math.max(0, (now - this.constructionStartTime) / this.constructionDuration));
            if (progress >= 1) {
                this.isUnderConstruction = false;
                applyUpgradesToUnit(this);
            }
            return;
        }

        // Siege animation + stat shaping
        this.updateSiege(now);

        // Barrel angle: default follow hull with a slight delay (inertia)
        {
            const normalize = (a) => ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
            const prev = this._lastBarrelUpdateTime || now;
            const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
            this._lastBarrelUpdateTime = now;

            // First frame: snap to hull to avoid an initial spin
            if (!Number.isFinite(this.barrelAngle)) this.barrelAngle = this.hullAngle;

            const diff = normalize(this.hullAngle - this.barrelAngle);
            const follow = 10.0; // higher = less lag, lower = more lag
            const t = 1 - Math.exp(-follow * dt);
            this.barrelAngle = normalize(this.barrelAngle + diff * t);
        }

        // Turret angle smoothing
        const aimX = this.targetUnit ? this.targetUnit.x : (this.x + Math.cos(this.hullAngle));
        const aimY = this.targetUnit ? this.targetUnit.y : (this.y + Math.sin(this.hullAngle));
        const desired = Math.atan2(aimY - this.y, aimX - this.x);
        const delta = ((desired - this.turretAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.turretAngle += delta * 0.18;

        if (this.targetUnit && this.targetUnit.health <= 0) {
            this.targetUnit = null;
            if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }

        // While transforming to sieged, ignore move commands
        if (this.siegeProgress > 0.25) {
            if (this.commandState === 'moving' || this.commandState === 'attackMoving') {
                this.commandState = 'idle';
            }
        }

        switch (this.commandState) {
            case 'idle': break;
            case 'moving':
                if (this.isSieged) { this.commandState = 'idle'; break; }
                this.targetUnit = null;
                this.performMovement();
                if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                break;
            case 'attacking':
                if (!this.targetUnit) { this.commandState = 'idle'; break; }
                this.handleCombat(now, this.targetUnit);
                break;
            case 'attackMoving':
                if (this.isSieged) { this.commandState = 'idle'; break; }
                if (this.targetUnit) {
                    this.handleCombat(now, this.targetUnit);
                } else {
                    const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                    if (enemy) {
                        this.targetUnit = enemy;
                        this.handleCombat(now, this.targetUnit);
                    } else {
                        this.targetX = this.aMoveTargetX;
                        this.targetY = this.aMoveTargetY;
                        this.performMovement();
                        if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                    }
                }
                break;
        }
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        const screenPos = worldToScreen(this.x, this.y);
        const rawW = (this.width || this.size);
        const rawH = (this.height || this.size);
        const hullLength = Math.max(rawW, rawH);
        const hullWidth = Math.min(rawW, rawH);
        const halfLen = hullLength / 2;
        const halfWid = hullWidth / 2;
        const cullRadius = Math.max(halfLen, halfWid) + 18;

        // Skip if offscreen
        if (screenPos.x + cullRadius < 0 ||
            screenPos.x - cullRadius > canvas.width ||
            screenPos.y + cullRadius < 0 ||
            screenPos.y - cullRadius > canvas.height) {
            return;
        }

        const now = performance.now();

        // --- Selection (always visible, not affected by hull rotation transforms) ---
        if (isSelected && this.playerId === currentPlayerId) {
            const radius = Math.max(halfLen, halfWid) + 10;
            ctx.save();
            ctx.setLineDash([]); // ensure solid ring
            ctx.lineCap = 'round';

            // Soft outer glow ring
            ctx.strokeStyle = applyAlphaToColor(this.color, 0.22);
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            // Crisp inner ring
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // --- Rotating hull (faces movement direction) ---
        const hullAngle = this.hullAngle;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(hullAngle);

        // Shadow (rotates with hull) - tinted from unit color (no black)
        ctx.fillStyle = applyAlphaToColor(getDarkerHslColor(this.color, 35), 0.35);
        ctx.fillRect(-halfLen + 3, -halfWid + 3, hullLength, hullWidth);

        // Body
        ctx.fillStyle = this.color;
        ctx.fillRect(-halfLen, -halfWid, hullLength, hullWidth);

        // Minimal highlight
        const gradient = ctx.createLinearGradient(-halfLen, -halfWid, halfLen, halfWid);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.10)');
        ctx.fillStyle = gradient;
        ctx.fillRect(-halfLen, -halfWid, hullLength, hullWidth);

        // Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2;
        ctx.strokeRect(-halfLen, -halfWid, hullLength, hullWidth);

        // Minimalist barrel:
        // - starts at hull center
        // - extends slightly past the hull front
        // - has its own angle (lags hull)
        const barrelWidth = Math.max(5, hullWidth * 0.26);
        const barrelLen = halfLen + Math.max(10, hullLength * 0.12);

        ctx.save();
        // rotate from hull space -> barrel space (lag)
        ctx.rotate(this.barrelAngle - this.hullAngle);

        ctx.fillStyle = applyAlphaToColor(this.color, 0.96);
        ctx.fillRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
        ctx.strokeStyle = getDarkerHslColor(this.color, 25);
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
        ctx.restore();

        // Siege anchors (animated)
        if (this.siegeProgress > 0.01) {
            const t = this.siegeProgress;
            const legLen = Math.floor(this.size * 0.35 * t);
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';

            const corners = [
                { x: -halfLen + 3, y: -halfWid + 3, dx: -1, dy: -1 },
                { x: halfLen - 3, y: -halfWid + 3, dx: 1, dy: -1 },
                { x: -halfLen + 3, y: halfWid - 3, dx: -1, dy: 1 },
                { x: halfLen - 3, y: halfWid - 3, dx: 1, dy: 1 },
            ];

            for (const c of corners) {
                ctx.beginPath();
                ctx.moveTo(c.x, c.y);
                ctx.lineTo(c.x + c.dx * legLen, c.y + c.dy * legLen);
                ctx.stroke();
            }
        }

        // Construction overlay (subtle)
        if (this.isUnderConstruction) {
            const now = performance.now();
            const p = Math.min(1, Math.max(0, (now - this.constructionStartTime) / this.constructionDuration));
            ctx.fillStyle = `rgba(0,0,0,${0.35 - 0.2 * p})`;
            ctx.fillRect(-halfLen, -halfWid, hullLength, hullWidth);
        }

        ctx.restore();
    }
}

// --- Worker Class (Builder Unit) ---
class Worker extends Unit {
    constructor(x, y, playerId) {
        const workerStats = {
            maxHealth: 60,
            armor: 0,
            attackDamage: 0, // Workers can't attack
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0.2,
            movementSpeed: 0.6328125, // Reduced by 25% again (was 0.84375)
            visionRange: 400, // Good vision for workers (utility units)
            supplyCost: 0 // Workers do not consume combat supply
        };

        // Make workers slightly larger than marines (35 vs 30)
        super(x, y, playerId, workerStats, 35, 'worker');

        // Worker-specific properties
        this.workerSupplyCost = WORKER_SUPPLY_COST;
        this.buildProgress = 0;
        this.buildTarget = null;
        this.buildType = null;
        this.buildCorners = null; // Array of corner positions [{x, y}, ...]
        this.currentCornerIndex = 0; // Index of current corner (0-3)
    }

    // Ensure isUnderPoint is properly implemented
    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    // Check if a corner position is walkable (not blocked by buildings)
    isCornerWalkable(cornerX, cornerY, excludeBuilding = null) {
        const workerRadius = this.size / 2;
        const padding = 5; // Small padding to ensure walkable space
        const checkRadius = workerRadius + padding;

        // Check against all game objects
        for (const obj of gameObjects) {
            // Skip the building we're constructing and the excludeBuilding
            if (obj === excludeBuilding || obj === this.buildingUnderConstruction) {
                continue;
            }

            // Check buildings (completed or under construction)
            if ((obj.type === 'bunker' || obj.type === 'supplyDepot' || 
                 obj.type === 'shieldTower' || obj.type === 'sensorTower' || obj.type === 'tankConstruction') &&
                obj.health > 0) {
                
                const objWidth = obj.width || obj.size;
                const objHeight = obj.height || obj.size;
                const objHalfWidth = objWidth / 2;
                const objHalfHeight = objHeight / 2;
                
                // Check if corner is within building bounds (with padding)
                const objLeft = obj.x - objHalfWidth - checkRadius;
                const objRight = obj.x + objHalfWidth + checkRadius;
                const objTop = obj.y - objHalfHeight - checkRadius;
                const objBottom = obj.y + objHalfHeight + checkRadius;

                if (cornerX >= objLeft && cornerX <= objRight &&
                    cornerY >= objTop && cornerY <= objBottom) {
                    return false; // Corner is blocked
                }
            }

            // Check neutral structures
            if (obj.isNeutralStructure && obj.health > 0) {
                const objHalfSize = (obj.width || obj.size) / 2;
                const distance = Math.hypot(obj.x - cornerX, obj.y - cornerY);
                if (distance < objHalfSize + checkRadius) {
                    return false; // Corner is blocked
                }
            }
        }

        return true; // Corner is walkable
    }

    // Find the nearest available corner from a given position
    findNearestAvailableCorner(fromX, fromY, corners, excludeBuilding = null) {
        if (!corners || corners.length === 0) return null;

        let nearestCorner = null;
        let nearestDistance = Infinity;
        let nearestIndex = -1;

        for (let i = 0; i < corners.length; i++) {
            const corner = corners[i];
            if (this.isCornerWalkable(corner.x, corner.y, excludeBuilding)) {
                const distance = Math.hypot(corner.x - fromX, corner.y - fromY);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestCorner = corner;
                    nearestIndex = i;
                }
            }
        }

        return nearestIndex >= 0 ? { corner: nearestCorner, index: nearestIndex } : null;
    }

    // Cancel building and reset state
    cancelBuilding() {
        // Don't refund resources - this is a game mechanic cost
        const buildingRef = this.buildingUnderConstruction;
        this.commandState = 'idle';
        this.buildType = null;
        this.buildProgress = 0;
        this.buildTarget = null;
        this.buildCorners = null;
        this.currentCornerIndex = 0;
        this.buildingUnderConstruction = null;
        
        // Return building reference for potential restart
        return buildingRef;
    }

    // Restart building from the current angle/corner
    restartBuilding(buildingRef) {
        if (!buildingRef || !buildingRef.isUnderConstruction) {
            return false;
        }

        // Reset progress but keep building reference
        this.commandState = 'building';
        this.buildType = buildingRef.type;
        this.buildTarget = { x: buildingRef.x, y: buildingRef.y };
        this.buildProgress = buildingRef.constructionProgress || 0;
        this.buildingUnderConstruction = buildingRef;

        // Recalculate corners
        const buildingWidth = buildingRef.width || (buildingRef.gridWidth * GRID_CELL_WIDTH);
        const buildingHeight = buildingRef.height || (buildingRef.gridHeight * GRID_CELL_HEIGHT);
        const halfWidth = buildingWidth / 2;
        const halfHeight = buildingHeight / 2;
        
        this.buildCorners = [
            { x: buildingRef.x - halfWidth, y: buildingRef.y - halfHeight }, // Top-left
            { x: buildingRef.x + halfWidth, y: buildingRef.y - halfHeight }, // Top-right
            { x: buildingRef.x + halfWidth, y: buildingRef.y + halfHeight }, // Bottom-right
            { x: buildingRef.x - halfWidth, y: buildingRef.y + halfHeight }  // Bottom-left
        ];

        // Find the nearest available corner to restart from
        const nearestCornerInfo = this.findNearestAvailableCorner(
            this.x,
            this.y,
            this.buildCorners,
            buildingRef
        );

        if (nearestCornerInfo) {
            this.currentCornerIndex = nearestCornerInfo.index;
            this.targetX = nearestCornerInfo.corner.x;
            this.targetY = nearestCornerInfo.corner.y;
        } else {
            // Fallback: if no corners are available, use building center
            this.currentCornerIndex = -1;
            this.targetX = buildingRef.x;
            this.targetY = buildingRef.y;
        }

        return true;
    }

    // Start building placement mode
    startBuildingPlacement(buildType) {
        // Check if player has enough resources
        const cost = BUILDING_COSTS[buildType];
        if (!cost) {
            console.log(`Unknown building type: ${buildType}`);
            return false;
        }

            const playerState = players[this.playerId];
    if (playerState.resources < cost) {
        return false;
    }

    // Tanks do not require supply - removed supply gate check

    // Enter building placement mode
    buildingPlacementMode = true;
        buildingTypeToPlace = buildType;
        buildingWorkers = [this]; // Start with this worker

        // Initial placement position is near the worker
        // Convert to grid coordinates first
        const workerGridPos = worldToGrid(this.x + 75, this.y);
        const gridX = workerGridPos.gridX;
        const gridY = workerGridPos.gridY;

        // Get building size
        const buildingSize = BUILDING_GRID_SIZES[buildType];
        const gridWidth = buildingSize.width;
        const gridHeight = buildingSize.height;

        // Calculate center position for multi-cell buildings
        if (gridWidth > 1 || gridHeight > 1) {
            const centerGridX = gridX + Math.floor(gridWidth / 2);
            const centerGridY = gridY + Math.floor(gridHeight / 2);
            const centerWorldPos = gridToWorld(centerGridX, centerGridY);

            buildingPlacementX = centerWorldPos.x;
            buildingPlacementY = centerWorldPos.y;
        } else {
            // For 1x1 buildings, use the center of the single cell
            const cellWorldPos = gridToWorld(gridX, gridY);
            buildingPlacementX = cellWorldPos.x;
            buildingPlacementY = cellWorldPos.y;
        }


        return true;
    }

    // Start building a structure
    build(buildType, targetX, targetY, gridX, gridY) {
        // Check if player has enough resources
        const cost = BUILDING_COSTS[buildType];
        if (!cost) {
            console.log(`Unknown building type: ${buildType}`);
            return false;
        }

        const playerState = players[this.playerId];
        if (playerState.resources < cost) {
    
            return false;
        }

        // Tanks do not require supply - removed supply gate check

        // Allow workers to start new builds even if already building (for multiple tank builds)
        // Cancel previous building if worker is already building something else
        if (this.commandState === 'building' && this.buildType !== buildType) {
            // Cancel previous building
            if (this.buildingUnderConstruction) {
                // Don't refund resources - building is already started
            }
            this.buildType = null;
            this.buildProgress = 0;
            this.buildTarget = null;
            this.buildCorners = null;
            this.currentCornerIndex = 0;
            this.buildingUnderConstruction = null;
        }

        // Deduct resources
        playerState.resources -= cost;
        updateResourceSupplyDisplay();

        // Tanks do not require supply - removed supply reservation

        // Set the worker to building state
        this.commandState = 'building';
        this.buildType = buildType;
        this.buildTarget = { x: targetX, y: targetY };
        this.buildProgress = 0;
        this.targetX = targetX;
        this.targetY = targetY;

        // Get building size in grid cells
        const buildingSize = BUILDING_GRID_SIZES[buildType];
        const gridWidth = buildingSize.width;
        const gridHeight = buildingSize.height;

        // Use the provided grid coordinates directly
        console.log(`Building placement debug:`);
        console.log(`- Grid position: (${gridX}, ${gridY})`);
        console.log(`- Grid size: ${gridWidth}x${gridHeight}`);
        console.log(`- Target position: (${targetX}, ${targetY})`);

        // Use the target position directly from the building preview
        // This ensures the building is placed exactly where the preview shows
        console.log(`- Using target position directly: (${targetX}, ${targetY})`);

        // Store the grid coordinates for reference in the building object
        // This will be used for collision detection and placement validation

        // Create the building immediately in 'under construction' state
        let newBuilding = null;

        // Use the target position directly to ensure it matches the preview position
        if (buildType === 'bunker') {
            newBuilding = new Bunker(targetX, targetY, this.playerId, true);
        } else if (buildType === 'supplyDepot') {
            newBuilding = new SupplyDepot(targetX, targetY, this.playerId, true);
        } else if (buildType === 'shieldTower') {
            newBuilding = new ShieldTower(targetX, targetY, this.playerId, true);
        } else if (buildType === 'sensorTower') {
            newBuilding = new SensorTower(targetX, targetY, this.playerId, true);
        } else if (buildType === 'tank') {
            newBuilding = new TankConstruction(targetX, targetY, this.playerId);
        }

        if (newBuilding) {
            // Store reference to the building being constructed
            this.buildingUnderConstruction = newBuilding;
            // Store the grid position for future reference
            newBuilding.gridX = gridX;
            newBuilding.gridY = gridY;
            newBuilding.gridWidth = gridWidth;
            newBuilding.gridHeight = gridHeight;
            // Add the building to the game objects
            gameObjects.push(newBuilding);

            // Calculate building corners for worker rotation
            // Buildings have width and height properties
            const buildingWidth = newBuilding.width || (gridWidth * GRID_CELL_WIDTH);
            const buildingHeight = newBuilding.height || (gridHeight * GRID_CELL_HEIGHT);
            const halfWidth = buildingWidth / 2;
            const halfHeight = buildingHeight / 2;
            
            // Calculate the four corners of the building (top-left, top-right, bottom-right, bottom-left)
            this.buildCorners = [
                { x: targetX - halfWidth, y: targetY - halfHeight }, // Top-left
                { x: targetX + halfWidth, y: targetY - halfHeight }, // Top-right
                { x: targetX + halfWidth, y: targetY + halfHeight }, // Bottom-right
                { x: targetX - halfWidth, y: targetY + halfHeight }  // Bottom-left
            ];
            
            // Find the nearest available corner to the worker's current position
            const nearestCornerInfo = this.findNearestAvailableCorner(
                this.x, 
                this.y, 
                this.buildCorners, 
                newBuilding
            );
            
            if (nearestCornerInfo) {
                this.currentCornerIndex = nearestCornerInfo.index;
                this.targetX = nearestCornerInfo.corner.x;
                this.targetY = nearestCornerInfo.corner.y;
            } else {
                // Fallback: if no corners are available, use building center
                this.currentCornerIndex = -1;
                this.targetX = targetX;
                this.targetY = targetY;
            }
        }


        return true;
    }

    update(now, allGameObjects) {
        if (this.health <= 0) {
            this.commandState = 'idle';
            return;
        }

        // Handle repair mode for workers
        const repairRange = 50; // Range at which worker can repair
        
        if (repairModeEnabled && (this.commandState === 'idle' || this.commandState === 'moving' || this.commandState === 'repairing')) {
            // Find nearest damaged building or turret owned by this player
            let nearestDamagedBuilding = null;
            let nearestDistance = Infinity;
            
            for (const obj of allGameObjects) {
                // Check for buildings (including turrets) that need repair
                if ((obj.isBuilding || obj.type === 'turret') && 
                    obj.playerId === this.playerId && 
                    obj.health > 0 && 
                    obj.health < obj.maxHealth &&
                    !obj.isUnderConstruction) {
                    const dist = Math.hypot(obj.x - this.x, obj.y - this.y);
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestDamagedBuilding = obj;
                    }
                }
            }
            
            if (nearestDamagedBuilding) {
                if (nearestDistance <= repairRange) {
                    // In range - repair the building
                    this.commandState = 'repairing';
                    this.repairTarget = nearestDamagedBuilding;
                    
                    const playerState = players[this.playerId];
                    if (playerState && playerState.resources >= REPAIR_COST_PER_SECOND) {
                        const repairAmount = 2; // HP restored per frame
                        const oldHealth = nearestDamagedBuilding.health;
                        nearestDamagedBuilding.health = Math.min(
                            nearestDamagedBuilding.maxHealth,
                            nearestDamagedBuilding.health + repairAmount
                        );
                        
                        // Deduct resources based on repair done
                        const healthRestored = nearestDamagedBuilding.health - oldHealth;
                        if (healthRestored > 0) {
                            playerState.resources -= REPAIR_COST_PER_SECOND;
                            updateResourceSupplyDisplay();
                            
                            // Create repair visual effect (sparks) - simplified, player color
                            const now = performance.now();
                            const playerColor = this.color || '#4DA6FF';
                            for (let i = 0; i < 2; i++) {
                                const angle = Math.random() * Math.PI * 2;
                                const distance = 8 + Math.random() * 4;
                                repairEffects.push({
                                    x: nearestDamagedBuilding.x + Math.cos(angle) * distance,
                                    y: nearestDamagedBuilding.y + Math.sin(angle) * distance,
                                    vx: Math.cos(angle) * 0.5,
                                    vy: Math.sin(angle) * 0.5,
                                    color: playerColor,
                                    life: 0.5, // 500ms - slower fade
                                    maxLife: 0.5,
                                    size: 4 // Larger, more noticeable
                                });
                            }
                        }
                    }
                } else {
                    // Out of range - move towards building
                    if (this.commandState !== 'repairing' || this.repairTarget !== nearestDamagedBuilding) {
                        this.targetX = nearestDamagedBuilding.x;
                        this.targetY = nearestDamagedBuilding.y;
                        this.commandState = 'moving';
                        this.repairTarget = null;
                    }
                }
            } else {
                // No damaged buildings found
                if (this.commandState === 'repairing') {
                    this.commandState = 'idle';
                    this.repairTarget = null;
                }
            }
        }
        
        switch (this.commandState) {
            case 'idle':
                break;
            case 'moving':
                this.performMovement();
                // Check if we've reached the target (with some tolerance)
                const distToTarget = Math.hypot(this.x - this.targetX, this.y - this.targetY);
                if (distToTarget < 2) {
                    // If we were moving to a repair target, start repairing
                    if (this.repairTarget) {
                        const distToRepairTarget = Math.hypot(this.x - this.repairTarget.x, this.y - this.repairTarget.y);
                        if (distToRepairTarget <= repairRange) {
                            this.commandState = 'repairing';
                        } else {
                            this.commandState = 'idle';
                            this.repairTarget = null;
                        }
                    } else {
                        this.commandState = 'idle';
                    }
                }
                break;
            case 'repairing':
                // Continue repairing if target still needs repair and is in range
                if (this.repairTarget && this.repairTarget.health > 0 && this.repairTarget.health < this.repairTarget.maxHealth) {
                    const distToTarget = Math.hypot(this.x - this.repairTarget.x, this.y - this.repairTarget.y);
                    if (distToTarget > repairRange) {
                        // Moved out of range, move back
                        this.targetX = this.repairTarget.x;
                        this.targetY = this.repairTarget.y;
                        this.commandState = 'moving';
                    } else {
                        // In range - perform repair
                        const playerState = players[this.playerId];
                        if (playerState && playerState.resources >= REPAIR_COST_PER_SECOND) {
                            const repairAmount = 2; // HP restored per frame
                            const oldHealth = this.repairTarget.health;
                            this.repairTarget.health = Math.min(
                                this.repairTarget.maxHealth,
                                this.repairTarget.health + repairAmount
                            );
                            
                            // Deduct resources based on repair done
                            const healthRestored = this.repairTarget.health - oldHealth;
                            if (healthRestored > 0) {
                                playerState.resources -= REPAIR_COST_PER_SECOND;
                                updateResourceSupplyDisplay();
                                
                                // Create repair visual effect (sparks) - simplified, player color
                                const now = performance.now();
                                const playerColor = this.color || '#4DA6FF';
                                for (let i = 0; i < 2; i++) {
                                    const angle = Math.random() * Math.PI * 2;
                                    const distance = 8 + Math.random() * 4;
                                    repairEffects.push({
                                        x: this.repairTarget.x + Math.cos(angle) * distance,
                                        y: this.repairTarget.y + Math.sin(angle) * distance,
                                        vx: Math.cos(angle) * 0.5,
                                        vy: Math.sin(angle) * 0.5,
                                        color: playerColor,
                                        life: 0.5, // 500ms - slower fade
                                        maxLife: 0.5,
                                        size: 4 // Larger, more noticeable
                                    });
                                }
                            }
                        }
                    }
                } else {
                    // Target is fully repaired or destroyed
                    this.commandState = 'idle';
                    this.repairTarget = null;
                }
                break;
            case 'building':
                // First move to the build location (corner)
                if (Math.abs(this.x - this.targetX) > 1 || Math.abs(this.y - this.targetY) > 1) {
                    this.performMovement();
                    return;
                }

                // Once at the location, progress the building
                // Calculate build speed based on BUILD_TIME (5 seconds)
                const buildSpeed = 1 / (BUILD_TIME / 16.67); // 16.67ms is approx. one frame at 60fps

                // Progress the building
                this.buildProgress += buildSpeed;
                
                // Check if current corner is still walkable (only rotate if blocked)
                if (this.buildCorners && this.buildCorners.length === 4) {
                    // Only check if current corner becomes blocked - don't force rotation based on progress
                    if (this.currentCornerIndex >= 0 && this.currentCornerIndex < this.buildCorners.length) {
                        const currentCorner = this.buildCorners[this.currentCornerIndex];
                        if (!this.isCornerWalkable(currentCorner.x, currentCorner.y, this.buildingUnderConstruction)) {
                            // Current corner became blocked, find nearest available corner
                            const nearestCornerInfo = this.findNearestAvailableCorner(
                                this.x,
                                this.y,
                                this.buildCorners,
                                this.buildingUnderConstruction
                            );
                            
                            if (nearestCornerInfo) {
                                this.currentCornerIndex = nearestCornerInfo.index;
                                this.targetX = nearestCornerInfo.corner.x;
                                this.targetY = nearestCornerInfo.corner.y;
                            } else {
                                // No corners available, move to building center
                                if (this.buildTarget) {
                                    this.currentCornerIndex = -1;
                                    this.targetX = this.buildTarget.x;
                                    this.targetY = this.buildTarget.y;
                                }
                            }
                        }
                    } else if (this.currentCornerIndex === -1) {
                        // Currently at building center, try to find an available corner
                        const nearestCornerInfo = this.findNearestAvailableCorner(
                            this.x,
                            this.y,
                            this.buildCorners,
                            this.buildingUnderConstruction
                        );
                        
                        if (nearestCornerInfo) {
                            this.currentCornerIndex = nearestCornerInfo.index;
                            this.targetX = nearestCornerInfo.corner.x;
                            this.targetY = nearestCornerInfo.corner.y;
                        }
                    }
                }

                // Update the building's construction progress
                if (this.buildingUnderConstruction) {
                    this.buildingUnderConstruction.constructionProgress = this.buildProgress;
                }

                // Check for other workers building the same structure
                // Compare using building center (buildTarget) instead of corner positions
                let buildingWorkerCount = 1; // Start with this worker
                const thisBuildingCenter = this.buildTarget || { x: this.targetX, y: this.targetY };
                for (const obj of allGameObjects) {
                    if (obj !== this &&
                        obj.type === 'worker' &&
                        obj.playerId === this.playerId &&
                        obj.commandState === 'building' &&
                        obj.buildType === this.buildType &&
                        obj.buildTarget &&
                        Math.hypot(obj.buildTarget.x - thisBuildingCenter.x, obj.buildTarget.y - thisBuildingCenter.y) < 10) {
                        buildingWorkerCount++;
                    }
                }

                // Each additional worker adds 50% more build speed
                if (buildingWorkerCount > 1) {
                    const bonusSpeed = buildSpeed * 0.5 * (buildingWorkerCount - 1);
                    this.buildProgress += bonusSpeed;

                    // Update the building's construction progress again after bonus
                    if (this.buildingUnderConstruction) {
                        this.buildingUnderConstruction.constructionProgress = this.buildProgress;
                    }
                }

                // When building is complete
                if (this.buildProgress >= 1) {
                    // Only the first worker should finish the building
                    // to avoid multiple workers trying to complete the same building
                    let isFirstWorkerOnBuilding = true;
                    const thisBuildingCenter = this.buildTarget || { x: this.targetX, y: this.targetY };
                    for (const obj of allGameObjects) {
                        if (obj !== this &&
                            obj.type === 'worker' &&
                            obj.playerId === this.playerId &&
                            obj.commandState === 'building' &&
                            obj.buildType === this.buildType &&
                            obj.buildTarget &&
                            Math.hypot(obj.buildTarget.x - thisBuildingCenter.x, obj.buildTarget.y - thisBuildingCenter.y) < 10 &&
                            obj.buildProgress >= this.buildProgress) {
                            // Found a worker with higher or equal progress, so we're not the first
                            isFirstWorkerOnBuilding = false;
                            break;
                        }
                    }

                    if (isFirstWorkerOnBuilding) {
        
                        this.finishBuilding(allGameObjects);

                        // Reset all other workers on this building
                        const thisBuildingCenter = this.buildTarget || { x: this.targetX, y: this.targetY };
                        for (const obj of allGameObjects) {
                            if (obj !== this &&
                                obj.type === 'worker' &&
                                obj.playerId === this.playerId &&
                                obj.commandState === 'building' &&
                                obj.buildType === this.buildType &&
                                obj.buildTarget &&
                                Math.hypot(obj.buildTarget.x - thisBuildingCenter.x, obj.buildTarget.y - thisBuildingCenter.y) < 10) {
                                // Reset this worker's building state
                                obj.buildType = null;
                                obj.buildProgress = 0;
                                obj.commandState = 'idle';
                                obj.buildingUnderConstruction = null;
                                obj.buildCorners = null;
                                obj.currentCornerIndex = 0;
                            }
                        }
                    } else {
                        // Not the first worker, just wait for the first one to finish
        
                    }
                }
                break;
        }
    }

    finishBuilding(allGameObjects) {

        try {
            // If we have a reference to the building under construction, complete it
            if (this.buildingUnderConstruction) {
        

                // Tank: convert construction footprint into a real Tank
                if (this.buildType === 'tank' && this.buildingUnderConstruction instanceof TankConstruction) {
                    const pad = this.buildingUnderConstruction;
                    const spawnX = pad.x;
                    const spawnY = pad.y;

                    // Remove pad without affecting supply (already reserved)
                    const idx = allGameObjects.indexOf(pad);
                    if (idx >= 0) allGameObjects.splice(idx, 1);

                    const tank = new Tank(spawnX, spawnY, this.playerId, false);
                    applyUpgradesToUnit(tank);
                    allGameObjects.push(tank);

                    // Push worker away from the finished unit footprint
                    try { this.pushAwayFromBuilding(pad); } catch {}

                    this.buildingUnderConstruction = null;
                    return;
                }

                // Mark the building as completed
                this.buildingUnderConstruction.isUnderConstruction = false;

                // For supply depots, add the supply bonus now that construction is complete
                if (this.buildType === 'supplyDepot') {
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += this.buildingUnderConstruction.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                // For bunkers, set the initial rally point to the center of the map and add supply bonus
                if (this.buildType === 'bunker') {
                    console.log(`Bunker construction completed, setting initial rally point`);
                    this.buildingUnderConstruction.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

                    // Add supply bonus for bunkers
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += this.buildingUnderConstruction.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                const buildingCenter = this.buildTarget || { x: this.buildingUnderConstruction.x, y: this.buildingUnderConstruction.y };
                console.log(`Worker completed building ${this.buildType} at (${buildingCenter.x}, ${buildingCenter.y})`);

                // Push the worker away from the building to prevent overlap
                try {
                    this.pushAwayFromBuilding(this.buildingUnderConstruction);
                } catch (pushError) {
        
                }

                // Clear the reference
                this.buildingUnderConstruction = null;
            } else {
            // Check if there's already a building at this location
            const buildingCenter = this.buildTarget || { x: 0, y: 0 };
            let existingBuilding = null;
            for (const obj of allGameObjects) {
                if (obj.type === this.buildType &&
                    Math.hypot(obj.x - buildingCenter.x, obj.y - buildingCenter.y) < 10 &&
                    obj.playerId === this.playerId) {
                    existingBuilding = obj;
                    break;
                }
            }

            if (existingBuilding) {

                existingBuilding.isUnderConstruction = false;

                // For supply depots, add the supply bonus
                if (this.buildType === 'supplyDepot') {
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += existingBuilding.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                // For bunkers, set the initial rally point to the center of the map and add supply bonus
                if (this.buildType === 'bunker') {
                    console.log(`Bunker construction completed, setting initial rally point`);
                    existingBuilding.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

                    // Add supply bonus for bunkers
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += existingBuilding.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                // Push away from the existing building
                this.pushAwayFromBuilding(existingBuilding);
            } else {
                // Fallback to the old method if we don't have a reference and no existing building
                const buildingCenter = this.buildTarget || { x: 0, y: 0 };
                let newBuilding = null;

                if (this.buildType === 'bunker') {
                    newBuilding = new Bunker(buildingCenter.x, buildingCenter.y, this.playerId);
                } else if (this.buildType === 'supplyDepot') {
                    newBuilding = new SupplyDepot(buildingCenter.x, buildingCenter.y, this.playerId);
                } else if (this.buildType === 'shieldTower') {
                    newBuilding = new ShieldTower(buildingCenter.x, buildingCenter.y, this.playerId);
                } else if (this.buildType === 'sensorTower') {
                    newBuilding = new SensorTower(buildingCenter.x, buildingCenter.y, this.playerId);
                }

                if (newBuilding) {
                    // For bunkers, set the initial rally point to the center of the map and add supply bonus
                    if (this.buildType === 'bunker') {
                        console.log(`Bunker construction completed, setting initial rally point`);
                        newBuilding.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

                        // Add supply bonus for bunkers
                        const playerState = players[this.playerId];
                        if (playerState) {
                            playerState.supplyCap += newBuilding.supplyBonus;
                            console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                            updateResourceSupplyDisplay();
                        }
                    }

                    allGameObjects.push(newBuilding);
                    console.log(`Worker completed building ${this.buildType} at (${buildingCenter.x}, ${buildingCenter.y})`);
                    this.pushAwayFromBuilding(newBuilding);
                }
            }
        }

        // Reset building state
        this.buildType = null;
        this.buildProgress = 0;
        this.commandState = 'idle';
        this.buildCorners = null;
        this.currentCornerIndex = 0;
        } catch (error) {

        }
    }

    // Push the worker away from a building to prevent overlap
    pushAwayFromBuilding(building) {
        if (!building) {

            return;
        }



        // Calculate vector from building to worker
        const dx = this.x - building.x;
        const dy = this.y - building.y;

        // Calculate distance
        const distance = Math.hypot(dx, dy);
        if (distance === 0) {
            // If distance is zero, push in a random direction
            this.x += 20; // Push right by default

            return;
        }

        // Calculate minimum separation distance (sum of radii plus a small buffer)
        const minDistance = (this.size + building.size) / 2 + 10;

        // If we're too close, push away
        if (distance < minDistance) {
            // Normalize the direction vector
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;

            // Calculate new position
            const pushDistance = minDistance - distance;
            this.x += normalizedDx * pushDistance;
            this.y += normalizedDy * pushDistance;

    
        }
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        // Draw rounded shadow
        ctx.beginPath();
        const cornerRadius = 8; // Rounded corner radius
        ctx.roundRect(drawX + 3, drawY + 3, this.size, this.size, cornerRadius);
        ctx.fill();

        // --- Draw Worker Body with Rounded Corners ---
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, this.size, this.size, cornerRadius);
        ctx.fill();

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, this.size, this.size, cornerRadius);
        ctx.fill();

        // --- Draw Unit Symbol (Circle Direction Indicator instead of Triangle) ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

        // Draw circle pointing in movement direction
        const circleRadius = halfSize * 0.3;
        const angle = this.lastMoveAngle;
        const circleX = screenPos.x + Math.cos(angle) * (halfSize * 0.4);
        const circleY = screenPos.y + Math.sin(angle) * (halfSize * 0.4);

        ctx.beginPath();
        ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
        ctx.fill();

        // --- Draw Dashed Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2; // Increased unit border thickness
        ctx.setLineDash([5, 3]); // Dashed border pattern
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, this.size, this.size, cornerRadius);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.beginPath();
            ctx.roundRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2,
                cornerRadius + padding
            );
            ctx.fill();

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.beginPath();
            ctx.roundRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2,
                cornerRadius + padding
            );
            ctx.stroke();

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }

        // If building, draw a progress indicator
        if (this.commandState === 'building' && this.buildProgress > 0) {
            // Draw progress bar above the worker
            const barWidth = this.size;
            const barHeight = 4;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfSize - 10;

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.buildProgress, barHeight);

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
    }
}

// --- Initialization ---
function setupGame() {
    gameObjects.length = 0;
    selectedUnits = [];
    Object.keys(players).forEach(id => {
        players[id].currentSupply = 0;
        players[id].killResourceScore = 0;
    });
    
    // Initialize fog of war system
    fogOfWar = new FogOfWar();

    // Calculate tile positions
    const tileWidth = MAP_WIDTH / TILE_COUNT;
    const tileHeight = MAP_HEIGHT / TILE_COUNT;

    // Helper function to get bunker position in appropriate corner of building grid
    function getBunkerCornerPosition(tileX, tileY, corner) {
        // Calculate which global grid cell to center the 3x3 bunker at
        let gridOffsetX, gridOffsetY;
        
        switch(corner) {
            case 'top-left':
                gridOffsetX = 1; // Center of 3x3 bunker starting at grid (0,0)
                gridOffsetY = 1;
                break;
            case 'top-right':  
                gridOffsetX = 2; // Center of 3x3 bunker starting at grid (1,0)
                gridOffsetY = 1;
                break;
            case 'bottom-left':
                gridOffsetX = 1; // Center of 3x3 bunker starting at grid (0,1)
                gridOffsetY = 2;
                break;
            case 'bottom-right':
                gridOffsetX = 2; // Center of 3x3 bunker starting at grid (1,1)
                gridOffsetY = 2;
                break;
        }
        
        // Convert tile coordinates to global grid coordinates
        const globalGridX = tileX * GRID_CELLS_PER_TILE + gridOffsetX;
        const globalGridY = tileY * GRID_CELLS_PER_TILE + gridOffsetY;
        
        // Convert grid coordinates to world coordinates
        return gridToWorld(globalGridX, globalGridY);
    }

    // Team 1 (Red) - Top-left quadrant - bunkers in TOP-LEFT corner (closest to center)
    // Player 1 - right of corner
    const bunker1Pos = getBunkerCornerPosition(1, 0, 'top-left');
    gameObjects.push(new Bunker(bunker1Pos.x, bunker1Pos.y, 1));

    // Add a worker for player 1
    gameObjects.push(new Worker(bunker1Pos.x + 113, bunker1Pos.y, 1));

    // Player 2 - below corner  
    const bunker2Pos = getBunkerCornerPosition(0, 1, 'top-left');
    gameObjects.push(new Bunker(bunker2Pos.x, bunker2Pos.y, 2));
    // Add a worker for player 2
    gameObjects.push(new Worker(bunker2Pos.x + 113, bunker2Pos.y, 2));

    // Team 2 (Blue) - Top-right quadrant - bunkers in TOP-RIGHT corner (closest to center)
    // Player 3 - left of corner
    const bunker3Pos = getBunkerCornerPosition(6, 0, 'top-right');
    gameObjects.push(new Bunker(bunker3Pos.x, bunker3Pos.y, 3));
    // Add a worker for player 3
    gameObjects.push(new Worker(bunker3Pos.x - 113, bunker3Pos.y, 3));

    // Player 4 - below corner
    const bunker4Pos = getBunkerCornerPosition(7, 1, 'top-right');
    gameObjects.push(new Bunker(bunker4Pos.x, bunker4Pos.y, 4));
    // Add a worker for player 4
    gameObjects.push(new Worker(bunker4Pos.x - 113, bunker4Pos.y, 4));

    // Team 3 (Green) - Bottom-left quadrant - bunkers in BOTTOM-LEFT corner (closest to center)
    // Player 5 - right of corner
    const bunker5Pos = getBunkerCornerPosition(1, 7, 'bottom-left');
    gameObjects.push(new Bunker(bunker5Pos.x, bunker5Pos.y, 5));
    // Add a worker for player 5
    gameObjects.push(new Worker(bunker5Pos.x + 113, bunker5Pos.y, 5));

    // Player 6 - above corner
    const bunker6Pos = getBunkerCornerPosition(0, 6, 'bottom-left');
    gameObjects.push(new Bunker(bunker6Pos.x, bunker6Pos.y, 6));
    // Add a worker for player 6
    gameObjects.push(new Worker(bunker6Pos.x + 113, bunker6Pos.y, 6));

    // Team 4 (Brown) - Bottom-right quadrant - bunkers in BOTTOM-RIGHT corner (closest to center)  
    // Player 7 - left of corner
    const bunker7Pos = getBunkerCornerPosition(6, 7, 'bottom-right');
    gameObjects.push(new Bunker(bunker7Pos.x, bunker7Pos.y, 7));
    // Add a worker for player 7
    gameObjects.push(new Worker(bunker7Pos.x - 113, bunker7Pos.y, 7));

    // Player 8 - above corner
    const bunker8Pos = getBunkerCornerPosition(7, 6, 'bottom-right');
    gameObjects.push(new Bunker(bunker8Pos.x, bunker8Pos.y, 8));
    // Add a worker for player 8
    gameObjects.push(new Worker(bunker8Pos.x - 113, bunker8Pos.y, 8));

    // Neutral Sight Tower anchored at map center (static, non-buildable)
    const sightTowerPos = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    gameObjects.push(new SightTower(sightTowerPos.x, sightTowerPos.y));

    // Update supply counts
    updateSupplyCounts();

    // Initialize resource and supply display
    lastResourceUpdateTime = performance.now();
    updateResourceSupplyDisplay();

    // Initialize upgrade levels display
    updateUpgradeLevels();

    switchPlayer(1);
    centerCameraOnFirstBunkerForPlayer(currentPlayerId);
    updateScoreboard(players);
}

// Helper function to update supply counts
function updateSupplyCounts() {
    // Reset all supply counts
    Object.keys(players).forEach(id => { 
        players[id].currentSupply = 0; 
        players[id].currentWorkerSupply = 0;
    });

    // Count units for each player
    gameObjects.forEach(obj => {
        if (obj.health > 0 && obj.type === 'worker') {
            const playerState = players[obj.playerId];
            if (playerState) {
                playerState.currentWorkerSupply += obj.workerSupplyCost || WORKER_SUPPLY_COST;
            }
        } else if (obj.health > 0 && obj.supplyCost > 0) {
            const playerState = players[obj.playerId];
            if (playerState) {
                playerState.currentSupply += obj.supplyCost;
            }
        }
    });
}

// Check if a player still has any surviving bunker
function hasLiveBunker(playerId, excludeId = null) {
    return gameObjects.some(obj =>
        obj.type === 'bunker' &&
        obj.playerId === playerId &&
        obj.health > 0 &&
        obj.id !== excludeId
    );
}

// Destroy all assets owned by a player (units + buildings)
function eliminatePlayerAssets(playerId) {
    gameObjects.forEach(obj => {
        if (obj.playerId === playerId && obj.health > 0) {
            obj.health = 0;
            obj.isDestroyed = true;
        }
    });

    // Clear any selections for that player
    selectedUnits = selectedUnits.filter(sel => sel.playerId !== playerId);
}

// Find a safe point near the player's bunker to respawn a worker
function findWorkerRespawnPoint(playerId) {
    const workerSize = 35;
    const bunker = gameObjects.find(obj => obj.type === 'bunker' && obj.playerId === playerId && obj.health > 0 && !obj.isUnderConstruction);
    if (!bunker) return null;

    const spawnRadius = ((bunker.width || bunker.size) / 2) + (workerSize / 2) + 10;
    let angle = 0;

    for (let attempts = 0; attempts < 8; attempts++) {
        const spawnX = bunker.x + Math.cos(angle) * spawnRadius;
        const spawnY = bunker.y + Math.sin(angle) * spawnRadius;

        const isBlocked = gameObjects.some(obj => {
            if (obj.health <= 0) return false;
            const requiredGap = (obj.size / 2) + (workerSize / 2);
            return Math.hypot(obj.x - spawnX, obj.y - spawnY) < requiredGap;
        });

        if (!isBlocked) {
            return { x: spawnX, y: spawnY };
        }

        angle += Math.PI / 4;
    }

    // Fallback: use bunker center
    return { x: bunker.x, y: bunker.y };
}

// Spawn a falling worker animation
function spawnFallingWorker(targetX, targetY, playerId) {
    const FALL_DURATION = 1000; // Duration of fall in milliseconds
    
    fallingWorkers.push({
        x: targetX,
        y: targetY - WORKER_FALL_HEIGHT, // Start high above target
        startY: targetY - WORKER_FALL_HEIGHT,
        targetY: targetY,
        playerId: playerId,
        startTime: performance.now(),
        duration: FALL_DURATION
    });
}

// Schedule a worker respawn for a player
function scheduleWorkerRespawn(playerId) {
    const playerState = players[playerId];
    if (!playerState) return;

    if (playerState.currentWorkerSupply >= playerState.workerSupplyCap) return;

    const timer = setTimeout(() => {
        const spawnPoint = findWorkerRespawnPoint(playerId);
        if (!spawnPoint) return;

        const newWorker = new Worker(spawnPoint.x, spawnPoint.y, playerId);
        gameObjects.push(newWorker);
        playerState.currentWorkerSupply = Math.min(
            playerState.workerSupplyCap,
            playerState.currentWorkerSupply + (newWorker.workerSupplyCost || WORKER_SUPPLY_COST)
        );

        // Clear completed timer reference
        if (playerState.workerRespawnTimers) {
            playerState.workerRespawnTimers = playerState.workerRespawnTimers.filter(t => t !== timer);
        }

        updateResourceSupplyDisplay();
    }, WORKER_RESPAWN_DELAY);

    if (playerState.workerRespawnTimers) {
        playerState.workerRespawnTimers.push(timer);
    }
}

// --- Player Control ---
const playerBtns = {
    1: document.getElementById('player1Btn'),
    2: document.getElementById('player2Btn'),
    3: document.getElementById('player3Btn'),
    4: document.getElementById('player4Btn'),
    5: document.getElementById('player5Btn'),
    6: document.getElementById('player6Btn'),
    7: document.getElementById('player7Btn'),
    8: document.getElementById('player8Btn')
};

function switchPlayer(newPlayerId) {
    if (newPlayerId < 1 || newPlayerId > 8) return;
    currentPlayerId = newPlayerId;
    isAMoveMode = false;
    selectedUnits = []; // Clear selection
    Object.values(playerBtns).forEach(btn => btn.classList.remove('active'));
    if (playerBtns[currentPlayerId]) playerBtns[currentPlayerId].classList.add('active');
    
    // Update CommandCardUI accent to match current player color
    if (uiSystem && typeof uiSystem.setAccentColor === 'function') {
        uiSystem.setAccentColor(players?.[currentPlayerId]?.color);
    }

    // Update resource and supply display for the new player
    updateResourceSupplyDisplay();
    // Update upgrade display visibility
    updateUpgradeDisplay();
    // Center camera on the selected player's first bunker (works during pregame)
    centerCameraOnFirstBunkerForPlayer(currentPlayerId);
}

// Update event listeners for all player buttons
for (let i = 1; i <= 8; i++) {
    if (playerBtns[i]) {
        playerBtns[i].addEventListener('click', () => switchPlayer(i));
    }
}

// --- Input Handling ---
window.addEventListener('keydown', handleKeyDown);
canvas.addEventListener('contextmenu', handleRightClick);

function handleKeyDown(event) {
    // Don't process game keys if chat is open
    if (chatSystem && chatSystem.isInputOpen) {
        return;
    }


    // Allow dev player-cycle hotkey (.) even when paused; block others while paused
    if (isGamePaused) {
        const keyPaused = event.key.toLowerCase();
        if (keyPaused !== '.') {
            return;
        }
    }

    // Check if the key is for the UI system
    const key = event.key.toLowerCase();
    const uiKeys = ['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b', '6'];

    // Handle hotkey 5 (tanks) before UI system (special case)
    if (key === '5') {
        const now = Date.now();
        const isDoubleClick = (lastHotkeyPressed === '5' && (now - lastHotkeyTime) < DOUBLE_CLICK_WINDOW);
        
        // Get all tanks for the player
        const allTanks = gameObjects.filter(obj => 
            obj.type === 'tank' && obj.playerId === currentPlayerId && obj.health > 0
        );
        
        if (allTanks.length === 0) {
            selectedUnits = [];
            lastHotkeyPressed = '5';
            lastHotkeyTime = now;
            return;
        }
        
        // If double-click or rapid presses, rotate through tanks
        if (isDoubleClick || (lastHotkeyPressed === '5' && allTanks.length > 1)) {
            // Check if we're rotating (same tank list as before)
            const tankIds = allTanks.map(t => t.id).sort().join(',');
            const lastTankIds = lastTankSelection.map(t => t.id).sort().join(',');
            
            if (tankIds === lastTankIds && lastTankSelection.length > 0) {
                // Rotate to next tank
                tankRotationIndex = (tankRotationIndex + 1) % allTanks.length;
            } else {
                // New selection, start from random tank
                tankRotationIndex = Math.floor(Math.random() * allTanks.length);
            }
            
            // Keep all tanks selected, but center camera on the rotated tank
            selectedUnits = allTanks;
            centerCameraOnPosition(allTanks[tankRotationIndex].x, allTanks[tankRotationIndex].y);
            lastTankSelection = allTanks;
        } else {
            // First press: select all tanks
            selectedUnits = allTanks;
            tankRotationIndex = 0;
            lastTankSelection = allTanks;
        }
        
        // Switch to page 5 (tank menu) in the UI system
        if (uiSystem) {
            uiSystem.switchToPage(5);
            updateTankSiegeButtonState();
        }
        
        lastHotkeyPressed = '5';
        lastHotkeyTime = now;
        return; // Don't let UI system handle this
    }

    // If it's a UI hotkey, let the UI system handle it
    if (uiSystem && uiKeys.includes(key)) {
        // The UI system will handle these keys
        return;
    }

    // Handle game-specific keys
    const upperKey = key.toUpperCase();

    // Handle Escape key first (cancel building placement, nuke placement, or A-move)
    if (upperKey === 'ESCAPE') {
        if (nukePlacementMode) {
            // Cancel nuke placement
            nukePlacementMode = false;
            return;
        }

        if (buildingPlacementMode) {
            // Cancel building placement
            buildingPlacementMode = false;
            buildingTypeToPlace = null;
            buildingWorkers = [];

            return;
        }

        if (isAMoveMode) {
            isAMoveMode = false;

            return;
        }
    }

    // Hotkey 1: Select all player-owned marines
    if (key === '1') {
        const now = Date.now();
        const isDoubleClick = (lastHotkeyPressed === '1' && (now - lastHotkeyTime) < DOUBLE_CLICK_WINDOW);
        
        selectAllUnitsOfType(['marine', 'reaper', 'marauder', 'ghost'], currentPlayerId, isDoubleClick);
        
        lastHotkeyPressed = '1';
        lastHotkeyTime = now;
    }
    // Hotkey 2: Select all player-owned bunkers
    else if (key === '2') {
        const now = Date.now();
        const isDoubleClick = (lastHotkeyPressed === '2' && (now - lastHotkeyTime) < DOUBLE_CLICK_WINDOW);
        
        selectAllUnitsOfType('bunker', currentPlayerId, isDoubleClick);
        
        lastHotkeyPressed = '2';
        lastHotkeyTime = now;
    }
    // Hotkey 3: Select all player-owned workers and show build menu
    else if (key === '3') {
        const now = Date.now();
        const isDoubleClick = (lastHotkeyPressed === '3' && (now - lastHotkeyTime) < DOUBLE_CLICK_WINDOW);
        
        selectAllUnitsOfType('worker', currentPlayerId, isDoubleClick);
        
        // Switch to page 3 (build menu) in the UI system
        if (uiSystem) {
            uiSystem.switchToPage(3);
        }
        
        lastHotkeyPressed = '3';
        lastHotkeyTime = now;
    }
    else if (upperKey === 'A') {
        const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank'];
        if (selectedUnits.some(unit => commandableUnitTypes.includes(unit.type) && unit.playerId === currentPlayerId)) {
             isAMoveMode = true;
        }
    } else if (upperKey >= '7' && upperKey <= '8') {
         switchPlayer(parseInt(upperKey));
    } else if (upperKey === '.') {
        // Cycle player for dev purposes
        const nextPlayerId = (currentPlayerId % 8) + 1;
        switchPlayer(nextPlayerId);
    }

    // Toggle performance monitor with comma key
    if (key === ',') {
        togglePerformanceMonitor();
    }

    // Toggle player controls with period key
    if (key === '.') {
        togglePlayerControls();
    }
    
    // Test ring calculation with M key
    if (key === 'm') {

        for (let tileY = 0; tileY < TILE_COUNT; tileY++) {
            let row = '';
            for (let tileX = 0; tileX < TILE_COUNT; tileX++) {
                const worldX = tileX * TILE_WIDTH + TILE_WIDTH / 2;
                const worldY = tileY * TILE_HEIGHT + TILE_HEIGHT / 2;
                const ring = getTileRing(worldX, worldY);
                row += ring + ' ';
            }

        }

    }

    // Remove supply cap with forward slash key
    if (key === '/') {
        // Set a very high supply cap for all players
        Object.keys(players).forEach(id => {
            players[id].supplyCap = 999999;

        });

        // Update the display
        updateResourceSupplyDisplay();

        // Show a notification

    }
}

// Function to select all units of a specific type owned by a player
function selectAllUnitsOfType(unitType, playerId, shouldCenterCamera = false) {
    // Clear current selection
    selectedUnits = [];
    const typesToSelect = Array.isArray(unitType) ? unitType : [unitType];

    // Find all units of the specified type owned by the player
    gameObjects.forEach(obj => {
        if (typesToSelect.includes(obj.type) && obj.playerId === playerId && obj.health > 0) {
            selectedUnits.push(obj);
        }
    });



    // Center viewport on the selected units only if requested (double-click)
    if (shouldCenterCamera && selectedUnits.length > 0) {
        const centerOfMass = calculateUnitsCenterOfMass(selectedUnits);
        if (centerOfMass) {
            centerCameraOnPosition(centerOfMass.x, centerOfMass.y);
        }
    }

    // Ensure the UI shows the appropriate page when units are selected via hotkey
    // Workers override other units and show page 3 (buildings menu)
    if (uiSystem) {
        if (selectedUnits.some(obj => obj.type === 'worker' && obj.playerId === currentPlayerId)) {
            uiSystem.switchToPage(3); // Workers show building menu
        } else if (selectedUnits.some(obj => ['unit', 'marine', 'reaper', 'marauder', 'ghost'].includes(obj.type))) {
            uiSystem.switchToPage(1); // Other units show unit command page
        } else if (selectedUnits.some(obj => obj.type === 'tank' && obj.playerId === currentPlayerId)) {
            uiSystem.switchToPage(5); // Tanks show tank command page
            updateTankSiegeButtonState();
        }
    }
}

// Function to update tank siege button visual state
function updateTankSiegeButtonState() {
    if (!uiSystem) return;
    
    const tanks = selectedUnits.filter(u => u.type === 'tank' && u.playerId === currentPlayerId);
    if (tanks.length === 0) {
        uiSystem.updateButtonState('action-q-p5', false);
        return;
    }
    
    // Check if all selected tanks are sieged
    const allSieged = tanks.every(t => t.isSieged);
    uiSystem.updateButtonState('action-q-p5', allSieged);
}

// Function to calculate the center of mass of the selected units
// Uses density-based clustering to focus on main army group, not stragglers
function calculateUnitsCenterOfMass(units) {
    if (units.length === 0) {
        return null;
    }

    if (units.length === 1) {
        return { x: units[0].x, y: units[0].y };
    }

    // Define density search radius
    const densityRadius = 250; // Units within this radius are considered neighbors
    const minClusterSize = Math.max(2, Math.floor(units.length * 0.25)); // At least 25% or 2 units

    // Calculate density for each unit (count of neighbors within radius)
    const unitDensities = units.map(unit => {
        const neighbors = units.filter(other => {
            if (other === unit) return true; // Include the unit itself
            const distance = Math.hypot(other.x - unit.x, other.y - unit.y);
            return distance <= densityRadius;
        });
        
        return {
            unit: unit,
            neighbors: neighbors,
            density: neighbors.length
        };
    });

    // Find the unit with highest density (most neighbors)
    const highestDensity = unitDensities.reduce((max, current) => 
        current.density > max.density ? current : max
    );

    // If the densest area has enough units to be considered a main cluster
    if (highestDensity.density >= minClusterSize) {
        // Calculate center of mass of the densest cluster
        let clusterX = 0;
        let clusterY = 0;
        
        highestDensity.neighbors.forEach(unit => {
            clusterX += unit.x;
            clusterY += unit.y;
        });


        
        return {
            x: clusterX / highestDensity.neighbors.length,
            y: clusterY / highestDensity.neighbors.length
        };
    } else {
        // Fall back to simple average if no significant cluster found
        let totalX = 0;
        let totalY = 0;
        units.forEach(unit => {
            totalX += unit.x;
            totalY += unit.y;
        });
        

        return {
            x: totalX / units.length,
            y: totalY / units.length
        };
    }
}

// Function to center the camera on a world position
function centerCameraOnPosition(worldX, worldY) {
    // Center the camera on the target position
    camera.x = worldX - canvas.width / 2;
    camera.y = worldY - canvas.height / 2;

    // Constrain camera to visual map boundaries (extended area)
    camera.x = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(camera.x, MAP_WIDTH + VISUAL_BOUNDARY_EXTENSION - canvas.width));
    camera.y = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(camera.y, MAP_HEIGHT + VISUAL_BOUNDARY_EXTENSION - canvas.height));


}

// Track current mouse position for edge scrolling (start centered to avoid drift)
let mousePos = { x: canvas.width / 2, y: canvas.height / 2 };

function updateEdgeScrolling() {
    if (isGamePaused) {
        camera.velX = 0;
        camera.velY = 0;
        return;
    }

    const margin = EDGE_SCROLL_MARGIN;
    const speed = CAMERA_SPEED;

    // Reset velocities to zero by default (strict stop when not at edge)
    camera.velX = 0;
    camera.velY = 0;

    // Left edge
    if (mousePos.x < margin) {
        camera.velX = -speed;
    }
    // Right edge
    else if (mousePos.x > canvas.width - margin) {
        camera.velX = speed;
    }

    // Top edge
    if (mousePos.y < margin) {
        camera.velY = -speed;
    }
    // Bottom edge
    else if (mousePos.y > canvas.height - margin) {
        camera.velY = speed;
    }

    // Update camera position
    camera.update();
}

function getMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Update the stored mouse position for edge scrolling
    mousePos = { x: screenX, y: screenY };

    // Convert to world coordinates
    return screenToWorld(screenX, screenY);
}

canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);

function handleMouseDown(event) {
    if (isGamePaused) return;

    // Don't start dragging if we're in building placement mode or nuke placement mode
    if (buildingPlacementMode || nukePlacementMode || turretPlacementMode || workerPlacementMode) {
        return; // Skip selection box when placing buildings or nukes or turrets or workers
    }

    if (event.button === 0 && !isAMoveMode) {
        isDragging = true;
        const mousePos = getMousePos(event);
        dragStartX = mousePos.x;
        dragStartY = mousePos.y;
        dragEndX = dragStartX;
        dragEndY = dragStartY;
        // Deselect on mousedown BEFORE checking click/drag type in mouseup
        selectedUnits = [];
    }
}

function handleMouseMove(event) {
    if (isGamePaused) return;

    // Always update mouse position for edge scrolling
    const mousePos = getMousePos(event);

    // Update drag end position only if we're currently dragging
    if (isDragging) {
        dragEndX = mousePos.x;
        dragEndY = mousePos.y;
    }

    // Update nuke placement position (free positioning, no snapping)
    if (nukePlacementMode) {
        // Use mouse position directly (no grid snapping)
        nukePlacementX = mousePos.x;
        nukePlacementY = mousePos.y;
    }
    
    // Update turret placement position
    if (turretPlacementMode && turretPlacementWorker) {
        turretPlacementX = mousePos.x;
        turretPlacementY = mousePos.y;
    }
    
    // Update worker placement position
    if (workerPlacementMode) {
        workerPlacementX = mousePos.x;
        workerPlacementY = mousePos.y;
    }

    // Update building placement position (now handled in drawSelectionRect)
    // Grid snapping and validation is done in the drawing function
}

function handleMouseUp(event) {
    if (isGamePaused) return;

    const mousePos = getMousePos(event);

    // Nuke Placement
    if (event.button === 0 && nukePlacementMode) {
        executeNuke(nukePlacementX, nukePlacementY);
        // Exit nuke placement mode
        nukePlacementMode = false;
        return;
    }
    
    // Turret Placement
    if (event.button === 0 && turretPlacementMode && turretPlacementWorker) {
        executeTurretPlacement(turretPlacementX, turretPlacementY, turretPlacementWorker);
        // Exit turret placement mode
        turretPlacementMode = false;
        turretPlacementWorker = null;
        return;
    }
    
    // Worker Placement
    if (event.button === 0 && workerPlacementMode) {
        executeWorkerPlacement(workerPlacementX, workerPlacementY);
        // Exit worker placement mode
        workerPlacementMode = false;
        return;
    }

    // Building Placement
    if (event.button === 0 && buildingPlacementMode && buildingTypeToPlace) {
        // Check if placement is valid
        if (isValidPlacement && buildingWorkers.length > 0) {
            // Get the first worker to start building
            const firstWorker = buildingWorkers[0];

            // Start building at the grid-aligned placement position
            // Pass both the world position and grid coordinates
            if (firstWorker.build(buildingTypeToPlace, buildingPlacementX, buildingPlacementY, buildingPlacementGridX, buildingPlacementGridY)) {
                // Store the building reference from the first worker
                const buildingRef = firstWorker.buildingUnderConstruction;

                // If successful, assign additional workers to help build
                for (let i = 1; i < buildingWorkers.length; i++) {
                    // Build but also share the same building reference
                    buildingWorkers[i].build(buildingTypeToPlace, buildingPlacementX, buildingPlacementY, buildingPlacementGridX, buildingPlacementGridY);
                    buildingWorkers[i].buildingUnderConstruction = buildingRef;
                }

                // For tanks, keep building placement mode active to allow multiple builds
                // For other buildings, exit building placement mode
                if (buildingTypeToPlace !== 'tank') {
                    buildingPlacementMode = false;
                    buildingTypeToPlace = null;
                    buildingWorkers = [];
                } else {
                    // Keep placement mode active for tanks, but use next available worker for next placement
                    // Remove only the workers that are now building from the available list
                    const workersStillAvailable = buildingWorkers.filter(w => w.commandState !== 'building');
                    
                    // Update buildingWorkers to only include available workers
                    buildingWorkers = workersStillAvailable;
                    
                    // If no workers left, exit placement mode
                    if (buildingWorkers.length === 0) {
                        buildingPlacementMode = false;
                        buildingTypeToPlace = null;
                    } else {
                        // Keep placement mode active - user can place another tank with remaining workers
                        // Note: buildingTypeToPlace and buildingPlacementMode remain set
                    }
                }
            }
        } else {
            // Invalid placement - provide feedback (could add a sound or visual effect here)
        }
        return;
    }

    // A-Move Command
    if (event.button === 0 && isAMoveMode) {
        const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank'];
        const commandableUnits = selectedUnits.filter(obj => commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId);
        if (commandableUnits.length > 0) {

            commandableUnits.forEach(unit => unit.attackMoveTo(mousePos.x, mousePos.y));
            // Clear existing markers before adding new one
            movementMarkers.length = 0;
            // Add an A-Move marker
            movementMarkers.push({
                x: mousePos.x,
                y: mousePos.y,
                timestamp: performance.now(),
                playerId: currentPlayerId, // Still useful for context, though color is fixed
                isAttackMove: true // Flag this marker type
            });
        }
        isAMoveMode = false;
        isDragging = false;
        return;
    }
    if (event.button === 0 && isDragging) {
        isDragging = false;
        const dragDistance = Math.hypot(dragEndX - dragStartX, dragEndY - dragStartY);
        let objectsInSelection = [];
        if (dragDistance < CLICK_DRAG_THRESHOLD) { // Click Selection
            let clickedObject = null;
            for (let i = gameObjects.length - 1; i >= 0; i--) {
                const obj = gameObjects[i];
                if (obj.health > 0 && obj.isUnderPoint(mousePos.x, mousePos.y)) {
                    // Prioritize selecting own units/bunkers for the current player
                    if (obj.playerId === currentPlayerId) { clickedObject = obj; break; }
                }
            }
            if (clickedObject) objectsInSelection.push(clickedObject);
        } else { // Drag Selection
            const rect = { x: Math.min(dragStartX, dragEndX), y: Math.min(dragStartY, dragEndY),
                         width: Math.abs(dragEndX - dragStartX), height: Math.abs(dragEndY - dragStartY) };
            gameObjects.forEach(obj => {
                if (obj.health > 0 && obj.playerId === currentPlayerId && isUnitInRect(obj, rect)) {
                    objectsInSelection.push(obj);
                }
            });
        }
        selectedUnits = objectsInSelection.filter(obj => obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'bunker');
    }
    if (isAMoveMode && event.button !== 0) isAMoveMode = false;

    // Auto-switch UI to the appropriate page when units are selected
    // Workers override other units and show page 3 (buildings menu)
    if (uiSystem) {
        if (selectedUnits.some(obj => obj.type === 'worker' && obj.playerId === currentPlayerId)) {
            uiSystem.switchToPage(3); // Workers show building menu
        } else if (selectedUnits.some(obj => obj.type === 'tank' && obj.playerId === currentPlayerId)) {
            uiSystem.switchToPage(5); // Tanks show tank command page
            updateTankSiegeButtonState();
        } else if (selectedUnits.some(obj => ['unit', 'marine', 'reaper', 'marauder', 'ghost'].includes(obj.type))) {
            uiSystem.switchToPage(1); // Other units show unit command page
        }
    }
}

function handleRightClick(event) {
    event.preventDefault();
    isAMoveMode = false;

    // Cancel nuke placement on right-click (before other commands)
    if (nukePlacementMode) {
        nukePlacementMode = false;
        return; // Don't process any other commands
    }
    
    // Cancel turret placement on right-click
    if (turretPlacementMode) {
        turretPlacementMode = false;
        turretPlacementWorker = null;
        return; // Don't process any other commands
    }
    
    // Cancel worker placement on right-click
    if (workerPlacementMode) {
        workerPlacementMode = false;
        return; // Don't process any other commands
    }

    // Cancel building placement on right-click
    if (buildingPlacementMode) {
        buildingPlacementMode = false;
        buildingTypeToPlace = null;
        buildingWorkers = [];
        
        return;
    }

    const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank', 'worker'];
    const commandableUnits = selectedUnits.filter(obj => commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId);
    const selectedPlayerBunkers = selectedUnits.filter(obj => obj.type === 'bunker' && obj.playerId === currentPlayerId);

    if (commandableUnits.length === 0 && selectedPlayerBunkers.length === 0) return;

    const clickPos = getMousePos(event);
    let clickedTarget = null; // Enemy target

    // Find clickable objects at the cursor position
    let clickedBuildingUnderConstruction = null;
    let clickedRepairableBuilding = null; // For repair command

    // First pass: Check for buildings under construction (highest priority)
    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        if (obj.health > 0 && obj.isUnderPoint(clickPos.x, clickPos.y)) {
            if (obj.isUnderConstruction && obj.playerId === currentPlayerId) {
                clickedBuildingUnderConstruction = obj;
                break;
            }
        }
    }
    
    // Second pass: Check for repairable buildings/turrets (if no building under construction)
    if (!clickedBuildingUnderConstruction) {
        for (let i = gameObjects.length - 1; i >= 0; i--) {
            const obj = gameObjects[i];
            if (obj.health > 0 && obj.isUnderPoint(clickPos.x, clickPos.y)) {
                if ((obj.isBuilding || obj.type === 'turret') && 
                    obj.playerId === currentPlayerId && 
                    obj.health < obj.maxHealth &&
                    !obj.isUnderConstruction) {
                    clickedRepairableBuilding = obj;
                    break; // Found repairable building, stop searching
                }
            }
        }
    }
    
    // Check for bunker entry (if building capacity upgrade is purchased)
    let clickedBunker = null;
    if (!clickedBuildingUnderConstruction && !clickedRepairableBuilding) {
        for (let i = gameObjects.length - 1; i >= 0; i--) {
            const obj = gameObjects[i];
            if (obj.health > 0 && obj.isUnderPoint(clickPos.x, clickPos.y)) {
                if (obj.type === 'bunker' && obj.playerId === currentPlayerId && !obj.isUnderConstruction) {
                    const upgrades = playerUpgrades[currentPlayerId] || { buildingCapacity: 0 };
                    if (upgrades.buildingCapacity > 0) {
                        clickedBunker = obj;
                        break;
                    }
                }
            }
        }
    }

    // Third pass: Check for enemies (only if no building interactions)
    if (!clickedBuildingUnderConstruction && !clickedRepairableBuilding && !clickedBunker) {
        for (let i = gameObjects.length - 1; i >= 0; i--) {
            const obj = gameObjects[i];
            if (obj.health > 0 && obj.isUnderPoint(clickPos.x, clickPos.y)) {
                if (!areAllies(currentPlayerId, obj.playerId)) {
                    clickedTarget = obj;
                    break;
                }
            }
        }
    }

    let issuedMoveCommand = false;
    // Command units
    if (commandableUnits.length > 0) {
        // Check if clicking on a repairable building/turret with workers selected
        // This takes priority over other commands
        if (clickedRepairableBuilding) {
            const workers = commandableUnits.filter(unit => unit.type === 'worker');
            if (workers.length > 0) {
                // Command workers to repair this building/turret
                workers.forEach(worker => {
                    worker.commandState = 'repairing';
                    worker.repairTarget = clickedRepairableBuilding;
                    // Move to repair target
                    const repairRange = 50;
                    const dist = Math.hypot(worker.x - clickedRepairableBuilding.x, worker.y - clickedRepairableBuilding.y);
                    if (dist > repairRange) {
                        worker.targetX = clickedRepairableBuilding.x;
                        worker.targetY = clickedRepairableBuilding.y;
                        worker.commandState = 'moving';
                    }
                });
                return; // Don't process other commands
            }
        }
        
        // Check if any workers are currently building
        const buildingWorkers = commandableUnits.filter(unit => 
            unit.type === 'worker' && unit.commandState === 'building'
        );
        
        // If right-clicking elsewhere (not on building under construction), cancel building
        if (buildingWorkers.length > 0 && !clickedBuildingUnderConstruction) {
            buildingWorkers.forEach(worker => {
                const buildingRef = worker.cancelBuilding();
                // Optionally restart building if user wants (for now, just cancel)
                // worker.restartBuilding(buildingRef);
            });
            // After canceling, process normal move command
            commandableUnits.forEach(unit => {
                if (clickedTarget) {
                    unit.attackUnit(clickedTarget);
                } else {
                    unit.moveTo(clickPos.x, clickPos.y);
                    issuedMoveCommand = true;
                }
            });
            return;
        }
        
        // Check if we clicked on a bunker (for unit entry)
        if (clickedBunker) {
            const upgrades = playerUpgrades[currentPlayerId] || { buildingCapacity: 0 };
            const maxCapacity = upgrades.buildingCapacity * 4; // 4 units per level
            
            // Filter for units that can enter bunkers (not workers or tanks)
            const enterableUnits = commandableUnits.filter(unit => 
                (unit.type === 'marine' || unit.type === 'reaper' || unit.type === 'marauder' || unit.type === 'ghost') &&
                unit.playerId === currentPlayerId
            );
            
            if (enterableUnits.length > 0) {
                // Check if bunker has space
                const currentGarrisoned = clickedBunker.garrisonedUnits ? clickedBunker.garrisonedUnits.length : 0;
                const availableSpace = maxCapacity - currentGarrisoned;
                
                if (availableSpace > 0) {
                    // Enter units into bunker (up to capacity)
                    const unitsToEnter = enterableUnits.slice(0, availableSpace);
                    unitsToEnter.forEach(unit => {
                        // Move unit to bunker center
                        unit.targetX = clickedBunker.x;
                        unit.targetY = clickedBunker.y;
                        unit.commandState = 'moving';
                        unit.enteringBunker = clickedBunker;
                    });
                }
            }
            return; // Don't process other commands
        }
        
        // Check if we clicked on a building under construction
        if (clickedBuildingUnderConstruction) {
            // Filter for workers only
            const workers = commandableUnits.filter(unit => unit.type === 'worker');

            if (workers.length > 0) {
            // Determine build type from the clicked building (supports special construction footprints)
            let buildingType = clickedBuildingUnderConstruction.buildType || clickedBuildingUnderConstruction.type;

                workers.forEach((worker, index) => {
                    // If worker was already building this building, restart from nearest corner
                    if (worker.commandState === 'building' && 
                        worker.buildingUnderConstruction === clickedBuildingUnderConstruction) {
                        // Restart from nearest corner (game mechanic)
                        worker.restartBuilding(clickedBuildingUnderConstruction);
                    } else {
                        // New worker assignment - calculate corners and find nearest
                        const building = clickedBuildingUnderConstruction;
                        const buildingWidth = building.width || (building.gridWidth * GRID_CELL_WIDTH);
                        const buildingHeight = building.height || (building.gridHeight * GRID_CELL_HEIGHT);
                        const halfWidth = buildingWidth / 2;
                        const halfHeight = buildingHeight / 2;
                        
                        // Calculate the four corners of the building
                        const buildCorners = [
                            { x: building.x - halfWidth, y: building.y - halfHeight }, // Top-left
                            { x: building.x + halfWidth, y: building.y - halfHeight }, // Top-right
                            { x: building.x + halfWidth, y: building.y + halfHeight }, // Bottom-right
                            { x: building.x - halfWidth, y: building.y + halfHeight }  // Bottom-left
                        ];
                        
                        // Find the nearest available corner to the worker's current position
                        const nearestCornerInfo = worker.findNearestAvailableCorner(
                            worker.x,
                            worker.y,
                            buildCorners,
                            building
                        );
                        
                        // Set up the worker to continue construction
                        worker.commandState = 'building';
                        worker.buildType = buildingType;
                        worker.buildTarget = { x: building.x, y: building.y };
                        worker.buildCorners = buildCorners;
                        
                        if (nearestCornerInfo) {
                            worker.currentCornerIndex = nearestCornerInfo.index;
                            worker.targetX = nearestCornerInfo.corner.x;
                            worker.targetY = nearestCornerInfo.corner.y;
                        } else {
                            // Fallback: if no corners are available, use building center
                            worker.currentCornerIndex = -1;
                            worker.targetX = building.x;
                            worker.targetY = building.y;
                        }
                        
                        worker.buildProgress = building.constructionProgress || 0;
                        worker.buildingUnderConstruction = building;
                    }
                });
            } else {
                // Non-workers just move to the building
                commandableUnits.forEach(unit => {
                    unit.moveTo(clickPos.x, clickPos.y);
                    issuedMoveCommand = true;
                });
            }
        } else {
            // Normal command handling
            commandableUnits.forEach(unit => {
                if (clickedTarget) {
                    unit.attackUnit(clickedTarget);
                } else {
                    // Check if unit is in patrol mode and shift is held
                    if (unit.commandState === 'patrol' && event.shiftKey) {
                        // Add patrol point
                        if (!unit.patrolPoints) {
                            unit.patrolPoints = [];
                        }
                        unit.patrolPoints.push({ x: clickPos.x, y: clickPos.y });
                        // Update target to new patrol point
                        unit.currentPatrolIndex = unit.patrolPoints.length - 1;
                        unit.targetX = clickPos.x;
                        unit.targetY = clickPos.y;
                    } else if (unit.commandState === 'patrol' && !event.shiftKey) {
                        // Set first patrol point and start patrolling
                        unit.patrolPoints = [{ x: unit.x, y: unit.y }, { x: clickPos.x, y: clickPos.y }];
                        unit.currentPatrolIndex = 0;
                        unit.targetX = unit.patrolPoints[0].x;
                        unit.targetY = unit.patrolPoints[0].y;
                    } else {
                        unit.moveTo(clickPos.x, clickPos.y);
                        issuedMoveCommand = true;
                    }
                }
            });
        }
    }

    // Command bunkers (set rally point)
    if (selectedPlayerBunkers.length > 0) {
        if (!clickedTarget) { // Only set rally on ground click
             
             selectedPlayerBunkers.forEach(bunker => {
                 bunker.rallyPoint = { x: clickPos.x, y: clickPos.y };
             });
             issuedMoveCommand = false; // No move marker for rally set
        }
    }

    if (issuedMoveCommand) {
        // Clear existing markers before adding new one
        movementMarkers.length = 0;
        // Add a regular move marker (no isAttackMove flag)
        movementMarkers.push({
            x: clickPos.x,
            y: clickPos.y,
            timestamp: performance.now(),
            playerId: currentPlayerId
        });
    }
}

// --- Helper Functions ---
function areAllies(playerIdA, playerIdB) {
    if (playerIdA === NEUTRAL_PLAYER_ID || playerIdB === NEUTRAL_PLAYER_ID) return true; // Neutral is friendly to all
    if (playerIdA === playerIdB) return true; // Same player
    return players[playerIdA]?.team === players[playerIdB]?.team; // Same team
}

function findNearestEnemyInRange(unit, range, allGameObjects) {
    // Check if this unit is valid
    if (!unit || unit.health <= 0) return null;

    let nearestEnemy = null;
    let nearestDistance = Infinity;

    allGameObjects.forEach(obj => {
        // Skip self, allies, neutral structures, or dead objects
        if (obj === unit || obj.health <= 0 || obj.isNeutralStructure || areAllies(unit.playerId, obj.playerId)) return;

        const distance = Math.hypot(obj.x - unit.x, obj.y - unit.y);
        // Check if within range and closer than current nearest
        if (distance <= range && distance < nearestDistance) {
            nearestEnemy = obj;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

function isUnitInRect(unit, rect) {
    const halfSize = unit.size / 2;
    const unitLeft = unit.x - halfSize;
    const unitRight = unit.x + halfSize;
    const unitTop = unit.y - halfSize;
    const unitBottom = unit.y + halfSize;
    const rectLeft = rect.x;
    const rectRight = rect.x + rect.width;
    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;
    return (unitLeft < rectRight && unitRight > rectLeft && unitTop < rectBottom && unitBottom > rectTop);
}

function checkUnitCollision(objA, objB) {
    // Skip collision check if either object is dead
    if (objA === objB || objA.health <= 0 || objB.health <= 0) return false;

    // Allow workers to overlap with buildings under construction
    if ((objA.type === 'worker' && objB.isUnderConstruction) ||
        (objB.type === 'worker' && objA.isUnderConstruction)) {
        return false;
    }
    
    // Units should not collide with the bunker they are spawning from
    if ((objA.type === 'bunker' && objB.commandState === 'spawning') ||
        (objB.type === 'bunker' && objA.commandState === 'spawning')) {
        if (objA.id === objB.spawnerId || objB.id === objA.spawnerId) {
            return false;
        }
    }

    const halfSizeA = objA.size / 2;
    const leftA = objA.x - halfSizeA;
    const rightA = objA.x + halfSizeA;
    const topA = objA.y - halfSizeA;
    const bottomA = objA.y + halfSizeA;
    const halfSizeB = objB.size / 2;
    const leftB = objB.x - halfSizeB;
    const rightB = objB.x + halfSizeB;
    const topB = objB.y - halfSizeB;
    const bottomB = objB.y + halfSizeB;
    return (leftA < rightB && rightA > leftB && topA < bottomB && bottomA > topB);
}

// --- Collision Resolution ---
function resolveUnitCollisions(allGameObjects) {
    const PUSH_FACTOR = 0.5;
    const BUNKER_PUSH_FACTOR = 0.1;
    for (let i = 0; i < allGameObjects.length; i++) {
        for (let j = i + 1; j < allGameObjects.length; j++) {
            const objA = allGameObjects[i];
            const objB = allGameObjects[j];
            if (objA.health <= 0 || objB.health <= 0 || (objA.type === 'bunker' && objB.type === 'bunker')) continue;
            if (checkUnitCollision(objA, objB)) {
                 const dx = objB.x - objA.x;
                 const dy = objB.y - objA.y;
                 let distance = Math.hypot(dx, dy);
                 if (distance === 0) {
                     distance = 0.1;
                    if (objA.type === 'unit' || objA.type === 'marine' || objA.type === 'worker' || objA.type === 'reaper' || objA.type === 'marauder' || objA.type === 'ghost' || objA.type === 'tank') { objA.x += (Math.random() - 0.5) * 0.2; objA.y += (Math.random() - 0.5) * 0.2; }
                    if (objB.type === 'unit' || objB.type === 'marine' || objB.type === 'worker' || objB.type === 'reaper' || objB.type === 'marauder' || objB.type === 'ghost' || objB.type === 'tank') { objB.x += (Math.random() - 0.5) * 0.2; objB.y += (Math.random() - 0.5) * 0.2; }
                 }
                 const overlap = (objA.size / 2 + objB.size / 2) - distance;
                 if (overlap > 0) {
                     const separationX = dx / distance;
                     const separationY = dy / distance;
                     let pushA = PUSH_FACTOR;
                     let pushB = PUSH_FACTOR;
                     if (objA.type === 'bunker') pushA = BUNKER_PUSH_FACTOR;
                     if (objB.type === 'bunker') pushB = BUNKER_PUSH_FACTOR;
                     const totalPush = overlap;
                     const massRatioA = pushB / (pushA + pushB);
                     const massRatioB = pushA / (pushA + pushB);
                     if (objA.type === 'unit' || objA.type === 'marine' || objA.type === 'worker' || objA.type === 'reaper' || objA.type === 'marauder' || objA.type === 'ghost' || objA.type === 'tank') { objA.x -= separationX * totalPush * massRatioA; objA.y -= separationY * totalPush * massRatioA; }
                     if (objB.type === 'unit' || objB.type === 'marine' || objB.type === 'worker' || objB.type === 'reaper' || objB.type === 'marauder' || objB.type === 'ghost' || objB.type === 'tank') { objB.x += separationX * totalPush * massRatioB; objB.y += separationY * totalPush * massRatioB; }
                 }
            }
        }
    }
}

// --- Drawing Functions ---
// Create a subtle texture pattern for the visual boundary area (cached for performance)
function createBoundaryTexture(ctx) {
    // Return cached pattern if it exists
    if (cachedBoundaryTexture) {
        return cachedBoundaryTexture;
    }
    
    // Create a small pattern canvas
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 32;
    patternCanvas.height = 32;
    const patternCtx = patternCanvas.getContext('2d');
    
    // Base color (slightly lighter than VISUAL_BOUNDARY_COLOR for texture)
    patternCtx.fillStyle = '#0D0E1C';
    patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
    
    // Add subtle diagonal lines for texture
    patternCtx.strokeStyle = 'rgba(77, 166, 255, 0.08)';
    patternCtx.lineWidth = 1;
    
    // Draw subtle diagonal grid pattern
    for (let i = -patternCanvas.width; i < patternCanvas.height + patternCanvas.width; i += 8) {
        patternCtx.beginPath();
        patternCtx.moveTo(i, 0);
        patternCtx.lineTo(i + patternCanvas.width, patternCanvas.height);
        patternCtx.stroke();
    }
    
    // Add some subtle dots for texture variation
    patternCtx.fillStyle = 'rgba(77, 166, 255, 0.05)';
    for (let x = 4; x < patternCanvas.width; x += 16) {
        for (let y = 4; y < patternCanvas.height; y += 16) {
            patternCtx.fillRect(x, y, 1, 1);
        }
    }
    
    // Create and cache the pattern
    cachedBoundaryTexture = ctx.createPattern(patternCanvas, 'repeat');
    return cachedBoundaryTexture;
}

function drawBackground(ctx) {
    // First, fill the entire visible area with the visual boundary color
    ctx.fillStyle = VISUAL_BOUNDARY_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add texture pattern to visual boundary area (extended area outside gameplay)
    const texturePattern = createBoundaryTexture(ctx);
    
    // Calculate the screen position of the gameplay area boundaries
    const gameplayAreaStart = worldToScreen(0, 0);
    const gameplayAreaEnd = worldToScreen(MAP_WIDTH, MAP_HEIGHT);
    const gameplayRect = {
        x: Math.round(gameplayAreaStart.x),
        y: Math.round(gameplayAreaStart.y),
        width: Math.round(gameplayAreaEnd.x - gameplayAreaStart.x),
        height: Math.round(gameplayAreaEnd.y - gameplayAreaStart.y)
    };

    // Draw texture pattern in the extended areas (outside gameplay boundary)
    ctx.save();
    ctx.fillStyle = texturePattern;
    
    // Top area
    if (gameplayRect.y > 0) {
        ctx.fillRect(0, 0, canvas.width, gameplayRect.y);
    }
    // Bottom area
    if (gameplayRect.y + gameplayRect.height < canvas.height) {
        ctx.fillRect(0, gameplayRect.y + gameplayRect.height, canvas.width, canvas.height - (gameplayRect.y + gameplayRect.height));
    }
    // Left area
    if (gameplayRect.x > 0) {
        ctx.fillRect(0, gameplayRect.y, gameplayRect.x, gameplayRect.height);
    }
    // Right area
    if (gameplayRect.x + gameplayRect.width < canvas.width) {
        ctx.fillRect(gameplayRect.x + gameplayRect.width, gameplayRect.y, canvas.width - (gameplayRect.x + gameplayRect.width), gameplayRect.height);
    }
    ctx.restore();

    // Calculate visible tile range based on camera position
    const startTileX = Math.floor(camera.x / TILE_WIDTH);
    const startTileY = Math.floor(camera.y / TILE_HEIGHT);
    const endTileX = Math.ceil((camera.x + canvas.width) / TILE_WIDTH);
    const endTileY = Math.ceil((camera.y + canvas.height) / TILE_HEIGHT);

    // Draw enhanced gameplay boundary with glow effect
    ctx.save();
    
    // Outer glow (softer, larger)
    ctx.strokeStyle = BOUNDARY_INDICATOR_GLOW;
    ctx.lineWidth = BOUNDARY_LINE_WIDTH + 4;
    ctx.strokeRect(
        gameplayRect.x,
        gameplayRect.y,
        gameplayRect.width,
        gameplayRect.height
    );
    
    // Main boundary line (brighter, thicker)
    ctx.strokeStyle = BOUNDARY_INDICATOR_COLOR;
    ctx.lineWidth = BOUNDARY_LINE_WIDTH;
    ctx.strokeRect(
        gameplayRect.x,
        gameplayRect.y,
        gameplayRect.width,
        gameplayRect.height
    );
    
    ctx.restore();

    // Clamp to valid tile range for the actual gameplay area
    const visibleStartX = Math.max(0, startTileX);
    const visibleStartY = Math.max(0, startTileY);
    const visibleEndX = Math.min(TILE_COUNT, endTileX);
    const visibleEndY = Math.min(TILE_COUNT, endTileY);

    // Only draw tiles that are visible
    for (let y = visibleStartY; y < visibleEndY; y++) {
        for (let x = visibleStartX; x < visibleEndX; x++) {
            // Determine which perimeter ring this tile belongs to
            const xRing = Math.min(x, TILE_COUNT - 1 - x);
            const yRing = Math.min(y, TILE_COUNT - 1 - y);
            const ring = Math.min(xRing, yRing);
            const colorIndex = Math.min(ring, PERIMETER_COLORS.length - 1);
            const tileColor = PERIMETER_COLORS[colorIndex];

            // World and screen positions
            const worldTileX = x * TILE_WIDTH;
            const worldTileY = y * TILE_HEIGHT;
            const rawScreenPos = worldToScreen(worldTileX, worldTileY);
            const sx = Math.round(rawScreenPos.x);
            const sy = Math.round(rawScreenPos.y);
            const roundedTileWidth = Math.round(TILE_WIDTH);
            const roundedTileHeight = Math.round(TILE_HEIGHT);

            // Base fill
            ctx.fillStyle = tileColor;
            ctx.fillRect(sx, sy, roundedTileWidth, roundedTileHeight);

            // Sub-grid for placement (aligned to building grid inside the tile)
            const innerGridScreenPos = worldToScreen(
                worldTileX + INNER_TILE_OFFSET_X,
                worldTileY + INNER_TILE_OFFSET_Y
            );
            const gx = Math.round(innerGridScreenPos.x);
            const gy = Math.round(innerGridScreenPos.y);
            const gridW = ADJUSTED_INNER_TILE_WIDTH;
            const gridH = ADJUSTED_INNER_TILE_HEIGHT;
            ctx.fillStyle = TILE_SUBGRID_COLOR;

            // Outer box around the sub-grid
            ctx.fillRect(gx, gy, gridW, TILE_SUBGRID_LINE_WIDTH); // top
            ctx.fillRect(gx, gy + gridH - TILE_SUBGRID_LINE_WIDTH, gridW, TILE_SUBGRID_LINE_WIDTH); // bottom
            ctx.fillRect(gx, gy, TILE_SUBGRID_LINE_WIDTH, gridH); // left
            ctx.fillRect(gx + gridW - TILE_SUBGRID_LINE_WIDTH, gy, TILE_SUBGRID_LINE_WIDTH, gridH); // right

            // Vertical lines (draw only internal lines, no overlap needed)
            for (let i = 1; i < GRID_CELLS_PER_TILE; i++) {
                const lineX = gx + GRID_CELL_WIDTH * i;
                ctx.fillRect(lineX, gy, TILE_SUBGRID_LINE_WIDTH, gridH);
            }
            // Horizontal lines
            for (let i = 1; i < GRID_CELLS_PER_TILE; i++) {
                const lineY = gy + GRID_CELL_HEIGHT * i;
                ctx.fillRect(gx, lineY, gridW, TILE_SUBGRID_LINE_WIDTH);
            }
        }
    }

    // Continuous grid lines (drawn once across visible tiles)
    const gridStartY = Math.round(visibleStartY * TILE_HEIGHT - camera.y);
    const gridHeight = Math.round((visibleEndY - visibleStartY) * TILE_HEIGHT);
    const gridStartX = Math.round(visibleStartX * TILE_WIDTH - camera.x);
    const gridWidth = Math.round((visibleEndX - visibleStartX) * TILE_WIDTH);

    ctx.fillStyle = TILE_GRID_LINE_COLOR;
    // Vertical lines
    for (let i = visibleStartX; i <= visibleEndX; i++) {
        const xLine = Math.round(i * TILE_WIDTH - camera.x);
        ctx.fillRect(xLine - Math.floor(TILE_GRID_LINE_WIDTH / 2), gridStartY, TILE_GRID_LINE_WIDTH, gridHeight);
    }
    // Horizontal lines
    for (let i = visibleStartY; i <= visibleEndY; i++) {
        const yLine = Math.round(i * TILE_HEIGHT - camera.y);
        ctx.fillRect(gridStartX, yLine - Math.floor(TILE_GRID_LINE_WIDTH / 2), gridWidth, TILE_GRID_LINE_WIDTH);
    }

    // Outer frame around gameplay area (same style as grid, thicker)
    const playStart = worldToScreen(0, 0);
    const playEnd = worldToScreen(MAP_WIDTH, MAP_HEIGHT);
    const frameX = Math.round(playStart.x);
    const frameY = Math.round(playStart.y);
    const frameW = Math.round(playEnd.x - playStart.x);
    const frameH = Math.round(playEnd.y - playStart.y);
    ctx.fillStyle = TILE_OUTER_FRAME_COLOR;
    const fw = TILE_OUTER_FRAME_WIDTH;
    // Top
    ctx.fillRect(frameX, frameY - Math.floor(fw / 2), frameW, fw);
    // Bottom
    ctx.fillRect(frameX, frameY + frameH - Math.ceil(fw / 2), frameW, fw);
    // Left
    ctx.fillRect(frameX - Math.floor(fw / 2), frameY, fw, frameH);
    // Right
    ctx.fillRect(frameX + frameW - Math.ceil(fw / 2), frameY, fw, frameH);

    // Vent ring around center 2x2 block
    const centerLayer = Math.floor(TILE_COUNT / 2) - 1;
    const ringStartWorldX = centerLayer * TILE_WIDTH;
    const ringStartWorldY = centerLayer * TILE_HEIGHT;
    const ringWorldW = TILE_WIDTH * 2;
    const ringWorldH = TILE_HEIGHT * 2;
    const ringScreenPos = worldToScreen(ringStartWorldX, ringStartWorldY);
    const baseRingX = Math.round(ringScreenPos.x);
    const baseRingY = Math.round(ringScreenPos.y);
    const baseRingW = Math.round(ringWorldW);
    const baseRingH = Math.round(ringWorldH);
    const inset = VENT_RING_INSET;
    const ringX = baseRingX + inset;
    const ringY = baseRingY + inset;
    const ringW = baseRingW - inset * 2;
    const ringH = baseRingH - inset * 2;

    if (ringW > 0 && ringH > 0) {
        ctx.fillStyle = VENT_RING_COLOR;
        const sq = VENT_SQUARE_SIZE;
        const rx = Math.round(ringX);
        const ry = Math.round(ringY);
        const rW = Math.round(ringW);
        const rH = Math.round(ringH);

        // Fill tiles along each edge at square-sized steps (touching, no gaps)
        const topCount = Math.ceil(rW / sq);
        for (let i = 0; i < topCount; i++) {
            const x = rx + i * sq;
            ctx.fillRect(x, ry, sq, sq);
            ctx.fillRect(x, ry + rH - sq, sq, sq); // bottom
        }

        const sideCount = Math.ceil(rH / sq);
        // Skip corners to avoid double-drawing; top/bottom already placed them
        for (let i = 1; i < sideCount - 1; i++) {
            const y = ry + i * sq;
            ctx.fillRect(rx, y, sq, sq);
            ctx.fillRect(rx + rW - sq, y, sq, sq); // right
        }

        // Shared border lines for vents (avoids double-thick corners)
        ctx.strokeStyle = VENT_RING_BORDER_COLOR || VENT_RING_COLOR;
        ctx.lineWidth = VENT_RING_BORDER_WIDTH || 1;

        // Top strip grid lines
        for (let i = 0; i <= topCount; i++) {
            const x = rx + i * sq;
            ctx.beginPath();
            ctx.moveTo(x, ry);
            ctx.lineTo(x, ry + sq);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + rW, ry);
        ctx.moveTo(rx, ry + sq);
        ctx.lineTo(rx + rW, ry + sq);
        ctx.stroke();

        // Bottom strip grid lines
        for (let i = 0; i <= topCount; i++) {
            const x = rx + i * sq;
            ctx.beginPath();
            ctx.moveTo(x, ry + rH - sq);
            ctx.lineTo(x, ry + rH);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(rx, ry + rH - sq);
        ctx.lineTo(rx + rW, ry + rH - sq);
        ctx.moveTo(rx, ry + rH);
        ctx.lineTo(rx + rW, ry + rH);
        ctx.stroke();

        // Left strip grid lines
        for (let i = 0; i <= sideCount; i++) {
            const y = ry + i * sq;
            ctx.beginPath();
            ctx.moveTo(rx, y);
            ctx.lineTo(rx + sq, y);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx, ry + rH);
        ctx.moveTo(rx + sq, ry);
        ctx.lineTo(rx + sq, ry + rH);
        ctx.stroke();

        // Right strip grid lines
        for (let i = 0; i <= sideCount; i++) {
            const y = ry + i * sq;
            ctx.beginPath();
            ctx.moveTo(rx + rW - sq, y);
            ctx.lineTo(rx + rW, y);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(rx + rW - sq, ry);
        ctx.lineTo(rx + rW - sq, ry + rH);
        ctx.moveTo(rx + rW, ry);
        ctx.lineTo(rx + rW, ry + rH);
        ctx.stroke();
    }
}

function drawSelectionRect(ctx) {
    // Draw selection rectangle if dragging
    if (isDragging && !isAMoveMode) {
        // Convert world drag coordinates to screen coordinates
        const startScreen = worldToScreen(dragStartX, dragStartY);
        const endScreen = worldToScreen(dragEndX, dragEndY);

        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            startScreen.x,
            startScreen.y,
            endScreen.x - startScreen.x,
            endScreen.y - startScreen.y
        );
        ctx.setLineDash([]);
    }

    // Draw building placement preview
    if (buildingPlacementMode && buildingTypeToPlace) {
        const placementPos = worldToScreen(buildingPlacementX, buildingPlacementY);
        let size = 60; // Default size

        // Adjust size based on building type and grid cells
        if (buildingTypeToPlace === 'bunker') {
            size = GRID_CELL_WIDTH * 3; // 3x3 grid cells
        } else if (buildingTypeToPlace === 'supplyDepot') {
            // For supplyDepot, we need to handle width and height separately
            // This preview is just a placeholder, the actual drawing is done in the grid-based preview
            size = GRID_CELL_WIDTH * 3; // Width is 3 grid cells
            // Note: Height (2 grid cells) is handled in the grid-based preview
        } else if (buildingTypeToPlace === 'shieldTower') {
            size = GRID_CELL_WIDTH * 1; // 1x1 grid cells
        } else if (buildingTypeToPlace === 'sensorTower') {
            size = GRID_CELL_WIDTH * 1; // 1x1 grid cells
        } else if (buildingTypeToPlace === 'tank') {
            size = GRID_CELL_WIDTH * 4; // 4x4 grid cells (placement footprint)
        }

        const halfSize = size / 2;

        // Draw placement shadow
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(placementPos.x - halfSize, placementPos.y - halfSize, size, size);

        // Draw placement border
        ctx.strokeStyle = players[currentPlayerId].color;
        ctx.lineWidth = 2;
        ctx.strokeRect(placementPos.x - halfSize, placementPos.y - halfSize, size, size);

        // Draw building type text
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(buildingTypeToPlace, placementPos.x, placementPos.y);

        // Draw cost
        const cost = BUILDING_COSTS[buildingTypeToPlace];
        ctx.fillStyle = '#4DA6FF'; // Blue color for cost
        ctx.fillText(cost.toString(), placementPos.x, placementPos.y + 20);

        // Reset context properties
        ctx.setLineDash([]);
        ctx.textAlign = 'left';
    }
}

function drawRippleEffect(ctx, now, screenX, screenY, progress, color, startRadius, ringCount, lineWidth) {
    // Make alpha fade slower (e.g., 1.0 down to 0.3)
    const baseAlpha = Math.max(0, 0.3 + 0.7 * (1.0 - progress));

    if (baseAlpha <= 0) return;

    ctx.lineWidth = lineWidth; // Apply line width
    const originalDash = ctx.getLineDash();
    const originalOffset = ctx.lineDashOffset;

    const dashOffset = -(now * RIPPLE_ROTATION_SPEED) % (RIPPLE_DASH_PATTERN[0] + RIPPLE_DASH_PATTERN[1]);
    ctx.setLineDash(RIPPLE_DASH_PATTERN);
    ctx.lineDashOffset = dashOffset;

    for (let i = 0; i < ringCount; i++) {
        const ringStartProgress = i * RIPPLE_RING_DELAY_FACTOR;
        if (progress < ringStartProgress) continue;
        const ringEffectiveDuration = 1.0 - ringStartProgress;
        if (ringEffectiveDuration <= 0) continue;
        const ringEffectiveProgress = Math.min(1.0, (progress - ringStartProgress) / ringEffectiveDuration);
        const currentRadius = startRadius * (1.0 - ringEffectiveProgress);

        // Use the modified baseAlpha directly, no per-ring alpha fade needed
        const finalAlpha = baseAlpha;
        if (currentRadius <= 0 || finalAlpha <= 0) continue;

        // Get player color and apply final alpha
        let rgbaColor = color;
        if (color.startsWith('hsl')) {
            rgbaColor = color.replace(')', `, ${finalAlpha.toFixed(3)})`).replace('hsl', 'hsla');
        } else {
            rgbaColor = `rgba(200, 200, 200, ${finalAlpha.toFixed(3)})`; // Fallback for now
        }

        // --- Draw the hollow, dotted SQUARE ---
        ctx.strokeStyle = rgbaColor;
        // Calculate square properties based on radius
        const sideLength = currentRadius * 2;
        const topLeftX = screenX - currentRadius;
        const topLeftY = screenY - currentRadius;
        // Draw the square instead of arc
        ctx.strokeRect(topLeftX, topLeftY, sideLength, sideLength);
    }

    // Restore original dash settings
    ctx.setLineDash(originalDash);
    ctx.lineDashOffset = originalOffset;
}

function drawMovementMarkers(ctx, now) {
    for (let i = movementMarkers.length - 1; i >= 0; i--) {
        const marker = movementMarkers[i];
        const elapsedTime = now - marker.timestamp;

        // Stay visible for 2 seconds or until new command
        const markerDuration = 2000;
        if (elapsedTime >= markerDuration) {
            movementMarkers.splice(i, 1);
            continue;
        }

        // Convert world position to screen position
        const screenPos = worldToScreen(marker.x, marker.y);

        // Skip if offscreen
        if (screenPos.x < -50 ||
            screenPos.x > canvas.width + 50 ||
            screenPos.y < -50 ||
            screenPos.y > canvas.height + 50) {
            continue;
        }

        const progress = elapsedTime / markerDuration;
        // Stay fully visible for first 1.5 seconds, then fade in last 0.5 seconds
        const alpha = progress < 0.75 ? 1 : Math.max(0, 1 - (progress - 0.75) * 4);
        const radius = 8 + (progress * 6); // Slower expand from 8 to 14px
        
        ctx.save();
        
        const isAttackMove = marker.isAttackMove === true;
        
        // Ultra-minimalist: just a clean circle
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        
        if (isAttackMove) {
            // Subtle red tint for attack-move
            ctx.strokeStyle = `rgba(255, 100, 100, ${alpha * 0.8})`;
        } else {
            // Clean white for move
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        }
        
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }
}

// Draw selection rectangle and building placement preview
function drawSelectionRect(context) {
    if (isDragging) {
        const startScreen = worldToScreen(dragStartX, dragStartY);
        const endScreen = worldToScreen(dragEndX, dragEndY);

        const x = Math.min(startScreen.x, endScreen.x);
        const y = Math.min(startScreen.y, endScreen.y);
        const width = Math.abs(endScreen.x - startScreen.x);
        const height = Math.abs(endScreen.y - startScreen.y);

        context.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        context.lineWidth = 2;
        context.strokeRect(x, y, width, height);
        context.fillStyle = 'rgba(0, 255, 0, 0.1)';
        context.fillRect(x, y, width, height);
    }

    // Draw building placement preview
    if (buildingPlacementMode && buildingTypeToPlace) {
        // Get mouse position in world coordinates
        const worldPos = screenToWorld(mousePos.x, mousePos.y);

        // Get building size in grid cells
        const buildingSize = BUILDING_GRID_SIZES[buildingTypeToPlace];
        const gridWidth = buildingSize.width;
        const gridHeight = buildingSize.height;

        // First, snap the cursor position to the nearest grid cell
        // This ensures consistent snapping regardless of angle or position
        const cursorGridPos = worldToGrid(worldPos.x, worldPos.y);
        
        // Calculate the offset in grid cells to center the building on the cursor
        // For odd-sized buildings (3x3, 1x1): offset by floor(size/2) cells
        // For even-sized buildings (3x2): offset by (size/2 - 0.5) cells, but we snap to nearest
        const offsetGridX = Math.floor(gridWidth / 2);
        const offsetGridY = Math.floor(gridHeight / 2);

        // Calculate the top-left corner grid position by subtracting the offset
        // This ensures the building is centered on the cursor's grid cell
        buildingGridX = cursorGridPos.gridX - offsetGridX;
        buildingGridY = cursorGridPos.gridY - offsetGridY;

        // Ensure grid coordinates are non-negative (safety check)
        // Negative coordinates would be caught by isValidBuildingPlacement, but this prevents issues
        if (buildingGridX < 0 || buildingGridY < 0) {
            isValidPlacement = false;
        } else {
            // Check if placement is valid
            isValidPlacement = isValidBuildingPlacement(buildingGridX, buildingGridY, buildingTypeToPlace);
        }

        // Calculate the top-left corner world position (center of the top-left grid cell)
        const topLeftWorldPos = gridToWorld(buildingGridX, buildingGridY);

        // Calculate the world width and height of the building
        const worldWidth = gridWidth * GRID_CELL_WIDTH;
        const worldHeight = gridHeight * GRID_CELL_HEIGHT;

        // Calculate the building center position
        // gridToWorld returns the center of the grid cell, so we need to:
        // 1. Get the top-left corner of the top-left cell: center - half cell
        // 2. Add half the building dimensions to get the building center
        buildingPlacementX = topLeftWorldPos.x - GRID_CELL_WIDTH / 2 + worldWidth / 2;
        buildingPlacementY = topLeftWorldPos.y - GRID_CELL_HEIGHT / 2 + worldHeight / 2;

        // Store the grid coordinates for reference
        buildingPlacementGridX = buildingGridX;
        buildingPlacementGridY = buildingGridY;

        // Draw the building grid (4x4 within the inner area of each tile)
        // Calculate visible tile range based on camera position
        const startTileX = Math.floor(camera.x / TILE_WIDTH);
        const startTileY = Math.floor(camera.y / TILE_HEIGHT);
        const endTileX = Math.ceil((camera.x + canvas.width) / TILE_WIDTH);
        const endTileY = Math.ceil((camera.y + canvas.height) / TILE_HEIGHT);

        // Clamp to valid tile range
        const visibleStartX = Math.max(0, startTileX);
        const visibleStartY = Math.max(0, startTileY);
        const visibleEndX = Math.min(TILE_COUNT, endTileX);
        const visibleEndY = Math.min(TILE_COUNT, endTileY);

        // Draw grid for each visible tile
        for (let tileY = visibleStartY; tileY < visibleEndY; tileY++) {
            for (let tileX = visibleStartX; tileX < visibleEndX; tileX++) {
                // Calculate the world coordinates of the inner area of this tile
                const innerAreaX = tileX * TILE_WIDTH + INNER_TILE_OFFSET_X;
                const innerAreaY = tileY * TILE_HEIGHT + INNER_TILE_OFFSET_Y;

                // Draw the inner area boundary only during building placement
                const innerAreaScreenPos = worldToScreen(innerAreaX, innerAreaY);
                context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                context.lineWidth = 1;
                context.strokeRect(
                    innerAreaScreenPos.x,
                    innerAreaScreenPos.y,
                    ADJUSTED_INNER_TILE_WIDTH,
                    ADJUSTED_INNER_TILE_HEIGHT
                );

                // Draw horizontal grid lines within the inner area
                for (let i = 0; i <= GRID_CELLS_PER_TILE; i++) {
                    const lineWorldY = innerAreaY + i * GRID_CELL_HEIGHT;
                    const lineScreenPos = worldToScreen(innerAreaX, lineWorldY);
                    const lineEndScreenPos = worldToScreen(innerAreaX + ADJUSTED_INNER_TILE_WIDTH, lineWorldY);

                    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    context.lineWidth = 1;
                    context.beginPath();
                    context.moveTo(lineScreenPos.x, lineScreenPos.y);
                    context.lineTo(lineEndScreenPos.x, lineEndScreenPos.y);
                    context.stroke();
                }

                // Draw vertical grid lines within the inner area
                for (let i = 0; i <= GRID_CELLS_PER_TILE; i++) {
                    const lineWorldX = innerAreaX + i * GRID_CELL_WIDTH;
                    const lineScreenPos = worldToScreen(lineWorldX, innerAreaY);
                    const lineEndScreenPos = worldToScreen(lineWorldX, innerAreaY + ADJUSTED_INNER_TILE_HEIGHT);

                    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    context.lineWidth = 1;
                    context.beginPath();
                    context.moveTo(lineScreenPos.x, lineScreenPos.y);
                    context.lineTo(lineScreenPos.x, lineEndScreenPos.y);
                    context.stroke();
                }
            }
        }

        // Only draw the building preview if placement is valid
        if (isValidPlacement) {
            // Draw the building footprint by highlighting individual grid cells (subtle)
            const footprintColor = 'rgba(255, 255, 255, 0.08)';

            // Draw each grid cell that would be occupied by the building
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    // Get the world position of this grid cell
                    const cellWorldPos = gridToWorld(buildingGridX + x, buildingGridY + y);
                    const cellScreenPos = worldToScreen(cellWorldPos.x, cellWorldPos.y);

                    // Draw the cell highlight
                    context.fillStyle = footprintColor;
                    context.fillRect(
                        cellScreenPos.x - GRID_CELL_WIDTH/2,
                        cellScreenPos.y - GRID_CELL_HEIGHT/2,
                        GRID_CELL_WIDTH,
                        GRID_CELL_HEIGHT
                    );

                    // Draw the building preview on top (more subtle fill)
                    context.globalAlpha = 0.15; // Much more subtle
                    context.fillStyle = players[currentPlayerId].color;
                    context.fillRect(
                        cellScreenPos.x - GRID_CELL_WIDTH/2,
                        cellScreenPos.y - GRID_CELL_HEIGHT/2,
                        GRID_CELL_WIDTH,
                        GRID_CELL_HEIGHT
                    );
                    context.globalAlpha = 1.0;

                    // Draw grid cell coordinates for debugging (optional)
                    if (false) { // Set to true to enable coordinate display
                        context.fillStyle = 'white';
                        context.font = '10px Arial';
                        context.textAlign = 'center';
                        context.fillText(
                            `${buildingGridX + x},${buildingGridY + y}`,
                            cellScreenPos.x,
                            cellScreenPos.y
                        );
                    }
                }
            }

            // Draw a border around the entire building footprint
            const topLeftCell = gridToWorld(buildingGridX, buildingGridY);
            const bottomRightCell = gridToWorld(buildingGridX + gridWidth - 1, buildingGridY + gridHeight - 1);

            const topLeftScreen = worldToScreen(
                topLeftCell.x - GRID_CELL_WIDTH/2,
                topLeftCell.y - GRID_CELL_HEIGHT/2
            );

            const fullWidth = gridWidth * GRID_CELL_WIDTH;
            const fullHeight = gridHeight * GRID_CELL_HEIGHT;

            // Get player color and create a more subtle, elegant border
            const playerColor = players[currentPlayerId].color;
            
            // Valid placement: subtle player color border with soft glow
            context.strokeStyle = playerColor;
            context.globalAlpha = 0.6;
            context.lineWidth = 2;
            context.strokeRect(
                topLeftScreen.x,
                topLeftScreen.y,
                fullWidth,
                fullHeight
            );
            
            // Add subtle inner glow
            context.strokeStyle = playerColor;
            context.globalAlpha = 0.3;
            context.lineWidth = 1;
            context.strokeRect(
                topLeftScreen.x + 1,
                topLeftScreen.y + 1,
                fullWidth - 2,
                fullHeight - 2
            );

            // Reset alpha
            context.globalAlpha = 1.0;
        }
    }

    // Draw nuke placement preview (square)
    if (nukePlacementMode) {
        const nukePos = worldToScreen(nukePlacementX, nukePlacementY);
        const nukeSize = TILE_WIDTH; // Square size matching a tile
        const halfSize = nukeSize / 2;
        const playerColor = players[currentPlayerId]?.color || 'rgba(255, 255, 255, 0.8)';

        // Draw preview square border (player color)
        context.strokeStyle = playerColor;
        context.lineWidth = 3;
        context.setLineDash([5, 5]);
        context.strokeRect(nukePos.x - halfSize, nukePos.y - halfSize, nukeSize, nukeSize);
        context.setLineDash([]);

        // Draw preview fill (semi-transparent player color)
        context.fillStyle = applyAlphaToColor(playerColor, 0.2);
        context.fillRect(nukePos.x - halfSize, nukePos.y - halfSize, nukeSize, nukeSize);

        // Draw center marker (player color)
        context.fillStyle = playerColor;
        context.fillRect(nukePos.x - 5, nukePos.y - 5, 10, 10);
    }
    
    // Draw worker placement preview (nuke-style)
    if (workerPlacementMode) {
        const workerPos = worldToScreen(workerPlacementX, workerPlacementY);
        const workerSize = 35; // Worker size
        const halfSize = workerSize / 2;
        const playerColor = players[currentPlayerId]?.color || 'rgba(255, 255, 255, 0.8)';
        
        // Draw preview square border (dotted line, player color)
        context.strokeStyle = playerColor;
        context.lineWidth = 3;
        context.setLineDash([5, 5]);
        context.strokeRect(workerPos.x - halfSize, workerPos.y - halfSize, workerSize, workerSize);
        context.setLineDash([]);
        
        // Draw preview fill (semi-transparent player color)
        context.fillStyle = applyAlphaToColor(playerColor, 0.2);
        context.fillRect(workerPos.x - halfSize, workerPos.y - halfSize, workerSize, workerSize);
        
        // Draw center marker (player color)
        context.fillStyle = playerColor;
        context.fillRect(workerPos.x - 5, workerPos.y - 5, 10, 10);
    }
    
    // Draw turret placement preview with throw range indicator
    if (turretPlacementMode && turretPlacementWorker) {
        const workerPos = worldToScreen(turretPlacementWorker.x, turretPlacementWorker.y);
        const turretPos = worldToScreen(turretPlacementX, turretPlacementY);
        const dist = Math.hypot(turretPlacementX - turretPlacementWorker.x, turretPlacementY - turretPlacementWorker.y);
        const isInRange = dist <= TURRET_THROW_RANGE;
        const playerColor = players[currentPlayerId]?.color || 'rgba(255, 255, 255, 0.8)';
        const previewColor = isInRange ? playerColor : 'rgba(255, 255, 255, 0.8)'; // White when out of range
        
        // Draw throw range circle around worker
        context.strokeStyle = applyAlphaToColor(previewColor, 0.6);
        context.lineWidth = 2;
        context.setLineDash([4, 4]);
        context.beginPath();
        context.arc(workerPos.x, workerPos.y, TURRET_THROW_RANGE, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
        
        // Draw line from worker to placement position
        context.strokeStyle = applyAlphaToColor(previewColor, 0.5);
        context.lineWidth = 2;
        context.setLineDash([3, 3]);
        context.beginPath();
        context.moveTo(workerPos.x, workerPos.y);
        context.lineTo(turretPos.x, turretPos.y);
        context.stroke();
        context.setLineDash([]);
        
        // Draw turret preview (circle with triangle)
        const turretRadius = 20;
        context.strokeStyle = previewColor;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(turretPos.x, turretPos.y, turretRadius, 0, Math.PI * 2);
        context.stroke();
        
        // Draw triangle preview
        context.fillStyle = applyAlphaToColor(previewColor, 0.4);
        context.save();
        context.translate(turretPos.x, turretPos.y);
        const angle = Math.atan2(turretPlacementY - turretPlacementWorker.y, turretPlacementX - turretPlacementWorker.x);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(turretRadius * 0.5, 0);
        context.lineTo(-turretRadius * 0.25, -turretRadius * 0.25);
        context.lineTo(-turretRadius * 0.25, turretRadius * 0.25);
        context.closePath();
        context.fill();
        context.restore();
    }
}

// --- Minimap Functions ---
// Helper function to check if an enemy unit/building is detected by sensor towers
function isDetectedBySensorTowers(worldX, worldY, enemyTeamId) {
    const currentPlayerData = players[currentPlayerId];
    if (!currentPlayerData) return false;
    
    const currentTeamId = currentPlayerData.team;
    
    // Check all sensor towers owned by the current player's team
    for (const obj of gameObjects) {
        if (obj.type === 'sensorTower' && 
            obj.health > 0 && 
            !obj.isUnderConstruction &&
            obj.playerId !== undefined) {
            
            const sensorTowerPlayerData = players[obj.playerId];
            if (sensorTowerPlayerData && sensorTowerPlayerData.team === currentTeamId) {
                // Check if the enemy is within sensor range
                if (obj.isInSensorRange && obj.isInSensorRange(worldX, worldY)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// Draw white outline silhouette for sensor-detected units/buildings
function drawSensorDetectedSilhouette(ctx, obj) {
    if (obj.health <= 0) return;
    
    // Convert world position to screen position
    const screenPos = worldToScreen(obj.x, obj.y);
    
    // Determine size based on object type
    let size = obj.size || 30;
    let width = obj.width || size;
    let height = obj.height || size;
    
    // Check if visible on screen
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    if (screenPos.x + halfWidth < 0 ||
        screenPos.x - halfWidth > canvas.width ||
        screenPos.y + halfHeight < 0 ||
        screenPos.y - halfHeight > canvas.height) {
        return; // Skip rendering if offscreen
    }
    
    const drawX = screenPos.x - halfWidth;
    const drawY = screenPos.y - halfHeight;
    
    // Save context state
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;
    const originalFillStyle = ctx.fillStyle;
    
    // Draw white outline (no fill) - use thinner line to match original size
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // White outline
    ctx.lineWidth = 1.5; // Thinner line to prevent making silhouette larger
    ctx.fillStyle = 'transparent';
    
    // Draw outline based on object type
    if (obj.type === 'worker') {
        // Worker has rounded corners - use exact same size as original
        const cornerRadius = 8;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, width, height, cornerRadius);
        ctx.stroke();
    } else if (obj.type === 'bunker' || obj.type === 'supplyDepot' || 
               obj.type === 'shieldTower' || obj.type === 'sensorTower') {
        // Buildings are rectangles - use exact same size as original
        ctx.strokeRect(drawX, drawY, width, height);
    } else {
        // Units are squares - use exact same size as original
        ctx.strokeRect(drawX, drawY, size, size);
    }
    
    // Restore context state
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
    ctx.fillStyle = originalFillStyle;
}

function drawMinimap() {
    // Clear the minimap
    minimapContext.fillStyle = '#000';
    minimapContext.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Draw the map background with tiles
    const minimapTileWidth = minimapCanvas.width / TILE_COUNT;
    const minimapTileHeight = minimapCanvas.height / TILE_COUNT;

    // Draw the checker pattern background
    for (let y = 0; y < TILE_COUNT; y++) {
        for (let x = 0; x < TILE_COUNT; x++) {
            const ring = Math.min(x, y, TILE_COUNT - 1 - x, TILE_COUNT - 1 - y);
            const tileColor = PERIMETER_COLORS[ring];

            const tileX = Math.round(x * minimapTileWidth);
            const tileY = Math.round(y * minimapTileHeight);
            const roundedMinimapTileWidth = Math.round(minimapTileWidth);
            const roundedMinimapTileHeight = Math.round(minimapTileHeight);

            // Base fill
            minimapContext.fillStyle = tileColor;
            minimapContext.fillRect(tileX, tileY, roundedMinimapTileWidth, roundedMinimapTileHeight);

        }
    }

    // Continuous grid lines on minimap
    minimapContext.fillStyle = MINIMAP_GRID_LINE_COLOR;
    // Vertical lines
    for (let i = 0; i <= TILE_COUNT; i++) {
        const xLine = Math.round(i * minimapTileWidth);
        minimapContext.fillRect(xLine - Math.floor(MINIMAP_GRID_LINE_WIDTH / 2), 0, MINIMAP_GRID_LINE_WIDTH, minimapCanvas.height);
    }
    // Horizontal lines
    for (let i = 0; i <= TILE_COUNT; i++) {
        const yLine = Math.round(i * minimapTileHeight);
        minimapContext.fillRect(0, yLine - Math.floor(MINIMAP_GRID_LINE_WIDTH / 2), minimapCanvas.width, MINIMAP_GRID_LINE_WIDTH);
    }

    // Outer frame on minimap (matching grid color)
    minimapContext.fillStyle = MINIMAP_OUTER_FRAME_COLOR;
    const mfw = MINIMAP_OUTER_FRAME_WIDTH;
    minimapContext.fillRect(0, -Math.floor(mfw / 2), minimapCanvas.width, mfw); // top
    minimapContext.fillRect(0, minimapCanvas.height - Math.ceil(mfw / 2), minimapCanvas.width, mfw); // bottom
    minimapContext.fillRect(-Math.floor(mfw / 2), 0, mfw, minimapCanvas.height); // left
    minimapContext.fillRect(minimapCanvas.width - Math.ceil(mfw / 2), 0, mfw, minimapCanvas.height); // right

    // Draw vents around center 2x2 block
    const centerLayer = Math.floor(TILE_COUNT / 2) - 1; // Center 2x2 block starts here
    const ventRingStartTileX = centerLayer;
    const ventRingStartTileY = centerLayer;
    const ventRingWidth = 2; // 2x2 block
    const ventRingHeight = 2;
    
    // Calculate vent ring bounds in minimap coordinates
    const ventRingMinimapX = ventRingStartTileX * minimapTileWidth;
    const ventRingMinimapY = ventRingStartTileY * minimapTileHeight;
    const ventRingMinimapWidth = ventRingWidth * minimapTileWidth;
    const ventRingMinimapHeight = ventRingHeight * minimapTileHeight;
    
    // Draw vent squares around the perimeter (avoiding overlaps)
    minimapContext.fillStyle = VENT_RING_COLOR;
    const ventSquareSize = Math.min(minimapTileWidth, minimapTileHeight) * 0.15; // Small squares relative to tile size
    
    // Calculate how many vent squares fit along each edge
    const topVentCount = Math.ceil(ventRingMinimapWidth / ventSquareSize);
    const sideVentCount = Math.ceil(ventRingMinimapHeight / ventSquareSize);
    
    // Draw top edge vents (excluding corners)
    for (let i = 1; i < topVentCount - 1; i++) {
        const ventX = ventRingMinimapX + i * ventSquareSize;
        minimapContext.fillRect(ventX, ventRingMinimapY, ventSquareSize, ventSquareSize);
    }
    
    // Draw bottom edge vents (excluding corners)
    for (let i = 1; i < topVentCount - 1; i++) {
        const ventX = ventRingMinimapX + i * ventSquareSize;
        minimapContext.fillRect(ventX, ventRingMinimapY + ventRingMinimapHeight - ventSquareSize, ventSquareSize, ventSquareSize);
    }
    
    // Draw left edge vents (excluding corners)
    for (let i = 1; i < sideVentCount - 1; i++) {
        const ventY = ventRingMinimapY + i * ventSquareSize;
        minimapContext.fillRect(ventRingMinimapX, ventY, ventSquareSize, ventSquareSize);
    }
    
    // Draw right edge vents (excluding corners)
    for (let i = 1; i < sideVentCount - 1; i++) {
        const ventY = ventRingMinimapY + i * ventSquareSize;
        minimapContext.fillRect(ventRingMinimapX + ventRingMinimapWidth - ventSquareSize, ventY, ventSquareSize, ventSquareSize);
    }
    
    // Draw corners separately (only once each)
    minimapContext.fillRect(ventRingMinimapX, ventRingMinimapY, ventSquareSize, ventSquareSize); // Top-left
    minimapContext.fillRect(ventRingMinimapX + ventRingMinimapWidth - ventSquareSize, ventRingMinimapY, ventSquareSize, ventSquareSize); // Top-right
    minimapContext.fillRect(ventRingMinimapX, ventRingMinimapY + ventRingMinimapHeight - ventSquareSize, ventSquareSize, ventSquareSize); // Bottom-left
    minimapContext.fillRect(ventRingMinimapX + ventRingMinimapWidth - ventSquareSize, ventRingMinimapY + ventRingMinimapHeight - ventSquareSize, ventSquareSize, ventSquareSize); // Bottom-right

    // Draw simple fog overlay (coarse grid for performance)
    if (fogOfWar) {
        drawSimpleMinimapFog();
    }

    // Draw game objects
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;

        // Check if this object should be visible on minimap to the current player
        let shouldRenderOnMinimap = true;
        let isSensorDetected = false;
        
        // Always render objects belonging to the current player's team
        const currentPlayerData = players[currentPlayerId];
        const objPlayerData = players[obj.playerId];
        
        if (currentPlayerData && objPlayerData && fogOfWar) {
            // If the object belongs to a different team, check visibility
            if (currentPlayerData.team !== objPlayerData.team) {
                const isVisible = fogOfWar.isVisibleToPlayer(currentPlayerId, obj.x, obj.y);
                
                // Check if detected by sensor towers (even if in fog of war)
                if (!isVisible) {
                    isSensorDetected = isDetectedBySensorTowers(obj.x, obj.y, objPlayerData.team);
                    shouldRenderOnMinimap = isSensorDetected;
                } else {
                    shouldRenderOnMinimap = true;
                }
            }
        }
        
        if (!shouldRenderOnMinimap) continue;

        // Calculate minimap position
        const minimapX = obj.x * minimapScale;
        const minimapY = obj.y * minimapScale;

        // If sensor detected, draw as white square
        if (isSensorDetected) {
            // Determine size based on object type
            let size;
            if (obj.type === 'bunker' || obj.type === 'supplyDepot' ||
                obj.type === 'shieldTower' || obj.type === 'sensorTower') {
                const baseSize = 8;
                const bunkerBonus = obj.type === 'bunker' ? 3 : 0;
                size = baseSize + bunkerBonus;
            } else {
                size = 5; // Units and workers
            }
            
            // Draw white square
            minimapContext.fillStyle = 'rgba(255, 255, 255, 0.9)'; // White
            minimapContext.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            minimapContext.lineWidth = 1;
            minimapContext.fillRect(minimapX - size / 2, minimapY - size / 2, size, size);
            minimapContext.strokeRect(minimapX - size / 2, minimapY - size / 2, size, size);
        } else {
            // Set fill color for normal rendering
            minimapContext.fillStyle = obj.color;
            minimapContext.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            minimapContext.lineWidth = 0.5;
            // Draw different shapes based on object type
            if (obj.type === 'bunker' || obj.type === 'supplyDepot' ||
                obj.type === 'shieldTower' || obj.type === 'sensorTower') {
                // Proportional building markers (slightly larger for bunkers)
                const baseSize = 8;            // previously 11
                const bunkerBonus = 3;         // previously +4
                const size = obj.type === 'bunker' ? baseSize + bunkerBonus : baseSize;
                minimapContext.fillRect(minimapX - size / 2, minimapY - size / 2, size, size);
                minimapContext.strokeRect(minimapX - size / 2, minimapY - size / 2, size, size);
            }
            else {
                // Units and workers as small squares
                const size = 5;                // keep modest to stay proportional
                minimapContext.fillRect(minimapX - size / 2, minimapY - size / 2, size, size);
                minimapContext.strokeRect(minimapX - size / 2, minimapY - size / 2, size, size);
            }
        }
    }

    // Draw sensor tower detection radius indicators on minimap
    const currentPlayerData = players[currentPlayerId];
    if (currentPlayerData) {
        const currentTeamId = currentPlayerData.team;
        
        // Save context state
        const originalDash = minimapContext.getLineDash();
        const originalOffset = minimapContext.lineDashOffset;
        const originalWidth = minimapContext.lineWidth;
        const originalStroke = minimapContext.strokeStyle;
        
        // Draw sensor radius for all sensor towers owned by current player's team
        for (const obj of gameObjects) {
            if (obj.type === 'sensorTower' && 
                obj.health > 0 && 
                !obj.isUnderConstruction &&
                obj.playerId !== undefined) {
                
                const sensorTowerPlayerData = players[obj.playerId];
                if (sensorTowerPlayerData && sensorTowerPlayerData.team === currentTeamId) {
                    // Calculate sensor radius on minimap
                    const sensorRadiusMinimap = obj.sensorRadius * minimapScale;
                    const sensorMinimapX = obj.x * minimapScale;
                    const sensorMinimapY = obj.y * minimapScale;
                    
                    // Draw static white dotted line
                    minimapContext.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // White, semi-transparent
                    minimapContext.lineWidth = 1;
                    minimapContext.setLineDash([2, 2]); // Static dotted pattern (smaller for minimap)
                    minimapContext.lineDashOffset = 0; // No animation offset
                    
                    minimapContext.strokeRect(
                        sensorMinimapX - sensorRadiusMinimap,
                        sensorMinimapY - sensorRadiusMinimap,
                        sensorRadiusMinimap * 2,
                        sensorRadiusMinimap * 2
                    );
                }
            }
        }
        
        // Restore context state
        minimapContext.setLineDash(originalDash);
        minimapContext.lineDashOffset = originalOffset;
        minimapContext.lineWidth = originalWidth;
        minimapContext.strokeStyle = originalStroke;
    }

    // Draw camera viewport rectangle
    const viewportX = camera.x * minimapScale;
    const viewportY = camera.y * minimapScale;
    const viewportWidth = canvas.width * minimapScale;
    const viewportHeight = canvas.height * minimapScale;

    minimapContext.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    minimapContext.lineWidth = 1;
    minimapContext.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);

    // Add a subtle glow effect to the viewport rectangle
    minimapContext.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    minimapContext.lineWidth = 2;
    minimapContext.strokeRect(viewportX - 1, viewportY - 1, viewportWidth + 2, viewportHeight + 2);
}

// Draw fog on minimap using the EXACT same fog grid as main game
function drawSimpleMinimapFog() {
    const currentPlayerData = players[currentPlayerId];
    if (!currentPlayerData) return;
    
    const teamId = currentPlayerData.team;
    const fogGrid = fogOfWar.teamFogGrids[teamId];
    if (!fogGrid) return;

    // Use exact same fog grid dimensions as main game
    const fogCellWidth = minimapCanvas.width / FOG_GRID_WIDTH;
    const fogCellHeight = minimapCanvas.height / FOG_GRID_HEIGHT;
    
    // Batch fill operations for performance
    minimapContext.fillStyle = 'rgba(0, 0, 0, 0.4)';
    minimapContext.beginPath();
    
    // Only draw explored (fogged) areas - skip visible areas for performance
    for (let y = 0; y < FOG_GRID_HEIGHT; y++) {
        for (let x = 0; x < FOG_GRID_WIDTH; x++) {
            if (fogGrid[y][x] === VISION_STATE.EXPLORED) {
                // Add rectangle to path instead of individual fillRect calls
                minimapContext.rect(
                    x * fogCellWidth,
                    y * fogCellHeight,
                    fogCellWidth,
                    fogCellHeight
                );
            }
        }
    }
    
    // Fill all rectangles in one operation
    minimapContext.fill();
}

// Handle minimap clicks
minimapCanvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { // Left click
        isMinimapDragging = true;
        handleMinimapCameraMove(event);
    }
});

minimapCanvas.addEventListener('mousemove', (event) => {
    if (isMinimapDragging) {
        handleMinimapCameraMove(event);
    }
});

minimapCanvas.addEventListener('mouseup', () => {
    isMinimapDragging = false;
});

// Handle right-click on minimap for move commands
minimapCanvas.addEventListener('contextmenu', (event) => {
    event.preventDefault(); // Prevent context menu
    
    const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank', 'worker'];
    const commandableUnits = selectedUnits.filter(obj => commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId);
    
    if (commandableUnits.length > 0) {
        const rect = minimapCanvas.getBoundingClientRect();
        const borderOffset = 6;
        const clickX = event.clientX - rect.left + borderOffset;
        const clickY = event.clientY - rect.top + borderOffset;

        // Clamp to minimap bounds
        const clampedX = Math.max(0, Math.min(clickX, rect.width));
        const clampedY = Math.max(0, Math.min(clickY, rect.height));

        // Convert to world coordinates
        const worldX = (clampedX / minimapCanvas.width) * MAP_WIDTH;
        const worldY = (clampedY / minimapCanvas.height) * MAP_HEIGHT;


        
        // Issue move command to selected units
        commandableUnits.forEach(unit => unit.moveTo(worldX, worldY));
        
        // Clear existing markers before adding new one
        movementMarkers.length = 0;
        
        // Add a regular move marker
        movementMarkers.push({
            x: worldX,
            y: worldY,
            timestamp: performance.now(),
            playerId: currentPlayerId
        });
    }
});

minimapCanvas.addEventListener('mouseleave', () => {
    isMinimapDragging = false;
    // Cancel A-move mode if cursor leaves minimap
    if (isAMoveMode) {

        isAMoveMode = false;
    }
});

function handleMinimapCameraMove(event) {
    if (isGamePaused) return;

    const rect = minimapCanvas.getBoundingClientRect();
    const borderOffset = 6; // Adjust if needed
    const clickX = event.clientX - rect.left + borderOffset;
    const clickY = event.clientY - rect.top + borderOffset;

    // Clamp clickX and clickY to minimap bounds
    const displayedWidth = rect.width; // Now should be 300
    const displayedHeight = rect.height;
    const clampedX = Math.max(0, Math.min(clickX, displayedWidth));
    const clampedY = Math.max(0, Math.min(clickY, displayedHeight));

    // Convert minimap coordinates to world coordinates
    const worldX = (clampedX / minimapCanvas.width) * MAP_WIDTH;
    const worldY = (clampedY / minimapCanvas.height) * MAP_HEIGHT;

    // Check if we're in A-Move mode and have commandable units selected
    if (isAMoveMode) {
        const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank'];
        const commandableUnits = selectedUnits.filter(obj => commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId);
        
        if (commandableUnits.length > 0) {

            
            // Issue attack-move command to selected units
            commandableUnits.forEach(unit => unit.attackMoveTo(worldX, worldY));
            
            // Clear existing markers before adding new one
            movementMarkers.length = 0;
            
            // Add an A-Move marker at the target location
            movementMarkers.push({
                x: worldX,
                y: worldY,
                timestamp: performance.now(),
                playerId: currentPlayerId,
                isAttackMove: true
            });
            
            // Exit A-Move mode
            isAMoveMode = false;
            return; // Don't move camera when doing A-move
        }
    }

    // Normal camera movement if not A-moving
    camera.x = worldX - canvas.width / 2;
    camera.y = worldY - canvas.height / 2;

    // Constrain camera to visual map boundaries
    camera.x = Math.max(0, Math.min(camera.x, MAP_WIDTH - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, MAP_HEIGHT - canvas.height));
}

// --- Pregame Overlay + Ready State ---
function setGamePaused(paused) {
    isGamePaused = paused;
    window.isGamePaused = isGamePaused;
    if (paused) {
        camera.velX = 0;
        camera.velY = 0;
    }
}

function renderReadyStates() {
    if (!pregameReadyListEl) return;
    pregameReadyListEl.innerHTML = '';

    // Group players by team for display
    const teamBuckets = {};
    Object.keys(players).forEach(id => {
        const teamId = players[id].team;
        if (!teamBuckets[teamId]) teamBuckets[teamId] = [];
        teamBuckets[teamId].push(id);
    });

    Object.keys(teamBuckets).sort((a, b) => a - b).forEach(teamId => {
        const teamColor = teams[teamId]?.color || '#fff';
        const teamName = teams[teamId]?.name || `Team ${teamId}`;

        const teamSection = document.createElement('div');
        teamSection.className = 'pregame-team';
        teamSection.style.borderColor = `${teamColor}40`;

        const teamTitle = document.createElement('div');
        teamTitle.className = 'pregame-team-title';
        teamTitle.style.color = teamColor;
        teamTitle.style.borderColor = `${teamColor}80`;
        teamTitle.textContent = teamName;
        teamSection.appendChild(teamTitle);

        teamBuckets[teamId].sort((a, b) => a - b).forEach(id => {
            const playerData = players[id];
            const isReady = !!readyStates[id];

            const row = document.createElement('div');
            row.className = `pregame-player ${isReady ? 'ready' : 'not-ready'}`;

            const meta = document.createElement('div');
            meta.className = 'player-meta';

            const name = document.createElement('span');
            name.className = 'player-name';
            name.textContent = `Player ${id}`;
            name.style.color = playerData.color;

            meta.appendChild(name);

            const status = document.createElement('span');
            status.className = 'player-status';
            status.textContent = isReady ? 'Ready' : 'Not Ready';

            row.appendChild(meta);
            row.appendChild(status);
            teamSection.appendChild(row);
        });

        pregameReadyListEl.appendChild(teamSection);
    });
}

function setPlayerReadyState(playerId, isReady) {
    readyStates[playerId] = isReady;
    renderReadyStates();
    
    // Send ready status to server
    if (window.clientNetwork && playerId === currentPlayerId) {
        window.clientNetwork.setReadyStatus(isReady);
    }
    
    // Clear countdown message if toggling states
    if (pregameCountdownEl && !isPregameCountdownActive) {
        pregameCountdownEl.textContent = '';
    }
    // Cancel countdown if someone marks not ready
    if (!isReady) {
        cancelPregameCountdown();
    }
}

function updatePregameCountdownText() {
    if (!pregameCountdownEl) return;
    if (isPregameCountdownActive) {
        pregameCountdownEl.textContent = `Starting in ${pregameCountdownRemaining}...`;
    } else {
        pregameCountdownEl.textContent = '';
    }
}

function cancelPregameCountdown() {
    if (pregameCountdownTimer) {
        clearInterval(pregameCountdownTimer);
        pregameCountdownTimer = null;
    }
    isPregameCountdownActive = false;
    pregameCountdownRemaining = 0;
    updatePregameCountdownText();
}

function startPregameCountdown() {
    if (isPregameCountdownActive || !isGamePaused) return;

    const readyCount = Object.values(readyStates).filter(Boolean).length;
    if (readyCount === 0) {
        if (pregameCountdownEl) {
            pregameCountdownEl.textContent = 'At least one player must be ready.';
        }
        return;
    }

    isPregameCountdownActive = true;
    pregameCountdownRemaining = 3;
    updatePregameCountdownText();

    pregameCountdownTimer = setInterval(() => {
        pregameCountdownRemaining -= 1;
        if (pregameCountdownRemaining <= 0) {
            clearInterval(pregameCountdownTimer);
            pregameCountdownTimer = null;
            finishPregameCountdown();
            return;
        }
        updatePregameCountdownText();
    }, 1000);
}

function finishPregameCountdown() {
    isPregameCountdownActive = false;
    updatePregameCountdownText();
    if (pregameOverlay) {
        pregameOverlay.classList.add('hidden');
    }
    setGamePaused(false);
    gameStartTime = Date.now();
    lastResourceUpdateTime = performance.now();
}

function centerCameraOnFirstBunkerForPlayer(playerId) {
    const bunker = gameObjects.find(obj => obj.type === 'bunker' && obj.playerId === playerId);
    if (bunker) {
        centerCameraOnPosition(bunker.x, bunker.y);
    }
}


function initializePregameOverlay() {
    renderReadyStates();
    updatePregameCountdownText();
    setGamePaused(true);
    // Ensure camera is centered on the current player's first bunker on load
    centerCameraOnFirstBunkerForPlayer(currentPlayerId);

    // Remove existing event listeners by cloning and replacing buttons
    if (pregameReadyBtn) {
        const newReadyBtn = pregameReadyBtn.cloneNode(true);
        pregameReadyBtn.parentNode.replaceChild(newReadyBtn, pregameReadyBtn);
        newReadyBtn.addEventListener('click', () => {
            setPlayerReadyState(currentPlayerId, true);
        });
    }
    if (pregameNotReadyBtn) {
        const newNotReadyBtn = pregameNotReadyBtn.cloneNode(true);
        pregameNotReadyBtn.parentNode.replaceChild(newNotReadyBtn, pregameNotReadyBtn);
        newNotReadyBtn.addEventListener('click', () => {
            setPlayerReadyState(currentPlayerId, false);
        });
    }
    if (pregameGoBtn) {
        // Only show "Let's Go" button for host
        const isHost = window.lobbyManager?.isHost || false;
        if (!isHost) {
            pregameGoBtn.style.display = 'none';
        } else {
            pregameGoBtn.style.display = '';
        }
        
        const newGoBtn = pregameGoBtn.cloneNode(true);
        pregameGoBtn.parentNode.replaceChild(newGoBtn, pregameGoBtn);
        newGoBtn.addEventListener('click', () => {
            // Send start game command to server (only host can do this)
            if (window.clientNetwork && window.lobbyManager?.isHost) {
                console.log('Host clicked Let\'s Go - starting game for all players');
                // Send a command to server to unpause the game for everyone
                window.clientNetwork.sendInput('START_PREGAME_GAME', {});
            } else {
                // Fallback: just start locally (shouldn't happen)
                finishPregameCountdown();
            }
        });
    }
}

// --- Resource Gain Functions ---
function createResourceGainText(x, y, amount, isBuilding = false, playerId = currentPlayerId) {
    const text = `+${amount}`;
    const font = isBuilding ? RESOURCE_TEXT_FONT_BUILDING : RESOURCE_TEXT_FONT_UNIT;
    const playerColor = players[playerId].color;
    floatingTexts.push(new FloatingText(x, y, text, playerColor, font, RESOURCE_TEXT_DURATION));
}

function updateFloatingTexts(now, ctx) {
    // Update and draw floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const text = floatingTexts[i];
        // Update returns false when the text has expired
        if (!text.update(now)) {
            // Remove expired text
            floatingTexts.splice(i, 1);
        } else {
            // Draw active text
            text.draw(ctx);
        }
    }
}

// --- Rendering Functions ---
function executeDrawCommand(ctx, command) {
    const now = performance.now();

    switch (command.type) {
        case 'text':
            // Convert world to screen coordinates
            const textScreenPos = worldToScreen(command.x, command.y);

            ctx.fillStyle = command.color || 'white';
            ctx.font = command.font || '10px Arial';
            ctx.textAlign = command.textAlign || 'center';
            ctx.fillText(command.content, textScreenPos.x, textScreenPos.y);
            break;

        case 'healthBar':
            // Use the camera-aware draw health bar function
            drawHealthBar(
                ctx,
                command.centerX,
                command.topY,
                command.currentHealth,
                command.maxHealth,
                command.width,
                command.height,
                command.basePlayerColor
            );
            break;

        case 'cooldownBar':
            drawCooldownBar(
                ctx,
                command.centerX,
                command.topY,
                command.readiness,
                command.width,
                command.height,
                command.basePlayerColor
            );
            break;
        case 'capacityBar':
            drawCapacityBar(
                ctx,
                command.centerX,
                command.topY,
                command.capacity,
                command.width,
                command.height,
                command.basePlayerColor
            );
            break;

        case 'expirationBar': {
            // Draw expiration timer bar (player color, fading based on time remaining)
            const expirationScreenPos = worldToScreen(command.centerX, command.topY);
            
            // Skip if offscreen
            if (expirationScreenPos.x < -command.width ||
                expirationScreenPos.x > canvas.width + command.width ||
                expirationScreenPos.y < -command.height ||
                expirationScreenPos.y > canvas.height + command.height) {
                break;
            }
            
            const clampedReadiness = Math.min(1, Math.max(0, command.readiness));
            const barX = expirationScreenPos.x - command.width / 2;
            const barY = expirationScreenPos.y;
            
            const originalFill = ctx.fillStyle;
            const originalStroke = ctx.strokeStyle;
            const originalLineWidth = ctx.lineWidth;
            
            // Background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(barX, barY, command.width, command.height);
            
            // Fill - use player color with alpha based on time remaining
            const expirationPlayerColor = command.basePlayerColor || 'hsl(200, 100%, 50%)';
            // Convert HSL to RGBA with alpha based on readiness
            let fillColor = expirationPlayerColor;
            if (expirationPlayerColor.startsWith('hsl')) {
                // Extract HSL values and apply alpha
                const hslMatch = expirationPlayerColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                if (hslMatch) {
                    const h = hslMatch[1];
                    const s = hslMatch[2];
                    const l = hslMatch[3];
                    // Fade color as time runs out (lower alpha when readiness is low)
                    const alpha = 0.4 + (clampedReadiness * 0.6); // 0.4 to 1.0 alpha
                    fillColor = `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
                }
            } else {
                // Fallback for other color formats
                fillColor = expirationPlayerColor;
            }
            ctx.fillStyle = fillColor;
            const filledWidth = command.width * clampedReadiness;
            ctx.fillRect(barX, barY, filledWidth, command.height);
            
            // Border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, command.width, command.height);
            
            ctx.fillStyle = originalFill;
            ctx.strokeStyle = originalStroke;
            ctx.lineWidth = originalLineWidth;
            break;
        }

        case 'rally':
            const startScreenPos = worldToScreen(command.startX, command.startY);
            const endScreenPos = worldToScreen(command.endX, command.endY);

            const originalRallyDash = ctx.getLineDash();
            const originalRallyOffset = ctx.lineDashOffset;
            const originalRallyLineWidth = ctx.lineWidth;
            const originalRallyStrokeStyle = ctx.strokeStyle;

            ctx.strokeStyle = command.color || 'lime';
            ctx.lineWidth = command.lineWidth || 1;
            if (command.lineDash) ctx.setLineDash(command.lineDash);
            if (command.lineDashOffset !== undefined) ctx.lineDashOffset = command.lineDashOffset;

            ctx.beginPath();
            ctx.moveTo(startScreenPos.x, startScreenPos.y);
            ctx.lineTo(endScreenPos.x, endScreenPos.y);
            ctx.stroke();
            ctx.setLineDash(originalRallyDash);
            ctx.lineDashOffset = originalRallyOffset;

            // --- Draw Looping Rally Ripple Marker ---
            const pulseTime = now % command.pulseDuration;
            const pulseProgress = pulseTime / command.pulseDuration;
            const playerColor = players[command.playerId]?.color || 'lime';

            drawRippleEffect(
                ctx,
                now,
                endScreenPos.x, endScreenPos.y,
                pulseProgress,
                playerColor,
                command.rippleStartRadius,
                RIPPLE_RING_COUNT,
                RIPPLE_LINE_WIDTH // Pass line width
            );

            // Restore context state
            ctx.lineWidth = originalRallyLineWidth;
            ctx.strokeStyle = originalRallyStrokeStyle;
            break;

        case 'rangeCircle':
            const rangeCircleScreenPos = worldToScreen(command.x, command.y);

            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;

            ctx.strokeStyle = command.color || 'rgba(255,0,0,0.3)';
            ctx.lineWidth = 1;
            if (command.lineDash) {
                ctx.setLineDash(command.lineDash);
            }
            if (command.lineDashOffset) {
                ctx.lineDashOffset = command.lineDashOffset;
            }
            ctx.beginPath();
            ctx.arc(rangeCircleScreenPos.x, rangeCircleScreenPos.y, command.radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            break;



        default:

    }
}

// Update and draw falling workers
function updateFallingWorkers(ctx, now) {
    for (let i = fallingWorkers.length - 1; i >= 0; i--) {
        const falling = fallingWorkers[i];
        const elapsedTime = now - falling.startTime;
        const progress = Math.min(elapsedTime / falling.duration, 1);
        
        // Calculate current Y position using easing (ease-out for gravity effect)
        const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
        const currentY = falling.startY + (falling.targetY - falling.startY) * easeOut;
        
        // Draw falling worker
        const screenPos = worldToScreen(falling.x, currentY);
        const playerData = players[falling.playerId];
        if (!playerData) {
            fallingWorkers.splice(i, 1);
            continue;
        }
        
        const workerSize = 35;
        const halfSize = workerSize / 2;
        
        // Check if visible on screen
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            // Still update position even if off-screen
            if (progress >= 1) {
                // Worker has landed, spawn it
                const newWorker = new Worker(falling.x, falling.targetY, falling.playerId);
                gameObjects.push(newWorker);
                
                const playerState = players[falling.playerId];
                if (playerState) {
                    playerState.currentWorkerSupply = Math.min(
                        playerState.workerSupplyCap,
                        playerState.currentWorkerSupply + (newWorker.workerSupplyCost || WORKER_SUPPLY_COST)
                    );
                    updateResourceSupplyDisplay();
                }
                
                fallingWorkers.splice(i, 1);
            }
            continue;
        }
        
        // Draw shadow (grows as worker falls) - rounded shadow matching worker shape
        const shadowSize = workerSize + (progress * 10); // Shadow grows as it gets closer
        const shadowAlpha = 0.3 + (progress * 0.2); // Shadow gets darker as it gets closer
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        const shadowScreenPos = worldToScreen(falling.x, falling.targetY);
        const shadowDrawX = shadowScreenPos.x - shadowSize / 2 + 3;
        const shadowDrawY = shadowScreenPos.y - shadowSize / 2 + 3;
        const cornerRadius = 8;
        ctx.beginPath();
        ctx.roundRect(shadowDrawX, shadowDrawY, shadowSize, shadowSize, cornerRadius);
        ctx.fill();
        
        // Draw falling worker using actual worker model (rounded corners, circle indicator)
        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;
        
        // --- Draw Worker Body with Rounded Corners ---
        ctx.fillStyle = playerData.color;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, workerSize, workerSize, cornerRadius);
        ctx.fill();
        
        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + workerSize, drawY + workerSize);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, workerSize, workerSize, cornerRadius);
        ctx.fill();
        
        // --- Draw Unit Symbol (Circle Direction Indicator instead of Triangle) ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        
        // Draw circle pointing in fall direction (downward)
        const circleRadius = halfSize * 0.3;
        const fallAngle = Math.PI / 2; // Point downward
        const circleX = screenPos.x + Math.cos(fallAngle) * (halfSize * 0.4);
        const circleY = screenPos.y + Math.sin(fallAngle) * (halfSize * 0.4);
        
        ctx.beginPath();
        ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // --- Draw Dashed Border ---
        ctx.strokeStyle = getDarkerHslColor(playerData.color, 20);
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]); // Dashed border pattern
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, workerSize, workerSize, cornerRadius);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern
        
        // Draw trail effect (particles)
        if (progress > 0.3) { // Start showing trail after 30% of fall
            const trailAlpha = (progress - 0.3) * 0.7; // Fade in trail
            ctx.fillStyle = `rgba(255, 255, 255, ${trailAlpha * 0.3})`;
            for (let j = 0; j < 3; j++) {
                const trailY = currentY - (j * 30);
                const trailScreenPos = worldToScreen(falling.x, trailY);
                ctx.fillRect(trailScreenPos.x - 2, trailScreenPos.y - 2, 4, 4);
            }
        }
        
        // Check if worker has landed
        if (progress >= 1) {
            // Worker has landed, spawn it
            const newWorker = new Worker(falling.x, falling.targetY, falling.playerId);
            gameObjects.push(newWorker);
            
            const playerState = players[falling.playerId];
            if (playerState) {
                playerState.currentWorkerSupply = Math.min(
                    playerState.workerSupplyCap,
                    playerState.currentWorkerSupply + (newWorker.workerSupplyCost || WORKER_SUPPLY_COST)
                );
                updateResourceSupplyDisplay();
            }
            
            fallingWorkers.splice(i, 1);
        }
    }
}

// Update and draw throwing turrets
function updateThrowingTurrets(ctx, now) {
    for (let i = throwingTurrets.length - 1; i >= 0; i--) {
        const throwing = throwingTurrets[i];
        const elapsedTime = now - throwing.startTime;
        const progress = Math.min(elapsedTime / throwing.duration, 1);
        
        // Calculate current position using arc trajectory (parabolic path)
        const currentX = throwing.startX + (throwing.targetX - throwing.startX) * progress;
        // Arc height - starts and ends at ground level, peaks in the middle
        const arcHeight = 150; // Height of the arc
        const arcProgress = Math.sin(progress * Math.PI); // 0 at start/end, 1 at peak
        const currentY = throwing.startY + (throwing.targetY - throwing.startY) * progress - (arcHeight * arcProgress);
        
        // Draw throwing turret
        const screenPos = worldToScreen(currentX, currentY);
        const playerData = players[throwing.playerId];
        if (!playerData) {
            throwingTurrets.splice(i, 1);
            continue;
        }
        
        const turretRadius = 20;
        
        // Check if visible on screen
        if (screenPos.x + turretRadius < 0 ||
            screenPos.x - turretRadius > canvas.width ||
            screenPos.y + turretRadius < 0 ||
            screenPos.y - turretRadius > canvas.height) {
            // Still update position even if off-screen
            if (progress >= 1) {
                // Turret has landed, spawn it
                const turret = new Turret(throwing.targetX, throwing.targetY, throwing.playerId);
                gameObjects.push(turret);
                throwingTurrets.splice(i, 1);
            }
            continue;
        }
        
        // Draw shadow (grows as turret gets closer)
        const shadowSize = turretRadius * 2 + (progress * 8);
        const shadowAlpha = 0.2 + (progress * 0.3);
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        const shadowScreenPos = worldToScreen(throwing.targetX, throwing.targetY);
        ctx.beginPath();
        ctx.ellipse(shadowScreenPos.x, shadowScreenPos.y, shadowSize / 2, shadowSize / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw turret body (rotating during flight)
        const rotationAngle = progress * Math.PI * 2; // Full rotation during flight
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(rotationAngle);
        
        // Draw circle border
        ctx.strokeStyle = playerData.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, turretRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw inner circle fill
        ctx.fillStyle = applyAlphaToColor(playerData.color, 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, turretRadius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw triangle (rotating)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        const triangleSize = turretRadius * 0.5;
        ctx.beginPath();
        ctx.moveTo(triangleSize, 0);
        ctx.lineTo(-triangleSize / 2, -triangleSize / 2);
        ctx.lineTo(-triangleSize / 2, triangleSize / 2);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // Draw trail effect
        if (progress > 0.1) {
            const trailAlpha = (progress - 0.1) * 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${trailAlpha * 0.3})`;
            for (let j = 0; j < 3; j++) {
                const trailProgress = progress - (j * 0.05);
                if (trailProgress < 0) continue;
                const trailX = throwing.startX + (throwing.targetX - throwing.startX) * trailProgress;
                const trailArcProgress = Math.sin(trailProgress * Math.PI);
                const trailY = throwing.startY + (throwing.targetY - throwing.startY) * trailProgress - (arcHeight * trailArcProgress);
                const trailScreenPos = worldToScreen(trailX, trailY);
                ctx.beginPath();
                ctx.arc(trailScreenPos.x, trailScreenPos.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Check if turret has landed
        if (progress >= 1) {
            // Turret has landed, spawn it
            const turret = new Turret(throwing.targetX, throwing.targetY, throwing.playerId);
            gameObjects.push(turret);
            throwingTurrets.splice(i, 1);
        }
    }
}

function drawAttackEffects(ctx, now) {
    // Save original ctx state
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // Process attack effects
    for (let i = attackEffects.length - 1; i >= 0; i--) {
        const effect = attackEffects[i];
        const elapsedTime = now - effect.timestamp;

        // Remove effects that have exceeded their duration
        if (elapsedTime >= effect.duration) {
            attackEffects.splice(i, 1);
            continue;
        }
        
        // Check if this attack effect should be visible to the current player
        let shouldRenderEffect = false;
        
        // Nuke effects are always visible to all players
        if (effect.type === 'nuke') {
            shouldRenderEffect = true;
        } else if (fogOfWar) {
            if (effect.type === 'laser') {
                // For laser effects, check visibility at both start and end points
                const startVisible = fogOfWar.isVisibleToPlayer(currentPlayerId, effect.startX, effect.startY);
                const endVisible = fogOfWar.isVisibleToPlayer(currentPlayerId, effect.endX, effect.endY);
                // Only show laser if at least one end is visible
                shouldRenderEffect = startVisible || endVisible;
            } else if (effect.type === 'burst') {
                // For burst effects, check visibility at the effect location
                shouldRenderEffect = fogOfWar.isVisibleToPlayer(currentPlayerId, effect.x, effect.y);
            } else if (effect.type === 'splash') {
                // For splash effects, check visibility at the effect location
                shouldRenderEffect = fogOfWar.isVisibleToPlayer(currentPlayerId, effect.x, effect.y);
            }
        } else {
            // If no fog of war system, show all effects
            shouldRenderEffect = true;
        }
        
        if (!shouldRenderEffect) {
            continue;
        }

        // Calculate alpha (fade out)
        const alpha = 1.0 - (elapsedTime / effect.duration);

        if (effect.type === 'laser') {
            // Convert world coordinates to screen coordinates
            const startScreen = worldToScreen(effect.startX, effect.startY);
            const endScreen = worldToScreen(effect.endX, effect.endY);

            // Skip if both points are offscreen
            if ((startScreen.x < 0 && endScreen.x < 0) ||
                (startScreen.x > canvas.width && endScreen.x > canvas.width) ||
                (startScreen.y < 0 && endScreen.y < 0) ||
                (startScreen.y > canvas.height && endScreen.y > canvas.height)) {
                continue;
            }

            // Use player color for the laser instead of red
            let laserColor = effect.color || 'rgba(255, 0, 0, 1)';

            // Convert HSL color to HSLA with alpha
            if (laserColor.startsWith('hsl')) {
                laserColor = laserColor.replace(')', `, ${alpha})`).replace('hsl', 'hsla');
            } else {
                // For any other color format, just use rgba red as fallback
                laserColor = `rgba(255, 0, 0, ${alpha})`;
            }

            // Draw laser line with player color and alpha
            ctx.strokeStyle = laserColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(startScreen.x, startScreen.y);
            ctx.lineTo(endScreen.x, endScreen.y);
            ctx.stroke();
        }
        else if (effect.type === 'burst') {
            // Convert world coordinates to screen coordinates
            const screenPos = worldToScreen(effect.x, effect.y);

            // Skip if offscreen
            if (screenPos.x < -10 ||
                screenPos.x > canvas.width + 10 ||
                screenPos.y < -10 ||
                screenPos.y > canvas.height + 10) {
                continue;
            }

            const sparkAlpha = alpha * 0.8; // Slightly more transparent than the laser

            // Set spark color
            ctx.strokeStyle = `rgba(255, 255, 255, ${sparkAlpha})`;
            ctx.lineWidth = 1;

            // Draw several spark lines
            for (let j = 0; j < SPARK_COUNT; j++) {
                const angle = Math.random() * Math.PI * 2; // Random angle
                const length = Math.random() * SPARK_LENGTH + 2; // Random length

                const sparkEndX = screenPos.x + Math.cos(angle) * length;
                const sparkEndY = screenPos.y + Math.sin(angle) * length;

                ctx.beginPath();
                ctx.moveTo(screenPos.x, screenPos.y);
                ctx.lineTo(sparkEndX, sparkEndY);
                ctx.stroke();
            }
        }
        else if (effect.type === 'nuke') {
            // Convert world coordinates to screen coordinates
            const screenPos = worldToScreen(effect.x, effect.y);
            const nukeSize = effect.size; // Square size in world coordinates (same as screen since no zoom)
            const halfSize = nukeSize / 2;

            // Skip if completely offscreen
            if (screenPos.x + halfSize < 0 ||
                screenPos.x - halfSize > canvas.width ||
                screenPos.y + halfSize < 0 ||
                screenPos.y - halfSize > canvas.height) {
                continue;
            }

            // Calculate animation progress (0 to 1)
            const progress = elapsedTime / effect.duration;
            
            // Explosion expands from center, then fades
            const expansionProgress = Math.min(progress * 2, 1); // Expand quickly in first half
            const fadeProgress = Math.max(0, (progress - 0.5) * 2); // Fade in second half
            
            // Current size (expands from 0 to full size)
            const currentSize = nukeSize * expansionProgress;
            const currentHalfSize = currentSize / 2;
            
            // Alpha (starts at 1, fades to 0)
            const nukeAlpha = 1.0 - fadeProgress;

            // Draw outer explosion square border (bright orange/red)
            ctx.strokeStyle = `rgba(255, 100, 0, ${nukeAlpha * 0.8})`;
            ctx.lineWidth = 4;
            ctx.strokeRect(screenPos.x - currentHalfSize, screenPos.y - currentHalfSize, currentSize, currentSize);

            // Draw inner core (bright white/yellow)
            ctx.fillStyle = `rgba(255, 255, 200, ${nukeAlpha * 0.6})`;
            ctx.fillRect(screenPos.x - currentHalfSize * 0.6, screenPos.y - currentHalfSize * 0.6, currentSize * 0.6, currentSize * 0.6);

            // Draw bright center
            ctx.fillStyle = `rgba(255, 255, 255, ${nukeAlpha})`;
            ctx.fillRect(screenPos.x - currentHalfSize * 0.3, screenPos.y - currentHalfSize * 0.3, currentSize * 0.3, currentSize * 0.3);

            // Draw expanding shockwave squares
            const ringCount = 3;
            for (let i = 0; i < ringCount; i++) {
                const ringProgress = (progress - i * 0.15) * 1.5;
                if (ringProgress > 0 && ringProgress < 1) {
                    const ringSize = currentSize * (1 + ringProgress * 0.5);
                    const ringHalfSize = ringSize / 2;
                    const ringAlpha = (1 - ringProgress) * nukeAlpha * 0.4;
                    ctx.strokeStyle = `rgba(255, 200, 100, ${ringAlpha})`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(screenPos.x - ringHalfSize, screenPos.y - ringHalfSize, ringSize, ringSize);
                }
            }

            // Draw particle sparks from corners and edges
            const sparkCount = 16;
            for (let j = 0; j < sparkCount; j++) {
                const sparkProgress = progress + (j / sparkCount) * 0.3;
                if (sparkProgress > 1) continue;
                
                // Distribute sparks around the square perimeter
                const perimeterPos = (j / sparkCount) * 4; // 0-4 around perimeter
                let sparkX, sparkY;
                
                if (perimeterPos < 1) {
                    // Top edge
                    sparkX = screenPos.x - currentHalfSize + (perimeterPos % 1) * currentSize;
                    sparkY = screenPos.y - currentHalfSize;
                } else if (perimeterPos < 2) {
                    // Right edge
                    sparkX = screenPos.x + currentHalfSize;
                    sparkY = screenPos.y - currentHalfSize + ((perimeterPos - 1) % 1) * currentSize;
                } else if (perimeterPos < 3) {
                    // Bottom edge
                    sparkX = screenPos.x + currentHalfSize - ((perimeterPos - 2) % 1) * currentSize;
                    sparkY = screenPos.y + currentHalfSize;
                } else {
                    // Left edge
                    sparkX = screenPos.x - currentHalfSize;
                    sparkY = screenPos.y + currentHalfSize - ((perimeterPos - 3) % 1) * currentSize;
                }
                
                // Extend spark outward
                const angle = Math.atan2(sparkY - screenPos.y, sparkX - screenPos.x);
                const sparkDistance = currentHalfSize * (1.2 + sparkProgress * 0.5);
                const sparkEndX = screenPos.x + Math.cos(angle) * sparkDistance;
                const sparkEndY = screenPos.y + Math.sin(angle) * sparkDistance;
                
                ctx.strokeStyle = `rgba(255, 255, 255, ${nukeAlpha * 0.8})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sparkX, sparkY);
                ctx.lineTo(sparkEndX, sparkEndY);
                ctx.stroke();
            }
        }
        else if (effect.type === 'splash') {
            // Convert world coordinates to screen coordinates
            const screenPos = worldToScreen(effect.x, effect.y);
            const splashRadius = effect.radius;

            // Skip if offscreen
            if (screenPos.x + splashRadius < 0 ||
                screenPos.x - splashRadius > canvas.width ||
                screenPos.y + splashRadius < 0 ||
                screenPos.y - splashRadius > canvas.height) {
                continue;
            }

            // Calculate alpha (fade out)
            const splashAlpha = alpha * 0.6;

            // Get player color
            let splashColor = effect.color || 'rgba(255, 200, 0, 1)';
            
            // Convert HSL color to RGBA with alpha
            if (splashColor.startsWith('hsl')) {
                // Convert HSL to RGBA for splash effect
                const hslMatch = splashColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                if (hslMatch) {
                    const h = parseInt(hslMatch[1]) / 360;
                    const s = parseInt(hslMatch[2]) / 100;
                    const l = parseInt(hslMatch[3]) / 100;
                    const c = (1 - Math.abs(2 * l - 1)) * s;
                    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
                    const m = l - c / 2;
                    let r, g, b;
                    if (h < 1/6) { r = c; g = x; b = 0; }
                    else if (h < 2/6) { r = x; g = c; b = 0; }
                    else if (h < 3/6) { r = 0; g = c; b = x; }
                    else if (h < 4/6) { r = 0; g = x; b = c; }
                    else if (h < 5/6) { r = x; g = 0; b = c; }
                    else { r = c; g = 0; b = x; }
                    splashColor = `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)}, ${splashAlpha})`;
                } else {
                    splashColor = `rgba(255, 200, 0, ${splashAlpha})`;
                }
            } else {
                splashColor = `rgba(255, 200, 0, ${splashAlpha})`;
            }

            // Draw expanding circle for splash effect
            const expansionProgress = Math.min(elapsedTime / (effect.duration * 0.5), 1);
            const currentRadius = splashRadius * expansionProgress;

            // Outer ring (bright)
            ctx.strokeStyle = splashColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, currentRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Inner fill (semi-transparent)
            ctx.fillStyle = splashColor.replace(')', ', 0.2)');
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, currentRadius * 0.7, 0, Math.PI * 2);
            ctx.fill();

            // Center bright spot
            ctx.fillStyle = splashColor.replace(')', ', 0.4)');
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, currentRadius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Restore original context state
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
}

// Update and draw repair effects
function updateAndDrawRepairEffects(ctx, now) {
    const originalFillStyle = ctx.fillStyle;
    
    // Update and draw repair effects
    for (let i = repairEffects.length - 1; i >= 0; i--) {
        const effect = repairEffects[i];
        
        // Update effect life
        effect.life -= 0.016; // ~60fps, decrease by ~16ms per frame
        
        // Remove dead effects
        if (effect.life <= 0) {
            repairEffects.splice(i, 1);
            continue;
        }
        
        // Update position (simplified - less movement)
        effect.x += effect.vx;
        effect.y += effect.vy;
        
        // Calculate alpha based on remaining life
        const alpha = effect.life / effect.maxLife;
        
        // Convert to screen coordinates
        const screenPos = worldToScreen(effect.x, effect.y);
        
        // Skip if offscreen
        if (screenPos.x < -10 || screenPos.x > canvas.width + 10 ||
            screenPos.y < -10 || screenPos.y > canvas.height + 10) {
            continue;
        }
        
        // Draw repair spark - handle HSL or hex color
        let fillColor = effect.color;
        if (effect.color.startsWith('hsl')) {
            // HSL color - add alpha
            const hslMatch = effect.color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (hslMatch) {
                const h = hslMatch[1];
                const s = hslMatch[2];
                const l = hslMatch[3];
                fillColor = `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
            }
        } else if (effect.color.startsWith('#')) {
            // Hex color - convert to rgba
            const hex = effect.color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            fillColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        // Keep size constant, only fade alpha - makes sparks more noticeable
        ctx.arc(screenPos.x, screenPos.y, effect.size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.fillStyle = originalFillStyle;
}

// Performance Monitor Functions
function updatePerformanceMetrics(now) {
    // Calculate frame time
    const frameTime = now - lastFrameTime;
    lastFrameTime = now;

    // Store frame time for FPS calculation
    frameTimes.push(frameTime);
    if (frameTimes.length > FPS_SAMPLE_SIZE) {
        frameTimes.shift();
    }

    // Update display every PERFORMANCE_UPDATE_INTERVAL
    if (now - lastPerformanceUpdate >= PERFORMANCE_UPDATE_INTERVAL) {
        // Calculate average FPS
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = Math.round(1000 / avgFrameTime);

        // Update FPS display
        fpsCounter.textContent = fps;

        // Update frame time display
        frameTimeElement.textContent = Math.round(frameTime);

        // Update memory usage if available
        if (performance.memory) {
            const memoryMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            memoryUsageElement.textContent = memoryMB;
        } else {
            memoryUsageElement.textContent = 'N/A';
        }

        lastPerformanceUpdate = now;
    }
}

function togglePerformanceMonitor() {
    isPerformanceMonitorVisible = !isPerformanceMonitorVisible;
    performanceMonitor.classList.toggle('hidden', !isPerformanceMonitorVisible);
}

function togglePlayerControls() {
    isPlayerControlsVisible = !isPlayerControlsVisible;
    playerControls.classList.toggle('hidden', !isPlayerControlsVisible);
}

// Helper function to find nearest enemy in range
function findNearestEnemyInRange(unit, range, allGameObjects) {
    // Check if this unit is valid
    if (!unit || unit.health <= 0) return null;

    let nearestEnemy = null;
    let nearestDistance = Infinity;

    allGameObjects.forEach(obj => {
        // Skip self, allies, neutral structures, or dead objects
        if (obj === unit || obj.health <= 0 || obj.isNeutralStructure || areAllies(unit.playerId, obj.playerId)) return;

        const distance = Math.hypot(obj.x - unit.x, obj.y - unit.y);
        // Check if within range and closer than current nearest
        if (distance <= range && distance < nearestDistance) {
            nearestEnemy = obj;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

// UI System is always visible, no toggle needed

// Function to update resource and supply display
function updateResourceSupplyDisplay() {
    const playerState = players[currentPlayerId];
    if (!playerState) return;

    // Update resource display
    const resourceValueElement = document.getElementById('resourceValue');
    if (resourceValueElement) {
        resourceValueElement.textContent = playerState.resources;
    }

    // Update supply display
    const supplyValueElement = document.getElementById('supplyValue');
    if (supplyValueElement) {
        supplyValueElement.textContent = `${playerState.currentSupply}/${playerState.supplyCap}`;
    }

}

// Function to update upgrade levels in the UI
function updateUpgradeLevels() {
    const upgrades = playerUpgrades[currentPlayerId];
    if (!upgrades) return;

    // Get all upgrade level indicators on page 4
    const page4 = document.querySelector('.ui-page[data-page="4"]');
    if (!page4) return;

    // Update armor upgrade level (Q button)
    const armorLevelElement = page4.querySelector('.ui-grid-button[data-action="action-q-p4"] .ui-upgrade-level');
    if (armorLevelElement) {
        // Display as "X/20" format
        armorLevelElement.textContent = `${upgrades.armor}/20`;

        // Update tooltip with new price
        const button = armorLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.armor >= 20) {
                button.dataset.tooltip = `Armor: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.armor);
                button.dataset.tooltip = `Armor: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update attack damage upgrade level (W button)
    const attackDamageLevelElement = page4.querySelector('.ui-grid-button[data-action="action-w-p4"] .ui-upgrade-level');
    if (attackDamageLevelElement) {
        // Display as "X/20" format
        attackDamageLevelElement.textContent = `${upgrades.attackDamage}/20`;

        // Update tooltip with new price
        const button = attackDamageLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.attackDamage >= 20) {
                button.dataset.tooltip = `Attack Damage: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.attackDamage);
                button.dataset.tooltip = `Attack Damage: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update weapon range upgrade level (E button)
    const weaponRangeLevelElement = page4.querySelector('.ui-grid-button[data-action="action-e-p4"] .ui-upgrade-level');
    if (weaponRangeLevelElement) {
        // Display as "X/20" format
        weaponRangeLevelElement.textContent = `${upgrades.weaponRange}/20`;

        // Update tooltip with new price
        const button = weaponRangeLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.weaponRange >= 20) {
                button.dataset.tooltip = `Weapon Range: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.weaponRange);
                button.dataset.tooltip = `Weapon Range: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update health regen upgrade level (R button)
    const healthRegenLevelElement = page4.querySelector('.ui-grid-button[data-action="action-r-p4"] .ui-upgrade-level');
    if (healthRegenLevelElement) {
        // Display as "X/20" format
        healthRegenLevelElement.textContent = `${upgrades.healthRegen}/20`;

        // Update tooltip with new price
        const button = healthRegenLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.healthRegen >= 20) {
                button.dataset.tooltip = `Health Regen: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.healthRegen);
                button.dataset.tooltip = `Health Regen: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update movement speed upgrade level (T button)
    const movementSpeedLevelElement = page4.querySelector('.ui-grid-button[data-action="action-t-p4"] .ui-upgrade-level');
    if (movementSpeedLevelElement) {
        // Display as "X/20" format
        movementSpeedLevelElement.textContent = `${upgrades.movementSpeed}/20`;

        // Update tooltip with new price
        const button = movementSpeedLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.movementSpeed >= 20) {
                button.dataset.tooltip = `Movement Speed: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.movementSpeed);
                button.dataset.tooltip = `Movement Speed: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update building armor upgrade level (A button)
    const buildingArmorLevelElement = page4.querySelector('.ui-grid-button[data-action="action-a-p4"] .ui-upgrade-level');
    if (buildingArmorLevelElement) {
        // Display as "X/20" format
        buildingArmorLevelElement.textContent = `${upgrades.buildingArmor}/20`;

        const button = buildingArmorLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.buildingArmor >= 20) {
                button.dataset.tooltip = `Building Armor: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.buildingArmor);
                button.dataset.tooltip = `Building Armor: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update building regen upgrade level (S button)
    const buildingRegenLevelElement = page4.querySelector('.ui-grid-button[data-action="action-s-p4"] .ui-upgrade-level');
    if (buildingRegenLevelElement) {
        // Display as "X/20" format
        buildingRegenLevelElement.textContent = `${upgrades.buildingRegen}/20`;

        const button = buildingRegenLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.buildingRegen >= 20) {
                button.dataset.tooltip = `Building Regen: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.buildingRegen);
                button.dataset.tooltip = `Building Regen: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update building capacity upgrade level (D button)
    const buildingCapacityLevelElement = page4.querySelector('.ui-grid-button[data-action="action-d-p4"] .ui-upgrade-level');
    if (buildingCapacityLevelElement) {
        // Display as "X/20" format
        buildingCapacityLevelElement.textContent = `${upgrades.buildingCapacity}/20`;

        const button = buildingCapacityLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.buildingCapacity >= 20) {
                button.dataset.tooltip = `Building Capacity: <span class="upgrade-price">MAX</span>`;
                // Turn button red when maxed
                button.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                const newPrice = getUpgradePrice(upgrades.buildingCapacity);
                button.dataset.tooltip = `Building Capacity: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Helper function to convert HSL to RGB
    function hslToRgb(hslColor) {
        const hslMatch = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (!hslMatch) return null;
        
        const h = parseInt(hslMatch[1]) / 360;
        const s = parseInt(hslMatch[2]) / 100;
        const l = parseInt(hslMatch[3]) / 100;
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = l - c / 2;
        
        let r, g, b;
        if (h < 1/6) { r = c; g = x; b = 0; }
        else if (h < 2/6) { r = x; g = c; b = 0; }
        else if (h < 3/6) { r = 0; g = c; b = x; }
        else if (h < 4/6) { r = 0; g = x; b = c; }
        else if (h < 5/6) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }

    // Update turret duration upgrade level (F button)
    const turretDurationLevelElement = page4.querySelector('.ui-grid-button[data-action="action-f-p4"] .ui-upgrade-level');
    if (turretDurationLevelElement) {
        // Display as "0/1" or "1/1" format
        turretDurationLevelElement.textContent = `${upgrades.turretDuration}/1`;

        const button = turretDurationLevelElement.closest('.ui-grid-button');
        if (button) {
            // If maxed out, don't show price in tooltip
            if (upgrades.turretDuration >= 1) {
                button.dataset.tooltip = `Turret Duration: <span class="upgrade-price">MAX</span>`;
                // Apply slightly transparent player color background
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.turretDuration);
                button.dataset.tooltip = `Turret Duration: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update tank splash upgrade level (G button)
    const tankSplashLevelElement = page4.querySelector('.ui-grid-button[data-action="action-g-p4"] .ui-upgrade-level');
    if (tankSplashLevelElement) {
        // Display as "0/1" or "1/1" format
        tankSplashLevelElement.textContent = `${upgrades.tankSplash}/1`;

        const button = tankSplashLevelElement.closest('.ui-grid-button');
        if (button) {
            // If maxed out, don't show price in tooltip
            if (upgrades.tankSplash >= 1) {
                button.dataset.tooltip = `Tank Splash: <span class="upgrade-price">MAX</span>`;
                // Apply slightly transparent player color background
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.tankSplash);
                button.dataset.tooltip = `Tank Splash: <span class="upgrade-price">${newPrice}</span>`;
                // Reset background if not maxed
                button.style.backgroundColor = '';
            }
        }
    }

    // Update combat shields upgrade level (Z button)
    const combatShieldsLevelElement = page4.querySelector('.ui-grid-button[data-action="action-z-p4"] .ui-upgrade-level');
    if (combatShieldsLevelElement) {
        combatShieldsLevelElement.textContent = `${upgrades.combatShields}/1`;
        const button = combatShieldsLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.combatShields >= 1) {
                button.dataset.tooltip = `Combat Shields: <span class="upgrade-price">MAX</span>`;
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.combatShields);
                button.dataset.tooltip = `Combat Shields: <span class="upgrade-price">${newPrice}</span>`;
                button.style.backgroundColor = '';
            }
        }
    }

    // Update jetpacks upgrade level (X button)
    const jetpacksLevelElement = page4.querySelector('.ui-grid-button[data-action="action-x-p4"] .ui-upgrade-level');
    if (jetpacksLevelElement) {
        jetpacksLevelElement.textContent = `${upgrades.jetpacks}/1`;
        const button = jetpacksLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.jetpacks >= 1) {
                button.dataset.tooltip = `Jetpacks: <span class="upgrade-price">MAX</span>`;
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.jetpacks);
                button.dataset.tooltip = `Jetpacks: <span class="upgrade-price">${newPrice}</span>`;
                button.style.backgroundColor = '';
            }
        }
    }

    // Update stim upgrade level (C button)
    const stimLevelElement = page4.querySelector('.ui-grid-button[data-action="action-c-p4"] .ui-upgrade-level');
    if (stimLevelElement) {
        stimLevelElement.textContent = `${upgrades.stim}/1`;
        const button = stimLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.stim >= 1) {
                button.dataset.tooltip = `Stim: <span class="upgrade-price">MAX</span>`;
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.stim);
                button.dataset.tooltip = `Stim: <span class="upgrade-price">${newPrice}</span>`;
                button.style.backgroundColor = '';
            }
        }
    }

    // Update concussive blast upgrade level (V button)
    const concussiveBlastLevelElement = page4.querySelector('.ui-grid-button[data-action="action-v-p4"] .ui-upgrade-level');
    if (concussiveBlastLevelElement) {
        concussiveBlastLevelElement.textContent = `${upgrades.concussiveBlast}/1`;
        const button = concussiveBlastLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.concussiveBlast >= 1) {
                button.dataset.tooltip = `Concussive Blast: <span class="upgrade-price">MAX</span>`;
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.concussiveBlast);
                button.dataset.tooltip = `Concussive Blast: <span class="upgrade-price">${newPrice}</span>`;
                button.style.backgroundColor = '';
            }
        }
    }

    // Update tank artillery upgrade level (B button)
    const tankArtilleryLevelElement = page4.querySelector('.ui-grid-button[data-action="action-b-p4"] .ui-upgrade-level');
    if (tankArtilleryLevelElement) {
        tankArtilleryLevelElement.textContent = `${upgrades.tankArtillery}/1`;
        const button = tankArtilleryLevelElement.closest('.ui-grid-button');
        if (button) {
            if (upgrades.tankArtillery >= 1) {
                button.dataset.tooltip = `Tank Artillery: <span class="upgrade-price">MAX</span>`;
                const playerData = players[currentPlayerId];
                if (playerData && playerData.color) {
                    const rgb = hslToRgb(playerData.color);
                    if (rgb) {
                        button.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
                    }
                }
            } else {
                const newPrice = getUpgradePrice(upgrades.tankArtillery);
                button.dataset.tooltip = `Tank Artillery: <span class="upgrade-price">${newPrice}</span>`;
                button.style.backgroundColor = '';
            }
        }
    }

    // Update the top-left upgrade display
    updateUpgradeDisplay();
}

// Function to update the top-left upgrade display (shows upgrades for current player's team)
function updateUpgradeDisplay() {
    const upgradeDisplay = document.getElementById('upgradeDisplay');
    if (!upgradeDisplay) return;

    // Get current player's team
    const currentPlayer = players[currentPlayerId];
    if (!currentPlayer) {
        upgradeDisplay.classList.add('hidden');
        return;
    }

    const currentTeam = currentPlayer.team;
    
    // Show the upgrade display
    upgradeDisplay.classList.remove('hidden');

    // Hide all team sections first
    const allTeamSections = document.querySelectorAll('.upgrade-section.team-section');
    allTeamSections.forEach(section => {
        section.classList.remove('visible');
    });

    // Show only the current team's sections
    const currentTeamSections = document.querySelectorAll(`.upgrade-section.team-section[data-team="${currentTeam}"]`);
    currentTeamSections.forEach(section => {
        section.classList.add('visible');
    });

    // Update all players' upgrades (we update all, but only show current team)
    for (let playerId = 1; playerId <= 8; playerId++) {
        const playerUpgrade = playerUpgrades[playerId];
        const playerData = players[playerId];
        
        if (!playerUpgrade || !playerData) continue;

        const playerColor = playerData.color;

        // Update each upgrade value
        const armorEl = document.getElementById(`p${playerId}-armor`);
        const attackDamageEl = document.getElementById(`p${playerId}-attackDamage`);
        const weaponRangeEl = document.getElementById(`p${playerId}-weaponRange`);
        const healthRegenEl = document.getElementById(`p${playerId}-healthRegen`);
        const movementSpeedEl = document.getElementById(`p${playerId}-movementSpeed`);

        if (armorEl) {
            armorEl.textContent = playerUpgrade.armor;
            armorEl.style.color = playerColor;
        }
        if (attackDamageEl) {
            attackDamageEl.textContent = playerUpgrade.attackDamage;
            attackDamageEl.style.color = playerColor;
        }
        if (weaponRangeEl) {
            weaponRangeEl.textContent = playerUpgrade.weaponRange;
            weaponRangeEl.style.color = playerColor;
        }
        if (healthRegenEl) {
            healthRegenEl.textContent = playerUpgrade.healthRegen;
            healthRegenEl.style.color = playerColor;
        }
        if (movementSpeedEl) {
            movementSpeedEl.textContent = playerUpgrade.movementSpeed;
            movementSpeedEl.style.color = playerColor;
        }

        // Update worker supply display
        const workerSupplyEl = document.getElementById(`p${playerId}-workerSupply`);
        if (workerSupplyEl) {
            workerSupplyEl.textContent = playerData.workerSupplyCap;
            workerSupplyEl.style.color = playerColor;
        }
    }
}

// Function to execute worker placement at specified position
function executeWorkerPlacement(targetX, targetY) {
    const playerState = players[currentPlayerId];
    if (!playerState) return;
    
    const MORE_WORKERS_COST = 25;
    
    // Check if player has enough resources
    if (playerState.resources < MORE_WORKERS_COST) {
        return; // Not enough resources
    }
    
    // Check if placement is valid (not on units)
    let unitAtLocation = false;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < obj.size / 2 + 17) { // 17 is half worker size
            // Check if it's a unit or building
            if (obj.type === 'marine' || obj.type === 'reaper' || obj.type === 'marauder' || 
                obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'worker' || obj.type === 'unit' ||
                obj.isBuilding) {
                unitAtLocation = true;
                break;
            }
        }
    }
    
    if (unitAtLocation) {
        return; // Cannot place on units or buildings
    }
    
    // Deduct resources
    playerState.resources -= MORE_WORKERS_COST;
    
    // Increase worker supply cap
    playerState.workerSupplyCap += 1;
    
    // Spawn falling worker at target location
    spawnFallingWorker(targetX, targetY, currentPlayerId);
    
    // Update displays
    updateResourceSupplyDisplay();
    updateUpgradeDisplay();
}

// Function to execute turret placement at specified position
function executeTurretPlacement(targetX, targetY, worker) {
    if (!worker || worker.health <= 0) return;
    
    const playerState = players[worker.playerId];
    if (!playerState || playerState.resources < TURRET_COST) {
        return; // Not enough resources
    }
    
    // Check throw range
    const dist = Math.hypot(targetX - worker.x, targetY - worker.y);
    if (dist > TURRET_THROW_RANGE) {
        return; // Out of range
    }
    
    // Check if placement is on a unit (not allowed)
    let unitAtLocation = false;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        if (obj === worker) continue;
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < obj.size / 2 + 20) { // 20 is turret radius
            // Check if it's a unit (not a building)
            if (obj.type === 'marine' || obj.type === 'reaper' || obj.type === 'marauder' || 
                obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'worker' || obj.type === 'unit') {
                unitAtLocation = true;
                break;
            }
        }
    }
    
    if (unitAtLocation) {
        return; // Cannot place on units
    }
    
    // Check if turret overlaps with another turret at the base (not allowed)
    // But allow edge overlaps
    let turretTooClose = false;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        if (obj.type !== 'turret') continue;
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < 30) { // Base overlap threshold (smaller than size to allow edge overlap)
            turretTooClose = true;
            break;
        }
    }
    
    if (turretTooClose) {
        return; // Too close to another turret base
    }
    
    // Deduct resources
    playerState.resources -= TURRET_COST;
    updateResourceSupplyDisplay();
    
    // Push units away if they're in the landing zone
    const turretRadius = 20;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        if (obj === worker) continue;
        if (obj.type !== 'marine' && obj.type !== 'reaper' && obj.type !== 'marauder' && 
            obj.type !== 'ghost' && obj.type !== 'tank' && obj.type !== 'worker' && obj.type !== 'unit') {
            continue;
        }
        
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < turretRadius + obj.size / 2) {
            // Push unit away
            const angle = Math.atan2(obj.y - targetY, obj.x - targetX);
            const pushDist = turretRadius + obj.size / 2 - objDist + 5; // Extra 5 pixels
            obj.x += Math.cos(angle) * pushDist;
            obj.y += Math.sin(angle) * pushDist;
            
            // Keep within map bounds
            obj.x = Math.max(obj.size / 2, Math.min(MAP_WIDTH - obj.size / 2, obj.x));
            obj.y = Math.max(obj.size / 2, Math.min(MAP_HEIGHT - obj.size / 2, obj.y));
        }
    }
    
    // Create throwing animation instead of instant placement
    const THROW_DURATION = 600; // Duration of throw animation in milliseconds
    throwingTurrets.push({
        startX: worker.x,
        startY: worker.y,
        targetX: targetX,
        targetY: targetY,
        playerId: worker.playerId,
        startTime: performance.now(),
        duration: THROW_DURATION
    });
}

// Function to execute turret placement at specified position
function executeTurretPlacement(targetX, targetY, worker) {
    if (!worker || worker.health <= 0) return;
    
    const playerState = players[worker.playerId];
    if (!playerState || playerState.resources < TURRET_COST) {
        return; // Not enough resources
    }
    
    // Check throw range
    const dist = Math.hypot(targetX - worker.x, targetY - worker.y);
    if (dist > TURRET_THROW_RANGE) {
        return; // Out of range
    }
    
    // Check if placement is on a unit (not allowed)
    let unitAtLocation = false;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        if (obj === worker) continue;
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < obj.size / 2 + 20) { // 20 is turret radius
            // Check if it's a unit (not a building)
            if (obj.type === 'marine' || obj.type === 'reaper' || obj.type === 'marauder' || 
                obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'worker' || obj.type === 'unit') {
                unitAtLocation = true;
                break;
            }
        }
    }
    
    if (unitAtLocation) {
        return; // Cannot place on units
    }
    
    // Check if turret overlaps with another turret at the base (not allowed)
    // But allow edge overlaps
    let turretTooClose = false;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        if (obj.type !== 'turret') continue;
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < 30) { // Base overlap threshold (smaller than size to allow edge overlap)
            turretTooClose = true;
            break;
        }
    }
    
    if (turretTooClose) {
        return; // Too close to another turret base
    }
    
    // Deduct resources
    playerState.resources -= TURRET_COST;
    updateResourceSupplyDisplay();
    
    // Push units away if they're in the landing zone
    const turretRadius = 20;
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;
        if (obj === worker) continue;
        if (obj.type !== 'marine' && obj.type !== 'reaper' && obj.type !== 'marauder' && 
            obj.type !== 'ghost' && obj.type !== 'tank' && obj.type !== 'worker' && obj.type !== 'unit') {
            continue;
        }
        
        const objDist = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (objDist < turretRadius + obj.size / 2) {
            // Push unit away
            const angle = Math.atan2(obj.y - targetY, obj.x - targetX);
            const pushDist = turretRadius + obj.size / 2 - objDist + 5; // Extra 5 pixels
            obj.x += Math.cos(angle) * pushDist;
            obj.y += Math.sin(angle) * pushDist;
            
            // Keep within map bounds
            obj.x = Math.max(obj.size / 2, Math.min(MAP_WIDTH - obj.size / 2, obj.x));
            obj.y = Math.max(obj.size / 2, Math.min(MAP_HEIGHT - obj.size / 2, obj.y));
        }
    }
    
    // Create throwing animation instead of instant placement
    const THROW_DURATION = 600; // Duration of throw animation in milliseconds
    throwingTurrets.push({
        startX: worker.x,
        startY: worker.y,
        targetX: targetX,
        targetY: targetY,
        playerId: worker.playerId,
        startTime: performance.now(),
        duration: THROW_DURATION
    });
}

// Function to execute nuke at specified position
function executeNuke(centerX, centerY) {
    const now = performance.now();
    
    // Nuke size is a tile (square area)
    const nukeSize = TILE_WIDTH; // Square size matching a tile
    const halfSize = nukeSize / 2;
    
    // Calculate square bounds
    const nukeLeft = centerX - halfSize;
    const nukeRight = centerX + halfSize;
    const nukeTop = centerY - halfSize;
    const nukeBottom = centerY + halfSize;
    
    // Add nuke blast effect (visible to all players)
    attackEffects.push({
        type: 'nuke',
        x: centerX,
        y: centerY,
        size: nukeSize,
        timestamp: now,
        duration: 800 // 800ms animation duration
    });

    // Find all units and buildings within the nuke square
    gameObjects.forEach(obj => {
        if (obj.health <= 0) return; // Skip already dead objects

        // Check if object overlaps with the nuke square
        const objLeft = obj.x - obj.size / 2;
        const objRight = obj.x + obj.size / 2;
        const objTop = obj.y - obj.size / 2;
        const objBottom = obj.y + obj.size / 2;

        // Check for overlap with nuke square
        const isInSquare = !(objRight < nukeLeft || objLeft > nukeRight || objBottom < nukeTop || objTop > nukeBottom);

        if (isInSquare) {
            // Check if it's a building by type
            if (obj.type === 'bunker' || obj.type === 'supplyDepot' || 
                obj.type === 'shieldTower' || obj.type === 'sensorTower' ||
                obj.isBuilding) {
                // Damage buildings for 50% of their HP
                const damage = Math.floor(obj.maxHealth * 0.5);
                obj.takeDamage(damage);
            } else if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || 
                       obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank') {
                // Kill all units instantly
                obj.health = 0;
                obj.isDestroyed = true;
            }
        }
    });
}

// Function to update resources (passive income)
function updateResources(now) {
    if (now - lastResourceUpdateTime >= resourceUpdateInterval) {
        // Add resources to all players
        Object.keys(players).forEach(playerId => {
            players[playerId].resources += resourceIncomeRate;
        });

        lastResourceUpdateTime = now;

        // Update the display
        updateResourceSupplyDisplay();
    }
}

// Function to update the game timer
function updateGameTimer() {
    // Calculate elapsed time in seconds
    gameTimeInSeconds = Math.floor((Date.now() - gameStartTime) / 1000);

    // Convert to minutes and seconds
    const minutes = Math.floor(gameTimeInSeconds / 60);
    const seconds = gameTimeInSeconds % 60;

    // Format with leading zeros
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Update the timer display
    gameTimerElement.textContent = formattedTime;
}

// Simple game loop
function gameLoop() {
    const now = performance.now();

    // Update performance metrics
    updatePerformanceMetrics(now);

    const simulateFrame = !isGamePaused;

    if (simulateFrame) {
        // Update resources (passive income)
        updateResources(now);

        // Update game timer
        updateGameTimer();

        // Update edge scrolling
        updateEdgeScrolling();

        // 1. Update game object states
        gameObjects.forEach(obj => {
            if (obj.update) {
                if (obj.type === 'bunker') {
                    if (typeof obj.update === 'function') {
                        obj.update(now, gameObjects, players);
                    }
                } else if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'turret') {
                    if (typeof obj.update === 'function') {
                        obj.update(now, gameObjects);
                    }
                } else if (obj.type === 'sightTower') {
                    if (typeof obj.update === 'function') {
                        obj.update(now, gameObjects);
                    }
                }
            }
        });

        // 2. Resolve collisions
        resolveUnitCollisions(gameObjects);

        // Safety clamp after collisions
        gameObjects.forEach(obj => {
            if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank') { // Only clamp units
                const halfSize = obj.size / 2;
                obj.x = Math.max(halfSize, Math.min(MAP_WIDTH - halfSize, obj.x));
                obj.y = Math.max(halfSize, Math.min(MAP_HEIGHT - halfSize, obj.y));
            }
        });

        // Update fog of war for all teams
        if (fogOfWar) {
            Object.keys(teams).forEach(teamId => {
                fogOfWar.updateTeamVision(parseInt(teamId), gameObjects);
            });
        }

        // 3. Handle deaths and target cleanup + Supply Update
        const livingObjects = [];
        let supplyChanged = false;

        gameObjects.forEach(obj => {
            if (obj.health > 0) {
                livingObjects.push(obj);
            } else {
                // Object died


                // Find the killer (last unit that attacked this object)
                let killer = null;
                gameObjects.forEach(attacker => {
                    if (attacker.targetUnit && attacker.targetUnit.id === obj.id) {
                        killer = attacker;
                        attacker.targetUnit = null;
                        if (attacker.commandState === 'attacking') attacker.commandState = 'idle';
                    }
                });

                // Award resources to the killer's player if it's an enemy kill
                if (killer && !areAllies(killer.playerId, obj.playerId)) {
                    const killerPlayer = players[killer.playerId];
                    if (killerPlayer) {
                        let resourceAmount = 0;
                        if (obj.type === 'worker') resourceAmount = RESOURCE_GAIN_WORKER;
                        else if (obj.type === 'bunker') resourceAmount = RESOURCE_GAIN_BUNKER;
                        else if (obj.type === 'supplyDepot') resourceAmount = RESOURCE_GAIN_SUPPLY_DEPOT;
                        else if (obj.type === 'shieldTower' || obj.type === 'sensorTower') resourceAmount = RESOURCE_GAIN_TOWER;
                        else if (obj.type === 'turret') resourceAmount = RESOURCE_GAIN_TURRET;
                        else resourceAmount = RESOURCE_GAIN_UNIT;
                        killerPlayer.resources += resourceAmount;
                        killerPlayer.killResourceScore += resourceAmount;
                        createResourceGainText(obj.x, obj.y, resourceAmount, obj.type !== 'unit', killer.playerId);
                        updateScoreboard(players);
                    }
                }

                // Handle supply changes
                if (obj.type === 'worker') {
                    const playerState = players[obj.playerId];
                    if (playerState) {
                        playerState.currentWorkerSupply = Math.max(0, playerState.currentWorkerSupply - (obj.workerSupplyCost || WORKER_SUPPLY_COST));
                        supplyChanged = true;
                    }
                    scheduleWorkerRespawn(obj.playerId);
                    selectedUnits = selectedUnits.filter(selected => selected.id !== obj.id);
                } else if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost') {
                    const playerState = players[obj.playerId];
                    if (playerState) {
                         playerState.currentSupply = Math.max(0, playerState.currentSupply - obj.supplyCost);

                     }
                    selectedUnits = selectedUnits.filter(selected => selected.id !== obj.id);
                    supplyChanged = true;
                }

                // If this was the last bunker for the player, eliminate all their assets
                if (obj.type === 'bunker') {
                    const playerId = obj.playerId;
                    const hasAnotherBunker = hasLiveBunker(playerId, obj.id);
                    if (!hasAnotherBunker) {
                        eliminatePlayerAssets(playerId);
                    }
                }
            }
        });
        gameObjects.length = 0;
        gameObjects.push(...livingObjects);
        gameObjects.forEach(obj => {
            if (obj.targetUnit && obj.targetUnit.health <= 0) {
                obj.targetUnit = null;
                if (obj.commandState === 'attacking') obj.commandState = 'idle';
            }
        });

        if (supplyChanged) {
            updateResourceSupplyDisplay();
        }
    } else {
        // Still allow edge scrolling velocity reset while paused
        updateEdgeScrolling();
    }

    // --- Rendering ---
    const uiDrawQueue = [];

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(context);

    // Pass 1: Draw bodies and collect UI commands
    gameObjects.forEach(obj => {
        const isSelected = selectedUnits.some(sel => sel.id === obj.id);
        
        // Check if this object should be visible to the current player
        let shouldRender = true;
        let isSensorDetected = false;
        
        // Always render objects belonging to the current player's team
        const currentPlayerData = players[currentPlayerId];
        const objPlayerData = players[obj.playerId];
        
        if (currentPlayerData && objPlayerData && fogOfWar) {
            // If the object belongs to a different team, check visibility
            if (currentPlayerData.team !== objPlayerData.team) {
                const isVisible = fogOfWar.isVisibleToPlayer(currentPlayerId, obj.x, obj.y);
                
                // Check if detected by sensor towers (even if in fog of war)
                if (!isVisible) {
                    isSensorDetected = isDetectedBySensorTowers(obj.x, obj.y, objPlayerData.team);
                    shouldRender = isSensorDetected; // Only render if sensor detected
                } else {
                    shouldRender = true;
                }
            }
        }
        
        if (shouldRender) {
            if (isSensorDetected) {
                // Draw white outline silhouette for sensor-detected units/buildings
                drawSensorDetectedSilhouette(context, obj);
            } else {
                // Normal rendering
                if (obj.drawBody) obj.drawBody(context, isSelected);
                if (obj.getUIDrawCommands) {
                    uiDrawQueue.push(...obj.getUIDrawCommands(isSelected));
                }
            }
        }
    });

    // Draw Attack Effects (after bodies, before UI?)
    drawAttackEffects(context, now);
    
    // Update and draw repair effects
    updateAndDrawRepairEffects(context, now);

    // Update and draw falling workers
    updateFallingWorkers(context, now);
    
    // Update and draw throwing turrets
    updateThrowingTurrets(context, now);

    // Update and draw floating texts
    updateFloatingTexts(now, context);

    // Render fog of war for current player
    if (fogOfWar) {
        fogOfWar.renderFogOverlay(context, currentPlayerId);
    }

    // Pass 2: Draw UI elements from the queue
    // Reset context properties that might interfere
    context.textAlign = 'center';
    context.setLineDash([]); // Clear line dashing

    // Execute each command from the UI draw queue
    uiDrawQueue.forEach(command => {
        executeDrawCommand(context, command);
    });

    // Draw the minimap at reduced frequency (30fps instead of 60fps)
    if (now - lastMinimapUpdate >= MINIMAP_UPDATE_INTERVAL) {
        drawMinimap();
        lastMinimapUpdate = now;
    }

    // 4. Draw selection rectangle
    drawSelectionRect(context);

    // 5. Draw movement markers
    drawMovementMarkers(context, now);

    // Request next frame
    requestAnimationFrame(gameLoop);
}

// --- Initial Setup ---
window.addEventListener('load', () => {
    // Wait for modules to load, then show main menu
    setTimeout(() => {
        if (window.mainMenu) {
            window.mainMenu.show();
        } else {
            console.warn('Main menu not initialized yet');
            // Try again after a short delay
            setTimeout(() => {
                if (window.mainMenu) {
                    window.mainMenu.show();
                } else {
                    console.error('Main menu failed to initialize');
                }
            }, 500);
        }
    }, 100);

    // Connect to server
    if (window.clientNetwork) {
        // Wait a moment for socket.io to load, then connect
        setTimeout(() => {
            window.clientNetwork.connect();
        }, 100);
        
        // Set up connection handlers
        window.clientNetwork.onConnected = () => {
            if (window.mainMenu) {
                window.mainMenu.updateConnectionStatus(true);
                window.mainMenu.refreshLobbies();
            }
        };

        window.clientNetwork.onDisconnected = () => {
            if (window.mainMenu) {
                window.mainMenu.updateConnectionStatus(false);
            }
        };

        // When player joins a room, hide main menu and show lobby manager
        window.clientNetwork.socket?.on('CONNECTED', (data) => {
            if (window.mainMenu) {
                window.mainMenu.hide();
            }
            
            // Show lobby manager if not spectator
            if (!data.isSpectator && window.lobbyManager) {
                // Request lobby state to show lobby manager
                setTimeout(() => {
                    window.clientNetwork.requestLobbyState();
                }, 100);
            }
            
            // Don't show game canvas until game starts
            // The lobby manager will handle showing pregame overlay when game starts
        });
        
        // Show lobby manager when lobby state is received
        window.clientNetwork.socket?.on('LOBBY_STATE', (data) => {
            console.log('Received LOBBY_STATE:', data);
            if (window.lobbyManager && window.clientNetwork && !window.clientNetwork.isSpectator) {
                const stateWithMe = {
                    ...data,
                    myPlayerId: window.clientNetwork.playerId
                };
                console.log('Showing lobby manager with state:', stateWithMe);
                window.lobbyManager.show(stateWithMe);
            }
        });
        
        // Set up GAME_START handler via callback
        window.clientNetwork.onGameStart = () => {
            console.log('GAME_START handler executing via callback...');
            handleGameStart();
        };
        
        // Also listen for custom event
        window.addEventListener('gameStart', () => {
            console.log('GAME_START handler executing via custom event...');
            handleGameStart();
        });
        
        // Function to handle game start
        function handleGameStart() {
            console.log('handleGameStart called');
            
            // Hide main menu overlay
            if (window.mainMenu) {
                console.log('Hiding main menu...');
                window.mainMenu.hide();
            }
            
            // Hide lobby manager
            if (window.lobbyManager) {
                console.log('Hiding lobby manager...');
                window.lobbyManager.hide();
            }
            
            // Show game canvas
            const main = document.querySelector('main');
            if (main) {
                console.log('Showing game canvas...');
                main.classList.remove('hidden');
            } else {
                console.error('Main element not found!');
            }
            
            // Initialize game if not already initialized
            if (gameObjects.length === 0) {
                console.log('Initializing game...');
                setupGame();
                initializeUISystem();
                
                // Initialize Chat System
                chatSystem = new ChatSystem();
                window.chatSystem = chatSystem;
                
                // Connect chat to network
                window.clientNetwork.onChatMessage = (data) => {
                    if (chatSystem) {
                        chatSystem.receiveMessage(data);
                    }
                };
                
                initializePregameOverlay();
                
                // Show pregame overlay
                if (pregameOverlay) {
                    console.log('Showing pregame overlay...');
                    pregameOverlay.classList.remove('hidden');
                }
                
                // Ensure game is paused initially
                setGamePaused(true);
                
                console.log('Starting game loop...');
                gameLoop();
            } else {
                console.log('Game already initialized, skipping setup');
            }
        }
    } else {
        // Fallback: initialize game immediately if network not available
        setupGame();
        initializeUISystem();
        initializePregameOverlay();
        gameLoop();
    }
});

// Initialize the UI System with action handlers
function initializeUISystem() {
    // Use the global CommandCardUI class
    uiSystem = new window.CommandCardUI();
    uiSystem.setAccentColor(players?.[currentPlayerId]?.color);

    // Set up action handlers for the UI buttons
    // Page 1 - Combat Actions
    uiSystem.setActionHandler('action-q', () => {});
    uiSystem.setActionHandler('action-w', () => {});
    uiSystem.setActionHandler('action-e', () => {});
    uiSystem.setActionHandler('action-r', () => {});
    uiSystem.setActionHandler('action-t', () => {
        // Tank siege toggle (if tanks are selected)
        const tanks = selectedUnits.filter(u => u.type === 'tank' && u.playerId === currentPlayerId);
        if (tanks.length > 0) {
            tanks.forEach(t => t.toggleSiege());
            updateTankSiegeButtonState();
            return;
        }
        
        // Stim ability (if Stim upgrade is purchased and marines/marauders are selected)
        const upgrades = playerUpgrades[currentPlayerId];
        if (upgrades && upgrades.stim > 0) {
            const stimUnits = selectedUnits.filter(u => 
                (u.type === 'marine' || u.type === 'marauder') && 
                u.playerId === currentPlayerId &&
                u.health > 0
            );
            
            if (stimUnits.length > 0) {
                const now = performance.now();
                stimUnits.forEach(unit => {
                    // Activate Stim
                    unit.isStimmed = true;
                    unit.stimStartTime = now;
                    unit.stimDuration = 3000; // 3 seconds
                    
                    // Store base stats if not already stored (before applying Stim)
                    if (unit.baseAttackSpeed === undefined) {
                        unit.baseAttackSpeed = unit.attackSpeed;
                    }
                    if (unit.baseMovementSpeedStim === undefined) {
                        // Store current movement speed (which may include upgrades)
                        unit.baseMovementSpeedStim = unit.movementSpeed;
                    }
                    if (unit.baseSpeedStim === undefined) {
                        // Also store the speed property which is used for movement
                        unit.baseSpeedStim = unit.speed;
                    }
                    
                    // Increase attack speed by 50% and movement speed by 50%
                    unit.attackSpeed = unit.baseAttackSpeed * 1.5;
                    unit.movementSpeed = unit.baseMovementSpeedStim * 1.5;
                    unit.speed = unit.baseSpeedStim * 1.5; // Update speed property used for movement
                    unit.attackCooldown = 1000 / unit.attackSpeed;
                    
                    // Lose 10 HP
                    unit.health = Math.max(1, unit.health - 10);
                });
            }
        }
    });

    // Page 5 - Tank Actions
    uiSystem.setActionHandler('action-q-p5', () => {
        // Tank siege toggle
        const tanks = selectedUnits.filter(u => u.type === 'tank' && u.playerId === currentPlayerId);
        if (tanks.length === 0) return;
        tanks.forEach(t => t.toggleSiege());
        updateTankSiegeButtonState();
    });

    uiSystem.setActionHandler('action-a', () => {

        if (selectedUnits.some(unit => (unit.type === 'marine' || unit.type === 'reaper' || unit.type === 'marauder' || unit.type === 'ghost' || unit.type === 'tank') && unit.playerId === currentPlayerId)) {
            isAMoveMode = true;
        }
    });

    // Set up other action handlers for page 1
    uiSystem.setActionHandler('action-s', () => {});
    uiSystem.setActionHandler('action-d', () => {});
    uiSystem.setActionHandler('action-f', () => {});
    uiSystem.setActionHandler('action-g', () => {});
    uiSystem.setActionHandler('action-z', () => {});
    uiSystem.setActionHandler('action-x', () => {});
    uiSystem.setActionHandler('action-c', () => {});
    uiSystem.setActionHandler('action-v', () => {});
    uiSystem.setActionHandler('action-b', () => {});

    // Page 2 - Building Actions
    uiSystem.setActionHandler('action-q-p2', () => {});
    uiSystem.setActionHandler('action-w-p2', () => {});
    uiSystem.setActionHandler('action-e-p2', () => {});
    uiSystem.setActionHandler('action-r-p2', () => {});
    uiSystem.setActionHandler('action-t-p2', () => {});

    // Set up other action handlers for page 2
    uiSystem.setActionHandler('action-a-p2', () => {});
    uiSystem.setActionHandler('action-s-p2', () => {});
    uiSystem.setActionHandler('action-d-p2', () => {});
    uiSystem.setActionHandler('action-f-p2', () => {});
    uiSystem.setActionHandler('action-g-p2', () => {});
    uiSystem.setActionHandler('action-z-p2', () => {});
    uiSystem.setActionHandler('action-x-p2', () => {});
    uiSystem.setActionHandler('action-c-p2', () => {});
    uiSystem.setActionHandler('action-v-p2', () => {});
    uiSystem.setActionHandler('action-b-p2', () => {});

    // Page 3 - Worker Building Actions & Unit Commands

    // Unit Commands (Top Row)
    // Move (Q) - Visual button for right-click move command
    uiSystem.setActionHandler('action-q-p3', () => {
        // Move command is handled by right-click, this is just a visual button
        // No action needed as right-click already handles move commands
    });

    // Stop (W) - Stop all current actions and enter idle state
    uiSystem.setActionHandler('action-w-p3', () => {
        const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank', 'worker'];
        const commandableUnits = selectedUnits.filter(obj => 
            commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId
        );
        
        commandableUnits.forEach(unit => {
            unit.commandState = 'idle';
            unit.targetUnit = null;
            unit.targetX = unit.x;
            unit.targetY = unit.y;
            // Clear any movement targets
            if (unit.aMoveTargetX !== undefined) {
                unit.aMoveTargetX = unit.x;
                unit.aMoveTargetY = unit.y;
            }
        });
    });

    // Hold (E) - Hold position, don't move, can fire
    uiSystem.setActionHandler('action-e-p3', () => {
        const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank', 'worker'];
        const commandableUnits = selectedUnits.filter(obj => 
            commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId
        );
        
        commandableUnits.forEach(unit => {
            unit.commandState = 'hold';
            unit.targetX = unit.x;
            unit.targetY = unit.y;
            // Units can still attack while holding
        });
    });

    // Patrol (R) - Walk back and forth between patrol points
    // When shift-clicking, adds additional patrol points
    uiSystem.setActionHandler('action-r-p3', () => {
        const commandableUnitTypes = ['marine', 'reaper', 'marauder', 'ghost', 'tank', 'worker'];
        const commandableUnits = selectedUnits.filter(obj => 
            commandableUnitTypes.includes(obj.type) && obj.playerId === currentPlayerId
        );
        
        // Set patrol mode - units will need a target location
        // For now, set to patrol mode and use current position as first patrol point
        // Actual patrol points will be set when right-clicking
        commandableUnits.forEach(unit => {
            unit.commandState = 'patrol';
            if (!unit.patrolPoints) {
                unit.patrolPoints = [];
            }
            // If no patrol points exist, use current position
            if (unit.patrolPoints.length === 0) {
                unit.patrolPoints = [{ x: unit.x, y: unit.y }];
            }
            unit.currentPatrolIndex = 0;
        });
    });

    // Repair (T) - Toggleable: workers auto-repair nearest damaged building
    uiSystem.setActionHandler('action-t-p3', () => {
        repairModeEnabled = !repairModeEnabled;
        // Update button visual state
        uiSystem.updateButtonState('action-t-p3', repairModeEnabled);
    });

    // Empty buttons (A, S)
    uiSystem.setActionHandler('action-a-p3', () => {});
    uiSystem.setActionHandler('action-s-p3', () => {});

    // Building Actions (Third Row)
    // Build Bunker (Z)
    uiSystem.setActionHandler('action-z-p3', () => {
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('bunker')) {
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Supply Depot (X)
    uiSystem.setActionHandler('action-x-p3', () => {
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('supplyDepot')) {
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Control Tower (C) - Using Sensor Tower
    uiSystem.setActionHandler('action-c-p3', () => {
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('sensorTower')) {
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Shield Tower (V)
    uiSystem.setActionHandler('action-v-p3', () => {
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('shieldTower')) {
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Turret (B)
    uiSystem.setActionHandler('action-b-p3', () => {
        const selectedWorkers = selectedUnits.filter(obj => 
            obj.type === 'worker' && obj.playerId === currentPlayerId && obj.health > 0
        );
        
        if (selectedWorkers.length === 0) {
            return;
        }
        
        const playerState = players[currentPlayerId];
        if (!playerState || playerState.resources < TURRET_COST) {
            return;
        }
        
        turretPlacementWorker = selectedWorkers[0];
        turretPlacementMode = true;
        
        // Cancel other placement modes
        nukePlacementMode = false;
        buildingPlacementMode = false;
        buildingTypeToPlace = null;
        buildingWorkers = [];
    });

    // Build Tanks (D)
    uiSystem.setActionHandler('action-d-p3', () => {
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            
            if (workers.length > 0) {
                if (buildingPlacementMode && buildingTypeToPlace === 'tank') {
                    const existingWorkerIds = new Set(buildingWorkers.map(w => w.id));
                    const newWorkers = workers.filter(w => !existingWorkerIds.has(w.id) && w.commandState !== 'building');
                    buildingWorkers = [...buildingWorkers, ...newWorkers];
                } else {
                    let workerToUse = workers.find(w => w.commandState !== 'building') || workers[0];
                    if (workerToUse.startBuildingPlacement('tank')) {
                        buildingWorkers = workers;
                    }
                }
            }
        }
    });

    // More Workers (F)
    uiSystem.setActionHandler('action-f-p3', () => {
        const playerState = players[currentPlayerId];
        if (!playerState) return;

        const MORE_WORKERS_COST = 25;
        if (playerState.resources < MORE_WORKERS_COST) {
            return;
        }
        
        workerPlacementMode = true;
        nukePlacementMode = false;
        turretPlacementMode = false;
        turretPlacementWorker = null;
        buildingPlacementMode = false;
        buildingTypeToPlace = null;
        buildingWorkers = [];
    });

    // Nuke (G)
    uiSystem.setActionHandler('action-g-p3', () => {
        nukePlacementMode = true;
        buildingPlacementMode = false;
        buildingTypeToPlace = null;
        buildingWorkers = [];
    });

    // Page 4 - Unit Upgrades
    // Armor Upgrade (Q)
    uiSystem.setActionHandler('action-q-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.armor;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.armor++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'turret') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

        
        } else {
        
        }
    });

    // Attack Damage Upgrade (W)
    uiSystem.setActionHandler('action-w-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.attackDamage;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.attackDamage++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'turret') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

        
        } else {
        
        }
    });

    // Weapon Range Upgrade (E)
    uiSystem.setActionHandler('action-e-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.weaponRange;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.weaponRange++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'turret') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

        
        } else {
        
        }
    });

    // Health Regen Upgrade (R)
    uiSystem.setActionHandler('action-r-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.healthRegen;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.healthRegen++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'turret') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

        
        } else {
        
        }
    });

    // Movement Speed Upgrade (T)
    uiSystem.setActionHandler('action-t-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.movementSpeed;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.movementSpeed++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker' || obj.type === 'reaper' || obj.type === 'marauder' || obj.type === 'ghost' || obj.type === 'tank' || obj.type === 'turret') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

        
        } else {
        
        }
    });

    // Building Armor Upgrade (A)
    uiSystem.setActionHandler('action-a-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.buildingArmor;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.buildingArmor++;

            // Update all player buildings with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'bunker' || obj.type === 'supplyDepot' || 
                     obj.type === 'sensorTower' || obj.type === 'shieldTower' || 
                     obj.type === 'tank') && obj.playerId === currentPlayerId) {
                    applyBuildingUpgrades(obj);
                }
            });

            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Building Regen Upgrade (S)
    uiSystem.setActionHandler('action-s-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.buildingRegen;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.buildingRegen++;

            // Update all player buildings with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'bunker' || obj.type === 'supplyDepot' || 
                     obj.type === 'sensorTower' || obj.type === 'turret') && obj.playerId === currentPlayerId) {
                    applyBuildingUpgrades(obj);
                }
            });

            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Building Capacity Upgrade (D)
    uiSystem.setActionHandler('action-d-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.buildingCapacity;
        
        // Max level is 20, prevent further upgrades
        if (upgradeLevel >= 20) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.buildingCapacity++;

            // Update all player bunkers with capacity bonus
            gameObjects.forEach(obj => {
                if (obj.type === 'bunker' && obj.playerId === currentPlayerId) {
                    // Each level adds 50 range bonus for garrisoned units
                    obj.capacityBonus = upgrades.buildingCapacity * 50;
                }
            });

            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Turret Duration Upgrade (F)
    uiSystem.setActionHandler('action-f-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.turretDuration;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.turretDuration++;

            // Note: This only affects future turrets, not existing ones
            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Tank Splash Upgrade (G)
    uiSystem.setActionHandler('action-g-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.tankSplash;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.tankSplash++;

            // Note: This is checked during combat, no need to update existing tanks
            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Combat Shields Upgrade (Z) - Adds 50 HP to marines
    uiSystem.setActionHandler('action-z-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.combatShields;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.combatShields++;

            // Update all player marines with new stats
            gameObjects.forEach(obj => {
                if (obj.type === 'marine' && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Jetpacks Upgrade (X) - Increases reaper movement speed
    uiSystem.setActionHandler('action-x-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.jetpacks;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.jetpacks++;

            // Update all player reapers with new stats
            gameObjects.forEach(obj => {
                if (obj.type === 'reaper' && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Stim Upgrade (C) - Enables Stim ability for marines and marauders
    uiSystem.setActionHandler('action-c-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.stim;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.stim++;

            // Note: This only enables the ability, doesn't affect existing units
            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Concussive Blast Upgrade (V) - Marauders slow enemies
    uiSystem.setActionHandler('action-v-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.concussiveBlast;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.concussiveBlast++;

            // Note: This is checked during combat, no need to update existing marauders
            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // Tank Artillery Upgrade (B) - Increases tank damage and range by 10%
    uiSystem.setActionHandler('action-b-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.tankArtillery;
        
        // Max level is 1, prevent further upgrades
        if (upgradeLevel >= 1) {
            return;
        }
        
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            playerState.resources -= price;
            upgrades.tankArtillery++;

            // Update all player tanks with new stats
            gameObjects.forEach(obj => {
                if (obj.type === 'tank' && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            updateResourceSupplyDisplay();
            updateUpgradeLevels();
        }
    });

    // UI system is always visible
    uiSystem.show();
    
    // Update upgrade levels display now that UI is initialized
    updateUpgradeLevels();
}

// Helper function to get the tile ring for a given world coordinate
function getTileRing(x, y) {
    const tileX = Math.floor(x / TILE_WIDTH);
    const tileY = Math.floor(y / TILE_HEIGHT);

    // This logic is from drawBackground
    const xRing = Math.min(tileX, TILE_COUNT - 1 - tileX);
    const yRing = Math.min(tileY, TILE_COUNT - 1 - tileY);
    const ring = Math.min(xRing, yRing);

    // Ensure ring is within bounds of perimeter colors
    return Math.min(ring, PERIMETER_COLORS.length - 1);
}

// Chat System
class ChatSystem {
    constructor() {
        this.isInputOpen = false;
        this.isTeamChat = false;
        this.lastUsedMode = false; // false = All chat, true = Team chat
        this.messages = [];
        this.MESSAGE_FADE_TIME = 7000; // 7 seconds before fade starts
        this.FADE_DURATION = 1000; // 1 second fade duration
        
        // Get DOM elements
        this.chatOverlay = document.getElementById('chatOverlay');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInputContainer = document.getElementById('chatInputContainer');
        this.chatInput = document.getElementById('chatInput');
        this.chatPrefix = document.getElementById('chatPrefix');
        
        this.setupEventListeners();
        
        // Clean up old messages periodically
        setInterval(() => this.cleanupMessages(), 1000);
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            // Only handle chat if we're not in building placement mode
            if (buildingPlacementMode) return;
            
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.isInputOpen) {
                    this.sendMessage();
                } else {
                    this.openChat(this.lastUsedMode); // Use last used mode
                }
            }
        });
        
        // Handle Tab and Escape while chat is open
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                this.toggleChatType();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.closeChat();
            }
        });
        
        // Close chat when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isInputOpen && !this.chatInputContainer.contains(e.target)) {
                this.closeChat();
            }
        });
    }
    
    openChat(isTeamChat = false) {
        this.isInputOpen = true;
        this.isTeamChat = isTeamChat;
        this.lastUsedMode = isTeamChat; // Remember the mode when opening
        this.updateChatPrefix();
        this.chatInputContainer.classList.remove('hidden');
        this.chatInput.focus();
    }
    
    closeChat() {
        this.isInputOpen = false;
        this.chatInputContainer.classList.add('hidden');
        this.chatInput.value = '';
        this.chatInput.blur();
    }
    
    toggleChatType() {
        this.isTeamChat = !this.isTeamChat;
        this.lastUsedMode = this.isTeamChat; // Remember the new mode
        this.updateChatPrefix();
    }
    
    updateChatPrefix() {
        if (this.isTeamChat) {
            this.chatPrefix.textContent = '[Team]';
            this.chatPrefix.className = 'team';
        } else {
            this.chatPrefix.textContent = '[All]';
            this.chatPrefix.className = 'all';
        }
    }
    
    sendMessage() {
        const text = this.chatInput.value.trim();
        if (!text) {
            this.closeChat();
            return;
        }
        
        // Send via network if connected
        if (window.clientNetwork && window.clientNetwork.isConnected()) {
            const channel = this.isTeamChat ? 'team' : 'all';
            window.clientNetwork.sendChatMessage(text, channel);
        } else {
            // Fallback to local-only message (for testing/offline)
            const message = {
                id: Date.now() + Math.random(),
                text: text,
                senderId: currentPlayerId,
                senderName: `Player ${currentPlayerId}`,
                isTeamChat: this.isTeamChat,
                timestamp: Date.now()
            };
            
            this.messages.push(message);
            this.displayMessage(message);
        }
        
        // Remember the mode used for next time
        this.lastUsedMode = this.isTeamChat;
        
        // Close chat input
        this.closeChat();
    }
    
    receiveMessage(messageData) {
        // Receive message from server
        const message = {
            id: Date.now() + Math.random(),
            text: messageData.message,
            senderId: messageData.playerId,
            senderName: `Player ${messageData.playerId}`,
            isTeamChat: messageData.channel === 'team',
            timestamp: messageData.timestamp || Date.now()
        };
        
        this.messages.push(message);
        this.displayMessage(message);
    }
    
    displayMessage(message) {
        // Check if message should be visible to current player
        if (message.isTeamChat) {
            const senderTeam = players[message.senderId]?.team;
            const currentTeam = players[currentPlayerId]?.team;
            if (senderTeam !== currentTeam) {
                return; // Don't show team messages from other teams
            }
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.dataset.messageId = message.id;
        
        // Add chat type class for prefix styling
        messageElement.classList.add(message.isTeamChat ? 'team' : 'all');
        
        // Create message content
        const prefix = document.createElement('span');
        prefix.className = 'chat-prefix';
        prefix.textContent = message.isTeamChat ? '[Team]' : '[All]';
        
        const sender = document.createElement('span');
        sender.className = 'chat-sender';
        sender.textContent = message.senderName + ':';
        
        // Set sender color to player's actual game color
        const playerColor = players[message.senderId]?.color || '#FFFFFF';
        sender.style.color = playerColor;
        
        const text = document.createElement('span');
        text.className = 'chat-text';
        text.textContent = ' ' + message.text;
        
        messageElement.appendChild(prefix);
        messageElement.appendChild(sender);
        messageElement.appendChild(text);
        
        // Add to chat messages container
        this.chatMessages.appendChild(messageElement);
        
        // Schedule fade out
        setTimeout(() => {
            this.fadeMessage(messageElement);
        }, this.MESSAGE_FADE_TIME);
        
        // Schedule removal
        setTimeout(() => {
            this.removeMessage(messageElement);
        }, this.MESSAGE_FADE_TIME + this.FADE_DURATION);
    }
    
    fadeMessage(messageElement) {
        if (messageElement && messageElement.parentNode) {
            messageElement.classList.add('fading');
        }
    }
    
    removeMessage(messageElement) {
        if (messageElement && messageElement.parentNode) {
            messageElement.remove();
        }
    }
    

    
    cleanupMessages() {
        const now = Date.now();
        this.messages = this.messages.filter(message => {
            const age = now - message.timestamp;
            return age < (this.MESSAGE_FADE_TIME + this.FADE_DURATION + 1000); // Keep for a bit longer
        });
    }
    
    // Method to simulate receiving messages from other players (for testing)
    simulateMessage(senderId, text, isTeamChat = false) {
        const message = {
            id: Date.now() + Math.random(),
            text: text,
            senderId: senderId,
            senderName: `Player ${senderId}`,
            isTeamChat: isTeamChat,
            timestamp: Date.now()
        };
        
        this.messages.push(message);
        this.displayMessage(message);
    }
}

// Initialize chat system
let chatSystem;

// Scoreboard update function
function updateScoreboard(playersObj) {
    // Group players by team
    const teams = {};
    Object.keys(playersObj).forEach(pid => {
        const p = playersObj[pid];
        if (!teams[p.team]) teams[p.team] = [];
        teams[p.team].push({ ...p, id: pid });
    });

    const teamLabels = {
        1: 'Red Team',
        2: 'Blue Team',
        3: 'Green Team',
        4: 'Brown Team'
    };

    const teamColors = {
        1: '#ff6b6b',
        2: '#4ecdc4',
        3: '#45b7d1',
        4: '#f9ca24'
    };

    const sb = document.getElementById('scoreboard');
    if (!sb) return;

    // Clear existing content
    sb.innerHTML = '';

    // Create main container
    const container = document.createElement('div');
    container.className = 'scoreboard-container';

    // Create teams grid container (2x2 grid)
    const teamsGrid = document.createElement('div');
    teamsGrid.className = 'scoreboard-teams-grid';

    // Create team displays in 2x2 grid order
    Object.keys(teams).sort((a, b) => a - b).forEach(teamId => {
        const teamPlayers = teams[teamId];
        const teamTotal = teamPlayers.reduce((sum, p) => sum + (p.killResourceScore || 0), 0);

        // Find the player with the highest score on this team
        const highestScoringPlayer = teamPlayers.reduce((highest, player) =>
            (player.killResourceScore || 0) > (highest.killResourceScore || 0) ? player : highest
        );

        const teamDiv = document.createElement('div');
        teamDiv.className = 'scoreboard-team';
        teamDiv.style.borderColor = teamColors[teamId];

        let html = `<div class="team-header" style="color: ${highestScoringPlayer.color};">${teamLabels[teamId]}</div>`;
        html += `<div class="team-total">${teamTotal}</div>`;

        teamPlayers.forEach(player => {
            html += `<div class="player-score">`;
            html += `<span class="player-name" style="color: ${player.color};">Player ${player.id}</span>`;
            html += `<span class="player-score-value">${player.killResourceScore || 0}</span>`;
            html += `</div>`;
        });

        teamDiv.innerHTML = html;
        teamsGrid.appendChild(teamDiv);
    });

    container.appendChild(teamsGrid);
    sb.appendChild(container);
}
