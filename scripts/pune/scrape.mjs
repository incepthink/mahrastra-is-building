/**
 * Scrapes development signals for Pune district.
 *
 * Run: `node scripts/scrape-pune.mjs [options]`
 *
 *   --refresh          ignore the HTTP cache and re-fetch every page
 *   --limit=<n>        keep at most n signals (newest first) — handy for a POC cut
 *   --only=<id,id>     restrict to some sources (see sources.mjs)
 *   --no-marathi       skip the EN↔MR pairing pass (two fewer requests per record)
 *   --no-geocode       skip Nominatim; every record lands on the district centroid
 *   --no-facilities    skip the public-utilities layer
 *
 * Writes to public/data/pune/: signals.json, facilities.json, review.csv.
 *
 * The Amravati scraper is the sibling of this one and the two read the same
 * S3WaaS platform, but Pune's site differs in three ways that shape the code
 * below: its notice *title* carries the substance rather than the issuing
 * office, its acquisition record is split between notices and a separate
 * documents archive with a three-column table, and it names the scheme the land
 * is for — a road, a highway, a dam — which is worth keeping.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { fetchText } from "../lib/http.mjs";
import {
  alternateLinks,
  cdnLinks,
  heading,
  parseTable,
  slugify,
  text,
  toIsoDate,
} from "../lib/html.mjs";
import {
  deriveAgency,
  deriveCategory,
  deriveProject,
  deriveStatus,
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

const OUT_DIR = path.resolve("public/data/pune");

const options = parseArgs(process.argv.slice(2));
const log = (...args) => console.log("[pune]", ...args);

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
  coordinates: z.tuple([z.number().min(73.3).max(75.2), z.number().min(17.8).max(19.4)]),
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
  const rows = [];

  for (let page = 1; page <= source.maxPages; page += 1) {
    const url = page === 1 ? `${SITE}${source.path}` : `${SITE}${source.path}page/${page}/`;
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

  // The same record can sit in more than one listing.
  const seen = new Set();
  const unique = rows.filter((row) => {
    const key = row.pdfUrl ?? `${row.sourceTitle}|${row.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
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
 * information, and these listings do not honour that boundary on their own: the
 * land-acquisition awards archive carries nine SDRF grant beneficiary and
 * farmer lists alongside the awards. They are dropped at the row, not the
 * source, because no category on this site is reliably free of them.
 */
const PERSONAL_RECORD = new RegExp(
  [
    "beneficiar",
    "farmer list",
    "senior[io]ty list",
    "affidavit",
    "nominated candidate",
    "pensioners? list",
    "voter list",
    "form 20",
    "waiting list",
    "selection list",
  ].join("|"),
  "i",
);

const isPersonalRecord = (title) => PERSONAL_RECORD.test(title);

/* ------------------------------------------------------------ MR pairing -- */

/**
 * Finds a record's own page so its `hreflang="mr"` twin can be read.
 *
 * The listing tables do not link to detail pages, so the permalink is guessed
 * from the title first (WordPress slugifies it the same way) and confirmed by
 * matching the attached PDF — a title alone is not proof, since the site
 * republishes corrected versions of the same notice. Site search is the
 * fallback. `/notice_category/…` and `/document-category/…` in Marathi are
 * different slugs that redirect back to English, so the detail page is the only
 * way across.
 */
async function findDetailPage(row, source) {
  const postType = source.kind === "document" ? "document" : "notice";
  const candidates = [`${SITE}/en/${postType}/${slugify(row.sourceTitle)}/`];

  // Pune's titles are long and distinctive, so the title is the good query
  // here — unlike Amravati, where dozens of notices share one.
  const query = row.sourceTitle.split(/\s+/).slice(0, 12).join(" ");
  const { body } = await fetchText(`${SITE}/en/?s=${encodeURIComponent(query)}`, {
    refresh: options.refresh,
  });
  const pattern = new RegExp(`href="(https://pune\\.gov\\.in/en/${postType}/[^"]+)"`, "g");
  for (const match of body.matchAll(pattern)) {
    if (!candidates.includes(match[1])) candidates.push(match[1]);
  }

  for (const url of candidates.slice(0, 6)) {
    const { body: page, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !page) continue;
    if (row.pdfUrl && cdnLinks(page).includes(row.pdfUrl)) return { url, body: page };
  }

  return null;
}

/** Devanagari is what makes a "Marathi" post actually Marathi. */
const isMarathi = (value) => Boolean(value) && /[ऀ-ॿ]/.test(value);

