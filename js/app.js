import {
  PROFILES,
  generateWorkout,
  sampleWorkout,
  formatTime,
  clamp,
} from "./workout.js";
import { Session } from "./session.js";
import { Trainer, connectHeartRate, powerCommand } from "./ble.js";
import { RouteScene } from "./route-scene.js";
import { downloadTCX } from "./tcx.js";

const $ = (id) => document.getElementById(id);
const form = $("workout-form");
let seed = Math.floor(Math.random() * 100000);
let workout, session, scene, lastSession, hrDevice;
let demo = false,
  busy = false,
  targetBusy = false,
  renderAvailable = true;
let messageTimer,
  previewTimer,
  lastFrame = performance.now(),
  lastUi = 0,
  lastControl = -1,
  powerWatchStart = 0;
let metrics = { power: 0, cadence: 0, hr: 0 };
const received = { power: 0, cadence: 0, hr: 0 };
const trainer = new Trainer({
  onMetrics: (data) => {
    if (demo) return;
    Object.assign(metrics, data);
    for (const key of Object.keys(data)) received[key] = performance.now();
  },
  onDisconnect: () => {
    if (demo) return;
    session?.pause();
    metrics.power = 0;
    metrics.cadence = 0;
    received.power = 0;
    received.cadence = 0;
    showMessage(
      "Trainer disconnected. Workout paused. Reconnect KICKR, then resume.",
      true,
    );
    updateUI();
  },
});

function showMessage(text, error = false) {
  clearTimeout(messageTimer);
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
  $("message").hidden = false;
  if (!error)
    messageTimer = setTimeout(() => {
      $("message").hidden = true;
    }, 6500);
}

