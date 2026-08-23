import type { AnySignal, SignalCategoryId, SignalStatus } from "@/types/signal";

/**
 * What the reader has narrowed the map down to.
 *
 * Two independent sets, and an empty set means "not narrowed on this axis"
 * rather than "nothing" — which is the only reading that lets the two combine
 * without a third state for "off". Within an axis the sets are OR'd (water
 * *or* housing), across axes they are AND'd (water work that is *also* under
 * way), because that is what a reader means by picking two sectors and one
 * stage.
 *
 * Held as arrays rather than `Set`s: this crosses a React prop boundary and
 * gets compared by `useMemo`, and a `Set` is a new identity on every render
 * even when nothing in it changed.
 */
export type SignalFilters = {
  sectors: SignalCategoryId[];
  statuses: SignalStatus[];
};

export const NO_FILTERS: SignalFilters = { sectors: [], statuses: [] };

/** Whether anything is narrowed at all — what the reset control keys off. */
export function isFiltered(filters: SignalFilters): boolean {
  return filters.sectors.length > 0 || filters.statuses.length > 0;
}

/** One record against the current narrowing. See `SignalFilters` for the logic. */
export function matchesFilters(signal: AnySignal, filters: SignalFilters): boolean {
  if (filters.sectors.length && !filters.sectors.includes(signal.category)) return false;
  if (filters.statuses.length && !filters.statuses.includes(signal.status)) return false;

  return true;
}

/**
 * Add a value to one axis, or take it out if it was already there.
 *
 * Returns the same array when nothing changed is *not* worth doing here — the
 * caller only ever calls this from a click, so a fresh array per toggle costs
 * one render that was going to happen anyway.
 */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}
