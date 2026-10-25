import { env } from "@/lib/env";

// POST /api/deepgram-token — short-lived token so the browser can stream mic audio
// straight to Deepgram without ever seeing our API key.
export async function POST() {
  if (!env.deepgramApiKey) {
    return Response.json({ error: "Speech-to-text is not configured (DEEPGRAM_API_KEY missing)" }, { status: 503 });
  }
  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${env.deepgramApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });
    if (!res.ok) {
      console.error("[/api/deepgram-token]", res.status, await res.text());
      return Response.json({ error: "Could not start speech recognition" }, { status: 502 });
    }
    const { access_token } = await res.json();
    return Response.json({ token: access_token }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[/api/deepgram-token]", err);
    return Response.json({ error: "Could not start speech recognition" }, { status: 502 });
  }
}
