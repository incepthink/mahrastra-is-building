"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MODAL_GRID, PanelModal, PanelTools } from "./panel-modal";
import { ShareBar } from "@/components/share/share-bar";
import { SharePreview } from "@/components/share/share-preview";
import {
  DGIPR_MR,
  DGIPR_SHARE_MR,
  datelineMr,
  releaseCountMr,
  releaseDateMr,
} from "@/lib/dgipr/marathi";
import { isShareable } from "@/lib/dgipr/share-message";
import type { DgiprRelease } from "@/types/dgipr";

const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

const panelVariants = {
  hidden: { opacity: 0, x: 40 },
  shown: {
    opacity: 1,
    x: 0,
    transition: { ...SPRING, staggerChildren: 0.05, delayChildren: 0.1 },
  },
  gone: { opacity: 0, x: 28, transition: { duration: 0.18 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
  gone: { opacity: 0 },
};

type DgiprPanelProps = {
  /** Every release the marked district issued in the window, newest first.
   *  Empty or null closes the panel. */
  releases: DgiprRelease[];
  /** Which of them is open. The mark opens the newest; the rail below switches. */
  openId: string | null;
  onOpen: (release: DgiprRelease) => void;
  onClose: () => void;
};

/**
 * One district's government press releases, read in full.
 *
 * **This panel prints the whole released text, and that is the one place this
 * product does.** `NewsPanel` and `StoryPanel` both stop at a headline and a
 * standfirst and say at length why: the collector stores newspaper bodies
 * because the analysis needs them, and republishing a Marathi daily is a
 * different act from linking to it. That rule is about somebody else's
 * reporting. A DGIPR release is a government department's own public
 * information, issued in order to be carried, and already published in full on
 * mahasamvad.in. There is no publisher here whose readers we would be taking.
 *
 * Which means this panel has a different job from the other two. It is not a
 * reading list pointing somewhere else — it is the document. So the release is
 * laid out to be read: the dateline and the issuing office first, because for
 * an official notice *who said it* is half the content; then the poster; then
 * the text; then the subject tags. The other releases from the same district
 * sit at the bottom as a rail, so a Mumbai mark carrying four notices opens one
 * and offers three rather than hiding them behind the map.
 */
export function DgiprPanel({ releases, openId, onOpen, onClose }: DgiprPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Which release's stack is being read full-page as a set of cards, rather
   * than whether one is.
   *
   * Held as the id it was opened from, for the reason given in `NewsPanel`: a
   * boolean would have to be reset by an effect every time the panel changed
   * subject, and the fact is derivable without one.
   */
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = openId !== null && expandedFor === openId;

  /* Share mode, held the same way and for the same reason. The expanded
     reading collapses on its own when the district changes, and holding this
     as a boolean would leave the sheet re-opening in a mode the reader turned
     on for a different district's releases. */
  const [shareFor, setShareFor] = useState<string | null>(null);
  const shareMode = expanded && shareFor === openId;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const open = releases.find((release) => release.id === openId) ?? null;

  /* What can be sent at all: a release only counts once both its sheets exist,
     and today that is Pune's four. Read off the rows rather than off a list of
     ids, because the answer changes every time another district is run through
     `scripts/dgipr/`. */
  const eligible = useMemo(() => releases.filter(isShareable), [releases]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  /* Ordered by the grid and not by tap order, so the same four selections
     always produce the same message. Filtering through `eligible` is also what
     makes ids left over from another district inert rather than stale. */
  const selected = useMemo(
    () => eligible.filter((release) => selectedSet.has(release.id)),
    [eligible, selectedSet],
  );

  const allSelected =
    eligible.length > 0 && eligible.every((release) => selectedSet.has(release.id));

  function exitShareMode() {
    setShareFor(null);
    setPreviewOpen(false);
    setSelectedIds([]);
  }

  function closeExpanded() {
    setExpandedFor(null);
    exitShareMode();
  }

  // A new release is a new document, and inheriting the last one's scroll
  // offset drops the reader into the middle of a notice they just opened.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [openId]);

  useEffect(() => {
    // The grid owns Escape while it is open, so one press steps back to the
    // panel rather than closing the panel and the grid together.
    if (!open || expanded) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, expanded, onClose]);

  const others = releases.filter((release) => release.id !== openId);

  /* The tag, worn where a reader cannot miss it. The whole point of this
     layer is that it is a different kind of source from everything else on
     the sheet, and a badge is the shortest way to say so at the top of a
     document. Built once because the expanded reading wears the same one. */
  const eyebrow = (
    <>
      <span className="dgipr-badge">{DGIPR_MR.tag}</span>
      {DGIPR_MR.hint}
    </>
  );

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.aside
            key={open.districtId ?? open.id}
            className="news-panel dgipr-panel"
            lang="mr"
            role="dialog"
            aria-label={open.titleMr}
            variants={panelVariants}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            <header className="news-panel-head">
              <div>
                <p className="news-panel-eyebrow dgipr-eyebrow">{eyebrow}</p>

                <h2 className="news-panel-title dgipr-title">{open.titleMr}</h2>

                <p className="dgipr-dateline">
                  <span className="dgipr-dateline-place">{datelineMr(open)}</span>
                  <span className="dgipr-dateline-date">{releaseDateMr(open.date)}</span>
                </p>
              </div>

              <PanelTools
                onClose={onClose}
                onExpand={openId ? () => setExpandedFor(openId) : undefined}
              />
            </header>

            {/* Who issued it and what it is filed under. For an official notice
                the issuing office is not metadata — a release from the
                directorate and a release from the Nanded district office are
                different claims, and the reader should not have to infer which
                one they are holding. */}
            <div className="dgipr-issuer">
              {open.authorMr ? (
                <p className="dgipr-issuer-line">
                  <span className="dgipr-label">{DGIPR_MR.issuedBy}</span>
                  {open.authorMr}
                </p>
              ) : null}

              <p className="dgipr-issuer-line">
                <span className="dgipr-label">{DGIPR_MR.category}</span>
                <span className="dgipr-category">{open.categoryMr}</span>
              </p>
            </div>

            <div className="news-panel-list dgipr-body" ref={listRef}>
              {open.posterUrl ? (
                /* Two kinds of image arrive here and `next/image` suits neither.
                   The curated rows point at `public/dgipr/posters/*.svg`, which
                   the optimiser passes through untouched anyway; the live rows
                   point at the directorate's own photographs on mahasamvad.in,
                   which are somebody else's host and would need a `remotePatterns`
                   entry to buy nothing. A plain `<img>` serves both. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="dgipr-poster"
                  src={open.posterUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : null}

              {/* The released text, in the paragraphs it was issued in. Split on
                  the blank lines the source carries rather than rendered as one
                  block: a press release is written in paragraphs and a wall of
                  two thousand Devanagari characters is not readable. */}
              <div className="dgipr-text">
                {open.summaryMr
                  .split(/\n\s*\n/)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, index) => (
                    <motion.p key={index} variants={ITEM}>
                      {para}
                    </motion.p>
                  ))}
              </div>

              {open.tags.length > 0 ? (
                <div className="dgipr-tags">
                  <p className="dgipr-label">{DGIPR_MR.tags}</p>
                  <ul className="dgipr-tag-list">
                    {open.tags.map((tag) => (
                      <li key={tag} className="dgipr-tag">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {open.pdfUrl ? (
                <a
                  className="dgipr-pdf"
                  href={open.pdfUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {DGIPR_MR.readPdf}
                  <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden />
                </a>
              ) : null}

              {/* The release on mahasamvad.in. Not a "read more" — the body above
                  is already the release in full — but attribution the reader can
                  follow, which matters more here than anywhere else on the map:
                  this panel is the one place the app prints a whole document, and
                  a government notice should be checkable against the department
                  that issued it. Only the live rows have one; a transcription has
                  no canonical URL. */}
              {open.url ? (
                <a
                  className="dgipr-pdf"
                  href={open.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {DGIPR_MR.readSource}
                  <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden />
                </a>
              ) : null}

              {/* The rest of this district's notices. A stacked mark opens one
                  and would otherwise hide the others behind the map. */}
              {others.length > 0 ? (
                <div className="dgipr-more">
                  <p className="dgipr-label">
                    {releaseCountMr(releases.length)} · {datelineMr(open)}
                  </p>

                  {others.map((release) => (
                    <button
                      key={release.id}
                      type="button"
                      className="dgipr-more-row"
                      onClick={() => onOpen(release)}
                    >
                      <span className="dgipr-more-category">{release.categoryMr}</span>
                      <span className="dgipr-more-headline">{release.titleMr}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <footer className="news-panel-foot">
              <p>{DGIPR_MR.issuer}</p>
            </footer>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* The district's whole stack, laid out at once.

          The docked panel is the document and the rail at its foot is a table of
          contents deliberately kept quiet so it does not compete with the text.
          That is the right weighting when you are reading one notice. It is the
          wrong one when the question is "what has this district put out" — four
          Mumbai releases as four muted rows tell you how many there are and
          nothing about what they say. Full-page, they get to be cards: the
          poster, the subject, the dateline and the first paragraph, which is as
          much of a press release as anyone needs to decide whether to read it.

          Picking one opens it in the panel and hands the map back, because the
          panel is still where a release is read in full. */}
      <PanelModal
        open={expanded && Boolean(open)}
        onClose={closeExpanded}
        /* One press, one step back — preview, share mode, grid, panel. The
           preview stops Escape before it reaches here (see the capture-phase
           listener in `SharePreview`), so by the time this runs the only level
           left inside the sheet is share mode. */
        onEscape={shareMode ? exitShareMode : closeExpanded}
        className="dgipr-modal"
        eyebrow={<span className="dgipr-eyebrow">{eyebrow}</span>}
        title={open ? datelineMr(open) : ""}
        tally={releaseCountMr(releases.length)}
        /* No `foot`. The directorate's name used to close this sheet as a
           credit; it now opens the share message as its first bold line, which
           is where it is actually read. The docked panel keeps its own. */
        actions={
          /* Offered only where there is something to send. A bar whose every
             card is disabled teaches the reader nothing except that the button
             lied. */
          eligible.length > 0 ? (
            <ShareBar
              active={shareMode}
              selectedCount={selected.length}
              eligibleCount={eligible.length}
              allSelected={allSelected}
              onEnter={() => setShareFor(openId)}
              onSelectAll={() => setSelectedIds(eligible.map((release) => release.id))}
              onClear={() => setSelectedIds([])}
              onExit={exitShareMode}
              onPreview={() => setPreviewOpen(true)}
            />
          ) : null
        }
      >
        <motion.div
          className="panel-modal-grid"
          variants={MODAL_GRID}
          initial="hidden"
          animate="shown"
        >
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              reading={release.id === openId}
              shareMode={shareMode}
              shareable={isShareable(release)}
              selected={selectedSet.has(release.id)}
              onOpen={() => {
                onOpen(release);
                closeExpanded();
              }}
              onToggle={() =>
                setSelectedIds((current) =>
                  current.includes(release.id)
                    ? current.filter((id) => id !== release.id)
                    : [...current, release.id],
                )
              }
            />
          ))}
        </motion.div>
      </PanelModal>

      <SharePreview
        open={shareMode && previewOpen && selected.length > 0}
        onClose={() => setPreviewOpen(false)}
        releases={selected}
      />
    </>
  );
}

/**
 * One release as a card, for the expanded reading only.
 *
 * It shows a standfirst where `.dgipr-more-row` shows nothing, and that is the
 * only real difference between the two: a row in the panel is a pointer within
 * a document the reader is already inside, and a card here is the whole basis
 * on which they pick. The excerpt is the release's own first paragraph rather
 * than a summary of it — nothing in this product writes copy on a department's
 * behalf, and the opening paragraph of a government notice is already the
 * summary, because that is how they are written.
 *
 * In share mode the same card becomes a choice rather than a door: a click
 * selects instead of opening, because a grid where some clicks navigate and
 * others tick a box is a grid nobody can use. It stays a `<button>` and takes
 * `role="checkbox"` rather than growing a real `<input>`, because an input
 * inside a button is markup a browser is entitled to make its own sense of.
 */
function ReleaseCard({
  release,
  reading,
  shareMode,
  shareable,
  selected,
  onOpen,
  onToggle,
}: {
  release: DgiprRelease;
  /** The one currently open in the panel behind, marked rather than hidden:
   *  the reader arrived from it and a grid that silently drops it looks like
   *  it has lost one. */
  reading: boolean;
  shareMode: boolean;
  /** Whether this release has both sheets to send. */
  shareable: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const [lead] = release.summaryMr.split(/\n\s*\n/);
  const picking = shareMode && shareable;

  return (
    <motion.button
      type="button"
      className="dgipr-card"
      variants={ITEM}
      data-reading={reading || undefined}
      data-share={shareMode || undefined}
      data-selected={(picking && selected) || undefined}
      role={shareMode ? "checkbox" : undefined}
      aria-checked={shareMode ? selected : undefined}
      /* A release with no sheets still gets its card. Dropping it would leave a
         grid that loses a tile the moment share mode goes on, which reads as a
         bug; disabled with the reason printed on it reads as an answer. */
      disabled={shareMode && !shareable}
      onClick={picking ? onToggle : onOpen}
    >
      {shareMode ? (
        <span className="dgipr-card-check" aria-hidden>
          {selected && shareable ? <Check size={13} strokeWidth={3} /> : null}
        </span>
      ) : null}

      {release.posterUrl ? (
        /* The same two kinds of image the panel takes, and `next/image` suits
           neither of them for the same reasons. See the note on `.dgipr-poster`
           above. Cropped here rather than contained, because a grid of cards
           whose tops are all at different heights is not a grid. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="dgipr-card-poster"
          src={release.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}

      <span className="dgipr-card-body">
        <span className="dgipr-card-meta">
          <span className="dgipr-category">{release.categoryMr}</span>
          <span className="dgipr-card-date">{releaseDateMr(release.date)}</span>
        </span>

        <span className="dgipr-card-title">{release.titleMr}</span>

        {lead ? <span className="dgipr-card-lead">{lead.trim()}</span> : null}

        {shareMode && !shareable ? (
          <span className="dgipr-card-nofile">{DGIPR_SHARE_MR.noFiles}</span>
        ) : null}
      </span>
    </motion.button>
  );
}
