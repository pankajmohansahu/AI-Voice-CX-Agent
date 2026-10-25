"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallState, CallView, SummaryState, TranscriptEntry } from "@/lib/types";

function makeSessionId() {
  return `AR-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Owns the call lifecycle and transcript.
// Step A: UI-only. The agent (Step B), summary (Step C) and voice (Step D) plug in here.
export function useCallController() {
  const [screen, setScreen] = useState<CallView["screen"]>("call");
  const [state, setState] = useState<CallState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [summary, setSummary] = useState<SummaryState>({ status: "loading" });

  // Incremented per call so stale timers from a previous call are ignored.
  const callIdRef = useRef(0);
  const inCall = startedAt !== null && endedAt === null;

  useEffect(() => {
    if (!inCall) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  const beginSession = useCallback(() => {
    const t = Date.now();
    callIdRef.current += 1;
    setStartedAt(t);
    setNow(t);
    setEndedAt(null);
    setEntries([]);
    setError(null);
    setMuted(false);
    setSessionId(makeSessionId());
    return t;
  }, []);

  const start = useCallback(() => {
    beginSession();
    setState("connecting");
    const id = callIdRef.current;
    // Placeholder until the mic + Deepgram connection is wired in (Step D).
    setTimeout(() => {
      if (callIdRef.current === id) setState("listening");
    }, 700);
  }, [beginSession]);

  const end = useCallback(() => {
    callIdRef.current += 1;
    setEndedAt(Date.now());
    setState("idle");
    setScreen("summary");
    // Placeholder until /api/summary is wired in (Step C).
    setSummary({ status: "error", message: "Summary generation will be connected in the next step." });
  }, []);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      let t0 = startedAt;
      if (!inCall || t0 === null) {
        // Typing without an active call starts a text session.
        t0 = beginSession();
        setState("listening");
      }
      const at = Date.now() - t0;
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "message", role: "customer", text: trimmed, at },
      ]);
    },
    [beginSession, inCall, startedAt],
  );

  const newCall = useCallback(() => {
    callIdRef.current += 1;
    setScreen("call");
    setState("idle");
    setEntries([]);
    setStartedAt(null);
    setEndedAt(null);
    setSessionId(null);
    setSummary({ status: "loading" });
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const view: CallView = {
    screen,
    state,
    entries,
    interim: "",
    muted,
    level: 0,
    activity: null,
    error,
    latencyMs: null,
    sessionId,
    elapsedMs: startedAt ? (endedAt ?? now) - startedAt : 0,
    summary,
  };

  return { view, start, end, sendText, newCall, toggleMute };
}
