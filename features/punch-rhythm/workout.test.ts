import { describe, expect, test } from "vitest";

import { DEFAULT_SETTINGS } from "./game";
import {
  compareWithHistory,
  estimateKcal,
  gradeOf,
  recommendSettings,
  streakDays,
  todayCount,
  type Session,
} from "./workout";

const DAY = 24 * 60 * 60 * 1000;
const NOON = new Date(2026, 5, 10, 12).getTime();

const session = (at: number, accuracy = 70): Session => ({
  at,
  accuracy,
  punches: 10,
  activeMs: 60_000,
  maxCombo: 5,
  label: "",
});

describe("workout", () => {
  test("연속 운동일은 오늘부터 거꾸로 센다", () => {
    const sessions = [session(NOON - 2 * DAY), session(NOON - DAY), session(NOON)];
    expect(streakDays(sessions, NOON)).toBe(3);
  });

  test("오늘 아직 안 했으면 어제까지의 연속을 보여 준다", () => {
    const sessions = [session(NOON - 2 * DAY), session(NOON - DAY)];
    expect(streakDays(sessions, NOON)).toBe(2);
  });

  test("하루를 건너뛰면 연속이 끊긴다", () => {
    expect(streakDays([session(NOON - 3 * DAY), session(NOON)], NOON)).toBe(1);
  });

  test("오늘 운동 횟수를 센다", () => {
    expect(todayCount([session(NOON - DAY), session(NOON), session(NOON + 1000)], NOON)).toBe(2);
  });

  test("칼로리는 시간에 비례하는 추정치다", () => {
    expect(estimateKcal(180_000)).toBe(18);
  });

  test("정확도로 등급을 나눈다", () => {
    expect([95, 75, 10].map(gradeOf)).toEqual(["챔피언", "스파링", "워밍업"]);
  });

  test("직전 기록과의 차이와 최고 기록 여부를 돌려준다", () => {
    const before = [session(1, 80), session(2, 60)];
    expect(compareWithHistory(before, 70)).toEqual({ delta: 10, best: false });
    expect(compareWithHistory(before, 90)).toEqual({ delta: 30, best: true });
    expect(compareWithHistory([], 90)).toEqual({ delta: null, best: false });
  });

  test("정확도가 높으면 속도를, 가장 빠르면 난이도를 올리자고 추천한다", () => {
    expect(recommendSettings(DEFAULT_SETTINGS, 90)?.settings.cueSpeed).toBe("fast");
    const fast = { ...DEFAULT_SETTINGS, cueSpeed: "fast" as const };
    expect(recommendSettings(fast, 90)?.settings.difficulty).toBe("hard");
    expect(recommendSettings({ ...fast, difficulty: "hard" }, 90)).toBeNull();
  });

  test("정확도가 낮으면 속도를 낮추자고 추천하고, 중간이면 추천하지 않는다", () => {
    expect(recommendSettings(DEFAULT_SETTINGS, 30)?.settings.cueSpeed).toBe("slow");
    expect(recommendSettings({ ...DEFAULT_SETTINGS, cueSpeed: "slow" }, 30)).toBeNull();
    expect(recommendSettings(DEFAULT_SETTINGS, 65)).toBeNull();
  });
});
