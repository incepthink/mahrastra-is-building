/**
 * Minimal HTML helpers for S3WaaS pages, shared by every district scraper.
 *
 * S3WaaS markup is template-generated and extremely regular, so targeted regex
 * beats pulling in a parser dependency. Everything here is read-only.
 */

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
};

export function decodeEntities(input) {
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Tags out, entities decoded, whitespace collapsed. */
export function text(html) {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|tr|td)>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first `<table>` on the page, as arrays of raw `<td>` inner HTML. */
export function parseTable(html) {
  const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/i);
  if (!table) return [];

  return [...table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]))
    .filter((cells) => cells.length > 0);
}

/** The `<link rel="alternate" hreflang="…">` map — S3WaaS's EN/MR pairing. */
export function alternateLinks(html) {
  const map = {};
  for (const tag of html.match(/<link[^>]*rel=["']alternate["'][^>]*>/gi) ?? []) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    const lang = tag.match(/hreflang=["']([^"']+)["']/i)?.[1];
    if (href && lang) map[lang] = decodeEntities(href);
  }
  return map;
}

export function heading(html) {
  return text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
}

/** Every attachment served from the S3WaaS CDN, in document order. */
export function cdnLinks(html) {
  return [...html.matchAll(/href=["'](https:\/\/cdn\.s3waas\.gov\.in\/[^"']+)["']/gi)].map((m) =>
    decodeEntities(m[1]),
  );
}

/** `dd/mm/yyyy` → `yyyy-mm-dd`; anything else → null. */
export function toIsoDate(value) {
  const match = String(value ?? "").match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const DEVANAGARI_DIGITS = "\u0966\u0967\u0968\u0969\u096a\u096b\u096c\u096d\u096e\u096f";

/** Devanagari numerals → ASCII, so a Marathi case number can be matched. */
export function normalizeDigits(input) {
  return String(input).replace(/[\u0966-\u096f]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** WordPress-style slug, used to guess a notice's permalink. */
export function slugify(input) {
  return decodeEntities(input)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 190);
}
