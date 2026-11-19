/** The bonus challenge lasts 10 seconds. */
export const CHALLENGE_MS = 10_000;

const GRAVITY = 9.81;
// A punch is a burst of acceleration above this (m/s²); ordinary arm moves stay below it.
const PUNCH_THRESHOLD = 15;
// After a punch the arm snaps back; ignore that rebound for a short while.
const COOLDOWN_MS = 300;

/** One accelerometer reading: time in ms and acceleration size in m/s² without gravity. */
export type Sample = { t: number; magnitude: number };

/** `peak` is the largest value of the burst in progress (0 when none). */
export type Detector = { peak: number; cooldownUntil: number };

export function createDetector(): Detector {
  return { peak: 0, cooldownUntil: 0 };
}

/** Feeds one reading; returns a punch's power (its peak, m/s²) when a burst ends. */
export function feedSample(
  detector: Detector,
  sample: Sample,
): { detector: Detector; punch: number | null } {
  if (sample.t < detector.cooldownUntil) return { detector, punch: null };

  if (sample.magnitude >= PUNCH_THRESHOLD) {
    return {
      detector: {
        ...detector,
        peak: Math.max(detector.peak, sample.magnitude),
      },
      punch: null,
    };
  }
  if (detector.peak > 0) {
    return {
      detector: { peak: 0, cooldownUntil: sample.t + COOLDOWN_MS },
      punch: detector.peak,
    };
  }
  return { detector, punch: null };
}

/** Sums up the punches of one challenge in G (1G = 9.81 m/s²), rounded to 0.1. */
export function summarize(punches: number[]): {
  count: number;
  maxG: number;
  averageG: number;
} {
  if (punches.length === 0) return { count: 0, maxG: 0, averageG: 0 };
  const total = punches.reduce((sum, p) => sum + p, 0);
  return {
    count: punches.length,
    maxG: toG(Math.max(...punches)),
    averageG: toG(total / punches.length),
  };
}

/** Converts one punch's power to G for display. */
export function toG(power: number): number {
  return Math.round((power / GRAVITY) * 10) / 10;
}
