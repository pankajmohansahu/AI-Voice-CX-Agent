"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GREETING } from "@/lib/brand";
import { streamChat, toolActivityLabel } from "@/lib/chat-client";
import type { CallState, CallView, ChatMessage, SummaryState, TranscriptEntry } from "@/lib/types";

function makeSessionId() {
  return `AR-${Math.floor(1000 + Math.random() * 9000)}`;
}

const CONNECTION_ERROR = "Sorry, I'm having trouble connecting right now. Could you please try again?";

// Owns the call lifecycle, transcript, conversation with the agent and post-call summary.
// Voice (Step D) plugs in here.
export function useCallController() {
  const [screen, setScreen] = useState<CallView["screen"]>("call");
  const [state, setState] = useState<CallState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [muted, setMuted] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [summary, setSummary] = useState<SummaryState>({ status: "loading" });

  // Incremented per call so stale timers/streams from a previous call are ignored.
  const callIdRef = useRef(0);
  // Full LLM conversation (incl. tool calls), sent with every request.
  const historyRef = useRef<ChatMessage[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const inCall = startedAt !== null && endedAt === null;

  useEffect(() => {
    if (!inCall) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const elapsed = () => Date.now() - (startedAtRef.current ?? Date.now());

  const addAgentMessage = useCallback((text: string) => {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "message", role: "agent", text, at: Date.now() - (startedAtRef.current ?? Date.now()) },
    ]);
  }, []);

  const beginSession = useCallback(() => {
    const t = Date.now();
    callIdRef.current += 1;
    abortRef.current?.abort();
    startedAtRef.current = t;
    historyRef.current = [{ role: "assistant", content: GREETING }];
    setStartedAt(t);
    setNow(t);
    setEndedAt(null);
    setEntries([{ id: crypto.randomUUID(), kind: "message", role: "agent", text: GREETING, at: 0 }]);
    setError(null);
    setActivity(null);
    setLatencyMs(null);
    setMuted(false);
    setSessionId(makeSessionId());
  }, []);

  // One conversational turn: send the customer's message, stream Aria's reply and tool calls.
  const askAgent = useCallback(
    async (text: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const callId = callIdRef.current;
      const isCurrent = () => callIdRef.current === callId && abortRef.current === controller;

      historyRef.current = [...historyRef.current, { role: "user", content: text }];
      setState("thinking");
      setActivity(null);

      const sentAt = performance.now();
      let measured = false;
      let agentEntryId: string | null = null;
      const turnId = crypto.randomUUID();

      try {
        await streamChat(historyRef.current, controller.signal, (event) => {
          if (!isCurrent()) return;
          switch (event.type) {
            case "text": {
              if (!measured) {
                measured = true;
                setLatencyMs(performance.now() - sentAt);
              }
              if (!agentEntryId) {
                const id = crypto.randomUUID();
                agentEntryId = id;
                setEntries((prev) => [...prev, { id, kind: "message", role: "agent", text: event.delta, at: elapsed() }]);
              } else {
                const id = agentEntryId;
                setEntries((prev) =>
                  prev.map((e) => (e.id === id && e.kind === "message" ? { ...e, text: e.text + event.delta } : e)),
                );
              }
              break;
            }
            case "tool_call":
              agentEntryId = null; // text after a tool call starts a new bubble
              setActivity(toolActivityLabel(event.name, event.args));
              setEntries((prev) => [
                ...prev,
                { id: `${turnId}-${event.id}`, kind: "tool", name: event.name, args: event.args, status: "pending", at: elapsed() },
              ]);
              break;
            case "tool_result":
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === `${turnId}-${event.id}` && e.kind === "tool"
                    ? { ...e, status: event.ok ? "success" : "failure", result: event.display }
                    : e,
                ),
              );
              setActivity(null);
              break;
            case "done":
              historyRef.current = [...historyRef.current, ...event.messages];
              break;
            case "error":
              addAgentMessage(event.message);
              historyRef.current = [...historyRef.current, { role: "assistant", content: event.message }];
              break;
          }
        });
      } catch {
        if (!isCurrent()) return;
        addAgentMessage(CONNECTION_ERROR);
        historyRef.current = [...historyRef.current, { role: "assistant", content: CONNECTION_ERROR }];
      }

      if (isCurrent()) {
        setState("listening");
        setActivity(null);
      }
    },
    [addAgentMessage],
  );

  const start = useCallback(() => {
    beginSession();
    setState("connecting");
    const id = callIdRef.current;
    // Placeholder until the mic + Deepgram connection is wired in (Step D).
    setTimeout(() => {
      if (callIdRef.current === id) setState("listening");
    }, 700);
  }, [beginSession]);

  // Generate the structured outcome from the full conversation history.
  const loadSummary = useCallback(async () => {
    const callId = callIdRef.current;
    setSummary({ status: "loading" });
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyRef.current }),
      });
      const data = await res.json();
      if (callIdRef.current !== callId) return;
      if (!res.ok || !data.summary) throw new Error(data.error);
      setSummary({ status: "ready", data: data.summary });
    } catch {
      if (callIdRef.current === callId) {
        setSummary({ status: "error", message: "Couldn't generate the call summary. Please try again." });
      }
    }
  }, []);

  const end = useCallback(() => {
    callIdRef.current += 1;
    abortRef.current?.abort();
    setEndedAt(Date.now());
    setState("idle");
    setActivity(null);
    setScreen("summary");
    void loadSummary();
  }, [loadSummary]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!inCall) beginSession(); // typing without an active call starts a text session
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "message", role: "customer", text: trimmed, at: elapsed() },
      ]);
      void askAgent(trimmed);
    },
    [askAgent, beginSession, inCall],
  );

  const newCall = useCallback(() => {
    callIdRef.current += 1;
    abortRef.current?.abort();
    startedAtRef.current = null;
    historyRef.current = [];
    setScreen("call");
    setState("idle");
    setEntries([]);
    setStartedAt(null);
    setEndedAt(null);
    setSessionId(null);
    setLatencyMs(null);
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
    activity,
    error,
    latencyMs,
    sessionId,
    elapsedMs: startedAt ? (endedAt ?? now) - startedAt : 0,
    summary,
  };

  return { view, start, end, sendText, newCall, toggleMute, retrySummary: loadSummary };
}
