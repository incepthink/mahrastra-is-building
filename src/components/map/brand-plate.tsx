"use client";

import { motion } from "motion/react";

import { MapFilters } from "./map-filters";
import type { SignalFilters } from "@/lib/signals/filter";
import { countMr, districtMr, pulseMr, toDevanagari, MR } from "@/lib/signals/marathi";
import type {
  AnySignal,
  MapScope,
  PlacedSignal,
  Signal,
  SignalCategoryId,
  SignalPulse,
  SignalStatus,
  StatewideSignal,
} from "@/types/signal";

const RISE = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
};

type BrandPlateProps = {
  /** The curated set — the district records, as pinned, **after** narrowing. */
  signals: PlacedSignal<Signal>[];
  /** The records that apply to the whole state, counted when the map is
   *  showing them instead. Narrowed the same way. */
  statewide: PlacedSignal<StatewideSignal>[];
  /** Everything the current view could show before narrowing. The filters
   *  count from this — a sector that drops to zero has to keep saying so, or
   *  the reader's only way back is the reset. */
  pool: AnySignal[];
  /** Which of the two sets the map is currently about. */
  scope: MapScope;
  /** How many records are published in the pilot altogether. */
  published: number;
  /** Recent activity across the whole pipeline, or null when there is none to
   *  report honestly. See `recentPulse`. */
  pulse: SignalPulse | null;
  filters: SignalFilters;
  onToggleSector: (id: SignalCategoryId) => void;
  onToggleStatus: (status: SignalStatus) => void;
  onClearFilters: () => void;
};

/**
 * The identity, the narrowing, and the one number that says how much is on the
 * map.
 *
 * Read top to bottom it is a sentence: **what the state did** (the pulse line),
 * **what you want to see of it** (the filters), **what that leaves** (the
 * tally). The order is the point — the count sits under the controls because
 * it is their result, and a reader who narrows to two sectors watches the
 * figure move rather than having to count pins.
 *
 * The sector legend used to close the plate as a read-only key. It has moved
 * into `MapFilters` and become the sector axis, unchanged in appearance: the
 * same disc, the same glyph, the same count. See that file for why a key that
 * cannot be clicked stops being a key once there are thirty pins.
 *
 * The tally counts **what is pinned right now**, not what is published, and the
 * line under it says how many were published.
 */
export function BrandPlate({
  signals,
  statewide,
  pool,
  scope,
  published,
  pulse,
  filters,
  onToggleSector,
  onToggleStatus,
  onClearFilters,
}: BrandPlateProps) {
  // The legend is a statement about whatever the map is currently showing, so
  // it counts that set and nothing else. In the statewide view the two lines
  // that describe the district pipeline — how much landed recently, how many
  // notices the nine were chosen from — are not merely wrong, they are about a
  // different corpus, so neither is drawn.
  const state = scope === "state";
  const records = (state ? statewide : signals).map((placed) => placed.signal);
  const districts = new Set(signals.map((placed) => placed.signal.district));

  return (
    <motion.aside
      className="brand-plate"
      lang="mr"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
    >
      {/* The wordmark on the highlight yellow — the only large area of
          saturated colour inside the card, and so the first thing read. */}
      <div className="brand-head">
        <motion.h1 className="brand-title" variants={RISE} transition={{ duration: 0.7 }}>
          महाराष्ट्र <span className="brand-title-verb">घडतो आहे</span>
        </motion.h1>
      </div>

      <div className="brand-body">
        {/* What has moved lately, above everything else: the tally says how
            much is pinned, which is an editorial number, and this says how much
            the state actually did — which is the thing somebody arriving cold
            wants to know first. It counts the whole scraped corpus, not the
            pins, names its own window, and is not drawn when that window is
            empty. It is deliberately outside the narrowing: a reader filtering
            to water work has not changed what the state did last week. */}
        {state ? (
          <motion.p className="brand-pulse" variants={RISE} transition={{ duration: 0.7 }}>
            {MR.statewideIntro}
          </motion.p>
        ) : pulse ? (
          <motion.p className="brand-pulse" variants={RISE} transition={{ duration: 0.7 }}>
            {pulseMr(pulse)}
          </motion.p>
        ) : null}

        <motion.div variants={RISE} transition={{ duration: 0.7 }}>
          <MapFilters
            records={pool}
            filters={filters}
            onToggleSector={onToggleSector}
            onToggleStatus={onToggleStatus}
            onClear={onClearFilters}
          />
        </motion.div>

        <motion.div className="brand-rule" variants={RISE} transition={{ duration: 0.7 }} />

        {/* The result of the two things above it. When the narrowing matches
            nothing the figure would be a zero on its own, which reads as a
            broken map rather than as an answer — so the plate says so in
            words and keeps the reset one line above it. */}
        {records.length ? (
          <motion.p className="brand-count" variants={RISE} transition={{ duration: 0.7 }}>
            <span className="brand-count-figure">{countMr(records.length)}</span>
            <span className="brand-count-where">
              {state
                ? MR.allMaharashtra
                : districts.size === 1
                  ? `${districtMr([...districts][0])} ${MR.district}`
                  : `${toDevanagari(districts.size)} ${MR.district}`}
            </span>
          </motion.p>
        ) : (
          <motion.p className="brand-empty" variants={RISE} transition={{ duration: 0.7 }}>
            {MR.filtersEmpty}
          </motion.p>
        )}

        {!state && records.length > 0 && published > signals.length ? (
          <motion.p className="brand-note" variants={RISE} transition={{ duration: 0.7 }}>
            {toDevanagari(published)} {MR.selectedFrom}
          </motion.p>
        ) : null}
      </div>
    </motion.aside>
  );
}
