/**
 * The Pillar mark: a sun rising over the horizon with an upright pillar
 * through it. Same geometry as the app icon (scripts/icon/make_icons.py).
 *
 * `animated` draws each stroke in turn (the splash, the website hero). Every
 * path uses pathLength=1 so one dash rule animates them all regardless of
 * their real length; delays come from --d on each element.
 */
export function Mark({
  className = "",
  animated = false,
  gradientId = "mark-grad",
}: {
  className?: string;
  animated?: boolean;
  /** Must be unique per page if the mark appears more than once. */
  gradientId?: string;
}) {
  const stroke = `url(#${gradientId})`;
  const draw = animated ? "mark-draw" : undefined;
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" strokeLinecap="round" aria-hidden>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="14" y1="20" x2="106" y2="90">
          <stop offset="0" stopColor="var(--color-teal)" />
          <stop offset="1" stopColor="var(--color-violet)" />
        </linearGradient>
      </defs>
      {/* horizon */}
      <path className={draw} style={{ ["--d" as string]: "0s" }} d="M14 76 H106" pathLength={1} stroke={stroke} strokeWidth={7.4} />
      {/* sun */}
      <path
        className={draw}
        style={{ ["--d" as string]: "0.35s" }}
        d="M31.5 76 A28.5 28.5 0 0 1 88.5 76"
        pathLength={1}
        stroke={stroke}
        strokeWidth={7.4}
      />
      {/* pillar */}
      <path className={draw} style={{ ["--d" as string]: "0.75s" }} d="M60 76 V28" pathLength={1} stroke={stroke} strokeWidth={8.5} />
      {/* rays */}
      <path className={draw} style={{ ["--d" as string]: "1.05s" }} d="M33 49 l-5.5 -5.5" pathLength={1} stroke={stroke} strokeWidth={6} />
      <path className={draw} style={{ ["--d" as string]: "1.05s" }} d="M87 49 l5.5 -5.5" pathLength={1} stroke={stroke} strokeWidth={6} />
    </svg>
  );
}
