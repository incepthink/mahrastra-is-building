"use client";

import { ModalSheet } from "./modal-sheet";
import { categoryOf } from "@/lib/signals/format";
import { headlineMr, placeMr, MR, REPORT_KINDS } from "@/lib/signals/marathi";
import type { Signal } from "@/types/signal";

type ReportModalProps = {
  /** The record being reported on. */
  signal: Signal | null;
  open: boolean;
  onClose: () => void;
};

/**
 * "Something on this record is wrong" — the form for saying so.
 *
 * Deliberately not wired to anything. Submitting stops the browser and closes
 * the sheet; there is no endpoint, no pending state and no success screen
 * claiming a report was filed, because a confirmation for a message that went
 * nowhere is worse than no confirmation at all. When there is somewhere to
 * send this, the only thing that changes is the submit handler.
 *
 * The dialog itself — portal, scrim, focus trap, head plate, footer — is
 * `ModalSheet`, shared with the sheet that takes a reader's own information.
 * All that is left here is the four things a correction can be about, and the
 * record it is about.
 */
export function ReportModal({ signal, open, onClose }: ReportModalProps) {
  if (!signal) return null;

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={MR.reportTitle}
      intro={MR.reportIntro}
      // The head takes the record's sector plate, so the dialog reads as having
      // come out of the panel rather than as a system prompt dropped over the
      // map.
      sector={categoryOf(signal.category).tint}
      note={MR.reportNote}
      submitLabel={MR.reportSubmit}
      formId="report-form"
    >
      {/* Which record this is about, stated rather than assumed: the sheet
          covers the panel, so by the time somebody starts typing they can no
          longer see what they clicked. */}
      <p className="report-subject">
        <span className="report-subject-label">{MR.reportOn}</span>
        <span className="report-subject-title">{headlineMr(signal)}</span>
        <span className="report-subject-place">{placeMr(signal)}</span>
      </p>

      <form id="report-form" className="report-form" onSubmit={handleSubmit}>
        <fieldset className="report-field">
          <legend className="report-label">{MR.reportKind}</legend>

          <div className="report-kinds">
            {REPORT_KINDS.map((kind, index) => (
              <label key={kind.id} className="report-kind">
                <input
                  type="radio"
                  name="kind"
                  value={kind.id}
                  defaultChecked={index === 0}
                />
                <span className="report-kind-box" aria-hidden />
                <span className="report-kind-word">{kind.labelMr}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="report-field">
          <label className="report-label" htmlFor="report-details">
            {MR.reportDetails}
          </label>
          <p className="report-hint">{MR.reportDetailsHint}</p>
          <textarea
            id="report-details"
            name="details"
            className="report-input"
            rows={3}
            placeholder={MR.reportDetailsPlaceholder}
          />
        </div>

        <div className="report-field">
          <label className="report-label" htmlFor="report-contact">
            {MR.reportContact}
            <span className="report-optional">{MR.reportOptional}</span>
          </label>
          <p className="report-hint">{MR.reportContactHint}</p>
          <input
            id="report-contact"
            name="contact"
            className="report-input"
            type="text"
            autoComplete="off"
            placeholder={MR.reportContactPlaceholder}
          />
        </div>
      </form>
    </ModalSheet>
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Nothing is sent anywhere yet. Stop the browser navigating and close.
    event.preventDefault();
    onClose();
  }
}
