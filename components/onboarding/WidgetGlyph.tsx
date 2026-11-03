import type { ReactNode } from "react";
import type { WidgetId } from "@/lib/dashboard/catalog";

/**
 * A tiny schematic of each widget for the picker and the layout preview, so
 * people choose from pictures rather than a list of names. Drawn with the
 * theme colours; purely decorative.
 */
export function WidgetGlyph({ id, className = "" }: { id: WidgetId; className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden fill="none" strokeLinecap="round">
      {GLYPHS[id]}
    </svg>
  );
}

const T = "var(--color-teal)";
const V = "var(--color-violet)";
const A = "var(--color-warn)";
const F = "var(--color-line)";

const GLYPHS: Record<WidgetId, ReactNode> = {
  // The sun's path across the day, one dot per prayer, the moon for Isha.
  prayers: (
    <>
      <path d="M8 34 Q32 -4 56 34 Z" fill={T} fillOpacity={0.08} />
      <line x1="4" y1="34" x2="60" y2="34" stroke={V} strokeWidth={1.6} strokeOpacity={0.6} />
      <path d="M8 34 Q32 -4 56 34" stroke={T} strokeOpacity={0.5} strokeWidth={1.4} strokeDasharray="2.4 2.4" />
      <circle cx="10.5" cy="29" r="2.6" fill={T} />
      <circle cx="32" cy="15" r="3.4" fill={T} />
      <circle cx="44" cy="20" r="2.6" fill={T} />
      <circle cx="53.5" cy="29" r="2.6" stroke={A} strokeWidth={1.4} />
      <path d="M58 5 a5 5 0 1 0 3 8.5 a4 4 0 1 1 -3 -8.5Z" fill={V} />
    </>
  ),
  // An open mushaf on its stand.
  quran: (
    <>
      <path d="M32 9 C25 5 15 6 11 8 V29 C15 27 25 27 32 31 Z" fill={T} fillOpacity={0.14} stroke={T} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M32 9 C39 5 49 6 53 8 V29 C49 27 39 27 32 31 Z" fill={V} fillOpacity={0.14} stroke={V} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M16 14.5h11M16 19h11M16 23.5h8M37 14.5h11M37 19h11M40 23.5h8" stroke={F} strokeWidth={1.5} />
      <path d="M20 37 L44 31 M44 37 L20 31" stroke={A} strokeWidth={2} />
    </>
  ),
  // A masjid under the crescent, with the mushaf beside it: prayer and Qur'an together.
  deen: (
    <>
      <line x1="4" y1="35" x2="60" y2="35" stroke={F} strokeWidth={1.4} />
      <path d="M9 35 V22 h20 V35" fill={T} fillOpacity={0.16} stroke={T} strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M11 22 C11 13 27 13 27 22" fill={T} fillOpacity={0.3} stroke={T} strokeWidth={1.5} />
      <path d="M19 35 v-6 a2.5 2.5 0 0 1 5 0 v6" stroke={T} strokeWidth={1.3} />
      <path d="M33 35 V12 M33 12 l-1.8 -3 h3.6 Z" stroke={T} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M20.5 5 a3.4 3.4 0 1 0 2.4 5.6 a2.7 2.7 0 1 1 -2.4 -5.6Z" fill={A} />
      <path d="M50 21 C46 18.5 41 19 39 20 V33 C41 32 46 31.5 50 34 Z" fill={V} fillOpacity={0.18} stroke={V} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M50 21 C54 18.5 59 19 61 20 V33 C59 32 54 31.5 50 34 Z" fill={V} fillOpacity={0.18} stroke={V} strokeWidth={1.4} strokeLinejoin="round" />
    </>
  ),
  // A heartbeat running into the night: activity, heart and sleep.
  body: (
    <>
      <path d="M14 33 C4 26 4 15 10 13 C13 12 14 14 14 15.5 C14 14 15 12 18 13 C24 15 24 26 14 33Z" fill={T} fillOpacity={0.2} stroke={T} strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M2 23 H9 L11.5 18 L14.5 28 L17 21 H30 L33 14 L36.5 31 L39.5 23 H47" stroke={T} strokeWidth={1.7} strokeLinejoin="round" />
      <path d="M53 9 a7 7 0 1 0 6 11.5 a5.6 5.6 0 1 1 -6 -11.5Z" fill={V} fillOpacity={0.85} />
      <circle cx="47" cy="8" r="0.9" fill={F} />
      <circle cx="61" cy="27" r="0.9" fill={F} />
      <path d="M50 33 h12" stroke={A} strokeWidth={2.4} />
      <path d="M50 33 h7" stroke={A} strokeWidth={2.4} opacity={0.5} />
    </>
  ),
  // A loaded barbell with a PR spark.
  training: (
    <>
      <line x1="6" y1="22" x2="58" y2="22" stroke={F} strokeWidth={2.2} />
      <rect x="11" y="10" width="5" height="24" rx="1.6" fill={V} />
      <rect x="17" y="14" width="3.6" height="16" rx="1.2" fill={T} />
      <rect x="48" y="10" width="5" height="24" rx="1.6" fill={V} />
      <rect x="43.4" y="14" width="3.6" height="16" rx="1.2" fill={T} />
      <path d="M32 7 l1.6 3.6 l3.8 0.4 l-2.9 2.6 l0.9 3.8 l-3.4 -2 l-3.4 2 l0.9 -3.8 l-2.9 -2.6 l3.8 -0.4Z" fill={A} />
      <path d="M26 31 l4 -4 l3 2.5 l5 -5.5" stroke={T} strokeWidth={1.5} strokeLinejoin="round" />
    </>
  ),
  habits: (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={6} y={5 + i * 8.5} width={6} height={6} rx={1.6} fill={i < 3 ? T : "none"} stroke={i < 3 ? "none" : F} />
          <line x1={16} y1={8 + i * 8.5} x2={34} y2={8 + i * 8.5} stroke={F} strokeWidth={2} />
          {Array.from({ length: 5 }, (_, j) => (
            <circle key={j} cx={40 + j * 4.5} cy={8 + i * 8.5} r={1.4} fill={(i + j) % 3 ? V : F} />
          ))}
        </g>
      ))}
    </>
  ),
  goals: (
    <>
      {[0.8, 0.45, 0.65].map((p, i) => (
        <g key={i}>
          <line x1={8} y1={10 + i * 10} x2={56} y2={10 + i * 10} stroke={F} strokeWidth={3} />
          <line x1={8} y1={10 + i * 10} x2={8 + 48 * p} y2={10 + i * 10} stroke={i === 1 ? V : T} strokeWidth={3} />
        </g>
      ))}
    </>
  ),
  meditation: (
    <>
      <path d="M12 12 q-4 0 -4 5 v4 h6 v-6 h-3 q0 -3 3 -3Z" fill={V} />
      <path d="M24 16h30M14 26h40M20 32h26" stroke={F} strokeWidth={2} />
    </>
  ),
  // A wallet with a card peeking out, and coins beside it.
  money: (
    <>
      <rect x="12" y="6" width="22" height="13" rx="2.2" fill={T} fillOpacity={0.85} transform="rotate(-10 23 12)" />
      <path d="M15.5 10.5 h8" stroke="#12122a" strokeWidth={1.6} transform="rotate(-10 23 12)" />
      <rect x="6" y="13" width="34" height="22" rx="4" fill={V} fillOpacity={0.22} stroke={V} strokeWidth={1.6} />
      <path d="M30 20 h10 v8 h-10 a4 4 0 0 1 0 -8Z" fill={V} fillOpacity={0.4} stroke={V} strokeWidth={1.4} />
      <circle cx="31" cy="24" r="1.6" fill={A} />
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx="52" cy={33 - i * 4.2} rx="7" ry="2.4" fill={A} fillOpacity={0.35 + i * 0.25} stroke={A} strokeWidth={1.1} />
      ))}
    </>
  ),
  // A rising area chart and the allocation donut beside it.
  portfolio: (
    <>
      <path d="M4 35 L14 28 L22 30 L31 20 L39 23 L48 12 L58 9 V36 H4 Z" fill={T} fillOpacity={0.16} />
      <path d="M4 35 L14 28 L22 30 L31 20 L39 23 L48 12 L58 9" stroke={T} strokeWidth={2} strokeLinejoin="round" />
      <circle cx="58" cy="9" r="4" fill={T} fillOpacity={0.25} />
      <circle cx="58" cy="9" r="2" fill={T} />
      <circle cx="13" cy="11" r="6" stroke={V} strokeWidth={3} strokeDasharray="20 18" />
      <circle cx="13" cy="11" r="6" stroke={A} strokeWidth={3} strokeDasharray="9 29" strokeDashoffset="-20" />
    </>
  ),
  // A storefront under a striped awning, with sales climbing in the window.
  business: (
    <>
      <rect x="10" y="16" width="44" height="20" rx="1.8" fill={V} fillOpacity={0.16} stroke={V} strokeWidth={1.5} />
      <path d="M8 9 h48 l2 7 H6 Z" fill={V} fillOpacity={0.35} stroke={V} strokeWidth={1.4} strokeLinejoin="round" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${8 + i * 13} 9 h6.5 l-0.5 7 h-7.5 Z`} fill={T} fillOpacity={0.85} />
      ))}
      <path d="M6 16 q4.3 4 8.6 0 q4.3 4 8.6 0 q4.3 4 8.6 0 q4.3 4 8.6 0 q4.3 4 8.6 0 q4.3 4 8.6 0" fill={V} fillOpacity={0.35} stroke={V} strokeWidth={1.1} />
      <rect x="15" y="23" width="9" height="13" rx="1" stroke={T} strokeWidth={1.3} />
      <rect x="29" y="22" width="20" height="10" rx="1.2" fill="#12122a" fillOpacity={0.5} stroke={F} strokeWidth={1} />
      <path d="M31 30 l4.5 -3.5 l3.5 2 l7 -5" stroke={A} strokeWidth={1.6} strokeLinejoin="round" />
    </>
  ),
};
