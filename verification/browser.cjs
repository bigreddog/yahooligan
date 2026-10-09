const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8000";
const output = path.resolve(__dirname, "results");
const openTools = async (page) => {
  if (!(await page.locator("#ride-tools").isVisible()))
    await page.click("#btn-tools");
};

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const errors = [];
  const attach = async (page) => {
    await page.addInitScript(() => {
      window.wallOffset = 0;
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + window.wallOffset;
      window.screenLocks = [];
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async (type) => {
            if (type !== "screen") throw new Error("Wrong wake lock type");
            const lock = new EventTarget();
            lock.released = false;
            lock.release = async () => {
              lock.released = true;
              lock.dispatchEvent(new Event("release"));
            };
            screenLocks.push(lock);
            return lock;
          },
        },
      });
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /THREE|shader|WebGL/i.test(message.text())
      )
        errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
  };
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    await attach(page);
    await page.goto(base);
    await page.waitForFunction(
      () =>
        document.querySelector("#profile-description")?.textContent.length > 0,
    );
    await page.waitForTimeout(600);
    assert.equal(await page.locator("#message").isVisible(), false);
    assert.equal(
      await page.locator("#course-title").textContent(),
      "Rolling hills",
    );
    // Validate that the viewport contains actual rendered 3D, not just an HTML overlay.
    const rendering = await page.evaluate(async () => {
      const canvas = document.querySelector("#route-canvas");
      const gl = canvas.getContext("webgl2");
      const state = { width: canvas.width, height: canvas.height, gl: !!gl };
      const { RouteScene } = await import("./js/route-scene.js");
      const { generateWorkout, sampleWorkout } = await import(
        "./js/workout.js"
      );
      const extra = document.createElement("canvas");
      extra.style.cssText =
        "width:320px;height:240px;position:fixed;left:-1000px";
      document.body.append(extra);
      const scene = new RouteScene(extra, () => {});
      const workout = generateWorkout({
        profile: "climb",
        minutes: 5,
        seed: 42,
      });
      scene.setWorkout(workout);
      scene.render(180);
      state.drawCalls = scene.renderer.info.render.calls;
      state.landmarks = scene.landmarks.userData;
      scene.render(180.25, 60);
      state.slowPedal = scene.pedalAngle;
      scene.render(180.5, 120);
      state.fastPedal = scene.pedalAngle;
      scene.render(180.5, 120);
      state.pausedPedal = scene.pedalAngle;
      scene.render(180.75, 0);
      state.coastingPedal = scene.pedalAngle;
      state.weather = [];
      for (const mode of ["clear", "sunset", "moon", "rain", "hail", "storm"]) {
        scene.atmosphere.setMode(mode);
        scene.render(180.75);
        state.weather.push({
          mode: scene.atmosphere.mood,
          rain: scene.atmosphere.rain.visible,
          hail: scene.atmosphere.hail.visible,
          moon: scene.atmosphere.moon.visible,
        });
      }
      scene.atmosphere.setMode("auto");
      scene.render(318.1);
      state.lightning = scene.atmosphere.lightning.visible;
      scene.atmosphere.setMode("storm");
      scene.render(318.1);
      state.lightning = scene.atmosphere.lightning.visible;
      scene.atmosphere.reducedMotion = true;
      scene.render(318.1);
      state.reducedMotion =
        !scene.atmosphere.lightning.visible && !scene.atmosphere.rain.visible;
      state.pedalAngleBeforeReset = scene.pedalAngle;
      scene.setWorkout(workout);
      state.resetPedal = scene.pedalAngle;
      const z = 180 * 7;
      const a = scene.point(z),
        b = scene.point(z + 1);
      state.slopeError = Math.abs(
        (b.y - a.y) * 100 - sampleWorkout(workout, 180).grade,
      );
      scene.resizeObserver.disconnect();
      scene.renderer.dispose();
      extra.remove();
      return state;
    });
    assert.equal(rendering.gl, true);
    assert.ok(rendering.width > 1000 && rendering.drawCalls > 0);
    assert.ok(rendering.slopeError < 0.1);
    assert.ok(
      rendering.landmarks.goats > 0 &&
        rendering.landmarks.cliffs > 0 &&
        rendering.landmarks.boulders > 0,
    );
    assert.ok(Math.abs(rendering.slowPedal - Math.PI / 2) < 1e-8);
    assert.ok(Math.abs(rendering.fastPedal - Math.PI * 1.5) < 1e-8);
    assert.equal(rendering.pausedPedal, rendering.fastPedal);
    assert.equal(rendering.coastingPedal, rendering.fastPedal);
    assert.equal(rendering.resetPedal, 0);
    assert.equal(rendering.weather.find((w) => w.mode === "moon").moon, true);
    assert.equal(rendering.weather.find((w) => w.mode === "rain").rain, true);
    assert.equal(rendering.weather.find((w) => w.mode === "hail").hail, true);
    assert.equal(rendering.lightning, true);
    assert.equal(rendering.reducedMotion, true);
    await page.screenshot({ path: path.join(output, "setup-desktop.png") });
    const route = await page.locator("#course-seed").textContent();
    const gradePath = await page.locator("#grade-line").getAttribute("d");
    await page.click("#btn-regenerate");
    assert.notEqual(await page.locator("#course-seed").textContent(), route);
    assert.equal(
      await page.locator("#grade-line").getAttribute("d"),
      gradePath,
    );
    await page.locator("#minutes").fill("5");
    await page.locator("#start-watts").fill("200");
    await page.click("#btn-demo");
    await page.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent ===
        "DEMO · ON THE ROAD",
    );
    await page.waitForFunction(() =>
      screenLocks.some((lock) => !lock.released),
    );
    const beforeCall = await page.locator("#remaining").textContent();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      window.wallOffset += 61000;
      document.dispatchEvent(new Event("resume"));
    });
    assert.equal(
      await page.locator("#session-status").textContent(),
      "DEMO · ON THE ROAD",
    );
    assert.notEqual(await page.locator("#remaining").textContent(), beforeCall);
    assert.equal(
      await page.evaluate(() => screenLocks.every((lock) => lock.released)),
      true,
    );
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(
      () => screenLocks.length >= 2 && !screenLocks.at(-1).released,
    );
    await page.waitForTimeout(1300);
    assert.ok(Number(await page.locator("#metric-power").textContent()) > 0);
    assert.equal(await page.locator("#btn-trainer").isDisabled(), true);
    await page.click("#btn-start");
    await page.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent ===
        "DEMO · PAUSED",
    );
    assert.equal(
      await page.evaluate(() => screenLocks.every((lock) => lock.released)),
      true,
    );
    const remaining = await page.locator("#remaining").textContent();
    await page.waitForTimeout(600);
    assert.equal(await page.locator("#remaining").textContent(), remaining);
    await openTools(page);
    await page.selectOption("#ride-mode", "ERG");
    await page.waitForFunction(
      () =>
        document.querySelector("#target-label").textContent === "ERG TARGET",
    );
    assert.equal(await page.locator("#watts-line").isVisible(), true);
    assert.ok(Number(await page.locator("#metric-target").textContent()) > 0);
    await page.click("#btn-camera");
    assert.equal(
      await page.locator("#btn-camera").textContent(),
      "First-person camera",
    );
    await page.screenshot({ path: path.join(output, "ride-desktop.png") });
    await page.click("#btn-start");
    await page.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent ===
        "DEMO · ON THE ROAD",
    );
    await openTools(page);
    await page.click("#btn-finish");
    await page.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent ===
        "DEMO · RIDE COMPLETE",
    );
    const downloadPromise = page.waitForEvent("download");
    await page.click("#btn-tcx");
    const download = await downloadPromise;
    const tcxPath = path.join(output, "demo.tcx");
    await download.saveAs(tcxPath);
    const xml = await fs.readFile(tcxPath, "utf8");
    assert.match(xml, /<Trackpoint>/);
    assert.match(xml, /<AltitudeMeters>/);
    assert.match(xml, /<ns3:Watts>/);
    await page.click("#btn-edit");
    await page.waitForFunction(
      () => !document.querySelector("#setup-panel").hidden,
    );
    await page.click("#btn-prepare");
    await page.click("#btn-start");
    assert.match(
      await page.locator("#message").textContent(),
      /Connect your KICKR/,
    );
    // Preserve the previous export while a new ride has no recorded samples.
    assert.equal(await page.locator("#btn-tcx").isDisabled(), false);

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await attach(mobile);
    await mobile.goto(base);
    await mobile.waitForFunction(
      () =>
        document.querySelector("#profile-description")?.textContent.length > 0,
    );
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await mobile.screenshot({
      path: path.join(output, "setup-mobile.png"),
      fullPage: true,
    });
    await mobile.click("#btn-demo");
    await mobile.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent ===
        "DEMO · ON THE ROAD",
    );
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await mobile.waitForFunction(
      () => document.querySelector(".phase-card").hidden,
    );
    assert.equal(
      await mobile.locator("#btn-camera").getAttribute("aria-pressed"),
      "true",
    );
    const checkRideLayout = async () => {
      const geometry = await mobile.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector).getBoundingClientRect();
        const chart = rect("#course-panel"),
          dock = rect(".ride-dock");
        const metrics = rect(".metrics"),
          fullscreen = rect("#btn-fullscreen");
        const intersects = (a, b) =>
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        const center = {
          left: innerWidth * 0.4,
          right: innerWidth * 0.6,
          top: innerHeight * 0.4,
          bottom: innerHeight * 0.6,
        };
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          overlap: intersects(chart, dock),
          centerBlocked: [
            ".metrics",
            "#ride-view-controls",
            "#course-panel",
            ".ride-dock",
          ].some((selector) => intersects(rect(selector), center)),
          fullscreenBelow: fullscreen.top >= metrics.bottom,
          headerHeight: rect("header").height,
        };
      });
      assert.equal(geometry.overflow, false);
      assert.equal(geometry.overlap, false);
      assert.equal(geometry.centerBlocked, false);
      assert.equal(geometry.fullscreenBelow, true);
      assert.equal(geometry.headerHeight, 0);
    };
    await checkRideLayout();
    await mobile.screenshot({ path: path.join(output, "ride-mobile.png") });
    await mobile.click("#btn-data");
    assert.equal(await mobile.locator("#ride-data").isVisible(), true);
    assert.equal(await mobile.locator("#metric-speed").isVisible(), true);
    await mobile.click("#btn-close-data");
    assert.equal(
      await mobile.evaluate(() => document.activeElement.id),
      "btn-data",
    );
    await mobile.click("#btn-tools");
    assert.equal(await mobile.locator("#ride-tools").isVisible(), true);
    const elapsed = await mobile.locator("#metric-elapsed").textContent();
    await mobile.waitForFunction(
      (previous) =>
        document.querySelector("#metric-elapsed").textContent !== previous,
      elapsed,
    );
    await mobile.keyboard.press("Escape");
    assert.equal(await mobile.locator("#ride-tools").isVisible(), false);
    assert.equal(
      await mobile.evaluate(() => document.activeElement.id),
      "btn-tools",
    );
    const compactHeight = (await mobile.locator("#course-panel").boundingBox())
      .height;
    await mobile.click("#btn-profile");
    assert.ok(
      (await mobile.locator("#course-panel").boundingBox()).height >
        compactHeight,
    );
    await mobile.click("#btn-profile");
    await mobile.setViewportSize({ width: 844, height: 390 });
    await checkRideLayout();
    const landscapeData = await mobile.evaluate(() =>
      ["speed", "distance", "elapsed"].map((metric) => ({
        visible:
          document.querySelector(`#landscape-${metric}`).getBoundingClientRect()
            .width > 0,
        value: document.querySelector(`#landscape-${metric}`).textContent,
        detailed: document.querySelector(`#metric-${metric}`).textContent,
      })),
    );
    for (const metric of landscapeData) {
      assert.equal(metric.visible, true);
      assert.equal(metric.value, metric.detailed);
    }
    await mobile.screenshot({ path: path.join(output, "ride-landscape.png") });
    await mobile.setViewportSize({ width: 320, height: 568 });
    await checkRideLayout();
    await mobile.screenshot({
      path: path.join(output, "ride-small-phone.png"),
    });
    await mobile.click("#btn-start");
    assert.equal(await mobile.locator(".phase-card").isVisible(), true);
    assert.equal(
      await mobile.locator("#event-reason").textContent(),
      "Take a breather",
    );
    assert.equal(await mobile.locator("#landscape-speed").isVisible(), false);
    await openTools(mobile);
    for (const mode of ["sunset", "moon", "rain", "hail", "storm", "auto"]) {
      await mobile.selectOption("#sky-mode", mode);
      assert.equal(
        await mobile.locator("#session-status").textContent(),
        "DEMO · PAUSED",
      );
    }
    await mobile.click("#btn-close-tools");
    await mobile.close();

    const hardware = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await attach(hardware);
    await hardware.addInitScript(() => {
      window.trainerWrites = [];
      window.trainerResult = 1;
      class Characteristic extends EventTarget {
        async startNotifications() {
          return this;
        }
        async writeValueWithResponse(bytes) {
          window.trainerWrites.push(Array.from(bytes));
          queueMicrotask(() => {
            this.value = new DataView(
              new Uint8Array([0x80, bytes[0], window.trainerResult]).buffer,
            );
            this.dispatchEvent(new Event("characteristicvaluechanged"));
          });
        }
      }
      const feature = new DataView(new ArrayBuffer(8));
      feature.setUint32(4, (1 << 13) | (1 << 3), true);
      const range = new DataView(new ArrayBuffer(6));
      range.setInt16(0, 50, true);
      range.setInt16(2, 500, true);
      range.setUint16(4, 5, true);
      const control = new Characteristic(),
        data = new Characteristic();
      const service = {
        async getCharacteristic(uuid) {
          return {
            0x2acc: {
              async readValue() {
                return feature;
              },
            },
            0x2ad8: {
              async readValue() {
                return range;
              },
            },
            0x2ad9: control,
            0x2ad2: data,
          }[uuid];
        },
      };
      const device = new EventTarget();
      device.name = "Simulated KICKR CORE";
      device.gatt = {
        connected: false,
        async connect() {
          this.connected = true;
          return {
            async getPrimaryService(uuid) {
              if (uuid !== 0x1826) throw new Error("Optional CPS unavailable");
              return service;
            },
          };
        },
        disconnect() {
          this.connected = false;
          device.dispatchEvent(new Event("gattserverdisconnected"));
        },
      };
      Object.defineProperty(navigator, "bluetooth", {
        value: {
          async requestDevice() {
            return device;
          },
        },
        configurable: true,
      });
      window.disconnectTrainer = () => device.gatt.disconnect();
      setInterval(() => {
        if (!device.gatt.connected) return;
        const bytes = new Uint8Array(8),
          view = new DataView(bytes.buffer);
        view.setUint16(0, 0x44, true);
        view.setUint16(2, 1900, true);
        view.setUint16(4, 170, true);
        view.setInt16(6, 220, true);
        data.value = view;
        data.dispatchEvent(new Event("characteristicvaluechanged"));
      }, 250);
    });
    await hardware.goto(base);
    await hardware.waitForFunction(
      () =>
        document.querySelector("#profile-description")?.textContent.length > 0,
    );
    await hardware.locator("#minutes").fill("5");
    await hardware.click("#btn-prepare");
    await hardware.click("#btn-trainer");
    await hardware.waitForFunction(
      () =>
        document.querySelector("#btn-trainer").textContent ===
        "KICKR connected",
    );
    await hardware.click("#btn-start");
    await hardware.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent === "ON THE ROAD",
    );
    await hardware.waitForFunction(
      () => document.querySelector("#metric-power").textContent === "220",
    );
    await hardware.waitForFunction(
      () => document.querySelector("#metric-speed").textContent === "19.0",
    );
    assert.equal(
      await hardware.locator("#landscape-speed").textContent(),
      "19.0",
    );
    assert.equal(
      await hardware.locator("#speed-label").textContent(),
      "TRAINER SPEED",
    );
    assert.deepEqual(
      await hardware.evaluate(() =>
        trainerWrites.slice(0, 3).map((bytes) => bytes[0]),
      ),
      [0, 7, 0x11],
    );
    await openTools(hardware);
    await hardware.selectOption("#ride-mode", "ERG");
    await hardware.waitForFunction(
      () =>
        document.querySelector("#target-label").textContent === "ERG TARGET" &&
        document.querySelector("#session-status").textContent === "ON THE ROAD",
    );
    assert.equal(await hardware.evaluate(() => trainerWrites.at(-1)[0]), 5);
    const beforeBackground = await hardware.locator("#remaining").textContent();
    const beforeWrites = await hardware.evaluate(() => trainerWrites.length);
    const oldTarget = await hardware.locator("#metric-target").textContent();
    await hardware.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      wallOffset += 90000;
      document.dispatchEvent(new Event("resume"));
    });
    assert.equal(
      await hardware.locator("#session-status").textContent(),
      "ON THE ROAD",
    );
    assert.notEqual(
      await hardware.locator("#remaining").textContent(),
      beforeBackground,
    );
    assert.equal(
      await hardware.evaluate(() =>
        trainerWrites.slice(-2).some((bytes) => bytes[0] === 8),
      ),
      false,
    );
    await hardware.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await hardware.waitForFunction(
      (count) => trainerWrites.length > count,
      beforeWrites,
    );
    await hardware.waitForFunction(
      (old) => document.querySelector("#metric-target").textContent !== old,
      oldTarget,
    );
    await hardware.waitForFunction(() => {
      const bytes = trainerWrites.at(-1);
      return (
        bytes[0] === 5 &&
        bytes[1] + 256 * bytes[2] ===
          Number(document.querySelector("#metric-target").textContent)
      );
    });
    await hardware.waitForFunction(
      () => screenLocks.length >= 2 && !screenLocks.at(-1).released,
    );
    // A call-related Bluetooth loss keeps the clock running and permits reconnect.
    await hardware.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      disconnectTrainer();
      wallOffset += 15000;
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(
      await hardware.locator("#session-status").textContent(),
      "ON THE ROAD",
    );
    await hardware.click("#btn-trainer");
    await hardware.waitForFunction(
      () =>
        document.querySelector("#btn-trainer").textContent ===
        "KICKR connected",
    );
    assert.equal(
      await hardware.locator("#session-status").textContent(),
      "ON THE ROAD",
    );
    await hardware.evaluate(() => disconnectTrainer());
    await hardware.waitForFunction(
      () => document.querySelector("#session-status").textContent === "PAUSED",
    );
    assert.match(
      await hardware.locator("#message").textContent(),
      /disconnected/,
    );
    await hardware.click("#btn-trainer");
    await hardware.waitForFunction(
      () =>
        document.querySelector("#btn-trainer").textContent ===
        "KICKR connected",
    );
    assert.equal(
      await hardware.locator("#session-status").textContent(),
      "PAUSED",
    );
    await hardware.click("#btn-start");
    await hardware.waitForFunction(
      () =>
        document.querySelector("#session-status").textContent === "ON THE ROAD",
    );
    await hardware.click("#btn-start");
    await hardware.waitForFunction(
      () => document.querySelector("#session-status").textContent === "PAUSED",
    );
    assert.deepEqual(
      await hardware.evaluate(() => trainerWrites.at(-1)),
      [8, 2],
    );
    await hardware.evaluate(() => {
      window.trainerResult = 5;
    });
    await hardware.click("#btn-start");
    await hardware.waitForFunction(() =>
      document
        .querySelector("#message")
        .textContent.includes("control was lost"),
    );
    assert.equal(
      await hardware.locator("#session-status").textContent(),
      "PAUSED",
    );
    assert.equal(
      await hardware.locator("#btn-trainer").textContent(),
      "Connect KICKR",
    );
    await hardware.close();

    const noGl = await browser.newPage();
    await noGl.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.startsWith("webgl")
          ? null
          : original.call(this, type, ...args);
      };
    });
    await noGl.goto(base);
    await noGl.waitForFunction(() =>
      document
        .querySelector("#message")
        ?.textContent.includes("requires WebGL"),
    );
    await noGl.click("#btn-demo");
    assert.equal(await noGl.locator("#hud").isVisible(), false);
    await noGl.close();
    assert.deepEqual(errors, []);
    console.log(
      "Browser checks passed: 3D rendering, grade geometry, scenery regeneration, demo, SIM/ERG, pause/resume, TCX, new workout, mobile/landscape, missing WebGL, and simulated KICKR start/mode switch/disconnect/reconnect/control loss.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
