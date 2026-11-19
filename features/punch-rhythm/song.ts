import { beatSchedule, detectBeats } from "./beats";
import type { Song } from "./game";

// Kick drums live below this frequency, so the beat stands out after filtering.
const KICK_CUTOFF_HZ = 150;
// Analyse at a low rate: it is fast and still precise to a few milliseconds.
const ANALYSIS_RATE = 11025;

export type LoadedSong = Song & {
  name: string;
  bpm: number;
  buffer: AudioBuffer;
};

/** Reads an audio file the player picked and finds where the lights should land. */
export async function loadSong(file: File): Promise<LoadedSong> {
  const data = await file.arrayBuffer();
  const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(
    data,
  );

  const length = Math.ceil(buffer.duration * ANALYSIS_RATE);
  const offline = new OfflineAudioContext(1, length, ANALYSIS_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  const lowpass = offline.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = KICK_CUTOFF_HZ;
  source.connect(lowpass).connect(offline.destination);
  source.start();
  const filtered = await offline.startRendering();

  const { bpm, firstBeatSec } = detectBeats(
    filtered.getChannelData(0),
    ANALYSIS_RATE,
  );
  return {
    name: file.name.replace(/\.[^.]+$/, ""),
    bpm,
    buffer,
    durationMs: buffer.duration * 1000,
    beats: beatSchedule({ bpm, firstBeatSec, durationSec: buffer.duration }),
  };
}

/** Plays a decoded song from the start on an already running audio context. */
export function playSong(
  context: AudioContext,
  buffer: AudioBuffer,
): () => void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return () => {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  };
}
