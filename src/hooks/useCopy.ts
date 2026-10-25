"use client";

import { useCallback, useRef, useState } from "react";

// Copies text and remembers which item was copied for ~1.5s (for "Copied!" feedback).
export function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopiedKey(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  return { copiedKey, copy };
}
