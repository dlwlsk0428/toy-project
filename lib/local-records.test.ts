import { beforeEach, describe, expect, test } from "vitest";

import { loadRecords, saveRecord } from "@/lib/local-records";

type Run = { name: string; score: number; at: number };
const byScore = (a: Run, b: Run) => b.score - a.score;

beforeEach(() => localStorage.clear());

describe("기록 저장", () => {
  test("저장한 기록은 다시 불러올 수 있다", () => {
    saveRecord("test", { name: "지나", score: 80, at: 1 }, byScore);
    expect(loadRecords<Run>("test")).toEqual([
      { name: "지나", score: 80, at: 1 },
    ]);
  });

  test("기록은 점수가 높은 순으로 정렬된다", () => {
    saveRecord("test", { name: "가", score: 50, at: 1 }, byScore);
    saveRecord("test", { name: "나", score: 90, at: 2 }, byScore);
    saveRecord("test", { name: "다", score: 70, at: 3 }, byScore);
    expect(loadRecords<Run>("test").map((r) => r.name)).toEqual([
      "나",
      "다",
      "가",
    ]);
  });

  test("최대 20개까지만 남긴다", () => {
    for (let i = 0; i < 25; i++)
      saveRecord("test", { name: `p${i}`, score: i, at: i }, byScore);
    const list = loadRecords<Run>("test");
    expect(list).toHaveLength(20);
    expect(list.at(-1)!.score).toBe(5);
  });

  test("저장된 값이 깨져 있으면 빈 목록으로 본다", () => {
    localStorage.setItem("test", "{not json");
    expect(loadRecords("test")).toEqual([]);
  });

  test("저장 결과로 방금 기록의 순위(1부터)를 돌려준다", () => {
    saveRecord("test", { name: "가", score: 50, at: 1 }, byScore);
    expect(saveRecord("test", { name: "나", score: 90, at: 2 }, byScore)).toBe(
      1,
    );
    expect(saveRecord("test", { name: "다", score: 60, at: 3 }, byScore)).toBe(
      2,
    );
  });
});
