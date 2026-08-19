"use client";

import { motion, useSpring, type MotionValue } from "motion/react";
import { useState } from "react";

import { STATUS_META } from "@/lib/design/status";
import { headlineMr, placeMr } from "@/lib/signals/marathi";
import type { AnySignal } from "@/types/signal";

const FOLLOW = { stiffness: 520, damping: 42, mass: 0.6 } as const;

type SignalReadoutProps = {
  signal: AnySignal | null;
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Flip under the pointer — there is no room for the plate above it. */
  below?: boolean;
};

/**
 * The plate over a pin. Same mechanics as `DistrictReadout` — mounted
 * throughout, held over while it fades — but a pin needs three lines rather
 * than one: a district name tells you nothing about whether the record under
 * your cursor is worth opening.
 *
 * Takes either kind of record. A statewide pin stands on a chosen point rather
 * than a found one, and this is the first place that has to not lie about it —
 * `placeMr` answers `संपूर्ण महाराष्ट्र` for those, so the plate names the reach
 * of the policy and never the district the pin happens to be sitting in.
 */
export function SignalReadout({ signal, x, y, below }: SignalReadoutProps) {
  const followX = useSpring(x, FOLLOW);
  const followY = useSpring(y, FOLLOW);

  const [shown, setShown] = useState<AnySignal | null>(signal);
  const [wasVisible, setWasVisible] = useState(false);

  if (signal && signal.id !== shown?.id) setShown(signal);

  if (Boolean(signal) !== wasVisible) {
    setWasVisible(Boolean(signal));

    if (signal) {
      followX.jump(x.get());
      followY.jump(y.get());
    }
  }

  if (!shown) return null;

  const status = STATUS_META[shown.status];

  return (
    <motion.div
      className="map-readout"
      style={{ x: followX, y: followY }}
      data-visible={signal ? true : undefined}
      data-below={below || undefined}
      aria-hidden
    >
      <div className="map-readout-card signal-readout-card" lang="mr">
        <p className="signal-readout-status" data-tone={status.tone}>
          <span className="signal-readout-dot" />
          {status.labelMr}
        </p>

        <p className="signal-readout-title">{headlineMr(shown)}</p>
        <p className="signal-readout-place">{placeMr(shown)}</p>
      </div>
    </motion.div>
  );
}
