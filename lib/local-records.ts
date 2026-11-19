/**
 * Keeps game records in this browser (localStorage) until there is a server.
 * Each game uses its own key and its own ordering.
 */

const MAX_RECORDS = 20;

export function loadRecords<T>(key: string): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

/** Saves a record in order and returns its rank (1 = best), or 0 if it did not make the list. */
export function saveRecord<T>(
  key: string,
  record: T,
  compare: (a: T, b: T) => number,
): number {
  const list = [...loadRecords<T>(key), record]
    .sort(compare)
    .slice(0, MAX_RECORDS);
  localStorage.setItem(key, JSON.stringify(list));
  return list.indexOf(record) + 1;
}

const NAME_KEY = "punch:last-name";

/** The name the player typed last time, so they need not type it again. */
export function lastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}
