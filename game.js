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
const throughputDisplay = document.getElementById('throughputDisplay');

// --- 2. LANE & INTERSECTION COORDINATES ---
const INTERSECTION = { x_start: 350, x_end: 450, y_start: 250, y_end: 350 };

// --- BUG FIX from previous step is included here ---
const LANES = {
    // Southbound (driving down): Left is closer to x=400 (centerline)
    main_sb_straight: 362.5, 
    main_sb_left: 387.5,     

    // Northbound (driving up): Left is closer to x=400 (centerline)
    main_nb_left: 412.5,     
    main_nb_straight: 437.5, 
    
    // Westbound (driving left): Left is closer to y=300 (centerline)
    side_wb_straight: 262.5, 
    side_wb_left: 287.5,     

    // Eastbound (driving right): Left is closer to y=300 (centerline)
    side_eb_left: 312.5,     
    side_eb_straight: 337.5  
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
let throughputCount = 0;

// --- CHANGED: New variables for Historical Average ---
let totalTravelTimeSum = 0;
let completedTripsCount = 0;

// --- 5. VEHICLE CLASS ---
class Vehicle {
    constructor(startX, startY, lane, direction) {
        this.id = vehicleIdCounter++;
        this.x = startX; this.y = startY;
        this.lane = lane; this.direction = direction;
        this.speed = NORMAL_SPEED_PIXELS;
        this.startTime = Date.now();
        this.state = 'approaching';
        this.hasBeenCounted = false;
        if (this.direction === 'north' || this.direction === 'south') {
            this.width = 15; this.height = 25; this.color = 'blue';
        } else {
            this.width = 25; this.height = 15; this.color = 'red';
        }
    }

    findLeadVehicle(allVehicles) {
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

    calculateDistanceTo(leadVehicle) {
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

    hasReachedTurnPoint() {
        switch (this.direction) {
            case 'south': return this.y > LANES.side_eb_left;
            case 'north': return this.y < LANES.side_wb_left;
            case 'east':  return this.x > LANES.main_nb_left;
            case 'west':  return this.x < LANES.main_sb_left;
        }
        return false;
    }

    performTurn() {
        this.state = 'turning';
        switch (this.direction) {
            case 'south': this.direction = 'east'; break;
            case 'north': this.direction = 'west'; break;
            case 'east':  this.direction = 'north'; break;
            case 'west':  this.direction = 'south'; break;
        }
    }

    getLightStatus() {
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

    checkIsAtStopLine() {
        const stopBuffer = 3; 
        const checkZone = 10; 
        
        switch (this.direction) {
            case 'south': 
                let stopY_S = INTERSECTION.y_start - stopBuffer;
                let frontY_S = this.y + this.height / 2;
                return (frontY_S >= stopY_S - checkZone) && (frontY_S <= stopY_S);
            case 'north':
                let stopY_N = INTERSECTION.y_end + stopBuffer;
                let frontY_N = this.y - this.height / 2;
                return (frontY_N <= stopY_N + checkZone) && (frontY_N >= stopY_N);
            case 'east': 
                let stopX_E = INTERSECTION.x_start - stopBuffer;
                let frontX_E = this.x + this.width / 2;
                return (frontX_E >= stopX_E - checkZone) && (frontX_E <= stopX_E);
            case 'west': 
                let stopX_W = INTERSECTION.x_end + stopBuffer;
                let frontX_W = this.x - this.width / 2;
                return (frontX_W <= stopX_W + checkZone) && (frontX_W >= stopX_W);
        }
        return false;
    }

    checkHasCrossedStopLine() {
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
    
    isPastIntersection() {
        switch (this.direction) {
            case 'south': return this.y - this.height / 2 > INTERSECTION.y_end;
            case 'north': return this.y + this.height / 2 < INTERSECTION.y_start;
            case 'east':  return this.x - this.width / 2 > INTERSECTION.x_end;
            case 'west':  return this.x + this.width / 2 < INTERSECTION.x_start;
        }
        return false;
    }

    update(allVehicles) {
        let leadVehicle = this.findLeadVehicle(allVehicles);
        let distanceToLead = leadVehicle ? Math.abs(this.calculateDistanceTo(leadVehicle)) : Infinity;

        if (this.state !== 'approaching') {
            if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
                this.speed = 0;
            } else {
                this.speed = NORMAL_SPEED_PIXELS;
            }
            
            if (this.state === 'in_intersection_turning' && this.hasReachedTurnPoint()) {
                this.performTurn();
            }
        }
        else {
            let lightStatus = this.getLightStatus();
            let isAtStopLine = this.checkIsAtStopLine(); 

            if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
                this.speed = 0;
            } else if (isAtStopLine && lightStatus === 'red') {
                this.speed = 0;
            } else if (isAtStopLine && lightStatus === 'yellow' && this.speed === 0) {
                this.speed = 0; 
            }
            else {
                this.speed = NORMAL_SPEED_PIXELS;
                
                if (this.checkHasCrossedStopLine()) {
                    if (this.lane.includes('left')) {
                        this.state = 'in_intersection_turning';
                    } else {
                        this.state = 'in_intersection_straight';
                    }
                }
            }
        }
        
        if (this.speed > 0) {
            switch (this.direction) {
                case 'north': this.y -= this.speed; break;
                case 'south': this.y += this.speed; break;
                case 'east':  this.x += this.speed; break;
                case 'west':  this.x -= this.speed; break;
            }
        }
    }
    
    draw() {
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

function requestPhaseChange(requestedPhase) {
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
function drawIntersection() { 
    ctx.fillStyle = '#666';
    ctx.fillRect(INTERSECTION.x_start, 0, (INTERSECTION.x_end - INTERSECTION.x_start), 600);
    ctx.fillRect(0, INTERSECTION.y_start, 800, (INTERSECTION.y_end - INTERSECTION.y_start));
}
function drawLaneLines() { 
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
function drawStopBars() { 
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

// --- CHANGED: Now calculates Historical Average ---
function updateScore() {
    if (completedTripsCount === 0) {
        scoreDisplay.textContent = "0.00";
        return;
    }
    let avg = totalTravelTimeSum / completedTripsCount;
    scoreDisplay.textContent = avg.toFixed(2);
}

function updateTimerDisplay() {
    if (!isGameRunning && gameEndTime === 0) return;
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
    gameOverDisplay.style.display = 'block';
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
function resetGame() {
    isGameRunning = false;
    stopSpawners();
    clearTimeout(phaseChangeTimeout);
    clearTimeout(gameTimerTimeout);
    isTransitioning = false;
    vehicles = [];
    gameEndTime = 0;
    
    // --- CHANGED: Reset the historical counters ---
    totalTravelTimeSum = 0;
    completedTripsCount = 0;
    
    currentPhase = 'main_straight';
    phaseDisplay.textContent = 'Main Street Straight'.toUpperCase();
    scoreDisplay.textContent = "0.00";
    throughputCount = 0;
    throughputDisplay.textContent = "0";
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
    if (!isGameRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawIntersection();
    drawLaneLines();
    drawStopBars();

    for (let i = vehicles.length - 1; i >= 0; i--) {
        let v = vehicles[i];
        v.update(vehicles); 
        v.draw();
        
        if (!v.hasBeenCounted && v.isPastIntersection()) {
            throughputCount++;
            v.hasBeenCounted = true;
            throughputDisplay.textContent = throughputCount;
        }
        
        if (v.y > canvas.height + 50 || v.y < -50 || v.x > canvas.width + 50 || v.x < -50) {
            
            // --- CHANGED: Record travel time when vehicle finishes trip ---
            let tripTime = (Date.now() - v.startTime) / 1000; // seconds
            totalTravelTimeSum += tripTime;
            completedTripsCount++;
            // --- End change ---
            
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