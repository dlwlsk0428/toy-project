import { describe, expect, test } from "vitest";

import {
  accuracyOf,
  createGame,
  DEFAULT_SETTINGS,
  isHandOnTarget,
  START_TARGET,
  remainingMs,
  stepGame,
  type GameState,
  type Hand,
  type Settings,
} from "@/features/punch-rhythm/game";

// Places every light at the center of the reachable area.
const center = () => 0.5;

function start(settings: Partial<Settings> = {}): GameState {
  return stepGame(
    createGame({ ...DEFAULT_SETTINGS, ...settings }, 0),
    0,
    [],
    center,
  );
}

function onLight(state: GameState, id = "Right"): Hand {
  return { id, x: state.light!.x, y: state.light!.y };
}

function away(id = "Right"): Hand {
  return { id, x: 0, y: 1 };
}

describe("설정", () => {
  test("고르지 않으면 예고 속도는 보통, 모드는 취미, 난이도는 보통, 시간은 3분이다", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      cueSpeed: "normal",
      mode: "hobby",
      difficulty: "normal",
      minutes: 3,
    });
  });

  test.each([
    ["slow", 1500],
    ["normal", 1000],
    ["fast", 700],
  ] as const)(
    "예고 속도 %s의 예고는 %ims 뒤 기준 시점에 맞는다",
    (cueSpeed, ms) => {
      const game = start({ cueSpeed });
      expect(game.light).not.toBeNull();
      expect(game.light!.hitAt - game.light!.spawnAt).toBe(ms);
    },
  );
});

describe("취미 모드 판정", () => {
  test.each([
    [0, "perfect"],
    [100, "perfect"],
    [-100, "perfect"],
    [150, "good"],
    [-200, "good"],
    [200, "good"],
  ] as const)(
    "기준 시점과 %ims 차이로 불빛에 손이 들어오면 %s",
    (delta, expected) => {
      const game = start();
      const hitAt = game.light!.hitAt;
      const next = stepGame(game, hitAt + delta, [onLight(game)], center);
      expect(next.judged.at(-1)?.judgement).toBe(expected);
      expect(next.counts[expected]).toBe(1);
    },
  );

  test("판정 범위가 열리기 전에는 손이 불빛 안에 있어도 판정하지 않는다", () => {
    const game = start();
    const next = stepGame(
      game,
      game.light!.hitAt - 300,
      [onLight(game)],
      center,
    );
    expect(next.judged).toHaveLength(0);
    expect(next.light?.id).toBe(game.light!.id);
  });

  test("불빛 밖의 손은 판정하지 않는다", () => {
    const game = start();
    const next = stepGame(game, game.light!.hitAt, [away()], center);
    expect(next.judged).toHaveLength(0);
  });

  test("판정 범위가 끝날 때까지 치지 못하면 Miss가 되고 불빛이 사라진다", () => {
    const game = start();
    const next = stepGame(game, game.light!.hitAt + 201, [away()], center);
    expect(next.judged.at(-1)?.judgement).toBe("miss");
    expect(next.counts.miss).toBe(1);
    expect(next.light).toBeNull();
  });

  test("친 불빛은 사라지고 잠시 뒤 다음 불빛이 나온다", () => {
    const game = start();
    const hit = stepGame(game, game.light!.hitAt, [onLight(game)], center);
    expect(hit.light).toBeNull();
    const later = stepGame(hit, game.light!.hitAt + 1000, [], center);
    expect(later.light).not.toBeNull();
    expect(later.light!.id).not.toBe(game.light!.id);
  });
});

