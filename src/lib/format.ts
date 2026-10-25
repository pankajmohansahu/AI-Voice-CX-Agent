import type { TranscriptEntry } from "./types";

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function toolCallLabel(name: string, args: Record<string, unknown>): string {
  const values = Object.values(args).map((v) => JSON.stringify(v));
  return `${name}(${values.join(", ")})`;
}

// Plain-text transcript for copy / download.
export function transcriptToText(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const time = formatDuration(e.at);
      if (e.kind === "tool") {
        return `[${time}] TOOL  ${toolCallLabel(e.name, e.args)}${e.result ? ` → ${e.result}` : ""}`;
      }
      return `[${time}] ${e.role === "agent" ? "ARIA " : "YOU  "} ${e.text}`;
    })
    .join("\n");
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
