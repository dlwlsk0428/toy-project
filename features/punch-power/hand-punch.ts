/** A tracked fist in normalized screen coordinates (0..1), with its size when known. */
export type HandPoint = { id: string; x: number; y: number; size?: number };

type Sample = { x: number; y: number; size?: number; t: number };

export type HandPunchState = {
  history: Record<string, Sample[]>;
  cooldownUntil: Record<string, number>;
  /** Fists seen in the previous frame, to notice one vanishing. */
  visible: string[];
  count: number;
};

// Recent positions are compared within this window. It is long enough to bridge the frames
// where a fast fist blurs and the tracker loses it.
const WINDOW_MS = 400;
// This is a just-for-fun bonus, so judging is as generous as it gets: any quick jab,
// and even a fist that blurs out of tracking, counts.
// A punch sideways or up/down: the fist travels this far (in screen widths).
const PUNCH_DISTANCE = 0.02;
// A punch at the camera barely moves on screen, but the fist grows by this factor.
const PUNCH_GROWTH = 1.06;
// The arm pulling back after a punch is not another punch.
const COOLDOWN_MS = 120;

export function createHandPunch(): HandPunchState {
  return { history: {}, cooldownUntil: {}, visible: [], count: 0 };
}

function isPunch(hand: HandPoint, samples: Sample[], aspect: number): boolean {
  return samples.some(
    (s) =>
      Math.hypot(hand.x - s.x, (hand.y - s.y) * aspect) >= PUNCH_DISTANCE ||
      (hand.size !== undefined &&
        s.size !== undefined &&
        s.size > 0 &&
        hand.size / s.size >= PUNCH_GROWTH),
  );
}

/** Feeds one camera frame; `punched` is how many fists threw a punch in this frame. */
export function feedHands(
  state: HandPunchState,
  hands: HandPoint[],
  now: number,
  aspect = 1,
): { state: HandPunchState; punched: number } {
  const recent = (id: string) =>
    (state.history[id] ?? []).filter((s) => now - s.t <= WINDOW_MS);

  // Hands missing from this frame keep their recent samples, so a punch that blurred
  // out of tracking for a moment is still compared with where it started.
  const history: Record<string, Sample[]> = {};
  for (const id of Object.keys(state.history)) {
    const kept = recent(id);
    if (kept.length > 0) history[id] = kept;
  }
  const cooldownUntil = { ...state.cooldownUntil };
  let punched = 0;

  // A fist that vanishes was most likely a blur of a fast punch: count it as a hit.
  const seen = new Set(hands.map((hand) => hand.id));
  for (const id of state.visible) {
    if (seen.has(id) || now < (cooldownUntil[id] ?? 0)) continue;
    punched += 1;
    cooldownUntil[id] = now + COOLDOWN_MS;
    // Its return is not a second punch.
    delete history[id];
  }

  for (const hand of hands) {
    const kept = history[hand.id] ?? [];
    const sample = { x: hand.x, y: hand.y, size: hand.size, t: now };
    const ready = now >= (cooldownUntil[hand.id] ?? 0);
    if (ready && isPunch(hand, kept, aspect)) {
      punched += 1;
      cooldownUntil[hand.id] = now + COOLDOWN_MS;
      // Start fresh so the same swing is not counted again.
      history[hand.id] = [sample];
    } else {
      history[hand.id] = [...kept, sample];
    }
  }

  return {
    state: {
      history,
      cooldownUntil,
      visible: [...seen],
      count: state.count + punched,
    },
    punched,
  };
}
