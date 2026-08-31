"use client";

import { motion, type MotionValue } from "motion/react";

import { DistrictPath } from "./district-path";
import { MapDefs } from "./map-defs";
import type { DistrictShape, MapGeometry } from "@/types/map";

/** How long the coast-to-Vidarbha entrance sweep takes, end to end. */
const SWEEP_MS = 620;

type MapCanvasProps = {
  geometry: MapGeometry;
  svgRef: React.Ref<SVGSVGElement>;
  camera: { x: MotionValue<number>; y: MotionValue<number>; scale: MotionValue<number> };
  surfaceProps: React.SVGProps<SVGSVGElement>;
  /** Ids of the districts drawn as picked out — the one the reader clicked,
   *  and whichever the open record or counter stands in. */
  lit: ReadonlySet<string>;
  /** Painted under the hairlines, above the sheet — the choropleth, when the
   *  map is showing one. See `ChoroplethLayer` for why it is a layer of its
   *  own rather than a fill on the district shapes. */
  ground?: React.ReactNode;
  /** District id to the accessible label for its shape, when the sheet is
   *  coloured by something the name does not say. See `DistrictPath`. */
  labels?: Record<string, string>;
  onGroundClick: (event: React.MouseEvent<SVGSVGElement>) => void;
  onPointerEnter: (district: DistrictShape) => void;
  onLeave: (district: DistrictShape) => void;
  onMove: (event: React.PointerEvent<SVGPathElement>) => void;
  onSelectDistrict: (district: DistrictShape) => void;
  /** Drawn inside the camera, above every land layer — the signal pins. */
  children?: React.ReactNode;
};

/**
 * The state as a printed sheet.
 *
 * Paint order is a press run: the sheet under one warm gradient, then the line
 * work — district hairlines under the coastline — and the pins last. The state
 * is a single colour throughout; the only colour that varies on this surface
 * belongs to a record.
 *
 * Two layers left this file:
 *
 * - **The offset plate.** A second copy of the silhouette in bottle green,
 *   translated by `--plate-offset-*`, used to sit behind the sheet as the whole
 *   depth model. On a coastline as ragged as the Konkan it did not read as
 *   registration; it read as a green fringe stuck to the south-east and a
 *   detached green sliver north of Nandurbar. Depth on the land is now the
 *   contact shadow alone, and registration offset survives where it works — on
 *   rectangular things, which is every panel in the product.
 * - **Taluka hairlines.** 356 sub-district borders under the district lines.
 *   The pilot is one district; the other 35 were paying for line work nobody
 *   was reading, and it made the state look like crazed glaze.
 */
export function MapCanvas({
  geometry,
  svgRef,
  camera,
  surfaceProps,
  lit,
  ground,
  labels,
  onGroundClick,
  onPointerEnter,
  onLeave,
  onMove,
  onSelectDistrict,
  children,
}: MapCanvasProps) {
  return (
    <svg
      ref={svgRef}
      viewBox={geometry.viewBox}
      className="map-surface"
      role="img"
      aria-label="महाराष्ट्रातील ३६ जिल्ह्यांचा नकाशा"
      preserveAspectRatio="xMidYMid meet"
      {...surfaceProps}
      onClick={onGroundClick}
    >
      <MapDefs landPath={geometry.landPath} />

      {/* motion stamps `transform-box: fill-box` onto SVG elements, which would
          pin the camera to the artwork's bounding box rather than the viewBox
          the camera maths is written against. */}
      <motion.g className="map-camera" style={{ ...camera, transformBox: "view-box" }}>
        {/* The sheet, with its contact shadow. One gradient across the whole
            silhouette — see `#map-land-fill`. Everything else is printed on
            top of this one shape. */}
        <use
          href="#map-land-shape"
          className="map-sheet"
          fill="url(#map-land-fill)"
          filter="url(#map-contact)"
          aria-hidden
        />

        <g clipPath="url(#map-land-clip)">
          {/* Whatever the districts are coloured by, under every line on the
              sheet so no border is ever printed over. */}
          {ground}

          <g className="map-districts">
            {geometry.districts.map((district) => (
              <DistrictPath
                key={district.id}
                district={district}
                delay={(district.centroid[0] / geometry.size[0]) * SWEEP_MS}
                label={labels?.[district.id]}
                onPointerEnter={onPointerEnter}
                onLeave={onLeave}
                onMove={onMove}
                onSelect={onSelectDistrict}
              />
            ))}
          </g>

          {/* Which district the reader has picked out — by clicking the land
              itself, or by opening a record that stands on it. Drawn as its
              own layer above the hairlines rather than as a state on the
              shape, because the districts are painted largest-first so that
              small ones stay hoverable — a lit Mumbai City would otherwise
              have Pune's border drawn over the top of it.

              It is a border and a wash, not a fill: the point is to say
              "this district", and a solid tint at this size buries the pins
              standing on it. Inert to the pointer so hover still belongs to
              the `DistrictPath` underneath. */}
          <g className="map-lit" aria-hidden>
            {geometry.districts
              .filter((district) => lit.has(district.id))
              .map((district) => (
                <path key={district.id} className="map-district-lit" d={district.d} />
              ))}
          </g>
        </g>

        {/* The state's outer line, drawn last so no internal border ever
            crosses it. Wider than anything inside it. */}
        <use href="#map-land-shape" className="map-coast" aria-hidden />

        {children}
      </motion.g>
    </svg>
  );
}
