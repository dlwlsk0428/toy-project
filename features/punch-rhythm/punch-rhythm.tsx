"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Fanfare } from "@/components/fanfare";
import { RecordBoard } from "@/components/record-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  type Difficulty,
  type Point,
  type GameState,
  type Hand,
  type Judgement,
  type Mode,
  type Settings,
} from "./game";
import { CameraImageError, waitForCameraImage } from "./camera";
import { createHandTracker, type HandTracker } from "./hand-tracker";
import { HowTo } from "./how-to";
import { sliceSong } from "./beats";
import { loadSong, playSong, type LoadedSong } from "./song";

type Phase =
  | { name: "setup" }
  | { name: "preparing" }
  | { name: "calibrating" }
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
  hobby: {
    label: "취미",
    description: "타이밍에 맞춰 손을 불빛에 대면 됩니다.",
  },
  pro: {
    label: "선수",
    description: "손을 빠르게 뻗어 불빛을 쳐야 인정됩니다.",
  },
};

const DIFFICULTY_LABELS: Record<
  Difficulty,
  { label: string; description: string }
> = {
  normal: { label: "보통", description: "파란 불빛만 치면 됩니다." },
  hard: {
    label: "어려움",
    description:
      "파란 불빛을 치면서, 머리 쪽에 나오는 빨간 불빛은 고개를 움직여 피해야 합니다.",
  },
};

const SYNC_LIMIT_MS = 300;
const SECTION_STEP_MS = 5000;
const DEFAULT_SECTION_MS = 60_000;
const SECTION_LENGTHS = [
  { ms: 30_000, label: "30초" },
  { ms: 60_000, label: "1분" },
  { ms: 120_000, label: "2분" },
  { ms: Number.MAX_SAFE_INTEGER, label: "끝까지" },
];

type Section = { startMs: number; lengthMs: number };
const MIN_MINUTES = 1;
const MAX_MINUTES = 10;

const JUDGEMENT_LABELS: Record<Judgement, string> = {
  perfect: "Perfect",
  good: "Good",
  miss: "Miss",
  dodge: "회피!",
};

const FEEDBACK_MS = 600;

type PointerSize = "small" | "medium" | "large";
// Pointer radius in screen widths. A bigger pointer touches lights from further away.
const POINTER_RADIUS: Record<PointerSize, number> = {
  small: 0.015,
  medium: 0.03,
  large: 0.06,
};
const POINTER_SIZE_LABELS: Record<PointerSize, string> = {
  small: "작게",
  medium: "보통",
  large: "크게",
};

type SongState =
  | { name: "none" }
  | { name: "analyzing"; fileName: string }
  | { name: "ready"; song: LoadedSong }
  | { name: "error"; message: string };

type Offset = { x: number; y: number };
/** A still image of the ready stance and the hands found in it (before offsets). */
type Photo = { image: string; hands: Hand[] };
const PHOTO_COUNTDOWN_S = 3;
// Each hand (keyed by its left/right label) keeps its own correction.
type Offsets = Record<string, Offset>;
const NO_OFFSET: Offset = { x: 0, y: 0 };
const NO_OFFSETS: Offsets = {};

