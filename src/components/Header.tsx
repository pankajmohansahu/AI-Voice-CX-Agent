"use client";

import { useEffect, useState } from "react";
import { Languages, Leaf } from "lucide-react";

type Health = "checking" | "ok" | "partial" | "down";

const HEALTH_UI: Record<Health, { label: string; dot: string; pill: string }> = {
  checking: { label: "Checking services…", dot: "bg-muted/50", pill: "bg-sage-50 text-muted" },
  ok: { label: "All systems operational", dot: "bg-listen", pill: "bg-[#e3f4ea] text-[#1f6b43]" },
  partial: { label: "Voice services not configured", dot: "bg-think", pill: "bg-[#fdf0dc] text-[#92400e]" },
  down: { label: "Service unavailable", dot: "bg-alert", pill: "bg-[#fde8e8] text-[#991b1b]" },
};

export function Header() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: { services: Record<string, boolean> }) => {
        const values = Object.values(data.services);
        setHealth(values.every(Boolean) ? "ok" : data.services.llm ? "partial" : "down");
      })
      .catch(() => setHealth("down"));
  }, []);

  const h = HEALTH_UI[health];

  return (
    <header className="sticky top-0 z-40 border-b border-sage-500/10 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-sage-500 text-white">
            <Leaf className="size-5" aria-hidden />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-sage-700">
            Aura Skincare
          </span>
          <span className="hidden h-5 w-px bg-sage-500/20 sm:block" />
          <span className="hidden truncate text-sm text-muted sm:block">Aria · AI Voice Support</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${h.pill}`}
            title="Backend status (from /api/health)"
          >
            <span className={`size-2 rounded-full ${h.dot}`} />
            <span className="hidden md:inline">{h.label}</span>
          </span>
          <span className="hidden items-center gap-1.5 rounded-full bg-sage-50 px-3 py-1 text-xs text-muted lg:flex">
            <Languages className="size-3.5 text-sage-500" aria-hidden />
            English · Hinglish
          </span>
        </div>
      </div>
    </header>
  );
}
