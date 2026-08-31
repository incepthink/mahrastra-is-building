"use client";

import { AnimatePresence, motion } from "motion/react";
import { Copy, MessageCircle, Share2, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DGIPR_SHARE_MR, charCountMr, selectedCountMr } from "@/lib/dgipr/marathi";
import {
  buildShareMessage,
  buildWhatsAppLink,
  messageLength,
} from "@/lib/dgipr/share-message";
import { keepFocusInside, useMounted } from "@/lib/ui/modal";
import type { DgiprRelease } from "@/types/dgipr";

const SCRIM = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.18 } },
  gone: { opacity: 0, transition: { duration: 0.14 } },
};

const SHEET = {
  hidden: { opacity: 0, y: 12, scale: 0.99 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
  },
  gone: { opacity: 0, y: 8, scale: 0.99, transition: { duration: 0.14 } },
};

/** How long a copy or a share result stays on screen. Long enough to read a
 *  Marathi sentence, short enough not to still be there on the next attempt. */
const NOTE_MS = 4000;

/**
 * Exactly what is about to be sent, and every way of sending it.
 *
 * The message is shown verbatim and nothing on this sheet alters it. That is
 * the whole reason the preview exists rather than a straight send: what is
 * being forwarded is a government department's own words, and a reader who
 * forwards them should have seen them first. When a channel cannot carry the
 * message, the sheet says so and leaves copying — which has no ceiling at
 * all — where it was.
 *
 * It portals to `document.body` above the expanded reading for the reason that
 * one portals at all (see `PanelModal`): the sheet it opens over is a
 * transformed, `overflow: hidden` card, and a fixed layer inside it would be
 * positioned against the card rather than the viewport.
 */