export function PunchRhythm() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<Phase>({ name: "setup" });
  const [game, setGame] = useState<GameState | null>(null);
  const [hands, setHands] = useState<Hand[]>([]);
  const [head, setHead] = useState<Point | null>(null);
  const [song, setSong] = useState<SongState>({ name: "none" });
  const audioRef = useRef<AudioContext | null>(null);
  const stopSongRef = useRef<() => void>(() => {});
  // Song mode runs on the song's own clock; null means the computer clock.
  const songClockRef = useRef<(() => number) | null>(null);
  const [syncMs, setSyncMs] = useState(0);
  const [section, setSection] = useState<Section>({
    startMs: 0,
    lengthMs: DEFAULT_SECTION_MS,
  });
  const syncRef = useRef(0);
  const changeSync = (value: number) => {
    syncRef.current = value;
    setSyncMs(value);
  };
  const [aspect, setAspect] = useState(9 / 16);
  const [pointerSize, setPointerSize] = useState<PointerSize>("medium");
  const [offsets, setOffsets] = useState<Offsets>(NO_OFFSETS);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const frameRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const startRequestedRef = useRef(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  // The running loop reads the latest pointer settings through refs.
  const pointerRef = useRef({
    offsets: NO_OFFSETS,
    radius: POINTER_RADIUS.medium,
  });
  const rawHandsRef = useRef<Hand[]>([]);
  const draggingRef = useRef<string | null>(null);
  // Ready-stance photo: pointers are matched on a still image, so hands need not stay still.
  const [photo, setPhoto] = useState<Photo | null>(null);
  const photoRef = useRef<Photo | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const changePhoto = (next: Photo | null) => {
    photoRef.current = next;
    setPhoto(next);
  };

  const takePhoto = () => {
    changePhoto(null);
    let left = PHOTO_COUNTDOWN_S;
    setCountdown(left);
    const tick = () => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
        window.setTimeout(tick, 1000);
        return;
      }
      setCountdown(null);
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      changePhoto({
        image: canvas.toDataURL("image/jpeg", 0.85),
        hands: rawHandsRef.current,
      });
    };
    window.setTimeout(tick, 1000);
  };
  // While the player adjusts pointers, the start mark is hidden and cannot be punched.
  const calibratingRef = useRef(true);

  const changeOffsets = (next: Offsets) => {
    pointerRef.current.offsets = next;
    setOffsets(next);
  };
  const changePointerSize = (size: PointerSize) => {
    pointerRef.current.radius = POINTER_RADIUS[size];
    setPointerSize(size);
  };

  // Dragging a pointer moves it onto the real fist: the offset is where the mouse is
  // relative to where the hand was detected.
  const dragPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const id = draggingRef.current;
    const rect = fieldRef.current?.getBoundingClientRect();
    const raw = rawHandsRef.current.find((hand) => hand.id === id);
    if (!id || !rect || !raw) return;
    changeOffsets({
      ...pointerRef.current.offsets,
      [id]: {
        x: (event.clientX - rect.left) / rect.width - raw.x,
        y: (event.clientY - rect.top) / rect.height - raw.y,
      },
    });
  };

  const stopAll = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackerRef.current?.close();
    trackerRef.current = null;
    stopSongRef.current();
    stopSongRef.current = () => {};
  }, []);

  const pickSong = async (file: File) => {
    setSong({ name: "analyzing", fileName: file.name });
    try {
      const loadedSong = await loadSong(file);
      setSection({
        // Start where the drums start, on a 5-second step.
        startMs:
          Math.floor(loadedSong.musicStartMs / SECTION_STEP_MS) *
          SECTION_STEP_MS,
        lengthMs: DEFAULT_SECTION_MS,
      });
      setSong({ name: "ready", song: loadedSong });
    } catch {
      setSong({
        name: "error",
        message:
          "이 파일은 노래로 읽지 못했습니다. mp3 같은 음악 파일을 골라 주세요.",
      });
    }
  };

  const loaded = song.name === "ready" ? song.song : null;
  const part = loaded
    ? sliceSong(loaded, section.startMs, section.lengthMs)
    : null;

  useEffect(() => stopAll, [stopAll]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    // Browsers only let sound start after a click, so open the audio here.
    if (loaded) {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    }
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
      trackerRef.current = await createHandTracker({
        withHead: settings.difficulty === "hard",
      });

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      await waitForCameraImage(video);
      const ratio = video.videoHeight / video.videoWidth;
      setAspect(ratio);

      // The game starts only when the player punches the start mark (or clicks it).
      let state: GameState | null = null;
      startRequestedRef.current = false;
      songClockRef.current = null;
      const loop = () => {
        const frameAt = performance.now();
        // With a song, game time is the song's time (minus the player's sync shift).
        const gameNow = () => {
          const songClock = songClockRef.current;
          return songClock ? songClock() - syncRef.current : frameAt;
        };
        // The tracker throws on a frame without size, e.g. while the stream is switching.
        const ready = video.readyState >= 2 && video.videoWidth > 0;
        const tracked = (ready &&
          trackerRef.current?.detect(video, frameAt)) || {
          hands: [],
          head: null,
        };
        const raw = photoRef.current?.hands ?? tracked.hands;
        setHead(tracked.head);
        rawHandsRef.current = raw;
        const { offsets: shifts, radius } = pointerRef.current;
        const seen = raw.map((hand) => {
          const shift = shifts[hand.id] ?? NO_OFFSET;
          return { ...hand, x: hand.x + shift.x, y: hand.y + shift.y };
        });
        setHands(seen);
        if (!state) {
          const punched = isHandOnTarget(seen, START_TARGET, ratio, radius);
          if (
            calibratingRef.current ||
            (!startRequestedRef.current && !punched)
          ) {
            frameRef.current = requestAnimationFrame(loop);
            return;
          }
          if (loaded && audioRef.current) {
            const playing = playSong(audioRef.current, loaded.buffer, {
              offsetSec: section.startMs / 1000,
              durationSec: part!.durationMs / 1000,
            });
            stopSongRef.current = playing.stop;
            songClockRef.current = playing.songMs;
            // The song starts at its own 0 ms, slightly after this frame.
            state = createGame(settings, 0, ratio, radius, part);
          } else {
            state = createGame(settings, frameAt, ratio, radius, null);
          }
          setPhase({ name: "playing" });
        }
        state = stepGame(state, gameNow(), seen, Math.random, tracked.head);
        setGame(state);
        if (state.ended) {
          stopAll();
          setPhase({ name: "result", game: state });
          return;
        }
        frameRef.current = requestAnimationFrame(loop);
      };
      calibratingRef.current = true;
      changePhoto(null);
      setCountdown(null);
      setPhase({ name: "calibrating" });
      frameRef.current = requestAnimationFrame(loop);
    } catch (error) {
      stopAll();
      setPhase({ name: "error", message: describeError(error) });
    } finally {
      startingRef.current = false;
    }
  }, [settings, stopAll, loaded, part, section.startMs]);

  if (phase.name === "setup" || phase.name === "error") {
    return (
      <SetupCard
        settings={settings}
        onChange={setSettings}
        onStart={start}
        error={phase.name === "error" ? phase.message : null}
        song={song}
        syncMs={syncMs}
        onSyncChange={changeSync}
        section={section}
        onSectionChange={setSection}
        onPickSong={pickSong}
        onClearSong={() => setSong({ name: "none" })}
      />
    );
  }

  if (phase.name === "result") {
    return (
      <ResultCard
        game={phase.game}
        songName={loaded?.name ?? null}
        onRetry={start}
        onBack={() => setPhase({ name: "setup" })}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {CUE_SPEED_LABELS[settings.cueSpeed]} ·{" "}
          {MODE_LABELS[settings.mode].label} 모드 ·{" "}
          {DIFFICULTY_LABELS[settings.difficulty].label}
          {loaded && ` · ♪ ${loaded.name}`}
        </span>
        <span
          aria-label="남은 시간"
          className="font-mono text-lg text-foreground tabular-nums"
        >
          {formatTime(
            game
              ? remainingMs(game)
              : (part?.durationMs ?? settings.minutes * 60_000),
          )}
        </span>
      </div>
      <div
        ref={fieldRef}
        onPointerMove={dragPointer}
        onPointerUp={() => (draggingRef.current = null)}
        onPointerLeave={() => (draggingRef.current = null)}
        className="relative mx-auto w-full touch-none overflow-hidden rounded-xl bg-black"
        // Keep the whole play area inside the window, whatever the camera's ratio.
        style={{
          aspectRatio: `1 / ${aspect}`,
          maxWidth: `calc(65vh / ${aspect})`,
        }}
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
        {phase.name === "calibrating" && photo && (
          // A data URL taken from the camera; next/image adds nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.image}
            alt="찍은 준비 자세"
            className="absolute inset-0 size-full -scale-x-100 object-cover"
          />
        )}
        {phase.name === "calibrating" && countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-heading text-8xl font-semibold text-white drop-shadow">
            {countdown}
          </div>
        )}
        {phase.name === "ready" && (
          <StartMark
            aspect={aspect}
            onClick={() => (startRequestedRef.current = true)}
          />
        )}
        {game && <PlayField game={game} aspect={aspect} />}
        {settings.difficulty === "hard" && head && (
          <div
            data-testid="head"
            className="pointer-events-none absolute size-4 -translate-1/2 rounded-full border-2 border-red-300 bg-red-500/50"
            style={{ left: `${head.x * 100}%`, top: `${head.y * 100}%` }}
          />
        )}
        <HandMarks
          hands={hands}
          aspect={aspect}
          radius={POINTER_RADIUS[pointerSize]}
          onGrab={
            phase.name === "calibrating" && photo
              ? (id) => (draggingRef.current = id)
              : undefined
          }
        />
        {phase.name === "calibrating" && (
          <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-lg font-medium text-white drop-shadow">
            {countdown !== null
              ? "준비 자세를 잡고 기다리세요"
              : !photo
                ? "아래의 준비 자세 찍기를 누르고, 3초 안에 주먹을 들어 준비 자세를 잡으세요"
                : photo.hands.length === 0
                  ? "사진에서 손을 찾지 못했습니다. 손이 잘 보이게 다시 찍어 주세요"
                  : "사진 속 주먹 위치로 흰 포인터를 끌어 맞추세요"}
          </p>
        )}
      </div>
      {phase.name === "calibrating" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ChoiceGroup
            label="포인터 크기"
            options={(Object.keys(POINTER_SIZE_LABELS) as PointerSize[]).map(
              (value) => ({
                value,
                label: POINTER_SIZE_LABELS[value],
              }),
            )}
            value={pointerSize}
            onChange={changePointerSize}
            description="준비 자세를 찍으면 3초 뒤 사진이 찍힙니다. 사진 위에서 흰 포인터를 끌어 주먹에 맞추세요. 왼손과 오른손을 따로 맞출 수 있습니다."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={photo ? "outline" : "default"}
              size="lg"
              onClick={takePhoto}
              disabled={countdown !== null}
            >
              {photo ? "다시 찍기" : "준비 자세 찍기"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => changeOffsets(NO_OFFSETS)}
              disabled={Object.keys(offsets).length === 0}
            >
              위치 초기화
            </Button>
            <Button
              size="lg"
              variant={photo ? "default" : "outline"}
              disabled={countdown !== null}
              onClick={() => {
                calibratingRef.current = false;
                draggingRef.current = null;
                changePhoto(null);
                setPhase({ name: "ready" });
              }}
            >
              위치 조정 완료
            </Button>
          </div>
        </div>
      )}
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

