// Get the "canvas" element from the HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // "ctx" is the 2D drawing tool

// --- 1. GET UI ELEMENTS ---
const phaseDisplay = document.getElementById('currentPhaseDisplay');
const btnMainStraight = document.getElementById('btnMainStraight');
const btnMainLeft = document.getElementById('btnMainLeft');
const btnSideStraight = document.getElementById('btnSideStraight');
const btnSideLeft = document.getElementById('btnSideLeft');
const scoreDisplay = document.getElementById('scoreDisplay');
const btnReset = document.getElementById('btnReset');
const btnStart = document.getElementById('btnStart');

// --- NEW: Get Timer and Game Over elements ---
const timerDisplay = document.getElementById('timerDisplay');
const gameOverDisplay = document.getElementById('gameOverDisplay');

// --- 2. LANE & INTERSECTION COORDINATES ---
const INTERSECTION = { x_start: 350, x_end: 450, y_start: 250, y_end: 350 };
const LANES = {
    main_sb_left: 362.5, main_sb_straight: 387.5,
    main_nb_left: 412.5, main_nb_straight: 437.5,
    side_wb_straight: 262.5, side_wb_left: 287.5,
    side_eb_straight: 312.5, side_eb_left: 337.5
};

// --- 3. SIMULATION CONSTANTS ---
const PIXELS_PER_METER = 5;
const SAFE_GAP_PIXELS = 2.5 * PIXELS_PER_METER;
const NORMAL_SPEED_PIXELS = 2;
const YELLOW_PHASE_DURATION = 2500;
const ALL_RED_DURATION = 1000;
const GAME_DURATION_MS = 120000; // 2 minutes

// --- 4. GAME STATE ---
let currentPhase = 'main_straight';
let vehicles = [];
let vehicleIdCounter = 0;
let phaseChangeTimeout = null;
let isGameRunning = false;
let isTransitioning = false;
let spawnerIntervals = [];

// --- NEW: Timer state ---
let gameTimerTimeout = null; // Stores the main 2-minute timer
let gameEndTime = 0; // When the game is set to end

// --- 5. VEHICLE CLASS ---
class Vehicle {
    constructor(startX, startY, lane, direction) {
        // ... (constructor is unchanged) ...
        this.id = vehicleIdCounter++;
        this.x = startX; this.y = startY;
        this.lane = lane; this.direction = direction;
        this.speed = NORMAL_SPEED_PIXELS;
        this.startTime = Date.now();
        this.state = 'approaching'; 
        if (this.direction === 'north' || this.direction === 'south') {
            this.width = 15; this.height = 25; this.color = 'blue';
        } else {
            this.width = 25; this.height = 15; this.color = 'red';
        }
    }

    findLeadVehicle(allVehicles) { /* ... (unchanged) ... */
        let vehiclesInMyLane = allVehicles.filter(v =>
            v.id !== this.id && v.lane === this.lane && v.direction === this.direction && v.state === this.state
        );
        let leadVehicles = [];
        switch (this.direction) {
            case 'south':
                leadVehicles = vehiclesInMyLane.filter(v => v.y > this.y);
                leadVehicles.sort((a, b) => a.y - b.y); break;
            case 'north':
                leadVehicles = vehiclesInMyLane.filter(v => v.y < this.y);
                leadVehicles.sort((a, b) => b.y - a.y); break;
            case 'east':
                leadVehicles = vehiclesInMyLane.filter(v => v.x > this.x);
                leadVehicles.sort((a, b) => a.x - b.x); break;
            case 'west':
                leadVehicles = vehiclesInMyLane.filter(v => v.x < this.x);
                leadVehicles.sort((a, b) => b.x - a.x); break;
        }
        return leadVehicles.length > 0 ? leadVehicles[0] : null;
    }

