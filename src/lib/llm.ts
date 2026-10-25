import OpenAI from "openai";
import { env } from "./env";

// Groq exposes an OpenAI-compatible API, so the official SDK works by changing the base URL.
// Switching providers later is a config change, not a rewrite.
export const llm = new OpenAI({
  apiKey: env.groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

// gpt-oss models are reasoning models; "low" keeps latency suitable for voice.
export const reasoningOptions = env.llmModel.startsWith("openai/gpt-oss")
  ? { reasoning_effort: "low" as const }
  : {};
