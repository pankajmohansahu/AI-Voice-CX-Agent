"use client";

import { Check, ChevronDown, Copy, Package, ShieldCheck, Sparkles, Send } from "lucide-react";
import { useCopy } from "@/hooks/useCopy";
import { POLICIES } from "@/lib/brand";
import { formatINR } from "@/lib/format";
import { ORDERS, type OrderStatus } from "@/lib/orders";
import { ORDER_PROMPTS, SCENARIOS } from "@/lib/scenarios";

const STATUS_PILL: Record<OrderStatus, string> = {
  Processing: "bg-[#fdf0dc] text-[#92400e]",
  Shipped: "bg-[#e0ecff] text-[#1e4fa8]",
  "Out for Delivery": "bg-[#e0ecff] text-[#1e4fa8]",
  Delivered: "bg-[#e3f4ea] text-[#1f6b43]",
};

// Helper panel so evaluators can test lookups and policies without external docs.
export function TestOrdersPanel({
  onAsk,
  className = "",
}: {
  onAsk: (prompt: string) => void;
  className?: string;
}) {
  const { copiedKey, copy } = useCopy();

  return (
    <aside className={`flex flex-col gap-4 ${className}`} aria-label="Test helpers">
      <div className="rounded-3xl bg-white p-5 shadow-card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Test Orders</h2>
            <p className="text-sm text-muted">Use these IDs to try order lookups.</p>
          </div>
          <Package className="size-5 text-sage-500" aria-hidden />
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {ORDERS.map((order) => (
            <article key={order.id} className="flex flex-col gap-2 rounded-2xl bg-sage-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => copy(order.id, order.id)}
                  className="flex items-center gap-1.5 font-mono text-sm font-semibold text-ink"
                  title="Copy order ID"
                >
                  {order.id}
                  {copiedKey === order.id ? (
                    <Check className="size-3.5 text-listen" aria-label="Copied" />
                  ) : (
                    <Copy className="size-3.5 text-muted" aria-hidden />
                  )}
                </button>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <div className="text-sm">
                <p className="text-muted">{order.customerName}</p>
                <p className="font-medium">
                  {order.product} · {formatINR(order.amount)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {order.courier ? `${order.courier} ${order.trackingId} · ` : ""}
                  {order.note}
                </p>
              </div>
              <button
                onClick={() => onAsk(ORDER_PROMPTS[order.id])}
                className="group mt-1 flex items-center justify-between gap-2 rounded-xl border border-sage-500/10 bg-white px-3 py-2 text-left text-xs transition hover:border-sage-500/40"
              >
                <span className="italic text-muted">
                  Try: <span className="text-ink">“{ORDER_PROMPTS[order.id]}”</span>
                </span>
                <Send className="size-3.5 shrink-0 text-sage-500 transition group-hover:translate-x-0.5" aria-hidden />
              </button>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-card">
        <h2 className="mb-1 flex items-center gap-2 font-display font-semibold">
          <Sparkles className="size-4 text-terracotta-500" aria-hidden /> Try These Scenarios
        </h2>
        <p className="mb-3 text-xs text-muted">Click to send as a message, or say it out loud during a call.</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.label}
              onClick={() => onAsk(s.prompt)}
              title={s.prompt}
              className="rounded-full bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-700 transition hover:bg-sage-200"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <details className="group rounded-3xl bg-white p-5 shadow-card" open>
        <summary className="flex cursor-pointer list-none items-center justify-between font-display font-semibold">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-sage-500" aria-hidden /> Brand Policies
          </span>
          <ChevronDown className="size-4 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="mt-3 flex flex-col gap-3 text-sm">
          {POLICIES.map((p) => (
            <div key={p.key}>
              <dt className="font-medium">{p.title}</dt>
              <dd className="text-muted">{p.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </aside>
  );
}
