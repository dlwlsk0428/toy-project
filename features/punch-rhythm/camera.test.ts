import { expect, test } from "vitest";

import { isTooDark } from "@/features/punch-rhythm/camera";

function pixels(rgb: [number, number, number], count = 100): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) data.set([...rgb, 255], i * 4);
  return data;
}

test("가려지거나 꺼진 카메라처럼 거의 검은 화면은 너무 어둡다고 본다", () => {
  expect(isTooDark(pixels([0, 0, 0]))).toBe(true);
  expect(isTooDark(pixels([6, 6, 6]))).toBe(true);
});

test("어두운 방 정도의 화면은 너무 어둡다고 보지 않는다", () => {
  expect(isTooDark(pixels([40, 35, 30]))).toBe(false);
});
