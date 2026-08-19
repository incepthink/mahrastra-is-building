"use client";

import { motion, useSpring, type MotionValue } from "motion/react";
import { useState } from "react";

import type { DistrictShape } from "@/types/map";

const FOLLOW = { stiffness: 520, damping: 42, mass: 0.6 } as const;

type DistrictReadoutProps = {
  district: DistrictShape | null;
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Flip under the pointer — there is no room for the plate above it. */
  below?: boolean;
};

/**
 * The district's name in Marathi, trailing the pointer. Nothing else.
 *
 * It used to carry the division and the romanised name too, which meant three
 * lines answering a question nobody asked — you already know which state you
 * are looking at. One word is the whole job.
 *
 * The plate stays mounted and only toggles visibility, so moving between
 * neighbours swaps the word without a remount flicker; the spring is what
 * makes it feel attached to the cursor rather than chasing it.
 */
export function DistrictReadout({ district, x, y, below }: DistrictReadoutProps) {
  const followX = useSpring(x, FOLLOW);
  const followY = useSpring(y, FOLLOW);

  // Held over while the plate fades out, so the word does not vanish mid-fade.
  const [shown, setShown] = useState<DistrictShape | null>(district);
  const [wasVisible, setWasVisible] = useState(false);

  if (district && district.id !== shown?.id) setShown(district);

  if (Boolean(district) !== wasVisible) {
    setWasVisible(Boolean(district));

    // Appearing somewhere new should not drag a visible plate across the map.
    if (district) {
      followX.jump(x.get());
      followY.jump(y.get());
    }
  }

  if (!shown) return null;

  return (
    <motion.div
      className="map-readout"
      style={{ x: followX, y: followY }}
      data-visible={district ? true : undefined}
      data-below={below || undefined}
      aria-hidden
    >
      <div className="map-readout-card district-readout-card">
        <span lang="mr" className="district-readout-name">
          {shown.nameMr}
        </span>
      </div>
    </motion.div>
  );
}
