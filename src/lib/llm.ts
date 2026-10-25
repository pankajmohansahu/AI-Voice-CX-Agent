import OpenAI from "openai";
import { env } from "./env";

// Groq exposes an OpenAI-compatible API, so the official SDK works by changing the base URL.
// Switching providers later is a config change, not a rewrite.
let client: OpenAI | null = null;
let clientKey = "";

export function getLLM(): OpenAI {
  if (!client || clientKey !== env.groqApiKey) {
    clientKey = env.groqApiKey;
    client = new OpenAI({ apiKey: clientKey, baseURL: "https://api.groq.com/openai/v1" });
  }
  return client;
}

// gpt-oss models are reasoning models; "low" keeps latency suitable for voice.
export function reasoningOptions() {
  return env.llmModel.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" as const } : {};
}
