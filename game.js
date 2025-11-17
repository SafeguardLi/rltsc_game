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
const timerDisplay = document.getElementById('timerDisplay');
const gameOverDisplay = document.getElementById('gameOverDisplay');

// --- NEW: Get Throughput Display ---
const throughputDisplay = document.getElementById('throughputDisplay');

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
let gameTimerTimeout = null;
let gameEndTime = 0;

// --- NEW: Throughput Counter ---
let throughputCount = 0;

// --- 5. VEHICLE CLASS ---
class Vehicle {
    constructor(startX, startY, lane, direction) {
        this.id = vehicleIdCounter++;
        this.x = startX; this.y = startY;
        this.lane = lane; this.direction = direction;
        this.speed = NORMAL_SPEED_PIXELS;
        this.startTime = Date.now();
        
        // --- CHANGED (Req 1): More detailed states ---
        this.state = 'approaching'; // 'approaching', 'in_intersection_straight', 'in_intersection_turning', 'turning'
        this.hasBeenCounted = false; // For throughput

        if (this.direction === 'north' || this.direction === 'south') {
            this.width = 15; this.height = 25; this.color = 'blue';
        } else {
            this.width = 25; this.height = 15; this.color = 'red';
        }
    }

    findLeadVehicle(allVehicles) { /* ... (unchanged) ... */
        let vehiclesInMyLane = allVehicles.filter(v =>
            v.id !== this.id && v.lane === this.lane && v.direction === this.direction
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

    // --- BUG FIX (Req 1): This logic is now correct ---
    hasReachedTurnPoint() {
        switch (this.direction) {
            case 'south': return this.y > LANES.side_eb_left; // Turn into Eastbound Left lane
            case 'north': return this.y < LANES.side_wb_left; // Turn into Westbound Left lane
            case 'east':  return this.x > LANES.main_nb_left; // Turn into Northbound Left lane
            case 'west':  return this.x < LANES.main_sb_left; // Turn into Southbound Left lane
        }
        return false;
    }

    performTurn() {
        this.state = 'turning'; // Now officially in the new direction
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

    // --- NEW (Req 1): Checks if car is AT or BEFORE the stop line ---
    checkIsAtOrBeforeStopLine() {
        const buffer = 3; // Stop 3px before the line
        switch (this.direction) {
            case 'south': 
                return this.y + this.height / 2 <= INTERSECTION.y_start - buffer;
            case 'north':
                return this.y - this.height / 2 >= INTERSECTION.y_end + buffer;
            case 'east': 
                return this.x + this.width / 2 <= INTERSECTION.x_start - buffer;
            case 'west': 
                return this.x - this.width / 2 >= INTERSECTION.x_end + buffer;
        }
        return false;
    }
    
    // --- NEW (Req 2): Checks if car is PAST the intersection box ---
    isPastIntersection() {
        switch (this.direction) {
            case 'south': return this.y - this.height / 2 > INTERSECTION.y_end;
            case 'north': return this.y + this.height / 2 < INTERSECTION.y_start;
            case 'east':  return this.x - this.width / 2 > INTERSECTION.x_end;
            case 'west':  return this.x + this.width / 2 < INTERSECTION.x_start;
        }
        return false;
    }

    // --- CHANGED (Req 1): New state logic ---
    update(allVehicles) {
        let leadVehicle = this.findLeadVehicle(allVehicles);
        let distanceToLead = leadVehicle ? Math.abs(this.calculateDistanceTo(leadVehicle)) : Infinity;

        // --- States for vehicles IN or PAST the intersection ---
        if (this.state !== 'approaching') {
            if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
                this.speed = 0;
            } else {
                this.speed = NORMAL_SPEED_PIXELS;
            }
            
            // Handle the turn itself
            if (this.state === 'in_intersection_turning' && this.hasReachedTurnPoint()) {
                this.performTurn();
            }
        }
        // --- State for vehicles 'approaching' the intersection ---
        else {
            let lightStatus = this.getLightStatus();
            let isAtOrBeforeStopLine = this.checkIsAtOrBeforeStopLine();

            // Decision to stop
            if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
                this.speed = 0;
            } else if (isAtOrBeforeStopLine && lightStatus === 'red') {
                this.speed = 0;
            } else if (isAtOrBeforeStopLine && lightStatus === 'yellow' && this.speed === 0) {
                this.speed = 0;
            }
            // Decision to go
            else {
                this.speed = NORMAL_SPEED_PIXELS;
                
                // If we are moving and have *crossed* the stop line, change state!
                if (!isAtOrBeforeStopLine) {
                    if (this.lane.includes('left')) {
                        this.state = 'in_intersection_turning';
                    } else {
                        this.state = 'in_intersection_straight';
                    }
                }
            }
        }
        
        // Move based on speed
        if (this.speed > 0) {
            switch (this.direction) {
                case 'north': this.y -= this.speed; break;
                case 'south': this.y += this.speed; break;
                case 'east':  this.x += this.speed; break;
                case 'west':  this.x -= this.speed; break;
            }
        }
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

// --- GAME FUNCTIONS ---
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

function updateTimerDisplay() {
    if (!isGameRunning && gameEndTime === 0) return; // Don't update if reset
    let timeLeftMS = gameEndTime - Date.now();
    if (timeLeftMS < 0) timeLeftMS = 0;

    let seconds = Math.floor(timeLeftMS / 1000) % 60;
    let minutes = Math.floor(timeLeftMS / (1000 * 60));

    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function setSignalButtonsDisabled(isDisabled) {
    btnMainStraight.disabled = isDisabled;
    btnMainLeft.disabled = isDisabled;
    btnSideStraight.disabled = isDisabled;
    btnSideLeft.disabled = isDisabled;
}

function endGame() {
    isGameRunning = false;
    stopSpawners();
    clearTimeout(phaseChangeTimeout);
    isTransitioning = false;

    gameOverDisplay.style.display = 'block'; // Show "Game Over!"
    setSignalButtonsDisabled(true);
    btnStart.disabled = true;
    btnReset.disabled = false; 
}

function drawInitialState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawIntersection();
    drawLaneLines();
    drawStopBars();
}

// --- CHANGED (Req 2): Reset throughput counter ---
function resetGame() {
    isGameRunning = false;
    stopSpawners();
    
    clearTimeout(phaseChangeTimeout);
    clearTimeout(gameTimerTimeout);
    isTransitioning = false;
    vehicles = [];
    gameEndTime = 0; // Reset end time
    
    currentPhase = 'main_straight';
    phaseDisplay.textContent = 'Main Street Straight'.toUpperCase();
    
    // Reset scores
    scoreDisplay.textContent = "0.00";
    throughputCount = 0; // Reset throughput
    throughputDisplay.textContent = "0"; // Reset display
    
    timerDisplay.textContent = "2:00";
    gameOverDisplay.style.display = 'none';

    setSignalButtonsDisabled(true);
    btnStart.disabled = false;
    btnReset.disabled = true;
    
    drawInitialState();
}

function startGame() {
    if (isGameRunning) return; 
    resetGame(); 
    isGameRunning = true;
    startSpawners();
    
    gameEndTime = Date.now() + GAME_DURATION_MS;
    gameTimerTimeout = setTimeout(endGame, GAME_DURATION_MS);
    
    setSignalButtonsDisabled(false);
    btnStart.disabled = true;
    btnReset.disabled = false;

    gameLoop();
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
        
        // --- NEW (Req 2): Check for throughput ---
        if (!v.hasBeenCounted && v.isPastIntersection()) {
            throughputCount++;
            v.hasBeenCounted = true;
            throughputDisplay.textContent = throughputCount;
        }
        
        // Remove vehicles that are off-screen
        if (v.y > canvas.height + 50 || v.y < -50 || v.x > canvas.width + 50 || v.x < -50) {
            vehicles.splice(i, 1);
        }
    }
    
    updateScore();
    updateTimerDisplay();
    
    if (isGameRunning) {
        requestAnimationFrame(gameLoop);
    }
}

// --- Set the initial "ready" state on load ---
resetGame();