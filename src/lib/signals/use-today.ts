"use client";

import { format } from "date-fns";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Today, on the client only — `null` while the server renders.
 *
 * Anything relative to *now* ("94 days left", how far into a notice window we
 * are) would be stale by the age of the build on a prerendered page, and would
 * not match what the browser computes. The snapshot is quantised to the day so
 * it stays referentially stable between renders, which is what
 * `useSyncExternalStore` requires of it.
 */
export function useToday(): Date | null {
  const day = useSyncExternalStore(
    // Nothing to subscribe to: the answer only changes when the date does.
    useCallback(() => () => {}, []),
    snapshotDay,
    () => null,
  );

  return day ? new Date(`${day}T00:00:00`) : null;
}

function snapshotDay(): string {
  return format(new Date(), "yyyy-MM-dd");
}
