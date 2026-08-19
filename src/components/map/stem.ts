/**
 * The stem, from just outside the anchor to just inside the head, along
 * whatever angle the head displacement produced. Trimmed at both ends so it
 * never shows through the anchor dot or crosses the disc it is holding up.
 *
 * Shared by the pin and the cluster badge, which differ only in how big a head
 * the line has to stop short of.
 */
export function stemPath(x: number, y: number, headRadius: number): string {
  const length = Math.hypot(x, y);

  if (length < 1) return "";

  const unitX = x / length;
  const unitY = y / length;
  const start = 4.5;
  const end = Math.max(start, length - headRadius - 1);

  return `M${round(unitX * start)} ${round(unitY * start)} L${round(unitX * end)} ${round(unitY * end)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
