/**
 * Renders a printable sheet for a DGIPR release:
 *
 *   public/dgipr/pdfs/<id>.pdf
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS NOT `pull.mjs`.
 *
 * The five curated releases carry a PDF because the sibling repo hand-made one
 * for each. The 136 live releases carry none, and never will: mahasamvad.in
 * publishes WordPress posts, not documents, so `pull-mahasamvad.mjs` writes
 * `pdfUrl: null` and is right to. That is a gap in the *source*, not a gap in
 * the importer — which means the only way to close it is to make the document
 * here, out of the text we already hold.
 *
 * So this is a renderer and not a fetcher. It reads `dgipr-releases.json`,
 * which is the same text the panel prints, and lays it out on A4. Nothing is
 * written, summarised, translated or reordered on the way through; a wording
 * fix lands in the snapshot and reaches the PDF by re-running this.
 *
 * WHAT THE SHEET CLAIMS TO BE.
 *
 * Deliberately: a reprint, and it says so at the foot. The masthead names the
 * directorate because the directorate wrote the words, and the footer names
 * महासंवाद, the permalink and the import date because this file was not issued
 * by anybody's government. Both halves are needed. A sheet that dropped the
 * masthead would misattribute the text; a sheet that stopped there would be a
 * government notice with our page furniture on it, which is a different and
 * worse thing to hand somebody. See the footer block in `sheet()`.
 *
 * Printing the release in full is the same act the panel already performs, and
 * `DgiprPanel` argues for it at length: a DGIPR release is public-information
 * output issued in order to be carried, already published whole on
 * mahasamvad.in. That argument covers a PDF exactly as it covers the panel.
 * ---------------------------------------------------------------------------
 *
 *   node scripts/dgipr/make-pdfs.mjs                    # Pune's four
 *   node scripts/dgipr/make-pdfs.mjs --district=nanded
 *   node scripts/dgipr/make-pdfs.mjs --only=ms-213394,ms-213391
 *   node scripts/dgipr/make-pdfs.mjs --all
 *   node scripts/dgipr/make-pdfs.mjs --no-write         # print, don't touch the snapshot
 *
 * `make-docx.mjs` writes the editable twin of this sheet and takes the same
 * flags; the vocabulary and dates they share live in `release.mjs`.
 *
 * Unlike the sibling repo's `gen:pdfs`, this needs no dev server: the sheet is
 * built here and loaded straight into the page. There is no `/print` route to
 * keep in sync, which is the right trade while the only consumer is a script —
 * if a browsable preview is ever wanted, this template is what it should serve.
 */
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import {
  MR,
  ROOT,
  datelineMr,
  formatDateMr,
  metaRows,
  paragraphs,
  parseArgs,
  readSnapshot,
  relative,
  select,
  toDevanagari,
  writeUrls,
} from "./release.mjs";

const OUT_DIR = path.join(ROOT, "public", "dgipr", "pdfs");

/** What `pdfUrl` gets set to — a path under `public/`, the way `posterUrl`
 *  already is for the curated rows, so the app serves it and no origin is
 *  baked into the data. */
const URL_PREFIX = "/dgipr/pdfs";

const { only, district, write } = parseArgs();

/* ------------------------------------------------------------------ sheet */

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function sheet(release, pulledAt) {
  const dateline = datelineMr(release);
  const meta = metaRows(release);

  const body = paragraphs(release.summaryMr)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join("\n      ");

  const metaBlock =
    meta.length > 0
      ? `<dl class="meta">
    ${meta
      .map(
        ([label, value]) =>
          `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
      )
      .join("\n    ")}
  </dl>`
      : "";

  const tagBlock =
    release.tags.length > 0
      ? `<p class="tags"><span>${escapeHtml(MR.tags)}</span>${escapeHtml(release.tags.join(" · "))}</p>`
      : "";

  const sourceLine = release.url
    ? `<p>${escapeHtml(MR.source)}: <a href="${escapeHtml(release.url)}">${escapeHtml(release.url)}</a></p>`
    : "";

  const importedLine = pulledAt
    ? `<p>${escapeHtml(MR.imported)}: ${escapeHtml(formatDateMr(pulledAt.slice(0, 10)))}</p>`
    : "";

  return `<!doctype html>
