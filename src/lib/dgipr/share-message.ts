import { DGIPR_SHARE_MR, shareDateMr } from "./marathi";
import type { DgiprRelease } from "@/types/dgipr";

/**
 * The plain-text Marathi message a reader forwards to WhatsApp, the OS share
 * sheet, or the clipboard.
 *
 * Ported from the sibling `maharashtra-in-a-glance`, whose version of this file
 * carries the same two WhatsApp ceilings and the same rule about never quietly
 * shortening what it sends. The template is this product's own, and it differs
 * in one way worth stating up front: **that repo has a `summary` field and this
 * one does not.** `summaryMr` here is the release in full — the four Pune
 * notices run 2,872 to 7,134 characters — so a message built the sibling's way
 * would blow the 4,000-character ceiling on a *single* selection. What goes in
 * instead is the release's own opening paragraph; see `leadParagraph`.
 *
 * Rules that must not be broken:
 *  - the lead is reproduced verbatim, never trimmed, summarised or rewritten;
 *  - no emoji or emoji-like symbols, rule separators only;
 *  - the PDF and DOCX links are absolute, so the message is worth something
 *    outside the site it was assembled on.
 */

/** WhatsApp's own emphasis. Outside WhatsApp — a pasted clipboard, a mail
 *  client — these stay as literal asterisks, which is accepted: a stray
 *  asterisk is a smaller cost than a message with no structure in it. */
function bold(text: string): string {
  return `*${text}*`;
}

/** Under the masthead. Plain hyphens, and shorter than the block rule, so the
 *  heading reads as attached to what follows rather than as its own section. */
const HEADER_RULE = "-".repeat(11);

/** Between releases. Box-drawing, not an emoji. */
const BLOCK_RULE = "─".repeat(14);

/**
 * A DGIPR dateline — `पुणे, दि. ३० :`.
 *
 * The place is capped at 40 characters because a dateline is a town name and a
 * comma; anything longer is a sentence that happens to contain the word दि.
 * The digit class takes both scripts: the corpus is Devanagari throughout, but
 * one malformed row costing a reader their lead is not worth the strictness.
 */
const DATELINE = /^[^\n]{0,40}?,?\s*दि\s*\.?\s*[०-९0-9]/;

/** The paragraphs the release was issued in — the same split the panel uses. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
}

/**
 * The paragraph that opens the release, which is also its summary.
 *
 * Nothing in this product writes copy on a department's behalf, and it does not
 * have to: the opening paragraph of a government notice is already the summary,
 * because that is how a press release is written. `ReleaseCard` makes the same
 * argument for the excerpt on a card.
 *
 * The card takes paragraph `[0]` and that is good enough behind a four-line
 * clamp. It is not good enough here, because a message is the whole of what the
 * recipient gets: `ms-213391` opens with a 58-character standfirst and its real
 * lead is the second paragraph, and 22 of the 141 rows have a first paragraph
 * under 120 characters.
 *
 * The test is the dateline rather than a length threshold, because length is a
 * proxy and the dateline is the actual thing being looked for — a standfirst has
 * no `पुणे, दि. ३० :` on it and a lead always does. Over the whole corpus: 103
 * rows take paragraph 1, 19 take a later one (skipping a standfirst, which is
 * the case this exists for), and 19 carry no dateline at all and fall back to
 * `[0]`. The leads that come out run to a median of 389 characters and a
 * maximum of 760 — which is what makes four of them fit in one message.
 */
export function leadParagraph(release: DgiprRelease): string {
  const paras = paragraphs(release.summaryMr);

  return paras.find((para) => DATELINE.test(para)) ?? paras[0] ?? "";
}

/**
 * Whether a release has anything to send.
 *
 * Both sheets or neither. A message offering the PDF and silently omitting the
 * editable copy would read as the release simply not having a Word version,
 * when what it actually means is that this row has not been through
 * `scripts/dgipr/make-docx.mjs` yet — and the recipients this is built for are
 * the ones who asked for the DOCX. Derived from the row rather than from a list
 * of ids, because the set grows every time another district is worked through.
 */
export function isShareable(release: DgiprRelease): boolean {
  return Boolean(release.pdfUrl && release.docxUrl);
}

