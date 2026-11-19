import type { Counts } from "./game";
import { JUDGEMENT_LABELS } from "./labels";

export type ShareCardData = {
  name: string;
  accuracy: number;
  grade: string;
  maxCombo: number;
  punches: number;
  kcal: number;
  counts: Counts;
  showDodge: boolean;
  label: string;
  at: number;
  best: boolean;
};

// 4:5, the shape most feeds show without cropping.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

// The "night gym" palette from globals.css, in canvas-friendly hex.
const NAVY_TOP = "#18202e";
const NAVY_BOTTOM = "#0b0f17";
const TILE = "#1d2636";
const GOLD = "#ebbd45";
const CREAM = "#f4eddc";
const MUTED = "rgba(244, 237, 220, 0.62)";
const LINE = "rgba(244, 237, 220, 0.14)";
const ROPES = ["#d9483b", CREAM, "#3f7fd9"];
const KOREAN_FALLBACK = `"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;

/** The page's own fonts (set up by next/font as CSS variables), so the card matches the app. */
function fontFamilies() {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string) => {
    const value = css.getPropertyValue(name).trim();
    return value ? `${value}, ${KOREAN_FALLBACK}` : KOREAN_FALLBACK;
  };
  return {
    logo: pick("--font-anton"),
    heading: pick("--font-oswald"),
    body: pick("--font-sans"),
  };
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Draws the result card. Waits for the web fonts so the first draw is not in a fallback font. */
export async function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
): Promise<void> {
  const fonts = fontFamilies();
  await Promise.all([
    document.fonts.load(`80px ${fonts.logo}`),
    document.fonts.load(`700 80px ${fonts.heading}`),
    document.fonts.load(`600 40px ${fonts.body}`),
  ]).catch(() => {});

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = CARD_WIDTH;
  const cx = W / 2;

  // Background: dark arena with a ceiling light falling on the ring.
  const sky = g.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  sky.addColorStop(0, NAVY_TOP);
  sky.addColorStop(1, NAVY_BOTTOM);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, CARD_HEIGHT);

  const beam = g.createLinearGradient(0, 0, 0, 760);
  beam.addColorStop(0, "rgba(255, 244, 214, 0.22)");
  beam.addColorStop(1, "rgba(255, 244, 214, 0)");
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(cx - 120, 0);
  g.lineTo(cx + 120, 0);
  g.lineTo(cx + 480, 760);
  g.lineTo(cx - 480, 760);
  g.closePath();
  g.fill();

  const pool = g.createRadialGradient(cx, 640, 0, cx, 640, 460);
  pool.addColorStop(0, "rgba(235, 189, 69, 0.16)");
  pool.addColorStop(1, "rgba(235, 189, 69, 0)");
  g.fillStyle = pool;
  g.fillRect(0, 300, W, 700);

  // Ring ropes behind the score.
  ROPES.forEach((color, i) => {
    const y = 360 + i * 46;
    const rope = g.createLinearGradient(0, 0, W, 0);
    rope.addColorStop(0, "transparent");
    rope.addColorStop(0.25, color);
    rope.addColorStop(0.75, color);
    rope.addColorStop(1, "transparent");
    g.globalAlpha = 0.32;
    g.fillStyle = rope;
    g.fillRect(0, y, W, 4);
  });
  g.globalAlpha = 1;

  g.textAlign = "center";
  g.textBaseline = "alphabetic";

  // Logo lock-up.
  g.fillStyle = GOLD;
  g.font = `44px ${fonts.logo}`;
  g.letterSpacing = "14px";
  g.fillText("WEB", cx + 7, 112);
  g.fillStyle = CREAM;
  g.font = `112px ${fonts.logo}`;
  g.letterSpacing = "6px";
  g.fillText("PUNCH", cx + 3, 220);
  g.fillStyle = GOLD;
  g.font = `40px ${fonts.logo}`;
  g.letterSpacing = "22px";
  g.fillText("RHYTHM", cx + 11, 272);
  g.letterSpacing = "0px";

  // Who and the headline figure.
  g.fillStyle = MUTED;
  g.font = `500 38px ${fonts.body}`;
  g.fillText(`${data.name || "무명 복서"}의 운동 기록`, cx, 340);

  g.save();
  g.shadowColor = "rgba(235, 189, 69, 0.55)";
  g.shadowBlur = 48;
  g.fillStyle = GOLD;
  g.font = `700 250px ${fonts.heading}`;
  g.fillText(`${data.accuracy.toFixed(1)}%`, cx, 610);
  g.restore();

  g.fillStyle = MUTED;
  g.font = `500 34px ${fonts.body}`;
  g.fillText("정확도", cx, 660);

  // Grade pill, plus a "new best" tag when earned.
  g.font = `700 52px ${fonts.heading}`;
  const gradeWidth = g.measureText(data.grade).width + 96;
  const pillY = 700;
  roundRect(g, cx - gradeWidth / 2, pillY, gradeWidth, 84, 42);
  g.fillStyle = GOLD;
  g.fill();
  g.fillStyle = NAVY_BOTTOM;
  g.fillText(data.grade, cx, pillY + 61);
  if (data.best) {
    g.font = `700 30px ${fonts.body}`;
    const tag = "최고 기록!";
    const tagWidth = g.measureText(tag).width + 40;
    const tagX = cx + gradeWidth / 2 + 16;
    roundRect(g, tagX, pillY + 18, tagWidth, 48, 24);
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = GOLD;
    g.textAlign = "left";
    g.fillText(tag, tagX + 20, pillY + 53);
    g.textAlign = "center";
  }

  // Three stat tiles.
  const tiles: [string, string][] = [
    ["최대 콤보", String(data.maxCombo)],
    ["친 횟수", `${data.punches}번`],
    ["칼로리(추정)", `${data.kcal}kcal`],
  ];
  const margin = 80;
  const gap = 28;
  const tileW = (W - margin * 2 - gap * 2) / 3;
  const tileY = 850;
  tiles.forEach(([label, value], i) => {
    const x = margin + i * (tileW + gap);
    roundRect(g, x, tileY, tileW, 190, 28);
    g.fillStyle = TILE;
    g.fill();
    g.strokeStyle = LINE;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = MUTED;
    g.font = `500 32px ${fonts.body}`;
    g.fillText(label, x + tileW / 2, tileY + 64);
    g.fillStyle = CREAM;
    g.font = `700 68px ${fonts.heading}`;
    g.fillText(value, x + tileW / 2, tileY + 150);
  });

  // Judgement counts as one line.
  const judgements = (["perfect", "good", "miss", "dodge"] as const).filter(
    (j) => j !== "dodge" || data.showDodge,
  );
  g.fillStyle = CREAM;
  g.font = `600 36px ${fonts.body}`;
  g.fillText(
    judgements
      .map((j) => `${JUDGEMENT_LABELS[j].replace("!", "")} ${data.counts[j]}`)
      .join("   ·   "),
    cx,
    1118,
  );

  // Footer: settings and date under a gold rule.
  g.fillStyle = GOLD;
  g.fillRect(cx - 60, 1180, 120, 4);
  g.fillStyle = MUTED;
  g.font = `500 32px ${fonts.body}`;
  g.fillText(data.label, cx, 1240);
  g.fillText(
    new Date(data.at).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    cx,
    1290,
  );
}

export function cardFile(blob: Blob, at: number): File {
  const day = new Date(at).toISOString().slice(0, 10);
  return new File([blob], `punch-rhythm-${day}.png`, { type: "image/png" });
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
