"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  accuracyOf,
  createGame,
  DEFAULT_SETTINGS,
  isHandOnTarget,
  remainingMs,
  START_TARGET,
  stepGame,
  type CueSpeed,
  type GameState,
  type Hand,
  type Judgement,
  type Mode,
  type Settings,
} from "./game";
import { CameraImageError, waitForCameraImage } from "./camera";
import { createHandTracker, type HandTracker } from "./hand-tracker";

type Phase =
  | { name: "setup" }
  | { name: "preparing" }
  | { name: "ready" }
  | { name: "error"; message: string }
  | { name: "playing" }
  | { name: "result"; game: GameState };

const CUE_SPEED_LABELS: Record<CueSpeed, string> = {
  slow: "느림",
  normal: "보통",
  fast: "빠름",
};

const MODE_LABELS: Record<Mode, { label: string; description: string }> = {
  hobby: { label: "취미", description: "타이밍에 맞춰 손을 불빛에 대면 됩니다." },
  pro: { label: "선수", description: "손을 빠르게 뻗어 불빛을 쳐야 인정됩니다." },
};

const JUDGEMENT_LABELS: Record<Judgement, string> = {
  perfect: "Perfect",
  good: "Good",
  miss: "Miss",
};

const FEEDBACK_MS = 600;

export function PunchRhythm() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<Phase>({ name: "setup" });
  const [game, setGame] = useState<GameState | null>(null);
  const [hands, setHands] = useState<Hand[]>([]);
  const [aspect, setAspect] = useState(9 / 16);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const frameRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const startRequestedRef = useRef(false);

  const stopAll = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackerRef.current?.close();
    trackerRef.current = null;
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPhase({ name: "preparing" });
    setGame(null);
    setHands([]);
    try {
      // Store each resource as soon as it exists so stopAll can release it on failure.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      trackerRef.current = await createHandTracker();

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      await waitForCameraImage(video);
      const ratio = video.videoHeight / video.videoWidth;
      setAspect(ratio);

      // The game starts only when the player punches the start mark (or clicks it).
      let state: GameState | null = null;
      startRequestedRef.current = false;
      const loop = () => {
        const now = performance.now();
        // The tracker throws on a frame without size, e.g. while the stream is switching.
        const ready = video.readyState >= 2 && video.videoWidth > 0;
        const seen = (ready && trackerRef.current?.detect(video, now)) || [];
        setHands(seen);
        if (!state) {
          if (!startRequestedRef.current && !isHandOnTarget(seen, START_TARGET, ratio)) {
            frameRef.current = requestAnimationFrame(loop);
            return;
          }
          state = createGame(settings, now, ratio);
          setPhase({ name: "playing" });
        }
        state = stepGame(state, now, seen);
        setGame(state);
        if (state.ended) {
          stopAll();
          setPhase({ name: "result", game: state });
          return;
        }
        frameRef.current = requestAnimationFrame(loop);
      };
      setPhase({ name: "ready" });
      frameRef.current = requestAnimationFrame(loop);
    } catch (error) {
      stopAll();
      setPhase({ name: "error", message: describeError(error) });
    } finally {
      startingRef.current = false;
    }
  }, [settings, stopAll]);

  if (phase.name === "setup" || phase.name === "error") {
    return (
      <SetupCard
        settings={settings}
        onChange={setSettings}
        onStart={start}
        error={phase.name === "error" ? phase.message : null}
      />
    );
  }

  if (phase.name === "result") {
    return (
      <ResultCard
        game={phase.game}
        onRetry={start}
        onBack={() => setPhase({ name: "setup" })}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {CUE_SPEED_LABELS[settings.cueSpeed]} · {MODE_LABELS[settings.mode].label} 모드
        </span>
        <span aria-label="남은 시간" className="font-mono text-lg text-foreground tabular-nums">
          {formatTime(game ? remainingMs(game) : 180_000)}
        </span>
      </div>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl bg-black"
        // Keep the whole play area inside the window, whatever the camera's ratio.
        style={{ aspectRatio: `1 / ${aspect}`, maxWidth: `calc(75vh / ${aspect})` }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 size-full -scale-x-100 object-cover opacity-70"
          playsInline
          muted
        />
        {phase.name === "preparing" && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            손 인식을 준비하고 있습니다…
          </div>
        )}
        {phase.name === "ready" && (
          <StartMark aspect={aspect} onClick={() => (startRequestedRef.current = true)} />
        )}
        {game && <PlayField game={game} aspect={aspect} />}
        <HandMarks hands={hands} />
      </div>
    </div>
  );
}

