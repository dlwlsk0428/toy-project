import { PunchRhythm } from "@/features/punch-rhythm";

import { HomeLogo } from "./_components/home-logo";

/** 링 위 천장 조명: 위에서 떨어지는 빛줄기, 바닥에 고이는 빛, 뒤쪽 링 로프. */
function RingLights() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden"
    >
      {/* 천장에서 퍼지는 은은한 빛 */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_0%,oklch(0.95_0.04_85/0.16),transparent_70%)]" />
      {/* 빛줄기 */}
      <div className="absolute left-1/2 top-0 h-[26rem] w-[44rem] -translate-x-1/2 bg-[linear-gradient(to_bottom,oklch(0.97_0.03_85/0.22),oklch(0.97_0.03_85/0.04)_75%,transparent)] blur-xl [clip-path:polygon(42%_0,58%_0,100%_100%,0_100%)] [mask-image:linear-gradient(to_bottom,black_30%,transparent_85%)]" />
      {/* 로고 아래 바닥에 고인 빛 */}
      <div className="absolute left-1/2 top-[15rem] h-24 w-[36rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,oklch(0.9_0.08_85/0.18),transparent)]" />
      {/* 뒤쪽 링 로프 */}
      <div className="absolute inset-x-0 top-[6.5rem] space-y-6 opacity-40">
        <div className="h-px bg-[linear-gradient(to_right,transparent,oklch(0.62_0.22_27/0.8)_30%,oklch(0.62_0.22_27/0.8)_70%,transparent)]" />
        <div className="h-px bg-[linear-gradient(to_right,transparent,oklch(0.95_0.015_85/0.6)_30%,oklch(0.95_0.015_85/0.6)_70%,transparent)]" />
        <div className="h-px bg-[linear-gradient(to_right,transparent,oklch(0.62_0.17_255/0.8)_30%,oklch(0.62_0.17_255/0.8)_70%,transparent)]" />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center px-4 py-10 sm:px-6">
      <RingLights />
      <div className="flex w-full max-w-4xl flex-col items-center gap-10">
        <HomeLogo className="text-7xl drop-shadow-[0_0_28px_oklch(0.95_0.04_85/0.25)] sm:text-8xl" />
        <PunchRhythm />
      </div>
    </main>
  );
}
