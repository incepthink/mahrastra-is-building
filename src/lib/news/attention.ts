import "server-only";

import {
  MERGE_THRESHOLD,
  PAIR_WINDOW_HOURS,
  affinity,
  indexCorpus,
  loadCorpus,
} from "../../../scripts/news/stories/match.mjs";
import { termCounts, toVector, trigrams } from "../../../scripts/news/stories/text.mjs";
import { newsDb, query, storyQuery, storyQueryOne } from "./db";
import type {
  AttentionCoverage,
  AttentionExclusions,
  AttentionReading,
  ThreadAttention,
  VideoAttention,
} from "@/types/news";

/**
 * What the public did, as opposed to what an editor decided.
 *
 * Everything else on the read side is inferred. `prominence.ts` and
 * `velocity.ts` work backwards from where a newsroom put a link, which is a
 * real signal and a weak one: it measures a decision, not an audience. A view
 * count is not inferred, and `scripts/news/youtube.mjs` has been recording one
 * every fifteen minutes since 2026-08-30. This is the read side of that table.
 *
 * **`yt_stats` holds a level; this file is the only place the subtraction
 * happens.** The collector writes "video X had 41,203 views at 14:30" and
 * draws no conclusion, on the same boundary `rank.mjs` holds to. Views per
 * hour is a difference between two of its rows, and the window it is taken
 * over is a constant of ours, so it belongs here where it can be re-run over
 * the whole history rather than frozen into a capture.
 *
 * ## What was measured before any of this was designed
 *
 * The store, on 2026-09-03: 6,317 videos, 236 captures, 6,276 videos observed
 * two or more times, longest curve 71.6h. Enough to answer the question this
 * step stands on — *can a broadcast title be attached to a running story?* —
 * and the answer is **narrowly yes, and far too narrowly to rank on.**
 *
 * At the matcher's own threshold, over a three-hour window: 25 of 741 growing
 * videos attach to an article, carrying 2.5% of the views per hour the window
 * measured. Against a hand probe on proper nouns, that is 12% of the Vidyanand
 * Bapat story's YouTube attention and **0% of the Manoj Jarange story's** — the
 * largest single thing on Marathi YouTube that week, 168 videos and 452,608
 * views per hour, none of it attributable.
 *
 * The failure is structural and already named in
 * `scripts/news/stories/README.md`. There are two relations. *Same event, two
 * mastheads, same day* is a text problem and text solves it — a clip that
 * re-describes one event shares that event's proper nouns, which is why the
 * matches this file does make are clean. *Same running story across days* is
 * not a text problem, because each item exists precisely because it says
 * something new. Broadcast volume lives almost entirely in the second
 * relation: reaction soundbites, panel segments, rolling coverage. Measured,
 * the 22 Jarange articles in the corpus are themselves spread across **17
 * distinct threads**, so both sides fragment and there is no single event left
 * to match.
 *
 * **So views per hour is reported per video and per thread, and it does not
 * enter the fire score.** A rate over a sample of unknown size is not a
 * measurement; it is a number whose magnitude depends on how many broadcasters
 * happened to phrase a title like a newspaper headline. That is the same
 * boundary objection that retired the Google News RSS plan — see
 * `scripts/news/README.md` — and it applies with equal force to a signal we
 * collected ourselves. `coverage` is on every reading so the number's own reach
 * travels with it, which is the `rank_sweeps` discipline: a capture that missed
 * most of its subject must never read as a quiet news hour.
 *
 * One thing the attribution requirement does earn for free, and it is worth
 * stating because the schema warns about the problem from a different angle. A
 * recorded headline roundup — `Tv9 Marathi News Top Headline Today | 3
 * September 2026 | 4 Minute 24 Headlines` — is not live, has a real duration,
 * and so passes both documented stream filters, while topping the raw views per
 * hour ranking four times over in the measured window. It names no event, so it
 * matches no article: **0 of the 67 bulletin-shaped videos in the window score
 * above any threshold tested.** Requiring a story before counting a view turns
 * out to be the bulletin filter that `live_state` and `P0D` cannot be.
 */

