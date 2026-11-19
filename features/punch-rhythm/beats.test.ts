import { describe, expect, test } from "vitest";

import { beatSchedule, detectBeats } from "@/features/punch-rhythm/beats";

const RATE = 8000;

/** A click track: a short decaying thump on every beat, with a little background noise. */
function clickTrack(
  bpm: number,
  firstBeatSec: number,
  seconds: number,
): Float32Array {
  const samples = new Float32Array(RATE * seconds);
  let seed = 1;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.02;
  };
  for (let i = 0; i < samples.length; i++) samples[i] = noise();
  for (let t = firstBeatSec; t < seconds; t += 60 / bpm) {
    const start = Math.round(t * RATE);
    for (let i = 0; i < RATE * 0.05 && start + i < samples.length; i++) {
      samples[start + i] +=
        Math.sin((2 * Math.PI * 60 * i) / RATE) * Math.exp(-i / (RATE * 0.01));
    }
  }
  return samples;
}

describe("박자 분석", () => {
  test.each([
    [120, 0.25],
    [96, 0.6],
    [140, 0.1],
  ])("%i BPM 노래에서 BPM과 첫 박 위치를 찾는다", (bpm, first) => {
    const result = detectBeats(clickTrack(bpm, first, 20), RATE);
    expect(Math.abs(result.bpm - bpm)).toBeLessThan(1.5);
    // The first beat found may be any beat of the track; it must sit on the beat grid.
    const period = 60 / bpm;
    const phase = (((result.firstBeatSec - first) % period) + period) % period;
    expect(Math.min(phase, period - phase)).toBeLessThan(0.03);
  });
});

describe("불빛 박자 목록", () => {
  test("박자가 느리면 매 박마다, 빠르면 두 박마다 불빛을 둔다", () => {
    const slow = beatSchedule({ bpm: 90, firstBeatSec: 0, durationSec: 20 });
    expect(slow[1] - slow[0]).toBeCloseTo(666.7, 0);
    const fast = beatSchedule({ bpm: 120, firstBeatSec: 0, durationSec: 20 });
    expect(fast[1] - fast[0]).toBeCloseTo(1000, 0);
  });

  test("처음 2초 안에는 불빛을 두지 않고, 노래가 끝나기 전까지만 둔다", () => {
    const list = beatSchedule({
      bpm: 120,
      firstBeatSec: 0.25,
      durationSec: 10,
    });
    expect(list[0]).toBeGreaterThanOrEqual(2000);
    expect(list.at(-1)!).toBeLessThan(10_000);
  });

  test("박자 목록은 박자 격자 위에 있다", () => {
    const list = beatSchedule({
      bpm: 120,
      firstBeatSec: 0.25,
      durationSec: 10,
    });
    for (const t of list)
      expect((((t - 250) % 500) + 500) % 500).toBeCloseTo(0, 5);
  });
});
