"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

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

import { CHALLENGE_MS, summarize, toG } from "./power";
import type { PhoneEvent } from "./relay";

type Stage =
  | { name: "waiting" }
  | { name: "connected" }
  | { name: "countdown"; left: number }
  | { name: "playing"; endsAt: number }
  | { name: "result"; summary: ReturnType<typeof summarize> };

const COUNTDOWN_S = 3;

/** Bonus game on the computer: connect a phone by QR, then punch as hard as you can for 10 s. */
export function PowerBonus() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" variant="secondary" />}>
        보너스: 펀치 세기
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {open && <BonusSession />}
      </DialogContent>
    </Dialog>
  );
}

function BonusSession() {
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
      <DialogHeader>
        <DialogTitle>보너스: 펀치 세기</DialogTitle>
        <DialogDescription>
          폰을 연결하고 10초 동안 마음껏 치세요. 가장 센 한 방을 기록합니다.
        </DialogDescription>
      </DialogHeader>

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
          <p className="font-mono text-lg tabular-nums">
            {Math.max(0, Math.ceil((stage.endsAt - now) / 1000))}초
          </p>
          <p className="text-sm text-muted-foreground">방금 친 세기</p>
          <p className="font-heading text-6xl font-semibold tabular-nums">
            {punches.length
              ? `${toG(punches[punches.length - 1]).toFixed(1)}G`
              : "-"}
          </p>
          <p className="text-sm text-muted-foreground">
            {punches.length}번 쳤습니다
          </p>
        </div>
      )}

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
