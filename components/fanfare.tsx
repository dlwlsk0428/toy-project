"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

// Confetti falls in waves for as long as the fanfare is on screen.
const FIRST_WAVE = 90;
const WAVE = 18;
const WAVE_MS = 400;
// The brass call repeats this often (it lasts about 2 s).
const CALL_EVERY_MS = 4000;

const COLORS = [
  "var(--primary)",
  "oklch(0.62 0.22 27)",
  "oklch(0.62 0.17 255)",
  "oklch(0.85 0.15 85)",
  "oklch(0.97 0.01 85)",
];

// A short brass call: G C E G … E G (frequency in Hz, start and length in seconds).
const CALL: [number, number, number][] = [
  [392, 0, 0.14],
  [523.25, 0.15, 0.14],
  [659.25, 0.3, 0.14],
  [783.99, 0.45, 0.45],
  [659.25, 0.95, 0.14],
  [783.99, 1.1, 0.8],
];

/**
 * Confetti and a fanfare that keep going while it is on screen (e.g. a result screen),
 * until the player turns them off.
 */
export function Fanfare() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const layer = layerRef.current;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
    } catch {
      // No sound on this device; confetti still runs.
    }
    if (context) playCall(context);
    const callTimer = window.setInterval(() => {
      if (context) playCall(context);
    }, CALL_EVERY_MS);

    let waveTimer = 0;
    if (layer && !reduceMotion) {
      dropConfetti(layer, FIRST_WAVE);
      waveTimer = window.setInterval(() => dropConfetti(layer, WAVE), WAVE_MS);
    }

    return () => {
      window.clearInterval(callTimer);
      window.clearInterval(waveTimer);
      void context?.close();
      layer?.replaceChildren();
    };
  }, [on]);

  // Render on <body> so a dialog's transform cannot trap the confetti inside it.
  return createPortal(
    <>
      <div
        ref={layerRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      />
      {on && (
        <Button
          size="sm"
          variant="secondary"
          className="fixed right-4 bottom-4 z-[101]"
          onClick={() => setOn(false)}
        >
          빵빠레 끄기
        </Button>
      )}
    </>,
    document.body,
  );
}

/** Drops `count` pieces of confetti; each removes itself once it has fallen. */
function dropConfetti(layer: HTMLElement, count: number) {
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    const size = 6 + Math.random() * 8;
    Object.assign(piece.style, {
      position: "absolute",
      top: "-5vh",
      left: `${Math.random() * 100}vw`,
      width: `${size}px`,
      height: `${size * 0.45}px`,
      background: COLORS[Math.floor(Math.random() * COLORS.length)],
      borderRadius: "1px",
    });
    layer.appendChild(piece);
    const drift = (Math.random() - 0.5) * 30;
    const fall = piece.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${drift}vw, 110vh) rotate(${720 + Math.random() * 720}deg)`,
          opacity: 0.9,
        },
      ],
      {
        duration: 2200 + Math.random() * 1600,
        delay: Math.random() * 400,
        easing: "cubic-bezier(0.2, 0.6, 0.4, 1)",
      },
    );
    fall.onfinish = () => piece.remove();
  }
}

function playCall(context: AudioContext) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.connect(context.destination);
  const at = context.currentTime + 0.05;
  for (const [frequency, start, length] of CALL) {
    const tone = context.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at + start);
    gain.gain.linearRampToValueAtTime(0.12, at + start + 0.02);
    gain.gain.setValueAtTime(0.12, at + start + length - 0.05);
    gain.gain.linearRampToValueAtTime(0, at + start + length);
    tone.connect(gain).connect(filter);
    tone.start(at + start);
    tone.stop(at + start + length + 0.05);
  }
}
