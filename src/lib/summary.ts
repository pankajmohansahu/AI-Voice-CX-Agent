// Post-call summary. Facts (orders, actions, escalation) are derived from tool results in code;
// the LLM only judges intent, resolution, sentiment and writes the summary sentence.
import { extractToolRecords, type ToolRecord } from "./history";
import type { CallSummary, ChatMessage } from "./types";

export const INTENTS = [
  "ORDER_TRACKING",
  "CANCELLATION_REQUEST",
  "RETURN_REQUEST",
  "REPLACEMENT_REQUEST",
  "SHIPPING_QUERY",
  "PAYMENT_QUERY",
  "PRODUCT_QUERY",
  "POLICY_QUERY",
  "OUT_OF_SCOPE",
  "GENERAL_INQUIRY",
] as const;

const RESOLUTIONS = ["RESOLVED", "PARTIALLY_RESOLVED", "UNRESOLVED", "ESCALATED"] as const;
const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
const CONVERSATION_ACTIONS = [
  "POLICY_EXPLAINED",
  "ORDER_ID_REQUESTED",
  "OUT_OF_SCOPE_DECLINED",
  "CLARIFICATION_REQUESTED",
] as const;

export const SUMMARY_SYSTEM_PROMPT = `You analyse completed customer support calls between Aria (Aura Skincare's support agent) and a customer.
Return only a JSON object with exactly these keys:
- "customer_intent": the customer's primary reason for calling, one of ${INTENTS.join(", ")}.
- "order_id": the main order ID discussed (e.g. "ORD-101"), or null if none.
- "resolution_status": one of
    RESOLVED: the customer got a clear, policy-compliant answer or their request was completed. Correctly declining a request under policy, with an explanation, counts as RESOLVED.
    PARTIALLY_RESOLVED: some of the customer's needs were addressed but not all.
    UNRESOLVED: the customer's need was not addressed (e.g. the call ended before an answer, or an order ID was never provided).
    ESCALATED: the issue was handed to the human support team.
- "sentiment": the customer's sentiment by the end of the call, one of POSITIVE, NEUTRAL, NEGATIVE.
- "conversation_actions": array containing any of ${CONVERSATION_ACTIONS.join(", ")} that Aria did.
- "call_summary": 1–3 factual sentences in past tense, third person ("Customer asked…"). Use only facts stated in the transcript.`;

// Readable transcript for the summariser, with tool results inline.
export function transcriptForSummary(history: ChatMessage[]): string {
  const calls = new Map<string, string>();
  const lines: string[] = [];
  for (const m of history) {
    if (m.role === "user") lines.push(`Customer: ${m.content}`);
    else if (m.role === "assistant") {
      if (m.content) lines.push(`Aria: ${m.content}`);
      for (const tc of m.tool_calls ?? []) calls.set(tc.id, `${tc.function.name}(${tc.function.arguments})`);
    } else {
      lines.push(`[Tool ${calls.get(m.tool_call_id) ?? "call"} returned ${m.content}]`);
    }
  }
  return lines.join("\n");
}

function actionsFromTools(records: ToolRecord[]): string[] {
  const actions: string[] = [];
  const label = { cancel: "CANCELLATION", return: "RETURN", replace: "REPLACEMENT" } as Record<string, string>;
  for (const { name, args, result } of records) {
    if (!result) continue;
    if (name === "get_order_details") actions.push(result.found ? "ORDER_STATUS_SHARED" : "ORDER_NOT_FOUND");
    else if (name === "check_action_eligibility" && "eligible" in result) {
      const kind = label[String(args.action)] ?? "ACTION";
      actions.push(result.eligible ? `${kind}_ELIGIBLE` : `${kind}_DENIED`);
    } else if (name === "cancel_order") actions.push(result.success ? "ORDER_CANCELLED" : "CANCELLATION_DENIED");
    else if (name === "escalate_to_human") actions.push("ESCALATED_TO_HUMAN");
  }
  return actions;
}

function ordersFromTools(records: ToolRecord[]): string[] {
  const ids: string[] = [];
  for (const { result } of records) {
    // Only orders that actually exist (lookups that found something).
    if (typeof result?.order_id === "string" && result.found !== false) ids.push(result.order_id);
  }
  return ids;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(value ?? "").toUpperCase().trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const unique = <T,>(items: T[]) => [...new Set(items)];

// Summary for a call where the customer never spoke; no LLM call needed.
export function emptyCallSummary(): CallSummary {
  return {
    customer_intent: "GENERAL_INQUIRY",
    order_id: null,
    related_order_ids: [],
    resolution_status: "UNRESOLVED",
    sentiment: "NEUTRAL",
    escalated: false,
    actions_taken: [],
    call_summary: "The call ended before the customer raised a query.",
  };
}

// Merge the LLM's judgement with facts derived from tool results, and validate every field.
export function buildSummary(llmJson: Record<string, unknown>, history: ChatMessage[]): CallSummary {
  const records = extractToolRecords(history);
  const toolOrders = unique(ordersFromTools(records));
  const escalated = records.some((r) => r.name === "escalate_to_human");

  const llmOrder = typeof llmJson.order_id === "string" ? llmJson.order_id.toUpperCase() : null;
  // Trust the model's choice of main order only if it really came up in a tool result.
  const orderId = llmOrder && toolOrders.includes(llmOrder) ? llmOrder : (toolOrders[0] ?? null);

  const conversationActions = Array.isArray(llmJson.conversation_actions)
    ? llmJson.conversation_actions
        .map((a) => String(a).toUpperCase())
        .filter((a) => (CONVERSATION_ACTIONS as readonly string[]).includes(a))
    : [];

  return {
    customer_intent: pick(llmJson.customer_intent, INTENTS, "GENERAL_INQUIRY"),
    order_id: orderId,
    related_order_ids: toolOrders.filter((id) => id !== orderId),
    resolution_status: escalated ? "ESCALATED" : pick(llmJson.resolution_status, RESOLUTIONS, "UNRESOLVED"),
    sentiment: pick(llmJson.sentiment, SENTIMENTS, "NEUTRAL"),
    escalated,
    actions_taken: unique([...actionsFromTools(records), ...conversationActions]),
    call_summary:
      typeof llmJson.call_summary === "string" && llmJson.call_summary.trim()
        ? llmJson.call_summary.trim().slice(0, 600)
        : "Summary unavailable.",
  };
}
