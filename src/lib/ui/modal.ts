"use client";

import { useSyncExternalStore } from "react";

/**
 * The two things every dialog in this product needs and neither of them is
 * about what the dialog says.
 *
 * They were private to `signals/modal-sheet.tsx` until the panels grew an
 * expanded reading, at which point there were two portalled dialogs in the
 * repo and one of them would eventually have been the one with the broken
 * focus trap. A focus trap is exactly the kind of code that is never looked at
 * again once it works, so there is one of it.
 */

/** A portal needs a `document`, and the server has not got one. Read as an
 *  external store rather than an effect: the server snapshot is `false`, the
 *  client snapshot is `true`, and there is no cascading render to pay for. */
const NEVER_CHANGES = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/** Holds Tab inside the sheet by wrapping it at either end. */
export function keepFocusInside(event: KeyboardEvent, sheet: HTMLElement | null) {
  if (!sheet) return;

  const focusable = [
    ...sheet.querySelectorAll<HTMLElement>(
      "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])",
    ),
  ].filter((node) => !node.hasAttribute("disabled"));

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
