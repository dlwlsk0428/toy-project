"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  lastName,
  loadRecords,
  rememberName,
  saveRecord,
} from "@/lib/local-records";
import { cn } from "@/lib/utils";

const SHOWN = 5;
const MAX_NAME = 12;

/** A saved record must carry the player's name and when it was made. */
type Saved = { name: string; at: number };

/**
 * Saves this run under a name (in this browser) and shows the best runs.
 * Each game passes its own storage key, ordering and display.
 */
export function RecordBoard<T extends Saved>({
  storageKey,
  makeRecord,
  compare,
  show,
}: {
  storageKey: string;
  /** Builds this run's record once the player gives a name. */
  makeRecord: (name: string, at: number) => T;
  compare: (a: T, b: T) => number;
  /** The main figure and a short detail line for one record. */
  show: (record: T) => { value: string; detail?: string };
}) {
  // The board only appears after a game, in the browser, so storage is available here.
  const [records, setRecords] = useState<T[]>(() => loadRecords<T>(storageKey));
  const [name, setName] = useState(lastName);
  const [saved, setSaved] = useState<{ at: number; rank: number } | null>(null);

  const save = () => {
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) return;
    const record = makeRecord(trimmed, Date.now());
    const rank = saveRecord(storageKey, record, compare);
    rememberName(trimmed);
    setRecords(loadRecords<T>(storageKey));
    setSaved({ at: record.at, rank });
  };

  return (
    <div className="flex flex-col gap-3">
      {saved ? (
        <p className="text-sm font-medium">
          {saved.rank > 0
            ? `${saved.rank}위로 기록을 저장했습니다!`
            : "기록을 저장했습니다."}
        </p>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor={`${storageKey}-name`}>이름</Label>
            <Input
              id={`${storageKey}-name`}
              value={name}
              maxLength={MAX_NAME}
              placeholder="기록에 남길 이름"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!name.trim()}>
            기록 저장
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          이 브라우저의 기록 (상위 {SHOWN}개)
        </p>
        {records.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
            아직 저장된 기록이 없습니다. 첫 기록을 남겨 보세요!
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {records.slice(0, SHOWN).map((record, i) => {
              const { value, detail } = show(record);
              return (
                <li
                  key={`${record.at}-${i}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm",
                    saved?.at === record.at && "ring-2 ring-primary",
                  )}
                >
                  <span className="w-6 font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">
                    {record.name}
                    {detail && (
                      <span className="ml-2 text-muted-foreground">
                        {detail}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">{value}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
