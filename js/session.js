import { sampleWorkout, clamp } from "./workout.js";

// Small physics steps avoid the unstable one-second acceleration in the original PR.
export function stepVelocity(velocity, power, grade, dt) {
  const angle = Math.atan(grade / 100);
  const resistance =
    83 * 9.81 * (Math.sin(angle) + 0.004 * Math.cos(angle)) +
    0.5 * 1.225 * 0.32 * velocity * velocity;
  const force = Math.min(
    400,
    (Math.max(0, power) * 0.97) / Math.max(velocity, 0.5),
  );
  return Math.max(0, velocity + clamp((force - resistance) / 83, -8, 5) * dt);
}

export class Session {
  constructor(workout, mode = "SIM") {
    this.workout = workout;
    this.mode = mode;
    this.status = "ready";
    this.elapsed = 0;
    this.distance = 0;
    this.altitude = 500;
    this.velocity = 0;
    this.records = [];
    this.nextRecord = 1;
    this.startedAt = null;
  }
  get sample() {
    return sampleWorkout(this.workout, this.elapsed);
  }
  start() {
    if (this.status === "finished") return;
    if (!this.startedAt) this.startedAt = new Date();
    this.status = "running";
  }
  pause() {
    if (this.status === "running") this.status = "paused";
  }
  finish() {
    this.status = "finished";
  }
  advance(seconds, metrics) {
    if (this.status !== "running" || !Number.isFinite(seconds) || seconds <= 0)
      return;
    const end = Math.min(this.workout.duration, this.elapsed + seconds);
    while (this.elapsed < end - 1e-9) {
      const step = Math.min(
        0.05,
        end - this.elapsed,
        this.nextRecord - this.elapsed,
      );
      const sample = this.sample;
      this.velocity = stepVelocity(
        this.velocity,
        metrics.power,
        this.mode === "SIM" ? sample.grade : 0,
        step,
      );
      const distance = this.velocity * step;
      this.distance += distance;
      this.altitude += (distance * sample.grade) / 100;
      this.elapsed += step;
      if (this.elapsed >= this.nextRecord - 1e-8) {
        this.elapsed = this.nextRecord;
        this.records.push({
          time: this.elapsed,
          distance: this.distance,
          altitude: this.altitude,
          speed: this.velocity,
          ...metrics,
        });
        this.nextRecord++;
      }
    }
    this.elapsed = end;
    if (end >= this.workout.duration) this.finish();
  }
}
