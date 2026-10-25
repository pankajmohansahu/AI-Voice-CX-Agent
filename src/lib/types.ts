// Shared types for the call UI and (later) the API routes.

export type CallState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type TranscriptEntry =
  | {
      id: string;
      kind: "message";
      role: "customer" | "agent";
      text: string;
      at: number; // ms since call start
    }
  | {
      id: string;
      kind: "tool";
      name: string;
      args: Record<string, unknown>;
      status: "pending" | "success" | "failure";
      result?: string; // short human-readable outcome, e.g. "Out for Delivery"
      at: number;
    };

export interface CallSummary {
  customer_intent: string;
  order_id: string | null;
  related_order_ids?: string[];
  resolution_status: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED" | "ESCALATED";
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  escalated: boolean;
  actions_taken: string[];
  call_summary: string;
}

export type SummaryState =
  | { status: "loading" }
  | { status: "ready"; data: CallSummary }
  | { status: "error"; message: string };

// Everything the UI needs to render one moment of a call.
export interface CallView {
  screen: "call" | "summary";
  state: CallState;
  entries: TranscriptEntry[];
  interim: string; // customer speech still being recognised
  muted: boolean;
  level: number; // 0–1 audio level driving the orb
  activity: string | null; // e.g. "Looking up ORD-101…"
  error: string | null;
  latencyMs: number | null; // last measured end-of-speech → first audio
  sessionId: string | null;
  elapsedMs: number;
  summary: SummaryState;
}
