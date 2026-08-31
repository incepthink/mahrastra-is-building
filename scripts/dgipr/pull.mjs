/**
 * The one-time import: DGIPR press releases out of `maharashtra-in-a-glance`
 * and into this repo, as a committed snapshot.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS WRITES A FILE UNDER `src/data/` AND NOT UNDER `.data/`.
 *
 * Every other store in this project lives in `.data/` and is gitignored, and
 * `scripts/news/db.mjs` and `scripts/news/stories/db.mjs` both argue at length
 * for why: those files hold a scraped corpus that is enormous, rebuildable and
 * — in Lokmat's case — unrepeatable. They are the collector's business and no
 * deploy should be carrying them.
 *
 * None of that is true of these. Five hand-curated government releases are not
 * a corpus; they are content, they are small, and a fresh clone or a Vercel
 * build that silently has none of them is a broken feature rather than an
 * empty one. So the snapshot is committed, ships with the app, and needs no
 * build step on the far side — which is also what makes this genuinely a
 * one-time import rather than a pipeline pretending to be one.
 *
 * It is still a *separate store*: nothing here is ever written into
 * `news.db` or `stories.db`. A DGIPR release is not an article the collector
 * observed. It has no URL that was swept, no position in a section page, no
 * prominence, no thread and no velocity, and letting it into the corpus would
 * put a row in every one of those tables that means something different from
 * its neighbours. See `src/lib/dgipr/read.ts`.
 * ---------------------------------------------------------------------------
 *
 *   node scripts/dgipr/pull.mjs [path-to-maharashtra-in-a-glance]
 *
 * Re-running it is safe and idempotent: it overwrites the snapshot and the
 * posters from whatever the source repo currently holds.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Where the curated feed lives. Overridable, because a sibling checkout is a
 *  convention and not a guarantee. */
const DEFAULT_SOURCE = path.resolve(ROOT, "..", "maharashtra-in-a-glance");

const OUT_JSON = path.join(ROOT, "src", "data", "dgipr-releases.json");
const OUT_POSTERS = path.join(ROOT, "public", "dgipr", "posters");

/**
 * Marathi district names that the boundary file does not carry verbatim.
 *
 * There is exactly one, and it is a real ambiguity rather than a typo: the
 * releases are datelined `मुंबई`, and the map has two Mumbais. A DGIPR release
 * datelined Mumbai is issued from Mantralaya, which is in Mumbai City, so that
 * is where it is filed — and the release keeps its own dateline word beside the
 * resolved id so a reader is never shown a district the source did not name.
 *
 * Anything not listed here and not matching a district's `nameMr` exactly is
 * left unresolved rather than guessed at. An unresolved release still appears
 * in the panel; it simply gets no mark, the same way a statewide story does.
 */
const ALIASES = {
  "मुंबई": "mumbai-city",
};

async function main() {
  const source = path.resolve(process.argv[2] ?? DEFAULT_SOURCE);

  if (!existsSync(source)) {
    throw new Error(
      `no source repo at ${source} — pass its path as the first argument.`,
    );
  }

  const { ARTICLES } = await import(
    pathToFileURL(path.join(source, "src", "data", "articles.ts")).href
  );
  const { DISTRICTS } = await import(
    pathToFileURL(path.join(ROOT, "src", "data", "districts.ts")).href
  );

  /** The boundary file's own Marathi names, reversed. Built rather than typed
   *  out, so a district renamed in `districts.ts` cannot go stale here. */
  const byNameMr = new Map(
    Object.entries(DISTRICTS).map(([id, meta]) => [meta.nameMr, id]),
  );

  mkdirSync(OUT_POSTERS, { recursive: true });

  const releases = [];
  const unresolved = [];

  for (const article of ARTICLES) {
    const dateline = String(article.district ?? "").trim();
    const districtId = byNameMr.get(dateline) ?? ALIASES[dateline] ?? null;

    if (!districtId) unresolved.push(dateline || "(none)");

    releases.push({
      id: article.id,
      slug: article.slug,
      titleMr: article.title,
      // The source carries a calendar date and no clock. Kept as the date it
      // is rather than widened into a fake midnight timestamp — a release is
      // dated by the day it was issued, and `read.ts` compares it as such.
      date: article.date,
      summaryMr: article.summary,
      districtId,
      /** The source's own dateline word, kept verbatim beside the resolved id
       *  so the panel can print what DGIPR said and not what we decided. */
      datelineMr: dateline || null,
      categoryMr: article.category,
      sourceMr: article.source,
      authorMr: article.author ?? null,
      tags: Array.isArray(article.tags) ? article.tags : [],
      featured: Boolean(article.featured),
      posterUrl: copyPoster(source, article.posterImageUrl),
      pdfUrl: article.articlePdfUrl ?? null,
    });
  }

  // Newest first, and by id inside a day — the source dates to the day, so
  // without the tie-break five releases from one morning would come back in
  // whatever order the file happened to list them.
  releases.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  writeFileSync(
    OUT_JSON,
    `${JSON.stringify({ pulledAt: new Date().toISOString(), releases }, null, 2)}\n`,
    "utf8",
  );

  console.log(`[dgipr] ${releases.length} releases -> ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`[dgipr] placed in ${new Set(releases.map((r) => r.districtId).filter(Boolean)).size} districts`);

  if (unresolved.length > 0) {
    console.warn(
      `[dgipr] ${unresolved.length} with no district on the map: ${unresolved.join(", ")}`,
    );
  }
}

/**
 * Brings a poster across and returns the path this app serves it from.
 *
 * Copied rather than linked at the source repo's URL: the snapshot is meant to
 * be self-contained, and a poster that resolves only when a sibling checkout
 * happens to be running on port 3000 is not a one-time import.
 *
 * An absolute URL is passed straight through — that is already somebody else's
 * host and copying it is not ours to do.
 */
function copyPoster(source, url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;

  const from = path.join(source, "public", url.replace(/^\//, ""));
  if (!existsSync(from)) {
    console.warn(`[dgipr] poster missing at source: ${url}`);

    return null;
  }

  const name = path.basename(from);
  copyFileSync(from, path.join(OUT_POSTERS, name));

  return `/dgipr/posters/${name}`;
}

await main();
