"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Flag, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ReportModal } from "./report-modal";
import { StageMeter } from "./stage-meter";
import { STATUS_META, TONE_COLOR } from "@/lib/design/status";
import { categoryOf } from "@/lib/signals/format";
import {
  agencyMr,
  categoryMr,
  deadlineMr,
  deadlineState,
  formatDateMr,
  gistMr,
  headlineMr,
  impactMr,
  MR,
  placeMr,
  toDevanagari,
} from "@/lib/signals/marathi";
import { composerUrl, sharePostFor, type SharePost } from "@/lib/signals/share";
import { useToday } from "@/lib/signals/use-today";
import type { AnySignal } from "@/types/signal";

const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

/**
 * The panel arrives as one object, then hands its sections in behind it. It
 * enters from whichever edge it is docked to — the side on a wide screen, the
 * bottom once it has become a sheet.
 */
const panelVariants = (sheet: boolean) => ({
  hidden: sheet ? { opacity: 0, y: 48 } : { opacity: 0, x: 40 },
  shown: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { ...SPRING, staggerChildren: 0.055, delayChildren: 0.1 },
  },
  gone: sheet
    ? { opacity: 0, y: 32, transition: { duration: 0.18 } }
    : { opacity: 0, x: 28, transition: { duration: 0.18 } },
});

const SECTION = {
  hidden: { opacity: 0, y: 14 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  },
  gone: { opacity: 0 },
};

/**
 * Walking a fixed set rather than showing the one record that was clicked.
 *
 * Only the statewide view uses this: three policies with no pins to click
 * between, so the panel has to carry its own way from one to the next. A
 * district record deliberately does not get a stepper — the map is the
 * navigation there, and a next arrow would invent an order the pins do not
 * have.
 */
