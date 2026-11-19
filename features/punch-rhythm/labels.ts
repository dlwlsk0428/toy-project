import type { CueSpeed, Difficulty, Judgement, Mode } from "./game";

/** Player-facing words. Keep one term per idea: 원(줄어드는 링), 불빛(목표), 운동(한 판). */

export const CUE_SPEED_LABELS: Record<CueSpeed, string> = {
  slow: "느림",
  normal: "보통",
  fast: "빠름",
};

export const MODE_LABELS: Record<Mode, { label: string; description: string }> =
  {
    hobby: {
      label: "취미",
      description: "타이밍에 맞춰 손을 불빛에 대면 됩니다.",
    },
    pro: {
      label: "선수",
      description: "손을 빠르게 뻗어 불빛을 쳐야 인정됩니다.",
    },
  };

export const DIFFICULTY_LABELS: Record<
  Difficulty,
  { label: string; description: string }
> = {
  normal: { label: "기본", description: "파란 불빛만 치면 됩니다." },
  hard: {
    label: "어려움",
    description:
      "파란 불빛을 치면서, 머리 쪽에 나오는 빨간 불빛은 고개를 움직여 피해야 합니다.",
  },
};

export const JUDGEMENT_LABELS: Record<Judgement, string> = {
  perfect: "완벽",
  good: "좋음",
  miss: "놓침",
  dodge: "회피!",
};

export function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
