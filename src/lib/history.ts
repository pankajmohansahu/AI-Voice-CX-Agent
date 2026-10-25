import type { ChatMessage } from "./types";

const MAX_HISTORY = 40;
const MAX_TEXT = 2000;

// Accept only user/assistant/tool messages from the client (never a "system" message),
// cap lengths, and drop orphaned tool results left at the start after trimming.
export function sanitizeHistory(input: unknown, maxMessages = MAX_HISTORY): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const out: ChatMessage[] = [];
  for (const m of input.slice(-maxMessages)) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "user" && typeof m.content === "string") {
      out.push({ role: "user", content: m.content.slice(0, MAX_TEXT) });
    } else if (m.role === "assistant") {
      const toolCalls = Array.isArray(m.tool_calls)
        ? m.tool_calls
            .filter((tc: { id?: unknown; function?: { name?: unknown } }) => typeof tc?.id === "string" && typeof tc?.function?.name === "string")
            .map((tc: { id: string; function: { name: string; arguments?: unknown } }) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: String(tc.function.arguments ?? "{}") },
            }))
        : undefined;
      out.push({
        role: "assistant",
        content: typeof m.content === "string" ? m.content.slice(0, MAX_TEXT) : null,
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      });
    } else if (m.role === "tool" && typeof m.tool_call_id === "string" && typeof m.content === "string") {
      out.push({ role: "tool", tool_call_id: m.tool_call_id, content: m.content.slice(0, MAX_TEXT) });
    }
  }
  while (out[0]?.role === "tool") out.shift();
  return out;
}

export interface ToolRecord {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

// Pair each tool call in the history with its result.
export function extractToolRecords(history: ChatMessage[]): ToolRecord[] {
  const calls = new Map<string, { name: string; args: Record<string, unknown> }>();
  const records: ToolRecord[] = [];
  for (const m of history) {
    if (m.role === "assistant") {
      for (const tc of m.tool_calls ?? []) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // malformed arguments
        }
        calls.set(tc.id, { name: tc.function.name, args });
      }
    } else if (m.role === "tool") {
      const call = calls.get(m.tool_call_id);
      if (!call) continue;
      let result: Record<string, unknown> | null = null;
      try {
        result = JSON.parse(m.content);
      } catch {
        // not JSON
      }
      records.push({ ...call, result });
    }
  }
  return records;
}
