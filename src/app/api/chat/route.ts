import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "@/lib/env";
import { extractToolRecords, sanitizeHistory } from "@/lib/history";
import { getLLM, reasoningOptions } from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/prompt";
import { executeTool, TOOL_DEFINITIONS, type ToolContext } from "@/lib/tools";
import type { ChatMessage, ChatStreamEvent } from "@/lib/types";

const MAX_TOOL_ROUNDS = 5; // hard stop so a confused model can never loop forever

const FALLBACK_REPLY = "Sorry, I didn't quite get that. Could you please say it again?";
const GOODBYE = "Thank you for calling Aura Skincare. Have a great day!";
const ERROR_REPLY ="Sorry, I'm having a little trouble right now. Could you please try again in a moment?";

// POST /api/chat — one conversational turn.
// Body: { messages: ChatMessage[] } (full history, kept by the browser).
// Streams NDJSON events: text deltas, tool calls/results, then "done" with the new messages.
export async function POST(req: Request) {
  if (!env.groqApiKey) {
    return Response.json({ error: "LLM is not configured (GROQ_API_KEY missing)" }, { status: 503 });
  }

  let history: ChatMessage[] | null;
  try {
    history = sanitizeHistory((await req.json())?.messages);
  } catch {
    history = null;
  }
  if (!history || history.length === 0) {
    return Response.json({ error: "Expected { messages: [...] }" }, { status: 400 });
  }

  const ctx: ToolContext = { cancelledOrderIds: findCancelledOrders(history) };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // client disconnected
        }
      };
      const newMessages: ChatMessage[] = [];

      try {
        let finished = false;
        for (let round = 0; round < MAX_TOOL_ROUNDS && !finished; round++) {
          const completion = await getLLM().chat.completions.create(
            {
              model: env.llmModel,
              messages: [
                { role: "system", content: buildSystemPrompt() },
                ...(history as ChatCompletionMessageParam[]),
                ...(newMessages as ChatCompletionMessageParam[]),
              ],
              tools: TOOL_DEFINITIONS,
              stream: true,
              temperature: 0.3,
              max_completion_tokens: 800,
              ...reasoningOptions(),
            },
            { signal: req.signal },
          );

          let text = "";
          const calls: { id: string; name: string; args: string }[] = [];
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              text += delta.content;
              send({ type: "text", delta: delta.content });
            }
            // Tool calls arrive in fragments; stitch them together by index.
            for (const tc of delta.tool_calls ?? []) {
              const slot = (calls[tc.index] ??= { id: "", name: "", args: "" });
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name += tc.function.name;
              if (tc.function?.arguments) slot.args += tc.function.arguments;
            }
          }

          const toolCalls = calls.filter(Boolean);
          if (toolCalls.length === 0) {
            if (!text.trim()) {
              text = FALLBACK_REPLY;
              send({ type: "text", delta: text });
            }
            newMessages.push({ role: "assistant", content: text });
            finished = true;
            break;
          }

          newMessages.push({
            role: "assistant",
            content: text || null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          });
          for (const c of toolCalls) {
            const args = parseArgs(c.args);
            send({ type: "tool_call", id: c.id, name: c.name, args });
            const outcome = executeTool(c.name, args, ctx);
            send({ type: "tool_result", id: c.id, name: c.name, ok: outcome.ok, display: outcome.display });
            newMessages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(outcome.result) });
          }

          // Hanging up needs no further LLM round: use the goodbye already said, or a default one.
          if (toolCalls.some((c) => c.name === "end_call")) {
            if (!text.trim()) {
              send({ type: "text", delta: GOODBYE });
              newMessages.push({ role: "assistant", content: GOODBYE });
            }
            finished = true;
            break;
          }
        }

        if (!finished) {
          send({ type: "text", delta: ERROR_REPLY });
          newMessages.push({ role: "assistant", content: ERROR_REPLY });
        }
        send({ type: "done", messages: newMessages });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[/api/chat]", err);
          send({ type: "error", message: ERROR_REPLY });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// The server keeps no state, so rebuild "orders cancelled in this call" from earlier tool results.
function findCancelledOrders(history: ChatMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const { name, result } of extractToolRecords(history)) {
    if (name === "cancel_order" && result?.success === true && typeof result.order_id === "string") {
      ids.add(result.order_id);
    }
  }
  return ids;
}
