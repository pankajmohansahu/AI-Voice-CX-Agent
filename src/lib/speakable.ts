// IDs like ORD-101 / CXL-4821 are read as letters and digits ("O R D 1 0 1"),
// which the TTS model pronounces far more clearly than the raw form.
// Only the audio uses this; the transcript keeps the original text.
export function toSpeakable(text: string): string {
  return text
    .replace(/\b([A-Z]{2,5})-(\d{2,6})\b/g, (_, letters: string, digits: string) =>
      `${letters.split("").join(" ")} ${digits.split("").join(" ")}`,
    )
    .replace(/₹\s?(\d[\d,]*)/g, "$1 rupees");
}
