import "server-only";

import { query } from "./db";
import type { Velocity } from "@/types/news";

/**
 * How fast the press moved a story — the derivative `prominence.ts` is the
 * level of.
 *
 * `scripts/news/rank.mjs` writes down the ordered link list of every watched
 * section page and draws no conclusion from it. `prominence.ts` draws one
 * conclusion — how far a story got. This draws the other — how fast it got
 * there. Both live at read time for the same reason: the constants below are
 * ours rather than the newsroom's, and Lokmat keeps no archive, so a constant
 * frozen into a capture is frozen for a week that cannot be collected twice.
 *
 * **The signal was measured before it was designed.** Across 515 URLs seen in
 * two or more full sweeps, 510 — 99.0% — were at their peak reach the first
 * time they were ever seen. Reach does not drift upward; it steps. The five
 * URLs that moved went 1 → 41 pages in fifty minutes, 3 → 35 in nineteen,
 * 10 → 34 in three. Every one of those is a story being lifted into the
 * masthead's sitewide top-stories block.
 *
 * That measurement is why this module records a climb between two named
 * observations rather than fitting a slope through a series. A least-squares
 * rate over a step function is a worse number *and* an unexplainable one, and
 * `scripts/news/README.md` sets explainability as the bar: "on one page at
 * 12:04, on forty-one at 13:10" is defensible in a way no fitted coefficient
 * is.
 */

/**
 * The share of a masthead's pages that means "the paper put this everywhere".
 *
 * Not a guess. On a full capture the distribution is empty across the middle:
 * Lokmat's carried links sit at 41/41, 39/41 and 39/41 and then nothing until
 * 6/41; Loksatta's sit at 10/10 four times and then nothing until 2/10. Any
 * threshold between 0.25 and 0.9 labels the same rows, so this is the middle
 * of the empty band rather than a tuned edge — and it reads as the plain claim
 * it is, that more than half the site was carrying the story.
 */
const SITEWIDE_FRACTION = 0.5;

/**
 * How much of a masthead a capture must have reached to be usable here.
 *
 * A torn capture is the one way this arithmetic can invent fire that never
 * happened. The corpus already contains the case: a fourteen-page Lokmat sweep
 * at 12:56 shows the Parbhani story falling 40 → 13 pages, which is not a story
 * losing its place, it is us not looking. `prominence.ts` answers the same
 * problem by holding the denominator at the widest sweep ever completed, so a
 * thin capture reads *low* — the honest direction for a level.
 *
 * A rate has no honest direction: a thin capture at either end of an interval
 * fabricates a collapse or a climb depending on which end it lands. So thin
 * captures are not corrected here, they are excluded, and the exclusion is
 * per-source because the two mastheads are swept independently — the 08-29
 * 23:13 capture reached all ten Loksatta pages and no Lokmat page at all, and
 * it is a perfectly good Loksatta observation.
 *
 * The residual error this leaves is bounded and small. A story genuinely on a
 * fraction f of a source's pages can appear on at most f/0.6 = 1.67f of a
 * capture that only reached 60% of them, so the worst fake climb available to
 * a low-reach story is from 0.15 to 0.25 — nowhere near `SITEWIDE_FRACTION`,
 * and the sitewide block itself is immune because it is on every page, so any
 * sample of the site finds it at the same fraction.
 */
const MIN_COVERAGE = 0.6;

/**
 * The fastest rate the collector can actually resolve.
 *
 * The Windows task runs `news:cycle` every fifteen minutes, so a climb that
 * happens between two adjacent captures took *at most* that long and possibly
 * much less. Dividing a full climb by the true elapsed time would hand a story
 * that jumped inside a three-minute manual double-run a rate twenty times any
 * story observed on the real cadence — an artefact of when we happened to look,
 * ranked as if it were an artefact of what the newsroom did.
 *
 * So the interval is floored at the cadence. A rate is not measurable faster
 * than its sampling, and claiming otherwise ranks our own timing.
 */
const MIN_RESOLVABLE_HOURS = 0.25;

/**
 * How long a climb may take before it stops counting for its full size.
 *
 * A climb is scored as `min(size, size per hour)` — its magnitude, discounted
 * in proportion once it takes longer than this to happen. Both halves are
 * necessary and scoring on either alone is wrong in a way the corpus shows:
 *
 * - **Rate alone saturates.** With the sampling floor below, any gain of a
 *   quarter of a masthead inside one capture interval hits the ceiling. Two
 *   Loksatta pieces that reached 3 of 10 pages tied exactly with a Thane
 *   drowning on 40 of 41 and a Parbhani story that went 1 → 41. A board cannot
 *   call those the same event; the difference between three pages and forty is
 *   the entire signal.
 * - **Size alone cannot tell fresh fire from old.** A story that took all
 *   afternoon to reach the block is not doing what one that got there in twenty
 *   minutes is doing.
 *
 * Taking the smaller of the two keeps the magnitude in charge and lets speed
 * only ever discount it, which is also the conservative direction: nothing is
 * ranked above what it actually achieved.
 */
