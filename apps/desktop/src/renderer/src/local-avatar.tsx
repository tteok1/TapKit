export function LocalAvatar() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--accent-surface)" />
      <path d="M16 5 26 16 16 27 6 16Z" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="var(--accent)" />
    </svg>
  );
}
