"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/** Hits it takes to crumple the target all the way. */
export const CRUMPLE_FULL_HITS = 40;
const HIT_WORDS = ["퍽!", "팡!", "쾅!", "빡!", "퍼억!", "뻥!"];
const OUTLINE_POINTS = 20;

/** 0..1, how crumpled the target is after this many hits. */
export function crumpleLevel(hits: number): number {
  return Math.min(1, hits / CRUMPLE_FULL_HITS);
}

// Same jitter every render for the same index, so the outline only changes with the hits.
function jitter(i: number): number {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** A torn, uneven outline: points along the square's edge pulled inwards as it crumples. */
function crumpledOutline(level: number): string {
  const perSide = OUTLINE_POINTS / 4;
  const points: string[] = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    // Walk the edge clockwise from the top-left corner; corners come first on each side.
    const side = Math.floor(i / perSide);
    const along = ((i % perSide) / perSide) * 100;
    const [x, y] = [
      [along, 0],
      [100, along],
      [100 - along, 100],
      [0, 100 - along],
    ][side];
    const pull = level * (0.05 + jitter(i) * 0.2);
    const px = x + (50 - x) * pull;
    const py = y + (50 - y) * pull;
    points.push(`${px.toFixed(1)}% ${py.toFixed(1)}%`);
  }
  return `polygon(${points.join(", ")})`;
}

/**
 * The thing being punched: the player's picture, or a sandbag poster when there is none.
 * Every hit shakes it, and it wrinkles, tears and shrinks the more it is hit.
 */
export function PunchTarget({
  image,
  hits,
  className,
}: {
  image: string | null;
  hits: number;
  className?: string;
}) {
  const filterId = `crumple-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const level = crumpleLevel(hits);
  const tilt = Math.sin(hits * 1.7) * level * 10;
  const word = HIT_WORDS[hits % HIT_WORDS.length];

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
    >
      <svg aria-hidden className="absolute size-0">
        <filter
          id={filterId}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves={3}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={level * 45}
            xChannelSelector="R"
            yChannelSelector="G"
            result="warp"
          />
          <feDiffuseLighting
            in="noise"
            lightingColor="#ffffff"
            surfaceScale={2 + level * 10}
            result="light"
          >
            <feDistantLight azimuth={45} elevation={50} />
          </feDiffuseLighting>
          {/* Blend from the plain picture to the shaded, wrinkled one as it crumples. */}
          <feComposite
            in="light"
            in2="warp"
            operator="arithmetic"
            k1={level * 1.25}
            k2={0}
            k3={1 - level}
            k4={0}
            result="lit"
          />
          <feComposite in="lit" in2="warp" operator="in" />
        </filter>
      </svg>

      <div
        key={hits}
        data-testid="punch-target"
        data-level={level.toFixed(2)}
        className={cn(
          "relative aspect-square w-full",
          hits > 0 && "animate-[punch-shake_0.28s_ease-out]",
        )}
        style={{
          transform: `scale(${1 - level * 0.28}) rotate(${tilt}deg)`,
          transition: "transform 0.2s ease-out",
        }}
      >
        <div
          className="size-full overflow-hidden shadow-2xl"
          style={{
            clipPath: crumpledOutline(level),
            filter: `url(#${filterId}) saturate(${1 - level * 0.35})`,
          }}
        >
          {image ? (
            // A local blob URL picked by the player; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt="때릴 사진"
              className="size-full object-cover"
              draggable={false}
            />
          ) : (
            <SandbagPoster />
          )}
        </div>
        {hits > 0 && (
          <span
            className="pointer-events-none absolute animate-[punch-pop_0.45s_ease-out_forwards] font-heading text-5xl font-semibold text-primary [text-shadow:0_0_4px_#000,0_3px_10px_#000]"
            style={{
              left: `${20 + jitter(hits) * 50}%`,
              top: `${15 + jitter(hits + 50) * 55}%`,
              rotate: `${(jitter(hits + 9) - 0.5) * 40}deg`,
            }}
          >
            {word}
          </span>
        )}
      </div>
    </div>
  );
}

function SandbagPoster() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,oklch(0.62_0.22_27),oklch(0.38_0.16_27))] text-center text-white">
      <span className="text-8xl" aria-hidden>
        😤
      </span>
      <span className="font-logo text-4xl tracking-widest">SANDBAG</span>
      <span className="px-3 text-xs opacity-80">사진을 올리면 그 사진을 칩니다</span>
    </div>
  );
}
