import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FTMSControl,
  simulationCommand,
  powerCommand,
  Trainer,
} from "../js/ble.js";

class Characteristic {
  constructor(auto = false) {
    this.listeners = new Set();
    this.writes = [];
    this.auto = auto;
  }
  addEventListener(type, callback) {
    this.listeners.add(callback);
  }
  removeEventListener(type, callback) {
    this.listeners.delete(callback);
  }
  async writeValueWithResponse(bytes) {
    this.writes.push(Array.from(bytes));
    if (this.auto) queueMicrotask(() => this.respond(bytes[0]));
  }
  respond(opcode, result = 1) {
    const value = new DataView(new Uint8Array([0x80, opcode, result]).buffer);
    for (const callback of this.listeners) callback({ target: { value } });
  }
  async startNotifications() {
    return this;
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("encodes KICKR cycling simulation, signed grades and bounded ERG watts", () => {
  assert.deepEqual(
    Array.from(simulationCommand(5)),
    [0x11, 0, 0, 0xf4, 1, 40, 51],
  );
  assert.equal(
    new DataView(simulationCommand(-2).buffer).getInt16(3, true),
    -200,
  );
  assert.equal(
    new DataView(simulationCommand(100).buffer).getInt16(3, true),
    1200,
  );
  assert.deepEqual(Array.from(powerCommand(200)), [5, 200, 0]);
  const range = { min: 50, max: 250, step: 5 };
  assert.equal(
    new DataView(powerCommand(800, range).buffer).getInt16(1, true),
    250,
  );
  assert.equal(
    new DataView(powerCommand(153, range).buffer).getInt16(1, true),
    155,
  );
  assert.throws(() => simulationCommand(NaN));
  assert.throws(() => powerCommand(Infinity));
});

test("serializes commands and requires matching successful indications", async () => {
  const characteristic = new Characteristic();
  const control = new FTMSControl(characteristic, 500);
  let acknowledged = false;
  const first = control.send(new Uint8Array([0])).then(() => {
    acknowledged = true;
  });
  const second = control.send(powerCommand(180));
  await flush();
  assert.equal(characteristic.writes.length, 1);
  characteristic.respond(5);
  await flush();
  assert.equal(acknowledged, false);
  characteristic.respond(0);
  await first;
  await flush();
  assert.equal(characteristic.writes.length, 2);
  characteristic.respond(5);
  await second;
  control.dispose();
});

test("propagates trainer rejection and timeouts, blocking reuse after a timeout", async () => {
  const characteristic = new Characteristic();
  const control = new FTMSControl(characteristic, 15);
  const rejected = control.send(powerCommand(100));
  const rejection = assert.rejects(rejected, /control was lost/);
  await flush();
  characteristic.respond(5, 5);
  await rejection;
  await assert.rejects(control.send(simulationCommand(3)), /timed out/);
  characteristic.respond(0x11); // Late response cannot revive the failed queue.
  await assert.rejects(control.send(simulationCommand(4)), /reconnection/);
  control.dispose();
});

test("mode switches cancel queued old targets without interleaving in-flight commands", async () => {
  const characteristic = new Characteristic();
  const control = new FTMSControl(characteristic, 500);
  const first = control.send(simulationCommand(3));
  const stale = control.send(simulationCommand(4));
  const rejected = assert.rejects(stale, /cancelled/);
  await flush();
  control.cancelQueued();
  const next = control.send(powerCommand(180));
  characteristic.respond(0x11);
  await first;
  await rejected;
  await flush();
  assert.deepEqual(
    characteristic.writes.map((bytes) => bytes[0]),
    [0x11, 5],
  );
  characteristic.respond(5);
  await next;
  control.dispose();
});

test("disconnect rejects pending commands and removes indication listener", async () => {
  const characteristic = new Characteristic();
  const control = new FTMSControl(characteristic);
  const pending = control.send(powerCommand(150));
  const rejected = assert.rejects(pending, /disconnected/);
  await flush();
  control.dispose();
  await rejected;
  assert.equal(characteristic.listeners.size, 0);
});

test("parses variable Indoor Bike Data and ignores truncated packets", () => {
  const received = [];
  const trainer = new Trainer({ onMetrics: (data) => received.push(data) });
  const bytes = new Uint8Array(10),
    view = new DataView(bytes.buffer);
  view.setUint16(0, 0x64, true); // Speed, cadence, resistance, power.
  view.setUint16(2, 2500, true);
  view.setUint16(4, 170, true);
  view.setInt16(6, 30, true);
  view.setInt16(8, 210, true);
  trainer.parseIndoorBike(view);
  assert.deepEqual(received, [{ speed: 2500 / 360, cadence: 85, power: 210 }]);
  trainer.parseIndoorBike(new DataView(bytes.buffer, 0, 9));
  assert.equal(received.length, 1);
});

test("discovers capabilities and power range, requests control and starts correct modes", async () => {
  const control = new Characteristic(true);
  const feature = new DataView(new ArrayBuffer(8));
  feature.setUint32(4, (1 << 13) | (1 << 3), true);
  const range = new DataView(new ArrayBuffer(6));
  range.setInt16(0, 50, true);
  range.setInt16(2, 500, true);
  range.setUint16(4, 5, true);
  const data = new Characteristic();
  const device = {
    name: "KICKR CORE",
    addEventListener() {},
    gatt: {
      connected: false,
      async connect() {
        this.connected = true;
        return {
          async getPrimaryService(id) {
            if (id !== 0x1826) throw new Error("No CPS");
            return {
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
          },
        };
      },
      disconnect() {
        this.connected = false;
      },
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      bluetooth: {
        async requestDevice() {
          return device;
        },
      },
    },
  });
  globalThis.isSecureContext = true;
  try {
    const trainer = new Trainer();
    await trainer.connect();
    assert.deepEqual(trainer.capabilities, { SIM: true, ERG: true });
    assert.deepEqual(trainer.powerRange, { min: 50, max: 500, step: 5 });
    await trainer.start("SIM", { grade: 4, watts: 200 });
    await trainer.stop(true);
    await trainer.start("ERG", { grade: 4, watts: 1000 });
    assert.deepEqual(
      control.writes.map((bytes) => bytes[0]),
      [0, 7, 0x11, 0x11, 8, 7, 5],
    );
    assert.deepEqual(control.writes[4], [8, 2]);
    assert.equal(
      new DataView(new Uint8Array(control.writes.at(-1)).buffer).getInt16(
        1,
        true,
      ),
      500,
    );
    trainer.disconnect();
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
    delete globalThis.isSecureContext;
  }
});

test("trainer speed uses hundredths of km/h, handles zero, and excludes absent speed fields", () => {
  const received = [];
  const trainer = new Trainer({ onMetrics: (data) => received.push(data) });
  const view = new DataView(new ArrayBuffer(4));
  view.setUint16(2, 1900, true);
  trainer.parseIndoorBike(view);
  assert.equal(received[0].speed * 3.6, 19);
  view.setUint16(2, 0, true);
  trainer.parseIndoorBike(view);
  assert.equal(received[1].speed, 0);
  view.setUint16(0, 0x41, true);
  view.setInt16(2, 200, true);
  trainer.parseIndoorBike(view);
  assert.deepEqual(received[2], { power: 200 });
});
