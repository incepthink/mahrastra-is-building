/**
 * Sitemap readers for the two news sources.
 *
 * Regex rather than an XML parser, for the same reason `scripts/lib/html.mjs`
 * uses regex on S3WaaS pages: these documents are machine-generated from a CMS
 * template and are far more regular than the general case a parser defends
 * against. The one real irregularity — Lokmat wraps every `<loc>` in CDATA and
 * Loksatta does not — is handled in `locText`.
 *
 * Two shapes come back from the wild:
 *
 *   plain    <url><loc>…</loc><lastmod>…</lastmod></url>
 *   news     the same, plus a <news:news> block carrying <news:title>,
 *            <news:publication_date> and <news:keywords>
 *
 * The difference is worth a lot. Loksatta publishes a Google News sitemap, so
 * discovery already knows the Marathi headline and a bilingual keyword list
 * without fetching anything. Lokmat publishes only URLs and timestamps, so its
 * headlines cost one request each.
 */
import { decodeEntities } from "../../lib/html.mjs";

const clean = (value) => decodeEntities(String(value ?? "")).replace(/\s+/g, " ").trim();

/** `<loc>` content, with or without a CDATA wrapper. */
function locText(block) {
  const raw = block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] ?? "";
  return clean(raw.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, ""));
}

function tagText(block, tag) {
  // Built by concatenation with the dotAll flag rather than a template literal
  // holding `[\s\S]` — inside a template literal those escapes collapse and the
  // class silently becomes "s or S", which matches almost nothing.
  const raw = block.match(new RegExp("<" + tag + "[^>]*>(.*?)</" + tag + ">", "is"))?.[1];
  if (raw === undefined) return null;
  return clean(raw.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")) || null;
}

/**
 * Parse any `<urlset>`, news namespace or not.
 * Returns `{ url, lastmod, title, publishedAt, keywords, imageUrl }[]`.
 */
export function parseUrlset(xml) {
  const entries = [];
  for (const [block] of String(xml).matchAll(/<url>[\s\S]*?<\/url>/gi)) {
    const url = locText(block);
    if (!url) continue;
    entries.push({
      url,
      lastmod: tagText(block, "lastmod"),
      title: tagText(block, "news:title"),
      publishedAt: tagText(block, "news:publication_date"),
      keywords: tagText(block, "news:keywords"),
      imageUrl: tagText(block, "image:loc"),
    });
  }
  return entries;
}

/** Parse a `<sitemapindex>` into its child sitemap URLs, newest first. */
export function parseSitemapIndex(xml) {
  const entries = [];
  for (const [block] of String(xml).matchAll(/<sitemap>[\s\S]*?<\/sitemap>/gi)) {
    const url = locText(block);
    if (url) entries.push({ url, lastmod: tagText(block, "lastmod") });
  }
  return entries;
}

/** True when the document is an index of sitemaps rather than a list of URLs. */
export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(String(xml));
}
