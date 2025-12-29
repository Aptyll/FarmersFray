// UI System for Game
class CommandCardUI {
    constructor() {
        // State
        this.isUIVisible = true; // Always visible
        this.currentPage = 1;

        // Create DOM elements
        this.createUIElements();

        // Set up event listeners
        this.setupEventListeners();

        // Action handlers
        this.actionHandlers = {
            // Page 1 actions
            'action-q': () => {},
            'action-w': () => {},
            'action-e': () => {},
            'action-r': () => {},
            'action-t': () => {},
            'action-a': () => {},
            'action-s': () => {},
            'action-d': () => {},
            'action-f': () => {},
            'action-g': () => {},
            'action-z': () => {},
            'action-x': () => {},
            'action-c': () => {},
            'action-v': () => {},
            'action-b': () => {},

            // Page 2 actions
            'action-q-p2': () => {},
            'action-w-p2': () => {},
            'action-e-p2': () => {},
            'action-r-p2': () => {},
            'action-t-p2': () => {},
            'action-a-p2': () => {},
            'action-s-p2': () => {},
            'action-d-p2': () => {},
            'action-f-p2': () => {},
            'action-g-p2': () => {},
            'action-z-p2': () => {},
            'action-x-p2': () => {},
            'action-c-p2': () => {},
            'action-v-p2': () => {},
            'action-b-p2': () => {},
        };
    }

