"use client";

import { motion } from "motion/react";
import { Megaphone } from "lucide-react";
import { useState } from "react";

import { LeadModal } from "@/components/signals";
import { MR } from "@/lib/signals/marathi";

type LeadPlateProps = {
  /** Held back until the brand plate above it has finished arriving. */
  delay?: number;
};

/**
 * "Something happening near you?" — the way in for a reader who knows
 * something the pipeline does not.
 *
 * It sits under the legend and outside it on purpose. The legend is a closed
 * statement — this is what is on the map, in these sectors, in these districts
 * — and the moment an invitation is folded into it, the count above stops
 * reading as a fact and starts reading as a scoreboard somebody is being asked
 * to add to. As its own plate it answers the question the legend leaves: what
 * about the thing being built at the end of my road, which is on none of this.
 *
 * A whole card rather than a link, because the map is a field of clickable
 * things and a line of text among them is not one. It takes the highlight
 * yellow on the button alone, so it reads as the second most saturated object
 * on the sheet after the wordmark, and never competes with a pin.
 *
 * The plate itself is inert to the pointer — the map underneath must stay
 * pannable across it — and only the button takes clicks.
 */
export function LeadPlate({ delay = 0.55 }: LeadPlateProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.aside
        className="lead-plate"
        lang="mr"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay }}
      >
        <span className="lead-plate-icon" aria-hidden>
          <Megaphone size={17} strokeWidth={1.9} />
        </span>

        <div className="lead-plate-text">
          <p className="lead-plate-prompt">{MR.leadPrompt}</p>
          <p className="lead-plate-hint">{MR.leadHint}</p>
        </div>

        {/* Two labels, one button: the prompt beside it is hidden on a phone,
            where the plate is a pill in the bottom dock, and "click here" with
            nothing above it names no destination. Only one is ever drawn — see
            `.lead-plate-cta-short` — and `aria-label` says the whole thing at
            every width, so the button never depends on the prompt surviving. */}
        <button
          type="button"
          className="lead-plate-cta"
          aria-label={MR.leadPrompt}
          onClick={() => setOpen(true)}
        >
          <span className="lead-plate-cta-long">{MR.leadCta}</span>
          <span className="lead-plate-cta-short">{MR.leadCtaShort}</span>
        </button>
      </motion.aside>

      <LeadModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
