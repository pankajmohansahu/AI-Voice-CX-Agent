import type { CallState } from "./types";

// Label, helper text and colours for each agent state.
// Colour, icon and text change together so the state never relies on colour alone.
export const STATE_META: Record<
  CallState,
  { label: string; hint: string; dot: string; pill: string }
> = {
  idle: {
    label: "Ready when you are",
    hint: "Press Start Call and speak naturally",
    dot: "bg-sage-500",
    pill: "bg-sage-100 text-sage-700",
  },
  connecting: {
    label: "Connecting…",
    hint: "Setting up your microphone",
    dot: "bg-sage-500",
    pill: "bg-sage-100 text-sage-700",
  },
  listening: {
    label: "Listening…",
    hint: "Go ahead, I'm listening",
    dot: "bg-listen",
    pill: "bg-[#e3f4ea] text-[#1f6b43]",
  },
  thinking: {
    label: "Thinking…",
    hint: "Working on your answer",
    dot: "bg-think",
    pill: "bg-[#fdf0dc] text-[#92400e]",
  },
  speaking: {
    label: "Aria is speaking",
    hint: "Start talking any time to interrupt",
    dot: "bg-speak",
    pill: "bg-[#efe9fe] text-[#5b21b6]",
  },
  error: {
    label: "Something went wrong",
    hint: "Please try again",
    dot: "bg-alert",
    pill: "bg-[#fde8e8] text-[#991b1b]",
  },
};
