export const PROFILES = {
  recovery: {
    name: "Recovery",
    description: "Easy spinning across gentle terrain.",
  },
  steady: {
    name: "Steady ride",
    description: "Find your rhythm on an open alpine road.",
  },
  rolling: {
    name: "Rolling hills",
    description: "Flowing climbs, crests and recovery descents.",
  },
  climb: {
    name: "Sustained climb",
    description: "Build gradually toward the summit.",
  },
  repeats: {
    name: "Hill repeats",
    description: "Four climbs with a recovery between each.",
  },
  intervals: {
    name: "Intervals",
    description: "Six efforts alternating with easy spinning.",
  },
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const smoothstep = (x) => x * x * (3 - 2 * x);

// Seed affects scenery only. Regenerating a route never changes prescribed effort.
export function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWorkout({
  profile = "rolling",
  minutes = 30,
  startGrade = 0,
  startWatts = 150,
  seed = 1,
} = {}) {
  if (!PROFILES[profile]) throw new Error("Choose a valid workout profile.");
  for (const value of [minutes, startGrade, startWatts]) {
    if (!Number.isFinite(value))
      throw new Error("Workout settings must be numbers.");
  }
  if (minutes < 5 || minutes > 180)
    throw new Error("Duration must be between 5 and 180 minutes.");
  if (startGrade < -5 || startGrade > 10)
    throw new Error("Starting grade must be between −5% and 10%.");
  if (startWatts < 50 || startWatts > 500)
    throw new Error("Starting watts must be between 50 and 500 W.");
  const duration = Math.round(minutes * 60);
  const main = [];
  const add = (name, grade, ratio, weight = 1) =>
    main.push({
      name,
      grade: clamp(grade, -5, 12),
      watts: Math.round(startWatts * ratio),
      weight,
    });
  switch (profile) {
    case "recovery":
      add("Easy spinning", startGrade, 0.8);
      break;
    case "steady":
      add("Steady effort", startGrade + 1, 1);
      break;
    case "rolling":
      for (let i = 0; i < 4; i++) {
        add(`Rolling climb ${i + 1}`, startGrade + [3, 5, 4, 6][i], 1.15, 2);
        add(`Descent ${i + 1}`, -2, 0.75);
      }
      break;
    case "climb":
      for (let i = 0; i < 4; i++)
        add(
          i === 3 ? "Summit push" : `Climb stage ${i + 1}`,
          startGrade + 2 + i * 1.5,
          1 + i * 0.1,
        );
      break;
    case "repeats":
      for (let i = 0; i < 4; i++) {
        add(`Hill repeat ${i + 1}`, startGrade + 6, 1.35, 2);
        add(`Recovery ${i + 1}`, 0, 0.7);
      }
      break;
    case "intervals":
      for (let i = 0; i < 6; i++) {
        add(`Effort ${i + 1}`, startGrade + 5, 1.5);
        add(`Recovery ${i + 1}`, 0, 0.65);
      }
      break;
  }
  const warmup = duration * 0.15;
  const cooldown = duration * 0.15;
  const totalWeight = main.reduce((sum, phase) => sum + phase.weight, 0);
  const phases = [
    {
      name: "Warm-up",
      start: 0,
      end: warmup,
      grade: startGrade,
      watts: startWatts,
    },
  ];
  let cursor = warmup;
  for (const phase of main) {
    const length = (duration * 0.7 * phase.weight) / totalWeight;
    phases.push({ ...phase, start: cursor, end: cursor + length });
    cursor += length;
  }
  phases[phases.length - 1].end = duration - cooldown;
  phases.push({
    name: "Cool-down",
    start: duration - cooldown,
    end: duration,
    grade: 0,
    watts: Math.round(startWatts * 0.6),
  });
  return {
    profile,
    name: PROFILES[profile].name,
    duration,
    startGrade,
    startWatts,
    seed: seed >>> 0,
    phases,
  };
}

export function sampleWorkout(workout, seconds) {
  const time = clamp(seconds, 0, workout.duration);
  let index = workout.phases.findIndex((phase) => time < phase.end);
  if (index < 0) index = workout.phases.length - 1;
  const phase = workout.phases[index];
  const previous = workout.phases[Math.max(0, index - 1)];
  const rampSeconds = Math.min(12, (phase.end - phase.start) * 0.25);
  const blend = smoothstep(clamp((time - phase.start) / rampSeconds, 0, 1));
  return {
    time,
    index,
    phase: phase.name,
    grade: previous.grade + (phase.grade - previous.grade) * blend,
    watts: previous.watts + (phase.watts - previous.watts) * blend,
    next: workout.phases[index + 1]?.name ?? "Finish",
    untilNext: Math.max(0, phase.end - time),
    progress: time / workout.duration,
  };
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}
