import "server-only";

import { query, storyQuery, storyQueryOne } from "./db";
import { DEFAULT_VELOCITY_HOURS, velocityByUrl } from "./velocity";
import type { FireBoard, FireEntry, PlaceTier, Velocity } from "@/types/news";

/**
 * What is on fire — the read side of the trending service.
 *
 * `prominence.ts` says how far a story got. `velocity.ts` says how fast it got
 * there. This attributes both to the running story they belong to, adds the one
 * signal that needs no section-page history at all, and ranks the result.
 *
 * **The unit is a thread and never an article**, because an article cannot
 * grow. It is filed once; that is the whole of its life. Everything capable of
 * rising — a second masthead picking it up, a follow-up the next morning, a
 * promotion across the site — is a property of the running story. So the climb
 * is measured per URL in `velocity.ts` and gathered here onto the story.
 *
 * **The model has no vote here.** It named these threads and that is all it
 * did. Every number below is a count of rows or a difference between two counts
 * of rows, which is the line `scripts/news/README.md` draws and the reason this
 * board can be defended a claim at a time.
 */

/**
 * A thread's fire is its hottest article, not the sum of its articles.
 *
 * Summing would rank a story by how many pieces it has, which is already what
 * the arrival term counts, and would let ten articles that each crept onto one
 * extra page outrank one article a masthead put across its entire site. The
 * defensible sentence is about a specific piece — "its lead went from one
 * section page to forty-one between 12:04 and 13:10" — and a sum has no such
 * sentence, because no article did what the sum describes.
 */
function hottest(velocities: Velocity[]): Velocity | null {
  let best: Velocity | null = null;
  for (const velocity of velocities) {
    if (!best || velocity.score > best.score) best = velocity;
  }

  return best;
}

/**
 * How many articles a story has to take from the window to count as fed.
 *
 * Expressed as a multiple of what an ordinary story took rather than as a fixed
 * count, because the newsroom's day has a strong shape — measured across the
 * corpus, arrivals run at about 2/hour overnight against 27/hour at midday, a
 * thirteenfold swing. A fixed "three articles in three hours is hot" would call
 * every story dead at 4am and every story hot at noon, which is a fact about
 * office hours in Mumbai rather than about the news.
 *
 * Three times the ordinary appetite tops the scale. Two mastheads returning to
 * a story twice each inside a window while the average story is filed once is
 * the press staying on something.
 */
const ARRIVAL_RATIO_CEILING = 3;

/**
 * How far back to count arrivals — and why it is not the velocity window.
 *
 * These two signals move at different speeds and putting them on one clock
 * silently deletes the slower of them. Measured against the corpus, counting
 * from the newest capture:
 *
 * | window | stories filing | with 2+ articles | most by one story |
 * | --- | --- | --- | --- |
 * | 3h | 20 | **0** | 1 |
 * | 6h | 60 | 3 | 2 |
 * | 12h | 102 | 5 | 4 |
 * | 24h | 128 | 7 | 6 |
 * | 48h | 293 | 24 | 13 |
 *
 * In three hours **no story in the corpus files a second article**, so at the
 * velocity window this term is not weak, it is arithmetically incapable of
 * being anything but zero, and its only effect is to scale every score down by
 * its own weight. A newsroom promotes a story across its site inside one
 * fifteen-minute capture; it writes the follow-up the next morning.
 *
 * A day is the shortest window in which returning to a story is distinguishable
 * from filing one, and it is also a natural unit for a press cycle. The mean
 * stays near one article per story at every width above, so the expectation
 * this is measured against does not drift as the window widens — what changes
 * is only whether the stories that beat it exist yet.
 */
const ARRIVAL_HOURS = 24;

/**
 * Velocity against arrival.
 *
 * Velocity carries more because it is the measured, unambiguous half: a
 * promotion into the sitewide block is a step from ~0.02 to ~1.0 of a masthead
 * with nothing in between, and it happens to about one story an hour. Arrival
 * is real but coarse while there are only two mastheads in the corpus — with
 * two outlets, "how many carried it" has three possible answers.
 *
 * This split is the first thing that should move when the Google News RSS pass
 * lands. That widens the mastheads from two to roughly thirty, at which point
 * outlets joining per hour becomes the strongest countable signal available and
 * the strongest clause in the sentence this board exists to produce.
 */
