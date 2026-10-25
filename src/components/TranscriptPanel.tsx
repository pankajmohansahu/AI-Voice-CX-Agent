"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, Copy, MessageSquareText, Send } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { ToolCallChip } from "./ToolCallChip";
import { useCopy } from "@/hooks/useCopy";
import { transcriptToText } from "@/lib/format";
import type { CallView } from "@/lib/types";

export function TranscriptPanel({
  view,
  onSend,
  composerRef,
  className = "",
}: {
  view: CallView;
  onSend: (text: string) => void;
  composerRef: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const { entries, interim } = view;
  const live = view.state === "listening" || view.state === "thinking" || view.state === "speaking";
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [draft, setDraft] = useState("");
  const { copiedKey, copy } = useCopy();

  // Auto-scroll on new content, unless the user has scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [entries, interim]);

  function handleScroll() {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <section
      className={`flex h-[640px] flex-col overflow-hidden rounded-3xl bg-white shadow-card xl:h-[calc(100vh-8rem)] xl:max-h-[860px] ${className}`}
      aria-label="Live transcript"
    >
      <div className="flex items-center justify-between border-b border-sage-500/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Live Transcript</h2>
          {live && (
            <span className="flex items-center gap-1 rounded-full bg-[#e3f4ea] px-2 py-0.5 text-[11px] font-semibold text-[#1f6b43]">
              <span className="size-1.5 animate-pulse rounded-full bg-listen" /> LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view.sessionId && (
            <span className="hidden rounded-md bg-sage-50 px-2 py-1 font-mono text-[11px] text-muted sm:inline">
              {view.sessionId}
            </span>
          )}
          <button
            onClick={() => copy("transcript", transcriptToText(entries))}
            disabled={entries.length === 0}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-sage-50 disabled:opacity-40"
          >
            {copiedKey === "transcript" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiedKey === "transcript" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {entries.length === 0 && !interim ? (
          <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-sage-50 text-sage-500">
              <MessageSquareText className="size-6" aria-hidden />
            </span>
            <p className="font-display font-semibold">Your conversation will appear here</p>
            <p className="text-sm text-muted">
              Start a call and speak, or type a message below. Not sure what to ask? Pick a scenario from{" "}
              <span className="font-medium text-sage-700">Test Orders</span>.
            </p>
          </div>
        ) : (
          entries.map((e) =>
            e.kind === "message" ? (
              <MessageBubble key={e.id} role={e.role} text={e.text} at={e.at} />
            ) : (
              <ToolCallChip key={e.id} name={e.name} args={e.args} status={e.status} result={e.result} />
            ),
          )
        )}
        {interim && (
          <p className="ml-auto max-w-[80%] rounded-2xl border border-dashed border-sage-500/25 px-4 py-2 text-[15px] italic text-muted">
            {interim}
            <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-muted animate-[caret-blink_1s_step-end_infinite]" />
          </p>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-sage-500/10 px-4 py-3">
        <input
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message to Aria…"
          aria-label="Type a message to Aria"
          className="min-w-0 flex-1 rounded-xl border border-sage-500/15 bg-sage-50 px-4 py-2.5 text-sm outline-none transition focus:border-sage-500 focus:ring-3 focus:ring-sage-500/15"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send message"
          className="flex size-10 items-center justify-center rounded-xl bg-sage-500 text-white transition hover:bg-sage-600 disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
    </section>
  );
}
