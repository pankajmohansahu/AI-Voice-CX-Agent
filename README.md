# Aria — AI Voice CX Agent for Aura Skincare

Browser-based voice customer support agent for a fictional D2C skincare brand.

**Stack:** Next.js (React + Route Handlers) on Vercel · Deepgram STT · Groq LLM · Sarvam TTS

> Work in progress — full architecture notes, design decisions and the
> "How I think" answers will be added in the final phase.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in your API keys
npm run dev                  # http://localhost:3000
```

Check which keys are configured: `GET http://localhost:3000/api/health`

## Project structure

```
src/
  app/
    page.tsx          UI (call screen)
    api/              backend Route Handlers (chat, tts, summary, deepgram-token, health)
  components/         React UI components
  hooks/              browser-side voice logic (mic, STT stream, audio playback)
  lib/                server-side logic (brand policies, orders, tools, prompt, env)
```
