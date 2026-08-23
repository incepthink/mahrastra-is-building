/**
 * Scrapes development signals for Nagpur district.
 *
 * Run: `node scripts/scrape-nagpur.mjs [options]`
 *
 *   --refresh          ignore the HTTP cache and re-fetch every page
 *   --limit=<n>        keep at most n signals (newest first) — handy for a POC cut
 *   --only=<id,id>     restrict to some sources (see sources.mjs)
 *   --no-marathi       skip the EN↔MR pairing pass (one fewer request per page)
 *   --no-geocode       skip Nominatim; every record lands on the district centroid
 *   --no-facilities    skip the public-utilities layer
 *
 * Writes to public/data/nagpur/: signals.json, facilities.json, review.csv.
 *
 * The Amravati and Pune scrapers are the siblings of this one and all three
 * read the same S3WaaS platform. Nagpur differs from both in three ways that
 * shape the code below:
 *
 * 1. **English is at the bare path**, Marathi at `/mr/` — the reverse of the
 *    other two, which serve English from `/en/`.
 * 2. **Records have no reachable detail page**, so Pune's per-record `hreflang`
 *    walk is impossible here. The Marathi twin is found listing-to-listing
 *    instead, keyed on the attached PDF. See `collectMarathi`.
 * 3. **One archive holds the whole acquisition file** — every stage of it, back
 *    to 2018 — rather than the awards-only archive Pune publishes.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { fetchText } from "../lib/http.mjs";
import {
  alternateLinks,
  cdnLinks,
  parseTable,
  slugify,
  text,
  toIsoDate,
} from "../lib/html.mjs";
import {
  deriveAgency,
  deriveCategory,
  deriveMarathiProject,
  deriveProject,
  deriveStatus,
  parseMarathiPlace,
  parsePlaceFromTitle,
} from "./lib/classify.mjs";
import { DISTRICT_CENTROID, geocodePlace } from "./lib/geocode.mjs";
import {
  ATTRIBUTION,
  DEFAULT_AGENCY,
  DISTRICT,
  DOCUMENT_SOURCES,
  NOTICE_SOURCES,
  SITE,
  UTILITY_SOURCES,
} from "./sources.mjs";

const OUT_DIR = path.resolve("public/data/nagpur");

const options = parseArgs(process.argv.slice(2));
const log = (...args) => console.log("[nagpur]", ...args);

/* ---------------------------------------------------------------- schema -- */

const SignalSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  /** Marathi display text; falls back to English when no twin post exists. */
  title: z.string().min(8),
  summary: z.string().min(8),
  category: z.enum([
    "infrastructure",
    "energy",
    "transportation",
    "public-systems",
    "manufacturing",
    "research",
    "agriculture",
  ]),
  status: z.enum(["announced", "sanctioned", "in-progress", "completed", "operational"]),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  milestoneDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  district: z.literal(DISTRICT),
  taluka: z.string().optional(),
  locality: z.string().optional(),
  /** Bounded by the district's OSM envelope, so a bad geocode cannot slip in. */
  coordinates: z.tuple([z.number().min(78.2).max(79.7), z.number().min(20.5).max(21.8)]),
  implementingAgency: z.string().min(3),
  outcome: z.string().optional(),
  evidenceLabel: z.string().optional(),
  evidenceUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  featured: z.boolean().optional(),

  /** Scraper-only fields. The app may ignore them; a reviewer should not. */
  provenance: z.object({
    sourceId: z.string(),
    sourceLabel: z.string(),
    sourceUrl: z.string().url(),
    sourceTitle: z.string(),
    sourceDescription: z.string(),
    titleEn: z.string(),
    summaryEn: z.string(),
    noticeType: z.string().optional(),
    /** The scheme the notice names — stated by the source, not inferred. */
    project: z.string().optional(),
    /** The same scheme as the Marathi post names it, when it names one. */
    projectMr: z.string().optional(),
    validUntil: z.string().optional(),
    detailUrl: z.string().url().optional(),
    detailUrlMr: z.string().url().optional(),
    scrapedAt: z.string(),
  }),
  confidence: z.object({
    category: z.enum(["keyword", "default"]),
    status: z.enum(["keyword", "default"]),
    agency: z.enum(["keyword", "default"]),
    /** How precisely the point is known — never better than the source allows. */
    location: z.enum(["village", "taluka", "district"]),
    locationMatch: z.string().optional(),
  }),
  needsTranslation: z.boolean(),
  needsReview: z.boolean(),
});

