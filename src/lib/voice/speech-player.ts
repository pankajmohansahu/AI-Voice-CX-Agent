// Plays Aria's reply sentence by sentence. Each sentence is synthesised as soon as it's
// queued (in parallel) and played in order. stop() cuts audio instantly for barge-in.
// If TTS fails, the browser's built-in voice reads that sentence instead.

interface QueueItem {
  text: string;
  audio: Promise<AudioBuffer | null>;
}

export class SpeechPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples = new Float32Array(1024);
  private queue: QueueItem[] = [];
  private playing = false;
  private turnOpen = false;
  private turnStarted = false;
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private turnId = 0;
  private fetches = new AbortController();

  onStart?: () => void; // first audio of a turn begins
  onIdle?: () => void; // turn finished and everything has been spoken

  // Must be called from a user gesture (e.g. the Start Call click) so audio is allowed.
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  // Each reply is a "turn". Calls carrying a stale turn id (e.g. from a reply that was
  // interrupted) are ignored, so leftover sentences never leak into the next reply.
  beginTurn(): number {
    this.turnId += 1;
    this.turnOpen = true;
    this.turnStarted = false;
    return this.turnId;
  }

  enqueue(turn: number, text: string) {
    if (turn !== this.turnId) return;
    this.queue.push({ text, audio: this.synthesize(text, this.fetches.signal) });
    if (!this.playing) void this.playNext();
  }

  endTurn(turn: number) {
    if (turn !== this.turnId) return;
    this.turnOpen = false;
    if (!this.playing && this.queue.length === 0) this.onIdle?.();
  }

  stop() {
    this.turnId += 1;
    this.generation += 1;
    this.fetches.abort();
    this.fetches = new AbortController();
    this.queue = [];
    this.turnOpen = false;
    this.playing = false;
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.source = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  level(): number {
    if (!this.analyser || !this.playing) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const s of this.samples) sum += s * s;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 5);
  }

  private async synthesize(text: string, signal: AbortSignal): Promise<AudioBuffer | null> {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!res.ok || !this.ctx) return null;
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  private async playNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.playing = false;
      if (!this.turnOpen) this.onIdle?.();
      return;
    }
    this.playing = true;
    const gen = this.generation;
    const buffer = await item.audio;
    if (gen !== this.generation) return;

    if (!this.turnStarted) {
      this.turnStarted = true;
      this.onStart?.();
    }
    if (buffer) await this.playBuffer(buffer);
    else await this.speakFallback(item.text);
    if (gen !== this.generation) return;
    await this.playNext();
  }

  private playBuffer(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ctx || !this.analyser) return resolve();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.analyser);
      source.onended = () => resolve();
      this.source = source;
      source.start();
    });
  }

  private speakFallback(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }
}
