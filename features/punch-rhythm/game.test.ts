import { describe, expect, test } from "vitest";

import {
  accuracyOf,
  createGame,
  DEFAULT_SETTINGS,
  headLostMs,
  isHandOnTarget,
  START_TARGET,
  remainingMs,
  stepGame,
  type GameState,
  type Hand,
  type Settings,
  type Song,
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
  return { id, x: state.lights[0].x, y: state.lights[0].y };
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
      expect(game.lights.length).toBeGreaterThan(0);
      expect(game.lights[0].hitAt - game.lights[0].spawnAt).toBe(ms);
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
      const hitAt = game.lights[0].hitAt;
      const next = stepGame(game, hitAt + delta, [onLight(game)], center);
      expect(next.judged.at(-1)?.judgement).toBe(expected);
      expect(next.counts[expected]).toBe(1);
    },
  );

  test("머리 확인을 켜면 머리가 5초 넘게 안 보일 때 바로 끝나고, 보이면 계속된다", () => {
    const head = { x: 0.5, y: 0.3 };
    let state = createGame(DEFAULT_SETTINGS, 0, 1, 0, null, true);
    state = stepGame(state, 4000, [], center, head);
    state = stepGame(state, 8900, [], center, null);
    expect(state.ended).toBe(false);
    expect(headLostMs(state)).toBe(4900);
    state = stepGame(state, 9000, [], center, null);
    expect(state.ended).toBe(true);
    expect(state.endReason).toBe("head-lost");
  });

  test("머리 확인을 끄면 머리가 안 보여도 시간이 다 될 때까지 계속된다", () => {
    const state = stepGame(start(), 60_000, [], center, null);
    expect(state.ended).toBe(false);
    expect(stepGame(state, 180_000, [], center).endReason).toBe("time");
  });

  test("놓치지 않고 이어 치면 콤보가 쌓이고, 놓치면 0으로 돌아가며 최대 콤보는 남는다", () => {
    let state = start();
    const hitNext = () => {
      state = stepGame(state, state.lights[0].hitAt, [onLight(state)], center);
      state = stepGame(state, state.nextSpawnAt, [], center);
    };
    hitNext();
    hitNext();
    expect(state.combo).toBe(2);
    state = stepGame(state, state.lights[0].hitAt + 300, [], center);
    expect(state.combo).toBe(0);
    expect(state.maxCombo).toBe(2);
  });

  test("판정 범위가 열리기 전에는 손이 불빛 안에 있어도 판정하지 않는다", () => {
    const game = start();
    const next = stepGame(
      game,
      game.lights[0].hitAt - 300,
      [onLight(game)],
      center,
    );
    expect(next.judged).toHaveLength(0);
    expect(next.lights[0]?.id).toBe(game.lights[0].id);
  });

  test("불빛 밖의 손은 판정하지 않는다", () => {
    const game = start();
    const next = stepGame(game, game.lights[0].hitAt, [away()], center);
    expect(next.judged).toHaveLength(0);
  });

  test("판정 범위가 끝날 때까지 치지 못하면 Miss가 되고 불빛이 사라진다", () => {
    const game = start();
    const next = stepGame(game, game.lights[0].hitAt + 201, [away()], center);
    expect(next.judged.at(-1)?.judgement).toBe("miss");
    expect(next.counts.miss).toBe(1);
    expect(next.lights).toHaveLength(0);
  });

  test("친 불빛은 사라지고 잠시 뒤 다음 불빛이 나온다", () => {
    const game = start();
    const hit = stepGame(game, game.lights[0].hitAt, [onLight(game)], center);
    expect(hit.lights).toHaveLength(0);
    const later = stepGame(hit, game.lights[0].hitAt + 1000, [], center);
    expect(later.lights.length).toBeGreaterThan(0);
    expect(later.lights[0].id).not.toBe(game.lights[0].id);
  });
});

describe("선수 모드 판정", () => {
  test("손이 천천히 불빛에 들어오면 친 것으로 보지 않는다", () => {
    const game = start({ mode: "pro" });
    const { x, y, hitAt } = game.lights[0];
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
    const { x, y, hitAt } = game.lights[0];
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
    const { x, y, hitAt } = game.lights[0];
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
    expect(ended.lights).toHaveLength(0);
    expect(remainingMs(ended)).toBe(0);
  });

  test("끝나기 전에는 남은 시간이 줄어든다", () => {
    const game = start();
    expect(remainingMs(stepGame(game, 60_000, [], center))).toBe(120_000);
  });
});

