// Analysis frames of 10 ms: fine enough for beat timing, cheap enough for a whole song.
const FRAME_SEC = 0.01;
const MIN_BPM = 70;
const MAX_BPM = 180;
// Most songs sit near this tempo; it breaks ties between a tempo and its half or double.
const TYPICAL_BPM = 120;

// Lights come at least this far apart (a quick one-two), so punching stays possible.
const MIN_GAP_SEC = 0.3;
// A hit at least this share of the loudest one marks where the music starts.
const START_SHARE = 0.2;
// No lights in the first seconds, so the first cue has time to appear.
const LEAD_IN_SEC = 2;

/**
 * Finds a song's tempo and the time of one beat from its (mono) samples.
 * Feed it low-passed samples so kick drums dominate.
 */
export function detectBeats(
  samples: Float32Array,
  sampleRate: number,
): { bpm: number; firstBeatSec: number; startSec: number } {
  const onset = onsetStrength(samples, sampleRate);

  // Tempo: the beat period at which the onset curve best matches itself shifted.
  const minLag = Math.floor(60 / MAX_BPM / FRAME_SEC);
  const maxLag = Math.ceil(60 / MIN_BPM / FRAME_SEC);
  const corr = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < onset.length; i++)
      sum += onset[i] * onset[i + lag];
    corr[lag] = sum;
  }
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * FRAME_SEC);
    const weight = Math.exp(-0.5 * (Math.log2(bpm / TYPICAL_BPM) / 0.9) ** 2);
    if (corr[lag] * weight > bestScore) {
      bestScore = corr[lag] * weight;
      bestLag = lag;
    }
  }
  // Refine between whole frames with a parabola through the peak and its neighbours.
  const [a, b, c] = [corr[bestLag - 1], corr[bestLag], corr[bestLag + 1]];
  const bend = a - 2 * b + c;
  const period = bestLag + (bend !== 0 ? (0.5 * (a - c)) / bend : 0);

  // Phase: the offset whose beat grid lands on the most onset energy.
  let bestOffset = 0;
  let bestPhase = -Infinity;
  for (let offset = 0; offset < period; offset++) {
    let sum = 0;
    for (let t = offset; t < onset.length; t += period)
      sum += onset[Math.round(t)] ?? 0;
    if (sum > bestPhase) {
      bestPhase = sum;
      bestOffset = offset;
    }
  }

  // Where the music starts: the first hit that is clearly louder than the silence.
  let peak = 0;
  for (const value of onset) peak = Math.max(peak, value);
  const startFrame = onset.findIndex((value) => value >= peak * START_SHARE);

  return {
    bpm: 60 / (period * FRAME_SEC),
    firstBeatSec: bestOffset * FRAME_SEC,
    startSec: Math.max(0, startFrame) * FRAME_SEC,
  };
}

/** Rise in loudness per frame; peaks where a drum hits. */
function onsetStrength(
  samples: Float32Array,
  sampleRate: number,
): Float64Array {
  const hop = Math.max(1, Math.round(sampleRate * FRAME_SEC));
  const frames = Math.floor(samples.length / hop);
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++)
      sum += samples[i] * samples[i];
    energy[f] = sum;
  }
  const onset = new Float64Array(frames);
  for (let f = 1; f < frames; f++)
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  return onset;
}

export type Note = {
  /** When the light should be hit, in ms from the song's start. */
  at: number;
  /** Combo notes go to one side of the screen so the two hands alternate. */
  side: "left" | "right" | "any";
};

// Rhythm patterns for one bar of 8 slots (eighth notes at a normal tempo); 1 = a light.
const PATTERNS = [
  [1, 0, 0, 0, 1, 0, 0, 0], // two straight punches
  [1, 0, 1, 0, 1, 0, 1, 0], // one on every beat
  [1, 0, 0, 0, 1, 1, 0, 0], // one-two on the third beat
  [1, 1, 0, 0, 1, 0, 0, 0], // one-two on the first beat
  [1, 0, 1, 0, 1, 1, 0, 0], // mixed
];
// Two lights closer than this form a combo (left then right).
const COMBO_GAP_SEC = 0.5;

/**
 * Where lights go in a song: a rhythm pattern per bar on the song's beat grid.
 * One slot is an eighth note, or longer when the song is too fast to punch that often.
 * The same song always gets the same patterns.
 */
export function noteSchedule(song: {
  bpm: number;
  firstBeatSec: number;
  durationSec: number;
  startSec: number;
}): Note[] {
  const beat = 60 / song.bpm;
  const slot = [beat / 2, beat, beat * 2, beat * 4].find(
    (s) => s >= MIN_GAP_SEC - 1e-9,
  )!;
  const barSec = slot * 8;
  const random = seededRandom(Math.round(song.bpm * 100));
  const from = Math.max(LEAD_IN_SEC, song.startSec);

  // Start the grid at the bar line just before 0 so bars stay aligned with the first beat.
  const origin =
    song.firstBeatSec - Math.ceil(song.firstBeatSec / barSec) * barSec;
  const times: number[] = [];
  let pattern = PATTERNS[0];
  for (let i = 0; ; i++) {
    const t = origin + i * slot;
    if (t >= song.durationSec) break;
    if (i % 8 === 0) pattern = PATTERNS[Math.floor(random() * PATTERNS.length)];
    if (pattern[i % 8] && t >= from) times.push(t);
  }

  const notes: Note[] = times.map((t) => ({ at: t * 1000, side: "any" }));
  for (let i = 1; i < notes.length; i++) {
    if (
      times[i] - times[i - 1] < COMBO_GAP_SEC &&
      notes[i - 1].side === "any"
    ) {
      notes[i - 1].side = "left";
      notes[i].side = "right";
    }
  }
  return notes;
}

/** A small deterministic random generator (mulberry32). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