export type ShareMessageOptions = {
  /**
   * Origin used to absolutise the site-relative sheet paths, e.g.
   * `https://example.org`. Omit only when every URL is already absolute — the
   * links then go out relative, which is to say broken everywhere but here.
   */
  origin?: string;
};

/** Turn a stored path into something that still works in a messaging app. */
export function resolveAbsoluteUrl(
  url: string | null | undefined,
  origin?: string,
): string | null {
  if (!url) return null;

  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!origin) return trimmed;

  const base = origin.replace(/\/+$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return `${base}${path}`;
}

/** One release, without its trailing rule. */
export function buildReleaseBlock(
  release: DgiprRelease,
  options: ShareMessageOptions = {},
): string {
  const pdfUrl = resolveAbsoluteUrl(release.pdfUrl, options.origin);
  const docxUrl = resolveAbsoluteUrl(release.docxUrl, options.origin);

  const lines = [bold(release.titleMr.trim()), "", leadParagraph(release)];

  // Selection already refuses a release missing either sheet, so in practice
  // both lines are always written. They stay conditional because a builder that
  // prints `undefined` into a forwarded government notice is a worse failure
  // than one that prints a shorter block.
  if (pdfUrl) lines.push("", `${DGIPR_SHARE_MR.pdfLabel}\n${pdfUrl}`);
  if (docxUrl) lines.push("", `${DGIPR_SHARE_MR.docxLabel}\n${docxUrl}`);

  return lines.join("\n");
}

/**
 * The whole message, in the order the releases were given — which is the order
 * they are laid out in the grid and not the order they were tapped, so the same
 * four selections always read the same way.
 */
export function buildShareMessage(
  releases: DgiprRelease[],
  options: ShareMessageOptions = {},
): string {
  if (releases.length === 0) return "";

  const head = [
    bold(DGIPR_SHARE_MR.directorate),
    "",
    bold(DGIPR_SHARE_MR.heading),
    "",
    // Once, here, and never again on a block. A date repeated over four notices
    // that share it is noise, and the header is where the reader of a forwarded
    // message looks for it.
    bold(shareDateMr(releases.map((release) => release.date))),
    HEADER_RULE,
  ].join("\n");

  // A rule after *every* block, the last one included: the message usually
  // arrives above somebody's reply, and a final block left open runs into it.
  const blocks = releases.map(
    (release) => `${buildReleaseBlock(release, options)}\n${BLOCK_RULE}`,
  );

  return `${head}\n${blocks.join("\n\n")}`;
}

/* -------------------------------------------------------------------------
   WhatsApp
   ------------------------------------------------------------------------- */

/**
 * Practical ceilings for a prefilled `wa.me` link, measured in the sibling repo
 * and carried across unchanged.
 *
 * WhatsApp accepts far longer messages than this, but the text has to survive a
 * URL round-trip through the browser and the OS handler first, and that is
 * where long prefills get dropped. Two separate limits matter:
 *
 *  - the message itself, which is what WhatsApp receives; and
 *  - the percent-encoded URL, which is what the OS has to carry. Devanagari
 *    costs nine characters per glyph once encoded, so this is the limit a
 *    Marathi message hits first.
 *
 * All four Pune releases together come to 2,510 characters and 15,870 encoded —
 * inside both. The warning is wired up anyway, because the set of releases with
 * sheets grows a district at a time, and the first message to cross the line
 * should say so rather than arrive truncated.
 */
export const WHATSAPP_TEXT_SAFE_LENGTH = 4000;
export const WHATSAPP_URL_SAFE_LENGTH = 30_000;

export type WhatsAppLink = {
  url: string;
  /** Percent-encoded length — what the OS URL handler has to carry. */
  encodedLength: number;
  /** True when the prefill is likely to be dropped or truncated in transit. */
  exceedsSafeLength: boolean;
};

export function buildWhatsAppLink(message: string): WhatsAppLink {
  const encoded = encodeURIComponent(message);

  return {
    url: `https://wa.me/?text=${encoded}`,
    encodedLength: encoded.length,
    exceedsSafeLength:
      messageLength(message) > WHATSAPP_TEXT_SAFE_LENGTH ||
      encoded.length > WHATSAPP_URL_SAFE_LENGTH,
  };
}

/** Characters in the message itself, for the preview's counter. Spread rather
 *  than `.length`, so a surrogate pair counts once. */
export function messageLength(message: string): number {
  return [...message].length;
}
