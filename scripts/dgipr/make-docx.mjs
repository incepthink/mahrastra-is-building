/**
 * Renders the editable twin of a printed release:
 *
 *   public/dgipr/docs/<id>.docx
 *
 * Same masthead, same headline, same full text, same credit block as
 * `make-pdfs.mjs` — so a recipient who needs to quote a release, re-lay it out
 * or paste it into a bulletin gets the words rather than a page image. The
 * shared half of the two sheets lives in `release.mjs` precisely so the pair
 * cannot drift; the layout is separate because a stylesheet and a `docx`
 * document tree have nothing to factor out between them.
 *
 *   node scripts/dgipr/make-docx.mjs                    # Pune's four
 *   node scripts/dgipr/make-docx.mjs --district=nanded
 *   node scripts/dgipr/make-docx.mjs --only=ms-213394,ms-213391
 *   node scripts/dgipr/make-docx.mjs --all
 *   node scripts/dgipr/make-docx.mjs --no-write         # write files, not the snapshot
 *
 * NO BROWSER HERE, unlike the sibling repo's `gen:docx`. That script rasterises
 * SVG posters through Chromium and downscales oversized photographs. Neither
 * job exists on this data: every live release's poster is already a JPEG, and
 * they measure 64–180 KB at around 1000–1600px, which is roughly the 2× the
 * page uses anyway. Re-encoding them would cost a browser launch to save
 * nothing, so the bytes are fetched and embedded as they are.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

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

const OUT_DIR = path.join(ROOT, "public", "dgipr", "docs");
const URL_PREFIX = "/dgipr/docs";

const { only, district, write } = parseArgs();

/* ------------------------------------------------------------------ units */

/** Word measures the page in twips. These mirror the millimetres in the CSS
 *  `@page` block of `make-pdfs.mjs`, so the two sheets are the same paper. */
const mm = (value) => Math.round(value * 56.6929);
/** Font sizes are half-points; the stylesheet is written in points. */
const pt = (value) => Math.round(value * 2);
/** Images are placed in CSS pixels at 96 dpi. */
const mmToPx = (value) => (value / 25.4) * 96;
/** A CSS `line-height` multiplier, in the 240ths of a line Word wants. */
const line = (multiplier) => Math.round(multiplier * 240);

/**
 * One font name, not a stack: Word picks no fallback of its own, so a family
 * it cannot resolve is simply not applied. Nirmala UI ships with Windows and
 * covers Devanagari, which is what these files are opened in. Noto Sans
 * Devanagari — what the PDF uses — is a webfont and cannot be relied on to be
 * installed, so this is the one place the two sheets deliberately differ.
 */
const FONT = "Nirmala UI";

/* The palette of the printed sheet, and of the layer itself: green where the
   rest of the map is violet. See `--color-official` in `tokens.css`. */
const INK = "1A1A30";
const BODY_MUTED = "4D4D6B";
const MUTED = "656587";
const ACCENT = "0C6B4C";
const RULE_GREEN = "14926A";
const RULE_SOFT = "E5E5F2";

const CONTENT_WIDTH_MM = 180; // A4 (210mm) minus the left and right margins.
const POSTER_MAX_WIDTH_PX = mmToPx(CONTENT_WIDTH_MM * 0.76);
const POSTER_MAX_HEIGHT_PX = mmToPx(92);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

/**
 * A run carrying the Devanagari font on every script slot.
 *
 * `cs` — complex script — is the one that actually governs Devanagari; setting
 * only `ascii` leaves Word rendering the Marathi in whatever its default
 * complex-script font is. The same goes for size and bold, which have separate
 * complex-script properties, so both are set from the one argument.
 *
 * There is no `characterSpacing` anywhere in this file, including on the small
 * labels where a Latin design would want tracking: spacing Devanagari pushes
 * the matras off the consonants they belong to.
 */
function run(text, options = {}) {
  const { size, ...rest } = options;

  return new TextRun({
    text,
    font: { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT },
    language: { value: "mr-IN", bidirectional: "mr-IN" },
    ...(size === undefined ? {} : { size: pt(size), sizeComplexScript: pt(size) }),
    ...(rest.bold ? { boldComplexScript: true } : {}),
    ...rest,
  });
}

/* ----------------------------------------------------------------- poster */

/**
 * A JPEG's intrinsic size, walked out of the marker chain — no image library
 * needed, and `docx` needs the dimensions to place the picture.
 */
