// js/app.js

let player; // YouTube Player instance
let routeData = null;
let currentSegmentIndex = 0;

// State
let state = {
    isRunning: false,
    mode: 'SIM',
    power: 0,
    cadence: 0,
    hr: 0,
    speedKmh: 0,
    distanceKm: 0,
    timeSeconds: 0,
    currentGrade: 0,
    targetWatts: 150,
    baseSpeedKmh: 25
};

// DOM Elements
const ui = {
    power: document.getElementById('metric-power'),
    cadence: document.getElementById('metric-cadence'),
    hr: document.getElementById('metric-hr'),
    speed: document.getElementById('metric-speed'),
    distance: document.getElementById('metric-distance'),
    time: document.getElementById('metric-time'),
    grade: document.getElementById('metric-grade'),
    targetPower: document.getElementById('metric-target-power'),

    btnTrainer: document.getElementById('btn-connect-trainer'),
    btnHr: document.getElementById('btn-connect-hr'),
    btnStart: document.getElementById('btn-start-route'),
    btnTcx: document.getElementById('btn-download-tcx'),
    btnStrava: document.getElementById('btn-upload-strava'),

    radiosMode: document.getElementsByName('mode'),
    ergControls: document.getElementById('erg-controls'),
    inputWatts: document.getElementById('input-target-watts'),
    btnSetWatts: document.getElementById('btn-set-watts')
};

// YouTube IFrame API Ready Callback
function onYouTubeIframeAPIReady() {
    // Wait until route data is loaded to initialize player with correct ID
    fetchRouteData();
}

async function fetchRouteData() {
    try {
        const response = await fetch('data/routes.json');
        const routes = await response.json();
        routeData = routes[0]; // Load first route

        state.baseSpeedKmh = routeData.baseSpeedKmh || 25;

        // Init player
        player = new YT.Player('youtube-player', {
            videoId: routeData.youtubeId,
            playerVars: {
                'autoplay': 0,
                'controls': 0,
                'disablekb': 1,
                'modestbranding': 1,
                'rel': 0,
                'showinfo': 0
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });

    } catch (err) {
        console.error("Failed to load route data", err);
    }
}

function onPlayerReady(event) {
    console.log("YouTube Player Ready");
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        stopSession();
    }
}

// BLE Callbacks
BLE.onPowerData = (val) => { state.power = val; updateUI(); };
BLE.onCadenceData = (val) => { state.cadence = val; updateUI(); };
BLE.onHrData = (val) => { state.hr = val; updateUI(); };

// Event Listeners
ui.btnTrainer.addEventListener('click', async () => {
    const success = await BLE.connectTrainer();
    if (success) {
        ui.btnTrainer.innerText = "Trainer Connected";
        ui.btnTrainer.disabled = true;
    }
});

ui.btnHr.addEventListener('click', async () => {
    const success = await BLE.connectHR();
    if (success) {
        ui.btnHr.innerText = "HR Connected";
        ui.btnHr.disabled = true;
    }
});

ui.radiosMode.forEach(radio => {
    radio.addEventListener('change', (e) => {
        state.mode = e.target.value;
        ui.ergControls.style.display = state.mode === 'ERG' ? 'flex' : 'none';
        ui.grade.parentElement.style.display = state.mode === 'SIM' ? 'flex' : 'none';

        if (state.isRunning) applyTrainerMode();
    });
});

ui.btnSetWatts.addEventListener('click', () => {
    state.targetWatts = parseInt(ui.inputWatts.value, 10);
    if (state.isRunning && state.mode === 'ERG') {
        BLE.setTargetPower(state.targetWatts);
    }
    updateUI();
});

ui.btnStart.addEventListener('click', () => {
    if (state.isRunning) {
        stopSession();
    } else {
        startSession();
    }
});

function applyTrainerMode() {
    if (state.mode === 'ERG') {
        BLE.setTargetPower(state.targetWatts);
    } else {
        // SIM mode - will be updated in the tick loop
        BLE.setTargetInclination(state.currentGrade);
    }
}

