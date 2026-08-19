"use client";

import { ModalSheet } from "./modal-sheet";
import { CATEGORIES } from "@/data/categories";
import { MR } from "@/lib/signals/marathi";

type LeadModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * "I know something you don't" — the form for sending it in.
 *
 * The mirror of `ReportModal`, and deliberately the same object: the map's two
 * conversations with a reader are "this record is wrong" and "here is one you
 * haven't got", and a reader should not have to learn two interfaces to have
 * either. Same sheet, same press, same footer — see `ModalSheet`.
 *
 * What differs is that this one is about nowhere in particular, so it asks for
 * a place rather than naming one, and it asks for a link. That last field is
 * the whole point of the pilot's method: every pin on this map comes from a
 * published notice, and a lead with something to check against can become a
 * record where a lead without one can only become a phone call. It is optional
 * anyway — somebody watching a road get built has seen something real whether
 * or not the district has posted about it yet.
 *
 * The sectors are the map's own ten, so a lead arrives already filed under the
 * plate it would be pinned in.
 *
 * Not wired to anything, on the same terms as the report sheet: submitting
 * closes it, and there is no success screen for a message that went nowhere.
 * When there is an endpoint, the submit handler is the only thing that changes.
 */
export function LeadModal({ open, onClose }: LeadModalProps) {
  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={MR.leadTitle}
      intro={MR.leadIntro}
      note={MR.leadNote}
      submitLabel={MR.leadSubmit}
      formId="lead-form"
    >
      <form id="lead-form" className="report-form" onSubmit={handleSubmit}>
        <div className="report-field">
          <label className="report-label" htmlFor="lead-place">
            {MR.leadPlace}
          </label>
          <p className="report-hint">{MR.leadPlaceHint}</p>
          <input
            id="lead-place"
            name="place"
            className="report-input"
            type="text"
            autoComplete="off"
            placeholder={MR.leadPlacePlaceholder}
          />
        </div>

        <fieldset className="report-field">
          <legend className="report-label">{MR.leadKind}</legend>

          {/* The ten sectors, each on its own plate — the same discs the legend
              above this form is keyed to, so choosing one is choosing where the
              pin would go rather than picking a word off a list. */}
          <div className="lead-sectors">
            {CATEGORIES.map((category, index) => (
              <label
                key={category.id}
                className="lead-sector"
                style={{ "--sector": category.tint } as React.CSSProperties}
              >
                <input
                  type="radio"
                  name="category"
                  value={category.id}
                  defaultChecked={index === 0}
                />
                <span className="lead-sector-icon" aria-hidden>
                  <category.icon size={15} strokeWidth={1.9} />
                </span>
                <span className="lead-sector-word">{category.labelMr}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="report-field">
          <label className="report-label" htmlFor="lead-details">
            {MR.leadDetails}
          </label>
          <p className="report-hint">{MR.leadDetailsHint}</p>
          <textarea
            id="lead-details"
            name="details"
            className="report-input"
            rows={3}
            placeholder={MR.leadDetailsPlaceholder}
          />
        </div>

        <div className="report-field">
          <label className="report-label" htmlFor="lead-source">
            {MR.leadSource}
            <span className="report-optional">{MR.reportOptional}</span>
          </label>
          <p className="report-hint">{MR.leadSourceHint}</p>
          <input
            id="lead-source"
            name="source"
            className="report-input"
            type="url"
            autoComplete="off"
            placeholder={MR.leadSourcePlaceholder}
          />
        </div>

        <div className="report-field">
          <label className="report-label" htmlFor="lead-contact">
            {MR.reportContact}
            <span className="report-optional">{MR.reportOptional}</span>
          </label>
          <p className="report-hint">{MR.reportContactHint}</p>
          <input
            id="lead-contact"
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
