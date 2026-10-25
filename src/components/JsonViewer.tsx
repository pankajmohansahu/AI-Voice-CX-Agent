"use client";

import type { ReactNode } from "react";
import { Check, Copy, Download } from "lucide-react";
import { useCopy } from "@/hooks/useCopy";
import { downloadFile } from "@/lib/format";

// Minimal JSON syntax highlighting: keys, strings, literals, numbers.
function highlight(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json))) {
    if (m.index > last) out.push(json.slice(last, m.index));
    const key = out.length;
    if (m[1]) {
      out.push(
        <span key={key} className={m[2] ? "text-[#f5c26b]" : "text-[#8fd6a5]"}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(m[2]);
    } else if (m[3]) {
      out.push(<span key={key} className="text-[#f59e8b]">{m[0]}</span>);
    } else {
      out.push(<span key={key} className="text-[#c4b5fd]">{m[0]}</span>);
    }
    last = re.lastIndex;
  }
  out.push(json.slice(last));
  return out;
}

export function JsonViewer({ data, filename }: { data: unknown; filename: string }) {
  const json = JSON.stringify(data, null, 2);
  const { copiedKey, copy } = useCopy();

  return (
    <div className="overflow-hidden rounded-2xl bg-[#1a201c] shadow-card">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#f87171]" />
            <span className="size-2.5 rounded-full bg-[#fbbf24]" />
            <span className="size-2.5 rounded-full bg-[#4ade80]" />
          </span>
          <span className="font-mono text-xs text-white/80">Structured Output (JSON)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => copy("json", json)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/90 transition hover:bg-white/20"
          >
            {copiedKey === "json" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiedKey === "json" ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => downloadFile(filename, json, "application/json")}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/90 transition hover:bg-white/20"
          >
            <Download className="size-3.5" /> .json
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-white/70">
        <code>{highlight(json)}</code>
      </pre>
    </div>
  );
}
