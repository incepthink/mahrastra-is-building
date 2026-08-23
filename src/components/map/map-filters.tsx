"use client";

import { CATEGORIES } from "@/data/categories";
import { STATUS_LADDER, STATUS_META, TONE_COLOR } from "@/lib/design/status";
import { isFiltered, type SignalFilters } from "@/lib/signals/filter";
import { MR, toDevanagari } from "@/lib/signals/marathi";
import type { AnySignal, SignalCategoryId, SignalStatus } from "@/types/signal";

type MapFiltersProps = {
  /** Everything the map could show in the current view, before narrowing —
   *  what the counts are taken from. */
  records: AnySignal[];
  filters: SignalFilters;
  onToggleSector: (id: SignalCategoryId) => void;
  onToggleStatus: (status: SignalStatus) => void;
  onClear: () => void;
};

/**
 * The two questions a reader narrows by: **what kind of work**, and **how far
 * along**.
 *
 * This is where the sector legend went. It used to sit at the bottom of the
 * plate as a read-only key — ten rows saying "green means agriculture" — and
 * the reader's only way to act on it was to hunt the map for a green pin. The
 * rows are buttons now, and they are the same rows: the same disc at the same
 * size carrying the same glyph, with the same count on the end. A key that
 * does something is still a key; a key that does nothing beside a map with
 * thirty pins on it is a caption.
 *
 * The stage axis is new here and had nowhere else to live. Status ink already
 * appears on every pin and on the meter inside an open record, so the reader
 * has been told what the five stages are all along without ever being able to
 * ask for one.
 *
 * **Counts cross-filter.** The sector rows count what the chosen stages leave,
 * and the stage chips count what the chosen sectors leave, so the numbers
 * always answer "what happens if I click this" rather than describing a corpus
 * the reader has already narrowed away from. A row that would land on zero is
 * dimmed but stays clickable — it is how you swap one sector for another
 * without going back through the reset.
 *
 * Nothing selected on an axis means that axis is not narrowing anything, so
 * there is no "all" chip to keep in sync: the reset clears both axes at once
 * and appears only when there is something to clear.
 */
export function MapFilters({
  records,
  filters,
  onToggleSector,
  onToggleStatus,
  onClear,
}: MapFiltersProps) {
  const sectorTally = tally(
    records.filter(
      (record) => !filters.statuses.length || filters.statuses.includes(record.status),
    ),
    (record) => record.category,
  );

  const statusTally = tally(
    records.filter(
      (record) => !filters.sectors.length || filters.sectors.includes(record.category),
    ),
    (record) => record.status,
  );

  // What exists in this view at all, ignoring the narrowing — an axis value the
  // corpus has never carried is not a filter, it is a dead row.
  const present = tally(records, (record) => record.category);
  const presentStatus = tally(records, (record) => record.status);

  const sectors = CATEGORIES.filter((category) => present[category.id]);
  const statuses = STATUS_LADDER.filter((status) => presentStatus[status]);

  if (!sectors.length && !statuses.length) return null;

  return (
    <div className="map-filters" lang="mr">
      <div className="map-filters-head">
        <span className="map-filters-label">{MR.filters}</span>

        {isFiltered(filters) ? (
          <button type="button" className="map-filters-clear" onClick={onClear}>
            {MR.filterClear}
          </button>
        ) : null}
      </div>

      {sectors.length > 1 ? (
        <div className="filter-group">
          <span className="filter-group-label">{MR.filterSector}</span>

          <ul className="filter-sectors">
            {sectors.map((category) => {
              const on = filters.sectors.includes(category.id);
              const count = sectorTally[category.id] ?? 0;

              return (
                <li key={category.id}>
                  <button
                    type="button"
                    className="filter-sector"
                    style={{ "--sector": category.tint } as React.CSSProperties}
                    aria-pressed={on}
                    aria-label={`${category.labelMr} — ${toDevanagari(count)}`}
                    data-empty={!on && !count ? "" : undefined}
                    onClick={() => onToggleSector(category.id)}
                  >
                    <span className="filter-sector-icon" aria-hidden>
                      <category.icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="filter-sector-word">{category.labelMr}</span>
                    <span className="filter-sector-count numeric">
                      {toDevanagari(count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {statuses.length > 1 ? (
        <div className="filter-group">
          <span className="filter-group-label">{MR.filterStatus}</span>

          <ul className="filter-statuses">
            {statuses.map((status) => {
              const meta = STATUS_META[status];
              const on = filters.statuses.includes(status);
              const count = statusTally[status] ?? 0;

              return (
                <li key={status}>
                  <button
                    type="button"
                    className="filter-status"
                    style={{ "--tone": TONE_COLOR[meta.tone] } as React.CSSProperties}
                    aria-pressed={on}
                    data-empty={!on && !count ? "" : undefined}
                    onClick={() => onToggleStatus(status)}
                  >
                    <span className="filter-status-dot" aria-hidden />
                    <span className="filter-status-word">{meta.labelMr}</span>
                    <span className="filter-status-count numeric">
                      {toDevanagari(count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Records grouped by one of their own fields, counted. */
function tally<K extends string>(
  records: AnySignal[],
  key: (record: AnySignal) => K,
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};

  records.forEach((record) => {
    const id = key(record);
    counts[id] = (counts[id] ?? 0) + 1;
  });

  return counts;
}
