# Yahooligan: procedural 3D workouts

## Goal

Replace GPX route selection and YouTube playback with configurable, timed workouts and live 3D terrain. Primary hardware is the Wahoo KICKR Core, optionally with a Bluetooth heart-rate monitor. This is a static client-side application with no server-side account or API credentials.

## Setup and workout schedule

Choose recovery, steady ride, rolling hills, sustained climb, hill repeats or intervals. Accept a duration of 5–180 minutes, a starting grade of −5% to 10%, and a starting power of 50–500 W. Store both starting settings so either mode can be used. Include 15% warm-up, 70% main phases and 15% cool-down. Transition between phase targets with a smooth ramp lasting up to 12 seconds. Clamp course grades to −5% through 12%.

Generate one schedule whose phases contain name, start/end active seconds, grade and target watts. Use the schedule for rendering, trainer targets, HUD and profile chart. Scenery randomness must not change workout intensity. Starting values apply immediately during warm-up; ERG efforts are multiples of the starting watt target.

## Timing and modes

A single active-workout clock defines course position and completion. Scenic camera movement uses a nominal speed of 7 m/s; live speed comes from FTMS instantaneous speed (hundredths of km/h, converted to m/s internally), and live distance integrates fresh trainer speed. Demos use separately labelled power-based virtual speed and distance. Stale/missing live speed shows an unavailable value, contributes no inferred distance, and is omitted from TCX speed extensions. Pausing freezes time, terrain position and recording. Stop exactly at the selected duration. Use wall time to catch up after calls, hidden pages and browser suspension; explicit pauses exclude paused time. Skip real telemetry/physics recording across suspension or missing-data gaps, and use simulated data for demo catch-up. Pause on WebGL context loss, confirmed foreground trainer/control faults or prolonged foreground missing power. Call-related connection loss keeps the clock running and permits explicit reconnection at the current target.

SIM applies the current grade via FTMS indoor-bike simulation parameters. ERG applies the current target watts, bounded to advertised limits. In ERG the grade is scenic only; trainer speed remains measured, while demo virtual speed uses flat-road physics. Permit mode changes by pausing, cancelling queued targets, neutralizing old load, applying the new mode and resuming if the ride had been running.

## Visuals

Use locally vendored Three.js with no CDN dependency. Procedurally construct the road, terrain, mountains and deterministic scenery placement. Load locally generated Blender GLB pine, rock and chalet models; fall back to simple procedural models if loading fails. Instance repeated objects. Support first-person and follow-camera views, desktop and mobile layouts, fullscreen where available, and explicit messaging when WebGL is unavailable.

Display measured power/cadence/optional HR, trainer speed/integrated distance (virtual in demos), current grade or target watts, remaining time, phase and next transition. The grade chart shows the full course with a marker and completed shading. In ERG add a scheduled watt trace. Keep the road visible around the HUD, particularly on phones.

Animate articulated cyclist legs, cranks and wheels. Integrate measured cadence against active-time increments; stop pedalling at zero or stale cadence and freeze animation on pause. In landscape on phones, add trainer speed (virtual in demos), distance and elapsed time to the top metrics without obstructing the centered route.

Generate roadside cliffs, boulders, grassy hollows and goats on outcrops, with deterministic placement and instancing. Provide drifting clouds and selectable daylight, sunset, moonlight/stars, rain, hail and distant lightning. Journey mode changes moods every 150 active seconds with smooth sky/lighting transitions. Keep the road visible in dark/weather modes; weather never affects trainer resistance. Respect reduced-motion preferences for precipitation and lightning and bound particle counts independent of course length.

Request a screen wake lock during running sessions and demos. Release it on pause/finish and reacquire on visibility restoration; handle unsupported APIs, denial, OS revocation and pending-request races without interrupting the workout. Show status in Ride tools. Never claim that browser wake locks guarantee background rendering or Bluetooth control while the OS suspends the browser.

## Bluetooth

Require a secure context and Web Bluetooth. Read FTMS capabilities and supported power range. Enable indications on the control point before requesting control. Use `0x11` simulation, `0x05` target watts, `0x07` start/resume and `0x08` stop/pause. Serialize writes and wait for matching `0x80` success responses. Deduplicate unchanged targets and limit updates to approximately once per second. Reject queued old-mode targets; reject pending commands on disconnect. Timeout requires reconnecting to avoid confusing late acknowledgements with new commands.

Use FTMS Indoor Bike Data for power/cadence, with optional Cycling Power Service fallback. Parse variable fields and truncated packets defensively. Discover a separate Heart Rate Service on user request. Reconnect through a new user gesture, rediscover services/capabilities and reacquire control before explicitly resuming.

## Guided onboarding

Show a focused tutorial once per browser, recording that it was shown even if skipped. Offer Take a tour on the front screen. Highlight profile, duration/grade, baseline watts, SIM/ERG, preparing/connecting, demo, ride metrics, course progress, camera/data/fullscreen, ride tools and start/pause controls. The ride portion is a static preview and must not start a session, record data, request a wake lock or connect/disconnect Bluetooth. Preserve setup choices and camera on exit. Provide Next, Back, Skip, Escape, arrow-key navigation and native modal focus behavior. Keep the card and highlight usable in portrait/landscape; when storage is blocked offer manual replay without automatic repetition.

## Mobile ride presentation

Prioritize a clear road and visible cyclist. Default to follow camera on phones unless the rider has explicitly chosen another view. Keep only power, cadence, heart rate and target in the top strip. Place remaining time, camera and fullscreen below it, and turn the logo into a low-opacity route watermark during a ride.

Keep pause/resume and a Ride tools toggle at the bottom. Put connection, mode, finish, export and setup actions in an optional sheet. Put secondary telemetry in a separate Ride data panel. Show a compact, expandable course profile with progress and current phase. Panels must close without pausing, with accessible buttons and Escape support. Preserve usable touch targets and safe-area spacing in portrait and landscape.

Announce minute boundaries, phase changes and substantial target changes in a temporary 4.5-second panel. Debounce cumulative SIM grade changes of at least one percentage point and ERG changes of at least 15 W by 20 active seconds. Keep pause/ready/finish notices persistent. Suppress transient notices while a panel is open and announce significant events through a polite live region.

## Recording and validation

Record at 1 Hz and export TCX with active duration, distance integrated from trainer speed (virtual in demos), simulated altitude, and measured power/cadence/HR and speed. Keep the existing manual Strava upload link. Do not invent GPS coordinates. Preserve the previous activity until a new workout records samples.

Validate every profile's duration and transitions, stable physics, pause/resume, export, FTMS packets and asynchronous control behavior. Exercise the app in Chromium on desktop and mobile, including missing WebGL and a simulated KICKR connection/disconnection. Run the static build and check the Git diff. Physical KICKR resistance behavior remains a separate hardware check.
