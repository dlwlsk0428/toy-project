import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("홈 화면은 예고 속도와 모드를 기본값(보통, 취미)으로 보여 주고 시작할 수 있다", () => {
  render(<Home />);

  expect(screen.getByRole("button", { name: "보통" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "취미" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "시작" })).toBeInTheDocument();
});
