"use client";

import { useState } from "react";
import {
  CameraIcon,
  HandIcon,
  type LucideIcon,
  SlidersHorizontalIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Slide = { icon: LucideIcon; title: string; body: string };

const SLIDES: Slide[] = [
  {
    icon: CameraIcon,
    title: "카메라 앞에 서기",
    body: "밝은 곳에서 상반신과 두 손이 화면에 보이게 앉거나 서세요. 처음에는 브라우저가 카메라 권한을 물어봅니다.",
  },
  {
    icon: SlidersHorizontalIcon,
    title: "속도·모드·난이도·시간 고르기",
    body: "예고 속도는 불빛이 맞을 때까지 걸리는 시간입니다. 취미 모드는 손을 대기만 해도, 선수 모드는 빠르게 뻗어야 인정됩니다. 어려움 난이도에서는 피해야 하는 빨간 불빛이 섞여 나옵니다. 운동 시간은 분 단위로 정합니다(기본 3분).",
  },
  {
    icon: HandIcon,
    title: "포인터 맞추기",
    body: "손을 든 채로 흰 포인터를 마우스로 끌어 실제 주먹 위치에 맞추세요. 왼손과 오른손을 따로 맞추고 크기도 고른 뒤 위치 조정 완료를 누릅니다.",
  },
  {
    icon: TargetIcon,
    title: "손으로 시작 치기",
    body: "화면 가운데에 나온 시작 표시를 주먹으로 치면 3분 운동이 시작됩니다.",
  },
  {
    icon: ZapIcon,
    title: "원이 맞는 순간 치기",
    body: "파란 불빛 바깥의 원이 줄어들어 불빛과 딱 맞는 순간 치세요. 0.1초 안이면 Perfect, 0.2초 안이면 Good, 놓치면 Miss입니다. 빨간 불빛은 머리 쪽에 나오니, 원이 맞는 순간 고개를 옆으로 움직여 피하세요.",
  },
  {
    icon: TrophyIcon,
    title: "정확도 확인하기",
    body: "정한 시간이 지나면 정확도와 판정별 개수를 보여 줍니다. 회피는 Perfect와 같게 칩니다. 같은 설정으로 다시 하며 기록을 올려 보세요.",
  },
];

export function HowTo() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const Icon = slide.icon;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setIndex(0);
      }}
    >
      <DialogTrigger render={<Button size="lg" variant="outline" />}>
        하는 방법
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-xl bg-primary/10 text-primary">
          <Icon className="size-16" aria-hidden />
          <span className="text-sm font-medium">
            {index + 1} / {SLIDES.length}
          </span>
        </div>
        <DialogHeader>
          <DialogTitle>{slide.title}</DialogTitle>
          <DialogDescription>{slide.body}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {SLIDES.map((s, i) => (
            <span
              key={s.title}
              className={cn(
                "size-2 rounded-full",
                i === index ? "bg-primary" : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIndex(index - 1)}
            disabled={index === 0}
          >
            이전
          </Button>
          <Button
            onClick={() => (isLast ? setOpen(false) : setIndex(index + 1))}
          >
            {isLast ? "시작하러 가기" : "다음"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
