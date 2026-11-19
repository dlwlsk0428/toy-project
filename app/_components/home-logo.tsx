"use client";

import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { PowerBonus } from "@/features/punch-power";
import { createHandTracker } from "@/features/punch-rhythm";

// The bonus counts punches with the same hand tracker as the rhythm game; no head needed.
const createHandSource = () => createHandTracker({ withHead: false });

/** The home logo. Punching the boxer's glove opens the hidden sandbag bonus. */
export function HomeLogo({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <BrandLogo className={className} onFistClick={() => setOpen(true)} />
      <PowerBonus
        open={open}
        onOpenChange={setOpen}
        createHandSource={createHandSource}
      />
    </>
  );
}