/* ------------------------------------------------------------- collection -- */

/** The URL of page `n` of a listing — page 1 has no `/page/1/` form. */
const pageUrl = (base, page) => (page === 1 ? base : `${base}page/${page}/`);

/**
 * Walks a paginated S3WaaS listing until a page comes back without rows.
 *
 * Two table shapes reach this function. Notices are
 * Title | Description | Start | End | PDF; documents are Title | Date | PDF and
 * carry no description at all, so their title has to do the work of both.
 * Pagination past the end answers 200 with an empty table before it starts
 * answering 404, so an empty page ends the walk either way.
 */
async function collectRows(source) {
  const isDocument = source.kind === "document";
  const base = `${SITE}${source.path}`;
  const rows = [];

  for (let page = 1; page <= source.maxPages; page += 1) {
    const url = pageUrl(base, page);
    const { body, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !body) break;

    const parsed = parseTable(body)
      .filter((cells) => cells.length >= (isDocument ? 3 : 5))
      .map((cells) =>
        isDocument
          ? {
              sourceTitle: text(cells[0]),
              description: "",
              startDate: text(cells[1]),
              endDate: "",
              pdfUrl: cdnLinks(cells[2])[0] ?? null,
              listingUrl: url,
            }
          : {
              sourceTitle: text(cells[0]),
              description: cells[1],
              startDate: text(cells[2]),
              endDate: text(cells[3]),
              pdfUrl: cdnLinks(cells[4])[0] ?? null,
              listingUrl: url,
            },
      )
      .filter((row) => row.sourceTitle);

    if (parsed.length === 0) break;
    rows.push(...parsed);
    log(`  ${source.id} page ${page}: ${parsed.length} rows`);
  }

  // The same record can appear twice, and it does so in two different ways, so
  // both are checked:
  //
  //   - one notice, two rows, *two separate uploads of the same PDF*. Nagpur
  //     does this — `Case No 27/A-65/2025-26 Mouza – Junapani` is listed twice
  //     with two file URLs — and the attachment cannot catch it, because the
  //     attachments genuinely differ. Only one of the two copies has a Marathi
  //     twin, and it is the one the site lists first.
  //   - one notice, two listings, one PDF. The title alone cannot catch that
  //     one: the site republishes corrected versions under the same title.
  //
  // Keeping the first row seen under either key handles both, and keeps the
  // copy the site itself puts on top.
  const seen = new Set();
  const unique = rows.filter((row) => {
    const content = `${row.sourceTitle}|${row.startDate}`;
    if (seen.has(content) || (row.pdfUrl && seen.has(row.pdfUrl))) return false;
    seen.add(content);
    if (row.pdfUrl) seen.add(row.pdfUrl);
    return true;
  });

  const kept = unique.filter((row) => !isPersonalRecord(row.sourceTitle));
  if (kept.length !== unique.length) {
    log(`  ${source.id}: skipped ${unique.length - kept.length} personal-data rows`);
  }
  return kept;
}

/**
 * Whether a row is a register of named people rather than a development update.
 *
 * The brief rules out beneficiary-level and personally identifiable
 * information, and these listings do not honour that boundary on their own. The
 * acquisition archive itself carries a dozen of them alongside the
 * notifications. They are dropped at the row, not the source, because no
 * category on this site is reliably free of them.
 *
 * `section 18` earns its place in this list rather than in the section ladder:
 * section 18 of the 1894 Act is a *claimant's* reference to the District Court
 * against the compensation awarded to them, so every row citing it here — the
 * priority lists, the fund-transfer lists, the court-ordered publications — is
 * a list of named people and their claims. There is no section-18 row in this
 * archive that is about a project rather than about individuals.
 */
const PERSONAL_RECORD = new RegExp(
  [
    "beneficiar",
    "farmer list",
    "senior[io]ty list",
    "section[-\\s]?18\\b",
    "priority list",
    "list of cases",
    "fund transfer list",
    "compassionate",
    "affidavit",
    "nominated candidate",
    "pensioners? list",
    "voter list",
    "form 20",
    "waiting list",
    "select(?:ion)? list",
    "freedom fighter",
    "polling (?:staff|personnel)",
    "caste abhilekh",
  ].join("|"),
  "i",
);

