// Splits a streamed reply into sentences so each one can be sent to TTS as soon as it's
// complete — Aria starts speaking while the LLM is still writing the rest.
const SENTENCE_END = /[.!?।]+["')\]]*\s+/g;
const MIN_LENGTH = 12; // avoid sending tiny fragments like "Sure." on their own

export class SentenceSplitter {
  private buffer = "";

  constructor(private readonly onSentence: (sentence: string) => void) {}

  push(delta: string) {
    this.buffer += delta;
    SENTENCE_END.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_END.exec(this.buffer))) {
      const end = match.index + match[0].length;
      if (end < MIN_LENGTH) continue;
      this.emit(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end);
      SENTENCE_END.lastIndex = 0;
    }
  }

  flush() {
    this.emit(this.buffer);
    this.buffer = "";
  }

  private emit(text: string) {
    const sentence = text.trim();
    if (sentence) this.onSentence(sentence);
  }
}
