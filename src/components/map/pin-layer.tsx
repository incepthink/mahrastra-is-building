"use client";

import { type MotionValue } from "motion/react";
import { memo, useEffect, useMemo, useRef } from "react";

import { storyPlaceMr, tierMr } from "@/lib/news/marathi";
import { projectPoint, type Projector } from "@/lib/map/project";
import type { DistrictShape } from "@/types/map";
import type { Story } from "@/types/news";

/**
 * How far a district-tier marker sits from its district's centroid when it has
 * company, in viewBox units.
 *
 * Displacing these costs nothing, and that is the whole argument for doing it:
 * a district-tier marker is not claiming a position in the first place — it
 * says "somewhere in this district" and its shape says so — so moving it a few
 * units off the centroid removes no information. Two of them stacked on the
 * exact same point, on the other hand, removes one story from the map.
 *
 * Measured against the state, which is about 1,080 units across and whose
 * districts are 100 to 200: a ring at 15 separates the marks at rest and stays
 * comfortably inside the shape it belongs to. The ring is in viewBox units
 * rather than screen pixels, so it opens out as the reader zooms in, which is
 * the right way round — the district gets bigger too.
 */
const RING = 15;
/** Marks per ring before a second ring opens outside the first. */
const PER_RING = 6;

type Placed = {
  story: Story;
  /** In viewBox units — the same space as the district paths. */
  at: [x: number, y: number];
};

type PinLayerProps = {
  stories: Story[];
  districts: DistrictShape[];
  /** Reproduces the server's projection, so lon/lat lands in viewBox space. */
  projector: Projector;
  /** The camera's zoom, which every mark counter-scales against. */
  scale: MotionValue<number>;
  selectedId: string | null;
  onSelect: (story: Story) => void;
};

/**
 * Running stories, staked to the map at the precision the text supports.
 *
 * `ChoroplethLayer` argues that "a pin at a centroid is a lie told with great
 * precision", and this layer is built to satisfy that argument rather than to
 * overturn it. What changed is not the objection but the data underneath it:
 * the choropleth was drawn over a corpus whose only place field was
 * `articles.district_id`, which names the desk that filed the piece and not
 * where anything happened. `scripts/news/stories/place.mjs` reads the article's
 * own words against a gazetteer of 356 talukas, so a story now arrives with a
 * place *and a statement about how well that place is known*.
 *
 * So the answer is not to refuse pins. It is to refuse to draw a **sharp** one
 * on a district-level guess:
 *
 * - **taluka** — a place the article itself named. A pin with a tip, standing
 *   on the projected lon/lat. This is a claim about a point and it looks like
 *   one.
 * - **district** — only the desk is known. A soft halo with a dashed ring and
 *   no tip, at the district centroid. It has no point to stand on and does not
 *   pretend to; the mark reads as an area, which is what is actually known.
 * - **state** — no mark at all. It never reaches this component; `stories.ts`
 *   filters it out and the plate says how many were left off.
 *
 * The two shapes are the legend entry, and the panel names the tier in words
 * as well — a shape carries a meaning only after a reader has been told it
 * once.
 *
 * Memoised on its props: the camera re-renders the frame whenever the reader
 * crosses a zoom bracket, and the marks counter-scale through motion values
 * without React seeing any of it.
 */
