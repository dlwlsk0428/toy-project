/** A tracked fist in normalized screen coordinates (0..1). */
export type HandPoint = { id: string; x: number; y: number };

type Sample = { x: number; y: number; t: number };

export type HandPunchState = {
  history: Record<string, Sample[]>;
  cooldownUntil: Record<string, number>;
  count: number;
};

// A punch is a fist that travels this far (in screen widths) within WINDOW_MS.
const WINDOW_MS = 200;
const PUNCH_DISTANCE = 0.08;
// The arm pulling back after a punch is not another punch.
const COOLDOWN_MS = 250;

export function createHandPunch(): HandPunchState {
  return { history: {}, cooldownUntil: {}, count: 0 };
}

/** Feeds one camera frame; `punched` is how many fists threw a punch in this frame. */
export function feedHands(
  state: HandPunchState,
  hands: HandPoint[],
  now: number,
  aspect = 1,
): { state: HandPunchState; punched: number } {
  const history: Record<string, Sample[]> = {};
  const cooldownUntil = { ...state.cooldownUntil };
  let punched = 0;

  for (const hand of hands) {
    const kept = (state.history[hand.id] ?? []).filter(
      (s) => now - s.t <= WINDOW_MS,
    );
    const ready = now >= (cooldownUntil[hand.id] ?? 0);
    const moved = kept.some(
      (s) =>
        Math.hypot(hand.x - s.x, (hand.y - s.y) * aspect) >= PUNCH_DISTANCE,
    );
    if (ready && moved) {
      punched += 1;
      cooldownUntil[hand.id] = now + COOLDOWN_MS;
      // Start fresh so the same swing is not counted again.
      history[hand.id] = [{ x: hand.x, y: hand.y, t: now }];
    } else {
      history[hand.id] = [...kept, { x: hand.x, y: hand.y, t: now }];
    }
  }

  return {
    state: { history, cooldownUntil, count: state.count + punched },
    punched,
  };
}
