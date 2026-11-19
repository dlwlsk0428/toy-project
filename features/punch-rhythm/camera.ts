// Average brightness (0..255) below which the image counts as covered or switched off.
const DARK_BRIGHTNESS = 12;
const FRAME_TIMEOUT_MS = 5000;

/** Thrown when the camera stream is open but no usable image arrives. */
export class CameraImageError extends Error {
  constructor(readonly reason: "no-frames" | "dark") {
    super(reason);
    this.name = "CameraImageError";
  }
}

export function isTooDark(rgba: Uint8ClampedArray): boolean {
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4)
    sum += (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
  return sum / (rgba.length / 4) < DARK_BRIGHTNESS;
}

/**
 * Waits until the playing video shows a real image.
 * Rejects when no frame arrives in time, or the image is black (lens covered, camera off).
 */
export async function waitForCameraImage(
  video: HTMLVideoElement,
): Promise<void> {
  const deadline = performance.now() + FRAME_TIMEOUT_MS;
  while (!(video.readyState >= 2 && video.videoWidth > 0)) {
    if (performance.now() > deadline) throw new CameraImageError("no-frames");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Some cameras send a few dark frames while starting up, so give it a moment.
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (
      !isTooDark(context.getImageData(0, 0, canvas.width, canvas.height).data)
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new CameraImageError("dark");
}
