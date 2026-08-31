import "server-only";

import data from "@/data/news-snapshot.json";

/**
 * The corpus as it ships, for deploys that have no `.data/` to read.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE TWO SOURCES OF ROWS.
 *
 * `db.ts` resolves `.data/news.db` from `process.cwd()`, and it is right to:
 * the collector writes tens of thousands of observations a day into a file
 * that is gitignored because it churns and because `scripts/news/db.mjs` wants
 * it disposable. A serverless function has none of that. `newsDb()` returns
 * null there — which it was always written to do gracefully — and every query
 * returns `[]`, so the deployed map painted its empty state over a state whose
 * news had been collected perfectly well, on a laptop.
 *
 * This is the other half. `scripts/news/snapshot.mjs` writes the rows the read
 * layer actually asks for into `src/data/news-snapshot.json`, which is
 * committed and therefore bundled. When there is a database it wins and this
 * file is never touched; when there is not, these rows stand in.
 *
 * The pattern is not new here — `lib/dgipr/read.ts` has always worked this way
 * and explains why. What is new is that the news side now needs it too.
 * ---------------------------------------------------------------------------
 *
 * WHAT IS AND IS NOT IN HERE.
 *
 * Rows, in the exact shapes the queries in `read.ts`, `prominence.ts` and
 * `stories.ts` return — not answers. Every judgement stays where it was:
 * the window is still applied against `now` by `cutoffOf`, prominence is still
 * weighted by `prominence.ts`'s own constants, the quantile scale is still
 * computed over whatever the window caught, and a story is still shaped by
 * `toStory`. A snapshot deploy and a laptop with the full corpus run the same
 * code over the same rows and can only differ in how many rows there are.
 *
 * The consequence worth stating plainly: this file is **as of** `builtAt`.
 * Nothing published after the last `pnpm news:snapshot` is in it. That is why
 * `collectedAt` is carried through rather than recomputed — the plate says how
 * old the corpus is, and on a snapshot deploy that sentence is the whole of
 * the honesty available.
 */

/** The projection `articlesSince` selects. Kept identical, field for field. */
export type SnapshotArticleRow = {
  url: string;
  district_id: string | null;
  scope: string;
  article_section: string | null;
  headline: string | null;
  sitemap_title: string | null;
  description: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  modified_at: string | null;
  word_count: number | null;
  revisions: number;
};

/** The counts `prominenceByUrl`'s SQL returns, before its weights are applied. */
export type SnapshotProminenceRow = {
  url: string;
  peak_pages: number;
  site_pages: number;
  best_position: number;
  sweeps: number;
};

export type SnapshotThreadRow = {
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

export type SnapshotStepRow = {
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

export type NewsSnapshot = {
  /** When `news:snapshot` ran. Distinct from `collectedAt`, which is when the
   *  collector last wrote — the gap between them is how stale the build is. */
  builtAt: string;
  collectedAt: string | null;
  sweptAt: string | null;
  articles: SnapshotArticleRow[];
  prominence: SnapshotProminenceRow[];
  stories: {
    runId: number;
    runAt: string;
    threads: SnapshotThreadRow[];
    steps: SnapshotStepRow[];
  } | null;
};

const SNAPSHOT = data as NewsSnapshot;

/**
 * Whether the shipped corpus has anything in it.
 *
 * Checked rather than assumed because the file is committed and can therefore
 * be committed empty — a fresh clone that has never collected, a snapshot run
 * against a wiped database. An empty snapshot and an absent one mean the same
 * thing to the page, and both are the state the map already knows how to draw.
 */
export function hasSnapshot(): boolean {
  return SNAPSHOT.articles.length > 0;
}

/**
 * The articles published at or after `cutoff`, newest first.
 *
 * The rows arrive already sorted by `published_at DESC` — `ORDER BY` in the
 * builder rather than a sort here, so the file is deterministic and its diffs
 * are readable — so this is a filter and never a re-sort.
 *
 * String comparison against an ISO cutoff, which is what the SQL does too:
 * both sides are `toISOString()` output, so lexical and chronological order
 * are the same thing. A row with no `published_at` cannot be in the file at
 * all; the builder applies the same `IS NOT NULL` the query does.
 */
export function snapshotArticlesSince(cutoff: string | null): SnapshotArticleRow[] {
  if (!cutoff) return SNAPSHOT.articles;

  return SNAPSHOT.articles.filter(
    (row) => row.published_at !== null && row.published_at >= cutoff,
  );
}

export function snapshotProminence(): SnapshotProminenceRow[] {
  return SNAPSHOT.prominence;
}

/** What the plate's "as of" is read from. See `lastCollectedAt` in `read.ts`. */
export function snapshotMeta(): { collectedAt: string | null; sweptAt: string | null } {
  return { collectedAt: SNAPSHOT.collectedAt, sweptAt: SNAPSHOT.sweptAt };
}

/** The newest finished run's named threads and their steps, or null when the
 *  story pipeline had never run when the snapshot was built. */
export function snapshotStories(): NewsSnapshot["stories"] {
  return SNAPSHOT.stories;
}
