# Yahooligan

A client-side, live 3D workout app for a Wahoo KICKR Core and other FTMS smart trainers. Choose a profile, duration, starting grade and starting watts; ride a procedurally generated alpine road in SIM or ERG mode.

## Run locally

Requires Node.js 20 or later. No runtime downloads or backend are needed.

```sh
npm ci
npm start
```

Open `http://localhost:8000`. Choose **Prepare workout**, connect your KICKR, then start. **Explore with demo power** runs without Bluetooth. Phones start in the cyclist view; use the camera button to switch views.

Web Bluetooth requires a secure context and a compatible browser, such as Chrome on Android or desktop. Localhost is suitable for desktop development; accessing an HTTP LAN address from a phone is not a secure context. Serve the production build over HTTPS for phone/trainer use. Ordinary iOS Safari does not expose Web Bluetooth.

```sh
npm run build
node scripts/serve.mjs --dist
```

Deploy the contents of `dist/` to any static HTTPS host. Files use relative URLs so hosting under a subdirectory also works. No API keys are needed.

## Guided tour

A short tour appears once on your first visit in each browser. Use **Take a tour** on the front screen to replay it. Next/Back (or the arrow keys) move between highlights; Skip or Escape closes it. The ride-screen portion is a static preview: it never starts a workout or connects to your trainer, and preserves your chosen settings. Dismissing the tour also marks it as shown. If browser storage is blocked, the tour remains available manually without repeatedly opening automatically.

## Workouts and modes

- Profiles: recovery, steady ride, rolling hills, sustained climb, hill repeats and intervals.
- Duration: 5–180 minutes, including 15% warm-up and 15% cool-down.
- Starting grade: −5% to 10%. Generated grades stay between −5% and 12%.
- Starting power: 50–500 W. ERG phases use profile-specific multiples of this baseline. The applied target is bounded and quantized to the trainer's advertised power range.
- SIM: resistance follows grade using FTMS indoor-bike simulation parameters. Watts are measured rather than enforced.
- ERG: resistance holds the scheduled watt target. The same terrain is visual context; it does not control resistance.

The road, current grade and progress marker follow **active workout time**, so the workout finishes in the duration you chose. The scenic road advances at a nominal 25.2 km/h. Live rides display FTMS speed reported by the trainer and integrate that speed for distance, rather than estimating speed from watts or grade. Missing/stale speed shows “—” and contributes no estimated distance. Demos use a power-based virtual-speed/distance simulation; the animated camera is not a measurement of wheel speed. In demo ERG, virtual speed uses flat-road physics. Regenerating scenery preserves all workout targets.

Pauses freeze the course, clock and recording. Changing mode briefly pauses control, clears queued old targets and applies the new mode before resuming. Calls, hidden tabs and browser suspension do not pause the clock: it catches up from elapsed wall time when the browser resumes. Background trainer commands may be suspended by the phone; the latest scheduled target is sent on return. If Bluetooth disconnects during an interruption, the clock continues and Ride tools offers reconnect at the current target. A confirmed foreground connection/control fault or 10 seconds of missing foreground power telemetry still pauses the ride. Resume explicitly after a foreground fault. Finishing or pausing attempts a neutral load followed by an acknowledged FTMS stop/pause. If a control command fails, the app reports the failure and disconnects; it cannot guarantee a command was applied by disconnected hardware.

## Ride display

Power, cadence, heart rate and the current grade or ERG target stay visible in a compact strip. In phone landscape, the strip also shows speed, distance and active time. Remaining time sits just below, alongside **Ride data**, camera and fullscreen controls. Branding becomes a faint watermark on the route.

The thin course profile shows your position and current phase; tap it to expand the chart. **Ride data** opens speed, distance, elapsed time, mode and the next phase. **Ride tools** opens trainer connections, SIM/ERG selection, finish, export and new-workout controls. Pause/resume stays within reach. Close panels with their close button, Escape or a tap on the road; opening a panel does not pause your workout.

