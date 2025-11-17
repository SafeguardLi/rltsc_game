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

// --- NEW: Get the reset button ---
const btnReset = document.getElementById('btnReset');

// --- 2. LANE & INTERSECTION COORDINATES ---
const INTERSECTION = {
    x_start: 350, x_end: 450,
    y_start: 250, y_end: 350
};
// CORRECTED LANES
const LANES = {
    main_sb_left: 362.5,     // Inner lane
    main_sb_straight: 387.5, // Outer lane
    main_nb_left: 412.5,     // Inner lane
    main_nb_straight: 437.5, // Outer lane
    side_wb_straight: 262.5, // Outer lane
    side_wb_left: 287.5,     // Inner lane
    side_eb_straight: 312.5, // Outer lane
    side_eb_left: 337.5      // Inner lane
};

// --- 3. SIMULATION CONSTANTS ---
const PIXELS_PER_METER = 5;
const SAFE_GAP_PIXELS = 2.5 * PIXELS_PER_METER;
const NORMAL_SPEED_PIXELS = 2;

// --- 4. GAME STATE ---
let currentPhase = 'main_straight';
let vehicles = [];
let vehicleIdCounter = 0;
let completedTravelTimes = [];

// --- 5. VEHICLE CLASS ---
// (This class is unchanged from the previous step)
class Vehicle {
    constructor(startX, startY, lane, direction) {
        this.id = vehicleIdCounter++;
        this.x = startX;
        this.y = startY;
        this.lane = lane;
        this.direction = direction;
        this.speed = NORMAL_SPEED_PIXELS;
        this.startTime = Date.now();
        this.state = 'approaching';
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
            case 'east':  return this.x > LANES.main_sb_left;
            case 'west':  return this.x < LANES.main_nb_left;
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
    update(allVehicles) {
        let isGreenLight = (this.lane === currentPhase);
        let isAtStopLine = this.checkStopLine();
        let leadVehicle = this.findLeadVehicle(allVehicles);
        let distanceToLead = Infinity;
        if (leadVehicle) {
            distanceToLead = Math.abs(this.calculateDistanceTo(leadVehicle));
        }
        if (!isGreenLight && isAtStopLine) {
            this.speed = 0;
        } else if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
            this.speed = 0;
        } else {
            this.speed = NORMAL_SPEED_PIXELS;
        }
        if (this.speed > 0) {
            if (this.lane.includes('left') && this.state === 'approaching' && this.hasReachedTurnPoint()) {
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
    checkStopLine() {
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
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
}

// --- 6. SIMULATION LOGIC ---
// (Spawners are unchanged)
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

setInterval(spawnMainStraight, 1000);
setInterval(spawnSideStraight, 2000);
setInterval(spawnMainLeft, 5000);
setInterval(spawnSideLeft, 7000);

// --- 7. USER INPUT (Button Clicks) ---
btnMainStraight.onclick = function() { currentPhase = 'main_straight'; phaseDisplay.textContent = 'Main Street Straight'; };
btnMainLeft.onclick = function() { currentPhase = 'main_left'; phaseDisplay.textContent = 'Main Street Left'; };
btnSideStraight.onclick = function() { currentPhase = 'side_straight'; phaseDisplay.textContent = 'Side Street Straight'; };
btnSideLeft.onclick = function() { currentPhase = 'side_left'; phaseDisplay.textContent = 'Side Street Left'; };

// --- NEW: Add the click event for the reset button ---
btnReset.onclick = function() {
    resetGame();
};

// --- 8. DRAWING FUNCTIONS ---
// (All drawing functions are unchanged)
function drawIntersection() { 
    ctx.fillStyle = '#666';
    ctx.fillRect(INTERSECTION.x_start, 0, (INTERSECTION.x_end - INTERSECTION.x_start), 600);
    ctx.fillRect(0, INTERSECTION.y_start, 800, (INTERSECTION.y_end - INTERSECTION.y_start));
}
function drawLaneLines() { 
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'yellow';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(400, 0); ctx.lineTo(400, INTERSECTION.y_start);
    ctx.moveTo(400, INTERSECTION.y_end); ctx.lineTo(400, 600);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 300); ctx.lineTo(INTERSECTION.x_start, 300);
    ctx.moveTo(INTERSECTION.x_end, 300); ctx.lineTo(800, 300);
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.setLineDash([10, 10]);
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
    let mainStraightColor = (currentPhase === 'main_straight') ? 'green' : 'red';
    let mainLeftColor = (currentPhase === 'main_left') ? 'green' : 'red';
    let sideStraightColor = (currentPhase === 'side_straight') ? 'green' : 'red';
    let sideLeftColor = (currentPhase === 'side_left') ? 'green' : 'red';
    
    // Main St, Southbound
    ctx.strokeStyle = mainLeftColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_sb_left - 7.5, INTERSECTION.y_start); ctx.lineTo(LANES.main_sb_left + 7.5, INTERSECTION.y_start); ctx.stroke();
    ctx.strokeStyle = mainStraightColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_sb_straight - 7.5, INTERSECTION.y_start); ctx.lineTo(LANES.main_sb_straight + 7.5, INTERSECTION.y_start); ctx.stroke();
    
    // Main St, Northbound
    ctx.strokeStyle = mainStraightColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_nb_straight - 7.5, INTERSECTION.y_end); ctx.lineTo(LANES.main_nb_straight + 7.5, INTERSECTION.y_end); ctx.stroke();
    ctx.strokeStyle = mainLeftColor;
    ctx.beginPath(); ctx.moveTo(LANES.main_nb_left - 7.5, INTERSECTION.y_end); ctx.lineTo(LANES.main_nb_left + 7.5, INTERSECTION.y_end); ctx.stroke();

