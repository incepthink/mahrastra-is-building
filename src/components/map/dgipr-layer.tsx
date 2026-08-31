"use client";

import { type MotionValue } from "motion/react";
import { memo, useEffect, useMemo, useRef } from "react";

import { datelineMr, releaseCountMr } from "@/lib/dgipr/marathi";
import { toDevanagari } from "@/lib/news/marathi";
import type { DistrictShape } from "@/types/map";
import type { DgiprRelease } from "@/types/dgipr";

/**
 * How far a mark sits from its district's centroid when it has company, in
 * viewBox units. Deliberately tighter than `PinLayer`'s ring of 15: this layer
 * sits *over* that one, and two rosettes of the same radius around the same
 * centroid would interleave into one unreadable cluster.
 */
const RING = 9;
/** Marks per ring before a second ring opens outside the first. */
const PER_RING = 6;

type Placed = {
  release: DgiprRelease;
  districtId: string;
  at: [x: number, y: number];
};

type DgiprLayerProps = {
  /** Grouped by district on the server; unplaced releases never arrive here. */
  byDistrict: Record<string, DgiprRelease[]>;
  districts: DistrictShape[];
  /** The camera's zoom, which every mark counter-scales against. */
  scale: MotionValue<number>;
  selectedId: string | null;
  onSelect: (release: DgiprRelease) => void;
};

/**
 * Government press releases, marked at the precision a dateline supports.
 *
 * This is an **overlay**, not a mode. The heat/pins control answers "what is
 * this sheet coloured by", and both of its answers are about the same corpus of
 * scraped newspaper articles. A DGIPR release is a different kind of object
 * from a different source, so it is a different thing on the sheet that can be
 * switched on over either of them — which is also what a tag and a filter mean,
 * as against a third mode.
 *
 * **The mark keeps `PinLayer`'s grammar and changes its identity.** A release
 * carries a dateline and never a coordinate, so it is exactly as imprecise as a
 * district-tier story: a soft halo for the area, a dashed ring because the edge
 * of that area is not known either. What differs is a square core instead of a
 * round one and the official hue instead of the accent — so the two marks tell
 * the truth in the same words while never being mistaken for each other. A
 * sharp pin was never an option here; there is nothing to be sharp about.
 *
 * Where a district issued several releases the marks are stacked into one, and
 * that is not a compromise. Four of the five releases in the snapshot are
 * datelined Mumbai, and four halos fanned around one centroid would claim four
 * places in a district where the source named one. The stack carries its count
 * and opens the newest; the panel lists the rest.
 */
export const DgiprLayer = memo(function DgiprLayer({
  byDistrict,
  districts,
  scale,
  selectedId,
  onSelect,
}: DgiprLayerProps) {
  const placed = useMemo(() => place(byDistrict, districts), [byDistrict, districts]);

  return (
    <g className="map-dgipr">
      {placed.map(({ release, districtId, at }) => (
        <DgiprMark
          key={districtId}
          release={release}
          stacked={byDistrict[districtId]?.length ?? 1}
          at={at}
          scale={scale}
          selected={(byDistrict[districtId] ?? []).some((r) => r.id === selectedId)}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
});

/**
 * One mark per district, standing on the centroid, carrying the newest release.
 *
 * The ring machinery is kept for the day a release starts carrying something
 * finer than a dateline; today every release in a district collapses onto one
 * mark, so `fan` is called with a count of one and returns the centroid
 * unmoved.
 */
function place(
  byDistrict: Record<string, DgiprRelease[]>,
  districts: DistrictShape[],
): Placed[] {
  const centroids = new Map(districts.map((district) => [district.id, district.centroid]));
  const placed: Placed[] = [];

  for (const [districtId, releases] of Object.entries(byDistrict)) {
    const centroid = centroids.get(districtId);
    if (!centroid || releases.length === 0) continue;

    const [dx, dy] = fan(1, 0);

    placed.push({
      // Newest first is how the server hands them over, so this is the newest.
      release: releases[0],
      districtId,
      at: [centroid[0] + dx, centroid[1] + dy],
    });
  }

  return placed;
}

/** A deterministic rosette: one mark stays on the centroid, several ring it. */
function fan(count: number, index: number): [number, number] {
  if (count < 2) return [0, 0];

  const ring = Math.floor(index / PER_RING) + 1;
  const slot = index % PER_RING;
  const slots = Math.min(count - (ring - 1) * PER_RING, PER_RING);

  const angle = (slot / slots) * Math.PI * 2 - Math.PI / 2;

  return [Math.cos(angle) * RING * ring, Math.sin(angle) * RING * ring];
}

function DgiprMark({
  release,
  stacked,
  at,
  scale,
  selected,
  onSelect,
}: {
  release: DgiprRelease;
  /** How many releases this district issued in the window. */
  stacked: number;
  at: [x: number, y: number];
  scale: MotionValue<number>;
  selected: boolean;
  onSelect: (release: DgiprRelease) => void;
}) {
  const ref = useStake(at, scale);

  return (
    <g
      ref={ref}
      className="map-dgipr-mark"
      data-selected={selected || undefined}
      transform={`translate(${at[0]} ${at[1]})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(release)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        onSelect(release);
      }}
    >
      {/* The place, the count and the headline the mark opens — the same three
          things the panel opens with, so the tooltip and the panel never
          disagree about what the mark stands for. */}
      <title>
        {`${datelineMr(release)} — ${releaseCountMr(stacked)}: ${release.titleMr}`}
      </title>

      {/* No tip and no point, because a dateline is not a coordinate. The halo
          is the claim; the ring is dashed because the edge of the area is not
          known either. Both borrowed verbatim from the district-tier story
          mark — the claim really is the same one. */}
      <circle className="map-dgipr-halo" r="11.5" />
      <circle className="map-dgipr-ring" r="6.4" />

      {/* The one thing that differs: a square core, for an official notice.
          A shape rather than only a colour, so the layer survives being read
          without hue — printed, screenshotted, or by a reader who cannot
          separate violet from green. */}
      <rect className="map-dgipr-core" x="-2.4" y="-2.4" width="4.8" height="4.8" rx="0.7" />

      {/* Said only when the district issued more than one. A number on a mark
          standing for a single release would be noise. */}
      {stacked > 1 ? (
        <text className="map-dgipr-count" x="7.6" y="-5.6">
          {toDevanagari(stacked)}
        </text>
      ) : null}

      {/* A finger-sized target over a mark that is deliberately small. */}
      <circle className="map-dgipr-hit" r="12" />
    </g>
  );
}

/**
 * Holds a mark at one size on screen however far the camera is zoomed in.
 *
 * The same stake `PinLayer` uses and for the same reason — the layer is drawn
 * inside `MapCanvas`'s camera group so a mark travels with the land, and the
 * camera is a scale, so every mark has to carry the inverse. Duplicated rather
 * than shared because the two layers are otherwise independent, and a hook
 * lifted out of one of them is the seam a future third layer gets forced
 * through.
 */
function useStake([x, y]: [x: number, y: number], scale: MotionValue<number>) {
  const ref = useRef<SVGGElement>(null);

  useEffect(() => {
    const stake = () => {
      ref.current?.setAttribute("transform", `translate(${x} ${y}) scale(${1 / scale.get()})`);
    };

    stake();

    return scale.on("change", stake);
  }, [x, y, scale]);

  return ref;
}
