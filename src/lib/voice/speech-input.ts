// Microphone → Deepgram live transcription over a WebSocket.
// Reports interim captions, detects when the customer has finished an utterance,
// and exposes the live mic level for the orb.

export interface SpeechInputHandlers {
  onInterim: (text: string) => void; // live caption ("" clears it)
  onSpeech: (text: string) => void; // words detected while speaking (used for barge-in)
  onUtterance: (text: string) => void; // customer finished speaking
  onError: (message: string) => void; // connection lost mid-call
}

const DEEPGRAM_PARAMS = new URLSearchParams({
  model: "nova-3",
  language: "multi", // English + Hindi code-switching (Hinglish)
  smart_format: "true",
  interim_results: "true",
  endpointing: "600", // ms of silence that ends a phrase (people pause mid-sentence, e.g. before reading an ID)
  utterance_end_ms: "1000", // backup end-of-utterance signal for noisy audio
  vad_events: "true",
});

const COMMIT_AFTER_SILENCE_MS = 1000;
// Latin (English / romanised Hinglish) and Devanagari (Hindi), plus digits and punctuation.
const DISPLAYABLE = /^[\p{Script=Latin}\p{Script=Devanagari}\p{N}\p{P}\p{Zs}₹]+$/u;

export class MicrophoneError extends Error {}

function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Connect one and try again, or type to Aria instead.";
  }
  return "Couldn't access the microphone. Please try again, or type to Aria instead.";
}

export class SpeechInput {
  private stream: MediaStream | null = null;
  private socket: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples = new Float32Array(1024);
  private finals: string[] = [];
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInterim = ""; // latest not-yet-final words
  private finalizing = false; // a Finalize request is in flight
  private stopped = false;

  constructor(private readonly handlers: SpeechInputHandlers) {}

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      throw new MicrophoneError(micErrorMessage(err));
    }

    // Mic level meter for the orb.
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.audioContext.createMediaStreamSource(this.stream).connect(this.analyser);

    const res = await fetch("/api/deepgram-token", { method: "POST" });
    const { token } = await res.json().catch(() => ({}));
    if (!res.ok || !token) throw new Error("Couldn't connect to speech recognition. Please try again.");

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${DEEPGRAM_PARAMS}`, ["bearer", token]);
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("Couldn't connect to speech recognition. Please try again."));
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onclose = () => {
        if (!this.stopped) this.handlers.onError("The voice connection was lost. Please start a new call.");
      };
    });

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.socket?.readyState === WebSocket.OPEN) this.socket.send(e.data);
    };
    this.recorder.start(100); // send audio every 100 ms
  }

  // Muting disables the track, so silence keeps streaming and the connection stays alive.
  setMuted(muted: boolean) {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  level(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const s of this.samples) sum += s * s;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 6);
  }

  stop() {
    this.stopped = true;
    this.clearCommitTimer();
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
      this.socket.close();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioContext?.close();
    this.socket = null;
    this.recorder = null;
    this.stream = null;
  }

  private handleMessage(raw: string) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "Results") {
      const transcript: string = data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (data.is_final && transcript) this.finals.push(transcript);
      this.pendingInterim = data.is_final ? "" : transcript;

      if (transcript) {
        // Backup end-of-turn: once the words stop changing, force Deepgram to finalise now
        // rather than waiting for its own (sometimes slow) end-of-speech signal.
        this.clearCommitTimer();
        this.commitTimer = setTimeout(() => this.finalizeNow(), COMMIT_AFTER_SILENCE_MS);
      }

      const caption = [...this.finals, this.pendingInterim].filter(Boolean).join(" ");
      // Language auto-detection can briefly guess the wrong script; don't show those flickers.
      if (!caption || DISPLAYABLE.test(caption)) this.handlers.onInterim(caption);
      if (transcript) this.handlers.onSpeech(caption);

      if (data.speech_final || (this.finalizing && data.is_final && !this.pendingInterim)) this.commit();
    } else if (data.type === "UtteranceEnd") {
      this.commit();
    }
  }

  private finalizeNow() {
    this.commitTimer = null;
    if (!this.pendingInterim) return this.commit();
    // Words are still unconfirmed: ask Deepgram to finalise them; the final result commits.
    this.finalizing = true;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "Finalize" }));
  }

  private clearCommitTimer() {
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = null;
  }

  private commit() {
    this.clearCommitTimer();
    this.finalizing = false;
    this.pendingInterim = "";
    const text = this.finals.join(" ").trim();
    this.finals = [];
    this.handlers.onInterim("");
    if (text) this.handlers.onUtterance(text);
  }
}
