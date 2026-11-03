import Link from "next/link";

/**
 * The tab on the side of the Prayers panel that opens the Prayer Tree. It
 * glows faster once all five of today's prayers are in.
 */
export function TreeTab({ full }: { full: boolean }) {
  return (
    <Link href="/app/tree" className={`tree-tab ${full ? "is-full" : ""}`} aria-label="Open your Prayer Tree" title="Your Prayer Tree">
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d="M8 15V8" stroke="#a78367" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 9C4 9 2.5 6.5 3 3.5 6 3.5 8 5.5 8 9Z" fill="#86efac" />
        <path d="M8 7.5C8 4 10 1.5 13.5 1.5 13.5 5 11.5 7.5 8 7.5Z" fill="#2fe1c4" />
      </svg>
      Tree
    </Link>
  );
}
