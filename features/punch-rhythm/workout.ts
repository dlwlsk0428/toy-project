import type { CueSpeed, Counts, Settings } from "./game";

/** What one finished workout leaves behind, kept in this browser. */
export type Session = {
  at: number;
  accuracy: number;
  punches: number;
  activeMs: number;
  maxCombo: number;
  label: string;
};

const SESSIONS_KEY = "punch:sessions";
const MAX_SESSIONS = 200;
// Light shadow boxing burns roughly this much per minute; it is only an estimate.
const KCAL_PER_MINUTE = 6;

export function loadSessions(): Session[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(SESSIONS_KEY) ?? "[]",
    );
    return Array.isArray(value) ? (value as Session[]) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  try {
    const list = [...loadSessions(), session].slice(-MAX_SESSIONS);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
  } catch {
    // Storage can be full or blocked; the workout itself still counted.
  }
}

/** Punches that landed: perfect and good hits. */
export function punchesOf(counts: Counts): number {
  return counts.perfect + counts.good;
}

export function estimateKcal(activeMs: number): number {
  return Math.round((activeMs / 60_000) * KCAL_PER_MINUTE);
}

function dayStart(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function todayCount(sessions: Session[], now: number): number {
  const today = dayStart(now);
  return sessions.filter((s) => dayStart(s.at) === today).length;
}

/** Days in a row with a workout, counted back from today (or yesterday if none yet today). */
export function streakDays(sessions: Session[], now: number): number {
  const days = new Set(sessions.map((s) => dayStart(s.at)));
  let day = dayStart(now);
  if (!days.has(day)) day = dayStart(day - 1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    // Midnight minus 1 ms is the previous day, even across DST shifts.
    day = dayStart(day - 1);
  }
  return streak;
}

export function gradeOf(accuracy: number): string {
  if (accuracy >= 90) return "챔피언";
  if (accuracy >= 70) return "스파링";
  return "워밍업";
}

/** Change from the previous workout, and whether this one beats all earlier ones. */
export function compareWithHistory(
  before: Session[],
  accuracy: number,
): { delta: number | null; best: boolean } {
  if (before.length === 0) return { delta: null, best: false };
  const previous = before[before.length - 1].accuracy;
  const top = Math.max(...before.map((s) => s.accuracy));
  return { delta: accuracy - previous, best: accuracy > top };
}

const SPEEDS: CueSpeed[] = ["slow", "normal", "fast"];

/** The next settings worth trying after this accuracy, or null when the current ones fit. */
export function recommendSettings(
  settings: Settings,
  accuracy: number,
): { settings: Settings; reason: string } | null {
  const step = SPEEDS.indexOf(settings.cueSpeed);
  if (accuracy >= 85) {
    if (step < SPEEDS.length - 1) {
      return {
        settings: { ...settings, cueSpeed: SPEEDS[step + 1] },
        reason: "정확도가 높습니다. 원 속도를 한 단계 올려 보세요.",
      };
    }
    if (settings.difficulty === "normal") {
      return {
        settings: { ...settings, difficulty: "hard" },
        reason: "가장 빠른 속도도 잘 맞췄습니다. 빨간 불빛이 나오는 어려움에 도전해 보세요.",
      };
    }
    return null;
  }
  if (accuracy < 50 && step > 0) {
    return {
      settings: { ...settings, cueSpeed: SPEEDS[step - 1] },
      reason: "타이밍이 많이 어긋났습니다. 원 속도를 한 단계 낮춰 보세요.",
    };
  }
  return null;
}