/** The window the board asks about by default — `velocity.ts`'s, so the press
 *  derivative and the audience derivative are taken over the same span and can
 *  be read side by side. */
export const DEFAULT_ATTENTION_HOURS = 3;

/**
 * The fastest rate the collector can actually resolve.
 *
 * The Windows task runs `news:cycle` every fifteen minutes and the measured
 * median gap between captures is exactly that. Dividing a gain by a shorter
 * interval reports our own timing rather than an audience: the store contains a
 * pair of captures one minute apart from a manual double-run, and a video that
 * gained a few hundred views across it would be handed a rate sixty times any
 * video observed on the real cadence.
 *
 * Identical in value and in argument to `velocity.ts`'s floor. Kept as its own
 * constant rather than imported because the two are floors on different
 * collectors — `rank` and `youtube` are separate passes with separate cadences
 * — and a future change to one must not silently move the other.
 */
const MIN_RESOLVABLE_HOURS = 0.25;

/**
 * How long a gain may take before it stops counting for its full size.
 *
 * `score = min(gain, gain per hour)`, the discipline `velocity.ts` arrived at
 * the hard way: a rate alone saturates, so speed may only ever discount
 * magnitude and never manufacture it. It bites here exactly as it did there.
 * Measured over a three-hour window, **166 of 741 videos** were observed across
 * an interval shorter than an hour, and uncapped the top of the board was
 * `Radhakrihna Vikhe Meet Manoj jarange` — 8,636 views across a single
 * fifteen-minute interval, reported as 34,415/h, ahead of a video that had
 * genuinely taken 86,343 views in three hours. Capped, it drops off the board
 * and the three-hour video leads. Nothing is ever ranked above what its two
 * observations actually show it gained.
 */
const RATE_REFERENCE_HOURS = 1;

/**
 * How alike a video title and an article headline must be to count as the same
 * event — the matcher's own line, not a new one.
 *
 * `MERGE_THRESHOLD` is 0.45 because that is where the Aug 26-30 window was
 * measured clean for article-against-article. Sampling this relation by hand at
 * every band puts the useful line in the same place, though not as cleanly —
 * which is the part worth writing down:
 *
 * - **>=0.45** — nearly all genuine, and **not** the zero-false-positive band
 *   it is for article-against-article. The first live run at this threshold
 *   produced **one error in 30 matches**: `Sillod Maratha Protest | मनोज
 *   जरांगेंच्या समर्थनार्थ सिल्लोडमध्ये...` scored 0.49 against a Pune rasta
 *   roko in support of the same man on the same day. See the place note under
 *   `attentionByThread`.
 * - **0.40-0.45** — mostly right, and the same error gets commoner. Every one
 *   sampled was that shape: a *kind* of event matched in the wrong place. A
 *   Jalgaon gram-panchayat silent march scored 0.422 against a Sangli one,
 *   because the same protest was held in several districts that week.
 * - **0.30-0.40** — degrades into topic and actor matching. `Sharad Pawar on
 *   GDP Claim` matched a Sharad Pawar article about the Shiv Sena symbol
 *   hearing on the strength of the man's name alone.
 * - **below 0.30** — mostly name collision, which is the failure the Google
 *   News measurement found when it queried a lead actor and got back
 *   everything that actor did all week.
 *
 * The threshold is imported rather than redeclared regardless. There is one
 * matcher in this project and one line on it, and a second copy of that number
 * under a different name would be free to drift from the corpus it was measured
 * on. What the sampling changes is not the number, it is how much a single
 * match is worth: at 0.45 a *count of broadcasters* is sound and any one row of
 * it may be wrong, which is why `matchScore` is reported per video and never
 * rounded to a verdict.
 */