    createUIElements() {
        // Root wrapper (positioning only). Tabs + panel live as siblings inside this.
        this.uiRoot = document.createElement('div');
        this.uiRoot.id = 'ui-system';
        this.uiRoot.className = 'hidden';

        // Panel container (visual frame for the 3x5 grid)
        this.uiPanel = document.createElement('div');
        this.uiPanel.id = 'ui-command-panel';

        // Create CSS
        const style = document.createElement('style');
        style.textContent = `
            #ui-system {
                /* sizing + theme (kept flat/minimal for performance) */
                --cc-btn: 64px;
                --cc-gap: 6px;
                --cc-pad: 8px;
                --cc-border: 3px;
                --cc-bg: rgba(10, 10, 10, 0.92);
                --cc-border-color: #666666;
                --cc-accent: #4DA6FF; /* overridden per-player via setAccentColor() */

                position: fixed;
                bottom: 0px;
                right: 0px;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 0;
                width: calc((var(--cc-btn) * 5) + (var(--cc-gap) * 4) + (var(--cc-pad) * 2) + (var(--cc-border) * 2));
                background: transparent;
                border: none;
                padding: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                z-index: 1000;
            }

            #ui-system.hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateY(20px);
            }

            #ui-page-tabs {
                display: flex;
                gap: 0;
                margin: 0;
                padding: 0;
                width: 100%;
                align-self: stretch;
                background: var(--cc-bg);
                border-bottom: var(--cc-border) solid var(--cc-border-color); /* consistent minimap-style divider */
            }

            .ui-page-tab {
                flex: 1 1 0;
                min-width: 0;
                height: 40px;
                display: flex;
                justify-content: center;
                align-items: center;
                background: var(--cc-bg);
                border: var(--cc-border) solid var(--cc-border-color);
                border-left-width: 0; /* avoid double borders between tabs */
                border-bottom-width: 0; /* divider is handled by #ui-page-tabs */
                border-radius: 0;
                cursor: pointer;
                font-weight: 800;
                font-size: 13px;
                letter-spacing: 0.2px;
                transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
                color: rgba(255, 255, 255, 0.85);
                user-select: none;
            }

            /* Match minimap-style frame (square, flush). Keep single border at far left. */
            .ui-page-tab:first-child {
                border-left-width: var(--cc-border);
            }

            .ui-page-tab:hover {
                background: rgba(20, 20, 20, 0.96);
                color: rgba(255, 255, 255, 0.95);
            }

            .ui-page-tab.active {
                background: rgba(16, 16, 16, 0.98);
                border-top-color: var(--cc-accent);
                color: #ffffff;
            }

            #ui-command-panel {
                background: var(--cc-bg);
                border: var(--cc-border) solid var(--cc-border-color);
                border-top-width: 0; /* tabs provide the top frame border */
                border-radius: 0;
                padding: var(--cc-pad);
                width: 100%;
            }

            .ui-page {
                display: none;
            }

            .ui-page.active {
                display: block;
            }

            .ui-button-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                grid-template-rows: repeat(3, 1fr);
                gap: var(--cc-gap);
            }

            .ui-grid-button {
                width: var(--cc-btn);
                height: var(--cc-btn);
                display: flex;
                justify-content: center;
                align-items: center;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 8px;
                cursor: pointer;
                position: relative;
                transition: background-color 0.15s ease, border-color 0.15s ease;
                color: rgba(255, 255, 255, 0.92);
                user-select: none;
            }

            .ui-grid-button.active {
                border-color: var(--cc-accent);
                background-color: rgba(77, 166, 255, 0.15);
            }

            .ui-grid-button:hover {
                background: rgba(255, 255, 255, 0.10);
                border-color: rgba(255, 255, 255, 0.22);
            }

            .ui-grid-button:active {
                background: rgba(255, 255, 255, 0.10);
                border-color: var(--cc-accent);
            }

            .ui-hotkey {
                position: absolute;
                top: 3px;
                left: 4px;
                font-size: 11px;
                color: rgba(255, 255, 255, 0.8);
                font-weight: 800;
                background: transparent;
                padding: 0;
                border-radius: 0;
                z-index: 1;
            }

            .ui-logo {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 18px;
                color: rgba(255, 255, 255, 0.95);
                font-weight: 800;
                z-index: 1;
            }

            .ui-upgrade-level {
                position: absolute;
                bottom: 3px;
                right: 4px;
                font-size: 11px;
                color: var(--cc-accent);
                font-weight: 800;
                background: transparent;
                padding: 0;
                border-radius: 0;
                z-index: 1;
            }

            .ui-tooltip {
                position: absolute;
                background: rgba(0, 0, 0, 0.92);
                border: 1px solid rgba(255, 255, 255, 0.14);
                color: white;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 14px;
                font-family: 'Segoe UI', Arial, sans-serif;
                z-index: 10000;
                pointer-events: none;
                max-width: 220px;
                animation: tooltipFadeIn 0.12s ease;
            }

            @keyframes tooltipFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(4px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .upgrade-price {
                color: #FFD700;
                font-weight: bold;
                text-shadow: none;
            }
        `;
        document.head.appendChild(style);

        // Create page tabs
        const pageTabs = document.createElement('div');
        pageTabs.id = 'ui-page-tabs';

        for (let i = 1; i <= 6; i++) {
            const tab = document.createElement('div');
            tab.className = 'ui-page-tab' + (i === 1 ? ' active' : '');
            tab.dataset.page = i;
            tab.textContent = i;
            pageTabs.appendChild(tab);
        }

        this.uiRoot.appendChild(pageTabs);
        this.uiRoot.appendChild(this.uiPanel);

        // Create pages with button grids
        this.createPage(1, [
            { key: 'Q', action: 'action-q' },
            { key: 'W', action: 'action-w' },
            { key: 'E', action: 'action-e' },
            { key: 'R', action: 'action-r' },
            { key: 'T', action: 'action-t' },
            { key: 'A', action: 'action-a' },
            { key: 'S', action: 'action-s' },
            { key: 'D', action: 'action-d' },
            { key: 'F', action: 'action-f' },
            { key: 'G', action: 'action-g' },
            { key: 'Z', action: 'action-z' },
            { key: 'X', action: 'action-x' },
            { key: 'C', action: 'action-c' },
            { key: 'V', action: 'action-v' },
            { key: 'B', action: 'action-b' }
        ]);

        this.createPage(2, [
            { key: 'Q', action: 'action-q-p2' },
            { key: 'W', action: 'action-w-p2' },
            { key: 'E', action: 'action-e-p2' },
            { key: 'R', action: 'action-r-p2' },
            { key: 'T', action: 'action-t-p2' },
            { key: 'A', action: 'action-a-p2' },
            { key: 'S', action: 'action-s-p2' },
            { key: 'D', action: 'action-d-p2' },
            { key: 'F', action: 'action-f-p2' },
            { key: 'G', action: 'action-g-p2' },
            { key: 'Z', action: 'action-z-p2' },
            { key: 'X', action: 'action-x-p2' },
            { key: 'C', action: 'action-c-p2' },
            { key: 'V', action: 'action-v-p2' },
            { key: 'B', action: 'action-b-p2' }
        ]);

        // Create page 3 - Building Menu for Workers
        // Layout: Q-W-E-R-T (top row), A-S-D-F-G (middle row), Z-X-C-V-B (bottom row)
        this.createPage(3, [
            { key: 'Q', action: 'action-q-p3', logo: 'MV' }, // Move
            { key: 'W', action: 'action-w-p3', logo: 'ST' }, // Stop
            { key: 'E', action: 'action-e-p3', logo: 'HD' }, // Hold
            { key: 'R', action: 'action-r-p3', logo: 'PT' }, // Patrol
            { key: 'T', action: 'action-t-p3', logo: 'RP' }, // Repair (toggleable)
            { key: 'A', action: 'action-a-p3' }, // Empty
            { key: 'S', action: 'action-s-p3' }, // Empty
            { key: 'D', action: 'action-d-p3', logo: 'TK' }, // Build Tanks
            { key: 'F', action: 'action-f-p3', logo: 'MW' }, // More Workers
            { key: 'G', action: 'action-g-p3', logo: 'NU' }, // Nuke
            { key: 'Z', action: 'action-z-p3', logo: 'BU' }, // Build Bunker
            { key: 'X', action: 'action-x-p3', logo: 'SD' }, // Build Supply Depot
            { key: 'C', action: 'action-c-p3', logo: 'CT' }, // Build Control Tower (Sensor Tower)
            { key: 'V', action: 'action-v-p3', logo: 'ST' }, // Build Shield Tower
            { key: 'B', action: 'action-b-p3', logo: 'TR' } // Build Turret
        ]);

        // Create page 4 - Unit Upgrades Menu
        this.createPage(4, [
            { key: 'Q', action: 'action-q-p4', logo: 'AR', tooltip: 'Armor: <span class="upgrade-price">25</span>' }, // Armor
            { key: 'W', action: 'action-w-p4', logo: 'AD', tooltip: 'Attack Damage: <span class="upgrade-price">25</span>' }, // Attack Damage
            { key: 'E', action: 'action-e-p4', logo: 'WR', tooltip: 'Weapon Range: <span class="upgrade-price">25</span>' }, // Weapon Range
            { key: 'R', action: 'action-r-p4', logo: 'HR', tooltip: 'Health Regen: <span class="upgrade-price">25</span>' }, // Health Regen
            { key: 'T', action: 'action-t-p4', logo: 'MS', tooltip: 'Movement Speed: <span class="upgrade-price">25</span>' }, // Movement Speed
            { key: 'A', action: 'action-a-p4', logo: 'BA', tooltip: 'Building Armor: <span class="upgrade-price">25</span>' }, // Building Armor
            { key: 'S', action: 'action-s-p4', logo: 'BR', tooltip: 'Building Regen: <span class="upgrade-price">25</span>' }, // Building Regen
            { key: 'D', action: 'action-d-p4', logo: 'BC', tooltip: 'Building Capacity: <span class="upgrade-price">25</span>' }, // Building Capacity
            { key: 'F', action: 'action-f-p4', logo: 'TD', tooltip: 'Turret Duration: <span class="upgrade-price">25</span>' }, // Turret Duration
            { key: 'G', action: 'action-g-p4', logo: 'TS', tooltip: 'Tank Splash: <span class="upgrade-price">25</span>' }, // Tank Splash
            { key: 'Z', action: 'action-z-p4', logo: 'CS', tooltip: 'Combat Shields: <span class="upgrade-price">25</span>' }, // Combat Shields
            { key: 'X', action: 'action-x-p4', logo: 'JP', tooltip: 'Jetpacks: <span class="upgrade-price">25</span>' }, // Jetpacks
            { key: 'C', action: 'action-c-p4', logo: 'ST', tooltip: 'Stim: <span class="upgrade-price">25</span>' }, // Stim
            { key: 'V', action: 'action-v-p4', logo: 'CB', tooltip: 'Concussive Blast: <span class="upgrade-price">25</span>' }, // Concussive Blast
            { key: 'B', action: 'action-b-p4', logo: 'TA', tooltip: 'Tank Artillery: <span class="upgrade-price">25</span>' } // Tank Artillery
        ]);

        // Create page 5 - Tanks page
        this.createPage(5, [
            { key: 'Q', action: 'action-q-p5', logo: 'SI', tooltip: 'Siege/Unsiege: Toggle siege mode for selected tanks' },
            { key: 'W', action: 'action-w-p5' },
            { key: 'E', action: 'action-e-p5' },
            { key: 'R', action: 'action-r-p5' },
            { key: 'T', action: 'action-t-p5' },
            { key: 'A', action: 'action-a-p5' },
            { key: 'S', action: 'action-s-p5' },
            { key: 'D', action: 'action-d-p5' },
            { key: 'F', action: 'action-f-p5' },
            { key: 'G', action: 'action-g-p5' },
            { key: 'Z', action: 'action-z-p5' },
            { key: 'X', action: 'action-x-p5' },
            { key: 'C', action: 'action-c-p5' },
            { key: 'V', action: 'action-v-p5' },
            { key: 'B', action: 'action-b-p5' }
        ]);

        // Create page 6 - Placeholder page
        this.createPage(6, [
            { key: 'Q', action: 'action-q-p6' },
            { key: 'W', action: 'action-w-p6' },
            { key: 'E', action: 'action-e-p6' },
            { key: 'R', action: 'action-r-p6' },
            { key: 'T', action: 'action-t-p6' },
            { key: 'A', action: 'action-a-p6' },
            { key: 'S', action: 'action-s-p6' },
            { key: 'D', action: 'action-d-p6' },
            { key: 'F', action: 'action-f-p6' },
            { key: 'G', action: 'action-g-p6' },
            { key: 'Z', action: 'action-z-p6' },
            { key: 'X', action: 'action-x-p6' },
            { key: 'C', action: 'action-c-p6' },
            { key: 'V', action: 'action-v-p6' },
            { key: 'B', action: 'action-b-p6' }
        ]);

        // Add to document
        document.body.appendChild(this.uiRoot);

        // Store references to elements
        this.pageTabs = document.querySelectorAll('.ui-page-tab');
        this.uiPages = document.querySelectorAll('.ui-page');
        this.gridButtons = document.querySelectorAll('.ui-grid-button');
    }

