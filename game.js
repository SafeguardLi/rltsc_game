// Get the "canvas" element from the HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // "ctx" is the 2D drawing tool

// --- 1. GET UI ELEMENTS ---
const phaseDisplay = document.getElementById('currentPhaseDisplay');
const btnMainStraight = document.getElementById('btnMainStraight');
const btnMainLeft = document.getElementById('btnMainLeft');
const btnSideStraight = document.getElementById('btnSideStraight');
const btnSideLeft = document.getElementById('btnSideLeft');

// --- 2. LANE & INTERSECTION COORDINATES ---
const INTERSECTION = {
    x_start: 350, x_end: 450,
    y_start: 250, y_end: 350
};
const LANES = {
    main_sb_left: 362.5, main_sb_straight: 387.5,
    main_nb_straight: 412.5, main_nb_left: 437.5,
    side_wb_left: 262.5, side_wb_straight: 287.5,
    side_eb_straight: 312.5, side_eb_left: 337.5
};

// --- 3. NEW: SIMULATION CONSTANTS ---
const PIXELS_PER_METER = 5; // 25px vehicle height / 5m vehicle length
const VEHICLE_LENGTH_METERS = 5;
const SAFE_GAP_METERS = 2.5;

// The bumper-to-bumper gap we want to maintain
const SAFE_GAP_PIXELS = SAFE_GAP_METERS * PIXELS_PER_METER; // 12.5 pixels
const NORMAL_SPEED_PIXELS = 2; // Vehicle speed

// --- 4. GAME STATE ---
let currentPhase = 'main_straight';
let vehicles = [];
let vehicleIdCounter = 0;

// --- 5. VEHICLE CLASS ---
class Vehicle {
    constructor(startX, startY, lane, direction) {
        this.id = vehicleIdCounter++;
        this.x = startX; // Note: x, y are the vehicle's CENTER
        this.y = startY;
        this.lane = lane;
        this.direction = direction;
        this.speed = NORMAL_SPEED_PIXELS;

        // Set dimensions (based on 5m length = 25px)
        if (this.direction === 'north' || this.direction === 'south') {
            this.width = 15; // 3m wide
            this.height = 25; // 5m long
            this.color = 'blue';
        } else { // 'east' or 'west'
            this.width = 25; // 5m long
            this.height = 15; // 3m wide
            this.color = 'red';
        }
    }

    // --- NEW: Method to find the car directly in front ---
    findLeadVehicle(allVehicles) {
        let vehiclesInMyLane = allVehicles.filter(v =>
            v.id !== this.id && v.lane === this.lane && v.direction === this.direction
        );

        let leadVehicles = [];
        switch (this.direction) {
            case 'south': // Find cars with a greater y
                leadVehicles = vehiclesInMyLane.filter(v => v.y > this.y);
                leadVehicles.sort((a, b) => a.y - b.y); // Closest one first
                break;
            case 'north': // Find cars with a smaller y
                leadVehicles = vehiclesInMyLane.filter(v => v.y < this.y);
                leadVehicles.sort((a, b) => b.y - a.y); // Closest one first
                break;
            case 'east': // Find cars with a greater x
                leadVehicles = vehiclesInMyLane.filter(v => v.x > this.x);
                leadVehicles.sort((a, b) => a.x - b.x); // Closest one first
                break;
            case 'west': // Find cars with a smaller x
                leadVehicles = vehiclesInMyLane.filter(v => v.x < this.x);
                leadVehicles.sort((a, b) => b.x - a.x); // Closest one first
                break;
        }

        return leadVehicles.length > 0 ? leadVehicles[0] : null;
    }

