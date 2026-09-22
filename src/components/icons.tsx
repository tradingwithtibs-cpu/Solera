// Small hand-rolled icon set. Keeping these inline avoids adding an icon
// library dependency for a handful of glyphs.

type IconProps = { className?: string };

export function FeedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MarketsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 19V10M10.5 19V5M17 19v-7"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StarIcon({ className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      className={className}
      aria-hidden="true"
    >
      <path
        d="m12 4 2.47 5.51 6.03.58-4.55 4.03 1.33 5.88L12 17.02l-5.28 2.98 1.33-5.88-4.55-4.03 6.03-.58L12 4Z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RocketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7.6 14.3 4 18l3-.9.9-3Z" fill="currentColor" />
      <path d="M16.4 14.3 20 18l-3-.9-.9-3Z" fill="currentColor" />
      <path
        d="M12 2c3.2 2.3 4.9 6 4.9 9.7 0 2.1-1 4.5-2.4 6.1H9.5c-1.4-1.6-2.4-4-2.4-6.1C7.1 8 8.8 4.3 12 2Z"
        fill="currentColor"
      />
      <circle cx="12" cy="10.1" r="1.7" fill="white" />
      <circle cx="12" cy="10.1" r="0.9" fill="currentColor" opacity="0.5" />
      <path d="M9.6 17.9h4.8l-1.1 3.3h-2.6l-1.1-3.3Z" fill="currentColor" />
    </svg>
  );
}

/** Rocket exhaust — kept separate from the body so it can flicker independently. */
/**
 * Rocket exhaust, pointed tip facing down (wide base at top, attaching to
 * the rocket's engine) — flipped from a conventional "candle flame" shape
 * (pointed tip up) by mirroring the geometry itself, rather than a CSS
 * rotate, so it composes cleanly with the flicker animation's own transform.
 */
export function FlameIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g transform="scale(1,-1) translate(0,-24)">
        <path
          d="M12 22c-2.6 0-4.8-1.9-4.8-4.4 0-1.6.8-2.8 1.6-4 .4.8.9 1.4 1.5 1.8-.4-1.9.1-4 1.6-5.6.1 1.9.9 2.9 2 4.1 1.3 1.3 2.4 2.6 2.4 4.4C16.3 20.1 14.2 22 12 22Z"
          fill="#f97316"
        />
        <path
          d="M12 20c-1.3 0-2.4-.9-2.4-2.1 0-.7.4-1.3.8-1.9.5 1 1.3 1.6 1.6 1.6-.2-1-.1-1.9.5-2.7.4 1.5 1.7 2.1 1.7 3.3 0 1.2-1 1.8-2.2 1.8Z"
          fill="#fbbf24"
        />
      </g>
    </svg>
  );
}

export function ChainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="9" width="8" height="8" rx="2.4" transform="rotate(-20 7 13)" stroke="currentColor" strokeWidth={1.7} />
      <rect x="13" y="7" width="8" height="8" rx="2.4" transform="rotate(-20 17 11)" stroke="currentColor" strokeWidth={1.7} />
    </svg>
  );
}

export function WalletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.2" stroke="currentColor" strokeWidth={1.8} />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="16.5" cy="14" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M19 12H5m0 0 6.5-6.5M5 12l6.5 6.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="m8 12.5 2.5 2.5L16.5 9"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path
        d="M7 5H4.5a1.5 1.5 0 0 0-1.5 1.5v.5a3.5 3.5 0 0 0 3.5 3.5H7M17 5h2.5A1.5 1.5 0 0 1 21 6.5V7a3.5 3.5 0 0 1-3.5 3.5H17"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <path d="M12 13.5V17M9 20h6M9.5 20c0-1.8.7-2.6 2.5-3 1.8.4 2.5 1.2 2.5 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 4h4.2l4 5.4L16.8 4H20l-6.3 7.6L20.4 20H16.2l-4.4-5.9L6.8 20H3.5l6.7-8.1L4 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth={1.8} />
      <path d="m20 20-4.8-4.8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 5.5h16v10.5a1 1 0 0 1-1 1H9l-4 3.5v-3.5H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DiscordIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 6.5c2.8-1.2 6.2-1.2 9 0l.6 1.1c1.6 2.7 2.4 5.7 2.2 8.8-1.5 1.2-3.1 1.9-4.8 2.3l-.7-1.4c.7-.3 1.3-.6 1.9-1-1.9.9-4 1.4-6.1 1.4s-4.2-.5-6.1-1.4c.6.4 1.2.7 1.9 1l-.7 1.4c-1.7-.4-3.3-1.1-4.8-2.3-.2-3.1.6-6.1 2.2-8.8l.4-1.1Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx="9" cy="13" r="1.3" fill="currentColor" />
      <circle cx="15" cy="13" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function AgentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="8" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth={1.8} />
      <path d="M12 8V4M9 4h6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx="9" cy="13.5" r="1.3" fill="currentColor" />
      <circle cx="15" cy="13.5" r="1.3" fill="currentColor" />
      <path d="M9.5 17h5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

export function SearchGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={1.8} />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