const isPersonalRecord = (title) => PERSONAL_RECORD.test(title);

/* ------------------------------------------------------------ MR pairing -- */

/** Devanagari is what makes a "Marathi" post actually Marathi. */
const isMarathi = (value) => Boolean(value) && /[ऀ-ॿ]/.test(value);

/**
 * The Marathi twin of every row in a source, keyed by its attached PDF.
 *
 * Pune finds a record's Marathi twin by opening the record's own page and
 * following `hreflang="mr"`. Nagpur has no such page — the listing's "View"
 * link is the PDF itself, and site search does not index notices or documents,
 * so there is nothing to open. What Nagpur does have is a Marathi *listing*:
 * the category page carries `<link rel="alternate" hreflang="mr">`, and the
 * Marathi post set attaches the same file as the English one for 317 of the
 * acquisition archive's 323 rows.
 *
 * So the pairing is made on the attachment. That is a stronger key than a title
 * — a title can be republished in corrected form, a file cannot — and it costs
 * one request per page instead of three per record: the archive pairs in 33
 * requests where the Pune approach would have taken about 970.
 *
 * The rows that do not pair are the ones where the two language posts carry
 * separately uploaded PDFs. They are left as English and flagged
 * `needsTranslation`, which is what that flag is for.
 */
async function collectMarathi(source) {
  const { body } = await fetchText(`${SITE}${source.path}`, { refresh: options.refresh });
  const marathiBase = alternateLinks(body).mr;
  if (!marathiBase) {
    log(`  ${source.id}: no Marathi listing declared`);
    return { byPdf: new Map(), listingUrl: null };
  }

  const isDocument = source.kind === "document";
  const byPdf = new Map();

  for (let page = 1; page <= source.maxPages; page += 1) {
    const url = pageUrl(marathiBase, page);
    const { body: listing, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !listing) break;

    const rows = parseTable(listing).filter((cells) => cells.length >= (isDocument ? 3 : 5));
    if (rows.length === 0) break;

    for (const cells of rows) {
      const pdfUrl = cdnLinks(cells[isDocument ? 2 : 4])[0];
      if (!pdfUrl || byPdf.has(pdfUrl)) continue;

      const titleMr = text(cells[0]);
      // Some rows are filed under the Marathi post type but still titled in
      // English. Those are not translations, and taking them as such would hide
      // how much still needs translating.
      if (!isMarathi(titleMr)) continue;

      byPdf.set(pdfUrl, {
        titleMr,
        summaryMr: isDocument ? "" : text(cells[1]),
        detailUrlMr: url,
      });
    }
  }

  log(`  ${source.id}: ${byPdf.size} Marathi rows`);
  return { byPdf, listingUrl: marathiBase };
}

/* -------------------------------------------------------------- assembly -- */

/**
 * The kind of record this is, in the district's own words.
 *
 * Nagpur's archive has no description column to read a kind out of, and its
 * titles are recitals rather than labels — "Section 11(1) Notification in Land
 * Acquisition Act 2013, Case No. 5/A-65/2018-19 Mouza Mokhala". So the kind is
 * matched rather than parsed, and left null when the record does not announce
 * one. Order matters: a corrigendum to an award is a corrigendum.
 */
const NOTICE_TYPES = [
  [/\bcorrigend(?:um|a)|शुध्दीपत्रक/i, "Corrigendum"],
  [/\bextension\b.{0,30}\b(?:time|month)|\btime extension\b/i, "Extension of time"],
  [/\bfinal award\b/i, "Final award"],
  [/\bsupplementary award\b/i, "Supplementary award"],
  [/\baward\b/i, "Award"],
  [/\bdirect purchase\b|\bprivate negotiation\b/i, "Direct-purchase proposal"],
  [/\bdeclaration\b/i, "Declaration"],
  [/\bpublic notice\b/i, "Public notice"],
  [/\bnotification\b/i, "Notification"],
  [/\bnotice\b/i, "Notice"],
  [/\bproposal\b/i, "Proposal"],
  [/\border\b/i, "Order"],
  [/\btender\b|notice inviting/i, "Tender"],
  [/\brecruitment\b|\badvertisement\b/i, "Recruitment notice"],
];

