import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

// The fanfare needs matchMedia and animation APIs that jsdom lacks.
vi.mock("@/components/fanfare", () => ({ Fanfare: () => null }));

import { createGame, DEFAULT_SETTINGS, type GameState } from "./game";
import { ResultCard } from "./result-card";

function finished(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createGame(DEFAULT_SETTINGS, 0),
    now: 180_000,
    ended: true,
    counts: { perfect: 8, good: 2, miss: 0, dodge: 0 },
    judged: Array.from({ length: 10 }, (_, i) => ({
      id: i,
      x: 0.5,
      y: 0.5,
      judgement: "perfect" as const,
      points: 95,
      at: i,
    })),
    maxCombo: 10,
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

test("결과 화면은 등급, 운동량, 추천을 보여 주고 이번 운동을 저장한다", () => {
  const apply = vi.fn();
  render(
    <ResultCard
      game={finished()}
      songName={null}
      onRetry={() => {}}
      onBack={() => {}}
      onApplySettings={apply}
    />,
  );

  expect(screen.getByText("95.0%")).toBeInTheDocument();
  expect(screen.getByText("챔피언")).toBeInTheDocument();
  expect(screen.getByText("첫 운동")).toBeInTheDocument();
  expect(screen.getByText("10번")).toBeInTheDocument();
  expect(screen.getByText("약 18")).toBeInTheDocument();
  expect(screen.getByText(/오늘 1번째 운동 · 1일 연속/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "추천 설정으로 바꾸기" }));
  expect(apply).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, cueSpeed: "fast" });

  const saved = JSON.parse(localStorage.getItem("punch:sessions") ?? "[]");
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ punches: 10, maxCombo: 10 });
});

test("두 번째 운동은 직전 기록과의 차이를 보여 준다", () => {
  localStorage.setItem(
    "punch:sessions",
    JSON.stringify([
      { at: Date.now(), accuracy: 99, punches: 1, activeMs: 1, maxCombo: 1, label: "" },
    ]),
  );
  render(
    <ResultCard
      game={finished()}
      songName={null}
      onRetry={() => {}}
      onBack={() => {}}
      onApplySettings={() => {}}
    />,
  );
  expect(screen.getByText(/직전보다 −4\.0%p/)).toBeInTheDocument();
});
