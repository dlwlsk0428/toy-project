import { cn } from "@/lib/utils";

/**
 * Anton 글자 폭에 맞춘 C. 속 빈 자리가 곧 잽을 뻗는 복서 실루엣이고,
 * 뻗은 팔이 오른쪽 벽을 뚫어 C의 열린 쪽이 된다. 벽 밖으로 나온 글러브만 골드로 칠한다.
 */
function BoxerC({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 120"
      aria-hidden="true"
      className={cn(
        "-mr-[0.08em] inline-block h-[0.86em] w-auto align-baseline",
        className,
      )}
    >
      <mask
        id="boxer-c-hole"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="80"
        height="120"
      >
        <rect width="80" height="120" fill="white" />
        <g fill="black" transform="translate(3 6) scale(0.92)">
          {/* 숙인 머리 */}
          <path d="M23 21c0-5 4-9 9-9s8 3 8 8l-1 5-3 4h-8c-3-2-5-5-5-8z" />
          {/* 몸통: 등은 둥글게, 가슴은 앞으로 */}
          <path d="M19 38c3-6 10-8 18-6l5 4-2 14c-1 5-2 9-4 13H23c-3-8-5-17-4-25z" />
          {/* 턱 앞 가드: 팔꿈치에서 턱으로 접어 올린 뒷손 */}
          <path d="M22 42l7 14 13-24-6-3z" />
          <circle cx="39" cy="28" r="5.5" />
          {/* 반바지 */}
          <path d="M22 62h15l3 18-8 2-2-7-3 7-9-2z" />
          {/* 뒷다리와 앞다리, 앞발 쪽으로 체중 */}
          <path d="M19 80l8 1-6 20 4 3H11l2-4zM31 81l8-2 8 21 4 4H38z" />
          {/* 앞으로 곧게 뻗은 잽, 오른쪽 벽을 뚫고 나간다 */}
          <path d="M36 34l34 1v8l-34 2z" />
          {/* 잽이 나가는 C의 입. 안쪽은 팔 굵기, 바깥으로 갈수록 벌어진다 */}
          <path d="M50 35l20-14v40l-20-16z" />
        </g>
      </mask>
      <rect
        width="66"
        height="120"
        rx="24"
        ry="34"
        fill="currentColor"
        mask="url(#boxer-c-hole)"
      />
      {/* 벽 밖으로 튀어나온 글러브 */}
      <rect x="59" y="33" width="16" height="17" rx="6" fill="var(--primary)" />
    </svg>
  );
}

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label="WEB PUNCH RHYTHM"
      className={cn(
        "inline-flex flex-col items-stretch font-logo uppercase leading-none text-foreground select-none",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mb-[0.06em] flex justify-center gap-[0.2em] font-logo-wide text-primary",
          compact ? "text-[0.6em]" : "text-[0.56em]",
        )}
      >
        <span className="inline-block scale-x-125">W</span>
        <span className="inline-block scale-x-125">E</span>
        <span className="inline-block scale-x-125">B</span>
      </span>
      <span
        aria-hidden="true"
        className="flex items-baseline justify-center tracking-[0.02em] text-[1em]"
      >
        PUN<BoxerC />H
      </span>
      <span
        aria-hidden="true"
        className="mt-[0.06em] border-y-[0.04em] border-primary py-[0.04em] text-center text-[0.46em] tracking-[0.34em] pl-[0.34em]"
      >
        RHYTHM
      </span>
    </div>
  );
}
