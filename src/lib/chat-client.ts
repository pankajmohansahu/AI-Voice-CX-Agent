import type { ChatMessage, ChatStreamEvent } from "./types";

// Sends the conversation to /api/chat and calls onEvent for each streamed NDJSON event.
export async function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as ChatStreamEvent);
    }
  }
}

// Status line shown under the orb while a tool runs.
export function toolActivityLabel(name: string, args: Record<string, unknown>): string {
  const id = typeof args.order_id === "string" ? args.order_id.toUpperCase() : "your order";
  switch (name) {
    case "get_order_details":
      return `Looking up ${id}…`;
    case "check_action_eligibility":
      return `Checking if ${id} can be ${args.action === "cancel" ? "cancelled" : args.action === "replace" ? "replaced" : "returned"}…`;
    case "cancel_order":
      return `Cancelling ${id}…`;
    case "escalate_to_human":
      return "Raising a ticket with our support team…";
    default:
      return "Working on it…";
  }
}