const MATCH_THRESHOLD = MERGE_THRESHOLD;

type StatRow = {
  video_id: string;
  observations: number;
  hidden: number;
  first_at: string | null;
  last_at: string | null;
  first_views: number | null;
  last_views: number | null;
  title: string | null;
  handle: string | null;
  channel_title: string | null;
  duration: string | null;
  live_state: string | null;
  published_at: string | null;
};

/**
 * Views per hour for every video the collector watched in the window.
 *
 * One statement over `yt_stats` rather than a query per video: a three-hour
 * window is about twelve captures of ~590 videos, and the endpoints of every
 * curve come back together.
 *
 * **The window is anchored on the newest capture, not on the wall clock**, for
 * the reason `velocity.ts` sets out: if the collector stopped four hours ago,
 * anchoring on `now` yields an empty window and a board of silent zeros, which
 * reads as "nothing is happening" when the truth is "we stopped looking".
 *
 * Every row the arithmetic refuses is counted rather than quietly skipped, and
 * the counts ride on the reading. Each exclusion is a measured case:
 *
 * - `hidden` — a NULL view count means the uploader hid it. Dropped, never
 *   averaged as zero, or a channel that hides its numbers reads as unwatched.
 * - `single` — one observation is a level, and a level is not this file's job.
 * - `live` — `live_state` is `live` or `upcoming`. A rolling bulletin accrues
 *   views for hours without being about any one story.
 * - `stream` — a `P0D` duration is an in-progress stream. **Measured, this
 *   never fires and is not expected to:** of 6,339 videos, 69 carry a `P0D`
 *   duration and **every one of them** is already `live` or `upcoming`, so
 *   `live` catches the lot. It stays because the two columns are independent
 *   observations of the same fact and the schema says so — a stream that ends
 *   while a sweep is in flight could be written with a settled `live_state` and
 *   a duration that has not caught up — and because a check that is measured
 *   redundant is cheaper to keep than to re-derive. If this counter is ever
 *   non-zero, that is the case.
 * - `premiere` — `published_at` is *after* the first observation in the window.
 *   Measured, 24 rows in a three-hour window, and they are the trap the age
 *   buckets exposed: the store holds observations at ages of -24h to -6h,
 *   because a scheduled premiere is snapshotted before it exists. An interval
 *   that begins before publication has a denominator that is partly not
 *   elapsed time.
 * - `flat` — the gain is zero or negative.
 *
 * **`flat` is where the non-monotonic view count is handled, and the handling
 * is a consequence of the shape rather than a correction.** YouTube purges
 * inauthentic views and nothing clamps that: the store holds 602 consecutive
 * pairs in which the count fell, across 360 videos, the largest by 11,746
 * views. Summing consecutive deltas would carry every one of those into the
 * result. Taking the difference between the **two named observations** at the
 * ends of the window — the same choice `velocity.ts` makes, for the same
 * reason — is immune to a dip that recovers, and measured, **not one** of the
 * 741 videos in the window had a negative net gain. The check stays because the
 * absence of a case is not the absence of the possibility, and a purge landing
 * on a window's last capture would produce one.
 */
