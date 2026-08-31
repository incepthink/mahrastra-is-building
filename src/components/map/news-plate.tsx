"use client";

import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { DGIPR_MR, releaseCountMr } from "@/lib/dgipr/marathi";
import {
  agoMr,
  articleCountMr,
  districtCountMr,
  NEWS_MR,
  toDevanagari,
} from "@/lib/news/marathi";
import { WINDOWS } from "@/lib/news/window";
import type { DgiprMap } from "@/types/dgipr";
import type {
  MapMode,
  NewsMap,
  NewsStories,
  WindowId,
} from "@/types/news";

const RISE = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
};

type Band = { level: number; min: number; max: number };

type NewsPlateProps = {
  map: NewsMap;
  bands: Band[];
  /** What the reader asked for, which may be tighter than what is shown. */
  window: WindowId;
  onWindow: (id: WindowId) => void;
  /** What the sheet is showing. Client state — see `onMode`. */
  mode: MapMode;
  onMode: (mode: MapMode) => void;
  /** The story layer, for the mode chip's count and the pin key. Null when
   *  `.data/stories.db` has never been built, in which case there is no
   *  second mode to offer and the control does not appear. */
  stories: NewsStories | null;
  /** The government overlay, for the filter chip's count and its key. */
  dgipr: DgiprMap;
  /** Whether that overlay is on the sheet. A filter, not a mode — see the note
   *  on `official` in `NewsMap`. */
  official: boolean;
  onOfficial: () => void;
  articles: number;
  districts: number;
  now: Date | null;
};

/**
 * The legend: what the map is showing, how to change it, and what its colours
 * mean.
 *
 * Read top to bottom it is a sentence — **what** (the mode), **when** (the
 * window), **how much that is** (the tally), **what the paint means** (the
 * ramp). The tally sits under the controls because it is their result: a
 * reader switching from 24 hours to a week watches the figure move rather than
 * having to count districts.
 *
 * The plate this replaces offered ten sectors and five stages. Neither exists
 * in this corpus — a newspaper article has no sector taxonomy and no lifecycle
 * — and inventing one by keyword would have been the map asserting something
 * the data does not say. Time is the one axis the data actually has, so it is
 * the one axis the reader gets.
 */
