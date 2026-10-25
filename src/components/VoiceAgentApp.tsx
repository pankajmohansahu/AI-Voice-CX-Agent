"use client";

import { useRef, useSyncExternalStore } from "react";
import { CallPanel } from "./CallPanel";
import { Header } from "./Header";
import { SummaryScreen } from "./SummaryScreen";
import { TestOrdersPanel } from "./TestOrdersPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { useCallController } from "@/hooks/useCallController";
import { PREVIEWS } from "@/lib/preview-fixtures";

const noopSubscribe = () => () => {};

// Dev-only: ?preview=<state> renders a UI state with sample data for design review.
function usePreviewKey(): string | null {
  const key = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("preview"),
    () => null,
  );
  return process.env.NODE_ENV === "development" ? key : null;
}

export function VoiceAgentApp() {
  const call = useCallController();
  const previewKey = usePreviewKey();
  const preview = previewKey ? PREVIEWS[previewKey] : undefined;
  const view = preview ?? call.view;
  const composerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />

      {preview && (
        <div className="bg-terracotta-50 px-4 py-2 text-center text-xs text-terracotta-700">
          Design preview: <strong>{previewKey}</strong> (sample data). Remove <code>?preview</code> from the URL to exit.
        </div>
      )}

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-10">
        {view.screen === "summary" ? (
          <SummaryScreen view={view} onNewCall={call.newCall} onRetrySummary={call.retrySummary} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <CallPanel
              className="lg:col-span-5 xl:col-span-4"
              view={view}
              onStart={call.start}
              onEnd={call.end}
              onToggleMute={call.toggleMute}
              onTypeInstead={() => composerRef.current?.focus()}
            />
            <TranscriptPanel
              className="lg:col-span-7 xl:col-span-5"
              view={view}
              onSend={call.sendText}
              composerRef={composerRef}
            />
            <TestOrdersPanel className="lg:col-span-12 xl:col-span-3" onAsk={call.sendText} />
          </div>
        )}
      </main>

      <footer className="border-t border-sage-500/10 px-4 py-4 text-center text-xs text-muted">
        Aura Skincare is a fictional brand and all orders are mock data, built for the Datastraw AI Voice Agent assessment.
      </footer>
    </div>
  );
}