function readJpegSize(buffer) {
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    offset += 2 + length;
  }

  return null;
}

/** PNG carries its size in the IHDR chunk, at a fixed offset. */
function readPngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * The release's photograph, letterboxed into the same box the printed sheet
 * gives it.
 *
 * Fetched at generation time and embedded, so the finished document does not
 * depend on mahasamvad.in being up when somebody opens it. A poster that will
 * not load is reported and skipped — a release whose photograph 404s is still
 * a release, which is the same call `make-pdfs.mjs` makes.
 */
async function posterParagraph(release) {
  if (!release.posterUrl) return null;

  let buffer;
  let contentType;

  try {
    const response = await fetch(release.posterUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    buffer = Buffer.from(await response.arrayBuffer());
    contentType = response.headers.get("content-type") ?? "";
  } catch (error) {
    console.warn(`  ! ${release.id} — poster did not load (${error.message}), skipping it`);

    return null;
  }

  const isPng = contentType.includes("png") || /\.png$/i.test(release.posterUrl);
  const intrinsic = isPng ? readPngSize(buffer) : readJpegSize(buffer);

  if (!intrinsic?.width || !intrinsic?.height) {
    console.warn(`  ! ${release.id} — could not read poster dimensions, skipping it`);

    return null;
  }

  const scale = Math.min(
    POSTER_MAX_WIDTH_PX / intrinsic.width,
    POSTER_MAX_HEIGHT_PX / intrinsic.height,
    1,
  );

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: mm(8) },
    children: [
      new ImageRun({
        data: buffer,
        type: isPng ? "png" : "jpg",
        transformation: {
          width: Math.round(intrinsic.width * scale),
          height: Math.round(intrinsic.height * scale),
        },
        altText: {
          name: "poster",
          title: MR.hint,
          description: release.titleMr,
        },
      }),
    ],
  });
}

/* -------------------------------------------------------------- furniture */

/** Government and issuing office on the left, date on the right, under the
 *  green rule. A borderless table, because Word has no other way to put two
 *  blocks on one line with a rule beneath both. */
function masthead(release) {
  const cell = (children, alignment) =>
    new TableCell({
      children: [new Paragraph({ alignment, children })],
      borders: {
        ...NO_BORDERS,
        bottom: { style: BorderStyle.SINGLE, size: 16, color: RULE_GREEN },
      },
      margins: { top: 0, bottom: mm(3), left: 0, right: 0 },
      // Word top-aligns cells; the printed sheet sets the date on the baseline
      // of the issuing office beside it, and the two should match.
      verticalAlign: VerticalAlign.BOTTOM,
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    columnWidths: [mm(120), mm(60)],
    rows: [
      new TableRow({
        children: [
          cell([
            run(MR.government, { size: 8.5, color: BODY_MUTED }),
            run("", { break: 1 }),
            run(MR.issuer, { size: 12.5, bold: true, color: INK }),
          ]),
          cell(
            [run(formatDateMr(release.date), { size: 8.5, color: MUTED })],
            AlignmentType.RIGHT,
          ),
        ],
      }),
    ],
  });
}

/** The two-column credit block under the body. */
function metaTable(release) {
  const entries = metaRows(release);

  const cell = (label, value) =>
    new TableCell({
      children: [
        new Paragraph({ children: [run(label, { size: 8, color: MUTED })] }),
        new Paragraph({
          spacing: { before: mm(1) },
          children: [run(value, { size: 10, color: INK })],
        }),
      ],
      borders: NO_BORDERS,
      margins: { top: mm(1.5), bottom: mm(1.5), left: 0, right: mm(10) },
    });

  const rows = [];

  for (let index = 0; index < entries.length; index += 2) {
    const pair = entries.slice(index, index + 2);

    rows.push(
      new TableRow({
        children: [
          cell(...pair[0]),
          pair[1]
            ? cell(...pair[1])
            : new TableCell({ children: [new Paragraph({})], borders: NO_BORDERS }),
        ],
      }),
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    columnWidths: [mm(90), mm(90)],
    rows,
  });
}

/** A hairline the width of the text column, drawn as an empty bordered line —
 *  Word has no horizontal-rule element. */
function rule({ before, after, color = RULE_SOFT }) {
  return new Paragraph({
    spacing: { before, after },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color } },
    children: [run("")],
  });
}

