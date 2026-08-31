/**
 * What `make-pdfs.mjs` and `make-docx.mjs` both need.
 *
 * The two scripts render the same release into two formats, and the whole
 * point of the DOCX is that it is the *editable twin* of the PDF — same
 * masthead, same headline, same text, same credit block. Two copies of the
 * vocabulary and the date formatter would let those two sheets drift apart
 * silently, and the one that drifted would be whichever nobody opened. So the
 * words, the dates, the selection rules and the write-back live here once.
 *
 * What deliberately does NOT live here is layout. An HTML stylesheet and a
 * `docx` document tree have nothing in common to factor out, and pretending
 * otherwise would produce an abstraction that fits neither.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const DATA = path.join(ROOT, "src", "data", "dgipr-releases.json");

/* ---------------------------------------------------------------- marathi */

const DEVANAGARI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

/** ASCII digits to Devanagari, in place — everything else passes through. */
export function toDevanagari(value) {
  return String(value).replace(/[0-9]/g, (digit) => DEVANAGARI_DIGITS[Number(digit)]);
}

/**
 * `2026-08-30` → `३० ऑगस्ट २०२६`, matching `formatDateMr` in
 * `src/lib/signals/marathi.ts` character for character.
 *
 * Through ICU rather than a month table copied out of that file, because the
 * note there is explicit that two lists of Marathi month names in one repo
 * would drift and the drifted one would be the unwatched one. `mr-IN` returns
 * exactly the twelve names that file holds — checked, all twelve — and differs
 * only in punctuating the year with a comma, which is dropped below.
 */
const MR_DATE = new Intl.DateTimeFormat("mr-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDateMr(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;

  return MR_DATE.formatToParts(date)
    .map((part) => (part.type === "literal" ? part.value.replace(/,/g, "") : part.value))
    .join("");
}

/** The words on a sheet. Every one of them is already said somewhere in
 *  `src/lib/dgipr/marathi.ts`; they are repeated here rather than imported
 *  because these are plain Node scripts and that file is TypeScript behind a
 *  `@/` alias. Keep the two in step by hand — there are eight strings. */
export const MR = {
  government: "महाराष्ट्र शासन",
  issuer: "माहिती व जनसंपर्क महासंचालनालय",
  hint: "शासकीय प्रसिद्धीपत्रक",
  category: "विषय",
  issuedBy: "जारी करणारे कार्यालय",
  tags: "खुणा",
  source: "स्रोत",
  imported: "आयात",
  reprint:
    "ही प्रत महासंवाद (mahasamvad.in) येथे प्रसिद्ध झालेल्या शासकीय प्रसिद्धीपत्रकाचा जसाच्या तसा पुनर्मुद्रित मजकूर आहे.",
};

/* ------------------------------------------------------------------ shape */

/** The release's own paragraphs, split on the blank lines the source carries —
 *  the same split `DgiprPanel` does, for the same reason. */
export function paragraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
}

/** Where a release says it is from, and when. */
export function datelineMr(release) {
  return [release.datelineMr, formatDateMr(release.date)].filter(Boolean).join(" · ");
}

/** The credit rows, in the order a reader of an official notice wants them:
 *  what it is about, who issued it, where it was published. Empty fields drop
 *  out rather than printing a label with nothing under it. */
export function metaRows(release) {
  return [
    [MR.category, release.categoryMr],
    [MR.issuedBy, release.authorMr],
    [MR.source, release.sourceMr],
  ].filter(([, value]) => Boolean(value));
}

/* ------------------------------------------------------------------- args */

/**
 * The selection flags both scripts take.
 *
 * Pune by default, because that is the set these were written for. An explicit
 * `--only` or `--all` replaces that default rather than intersecting with it.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const flag = (name) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

  const only = flag("only");
  const all = argv.includes("--all");

  return {
    only,
    all,
    district: flag("district") ?? (only || all ? null : "pune"),
    write: !argv.includes("--no-write"),
  };
}

export function readSnapshot() {
  if (!existsSync(DATA)) {
    throw new Error(`no snapshot at ${path.relative(ROOT, DATA)} — run dgipr:pull first.`);
  }

  return JSON.parse(readFileSync(DATA, "utf8"));
}

export function select(releases, { only, district }) {
  if (only) {
    const wanted = new Set(
      only
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );

    return releases.filter((release) => wanted.has(release.id));
  }

  if (district) return releases.filter((release) => release.districtId === district);

  return releases;
}

/**
 * Point the snapshot at what was just written.
 *
 * One field, only on the rows that produced a file, and the whole thing
 * re-serialised from the parsed object so nothing else can drift.
 *
 * NOTE: `dgipr:pull:live` rewrites every `ms-*` row from the API and will blank
 * these again. Re-run the generator after a live pull.
 */
export function writeUrls(snapshot, field, written) {
  const patched = {
    ...snapshot,
    releases: snapshot.releases.map((release) =>
      written.has(release.id) ? { ...release, [field]: written.get(release.id) } : release,
    ),
  };

  writeFileSync(DATA, `${JSON.stringify(patched, null, 2)}\n`, "utf8");

  return path.relative(ROOT, DATA).replace(/\\/g, "/");
}

/** `public/dgipr/pdfs/ms-1.pdf`, for a log line that can be clicked. */
export function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}