async function resolveMarathi(row, source) {
  const detail = await findDetailPage(row, source);
  if (!detail) return {};

  const marathiUrl = alternateLinks(detail.body).mr;
  if (!marathiUrl) return { detailUrl: detail.url };

  const { body, status } = await fetchText(marathiUrl, { refresh: options.refresh });
  if (status === 404 || !body) return { detailUrl: detail.url, detailUrlMr: marathiUrl };

  const cells = parseTable(body).find((candidate) => candidate.length >= 2);
  const titleMr = heading(body);
  // Several records — the Ring Road awards especially — are filed under the
  // Marathi post type but titled in English. Those are not translations, and
  // taking them as such would hide how much still needs translating.
  const summaryMr = cells ? text(cells[source.kind === "document" ? 0 : 1]) : "";

  return {
    detailUrl: detail.url,
    detailUrlMr: marathiUrl,
    titleMr: isMarathi(titleMr) ? titleMr : undefined,
    summaryMr: isMarathi(summaryMr) ? summaryMr : undefined,
  };
}

/* -------------------------------------------------------------- assembly -- */

/**
 * The kind of record this is, in the district's own words.
 *
 * Amravati's descriptions open with a bolded kind that can simply be split off
 * ("Order-", "Public Notice-"); Pune's repeat the title, so splitting on the
 * first dash yields a fragment like "LA" or "Notification under section". The
 * kind is therefore matched rather than parsed, and left null when the record
 * does not announce one.
 */