export function attentionByVideo(
  windowHours: number = DEFAULT_ATTENTION_HOURS,
): AttentionReading {
  const excluded: AttentionExclusions = {
    hidden: 0,
    single: 0,
    live: 0,
    stream: 0,
    premiere: 0,
    flat: 0,
  };

  const empty: AttentionReading = {
    videos: [],
    asOf: null,
    windowHours,
    observedHours: 0,
    captures: 0,
    considered: 0,
    excluded,
    totalViewsPerHour: 0,
  };

  const anchor =
    query<{ v: string | null }>("SELECT MAX(captured_at) AS v FROM yt_stats")[0]?.v ?? null;
  if (!anchor) return empty;

  const since = new Date(
    new Date(anchor).getTime() - windowHours * 3600_000,
  ).toISOString();

  /**
   * Captures whose stats call came back whole.
   *
   * The `rank_sweeps` lesson, applied to the second collector: a capture in
   * which a `videos.list` batch failed has holes in it, and a hole at either
   * end of an interval fabricates a gain or a collapse depending which end it
   * lands on. Measured, this has never happened — 2,816 stats calls, zero
   * failures — so the gate currently excludes nothing, which is the only state
   * in which it can be trusted to be doing its job when it does exclude
   * something.
   *
   * `requested` exceeding `returned` is *not* a hole and is not gated on. Every
   * recent capture asks after 600 videos and gets 588-593 back, because a video
   * deleted or made private between the uploads read and the stats read cannot
   * come back. That is an answer about those videos, not a torn capture.
   */
  const torn = new Set(
    query<{ captured_at: string }>(
      `SELECT DISTINCT captured_at FROM yt_sweeps
        WHERE step = 'stats' AND ok = 0 AND captured_at >= ?`,
      since,
    ).map((row) => row.captured_at),
  );

  const captures = query<{ captured_at: string }>(
    "SELECT DISTINCT captured_at FROM yt_stats WHERE captured_at >= ? ORDER BY captured_at",
    since,
  )
    .map((row) => row.captured_at)
    .filter((at) => !torn.has(at));

  if (captures.length === 0) return { ...empty, asOf: anchor };

  const rows = query<StatRow>(
    `WITH usable AS (
       SELECT s.video_id, s.captured_at, s.views
         FROM yt_stats s
        WHERE s.captured_at >= ?
          AND s.captured_at NOT IN (
                SELECT captured_at FROM yt_sweeps
                 WHERE step = 'stats' AND ok = 0 AND captured_at >= ?)
     ),
     ends AS (
       SELECT video_id,
              COUNT(*) AS observations,
              SUM(CASE WHEN views IS NULL THEN 1 ELSE 0 END) AS hidden,
              MIN(CASE WHEN views IS NOT NULL THEN captured_at END) AS first_at,
              MAX(CASE WHEN views IS NOT NULL THEN captured_at END) AS last_at
         FROM usable
        GROUP BY video_id
     )
     SELECT e.video_id, e.observations, e.hidden, e.first_at, e.last_at,
            (SELECT views FROM usable
              WHERE video_id = e.video_id AND captured_at = e.first_at) AS first_views,
            (SELECT views FROM usable
              WHERE video_id = e.video_id AND captured_at = e.last_at) AS last_views,
            v.title, v.handle, v.duration, v.live_state, v.published_at,
            c.title AS channel_title
       FROM ends e
       JOIN yt_videos v ON v.id = e.video_id
       LEFT JOIN yt_channels c ON c.channel_id = v.channel_id`,
    since,
    since,
  );

  const videos: VideoAttention[] = [];

  for (const row of rows) {
    // Observations *with a view count*: a two-row curve one of whose rows is
    // hidden has one point on it, and one point is a level.
    if (
      row.first_views === null ||
      row.last_views === null ||
      row.first_at === null ||
      row.last_at === null
    ) {
      excluded.hidden += 1;
      continue;
    }
    if (Number(row.observations) - Number(row.hidden) < 2 || row.first_at === row.last_at) {
      excluded.single += 1;
      continue;
    }
    if (row.live_state !== null && row.live_state !== "none") {
      excluded.live += 1;
      continue;
    }
    if (row.duration === "P0D") {
      excluded.stream += 1;
      continue;
    }
    if (row.published_at === null || row.published_at > row.first_at) {
      excluded.premiere += 1;
      continue;
    }

    const gain = Number(row.last_views) - Number(row.first_views);
    if (gain <= 0) {
      excluded.flat += 1;
      continue;
    }

    const observedHours = hoursBetween(row.first_at, row.last_at);
    const perHour = gain / Math.max(MIN_RESOLVABLE_HOURS, observedHours);

    videos.push({
      videoId: row.video_id,
      title: row.title ?? "",
      handle: row.handle ?? "",
      channel: row.channel_title ?? row.handle ?? "",
      publishedAt: row.published_at,
      duration: row.duration ?? "",
      viewsFrom: Number(row.first_views),
      viewsTo: Number(row.last_views),
      gain,
      fromAt: row.first_at,
      lastAt: row.last_at,
      observations: Number(row.observations) - Number(row.hidden),
      observedHours: round(observedHours),
      ageHours: round(hoursBetween(row.published_at, row.last_at)),
      // `min(gain, gain per hour)` — see `RATE_REFERENCE_HOURS`.
      viewsPerHour: Math.round(Math.min(gain, perHour * RATE_REFERENCE_HOURS)),
      matchScore: null,
    });
  }

  videos.sort((a, b) => b.viewsPerHour - a.viewsPerHour);

  return {
    videos,
    asOf: anchor,
    windowHours,
    observedHours: round(hoursBetween(captures[0], captures[captures.length - 1])),
    captures: captures.length,
    considered: rows.length,
    excluded,
    totalViewsPerHour: videos.reduce((sum, video) => sum + video.viewsPerHour, 0),
  };
}

