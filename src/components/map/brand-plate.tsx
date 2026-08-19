"use client";

import { motion } from "motion/react";

import { CATEGORIES } from "@/data/categories";
import { countMr, districtMr, pulseMr, toDevanagari, MR } from "@/lib/signals/marathi";
import type { PlacedSignal, SignalCategoryId, SignalPulse } from "@/types/signal";

const RISE = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
};

type BrandPlateProps = {
  /** The curated set — exactly what is pinned on the map. */
  signals: PlacedSignal[];
  /** How many records are published in the pilot altogether. */
  published: number;
  /** Recent activity across the whole pipeline, or null when there is none to
   *  report honestly. See `recentPulse`. */
  pulse: SignalPulse | null;
};

/**
 * The identity, and the one number that says how much is on the map.
 *
 * Below the rule it breaks that number down **by sector**, which is the
 * breakdown a reader actually navigates by: "is there anything about water
 * near me" is a question the map can answer, where "how many records are at
 * the approved stage" is trivia. The status ladder used to sit here and own
 * the whole legend; it now lives where it belongs — on the pin you are looking
 * at, and on the stage meter inside an open record.
 *
 * Each row is the pin's head, at legend size: the same disc, the same pastel
 * plate, the same glyph on it. That is the point of the row — a reader who sees
 * a green `शेती` chip here should find a green pin on the map, and until the
 * pin's disc took the sector plate they did not: the disc was the status ink
 * and the sector survived only as a hairline collar, so the legend and the map
 * disagreed about what colour a sector is. Sectors with nothing in them are
 * left out entirely — an empty row is a question, not information.
 *
 * The tally counts **what is pinned**, not what is published, and the line
 * under it says how many were published.
 */
export function BrandPlate({ signals, published, pulse }: BrandPlateProps) {
  const tally = countByCategory(signals);
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
        {/* What has moved lately, above the tally rather than below it: the
            tally says how much is pinned, which is an editorial number, and
            this says how much the state actually did — which is the thing
            somebody arriving cold wants to know first. It counts the whole
            scraped corpus, not the pins, and names its own window; when the
            window is empty the line is simply not drawn. */}
        {pulse ? (
          <motion.p className="brand-pulse" variants={RISE} transition={{ duration: 0.7 }}>
            {pulseMr(pulse)}
          </motion.p>
        ) : null}

        <motion.p className="brand-count" variants={RISE} transition={{ duration: 0.7 }}>
          <span className="brand-count-figure">{countMr(signals.length)}</span>
          <span className="brand-count-where">
            {districts.size === 1
              ? `${districtMr([...districts][0])} ${MR.district}`
              : `${toDevanagari(districts.size)} ${MR.district}`}
          </span>
        </motion.p>

        {published > signals.length ? (
          <motion.p className="brand-note" variants={RISE} transition={{ duration: 0.7 }}>
            {toDevanagari(published)} {MR.selectedFrom}
          </motion.p>
        ) : null}

        <motion.div className="brand-rule" variants={RISE} transition={{ duration: 0.7 }} />

        <motion.ul className="brand-sectors" variants={RISE} transition={{ duration: 0.7 }}>
          {CATEGORIES.filter((category) => tally[category.id] > 0).map((category) => (
            <li
              key={category.id}
              className="brand-sector-row"
              style={{ "--sector": category.tint } as React.CSSProperties}
            >
              <span className="brand-sector-icon" aria-hidden>
                <category.icon size={17} strokeWidth={1.9} />
              </span>
              <span className="brand-sector-word">{category.labelMr}</span>
              <span className="brand-sector-count numeric">{toDevanagari(tally[category.id])}</span>
            </li>
          ))}
        </motion.ul>
      </div>
    </motion.aside>
  );
}

function countByCategory(signals: PlacedSignal[]): Record<SignalCategoryId, number> {
  const tally = Object.fromEntries(
    CATEGORIES.map((category) => [category.id, 0]),
  ) as Record<SignalCategoryId, number>;

  signals.forEach(({ signal }) => {
    tally[signal.category] += 1;
  });

  return tally;
}
