import { describe, expect, test } from "vitest";

import {
  CHALLENGE_MS,
  createDetector,
  feedSample,
  summarize,
  type Detector,
} from "@/features/punch-power/power";

function feed(samples: [number, number][]): {
  punches: number[];
  detector: Detector;
} {
  let detector = createDetector();
  const punches: number[] = [];
  for (const [t, magnitude] of samples) {
    const result = feedSample(detector, { t, magnitude });
    detector = result.detector;
    if (result.punch !== null) punches.push(result.punch);
  }
  return { punches, detector };
}

describe("펀치 감지", () => {
  test("가속도가 기준을 넘었다가 내려오면 그 사이 가장 큰 값을 세기로 한 번의 펀치로 본다", () => {
    const { punches } = feed([
      [0, 2],
      [20, 18],
      [40, 31],
      [60, 22],
      [80, 3],
    ]);
    expect(punches).toEqual([31]);
  });

  test("팔을 가볍게 움직이는 정도의 가속도는 펀치로 보지 않는다", () => {
    const { punches } = feed([
      [0, 3],
      [20, 9],
      [40, 6],
      [60, 2],
    ]);
    expect(punches).toEqual([]);
  });

  test("펀치 직후 되튐은 따로 세지 않는다", () => {
    const { punches } = feed([
      [0, 25],
      [20, 2],
      [100, 20],
      [120, 2],
    ]);
    expect(punches).toEqual([25]);
  });

  test("잠시 쉬었다 다시 치면 다음 펀치로 센다", () => {
    const { punches } = feed([
      [0, 25],
      [20, 2],
      [500, 20],
      [520, 2],
    ]);
    expect(punches).toEqual([25, 20]);
  });
});

describe("10초 세기 기록", () => {
  test("챌린지는 10초다", () => {
    expect(CHALLENGE_MS).toBe(10_000);
  });

  test("가장 센 한 방, 친 횟수, 평균 세기를 G 단위로 낸다", () => {
    // 9.81 m/s² = 1G
    expect(summarize([9.81, 29.43, 19.62])).toEqual({
      count: 3,
      maxG: 3,
      averageG: 2,
    });
  });

  test("한 번도 치지 않았으면 모두 0이다", () => {
    expect(summarize([])).toEqual({ count: 0, maxG: 0, averageG: 0 });
  });
});
