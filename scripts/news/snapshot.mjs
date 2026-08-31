/**
 * The deploy snapshot: `.data/*.db` reduced to one committed JSON file.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS.
 *
 * `.data/` is gitignored — `db.mjs` explains why at length, and the reason is
 * sound: the corpus is 32MB of observations that are rebuildable in principle
 * and far too churny to put in git history. But `lib/news/db.ts` resolves that
 * directory at `process.cwd()`, and a Vercel function has no `.data/`. So the
 * deployed site opened no database, every query returned nothing, and the map
 * rendered its honest empty state — "no news has been collected yet" — while
 * the collector on the author's machine had 820 articles.
 *
 * The DGIPR layer never had this problem because it reads a committed JSON
 * snapshot, and `lib/dgipr/read.ts` says outright that a SQLite file for it
 * would "cost the one thing that matters — `.data/` is gitignored, so a build
 * that had never run an import script would serve a map with the layer
 * silently missing." That prediction came true for the layer underneath it.
 * This is the same remedy applied to the news side.
 * ---------------------------------------------------------------------------
 *
 * WHAT IS WRITTEN IS ROWS, NOT A RENDERED MAP.
 *
 * The tempting version of this script precomputes `loadNewsMap()` for each of
 * the five windows and ships the answers. It would be smaller and it would be
 * wrong, because every window in this app is measured against `now`: baking
 * the answers freezes "24 तास" to mean "the 24 hours before the last deploy",
 * and a reader looking at a three-day-old build would be told they are seeing
 * yesterday. Shipping the rows instead keeps `cutoffOf` running at request
 * time, so the window still means what it says and the widening walk still
 * widens — the snapshot simply ages out of the tight windows into the loose
 * ones, which is exactly the behaviour `window.ts` already calls honest.
 *
 * So the shapes below are deliberately the row shapes the read layer's own
 * queries return, field for field. `lib/news/snapshot.ts` hands them back in
 * place of a query result and nothing downstream can tell the difference — the
 * sorting, the quantile scale, the per-district cap and the story shaping are
 * single-sourced in `read.ts` and `stories.ts` either way.
 *
 * `body` is not selected, here or anywhere. `types/news.ts` draws that line and
 * this file is now a second place it could have been crossed.
 *
 * Read-only, and unbothered by the collector running: WAL lets this see a
 * consistent snapshot while a capture is appending. Run it after a cycle, then
 * commit the result — `pnpm news:snapshot`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { NEWS_FILE, STORIES_FILE } from "./stories/db.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT_JSON = path.join(ROOT, "src", "data", "news-snapshot.json");

/**
 * Every article the map could ever show, unbounded by any window.
 *
 * The same projection as `articlesSince(null)` in `lib/news/read.ts`, including
 * the correlated revisions count, because that function is what this stands in
 * for. Unbounded because the window is applied at request time — see the header.
 *
 * `fetch_status = 'ok' AND published_at IS NOT NULL` is not an optimisation.
 * A pending row has a URL and nothing else, and `read.ts` refuses to count one
 * for a stated reason; a snapshot that carried them would put rows in front of
 * that same filter having already changed what the corpus looks like.
 */
function articles(db) {
  return db
    .prepare(
      `SELECT
         a.url, a.district_id, a.scope, a.article_section,
         a.headline, a.sitemap_title, a.description, a.image_url, a.author,
         a.published_at, a.modified_at, a.word_count,
         (SELECT COUNT(*) FROM article_revisions r WHERE r.url = a.url) AS revisions
       FROM articles a
       WHERE a.fetch_status = 'ok' AND a.published_at IS NOT NULL
       ORDER BY a.published_at DESC`,
    )
    .all();
}

/**
 * Prominence, as the raw counts it is computed from.
 *
 * The one place this file reduces rather than copies, and it reduces on
 * purpose: `rank_snapshots` is 33,211 rows collapsing to 658 URLs, and
 * shipping the input would be a fifty-fold larger file to reach an identical
 * result.
 *
 * What is *not* done here is the arithmetic. The four counts below are exactly
 * what `prominenceByUrl`'s SQL returns, and the weights that turn them into a
 * score stay in `prominence.ts`, which exists so those constants "can be
 * changed without re-scraping a week that cannot be re-scraped". Baking the
 * score in would move a tunable constant into a committed data file and quietly
 * cost that property; carrying the counts keeps a retune a code change again.
 *
 * The SQL is a copy of `prominenceByUrl`'s, down to the `site` CTE that takes
 * the widest sweep ever completed as the denominator. If one moves, both move.
 */
