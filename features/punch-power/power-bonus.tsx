"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { Fanfare } from "@/components/fanfare";
import { RecordBoard } from "@/components/record-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ImageIcon, LinkIcon } from "lucide-react";

import { HandChallenge, type HandSource } from "./hand-challenge";
import { CHALLENGE_MS, summarize, toG } from "./power";
import { PunchTarget } from "./punch-target";
import type { PhoneEvent } from "./relay";

type Stage =
  | { name: "waiting" }
  | { name: "connected" }
  | { name: "countdown"; left: number }
  | { name: "playing"; endsAt: number }
  | { name: "result"; summary: ReturnType<typeof summarize> };

const COUNTDOWN_S = 3;
const POWER_RECORDS_KEY = "punch:power-records";

type PowerRecord = ReturnType<typeof summarize> & { name: string; at: number };

type BonusMode = "hands" | "phone";

/**
 * Bonus game on the computer, punching a target for 10 s: with a phone it measures how hard,
 * without one the webcam counts how many times. The page decides what opens it.
 */
export function PowerBonus({
  open,
  onOpenChange,
  createHandSource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createHandSource: () => Promise<HandSource>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-md">
        {open && <BonusSession createHandSource={createHandSource} />}
      </DialogContent>
    </Dialog>
  );
}

function BonusSession({
  createHandSource,
}: {
  createHandSource: () => Promise<HandSource>;
}) {
  const [mode, setMode] = useState<BonusMode>("hands");
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Release the picked picture when it is replaced or the bonus closes.
  useEffect(
    () => () => {
      if (image?.startsWith("blob:")) URL.revokeObjectURL(image);
    },
    [image],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>보너스: 샌드백 치기</DialogTitle>
        <DialogDescription>
          10초 동안 마음껏 치세요. 폰 없이는 몇 번 쳤는지, 폰을 연결하면 얼마나
          세게 쳤는지 잽니다.
        </DialogDescription>
      </DialogHeader>

      <div
        role="group"
        aria-label="재는 방법"
        className="grid grid-cols-2 gap-2"
      >
        {(
          [
            ["hands", "폰 없이 횟수"],
            ["phone", "폰으로 세기"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={mode === value ? "default" : "outline"}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="때릴 사진 고르기"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setImage(URL.createObjectURL(file));
            event.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <ImageIcon aria-hidden />
          {image ? "다른 사진으로" : "때릴 사진 올리기"}
        </Button>
        {image && (
          <Button variant="ghost" size="sm" onClick={() => setImage(null)}>
            샌드백으로
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          올린 사진은 이 컴퓨터 밖으로 나가지 않습니다.
        </span>
      </div>
      <ImageUrlForm onLoad={setImage} />

      {mode === "hands" ? (
        <HandChallenge createHandSource={createHandSource} image={image} />
      ) : (
        <PhoneSession image={image} />
      )}
    </>
  );
}

function PhoneSession({ image }: { image: string | null }) {
  const [room] = useState(() => Math.random().toString(36).slice(2, 8));
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "waiting" });
  const [punches, setPunches] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  const stageRef = useRef<Stage>(stage);
  const punchesRef = useRef<number[]>(punches);
  useEffect(() => {
    stageRef.current = stage;
    punchesRef.current = punches;
  });

  // Find an address the phone can open, and draw it as a QR code.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/lan-address")
      .then((response) => response.json() as Promise<{ origins: string[] }>)
      .then(async ({ origins }) => {
        const origin = origins[0] ?? window.location.origin;
        const url = `${origin}/phone?room=${room}`;
        const image = await QRCode.toDataURL(url, { margin: 1, width: 240 });
        if (!cancelled) {
          setPhoneUrl(url);
          setQr(image);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [room]);

  // Listen for the phone's events.
  useEffect(() => {
    const source = new EventSource(`/api/rooms/${room}`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as PhoneEvent;
      const current = stageRef.current;
      if (event.type === "hello" && current.name === "waiting") {
        setStage({ name: "connected" });
      }
      if (event.type === "punch" && current.name === "playing") {
        setPunches((list) => [...list, event.power]);
      }
    };
    return () => source.close();
  }, [room]);

  // Drive the countdown and the 10-second timer.
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
          setStage({ name: "result", summary: summarize(punchesRef.current) });
        }
      }, 100);
      return () => window.clearInterval(id);
    }
  }, [stage]);

  const begin = () => {
    setPunches([]);
    setStage({ name: "countdown", left: COUNTDOWN_S });
  };

  const insecure =
    typeof window !== "undefined" && window.location.protocol !== "https:";

  return (
    <>

      {stage.name === "waiting" && (
        <div className="flex flex-col items-center gap-3 text-center">
          {qr ? (
            // A data URL from the QR library; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="폰 연결용 QR 코드"
              className="size-60 rounded-lg bg-white p-2"
            />
          ) : (
            <div className="size-60 animate-pulse rounded-lg bg-muted" />
          )}
          <p className="text-sm text-muted-foreground">
            폰 카메라로 QR을 찍고, 열린 페이지에서 &quot;센서 허용하고
            연결&quot;을 누르세요. 폰과 컴퓨터는 같은 와이파이에 있어야 합니다.
          </p>
          {phoneUrl && (
            <p className="break-all font-mono text-xs">{phoneUrl}</p>
          )}
          {insecure && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              지금 서버가 HTTPS가 아니어서 폰 센서가 열리지 않습니다. 터미널에서
              <code className="mx-1 font-mono">bun run dev:phone</code>으로
              서버를 띄운 뒤 https 주소로 이 화면을 다시 열어 주세요.
            </p>
          )}
        </div>
      )}

      {stage.name === "connected" && (
        <p className="rounded-xl bg-muted p-6 text-center text-lg font-medium">
          폰이 연결됐습니다. 준비되면 시작을 누르세요.
        </p>
      )}

      {stage.name === "countdown" && (
        <p className="py-6 text-center font-heading text-7xl font-semibold tabular-nums">
          {stage.left}
        </p>
      )}

      {stage.name === "playing" && (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <PunchTarget
            image={image}
            hits={punches.length}
            className="w-full max-w-48"
          />
          <p className="font-mono text-lg tabular-nums">
            {Math.max(0, Math.ceil((stage.endsAt - now) / 1000))}초
          </p>
          <p className="text-sm text-muted-foreground">방금 친 세기</p>
          <p className="font-heading text-6xl font-semibold tabular-nums">
            {punches.length
              ? `${toG(punches[punches.length - 1]).toFixed(1)}G`
              : "-"}
          </p>
        </div>
      )}

      {stage.name === "result" && <Fanfare />}
      {stage.name === "result" && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat
            label="가장 센 한 방"
            value={`${stage.summary.maxG.toFixed(1)}G`}
          />
          <Stat
            label="평균 세기"
            value={`${stage.summary.averageG.toFixed(1)}G`}
          />
          <Stat label="친 횟수" value={`${stage.summary.count}번`} />
        </dl>
      )}

      <DialogFooter>
        {stage.name === "connected" && <Button onClick={begin}>시작</Button>}
        {stage.name === "result" && <Button onClick={begin}>다시 하기</Button>}
      </DialogFooter>
      {stage.name === "result" && (
        <RecordBoard<PowerRecord>
          key={stage.summary.count + ":" + stage.summary.maxG}
          storageKey={POWER_RECORDS_KEY}
          makeRecord={(name, at) => ({ name, at, ...stage.summary })}
          compare={(a, b) => b.maxG - a.maxG || a.at - b.at}
          show={(record) => ({
            value: `${record.maxG.toFixed(1)}G`,
            detail: `평균 ${record.averageG.toFixed(1)}G · ${record.count}번`,
          })}
        />
      )}
    </>
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

