// Server-side configuration. Only import this from Route Handlers or other
// server code — these values must never reach the browser bundle.
// Getters read process.env on each access, so edits to .env.local apply without stale values.

export const env = {
  get groqApiKey() {
    return process.env.GROQ_API_KEY ?? "";
  },
  get llmModel() {
    return process.env.LLM_MODEL || "openai/gpt-oss-120b";
  },
  get deepgramApiKey() {
    return process.env.DEEPGRAM_API_KEY ?? "";
  },
  get sarvamApiKey() {
    return process.env.SARVAM_API_KEY ?? "";
  },
  get ttsModel() {
    return process.env.TTS_MODEL || "bulbul:v3";
  },
  get ttsSpeaker() {
    return process.env.TTS_SPEAKER || "priya";
  },
};

// Which services have a key configured (used by /api/health).
export function configuredServices() {
  return {
    llm: Boolean(env.groqApiKey),
    stt: Boolean(env.deepgramApiKey),
    tts: Boolean(env.sarvamApiKey),
  };
}
