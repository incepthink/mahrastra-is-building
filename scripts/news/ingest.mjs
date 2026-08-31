/**
 * Pass 2 — ingest. Fetch each discovered article once and read its JSON-LD.
 *
 * No CSS selectors. Both mastheads ship a complete schema.org `NewsArticle`
 * because Google requires it, which makes it the most stable thing on the page:
 * a redesign moves every class name and leaves the JSON-LD alone. See
 * `lib/jsonld.mjs`.
 *
 * A page that carries no article block is recorded as `failed` with the reason,
 * not silently dropped. Silence is how you end up believing a source went quiet
 * when in fact the parser broke.
 *
 * `--recheck` re-reads articles we already have, looking for a moved
 * `dateModified`. Each distinct value observed is appended to
 * `article_revisions` — one row per observation, no running total. Whether a
 * re-edited story means anything, and how much, is a question for the service
 * that reads this table; all that is stored here is that on this date the
 * publisher said the article had last changed at that time.
 */
import { fetchText } from "../lib/http.mjs";
import { extractNewsArticle } from "./lib/jsonld.mjs";
import { toUtcIso } from "./lib/time.mjs";

/** Effectively permanent: an article is fetched once unless we ask again. */
const ARTICLE_TTL_HOURS = 24 * 365;

const SELECT_PENDING = `
SELECT url, source_id FROM articles
WHERE fetch_status = 'pending'
ORDER BY COALESCE(published_at, discovered_at) DESC
LIMIT ?
`;

/** Recently published pieces are the only ones still likely to be edited. */
const SELECT_RECHECK = `
SELECT url, source_id, modified_at FROM articles
WHERE fetch_status = 'ok'
  AND published_at IS NOT NULL
  AND published_at > ?
ORDER BY published_at DESC
LIMIT ?
`;

const UPDATE_OK = `
UPDATE articles SET
  fetch_status = 'ok', fetched_at = ?, fetch_error = NULL,
  headline = ?, description = ?, article_section = ?, keywords = ?,
  author = ?, image_url = ?, published_at = COALESCE(?, published_at),
  modified_at = ?, body = ?, word_count = ?
WHERE url = ?
`;

const UPDATE_FAILED = `
UPDATE articles SET fetch_status = 'failed', fetched_at = ?, fetch_error = ? WHERE url = ?
`;

export async function ingest(db, { limit = 200, recheck = false, sinceHours = 48, log = console.log } = {}) {
  const rows = recheck
    ? db.prepare(SELECT_RECHECK).all(
        new Date(Date.now() - sinceHours * 3600_000).toISOString(),
        limit,
      )
    : db.prepare(SELECT_PENDING).all(limit);

  const ok = db.prepare(UPDATE_OK);
  const failed = db.prepare(UPDATE_FAILED);
  const revision = db.prepare(
    `INSERT INTO article_revisions (url, seen_at, modified_at, headline) VALUES (?, ?, ?, ?)
     ON CONFLICT(url, modified_at) DO NOTHING`,
  );
  const totals = { attempted: rows.length, ok: 0, failed: 0, revised: 0 };

  for (const row of rows) {
    const now = new Date().toISOString();
    try {
      const { body: html } = await fetchText(row.url, {
        ttlHours: ARTICLE_TTL_HOURS,
        refresh: recheck,
      });

      const parsed = html ? extractNewsArticle(html) : null;
      const article = parsed && {
        ...parsed,
        publishedAt: toUtcIso(parsed.publishedAt),
        modifiedAt: toUtcIso(parsed.modifiedAt),
      };
      if (!article || !article.headline) {
        failed.run(now, html ? "no NewsArticle in JSON-LD" : "empty response", row.url);
        totals.failed += 1;
        continue;
      }

      ok.run(
        now,
        article.headline,
        article.description,
        article.articleSection,
        article.keywords,
        article.author,
        article.imageUrl,
        article.publishedAt,
        article.modifiedAt,
        article.body,
        article.wordCount,
        row.url,
      );
      totals.ok += 1;

      if (article.modifiedAt) {
        revision.run(row.url, now, article.modifiedAt, article.headline);
        // Counted for this run's log line only. The stored truth is the set of
        // rows in article_revisions; a running total on the article would be a
        // summary we would then have to keep honest, and the previous one was
        // not — it read 0 for every article while 660 revisions were on record.
        if (recheck && row.modified_at && article.modifiedAt !== row.modified_at) {
          totals.revised += 1;
        }
      }
    } catch (error) {
      failed.run(now, String(error.message).slice(0, 300), row.url);
      totals.failed += 1;
    }
  }

  log(
    `  ${recheck ? "recheck" : "ingest "} attempted ${totals.attempted}  ok ${totals.ok}  failed ${totals.failed}` +
      (recheck ? `  revised ${totals.revised}` : ""),
  );
  return totals;
}
