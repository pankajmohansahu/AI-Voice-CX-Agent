"use client";

import { CircleAlert, CircleCheck, Download, LoaderCircle, MessageSquareText, Phone, RotateCcw, User, Wrench } from "lucide-react";
import { AriaAvatar } from "./AriaAvatar";
import { JsonViewer } from "./JsonViewer";
import { downloadFile, formatDuration, toolCallLabel, transcriptToText } from "@/lib/format";
import type { CallSummary, CallView, TranscriptEntry } from "@/lib/types";

const RESOLUTION_PILL: Record<CallSummary["resolution_status"], string> = {
  RESOLVED: "bg-sage-500 text-white",
  PARTIALLY_RESOLVED: "bg-[#fdf0dc] text-[#92400e]",
  UNRESOLVED: "bg-[#fde8e8] text-[#991b1b]",
  ESCALATED: "bg-[#efe9fe] text-[#5b21b6]",
};

const SENTIMENT_LABEL: Record<CallSummary["sentiment"], string> = {
  POSITIVE: "Positive 😊",
  NEUTRAL: "Neutral 😐",
  NEGATIVE: "Negative 😟",
};

export function SummaryScreen({
  view,
  onNewCall,
  onRetrySummary,
}: {
  view: CallView;
  onNewCall: () => void;
  onRetrySummary: () => void;
}) {
  const turns = view.entries.filter((e) => e.kind === "message" && e.role === "customer").length;
  const fileBase = `aria-call-${view.sessionId ?? "session"}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Banner */}
      <section className="flex flex-col gap-4 rounded-3xl bg-linear-to-br from-sage-100 to-white p-6 shadow-card md:flex-row md:items-center md:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-500 px-3 py-1 text-xs font-semibold text-white">
            <CircleCheck className="size-3.5" aria-hidden /> Call ended
          </span>
          <h1 className="mt-3 font-display text-2xl font-medium tracking-tight text-sage-700 md:text-3xl">
            Duration {formatDuration(view.elapsedMs)} · {turns} customer {turns === 1 ? "turn" : "turns"}
          </h1>
          {view.sessionId && <p className="mt-1 text-sm text-muted">Session {view.sessionId}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onNewCall}
            className="flex items-center gap-2 rounded-full bg-sage-500 px-5 py-3 font-display font-semibold text-white shadow-md transition hover:bg-sage-600"
          >
            <Phone className="size-4" aria-hidden /> Start New Call
          </button>
          <button
            onClick={() => downloadFile(`${fileBase}.txt`, transcriptToText(view.entries), "text/plain")}
            disabled={view.entries.length === 0}
            className="flex items-center gap-2 rounded-full bg-white px-5 py-3 font-display font-semibold text-sage-700 shadow-sm transition hover:bg-sage-50 disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden /> Download transcript
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <TranscriptTimeline entries={view.entries} />

        <div className="flex flex-col gap-6">
          {view.summary.status === "loading" && (
            <div className="flex items-center gap-3 rounded-3xl bg-white p-6 text-muted shadow-card">
              <LoaderCircle className="size-5 animate-spin text-sage-500" aria-hidden />
              Generating call summary…
            </div>
          )}
          {view.summary.status === "error" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-6 text-muted shadow-card">
              <span className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-think" aria-hidden />
                {view.summary.message}
              </span>
              <button
                onClick={onRetrySummary}
                className="flex items-center gap-1.5 rounded-full bg-sage-100 px-4 py-2 text-sm font-semibold text-sage-700 transition hover:bg-sage-200"
              >
                <RotateCcw className="size-4" aria-hidden /> Retry
              </button>
            </div>
          )}
          {view.summary.status === "ready" && (
            <>
              <OutcomeCard summary={view.summary.data} />
              <JsonViewer data={view.summary.data} filename={`${fileBase}.json`} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TranscriptTimeline({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-card" aria-label="Call transcript">
      <h2 className="mb-5 flex items-center gap-2 font-display text-lg font-semibold">
        <MessageSquareText className="size-5 text-sage-500" aria-hidden /> Call Transcript
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nothing was said during this call.</p>
      ) : (
        <ol className="relative flex flex-col gap-5 border-l border-sage-300/60 pl-6">
          {entries.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-0.5 -left-[38px]">
                {e.kind === "tool" ? (
                  <span className="flex size-7 items-center justify-center rounded-full bg-[#fffaf0] text-[#92400e] ring-1 ring-think/30">
                    <Wrench className="size-3.5" aria-hidden />
                  </span>
                ) : e.role === "agent" ? (
                  <AriaAvatar size={28} />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-700">
                    <User className="size-3.5" aria-hidden />
                  </span>
                )}
              </span>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-sage-700">
                  {e.kind === "tool" ? "Tool call" : e.role === "agent" ? "Aria" : "Customer"}
                </span>
                <span className="font-mono text-muted">{formatDuration(e.at)}</span>
              </div>
              {e.kind === "tool" ? (
                <p className="rounded-xl bg-[#fffaf0] px-3 py-2 font-mono text-xs text-[#92400e]">
                  {toolCallLabel(e.name, e.args)}
                  {e.result ? ` → ${e.result}` : ""}
                </p>
              ) : (
                <p
                  className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    e.role === "agent" ? "bg-sage-50" : "border border-sage-500/15"
                  }`}
                >
                  {e.text}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function OutcomeCard({ summary }: { summary: CallSummary }) {
  const orders = [summary.order_id, ...(summary.related_order_ids ?? [])].filter(
    (id, i, all): id is string => Boolean(id) && all.indexOf(id) === i,
  );

  return (
    <section className="rounded-3xl bg-white p-6 shadow-card" aria-label="Call outcome">
      <h2 className="mb-4 font-display text-lg font-semibold">Call Outcome</h2>
      <dl className="divide-y divide-sage-500/10 text-sm">
        <Row label="Customer intent">
          <span className="rounded-full bg-sage-100 px-3 py-1 font-mono text-xs font-semibold text-sage-700">
            {summary.customer_intent}
          </span>
        </Row>
        <Row label={orders.length > 1 ? "Orders" : "Order"}>
          {orders.length ? (
            <span className="flex flex-wrap justify-end gap-1.5">
              {orders.map((id) => (
                <span key={id} className="rounded-md bg-sage-50 px-2 py-0.5 font-mono text-xs font-semibold">
                  {id}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted">None</span>
          )}
        </Row>
        <Row label="Resolution">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RESOLUTION_PILL[summary.resolution_status]}`}>
            {summary.resolution_status.replace("_", " ")}
          </span>
        </Row>
        <Row label="Sentiment">{SENTIMENT_LABEL[summary.sentiment]}</Row>
        <Row label="Escalated to human">{summary.escalated ? "Yes" : "No"}</Row>
        <Row label="Actions taken">
          <span className="flex flex-wrap justify-end gap-1.5">
            {summary.actions_taken.length ? (
              summary.actions_taken.map((a) => (
                <span key={a} className="rounded-full border border-sage-500/20 px-2 py-0.5 font-mono text-[11px]">
                  {a}
                </span>
              ))
            ) : (
              <span className="text-muted">None</span>
            )}
          </span>
        </Row>
      </dl>
      <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Summary</h3>
      <p className="rounded-2xl bg-sage-50 p-4 leading-relaxed">{summary.call_summary}</p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
