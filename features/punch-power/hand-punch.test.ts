import { describe, expect, test } from "vitest";

import { createHandPunch, feedHands, type HandPoint } from "./hand-punch";

const at = (x: number, size?: number, id = "Right"): HandPoint[] => [
  { id, x, y: 0.5, size },
];

function run(frames: [number, HandPoint[]][]) {
  let state = createHandPunch();
  for (const [t, hands] of frames) state = feedHands(state, hands, t).state;
  return state.count;
}

describe("손 펀치 세기", () => {
  test("주먹이 짧은 시간에 옆으로 크게 움직이면 한 번 친 것으로 센다", () => {
    expect(run([[0, at(0.3)], [100, at(0.33)]])).toBe(1);
  });

  test("카메라 쪽으로 뻗어 주먹이 커지면, 화면상 위치가 그대로여도 센다", () => {
    expect(run([[0, at(0.5, 0.1)], [120, at(0.505, 0.108)]])).toBe(1);
  });

  test("보이던 주먹이 사라지면 친 것으로 세고, 다시 나타나는 것은 따로 세지 않는다", () => {
    expect(run([[0, at(0.3)], [60, []], [120, []], [180, at(0.4)]])).toBe(1);
  });

  test("주먹이 생겼다 사라지기를 반복하면 그때마다 센다", () => {
    expect(
      run([[0, at(0.5)], [50, []], [200, at(0.5)], [250, []], [400, at(0.5)], [450, []]]),
    ).toBe(3);
  });

  test("천천히 움직이거나 조금만 움직이면 세지 않는다", () => {
    expect(run([[0, at(0.3)], [500, at(0.45)]])).toBe(0);
    expect(run([[0, at(0.3, 0.1)], [100, at(0.31, 0.103)]])).toBe(0);
  });

  test("친 직후 팔을 거두는 움직임은 다시 세지 않는다", () => {
    expect(run([[0, at(0.3)], [100, at(0.4)], [200, at(0.3)]])).toBe(1);
  });

  test("쉬었다가 다시 치면 또 센다", () => {
    expect(
      run([[0, at(0.3)], [100, at(0.4)], [500, at(0.4)], [600, at(0.3)]]),
    ).toBe(2);
  });

  test("두 손은 따로 센다", () => {
    const both = (l: number, r: number) => [
      { id: "Left", x: l, y: 0.5 },
      { id: "Right", x: r, y: 0.5 },
    ];
    expect(run([[0, both(0.2, 0.6)], [100, both(0.3, 0.7)]])).toBe(2);
  });
});
