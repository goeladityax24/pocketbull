export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="1.5" width="25" height="25" rx="7" />
      <path d="M7 19l5-5 3 3 6-7" />
      <path d="M17 10h4v4" />
    </svg>
  );
}