function selectedMode() {
  return form.elements.mode.value;
}
function readWorkout() {
  return generateWorkout({
    profile: $("profile").value,
    minutes: $("minutes").valueAsNumber,
    startGrade: $("start-grade").valueAsNumber,
    startWatts: $("start-watts").valueAsNumber,
    seed,
  });
}
function buildChart() {
  $("course-title").textContent = workout.name;
  $("course-duration").textContent = `${workout.duration / 60} MIN`;
  $("course-seed").textContent =
    `ROUTE ${workout.seed.toString().padStart(4, "0")}`;
  $("chart-end").textContent = `${workout.duration / 60} MIN`;
  let grade = "",
    watts = "";
  const maxWatts = Math.max(...workout.phases.map((phase) => phase.watts), 1);
  for (let i = 0; i <= 600; i++) {
    const sample = sampleWorkout(workout, (workout.duration * i) / 600);
    const x = (i / 600) * 1000;
    grade += `${i ? "L" : "M"}${x.toFixed(2)},${gradeY(sample.grade).toFixed(2)} `;
    watts += `${i ? "L" : "M"}${x.toFixed(2)},${(125 - (sample.watts / maxWatts) * 100).toFixed(2)} `;
  }
  const area = `${grade} L1000,140 L0,140 Z`;
  $("grade-line").setAttribute("d", grade);
  $("grade-area").setAttribute("d", area);
  $("done-area").setAttribute("d", area);
  $("watts-line").setAttribute("d", watts);
  $("phase-grid").replaceChildren();
  const addLine = (x1, y1, x2, y2, opacity) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    for (const [key, value] of Object.entries({
      x1,
      y1,
      x2,
      y2,
      stroke: "#bfd0be",
      "stroke-opacity": opacity,
      "stroke-width": 1,
      "vector-effect": "non-scaling-stroke",
    }))
      line.setAttribute(key, value);
    $("phase-grid").append(line);
  };
  for (const grade of [-5, 0, 5, 10]) {
    const y = gradeY(grade);
    addLine(0, y, 1000, y, 0.12);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = `${grade}%`;
    text.setAttribute("x", 4);
    text.setAttribute("y", y - 4);
    text.setAttribute("fill", "#a7b8ad");
    text.setAttribute("font-size", 9);
    $("phase-grid").append(text);
  }
  for (const phase of workout.phases.slice(1))
    addLine(
      (phase.start / workout.duration) * 1000,
      0,
      (phase.start / workout.duration) * 1000,
      140,
      0.1,
    );
}
function gradeY(grade) {
  return 125 - ((grade + 5) / 17) * 110;
}
function preview() {
  $("profile-description").textContent =
    PROFILES[$("profile").value].description;
  $("mode-description").textContent =
    selectedMode() === "SIM"
      ? "Resistance follows the road grade. Starting power is saved for ERG."
      : "Resistance holds scheduled watts. Starting grade shapes the scenery.";
  if (!form.checkValidity()) return;
  try {
    workout = readWorkout();
    session = new Session(workout, selectedMode());
    scene?.setWorkout(workout);
    buildChart();
    updateUI();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function prepare(isDemo) {
  if (!form.reportValidity()) return false;
  if (!renderAvailable) {
    showMessage(
      "Live 3D is unavailable. Enable WebGL or use another browser before riding.",
      true,
    );
    return false;
  }
  clearTimeout(previewTimer);
  if (session?.records.length) lastSession = session;
  workout = readWorkout();
  session = new Session(workout, selectedMode());
  demo = isDemo;
  document.body.classList.toggle("is-demo", demo);
  if (demo) {
    trainer.disconnect();
    hrDevice?.gatt.disconnect();
    hrDevice = null;
  }
  metrics = { power: 0, cadence: 0, hr: 0 };
  received.power = 0;
  received.cadence = 0;
  received.hr = 0;
  lastControl = -1;
  $("setup-panel").hidden = true;
  $("hud").hidden = false;
  document.body.classList.add("riding");
  $("ride-mode").value = session.mode;
  scene?.setWorkout(workout);
  buildChart();
  updateUI();
  window.scrollTo(0, 0);
  return true;
}

async function controlFailure(error) {
  session?.pause();
  trainer.disconnect();
  showMessage(
    `${error.message} Workout paused. Reconnect the trainer before resuming.`,
    true,
  );
  updateUI();
}
async function runAction(action) {
  if (busy) return;
  busy = true;
  updateUI();
  try {
    await action();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    busy = false;
    updateUI();
  }
}
async function startSession() {
  if (!session || session.status === "finished") return;
  if (!demo) {
    if (!trainer.connected) {
      showMessage(
        "Connect your KICKR Core before starting, or choose demo from New workout.",
        true,
      );
      return;
    }
    try {
      await trainer.start(session.mode, session.sample);
    } catch (error) {
      await controlFailure(error);
      return;
    }
    if (!trainer.connected) return;
    if (document.hidden) {
      await pauseSession("Workout paused while the page is hidden.");
      return;
    }
  }
  $("message").hidden = true;
  session.start();
  powerWatchStart = performance.now();
  lastFrame = performance.now();
  lastControl = Math.floor(session.elapsed);
  updateUI();
}
async function pauseSession(reason) {
  session?.pause();
  updateUI();
  if (!demo) {
    try {
      await trainer.stop(true);
    } catch (error) {
      await controlFailure(error);
      return;
    }
  }
  if (reason) showMessage(reason);
}
function interruptSession(reason) {
  // A sensor picker or a pending mode command must not delay freezing the clock.
  session?.pause();
  updateUI();
  if (busy) pauseSession(reason);
  else runAction(() => pauseSession(reason));
}
async function finishSession() {
  session?.finish();
  updateUI();
  if (!demo) {
    try {
      await trainer.stop(false);
    } catch (error) {
      await controlFailure(error);
      return;
    }
  }
  showMessage("Ride complete. Download your TCX to save or upload to Strava.");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    prepare(false);
  } catch (error) {
    showMessage(error.message, true);
  }
});
form.addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(preview, 180);
});
$("btn-regenerate").addEventListener("click", () => {
  seed = (seed + 7919) >>> 0;
  preview();
});
$("btn-demo").addEventListener("click", () =>
  runAction(async () => {
    if (prepare(true)) await startSession();
  }),
);
$("btn-start").addEventListener("click", () =>
  runAction(() =>
    session.status === "running" ? pauseSession() : startSession(),
  ),
);
$("btn-finish").addEventListener("click", () => runAction(finishSession));
$("btn-trainer").addEventListener("click", () =>
  runAction(async () => {
    try {
      const name = await trainer.connect();
      if (!trainer.capabilities[session.mode]) {
        session.mode = trainer.capabilities.SIM ? "SIM" : "ERG";
        $("ride-mode").value = session.mode;
      }
      const peak = Math.max(...workout.phases.map((phase) => phase.watts));
      showMessage(
        `Connected to ${name}.${peak > trainer.powerRange.max ? ` ERG targets will be limited to ${trainer.powerRange.max} W.` : ""}`,
      );
    } catch (error) {
      showMessage(error.message, true);
    }
  }),
);
$("btn-hr").addEventListener("click", () =>
  runAction(async () => {
    hrDevice = await connectHeartRate(
      (data) => {
        Object.assign(metrics, data);
        received.hr = performance.now();
      },
      () => {
        hrDevice = null;
        metrics.hr = 0;
        received.hr = 0;
        updateUI();
      },
    );
    showMessage(`Connected to ${hrDevice.name || "heart-rate monitor"}.`);
  }),
);
$("ride-mode").addEventListener("change", () => {
  const nextMode = $("ride-mode").value;
  runAction(async () => {
    const running = session.status === "running";
    session.pause();
    if (!demo && trainer.connected) {
      try {
        await trainer.stop(true); // Cancels queued targets from the previous mode.
        if (!trainer.capabilities[nextMode])
          throw new Error(`Trainer does not support ${nextMode}.`);
        if (running) await trainer.start(nextMode, session.sample);
      } catch (error) {
        $("ride-mode").value = session.mode;
        await controlFailure(error);
        return;
      }
    }
    session.mode = nextMode;
    if (running && (demo || trainer.connected)) {
      if (document.hidden) {
        await pauseSession("Workout paused while the page is hidden.");
        return;
      }
      session.start();
      lastFrame = performance.now();
      powerWatchStart = lastFrame;
    }
    lastControl = -1;
  });
});
$("btn-edit").addEventListener("click", () =>
  runAction(async () => {
    await pauseSession();
    if (session.records.length) lastSession = session;
    document.body.classList.remove("riding");
    $("setup-panel").hidden = false;
    $("hud").hidden = true;
    demo = false;
    document.body.classList.remove("is-demo");
    form.elements.mode.value = session.mode;
    preview();
    if (lastSession)
      showMessage(
        "Your previous activity remains available from Download TCX until your next ride records data.",
      );
  }),
);
$("btn-tcx").addEventListener("click", () =>
  downloadTCX(session.records.length ? session : lastSession),
);
$("btn-camera").addEventListener("click", () => {
  if (!scene) return;
  scene.cameraMode = scene.cameraMode === "first" ? "follow" : "first";
  $("btn-camera").textContent =
    scene.cameraMode === "first" ? "Follow camera" : "First-person camera";
  scene.render(session?.elapsed || 0);
});
$("btn-fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showMessage("Fullscreen is unavailable in this browser.");
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && session?.status === "running")
    interruptSession(
      "Workout paused while the page is hidden. Resume when ready.",
    );
});
window.addEventListener("pagehide", () => {
  session?.pause();
  trainer.disconnect();
  hrDevice?.gatt.disconnect();
});

