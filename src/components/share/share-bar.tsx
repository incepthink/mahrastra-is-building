"use client";

import { CheckCheck, Send, Share2, X } from "lucide-react";

import { DGIPR_SHARE_MR, selectedCountMr } from "@/lib/dgipr/marathi";

/**
 * The control strip at the foot of the expanded reading.
 *
 * It stands where the modal's credit line used to, and that is not a coincidence
 * — the credit said who issued these notices, which is now the first bold line
 * of the message this bar builds. The words did not disappear; they moved to
 * where they are actually read.
 *
 * Both states live in one component because they are one control: the bar is
 * always the bottom edge of the sheet, and turning share mode on adds a row to
 * it rather than replacing it with something else. A separate toggle in the
 * header would have put the way in and the way out at opposite ends of the
 * dialog.
 *
 * Not `position: fixed`, unlike the sibling repo's version. There the feed is
 * the page and the bar has to own the bottom of the screen; here the grid is
 * already inside a sheet that owns the screen, and a second fixed layer over it
 * would be a bar floating over a dialog it belongs to.
 */
export function ShareBar({
  active,
  selectedCount,
  eligibleCount,
  allSelected,
  onEnter,
  onSelectAll,
  onClear,
  onExit,
  onPreview,
}: {
  active: boolean;
  selectedCount: number;
  /** How many cards in the grid can be selected at all. */
  eligibleCount: number;
  allSelected: boolean;
  onEnter: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onPreview: () => void;
}) {
  return (
    <div className="share-bar">
      {active ? (
        <>
          <div className="share-bar-row">
            {/* Announced, because in share mode the count is the only thing on
                screen that changes when a card is tapped and the tap itself
                gives a screen reader nothing to go on. */}
            <p className="share-bar-count" aria-live="polite">
              {selectedCount > 0 ? selectedCountMr(selectedCount) : DGIPR_SHARE_MR.hint}
            </p>

            <button type="button" className="share-bar-exit" onClick={onExit}>
              <X size={15} strokeWidth={2.2} aria-hidden />
              {DGIPR_SHARE_MR.exit}
            </button>
          </div>

          <div className="share-bar-row">
            <button
              type="button"
              className="share-bar-select"
              onClick={allSelected ? onClear : onSelectAll}
              disabled={eligibleCount === 0 && selectedCount === 0}
            >
              <CheckCheck size={15} strokeWidth={2.2} aria-hidden />
              {allSelected ? DGIPR_SHARE_MR.clear : DGIPR_SHARE_MR.selectAll}
            </button>

            <button
              type="button"
              className="share-bar-send"
              onClick={onPreview}
              disabled={selectedCount === 0}
              aria-haspopup="dialog"
            >
              <Send size={15} strokeWidth={2.2} aria-hidden />
              {DGIPR_SHARE_MR.send}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="share-bar-enter" onClick={onEnter}>
          <Share2 size={15} strokeWidth={2.2} aria-hidden />
          {DGIPR_SHARE_MR.enter}
        </button>
      )}
    </div>
  );
}
