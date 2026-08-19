"use client";

import { motion } from "motion/react";
import { Map as MapIcon } from "lucide-react";

import { MR, toDevanagari } from "@/lib/signals/marathi";

type StatewideBadgeProps = {
  /** How many statewide records there are. Said on the badge, so the reader
   *  knows whether pressing it is worth the change of view. */
  count: number;
  active: boolean;
  onToggle: () => void;
  /** Held back until the map itself has arrived. */
  delay?: number;
};

/**
 * The one thing on this map that is not about a place.
 *
 * A loan waiver applies in Sindhudurg and in Gadchiroli; a drinking-water
 * policy is true of every village at once. Neither happened in a place, so the
 * category cannot be a filter over the pins already up — pressing this swaps
 * what the map is *about*, and the district pins go rather than dim.
 *
 * What comes up instead is the same kind of mark: three pins, spread one to a
 * division, each standing on a point an editor chose so the record has
 * somewhere to be. The sheet under them is what says they are not places — the
 * district hairlines fade and the coast thickens, so the mark stands on one
 * undivided state rather than in one of its parts — and every plate the pin
 * opens says `संपूर्ण महाराष्ट्र` where a district record names its village.
 *
 * It used to sit in the open water south-east of the coast, placed by percent
 * of the frame. That spot only reads as "off the map" at the resting zoom: the
 * control is painted over the sheet rather than in it, so zooming in slides the
 * coastline out from under it and leaves the disc stranded on land, looking
 * exactly like the pin it must never be mistaken for. It is a control, not a
 * mark, so it now sits where controls sit — docked to the frame's bottom-left,
 * above the attribution, held there whatever the camera does. That corner and
 * not one of the others because the legend owns the top-left, the zoom cluster
 * the bottom-right, and the record panel takes the whole right side of the
 * frame the moment it opens — which is precisely when this control has to still
 * be reachable, since pressing it is how the reader leaves the view it opened.
 *
 * Off the sheet, it can afford to say its own name, so the word is set beside
 * the glyph instead of waiting for a hover that a touchscreen never sends. The
 * instruction above it is still held back — it changes with the state and is
 * only ever useful to somebody already considering the press. Yellow only when
 * it is on: the accent is how this product says "this is the thing currently in
 * force".
 */
export function StatewideBadge({
  count,
  active,
  onToggle,
  delay = 0.7,
}: StatewideBadgeProps) {
  return (
    <motion.button
      type="button"
      className="statewide-badge"
      lang="mr"
      data-active={active || undefined}
      aria-pressed={active}
      /* The pill shows its name and a count; the name it is announced by has to
         carry the instruction the caption only shows on hover. */
      aria-label={`${MR.statewide} — ${active ? MR.statewideBack : MR.statewideHint}`}
      onClick={onToggle}
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
    >
      <span className="statewide-badge-mark" aria-hidden>
        <MapIcon size={17} strokeWidth={1.9} />
      </span>

      <span className="statewide-badge-word">{MR.statewide}</span>

      <span className="statewide-badge-count numeric" aria-hidden>
        {toDevanagari(count)}
      </span>

      {/* The instruction, docked under the pill rather than set inside it, so
          the pill keeps one line whatever the words measure. Hidden from the
          accessibility tree — `aria-label` above already says all of this. */}
      <span className="statewide-badge-hint" aria-hidden>
        {active ? MR.statewideBack : MR.statewideHint}
      </span>
    </motion.button>
  );
}
