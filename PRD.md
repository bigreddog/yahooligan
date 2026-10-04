Product Requirements Document (PRD)
Project: Interactive BLE Smart Trainer Dashboard & Video Simulator
Target Hardware: Wahoo KICKR CORE (Power, Cadence, and FTMS Resistance Control via BLE) and Garmin Enduro 3 (Heart Rate Broadcast via BLE)
Primary Platform: Mobile Web Browser (Android Chrome or iOS via WebBLE/Bluefy)
Architecture: Single-Page Application (SPA) using HTML, CSS, Vanilla JavaScript, and the YouTube IFrame Player API. No backend server.
1. Product Overview
Objective: Build a zero-dependency, client-side mobile web application that transforms a static indoor workout into an interactive simulation. The app overlays real-time metrics on a YouTube feed, controls the smart trainer's resistance based on pre-encoded routes (derived from GPX files), and modulates video playback speed based on the rider's virtual speed.
Design Philosophy: Immersive, mobile-first, HUD (Heads-Up Display) layout. The UI must sit transparently over the video feed, with large touch targets placed at the edges of the screen to minimize video obstruction.
2. Core Features & Requirements
2.1. Route Data & GPX Pipeline
Source Data: Routes are sourced from raw GPX files located in a local /data/routes/source directory.
Conversion Utility: A standalone Node.js or browser-based utility script to parse these GPX files and convert them into an optimized JSON schema.
GPX Parsing Constraints: Calculate cumulative distance (Haversine formula), extract elevation to calculate segment gradients (%), and smooth/decimate the data into manageable segments to prevent flooding the trainer with FTMS commands.
Initial Route Specification:
The first encoded route must map to the YouTube video ID 3wED7BS-BXM.
The corresponding GPX file will represent the route context of that video.
JSON Schema Output:
id: Unique identifier.
youtubeId: The associated video ID (e.g., "3wED7BS-BXM").
baseSpeedKmh: The average recording speed of the video (used as a baseline for 1.0x playback sync).
defaultMode: SIM or ERG.
segments: Array mapping distance (km) to either grade (%) or targetPower (watts).
2.2. Route Modes: SIM vs. ERG
The user must select an execution mode before starting a route:
SIM (Simulation) Mode: The trainer dynamically adjusts resistance based on the parsed elevation gradient of the route segment. Virtual speed and video playback scale based on the rider's power output against the gradient and assumed system weight.
ERG (Target Power) Mode: The user specifies a flat target wattage (e.g., locking the KICKR to 200W). The trainer ignores gradients, and virtual speed/video playback decouple from elevation, progressing at a steady rate based on sustained power output.
2.3. Video & HUD Overlay Integration
YouTube IFrame API: Embed the target YouTube video as the full-screen background.
Playback Speed Control: Dynamically adjust the video playback rate (player.setPlaybackRate()) based on virtual speed vs. base recording speed. (Note: YouTube supports discrete rates: 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0).
Transparent Dashboard: Metric displays (Power, Cadence, HR, Distance, Time, Current Grade/Watts Target) and controls must float over the video using CSS grid and z-index.
2.4. Web Bluetooth: Reading & Controlling (FTMS)
Sensors (Read): Heart Rate Service (0x180D) and Cycling Power Service (0x1818).
Trainer Control (Write via FTMS 0x1826):
SIM Mode: Utilize the Fitness Machine Control Point (0x2AD9) to send "Set Target Inclination" commands based on the route gradients.
ERG Mode: Send "Set Target Power" commands to lock the KICKR CORE to the selected wattage.
2.5. Session Recording & Strava API
Data Aggregation: Maintain a recording state array { timestamp, distance, heartRate, power, cadence, virtualSpeed, altitude } at 1 Hz.
TCX Generation: Translate the array into a valid Training Center XML (TCX) schema client-side. The virtual distance and simulated altitude must be included for Strava map generation.
Strava Upload: POST the generated .tcx payload to https://www.strava.com/api/v3/uploads with activity:write permissions via client-side OAuth 2.0 (credentials stored in localStorage).
3. Agent Implementation Phases
Phase 1: GPX Conversion Tool & Route Scaffold
Write the GPX-to-JSON parser utility.
Initialize the routes.json catalog, explicitly defining the 3wED7BS-BXM video as the first mapped route.
Phase 2: YouTube API & HUD Layout
Create the core layout with the YouTube IFrame background.
Build the floating CSS Grid layout, including UI elements for selecting the active route, toggling SIM/ERG modes, and manually adjusting target watts.
Phase 3: Advanced BLE & FTMS Control
Implement standard BLE reads for Garmin HR and Wahoo Power/Cadence.
Implement FTMS connection logic, writing the specific byte array structures required for both "Set Target Inclination" (SIM) and "Set Target Power" (ERG).
Phase 4: Route Simulation & Physics Engine
Implement the core execution loop that syncs virtual distance with the JSON route array.
In SIM mode: Write the current incline to the trainer and throttle YouTube playback based on power-to-speed physics.
In ERG mode: Write the target watts to the trainer and maintain steady video progression.
Phase 5: Recording, TCX, & Strava
Implement the 1Hz recording array capturing virtual distance and elevation.
Write the pure JS TCX generator and implement the Strava OAuth and multipart form upload logic. Provide a local download fallback.
