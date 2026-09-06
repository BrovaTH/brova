export function Logo({ size = 26, invert }: { size?: number; invert?: boolean }) {
  const c = invert ? "#F5F4F2" : "#0A0A0A";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="0" y="0" width="40" height="40" fill={c} />
      <rect x="7" y="9" width="9" height="22" fill={invert ? "#0A0A0A" : "#F5F4F2"} />
      <rect x="19" y="9" width="14" height="9" fill={invert ? "#0A0A0A" : "#F5F4F2"} />
      <rect x="19" y="22" width="14" height="9" fill={invert ? "#0A0A0A" : "#F5F4F2"} />
    </svg>
  );
}

export function Wordmark({ invert, sub }: { invert?: boolean; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={24} invert={invert} />
      <span className="leading-none">
        <span
          className={`block text-[15px] font-medium tracking-[0.16em] ${
            invert ? "text-bone" : "text-ink"
          }`}
        >
          BROVA
        </span>
        <span
          className={`mt-0.5 block text-[9px] uppercase tracking-wide2 ${
            invert ? "text-bone/55" : "text-ink/40"
          }`}
        >
          {sub ?? "A Creative Manufacturing Company"}
        </span>
      </span>
    </span>
  );
}
