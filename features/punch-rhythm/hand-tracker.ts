import type { HandLandmarker } from "@mediapipe/tasks-vision";

import type { Hand } from "./game";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Wrist and the four knuckles: their average is roughly the center of a fist.
const FIST_POINTS = [0, 5, 9, 13, 17];

export type HandTracker = {
  detect: (video: HTMLVideoElement, now: number) => Hand[];
  close: () => void;
};

export async function createHandTracker(): Promise<HandTracker> {
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
    });

  let landmarker: HandLandmarker;
  try {
    landmarker = await create("GPU");
  } catch {
    landmarker = await create("CPU");
  }

  return {
    detect(video, now) {
      const result = landmarker.detectForVideo(video, now);
      return result.landmarks.map((points, i) => {
        const fist = FIST_POINTS.map((p) => points[p]);
        const x = fist.reduce((sum, p) => sum + p.x, 0) / fist.length;
        const y = fist.reduce((sum, p) => sum + p.y, 0) / fist.length;
        return {
          id: result.handedness[i]?.[0]?.categoryName || String(i),
          // The video is shown mirrored, so mirror the hand too.
          x: 1 - x,
          y,
        };
      });
    },
    close() {
      landmarker.close();
    },
  };
}
