import { env } from "@/lib/env";
import { toSpeakable } from "@/lib/speakable";

const MAX_TEXT = 500;

// POST /api/tts — one sentence of Aria's reply → WAV audio (Sarvam Bulbul, Indian voice).
// The Sarvam key stays on the server.
export async function POST(req: Request) {
  if (!env.sarvamApiKey) {
    return Response.json({ error: "Text-to-speech is not configured (SARVAM_API_KEY missing)" }, { status: 503 });
  }

  let text: unknown;
  try {
    text = (await req.json())?.text;
  } catch {
    text = null;
  }
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Expected { text: string }" }, { status: 400 });
  }

  const speakable = toSpeakable(text.trim().slice(0, MAX_TEXT));
  try {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": env.sarvamApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: speakable,
        // Devanagari text is spoken in Hindi; everything else (incl. romanised Hinglish) as Indian English.
        target_language_code: /[ऀ-ॿ]/.test(speakable) ? "hi-IN" : "en-IN",
        speaker: env.ttsSpeaker,
        model: env.ttsModel,
        pace: 1.05,
      }),
      signal: req.signal,
    });
    if (!res.ok) {
      console.error("[/api/tts]", res.status, await res.text());
      return Response.json({ error: "Speech synthesis failed" }, { status: 502 });
    }
    const audio = (await res.json())?.audios?.[0];
    if (typeof audio !== "string") return Response.json({ error: "Speech synthesis failed" }, { status: 502 });
    return new Response(Buffer.from(audio, "base64"), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (!req.signal.aborted) console.error("[/api/tts]", err);
    return Response.json({ error: "Speech synthesis failed" }, { status: 502 });
  }
}
