import type { CSSProperties } from 'react';

export function TicketIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M15 5v2m0 4v2m0 4v2M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4Z" />
    </svg>
  );
}
