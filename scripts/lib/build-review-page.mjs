/**
 * Builds a standalone signal-review page from a scraped dataset.
 *
 * The page is a review instrument, not a product surface: it exists so the
 * derived fields can be judged before any of this reaches the map. The record
 * shape is flattened here so the template stays free of provenance plumbing,
 * and everything district-specific — the name, the source link, the caveats —
 * is read from the dataset's own `meta` rather than written into the template.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "review-page.template.html");

/** Builds the page for one district. `district` is the folder under public/data. */
export async function buildReviewPage(district, output) {
  const dataDir = path.resolve("public/data", district);
  const outputPath = output ?? path.join(dataDir, "review.html");

  const [{ meta, signals }, template] = await Promise.all([
    readFile(path.join(dataDir, "signals.json"), "utf8").then(JSON.parse),
    readFile(TEMPLATE, "utf8"),
  ]);

  const flattened = signals.map((signal) => ({
    id: signal.id,
    title: signal.title,
    summary: signal.summary,
    category: signal.category,
    status: signal.status,
    publishedAt: signal.publishedAt,
    taluka: signal.taluka ?? null,
    locality: signal.locality ?? null,
    coordinates: signal.coordinates,
    agency: signal.implementingAgency,
    evidenceUrl: signal.evidenceUrl ?? null,
    needsReview: signal.needsReview,
    needsTranslation: signal.needsTranslation,
    precision: signal.confidence.location,
    locationMatch: signal.confidence.locationMatch ?? null,
    categoryBasis: signal.confidence.category,
    statusBasis: signal.confidence.status,
    source: signal.provenance.sourceId,
    sourceTitle: signal.provenance.sourceTitle,
    titleEn: signal.provenance.titleEn,
    summaryEn: signal.provenance.summaryEn,
    noticeType: signal.provenance.noticeType ?? null,
    project: signal.provenance.project ?? null,
    validUntil: signal.provenance.validUntil ?? null,
    detailUrl: signal.provenance.detailUrl ?? null,
    detailUrlMr: signal.provenance.detailUrlMr ?? null,
  }));

  const payload = JSON.stringify({ meta, signals: flattened })
    // Keep the JSON from terminating the surrounding <script> element.
    .replace(/</g, "\\u003c");

  if (!template.includes("/*__DATA__*/")) {
    throw new Error("Template is missing its /*__DATA__*/ placeholder.");
  }

  await writeFile(
    outputPath,
    template.replaceAll("__DISTRICT__", meta.district).replace("/*__DATA__*/ null", payload),
    "utf8",
  );

  console.log(`[review-page] ${flattened.length} signals → ${path.relative(process.cwd(), outputPath)}`);
}