    createPage(pageNumber, buttons) {
        const page = document.createElement('div');
        page.className = 'ui-page' + (pageNumber === 1 ? ' active' : '');
        page.dataset.page = pageNumber;

        const grid = document.createElement('div');
        grid.className = 'ui-button-grid';

        buttons.forEach(button => {
            const buttonElement = document.createElement('div');
            buttonElement.className = 'ui-grid-button';
            buttonElement.dataset.action = button.action;

            // Add tooltip if provided
            if (button.tooltip) {
                buttonElement.title = button.tooltip;
                buttonElement.dataset.tooltip = button.tooltip;

                // Use custom tooltip handling for HTML content
                buttonElement.addEventListener('mouseenter', (e) => {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'ui-tooltip';
                    // Use the current dataset tooltip value instead of the initial value
                    tooltip.innerHTML = buttonElement.dataset.tooltip || button.tooltip;
                    document.body.appendChild(tooltip);

                    // Position the tooltip after it's been added to the DOM
                    setTimeout(() => {
                        const rect = buttonElement.getBoundingClientRect();
                        const tooltipRect = tooltip.getBoundingClientRect();

                        // Center horizontally
                        tooltip.style.left = (rect.left + rect.width/2 - tooltipRect.width/2) + 'px';
                        // Position above the button
                        tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
                    }, 0);

                    buttonElement.dataset.tooltipElement = tooltip;
                });

                buttonElement.addEventListener('mouseleave', (e) => {
                    const tooltip = document.querySelector('.ui-tooltip');
                    if (tooltip) {
                        tooltip.remove();
                    }
                });
            }

            // Add hotkey in top-left
            const hotkey = document.createElement('span');
            hotkey.className = 'ui-hotkey';
            hotkey.textContent = button.key;
            buttonElement.appendChild(hotkey);

            // Add logo in center if provided
            if (button.logo) {
                const logo = document.createElement('span');
                logo.className = 'ui-logo';
                logo.textContent = button.logo;
                buttonElement.appendChild(logo);
            }

            // Add upgrade level indicator in bottom-right if it's an upgrade button
            if (button.action && button.action.includes('p4')) {
                const level = document.createElement('span');
                level.className = 'ui-upgrade-level';
                // Turret Duration and Tank Splash show "0/1" format
                if (button.action === 'action-f-p4' || button.action === 'action-g-p4') {
                    level.textContent = '0/1';
                }
                // QWERT and ASD show "0/20" format
                else if (['action-q-p4', 'action-w-p4', 'action-e-p4', 'action-r-p4', 'action-t-p4', 
                          'action-a-p4', 'action-s-p4', 'action-d-p4'].includes(button.action)) {
                    level.textContent = '0/20';
                } else {
                    level.textContent = '0';
                }
                level.dataset.level = '0';
                buttonElement.appendChild(level);
            }

            grid.appendChild(buttonElement);
        });

        page.appendChild(grid);
        this.uiPanel.appendChild(page);
    }