    // --- NEW: Method to get bumper-to-bumper distance ---
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
                return theirRearBumper - myFrontBumper; // This will be negative, we use Math.abs
            case 'east':
                myFrontBumper = this.x + this.width / 2;
                theirRearBumper = leadVehicle.x - leadVehicle.width / 2;
                return theirRearBumper - myFrontBumper;
            case 'west':
                myFrontBumper = this.x - this.width / 2;
                theirRearBumper = leadVehicle.x + leadVehicle.width / 2;
                return theirRearBumper - myFrontBumper; // This will be negative, we use Math.abs
        }
    }

    // --- CHANGED: update() now takes allVehicles ---
    update(allVehicles) {
        let isGreenLight = (this.lane === currentPhase);
        let isAtStopLine = this.checkStopLine();

        let leadVehicle = this.findLeadVehicle(allVehicles);
        let distanceToLead = Infinity;

        if (leadVehicle) {
            distanceToLead = Math.abs(this.calculateDistanceTo(leadVehicle));
        }

        // --- THIS IS THE NEW QUEUING LOGIC ---
        if (!isGreenLight && isAtStopLine) {
            // Condition 1: Stop for red light
            this.speed = 0;
        } else if (leadVehicle && distanceToLead < SAFE_GAP_PIXELS) {
            // Condition 2: Stop for the car in front
            this.speed = 0;
        } else {
            // Condition 3: Go!
            this.speed = NORMAL_SPEED_PIXELS;
        }
        // --- END OF NEW LOGIC ---

        // Move based on direction
        switch (this.direction) {
            case 'north': this.y -= this.speed; break;
            case 'south': this.y += this.speed; break;
            case 'east':  this.x += this.speed; break;
            case 'west':  this.x -= this.speed; break;
        }
    }

    // Check if the vehicle is at its stop line
    checkStopLine() {
        // Use a 3px buffer to stop *before* the line
        const buffer = 3; 
        switch (this.direction) {
            case 'south': // Approaching top of intersection
                return this.y + this.height / 2 > INTERSECTION.y_start - buffer;
            case 'north': // Approaching bottom of intersection
                return this.y - this.height / 2 < INTERSECTION.y_end + buffer;
            case 'east': // Approaching left of intersection
                return this.x + this.width / 2 > INTERSECTION.x_start - buffer;
            case 'west': // Approaching right of intersection
                return this.x - this.width / 2 < INTERSECTION.x_end + buffer;
        }
        return false;
    }

    // Draw the vehicle on the canvas
    draw() {
        ctx.fillStyle = this.color;
        // Draw from center point
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

// Start the spawners
setInterval(spawnMainStraight, 1000);
setInterval(spawnSideStraight, 2000);
setInterval(spawnMainLeft, 5000);
setInterval(spawnSideLeft, 7000);


// --- 7. USER INPUT (Button Clicks) ---
// (Unchanged)
btnMainStraight.onclick = function() {
    currentPhase = 'main_straight';
    phaseDisplay.textContent = 'Main Street Straight';
};
btnMainLeft.onclick = function() {
    currentPhase = 'main_left';
    phaseDisplay.textContent = 'Main Street Left';
};
btnSideStraight.onclick = function() {
    currentPhase = 'side_straight';
    phaseDisplay.textContent = 'Side Street Straight';
};
btnSideLeft.onclick = function() {
    currentPhase = 'side_left';
    phaseDisplay.textContent = 'Side Street Left';
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


// --- 9. THE GAME LOOP ---
function gameLoop() {
    // 1. Clear the entire screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 2. Draw the static world
    drawIntersection();
    drawLaneLines();
    
    // 3. Draw the stop bars (signals)
    drawStopBars();

    // 4. Update and Draw all vehicles
    for (let i = vehicles.length - 1; i >= 0; i--) {
        let v = vehicles[i];
        
        // --- CHANGED: Pass the full vehicle list to update() ---
        v.update(vehicles); 
        v.draw();   // Draw to canvas
        
        // 5. Remove vehicles that are off-screen
        if (v.y > canvas.height + 50 || v.y < -50 || v.x > canvas.width + 50 || v.x < -50) {
            vehicles.splice(i, 1);
        }
    }

    // 6. Keep the loop running
    requestAnimationFrame(gameLoop);
}

// Start the game!
gameLoop();