function StartMark({
  aspect,
  onClick,
}: {
  aspect: number;
  onClick: () => void;
}) {
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

function HandMarks({
  hands,
  aspect,
  radius,
  onGrab,
}: {
  hands: Hand[];
  aspect: number;
  radius: number;
  onGrab?: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {hands.map((hand, i) => (
        <div
          key={`${hand.id}-${i}`}
          data-testid="hand"
          onPointerDown={onGrab && (() => onGrab(hand.id))}
          className={cn(
            "absolute min-h-6 min-w-6 -translate-1/2 rounded-full border-2 border-white bg-white/40",
            onGrab && "pointer-events-auto cursor-grab",
          )}
          style={circle(hand.x, hand.y, radius, aspect)}
        />
      ))}
    </div>
  );
}

function PlayField({ game, aspect }: { game: GameState; aspect: number }) {
  const { lights, now } = game;

  return (
    <div className="absolute inset-0">
      {lights.map((light) => {
        const left = Math.max(
          0,
          (light.hitAt - now) / (light.hitAt - light.spawnAt),
        );
        const cueRadius = light.radius * (1 + 2 * left);
        return (
          <div key={light.id}>
            <div
              data-testid="light"
              data-kind={light.kind}
              className={cn(
                "absolute -translate-1/2 rounded-full shadow-[0_0_24px]",
                light.kind === "dodge"
                  ? "bg-red-500/60 shadow-red-400"
                  : "bg-blue-500/70 shadow-blue-400",
              )}
              style={circle(light.x, light.y, light.radius, aspect)}
            />
            <div
              data-testid="cue"
              className={cn(
                "absolute -translate-1/2 rounded-full border-4",
                light.kind === "dodge" ? "border-red-200" : "border-blue-200",
              )}
              style={circle(light.x, light.y, cueRadius, aspect)}
            />
          </div>
        );
      })}
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
  song,
  syncMs,
  onSyncChange,
  section,
  onSectionChange,
  onPickSong,
  onClearSong,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onStart: () => void;
  error: string | null;
  song: SongState;
  syncMs: number;
  onSyncChange: (value: number) => void;
  section: Section;
  onSectionChange: (section: Section) => void;
  onPickSong: (file: File) => void;
  onClearSong: () => void;
}) {
  const loaded = song.name === "ready" ? song.song : null;
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>웹 펀치 리듬</CardTitle>
        <CardDescription>
          예고 원이 파란 불빛에 딱 맞는 순간 손으로 치세요.{" "}
          {loaded
            ? `고른 구간(${formatTime(Math.min(section.lengthMs, loaded.durationMs - section.startMs))})만큼 운동합니다.`
            : `한 번의 운동은 ${settings.minutes}분입니다.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ChoiceGroup
          label="예고 속도"
          options={(Object.keys(CUE_SPEED_LABELS) as CueSpeed[]).map(
            (value) => ({
              value,
              label: CUE_SPEED_LABELS[value],
            }),
          )}
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
        <ChoiceGroup
          label="난이도"
          options={(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map(
            (value) => ({
              value,
              label: DIFFICULTY_LABELS[value].label,
            }),
          )}
          value={settings.difficulty}
          onChange={(difficulty) => onChange({ ...settings, difficulty })}
          description={DIFFICULTY_LABELS[settings.difficulty].description}
        />
        <SongField song={song} onPick={onPickSong} onClear={onClearSong} />
        {loaded && (
          <SectionField
            durationMs={loaded.durationMs}
            section={section}
            onChange={onSectionChange}
          />
        )}
        {loaded && <SyncField value={syncMs} onChange={onSyncChange} />}
        <MinutesField
          minutes={settings.minutes}
          onChange={(minutes) => onChange({ ...settings, minutes })}
          disabled={loaded !== null}
        />
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          size="lg"
          onClick={onStart}
          disabled={song.name === "analyzing"}
        >
          {error ? "다시 시도" : "시작"}
        </Button>
        <HowTo />
      </CardFooter>
    </Card>
  );
}

/** The latest start (ms, on the 5-second step) that keeps a section of this length inside the song. */
function maxSectionStart(durationMs: number, lengthMs: number): number {
  const room =
    lengthMs >= durationMs
      ? durationMs - SECTION_STEP_MS
      : durationMs - lengthMs;
  return Math.max(0, Math.floor(room / SECTION_STEP_MS) * SECTION_STEP_MS);
}

function SectionField({
  durationMs,
  section,
  onChange,
}: {
  durationMs: number;
  section: Section;
  onChange: (section: Section) => void;
}) {
  const end = Math.min(section.startMs + section.lengthMs, durationMs);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label id="section-label">
          구간: {formatTime(section.startMs)} – {formatTime(end)}
        </Label>
        <SectionBar
          durationMs={durationMs}
          section={section}
          onStartChange={(startMs) => onChange({ ...section, startMs })}
        />
      </div>
      <ChoiceGroup
        label="구간 길이"
        options={SECTION_LENGTHS.map((option) => ({
          value: String(option.ms),
          label: option.label,
        }))}
        value={String(section.lengthMs)}
        onChange={(value) => {
          const lengthMs = Number(value);
          onChange({
            lengthMs,
            startMs: Math.min(
              section.startMs,
              maxSectionStart(durationMs, lengthMs),
            ),
          });
        }}
        description="파란 막대가 고른 구간입니다. 막대를 끌거나 방향키로 5초씩 옮기세요."
      />
    </div>
  );
}

/** The whole song as a track, with the chosen section as a bar you drag along it. */
function SectionBar({
  durationMs,
  section,
  onStartChange,
}: {
  durationMs: number;
  section: Section;
  onStartChange: (startMs: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<number | null>(null);
  const maxStart = maxSectionStart(durationMs, section.lengthMs);
  const startMs = Math.min(section.startMs, maxStart);
  const endMs = Math.min(startMs + section.lengthMs, durationMs);

  const msAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * durationMs;
  };
  const moveTo = (ms: number) => {
    const snapped = Math.round(ms / SECTION_STEP_MS) * SECTION_STEP_MS;
    onStartChange(Math.min(maxStart, Math.max(0, snapped)));
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={trackRef}
        className="relative h-10 touch-none rounded-lg bg-muted"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const at = msAt(event.clientX);
          // Grab the bar where it was pressed; pressing outside it centres the bar there.
          grabRef.current =
            at >= startMs && at <= endMs ? at - startMs : (endMs - startMs) / 2;
          moveTo(at - grabRef.current);
        }}
        onPointerMove={(event) => {
          if (grabRef.current !== null)
            moveTo(msAt(event.clientX) - grabRef.current);
        }}
        onPointerUp={() => (grabRef.current = null)}
        onPointerCancel={() => (grabRef.current = null)}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-labelledby="section-label"
          aria-valuemin={0}
          aria-valuemax={maxStart}
          aria-valuenow={startMs}
          aria-valuetext={`${formatTime(startMs)}부터 ${formatTime(endMs - startMs)}`}
          className="absolute inset-y-0 cursor-grab rounded-lg bg-primary/80 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
          style={{
            left: `${(startMs / durationMs) * 100}%`,
            width: `${((endMs - startMs) / durationMs) * 100}%`,
          }}
          onKeyDown={(event) => {
            const step = {
              ArrowLeft: -1,
              ArrowDown: -1,
              ArrowRight: 1,
              ArrowUp: 1,
            }[event.key];
            if (step) {
              event.preventDefault();
              moveTo(startMs + step * SECTION_STEP_MS);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveTo(0);
            } else if (event.key === "End") {
              event.preventDefault();
              moveTo(maxStart);
            }
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}

function SyncField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="sync">
        싱크 보정: {value > 0 ? "+" : ""}
        {value}ms
      </Label>
      <input
        id="sync"
        type="range"
        min={-SYNC_LIMIT_MS}
        max={SYNC_LIMIT_MS}
        step={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
      <p className="text-sm text-muted-foreground">
        불빛이 박자보다 먼저 맞는 것 같으면 오른쪽(+)으로, 늦게 맞으면
        왼쪽(−)으로 옮기세요. 블루투스 이어폰은 보통 +로 맞춥니다.
      </p>
    </div>
  );
}

function SongField({
  song,
  onPick,
  onClear,
}: {
  song: SongState;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="song">노래 (선택)</Label>
      {song.name === "ready" ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
          <span>
            ♪ {song.song.name} · BPM {Math.round(song.song.bpm)} ·{" "}
            {formatTime(song.song.durationMs)}
          </span>
          <Button size="sm" variant="outline" onClick={onClear}>
            노래 빼기
          </Button>
        </div>
      ) : (
        <Input
          id="song"
          type="file"
          accept="audio/*"
          disabled={song.name === "analyzing"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPick(file);
          }}
        />
      )}
      <p
        role={song.name === "error" ? "alert" : undefined}
        className={cn(
          "text-sm",
          song.name === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {song.name === "analyzing"
          ? `${song.fileName}의 박자를 분석하고 있습니다…`
          : song.name === "error"
            ? song.message
            : "노래를 고르면 박자를 분석해 불빛이 박자에 맞춰 나옵니다. 파일은 이 컴퓨터 밖으로 나가지 않습니다."}
      </p>
    </div>
  );
}

function MinutesField({
  minutes,
  onChange,
  disabled,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  disabled: boolean;
}) {
  // Keep the typed text separately so the field can be empty while typing.
  const [text, setText] = useState(String(minutes));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="minutes">운동 시간 (분)</Label>
      <Input
        id="minutes"
        type="number"
        inputMode="numeric"
        min={MIN_MINUTES}
        max={MAX_MINUTES}
        className="w-28"
        disabled={disabled}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const value = Number(event.target.value);
          if (
            Number.isInteger(value) &&
            value >= MIN_MINUTES &&
            value <= MAX_MINUTES
          ) {
            onChange(value);
          }
        }}
        onBlur={() => setText(String(minutes))}
      />
      <p className="text-sm text-muted-foreground">
        {disabled
          ? "노래를 고르면 고른 구간만큼 운동합니다."
          : `${MIN_MINUTES}분부터 ${MAX_MINUTES}분까지 정할 수 있습니다.`}
      </p>
    </div>
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
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

type RhythmRecord = {
  name: string;
  at: number;
  accuracy: number;
  /** Settings (and song) of the run, as shown to the player. */
  label: string;
};

const RHYTHM_RECORDS_KEY = "punch:rhythm-records";

function ResultCard({
  game,
  songName,
  onRetry,
  onBack,
}: {
  game: GameState;
  songName: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { counts } = game;
  const label = [
    CUE_SPEED_LABELS[game.settings.cueSpeed],
    MODE_LABELS[game.settings.mode].label,
    DIFFICULTY_LABELS[game.settings.difficulty].label,
    songName ? `♪ ${songName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card className="w-full max-w-xl">
      <Fanfare />
      <CardHeader>
        <CardTitle>운동 끝!</CardTitle>
        <CardDescription>
          {CUE_SPEED_LABELS[game.settings.cueSpeed]} ·{" "}
          {MODE_LABELS[game.settings.mode].label} 모드
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted-foreground">정확도</p>
          <p className="font-heading text-5xl font-semibold tabular-nums">
            {accuracyOf(counts).toFixed(1)}%
          </p>
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
        <RecordBoard<RhythmRecord>
          storageKey={RHYTHM_RECORDS_KEY}
          makeRecord={(name, at) => ({
            name,
            at,
            accuracy: accuracyOf(counts),
            label,
          })}
          compare={(a, b) => b.accuracy - a.accuracy || a.at - b.at}
          show={(record) => ({
            value: `${record.accuracy.toFixed(1)}%`,
            detail: record.label,
          })}
        />
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