describe("선수 모드 판정", () => {
  test("손이 천천히 불빛에 들어오면 친 것으로 보지 않는다", () => {
    const game = start({ mode: "pro" });
    const { x, y, hitAt } = game.light!;
    // Hand already rests near the light, then drifts in by a tiny amount.
    let state = stepGame(
      game,
      hitAt - 150,
      [{ id: "Right", x: x + 0.1, y }],
      center,
    );
    state = stepGame(
      state,
      hitAt - 50,
      [{ id: "Right", x: x + 0.095, y }],
      center,
    );
    state = stepGame(state, hitAt, [{ id: "Right", x, y }], center);
    expect(state.judged).toHaveLength(0);
  });

  test("손을 빠르게 뻗어 불빛에 들어오면 판정한다", () => {
    const game = start({ mode: "pro" });
    const { x, y, hitAt } = game.light!;
    let state = stepGame(
      game,
      hitAt - 150,
      [{ id: "Right", x: x + 0.3, y }],
      center,
    );
    state = stepGame(state, hitAt, [{ id: "Right", x, y }], center);
    expect(state.judged.at(-1)?.judgement).toBe("perfect");
  });

  test("같은 느린 동작을 취미 모드에서 하면 친 것으로 인정한다", () => {
    const game = start({ mode: "hobby" });
    const { x, y, hitAt } = game.light!;
    let state = stepGame(
      game,
      hitAt - 150,
      [{ id: "Right", x: x + 0.1, y }],
      center,
    );
    state = stepGame(
      state,
      hitAt - 50,
      [{ id: "Right", x: x + 0.095, y }],
      center,
    );
    state = stepGame(state, hitAt, [{ id: "Right", x, y }], center);
    expect(state.judged.at(-1)?.judgement).toBe("perfect");
  });
});

describe("한 번의 운동", () => {
  test("3분이 지나면 끝나고 더 이상 불빛이 나오지 않는다", () => {
    const game = start();
    expect(remainingMs(game)).toBe(180_000);
    const ended = stepGame(game, 180_000, [], center);
    expect(ended.ended).toBe(true);
    expect(ended.light).toBeNull();
    expect(remainingMs(ended)).toBe(0);
  });

  test("끝나기 전에는 남은 시간이 줄어든다", () => {
    const game = start();
    expect(remainingMs(stepGame(game, 60_000, [], center))).toBe(120_000);
  });
});

describe("정확도", () => {
  test("Perfect는 100%, Good은 50%, Miss는 0%로 쳐서 평균을 낸다", () => {
    expect(accuracyOf({ perfect: 2, good: 1, miss: 1, dodge: 0 })).toBe(62.5);
  });

  test("회피는 Perfect와 같이 100%로 친다", () => {
    expect(accuracyOf({ perfect: 1, good: 0, miss: 1, dodge: 2 })).toBe(75);
  });

  test("불빛이 하나도 없었으면 0%다", () => {
    expect(accuracyOf({ perfect: 0, good: 0, miss: 0, dodge: 0 })).toBe(0);
  });
});

describe("시작 표시", () => {
  test("손이 시작 표시 안에 들어오면 친 것으로 본다", () => {
    const { x, y } = START_TARGET;
    expect(isHandOnTarget([{ id: "Left", x, y }], START_TARGET, 0.75)).toBe(
      true,
    );
  });

  test("손이 시작 표시 밖에 있거나 손이 없으면 치지 않은 것이다", () => {
    expect(
      isHandOnTarget([{ id: "Left", x: 0.05, y: 0.9 }], START_TARGET, 0.75),
    ).toBe(false);
    expect(isHandOnTarget([], START_TARGET, 0.75)).toBe(false);
  });

  test("세로 거리도 화면 너비 기준으로 잰다", () => {
    const { x, y, radius } = START_TARGET;
    // Just outside vertically on a 4:3 screen: radius / aspect is the edge in height units.
    const hand = { id: "Left", x, y: y + (radius / 0.75) * 1.1 };
    expect(isHandOnTarget([hand], START_TARGET, 0.75)).toBe(false);
    expect(isHandOnTarget([hand], START_TARGET, 0.5)).toBe(true);
  });
});

