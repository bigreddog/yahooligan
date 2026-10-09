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
  constructor(workout, mode = "SIM", { measuredSpeed = false } = {}) {
    this.workout = workout;
    this.mode = mode;
    this.measuredSpeed = measuredSpeed;
    this.status = "ready";
    this.elapsed = 0;
    this.distance = 0;
    this.altitude = 500;
    this.velocity = 0;
    this.records = [];
    this.nextRecord = 1;
    this.startedAt = null;
    this.wallTime = null;
  }
  get sample() {
    return sampleWorkout(this.workout, this.elapsed);
  }
  start(now = Date.now()) {
    if (this.status === "finished" || this.status === "running") return;
    if (!this.startedAt) this.startedAt = new Date(now);
    this.wallTime = now;
    this.status = "running";
  }
  pause() {
    if (this.status === "running") this.status = "paused";
  }
  finish() {
    this.status = "finished";
  }
  sync(now, metrics, { demo = false, record = true } = {}) {
    if (this.status !== "running" || !Number.isFinite(now)) return;
    const seconds = Math.max(0, (now - this.wallTime) / 1000);
    this.wallTime = Math.max(this.wallTime, now);
    if (!record || (seconds > 2 && !demo)) {
      // A suspended browser cannot measure power or distance during the gap.
      this.elapsed = Math.min(this.workout.duration, this.elapsed + seconds);
      this.nextRecord = Math.floor(this.elapsed) + 1;
      this.velocity = 0;
      if (this.elapsed >= this.workout.duration) this.finish();
    } else this.advance(seconds, metrics);
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
      this.velocity = this.measuredSpeed
        ? Number.isFinite(metrics.speed)
          ? Math.max(0, metrics.speed)
          : 0
        : stepVelocity(
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
          ...metrics,
          speed:
            this.measuredSpeed && !Number.isFinite(metrics.speed)
              ? null
              : this.velocity,
        });
        this.nextRecord++;
      }
    }
    this.elapsed = end;
    if (end >= this.workout.duration) this.finish();
  }
}
