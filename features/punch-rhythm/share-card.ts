export type ShareCardData = {
  name: string;
  accuracy: number;
  grade: string;
  maxCombo: number;
  punches: number;
  kcal: number;
  label: string;
  at: number;
};

const WIDTH = 1080;
const HEIGHT = 1350;
const GOLD = "#e8b93a";
const CREAM = "#f3ecd9";

/** Draws the result as a picture the player can save or share. */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
): void {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext("2d");
  if (!g) return;

  const sky = g.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#1d2433");
  sky.addColorStop(1, "#0d111a");
  g.fillStyle = sky;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  const spot = g.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, 900);
  spot.addColorStop(0, "rgba(255,240,200,0.28)");
  spot.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = spot;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  g.textAlign = "center";
  g.fillStyle = GOLD;
  g.font = "700 64px sans-serif";
  g.fillText("웹 펀치 리듬", WIDTH / 2, 150);

  g.fillStyle = CREAM;
  g.font = "600 48px sans-serif";
  g.fillText(data.name || "무명 복서", WIDTH / 2, 260);

  g.fillStyle = GOLD;
  g.font = "700 260px sans-serif";
  g.fillText(`${data.accuracy.toFixed(1)}%`, WIDTH / 2, 600);

  g.fillStyle = CREAM;
  g.font = "600 72px sans-serif";
  g.fillText(data.grade, WIDTH / 2, 710);

  const rows: [string, string][] = [
    ["최대 콤보", String(data.maxCombo)],
    ["친 횟수", `${data.punches}번`],
    ["소모 칼로리(추정)", `약 ${data.kcal}kcal`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 880 + i * 120;
    g.textAlign = "left";
    g.fillStyle = "rgba(243,236,217,0.7)";
    g.font = "500 44px sans-serif";
    g.fillText(label, 150, y);
    g.textAlign = "right";
    g.fillStyle = CREAM;
    g.font = "700 56px sans-serif";
    g.fillText(value, WIDTH - 150, y);
  });

  g.textAlign = "center";
  g.fillStyle = "rgba(243,236,217,0.55)";
  g.font = "400 34px sans-serif";
  g.fillText(data.label, WIDTH / 2, 1200);
  g.fillText(new Date(data.at).toLocaleDateString("ko-KR"), WIDTH / 2, 1250);
}

/** Shares the picture where the browser supports it, otherwise downloads it. */
export async function shareCard(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return;
  const file = new File([blob], "punch-rhythm-result.png", {
    type: "image/png",
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "웹 펀치 리듬 결과" });
      return;
    } catch {
      // The player closed the share sheet; fall through to nothing more.
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}