function deriveNoticeType(haystack) {
  for (const [pattern, label] of NOTICE_TYPES) {
    if (pattern.test(haystack)) return label;
  }
  return null;
}

/**
 * Plain-language gloss for the section a land-acquisition notice cites.
 *
 * Nagpur cites the RFCTLARR Act 2013 throughout, and unlike Pune it writes the
 * subsection too — `11(1)`, `19(1)`, `21(1)(4)`, `37(1)`. The gloss is
 * deliberately descriptive rather than a legal citation — a reviewer should
 * confirm it against the attached PDF before anything is published as fact.
 */
const LAND_ACQUISITION_SECTIONS = {
  11: "a preliminary notification of intent to acquire land",
  19: "a declaration that the land is required",
  21: "a notice to interested persons ahead of the award",
  22: "a hearing of objections before the award",
  23: "an award determining compensation",
  37: "a final award, closing the acquisition",
};

/**
 * The RFCTLARR section a title cites, in any of the shapes Nagpur writes it.
 *
 * `Section II (1)` appears often enough to be worth matching: it is a typo for
 * `11(1)` that the site has never corrected, and reading it as a Roman numeral
 * is the only way those rows land on the right rung of the ladder.
 */
function citedSection(haystack) {
  const raw = haystack.match(
    /(?:section|sec|article|u\|s|u\/s)[-\s.]*(?:of[-\s]*)?(\d{1,2}|II)\b/i,
  )?.[1];
  const section = Number(raw === undefined ? NaN : /^II$/i.test(raw) ? 11 : raw);
  return LAND_ACQUISITION_SECTIONS[section] ? section : null;
}

/**
 * The English summary for a record whose place is known.
 *
 * Document rows have no description column at all, and the notice descriptions
 * repeat the title, so the summary is composed from the parts that were parsed
 * rather than copied from a field that says nothing new.
 */
function composeSummary({ place, project, section, agency }) {
  const where = [place.village, place.taluka && `${place.taluka} taluka`, "Nagpur district"]
    .filter(Boolean)
    .join(", ");

  const sentences = [];
  const gloss = LAND_ACQUISITION_SECTIONS[section];
  sentences.push(
    gloss
      ? `Section ${section} land-acquisition notification — ${gloss} — issued for land at ${where}.`
      : `Land-acquisition notice issued for land at ${where}.`,
  );
  if (project) sentences.push(`The land is being acquired for the ${project}.`);
  sentences.push(`Issued by ${agency}.`);

  return sentences.join(" ");
}

/**
 * The opening sentence, for use as a headline.
 *
 * Notices are full of abbreviations that a naive split treats as sentence ends
 * ("Th. Bhiwapur", "Dist. Nagpur", "क्र."), so fragments keep absorbing the next
 * piece until they carry enough to read as a title.
 *
 * Two details are load-bearing for the Marathi titles, which are what this
 * mostly sees:
 *
 * - **Devanagari digits are not sentence starts.** U+0966–U+096F sit inside the
 *   Devanagari block, so a lookahead for "a Devanagari letter" matches them and
 *   `क्र. ०२/अ-६५/२०१८-२०१९ मौजा वाठोडा…` breaks after `क्र.` — leaving the
 *   headline "कलम ११(१) अधिसूचना, भुसंपादन प्रकरण क्र." and dropping the village,
 *   the scheme and the case it refers to. The digits are excluded explicitly.
 * - **A break has to earn its place.** Forty characters of Marathi is a clause,
 *   not a headline, so a fragment keeps absorbing until it is long enough to
 *   stand alone; failing that the whole line is simply cut at `MAX`, which
 *   reads better than a confident-looking fragment.
 */
function leadSentence(value) {
  const MAX = 120;
  const MIN = 60;
  if (value.length <= MAX + 10) return value;

  let sentence = "";
  for (const part of value.split(/(?<=[.?!।])\s+(?=[A-Zऀ-॥॰-ॿ])/)) {
    sentence = sentence ? `${sentence} ${part}` : part;
    if (sentence.length >= MIN) break;
  }

  return sentence.length > MAX ? `${sentence.slice(0, MAX - 1).trimEnd()}…` : sentence;
}