const VELOCITY_WEIGHT = 0.65;
const ARRIVAL_WEIGHT = 1 - VELOCITY_WEIGHT;

/** How many entries cross the wire. The same argument as `PER_DISTRICT` in
 *  `read.ts`: the cap belongs here so the payload stays flat as the corpus
 *  grows, and the board's own totals stay unclipped. */
const BOARD_LIMIT = 60;

type ArticleRow = {
  url: string;
  source_id: string;
  published_at: string | null;
  headline: string | null;
  sitemap_title: string | null;
};

type ThreadRow = {
  id: string;
  title_mr: string | null;
  place_tier: string;
  taluka_name_mr: string | null;
  district_id: string | null;
  lon: number | null;
  lat: number | null;
};

/**
 * The board for one window.
 *
 * Reads the newest **finished** story run, on the same guarantee `stories.ts`
 * relies on: the pipeline writes events, then places, then labels, then
 * threads, so a run caught mid-flight would attribute fire to stories that are
 * about to be merged into each other.
 *
 * Works without `.data/stories.db` entirely. Every entry then has a null
 * `threadId` and the board is a ranking of articles rather than of stories,
 * which is a weaker product and an honest one — better than refusing to render
 * on a deploy that has never run the story pipeline.
 */
export function loadFireBoard(
  windowHours: number = DEFAULT_VELOCITY_HOURS,
  arrivalHours: number = ARRIVAL_HOURS,
): FireBoard {
  const reading = velocityByUrl(windowHours);

  // Anchored on the last capture, not on the wall clock — see `velocityByUrl`.
  // With no captures at all there is no window to speak of, so the arrival
  // half falls back to the clock and the velocity half stays empty.
  const anchor = reading.asOf ? new Date(reading.asOf) : new Date();
  const since = new Date(anchor.getTime() - arrivalHours * 3600_000).toISOString();

  const run = storyQueryOne<{ id: number; corpus_to: string | null }>(
    `SELECT id, corpus_to FROM stories.story_runs
      WHERE ended_at IS NOT NULL AND ok = 1
      ORDER BY id DESC LIMIT 1`,
  );

  // url → thread. Read whole rather than per article: the run holds a few
  // hundred rows and this is one statement against an indexed table, where
  // per-article lookups would be one statement per article.
  const threadOf = new Map<string, string>();
  if (run) {
    for (const row of storyQuery<{ url: string; thread_id: string }>(
      "SELECT url, thread_id FROM stories.thread_articles WHERE run_id = ?",
      run.id,
    )) {
      threadOf.set(row.url, row.thread_id);
    }
  }

  /**
   * Articles in the window, plus any article that climbed.
   *
   * The second half matters and is easy to miss: a piece filed yesterday and
   * promoted across the site this afternoon is one of the clearest fires this
   * data can show, and a window on `published_at` alone would not contain it.
   * What is on fire is not the same question as what was published.
   */
  const climbed = [...reading.byUrl.keys()];
  const holes = climbed.map(() => "?").join(",");
  const rows = query<ArticleRow>(
    `SELECT url, source_id, published_at, headline, sitemap_title
       FROM articles
      WHERE fetch_status = 'ok'
        AND (published_at >= ?${climbed.length > 0 ? ` OR url IN (${holes})` : ""})`,
    since,
    ...climbed,
  );

  // Grouped by thread, or by their own URL when the pipeline has not reached
  // them. A singleton bucket is the honest representation of an unthreaded
  // article: one article, which is exactly what we know about it.
  type Bucket = {
    threadId: string | null;
    articles: ArticleRow[];
    inWindow: number;
    sources: Set<string>;
    velocities: Velocity[];
  };

  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const threadId = threadOf.get(row.url) ?? null;
    const key = threadId ?? `url:${row.url}`;

    const bucket = buckets.get(key) ?? {
      threadId,
      articles: [],
      inWindow: 0,
      sources: new Set<string>(),
      velocities: [],
    };

    bucket.articles.push(row);
    // Counted separately from membership, because a bucket may have been pulled
    // in by a climb on an older article rather than by anything new being filed.
    if (row.published_at && row.published_at >= since) {
      bucket.inWindow += 1;
      bucket.sources.add(row.source_id);
    }

    const velocity = reading.byUrl.get(row.url);
    if (velocity) bucket.velocities.push(velocity);

    buckets.set(key, bucket);
  }

  /**
   * What an ordinary story took from this window.
   *
   * The denominator is stories that filed, not stories that exist: dividing by
   * every thread in the run would put the expectation near zero and hand a
   * routine single article a ratio of twenty. Both terms are measured inside
   * the same window, so the diurnal swing cancels rather than being modelled.
   */
  const filing = [...buckets.values()].filter((bucket) => bucket.inWindow > 0);
  const filed = filing.reduce((sum, bucket) => sum + bucket.inWindow, 0);
  const expectedArticles = filing.length > 0 ? filed / filing.length : 0;

  const threads = threadMeta(
    run?.id ?? null,
    [...buckets.values()]
      .map((bucket) => bucket.threadId)
      .filter((id): id is string => id !== null),
  );

  const entries: FireEntry[] = [];

  for (const bucket of buckets.values()) {
    const velocity = hottest(bucket.velocities);
    const arrivalRatio =
      expectedArticles > 0 ? bucket.inWindow / expectedArticles : 0;

    const velocityScore = velocity?.score ?? 0;
    const arrivalScore = clamp01(
      (arrivalRatio - 1) / (ARRIVAL_RATIO_CEILING - 1),
    );
    const score =
      VELOCITY_WEIGHT * velocityScore + ARRIVAL_WEIGHT * arrivalScore;

    if (score <= 0) continue;

    // The piece the entry is named after: the one that climbed, or failing that
    // the newest, since an unmoved story is best described by what it last said.
    const lead = byClimbThenTime(bucket.articles, reading.byUrl);

    const thread = bucket.threadId ? threads.get(bucket.threadId) : undefined;

    entries.push({
      threadId: bucket.threadId,
      titleMr: thread?.title_mr ?? null,
      // The sitemap title is a fallback rather than a preference, exactly as in
      // `read.ts`; either way these are the publisher's own words, unrewritten.
      headline: lead.headline ?? lead.sitemap_title ?? "",
      leadUrl: lead.url,
      velocity,
      articlesInWindow: bucket.inWindow,
      expectedArticles: round(expectedArticles),
      arrivalRatio: round(arrivalRatio),
      sources: [...bucket.sources].sort(),
      placeTier: asTier(thread?.place_tier ?? null),
      talukaNameMr: thread?.taluka_name_mr ?? null,
      districtId: thread?.district_id ?? null,
      point:
        thread && thread.place_tier === "taluka" && thread.lon !== null && thread.lat !== null
          ? [Number(thread.lon), Number(thread.lat)]
          : null,
      score: round(score),
    });
  }

  entries.sort((a, b) => b.score - a.score);

  return {
    entries: entries.slice(0, BOARD_LIMIT),
    asOf: reading.asOf,
    captures: reading.capturesBySource,
    observedHours: round(reading.observedHours),
    windowHours,
    arrivalHours,
    // Two captures of one masthead is the least that can show a change. Below
    // that every velocity is null and this is an arrivals board — which the
    // caller must be able to say out loud rather than implying growth it has
    // not measured.
    velocityAvailable: Object.values(reading.capturesBySource).some((n) => n >= 2),
    runId: run?.id ?? null,
    runCorpusTo: run?.corpus_to ?? null,
  };
}

function threadMeta(
  runId: number | null,
  ids: string[],
): Map<string, ThreadRow> {
  const meta = new Map<string, ThreadRow>();
  if (runId === null || ids.length === 0) return meta;

  const unique = [...new Set(ids)];
  const holes = unique.map(() => "?").join(",");

  for (const row of storyQuery<ThreadRow>(
    `SELECT id, title_mr, place_tier, taluka_name_mr, district_id, lon, lat
       FROM stories.threads
      WHERE run_id = ? AND id IN (${holes})`,
    runId,
    ...unique,
  )) {
    meta.set(row.id, row);
  }

  return meta;
}

/** The article that climbed hardest, or the newest when none did. */
function byClimbThenTime(
  articles: ArticleRow[],
  velocities: Map<string, Velocity>,
): ArticleRow {
  return [...articles].sort((a, b) => {
    const gap = (velocities.get(b.url)?.score ?? 0) - (velocities.get(a.url)?.score ?? 0);
    if (gap !== 0) return gap;

    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  })[0];
}

function asTier(value: string | null): PlaceTier | null {
  return value === "taluka" || value === "district" || value === "state" ? value : null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