<html lang="mr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(release.titleMr)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Tiro+Devanagari+Marathi&display=swap">
<style>
  /* The script prints with preferCSSPageSize, so this block — not the
     page.pdf() call — owns the paper. */
  @page { size: A4; margin: 16mm 15mm 18mm; }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: #ffffff;
    color: #1a1a30;
    /* Nirmala UI is the fallback that matters: it ships with Windows and has
       full Devanagari, so an offline run still sets conjuncts correctly rather
       than dropping to a Latin face. */
    font-family: "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif;
    font-size: 10.5pt;
    line-height: 1.85;
  }

  /* No letter-spacing anywhere on this sheet, including the small labels where
     a Latin design would want it: tracking Devanagari pushes the matras off
     the consonants they belong to. Labels are told apart by size and colour. */

  .masthead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10mm;
    border-bottom: 2px solid #14926a;
    padding-bottom: 3mm;
  }
  .masthead-government { font-size: 8.5pt; color: #4d4d6b; }
  .masthead-issuer { font-size: 12.5pt; font-weight: 600; line-height: 1.35; margin-top: 1mm; }
  .masthead-stamp { font-size: 8.5pt; color: #656587; text-align: right; white-space: nowrap; }

  .eyebrow {
    margin: 9mm 0 0;
    color: #0c6b4c;
    font-size: 8.5pt;
    font-weight: 600;
  }

  h1 {
    font-family: "Tiro Devanagari Marathi", "Noto Serif Devanagari", "Nirmala UI", serif;
    font-size: 18pt;
    font-weight: 400;
    line-height: 1.45;
    margin: 2mm 0 0;
  }

  .dateline { margin: 3mm 0 0; font-size: 9.5pt; color: #4d4d6b; }

  .poster {
    display: block;
    margin: 8mm auto 0;
    max-width: 76%;
    max-height: 92mm;
    object-fit: contain;
    border: 1px solid #e5e5f2;
    border-radius: 3px;
  }

  hr { border: 0; height: 1px; background: #e5e5f2; margin: 8mm 0 6mm; }

  .body p {
    margin: 0 0 4.5mm;
    text-align: justify;
    orphans: 3;
    widows: 3;
  }

  .meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3mm 10mm;
    border-top: 1px solid #e5e5f2;
    margin: 8mm 0 0;
    padding-top: 5mm;
    break-inside: avoid;
  }
  .meta dt { color: #656587; font-size: 8pt; }
  .meta dd { margin: 1mm 0 0; font-size: 10pt; }

  .tags { margin: 5mm 0 0; font-size: 9.5pt; color: #4d4d6b; break-inside: avoid; }
  .tags span { color: #656587; font-size: 8pt; margin-right: 2mm; }

  footer {
    border-top: 1px solid #e5e5f2;
    margin-top: 8mm;
    padding-top: 4mm;
    font-size: 8.5pt;
    line-height: 1.65;
    color: #656587;
    break-inside: avoid;
  }
  footer p { margin: 0 0 1.5mm; }
  footer a { color: #0c6b4c; text-decoration: none; word-break: break-all; }

  /* A headline stranded at the foot of a page is worse than a short page. */
  .eyebrow, h1, .dateline { break-after: avoid; }
</style>
</head>
<body>
  <header class="masthead">
    <div>
      <div class="masthead-government">${escapeHtml(MR.government)}</div>
      <div class="masthead-issuer">${escapeHtml(MR.issuer)}</div>
    </div>
    <div class="masthead-stamp">${escapeHtml(formatDateMr(release.date))}</div>
  </header>

  <p class="eyebrow">${escapeHtml(MR.hint)}</p>
  <h1>${escapeHtml(release.titleMr)}</h1>
  ${dateline ? `<p class="dateline">${escapeHtml(dateline)}</p>` : ""}
  ${release.posterUrl ? `<img class="poster" src="${escapeHtml(release.posterUrl)}" alt="">` : ""}

  <hr>

  <div class="body">
      ${body}
  </div>

  ${metaBlock}
  ${tagBlock}

  <footer>
    <p>${escapeHtml(MR.reprint)}</p>
    ${sourceLine}
    ${importedLine}
  </footer>
</body>
</html>`;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const snapshot = readSnapshot();
  const chosen = select(snapshot.releases ?? [], { only, district });

  if (chosen.length === 0) {
    throw new Error(
      `nothing selected — ${only ? `--only=${only}` : `--district=${district}`} matched no release.`,
    );
  }

  console.log(
    `[dgipr] printing ${chosen.length} release(s)${district ? ` from ${district}` : ""}`,
  );
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const printed = new Map();

  try {
    for (const release of chosen) {
      /* Named by id and not by slug, and that is not laziness. The live rows'
         slugs are the percent-encoded Devanagari WordPress gave them — a
         hundred-odd characters of `%e0%a4…` that is neither readable as a
         filename nor tolerable in a URL. The id is the mahasamvad post number:
         short, unique, and the same across a re-pull. */
      const file = path.join(OUT_DIR, `${release.id}.pdf`);

      await page.setContent(sheet(release, snapshot.pulledAt), {
        waitUntil: "networkidle",
      });

      // Devanagari arrives over the network; printing before the faces land
      // silently falls back and drops the conjuncts.
      await page.evaluate(() => document.fonts.ready);

      // The poster is somebody else's host. A release whose photograph 404s is
      // still a release, so this reports and prints rather than failing.
      const poster = await page.evaluate(() => {
        const img = document.querySelector("img.poster");
        if (!img) return "none";

        return img.complete && img.naturalWidth > 0 ? "ok" : "failed";
      });

      if (poster === "failed") {
        console.warn(`  ! ${release.id} — poster did not load, printing without it`);
        await page.evaluate(() => document.querySelector("img.poster")?.remove());
      }

      await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });

      const kb = Math.round(statSync(file).size / 1024);
      console.log(
        `  ✓ ${relative(file)}  (${toDevanagari(kb)} KB)  ${release.titleMr.slice(0, 44)}`,
      );
      printed.set(release.id, `${URL_PREFIX}/${release.id}.pdf`);
    }
  } finally {
    await browser.close();
  }

  if (!write) {
    console.log(`\n${printed.size} PDF(s) written; --no-write, snapshot untouched.`);

    return;
  }

  const data = writeUrls(snapshot, "pdfUrl", printed);
  console.log(
    `\n${printed.size} PDF(s) written; pdfUrl set on ${printed.size} row(s) in ${data}.`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
