// Analysis frames of 10 ms: fine enough for beat timing, cheap enough for a whole song.
const FRAME_SEC = 0.01;
const MIN_BPM = 70;
const MAX_BPM = 180;
// Most songs sit near this tempo; it breaks ties between a tempo and its half or double.
const TYPICAL_BPM = 120;

// Lights come at least this far apart, so punching keeps a boxing pace.
const MIN_GAP_SEC = 0.6;
// No lights in the first seconds, so the first cue has time to appear.
const LEAD_IN_SEC = 2;

/**
 * Finds a song's tempo and the time of one beat from its (mono) samples.
 * Feed it low-passed samples so kick drums dominate.
 */
export function detectBeats(
  samples: Float32Array,
  sampleRate: number,
): { bpm: number; firstBeatSec: number } {
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

  return {
    bpm: 60 / (period * FRAME_SEC),
    firstBeatSec: bestOffset * FRAME_SEC,
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

/**
 * When lights should be hit (ms from the song's start): on every beat, or every
 * second or fourth beat when the tempo is too fast to punch on each one.
 */
export function beatSchedule(song: {
  bpm: number;
  firstBeatSec: number;
  durationSec: number;
}): number[] {
  const beat = 60 / song.bpm;
  const step = beat >= MIN_GAP_SEC ? 1 : beat * 2 >= MIN_GAP_SEC ? 2 : 4;
  const gap = beat * step;
  let t = song.firstBeatSec;
  while (t < LEAD_IN_SEC) t += gap;
  const times: number[] = [];
  for (; t < song.durationSec; t += gap) times.push(t * 1000);
  return times;
}
