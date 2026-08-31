/**
 * The live import: DGIPR press releases straight off mahasamvad.in, into the
 * committed snapshot the map reads.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE `pull.mjs`.
 *
 * `pull.mjs` imports five hand-curated releases out of a sibling checkout of
 * `maharashtra-in-a-glance`. Those five came from mahasamvad.in in the first
 * place — somebody read the site and typed them into a TypeScript literal. So
 * that script is not a different source, it is a slower and lossier path to
 * this one, and it is capped at whatever a person got round to transcribing.
 *
 * mahasamvad.in is WordPress, and WordPress publishes every post through
 * `/wp-json/wp/v2/` as clean JSON — no HTML parsing, no headless browser. This
 * script reads that directly, so the snapshot goes from five releases in one
 * district to a few hundred across every district the directorate files under.
 *
 * The two scripts write the same file and are meant to compose: this one keeps
 * whatever `pull.mjs` left behind (see MERGE below), because the curated set is
 * datelined Mumbai and mahasamvad's district taxonomy has no Mumbai in it.
 * ---------------------------------------------------------------------------
 *
 * WHY THE DISTRICT IS NEVER GUESSED FROM THE TEXT.
 *
 * `pull.mjs` resolves a district by reading a dateline word and matching it
 * against `districts.ts`, and it has to, because a curated literal carries
 * nothing better. It is a guess, and it is why that script needs an `ALIASES`
 * table and keeps an unresolved list.
 *
 * This script never guesses. DGIPR's own editors file each release under a
 * district *category* — `जिल्हा वार्ता` → division → district — and we fetch one
 * district at a time by that category's id. The district is therefore known by
 * construction, before a single word of the release is read. The only naming
 * done here happens once at the taxonomy level, against category names rather
 * than prose, and a category that does not resolve is reported and skipped
 * rather than placed somewhere plausible.
 *
 *   node scripts/dgipr/pull-mahasamvad.mjs [--per-district=N] [--dry]
 *
 * Re-running it is idempotent: live releases are keyed by their WordPress post
 * id, so a re-pull replaces the live set wholesale rather than appending to it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT_JSON = path.join(ROOT, "src", "data", "dgipr-releases.json");

const SITE = "https://mahasamvad.in";

/**
 * `जिल्हा वार्ता` — "district despatches". Every district category on the site
 * hangs off this one, either directly or under a division. Hard-coded because
 * it is the site's root term for this taxonomy; everything *below* it is
 * discovered at runtime, so a district renamed or renumbered upstream needs no
 * edit here.
 */
const DISTRICT_ROOT_CATEGORY = 222;

/** The site's own `Featured` term, carried through to `release.featured`. */
const FEATURED_CATEGORY = 12452;

/**
 * Live releases are prefixed so a re-pull can tell its own rows from the ones
 * `pull.mjs` wrote, and replace only its own. See MERGE in `main`.
 */
const LIVE_ID_PREFIX = "ms-";

/** Some hosts refuse a request with no browser-like UA. Mirrors the headers the
 *  content-platform's scraper uses against this same site. */
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "accept-language": "mr,hi,en;q=0.8",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request, with backoff.
 *
 * A run makes one call per district — around three dozen — and a single 429 or
 * 502 partway through would otherwise cost the whole pull. A 4xx other than 429
 * is a real error (a category that no longer exists) and surfaces immediately.
 */
async function getJson(url, attempts = 4) {
  let last;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      last = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      last = error;
    }
    if (attempt < attempts - 1) await sleep(Math.min(1000 * 2 ** attempt, 8000));
  }

  throw new Error(`GET ${url} failed after ${attempts} attempts: ${last}`);
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  ndash: "–",
  mdash: "—",
};

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * WordPress's rendered HTML down to the text of the release.
 *
 * Written by hand rather than with jsdom + Readability — which is what the
 * content-platform reaches for — because this repo has neither dependency and
 * the markup does not need them. A DGIPR release is a `<ul>` of bullet points
 * followed by `<p>` paragraphs joined with `<br />`, and the only structure
 * worth keeping is where the line breaks fall.
 *
 * Inline `<img>` is dropped: the poster is carried separately as `posterUrl`,
 * and the images inside the body are the same photographs at full size.
 */