function updateUI() {
  if (!session) return;
  const sample = session.sample;
  const erg = session.mode === "ERG";
  const running = session.status === "running",
    finished = session.status === "finished";
  const now = performance.now();
  if (!demo)
    for (const key of Object.keys(metrics))
      if (now - received[key] > 5000) metrics[key] = 0;
  $("metric-power").textContent =
    demo || (received.power && now - received.power < 5000)
      ? Math.round(metrics.power)
      : "—";
  $("metric-cadence").textContent =
    demo || (received.cadence && now - received.cadence < 5000)
      ? Math.round(metrics.cadence)
      : "—";
  $("metric-hr").textContent =
    demo || (received.hr && now - received.hr < 5000)
      ? Math.round(metrics.hr)
      : "—";
  $("metric-speed").textContent = (session.velocity * 3.6).toFixed(1);
  $("metric-distance").textContent = (session.distance / 1000).toFixed(2);
  $("target-label").textContent = erg ? "ERG TARGET" : "SIM GRADE";
  const watts =
    !demo && trainer.connected
      ? new DataView(
          powerCommand(sample.watts, trainer.powerRange).buffer,
        ).getInt16(1, true)
      : Math.round(sample.watts);
  $("metric-target").textContent = erg ? watts : sample.grade.toFixed(1);
  $("target-unit").textContent = erg ? "W" : "%";
  $("remaining").textContent = formatTime(workout.duration - session.elapsed);
  $("session-status").textContent =
    `${demo ? "DEMO · " : ""}${{ ready: "READY TO RIDE", running: "ON THE ROAD", paused: "PAUSED", finished: "RIDE COMPLETE" }[session.status]}`;
  $("current-phase").textContent = finished ? "Finish line" : sample.phase;
  $("next-phase").textContent = finished
    ? `${formatTime(session.elapsed)} active · ${(session.distance / 1000).toFixed(2)} virtual km`
    : `${sample.next} in ${formatTime(sample.untilNext)}`;
  $("btn-start").textContent = running
    ? "Pause ride"
    : session.status === "paused"
      ? "Resume ride"
      : "Start ride";
  $("btn-start").disabled = busy || finished || !renderAvailable;
  $("btn-finish").disabled = busy || finished || session.elapsed === 0;
  $("btn-edit").disabled = busy;
  $("btn-trainer").disabled = busy || demo || trainer.connected || running;
  $("btn-trainer").textContent = demo
    ? "Demo · no trainer"
    : trainer.connected
      ? "KICKR connected"
      : "Connect KICKR";
  $("btn-hr").disabled = busy || demo || !!hrDevice?.gatt.connected;
  $("btn-hr").textContent = hrDevice?.gatt.connected
    ? "HR connected"
    : "Connect HR";
  $("ride-mode").disabled = busy || finished;
  for (const option of $("ride-mode").options)
    option.disabled =
      !demo && trainer.connected && !trainer.capabilities[option.value];
  $("btn-tcx").disabled =
    !session.records.length && !lastSession?.records.length;
  $("watts-line").toggleAttribute("hidden", !erg);
  $("watts-legend").hidden = !erg;
  $("course-mode").textContent = `${session.mode}${demo ? " / DEMO" : ""}`;
  $("progress-label").textContent =
    `${Math.round(sample.progress * 100)}% complete`;
  const x = sample.progress * 1000;
  $("chart-marker").setAttribute("x1", x);
  $("chart-marker").setAttribute("x2", x);
  $("done-width").setAttribute("width", x);
  $("chart-dot").setAttribute("cx", x);
  $("chart-dot").setAttribute("cy", gradeY(sample.grade));
  $("profile-chart").setAttribute(
    "aria-label",
    `${workout.name}: ${Math.round(sample.progress * 100)}% complete, current grade ${sample.grade.toFixed(1)}%, ${erg ? `${watts} target watts, ` : ""}${formatTime(workout.duration - session.elapsed)} remaining.`,
  );
}

