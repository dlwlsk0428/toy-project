"use client";

import { useEffect, useRef, useState } from "react";

import { Fanfare } from "@/components/fanfare";
import { RecordBoard } from "@/components/record-board";
import { Button } from "@/components/ui/button";

import { createHandPunch, feedHands, type HandPoint } from "./hand-punch";
import { CHALLENGE_MS } from "./power";
import {
  CRUMPLE_FULL_HITS,
  crumpleLevel,
  PunchTarget,
} from "./punch-target";

/** Finds fists in camera frames. The page hands one in, so this module needs no tracker of its own. */
export type HandSource = {
  detect: (video: HTMLVideoElement, now: number) => { hands: HandPoint[] };
  close: () => void;
};

type Stage =
  | { name: "starting" }
  | { name: "error"; message: string }
  | { name: "ready" }
  | { name: "countdown"; left: number }
  | { name: "playing"; endsAt: number }
  | { name: "result"; count: number };

const COUNTDOWN_S = 3;
const HAND_RECORDS_KEY = "punch:hand-records";

type HandRecord = { name: string; at: number; count: number };

/** Punch as many times as you can in 10 s in front of the webcam; each punch crumples the target. */
export function HandChallenge({
  createHandSource,
  image,
}: {
  createHandSource: () => Promise<HandSource>;
  image: string | null;
}) {
  const [stage, setStage] = useState<Stage>({ name: "starting" });
  const [hits, setHits] = useState(0);
  const [hands, setHands] = useState<HandPoint[]>([]);
  const [now, setNow] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<Stage>(stage);
  const counterRef = useRef(createHandPunch());
  useEffect(() => {
    stageRef.current = stage;
  });

  // Camera and hand tracking run for as long as the challenge is open.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let source: HandSource | null = null;
    let frame: number | null = null;
    let stopped = false;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        source = await createHandSource();
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        setStage({ name: "ready" });

        const loop = () => {
          const t = performance.now();
          // The tracker throws on frames without size, e.g. while the stream starts.
          const found =
            video.readyState >= 2 && video.videoWidth > 0
              ? source!.detect(video, t).hands
              : [];
          setHands(found);
          if (stageRef.current.name === "playing") {
            const aspect = video.videoHeight / video.videoWidth || 1;
            const { state, punched } = feedHands(
              counterRef.current,
              found,
              t,
              aspect,
            );
            counterRef.current = state;
            if (punched > 0) setHits(state.count);
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (error) {
        if (stopped) return;
        const denied =
          error instanceof DOMException && error.name === "NotAllowedError";
        setStage({
          name: "error",
          message: denied
            ? "웹캠 권한이 거부되었습니다. 주소창의 카메라 아이콘에서 허용해 주세요."
            : "카메라나 손 인식을 준비하지 못했습니다. 카메라 연결과 인터넷을 확인해 주세요.",
        });
      }
    })();

    return () => {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      source?.close();
    };
  }, [createHandSource]);

  // Countdown, then the 10-second timer.
  useEffect(() => {
    if (stage.name === "countdown") {
      const id = window.setTimeout(() => {
        setStage(
          stage.left > 1
            ? { name: "countdown", left: stage.left - 1 }
            : { name: "playing", endsAt: Date.now() + CHALLENGE_MS },
        );
      }, 1000);
      return () => window.clearTimeout(id);
    }
    if (stage.name === "playing") {
      const id = window.setInterval(() => {
        const t = Date.now();
        setNow(t);
        if (t >= stage.endsAt) {
          setStage({ name: "result", count: counterRef.current.count });
        }
      }, 100);
      return () => window.clearInterval(id);
    }
  }, [stage]);

  const begin = () => {
    counterRef.current = createHandPunch();
    setHits(0);
    setStage({ name: "countdown", left: COUNTDOWN_S });
  };

  const secondsLeft =
    stage.name === "playing"
      ? Math.max(0, Math.ceil((stage.endsAt - now) / 1000))
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_30%,oklch(0.3_0.04_255),oklch(0.14_0.015_255))] p-6">
        <PunchTarget
          image={image}
          hits={hits}
          className="mx-auto w-full max-w-64"
        />

        {/* The camera as a small mirror in the corner, with the fists it sees. */}
        <div className="absolute top-2 right-2 aspect-[4/3] w-28 overflow-hidden rounded-lg border border-white/20 bg-black">
          <video
            ref={videoRef}
            className="size-full -scale-x-100 object-cover"
            playsInline
            muted
          />
          {hands.map((hand, i) => (
            <span
              key={`${hand.id}-${i}`}
              className="absolute size-3 -translate-1/2 rounded-full border-2 border-primary bg-white/70"
              style={{ left: `${hand.x * 100}%`, top: `${hand.y * 100}%` }}
            />
          ))}
        </div>

        <div className="absolute top-2 left-3 flex flex-col">
          <span className="font-heading text-4xl font-semibold tabular-nums text-white [text-shadow:0_2px_8px_#000]">
            {hits}
          </span>
          <span className="text-xs text-white/70">번 쳤습니다</span>
        </div>
        {secondsLeft !== null && (
          <span className="absolute bottom-2 left-3 font-mono text-lg text-white tabular-nums">
            {secondsLeft}초
          </span>
        )}
        {stage.name === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 font-heading text-8xl font-semibold text-white">
            {stage.left}
          </div>
        )}
      </div>

      {stage.name === "starting" && (
        <p className="text-center text-sm text-muted-foreground">
          카메라와 손 인식을 준비하고 있습니다…
        </p>
      )}
      {stage.name === "error" && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {stage.message}
        </p>
      )}
      {stage.name === "ready" && (
        <p className="text-center text-sm text-muted-foreground">
          두 주먹이 오른쪽 위 작은 화면에 보이게 서세요. 10초 동안 주먹을 빠르게
          뻗을 때마다 한 번으로 셉니다.
        </p>
      )}

      {stage.name === "result" && (
        <>
          <Fanfare />
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="친 횟수" value={`${stage.count}번`} />
            <Stat
              label="초당"
              value={`${(stage.count / (CHALLENGE_MS / 1000)).toFixed(1)}번`}
            />
            <Stat
              label="구겨짐"
              value={`${Math.round(crumpleLevel(stage.count) * 100)}%`}
            />
          </dl>
          <p className="text-center text-sm font-medium">
            {crumpleLevel(stage.count) >= 1
              ? "완전히 구겨졌습니다! 속이 시원하네요 😤"
              : `${Math.max(0, CRUMPLE_FULL_HITS - stage.count)}번만 더 치면 완전히 구겨집니다.`}
          </p>
          <RecordBoard<HandRecord>
            key={stage.count}
            storageKey={HAND_RECORDS_KEY}
            makeRecord={(name, at) => ({ name, at, count: stage.count })}
            compare={(a, b) => b.count - a.count || a.at - b.at}
            show={(record) => ({ value: `${record.count}번` })}
          />
        </>
      )}

      {(stage.name === "ready" || stage.name === "result") && (
        <Button size="lg" onClick={begin}>
          {stage.name === "result" ? "다시 하기" : "시작"}
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
