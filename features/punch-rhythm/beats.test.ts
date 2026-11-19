import { describe, expect, test } from "vitest";

import {
  detectBeats,
  noteSchedule,
  sliceSong,
  type Note,
} from "@/features/punch-rhythm/beats";

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

test("앞에 무음이 있으면 음악이 시작되는 시각을 함께 찾는다", () => {
  const track = clickTrack(120, 0.25, 20);
  track.fill(0, 0, RATE * 5);
  const { startSec } = detectBeats(track, RATE);
  expect(startSec).toBeGreaterThan(4.9);
  expect(startSec).toBeLessThan(5.3);
});

function gaps(notes: Note[]): number[] {
  return notes.slice(1).map((n, i) => n.at - notes[i].at);
}

describe("노트 목록", () => {
  test("100 BPM이면 노트는 8분음표(0.3초) 격자 위에 있다", () => {
    const notes = noteSchedule({
      bpm: 100,
      firstBeatSec: 0.25,
      durationSec: 30,
      startSec: 0,
    });
    expect(notes.length).toBeGreaterThan(10);
    for (const n of notes) {
      const r = (((n.at - 250) % 300) + 300) % 300;
      // Distance to the nearest grid line, so 299.999… counts as on the grid.
      expect(Math.min(r, 300 - r)).toBeLessThan(0.001);
    }
  });

  test.each([100, 128, 150, 175])(
    "%i BPM에서도 불빛 사이는 0.3초보다 가깝지 않다",
    (bpm) => {
      const notes = noteSchedule({
        bpm,
        firstBeatSec: 0,
        durationSec: 60,
        startSec: 0,
      });
      for (const g of gaps(notes)) expect(g).toBeGreaterThanOrEqual(299);
    },
  );

  test("여러 마디에 서로 다른 리듬 패턴이 섞인다", () => {
    const notes = noteSchedule({
      bpm: 100,
      firstBeatSec: 0,
      durationSec: 60,
      startSec: 0,
    });
    expect(new Set(gaps(notes).map((g) => Math.round(g))).size).toBeGreaterThan(
      1,
    );
  });

  test("가까이 붙은 두 불빛(원투 콤보)은 왼쪽 다음 오른쪽으로 나온다", () => {
    const notes = noteSchedule({
      bpm: 100,
      firstBeatSec: 0,
      durationSec: 60,
      startSec: 0,
    });
    const combos = notes
      .slice(1)
      .map((n, i) => [notes[i], n])
      .filter(([a, b]) => b.at - a.at < 500);
    expect(combos.length).toBeGreaterThan(0);
    for (const [a, b] of combos)
      expect([a.side, b.side]).toEqual(["left", "right"]);
  });

  test("같은 노래는 다시 해도 같은 패턴이 나온다", () => {
    const song = { bpm: 128, firstBeatSec: 0.1, durationSec: 30, startSec: 0 };
    expect(noteSchedule(song)).toEqual(noteSchedule(song));
  });

  test("처음 2초와 음악이 시작되기 전에는 두지 않고, 노래가 끝나기 전까지만 둔다", () => {
    const early = noteSchedule({
      bpm: 120,
      firstBeatSec: 0.25,
      durationSec: 10,
      startSec: 0,
    });
    expect(early[0].at).toBeGreaterThanOrEqual(2000);
    expect(early.at(-1)!.at).toBeLessThan(10_000);
    const late = noteSchedule({
      bpm: 120,
      firstBeatSec: 0.25,
      durationSec: 20,
      startSec: 5,
    });
    expect(late[0].at).toBeGreaterThanOrEqual(5000);
  });
});

describe("노래 구간", () => {
  const notes: Note[] = [
    1000, 3000, 10_000, 12_500, 13_000, 20_000, 40_000,
  ].map((at) => ({
    at,
    side: "any",
  }));

  test("구간 안의 노트만 남기고 구간 시작을 0초로 옮긴다", () => {
    const part = sliceSong({ notes, durationMs: 60_000 }, 10_000, 15_000);
    expect(part.durationMs).toBe(15_000);
    // 10 000 falls in the first 2 s lead-in of the section, so it is dropped.
    expect(part.notes.map((n) => n.at)).toEqual([2500, 3000, 10_000]);
  });

  test("구간이 노래 끝을 넘으면 노래 끝에서 멈춘다", () => {
    const part = sliceSong({ notes, durationMs: 45_000 }, 30_000, 60_000);
    expect(part.durationMs).toBe(15_000);
    expect(part.notes.map((n) => n.at)).toEqual([10_000]);
  });
});
