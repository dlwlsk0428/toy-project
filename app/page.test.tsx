import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("홈 화면은 원 속도·모드·난이도·시간을 기본값으로 보여 주고 시작할 수 있다", () => {
  render(<Home />);

  const pressed = (group: string, name: string) =>
    within(screen.getByRole("group", { name: group })).getByRole("button", { name });

  expect(pressed("원 속도", "보통")).toHaveAttribute("aria-pressed", "true");
  expect(pressed("모드", "취미")).toHaveAttribute("aria-pressed", "true");
  expect(pressed("난이도", "기본")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("운동 시간 (분)")).toHaveValue(3);
  expect(screen.getByRole("button", { name: "카메라 켜고 시작" })).toBeInTheDocument();
});