function prominence(db) {
  const rows = db
    .prepare(
      `WITH site AS (
         SELECT MAX(pages) AS pages FROM (
           SELECT COUNT(*) AS pages
           FROM rank_sweeps WHERE ok = 1 GROUP BY captured_at
           UNION ALL
           SELECT COUNT(DISTINCT page_id) AS pages
           FROM rank_snapshots GROUP BY captured_at
         )
       ),
       per_sweep AS (
         SELECT url, captured_at,
                COUNT(DISTINCT page_id) AS pages,
                MIN(position)           AS best_position
         FROM rank_snapshots
         GROUP BY url, captured_at
       )
       SELECT
         p.url,
         MAX(p.pages)          AS peak_pages,
         site.pages            AS site_pages,
         MIN(p.best_position)  AS best_position,
         COUNT(*)              AS sweeps
       FROM per_sweep p CROSS JOIN site
       GROUP BY p.url`,
    )
    .all();

  return rows.map((row) => ({
    url: row.url,
    peak_pages: Number(row.peak_pages),
    site_pages: Number(row.site_pages),
    best_position: Number(row.best_position),
    sweeps: Number(row.sweeps),
  }));
}

/**
 * The newest finished run's named threads, and the steps behind them.
 *
 * `ended_at IS NOT NULL AND ok = 1` is `loadStories`' own guarantee that a
 * half-written run is invisible rather than partially believed, and it has to
 * be repeated here: this script can run while `news:stories` is mid-flight.
 *
 * Both tiers are carried, `state` included, even though a statewide story
 * never gets a pin. `loadStories` counts them so the plate can say they exist
 * "rather than letting them vanish between the two modes", and a snapshot that
 * dropped them would silently zero that number.
 *
 * `STORY_LIMIT` is deliberately *not* applied. The cap is applied after the
 * window filter, so capping here would mean the tightest window picking its
 * 120 out of a list already truncated by a different window's ranking.
 */
function stories(db) {
  const run = db
    .prepare(
      `SELECT id, ended_at FROM stories.story_runs
        WHERE ended_at IS NOT NULL AND ok = 1
        ORDER BY id DESC LIMIT 1`,
    )
    .get();

  if (!run) return null;

  const threads = db
    .prepare(
      `SELECT id, title_mr, actors, issue, place_tier, taluka_name_mr, district_id,
              lon, lat, place_evidence, articles, first_at, last_at, desk_districts
         FROM stories.threads
        WHERE run_id = ? AND title_mr IS NOT NULL AND last_at IS NOT NULL`,
    )
    .all(run.id);

  // The join the derived store exists to make, exactly as `stepsFor` makes it:
  // membership and step number from `thread_articles`, the publisher's own
  // words from `main.articles`. `PER_STORY` is not applied for the same reason
  // `STORY_LIMIT` is not — the shaping stays in `stories.ts`.
  const steps = db
    .prepare(
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
    )
    .all(run.id, run.id);

  return { runId: Number(run.id), runAt: run.ended_at, threads, steps };
}

/** `MAX(discovered_at)` and `MAX(captured_at)` — what "as of" on the plate means. */
function meta(db) {
  return {
    collectedAt:
      db.prepare("SELECT MAX(discovered_at) AS at FROM articles").get()?.at ?? null,
    sweptAt:
      db.prepare("SELECT MAX(captured_at) AS at FROM rank_sweeps").get()?.at ?? null,
  };
}

function main() {
  const dry = process.argv.includes("--dry");

  const db = new DatabaseSync(NEWS_FILE, { readOnly: true });
  db.prepare("ATTACH DATABASE ? AS stories").run(STORIES_FILE);

  const snapshot = {
    builtAt: new Date().toISOString(),
    ...meta(db),
    articles: articles(db),
    prominence: prominence(db),
    stories: stories(db),
  };

  db.close();

  const districts = new Set(
    snapshot.articles.map((article) => article.district_id).filter(Boolean),
  );

  console.log(
    `[snapshot] ${snapshot.articles.length} articles in ${districts.size} districts, ` +
      `${snapshot.prominence.length} ranked urls, ` +
      `${snapshot.stories ? snapshot.stories.threads.length : 0} named threads ` +
      `(${snapshot.stories ? snapshot.stories.steps.length : 0} steps)`,
  );
  console.log(`[snapshot] collected up to ${snapshot.collectedAt}`);

  if (dry) {
    console.log("[snapshot] --dry, nothing written");

    return;
  }

  // Not pretty-printed. `dgipr-releases.json` is, and it is auditable by eye at
  // a few hundred releases; this is 820 rows nobody reads that way, and the
  // indentation would be a third of the file and a third of every diff.
  writeFileSync(OUT_JSON, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(`[snapshot] wrote ${path.relative(ROOT, OUT_JSON)}`);
}

main();