/**
 * The English headline.
 *
 * A record whose place is known gets a composed headline, because the site's
 * own title is a case-number recital — "Section 11(1) Notification in Land
 * Acquisition Act 2013, Case No. 5/A-65/2018-19 Mouza Mokhala, Th. Bhiwapur,
 * District Nagpur" — that reads as noise. The lead says what the land is for
 * when the notice names a scheme and stays generic when it does not. Everything
 * else keeps the district's wording, trimmed.
 */
function buildTitle(row, place, project, isAcquisition) {
  if (!place.village && !place.taluka) return leadSentence(row.sourceTitle);

  const where = [place.village, place.taluka && `${place.taluka} taluka`]
    .filter(Boolean)
    .join(", ");

  if (!isAcquisition) return `${leadSentence(row.sourceTitle)} — ${where}`;

  const lead = project ? `Land acquisition for ${project}` : "Land acquisition notified";
  return `${lead} — ${where}`;
}

/**
 * The Marathi headline — the one that actually reaches a reader.
 *
 * Composed for the same reason the English one is, and in the same shape, since
 * the site's Marathi title is the same case-number recital in Devanagari:
 * `भूसंपादन प्रकरण क्रमांक 5/अ-65/2025-26 मौजा – चन्ना तालुका कुही जि. नागपूर मधील
 * प्रारंभिक अधिसुचना 11(1) चे प्रकाशन`. Trimmed to a card it keeps the case number
 * and loses the village, which is the one thing a reader is looking for.
 *
 * The shape is Amravati's — `भूसंपादन अधिसूचना — <गाव>, <तालुका> तालुका` — because
 * the two districts sit on the same map and a record from one should not read
 * as a different kind of thing from a record from the other. The scheme, where
 * the notice names one, is appended in brackets rather than folded into the
 * lead: `प्रकल्पासाठी` needs the oblique form of whatever noun precedes it, and
 * inflecting a scheme name by rule is how you end up with Marathi that no one
 * writes. A corrigendum is called one, since the site itself does.
 *
 * The whole thing is skipped when the Marathi text names no place at all — an
 * election gazette, a services ordinance — and those keep the district's own
 * wording, trimmed.
 */
function composeMarathiTitle({ text, place, project, isAcquisition, noticeType }) {
  if (!place.village && !place.taluka) return leadSentence(text);

  const where = [place.village, place.taluka && `${place.taluka} तालुका`]
    .filter(Boolean)
    .join(", ");

  if (!isAcquisition) return `${leadSentence(text)} — ${where}`;

  const lead = noticeType === "Corrigendum" ? "भूसंपादन शुध्दीपत्रक" : "भूसंपादन अधिसूचना";
  if (!project) return `${lead} — ${where}`;

  // The scheme goes in brackets, so a scheme that carries its own — `कन्हान नदी
  // प्रकल्प (कोच्छी बॅरेज)` — would nest a bracket inside a bracket. The
  // headline keeps the scheme's name and drops its qualifier; the full name is
  // still in `provenance.projectMr`.
  const named = project.replace(/\s*\(.*?\)\s*/g, " ").trim() || project;
  return `${lead} — ${where} (${named})`;
}

/**
 * Whether the record is a land-acquisition notice, which most of them are.
 *
 * The site's spelling of the word is not dependable — "Aquisition",
 * "Acquisiton" and "cquisition" all appear in current rows — so the stem is
 * matched loosely rather than listing the typos seen so far.
 */
const isAcquisition = (haystack) =>
  /\b(a[cr]?quis[it]{1,4}on|acquire|rfctlarr|land acq|resettelement|resettlement)\b/i.test(haystack);

