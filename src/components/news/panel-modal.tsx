"use client";

import { AnimatePresence, motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { NEWS_MR } from "@/lib/news/marathi";
import { keepFocusInside, useMounted } from "@/lib/ui/modal";

const SCRIM = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.2 } },
  gone: { opacity: 0, transition: { duration: 0.16 } },
};

/** The panel does not fly across the screen to become this — it grows in
 *  place from where it was. A short scale-up reads as *the same object, more
 *  of it*, which is the whole claim the expand button makes. */
const SHEET = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
  },
  gone: { opacity: 0, y: 10, scale: 0.99, transition: { duration: 0.16 } },
};

/** The grid staggers its cards in the order they are read, the way the docked
 *  list does. Slower per card than the panel's 0.04 because there are three
 *  times as many of them on screen at once. */
export const MODAL_GRID = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.025, delayChildren: 0.08 } },
};

/**
 * The pair of round buttons in the top-right corner of a panel.
 *
 * Close on top because it is the one every reader already knows is there and
 * moving it would cost more than the second button is worth; expand under it.
 */
export function PanelTools({
  onClose,
  onExpand,
}: {
  onClose: () => void;
  /** Omitted when there is nothing worth opening full-page. */
  onExpand?: () => void;
}) {
  return (
    <div className="news-panel-tools">
      <button
        type="button"
        className="news-panel-close"
        onClick={onClose}
        aria-label={NEWS_MR.close}
      >
        <X size={17} strokeWidth={2.2} aria-hidden />
      </button>

      {onExpand ? (
        <button
          type="button"
          className="news-panel-expand"
          onClick={onExpand}
          aria-label={NEWS_MR.expand}
          title={NEWS_MR.expand}
        >
          <Maximize2 size={15} strokeWidth={2.2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

type PanelModalProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Escape, when it should step somewhere other than closed.
   *
   * Defaults to `onClose`, which is right while the sheet is only a grid. It
   * stops being right the moment the sheet grows a mode of its own — the DGIPR
   * grid's share mode is a level *inside* this dialog, and Escape has to unwind
   * that before it unwinds the dialog. The close button and the scrim are left
   * alone deliberately: a reader who reaches for the X means the whole sheet,
   * and Escape is the key that means "back one".
   */
  onEscape?: () => void;
  /** The small-caps line over the heading — the panel's own eyebrow. */
  eyebrow?: React.ReactNode;
  title: string;
  /** The count line under it. */
  tally?: React.ReactNode;
  /**
   * A control that belongs to the head rather than to the body — today, the
   * grid's search field.
   *
   * In the head and not above the grid because it has to survive the body
   * scrolling: a filter that scrolls away with the forty cards it is filtering
   * is a filter the reader has to scroll back up to change. It sits between
   * the heading and the close button and collapses under them when the sheet
   * is too narrow to hold all three on one line.
   */
  tools?: React.ReactNode;
  /** The credit line at the bottom, which is the panel's footer verbatim. */
  foot?: React.ReactNode;
  /**
   * A control strip at the bottom instead of a credit.
   *
   * Separate from `foot` rather than a wider type on it, because the two are
   * not the same element: `foot` is prose and gets wrapped in a `<p>`, and a
   * row of buttons in a paragraph is markup nobody meant to write. A sheet that
   * passes both gets both, in that order.
   */
  actions?: React.ReactNode;
  /** A hook for the caller's own palette — `dgipr-modal` turns it green. */
  className?: string;
  children: React.ReactNode;
};

/**
 * The docked panel, opened out over the whole page.
 *
 * The panel is a 25rem column on purpose and the note in `news-map.css` says
 * why: the reading order is "look at the state, pick a district, read it, pick
 * another", and a dialog covering the map breaks the second half of that. That
 * argument holds right up until the reader has already picked, and is now
 * reading forty articles through a slot — at which point the map is not what
 * they are looking at and the column is costing them three lines of headline
 * per card.
 *
 * So this is not a replacement for the panel; it is the panel with the map
 * temporarily conceded. It carries the same head, the same footer and the same
 * cards, and the only thing that changes is that the list becomes a grid,
 * because the one thing extra width actually buys is more than one column.
 *
 * It renders through a portal because the panel it grows out of is an
 * `overflow: hidden` card that Motion keeps under a transform — a fixed
 * overlay inside it would be positioned against the card rather than the
 * viewport, and the ticker at `z-index: 20` would sit over the top of it.
 */
export function PanelModal({
  open,
  onClose,
  onEscape,
  eyebrow,
  title,
  tally,
  tools,
  foot,
  actions,
  className,
  children,
}: PanelModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = useMounted();

  // Escape closes the expanded reading and leaves the panel it came from
  // standing. The panels suppress their own Escape handler while this is open
  // — see `expanded` in `NewsPanel` — so one press is one step back rather
  // than a dialog and a panel both vanishing.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        /* The panels underneath listen on `window`, which is the last stop in
           the bubble path after `document` — and they suppress that listener
           only while `expanded` is true. Closing the sheet flips that flag,
           and React flushes a discrete event's state before the event has
           finished propagating, so the panel's own handler could be attached
           in time to catch the very press that closed the sheet: one Escape,
           two things closed, and the reader back at the map instead of at the
           list they were reading. Stopping it here is what makes the step
           actually one step. */
        event.stopPropagation();
        (onEscape ?? onClose)();
      }

      if (event.key === "Tab") keepFocusInside(event, sheetRef.current);
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, onEscape]);

  // The way out, focused on arrival. `ModalSheet` deliberately focuses the
  // first field instead, because landing on the way out of a form you have
  // just opened is an insult — but this is not a form. It is a page of
  // somebody else's headlines, and every other focusable thing on it
  // navigates away from the site.
  useEffect(() => {
    if (!open) return;

    sheetRef.current?.querySelector<HTMLElement>(".panel-modal-close")?.focus();
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="panel-modal-layer">
          <motion.div
            className="panel-modal-scrim"
            variants={SCRIM}
            initial="hidden"
            animate="shown"
            exit="gone"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            ref={sheetRef}
            className={className ? `panel-modal-sheet ${className}` : "panel-modal-sheet"}
            lang="mr"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            variants={SHEET}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            <header className="panel-modal-head">
              <div className="panel-modal-heading">
                {eyebrow ? <p className="news-panel-eyebrow">{eyebrow}</p> : null}

                <h2 id={titleId} className="panel-modal-title">
                  {title}
                </h2>

                {tally ? <p className="news-panel-tally">{tally}</p> : null}
              </div>

              {tools ? <div className="panel-modal-tools">{tools}</div> : null}

              <button
                type="button"
                className="news-panel-close panel-modal-close"
                onClick={onClose}
                aria-label={NEWS_MR.collapse}
                title={NEWS_MR.collapse}
              >
                <X size={18} strokeWidth={2.2} aria-hidden />
              </button>
            </header>

            <div className="panel-modal-body">{children}</div>

            {foot ? (
              <footer className="news-panel-foot panel-modal-foot">
                <p>{foot}</p>
              </footer>
            ) : null}

            {actions ? (
              <div className="panel-modal-actions">{actions}</div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
