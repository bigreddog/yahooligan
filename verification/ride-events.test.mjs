import { test } from "node:test";
import assert from "node:assert/strict";
import { RideEvents } from "../js/ride-events.js";

const state = (
  elapsed,
  grade = 0,
  watts = 150,
  index = 0,
  status = "running",
  mode = "SIM",
) => ({ elapsed, status, mode, sample: { grade, watts, index } });

test("ride start and pauses are announced, ordinary telemetry is quiet", () => {
  const events = new RideEvents();
  assert.equal(events.update(state(0)).reason, "Let’s ride");
  for (let i = 1; i < 20; i++)
    assert.equal(events.update(state(i, i * 0.01)), null);
  assert.equal(events.update(state(20, 0, 150, 0, "paused")).sticky, true);
  assert.equal(
    events.update(state(20, 0, 150, 0, "running")).reason,
    "Back on the road",
  );
});
test("minute updates fire once per boundary", () => {
  const events = new RideEvents();
  events.update(state(0));
  assert.equal(events.update(state(59.9)), null);
  assert.equal(events.update(state(60)).reason, "Minute 1");
  assert.equal(events.update(state(60.1)), null);
  assert.equal(events.update(state(120)).reason, "Minute 2");
});
test("phase changes take priority over minute and grade changes", () => {
  const events = new RideEvents();
  events.update(state(0));
  assert.equal(events.update(state(60, 5, 200, 1)).reason, "New workout phase");
  assert.equal(events.update(state(60.1, 5, 200, 1)), null);
});
test("grade announcements accumulate meaningful changes and avoid ramp spam", () => {
  const events = new RideEvents();
  events.update(state(0));
  assert.equal(events.update(state(21, 0.7)), null);
  assert.equal(events.update(state(22, 1.1)).reason, "Grade change");
  assert.equal(events.update(state(23, 2.3)), null);
  assert.equal(events.update(state(43, 2.3)).reason, "Grade change");
});
test("ERG announces watt changes and mode switches instead of scenic slopes", () => {
  const events = new RideEvents();
  events.update(state(0));
  assert.equal(
    events.update(state(1, 0, 150, 0, "running", "ERG")).reason,
    "ERG mode",
  );
  assert.equal(events.update(state(22, 5, 150, 0, "running", "ERG")), null);
  assert.equal(
    events.update(state(23, 5, 170, 0, "running", "ERG")).reason,
    "New power target",
  );
});
test("finish remains visible, reset allows the next workout to announce its start", () => {
  const events = new RideEvents();
  events.update(state(0));
  assert.deepEqual(events.update(state(300, 0, 100, 10, "finished")), {
    reason: "Ride complete",
    sticky: true,
  });
  assert.equal(events.update(state(300, 0, 100, 10, "finished")), null);
  events.reset();
  assert.equal(events.update(state(0)).reason, "Let’s ride");
});