    calculateDistanceTo(leadVehicle) { /* ... (unchanged) ... */
        let myFrontBumper, theirRearBumper;
        switch (this.direction) {
            case 'south':
                myFrontBumper = this.y + this.height / 2;
                theirRearBumper = leadVehicle.y - leadVehicle.height / 2;
                return theirRearBumper - myFrontBumper;
            case 'north':
                myFrontBumper = this.y - this.height / 2;
                theirRearBumper = leadVehicle.y + leadVehicle.height / 2;
                return theirRearBumper - myFrontBumper;
            case 'east':
                myFrontBumper = this.x + this.width / 2;
                theirRearBumper = leadVehicle.x - leadVehicle.width / 2;
                return theirRearBumper - myFrontBumper;
            case 'west':
                myFrontBumper = this.x - this.width / 2;
                theirRearBumper = leadVehicle.x + leadVehicle.width / 2;
                return theirRearBumper - myFrontBumper;
        }
    }

    // --- CHANGED (Req 1): Fixed the turn logic for side streets ---
    hasReachedTurnPoint() {
        switch (this.direction) {
            // Main Street turns (correct)
            case 'south': return this.y > LANES.side_eb_left;
            case 'north': return this.y < LANES.side_wb_left;
            
            // Side Street turns (NOW CORRECTED)
            case 'east':  // EB Left turns into NB-Left lane
                return this.x > LANES.main_nb_left; // Was main_sb_left
            case 'west':  // WB Left turns into SB-Left lane
                return this.x < LANES.main_sb_left; // Was main_nb_left
        }
        return false;
    }

    performTurn() { /* ... (unchanged) ... */
        this.state = 'turning';
        switch (this.direction) {
            case 'south': this.direction = 'east'; break;
            case 'north': this.direction = 'west'; break;
            case 'east':  this.direction = 'north'; break;
            case 'west':  this.direction = 'south'; break;
        }
    }

    getLightStatus() { /* ... (unchanged) ... */
        switch (currentPhase) {
            case 'main_straight':
                return (this.lane === 'main_straight') ? 'green' : 'red';
            case 'main_left':
                return (this.lane === 'main_left') ? 'green' : 'red';
            case 'side_straight':
                return (this.lane === 'side_straight') ? 'green' : 'red';
            case 'side_left':
                return (this.lane === 'side_left') ? 'green' : 'red';
            case 'main_yellow':
                return (this.lane === 'main_straight' || this.lane === 'main_left') ? 'yellow' : 'red';
            case 'side_yellow':
                return (this.lane === 'side_straight' || this.lane === 'side_left') ? 'yellow' : 'red';
            case 'all_red':
                return 'red';
            default:
                return 'red';
        }
    }

    update(allVehicles) { /* ... (unchanged) ... */
        if (this.state === 'in_intersection_straight' || this.state === 'turning') {
            let leadVehicle = this.findLeadVehicle(allVehicles);
            let distanceToLead = leadVehicle ? Math.abs(this.calculateDistanceTo(leadVehicle)) : Infinity;
            if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
                this.speed = 0;
            } else {
                this.speed = NORMAL_SPEED_PIXELS;
            }
        } 
        else if (this.state === 'approaching') {
            let lightStatus = this.getLightStatus();
            let isAtStopLine = this.checkStopLine();
            let leadVehicle = this.findLeadVehicle(allVehicles);
            let distanceToLead = leadVehicle ? Math.abs(this.calculateDistanceTo(leadVehicle)) : Infinity;
            if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
                this.speed = 0;
            } else if (isAtStopLine && lightStatus === 'red') {
                this.speed = 0;
            } else if (isAtStopLine && lightStatus === 'yellow' && this.speed === 0) {
                this.speed = 0;
            }
            else {
                this.speed = NORMAL_SPEED_PIXELS;
                if (isAtStopLine) {
                    if (this.lane.includes('left')) {
                        // Turn logic is handled below
                    } else {
                        this.state = 'in_intersection_straight';
                    }
                }
            }
        }
        if (this.speed > 0) {
            if (this.state === 'approaching' && this.lane.includes('left') && this.hasReachedTurnPoint()) {
                this.performTurn();
            }
            switch (this.direction) {
                case 'north': this.y -= this.speed; break;
                case 'south': this.y += this.speed; break;
                case 'east':  this.x += this.speed; break;
                case 'west':  this.x -= this.speed; break;
            }
        }
    }

    checkStopLine() { /* ... (unchanged) ... */
        const buffer = 3; 
        switch (this.direction) {
            case 'south': 
                return this.y + this.height / 2 > INTERSECTION.y_start - buffer;
            case 'north':
                return this.y - this.height / 2 < INTERSECTION.y_end + buffer;
            case 'east': 
                return this.x + this.width / 2 > INTERSECTION.x_start - buffer;
            case 'west': 
                return this.x - this.width / 2 < INTERSECTION.x_end + buffer;
        }
        return false;
    }

    draw() { /* ... (unchanged) ... */
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
}

