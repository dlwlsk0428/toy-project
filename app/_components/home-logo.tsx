"use client";

import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { PowerBonus } from "@/features/punch-power";

/** The home logo. Punching the boxer's glove opens the hidden punch-power bonus. */
export function HomeLogo({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <BrandLogo className={className} onFistClick={() => setOpen(true)} />
      <PowerBonus open={open} onOpenChange={setOpen} />
    </>
  );
}
