// Get the "canvas" element from the HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // "ctx" is the 2D drawing tool

// Get the UI elements
const phaseDisplay = document.getElementById('currentPhaseDisplay');
const btnMainGo = document.getElementById('btnMainGo');
const btnMainLeft = document.getElementById('btnMainLeft');
const btnSideGo = document.getElementById('btnSideGo');
const btnSideLeft = document.getElementById('btnSideLeft');

// --- 1. GAME STATE ---

// This variable controls the entire simulation
let currentPhase = 'main_go'; // Possible values: 'main_go', 'main_left', 'side_go', 'side_left'

// A list to hold all the car objects
let vehicles = [];
let vehicleIdCounter = 0;

// --- 2. OBJECT-ORIENTED DESIGN (The 'Vehicle' Class) ---
// A "blueprint" for creating vehicle objects
class Vehicle {
    constructor(startX, startY, lane) {
        this.id = vehicleIdCounter++;
        this.x = startX;
        this.y = startY;
        this.lane = lane; // e.g., 'main_go', 'side_left'
        this.speed = 2;
        this.width = 10;
        this.height = 20;
        this.color = (lane.includes('main')) ? 'blue' : 'red';
    }

    // Update the vehicle's position
    update() {
        // --- THIS IS THE CORE LOGIC ---
        // Check if this vehicle's lane matches the current signal phase
        let isGreenLight = (this.lane === currentPhase);
        
        // Simple logic: if the light is green, move. If red, stop at the intersection.
        // A real game would have "stop line" coordinates.
        if (isGreenLight) {
            this.speed = 2;
        } else {
            // Simple stop logic: stop before the middle (e.g., y < 300)
            if (this.y > 280 && this.y < 320) { // Approaching intersection
                this.speed = 0;
            } else {
                this.speed = 2; // Keep moving toward the red light
            }
        }
        
        // This simple example only moves cars down.
        // A real game would change x or y based on the lane.
        this.y += this.speed;
        
        // TODO: Add logic to check for car in front
    }

    // Draw the vehicle on the canvas
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}


// --- 3. SIMULATION LOGIC ---

function spawnMainStreetVehicle() {
    console.log("Spawning Main Street vehicle");
    // This is just an example. You'd pick a random start pos.
    vehicles.push(new Vehicle(400, 0, 'main_go'));
}

function spawnSideStreetVehicle() {
    console.log("Spawning Side Street vehicle");
    // This is just an example. You'd pick a random start pos.
    vehicles.push(new Vehicle(200, 0, 'side_go'));
    // TODO: Add 'main_left' and 'side_left' spawns
}

// Start the vehicle spawners
setInterval(spawnMainStreetVehicle, 1000); // 1 vehicle per second
setInterval(spawnSideStreetVehicle, 2000); // 1 vehicle per 2 seconds

// --- 4. USER INPUT (Button Clicks) ---

btnMainGo.onclick = function() {
    currentPhase = 'main_go';
    phaseDisplay.textContent = 'Main Go';
};
btnMainLeft.onclick = function() {
    currentPhase = 'main_left';
    phaseDisplay.textContent = 'Main Left';
};
btnSideGo.onclick = function() {
    currentPhase = 'side_go';
    phaseDisplay.textContent = 'Side Go';
};
btnSideLeft.onclick = function() {
    currentPhase = 'side_left';
    phaseDisplay.textContent = 'Side Left';
};

// --- 5. THE GAME LOOP ---

function drawIntersection() {
    // Draw Main Street (Vertical)
    ctx.fillStyle = '#666';
    ctx.fillRect(350, 0, 100, 600); // Main road
    
    // Draw Side Street (Horizontal)
    ctx.fillStyle = '#666';
    ctx.fillRect(0, 250, 800, 100); // Side road
    
    // TODO: Draw traffic lights based on 'currentPhase'
}

function gameLoop() {
    // 1. Clear the entire screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 2. Draw the static world
    drawIntersection();
    
    // 3. Update and Draw all vehicles
    // We loop backwards to make it easier to remove vehicles
    for (let i = vehicles.length - 1; i >= 0; i--) {
        let v = vehicles[i];
        v.update(); // Update position and speed
        v.draw();   // Draw to canvas
        
        // 4. Remove vehicles that are off-screen
        if (v.y > canvas.height) {
            vehicles.splice(i, 1);
        }
    }

    // 5. Keep the loop running
    requestAnimationFrame(gameLoop);
}

// Start the game!
gameLoop();