/**
 * The same attention, attached to the running stories it can be attached to.
 *
 * **One matcher, called a third time.** `scripts/news/stories/match.mjs`
 * already decides whether two pieces of text are the same event, and
 * `stories/README.md` records why there must not be a second: the constants
 * *are* the argument, and a copy drifts invisibly. So a video title is scored
 * against article headlines with `affinity` verbatim, and the video is
 * attributed to the thread of the article it matched.
 *
 * **Going through the article rather than the label is the whole reason this
 * has any reach at all.** Matching a title against a thread's own `title_mr`
 * is the obvious route and it was measured against this one: 200 of the run's
 * 1,727 threads carry a label, and a label is a short sentence with no body, so
 * its vector is thin. Direct label matching reached **32 videos and 19
 * threads**; going video to article to thread reached **242 videos and 74
 * threads**, of which only 37 were labelled at all. Every article belongs to a
 * thread, so the label ceiling never binds.
 *
 * ## Two defects the first implementation had, both worth keeping written down
 *
 * The videos were originally indexed *with* the articles, as one corpus, which
 * is what `indexCorpus` is for. Both failures follow from that, and both are
 * worst exactly where the signal is largest:
 *
 * 1. **The candidate gate silently dropped the hottest stories.** `match.mjs`
 *    generates pairs only from terms rarer than its `RARE_DF_MAX` of 30. Adding
 *    6,270 broadcast titles to a 2,054-article corpus inflates every document
 *    frequency, and it inflates the identifying words of a big story most:
 *    `सालियन` went from df 15 to 42, `jarange` from 90 to 2,233. The video
 *    `विद्यानंद बापट यांना मारहाण, काय म्हणाले CM फडणवीस?` ended up with
 *    **zero** tokens rare enough to generate a single candidate, and so scored
 *    0.000 against a corpus holding sixteen articles about that assault. Its
 *    true best match is 0.408.
 * 2. **IDF was diluted by the videos.** Even with the gate bypassed the story's
 *    own name was worth less: `विद्यानंद` at df 78 of 2,054 articles is strong
 *    evidence, and at df 316 of 8,324 documents it is not.
 *
 * The fix is not a new number, it is a correction about membership: **a video is
 * a query against the press corpus, not a member of it.** IDF, document
 * frequency and the postings index are built from the articles alone, and each
 * video is projected into that same space with the same `termCounts`,
 * `toVector` and `trigrams`. Nothing inside the matcher changed.
 *
 * Two smaller measured choices:
 *
 * - **The title only, never the description.** The schema calls the description
 *   "boilerplate-heavy but carries place names", and measured, the boilerplate
 *   wins by a distance — it averages 788 characters against an 83-character
 *   title. Including it took matches at threshold from **25 down to 9**, and the
 *   best score in the window from 0.637 to 0.564.
 * - **Every article in the time band is scored, with no rare-term gate.** The
 *   gate is a 20x speed-up that costs 5 of 30 matches at threshold, and since
 *   the finding of this whole step is that recall is the binding constraint,
 *   paying recall for speed here would be indefensible. It costs about four
 *   seconds over 741 videos, which is why this is a CLI reading today and not
 *   yet on a page.
 *
 * ## Known limits, both seen in the first live run
 *
 * **A story can appear as several rows.** The bucket key is the thread of the
 * matched article, so this inherits the story run's threading exactly, fragments
 * and all. The first run split the Vidyanand Bapat assault across **three**
 * entries — the labelled thread with twelve videos, plus two unlabelled threads
 * whose own articles were about the Chief Minister's response and the attacker's
 * arrest. That is not a defect here and it should not be fixed here: over-linking
 * threads is what `stories/README.md` lists as its own open knob at 0.42, and a
 * reader can see the split because every entry prints the article it matched.
 *
 * **Place is not checked, and one match in thirty is wrong because of it.** The
 * error is always the same shape: the same kind of event, the same day, the
 * wrong district. `Sillod Maratha Protest` at 0.49 against a Pune rasta roko is
 * the measured instance. The fix is available and deliberately not taken yet —
 * `stories/place.mjs` and `translit.mjs` already resolve a Marathi place name to
 * a taluka, and a *disagreement* between a place named in the title and the
 * thread's own resolved place would veto the match. It is left out because a
 * veto trades recall for precision and recall is what this step is short of;
 * taking it needs its own measurement of how many true matches name no place at
 * all, which the 30-match sample is too small to answer.
 */