Brief panels announce each new minute, phase and substantial target change, then disappear after 4.5 seconds. Target alerts require a cumulative 1 percentage point grade change in SIM or 15 W in ERG, with at least 20 seconds between these alerts. Ready, pause and finish notices stay visible until you open a panel or resume. Phone landscape places the compact chart and pause/tools controls in opposite lower corners to keep the cyclist clear.

## Screen and interruptions

Running workouts and demos request a screen wake lock, release it on pause/finish, and reacquire it after returning to the app. Ride tools shows wake-lock status. Use HTTPS and a browser with Screen Wake Lock support; the browser or OS can refuse or revoke a lock, for example under battery restrictions.

An incoming call does not count as a pause. Progress, the route and remaining time catch up after the interruption, including reaching the finish if the selected duration has elapsed. Browsers cannot guarantee live rendering or Bluetooth control while the OS suspends them. Real telemetry gaps are left out of TCX rather than filling them with repeated readings or invented distance; demo gaps use simulated data. Explicit pauses still exclude paused time. Navigating away ends the live connection; a restored back/forward-cache page catches up its existing session.

## KICKR Core

Use current firmware; Wahoo introduced Bluetooth FTMS in firmware 1.1.1. Close other apps that may hold trainer control. The app discovers FTMS SIM/ERG capabilities, subscribes to control-point indications, requests control and waits for each command acknowledgement. Unsupported modes are disabled. A separate Bluetooth heart-rate monitor is optional.

SIM uses opcode `0x11` (Set Indoor Bike Simulation Parameters); ERG uses `0x05` (Set Target Power). It does not use treadmill inclination commands. Physical resistance and reconnection still require checking on a real KICKR Core; automated tests use a simulated peripheral.

## Recording

Download TCX during or after a ride. It contains active time, measured power, cadence, optional heart rate, trainer-reported speed/integrated distance for live rides (virtual values for demos), and simulated altitude. Missing speed is omitted from exported trackpoints. Export timestamps omit paused time. No real GPS coordinates are invented. A previous ride remains downloadable while the next ride has no records. The Strava link opens its manual upload page; there is no embedded OAuth or automatic upload.

## Scenery and dependencies

Three.js r180 and its GLTF loader are vendored in `js/vendor/three/`, with the upstream MIT license. There are no CDN requests, fonts or external textures. Source: https://github.com/mrdoob/three.js/tree/r180

The small GLB models in `assets/` were generated with Blender 4.3.2. To rebuild them:

```sh
npm run scenery
```

This runs `scripts/generate_scenery.py` with Blender on your PATH. Blender is not needed to run the app. The road, terrain, mountain shapes and scenery placements are generated in the browser. Rocky banks, grassy dells, cliffs, boulders and mountain goats (including kids) vary along the course. Repeated landmarks use instanced meshes. The cyclist has articulated legs and cranks: cadence controls pedal revolutions, zero/missing cadence stops pedalling, and pause freezes the animation. Wheel rotation follows scenic movement.

**Sky** in Ride tools selects daylight, sunset, moonlight with stars, rain, hail or a distant lightning storm. **Journey** cycles through these moods every 150 active seconds, starting in daylight; sky and lighting colors transition gradually. Clouds drift and weather particles stay close to the camera so rendering cost does not grow with workout duration. Weather is visual and does not change trainer targets. Reduced-motion preferences disable moving precipitation and lightning. Asset-loading failures fall back to procedural trees/rocks. WebGL failure prevents starting a ride and displays a clear error.

Legacy GPX examples are archived in `data/routes/source/`; the workout runtime does not load them. YouTube and the GPX conversion pipeline have been removed.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm start
# In another terminal:
npm run test:browser
npm run test:tour
```

To use system Chromium, set `CHROMIUM_PATH=/usr/bin/chromium`. `TEST_BASE_URL` can select another running server. Browser screenshots and a sample export are written to the ignored `verification/results/` directory. Tests cover duration, transitions, physics, export, FTMS packets/acknowledgements/cancellation/timeouts, capability discovery, 3D slope alignment, cadence-driven pedalling, scenery landmarks and sky/weather modes, portrait/landscape/small-phone layouts, panel controls, workout alerts and session controls. They cannot certify physical trainer behavior.