export const PinLayer = memo(function PinLayer({
  stories,
  districts,
  projector,
  scale,
  selectedId,
  onSelect,
}: PinLayerProps) {
  const placed = useMemo(
    () => place(stories, districts, projector),
    [stories, districts, projector],
  );

  return (
    <g className="map-pins">
      {placed.map(({ story, at }) => (
        <StoryPin
          key={story.id}
          story={story}
          at={at}
          scale={scale}
          selected={story.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
});

/**
 * Where each story's mark goes.
 *
 * Taluka stories project their own coordinate and are never displaced, even
 * when two of them land on the same village — they are genuinely in the same
 * place, and nudging a sharp pin off its point to make a picture tidier is
 * exactly the lie the tier exists to avoid. They separate on their own as the
 * reader zooms, because they are separated in the data or they are not.
 *
 * District stories share one centroid per district and are fanned around it.
 * See `RING`.
 */
function place(
  stories: Story[],
  districts: DistrictShape[],
  projector: Projector,
): Placed[] {
  const centroids = new Map(districts.map((district) => [district.id, district.centroid]));
  const crowd = new Map<string, number>();
  const placed: Placed[] = [];

  for (const story of stories) {
    if (story.placeTier === "taluka" && story.point) {
      placed.push({ story, at: projectPoint(story.point, projector) });
      continue;
    }

    // A district the boundary file has never heard of is dropped rather than
    // drawn somewhere plausible — the same rule `loadNewsMap` applies to the
    // choropleth, and for the same reason.
    const districtId = story.districtId;
    const centroid = districtId ? centroids.get(districtId) : undefined;
    if (!districtId || !centroid) continue;

    crowd.set(districtId, (crowd.get(districtId) ?? 0) + 1);
    placed.push({ story, at: [centroid[0], centroid[1]] });
  }

  // The fan needs the final tally per district, which is only known once every
  // story has been counted — so the offsets are applied in a second pass.
  const seen = new Map<string, number>();

  return placed.map((entry) => {
    if (entry.story.placeTier === "taluka") return entry;

    const id = entry.story.districtId ?? "";
    const index = seen.get(id) ?? 0;
    seen.set(id, index + 1);

    const [dx, dy] = fan(crowd.get(id) ?? 1, index);

    return { ...entry, at: [entry.at[0] + dx, entry.at[1] + dy] as [number, number] };
  });
}

/** A deterministic rosette: one mark stays on the centroid, several ring it. */
function fan(count: number, index: number): [number, number] {
  if (count < 2) return [0, 0];

  const ring = Math.floor(index / PER_RING) + 1;
  const slot = index % PER_RING;
  const slots = Math.min(count - (ring - 1) * PER_RING, PER_RING);
  // Starts at the top and goes clockwise, so the same district lays out the
  // same way every render and a reader's eye can come back to a mark.
  const angle = (slot / slots) * Math.PI * 2 - Math.PI / 2;

  return [Math.cos(angle) * RING * ring, Math.sin(angle) * RING * ring];
}

function StoryPin({
  story,
  at,
  scale,
  selected,
  onSelect,
}: {
  story: Story;
  at: [x: number, y: number];
  scale: MotionValue<number>;
  selected: boolean;
  onSelect: (story: Story) => void;
}) {
  const ref = useStake(at, scale);
  const sharp = story.placeTier === "taluka";

  return (
    <g
      ref={ref}
      className="map-pin"
      data-tier={story.placeTier}
      data-selected={selected || undefined}
      transform={`translate(${at[0]} ${at[1]})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(story)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        onSelect(story);
      }}
    >
      {/* The name, the place and how well the place is known — the same three
          things the panel opens with, so the tooltip and the panel never
          disagree about what the mark is standing for. */}
      <title>
        {`${story.titleMr} — ${storyPlaceMr(story)} (${tierMr(story.placeTier)})`}
      </title>

      {sharp ? (
        <>
          {/* A tip at the anchor and a head above it. The tip is the claim;
              the head is only a label, which is why it is the head and not
              the point that carries the weight. */}
          <path
            className="map-pin-stake"
            d="M0 0 L-5.6 -10 A6.6 6.6 0 1 1 5.6 -10 Z"
          />
          <circle className="map-pin-tip" r="1.4" />
        </>
      ) : (
        <>
          {/* No tip, because there is no point. The halo is the area the mark
              actually means, and the ring is dashed because the edge of that
              area is not known either. */}
          <circle className="map-pin-halo" r="13" />
          <circle className="map-pin-ring" r="6.4" />
          <circle className="map-pin-core" r="2.1" />
        </>
      )}

      {/* A finger-sized target over a mark that is deliberately small, centred
          on the head rather than on the anchor for the staked shape. */}
      <circle className="map-pin-hit" r="12" cy={sharp ? -11 : 0} />
    </g>
  );
}

/**
 * Holds a mark at one size on screen however far the camera is zoomed in.
 *
 * The layer is drawn inside `MapCanvas`'s camera group so the marks travel
 * with the land, which is the only way a pin stays on its village while the
 * reader pans. The camera is a scale, though, and at 16x a pin drawn naively
 * would be a violet blot a third of the state wide — so every mark carries the
 * inverse.
 *
 * Written straight onto the `transform` attribute from a motion value
 * subscription rather than through a motion component: the composite here is
 * `translate` then `scale`, and it has to pivot on the anchor. An SVG
 * transform attribute does that by construction, where the CSS transform
 * property motion would use pivots on `transform-box` and needs an origin
 * argued about. The subscription writes an attribute and never re-renders.
 */
function useStake([x, y]: [x: number, y: number], scale: MotionValue<number>) {
  const ref = useRef<SVGGElement>(null);

  // Depends on the two numbers rather than on the pair, which is rebuilt on
  // every layout pass and would re-subscribe every mark for nothing.
  useEffect(() => {
    const stake = () => {
      ref.current?.setAttribute("transform", `translate(${x} ${y}) scale(${1 / scale.get()})`);
    };

    stake();

    return scale.on("change", stake);
  }, [x, y, scale]);

  return ref;
}
