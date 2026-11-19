export type CueSpeed = "slow" | "normal" | "fast";
export type Mode = "hobby" | "pro";
export type Judgement = "perfect" | "good" | "miss";

export type Settings = { cueSpeed: CueSpeed; mode: Mode };

/** A hand position in normalized screen coordinates (0..1), already mirrored. */
export type Hand = { id: string; x: number; y: number };

export type Light = {
  id: number;
  x: number;
  y: number;
  radius: number;
  spawnAt: number;
  hitAt: number;
};

export type JudgedLight = {
  id: number;
  x: number;
  y: number;
  judgement: Judgement;
  at: number;
};

export type Counts = Record<Judgement, number>;

type Sample = { x: number; y: number; t: number };

export type GameState = {
  settings: Settings;
  startedAt: number;
  now: number;
  light: Light | null;
  nextSpawnAt: number;
  nextId: number;
  counts: Counts;
  judged: JudgedLight[];
  history: Record<string, Sample[]>;
  /** Screen height / width, so distances are measured in screen widths on both axes. */
  aspect: number;
  ended: boolean;
};

export const DEFAULT_SETTINGS: Settings = { cueSpeed: "normal", mode: "hobby" };
export const CUE_MS: Record<CueSpeed, number> = { slow: 1500, normal: 1000, fast: 700 };
export const SESSION_MS = 180_000;

const PERFECT_MS = 100;
const GOOD_MS = 200;
const LIGHT_RADIUS = 0.08;
const GAP_AFTER_LIGHT_MS = 400;
// Pro mode: the hand must have travelled this far (in screen widths) within PUNCH_WINDOW_MS.
const PUNCH_WINDOW_MS = 200;
const PUNCH_DISTANCE = 0.15;
// Area reachable both seated and standing: center to upper part of the screen.
const AREA = { minX: 0.2, maxX: 0.8, minY: 0.15, maxY: 0.6 };

export function createGame(settings: Settings, now: number, aspect = 1): GameState {
  return {
    settings,
    startedAt: now,
    now,
    light: null,
    nextSpawnAt: now,
    nextId: 1,
    counts: { perfect: 0, good: 0, miss: 0 },
    judged: [],
    history: {},
    aspect,
    ended: false,
  };
}

export function stepGame(
  state: GameState,
  now: number,
  hands: Hand[],
  random: () => number = Math.random
): GameState {
  if (state.ended) return state;
  if (now - state.startedAt >= SESSION_MS) {
    return { ...state, now, light: null, ended: true };
  }

  const history = recordHands(state.history, hands, now);
  let { light, nextSpawnAt, nextId, counts, judged } = state;

  if (light) {
    const delta = now - light.hitAt;
    const hitter =
      Math.abs(delta) <= GOOD_MS &&
      hands.find(
        (hand) =>
          isInside(hand, light!, state.aspect) &&
          (state.settings.mode === "hobby" ||
            isPunch(history[hand.id], hand, now, state.aspect))
      );

    let judgement: Judgement | null = null;
    if (hitter) judgement = Math.abs(delta) <= PERFECT_MS ? "perfect" : "good";
    else if (delta > GOOD_MS) judgement = "miss";

    if (judgement) {
      counts = { ...counts, [judgement]: counts[judgement] + 1 };
      judged = [...judged, { id: light.id, x: light.x, y: light.y, judgement, at: now }];
      light = null;
      nextSpawnAt = now + GAP_AFTER_LIGHT_MS;
    }
  }

  if (!light && now >= nextSpawnAt) {
    light = {
      id: nextId,
      x: AREA.minX + random() * (AREA.maxX - AREA.minX),
      y: AREA.minY + random() * (AREA.maxY - AREA.minY),
      radius: LIGHT_RADIUS,
      spawnAt: now,
      hitAt: now + CUE_MS[state.settings.cueSpeed],
    };
    nextId += 1;
  }

  return { ...state, now, light, nextSpawnAt, nextId, counts, judged, history };
}

export function accuracyOf(counts: Counts): number {
  const total = counts.perfect + counts.good + counts.miss;
  if (total === 0) return 0;
  return (counts.perfect * 100 + counts.good * 50) / total;
}

export function remainingMs(state: GameState): number {
  return Math.max(0, SESSION_MS - (state.now - state.startedAt));
}

function isInside(hand: Hand, target: Target, aspect: number): boolean {
  return Math.hypot(hand.x - target.x, (hand.y - target.y) * aspect) <= target.radius;
}

function isPunch(
  samples: Sample[] | undefined,
  hand: Hand,
  now: number,
  aspect: number
): boolean {
  return (samples ?? []).some(
    (s) =>
      s.t < now &&
      now - s.t <= PUNCH_WINDOW_MS &&
      Math.hypot(hand.x - s.x, (hand.y - s.y) * aspect) >= PUNCH_DISTANCE
  );
}

function recordHands(
  history: Record<string, Sample[]>,
  hands: Hand[],
  now: number
): Record<string, Sample[]> {
  const next: Record<string, Sample[]> = {};
  for (const hand of hands) {
    const kept = (history[hand.id] ?? []).filter((s) => now - s.t <= PUNCH_WINDOW_MS);
    next[hand.id] = [...kept, { x: hand.x, y: hand.y, t: now }];
  }
  return next;
}

export type Target = { x: number; y: number; radius: number };

/** The on-screen "start" mark the player punches to begin. */
export const START_TARGET: Target = { x: 0.5, y: 0.4, radius: 0.12 };

export function isHandOnTarget(hands: Hand[], target: Target, aspect: number): boolean {
  return hands.some((hand) => isInside(hand, target, aspect));
}