    setupEventListeners() {
        // Tab click events
        document.addEventListener('click', (event) => {
            if (window.isGamePaused) return;
            if (event.target.classList.contains('ui-page-tab')) {
                this.switchToPage(parseInt(event.target.dataset.page));
            }
        });

        // Button click events
        document.addEventListener('click', (event) => {
            if (window.isGamePaused) return;
            const button = event.target.closest('.ui-grid-button');
            if (button) {
                this.handleButtonClick(button.dataset.action);
            }
        });

        // Keyboard events
        document.addEventListener('keydown', (event) => {
            // Don't process UI keys if chat is open
            if (window.chatSystem && window.chatSystem.isInputOpen) {
                return;
            }
            if (window.isGamePaused) {
                return;
            }

            const key = event.key.toLowerCase();

            // Tab key for scoreboard (press and hold)
            if (event.key === 'Tab') {
                event.preventDefault();
                this.showScoreboard();
                return;
            }

            // Page switching with number keys 1-6
            if (key >= '1' && key <= '6') {
                this.switchToPage(parseInt(key));
                return;
            }

            // Grid button hotkeys
            const validKeys = ['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b'];
            if (validKeys.includes(key)) {
                // Find the button on the current page with this hotkey
                const currentPageElement = document.querySelector(`.ui-page[data-page="${this.currentPage}"]`);
                if (!currentPageElement) return;

                const buttons = currentPageElement.querySelectorAll('.ui-grid-button');
                let actionToTrigger = null;

                for (const button of buttons) {
                    const hotkeyElement = button.querySelector('.ui-hotkey');
                    if (hotkeyElement && hotkeyElement.textContent.toLowerCase() === key) {
                        actionToTrigger = button.dataset.action;

                        // Check if this is a maxed-out upgrade button (shows "1/1" or "20/20" format)
                        const levelElement = button.querySelector('.ui-upgrade-level');
                        const levelText = levelElement ? levelElement.textContent : '';
                        const isMaxed = levelText && (
                            (levelText.includes('/1') && levelText.startsWith('1/')) ||
                            (levelText.includes('/20') && levelText.startsWith('20/'))
                        );
                        
                        // Visual feedback - only apply if not maxed (maxed buttons have special styling)
                        if (!isMaxed) {
                            // Store original background before visual feedback
                            const originalBg = button.style.backgroundColor || '';
                            
                            // Apply visual feedback
                            button.style.backgroundColor = '#555';
                            
                            // Always restore after short delay, regardless of action result
                            // Store timeout ID so we can reference it
                            const timeoutId = setTimeout(() => {
                                // Check if button still exists and is still showing feedback color
                                if (button.parentElement) {
                                    const currentBg = button.style.backgroundColor;
                                    // Only restore if it's still the feedback color (not updated by action)
                                    if (currentBg === 'rgb(85, 85, 85)' || currentBg === '#555') {
                                        button.style.backgroundColor = originalBg;
                                    }
                                }
                            }, 150);
                            
                            // Store timeout ID on button for potential cleanup
                            button.dataset.feedbackTimeout = timeoutId.toString();
                        }

                        break;
                    }
                }

                if (actionToTrigger) {
                    // Execute the action handler immediately
                    this.handleButtonClick(actionToTrigger);
                    
                    // Note: Visual feedback timeout will handle restoring the background
                    // If the action succeeds and updates the button, updateUpgradeLevels() will set the proper background
                    // If the action fails, the timeout will restore the original background
                }
            }
        });

        // Keyup events for press-and-hold functionality
        document.addEventListener('keyup', (event) => {
            // Tab key release for scoreboard
            if (event.key === 'Tab') {
                event.preventDefault();
                this.hideScoreboard();
                return;
            }
        });
    }

