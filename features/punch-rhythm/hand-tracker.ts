import type { HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

import type { Hand, Point } from "./game";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Wrist and the four knuckles: their average is roughly the center of a fist.
const FIST_POINTS = [0, 5, 9, 13, 17];
const WRIST = 0;
const MIDDLE_KNUCKLE = 9;
// Pose landmark 0 is the nose, used as the head position.
const NOSE = 0;
const MIN_NOSE_VISIBILITY = 0.5;

export type Tracked = { hands: Hand[]; head: Point | null };

export type HandTracker = {
  detect: (video: HTMLVideoElement, now: number) => Tracked;
  close: () => void;
};

/** Tracks both hands, and the head too when `withHead` is set. */
export async function createHandTracker({
  withHead,
}: {
  withHead: boolean;
}): Promise<HandTracker> {
  const { FilesetResolver, HandLandmarker, PoseLandmarker } =
    await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  async function withGpuFallback<T>(
    create: (delegate: "GPU" | "CPU") => Promise<T>,
  ) {
    try {
      return await create("GPU");
    } catch {
      return create("CPU");
    }
  }

  const hands: HandLandmarker = await withGpuFallback((delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
    }),
  );
  const pose: PoseLandmarker | null = withHead
    ? await withGpuFallback((delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      )
    : null;

  return {
    detect(video, now) {
      const handResult = hands.detectForVideo(video, now);
      const tracked: Tracked = {
        hands: handResult.landmarks.map((points, i) => {
          const fist = FIST_POINTS.map((p) => points[p]);
          const x = fist.reduce((sum, p) => sum + p.x, 0) / fist.length;
          const y = fist.reduce((sum, p) => sum + p.y, 0) / fist.length;
          return {
            id: handResult.handedness[i]?.[0]?.categoryName || String(i),
            // The video is shown mirrored, so mirror the hand too.
            x: 1 - x,
            y,
            size: Math.hypot(
              points[WRIST].x - points[MIDDLE_KNUCKLE].x,
              points[WRIST].y - points[MIDDLE_KNUCKLE].y,
            ),
          };
        }),
        head: null,
      };
      const nose = pose?.detectForVideo(video, now).landmarks[0]?.[NOSE];
      // Pose models guess hidden landmarks; only trust a nose that is actually visible.
      if (nose && (nose.visibility ?? 1) >= MIN_NOSE_VISIBILITY)
        tracked.head = { x: 1 - nose.x, y: nose.y };
      return tracked;
    },
    close() {
      hands.close();
      pose?.close();
    },
  };
}