export function SharePreview({
  open,
  onClose,
  releases,
}: {
  open: boolean;
  onClose: () => void;
  /** The selected releases, in the order the message should read. */
  releases: DgiprRelease[];
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = useMounted();

  /* A result, said once and then withdrawn. The sibling repo has a toast
     provider to put these in; this one has no toast anywhere, and adding a
     global notification system for three sentences that are only ever read
     while this sheet is on screen would be a system built for one caller. A
     line in the footer is read in the same glance as the button that caused
     it, which a corner toast is not. Keyed rather than compared, so copying
     twice says so twice. */
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    if (!note) return;

    const timer = window.setTimeout(() => setNote(null), NOTE_MS);

    return () => window.clearTimeout(timer);
  }, [note]);

  // The links have to be absolute or the message is worthless the moment it
  // leaves the tab, and the origin is only knowable in a browser. Read off
  // `useMounted` rather than an effect so the first client render is already
  // the right one.
  const origin = mounted ? window.location.origin : undefined;
  const canShare = mounted && typeof navigator.share === "function";

  const message = useMemo(
    () => buildShareMessage(releases, { origin }),
    [releases, origin],
  );

  const whatsapp = useMemo(() => buildWhatsAppLink(message), [message]);

  useEffect(() => {
    if (!open) return;

    /* Escape and Tab both belong to the topmost dialog, and the expanded
       reading underneath listens for both on `document` as well. Registered in
       the capture phase and stopped there, so one press is one step back —
       preview, then share mode, then the grid, then the panel — rather than
       the whole stack unwinding at once. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;

      event.stopPropagation();

      if (event.key === "Escape") onClose();
      else keepFocusInside(event, sheetRef.current);
    };

    document.addEventListener("keydown", onKey, true);

    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    sheetRef.current?.querySelector<HTMLElement>(".share-preview-close")?.focus();
  }, [open]);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        copyViaTextarea(message);
      }
      setNote({ text: DGIPR_SHARE_MR.copied, key: Date.now() });
    } catch {
      setNote({ text: DGIPR_SHARE_MR.copyFailed, key: Date.now() });
    }
  }

  async function handleDeviceShare() {
    try {
      await navigator.share({ title: DGIPR_SHARE_MR.directorate, text: message });
      setNote({ text: DGIPR_SHARE_MR.shared, key: Date.now() });
    } catch (error) {
      // Dismissing the OS sheet is a normal outcome, not a failure.
      if ((error as Error)?.name !== "AbortError") {
        setNote({ text: DGIPR_SHARE_MR.shareFailed, key: Date.now() });
      }
    }
  }

  function handleWhatsApp() {
    window.open(whatsapp.url, "_blank", "noopener,noreferrer");
    setNote({ text: DGIPR_SHARE_MR.whatsappOpened, key: Date.now() });
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="share-preview-layer">
          <motion.div
            className="share-preview-scrim"
            variants={SCRIM}
            initial="hidden"
            animate="shown"
            exit="gone"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            ref={sheetRef}
            className="share-preview-sheet"
            lang="mr"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            variants={SHEET}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            <header className="share-preview-head">
              <div className="share-preview-heading">
                <h2 id={titleId} className="share-preview-title">
                  {DGIPR_SHARE_MR.previewTitle}
                </h2>

                <p className="share-preview-tally">
                  {selectedCountMr(releases.length)} ·{" "}
                  {charCountMr(messageLength(message))}
                </p>
              </div>

              <button
                type="button"
                className="news-panel-close share-preview-close"
                onClick={onClose}
                aria-label={DGIPR_SHARE_MR.close}
                title={DGIPR_SHARE_MR.close}
              >
                <X size={17} strokeWidth={2.2} aria-hidden />
              </button>
            </header>

            <div className="share-preview-body">
              {whatsapp.exceedsSafeLength ? (
                <div className="share-preview-warn" role="status">
                  <TriangleAlert size={15} strokeWidth={2.2} aria-hidden />
                  <div>
                    <p className="share-preview-warn-title">
                      {DGIPR_SHARE_MR.tooLongTitle}
                    </p>
                    <p className="share-preview-warn-note">{DGIPR_SHARE_MR.tooLong}</p>
                  </div>
                </div>
              ) : null}

              {/* Verbatim, in a `pre`: what is on screen is the string that
                  goes out, whitespace and asterisks included. */}
              <pre className="share-preview-message">{message}</pre>
            </div>

            <footer className="share-preview-foot">
              <div className="share-preview-actions">
                <button
                  type="button"
                  className="share-preview-action share-preview-action-primary"
                  onClick={handleWhatsApp}
                  aria-label={DGIPR_SHARE_MR.whatsappLong}
                  title={DGIPR_SHARE_MR.whatsappLong}
                >
                  <MessageCircle size={15} strokeWidth={2.2} aria-hidden />
                  {DGIPR_SHARE_MR.whatsapp}
                </button>

                <button
                  type="button"
                  className="share-preview-action"
                  onClick={handleCopy}
                  aria-label={DGIPR_SHARE_MR.copyLong}
                  title={DGIPR_SHARE_MR.copyLong}
                >
                  <Copy size={15} strokeWidth={2.2} aria-hidden />
                  {DGIPR_SHARE_MR.copy}
                </button>
              </div>

              {canShare ? (
                <button
                  type="button"
                  className="share-preview-action share-preview-action-block"
                  onClick={handleDeviceShare}
                >
                  <Share2 size={15} strokeWidth={2.2} aria-hidden />
                  {DGIPR_SHARE_MR.device}
                </button>
              ) : (
                <p className="share-preview-note">{DGIPR_SHARE_MR.deviceUnavailable}</p>
              )}

              <p className="share-preview-note" role="status" aria-live="polite">
                {note?.text ?? ""}
              </p>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** Clipboard fallback for browsers without the async clipboard API — and for
 *  the ones that have it but refuse it outside a secure context. */
function copyViaTextarea(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) throw new Error("copy command rejected");
  } finally {
    textarea.remove();
  }
}
