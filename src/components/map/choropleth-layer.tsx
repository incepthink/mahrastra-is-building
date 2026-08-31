"use client";

import { memo } from "react";

import type { DistrictShape } from "@/types/map";

type ChoroplethLayerProps = {
  districts: DistrictShape[];
  /** District id to ramp step, 1–5. Districts absent from this are not painted. */
  levels: Record<string, number>;
};

/**
 * The state coloured in by how much news came out of each district.
 *
 * This is the mark now. The map it replaces put one pin per record at a
 * lon/lat, which worked because a curated development notice names a village
 * and the pipeline could geocode it. A newspaper article names no place more
 * precise than the desk that filed it — the corpus is keyed by district and
 * nothing finer — so a pin would have to be dropped at a district centroid,
 * and a pin at a centroid is a lie told with great precision: it puts a dot on
 * a field outside Ambajogai and invites the reader to believe something
 * happened there.
 *
 * Colouring the whole district says exactly what is known and nothing more.
 * The unit of the data becomes the unit of the mark.
 *
 * Drawn as its own layer under the hairlines rather than as a fill on
 * `.map-district`, for the same reason `.map-lit` is: the shapes are painted
 * largest-first so small districts stay hoverable, so a fill applied there
 * would have Mumbai City's colour overpainted by Thane's border. Inert to the
 * pointer throughout — hover and click still belong to the `DistrictPath`
 * hit areas above.
 *
 * Memoised on the level map: the camera re-renders the frame on every zoom
 * bracket crossing, and 35 fills that have not changed should not be rebuilt
 * for it.
 */
export const ChoroplethLayer = memo(function ChoroplethLayer({
  districts,
  levels,
}: ChoroplethLayerProps) {
  return (
    <g className="map-choropleth" aria-hidden>
      {districts.map((district) => {
        const level = levels[district.id] ?? 0;

        // Level 0 is not the bottom of the ramp, it is the absence of one.
        // "No news reached us from here" and "least news in the state" are
        // different statements, and painting them the same colour merges them.
        if (level < 1) return null;

        return (
          <path
            key={district.id}
            className="map-choropleth-fill"
            data-level={level}
            d={district.d}
          />
        );
      })}
    </g>
  );
});
