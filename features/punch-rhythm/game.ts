import type { Note } from "./beats";

export type CueSpeed = "slow" | "normal" | "fast";
export type Mode = "hobby" | "pro";
export type Difficulty = "normal" | "hard";
export type Judgement = "perfect" | "good" | "miss" | "dodge";

export type Settings = {
  cueSpeed: CueSpeed;
  mode: Mode;
  difficulty: Difficulty;
  minutes: number;
};

/** A point in normalized screen coordinates (0..1), already mirrored. */
export type Point = { x: number; y: number };

/** A hand position in normalized screen coordinates (0..1), already mirrored. */
export type Hand = { id: string; x: number; y: number };

export type Light = {
  id: number;
  /** "hit" lights are punched, "dodge" lights must be avoided with the head. */
  kind: "hit" | "dodge";
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

/** A song to play along: its notes (when and on which side to hit) and its length. */
export type Song = { notes: Note[]; durationMs: number };

export type GameState = {
  settings: Settings;
  startedAt: number;
  now: number;
  /** Lights on screen; with a song several can be waiting at once. */
  lights: Light[];
  nextSpawnAt: number;
  nextId: number;
  counts: Counts;
  judged: JudgedLight[];
  history: Record<string, Sample[]>;
  /** Screen height / width, so distances are measured in screen widths on both axes. */
  aspect: number;
  /** Radius of the hand pointer in screen widths; it widens what counts as touching. */
  pointerRadius: number;
  song: Song | null;
  /** Index of the next note in `song.notes` that has no light yet. */
  nextBeat: number;
  ended: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  cueSpeed: "normal",
  mode: "hobby",
  difficulty: "normal",
  minutes: 3,
};
export const CUE_MS: Record<CueSpeed, number> = {
  slow: 1500,
  normal: 1000,
  fast: 700,
};

const PERFECT_MS = 100;
const GOOD_MS = 200;
const LIGHT_RADIUS = 0.08;
const GAP_AFTER_LIGHT_MS = 400;
// Hard difficulty: share of lights that are red, their size, and where they go without a head.
const DODGE_CHANCE = 0.3;
const DODGE_RADIUS = 0.12;
const DEFAULT_HEAD: Point = { x: 0.5, y: 0.3 };
// Pro mode: the hand must have travelled this far (in screen widths) within PUNCH_WINDOW_MS.
const PUNCH_WINDOW_MS = 200;
const PUNCH_DISTANCE = 0.15;
// Area reachable both seated and standing: center to upper part of the screen.
const AREA = { minX: 0.2, maxX: 0.8, minY: 0.15, maxY: 0.6 };
// Combo notes keep this far from the middle, so left and right are clearly apart.
const SIDE_MARGIN = 0.05;

export function createGame(
  settings: Settings,
  now: number,
  aspect = 1,
  pointerRadius = 0,
  song: Song | null = null,
): GameState {
  return {
    settings,
    startedAt: now,
    now,
    lights: [],
    nextSpawnAt: now,
    nextId: 1,
    counts: { perfect: 0, good: 0, miss: 0, dodge: 0 },
    judged: [],
    history: {},
    aspect,
    pointerRadius,
    song,
    nextBeat: 0,
    ended: false,
  };
}

export function stepGame(
  state: GameState,
  now: number,
  hands: Hand[],
  random: () => number = Math.random,
  head: Point | null = null,
): GameState {
  if (state.ended) return state;
  if (now - state.startedAt >= sessionMs(state)) {
    return { ...state, now, lights: [], ended: true };
  }

  const history = recordHands(state.history, hands, now);
  let { nextSpawnAt, nextId, nextBeat, counts, judged } = state;

  const lights: Light[] = [];
  for (const light of state.lights) {
    const judgement = judge(light, state, now, hands, history, head);
    if (!judgement) {
      lights.push(light);
      continue;
    }
    counts = { ...counts, [judgement]: counts[judgement] + 1 };
    judged = [
      ...judged,
      { id: light.id, x: light.x, y: light.y, judgement, at: now },
    ];
    nextSpawnAt = now + GAP_AFTER_LIGHT_MS;
  }

  const cueMs = CUE_MS[state.settings.cueSpeed];
  const spawn = (hitAt: number, side: Note["side"] = "any") => {
    lights.push(
      makeLight(state, nextId, hitAt - cueMs, hitAt, side, random, head),
    );
    nextId += 1;
  };
  if (state.song) {
    // Each light appears one cue before its beat, so the cue closes right on the beat.
    const notes = state.song.notes;
    while (
      nextBeat < notes.length &&
      now >= state.startedAt + notes[nextBeat].at - cueMs
    ) {
      spawn(state.startedAt + notes[nextBeat].at, notes[nextBeat].side);
      nextBeat += 1;
    }
  } else if (lights.length === 0 && now >= nextSpawnAt) {
    spawn(now + cueMs);
  }

  return {
    ...state,
    now,
    lights,
    nextSpawnAt,
    nextId,
    nextBeat,
    counts,
    judged,
    history,
  };
}

/** The judgement for one light at this frame, or null while it is still waiting. */
function judge(
  light: Light,
  state: GameState,
  now: number,
  hands: Hand[],
  history: Record<string, Sample[]>,
  head: Point | null,
): Judgement | null {
  if (light.kind === "dodge") {
    if (now < light.hitAt) return null;
    // Without a visible head the dodge cannot be confirmed, so it counts as hit.
    const dodged = head !== null && !isInside(head, light, state.aspect, 0);
    return dodged ? "dodge" : "miss";
  }
  const delta = now - light.hitAt;
  const hitter =
    Math.abs(delta) <= GOOD_MS &&
    hands.find(
      (hand) =>
        isInside(hand, light, state.aspect, state.pointerRadius) &&
        (state.settings.mode === "hobby" ||
          isPunch(history[hand.id], hand, now, state.aspect)),
    );
  if (hitter) return Math.abs(delta) <= PERFECT_MS ? "perfect" : "good";
  return delta > GOOD_MS ? "miss" : null;
}

function makeLight(
  state: GameState,
  id: number,
  spawnAt: number,
  hitAt: number,
  side: Note["side"],
  random: () => number,
  head: Point | null,
): Light {
  // A red light appears where the head is now, so the player has to move it away.
  if (state.settings.difficulty === "hard" && random() < DODGE_CHANCE) {
    const at = head ?? DEFAULT_HEAD;
    return {
      id,
      spawnAt,
      hitAt,
      kind: "dodge",
      x: at.x,
      y: at.y,
      radius: DODGE_RADIUS,
    };
  }
  return {
    id,
    spawnAt,
    hitAt,
    kind: "hit",
    x: sideX(side, random()),
    y: AREA.minY + random() * (AREA.maxY - AREA.minY),
    radius: LIGHT_RADIUS,
  };
}

export function accuracyOf(counts: Counts): number {
  const total = counts.perfect + counts.good + counts.miss + counts.dodge;
  if (total === 0) return 0;
  return ((counts.perfect + counts.dodge) * 100 + counts.good * 50) / total;
}

export function remainingMs(state: GameState): number {
  return Math.max(0, sessionMs(state) - (state.now - state.startedAt));
}

/** A position across the reachable area, kept to one half for combo notes. */
function sideX(side: Note["side"], roll: number): number {
  const mid = (AREA.minX + AREA.maxX) / 2;
  const [from, to] =
    side === "left"
      ? [AREA.minX, mid - SIDE_MARGIN]
      : side === "right"
        ? [mid + SIDE_MARGIN, AREA.maxX]
        : [AREA.minX, AREA.maxX];
  return from + roll * (to - from);
}

function sessionMs(state: GameState): number {
  return state.song ? state.song.durationMs : state.settings.minutes * 60_000;
}

function isInside(
  hand: Point,
  target: Target,
  aspect: number,
  pointerRadius: number,
): boolean {
  return (
    Math.hypot(hand.x - target.x, (hand.y - target.y) * aspect) <=
    target.radius + pointerRadius
  );
}

function isPunch(
  samples: Sample[] | undefined,
  hand: Hand,
  now: number,
  aspect: number,
): boolean {
  return (samples ?? []).some(
    (s) =>
      s.t < now &&
      now - s.t <= PUNCH_WINDOW_MS &&
      Math.hypot(hand.x - s.x, (hand.y - s.y) * aspect) >= PUNCH_DISTANCE,
  );
}

function recordHands(
  history: Record<string, Sample[]>,
  hands: Hand[],
  now: number,
): Record<string, Sample[]> {
  const next: Record<string, Sample[]> = {};
  for (const hand of hands) {
    const kept = (history[hand.id] ?? []).filter(
      (s) => now - s.t <= PUNCH_WINDOW_MS,
    );
    next[hand.id] = [...kept, { x: hand.x, y: hand.y, t: now }];
  }
  return next;
}

export type Target = { x: number; y: number; radius: number };

/** The on-screen "start" mark the player punches to begin. */
export const START_TARGET: Target = { x: 0.5, y: 0.4, radius: 0.12 };

export function isHandOnTarget(
  hands: Hand[],
  target: Target,
  aspect: number,
  pointerRadius = 0,
): boolean {
  return hands.some((hand) => isInside(hand, target, aspect, pointerRadius));
}