// --- 6. SIMULATION LOGIC ---
function startSpawners() {
    stopSpawners();
    spawnerIntervals.push(setInterval(spawnMainStraight, 1000));
    spawnerIntervals.push(setInterval(spawnSideStraight, 2000));
    spawnerIntervals.push(setInterval(spawnMainLeft, 5000));
    spawnerIntervals.push(setInterval(spawnSideLeft, 7000));
}

function stopSpawners() {
    spawnerIntervals.forEach(clearInterval);
    spawnerIntervals = [];
}
// (Spawner functions are unchanged)
function spawnMainStraight() {
    vehicles.push(new Vehicle(LANES.main_sb_straight, 0 - 25, 'main_straight', 'south'));
    vehicles.push(new Vehicle(LANES.main_nb_straight, 600 + 25, 'main_straight', 'north'));
}
function spawnSideStraight() {
    vehicles.push(new Vehicle(0 - 25, LANES.side_eb_straight, 'side_straight', 'east'));
    vehicles.push(new Vehicle(800 + 25, LANES.side_wb_straight, 'side_straight', 'west'));
}
function spawnMainLeft() {
    vehicles.push(new Vehicle(LANES.main_sb_left, 0 - 25, 'main_left', 'south'));
    vehicles.push(new Vehicle(LANES.main_nb_left, 600 + 25, 'main_left', 'north'));
}
function spawnSideLeft() {
    vehicles.push(new Vehicle(0 - 25, LANES.side_eb_left, 'side_left', 'east'));
    vehicles.push(new Vehicle(800 + 25, LANES.side_wb_left, 'side_left', 'west'));
}

// --- 7. USER INPUT (Button Clicks) ---
btnMainStraight.onclick = function() { requestPhaseChange('main_straight'); };
btnMainLeft.onclick = function() { requestPhaseChange('main_left'); };
btnSideStraight.onclick = function() { requestPhaseChange('side_straight'); };
btnSideLeft.onclick = function() { requestPhaseChange('side_left'); };
btnStart.onclick = function() { startGame(); };
btnReset.onclick = function() { resetGame(); };

function requestPhaseChange(requestedPhase) { /* ... (unchanged) ... */
    if (isTransitioning || requestedPhase === currentPhase || !isGameRunning) {
        return;
    }
    isTransitioning = true;
    let yellowPhase = 'all_red';
    if (currentPhase === 'main_straight' || currentPhase === 'main_left') {
        yellowPhase = 'main_yellow';
    } else if (currentPhase === 'side_straight' || currentPhase === 'side_left') {
        yellowPhase = 'side_yellow';
    }
    currentPhase = yellowPhase;
    phaseDisplay.textContent = yellowPhase.replace('_', ' ').toUpperCase();
    clearTimeout(phaseChangeTimeout);
    phaseChangeTimeout = setTimeout(() => {
        currentPhase = 'all_red';
        phaseDisplay.textContent = 'ALL RED';
        phaseChangeTimeout = setTimeout(() => {
            currentPhase = requestedPhase;
            phaseDisplay.textContent = requestedPhase.replace('_', ' ').toUpperCase();
            isTransitioning = false;
        }, ALL_RED_DURATION);
    }, YELLOW_PHASE_DURATION);
}

