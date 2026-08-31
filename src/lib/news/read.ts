import "server-only";

import { query, queryOne } from "./db";
import { prominenceByUrl } from "./prominence";
import { quantileScale } from "./scale";
import { cutoffOf, DEFAULT_WINDOW, windowsFrom } from "./window";
import { DISTRICTS } from "@/data/districts";
import type {
  DistrictNews,
  NewsArticle,
  NewsMap,
  WindowId,
} from "@/types/news";
/**
 * How many articles are carried into the browser per district.
 *
 * The panel is a reading list, not an archive. Mumbai files a hundred pieces a
 * day and nobody scrolls a hundred; capping here rather than in the component
 * is what keeps the page's payload flat as the corpus grows — otherwise every
 * reader downloads every headline in the state to look at one district. The
 * district's own `count` is left unclipped, so the panel can always say how
 * many it is showing out of how many there are.
 */
const PER_DISTRICT = 24;
const STATEWIDE_LIMIT = 30;

type ArticleRow = {
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

/**
 * Everything the map needs for one window, in one pass.
 *
 * The window widens until it finds something. `since` is measured against
 * `published_at` — the time the paper says the piece ran, not the time we
 * happened to notice it — because "what happened in the last day" is a claim
 * about the state, and `discovered_at` is a fact about our cron schedule.
 *
 * Only `fetch_status = 'ok'` rows are eligible. A pending row has a URL and
 * nothing else: no headline, no picture, no standfirst. Counting it would
 * inflate a district by however many articles the ingest pass has not reached
 * yet, which makes the choropleth a picture of the queue rather than of the
 * news.
 */
export async function loadNewsMap(
  requested: WindowId = DEFAULT_WINDOW,
  now: Date = new Date(),
): Promise<NewsMap> {
  const prominence = prominenceByUrl();
  const candidates = windowsFrom(requested);
  const widest = candidates[candidates.length - 1];

  let used = widest;
  let rows: ArticleRow[] = [];

  for (const candidate of candidates) {
    const found = articlesSince(cutoffOf(candidate, now));

    if (found.length > 0 || candidate === widest) {
      used = candidate;
      rows = found;
      break;
    }
  }

  const articles = rows.map((row) => toArticle(row, prominence));

  const districts: Record<string, DistrictNews> = {};
  const statewide: NewsArticle[] = [];

  for (const article of articles) {
    // A district id the boundary file does not know is dropped rather than
    // guessed at. `geography.mjs` maps newsroom sections onto the canonical
    // ids, but the two lists are maintained in different files, and a section
    // that drifts should quietly not be painted — never painted somewhere else.
    if (article.districtId) {
      if (!DISTRICTS[article.districtId]) continue;

      const bucket = (districts[article.districtId] ??= {
        districtId: article.districtId,
        articles: [],
        count: 0,
        level: 0,
        lead: null,
        latestAt: null,
      });

      bucket.articles.push(article);
      bucket.count += 1;
      continue;
    }

    statewide.push(article);
  }

  const scale = quantileScale(Object.values(districts).map((d) => d.count));

  for (const bucket of Object.values(districts)) {
    // Prominence first, recency as the tie-break. Most of the corpus was never
    // caught on a section page — a sweep is a snapshot every half hour, and a
    // piece filed between two of them is only ever seen by the sitemap — so
    // the great majority of these sort by time, and the handful the press
    // actually pushed rise above them. That is the intended order: the panel
    // opens with what the papers led on, then runs newest-first.
    bucket.articles.sort(byProminenceThenTime);
    bucket.level = scale.levelOf(bucket.count);
    bucket.lead = bucket.articles[0] ?? null;
    bucket.latestAt = bucket.articles
      .map((article) => article.publishedAt)
      .reduce<string | null>((latest, at) => (!latest || at > latest ? at : latest), null);
    bucket.articles = bucket.articles.slice(0, PER_DISTRICT);
  }

  statewide.sort(byProminenceThenTime);

  return {
    districts,
    statewide: statewide.slice(0, STATEWIDE_LIMIT),
    window: used,
    widened: used.id !== requested,
    totals: {
      articles: articles.length,
      districts: Object.keys(districts).length,
      statewide: statewide.length,
    },
    ceiling: Math.max(0, ...Object.values(districts).map((d) => d.count)),
    collectedAt: lastCollectedAt(),
    sweptAt: lastSweptAt(),
  };
}

/**
 * The scale's own bands, for the legend.
 *
 * Recomputed from the finished map rather than returned alongside it: `Scale`
 * carries two closures, and a function cannot cross the server/client
 * boundary. The legend needs the numbers, not the machinery.
 */
export function legendBands(
  map: NewsMap,
): Array<{ level: number; min: number; max: number }> {
  const scale = quantileScale(Object.values(map.districts).map((d) => d.count));

  return scale.breaks
    .map((_, index) => {
      const band = scale.bandOf(index + 1);

      return band ? { level: index + 1, min: band[0], max: band[1] } : null;
    })
    .filter((band): band is { level: number; min: number; max: number } => band !== null);
}

function articlesSince(cutoff: string | null): ArticleRow[] {
  const bounded = cutoff ? "AND a.published_at >= ?" : "";

  return query<ArticleRow>(
    `SELECT
       a.url, a.district_id, a.scope, a.article_section,
       a.headline, a.sitemap_title, a.description, a.image_url, a.author,
       a.published_at, a.modified_at, a.word_count,
       (SELECT COUNT(*) FROM article_revisions r WHERE r.url = a.url) AS revisions
     FROM articles a
     WHERE a.fetch_status = 'ok' AND a.published_at IS NOT NULL ${bounded}
     ORDER BY a.published_at DESC`,
    ...(cutoff ? [cutoff] : []),
  );
}

function toArticle(
  row: ArticleRow,
  prominence: ReturnType<typeof prominenceByUrl>,
): NewsArticle {
  return {
    url: row.url,
    districtId: row.district_id,
    section: row.article_section,
    // The sitemap title is the fallback, not the preference: it is the same
    // string the ingest pass would have found, but only one of the feeds
    // carries it. Either way the headline is the publisher's own words and is
    // never rewritten here.
    headline: row.headline ?? row.sitemap_title ?? "",
    description: row.description,
    imageUrl: row.image_url,
    author: row.author,
    publishedAt: row.published_at ?? "",
    // Counted as an edit only when the paper moved it past publication. Both
    // CMSes stamp `dateModified` equal to `datePublished` on the first write,
    // so taking the column at face value would mark every article as revised.
    modifiedAt:
      row.modified_at && row.published_at && row.modified_at > row.published_at
        ? row.modified_at
        : null,
    wordCount: row.word_count === null ? null : Number(row.word_count),
    // The first observed `dateModified` is the article appearing, not changing.
    revisions: Math.max(0, Number(row.revisions) - 1),
    prominence: prominence.get(row.url) ?? null,
  };
}

function byProminenceThenTime(a: NewsArticle, b: NewsArticle): number {
  const gap = (b.prominence?.score ?? 0) - (a.prominence?.score ?? 0);

  return gap !== 0 ? gap : b.publishedAt.localeCompare(a.publishedAt);
}

/** When the collector last wrote anything — what "as of" on the plate means. */
function lastCollectedAt(): string | null {
  return queryOne<{ at: string | null }>(
    "SELECT MAX(discovered_at) AS at FROM articles",
  )?.at ?? null;
}

function lastSweptAt(): string | null {
  return queryOne<{ at: string | null }>(
    "SELECT MAX(captured_at) AS at FROM rank_sweeps",
  )?.at ?? null;
}

