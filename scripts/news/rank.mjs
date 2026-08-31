/**
 * Pass 3 — section page snapshots.
 *
 * Every half hour this records the ordered list of article URLs on each watched
 * section page: one row per URL per page per capture. It records where things
 * were. It does not decide what that means.
 *
 * That distinction is the point. Neither Lokmat nor Loksatta publishes a view,
 * share or comment count, so a later service will have to infer attention from
 * indirect evidence, and the position of a link on a section page over time is
 * some of the best evidence available from outside. But turning position into
 * attention takes decisions — how long counts as "held", how to discount a page
 * nobody updates, how to treat the global top-stories block both papers repeat
 * across every section page — and every one of those decisions wants to be
 * revisited against the full history once there is a history. So none of them
 * are made here. This pass writes down what it saw and stops.
 *
 * Two things are stored per capture:
 *
 *   rank_snapshots  every (page, position, url) seen
 *   rank_sweeps     every page attempted, and whether it came back
 *
 * The second matters more than it looks. A sweep where nine district pages
 * timed out produces fewer rows, and without a record of the attempt that is
 * indistinguishable from a quiet news hour — so any fraction computed
 * downstream ("this URL was on 38 of N pages") would silently use the wrong N.
 *
 * Cost: 51 pages every thirty minutes across two hosts, spaced by
 * scripts/lib/http.mjs.
 */
import { fetchText } from "../lib/http.mjs";
import { recordEntries } from "./discover.mjs";
import { classifyUrl } from "./geography.mjs";
import { SOURCES } from "./sources.mjs";

/**
 * Article links in document order, deduplicated, first occurrence winning.
 *
 * Position in the HTML is a rough proxy for position on the page: both
 * templates render the lead story early and the sidebar late, but source order
 * is not layout order and a widget that renders early can display anywhere.
 * Stored as what it is — the order the links appeared in the markup — so that
 * whoever reads it downstream knows what they are holding.
 */
export function orderedArticleLinks(html, pageUrl, source) {
  const seen = new Set();
  const ordered = [];

  for (const [, href] of String(html).matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    let url;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.host !== new URL(source.homepage).host) continue;

    url.hash = "";
    url.search = "";
    const clean = url.toString();
    if (seen.has(clean)) continue;

    if (!source.isArticleUrl(clean)) continue;
    if (!classifyUrl(clean)) continue;

    seen.add(clean);
    ordered.push(clean);
  }

  return ordered;
}

export async function snapshotRanks(db, { sources = SOURCES, log = console.log } = {}) {
  /** One timestamp for the whole sweep, so a capture is a single observation
   *  of the state of the press rather than fifty-one smeared ones. */
  const capturedAt = new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO rank_snapshots (captured_at, source_id, page_id, position, url)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(captured_at, page_id, position) DO NOTHING`,
  );
  const sweep = db.prepare(
    `INSERT INTO rank_sweeps (captured_at, source_id, page_id, ok, links, error)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(captured_at, page_id) DO NOTHING`,
  );

  let attempted = 0;
  let ok = 0;
  let rows = 0;
  let found = 0;

  for (const source of sources) {
    for (const page of source.rankPages) {
      const pageId = `${source.id}:${page.id}`;
      attempted += 1;

      let links = null;
      let error = null;
      try {
        const { body } = await fetchText(page.url, { ttlHours: 0, refresh: true });
        if (body) links = orderedArticleLinks(body, page.url, source);
        else error = "empty response";
      } catch (caught) {
        error = String(caught.message).slice(0, 300);
      }

      if (links === null) {
        // Recorded, not just logged. A page that failed has to be
        // distinguishable later from a page that had nothing on it.
        sweep.run(capturedAt, source.id, pageId, 0, 0, error);
        log(`  ! ${pageId} — ${error}`);
        continue;
      }

      sweep.run(capturedAt, source.id, pageId, 1, links.length, null);
      ok += 1;

      links.forEach((url, index) => {
        insert.run(capturedAt, source.id, pageId, index + 1, url);
      });
      rows += links.length;

      // The same fetch pays for discovery. For Lokmat this is not an
      // optimisation but the main way its articles are found at all — 337 of
      // its first 389 articles were never in its sitemap.
      found += recordEntries(db, source, links.map((url) => ({ url })), capturedAt);
    }
  }

  log(
    `  swept ${ok}/${attempted} pages, ${rows} link positions recorded, ${found} article urls`,
  );
  return { capturedAt, attempted, ok, rows, found };
}
