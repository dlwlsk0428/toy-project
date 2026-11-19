"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { createDetector, feedSample, toG } from "./power";
import type { PhoneEvent } from "./relay";

type Status =
  | { name: "idle" }
  | { name: "connecting" }
  | { name: "ready"; lastG: number | null }
  | { name: "error"; message: string };

const GRAVITY = 9.81;
const NO_SENSOR_MS = 2000;

type MotionPermission = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** The page opened on the phone: reads the motion sensor and sends punches to the room. */
export function PhoneController({ room }: { room: string | null }) {
  const [status, setStatus] = useState<Status>({ name: "idle" });
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => () => cleanupRef.current(), []);

  const send = (event: PhoneEvent) =>
    fetch(`/api/rooms/${room}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

  const connect = async () => {
    if (!window.isSecureContext) {
      setStatus({
        name: "error",
        message:
          "폰 센서는 https로 시작하는 주소에서만 열립니다. 컴퓨터에서 개발 서버를 HTTPS로 띄운 뒤 QR을 다시 찍어 주세요.",
      });
      return;
    }
    setStatus({ name: "connecting" });
    try {
      // iPhone asks the user before giving motion data, and only from a tap.
      const motion = DeviceMotionEvent as unknown as MotionPermission;
      if (typeof motion.requestPermission === "function") {
        if ((await motion.requestPermission()) !== "granted") {
          setStatus({
            name: "error",
            message:
              "움직임 센서 권한이 거부되었습니다. 다시 눌러 허용해 주세요.",
          });
          return;
        }
      }
      const response = await send({ type: "hello" });
      if (!response.ok) throw new Error("relay");

      let detector = createDetector();
      let received = false;
      const onMotion = (event: DeviceMotionEvent) => {
        received = true;
        const magnitude = motionMagnitude(event);
        if (magnitude === null) return;
        const result = feedSample(detector, { t: event.timeStamp, magnitude });
        detector = result.detector;
        if (result.punch !== null) {
          void send({ type: "punch", power: result.punch, at: Date.now() });
          setStatus({ name: "ready", lastG: toG(result.punch) });
        }
      };
      window.addEventListener("devicemotion", onMotion);
      const check = window.setTimeout(() => {
        if (!received) {
          setStatus({
            name: "error",
            message: "이 기기에서는 움직임 센서를 읽을 수 없습니다.",
          });
        }
      }, NO_SENSOR_MS);
      cleanupRef.current = () => {
        window.removeEventListener("devicemotion", onMotion);
        window.clearTimeout(check);
      };
      setStatus({ name: "ready", lastG: null });
    } catch {
      setStatus({
        name: "error",
        message:
          "컴퓨터와 연결하지 못했습니다. 같은 와이파이인지 확인하고 다시 시도해 주세요.",
      });
    }
  };

  if (!room) {
    return (
      <Message
        title="연결 정보가 없습니다"
        body="컴퓨터 화면의 QR 코드를 찍어서 들어와 주세요."
      />
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>펀치 세기 컨트롤러</CardTitle>
        <CardDescription>
          폰을 손목 밴드에 끼우거나 단단히 쥐고, 컴퓨터 화면을 보며 치세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status.name === "ready" ? (
          <div className="rounded-xl bg-muted p-6 text-center">
            <p className="text-sm text-muted-foreground">
              연결됨 · 방금 친 세기
            </p>
            <p className="font-heading text-5xl font-semibold tabular-nums">
              {status.lastG === null ? "-" : `${status.lastG.toFixed(1)}G`}
            </p>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={connect}
            disabled={status.name === "connecting"}
          >
            {status.name === "connecting" ? "연결 중…" : "센서 허용하고 연결"}
          </Button>
        )}
        {status.name === "error" && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {status.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Acceleration size without gravity, in m/s². */
function motionMagnitude(event: DeviceMotionEvent): number | null {
  const a = event.acceleration;
  if (a && a.x !== null && a.y !== null && a.z !== null) {
    return Math.hypot(a.x, a.y, a.z);
  }
  const g = event.accelerationIncludingGravity;
  if (g && g.x !== null && g.y !== null && g.z !== null) {
    return Math.abs(Math.hypot(g.x, g.y, g.z) - GRAVITY);
  }
  return null;
}
