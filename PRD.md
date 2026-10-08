# Yahooligan: procedural 3D workouts

## Goal

Replace GPX route selection and YouTube playback with configurable, timed workouts and live 3D terrain. Primary hardware is the Wahoo KICKR Core, optionally with a Bluetooth heart-rate monitor. This is a static client-side application with no server-side account or API credentials.

## Setup and workout schedule

Choose recovery, steady ride, rolling hills, sustained climb, hill repeats or intervals. Accept a duration of 5–180 minutes, a starting grade of −5% to 10%, and a starting power of 50–500 W. Store both starting settings so either mode can be used. Include 15% warm-up, 70% main phases and 15% cool-down. Transition between phase targets with a smooth ramp lasting up to 12 seconds. Clamp course grades to −5% through 12%.

Generate one schedule whose phases contain name, start/end active seconds, grade and target watts. Use the schedule for rendering, trainer targets, HUD and profile chart. Scenery randomness must not change workout intensity. Starting values apply immediately during warm-up; ERG efforts are multiples of the starting watt target.

## Timing and modes

A single active-workout clock defines course position and completion. Scenic camera movement uses a nominal speed of 7 m/s; measured power drives separately labelled virtual speed and distance. Pausing freezes time, terrain position and recording. Stop exactly at the selected duration. Pause on hidden pages, WebGL context loss, long browser interruptions, peripheral disconnection or prolonged missing power data.

SIM applies the current grade via FTMS indoor-bike simulation parameters. ERG applies the current target watts, bounded to advertised limits. In ERG the grade is scenic only and virtual speed uses flat-road physics. Permit mode changes by pausing, cancelling queued targets, neutralizing old load, applying the new mode and resuming if the ride had been running.

## Visuals

Use locally vendored Three.js with no CDN dependency. Procedurally construct the road, terrain, mountains and deterministic scenery placement. Load locally generated Blender GLB pine, rock and chalet models; fall back to simple procedural models if loading fails. Instance repeated objects. Support first-person and follow-camera views, desktop and mobile layouts, fullscreen where available, and explicit messaging when WebGL is unavailable.

Display measured power/cadence/optional HR, virtual speed/distance, current grade or target watts, remaining time, phase and next transition. The grade chart shows the full course with a marker and completed shading. In ERG add a scheduled watt trace. Keep the road visible around the HUD, particularly on phones.

## Bluetooth

Require a secure context and Web Bluetooth. Read FTMS capabilities and supported power range. Enable indications on the control point before requesting control. Use `0x11` simulation, `0x05` target watts, `0x07` start/resume and `0x08` stop/pause. Serialize writes and wait for matching `0x80` success responses. Deduplicate unchanged targets and limit updates to approximately once per second. Reject queued old-mode targets; reject pending commands on disconnect. Timeout requires reconnecting to avoid confusing late acknowledgements with new commands.

Use FTMS Indoor Bike Data for power/cadence, with optional Cycling Power Service fallback. Parse variable fields and truncated packets defensively. Discover a separate Heart Rate Service on user request. Reconnect through a new user gesture, rediscover services/capabilities and reacquire control before explicitly resuming.

## Mobile ride presentation

Prioritize a clear road and visible cyclist. Default to follow camera on phones unless the rider has explicitly chosen another view. Keep only power, cadence, heart rate and target in the top strip. Place remaining time, camera and fullscreen below it, and turn the logo into a low-opacity route watermark during a ride.

Keep pause/resume and a Ride tools toggle at the bottom. Put connection, mode, finish, export and setup actions in an optional sheet. Put secondary telemetry in a separate Ride data panel. Show a compact, expandable course profile with progress and current phase. Panels must close without pausing, with accessible buttons and Escape support. Preserve usable touch targets and safe-area spacing in portrait and landscape.

Announce minute boundaries, phase changes and substantial target changes in a temporary 4.5-second panel. Debounce cumulative SIM grade changes of at least one percentage point and ERG changes of at least 15 W by 20 active seconds. Keep pause/ready/finish notices persistent. Suppress transient notices while a panel is open and announce significant events through a polite live region.

## Recording and validation

Record at 1 Hz and export TCX with active duration, virtual distance/altitude, measured power/cadence/HR and virtual speed. Keep the existing manual Strava upload link. Do not invent GPS coordinates. Preserve the previous activity until a new workout records samples.

Validate every profile's duration and transitions, stable physics, pause/resume, export, FTMS packets and asynchronous control behavior. Exercise the app in Chromium on desktop and mobile, including missing WebGL and a simulated KICKR connection/disconnection. Run the static build and check the Git diff. Physical KICKR resistance behavior remains a separate hardware check.
