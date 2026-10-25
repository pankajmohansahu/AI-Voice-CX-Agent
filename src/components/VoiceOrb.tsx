import { LoaderCircle, Leaf, MicOff } from "lucide-react";
import type { CallState } from "@/lib/types";

const ORB_STYLES: Record<CallState, { core: string; glow: string; ring: string }> = {
  idle: {
    core: "from-sage-700 via-sage-500 to-sage-300",
    glow: "bg-sage-300/40",
    ring: "border-sage-500/25",
  },
  connecting: {
    core: "from-sage-200 via-sage-100 to-white",
    glow: "bg-sage-200/60",
    ring: "border-sage-500/30",
  },
  listening: {
    core: "from-[#1f6b43] via-listen to-[#86d3a6]",
    glow: "bg-listen/25",
    ring: "border-listen/45",
  },
  thinking: {
    core: "from-[#b45309] via-think to-[#fbc684]",
    glow: "bg-think/25",
    ring: "border-think/40",
  },
  speaking: {
    core: "from-[#5b21b6] via-speak to-[#c4b5fd]",
    glow: "bg-speak/25",
    ring: "border-speak/45",
  },
  error: {
    core: "from-[#fecaca] via-[#fee2e2] to-white",
    glow: "bg-alert/15",
    ring: "border-alert/30",
  },
};

const BAR_SHAPE = [0.45, 0.75, 1, 0.7, 0.5];

// Animated orb showing the agent state. `level` (0–1) is the live audio level:
// the mic while listening, Aria's audio while speaking.
export function VoiceOrb({ state, level = 0 }: { state: CallState; level?: number }) {
  const s = ORB_STYLES[state];
  const active = state === "listening" || state === "speaking";

  return (
    <div className="relative flex size-56 items-center justify-center" aria-hidden>
      <div className={`absolute -inset-6 rounded-full blur-2xl transition-colors duration-500 ${s.glow}`} />

      {active && (
        <>
          <span className={`absolute inset-4 rounded-full border-2 ${s.ring} animate-[orb-ripple_2.4s_ease-out_infinite]`} />
          <span className={`absolute inset-4 rounded-full border-2 ${s.ring} animate-[orb-ripple_2.4s_ease-out_1.2s_infinite]`} />
        </>
      )}
      {state === "connecting" && (
        <span className="absolute inset-1 rounded-full border-2 border-transparent border-t-sage-500 animate-[orb-spin_1.1s_linear_infinite]" />
      )}
      <div className={`absolute inset-2 rounded-full border transition-colors duration-500 ${s.ring}`} />

      <div
        className={`relative flex size-44 items-center justify-center overflow-hidden rounded-full bg-linear-to-br shadow-[0_14px_45px_-10px_rgba(39,83,56,0.4)] transition-transform duration-150 ${s.core} ${
          state === "idle" ? "animate-[orb-breathe_4s_ease-in-out_infinite]" : ""
        }`}
        style={state === "listening" ? { transform: `scale(${1 + level * 0.08})` } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.45),transparent_55%)]" />
        <OrbContent state={state} level={level} />
      </div>
    </div>
  );
}

function OrbContent({ state, level }: { state: CallState; level: number }) {
  switch (state) {
    case "idle":
      return <Leaf className="relative size-12 text-white" />;
    case "connecting":
      return <LoaderCircle className="relative size-10 animate-spin text-sage-600" />;
    case "error":
      return <MicOff className="relative size-11 text-alert" />;
    case "thinking":
      return (
        <div className="relative flex gap-2">
          {[0, 0.15, 0.3].map((delay) => (
            <span
              key={delay}
              className="size-3.5 rounded-full bg-white animate-[dot-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      );
    case "listening":
      // Bars follow the live mic level.
      return (
        <div className="relative flex h-16 items-center gap-1.5">
          {BAR_SHAPE.map((shape, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full bg-white transition-[height] duration-100"
              style={{ height: `${Math.round(64 * shape * (0.3 + level * 0.7))}px` }}
            />
          ))}
        </div>
      );
    case "speaking":
      return (
        <div className="relative flex h-16 items-center gap-1.5">
          {BAR_SHAPE.map((shape, i) => (
            <span
              key={i}
              className="w-1.5 origin-center rounded-full bg-white animate-[wave_0.9s_ease-in-out_infinite]"
              style={{ height: `${Math.round(64 * shape)}px`, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      );
  }
}