const RATE_REFERENCE_HOURS = 1;

/**
 * Reach against position, for the *rate*.
 *
 * `prominence.ts` splits a level 0.7/0.3 and explains why reach is the sturdier
 * half: it is a count of pages, where position is an index into markup whose
 * relationship to the rendered page is approximate. Every word of that applies
 * here and the measurement pushes it further. Across the best window the corpus
 * offers — 1.17h, six full sweeps — not one URL improved its position while
 * three were promoted outright. Position moved on the eighteen-hour gap and not
 * on the hour. It is corroboration on this timescale, not evidence.
 */
const REACH_WEIGHT = 0.85;
const POSITION_WEIGHT = 1 - REACH_WEIGHT;

/** Past this rank one position is not distinguishable from the next. The same
 *  floor and the same reasoning as `prominence.ts`; kept identical on purpose,
 *  so the level and its derivative never disagree about what "high" means. */
const POSITION_FLOOR = 30;

/** The window the board asks about by default. */
export const DEFAULT_VELOCITY_HOURS = 3;

type CaptureRow = { captured_at: string; source_id: string; pages: number };
type SeenRow = {
  captured_at: string;
  source_id: string;
  url: string;
  pages: number;
  best_position: number;
};

export type VelocityReading = {
  byUrl: Map<string, Velocity>;
  /** The newest capture the window is anchored on. Null when nothing is
   *  eligible — a fresh clone, or a collector that has never completed a sweep. */
  asOf: string | null;
  /** Eligible captures in the window, per source. The board says this out loud
   *  rather than implying a confidence it has not earned. */
  capturesBySource: Record<string, number>;
  /** The span those captures actually covered. While the collector is filling
   *  its first window this is smaller than `windowHours`, and the difference is
   *  the whole of what "not enough history yet" means. */
  observedHours: number;
  windowHours: number;
};

/**
 * Reach and position velocity for every URL the section pages carried.
 *
 * One pass over two small indexed tables rather than a query per article, on
 * the same argument `prominence.ts` makes: a three-hour window is at most
 * twelve captures of ~500 links, and per-URL lookups would be five hundred
 * statements answering one question.
 *
 * **The window is anchored on the newest capture, not on the wall clock.** If
 * the collector stopped four hours ago, anchoring on `now` yields an empty
 * window and a board of silent zeros — which reads as "nothing is happening"
 * when the truth is "we stopped looking". Anchoring on the last capture yields
 * the last real three hours and an `asOf` that says how stale they are. The
 * page already surfaces the same distinction as `sweptAt`.
 */
export function velocityByUrl(
  windowHours: number = DEFAULT_VELOCITY_HOURS,
): VelocityReading {
  const captures = eligibleCaptures();
  const empty: VelocityReading = {
    byUrl: new Map(),
    asOf: null,
    capturesBySource: {},
    observedHours: 0,
    windowHours,
  };

  if (captures.length === 0) return empty;

  const asOf = captures[captures.length - 1].captured_at;
  const since = new Date(
    new Date(asOf).getTime() - windowHours * 3600_000,
  ).toISOString();

  const inWindow = captures.filter((row) => row.captured_at >= since);
  if (inWindow.length === 0) return { ...empty, asOf };

  // Captures per source, oldest first. Kept per source because absence is only
  // evidence of absence on a source we actually swept: a Lokmat URL missing
  // from a capture that reached no Lokmat page has not lost its place, it was
  // never asked about.
  const bySource = new Map<string, CaptureRow[]>();
  for (const row of inWindow) {
    const list = bySource.get(row.source_id) ?? [];
    list.push(row);
    bySource.set(row.source_id, list);
  }

  const seen = observationsSince(since);

  // (source, url) → captured_at → what we saw. Absence from this map at an
  // eligible capture is a reach of zero, and that is an observation rather than
  // an assumption: we looked at 60–100% of that masthead and the link was on
  // none of it.
  const observed = new Map<string, Map<string, SeenRow>>();
  for (const row of seen) {
    const key = `${row.source_id} ${row.url}`;
    const perCapture = observed.get(key) ?? new Map<string, SeenRow>();
    perCapture.set(row.captured_at, row);
    observed.set(key, perCapture);
  }

  const byUrl = new Map<string, Velocity>();

  for (const [key, perCapture] of observed) {
    const [sourceId, url] = key.split(" ");
    const timeline = bySource.get(sourceId);

    // Two observations are the minimum a change can be seen in. One capture is
    // a level, and a level is `prominence.ts`'s job.
    if (!timeline || timeline.length < 2) continue;

    const velocity = velocityOf(sourceId, timeline, perCapture);
    if (!velocity) continue;

    // A URL cannot appear on two mastheads' pages, but nothing in the schema
    // forbids it, so the stronger reading wins rather than the last one read.
    const existing = byUrl.get(url);
    if (!existing || velocity.score > existing.score) byUrl.set(url, velocity);
  }

  const capturesBySource: Record<string, number> = {};
  for (const [sourceId, list] of bySource) capturesBySource[sourceId] = list.length;

  return {
    byUrl,
    asOf,
    capturesBySource,
    observedHours: hoursBetween(inWindow[0].captured_at, asOf),
    windowHours,
  };
}