type PanelStep = {
  /** Zero-based, so the header says `१ / ३` by adding one at the last moment. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

type SignalPanelProps = {
  signal: AnySignal | null;
  onClose: () => void;
  step?: PanelStep;
};

/**
 * One record, in Marathi, in about a screenful.
 *
 * What this used to show: a five-stage status ladder, a six-row ledger with
 * coordinates and a copy button, a provenance list grading four fields by how
 * they were derived, a language toggle and a reading-progress rule. All of it
 * true, none of it what someone standing in Morgaon wants to know. The
 * question a reader actually arrives with is "what is happening to this land,
 * and does it affect me" — so the panel answers that in three blocks — how far
 * along, what it says, when it closes — then hands over to the original
 * notice, which is the only authority here anyway.
 *
 * The plain Marathi comes from `signal.card`, written offline by
 * `scripts/enrich-marathi.mjs`. Where a card is missing the notice's own
 * wording shows through unchanged, so the panel never renders a gap.
 */
export function SignalPanel({ signal, onClose, step }: SignalPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheet = useIsSheet();
  const today = useToday();
  // Which record the report sheet is open on, rather than a bare flag: a
  // report belongs to one record, so switching records — or closing the panel
  // out from under the sheet — closes it with no reset to remember.
  const [reportingId, setReportingId] = useState<string | null>(null);
  // Null for every record but the one that has a written post. See share.ts.
  const share = signal ? sharePostFor(signal) : null;

  // Opening a record moves focus to the panel; stepping through a set does
  // not, because the reader's focus is on the arrow they are pressing and
  // taking it away would mean re-finding that arrow for every step.
  useEffect(() => {
    if (signal && !step) closeRef.current?.focus();
  }, [signal, step]);

  return (
    <>
      <AnimatePresence>
        {signal ? (
          <motion.aside
            /* Stepping through a set is one panel changing its contents, not
               four panels arriving one after another, so the key is the set
               while a stepper is present. The sheet inside re-enters on its
               own key; the plate itself never leaves. */
            key={step ? "record-set" : signal.id}
            className="record"
            lang="mr"
            role="dialog"
            aria-labelledby="record-title"
            style={
              {
                "--tone": TONE_COLOR[STATUS_META[signal.status].tone],
                // The head takes the sector's plate, so the panel opens in the
                // same colour as the collar of the pin that opened it.
                "--sector": categoryOf(signal.category).tint,
              } as React.CSSProperties
            }
            variants={panelVariants(sheet)}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            {/* The record's status, painted down the panel's leading edge. It is
                the only structural use of colour in here. */}
            <span className="record-edge" aria-hidden />

            {step ? (
              <nav className="record-step" aria-label={MR.statewide}>
                <button
                  type="button"
                  className="record-step-arrow"
                  onClick={step.onPrev}
                  aria-label={MR.prevRecord}
                >
                  <ChevronLeft size={15} strokeWidth={2} aria-hidden />
                </button>

                <p className="record-step-count numeric" aria-live="polite">
                  {toDevanagari(step.index + 1)} / {toDevanagari(step.total)}
                </p>

                <button
                  type="button"
                  className="record-step-arrow"
                  onClick={step.onNext}
                  aria-label={MR.nextRecord}
                >
                  <ChevronRight size={15} strokeWidth={2} aria-hidden />
                </button>
              </nav>
            ) : null}

            <button
              ref={closeRef}
              type="button"
              className="record-close"
              onClick={onClose}
              aria-label={MR.close}
            >
              <X size={15} strokeWidth={2} aria-hidden />
            </button>

            {/* One record's worth of sheet. Keyed by the record so that
                stepping re-runs the stagger inside a panel that itself stays
                put — the contents change, the plate does not. */}
            <motion.div
              key={signal.id}
              className="record-sheet"
              variants={{
                shown: { transition: { staggerChildren: 0.055 } },
              }}
              initial="hidden"
              animate="shown"
            >
              <motion.header className="record-head" variants={SECTION}>
                <div className="record-identity">
                  {/* The pin, redrawn at panel size: one disc in the sector plate,
                      the sector glyph on it. Same shape, same colour, so the panel
                      and the mark that opened it are one object at two sizes rather
                      than two things that happen to be about the same record. */}
                  <span className="record-mark" aria-hidden>
                    <CategoryGlyph signal={signal} />
                  </span>

                  <p className="record-meta">
                    <span className="record-status">{STATUS_META[signal.status].labelMr}</span>
                    <span className="record-meta-sep" aria-hidden />
                    <span className="record-category">{categoryMr(signal)}</span>
                  </p>
                </div>

                <h2 id="record-title" className="record-title">
                  {headlineMr(signal)}
                </h2>

                <p className="record-place">
                  <MapPin size={13} strokeWidth={1.9} aria-hidden />
                  {placeMr(signal)}
                </p>
              </motion.header>

              <div className="record-body">
                {/* How far along, before what it says — a reader scanning the panel
                    wants the stage first and the wording second. */}
                <motion.div variants={SECTION}>
                  <StageMeter status={signal.status} />
              </motion.div>

              <motion.p className="record-gist" variants={SECTION}>
                {gistMr(signal)}
              </motion.p>

              {/* The notice says what it says; this says what it does to you. It
                  is set apart rather than run on from the gist because the two
                  are different kinds of claim — one is a summary of a published
                  document, the other is a reading of it. */}
              {impactMr(signal) ? (
                <motion.aside className="record-meaning" variants={SECTION}>
                  <p className="record-meaning-label">{MR.meaning}</p>
                  <p className="record-meaning-text">{impactMr(signal)}</p>
                </motion.aside>
              ) : null}

              <motion.dl className="record-facts" variants={SECTION}>
                <Fact label="दिनांक" value={formatDateMr(signal.publishedAt) ?? signal.publishedAt} />

                {signal.provenance?.validUntil ? (
                  <Fact
                    label={MR.deadline}
                    value={deadlineMr(signal.provenance.validUntil, today) ?? ""}
                    state={deadlineState(signal.provenance.validUntil, today)}
                  />
                ) : null}

                {/* Last, and wide: "who is doing this" is the fact a reader needs
                    once they have decided the notice concerns them, and the
                    agency names are too long to sit in a 5rem label column. */}
                <Fact label={MR.agency} value={agencyMr(signal) ?? ""} wide />
              </motion.dl>
            </div>

            <motion.footer className="record-foot" variants={SECTION}>
              {sourceUrl(signal) ? (
                <a
                  className="record-source"
                  href={sourceUrl(signal)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {MR.openNotice}
                  <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden />
                </a>
              ) : null}

              {/* Under the notice link, and quieter than it: the source is what
                  most readers came for, and these are for the reader who has
                  already read it — one who spotted a mistake in it, one who
                  wants to pass it on. A second filled plate here would read as
                  a choice equal to the notice, and neither of these is. */}
              <div className="record-actions">
                <button
                  type="button"
                  className="record-action record-report"
                  onClick={() => setReportingId(signal.id)}
                >
                  <Flag size={13} strokeWidth={1.9} aria-hidden />
                  {MR.report}
                </button>

                {share ? (
                  <button
                    type="button"
                    className="record-action record-share"
                    onClick={() => postToX(share)}
                  >
                    <XGlyph />
                    {MR.share}
                  </button>
                ) : null}
              </div>
            </motion.footer>
            </motion.div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <ReportModal
        signal={signal}
        open={signal !== null && reportingId === signal.id}
        onClose={() => setReportingId(null)}
      />
    </>
  );
}

/** The sector's icon, the same one its pin carries on the map. */
function CategoryGlyph({ signal }: { signal: AnySignal }) {
  const Icon = categoryOf(signal.category).icon;

  return <Icon size={19} strokeWidth={2} aria-hidden />;
}

/** One label-and-value line. `state` tints a deadline that is near or spent. */
function Fact({
  label,
  value,
  state,
  wide,
}: {
  label: string;
  value: string;
  state?: "open" | "closing" | "closed" | null;
  wide?: boolean;
}) {
  if (!value) return null;

  return (
    <div className="record-fact" data-state={state ?? undefined} data-wide={wide || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The PDF if the notice has one, else its page on the district site. Marathi
 *  page before English — the whole panel is Marathi, the link should land
 *  somewhere that stays Marathi. */
function sourceUrl(signal: AnySignal): string | undefined {
  return (
    signal.evidenceUrl ?? signal.provenance?.detailUrlMr ?? signal.provenance?.detailUrl
  );
}

/**
 * Hands the reader the card, then opens the composer with the words in it.
 *
 * X has no way to receive an image through an intent link — the composer takes
 * text and a URL and nothing else — so the picture cannot be attached for the
 * reader; it can only be put where they can attach it themselves, which is
 * their downloads folder. Hence two steps for what reads as one button.
 *
 * Neither step may wait on the other. Both have to happen inside the task the
 * click started, because a `window.open` that resumes after an await is a popup
 * with no gesture behind it and browsers block it — which is why the image is a
 * static file linked directly rather than fetched into a blob.
 */
function postToX(post: SharePost) {
  const link = document.createElement("a");

  link.href = post.image.src;
  link.download = post.image.filename;
  document.body.append(link);
  link.click();
  link.remove();

  window.open(composerUrl(post), "_blank", "noopener,noreferrer");
}

/** X's mark. Drawn here because lucide dropped its brand icons at v1, and a
 *  generic share arrow would not say which composer the button opens. */
function XGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Matches the breakpoint in `signals.css` where the panel becomes a sheet. */
function useIsSheet(): boolean {
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 64rem)");
    const sync = () => setSheet(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  return sheet;
}
