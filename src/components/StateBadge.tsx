import { STATE_META } from "@/lib/call-states";
import type { CallState } from "@/lib/types";

// State pill + helper line under the orb. Announced to screen readers on change.
export function StateBadge({
  state,
  activity,
  error,
}: {
  state: CallState;
  activity?: string | null;
  error?: string | null;
}) {
  const meta = STATE_META[state];
  const hint = state === "error" ? (error ?? meta.hint) : (activity ?? meta.hint);

  return (
    <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
      <span className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-sm font-semibold ${meta.pill}`}>
        <span className="relative flex size-2">
          {state !== "idle" && state !== "error" && (
            <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${meta.dot}`} />
          )}
          <span className={`relative inline-flex size-2 rounded-full ${meta.dot}`} />
        </span>
        {meta.label}
      </span>
      <p className="max-w-xs text-center text-sm text-muted">{hint}</p>
    </div>
  );
}