    // Side St, Westbound
    ctx.strokeStyle = sideLeftColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_end, LANES.side_wb_left - 7.5); ctx.lineTo(INTERSECTION.x_end, LANES.side_wb_left + 7.5); ctx.stroke();
    ctx.strokeStyle = sideStraightColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_end, LANES.side_wb_straight - 7.5); ctx.lineTo(INTERSECTION.x_end, LANES.side_wb_straight + 7.5); ctx.stroke();

    // Side St, Eastbound
    ctx.strokeStyle = sideStraightColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_start, LANES.side_eb_straight - 7.5); ctx.lineTo(INTERSECTION.x_start, LANES.side_eb_straight + 7.5); ctx.stroke();
    ctx.strokeStyle = sideLeftColor;
    ctx.beginPath(); ctx.moveTo(INTERSECTION.x_start, LANES.side_eb_left - 7.5); ctx.lineTo(INTERSECTION.x_start, LANES.side_eb_left + 7.5); ctx.stroke();
}

// Function to update the score (unchanged)
function updateScore() {
    if (completedTravelTimes.length === 0) {
        scoreDisplay.textContent = "0.00";
        return;
    }
    let sum = completedTravelTimes.reduce((a, b) => a + b, 0);
    let avg = sum / completedTravelTimes.length;
    scoreDisplay.textContent = avg.toFixed(2);
}

// --- NEW: Function to reset the game ---
function resetGame() {
    // 1. Clear all vehicles
    vehicles = [];
    
    // 2. Reset score
    completedTravelTimes = [];
    updateScore(); // This will set the display to "0.00"
    
    // 3. Reset the signal phase to default
    currentPhase = 'main_straight';
    phaseDisplay.textContent = 'Main Street Straight';
}

// --- 9. THE GAME LOOP ---
// (Unchanged)
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawIntersection();
    drawLaneLines();
    drawStopBars();

    for (let i = vehicles.length - 1; i >= 0; i--) {
        let v = vehicles[i];
        v.update(vehicles); 
        v.draw();
        
        if (v.y > canvas.height + 50 || v.y < -50 || v.x > canvas.width + 50 || v.x < -50) {
            let travelTime = (Date.now() - v.startTime) / 1000;
            completedTravelTimes.push(travelTime);
            vehicles.splice(i, 1);
        }
    }
    updateScore();
    requestAnimationFrame(gameLoop);
}

// Start the game!
gameLoop();