/** For when picking a file does not work: paste a picture's address instead. */
function ImageUrlForm({ onLoad }: { onLoad: (url: string) => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    { name: "idle" } | { name: "loading" } | { name: "error"; message: string }
  >({ name: "idle" });

  const load = () => {
    let url: URL;
    try {
      url = new URL(text.trim());
    } catch {
      setStatus({ name: "error", message: "https://로 시작하는 이미지 주소를 넣어 주세요." });
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      setStatus({ name: "error", message: "https://로 시작하는 이미지 주소를 넣어 주세요." });
      return;
    }
    // Check that it really is a picture before swapping the target.
    setStatus({ name: "loading" });
    const probe = new Image();
    probe.onload = () => {
      onLoad(url.href);
      setText("");
      setStatus({ name: "idle" });
    };
    probe.onerror = () =>
      setStatus({
        name: "error",
        message:
          "이미지를 불러오지 못했습니다. 이미지 자체의 주소인지(이미지 우클릭 → 이미지 주소 복사) 확인해 주세요.",
      });
    probe.src = url.href;
  };

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        load();
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="때릴 이미지 주소"
          inputMode="url"
          placeholder="또는 이미지 주소(URL) 붙여넣기"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (status.name === "error") setStatus({ name: "idle" });
          }}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-auto"
          disabled={!text.trim() || status.name === "loading"}
        >
          <LinkIcon aria-hidden />
          {status.name === "loading" ? "불러오는 중…" : "바꾸기"}
        </Button>
      </div>
      {status.name === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {status.message}
        </p>
      )}
    </form>
  );
}
