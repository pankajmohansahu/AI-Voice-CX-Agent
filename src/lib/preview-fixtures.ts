// Development-only sample data for reviewing each UI state.
// Open e.g. http://localhost:3000/?preview=speaking. Never used in production builds.
import type { CallState, CallView, TranscriptEntry } from "./types";

const SAMPLE_ENTRIES: TranscriptEntry[] = [
  { id: "1", kind: "message", role: "agent", text: "Hi! I'm Aria from Aura Skincare. How can I help you today?", at: 0 },
  { id: "2", kind: "message", role: "customer", text: "Hi, where is my order ORD-101?", at: 5000 },
  { id: "3", kind: "tool", name: "get_order_details", args: { order_id: "ORD-101" }, status: "success", result: "Out for Delivery", at: 7000 },
  {
    id: "4",
    kind: "message",
    role: "agent",
    text: "Your Vitamin C Serum is out for delivery with BlueDart and should reach you by 6 PM today. Anything else I can help with?",
    at: 8000,
  },
  { id: "5", kind: "message", role: "customer", text: "I also want to return my sunscreen, order 102.", at: 28000 },
  {
    id: "6",
    kind: "tool",
    name: "check_action_eligibility",
    args: { order_id: "ORD-102", action: "return" },
    status: "failure",
    result: "Not eligible",
    at: 31000,
  },
  {
    id: "7",
    kind: "message",
    role: "agent",
    text: "I'm sorry, returns are accepted within 7 days of delivery, and ORD-102 was delivered 14 days ago, so it isn't eligible for a return.",
    at: 33000,
  },
];

const BASE: CallView = {
  screen: "call",
  state: "idle",
  entries: [],
  interim: "",
  muted: false,
  level: 0,
  activity: null,
  error: null,
  latencyMs: null,
  sessionId: null,
  elapsedMs: 0,
  summary: { status: "loading" },
};

const LIVE = { entries: SAMPLE_ENTRIES, sessionId: "AR-4821", elapsedMs: 42000, latencyMs: 1200 };

export const PREVIEWS: Record<string, CallView> = {
  idle: BASE,
  connecting: { ...BASE, state: "connecting" },
  listening: { ...BASE, ...LIVE, state: "listening" as CallState, level: 0.6, interim: "can I also ask about cash on" },
  thinking: { ...BASE, ...LIVE, state: "thinking", activity: "Looking up ORD-102…" },
  speaking: { ...BASE, ...LIVE, state: "speaking" },
  error: {
    ...BASE,
    state: "error",
    error: "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then try again.",
  },
  summary: {
    ...BASE,
    ...LIVE,
    screen: "summary",
    elapsedMs: 63000,
    summary: {
      status: "ready",
      data: {
        customer_intent: "ORDER_TRACKING",
        order_id: "ORD-101",
        related_order_ids: ["ORD-102"],
        resolution_status: "RESOLVED",
        sentiment: "POSITIVE",
        escalated: false,
        actions_taken: ["ORDER_STATUS_SHARED", "RETURN_POLICY_EXPLAINED"],
        call_summary:
          "Customer asked about the delivery status of ORD-101; it is out for delivery with BlueDart and expected by 6 PM today. They also asked to return ORD-102, which was declined because it was delivered 14 days ago, outside the 7-day return window.",
      },
    },
  },
  "summary-loading": { ...BASE, ...LIVE, screen: "summary", elapsedMs: 63000 },
};