try {
  scene = new RouteScene($("route-canvas"), (message) => {
    renderAvailable = false;
    interruptSession(message);
    showMessage(message, true);
  });
} catch {
  renderAvailable = false;
  showMessage(
    "Live 3D requires WebGL. Enable hardware acceleration or try another browser. Your workout setup is still available.",
    true,
  );
}
preview();
new ResizeObserver(([entry]) => {
  document.body.style.setProperty(
    "--controls-height",
    `${entry.contentRect.height + 26}px`,
  );
}).observe(document.querySelector(".controls"));

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (session?.status === "running") {
    if (dt > 2 || document.hidden) {
      interruptSession(
        "Workout paused after a browser interruption. Resume when ready.",
      );
    } else {
      if (demo) {
        metrics = {
          power: Math.round(
            session.sample.watts + Math.sin(session.elapsed / 5) * 6,
          ),
          cadence: Math.round(83 + Math.sin(session.elapsed / 8) * 4),
          hr: Math.round(118 + 15 * session.sample.progress),
        };
      } else if (now - Math.max(received.power, powerWatchStart) > 10000) {
        interruptSession(
          "Power data stopped arriving. Workout paused; check the trainer connection.",
        );
      }
      session.advance(dt, metrics);
      if (session.status === "finished") {
        if (busy) finishSession();
        else runAction(finishSession);
      } else if (
        !demo &&
        !busy &&
        !targetBusy &&
        Math.floor(session.elapsed) !== lastControl
      ) {
        lastControl = Math.floor(session.elapsed);
        targetBusy = true;
        trainer
          .setTarget(session.mode, session.sample)
          .catch(controlFailure)
          .finally(() => {
            targetBusy = false;
          });
      }
    }
  }
  if (now - lastUi > 100) {
    updateUI();
    lastUi = now;
  }
  if (renderAvailable && !document.hidden) scene?.render(session?.elapsed || 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