/**
 * One URL's climb across one masthead's timeline.
 *
 * The climb is measured from the **foot of the rise**, not from the left edge
 * of the window: the last capture at which reach was still at its lowest before
 * the peak. Measuring from the window edge would divide a promotion that
 * happened in one fifteen-minute step by the full three hours and report a
 * story that went sitewide in a quarter of an hour as an eighth as hot as it
 * was. Since 99% of these series are flat, the foot of the rise is usually the
 * capture immediately before the step, which is exactly the interval the climb
 * is known to have happened in.
 */
function velocityOf(
  sourceId: string,
  timeline: CaptureRow[],
  perCapture: Map<string, SeenRow>,
): Velocity | null {
  const series = timeline.map((capture) => {
    const hit = perCapture.get(capture.captured_at);

    return {
      at: capture.captured_at,
      // Normalised inside the source. Lokmat sweeps 41 section pages and
      // Loksatta 10, so a shared denominator would cap a Loksatta story its own
      // paper had put on every page at 0.196 while a Lokmat story on a quarter
      // of its pages scored higher. That is not a difference between the
      // stories, it is a difference between the two sites' navigation.
      reach: hit ? clamp01(Number(hit.pages) / Math.max(1, Number(capture.pages))) : 0,
      pages: hit ? Number(hit.pages) : 0,
      sitePages: Math.max(1, Number(capture.pages)),
      position: hit ? Number(hit.best_position) : null,
    };
  });

  // First occurrence of the maximum: a story that reached the block and stayed
  // there climbed when it got there, not on every capture since.
  let peakIndex = 0;
  for (let i = 1; i < series.length; i += 1) {
    if (series[i].reach > series[peakIndex].reach) peakIndex = i;
  }

  // The foot of the rise: the last capture at or before the peak that was still
  // at the minimum of everything up to it.
  let baseIndex = 0;
  let lowest = series[0].reach;
  for (let i = 1; i <= peakIndex; i += 1) {
    if (series[i].reach <= lowest) {
      lowest = series[i].reach;
      baseIndex = i;
    }
  }

  const base = series[baseIndex];
  const peak = series[peakIndex];
  const last = series[series.length - 1];

  /**
   * The climb is measured to where the story stands **now**, not to how high it
   * briefly got.
   *
   * Measured, the difference decides the top of the board. One Loksatta piece
   * went from absent to all ten pages and back to one inside three captures;
   * scoring it on its peak put it first, level with a Thane drowning that
   * reached thirty-four Lokmat pages and was still on all of them an hour
   * later. Those are not the same event. The first is the top-stories block
   * turning over — measured across nine captures, five of Loksatta's and
   * Lokmat's fourteen sitewide links appeared in exactly one capture — and the
   * second is a newsroom deciding a story matters.
   *
   * A board that answers "what is on fire" is making a claim about the present
   * tense, so the number behind it has to be a claim about the present tense
   * too: on forty-one pages now, up from one an hour ago. `peak` stays in the
   * record as evidence, so a spike that fell back is visible as `peak > to`
   * rather than being silently discarded.
   */
  const climb = last.reach - base.reach;

  // Never rose, or rose and gave it all back. Reported as no fire rather than
  // as a zero score, so the 99% that do nothing cost nothing to carry.
  if (climb <= 0) return null;

  // The interval the rise actually happened in — floored at the cadence,
  // because the collector cannot resolve a rate finer than it samples.
  const climbHours = Math.max(
    MIN_RESOLVABLE_HOURS,
    hoursBetween(base.at, peak.at),
  );
  const climbPerHour = climb / climbHours;

  /**
   * The climb, capped by its own rate — see `RATE_REFERENCE_HOURS`.
   *
   * `min(climb, climbPerHour)` reads as: a climb counts for its full size when
   * it happened inside the hour, and is discounted in proportion when it took
   * longer. It can never exceed the climb itself, so no story outranks what the
   * page counts actually show it did.
   */
  const reachTerm = Math.min(climb, climbPerHour * RATE_REFERENCE_HOURS);

  /**
   * Position is only evidence when the link was on the page at both ends.
   *
   * A link that was absent has no position to have climbed from, and treating
   * that as a climb from the bottom hands every newly published article the
   * whole positional weight for the unremarkable act of appearing near the top
   * of one section page. That is a level, it is already counted in reach, and
   * counting it twice put routine arrivals a third of the way up a scale whose
   * top is meant to mean a masthead moved a story across its entire site.
   *
   * So an arrival scores on reach alone, which is the sturdier signal anyway,
   * and the positional term is reserved for what it can actually see: a link
   * that was already there and moved up.
   */
  const rankFrom = positionRank(base.position);
  const rankTo = positionRank(last.position);
  const rankGain = base.position === null ? 0 : Math.max(0, rankTo - rankFrom);
  // Capped by its own rate on exactly the same argument as the reach term.
  const positionTerm = Math.min(
    rankGain,
    (rankGain / climbHours) * RATE_REFERENCE_HOURS,
  );

  const score =
    REACH_WEIGHT * clamp01(reachTerm) + POSITION_WEIGHT * clamp01(positionTerm);

  return {
    sourceId,
    from: round(base.reach),
    pagesFrom: base.pages,
    pagesPeak: peak.pages,
    pagesTo: last.pages,
    sitePages: last.sitePages,
    peak: round(peak.reach),
    to: round(last.reach),
    climb: round(climb),
    climbPerHour: round(climbPerHour),
    fromAt: base.at,
    peakAt: peak.at,
    arrived: base.reach === 0,
    // Crossed into the block *and is still in it* — the same present-tense test
    // the climb is measured by. A story that touched the block for one capture
    // and dropped out has `peak >= SITEWIDE_FRACTION` to show for it and does
    // not get to claim the newsroom is carrying it everywhere.
    promoted: base.reach < SITEWIDE_FRACTION && last.reach >= SITEWIDE_FRACTION,
    positionFrom: base.position,
    positionTo: last.position,
    captures: series.length,
    observedHours: round(hoursBetween(series[0].at, last.at)),
    score: round(score),
  };
}