// --- 8. DRAWING FUNCTIONS ---
function drawIntersection() { /* ... (unchanged) ... */ 
    ctx.fillStyle = '#666';
    ctx.fillRect(INTERSECTION.x_start, 0, (INTERSECTION.x_end - INTERSECTION.x_start), 600);
    ctx.fillRect(0, INTERSECTION.y_start, 800, (INTERSECTION.y_end - INTERSECTION.y_start));
}
function drawLaneLines() { /* ... (unchanged) ... */ 
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'yellow'; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(400, 0); ctx.lineTo(400, INTERSECTION.y_start);
    ctx.moveTo(400, INTERSECTION.y_end); ctx.lineTo(400, 600);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 300); ctx.lineTo(INTERSECTION.x_start, 300);
    ctx.moveTo(INTERSECTION.x_end, 300); ctx.lineTo(800, 300);
    ctx.stroke();
    ctx.strokeStyle = 'white'; ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(375, 0); ctx.lineTo(375, INTERSECTION.y_start);
    ctx.moveTo(425, INTERSECTION.y_end); ctx.lineTo(425, 600);
    ctx.moveTo(375, INTERSECTION.y_end); ctx.lineTo(375, 600);
    ctx.moveTo(425, 0); ctx.lineTo(425, INTERSECTION.y_start);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 275); ctx.lineTo(INTERSECTION.x_start, 275);
    ctx.moveTo(0, 325); ctx.lineTo(INTERSECTION.x_start, 325);
    ctx.moveTo(INTERSECTION.x_end, 275); ctx.lineTo(800, 275);
    ctx.moveTo(INTERSECTION.x_end, 325); ctx.lineTo(800, 325);
    ctx.stroke();
    ctx.setLineDash([]);
}
function drawStopBars() { /* ... (unchanged) ... */ 
    ctx.lineWidth = 5;
    let mainStraightColor = 'red', mainLeftColor = 'red',
        sideStraightColor = 'red', sideLeftColor = 'red';
    switch (currentPhase) {
        case 'main_straight': mainStraightColor = 'green'; break;
        case 'main_left': mainLeftColor = 'green'; break;
        case 'side_straight': sideStraightColor = 'green'; break;
        case 'side_left': sideLeftColor = 'green'; break;
        case 'main_yellow':
            mainStraightColor = 'yellow'; mainLeftColor = 'yellow'; break;
        case 'side_yellow':
            sideStraightColor = 'yellow'; sideLeftColor = 'yellow'; break;
    }
    ctx.strokeStyle = mainLeftColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_sb_left - 7.5, INTERSECTION.y_start); ctx.lineTo(LANES.main_sb_left + 7.5, INTERSECTION.y_start); ctx.stroke();
    ctx.strokeStyle = mainStraightColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_sb_straight - 7.5, INTERSECTION.y_start); ctx.lineTo(LANES.main_sb_straight + 7.5, INTERSECTION.y_start); ctx.stroke();
    ctx.strokeStyle = mainStraightColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_nb_straight - 7.5, INTERSECTION.y_end); ctx.lineTo(LANES.main_nb_straight + 7.5, INTERSECTION.y_end); ctx.stroke();
    ctx.strokeStyle = mainLeftColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_nb_left - 7.5, INTERSECTION.y_end); ctx.lineTo(LANES.main_nb_left + 7.5, INTERSECTION.y_end); ctx.stroke();
    ctx.strokeStyle = sideLeftColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_end, LANES.side_wb_left - 7.5); ctx.lineTo(INTERSECTION.x_end, LANES.side_wb_left + 7.5); ctx.stroke();
    ctx.strokeStyle = sideStraightColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_end, LANES.side_wb_straight - 7.5); ctx.lineTo(INTERSECTION.x_end, LANES.side_wb_straight + 7.5); ctx.stroke();
    ctx.strokeStyle = sideStraightColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_start, LANES.side_eb_straight - 7.5); ctx.lineTo(INTERSECTION.x_start, LANES.side_eb_straight + 7.5); ctx.stroke();
    ctx.strokeStyle = sideLeftColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_start, LANES.side_eb_left - 7.5); ctx.lineTo(INTERSECTION.x_start, LANES.side_eb_left + 7.5); ctx.stroke();
}

