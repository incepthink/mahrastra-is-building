"use client";

import type { MotionValue } from "motion/react";

import { stemPath } from "./stem";
import { useCounterScale } from "./use-counter-scale";
import { STATUS_META, TONE_COLOR } from "@/lib/design/status";
import { CLUSTER_HEAD } from "@/lib/map/spread";
import { countMr, toDevanagari } from "@/lib/signals/marathi";
import type { PlacedSignal } from "@/types/signal";

/** How many status chips fit around the badge before they stop being readable. */
const MAX_CHIPS = 5;
/** One chip's side, and its pitch. Both track `CLUSTER_HEAD` so the row still
 *  fits inside the disc when the badge grows. */
const CHIP = 4.2;
const CHIP_STEP = 7;

type ClusterMarkerProps = {
  id: string;
  /** The middle of what the badge covers, in viewBox units. */
  point: [x: number, y: number];
  head: [x: number, y: number];
  members: PlacedSignal[];
  scale: MotionValue<number>;
  /** viewBox units per CSS pixel — keeps the badge one size on every screen. */
  unit: number;
  delay: number;
  onOpen: (id: string) => void;
  onEnter: (members: PlacedSignal[], event: React.PointerEvent<SVGGElement>) => void;
  onLeave: () => void;
  onMove: (event: React.PointerEvent<SVGGElement>) => void;
};

/**
 * Several records standing on one patch of ground, drawn as one counter.
 *
 * The badge is deliberately not a pin. It carries no sector plate and no status
 * ink of its own, because it is not describing a record — it is describing a
 * *view*, and the moment there is room on screen it splits back into the pins
 * it stands for. What it does carry is the number, in Devanagari, and a row of
 * small squares in the statuses inside it, so a reader can tell "four notices,
 * two of them already sanctioned" apart from "four announcements" without
 * opening anything.
 *
 * Depth is the house model: a solid ink plate offset behind the disc, the same
 * misregistration every panel in the product uses. It reads as a stack of
 * sheets, which is what the badge is.
 *
 * Clicking opens it in place. The camera does not move — same rule as opening a
 * record — the members simply fan out around the point they share.
 */
export function ClusterMarker({
  id,
  point,
  head,
  members,
  scale,
  unit,
  delay,
  onOpen,
  onEnter,
  onLeave,
  onMove,
}: ClusterMarkerProps) {
  const [headX, headY] = head;
  const stem = stemPath(headX, headY, CLUSTER_HEAD);
  const { ref, transform } = useCounterScale(point, scale, unit);

  const tones = members.slice(0, MAX_CHIPS).map((member) => STATUS_META[member.signal.status].tone);
  const chipSpan = tones.length * CHIP_STEP - (CHIP_STEP - CHIP);

  return (
    <g
      ref={ref}
      className="cluster-marker"
      transform={transform}
      role="button"
      tabIndex={0}
      aria-label={`${countMr(members.length)}. उघडण्यासाठी क्लिक करा.`}
      onClick={() => onOpen(id)}
      onPointerEnter={(event) => onEnter(members, event)}
      onPointerLeave={onLeave}
      onPointerMove={onMove}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(id);
      }}
    >
      <g style={{ animationDelay: `${delay}ms` }}>
        {/* The anchor is the middle of the group rather than any one record's
            coordinate, so it stays a hollow mark: a filled dot here would be
            claiming a point no notice actually named. */}
        <circle className="cluster-anchor" cx="0" cy="0" r="3" />

        <g className="cluster-body">
          <path className="signal-stem" d={stem} />

          {/* A solid ink disc used to sit here, offset behind the head — the
              registration misprint that was this product's whole depth model.
              Depth is a soft cast now, and the head carries its own; a second
              disc behind it would just be a dark crescent. */}
          <circle className="cluster-head" cx={headX} cy={headY} r={CLUSTER_HEAD} />

          <text className="cluster-count" x={headX} y={headY - 2} lang="mr">
            {toDevanagari(members.length)}
          </text>

          {/* What is inside, one square per record, in status order as given. */}
          <g className="cluster-chips">
            {tones.map((tone, index) => (
              <rect
                key={index}
                x={headX - chipSpan / 2 + index * CHIP_STEP}
                y={headY + 8}
                width={CHIP}
                height={CHIP}
                rx={0.6}
                style={{ fill: TONE_COLOR[tone] }}
              />
            ))}
          </g>
        </g>

        {/* Kept last and transparent, so hover never falls through to the
            district underneath. */}
        <circle
          className="signal-hit"
          cx={headX}
          cy={headY}
          r={CLUSTER_HEAD + 9}
        />
      </g>
    </g>
  );
}
