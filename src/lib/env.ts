// Server-side configuration. Only import this from Route Handlers or other
// server code — these values must never reach the browser bundle.

export const env = {
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
  sarvamApiKey: process.env.SARVAM_API_KEY ?? "",
  ttsModel: process.env.TTS_MODEL || "bulbul:v2",
  ttsSpeaker: process.env.TTS_SPEAKER || "anushka",
};

// Which services have a key configured (used by /api/health).
export function configuredServices() {
  return {
    llm: Boolean(env.groqApiKey),
    stt: Boolean(env.deepgramApiKey),
    tts: Boolean(env.sarvamApiKey),
  };
}