const NOTICE_TYPES = [
  [/\bcorrigend(?:um|a)\b/i, "Corrigendum"],
  [/\bsupplementary award\b/i, "Supplementary award"],
  [/\bfinal award\b/i, "Final award"],
  [/\baward\b/i, "Award"],
  [/\bdeclaration\b/i, "Declaration"],
  [/\bpublic notice\b/i, "Public notice"],
  [/\bnotification\b/i, "Notification"],
  [/\bnotice\b/i, "Notice"],
  [/\border\b/i, "Order"],
  [/\btender\b|notice inviting/i, "Tender"],
  [/\brecruitment\b/i, "Recruitment notice"],
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
 * Pune cites the RFCTLARR Act 2013 throughout. The gloss is deliberately
 * descriptive rather than a legal citation — a reviewer should confirm it
 * against the attached PDF before anything is published as fact.
 */
const LAND_ACQUISITION_SECTIONS = {
  11: "a preliminary notification of intent to acquire land",
  19: "a declaration that the land is required",
  21: "a notice to interested persons ahead of the award",
  22: "a hearing of objections before the award",
  23: "an award determining compensation",
};

/** The RFCTLARR section a title cites, in any of the shapes Pune writes it. */
function citedSection(haystack) {
  const section = Number(
    haystack.match(/(?:section|sec|article|u\/s)[-\s.]*(?:of[-\s]*)?(\d{1,2})/i)?.[1],
  );
  return LAND_ACQUISITION_SECTIONS[section] ? section : null;
}

/**
 * The English summary for a record whose place is known.
 *
 * Document rows have no description column at all, and notice descriptions
 * repeat the title, so the summary is composed from the parts that were parsed
 * rather than copied from a field that says nothing new.
 */
function composeSummary({ place, project, section, agency }) {
  const where = [place.village, place.taluka && `${place.taluka} taluka`, "Pune district"]
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
 * ("S. No. 31", "Gat No. 137"), so fragments keep absorbing the next piece
 * until they carry enough to read as a title.
 */
function leadSentence(value) {
  const MAX = 120;
  if (value.length <= MAX + 10) return value;

  let sentence = "";
  for (const part of value.split(/(?<=[.?!])\s+(?=[A-Zऀ-ॿ])/)) {
    sentence = sentence ? `${sentence} ${part}` : part;
    if (sentence.length >= 40) break;
  }

  return sentence.length > MAX ? `${sentence.slice(0, MAX - 1).trimEnd()}…` : sentence;
}

/**
 * The English headline.
 *
 * A record whose place is known gets a composed headline, because the site's
 * own title is a survey-number recital — "Gat No./Survey No. 40/2/A, area
 * 00.34.10 Ha.are." — that reads as noise. The lead says what the land is for
 * when the notice names a scheme and stays generic when it does not; the
 * notice's own label is not used, because Pune's description column repeats the
 * title and the label parsed out of it is a fragment rather than a kind.
 * Everything else keeps the district's wording, trimmed.
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
 * Whether the record is a land-acquisition notice, which most of them are.
 *
 * The site's spelling of the word is not dependable — "Arquisition",
 * "Aquisition" and "Acquisiton" all appear in current notices — so the stem is
 * matched loosely rather than listing the typos seen so far.
 */
const isAcquisition = (haystack) =>
  /\b(a[cr]?quis[it]{1,4}on|acquire|rfctlarr|land acq)\b/i.test(haystack);

async function buildSignal(row, source, scrapedAt) {
  const descriptionBody = text(row.description);

  // Pune writes the substance into the title, so the title is the haystack —
  // for the place, the sector, the stage and the scheme alike.
  const haystack = [row.sourceTitle, descriptionBody, source.label].join(" ");
  const noticeType = deriveNoticeType(haystack);
  // The source label is not part of what the place is read from: appending
  // "Collectorate documents" to "… – Taluka Khed" made the taluka read as
  // "Khed Collectorate".
  const place = parsePlaceFromTitle(
    source.placeInTitle ? row.sourceTitle : `${row.sourceTitle} ${descriptionBody}`,
  );

  const project = place.project ?? deriveProject(haystack);
  const agency = source.agency
    ? { agency: source.agency, basis: "keyword" }
    : deriveAgency(haystack, DEFAULT_AGENCY);
  const category = deriveCategory(haystack);
  const status = deriveStatus(haystack);

  const location = options.geocode
    ? await geocodePlace(place)
    : { coordinates: DISTRICT_CENTROID, precision: "district", displayName: "Pune district" };

  const publishedAt = toIsoDate(row.startDate);
  if (!publishedAt) return null;

  const fingerprint = createHash("sha1")
    .update([source.id, row.sourceTitle, descriptionBody, row.startDate].join("|"))
    .digest("hex")
    .slice(0, 8);

  const marathi = options.marathi ? await resolveMarathi(row, source) : {};

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

  const marathiText = marathi.summaryMr ?? marathi.titleMr;
  const title = marathiText ? leadSentence(marathiText) : englishTitle;
  const summary = marathiText ?? englishSummary;
  const needsTranslation = !marathiText;

  return {
    id: `pun-${source.id}-${fingerprint}`,
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
    evidenceLabel: row.pdfUrl ? `${noticeType ?? source.label} (PDF) — pune.gov.in` : undefined,
    evidenceUrl: row.pdfUrl ?? undefined,
    provenance: {
      sourceId: source.id,
      sourceLabel: source.label,
      sourceUrl: row.listingUrl,
      sourceTitle: row.sourceTitle,
      sourceDescription: text(row.description),
      /** English readings of the same record, for review — not for display. */
      titleEn: englishTitle,
      summaryEn: englishSummary,
      noticeType: noticeType ?? undefined,
      project: project ?? undefined,
      validUntil: toIsoDate(row.endDate) ?? undefined,
      detailUrl: marathi.detailUrl,
      detailUrlMr: marathi.detailUrlMr,
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

/** Public-utility pages are `<h2>name</h2>` followed by an address list item. */
async function collectFacilities(scrapedAt) {
  const facilities = [];

  for (const source of UTILITY_SOURCES) {
    const url = `${SITE}${source.path}`;
    const { body, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !body) continue;

    const container = body.match(/<ul class="pub-ut-container[\s\S]*?<\/main>/i)?.[0] ?? body;
    const entries = [
      ...container.matchAll(
        /<h2[^>]*class="heading4"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*class="heading4"|<\/main>)/gi,
      ),
    ];

    for (const [, nameHtml, blockHtml] of entries) {
      const name = text(nameHtml);
      if (!name) continue;

      const detail = text(blockHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
      // The anchor repeats the name and appends the phone number; both are
      // carried in their own fields, so the address keeps neither.
      const address = (detail.startsWith(name) ? detail.slice(name.length) : detail)
        .replace(/(?:Phone|Ph|Tel)[:.\s]*[0-9()+\-\s]{8,}.*$/i, "")
        .replace(/^[,\s]+|[,\s]+$/g, "");

      facilities.push({
        id: `pun-fac-${source.id}-${createHash("sha1")
          .update(name + address)
          .digest("hex")
          .slice(0, 8)}`,
        name,
        kind: source.id,
        kindLabel: source.label,
        address: address.replace(/^[,\s]+/, "") || undefined,
        phone: detail.match(/(?:Phone|Ph|Tel)[:.\s]*([0-9()+\-\s]{8,})/i)?.[1]?.trim(),
        pincode: detail.match(/\b(4\d{5})\b/)?.[1],
        district: DISTRICT,
        provenance: { sourceUrl: url, sourceLabel: source.label, scrapedAt },
      });
    }

    log(`  utilities ${source.id}: ${entries.length}`);
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
    for (const row of rows) {
      const signal = await buildSignal(row, source, scrapedAt);
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
      "Coordinates are inferred from place names, not published by the district.",
      "Category and status are derived from notice wording; both need editorial confirmation.",
      "The scheme in `provenance.project` is stated by the notice, but which body builds it is not — the agency is the office that issued the notice unless one is named.",
      "Notice listings expire on the district site, so this is a current-notices snapshot, not a full archive.",
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