let tickInterval;

function startSession() {
    if (!routeData) return;

    state.isRunning = true;
    ui.btnStart.innerText = "Stop Route";

    applyTrainerMode();

    if (player && player.playVideo) {
        player.playVideo();
    }

    // Start 1Hz Execution Loop
    tickInterval = setInterval(tick, 1000);
}

function stopSession() {
    state.isRunning = false;
    ui.btnStart.innerText = "Start Route";

    clearInterval(tickInterval);

    if (player && player.pauseVideo) {
        player.pauseVideo();
    }

    ui.btnTcx.disabled = false;
    ui.btnStrava.disabled = false;
}

function tick() {
    state.timeSeconds++;

    if (state.mode === 'SIM') {
        // 1. Calculate Speed based on Physics
        state.speedKmh = Physics.calculateSpeedKmh(state.power, state.currentGrade, 1);

        // 2. Adjust Video Playback Rate
        // Ratio of current virtual speed to the video's base recording speed
        let speedRatio = state.speedKmh / state.baseSpeedKmh;

        // YouTube discrete playback rates: 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0
        let targetRate = 1.0;
        if (speedRatio < 0.375) targetRate = 0.25;
        else if (speedRatio < 0.625) targetRate = 0.5;
        else if (speedRatio < 0.875) targetRate = 0.75;
        else if (speedRatio < 1.125) targetRate = 1.0;
        else if (speedRatio < 1.375) targetRate = 1.25;
        else if (speedRatio < 1.75) targetRate = 1.5;
        else targetRate = 2.0;

        if (player && player.getPlaybackRate() !== targetRate) {
            player.setPlaybackRate(targetRate);
        }

    } else {
        // ERG Mode
        // Virtual speed decoupled from elevation. Assuming fixed speed based on sustained power on flat.
        state.speedKmh = Physics.calculateSpeedKmh(state.power, 0, 1);

        if (player && player.getPlaybackRate() !== 1.0) {
            player.setPlaybackRate(1.0); // Maintain steady progression
        }
    }

    // 3. Accumulate Distance
    // Distance (km) = Speed (km/h) * Time (hours)
    const distanceThisSecond = state.speedKmh * (1 / 3600);
    state.distanceKm += distanceThisSecond;

    // 4. Check Route Segments and update Incline if necessary
    updateRouteSegment();

    // 5. Record Data Point for TCX
    if (window.TCX) {
        window.TCX.recordPoint({
            timeOffset: state.timeSeconds,
            distance: state.distanceKm * 1000, // meters
            hr: state.hr,
            cadence: state.cadence,
            power: state.power,
            speed: state.speedKmh / 3.6, // m/s
            // Approximation for TCX altitude based on accumulated grade (simplified)
            // A more complex implementation would track absolute altitude from the GPX.
            altitude: 0
        });
    }

    updateUI();
}

function updateRouteSegment() {
    if (!routeData || currentSegmentIndex >= routeData.segments.length - 1) return;

    const nextSegment = routeData.segments[currentSegmentIndex + 1];

    if (state.distanceKm >= nextSegment.distance) {
        currentSegmentIndex++;
        const newGrade = routeData.segments[currentSegmentIndex].grade;

        if (newGrade !== state.currentGrade) {
            state.currentGrade = newGrade;
            if (state.mode === 'SIM') {
                BLE.setTargetInclination(state.currentGrade);
            }
        }
    }
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function updateUI() {
    ui.power.innerText = state.power;
    ui.cadence.innerText = state.cadence;
    ui.hr.innerText = state.hr;
    ui.speed.innerText = state.speedKmh.toFixed(1);
    ui.distance.innerText = state.distanceKm.toFixed(2);
    ui.time.innerText = formatTime(state.timeSeconds);
    ui.grade.innerText = state.currentGrade.toFixed(1);
    ui.targetPower.innerText = state.targetWatts;
}
