"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { MR } from "@/lib/signals/marathi";
import { keepFocusInside, useMounted } from "@/lib/ui/modal";

const SCRIM = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.2 } },
  gone: { opacity: 0, transition: { duration: 0.16 } },
};

/**
 * The sheet arrives the way a printed form is set down on a desk — a short
 * drop, then still. No spring overshoot: these are forms, not toys, and a
 * dialog that bounces reads as unserious next to a notice about somebody's
 * land.
 */
const SHEET = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const },
  },
  gone: { opacity: 0, y: 12, scale: 0.99, transition: { duration: 0.16 } },
};

type ModalSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The heading, on the coloured plate. */
  title: string;
  /** One line under it saying what happens to what you write. */
  intro: string;
   /**
   * The plate behind the heading — the *pale* end of a sector's hue, not the
   * saturated one. A record's dialog takes that record's sector so it reads as
   * having come out of the panel; a dialog belonging to no record falls back
   * to the pale accent, which is the product's own plate.
   */
  sectorPlate?: string;
  /** The standing caveat above the buttons — what this form does *not* do. */
  note: string;
  submitLabel: string;
  /** The `id` of the `<form>` in `children`, so the footer's button can submit
   *  it from outside the scroller. */
  formId: string;
  /** Everything between the head and the actions. Owns its own `<form>`. */
  children: React.ReactNode;
};

/**
 * The dialog every form in the product is set in.
 *
 * Two sheets share it — "something on this record is wrong" and "I know
 * something you don't" — and they had better look like the same object, because
 * to a reader they are the same gesture: writing to whoever keeps the map. What
 * lives here is everything that is true of both — the portal, the ink scrim,
 * Escape, the focus trap, the drop, the head plate, the footer — and what lives
 * in each caller is only its own fields.
 *
 * It renders through a portal because the panel one of these is launched from
 * is an `overflow: hidden` card that Motion keeps under a transform — a fixed
 * overlay inside it would be both clipped and positioned against the card
 * instead of the viewport.
 *
 * The `report-*` class names are the shared press, not a statement about which
 * form is being filled in; see `styles/report.css`.
 */
export function ModalSheet({
  open,
  onClose,
  title,
  intro,
  sectorPlate,
  note,
  submitLabel,
  formId,
  children,
}: ModalSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = useMounted();

  // Escape closes from anywhere, including with focus inside a textarea, and
  // Tab is held inside the sheet — which is what `aria-modal` promises.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") keepFocusInside(event, sheetRef.current);
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The first field, not the close button: opening a form and landing on the
  // way out of it is a small insult. Read from the DOM rather than through a
  // ref handed down by each caller, so a caller only has to order its fields.
  useEffect(() => {
    if (!open) return;

    const first = sheetRef.current?.querySelector<HTMLElement>(
      ".report-scroll input, .report-scroll textarea, .report-scroll select",
    );

    first?.focus();
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="report-layer">
          <motion.div
            className="report-scrim"
            variants={SCRIM}
            initial="hidden"
            animate="shown"
            exit="gone"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            ref={sheetRef}
            className="report-sheet"
            lang="mr"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={
              sectorPlate
                ? ({ "--sector-plate": sectorPlate } as React.CSSProperties)
                : undefined
            }
            variants={SHEET}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            <button type="button" className="report-close" onClick={onClose} aria-label={MR.close}>
              <X size={15} strokeWidth={2} aria-hidden />
            </button>

            <header className="report-head">
              <h2 id={titleId} className="report-title">
                {title}
              </h2>
              <p className="report-intro">{intro}</p>
            </header>

            <div className="report-scroll">{children}</div>

            {/* The actions sit outside the scroller so they stay on screen on a
                phone, where the form is taller than the sheet. */}
            <footer className="report-foot">
              <p className="report-note">{note}</p>

              <div className="report-actions">
                <button type="button" className="report-cancel" onClick={onClose}>
                  {MR.reportCancel}
                </button>
                <button type="submit" form={formId} className="report-submit">
                  {submitLabel}
                </button>
              </div>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