    // Show UI (kept for API compatibility)
    show() {
        this.isUIVisible = true;
        this.uiRoot.classList.remove('hidden');
    }

    // Accent color (typically current player color)
    setAccentColor(color) {
        if (!color) return;
        this.uiRoot.style.setProperty('--cc-accent', color);
    }

    // Switch to a specific page
    switchToPage(pageNumber) {
        this.currentPage = pageNumber;

        // Update tab highlighting
        this.pageTabs.forEach(tab => {
            tab.classList.toggle('active', parseInt(tab.dataset.page) === pageNumber);
        });

        // Show the selected page, hide others
        this.uiPages.forEach(page => {
            page.classList.toggle('active', parseInt(page.dataset.page) === pageNumber);
        });
    }

    // Handle button clicks
    handleButtonClick(action) {
        if (this.actionHandlers[action]) {
            this.actionHandlers[action]();
        }
        // No else needed - undefined handlers simply do nothing
    }

    // Set a custom action handler
    setActionHandler(action, handler) {
        this.actionHandlers[action] = handler;
    }

    // Update button visual state (e.g., for siege toggle)
    updateButtonState(action, isActive) {
        const button = document.querySelector(`.ui-grid-button[data-action="${action}"]`);
        if (button) {
            if (isActive) {
                button.classList.add('active');
                button.style.borderColor = 'var(--cc-accent)';
                button.style.backgroundColor = 'rgba(77, 166, 255, 0.15)';
            } else {
                button.classList.remove('active');
                button.style.borderColor = '';
                button.style.backgroundColor = '';
            }
        }
    }

    // Show scoreboard
    showScoreboard() {
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) {
            scoreboard.classList.remove('hidden');
        }
    }

    // Hide scoreboard
    hideScoreboard() {
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) {
            scoreboard.classList.add('hidden');
        }
    }
}

// Make the class globally available
window.CommandCardUI = CommandCardUI;
// Backwards compatibility: older code still using UISystem
window.UISystem = CommandCardUI;