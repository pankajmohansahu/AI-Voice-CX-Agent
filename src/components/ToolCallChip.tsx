import { LoaderCircle, Wrench } from "lucide-react";
import { toolCallLabel } from "@/lib/format";

const RESULT_STYLE = {
  pending: "bg-sage-100 text-muted",
  success: "bg-[#e3f4ea] text-[#1f6b43]",
  failure: "bg-[#fde8e8] text-[#991b1b]",
};

// Shows a tool the agent called and its outcome, inline in the transcript.
export function ToolCallChip({
  name,
  args,
  status,
  result,
}: {
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "success" | "failure";
  result?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-think/25 bg-[#fffaf0] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-[#92400e]">
        <Wrench className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{toolCallLabel(name, args)}</span>
      </span>
      <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[status]}`}>
        {status === "pending" ? (
          <>
            <LoaderCircle className="size-3 animate-spin" aria-hidden /> Running…
          </>
        ) : (
          result
        )}
      </span>
    </div>
  );
}
