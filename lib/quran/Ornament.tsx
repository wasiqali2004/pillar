/** Two overlapping squares — the eight-point khatam star — on a hairline rule. */
export function Ornament() {
  return (
    <svg viewBox="0 0 120 24" className="ornament" aria-hidden>
      <path d="M0 12h44M76 12h44" stroke="currentColor" strokeWidth="0.8" />
      <g transform="translate(60 12)" fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="-7" y="-7" width="14" height="14" />
        <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" />
        <circle r="2.2" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
