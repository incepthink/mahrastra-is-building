import type { NewsWindow, WindowId } from "@/types/news";

/**
 * The windows the map will look through, tightest first.
 *
 * Tightest first is load-bearing: `loadNewsMap` walks this list in order and
 * takes the first one with anything in it, which is the same widening rule the
 * curated map's pulse line used and for the same reason — a collector that has
 * not run since Friday should show Friday's news and say so, not show an empty
 * state and imply nothing happened. A widening window is honest; a zero is not.
 *
 * `all` closes the list with no bound at all, so the walk always terminates on
 * a database that has any rows whatsoever.
 */
export const WINDOWS: NewsWindow[] = [
  { id: "24h", hours: 24, labelMr: "२४ तास" },
  { id: "48h", hours: 48, labelMr: "४८ तास" },
  { id: "7d", hours: 24 * 7, labelMr: "७ दिवस" },
  { id: "30d", hours: 24 * 30, labelMr: "३० दिवस" },
  { id: "all", hours: null, labelMr: "सर्व" },
];

export const DEFAULT_WINDOW: WindowId = "24h";

export function windowById(id: WindowId): NewsWindow {
  return WINDOWS.find((w) => w.id === id) ?? WINDOWS[0];
}

/** Every window from `id` outward, for the widening walk. */
export function windowsFrom(id: WindowId): NewsWindow[] {
  const start = Math.max(0, WINDOWS.findIndex((w) => w.id === id));

  return WINDOWS.slice(start);
}

/** The ISO cutoff a window implies, or null when the window is unbounded. */
export function cutoffOf(window: NewsWindow, now: Date): string | null {
  if (window.hours === null) return null;

  return new Date(now.getTime() - window.hours * 3600_000).toISOString();
}
