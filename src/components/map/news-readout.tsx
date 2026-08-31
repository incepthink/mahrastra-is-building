"use client";

import { motion, useSpring, type MotionValue } from "motion/react";
import { useState } from "react";

import { articleCountMr, districtNameMr, NEWS_MR } from "@/lib/news/marathi";
import type { DistrictNews } from "@/types/news";

const FOLLOW = { stiffness: 520, damping: 42, mass: 0.6 } as const;

type NewsReadoutProps = {
  districtId: string | null;
  news: DistrictNews | undefined;
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Flip under the pointer — there is no room for the plate above it. */
  below?: boolean;
};

/**
 * What is under the pointer: the district, how much came out of it, and the
 * one story the papers pushed hardest from there.
 *
 * The district plate this replaces said the name and nothing else, which was
 * the whole job when the districts were only the lines between the pins. They
 * are the data now — a district's colour is a number, and a reader looking at
 * a dark shape wants to know what the number is before deciding whether to
 * click. So the plate answers that, and then earns the click by showing the
 * lead headline: hovering the map is how you skim the state.
 *
 * Truncation is by line clamp rather than by cutting the string, so a headline
 * is never broken mid-word and never has an ellipsis invented for it.
 *
 * Stays mounted and only toggles visibility, so moving between neighbours
 * swaps the contents without a remount flicker; the spring is what makes it
 * feel attached to the cursor rather than chasing it.
 */
export function NewsReadout({ districtId, news, x, y, below }: NewsReadoutProps) {
  const followX = useSpring(x, FOLLOW);
  const followY = useSpring(y, FOLLOW);

  // Held over while the plate fades out, so the contents do not vanish
  // mid-fade and leave an empty card sliding away.
  const [shown, setShown] = useState<{ id: string; news: DistrictNews | undefined } | null>(
    districtId ? { id: districtId, news } : null,
  );
  const [wasVisible, setWasVisible] = useState(false);

  // Re-latched on the data as well as on the district. The reader can change
  // the window while the pointer is sitting still over Nagpur, and keying only
  // on the id would leave the plate quoting the old window's count under the
  // new window's colour.
  if (districtId && (districtId !== shown?.id || news !== shown?.news)) {
    setShown({ id: districtId, news });
  }

  if (Boolean(districtId) !== wasVisible) {
    setWasVisible(Boolean(districtId));

    // Appearing somewhere new should not drag a visible plate across the map.
    if (districtId) {
      followX.jump(x.get());
      followY.jump(y.get());
    }
  }

  if (!shown) return null;

  const count = shown.news?.count ?? 0;
  const lead = shown.news?.lead ?? null;

  return (
    <motion.div
      className="map-readout"
      style={{ x: followX, y: followY }}
      data-visible={districtId ? true : undefined}
      data-below={below || undefined}
      aria-hidden
    >
      <div className="map-readout-card news-readout-card" lang="mr">
        <p className="news-readout-head">
          <span className="news-readout-name">{districtNameMr(shown.id)}</span>
          <span className="news-readout-count" data-empty={count === 0 || undefined}>
            {count === 0 ? NEWS_MR.noNews : articleCountMr(count)}
          </span>
        </p>

        {/* The lead is the reason to click, so it is the largest thing on the
            plate. A district with nothing in the window gets the head alone —
            an empty rule under an empty district is chrome. */}
        {lead ? <p className="news-readout-lead">{lead.headline}</p> : null}
      </div>
    </motion.div>
  );
}