function htmlToText(html) {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(img|figure|iframe)\b[^>]*>/gi, "")
    .replace(/<\/(p|li|div|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // DGIPR ends every release with a row of zeroes — the wire-copy convention
    // for "message ends". It is punctuation for a teleprinter, not content.
    .replace(/\n[0#]{3,}\s*$/, "")
    .trim();
}

const termNames = (post, taxonomy) =>
  (post._embedded?.["wp:term"] ?? [])
    .flat()
    .filter((term) => term?.taxonomy === taxonomy && typeof term.name === "string")
    .map((term) => term.name);

/**
 * The district categories, discovered rather than listed.
 *
 * The taxonomy is two levels deep and *reuses names across them*: `पुणे` is both
 * the division (233) and the district inside it (235), as is `नाशिक`, `नागपूर`,
 * `कोल्हापूर`, `अमरावती`, `लातूर` and `छत्रपती संभाजीनगर`. Resolving by name
 * alone would therefore collide seven ways.
 *
 * The rule that separates them is structural: a **leaf** under `जिल्हा वार्ता`
 * is a district, a node with children is a division. That holds under renaming
 * and needs no table.
 *
 * Two consequences worth stating rather than discovering later:
 *
 * - `कोकण` (223) and `महाराष्ट्र परिचय केंद्र` (268) have children and so are
 *   not districts, dropping out on the same rule. `नवी दिल्ली` and `पणजी` are
 *   leaves that resolve to no Maharashtra district, so they are reported and
 *   skipped — correctly: they are the state's offices outside the state.
 * - Posts filed on a *division* and never on a district are not collected.
 *   There are a few hundred. Placing one would mean choosing a district the
 *   editors declined to choose, which is the guess this script exists to avoid.
 */
function districtCategories(categories) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const hasChildren = new Set(categories.map((category) => category.parent));

  const under = (id) => {
    let node = byId.get(id);
    for (let hop = 0; node && hop < 8; hop += 1) {
      if (node.parent === DISTRICT_ROOT_CATEGORY) return true;
      node = byId.get(node.parent);
    }

    return false;
  };

  return categories
    .filter((category) => under(category.id) && !hasChildren.has(category.id))
    .sort((a, b) => b.count - a.count);
}

/**
 * Terms that say where a post sits rather than what it is about.
 *
 * `Ticker`, `slider` and `Featured` are the site's own presentation slots, and
 * `Uncategorized` is WordPress's default. The whole district taxonomy is
 * excluded too, but not from this list — it is passed in, because it is
 * discovered at runtime. That matters: a release filed under both `गोंदिया` and
 * its division `नागपूर` must not end up with `नागपूर` as its *subject*, which
 * is what excluding only the district's own name would have produced.
 */
const PLACEMENT_TERMS = ["Featured", "Ticker", "slider", "Uncategorized"];

function toRelease(post, districtId, datelineMr, placementTerms) {
  const categories = termNames(post, "category");

  return {
    id: `${LIVE_ID_PREFIX}${post.id}`,
    slug: post.slug,
    titleMr: htmlToText(post.title?.rendered ?? ""),
    // `read.ts` compares dates at day granularity and says why. The clock the
    // REST API carries is the CMS's publish time and not an issue time, so it
    // is dropped here rather than given a meaning it does not have.
    date: (post.date ?? "").slice(0, 10),
    summaryMr: htmlToText(post.content?.rendered ?? ""),
    districtId,
    /** The category the directorate filed it under, printed by the panel. A
     *  stronger claim than `pull.mjs`'s dateline: it is DGIPR's own filing
     *  rather than a word matched out of the first line of prose. */
    datelineMr,
    /** The post's subject category. `जिल्हा वार्ता` is the fallback because
     *  that is what the release is when it is nothing more specific. */
    categoryMr: categories.find((name) => !placementTerms.has(name)) ?? "जिल्हा वार्ता",
    sourceMr: "महासंवाद",
    /**
     * Always null, and that is the honest answer rather than a missing feature.
     *
     * The panel prints this under `जारी करणारे कार्यालय` — *issuing office* —
     * and the WordPress author field does not hold one. Across the whole pull
     * it takes exactly two values, `Guest` and `Team DGIPR`, which are the CMS
     * accounts the site publishes through. Writing either under that label
     * would tell the reader a district office was named when none was.
     *
     * The issuing office is in fact stated, inside the dateline of the body —
     * `गडचिरोली, दि.२७ ऑगस्ट (जिमाका):`, where जिमाका is the district
     * information office. It is left there, where the reader can see the words
     * the department wrote, rather than parsed out of prose into a field that
     * claims more precision than the parse has.
     */
    authorMr: null,
    tags: termNames(post, "post_tag"),
    featured: (post.categories ?? []).includes(FEATURED_CATEGORY),
    /** Left at the site's own URL rather than copied into `public/`, which is
     *  what `copyPoster` does for the curated set. Those posters are SVGs a
     *  sibling repo generated and that exist nowhere else; these are the
     *  directorate's own photographs, already served from its own host. */
    posterUrl: post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null,
    /** The REST API exposes no attached PDF. Null rather than absent, so every
     *  row in the snapshot keeps the same shape. */
    pdfUrl: null,
    /** The release on mahasamvad.in. The curated rows have no equivalent — a
     *  transcription has no canonical URL — which is why the field is optional
     *  on the type rather than required. */
    url: post.link ?? null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const perDistrict =
    Number(args.find((arg) => arg.startsWith("--per-district="))?.split("=")[1]) || 4;
  const dry = args.includes("--dry");

  const { DISTRICTS } = await import(
    pathToFileURL(path.join(ROOT, "src", "data", "districts.ts")).href
  );
  /** Built from the boundary file rather than typed out, so a district renamed
   *  in `districts.ts` cannot go stale here. Same reasoning as `pull.mjs`. */
  const byNameMr = new Map(
    Object.entries(DISTRICTS).map(([id, meta]) => [meta.nameMr, id]),
  );

  console.log("[dgipr] reading the category tree");
  const categories = await getJson(
    `${SITE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,parent,count`,
  );

  const leaves = districtCategories(categories);
  const targets = [];
  const unresolved = [];

  for (const leaf of leaves) {
    const districtId = byNameMr.get(leaf.name);
    if (districtId) targets.push({ ...leaf, districtId });
    else unresolved.push(`${leaf.name} (${leaf.id})`);
  }

  console.log(`[dgipr] ${leaves.length} district categories, ${targets.length} on the map`);
  if (unresolved.length > 0) {
    console.log(`[dgipr] not districts of Maharashtra, skipped: ${unresolved.join(", ")}`);
  }

  const live = [];

  /**
   * Everything that names a *place in the taxonomy* rather than a subject.
   *
   * Built from the whole district tree — every division and every district,
   * plus the root — and not just the district being fetched. A release filed
   * under `गोंदिया` and its division `नागपूर` would otherwise take `नागपूर` as
   * its subject, which is not a subject at all.
   */
  const placementTerms = new Set([
    ...PLACEMENT_TERMS,
    ...categories
      .filter(
        (category) =>
          category.id === DISTRICT_ROOT_CATEGORY ||
          category.parent === DISTRICT_ROOT_CATEGORY ||
          leaves.some((leaf) => leaf.id === category.id),
      )
      .map((category) => category.name),
  ]);

  for (const target of targets) {
    const posts = await getJson(
      `${SITE}/wp-json/wp/v2/posts?categories=${target.id}` +
        `&per_page=${perDistrict}&_embed=1&orderby=date&order=desc`,
    );

    for (const post of posts) {
      live.push(toRelease(post, target.districtId, target.name, placementTerms));
    }

    console.log(
      `[dgipr]   ${target.districtId.padEnd(26)} ${String(posts.length).padStart(2)} of ${target.count}`,
    );
    // Polite: three dozen sequential reads of somebody else's public API.
    await sleep(250);
  }

  // MERGE. Anything the snapshot already holds that this script did not write
  // is kept — today, the five curated releases from `pull.mjs`, all datelined
  // Mumbai, a district mahasamvad's taxonomy has no category for. Dropping them
  // would lose the only marks the map has over Mumbai.
  const kept =
    existsSync(OUT_JSON) && !dry
      ? (JSON.parse(readFileSync(OUT_JSON, "utf8")).releases ?? []).filter(
          (release) => !String(release.id).startsWith(LIVE_ID_PREFIX),
        )
      : [];

  const releases = [...kept, ...live].sort(
    (a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)),
  );

  const placed = new Set(releases.map((release) => release.districtId).filter(Boolean));
  console.log(
    `[dgipr] ${live.length} live + ${kept.length} kept = ${releases.length} releases in ${placed.size} districts`,
  );

  if (dry) {
    console.log("[dgipr] --dry, nothing written");

    return;
  }

  writeFileSync(
    OUT_JSON,
    `${JSON.stringify({ pulledAt: new Date().toISOString(), releases }, null, 2)}\n`,
    "utf8",
  );
  console.log(`[dgipr] wrote ${path.relative(ROOT, OUT_JSON)}`);
}

await main();