function buildSignal(row, source, marathi, scrapedAt, location) {
  const descriptionBody = text(row.description);

  // Nagpur writes the substance into the title, so the title is the haystack —
  // for the place, the sector, the stage and the scheme alike.
  const haystack = [row.sourceTitle, descriptionBody, source.label].join(" ");
  const noticeType = deriveNoticeType(haystack);
  const place = parsePlaceFromTitle(`${row.sourceTitle} ${descriptionBody}`);

  const project = deriveProject(haystack);
  const agency = source.agency
    ? { agency: source.agency, basis: "keyword" }
    : deriveAgency(haystack, DEFAULT_AGENCY);
  const category = deriveCategory(haystack);
  const status = deriveStatus(haystack);

  const publishedAt = toIsoDate(row.startDate);
  if (!publishedAt) return null;

  const fingerprint = createHash("sha1")
    .update([source.id, row.sourceTitle, descriptionBody, row.startDate].join("|"))
    .digest("hex")
    .slice(0, 8);

  // Marathi is the display language. English still drives geocoding and
  // classification — Nominatim does not resolve Devanagari place names — and is
  // kept in `provenance` so a reviewer can check a record against its source.
  const acquisition = isAcquisition(haystack);
  const englishTitle = buildTitle(row, place, project, acquisition);
  const englishSummary =
    acquisition && (place.village || place.taluka)
      ? composeSummary({
          place,
          project,
          section: citedSection(haystack),
          agency: agency.agency,
        })
      : descriptionBody && descriptionBody.length >= 12
        ? descriptionBody
        : row.sourceTitle;

  const marathiText = marathi?.summaryMr || marathi?.titleMr || null;
  const marathiPlace = marathiText ? parseMarathiPlace(marathiText) : {};
  const marathiProject = deriveMarathiProject(marathiText);
  const title = marathiText
    ? composeMarathiTitle({
        text: marathiText,
        place: marathiPlace,
        project: marathiProject,
        isAcquisition: acquisition,
        noticeType,
      })
    : englishTitle;
  // The district's own Marathi sentence, kept whole: the headline above is
  // composed, so the summary is where the wording the notice actually used
  // still has to be readable.
  const summary = marathiText ?? englishSummary;
  const needsTranslation = !marathiText;

  return {
    id: `nag-${source.id}-${fingerprint}`,
    slug: `${slugify(title).slice(0, 70).replace(/-+$/, "")}-${fingerprint}`,
    title,
    summary,
    category: category.category,
    status: status.status,
    publishedAt,
    district: DISTRICT,
    taluka: place.taluka ?? undefined,
    locality: place.village ?? undefined,
    coordinates: [
      Number(location.coordinates[0].toFixed(6)),
      Number(location.coordinates[1].toFixed(6)),
    ],
    implementingAgency: agency.agency,
    evidenceLabel: row.pdfUrl ? `${noticeType ?? source.label} (PDF) — nagpur.gov.in` : undefined,
    evidenceUrl: row.pdfUrl ?? undefined,
    provenance: {
      sourceId: source.id,
      sourceLabel: source.label,
      sourceUrl: row.listingUrl,
      sourceTitle: row.sourceTitle,
      sourceDescription: descriptionBody,
      /** English readings of the same record, for review — not for display. */
      titleEn: englishTitle,
      summaryEn: englishSummary,
      noticeType: noticeType ?? undefined,
      project: project ?? undefined,
      projectMr: marathiProject ?? undefined,
      validUntil: toIsoDate(row.endDate) ?? undefined,
      // There is no per-record page on this site, so the listing the row was
      // read from is the closest thing to one. It is recorded as the Marathi
      // "detail" URL rather than left blank, because a reviewer following it
      // does land on the record — just alongside its neighbours.
      detailUrlMr: marathi?.detailUrlMr,
      scrapedAt,
    },
    confidence: {
      category: category.basis,
      status: status.basis,
      agency: agency.basis,
      location: location.precision,
      locationMatch: location.displayName,
    },
    needsTranslation,
    needsReview:
      needsTranslation ||
      category.basis === "default" ||
      status.basis === "default" ||
      location.precision === "district" ||
      // The notice named a village but the point only resolved to its taluka.
      (Boolean(place.village) && location.precision !== "village"),
  };
}

/* ------------------------------------------------------------ facilities -- */

/**
 * Public-utility pages, which Nagpur marks up differently from Pune.
 *
 * Pune's are `<h2 class="heading4">` followed by a single anchor holding name,
 * address and phone run together, which has to be pulled apart with string
 * surgery. Nagpur's are `<li class="box border">` blocks with an `<h2
 * class="heading3">` and a labelled list — `<strong>Phone :</strong>`,
 * `<strong>Pincode:</strong>` — so each field is read from its own label rather
 * than sliced out of a sentence.
 */