describe("점수와 정확도", () => {
  test.each([
    [0, 100],
    [50, 88],
    [-100, 75],
    [150, 63],
    [200, 50],
  ])("기준 시점과 %ims 차이로 치면 %i점이다", (delta, points) => {
    const game = start();
    const next = stepGame(
      game,
      game.lights[0].hitAt + delta,
      [onLight(game)],
      center,
    );
    expect(next.judged.at(-1)?.points).toBe(points);
  });

  test("Miss는 0점이다", () => {
    const game = start();
    const next = stepGame(game, game.lights[0].hitAt + 201, [away()], center);
    expect(next.judged.at(-1)?.points).toBe(0);
  });

  test("정확도는 불빛마다 받은 점수의 평균이다", () => {
    const judged = [100, 88, 50, 0].map((points, id) => ({
      id,
      x: 0,
      y: 0,
      judgement: "perfect" as const,
      points,
      at: 0,
    }));
    expect(accuracyOf(judged)).toBe(59.5);
  });

  test("불빛이 하나도 없었으면 0%다", () => {
    expect(accuracyOf([])).toBe(0);
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
    const { x, y, radius, hitAt } = small.lights[0];
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
    expect(game.lights[0]?.kind).toBe("hit");
  });

  test("어려움에서는 빨간 불빛이 머리 위치에 나온다", () => {
    const game = startHard();
    expect(game.lights[0]).toMatchObject({
      kind: "dodge",
      x: head.x,
      y: head.y,
    });
  });

  test("어려움에서도 파란 불빛이 나온다", () => {
    const game = stepGame(
      createGame({ ...DEFAULT_SETTINGS, difficulty: "hard" }, 0),
      0,
      [],
      () => 0.9,
      head,
    );
    expect(game.lights[0]?.kind).toBe("hit");
  });

  test("예고 원이 맞는 순간 머리가 빨간 불빛 안에 있으면 Miss다", () => {
    const game = startHard();
    const next = stepGame(game, game.lights[0].hitAt, [], red, head);
    expect(next.judged.at(-1)?.judgement).toBe("miss");
    expect(next.counts.miss).toBe(1);
  });

  test("그 순간 머리가 빨간 불빛 밖으로 피했으면 회피(100점)다", () => {
    const game = startHard();
    const next = stepGame(game, game.lights[0].hitAt, [], red, {
      x: 0.8,
      y: 0.3,
    });
    expect(next.judged.at(-1)?.judgement).toBe("dodge");
    expect(next.judged.at(-1)?.points).toBe(100);
    expect(next.counts.dodge).toBe(1);
  });

  test("머리가 안 보이는 채로 순간이 지나면 회피로 보지 않고 Miss다", () => {
    const game = startHard();
    const next = stepGame(game, game.lights[0].hitAt, [], red, null);
    expect(next.judged.at(-1)?.judgement).toBe("miss");
  });

  test("빨간 불빛은 손으로 쳐도 판정하지 않는다", () => {
    const game = startHard();
    const hand = { id: "Right", x: head.x, y: head.y };
    const next = stepGame(game, game.lights[0].hitAt - 50, [hand], red, {
      x: 0.8,
      y: 0.3,
    });
    expect(next.judged).toHaveLength(0);
  });
});

describe("노래 모드", () => {
  const song: Song = {
    notes: [
      { at: 2000, side: "any" },
      { at: 2500, side: "any" },
      { at: 3000, side: "any" },
    ],
    durationMs: 5000,
  };

  function startSong(): GameState {
    return stepGame(createGame(DEFAULT_SETTINGS, 0, 1, 0, song), 0, [], center);
  }

  test("시작하자마자는 불빛이 없고, 박자 시각보다 예고 시간만큼 먼저 나타난다", () => {
    const game = startSong();
    expect(game.lights).toHaveLength(0);
    const next = stepGame(game, 1000, [], center);
    expect(next.lights.map((l) => l.hitAt)).toEqual([2000]);
    expect(next.lights[0].spawnAt).toBe(1000);
  });

  test("박자가 촘촘하면 불빛 여러 개가 함께 떠 있다", () => {
    let state = startSong();
    state = stepGame(state, 1000, [], center);
    state = stepGame(state, 1500, [], center);
    expect(state.lights.map((l) => l.hitAt)).toEqual([2000, 2500]);
  });

  test("불빛 하나를 쳐도 다른 불빛은 남아 있다", () => {
    let state = startSong();
    state = stepGame(state, 1000, [], center);
    state = stepGame(state, 1500, [], center);
    const first = state.lights[0];
    state = stepGame(
      state,
      2000,
      [{ id: "Right", x: first.x, y: first.y }],
      center,
    );
    expect(state.judged.at(-1)?.judgement).toBe("perfect");
    // The 3000 ms beat also appears now, one cue (1000 ms) before it.
    expect(state.lights.map((l) => l.hitAt)).toEqual([2500, 3000]);
  });

  test("왼쪽·오른쪽 노트는 화면의 그쪽 절반에 나온다", () => {
    const sided: Song = {
      notes: [
        { at: 2000, side: "left" },
        { at: 2300, side: "right" },
      ],
      durationMs: 5000,
    };
    for (const roll of [0, 0.5, 0.99]) {
      let state = stepGame(
        createGame(DEFAULT_SETTINGS, 0, 1, 0, sided),
        0,
        [],
        () => roll,
      );
      state = stepGame(state, 1300, [], () => roll);
      const [left, right] = state.lights;
      expect(left.x).toBeLessThan(0.5);
      expect(right.x).toBeGreaterThan(0.5);
    }
  });

  test("노래가 끝나면 운동이 끝난다", () => {
    const game = startSong();
    expect(remainingMs(game)).toBe(5000);
    expect(stepGame(game, 5000, [], center).ended).toBe(true);
  });
});
