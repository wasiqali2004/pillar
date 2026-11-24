/** Controls that must keep their own click. */
export const INTERACTIVE =
  'button, a, input, select, textarea, label, summary, [role="button"], .no-expand';

/**
 * Chrome hit-tests tilted 3D planes (`.tile-3d` and its preserve-3d layers)
 * against the wrong layer, so a click squarely on a button can arrive at the
 * surface behind it. Call this from the surface's onClick: if the click landed
 * inside a control's box, it is re-sent to that control and true is returned.
 *
 * Seen on the Body tile's Log button and Training's Log workout button, which
 * both looked dead to a real mouse while `button.click()` worked.
 */
export function forwardMisHitClick(e: React.MouseEvent<HTMLElement>): boolean {
  const t = e.target as Element | null;
  if (t?.closest(INTERACTIVE)) return false;
  const meant = [...e.currentTarget.querySelectorAll<HTMLElement>(INTERACTIVE)].find((c) => {
    const r = c.getBoundingClientRect();
    return (
      r.width > 0 &&
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom
    );
  });
  if (!meant) return false;
  meant.focus();
  meant.click();
  return true;
}
