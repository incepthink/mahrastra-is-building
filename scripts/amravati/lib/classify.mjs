/**
 * Derives the parts of a Signal the district site does not state outright:
 * where it is, which sector it belongs to, and how far along it is.
 *
 * Every derivation is keyword-driven and recorded in the record's `confidence`
 * block, so a reviewer can see what came from the source and what came from a
 * rule. Anything that falls through to a default is flagged `needsReview`.
 */
import { TALUKAS, normalizePlace } from "./geocode.mjs";

/** `Village- Hivra Bu., Taluka- Nandgaon Khandeshwar` → its two parts. */
export function parsePlaceFromTitle(title) {
  const clean = title.replace(/\s+/g, " ").trim();

  const village = clean.match(/villages?\s*[-–:]\s*([^,;()]+)/i)?.[1]?.trim() ?? null;
  let taluka = clean.match(/(?:taluka|tehsil|tahsil)\s*[-–:]\s*([^,;()]+)/i)?.[1]?.trim() ?? null;

  // Fall back to any taluka named anywhere in the text.
  if (!taluka) {
    const haystack = normalizePlace(clean);
    taluka = TALUKAS.find((name) => haystack.includes(normalizePlace(name))) ?? null;
  } else {
    // Snap to the canonical spelling so filters group correctly.
    const normalized = normalizePlace(taluka);
    taluka = TALUKAS.find((name) => normalizePlace(name) === normalized) ?? taluka;
  }

  return { village: village || null, taluka: taluka || null };
}

const CATEGORY_RULES = [
  ["transportation", /\b(road|highway|bridge|railway|rail |bypass|transport|bus |depot|airport|flyover|culvert)\b/i],
  ["energy", /\b(electricity|power|solar|substation|grid|msedcl|mahavitaran|transformer|energy)\b/i],
  ["agriculture", /\b(farmer|agricultur|crop|kisan|irrigation|canal|dam|watershed|horticultur|shetkari|shetmajoor)\b/i],
  ["manufacturing", /\b(midc|industrial|industry|factory|textile|mill|manufactur|cluster)\b/i],
  ["research", /\b(research|incubat|university|innovation|laboratory|skill development)\b/i],
  ["infrastructure", /\b(construction|building|works|water supply|drainage|sewer|housing|awas|land acquisition|acquisition|premises|renovation|repair)\b/i],
  ["public-systems", /\b(hospital|health|school|education|welfare|pension|ration|scheme|certificate|admission|recruitment|office|seva kendra|aadhaar)\b/i],
];

export function deriveCategory(haystack) {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return { category, basis: "keyword" };
  }
  return { category: "public-systems", basis: "default" };
}

/**
 * Land acquisition notices carry their own status ladder: a section 11
 * preliminary notification is an intent, section 19 is a declaration, and an
 * award under section 23 means the acquisition is being executed.
 */
const STATUS_RULES = [
  ["operational", /\b(inaugurat|commission|lokarpan|now operational|opened to (the )?public)\b/i],
  ["completed", /\b(completed|completion|handed over|final award)\b/i],
  ["in-progress", /\b(section[-\s]*2[13]|award|work order|under construction|in progress|ongoing)\b/i],
  ["sanctioned", /\b(section[-\s]*19|declaration|sanction|approved|order[-\s]|administrative approval)\b/i],
  ["announced", /\b(section[-\s]*11|preliminary notification|public notice|tender|quotation|advertisement|notice inviting|press note)\b/i],
];

export function deriveStatus(haystack) {
  for (const [status, pattern] of STATUS_RULES) {
    if (pattern.test(haystack)) return { status, basis: "keyword" };
  }
  return { status: "announced", basis: "default" };
}

/**
 * On S3WaaS notice tables the "Title" column is usually the issuing office and
 * the "Description" column is the notice itself, so the title is the better
 * agency candidate — but only when it reads like an office, not a place.
 */
export function deriveAgency(sourceTitle, fallback) {
  const looksLikeOffice =
    /\b(department|office|corporation|collector|committee|directorate|board|authority|council|division|branch|cell|zilla|parishad|municipal|surgeon|director)\b/i.test(
      sourceTitle,
    );
  if (looksLikeOffice) {
    return { agency: sourceTitle.replace(/\s+/g, " ").trim(), basis: "stated" };
  }
  return { agency: fallback, basis: "default" };
}
