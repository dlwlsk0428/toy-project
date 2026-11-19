/**
 * In-memory relay between a phone and a computer screen, keyed by room code.
 * It lives in the dev server process, which is enough for a local bonus game.
 */

export type PhoneEvent =
  { type: "hello" } | { type: "punch"; power: number; at: number };

type Listener = (event: PhoneEvent) => void;

// Keep rooms on globalThis so hot reloads and separate route modules share them.
const store = globalThis as typeof globalThis & {
  __punchRooms?: Map<string, Set<Listener>>;
};
const rooms: Map<string, Set<Listener>> = (store.__punchRooms ??= new Map());

export function publish(room: string, event: PhoneEvent): void {
  rooms.get(room)?.forEach((listener) => listener(event));
}

export function subscribe(room: string, listener: Listener): () => void {
  const listeners = rooms.get(room) ?? new Set<Listener>();
  listeners.add(listener);
  rooms.set(room, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) rooms.delete(room);
  };
}

export function isPhoneEvent(value: unknown): value is PhoneEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (event.type === "hello") return true;
  return (
    event.type === "punch" &&
    typeof event.power === "number" &&
    typeof event.at === "number"
  );
}
