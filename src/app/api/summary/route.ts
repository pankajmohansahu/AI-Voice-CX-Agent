import { env } from "@/lib/env";
import { sanitizeHistory } from "@/lib/history";
import { llm, reasoningOptions } from "@/lib/llm";
import { buildSummary, emptyCallSummary, SUMMARY_SYSTEM_PROMPT, transcriptForSummary } from "@/lib/summary";

// POST /api/summary — structured outcome for a finished call.
// Body: { messages: ChatMessage[] } (the full conversation history from the browser).
export async function POST(req: Request) {
  let history;
  try {
    history = sanitizeHistory((await req.json())?.messages, 200);
  } catch {
    history = null;
  }
  if (!history) return Response.json({ error: "Expected { messages: [...] }" }, { status: 400 });

  if (!history.some((m) => m.role === "user")) {
    return Response.json({ summary: emptyCallSummary() });
  }
  if (!env.groqApiKey) {
    return Response.json({ error: "LLM is not configured (GROQ_API_KEY missing)" }, { status: 503 });
  }

  try {
    const completion = await llm.chat.completions.create({
      model: env.llmModel,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: `Call transcript:\n${transcriptForSummary(history)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 800,
      ...reasoningOptions,
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return Response.json({ summary: buildSummary(parsed && typeof parsed === "object" ? parsed : {}, history) });
  } catch (err) {
    console.error("[/api/summary]", err);
    return Response.json({ error: "Could not generate the call summary." }, { status: 502 });
  }
}