/* ---------------------------------------------------------------- document */

async function buildDocument(release, pulledAt) {
  const poster = await posterParagraph(release);
  const dateline = datelineMr(release);

  const children = [
    masthead(release),

    new Paragraph({
      spacing: { before: mm(9) },
      keepNext: true,
      children: [run(MR.hint, { size: 8.5, bold: true, color: ACCENT })],
    }),

    new Paragraph({
      outlineLevel: 0,
      spacing: { before: mm(2), line: line(1.45), lineRule: LineRuleType.AUTO },
      keepNext: true,
      children: [run(release.titleMr, { size: 18, bold: true, color: INK })],
    }),

    ...(dateline
      ? [
          new Paragraph({
            spacing: { before: mm(3) },
            keepNext: true,
            children: [run(dateline, { size: 9.5, color: BODY_MUTED })],
          }),
        ]
      : []),

    ...(poster ? [poster] : []),

    rule({ before: mm(8), after: mm(6) }),

    ...paragraphs(release.summaryMr).map(
      (para) =>
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: mm(4.5), line: line(1.85), lineRule: LineRuleType.AUTO },
          children: [run(para, { size: 10.5, color: INK })],
        }),
    ),

    rule({ before: mm(8), after: mm(5) }),
    metaTable(release),
  ];

  if (release.tags.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: mm(5) },
        children: [
          run(`${MR.tags}: ${release.tags.join(" · ")}`, { size: 9.5, color: BODY_MUTED }),
        ],
      }),
    );
  }

  /* The same footer the printed sheet carries, and for the same reason: the
     masthead above names the directorate because the directorate wrote the
     words, and this says the file itself was not issued by anybody's
     government. See the header comment in `make-pdfs.mjs`. */
  const credit = [run(MR.reprint, { size: 8.5, color: MUTED })];

  if (release.url) {
    credit.push(
      run("", { break: 1 }),
      run(`${MR.source}: ${release.url}`, { size: 8.5, color: ACCENT }),
    );
  }

  if (pulledAt) {
    credit.push(
      run("", { break: 1 }),
      run(`${MR.imported}: ${formatDateMr(pulledAt.slice(0, 10))}`, {
        size: 8.5,
        color: MUTED,
      }),
    );
  }

  children.push(
    rule({ before: mm(8), after: mm(4) }),
    new Paragraph({ spacing: { line: line(1.65), lineRule: LineRuleType.AUTO }, children: credit }),
  );

  return new Document({
    title: release.titleMr,
    description: paragraphs(release.summaryMr)[0]?.slice(0, 180) ?? "",
    creator: release.authorMr ?? MR.issuer,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT },
            size: pt(10.5),
            sizeComplexScript: pt(10.5),
            color: INK,
          },
          paragraph: {
            spacing: {
              after: 0,
              line: line(1.5),
              // Explicit: a missing rule is read as a fixed line height by some
              // readers, which crops anything taller than one line — and
              // Devanagari with a matra above and below is taller than one line.
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: mm(210), height: mm(297) },
            margin: { top: mm(16), right: mm(15), bottom: mm(18), left: mm(15) },
          },
        },
        children,
      },
    ],
  });
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
    `[dgipr] writing ${chosen.length} document(s)${district ? ` from ${district}` : ""}`,
  );
  mkdirSync(OUT_DIR, { recursive: true });

  const written = new Map();

  for (const release of chosen) {
    // Named by id, for the reason `make-pdfs.mjs` gives: the live rows' slugs
    // are percent-encoded Devanagari and make an unusable filename.
    const file = path.join(OUT_DIR, `${release.id}.docx`);

    writeFileSync(file, await Packer.toBuffer(await buildDocument(release, snapshot.pulledAt)));

    const kb = Math.round(statSync(file).size / 1024);
    console.log(
      `  ✓ ${relative(file)}  (${toDevanagari(kb)} KB)  ${release.titleMr.slice(0, 44)}`,
    );
    written.set(release.id, `${URL_PREFIX}/${release.id}.docx`);
  }

  if (!write) {
    console.log(`\n${written.size} DOCX written; --no-write, snapshot untouched.`);

    return;
  }

  const data = writeUrls(snapshot, "docxUrl", written);
  console.log(
    `\n${written.size} DOCX written; docxUrl set on ${written.size} row(s) in ${data}.`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
