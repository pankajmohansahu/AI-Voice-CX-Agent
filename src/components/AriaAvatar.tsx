import { useId } from "react";

// Illustrated monogram avatar for Aria: an "A" with a small leaf, in brand sage.
export function AriaAvatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Aria"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#275338" />
          <stop offset="1" stopColor="#6fa383" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${gradientId})`} />
      <path
        d="M37.5 9.5c-4 .3-6.4 2.6-6.6 6.1 3.5-.2 6-2.4 6.6-6.1Z"
        fill="#bdeecb"
      />
      <path
        d="M15.5 34 22.2 16h3.6l6.7 18h-3.7l-1.5-4.2h-7l-1.5 4.2h-3.3Zm5.8-7.1h5.1L23.9 19.7l-2.6 7.2Z"
        fill="#ffffff"
      />
    </svg>
  );
}
