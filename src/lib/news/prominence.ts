import { query } from "./db";
import type { Prominence } from "@/types/news";

/**
 * How hard the press played each story, worked out from where they put it.
 *
 * `scripts/news/rank.mjs` writes down the ordered link list of every watched
 * section page every half hour and deliberately draws no conclusion from it —
 * "this pass writes down what it saw and stops". This is the other half of
 * that arrangement: the conclusion, drawn at read time, from constants that
 * live here and can therefore be retuned against the whole history without
 * re-scraping a week no archive would give back.
 *
 * Two observations carry it.
 *
 * **Reach** — how much of the site was carrying the link. The sites all
 * repeat a global top-stories block across every desk's page, so a URL sitting
 * on 41 of 51 section pages is not a Beed story that Beed cares about, it is
 * the story the paper decided everyone should see. That block is exactly what
 * a naive per-district count mistakes for local activity, and reach is what
 * tells the two apart.
 *
 * **Best position** — the highest the link climbed in any page's markup.
 * Source order is not layout order, and `rank.mjs` says so, but the lead story
 * is rendered early in both templates and the "more from this section" rail is
 * rendered late, so it separates the top of a page from the bottom even where
 * it cannot separate rank 4 from rank 6.
 *
 * Reach is weighted higher because it is the sturdier of the two: it is a
 * count of pages, where position is an index into markup whose relationship to
 * the rendered page is approximate.
 */
const REACH_WEIGHT = 0.7;
const POSITION_WEIGHT = 1 - REACH_WEIGHT;

/**
 * Past this rank, one position is not distinguishable from the next.
 *
 * A section page carries 15–40 article links and the tail of that list is a
 * "more from this section" rail rather than an editorial judgement. Everything
 * at or beyond this contributes nothing rather than a diminishing something,
 * which stops the positional term pretending to resolve a difference it cannot
 * see.
 */
const POSITION_FLOOR = 30;

/**
 * Prominence for every URL that has ever been seen on a section page.
 *
 * One query for the whole corpus rather than one per article: there are two
 * sweeps and ~900 rows today and there will be forty-eight sweeps a day from
 * here, so this stays a single scan of a small indexed table, where per-article
 * lookups would be 665 queries answering one question.
 *
 * **The denominator is the site, not the sweep.** The obvious reading of
 * `rank_sweeps` is "pages that came back in this capture", and dividing by
 * that is wrong in a way that only shows up on a bad night: a capture where
 * forty-one of fifty-one pages timed out would hand a perfect 1.0 to any story
 * on the ten that answered. That is not a story the whole site was carrying,
 * it is a story we have very little evidence about, and the two must not come
 * out the same number. The live corpus already contains this case — a partial
 * ten-page sweep whose top link scored 1.0 against a story that genuinely held
 * forty-one of fifty-one.
 *
 * So reach is measured against the widest sweep the collector has ever
 * completed, which is the best available estimate of how many section pages
 * the site actually has. A capture that saw less of the site than usual
 * therefore yields a smaller reach, not a larger one — the number errs toward
 * "we did not see it", which is the honest direction for a lower bound.
 */
export function prominenceByUrl(): Map<string, Prominence> {
  const rows = query<{
    url: string;
    peak_pages: number;
    site_pages: number;
    best_position: number;
    sweeps: number;
  }>(`
    WITH site AS (
      -- How many section pages the site is believed to have: the most that
      -- have ever answered in a single capture.
      --
      -- Read from both tables and the larger taken, because neither alone
      -- covers the history. rank_sweeps is the authoritative record of what
      -- was attempted, but it was added to the schema after collection had
      -- already begun (db.mjs says outright that the schema is expected to
      -- churn and that a re-scrape is not available) so the earliest captures
      -- have snapshots and no sweep row at all. Trusting sweeps alone would
      -- put the site at ten pages when a capture on disk plainly covers
      -- fifty-one, and every reach in the corpus would be inflated fivefold.
      -- rank_snapshots is the fallback and reads slightly low, since a page
      -- that returned no links leaves no rows in it; low is the safe side.
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
    GROUP BY p.url
  `);

  return new Map(
    rows.map((row) => {
      const sitePages = Math.max(1, Number(row.site_pages));
      const reach = clamp01(Number(row.peak_pages) / sitePages);
      const bestPosition = Number(row.best_position);
      const rank = 1 - Math.min(bestPosition, POSITION_FLOOR) / POSITION_FLOOR;

      return [
        row.url,
        {
          reach: round(reach),
          bestPosition,
          sweeps: Number(row.sweeps),
          score: round(REACH_WEIGHT * reach + POSITION_WEIGHT * rank),
        },
      ];
    }),
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