export function NewsPlate({
  map,
  bands,
  window,
  onWindow,
  mode,
  onMode,
  stories,
  dgipr,
  official,
  onOfficial,
  articles,
  districts,
  now,
}: NewsPlateProps) {
  const collected = agoMr(map.collectedAt ?? "", now);

  /**
   * Whether the folding half of the plate is showing.
   *
   * Only ever consulted on a phone. At desktop width the plate is a column
   * beside the state with room for all of it, so the CSS shows every fold
   * regardless of this flag and hides the button that flips it — which is why
   * the initial value can be a constant rather than a viewport measurement.
   * Reading the width here would mean either an effect that pops the plate
   * open after paint or a media query duplicated in two languages.
   */
  const [open, setOpen] = useState(false);

  return (
    <motion.aside
      className="brand-plate news-plate"
      lang="mr"
      data-open={open || undefined}
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
    >
      <div className="brand-head">
        <motion.h1 className="brand-title" variants={RISE} transition={{ duration: 0.7 }}>
          महाराष्ट्र <span className="brand-title-verb">घडतो आहे</span>
        </motion.h1>

        {/* The phone's way back to the map. Printed in the wordmark block
            rather than under it because that block is the only part of the
            plate that never folds, and a control that scrolls away with the
            thing it controls cannot close it again. */}
        <button
          type="button"
          className="news-plate-toggle"
          aria-expanded={open}
          aria-controls="news-plate-controls"
          aria-label={open ? NEWS_MR.filtersHide : NEWS_MR.filtersShow}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="news-plate-toggle-word">{NEWS_MR.filters}</span>
          <ChevronDown
            className="news-plate-toggle-mark"
            aria-hidden
            size={15}
            strokeWidth={2}
          />
        </button>
      </div>

      <div className="brand-body">
        {/* When the collector last wrote. The map's entire claim is that it is
            current, and a claim like that has to carry its own timestamp or a
            reader has no way to tell a live map from a screenshot. */}
        {collected ? (
          <motion.p className="news-plate-stamp" variants={RISE} transition={{ duration: 0.7 }}>
            <span className="news-plate-live" aria-hidden />
            {NEWS_MR.collectedAt} {collected}
          </motion.p>
        ) : null}

        {/* Everything marked `news-plate-fold` is what a phone puts away: the
            controls and the keys. What is left standing — the wordmark, the
            timestamp, the tally — is the plate's claim about the map, and a
            claim is not something a reader should have to open a panel to
            read. At desktop width nothing folds. */}
        <motion.div
          id="news-plate-controls"
          className="news-controls news-plate-fold"
          variants={RISE}
          transition={{ duration: 0.7 }}
        >
          {/* What the sheet is showing. Answered entirely in the browser: both
              layers were read in the same pass on the server, so flipping
              between them changes which of two things already in memory is
              drawn — where the window changes which rows exist at all and has
              to go back. See `NewsMapShell`.

              Offered only when there is a story layer to offer. A deploy that
              has never run `pnpm news:stories` gets the choropleth alone,
              which is a complete map rather than a broken one. */}
          {stories ? (
            <fieldset className="news-control">
              <legend className="news-control-label">{NEWS_MR.mode}</legend>
              <div className="news-chips">
                <button
                  type="button"
                  className="news-chip"
                  data-active={mode === "heat" || undefined}
                  aria-pressed={mode === "heat"}
                  onClick={() => onMode("heat")}
                >
                  {NEWS_MR.modeHeat}
                </button>
                <button
                  type="button"
                  className="news-chip"
                  data-active={mode === "pins" || undefined}
                  aria-pressed={mode === "pins"}
                  onClick={() => onMode("pins")}
                >
                  {NEWS_MR.modePins}
                  <span className="news-chip-count">
                    {toDevanagari(stories.total)}
                  </span>
                </button>
              </div>
            </fieldset>
          ) : null}

          <fieldset className="news-control">
            <legend className="news-control-label">{NEWS_MR.window}</legend>
            <div className="news-chips">
              {WINDOWS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="news-chip"
                  data-active={option.id === window || undefined}
                  aria-pressed={option.id === window}
                  onClick={() => onWindow(option.id)}
                >
                  {option.labelMr}
                </button>
              ))}
            </div>
          </fieldset>

          {/* The source filter. Sits below the window rather than beside the
              mode, because it is not an alternative to anything: the mode chips
              choose between two readings of the press corpus, and this adds a
              second corpus over whichever one is showing.

              Offered even when the count is zero. An empty government layer is
              a fact about a quiet week at the directorate, and a control that
              disappears when its answer is "none" leaves a reader unable to
              tell that from the feature not existing. */}
          <fieldset className="news-control">
            <legend className="news-control-label">{DGIPR_MR.source}</legend>
            <div className="news-chips">
              <button
                type="button"
                className="news-chip news-chip-official"
                data-active={official || undefined}
                aria-pressed={official}
                onClick={onOfficial}
              >
                {DGIPR_MR.tag}
                <span className="news-chip-count">
                  {toDevanagari(dgipr.totals.releases)}
                </span>
              </button>
            </div>
          </fieldset>

        </motion.div>

        {/* Said only when it happened. The window the reader picked was empty,
            so the map widened it rather than showing a blank state — but a map
            that silently answers a different question than the one asked is
            worse than one that shows nothing. */}
        {map.widened ? (
          <motion.p className="news-plate-note news-plate-fold" variants={RISE} transition={{ duration: 0.7 }}>
            {NEWS_MR.windowWidened}
          </motion.p>
        ) : null}

        <motion.div className="brand-rule" variants={RISE} transition={{ duration: 0.7 }} />

        {articles > 0 ? (
          <motion.p className="brand-count" variants={RISE} transition={{ duration: 0.7 }}>
            <span className="brand-count-figure">{articleCountMr(articles)}</span>
            <span className="brand-count-where">{districtCountMr(districts)}</span>
          </motion.p>
        ) : (
          <motion.p className="brand-empty" variants={RISE} transition={{ duration: 0.7 }}>
            {NEWS_MR.noDatabase}
          </motion.p>
        )}

        {/* The key to the government mark, printed whenever the layer is on
            and under either mode. It says the same thing the district-tier pin
            key says — somewhere in this district — because it is the same
            claim; what it has to add is which shape on the sheet is making it
            and where that shape came from. */}
        {official ? (
          <motion.div className="news-ramp news-plate-fold" variants={RISE} transition={{ duration: 0.7 }}>
            <p className="news-control-label">{DGIPR_MR.layer}</p>

            <ul className="pin-key">
              <li className="pin-key-row">
                <svg className="pin-key-mark" viewBox="-13 -13 26 26" aria-hidden>
                  <circle className="map-dgipr-halo" r="11.5" />
                  <circle className="map-dgipr-ring" r="6.4" />
                  <rect
                    className="map-dgipr-core"
                    x="-2.4"
                    y="-2.4"
                    width="4.8"
                    height="4.8"
                    rx="0.7"
                  />
                </svg>
                <span>
                  <span className="pin-key-name">{DGIPR_MR.keyName}</span>
                  <span className="pin-key-note">{DGIPR_MR.keyNote}</span>
                </span>
              </li>
            </ul>

            {/* This layer widens its own window when the one the reader picked
                reached too few districts to read as a map — see `DISTRICT_FLOOR`
                in `loadDgipr`. Said here, because a layer quietly showing a
                different fortnight than the map under it is exactly the
                disagreement the window control exists to prevent. */}
            {dgipr.widened ? (
              <p className="pin-key-statewide">{DGIPR_MR.widened}</p>
            ) : null}

            {dgipr.totals.releases === 0 ? (
              <p className="pin-key-statewide">{DGIPR_MR.none}</p>
            ) : null}

            {/* A release whose dateline names no district on the map gets no
                mark, the same way a statewide story does, and is counted here
                rather than allowed to vanish. */}
            {dgipr.totals.unplaced > 0 ? (
              <p className="pin-key-statewide">
                {releaseCountMr(dgipr.totals.unplaced)} — {DGIPR_MR.unplaced}
              </p>
            ) : null}
          </motion.div>
        ) : null}

        {/* The key to the marks, when the marks are stories.
            `choropleth-layer.tsx` objects that "a pin at a centroid is a lie
            told with great precision", and `PinLayer` answers it by making the
            precision visible in the shape — which only works if the shapes have
            been explained once. This is where they are explained. */}
        {mode === "pins" && stories ? (
          <motion.div className="news-ramp news-plate-fold" variants={RISE} transition={{ duration: 0.7 }}>
            <p className="news-control-label">{NEWS_MR.precision}</p>

            <ul className="pin-key">
              <li className="pin-key-row">
                <svg className="pin-key-mark" viewBox="-14 -24 28 28" aria-hidden>
                  <path className="map-pin-stake" d="M0 0 L-5.6 -10 A6.6 6.6 0 1 1 5.6 -10 Z" />
                  <circle className="map-pin-tip" r="1.4" />
                </svg>
                <span>
                  <span className="pin-key-name">{NEWS_MR.tierTaluka}</span>
                  <span className="pin-key-note">{NEWS_MR.tierTalukaNote}</span>
                </span>
              </li>

              <li className="pin-key-row">
                <svg className="pin-key-mark" viewBox="-14 -14 28 28" aria-hidden>
                  <circle className="map-pin-halo" r="13" />
                  <circle className="map-pin-ring" r="6.4" />
                  <circle className="map-pin-core" r="2.1" />
                </svg>
                <span>
                  <span className="pin-key-name">{NEWS_MR.tierDistrict}</span>
                  <span className="pin-key-note">{NEWS_MR.tierDistrictNote}</span>
                </span>
              </li>
            </ul>

            {/* Statewide stories have no place, so they get no mark. Said here
                rather than left out, because a story that silently disappears
                between two modes reads as the map having lost it. */}
            {stories.statewide > 0 ? (
              <p className="pin-key-statewide">
                {toDevanagari(stories.statewide)} {NEWS_MR.storiesStatewide}
              </p>
            ) : null}
          </motion.div>
        ) : null}

        {/* The key to the paint. Printed with its count band rather than as a
            bare gradient, because the ramp is quantile — the steps mean rank,
            not amount, and a legend that shows only colour would let a reader
            infer an absolute scale the map does not have. See `scale.ts`. */}
        {mode === "heat" && bands.length > 0 ? (
          <motion.div
            className="news-ramp news-plate-fold"
            variants={RISE}
            transition={{ duration: 0.7 }}
          >
            <p className="news-control-label">{NEWS_MR.intensity}</p>

            <div className="news-ramp-steps">
              {bands.map((band) => (
                <div key={band.level} className="news-ramp-step">
                  <span
                    className="news-ramp-swatch"
                    data-level={band.level}
                    aria-hidden
                  />
                  <span className="news-ramp-band">
                    {band.min === band.max
                      ? toDevanagari(band.min)
                      : `${toDevanagari(band.min)}–${toDevanagari(band.max)}`}
                  </span>
                </div>
              ))}
            </div>

            <p className="news-ramp-ends" aria-hidden>
              <span>{NEWS_MR.fewer}</span>
              <span>{NEWS_MR.more}</span>
            </p>
          </motion.div>
        ) : null}
      </div>
    </motion.aside>
  );
}
