"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GREETING } from "@/lib/brand";
import { streamChat, toolActivityLabel } from "@/lib/chat-client";
import type { CallState, CallView, ChatMessage, SummaryState, TranscriptEntry } from "@/lib/types";
import { SentenceSplitter } from "@/lib/voice/sentence-splitter";
import { MicrophoneError, SpeechInput } from "@/lib/voice/speech-input";
import { SpeechPlayer } from "@/lib/voice/speech-player";

function makeSessionId() {
  return `AR-${Math.floor(1000 + Math.random() * 9000)}`;
}

const CONNECTION_ERROR = "Sorry, I'm having trouble connecting right now. Could you please try again?";
// Spoken while a tool runs, so the customer isn't left in silence during the lookup.
const TOOL_FILLER = "One moment, let me check that.";
const BARGE_IN_MIN_WORDS = 2; // ignore single stray words / echo before interrupting Aria

// Owns the call lifecycle: voice I/O, conversation with the agent, transcript and summary.
//
// Voice loop:  listening ──(customer finishes)──► thinking ──(first audio)──► speaking ──(done)──► listening
// Barge-in:    customer speaks while Aria is speaking → audio stops immediately → listening
export function useCallController() {
  const [screen, setScreen] = useState<CallView["screen"]>("call");
  const [state, setStateValue] = useState<CallState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [summary, setSummary] = useState<SummaryState>({ status: "loading" });

  // Incremented per call so stale callbacks from a previous call are ignored.
  const callIdRef = useRef(0);
  const stateRef = useRef<CallState>("idle");
  // Full LLM conversation (incl. tool calls), sent with every request.
  const historyRef = useRef<ChatMessage[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Current reply in progress, so an interrupted reply can still be kept in the history.
  const turnRef = useRef<{ partial: string; done: boolean } | null>(null);
  const inputRef = useRef<SpeechInput | null>(null);
  const playerRef = useRef<SpeechPlayer | null>(null);
  const voiceRef = useRef(false); // true while the mic + voice pipeline is live
  const utteranceAtRef = useRef<number | null>(null); // when the customer finished speaking

  const setState = useCallback((next: CallState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const inCall = startedAt !== null && endedAt === null;
  const voiceLive = inCall && (state === "listening" || state === "thinking" || state === "speaking");

  useEffect(() => {
    if (!inCall) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  // Audio level for the orb: the mic while listening, Aria's audio while speaking.
  useEffect(() => {
    if (!voiceLive) return;
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (t - last < 66) return; // ~15 updates/s is plenty for the animation
      last = t;
      const s = stateRef.current;
      const value =
        s === "speaking" ? (playerRef.current?.level() ?? 0) : s === "listening" ? (inputRef.current?.level() ?? 0) : 0;
      setLevel(Math.round(value * 20) / 20);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setLevel(0);
    };
  }, [voiceLive]);

  const elapsed = () => Date.now() - (startedAtRef.current ?? Date.now());

  const addEntry = useCallback((role: "agent" | "customer", text: string) => {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "message", role, text, at: Date.now() - (startedAtRef.current ?? Date.now()) },
    ]);
  }, []);

  const stopVoice = useCallback(() => {
    voiceRef.current = false;
    inputRef.current?.stop();
    inputRef.current = null;
    playerRef.current?.stop();
    setInterim("");
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      inputRef.current?.stop();
      playerRef.current?.stop();
    },
    [],
  );

  // Abort the reply in progress, keeping whatever Aria already said in the history.
  const cancelCurrentTurn = useCallback(() => {
    const turn = turnRef.current;
    abortRef.current?.abort();
    if (turn && !turn.done && turn.partial.trim()) {
      historyRef.current = [...historyRef.current, { role: "assistant", content: turn.partial }];
    }
    turnRef.current = null;
  }, []);

  const beginSession = useCallback(() => {
    const t = Date.now();
    callIdRef.current += 1;
    cancelCurrentTurn();
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
    setInterim("");
    setSessionId(makeSessionId());
  }, [cancelCurrentTurn]);

  // One conversational turn: send the customer's message, stream Aria's reply and tool calls,
  // and (in voice mode) speak it sentence by sentence as it arrives.
  const askAgent = useCallback(
    async (text: string) => {
      cancelCurrentTurn();
      const controller = new AbortController();
      abortRef.current = controller;
      const turn = { partial: "", done: false };
      turnRef.current = turn;
      const callId = callIdRef.current;
      const isCurrent = () => callIdRef.current === callId && abortRef.current === controller;

      const player = voiceRef.current ? playerRef.current : null;
      player?.stop(); // a new question always cuts off any previous answer
      const speechTurn = player?.beginTurn() ?? 0;
      const splitter = player ? new SentenceSplitter((s) => player.enqueue(speechTurn, s)) : null;

      historyRef.current = [...historyRef.current, { role: "user", content: text }];
      setState("thinking");
      setActivity(null);

      const sentAt = performance.now();
      let measured = false;
      let fillerSpoken = false;
      let agentEntryId: string | null = null;
      const turnKey = crypto.randomUUID();

      const fail = (message: string) => {
        addEntry("agent", message);
        historyRef.current = [...historyRef.current, { role: "assistant", content: message }];
        splitter?.push(message + " ");
      };

      try {
        await streamChat(historyRef.current, controller.signal, (event) => {
          if (!isCurrent()) return;
          switch (event.type) {
            case "text": {
              turn.partial += event.delta;
              splitter?.push(event.delta);
              // In text mode latency = time to first token; in voice mode it's measured at first audio.
              if (!measured && !player) {
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
              // Voice mode: if Aria hasn't said anything yet this turn, fill the lookup pause.
              if (player && !turn.partial.trim() && !fillerSpoken) {
                fillerSpoken = true;
                player.enqueue(speechTurn, TOOL_FILLER);
                addEntry("agent", TOOL_FILLER);
              }
              agentEntryId = null; // text after a tool call starts a new bubble
              setActivity(toolActivityLabel(event.name, event.args));
              setEntries((prev) => [
                ...prev,
                { id: `${turnKey}-${event.id}`, kind: "tool", name: event.name, args: event.args, status: "pending", at: elapsed() },
              ]);
              break;
            case "tool_result":
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === `${turnKey}-${event.id}` && e.kind === "tool"
                    ? { ...e, status: event.ok ? "success" : "failure", result: event.display }
                    : e,
                ),
              );
              setActivity(null);
              break;
            case "done":
              turn.done = true;
              historyRef.current = [...historyRef.current, ...event.messages];
              break;
            case "error":
              turn.done = true;
              fail(event.message);
              break;
          }
        });
      } catch {
        if (!isCurrent()) return;
        turn.done = true;
        fail(CONNECTION_ERROR);
      }

      if (!isCurrent()) return;
      setActivity(null);
      if (player) {
        splitter?.flush();
        player.endTurn(speechTurn); // the player switches back to listening once everything is spoken
      } else {
        setState("listening");
      }
    },
    [addEntry, cancelCurrentTurn, setState],
  );

  const handleUtterance = useCallback(
    (text: string) => {
      utteranceAtRef.current = performance.now();
      addEntry("customer", text);
      void askAgent(text);
    },
    [addEntry, askAgent],
  );

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      const player = new SpeechPlayer();
      player.onStart = () => {
        if (!voiceRef.current) return;
        if (utteranceAtRef.current !== null) {
          setLatencyMs(performance.now() - utteranceAtRef.current);
          utteranceAtRef.current = null;
        }
        setState("speaking");
      };
      player.onIdle = () => {
        if (voiceRef.current && (stateRef.current === "speaking" || stateRef.current === "thinking")) {
          setState("listening");
        }
      };
      playerRef.current = player;
    }
    return playerRef.current;
  }, [setState]);

  const start = useCallback(async () => {
    beginSession();
    setState("connecting");
    const callId = callIdRef.current;
    const player = getPlayer();

    const input = new SpeechInput({
      onInterim: (text) => {
        if (callIdRef.current === callId) setInterim(text);
      },
      onSpeech: (text) => {
        // Barge-in: the customer starts talking over Aria → stop speaking and listen.
        if (callIdRef.current !== callId || stateRef.current !== "speaking") return;
        if (text.split(/\s+/).filter(Boolean).length < BARGE_IN_MIN_WORDS) return;
        player.stop();
        setState("listening");
      },
      onUtterance: (text) => {
        if (callIdRef.current === callId) handleUtterance(text);
      },
      onError: (message) => {
        if (callIdRef.current !== callId) return;
        stopVoice();
        setError(message);
        setState("error");
      },
    });

    try {
      await player.unlock();
      await input.start();
    } catch (err) {
      input.stop();
      if (callIdRef.current !== callId) return;
      setError(err instanceof MicrophoneError || err instanceof Error ? err.message : "Couldn't start the call.");
      setState("error");
      return;
    }
    if (callIdRef.current !== callId) {
      input.stop();
      return;
    }

    inputRef.current = input;
    voiceRef.current = true;
    // Speak the greeting; the player moves to "listening" when it finishes.
    setState("thinking");
    const greetingTurn = player.beginTurn();
    player.enqueue(greetingTurn, GREETING);
    player.endTurn(greetingTurn);
  }, [beginSession, getPlayer, handleUtterance, setState, stopVoice]);

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
    cancelCurrentTurn();
    stopVoice();
    setEndedAt(Date.now());
    setState("idle");
    setActivity(null);
    setScreen("summary");
    void loadSummary();
  }, [cancelCurrentTurn, loadSummary, setState, stopVoice]);

  // Typed messages work with or without a voice call; during a call Aria also speaks the reply.
  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!inCall) beginSession(); // typing without an active call starts a text session
      utteranceAtRef.current = voiceRef.current ? performance.now() : null;
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
    cancelCurrentTurn();
    stopVoice();
    startedAtRef.current = null;
    historyRef.current = [];
    setScreen("call");
    setState("idle");
    setEntries([]);
    setStartedAt(null);
    setEndedAt(null);
    setSessionId(null);
    setLatencyMs(null);
    setError(null);
    setSummary({ status: "loading" });
  }, [cancelCurrentTurn, setState, stopVoice]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      inputRef.current?.setMuted(!m);
      return !m;
    });
  }, []);

  const view: CallView = {
    screen,
    state,
    entries,
    interim,
    muted,
    level,
    activity,
    error,
    latencyMs,
    sessionId,
    elapsedMs: startedAt ? (endedAt ?? now) - startedAt : 0,
    summary,
  };

  return { view, start, end, sendText, newCall, toggleMute, retrySummary: loadSummary };
}