async function collectFacilities(scrapedAt) {
  const facilities = [];

  for (const source of UTILITY_SOURCES) {
    const url = `${SITE}${source.path}`;
    const { body, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !body) continue;

    const container = body.match(/<ul class="pub-ut-container[\s\S]*?<\/main>/i)?.[0] ?? body;
    // Split rather than match: each entry nests a `<ul class="pubutility-list">`
    // inside itself, so a lazy match up to a `</li>` stops at the *inner* list's
    // last item and silently loses the last field on every record — which is
    // where the pincode lives.
    const blocks = container.split(/<li class="box border">/i).slice(1);

    let found = 0;
    for (const block of blocks) {
      const name = text(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "");
      if (!name) continue;

      // The address is the one entry with no `<strong>` label on it: S3WaaS
      // renders it as a bare Google Maps link.
      const address = text(
        block.match(/<li>\s*<a[^>]*href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "",
      );
      const labelled = (label) =>
        text(
          block.match(
            new RegExp(String.raw`<strong>\s*${label}\s*:?\s*</strong>([\s\S]*?)</li>`, "i"),
          )?.[1] ?? "",
        ) || undefined;

      facilities.push({
        id: `nag-fac-${source.id}-${createHash("sha1")
          .update(name + address)
          .digest("hex")
          .slice(0, 8)}`,
        name,
        kind: source.id,
        kindLabel: source.label,
        address: address || undefined,
        phone: labelled("Phone"),
        // The site obfuscates addresses as `name[at]host[dot]com`; it is left
        // exactly as published rather than reassembled into a live address.
        email: labelled("Email"),
        // Only the hospitals list gives the pincode its own labelled field; the
        // post offices write it into the address instead — `Borgaon Road
        // Nagpur-440013` — so the address is read as a second source for it.
        pincode:
          labelled("Pincode")?.match(/\b(4\d{5})\b/)?.[1] ??
          address.match(/\b(4\d{5})\b/)?.[1],
        district: DISTRICT,
        provenance: { sourceUrl: url, sourceLabel: source.label, scrapedAt },
      });
      found += 1;
    }

    log(`  utilities ${source.id}: ${found}`);
  }

  return facilities;
}

/* ------------------------------------------------------------------ main -- */

/** Notices and documents, tagged with the table shape each one is read from. */
const ALL_SOURCES = [
  ...NOTICE_SOURCES.map((source) => ({ ...source, kind: "notice" })),
  ...DOCUMENT_SOURCES.map((source) => ({ ...source, kind: "document" })),
];

async function main() {
  const scrapedAt = new Date().toISOString();
  const sources = ALL_SOURCES.filter((source) => !options.only || options.only.includes(source.id));

  log(`sources: ${sources.map((source) => source.id).join(", ")}`);

  const signals = [];
  for (const source of sources) {
    const rows = await collectRows(source);
    log(`${source.id}: ${rows.length} records`);
    if (rows.length === 0) continue;

    const marathi = options.marathi ? await collectMarathi(source) : { byPdf: new Map() };

    for (const row of rows) {
      // Geocoding is the only per-record network call left, and it is skipped
      // outright when the place cannot be read — there is nothing to look up.
      const place = parsePlaceFromTitle(`${row.sourceTitle} ${text(row.description)}`);
      const location =
        options.geocode && (place.village || place.taluka)
          ? await geocodePlace(place)
          : {
              coordinates: DISTRICT_CENTROID,
              precision: "district",
              displayName: "Nagpur district",
            };

      const signal = buildSignal(
        row,
        source,
        row.pdfUrl ? marathi.byPdf.get(row.pdfUrl) : undefined,
        scrapedAt,
        location,
      );
      if (signal) signals.push(signal);
    }
  }

  signals.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const kept = options.limit ? signals.slice(0, options.limit) : signals;

  const invalid = [];
  const valid = [];
  for (const signal of kept) {
    const result = SignalSchema.safeParse(signal);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({
        id: signal.id,
        issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
    }
  }

  const facilities = options.facilities ? await collectFacilities(scrapedAt) : [];

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "signals.json"),
    `${JSON.stringify({ meta: buildMeta(scrapedAt, valid, sources), signals: valid }, null, 2)}\n`,
    "utf8",
  );
  if (options.facilities) {
    await writeFile(
      path.join(OUT_DIR, "facilities.json"),
      `${JSON.stringify(
        { meta: { scrapedAt, count: facilities.length, attribution: ATTRIBUTION }, facilities },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  await writeFile(path.join(OUT_DIR, "review.csv"), toReviewCsv(valid), "utf8");

  log(`signals: ${valid.length} valid, ${invalid.length} rejected`);
  log(`  needs review: ${valid.filter((signal) => signal.needsReview).length}`);
  log(
    `  village-precision: ${valid.filter((signal) => signal.confidence.location === "village").length}`,
  );
  log(`  Marathi text: ${valid.filter((signal) => !signal.needsTranslation).length}`);
  log(`  named a scheme: ${valid.filter((signal) => signal.provenance.project).length}`);
  if (options.facilities) log(`facilities: ${facilities.length}`);
  if (invalid.length) {
    log("rejected records:");
    for (const record of invalid) log(`  ${record.id}: ${record.issues.join("; ")}`);
  }
  log(`written to ${path.relative(process.cwd(), OUT_DIR)}`);
}

function buildMeta(scrapedAt, signals, sources) {
  const count = (key, value) => signals.filter((signal) => signal.confidence[key] === value).length;

  return {
    district: DISTRICT,
    language: "mr",
    scrapedAt,
    count: signals.length,
    sources: sources.map((source) => ({
      id: source.id,
      label: source.label,
      url: `${SITE}${source.path}`,
    })),
    attribution: ATTRIBUTION,
    quality: {
      needsReview: signals.filter((signal) => signal.needsReview).length,
      locationPrecision: {
        village: count("location", "village"),
        taluka: count("location", "taluka"),
        district: count("location", "district"),
      },
      derivedCategory: count("category", "keyword"),
      defaultedCategory: count("category", "default"),
      namedProject: signals.filter((signal) => signal.provenance.project).length,
      marathi: signals.filter((signal) => !signal.needsTranslation).length,
      awaitingTranslation: signals.filter((signal) => signal.needsTranslation).length,
    },
    caveats: [
      "Display text is Marathi, taken from the district site's own Marathi posts; English is kept in provenance for review only.",
      "The Marathi headline is composed from the place and scheme parsed out of the notice, because the site writes a case-number recital where a headline belongs; the notice's own wording is kept whole in `summary`.",
      "Coordinates are inferred from place names, not published by the district.",
      "Category and status are derived from notice wording; both need editorial confirmation.",
      "The scheme in `provenance.project` is stated by the notice, but which body builds it is not — the agency is the office that issued the notice unless one is named.",
      "Nagpur publishes no per-record page, so `provenance.detailUrlMr` is the Marathi listing the twin was read from, not a page about the record.",
      "The acquisition archive holds every stage of a case, so one project can appear several times at different sections of the Act.",
    ],
  };
}

function toReviewCsv(signals) {
  const columns = [
    "id",
    "publishedAt",
    "status",
    "category",
    "taluka",
    "locality",
    "project",
    "locationPrecision",
    "needsReview",
    "needsTranslation",
    "title",
    "titleEn",
    "implementingAgency",
    "evidenceUrl",
  ];
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = signals.map((signal) =>
    [
      signal.id,
      signal.publishedAt,
      signal.status,
      signal.category,
      signal.taluka,
      signal.locality,
      signal.provenance.project,
      signal.confidence.location,
      signal.needsReview,
      signal.needsTranslation,
      signal.title,
      signal.provenance.titleEn,
      signal.implementingAgency,
      signal.evidenceUrl,
    ]
      .map(cell)
      .join(","),
  );

  return `${[columns.join(","), ...rows].join("\n")}\n`;
}

function parseArgs(argv) {
  const has = (flag) => argv.includes(flag);
  const value = (name) => argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];

  return {
    refresh: has("--refresh"),
    marathi: !has("--no-marathi"),
    geocode: !has("--no-geocode"),
    facilities: !has("--no-facilities"),
    limit: value("--limit") ? Number(value("--limit")) : null,
    only:
      value("--only")
        ?.split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? null,
  };
}

await main();
