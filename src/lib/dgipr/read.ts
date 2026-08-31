import "server-only";

import snapshot from "@/data/dgipr-releases.json";
import { DISTRICTS } from "@/data/districts";
import { cutoffOf, DEFAULT_WINDOW, windowsFrom } from "@/lib/news/window";
import type { DgiprMap, DgiprRelease } from "@/types/dgipr";
import type { WindowId } from "@/types/news";

/**
 * The DGIPR layer, read from the committed snapshot.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A QUERY.
 *
 * Everything else the map reads goes through `lib/news/db.ts`, and it should:
 * `news.db` holds tens of thousands of scraped rows and `stories.db` holds a
 * derived judgement over them, and neither can be a JavaScript literal. This
 * store is five hand-curated government releases that ship with the app. A
 * SQLite file for them would buy nothing and cost the one thing that matters —
 * `.data/` is gitignored, so a build that had never run an import script would
 * serve a map with the layer silently missing.
 *
 * It is nonetheless a **separate store**, which was the requirement. A release
 * is never written into `articles`, never threaded, never scored and never
 * counted into the choropleth. See `types/dgipr.ts` for why those would each be
 * a category error rather than a schema inconvenience.
 * ---------------------------------------------------------------------------
 */

type Snapshot = {
  pulledAt: string | null;
  releases: DgiprRelease[];
};

const SNAPSHOT = snapshot as Snapshot;

/**
 * How many districts a window has to reach before this layer stops widening.
 *
 * The widening walk originally stopped at the first window that was not *empty*,
 * and that threshold was set when the snapshot was five releases from one
 * district — where "not empty" and "shows something worth looking at" were the
 * same test. They stopped being the same when the snapshot began coming off
 * mahasamvad.in's district categories, because the shape of the data changed:
 * the directorate files from somewhere between three and ten districts on a
 * given day, out of thirty-five. A 24-hour window is therefore reliably
 * non-empty and reliably almost blank — four marks on a map of the whole state,
 * which reads as "the state was quiet" when what happened is "the window is
 * short".
 *
 * Six is the floor because it is roughly a division's worth of districts: below
 * that the marks read as scattered accidents, at or above it they read as a map
 * of where the government is talking. It is not a claim that six is the right
 * number of releases — the window that gets used is printed on the plate, and
 * `widened` says the layer went looking further back than the map beside it.
 */
const DISTRICT_FLOOR = 6;

/**
 * Whether a window is worth stopping the widening walk at.
 *
 * Counts *placed* districts, not releases. A release whose dateline resolves to
 * no district still reads in the panel but puts no mark on the map, so counting
 * it here would let the walk stop on a window that draws almost nothing —
 * exactly the failure the floor exists to prevent.
 */
function coversEnoughDistricts(releases: DgiprRelease[]): boolean {
  const districts = new Set<string>();

  for (const release of releases) {
    if (release.districtId && DISTRICTS[release.districtId]) {
      districts.add(release.districtId);
      if (districts.size >= DISTRICT_FLOOR) return true;
    }
  }

  return false;
}

/**
 * Everything the DGIPR layer needs for one window.
 *
 * **The window is applied at day granularity, because a day is all the source
 * carries.** A release is dated `2026-08-26` and issued at no stated hour, so a
 * cutoff of "26 August, 14:30" cannot be honoured; it is compared against
 * `2026-08-26` instead. That widens a 24-hour window by up to a day at its far
 * edge, which is the smaller of the two available errors — inventing a midnight
 * timestamp would drop every release actually issued on the boundary day.
 *
 * **The window widens on its own.** `loadStories` deliberately does not, and it
 * gives a good reason: pins over a choropleth must not show marks the counts
 * underneath do not account for. Nothing of the kind is true here — this layer
 * paints no land, is summed into no total and sits over both modes as an
 * overlay with its own count. What is true is that the two stores fill at
 * completely different rates: the collector adds hundreds of articles a day and
 * DGIPR issues a handful of releases, so pinning this to the corpus's 24-hour
 * clock would show the reader an empty layer and an official-looking zero for
 * days at a stretch. It widens, and `widened` makes it say so.
 *
 * **What it widens until is a district count, not a release count.** See
 * `DISTRICT_FLOOR` — the test changed when the snapshot stopped being five
 * curated releases and became a live pull across every district category on
 * mahasamvad.in, and "not empty" stopped meaning "shows a map".
 */
export function loadDgipr(
  requested: WindowId = DEFAULT_WINDOW,
  now: Date = new Date(),
): DgiprMap {
  const candidates = windowsFrom(requested);
  const widest = candidates[candidates.length - 1];

  let used = widest;
  let releases: DgiprRelease[] = [];

  for (const candidate of candidates) {
    const cutoff = cutoffOf(candidate, now);
    const since = cutoff ? cutoff.slice(0, 10) : null;
    const found = since
      ? SNAPSHOT.releases.filter((release) => release.date >= since)
      : SNAPSHOT.releases;

    if (coversEnoughDistricts(found) || candidate === widest) {
      used = candidate;
      releases = found;
      break;
    }
  }

  const byDistrict: Record<string, DgiprRelease[]> = {};
  const unplaced: DgiprRelease[] = [];

  for (const release of releases) {
    // A district the boundary file has never heard of is left unplaced rather
    // than drawn somewhere plausible — the same rule `loadNewsMap` applies to
    // the choropleth and `PinLayer` applies to a story, and for the same
    // reason. An unplaced release is still readable; it simply gets no mark.
    if (release.districtId && DISTRICTS[release.districtId]) {
      (byDistrict[release.districtId] ??= []).push(release);
      continue;
    }

    unplaced.push(release);
  }

  return {
    releases,
    byDistrict,
    unplaced,
    totals: {
      releases: releases.length,
      districts: Object.keys(byDistrict).length,
      unplaced: unplaced.length,
    },
    window: used,
    widened: used.id !== requested,
    pulledAt: SNAPSHOT.pulledAt,
  };
}
