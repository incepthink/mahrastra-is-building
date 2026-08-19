/**
 * Scrapes development signals for the Amravati pilot district.
 *
 * Run: `node scripts/scrape-amravati.mjs [options]`
 *
 *   --refresh          ignore the HTTP cache and re-fetch every page
 *   --limit=<n>        keep at most n signals (newest first) — handy for a POC cut
 *   --only=<id,id>     restrict to some notice sources (see sources.mjs)
 *   --no-marathi       skip the EN↔MR pairing pass (two fewer requests per record)
 *   --no-geocode       skip Nominatim; every record lands on the district centroid
 *   --no-facilities    skip the public-utilities layer
 *
 * Writes to public/data/amravati/: signals.json, facilities.json, review.csv.
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
import { deriveAgency, deriveCategory, deriveStatus, parsePlaceFromTitle } from "./lib/classify.mjs";
import { DISTRICT_CENTROID, geocodePlace } from "./lib/geocode.mjs";
import {
  ATTRIBUTION,
  DEFAULT_AGENCY,
  DISTRICT,
  NOTICE_SOURCES,
  SITE,
  UTILITY_SOURCES,
} from "./sources.mjs";

const OUT_DIR = path.resolve("public/data/amravati");

const options = parseArgs(process.argv.slice(2));
const log = (...args) => console.log("[amravati]", ...args);

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
  coordinates: z.tuple([z.number().min(76).max(79), z.number().min(20).max(22)]),
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
    validUntil: z.string().optional(),
    detailUrl: z.string().url().optional(),
    detailUrlMr: z.string().url().optional(),
    scrapedAt: z.string(),
  }),
  confidence: z.object({
    category: z.enum(["keyword", "default"]),
    status: z.enum(["keyword", "default"]),
    agency: z.enum(["stated", "default"]),
    /** How precisely the point is known — never better than the source allows. */
    location: z.enum(["village", "taluka", "district"]),
    locationMatch: z.string().optional(),
  }),
  needsTranslation: z.boolean(),
  needsReview: z.boolean(),
});

/* ------------------------------------------------------------- collection -- */

