/**
 * Pass 1 — discovery. Find every new Maharashtra article URL, cheaply.
 *
 * Reads each source's sitemap, throws away everything that is not Maharashtra
 * geography, and records what is left. Nothing is fetched here beyond the
 * sitemaps themselves: two requests bring back roughly 3,400 candidate URLs, of
 * which a couple of hundred survive the filter. Paying for an article fetch
 * before knowing whether we want the article is the one mistake that would make
 * this engine expensive.
 *
 * Loksatta's sitemap already carries the headline and keywords, so its rows
 * arrive half-populated and could in principle skip the fetch entirely.
 * Lokmat's carry only a URL. Both are written the same way and sorted out by
 * the ingest pass, which is what `fetch_status = 'pending'` is for.
 */
import { fetchText } from "../lib/http.mjs";
import { classifyUrl } from "./geography.mjs";
import { isSitemapIndex, parseRss, parseSitemapIndex, parseUrlset } from "./lib/sitemap.mjs";
import { toUtcIso } from "./lib/time.mjs";
import { SOURCES } from "./sources.mjs";

/**
 * Insert what is new; enrich what we already have.
 *
 * The UPDATE clause only fills blanks (`COALESCE(existing, incoming)`) because a
 * sitemap is allowed to tell us something we did not know, but never to
 * overwrite what the article's own JSON-LD told us — the article page is the
 * better witness and the ingest pass has already run by then.
 */
const INSERT = `
INSERT INTO articles (
  url, source_id, section, scope, district_id,
  discovered_at, sitemap_title, sitemap_keywords, sitemap_lastmod, published_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(url) DO UPDATE SET
  sitemap_title    = COALESCE(articles.sitemap_title, excluded.sitemap_title),
  sitemap_keywords = COALESCE(articles.sitemap_keywords, excluded.sitemap_keywords),
  sitemap_lastmod  = COALESCE(excluded.sitemap_lastmod, articles.sitemap_lastmod),
  published_at     = COALESCE(articles.published_at, excluded.published_at)
`;

/**
 * Read one discovery endpoint into entries.
 *
 * `kind: "rss"` is the Quintype outlets' `/feed`; everything else is a sitemap,
 * and a sitemap index is followed one level down, newest child first. Both
 * shapes normalise to the same entry, so nothing downstream branches on source.
 */
async function loadEndpoint(endpoint, { limitChildren = 1 } = {}) {
  const { body } = await fetchText(endpoint.url, { ttlHours: 0 });
  if (!body) return [];

  if (endpoint.kind === "rss") return parseRss(body);

  if (!isSitemapIndex(body)) return parseUrlset(body);

  const children = parseSitemapIndex(body).slice(0, limitChildren);
  const entries = [];
  for (const child of children) {
    const { body: childBody } = await fetchText(child.url, { ttlHours: 0 });
    if (childBody) entries.push(...parseUrlset(childBody));
  }
  return entries;
}

/**
 * Record a batch of sitemap or section-page entries against one source.
 *
 * Shared with the rank pass. Lokmat's sitemap turned out to be mostly topic and
 * pagination pages — only about fifty real Maharashtra articles per refresh —
 * and its RSS feeds are weeks stale, so its section pages are the primary way
 * its articles are found at all. Those pages are already being fetched every
 * half hour for the rank snapshot, so discovery rides along on the same
 * request rather than paying for it twice.
 */
export function recordEntries(db, source, entries, now = new Date().toISOString()) {
  const insert = db.prepare(INSERT);
  let kept = 0;

  for (const entry of entries) {
    if (!source.isArticleUrl(entry.url)) continue;
    const place = classifyUrl(entry.url);
    if (!place) continue;

    insert.run(
      entry.url,
      source.id,
      place.section,
      place.scope,
      place.districtId,
      now,
      entry.title ?? null,
      entry.keywords ?? null,
      toUtcIso(entry.lastmod),
      toUtcIso(entry.publishedAt ?? entry.lastmod),
    );
    kept += 1;
  }

  return kept;
}

export async function discover(db, { sources = SOURCES, log = console.log } = {}) {
  const now = new Date().toISOString();
  const totals = { seen: 0, kept: 0, inserted: 0 };

  for (const source of sources) {
    let seen = 0;
    let kept = 0;

    const before = db.prepare("SELECT COUNT(*) AS n FROM articles WHERE source_id = ?").get(source.id).n;

    for (const endpoint of source.discovery) {
      const entries = await loadEndpoint(endpoint);
      seen += entries.length;
      kept += recordEntries(db, source, entries, now);
    }

    const after = db.prepare("SELECT COUNT(*) AS n FROM articles WHERE source_id = ?").get(source.id).n;
    const added = after - before;

    log(`  ${source.id.padEnd(12)} feed ${String(seen).padStart(5)} → Maharashtra ${String(kept).padStart(4)} → new ${added}`);
    totals.seen += seen;
    totals.kept += kept;
    totals.inserted += added;
  }

  return totals;
}

/** Backfill one past day, where the source keeps an archive (Loksatta only). */
export async function backfill(db, date, { sources = SOURCES, log = console.log } = {}) {
  const now = new Date().toISOString();
  let inserted = 0;

  for (const source of sources) {
    if (!source.archive) {
      log(`  ${source.id}: no archive — history only exists from first run`);
      continue;
    }
    const entries = await loadEndpoint({ kind: "urlset", url: source.archive(date) });
    const kept = recordEntries(db, source, entries, now);
    log(`  ${source.id}: ${date} → ${entries.length} urls, ${kept} Maharashtra`);
    inserted += kept;
  }
  return inserted;
}