describe("포인터 크기", () => {
  test("포인터가 크면 불빛 가장자리 밖이라도 포인터가 닿으면 친 것으로 본다", () => {
    const small = stepGame(
      createGame(DEFAULT_SETTINGS, 0, 1, 0),
      0,
      [],
      center,
    );
    const big = stepGame(
      createGame(DEFAULT_SETTINGS, 0, 1, 0.05),
      0,
      [],
      center,
    );
    const { x, y, radius, hitAt } = small.light!;
    const hand = { id: "Right", x: x + radius + 0.03, y };
    expect(stepGame(small, hitAt, [hand], center).judged).toHaveLength(0);
    expect(stepGame(big, hitAt, [hand], center).judged.at(-1)?.judgement).toBe(
      "perfect",
    );
  });

  test("시작 표시도 포인터 크기만큼 넓게 닿는다", () => {
    const { x, y, radius } = START_TARGET;
    const hand = { id: "Left", x: x + radius + 0.03, y };
    expect(isHandOnTarget([hand], START_TARGET, 1, 0)).toBe(false);
    expect(isHandOnTarget([hand], START_TARGET, 1, 0.05)).toBe(true);
  });
});

describe("운동 시간", () => {
  test("고른 분만큼 지나면 끝난다", () => {
    const game = start({ minutes: 1 });
    expect(remainingMs(game)).toBe(60_000);
    expect(stepGame(game, 59_999, [], center).ended).toBe(false);
    expect(stepGame(game, 60_000, [], center).ended).toBe(true);
  });
});

describe("어려움 난이도", () => {
  // The first roll decides red or blue; low rolls make a red light.
  const red = () => 0.1;
  const head = { x: 0.4, y: 0.3 };

  function startHard(): GameState {
    return stepGame(
      createGame({ ...DEFAULT_SETTINGS, difficulty: "hard" }, 0),
      0,
      [],
      red,
      head,
    );
  }

  test("보통 난이도에서는 빨간 불빛이 나오지 않는다", () => {
    const game = stepGame(createGame(DEFAULT_SETTINGS, 0), 0, [], red, head);
    expect(game.light?.kind).toBe("hit");
  });

  test("어려움에서는 빨간 불빛이 머리 위치에 나온다", () => {
    const game = startHard();
    expect(game.light).toMatchObject({ kind: "dodge", x: head.x, y: head.y });
  });

  test("어려움에서도 파란 불빛이 나온다", () => {
    const game = stepGame(
      createGame({ ...DEFAULT_SETTINGS, difficulty: "hard" }, 0),
      0,
      [],
      () => 0.9,
      head,
    );
    expect(game.light?.kind).toBe("hit");
  });

  test("예고 원이 맞는 순간 머리가 빨간 불빛 안에 있으면 Miss다", () => {
    const game = startHard();
    const next = stepGame(game, game.light!.hitAt, [], red, head);
    expect(next.judged.at(-1)?.judgement).toBe("miss");
    expect(next.counts.miss).toBe(1);
  });

  test("그 순간 머리가 빨간 불빛 밖으로 피했으면 회피다", () => {
    const game = startHard();
    const next = stepGame(game, game.light!.hitAt, [], red, { x: 0.8, y: 0.3 });
    expect(next.judged.at(-1)?.judgement).toBe("dodge");
    expect(next.counts.dodge).toBe(1);
  });

  test("머리가 안 보이는 채로 순간이 지나면 회피로 보지 않고 Miss다", () => {
    const game = startHard();
    const next = stepGame(game, game.light!.hitAt, [], red, null);
    expect(next.judged.at(-1)?.judgement).toBe("miss");
  });

  test("빨간 불빛은 손으로 쳐도 판정하지 않는다", () => {
    const game = startHard();
    const hand = { id: "Right", x: head.x, y: head.y };
    const next = stepGame(game, game.light!.hitAt - 50, [hand], red, {
      x: 0.8,
      y: 0.3,
    });
    expect(next.judged).toHaveLength(0);
  });
});
