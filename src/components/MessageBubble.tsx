import { User } from "lucide-react";
import { AriaAvatar } from "./AriaAvatar";
import { formatDuration } from "@/lib/format";

export function MessageBubble({
  role,
  text,
  at,
}: {
  role: "customer" | "agent";
  text: string;
  at: number;
}) {
  if (role === "agent") {
    return (
      <div className="flex max-w-[88%] gap-3">
        <AriaAvatar size={32} className="mt-5" />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">
            Aria <span className="ml-1 font-mono text-[11px] opacity-70">{formatDuration(at)}</span>
          </span>
          <p className="rounded-2xl rounded-tl-md bg-sage-50 px-4 py-3 text-[15px] leading-relaxed text-ink">
            {text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-auto flex max-w-[88%] flex-row-reverse gap-3">
      <span className="mt-5 flex size-8 shrink-0 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-700">
        <User className="size-4" aria-hidden />
      </span>
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs font-medium text-muted">
          <span className="mr-1 font-mono text-[11px] opacity-70">{formatDuration(at)}</span> You
        </span>
        <p className="rounded-2xl rounded-tr-md border border-sage-500/15 bg-white px-4 py-3 text-[15px] leading-relaxed text-ink">
          {text}
        </p>
      </div>
    </div>
  );
}
