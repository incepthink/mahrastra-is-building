/**
 * The shapes the DGIPR layer is built from.
 *
 * A **release** is not an article, and this file exists because bending it into
 * `NewsArticle` would have been wrong in five places at once. `types/news.ts`
 * derives its fields from what the scraped corpus actually holds — a URL that
 * was swept, a section page it sat on, a position in that page's markup, a
 * `dateModified` that moves when a newsroom rewrites a running story. A press
 * release issued by the Directorate General of Information and Public Relations
 * has none of those. It is issued once, by a department, on a day, about a
 * subject the department chose, and it is never promoted, never rewritten and
 * never in competition for a front page.
 *
 * So the two live side by side and never in the same table. See
 * `src/lib/dgipr/read.ts` for the rest of that argument, and
 * `scripts/dgipr/pull.mjs` for where these rows come from.
 */
import type { NewsWindow } from "./news";

/**
 * One release, as the browser gets it.
 *
 * `summaryMr` **is** here, in full, and that is a deliberate departure from the
 * rule `NewsArticle` enforces. That rule — the body never crosses this
 * boundary — is about a Marathi daily's copyrighted reporting, and it is right:
 * republishing a newspaper is a different act from linking to it. A DGIPR
 * release is the opposite kind of object. It is a government department's own
 * public-information output, issued to be carried, already republished in full
 * on mahasamvad.in and in every paper that runs it. Withholding it would be
 * caution copied from a case it does not apply to.
 *
 * Everything stays in Marathi. The releases are issued in Marathi, the map is
 * Marathi-first, and a translation on this surface would be this app putting
 * words in a government department's mouth.
 */
export type DgiprRelease = {
  /** The source feed's own id — `2026-08-26-01`. Stable across a re-pull. */
  id: string;
  /** URL-safe key from the source feed. Kept so a release stays addressable if
   *  this ever grows a deep link, and because it names the poster file. */
  slug: string;
  titleMr: string;
  /** `YYYY-MM-DD`. A calendar date and not a timestamp, because that is all the
   *  source carries — see the note on the window in `read.ts`. */
  date: string;
  /** The released text in full. See the note above on why. */
  summaryMr: string;
  /** Resolved against the boundary file. Null when the dateline names no
   *  district on the map, in which case the release gets no mark. */
  districtId: string | null;
  /** The dateline word as DGIPR issued it — `मुंबई`, which the map had to
   *  resolve to one of its two Mumbais. Printed rather than the resolved name,
   *  so the reader is shown what the department said. */
  datelineMr: string | null;
  categoryMr: string;
  sourceMr: string;
  /** The issuing office — the directorate itself, or a district office. */
  authorMr: string | null;
  tags: string[];
  featured: boolean;
  /** Served from this app's own `public/dgipr/posters/`; the pull copies them
   *  across so the snapshot is self-contained. */
  posterUrl: string | null;
  /**
   * The release as a printable sheet, under this app's own `public/dgipr/`.
   *
   * Null on most rows, and that is the source's shape rather than an omission:
   * mahasamvad.in publishes posts and not documents, so a live row has one only
   * where `scripts/dgipr/make-pdfs.mjs` has been run over it. The curated rows
   * take theirs from the sibling repo instead.
   */
  pdfUrl: string | null;
  /**
   * The same sheet, editable — written by `scripts/dgipr/make-docx.mjs` and
   * filled in exactly where `pdfUrl` is. Separate from the PDF rather than
   * derived from it because a recipient asking for the Word version is asking
   * for something the PDF cannot be turned into, and because either may exist
   * without the other while a district is being worked through.
   */
  docxUrl?: string | null;
  /**
   * The release on mahasamvad.in.
   *
   * Optional, and that is the difference between the two importers rather than
   * an oversight. `pull.mjs` carries transcriptions out of a sibling repo and a
   * transcription has no canonical URL; `pull-mahasamvad.mjs` reads the site's
   * own REST API, where every release is a post with a permalink. Rows from the
   * first kind have none, rows from the second always do.
   */
  url?: string | null;
};

/**
 * The DGIPR layer for one window, assembled in one pass on the server.
 *
 * Deliberately shaped like `NewsMap` without pretending to be it: the same
 * grouping-by-district and the same totals, because the map asks the same
 * questions of both, and none of the prominence, ceiling or choropleth-level
 * machinery, because none of it means anything for a press release. There is no
 * `ceiling` here and there never will be — this layer paints no land.
 */
export type DgiprMap = {
  /** Every release in the window, newest first. */
  releases: DgiprRelease[];
  /** Keyed by district id. Only districts with releases appear. */
  byDistrict: Record<string, DgiprRelease[]>;
  /** Releases whose dateline resolved to no district. They get no mark, and
   *  the plate says how many so they do not silently vanish. */
  unplaced: DgiprRelease[];
  totals: {
    releases: number;
    districts: number;
    unplaced: number;
  };
  /** The window actually used, which may be wider than the one the map settled
   *  on. See `loadDgipr` — the two stores fill at completely different rates
   *  and forcing this one onto the corpus's clock empties it for days at a
   *  time. */
  window: NewsWindow;
  /** Set when this layer had to look further back than the map beside it. Said
   *  on the plate rather than left for the reader to notice. */
  widened: boolean;
  /** When the snapshot was pulled from the source feed. The layer's whole claim
   *  is that it is official, not that it is live, so this is the honest stamp
   *  to print rather than a collector's clock. */
  pulledAt: string | null;
};
