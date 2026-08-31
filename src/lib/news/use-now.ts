"use client";

import { useSyncExternalStore } from "react";

/**
 * The current minute, on the client only — `null` while the server renders.
 *
 * Every relative timestamp on the news map is a function of now: "२ तासांपूर्वी"
 * on a card, "शेवटची नोंद" on the plate. Rendering one on the server bakes the
 * response time into the markup and then disagrees with whatever the browser
 * computes a moment later, which is a hydration mismatch on a page whose whole
 * claim is that it is current. So the server renders no relative time at all
 * and the client fills them in.
 *
 * The same shape as `useToday`, one unit finer. That hook quantises to the day
 * because a notice deadline moves once a day; this quantises to the minute
 * because a headline's age is worth watching change, and a minute is the finest
 * unit `agoMr` will print.
 *
 * Quantising is what makes the snapshot referentially stable between renders,
 * which `useSyncExternalStore` requires — returning `new Date()` directly would
 * be a new object every time it asked and would spin forever.
 *
 * Unlike `useToday` this really does subscribe: a map left open on a second
 * monitor all afternoon has to stop claiming its top story is an hour old. The
 * timer ticks twice a minute so a crossing is caught within thirty seconds
 * rather than drifting up to a minute behind.
 */
const TICK_MS = 30_000;

export function useNow(): Date | null {
  const minute = useSyncExternalStore(subscribe, snapshotMinute, serverSnapshot);

  return minute ? new Date(minute) : null;
}

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);

  return () => clearInterval(timer);
}

/** ISO to the minute — `2026-08-30T11:42:00.000Z`. Stable within a minute. */
function snapshotMinute(): string {
  const now = new Date();
  now.setSeconds(0, 0);

  return now.toISOString();
}

function serverSnapshot(): null {
  return null;
}
