"use client";

import { motion, useSpring, type MotionValue } from "motion/react";
import { useState } from "react";

import { STATUS_META } from "@/lib/design/status";
import { countMr, districtMr, isStatewide, MR } from "@/lib/signals/marathi";
import type { PlacedSignal } from "@/types/signal";

const FOLLOW = { stiffness: 520, damping: 42, mass: 0.6 } as const;
/** Enough of the group to be worth naming; past this it is a list, not a plate. */
const MAX_LINES = 4;

type ClusterReadoutProps = {
  members: PlacedSignal[] | null;
  x: MotionValue<number>;
  y: MotionValue<number>;
  below?: boolean;
};

/**
 * The plate over a counter: how many records are under it, where they are, and
 * the first few headlines.
 *
 * A badge reading "७" is only useful if the reader can find out what the seven
 * are without committing to a click. Same mechanics as the other two plates —
 * mounted throughout, held over while it fades — and the same rule about what
 * goes on it: the district, then the records, then how to open them.
 */
export function ClusterReadout({ members, x, y, below }: ClusterReadoutProps) {
  const followX = useSpring(x, FOLLOW);
  const followY = useSpring(y, FOLLOW);

  const [shown, setShown] = useState<PlacedSignal[] | null>(members);
  const [wasVisible, setWasVisible] = useState(false);

  if (members && members !== shown) setShown(members);

  if (Boolean(members) !== wasVisible) {
    setWasVisible(Boolean(members));

    if (members) {
      followX.jump(x.get());
      followY.jump(y.get());
    }
  }

  if (!shown?.length) return null;

  // Statewide records contribute no district — they have none, and the point
  // under the counter was chosen rather than found. A counter holding only
  // those says so; one holding district records names them as it always did.
  const districts = [
    ...new Set(
      shown.flatMap((member) =>
        isStatewide(member.signal) ? [] : [member.signal.district],
      ),
    ),
  ];
  const rest = shown.length - MAX_LINES;

  return (
    <motion.div
      className="map-readout"
      style={{ x: followX, y: followY }}
      data-visible={members ? true : undefined}
      data-below={below || undefined}
      aria-hidden
    >
      <div className="map-readout-card cluster-readout-card" lang="mr">
        <p className="cluster-readout-head">
          <strong>{countMr(shown.length)}</strong>
          <span>
            {districts.length === 0
              ? MR.allMaharashtra
              : districts.length === 1
                ? `${districtMr(districts[0])} ${MR.district}`
                : districts.map(districtMr).join(", ")}
          </span>
        </p>

        <ul className="cluster-readout-list">
          {shown.slice(0, MAX_LINES).map((member) => (
            <li key={member.signal.id}>
              <span
                className="cluster-readout-dot"
                data-tone={STATUS_META[member.signal.status].tone}
              />
              {member.signal.card?.placeMr ?? member.signal.title}
            </li>
          ))}
        </ul>

        {rest > 0 ? <p className="cluster-readout-more">+ {countMr(rest)}</p> : null}

        <p className="cluster-readout-hint">{MR.openCluster}</p>
      </div>
    </motion.div>
  );
}
