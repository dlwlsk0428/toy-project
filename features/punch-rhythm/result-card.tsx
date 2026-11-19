"use client";

import { useEffect, useRef, useState } from "react";

import { Fanfare } from "@/components/fanfare";
import { RecordBoard } from "@/components/record-board";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { lastName } from "@/lib/local-records";
import { cn } from "@/lib/utils";

import {
  accuracyOf,
  HEAD_LOST_MS,
  type GameState,
  type Judgement,
  type Settings,
} from "./game";
import {
  CUE_SPEED_LABELS,
  DIFFICULTY_LABELS,
  JUDGEMENT_LABELS,
  MODE_LABELS,
} from "./labels";
import { ShareCardDialog } from "./share-card-dialog";
import {
  compareWithHistory,
  estimateKcal,
  gradeOf,
  loadSessions,
  punchesOf,
  recommendSettings,
  saveSession,
  streakDays,
  todayCount,
  type Session,
} from "./workout";

type RhythmRecord = {
  name: string;
  at: number;
  accuracy: number;
  /** Settings (and song) of the run, as shown to the player. */
  label: string;
};

const RHYTHM_RECORDS_KEY = "punch:rhythm-records";

export function ResultCard({
  game,
  songName,
  onRetry,
  onBack,
  onApplySettings,
}: {
  game: GameState;
  songName: string | null;
  onRetry: () => void;
  onBack: () => void;
  /** Goes back to setup with these settings filled in. */
  onApplySettings: (settings: Settings) => void;
}) {
  const { counts } = game;
  const accuracy = accuracyOf(game.judged);
  const label = [
    CUE_SPEED_LABELS[game.settings.cueSpeed],
    MODE_LABELS[game.settings.mode].label,
    DIFFICULTY_LABELS[game.settings.difficulty].label,
    songName ? `♪ ${songName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const punches = punchesOf(counts);
  const activeMs = Math.max(0, game.now - game.startedAt);
  const kcal = estimateKcal(activeMs);
  const grade = gradeOf(accuracy);

  // Past workouts are read before this one is saved, so "previous" really is the previous one.
  const [before] = useState(loadSessions);
  const [now] = useState(Date.now);
  const current: Session = {
    at: now,
    accuracy,
    punches,
    activeMs,
    maxCombo: game.maxCombo,
    label,
  };
  const savedRef = useRef(false);
  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    saveSession(current);
    // Runs once for this result; `current` is fixed for the card's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { delta, best } = compareWithHistory(before, accuracy);
  const sessionsAfter = [...before, current];
  const todayTimes = todayCount(sessionsAfter, now);
  const streak = streakDays(sessionsAfter, now);
  const recommendation = recommendSettings(game.settings, accuracy);

  const shareData = {
    accuracy,
    grade,
    maxCombo: game.maxCombo,
    punches,
    kcal,
    counts,
    showDodge: game.settings.difficulty === "hard",
    label,
    at: now,
    best,
  };

  return (
    <Card className="w-full max-w-xl">
      <Fanfare />
      <CardHeader>
        <CardTitle>운동 끝!</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">정확도</p>
            <p className="font-heading text-6xl font-semibold tabular-nums text-primary">
              {accuracy.toFixed(1)}%
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 pb-1">
            <span className="rounded-full bg-primary px-3 py-1 font-heading text-lg text-primary-foreground">
              {grade}
            </span>
            {best ? (
              <span className="text-sm font-semibold text-primary">
                최고 기록!
              </span>
            ) : delta !== null ? (
              <span
                className={cn(
                  "text-sm tabular-nums",
                  delta >= 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                직전보다 {delta >= 0 ? "+" : "−"}
                {Math.abs(delta).toFixed(1)}%p
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">첫 운동</span>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {(Object.keys(JUDGEMENT_LABELS) as Judgement[])
            .filter((j) => j !== "dodge" || game.settings.difficulty === "hard")
            .map((j) => (
              <div key={j} className="rounded-lg bg-muted p-3">
                <dt className="text-sm text-muted-foreground">
                  {JUDGEMENT_LABELS[j]}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {counts[j]}
                </dd>
              </div>
            ))}
        </dl>

        <dl
          aria-label="운동량"
          className="grid grid-cols-3 gap-2 text-center text-sm"
        >
          <div className="rounded-lg border p-2">
            <dt className="text-muted-foreground">최대 콤보</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {game.maxCombo}
            </dd>
          </div>
          <div className="rounded-lg border p-2">
            <dt className="text-muted-foreground">친 횟수</dt>
            <dd className="text-xl font-semibold tabular-nums">{punches}번</dd>
          </div>
          <div className="rounded-lg border p-2">
            <dt className="text-muted-foreground">칼로리(추정)</dt>
            <dd className="text-xl font-semibold tabular-nums">약 {kcal}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          오늘 {todayTimes}번째 운동 · {streak}일 연속
        </p>

        {recommendation && (
          <div className="flex flex-col gap-2 rounded-lg bg-primary/10 p-3 text-sm">
            <p>{recommendation.reason}</p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => onApplySettings(recommendation.settings)}
            >
              추천 설정으로 바꾸기
            </Button>
          </div>
        )}

        <RecordBoard<RhythmRecord>
          storageKey={RHYTHM_RECORDS_KEY}
          makeRecord={(name, at) => ({ name, at, accuracy, label })}
          compare={(a, b) => b.accuracy - a.accuracy || a.at - b.at}
          show={(record) => ({
            value: `${record.accuracy.toFixed(1)}%`,
            detail: record.label,
          })}
        />
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button size="lg" className="flex-1" onClick={onRetry}>
          다시 하기
        </Button>
        <ShareCardDialog data={shareData} defaultName={lastName} />
        <Button size="lg" variant="outline" onClick={onBack}>
          설정 바꾸기
        </Button>
      </CardFooter>
    </Card>
  );
}

/** Shown instead of the result when the head was out of sight too long: nothing is saved. */
export function StoppedCard({
  onRetry,
  onBack,
}: {
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>운동 중단</CardTitle>
        <CardDescription>
          얼굴이 {HEAD_LOST_MS / 1000}초 넘게 보이지 않아 운동을 멈췄습니다.
          이번 운동은 기록에 남지 않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          얼굴과 두 손이 함께 화면에 들어오도록 카메라와 거리를 맞춘 뒤 다시
          시작하세요.
        </p>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button size="lg" className="flex-1" onClick={onRetry}>
          다시 하기
        </Button>
        <Button size="lg" variant="outline" onClick={onBack}>
          설정 바꾸기
        </Button>
      </CardFooter>
    </Card>
  );
}
