// Microphone → Deepgram live transcription over a WebSocket.
// Reports interim captions, detects when the customer has finished an utterance,
// and exposes the live mic level for the orb.

export interface SpeechInputHandlers {
  onInterim: (text: string) => void; // live caption ("" clears it)
  onSpeech: (text: string) => void; // words detected while speaking (used for barge-in)
  onUtterance: (text: string) => void; // customer finished speaking
  onError: (message: string) => void; // connection lost mid-call
}

const SAMPLE_RATE = 16000;

const DEEPGRAM_PARAMS = new URLSearchParams({
  model: "nova-3",
  language: "multi", // English + Hindi code-switching (Hinglish)
  smart_format: "true",
  interim_results: "true",
  endpointing: "600", // ms of silence that ends a phrase (people pause mid-sentence, e.g. before reading an ID)
  utterance_end_ms: "1000", // backup end-of-utterance signal for noisy audio
  vad_events: "true",
  // Raw PCM rather than compressed Opus: language detection is noticeably more reliable
  // (Opus input sometimes came back transcribed in the wrong Indian script).
  encoding: "linear16",
  sample_rate: String(SAMPLE_RATE),
  channels: "1",
});

// Audio worklet that forwards raw mic samples to the main thread.
const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

const COMMIT_AFTER_SILENCE_MS = 1000;
const KEEP_AUDIO_SECONDS = 30;
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
  private worklet: AudioWorkletNode | null = null;
  private pcmBuffer: number[] = []; // 16 kHz samples waiting to be sent
  private recent: { offset: number; pcm: Int16Array }[] = []; // last few seconds of sent audio
  private sentSamples = 0;
  private utteranceStart: number | null = null; // seconds on Deepgram's timeline
  private utteranceEnd = 0;
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

    // Mic level meter for the orb + raw sample capture.
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    const source = this.audioContext.createMediaStreamSource(this.stream);
    source.connect(this.analyser);
    const moduleUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
    await this.audioContext.audioWorklet.addModule(moduleUrl);
    URL.revokeObjectURL(moduleUrl);
    this.worklet = new AudioWorkletNode(this.audioContext, "pcm-capture");
    source.connect(this.worklet);
    // Keep the worklet in the rendering graph without making the mic audible.
    const silent = this.audioContext.createGain();
    silent.gain.value = 0;
    this.worklet.connect(silent).connect(this.audioContext.destination);

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

    const inputRate = this.audioContext.sampleRate;
    this.worklet.port.onmessage = (e: MessageEvent<Float32Array>) => this.sendAudio(e.data, inputRate);
  }

  // Downsample to 16 kHz, convert to 16-bit PCM and send in ~100 ms chunks.
  private sendAudio(frame: Float32Array, inputRate: number) {
    const ratio = inputRate / SAMPLE_RATE;
    for (let i = 0; i < frame.length / ratio; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(frame.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += frame[j];
      this.pcmBuffer.push(end > start ? sum / (end - start) : 0);
    }
    if (this.pcmBuffer.length < SAMPLE_RATE / 10) return;
    const pcm = new Int16Array(this.pcmBuffer.length);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, this.pcmBuffer[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.pcmBuffer = [];
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(pcm.buffer);
    // Keep recent audio (indexed by Deepgram's stream timeline) for the wrong-script fallback.
    this.recent.push({ offset: this.sentSamples, pcm });
    this.sentSamples += pcm.length;
    while (this.recent.length && this.recent[0].offset < this.sentSamples - KEEP_AUDIO_SECONDS * SAMPLE_RATE) {
      this.recent.shift();
    }
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
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet?.disconnect();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
      this.socket.close();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioContext?.close();
    this.socket = null;
    this.worklet = null;
    this.pcmBuffer = [];
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
      if (data.is_final && transcript) {
        this.finals.push(transcript);
        this.utteranceStart ??= data.start;
        this.utteranceEnd = data.start + data.duration;
      }
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
    const start = this.utteranceStart;
    const end = this.utteranceEnd;
    this.finals = [];
    this.utteranceStart = null;
    this.handlers.onInterim("");
    if (!text) return;
    if (DISPLAYABLE.test(text) || start === null) this.handlers.onUtterance(text);
    else void this.retranscribe(text, start, end);
  }

  // Live multi-language detection occasionally writes English in another Indian script.
  // Re-transcribe that utterance's audio in English (India) and use the result instead.
  private async retranscribe(original: string, startSec: number, endSec: number) {
    const from = Math.max(0, Math.floor((startSec - 0.3) * SAMPLE_RATE));
    const to = Math.floor((endSec + 0.3) * SAMPLE_RATE);
    const pieces: Int16Array[] = [];
    for (const { offset, pcm } of this.recent) {
      const s = Math.max(from, offset);
      const e = Math.min(to, offset + pcm.length);
      if (e > s) pieces.push(pcm.subarray(s - offset, e - offset));
    }
    let text = original;
    try {
      const res = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: toWav(pieces) });
      const { transcript } = await res.json();
      if (res.ok && typeof transcript === "string" && transcript.trim()) text = transcript.trim();
    } catch {
      // keep the original transcript
    }
    if (!this.stopped) this.handlers.onUtterance(text);
  }
}

function toWav(pieces: Int16Array[]): Blob {
  const samples = pieces.reduce((n, p) => n + p.length, 0);
  const header = new DataView(new ArrayBuffer(44));
  const writeString = (offset: number, s: string) => [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  writeString(0, "RIFF");
  header.setUint32(4, 36 + samples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  writeString(36, "data");
  header.setUint32(40, samples * 2, true);
  return new Blob([header.buffer, ...pieces.map((p) => p.slice().buffer)], { type: "audio/wav" });
}
