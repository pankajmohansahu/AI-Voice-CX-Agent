import { Keyboard, Lightbulb, LoaderCircle, Mic, MicOff, Phone, PhoneOff, RotateCcw, Zap } from "lucide-react";
import { AriaAvatar } from "./AriaAvatar";
import { StateBadge } from "./StateBadge";
import { VoiceOrb } from "./VoiceOrb";
import { formatDuration } from "@/lib/format";
import type { CallView } from "@/lib/types";

export function CallPanel({
  view,
  onStart,
  onEnd,
  onToggleMute,
  onTypeInstead,
  className = "",
}: {
  view: CallView;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onTypeInstead: () => void;
  className?: string;
}) {
  const { state } = view;
  const inCall = state === "listening" || state === "thinking" || state === "speaking";

  return (
    <section className={`flex flex-col gap-4 ${className}`} aria-label="Call controls">
      <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-white p-6 text-center shadow-card">
        <div className="pointer-events-none absolute -top-16 left-1/2 size-80 -translate-x-1/2 rounded-full bg-linear-to-b from-sage-200/50 to-transparent blur-3xl" />

        {/* Agent identity */}
        <div className="relative flex w-full items-center gap-3 text-left">
          <AriaAvatar size={52} />
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold leading-tight">Aria</p>
            <p className="text-sm text-muted">Customer Support Specialist · Aura Skincare</p>
          </div>
        </div>

        <div className="relative my-8">
          <VoiceOrb state={state} level={view.level} />
        </div>

        <StateBadge state={state} activity={view.activity} error={view.error} />

        {/* Timer */}
        <div className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl bg-sage-50 px-4 py-2.5">
          <span className="font-mono text-lg font-semibold tracking-wider text-sage-700">
            {formatDuration(view.elapsedMs)}
          </span>
          <span className="h-4 w-px bg-sage-500/20" />
          <span className="text-xs text-muted">{inCall ? "Call in progress" : "Not connected"}</span>
        </div>

        {/* Primary action: exactly one visible at a time */}
        <div className="mt-5 w-full">
          {inCall ? (
            <button
              onClick={onEnd}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-alert py-3.5 font-display font-semibold text-white shadow-md transition hover:bg-[#b91c1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alert active:scale-[0.98]"
            >
              <PhoneOff className="size-5" aria-hidden /> End Call
            </button>
          ) : state === "connecting" ? (
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-full bg-sage-100 py-3.5 font-display font-semibold text-muted"
            >
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> Connecting…
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-sage-500 py-3.5 font-display font-semibold text-white shadow-md transition hover:bg-sage-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-500 active:scale-[0.98]"
            >
              {state === "error" ? (
                <>
                  <RotateCcw className="size-5" aria-hidden /> Try Again
                </>
              ) : (
                <>
                  <Phone className="size-5" aria-hidden /> Start Call
                </>
              )}
            </button>
          )}
        </div>

        {/* Secondary controls */}
        <div className="mt-3 flex w-full gap-2">
          <button
            onClick={onToggleMute}
            disabled={!inCall}
            aria-pressed={view.muted}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sage-50 px-3 py-2 text-sm text-ink transition hover:bg-sage-100 disabled:opacity-50"
          >
            {view.muted ? (
              <MicOff className="size-4 text-alert" aria-hidden />
            ) : (
              <Mic className="size-4 text-sage-500" aria-hidden />
            )}
            {view.muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={onTypeInstead}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sage-50 px-3 py-2 text-sm text-ink transition hover:bg-sage-100"
          >
            <Keyboard className="size-4 text-sage-500" aria-hidden /> Type instead
          </button>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <Lightbulb className="size-3.5 text-terracotta-500" aria-hidden />
          You can interrupt Aria anytime: just start speaking.
        </p>
      </div>

      {/* Pipeline + measured latency */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sage-50 px-4 py-3 text-xs text-muted">
        <span>
          <span className="font-medium text-ink">Pipeline:</span> Deepgram STT → Groq LLM → Sarvam TTS
        </span>
        {view.latencyMs !== null && (
          <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium text-sage-700">
            <Zap className="size-3.5" aria-hidden /> Last response {(view.latencyMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </section>
  );
}
