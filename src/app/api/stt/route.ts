import { env } from "@/lib/env";

const MAX_BYTES = 2 * 1024 * 1024; // ~60 s of 16 kHz mono PCM

// POST /api/stt — re-transcribe a short WAV clip in English (India).
// Used as a fallback when live multi-language transcription returns the wrong script.
export async function POST(req: Request) {
  if (!env.deepgramApiKey) {
    return Response.json({ error: "Speech-to-text is not configured" }, { status: 503 });
  }
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAX_BYTES) {
    return Response.json({ error: "Expected a WAV clip under 2 MB" }, { status: 400 });
  }
  try {
    const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=en-IN&smart_format=true", {
      method: "POST",
      headers: { Authorization: `Token ${env.deepgramApiKey}`, "Content-Type": "audio/wav" },
      body: audio,
    });
    if (!res.ok) {
      console.error("[/api/stt]", res.status, await res.text());
      return Response.json({ error: "Transcription failed" }, { status: 502 });
    }
    const data = await res.json();
    const transcript: string = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return Response.json({ transcript });
  } catch (err) {
    console.error("[/api/stt]", err);
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }
}