// Sizes are in screen widths; vertical size is converted with the screen ratio.
function circle(x: number, y: number, r: number, aspect: number) {
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${r * 200}%`,
    height: `${(r * 200) / aspect}%`,
  };
}

function StartMark({ aspect, onClick }: { aspect: number; onClick: () => void }) {
  const { x, y, radius } = START_TARGET;
  return (
    <div className="absolute inset-0">
      <button
        type="button"
        onClick={onClick}
        className="absolute flex -translate-1/2 items-center justify-center rounded-full border-4 border-blue-200 bg-blue-500/70 text-2xl font-bold text-white shadow-[0_0_32px] shadow-blue-400"
        style={circle(x, y, radius, aspect)}
      >
        시작
      </button>
      <p className="absolute inset-x-0 bottom-6 text-center text-lg font-medium text-white drop-shadow">
        손으로 시작을 치면 운동이 시작됩니다
      </p>
    </div>
  );
}

function HandMarks({ hands }: { hands: Hand[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {hands.map((hand, i) => (
        <div
          key={`${hand.id}-${i}`}
          data-testid="hand"
          className="absolute size-6 -translate-1/2 rounded-full border-2 border-white bg-white/40"
          style={{ left: `${hand.x * 100}%`, top: `${hand.y * 100}%` }}
        />
      ))}
    </div>
  );
}

function PlayField({ game, aspect }: { game: GameState; aspect: number }) {
  const { light, now } = game;

  let cueRadius = 0;
  if (light) {
    const left = Math.max(0, (light.hitAt - now) / (light.hitAt - light.spawnAt));
    cueRadius = light.radius * (1 + 2 * left);
  }

  return (
    <div className="absolute inset-0">
      {light && (
        <>
          <div
            data-testid="light"
            className="absolute -translate-1/2 rounded-full bg-blue-500/70 shadow-[0_0_24px] shadow-blue-400"
            style={circle(light.x, light.y, light.radius, aspect)}
          />
          <div
            data-testid="cue"
            className="absolute -translate-1/2 rounded-full border-4 border-blue-200"
            style={circle(light.x, light.y, cueRadius, aspect)}
          />
        </>
      )}
      {game.judged
        .filter((j) => now - j.at < FEEDBACK_MS)
        .map((j) => (
          <div
            key={j.id}
            className="absolute -translate-1/2 text-2xl font-bold text-white drop-shadow"
            style={{ left: `${j.x * 100}%`, top: `${j.y * 100}%` }}
          >
            {JUDGEMENT_LABELS[j.judgement]}
          </div>
        ))}
    </div>
  );
}

function SetupCard({
  settings,
  onChange,
  onStart,
  error,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onStart: () => void;
  error: string | null;
}) {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>웹 펀치 리듬</CardTitle>
        <CardDescription>
          예고 원이 파란 불빛에 딱 맞는 순간 손으로 치세요. 한 번의 운동은 3분입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ChoiceGroup
          label="예고 속도"
          options={(Object.keys(CUE_SPEED_LABELS) as CueSpeed[]).map((value) => ({
            value,
            label: CUE_SPEED_LABELS[value],
          }))}
          value={settings.cueSpeed}
          onChange={(cueSpeed) => onChange({ ...settings, cueSpeed })}
        />
        <ChoiceGroup
          label="모드"
          options={(Object.keys(MODE_LABELS) as Mode[]).map((value) => ({
            value,
            label: MODE_LABELS[value].label,
          }))}
          value={settings.mode}
          onChange={(mode) => onChange({ ...settings, mode })}
          description={MODE_LABELS[settings.mode].description}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button size="lg" onClick={onStart}>
          {error ? "다시 시도" : "시작"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  description,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  description?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={option.value === value ? "default" : "outline"}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function ResultCard({
  game,
  onRetry,
  onBack,
}: {
  game: GameState;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { counts } = game;
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>운동 끝!</CardTitle>
        <CardDescription>
          {CUE_SPEED_LABELS[game.settings.cueSpeed]} · {MODE_LABELS[game.settings.mode].label} 모드
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted-foreground">정확도</p>
          <p className="font-heading text-5xl font-semibold tabular-nums">
            {accuracyOf(counts).toFixed(1)}%
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {(Object.keys(JUDGEMENT_LABELS) as Judgement[]).map((j) => (
            <div key={j} className="rounded-lg bg-muted p-3">
              <dt className="text-sm text-muted-foreground">{JUDGEMENT_LABELS[j]}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{counts[j]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="lg" onClick={onRetry}>
          같은 설정으로 다시 하기
        </Button>
        <Button size="lg" variant="outline" onClick={onBack}>
          설정으로 돌아가기
        </Button>
      </CardFooter>
    </Card>
  );
}

function describeError(error: unknown): string {
  if (error instanceof CameraImageError) {
    return error.reason === "dark"
      ? "카메라 화면이 검게 나옵니다. 렌즈 가림막이나 노트북의 카메라 끄기 키를 확인한 뒤 다시 시도해 주세요."
      : "카메라는 연결됐지만 영상이 들어오지 않습니다. 다른 프로그램이 카메라를 쓰고 있지 않은지, Windows 설정의 카메라 개인 정보 보호에서 브라우저가 허용되어 있는지 확인해 주세요.";
  }
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return "웹캠 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 권한을 허용한 뒤 다시 시도해 주세요.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "사용할 수 있는 카메라를 찾지 못했습니다. 카메라를 연결한 뒤 다시 시도해 주세요.";
  }
  if (name === "NotReadableError") {
    return "다른 프로그램이 카메라를 사용 중입니다. 그 프로그램을 닫고 다시 시도해 주세요.";
  }
  return "손 인식을 준비하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
}

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