/**
 * Captures worth measuring against, with how much of each masthead they saw.
 *
 * Read from both tables and the larger taken, for the reason `prominence.ts`
 * sets out at length: `rank_sweeps` is the authoritative record of what was
 * attempted but was added to the schema after collection had begun, so the
 * earliest captures have snapshots and no sweep row at all — the 08-29 18:09
 * capture plainly covers 51 pages and has no sweep row for any of them.
 * `rank_snapshots` reads slightly low, since a page that returned no links
 * leaves no rows in it, and low is the safe side of a coverage test.
 */
function eligibleCaptures(): CaptureRow[] {
  return query<CaptureRow>(
    `WITH looked AS (
       SELECT captured_at, source_id, MAX(pages) AS pages FROM (
         SELECT captured_at, source_id, COUNT(*) AS pages
           FROM rank_sweeps WHERE ok = 1
          GROUP BY captured_at, source_id
         UNION ALL
         SELECT captured_at, source_id, COUNT(DISTINCT page_id) AS pages
           FROM rank_snapshots
          GROUP BY captured_at, source_id
       )
       GROUP BY captured_at, source_id
     ),
     site AS (
       -- How many pages each masthead is believed to have: the most that ever
       -- answered for it in one capture.
       SELECT source_id, MAX(pages) AS pages FROM looked GROUP BY source_id
     )
     SELECT l.captured_at, l.source_id, l.pages
       FROM looked l JOIN site s ON s.source_id = l.source_id
      WHERE l.pages >= ? * s.pages
      ORDER BY l.captured_at`,
    MIN_COVERAGE,
  );
}

function observationsSince(since: string): SeenRow[] {
  return query<SeenRow>(
    `SELECT captured_at, source_id, url,
            COUNT(DISTINCT page_id) AS pages,
            MIN(position)           AS best_position
       FROM rank_snapshots
      WHERE captured_at >= ?
      GROUP BY captured_at, source_id, url`,
    since,
  );
}

/**
 * A position turned into something 0–1 that rises as the link climbs.
 *
 * Null — the link was not on the page at all — is nil rather than the worst
 * rank, which keeps it consistent with the reach of an absent link being zero.
 * The same discipline `yt_stats` documents for a hidden view count: absent is
 * not the bottom of the scale, but here it genuinely is the bottom, because a
 * link nobody carried has no position to be generous about.
 */
function positionRank(position: number | null): number {
  if (position === null) return 0;

  return 1 - Math.min(position, POSITION_FLOOR) / POSITION_FLOOR;
}

function hoursBetween(from: string, to: string): number {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3600_000);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
