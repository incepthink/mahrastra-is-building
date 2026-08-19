"use client";

import type { MotionValue } from "motion/react";

import { stemPath } from "./stem";
import { useCounterScale } from "./use-counter-scale";
import { STATUS_META } from "@/lib/design/status";
import { HEAD } from "@/lib/map/spread";
import { categoryOf } from "@/lib/signals/format";
import { headlineMr } from "@/lib/signals/marathi";
import type { PlacedSignal } from "@/types/signal";

/** The sector glyph inside the head. Sized off `HEAD` so the two stay in
 *  proportion when the head grows — a glyph left at a fixed size inside a
 *  widening disc reads as a dot floating in a circle rather than as a mark on
 *  a plate. */
const GLYPH = Math.round(HEAD * 1.15);

type SignalMarkerProps = {
  placed: PlacedSignal;
  /** Where the head sits relative to the anchor, from `lib/map/cluster.ts`. */
  head: [x: number, y: number];
  /** The camera's zoom, inverted below so the pin keeps one size on screen. */
  scale: MotionValue<number>;
  isSelected: boolean;
  /** Staggers the drop-in when several pins share a view. */
  delay: number;
  /** viewBox units per CSS pixel — keeps the pin one size on every screen. */
  unit: number;
  onSelect: (placed: PlacedSignal) => void;
  onEnter: (placed: PlacedSignal, event: React.PointerEvent<SVGGElement>) => void;
  onLeave: (placed: PlacedSignal) => void;
  onMove: (event: React.PointerEvent<SVGGElement>) => void;
};

/**
 * One record, staked to its coordinate — a surveyor's mark, not a beacon.
 *
 * The anchor is a dot on the exact point, because the point is the claim being
 * made. The head is one disc in the record's **sector** plate, with the sector
 * glyph on it — the same mark, at the same size, as the row that names that
 * sector in the legend on the brand plate. Nothing glows and nothing pulses —
 * a pin that throbs reads as an alert, and none of these are alerts.
 *
 * The head used to carry a second fact: a collar in the record's status ink
 * around the disc. It went because it was the thing making the map unreadable
 * as a key. A pin was blue-with-a-green-hairline where the legend's `शेती` row
 * was solidly green, and a reader matching one against the other is matching
 * *areas* of colour — the hairline lost every time, so the map looked like it
 * used a different palette from its own legend. One disc, one colour, one
 * meaning.
 *
 * Status is not lost, it has moved off the pin: the readout plate on hover
 * names it, the counter badge still carries a chip per member, and the open
 * record paints it down the panel's leading edge and along its stage meter.
 *
 * The head does not sit straight above the anchor. `lib/map/cluster.ts` hands
 * each pin a head offset so that records too close together to draw are fanned
 * out around their shared anchor, and the stem is drawn along whatever angle
 * that produces. Only heads move; anchors never do. Records closer together
 * than a fan can rescue do not get a pin at all — they get a counter. Same
 * file.
 *
 * Everything is drawn around a (0, 0) origin and `useCounterScale` translates
 * the group to the projected point, so the counter-scale has a single clean
 * pivot: the exact location. Zoom in and the pin holds its size while the
 * ground moves under it — which is what makes the anchor mean something, and
 * what makes the fan tighten into real geography as you go in.
 */
export function SignalMarker({
  placed,
  head,
  scale,
  isSelected,
  delay,
  unit,
  onSelect,
  onEnter,
  onLeave,
  onMove,
}: SignalMarkerProps) {
  const { signal, point } = placed;
  const status = STATUS_META[signal.status];
  const category = categoryOf(signal.category);
  const Icon = category.icon;

  const [headX, headY] = head;
  const stem = stemPath(headX, headY, HEAD);
  const { ref, transform } = useCounterScale(point, scale, unit);

  return (
    <g
      ref={ref}
      className="signal-marker"
      transform={transform}
      data-selected={isSelected || undefined}
      data-tone={status.tone}
      role="button"
      tabIndex={0}
      aria-label={`${headlineMr(signal)}. ${status.labelMr}.`}
      aria-pressed={isSelected}
      onClick={() => onSelect(placed)}
      onPointerEnter={(event) => onEnter(placed, event)}
      onPointerLeave={() => onLeave(placed)}
      onPointerMove={onMove}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(placed);
      }}
    >
      <g style={{ animationDelay: `${delay}ms` }}>
        {/* The anchor. Several fanned pins can share one patch of ground, so
            the target ring would be several rings on one dot — it is held back
            for hover and selection, where it answers "which of these is mine". */}
        <circle className="signal-target" cx="0" cy="0" r="6.5" />
        <circle className="signal-anchor" cx="0" cy="0" r="2.1" />

        <g className="signal-body">
          <path className="signal-stem" d={stem} />

          {/* One disc, in the sector's pastel plate — the colour the legend
              keys, and the only colour on the pin. */}
          <circle
            className="signal-head"
            cx={headX}
            cy={headY}
            r={HEAD}
            style={{ fill: category.tint }}
          />
          <circle className="signal-head-ring" cx={headX} cy={headY} r={HEAD + 6} />

          <Icon
            className="signal-icon"
            x={headX - GLYPH / 2}
            y={headY - GLYPH / 2}
            width={GLYPH}
            height={GLYPH}
            strokeWidth={2}
            aria-hidden
          />
        </g>

        {/* Kept last and transparent: a target the size of the collar plus a
            touch margin, without swallowing hover over the districts around it. */}
        <circle className="signal-hit" cx={headX} cy={headY} r={HEAD + 8} />
      </g>
    </g>
  );
}