/** Walks a paginated S3WaaS listing table until a page comes back empty. */
async function collectNoticeRows(source) {
  const rows = [];

  for (let page = 1; page <= source.maxPages; page += 1) {
    const url = page === 1 ? `${SITE}${source.path}` : `${SITE}${source.path}page/${page}/`;
    const { body, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !body) break;

    const parsed = parseTable(body)
      .filter((cells) => cells.length >= 5)
      .map((cells) => ({
        sourceTitle: text(cells[0]),
        description: cells[1],
        startDate: text(cells[2]),
        endDate: text(cells[3]),
        pdfUrl: cdnLinks(cells[4])[0] ?? null,
        listingUrl: url,
      }))
      .filter((row) => row.sourceTitle);

    if (parsed.length === 0) break;
    rows.push(...parsed);
    log(`  ${source.id} page ${page}: ${parsed.length} rows`);
  }

  // The same notice can sit in more than one category listing.
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.pdfUrl ?? `${row.sourceTitle}|${row.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------ MR pairing -- */

/**
 * Finds a notice's own page so its `hreflang="mr"` twin can be read.
 *
 * The listing table does not link to detail pages, so the permalink is guessed
 * from the title first (WordPress slugifies it the same way) and confirmed by
 * matching the attached PDF — several notices share a title, and only the
 * attachment tells them apart. Site search is the fallback.
 */
async function findDetailPage(row, descriptionBody) {
  const candidates = [`${SITE}/en/notice/${slugify(row.sourceTitle)}/`];

  // The description discriminates, the title often does not: dozens of notices
  // share the title "Collector Office, Camp Road, Amravati", so searching on it
  // buries the right post. Searching the notice's own wording pinpoints it.
  const queries = [descriptionBody, row.sourceTitle]
    .filter((value) => value && value.trim().length > 8)
    .map((value) => value.split(/\s+/).slice(0, 10).join(" "));

  for (const query of queries) {
    const { body } = await fetchText(`${SITE}/en/?s=${encodeURIComponent(query)}`, {
      refresh: options.refresh,
    });
    for (const match of body.matchAll(/href="(https:\/\/amravati\.gov\.in\/en\/notice\/[^"]+)"/g)) {
      if (!candidates.includes(match[1])) candidates.push(match[1]);
    }
    if (candidates.length > 1) break;
  }

  for (const url of candidates.slice(0, 8)) {
    const { body, status } = await fetchText(url, { refresh: options.refresh });
    if (status === 404 || !body) continue;
    if (row.pdfUrl && cdnLinks(body).includes(row.pdfUrl)) return { url, body };
  }

  return null;
}

async function resolveMarathi(row, descriptionBody) {
  const detail = await findDetailPage(row, descriptionBody);
  if (!detail) return {};

  const marathiUrl = alternateLinks(detail.body).mr;
  if (!marathiUrl) return { detailUrl: detail.url };

  const { body, status } = await fetchText(marathiUrl, { refresh: options.refresh });
  if (status === 404 || !body) return { detailUrl: detail.url, detailUrlMr: marathiUrl };

  const cells = parseTable(body).find((candidate) => candidate.length >= 5);
  return {
    detailUrl: detail.url,
    detailUrlMr: marathiUrl,
    titleMr: heading(body) || undefined,
    summaryMr: cells ? stripNoticeLabel(text(cells[1])).body || undefined : undefined,
  };
}

/* -------------------------------------------------------------- assembly -- */

/** S3WaaS descriptions open with a bolded kind — "Order-", "Public Notice-". */
function stripNoticeLabel(value) {
  const match = value.match(/^([A-Za-zऀ-ॿ][^\-–:]{2,40})\s*[-–:]\s*(.+)$/s);
  if (!match) return { label: null, body: value };
  return { label: match[1].trim(), body: match[2].trim() };
}

/**
 * Plain-language gloss for the section a land-acquisition notice cites.
 *
 * The numbering is the one used by current Maharashtra acquisition cases: a
 * section 11 notification opens the process, section 19 declares the land is
 * required, and section 23 settles compensation. The gloss is deliberately
 * descriptive rather than a legal citation — a reviewer should confirm it
 * against the attached PDF before anything is published as fact.
 */
const LAND_ACQUISITION_SECTIONS = {
  11: "a preliminary notification of intent to acquire land",
  19: "a declaration that the land is required",
  21: "a notice to interested persons ahead of the award",
  23: "an award determining compensation",
};

/**
 * Land-acquisition rows carry their substance in the title, not the
 * description, so the English summary is composed from the parsed parts. The
 * Marathi source writes the same sentence out in full.
 */
function composeLandAcquisitionSummary(place, descriptionBody) {
  const where = [place.village, place.taluka && `${place.taluka} taluka`, "Amravati district"]
    .filter(Boolean)
    .join(", ");

  const section = Number(descriptionBody.match(/section[-\s]*(\d+)/i)?.[1]);
  const gloss = LAND_ACQUISITION_SECTIONS[section];

  const opening = gloss
    ? `Section ${section} land-acquisition notification — ${gloss} — issued for land at ${where}.`
    : `Land-acquisition notification issued for land at ${where}.`;

  const caseNumber = descriptionBody.match(/LAC No[-\s.]*([\d/–-]+)/i)?.[1];
  return caseNumber ? `${opening} Land acquisition case ${caseNumber}.` : opening;
}

/** Removes the village and taluka names so they cannot trigger a category rule. */
function withoutPlaceNames(haystack, place) {
  return [place.village, place.taluka].filter(Boolean).reduce(
    (text_, name) =>
      text_.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " "),
    haystack,
  );
}

/**
 * The village and taluka out of a Marathi land-acquisition title, which reads
 * `मौजा- हिवरा बु., तालुका- नांदगाव खंडेश्वर`.
 */
function parseMarathiPlace(titleMr) {
  if (!titleMr) return {};
  const village = titleMr.match(/मौजा\s*[-–:]\s*([^,;]+)/)?.[1]?.trim();
  const taluka = titleMr.match(/तालुका\s*[-–:]\s*([^,;]+)/)?.[1]?.trim();
  return { village: village || undefined, taluka: taluka || undefined };
}

/**
 * Marathi headline for a land-acquisition record.
 *
 * The site's own Marathi title is a revenue-file place line rather than a
 * headline, so it is recomposed the way the English one is.
 */
function composeMarathiTitle(titleMr) {
  const { village, taluka } = parseMarathiPlace(titleMr);
  if (!village) return titleMr;
  const where = taluka ? `${village}, ${taluka} तालुका` : village;
  return `भूसंपादन अधिसूचना — ${where}`;
}

function buildTitle(row, place, noticeLabel, descriptionBody, isLandAcquisition) {
  if (place.village) {
    const where = place.taluka ? `${place.village}, ${place.taluka} taluka` : place.village;
    // Land-acquisition rows always read as an acquisition, whatever label the
    // description happens to open with ("LAC No", "Notification", …).
    const lead = isLandAcquisition ? "Land acquisition notified" : (noticeLabel ?? "Notice");
    return `${lead} — ${where}`;
  }

  if (descriptionBody) {
    const candidate = leadSentence(descriptionBody);
    if (candidate.length >= 12) return candidate;
  }

  return row.sourceTitle;
}

/**
 * The opening sentence, for use as a headline.
 *
 * Notices are full of abbreviations that a naive split treats as sentence ends
 * ("S. No. 31", "Dr. Ambedkar"), so fragments keep absorbing the next piece
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

async function buildSignal(row, source, scrapedAt) {
  const { label: noticeLabel, body: descriptionBody } = stripNoticeLabel(text(row.description));
  const place = source.placeInTitle
    ? parsePlaceFromTitle(row.sourceTitle)
    : parsePlaceFromTitle(`${row.sourceTitle} ${descriptionBody}`);

  const agency = source.agency
    ? { agency: source.agency, basis: "stated" }
    : deriveAgency(row.sourceTitle, DEFAULT_AGENCY);

  // What the notice is about classifies it — never where the issuing office
  // happens to sit. The title column is usually that office ("… Camp Road,
  // Amravati"), so it only joins the haystack when it holds content instead.
  // Place names are stripped too: several talukas are named "… Railway".
  const haystack = withoutPlaceNames(
    [agency.basis === "stated" ? "" : row.sourceTitle, descriptionBody, source.label].join(" "),
    place,
  );
  const category = deriveCategory(haystack);
  const status = deriveStatus(haystack);

  const location = options.geocode
    ? await geocodePlace(place)
    : { coordinates: DISTRICT_CENTROID, precision: "district", displayName: "Amravati district" };

  const publishedAt = toIsoDate(row.startDate);
  if (!publishedAt) return null;

  const fingerprint = createHash("sha1")
    .update([source.id, row.sourceTitle, descriptionBody, row.startDate].join("|"))
    .digest("hex")
    .slice(0, 8);

  const marathi = options.marathi ? await resolveMarathi(row, descriptionBody) : {};

  // Marathi is the display language. English still drives geocoding and
  // classification — Nominatim does not resolve Devanagari place names — and is
  // kept in `provenance` so a reviewer can check a record against its source.
  const englishTitle = buildTitle(row, place, noticeLabel, descriptionBody, source.placeInTitle);
  const englishSummary =
    source.placeInTitle && place.village
      ? composeLandAcquisitionSummary(place, descriptionBody)
      : descriptionBody && descriptionBody.length >= 12
        ? descriptionBody
        : `${noticeLabel ?? "Notice"} issued by ${agency.agency}.`;

  const title = marathi.titleMr
    ? source.placeInTitle
      ? composeMarathiTitle(marathi.titleMr)
      : leadSentence(marathi.summaryMr ?? marathi.titleMr)
    : englishTitle;

  const summary = marathi.summaryMr ?? marathi.titleMr ?? englishSummary;
  const needsTranslation = !marathi.titleMr;

  return {
    id: `amv-${source.id}-${fingerprint}`,
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
    evidenceLabel: row.pdfUrl ? `${noticeLabel ?? "Notice"} (PDF) — amravati.gov.in` : undefined,
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
      noticeType: noticeLabel ?? undefined,
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
        id: `amv-fac-${source.id}-${createHash("sha1")
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

async function main() {
  const scrapedAt = new Date().toISOString();
  const sources = NOTICE_SOURCES.filter(
    (source) => !options.only || options.only.includes(source.id),
  );

  log(`sources: ${sources.map((source) => source.id).join(", ")}`);

  const signals = [];
  for (const source of sources) {
    const rows = await collectNoticeRows(source);
    log(`${source.id}: ${rows.length} notices`);
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
      marathi: signals.filter((signal) => !signal.needsTranslation).length,
      awaitingTranslation: signals.filter((signal) => signal.needsTranslation).length,
    },
    caveats: [
      "Display text is Marathi, taken from the district site's own Marathi posts; English is kept in provenance for review only.",
      "Coordinates are inferred from place names, not published by the district administration.",
      "Category and status are derived from notice wording; both need editorial confirmation.",
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
