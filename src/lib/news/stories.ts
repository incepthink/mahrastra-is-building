import "server-only";

import { storiesDb, storyQuery, storyQueryOne } from "./db";
import { snapshotStories } from "./snapshot";
import { cutoffOf } from "./window";
import type {
  NewsStories,
  NewsWindow,
  PlaceTier,
  Story,
  StoryStep,
} from "@/types/news";

/**
 * How many stories are carried into the browser.
 *
 * The same argument as `PER_DISTRICT` in `read.ts`, applied to the other
 * layer: the cap belongs here rather than in the component, so the page's
 * payload stays flat as the corpus grows instead of every reader downloading
 * every story in the state to look at one of them. The current run produces
 * 124 pinnable stories over its whole fortnight, so nothing is dropped today —
 * this is the ceiling, not a filter.
 *
 * What survives the cap is decided by counting and nothing else: most articles
 * first, most recent as the tie-break. `scripts/news/README.md` draws the line
 * that "11 of 13 outlets carried it" is defensible where "the model ranked it
 * highest" is not, and it holds here — the model named these stories and has
 * no say in which of them the map has room for.
 */
const STORY_LIMIT = 120;

/**
 * How many steps of a progression cross the wire.
 *
 * A story that has run for a fortnight is not read as forty beats, and the
 * panel keeps the true figure beside the list the way the district panel does,
 * so a clipped flow says so rather than quietly ending early.
 */
const PER_STORY = 12;

type ThreadRow = {
  id: string;
  title_mr: string | null;
  actors: string | null;
  issue: string | null;
  place_tier: string;
  taluka_name_mr: string | null;
  district_id: string | null;
  lon: number | null;
  lat: number | null;
  place_evidence: string | null;
  articles: number;
  first_at: string | null;
  last_at: string | null;
  desk_districts: string | null;
};

type StepRow = {
  thread_id: string;
  url: string;
  step: number;
  published_at: string | null;
  place_tier: string | null;
  taluka_name_mr: string | null;
  district_id: string | null;
  headline: string | null;
  sitemap_title: string | null;
};

/**
 * The story layer for one window.
 *
 * Reads the newest run that **finished**. A half-written run is invisible
 * rather than partially believed: the pipeline writes events, then places,
 * then labels, then threads, so a run caught mid-flight would show a state
 * covered in unnamed stories that are about to be merged into each other.
 * `ended_at IS NOT NULL` is the whole of that guarantee.
 *
 * `window` is the window the map settled on rather than the one the reader
 * asked for — `loadNewsMap` may have widened it — because two layers of the
 * same map disagreeing about which days they are showing is worse than either
 * of them being narrow. The window is *not* widened again here: if the story
 * pipeline has not run since the collector last did, pin mode is honestly
 * emptier than the choropleth beside it, and borrowing older pins to fill it
 * would put marks on the sheet the counts underneath do not account for.
 */
export function loadStories(
  window: NewsWindow,
  now: Date = new Date(),
): NewsStories | null {
  const source = storySource();
  if (!source) return null;

  const cutoff = cutoffOf(window, now);

  /**
   * A story is a thread the pipeline **named**, and `storySource` has already
   * dropped the rest — 347 of an earlier run's 482 threads carried no label at
   * all, being single articles the matcher left alone that the choropleth
   * underneath already counts. Pinning them would put 350 marks on the state
   * and call each one a story, which is the same over-claim
   * `choropleth-layer.tsx` objects to, wearing a different shape.
   *
   * What is left to do here is the window, and it is done in memory rather
   * than in SQL because there are two row sources and only one of them can be
   * given a `WHERE` clause. See `snapshot.ts`. String comparison is exact for
   * the same reason it is in `snapshotArticlesSince`: both sides are ISO.
   */
  const inWindow = source.threads.filter(
    (row) => row.last_at !== null && (!cutoff || row.last_at >= cutoff),
  );

  // The tier filter is the second half of the same restraint: a `state` story
  // is not in a place and gets no pin. Counted rather than dropped, so the
  // plate can say statewide stories exist instead of letting them vanish
  // between the two modes.
  const pinnable = inWindow.filter((row) => row.place_tier !== "state");
  const statewide = inWindow.length - pinnable.length;

  const carried = [...pinnable]
    // Ranked by coverage for the cap, so what survives `STORY_LIMIT` is what
    // the press stayed on. Counting and nothing else decides this: the model
    // named these stories and has no say in which of them the map has room for.
    .sort((a, b) => Number(b.articles) - Number(a.articles) || lastAtDesc(a, b))
    .slice(0, STORY_LIMIT);

  const steps = stepsByThread(
    source.steps,
    new Set(carried.map((row) => row.id)),
  );

  const stories = carried
    .map((row) => toStory(row, steps.get(row.id) ?? []))
    // Presented newest first. The cap above ranks by coverage so the stories
    // that survive it are the ones the press stayed on; what a reader wants to
    // see once they have survived is what happened last.
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  return {
    stories,
    total: pinnable.length,
    statewide,
    runId: source.runId,
    runAt: source.runAt,
  };
}

type StorySource = {
  runId: number;
  runAt: string;
  threads: ThreadRow[];
  steps: StepRow[];
};

