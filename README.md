# Yahooligan

A client-side, live 3D workout app for a Wahoo KICKR Core and other FTMS smart trainers. Choose a profile, duration, starting grade and starting watts; ride a procedurally generated alpine road in SIM or ERG mode.

## Run locally

Requires Node.js 20 or later. No runtime downloads or backend are needed.

```sh
npm ci
npm start
```

Open `http://localhost:8000`. Choose **Prepare workout**, connect your KICKR, then start. **Explore with demo power** runs without Bluetooth. Use **Follow camera** to switch from first-person to the cyclist view.

Web Bluetooth requires a secure context and a compatible browser, such as Chrome on Android or desktop. Localhost is suitable for desktop development; accessing an HTTP LAN address from a phone is not a secure context. Serve the production build over HTTPS for phone/trainer use. Ordinary iOS Safari does not expose Web Bluetooth.

```sh
npm run build
node scripts/serve.mjs --dist
```

Deploy the contents of `dist/` to any static HTTPS host. Files use relative URLs so hosting under a subdirectory also works. No API keys are needed.

## Workouts and modes

- Profiles: recovery, steady ride, rolling hills, sustained climb, hill repeats and intervals.
- Duration: 5–180 minutes, including 15% warm-up and 15% cool-down.
- Starting grade: −5% to 10%. Generated grades stay between −5% and 12%.
- Starting power: 50–500 W. ERG phases use profile-specific multiples of this baseline. The applied target is bounded and quantized to the trainer's advertised power range.
- SIM: resistance follows grade using FTMS indoor-bike simulation parameters. Watts are measured rather than enforced.
- ERG: resistance holds the scheduled watt target. The same terrain is visual context; it does not control resistance.

The road, current grade and progress marker follow **active workout time**, so the workout finishes in the duration you chose. The scenic road advances at a nominal 25.2 km/h. Measured power feeds a separate virtual-speed/distance simulation; the animated camera is not a measurement of wheel speed. In ERG, virtual speed uses flat-road physics. Regenerating scenery preserves all workout targets.

Pauses freeze the course, clock and recording. Changing mode briefly pauses control, clears queued old targets and applies the new mode before resuming. The app pauses if hidden, disconnected, interrupted by a long browser stall, or missing power telemetry for 10 seconds. Resume explicitly after reconnecting. Finishing or pausing attempts a neutral load followed by an acknowledged FTMS stop/pause. If a control command fails, the app reports the failure and disconnects; it cannot guarantee a command was applied by disconnected hardware.

## KICKR Core

Use current firmware; Wahoo introduced Bluetooth FTMS in firmware 1.1.1. Close other apps that may hold trainer control. The app discovers FTMS SIM/ERG capabilities, subscribes to control-point indications, requests control and waits for each command acknowledgement. Unsupported modes are disabled. A separate Bluetooth heart-rate monitor is optional.

SIM uses opcode `0x11` (Set Indoor Bike Simulation Parameters); ERG uses `0x05` (Set Target Power). It does not use treadmill inclination commands. Physical resistance and reconnection still require checking on a real KICKR Core; automated tests use a simulated peripheral.

## Recording

Download TCX during or after a ride. It contains active time, measured power, cadence, optional heart rate, virtual speed/distance and simulated altitude. Export timestamps omit paused time. No real GPS coordinates are invented. A previous ride remains downloadable while the next ride has no records. The Strava link opens its manual upload page; there is no embedded OAuth or automatic upload.

## Scenery and dependencies

Three.js r180 and its GLTF loader are vendored in `js/vendor/three/`, with the upstream MIT license. There are no CDN requests, fonts or external textures. Source: https://github.com/mrdoob/three.js/tree/r180

The small GLB models in `assets/` were generated with Blender 4.3.2. To rebuild them:

```sh
npm run scenery
```

This runs `scripts/generate_scenery.py` with Blender on your PATH. Blender is not needed to run the app. The road, terrain, mountain shapes and scenery placements are generated in the browser. Asset-loading failures fall back to procedural trees/rocks. WebGL failure prevents starting a ride and displays a clear error.

Legacy GPX examples are archived in `data/routes/source/`; the workout runtime does not load them. YouTube and the GPX conversion pipeline have been removed.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm start
# In another terminal:
npm run test:browser
```

To use system Chromium, set `CHROMIUM_PATH=/usr/bin/chromium`. `TEST_BASE_URL` can select another running server. Browser screenshots and a sample export are written to the ignored `verification/results/` directory. Tests cover duration, transitions, physics, export, FTMS packets/acknowledgements/cancellation/timeouts, capability discovery, 3D slope alignment, mobile layouts and session controls. They cannot certify physical trainer behavior.