// Function to update the score (unchanged)
function updateScore() {
    const waitingVehicles = vehicles.filter(v => v.state === 'approaching');
    if (waitingVehicles.length === 0) {
        scoreDisplay.textContent = "0.00";
        return;
    }
    const currentTime = Date.now();
    let totalWaitTime = waitingVehicles.reduce((sum, v) => {
        return sum + (currentTime - v.startTime);
    }, 0);
    let avgWaitTime = (totalWaitTime / waitingVehicles.length) / 1000;
    scoreDisplay.textContent = avgWaitTime.toFixed(2);
}

// --- NEW: Function to update the timer display ---
function updateTimerDisplay() {
    if (!isGameRunning) return;

    let timeLeftMS = gameEndTime - Date.now();
    if (timeLeftMS < 0) timeLeftMS = 0;

    let seconds = Math.floor(timeLeftMS / 1000) % 60;
    let minutes = Math.floor(timeLeftMS / (1000 * 60));

    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- NEW: Function to disable/enable all control buttons ---
function setSignalButtonsDisabled(isDisabled) {
    btnMainStraight.disabled = isDisabled;
    btnMainLeft.disabled = isDisabled;
    btnSideStraight.disabled = isDisabled;
    btnSideLeft.disabled = isDisabled;
}

// --- NEW: Function for when the game timer ends ---
function endGame() {
    isGameRunning = false;
    stopSpawners();
    clearTimeout(phaseChangeTimeout);
    isTransitioning = false;

    gameOverDisplay.style.display = 'block'; // Show "Game Over!"
    setSignalButtonsDisabled(true); // Disable signal controls
    btnStart.disabled = true; // Disable start
    btnReset.disabled = false; // Enable reset
}

function drawInitialState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawIntersection();
    drawLaneLines();
    drawStopBars(); // Will draw all red by default
}

// --- CHANGED: resetGame() now controls button states and timer ---
function resetGame() {
    isGameRunning = false;
    stopSpawners();
    
    clearTimeout(phaseChangeTimeout);
    clearTimeout(gameTimerTimeout); // Stop the main game timer
    isTransitioning = false;
    vehicles = [];
    
    currentPhase = 'main_straight';
    phaseDisplay.textContent = 'Main Street Straight'.toUpperCase();
    scoreDisplay.textContent = "0.00";
    timerDisplay.textContent = "2:00"; // Reset timer display
    gameOverDisplay.style.display = 'none'; // Hide "Game Over!"

    setSignalButtonsDisabled(true); // Disable signals
    btnStart.disabled = false; // Enable Start
    btnReset.disabled = true; // Disable Reset
    
    drawInitialState();
}

// --- CHANGED: startGame() now controls buttons and starts timer ---
function startGame() {
    if (isGameRunning) return; 

    // Reset everything to a fresh state first
    resetGame(); 
    
    isGameRunning = true;
    startSpawners();
    
    // Set timer
    gameEndTime = Date.now() + GAME_DURATION_MS;
    gameTimerTimeout = setTimeout(endGame, GAME_DURATION_MS);
    
    // Set button states
    setSignalButtonsDisabled(false); // Enable signals
    btnStart.disabled = true; // Disable Start
    btnReset.disabled = false; // Enable Reset

    gameLoop(); // Kick off the main game loop
}

// --- 9. THE GAME LOOP ---
function gameLoop() {
    if (!isGameRunning) return; // Stop the loop if game ended

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawIntersection();
    drawLaneLines();
    drawStopBars();

    for (let i = vehicles.length - 1; i >= 0; i--) {
        let v = vehicles[i];
        v.update(vehicles); 
        v.draw();
        
        if (v.y > canvas.height + 50 || v.y < -50 || v.x > canvas.width + 50 || v.x < -50) {
            vehicles.splice(i, 1);
        }
    }
    
    updateScore();
    updateTimerDisplay(); // --- NEW: Update timer every frame ---
    
    if (isGameRunning) {
        requestAnimationFrame(gameLoop);
    }
}

// --- CHANGED: Set the initial "ready" state on load ---
// We don't call gameLoop() anymore.
// We call resetGame() to set the correct initial button states.
resetGame();