// Only consequential changes get a fly-out. Continuous telemetry stays in the HUD.
export class RideEvents {
  constructor() {
    this.reset();
  }
  reset() {
    this.previous = null;
    this.lastGrade = null;
    this.lastWatts = null;
    this.lastNotice = -Infinity;
  }
  update({ status, mode, elapsed, sample }) {
    const previous = this.previous;
    this.previous = {
      status,
      mode,
      minute: Math.floor(elapsed / 60),
      phase: sample.index,
    };
    let reason = null;
    if (!previous || previous.status !== status) {
      reason = {
        ready: "Ready when you are",
        running:
          previous?.status === "paused" ? "Back on the road" : "Let’s ride",
        paused: "Take a breather",
        finished: "Ride complete",
      }[status];
    } else if (previous.mode !== mode) reason = `${mode} mode`;
    else if (status === "running") {
      if (previous.phase !== sample.index) reason = "New workout phase";
      else if (previous.minute !== Math.floor(elapsed / 60))
        reason = `Minute ${Math.floor(elapsed / 60)}`;
      else if (
        elapsed - this.lastNotice >= 20 &&
        (mode === "SIM"
          ? Math.abs(sample.grade - this.lastGrade) >= 1
          : Math.abs(sample.watts - this.lastWatts) >= 15)
      )
        reason = mode === "SIM" ? "Grade change" : "New power target";
    }
    if (!reason) return null;
    this.lastNotice = elapsed;
    this.lastGrade = sample.grade;
    this.lastWatts = sample.watts;
    return { reason, sticky: status !== "running" };
  }
}
