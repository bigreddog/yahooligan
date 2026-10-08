import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILES,
  generateWorkout,
  sampleWorkout,
  random,
} from "../js/workout.js";
import { Session, stepVelocity } from "../js/session.js";
import { generateTCX } from "../js/tcx.js";

test("every profile fills its selected duration and has bounded, continuous targets", () => {
  for (const profile of Object.keys(PROFILES))
    for (const minutes of [5, 30, 180]) {
      const workout = generateWorkout({
        profile,
        minutes,
        startGrade: 2,
        startWatts: 180,
      });
      assert.equal(workout.duration, minutes * 60);
      assert.equal(workout.phases[0].name, "Warm-up");
      assert.equal(workout.phases.at(-1).name, "Cool-down");
      assert.equal(workout.phases.at(-1).end, workout.duration);
      assert.equal(sampleWorkout(workout, 0).grade, 2);
      assert.equal(sampleWorkout(workout, 0).watts, 180);
      for (let i = 1; i < workout.phases.length; i++) {
        const phase = workout.phases[i];
        assert.ok(Math.abs(workout.phases[i - 1].end - phase.start) < 1e-6);
        const before = sampleWorkout(workout, phase.start - 1e-5);
        const after = sampleWorkout(workout, phase.start + 1e-5);
        assert.ok(Math.abs(before.grade - after.grade) < 1e-4);
        assert.ok(Math.abs(before.watts - after.watts) < 1e-3);
      }
      for (let time = 0; time <= workout.duration; time += 3) {
        const sample = sampleWorkout(workout, time);
        assert.ok(sample.grade >= -5 && sample.grade <= 12);
        assert.ok(sample.watts > 0 && sample.watts <= 750);
      }
      assert.equal(sampleWorkout(workout, workout.duration + 100).progress, 1);
      assert.equal(sampleWorkout(workout, workout.duration).grade, 0);
    }
});

test("scenery regeneration preserves workout intensity and reproducible randomness", () => {
  const first = generateWorkout({ seed: 1 });
  const second = generateWorkout({ seed: 999 });
  assert.deepEqual(first.phases, second.phases);
  const a = random(42),
    b = random(42),
    c = random(43);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.notEqual(random(42)(), c());
});

test("rejects malformed or out-of-range inputs", () => {
  for (const settings of [
    { minutes: NaN },
    { minutes: 4 },
    { minutes: 181 },
    { startGrade: 11 },
    { startWatts: 0 },
    { startWatts: Infinity },
    { profile: "missing" },
  ])
    assert.throws(() => generateWorkout(settings));
});

test("session pauses, resumes and finishes at exactly the selected active duration", () => {
  const session = new Session(generateWorkout({ minutes: 5 }), "SIM");
  const metrics = { power: 180, cadence: 85, hr: 135 };
  session.start();
  session.advance(3.45, metrics);
  const initialDistance = session.distance;
  session.pause();
  session.advance(1000, metrics);
  assert.equal(session.elapsed, 3.45);
  assert.equal(session.distance, initialDistance);
  session.start();
  session.advance(1000, metrics);
  assert.equal(session.elapsed, 300);
  assert.equal(session.status, "finished");
  assert.equal(session.records.length, 300);
  assert.equal(session.records.at(-1).time, 300);
  assert.ok(session.distance > 0);
  for (const record of session.records)
    assert.ok(
      Number.isFinite(record.distance) && Number.isFinite(record.altitude),
    );
  const xml = generateTCX(session);
  assert.match(xml, /<TotalTimeSeconds>300.00<\/TotalTimeSeconds>/);
  assert.match(xml, /<AltitudeMeters>/);
  assert.equal((xml.match(/<Trackpoint>/g) || []).length, 300);
});

test("SIM responds to slope; ERG uses flat virtual physics while retaining scenic grade", () => {
  assert.ok(stepVelocity(7, 200, 8, 0.05) < stepVelocity(7, 200, 0, 0.05));
  const workout = generateWorkout({
    profile: "steady",
    startGrade: 8,
    minutes: 5,
  });
  const sim = new Session(workout, "SIM"),
    erg = new Session(workout, "ERG");
  sim.start();
  erg.start();
  const data = { power: 180, cadence: 80, hr: 130 };
  sim.advance(100, data);
  erg.advance(100, data);
  assert.ok(erg.distance > sim.distance);
  assert.equal(sim.sample.grade, erg.sample.grade);
  assert.equal(sim.sample.progress, erg.sample.progress);
});

test("physics is stable at rest and sampling does not duplicate export timestamps", () => {
  const session = new Session(generateWorkout({ minutes: 5 }));
  assert.equal(generateTCX(session), null);
  session.start();
  for (let i = 0; i < 120; i++)
    session.advance(1 / 60, { power: 0, cadence: 0, hr: 0 });
  assert.equal(session.distance, 0);
  assert.deepEqual(
    session.records.map((point) => point.time),
    [1, 2],
  );
  assert.ok(Math.abs(session.elapsed - 2) < 1e-8);
});