/**
 * The newest finished run's named threads and their steps — from the derived
 * store, or from the shipped corpus when there is no `.data/` to attach.
 *
 * Everything is fetched unbounded and the window is applied above, which is a
 * change from the SQL this replaces: the cap used to be a `LIMIT` and the
 * counts two more `SELECT COUNT(*)`s. Pushing them into memory is what lets
 * one implementation serve both sources — and it costs nothing measurable,
 * because a run's *named* threads are 127 rows carrying 231 steps between
 * them. It is the unnamed 2,400 that would have made this a bad idea, and they
 * were never wanted here.
 *
 * `ended_at IS NOT NULL AND ok = 1` is the whole of the half-written-run
 * guarantee: the pipeline writes events, then places, then labels, then
 * threads, so a run caught mid-flight would show a state covered in unnamed
 * stories that are about to be merged into each other.
 */
function storySource(): StorySource | null {
  if (!storiesDb()) return snapshotStories();

  const run = storyQueryOne<{ id: number; ended_at: string }>(
    `SELECT id, ended_at FROM stories.story_runs
      WHERE ended_at IS NOT NULL AND ok = 1
      ORDER BY id DESC LIMIT 1`,
  );

  if (!run) return null;

  const threads = storyQuery<ThreadRow>(
    `SELECT id, title_mr, actors, issue, place_tier, taluka_name_mr, district_id,
            lon, lat, place_evidence, articles, first_at, last_at, desk_districts
       FROM stories.threads
      WHERE run_id = ? AND title_mr IS NOT NULL AND last_at IS NOT NULL`,
    run.id,
  );

  /**
   * The join the derived store exists to make: `thread_articles` holds the
   * membership and the step number, `main.articles` holds the publisher's own
   * words, and the two live in different files that SQLite is happy to read
   * together once one is attached. See `storiesDb`.
   *
   * `fetch_status = 'ok'` for the same reason `read.ts` insists on it: a
   * pending row has a URL and nothing else, and a step with no headline is a
   * gap in a chronology rather than a beat in one.
   */
  const steps = storyQuery<StepRow>(
    `SELECT ta.thread_id, ta.url, ta.step, ta.published_at, ta.place_tier,
            ta.taluka_name_mr, ta.district_id,
            a.headline, a.sitemap_title
       FROM stories.thread_articles ta
       JOIN main.articles a ON a.url = ta.url
      WHERE ta.run_id = ? AND a.fetch_status = 'ok'
            AND ta.thread_id IN (
              SELECT id FROM stories.threads
               WHERE run_id = ? AND title_mr IS NOT NULL AND last_at IS NOT NULL
            )
      ORDER BY ta.thread_id, ta.step`,
    run.id,
    run.id,
  );

  return { runId: Number(run.id), runAt: run.ended_at, threads, steps };
}

/** Each carried story's progression, oldest step first, capped at `PER_STORY`. */
function stepsByThread(rows: StepRow[], carried: Set<string>): Map<string, StoryStep[]> {
  const byThread = new Map<string, StoryStep[]>();

  for (const row of rows) {
    if (!carried.has(row.thread_id)) continue;

    const list = byThread.get(row.thread_id) ?? [];
    byThread.set(row.thread_id, list);

    if (list.length >= PER_STORY) continue;

    list.push({
      url: row.url,
      step: Number(row.step),
      // Same fallback as `read.ts`: the sitemap title is a fallback rather
      // than a preference, and either way it is the publisher's own words.
      headline: row.headline ?? row.sitemap_title ?? "",
      publishedAt: row.published_at ?? "",
      placeTier: asTier(row.place_tier),
      talukaNameMr: row.taluka_name_mr,
      districtId: row.district_id,
    });
  }

  return byThread;
}

/** Newest last filing first; the tie-break under the coverage ranking. */
function lastAtDesc(a: ThreadRow, b: ThreadRow): number {
  return (b.last_at ?? "").localeCompare(a.last_at ?? "");
}

function toStory(row: ThreadRow, steps: StoryStep[]): Story {
  const tier = asTier(row.place_tier) ?? "district";

  return {
    id: row.id,
    // Non-null by the query's own filter; the fallback is here so a schema
    // that ever loosens cannot ship an unnamed pin.
    titleMr: row.title_mr ?? steps[0]?.headline ?? "",
    actors: row.actors,
    issue: row.issue,
    placeTier: tier,
    talukaNameMr: row.taluka_name_mr,
    districtId: row.district_id,
    // Only the taluka tier carries a coordinate. A district-tier story has
    // none on purpose — its mark is drawn at a centroid the map is explicitly
    // not claiming, and handing the browser a lon/lat for it would make that
    // guess look like a measurement one refactor from now.
    point:
      tier === "taluka" && row.lon !== null && row.lat !== null
        ? [Number(row.lon), Number(row.lat)]
        : null,
    placeEvidence: row.place_evidence,
    articles: Number(row.articles),
    firstAt: row.first_at ?? "",
    lastAt: row.last_at ?? "",
    deskDistricts: parseDesks(row.desk_districts),
    steps,
  };
}

function asTier(value: string | null): PlaceTier | null {
  return value === "taluka" || value === "district" || value === "state" ? value : null;
}

/** Written by the pipeline as a JSON array. Malformed is empty, never a throw:
 *  a bad desk list should cost a footnote in the panel, not the whole map. */
function parseDesks(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}
