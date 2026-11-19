"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const PIECES = 90;
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

/** Confetti and a fanfare, played once when it appears (e.g. on a result screen). */
export function Fanfare() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stopSound = playCall();
    const layer = layerRef.current;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!layer || reduceMotion) return stopSound;

    const pieces: HTMLElement[] = [];
    for (let i = 0; i < PIECES; i++) {
      const piece = document.createElement("span");
      const size = 6 + Math.random() * 8;
      Object.assign(piece.style, {
        position: "absolute",
        top: "-5vh",
        left: `${Math.random() * 100}vw`,
        width: `${size}px`,
        height: `${size * 0.45}px`,
        background: COLORS[i % COLORS.length],
        borderRadius: "1px",
      });
      layer.appendChild(piece);
      pieces.push(piece);
      const drift = (Math.random() - 0.5) * 30;
      piece.animate(
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
          fill: "forwards",
        },
      );
    }
    return () => {
      stopSound();
      pieces.forEach((piece) => piece.remove());
    };
  }, []);

  // Render on <body> so a dialog's transform cannot trap the confetti inside it.
  return createPortal(
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    />,
    document.body,
  );
}

function playCall(): () => void {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return () => {};
  }
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
  return () => {
    void context.close();
  };
}
