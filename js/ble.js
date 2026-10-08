import { clamp } from "./workout.js";

export function simulationCommand(grade) {
  if (!Number.isFinite(grade)) throw new Error("Invalid grade.");
  const bytes = new Uint8Array(7);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x11; // Set Indoor Bike Simulation Parameters (not treadmill inclination).
  view.setInt16(1, 0, true); // Wind speed, 0.001 m/s.
  view.setInt16(3, Math.round(clamp(grade, -5, 12) * 100), true); // Grade, 0.01%.
  bytes[5] = 40; // Rolling resistance coefficient: 0.004 / 0.0001.
  bytes[6] = 51; // Wind resistance coefficient: 0.51 / 0.01 kg/m.
  return bytes;
}

export function powerCommand(watts, range = { min: 0, max: 1800, step: 1 }) {
  if (!Number.isFinite(watts)) throw new Error("Invalid power.");
  const bounded = clamp(watts, range.min, range.max);
  const quantized = clamp(
    range.min + Math.round((bounded - range.min) / range.step) * range.step,
    range.min,
    range.max,
  );
  const bytes = new Uint8Array(3);
  bytes[0] = 0x05;
  new DataView(bytes.buffer).setInt16(1, quantized, true);
  return bytes;
}

// Bluetooth write completion isn't an FTMS acknowledgement. Wait for indication 0x80.
export class FTMSControl {
  constructor(characteristic, timeout = 5000) {
    this.characteristic = characteristic;
    this.timeout = timeout;
    this.tail = Promise.resolve();
    this.generation = 0;
    this.pending = null;
    this.failed = false;
    this.handleResponse = this.handleResponse.bind(this);
    characteristic.addEventListener(
      "characteristicvaluechanged",
      this.handleResponse,
    );
  }
  handleResponse(event) {
    const value = event.target.value;
    if (
      !this.pending ||
      value.byteLength < 3 ||
      value.getUint8(0) !== 0x80 ||
      value.getUint8(1) !== this.pending.opcode
    )
      return;
    const pending = this.pending;
    const result = value.getUint8(2);
    if (result === 1) pending.resolve();
    else
      pending.reject(
        new Error(
          {
            2: "Trainer does not support this command.",
            3: "Trainer rejected the target.",
            4: "Trainer could not complete the command.",
            5: "Trainer control was lost. Close other training apps and reconnect.",
          }[result] ?? `Trainer error ${result}.`,
        ),
      );
  }
  send(bytes) {
    const generation = this.generation;
    const task = this.tail.then(() => {
      if (generation !== this.generation) throw new Error("Command cancelled.");
      if (this.failed) throw new Error("Trainer control needs reconnection.");
      return new Promise((resolve, reject) => {
        const settle = (error) => {
          clearTimeout(timer);
          this.pending = null;
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(() => {
          this.failed = true; // Late indications must not acknowledge a later command.
          settle(
            new Error("Trainer response timed out. Reconnect the trainer."),
          );
        }, this.timeout);
        const pending = {
          opcode: bytes[0],
          resolve: () => settle(),
          reject: settle,
        };
        this.pending = pending;
        try {
          const write =
            this.characteristic.writeValueWithResponse ??
            this.characteristic.writeValue;
          Promise.resolve(write.call(this.characteristic, bytes)).catch(
            (error) => {
              if (this.pending === pending) {
                this.failed = true;
                settle(error);
              }
            },
          );
        } catch (error) {
          this.failed = true;
          settle(error);
        }
      });
    });
    this.tail = task.catch(() => {});
    return task;
  }
  cancelQueued() {
    this.generation++;
  }
  dispose() {
    this.cancelQueued();
    this.pending?.reject(new Error("Trainer disconnected."));
    this.characteristic.removeEventListener(
      "characteristicvaluechanged",
      this.handleResponse,
    );
  }
}

export class Trainer {
  constructor({ onMetrics = () => {}, onDisconnect = () => {} } = {}) {
    this.onMetrics = onMetrics;
    this.onDisconnect = onDisconnect;
    this.device = null;
    this.control = null;
    this.capabilities = { SIM: false, ERG: false };
    this.powerRange = { min: 0, max: 1800, step: 1 };
    this.lastCrank = null;
    this.lastTarget = null;
  }
  get connected() {
    return !!this.device?.gatt.connected && !!this.control;
  }
  async connect() {
    if (!navigator.bluetooth || !globalThis.isSecureContext)
      throw new Error(
        "Trainer connection requires HTTPS and a browser with Web Bluetooth, such as Chrome on Android or desktop.",
      );
    this.disconnect();
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [0x1826] }],
      optionalServices: [0x1818],
    });
    this.device = device;
    device.addEventListener("gattserverdisconnected", () => {
      if (this.device !== device) return;
      this.control?.dispose();
      this.control = null;
      this.lastTarget = null;
      this.lastCrank = null;
      this.onDisconnect();
    });
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(0x1826);
      const feature = await (
        await service.getCharacteristic(0x2acc)
      ).readValue();
      if (feature.byteLength < 8)
        throw new Error("Trainer returned incomplete FTMS capabilities.");
      const targets = feature.getUint32(4, true);
      this.capabilities = {
        SIM: !!(targets & (1 << 13)),
        ERG: !!(targets & (1 << 3)),
      };
      if (!this.capabilities.SIM && !this.capabilities.ERG)
        throw new Error(
          "Trainer does not expose simulation or target-power control. Check KICKR firmware.",
        );
      if (this.capabilities.ERG) {
        const range = await (
          await service.getCharacteristic(0x2ad8)
        ).readValue();
        if (range.byteLength < 6)
          throw new Error("Trainer returned an incomplete power range.");
        this.powerRange = {
          min: range.getInt16(0, true),
          max: range.getInt16(2, true),
          step: range.getUint16(4, true),
        };
        if (
          this.powerRange.step <= 0 ||
          this.powerRange.max < this.powerRange.min
        )
          throw new Error("Trainer power range is invalid.");
      }
      const characteristic = await service.getCharacteristic(0x2ad9);
      this.control = new FTMSControl(characteristic);
      await characteristic.startNotifications();
      await this.control.send(new Uint8Array([0x00])); // Request Control.
      const data = await service.getCharacteristic(0x2ad2);
      await data.startNotifications();
      data.addEventListener("characteristicvaluechanged", (event) =>
        this.parseIndoorBike(event.target.value),
      );
      // Indoor Bike Data supplies power/cadence on KICKR Core. CPS is optional fallback.
      try {
        const cps = await server.getPrimaryService(0x1818);
        const power = await cps.getCharacteristic(0x2a63);
        await power.startNotifications();
        power.addEventListener("characteristicvaluechanged", (event) =>
          this.parsePower(event.target.value),
        );
      } catch {
        /* Optional service. */
      }
      return device.name || "KICKR Core";
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }
  parseIndoorBike(value) {
    if (value.byteLength < 2) return;
    const flags = value.getUint16(0, true);
    let offset = 2;
    const metrics = {};
    const read = (length, parse) => {
      if (offset + length > value.byteLength) return false;
      parse?.(offset);
      offset += length;
      return true;
    };
    if (!(flags & 1) && !read(2)) return;
    if (flags & 2 && !read(2)) return;
    if (
      flags & 4 &&
      !read(2, (at) => {
        metrics.cadence = value.getUint16(at, true) / 2;
      })
    )
      return;
    if (flags & 8 && !read(2)) return;
    if (flags & 16 && !read(3)) return;
    if (flags & 32 && !read(2)) return;
    if (
      flags & 64 &&
      !read(2, (at) => {
        metrics.power = Math.max(0, value.getInt16(at, true));
      })
    )
      return;
    if (Object.keys(metrics).length) this.onMetrics(metrics);
  }
  parsePower(value) {
    if (value.byteLength < 4) return;
    const metrics = { power: Math.max(0, value.getInt16(2, true)) };
    const flags = value.getUint16(0, true);
    const at =
      4 + (flags & 1 ? 1 : 0) + (flags & 4 ? 2 : 0) + (flags & 16 ? 6 : 0);
    if (flags & 32 && value.byteLength >= at + 4) {
      const crank = {
        revs: value.getUint16(at, true),
        time: value.getUint16(at + 2, true),
      };
      if (this.lastCrank) {
        const deltaTime = (crank.time - this.lastCrank.time + 65536) % 65536;
        const deltaRevs = (crank.revs - this.lastCrank.revs + 65536) % 65536;
        if (deltaTime > 0) {
          const cadence = (deltaRevs * 60 * 1024) / deltaTime;
          if (cadence < 250) metrics.cadence = cadence;
        }
      }
      this.lastCrank = crank;
    }
    this.onMetrics(metrics);
  }
  async start(mode, sample) {
    if (!this.connected)
      throw new Error("Connect the trainer before starting.");
    if (!this.capabilities[mode])
      throw new Error(`Trainer does not support ${mode}.`);
    await this.control.send(new Uint8Array([0x07]));
    this.lastTarget = null;
    await this.setTarget(mode, sample);
  }
  async setTarget(mode, sample) {
    if (!this.connected) throw new Error("Trainer disconnected.");
    if (!this.capabilities[mode])
      throw new Error(`Trainer does not support ${mode}.`);
    const bytes =
      mode === "SIM"
        ? simulationCommand(Math.round(sample.grade * 10) / 10)
        : powerCommand(sample.watts, this.powerRange);
    const key = Array.from(bytes).join(",");
    if (key === this.lastTarget) return;
    await this.control.send(bytes);
    this.lastTarget = key;
  }
  async stop(pause = false) {
    if (!this.connected) return;
    this.control.cancelQueued();
    this.lastTarget = null;
    // Switch out of ERG load before stopping; don't leave a high target behind.
    if (this.capabilities.SIM) await this.control.send(simulationCommand(0));
    else if (this.capabilities.ERG)
      await this.control.send(
        powerCommand(this.powerRange.min, this.powerRange),
      );
    await this.control.send(new Uint8Array([0x08, pause ? 0x02 : 0x01]));
    this.lastTarget = null;
  }
  disconnect() {
    this.control?.dispose();
    this.control = null;
    const device = this.device;
    this.device = null;
    device?.gatt.disconnect();
    this.lastTarget = null;
    this.lastCrank = null;
  }
}

export async function connectHeartRate(onMetrics, onDisconnect = () => {}) {
  if (!navigator.bluetooth || !globalThis.isSecureContext)
    throw new Error("Heart rate requires HTTPS and Web Bluetooth.");
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [0x180d] }],
  });
  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(0x180d);
    const characteristic = await service.getCharacteristic(0x2a37);
    await characteristic.startNotifications();
    characteristic.addEventListener("characteristicvaluechanged", (event) => {
      const value = event.target.value;
      if (value.byteLength < 2) return;
      const wide = value.getUint8(0) & 1;
      if (wide && value.byteLength < 3) return;
      onMetrics({ hr: wide ? value.getUint16(1, true) : value.getUint8(1) });
    });
    device.addEventListener("gattserverdisconnected", onDisconnect);
    return device;
  } catch (error) {
    device.gatt.disconnect();
    throw error;
  }
}
