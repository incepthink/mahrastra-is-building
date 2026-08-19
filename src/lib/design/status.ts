import type { SignalStatus } from "@/types/signal";

/** Visual tone names. The record panel and the map markers both read from
 *  here, so a status only ever has to be recoloured in one place. */
export type Tone = "neutral" | "announced" | "sanctioned" | "progress" | "completed" | "operational";

type StatusMeta = {
  tone: Tone;
  label: string;
  labelMr: string;
  /** One or two syllables, for the stage meter where five labels share a row. */
  shortMr: string;
};

export const STATUS_META: Record<SignalStatus, StatusMeta> = {
  announced: { tone: "announced", label: "Announced", labelMr: "घोषित", shortMr: "घोषित" },
  sanctioned: { tone: "sanctioned", label: "Sanctioned", labelMr: "मंजूर", shortMr: "मंजूर" },
  "in-progress": {
    tone: "progress",
    label: "In progress",
    labelMr: "प्रगतिपथावर",
    shortMr: "सुरू",
  },
  completed: { tone: "completed", label: "Completed", labelMr: "पूर्ण", shortMr: "पूर्ण" },
  operational: { tone: "operational", label: "Operational", labelMr: "कार्यरत", shortMr: "कार्यरत" },
};

/** The tone as a paintable value. Components — SVG markers included — read
 *  colour from here rather than composing `var(--color-status-…)` themselves. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--color-ink-400)",
  announced: "var(--color-status-announced)",
  sanctioned: "var(--color-status-sanctioned)",
  progress: "var(--color-status-progress)",
  completed: "var(--color-status-completed)",
  operational: "var(--color-status-operational)",
};

/* `LIGHT_TONES` used to live here: the set of statuses pale enough that a glyph
   on them had to be dark rather than white. Nothing reads it now. Status ink no
   longer sits *under* a glyph anywhere — it rings the sector plate on a pin and
   on the record mark, and the plate is always a pastel, so the glyph is always
   dark. Reintroduce it the day something paints a glyph on a status again. */

/** The five statuses in the order work actually moves through them. Drives the
 *  stage meter in the detail panel, so "where is this up to" is one glance. */
export const STATUS_LADDER: SignalStatus[] = [
  "announced",
  "sanctioned",
  "in-progress",
  "completed",
  "operational",
];

/** How far along the ladder a record is, 0-based. `-1` if the status is not on
 *  it, which the meter renders as "nothing reached yet" rather than throwing. */
export function stageIndex(status: SignalStatus): number {
  return STATUS_LADDER.indexOf(status);
}