export function attentionByThread(windowHours: number = DEFAULT_ATTENTION_HOURS): {
  reading: AttentionReading;
  threads: ThreadAttention[];
  coverage: AttentionCoverage;
} {
  const reading = attentionByVideo(windowHours);
  const bare: AttentionCoverage = {
    matchedVideos: 0,
    matchedViewsPerHour: 0,
    totalViewsPerHour: reading.totalViewsPerHour,
    share: 0,
    threshold: MATCH_THRESHOLD,
    runId: null,
    articles: 0,
  };

  const db = newsDb();
  if (!db || reading.videos.length === 0) {
    return { reading, threads: [], coverage: bare };
  }

  const run = storyQueryOne<{
    id: number;
    corpus_from: string | null;
    corpus_to: string | null;
  }>(
    `SELECT id, corpus_from, corpus_to FROM stories.story_runs
      WHERE ended_at IS NOT NULL AND ok = 1
      ORDER BY id DESC LIMIT 1`,
  );
  if (!run) return { reading, threads: [], coverage: bare };

  // The corpus the run clustered, so the IDF a video is scored against is the
  // same one the threads it is being attributed to were built from.
  const articles = loadCorpus(db, { fromIso: run.corpus_from, toIso: run.corpus_to });
  if (articles.length === 0) return { reading, threads: [], coverage: bare };

  const index = indexCorpus(articles);

  // Each video projected into the articles' IDF space — see above. Appended to
  // the index's own arrays so `affinity` can be called with its own indices,
  // unmodified.
  const videoDocs = reading.videos.map((video) => ({
    url: `yt:${video.videoId}`,
    sourceId: `yt:${video.handle}`,
    districtId: null,
    scope: null,
    section: null,
    // Title only; the description is measured noise.
    headline: video.title,
    description: "",
    body: "",
    imageUrl: null,
    wordCount: null,
    publishedAt: video.publishedAt,
    at: Date.parse(video.publishedAt ?? "") || 0,
    keywordPhrases: [] as string[],
  }));

  for (const doc of videoDocs) {
    index.vectors.push(toVector(termCounts(doc), index.idf));
    index.grams.push(trigrams(doc.headline));
    index.counts.push(termCounts(doc));
  }

  const threadOf = new Map<string, string>();
  for (const row of storyQuery<{ url: string; thread_id: string }>(
    "SELECT url, thread_id FROM stories.thread_articles WHERE run_id = ?",
    run.id,
  )) {
    threadOf.set(row.url, row.thread_id);
  }

  const span = PAIR_WINDOW_HOURS * 3600_000;
  const buckets = new Map<string, ThreadAttention>();
  let matchedVideos = 0;
  let matchedViewsPerHour = 0;

  reading.videos.forEach((video, offset) => {
    const doc = videoDocs[offset];
    if (!doc.at) return;

    const vi = articles.length + offset;
    let bestScore = 0;
    let bestIndex = -1;

    for (let ai = 0; ai < articles.length; ai += 1) {
      if (Math.abs(doc.at - articles[ai].at) > span) continue;

      const { score } = affinity(doc, articles[ai], index, vi, ai);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = ai;
      }
    }

    if (bestIndex === -1 || bestScore < MATCH_THRESHOLD) return;

    matchedVideos += 1;
    matchedViewsPerHour += video.viewsPerHour;

    const article = articles[bestIndex];
    const threadId = threadOf.get(article.url) ?? null;
    // An unthreaded article is its own bucket, on the reading `fire.ts` uses: one
    // article is the honest representation of what we know about it, and the
    // newest stories are exactly the ones the last story run predates.
    const key = threadId ?? `url:${article.url}`;

    const bucket: ThreadAttention = buckets.get(key) ?? {
      threadId,
      titleMr: null,
      leadHeadline: article.headline,
      leadUrl: article.url,
      videos: [],
      channels: [],
      viewsPerHour: 0,
      peakViewsPerHour: 0,
      gain: 0,
      bestMatch: 0,
    };

    bucket.videos.push({ ...video, matchScore: round(bestScore) });
    bucket.viewsPerHour += video.viewsPerHour;
    bucket.peakViewsPerHour = Math.max(bucket.peakViewsPerHour, video.viewsPerHour);
    bucket.gain += video.gain;
    bucket.bestMatch = Math.max(bucket.bestMatch, round(bestScore));

    buckets.set(key, bucket);
  });

  const ids = [...buckets.values()]
    .map((bucket) => bucket.threadId)
    .filter((id): id is string => id !== null);

  if (ids.length > 0) {
    const titles = new Map<string, string | null>();
    const holes = ids.map(() => "?").join(",");

    for (const row of storyQuery<{ id: string; title_mr: string | null }>(
      `SELECT id, title_mr FROM stories.threads WHERE run_id = ? AND id IN (${holes})`,
      run.id,
      ...ids,
    )) {
      titles.set(row.id, row.title_mr);
    }

    for (const bucket of buckets.values()) {
      if (bucket.threadId) bucket.titleMr = titles.get(bucket.threadId) ?? null;
    }
  }

  const threads = [...buckets.values()].map((bucket) => ({
    ...bucket,
    // A count of distinct broadcasters is the sturdiest thing on this entry, for
    // the reason the README gives about cross-outlet carriage: it is a plain
    // count of rows, where the rate beside it is a rate over a sample whose size
    // is reported in `coverage` and is not one.
    channels: [...new Set(bucket.videos.map((video) => video.channel))].sort(),
  }));

  threads.sort((a, b) => b.viewsPerHour - a.viewsPerHour);

  return {
    reading,
    threads,
    coverage: {
      matchedVideos,
      matchedViewsPerHour,
      totalViewsPerHour: reading.totalViewsPerHour,
      share:
        reading.totalViewsPerHour > 0
          ? round(matchedViewsPerHour / reading.totalViewsPerHour)
          : 0,
      threshold: MATCH_THRESHOLD,
      runId: run.id,
      articles: articles.length,
    },
  };
}

function hoursBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;

  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3600_000);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
