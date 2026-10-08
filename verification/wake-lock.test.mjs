import test from "node:test";
import assert from "node:assert/strict";
import { ScreenWakeLock } from "../js/wake-lock.js";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(request) {
  const document = new EventTarget();
  document.hidden = false;
  const locks = [];
  const navigator = {
    wakeLock: {
      request:
        request ||
        (async (type) => {
          assert.equal(type, "screen");
          const lock = new EventTarget();
          lock.released = false;
          lock.release = async () => {
            lock.released = true;
            lock.dispatchEvent(new Event("release"));
          };
          locks.push(lock);
          return lock;
        }),
    },
  };
  return {
    document,
    navigator,
    locks,
    manager: new ScreenWakeLock({ document, navigator }),
  };
}
test("keeps running sessions awake, releases on pause, and reacquires on return", async () => {
  const f = fixture();
  f.manager.setActive(true);
  await flush();
  assert.equal(f.locks.length, 1);
  f.document.hidden = true;
  f.document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(f.locks[0].released, true);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(f.locks.length, 2);
  f.manager.setActive(false);
  await flush();
  assert.equal(f.locks[1].released, true);
  f.document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(f.locks.length, 2);
});
test("releases a pending request if the ride pauses before it resolves", async () => {
  let resolve;
  const f = fixture(() => new Promise((r) => (resolve = r)));
  f.manager.setActive(true);
  f.manager.setActive(false);
  let released = false;
  resolve({
    release: async () => {
      released = true;
    },
  });
  await flush();
  assert.equal(released, true);
  assert.equal(f.manager.lock, null);
});
test("unsupported and denied locks leave the session usable", async () => {
  const f = fixture(async () => {
    throw new Error("Denied");
  });
  f.manager.setActive(true);
  await flush();
  assert.equal(f.manager.active, true);
  assert.equal(f.manager.lock, null);
  f.manager.setActive(false);
  delete f.navigator.wakeLock;
  f.manager.setActive(true);
  await flush();
  assert.equal(f.manager.active, true);
  f.manager.setActive(false);
});
