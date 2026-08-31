"use client";

import { memo } from "react";

import type { DistrictShape } from "@/types/map";

type DistrictPathProps = {
  district: DistrictShape;
  /** Staggers the entrance so the state fills in from the coast eastward. */
  delay: number;
  onPointerEnter: (district: DistrictShape) => void;
  onLeave: (district: DistrictShape) => void;
  onMove: (event: React.PointerEvent<SVGPathElement>) => void;
  /** Picks the district out on the sheet. Fires for empty districts too. */
  onSelect: (district: DistrictShape) => void;
  /**
   * What the shape is called, when the name alone is not what it says.
   *
   * The sheet used to be one colour and a district meant only itself, so its
   * Marathi name was the whole of its accessible label. The choropleth changed
   * that: the fill now carries a number, and a reader who cannot see the fill
   * gets a map of thirty-six names and none of the data. Passing the count in
   * here is what keeps the two readings equivalent. Defaults to the name, so
   * an uncoloured map is unchanged.
   */
  label?: string;
};

/**
 * One district: a hairline and a hit area over the shared sheet.
 *
 * There is no fill and no hover fill. The state is one colour throughout —
 * the districts are the lines between, not 36 shapes to be coloured in.
 *
 * There *is* a selected state, and it is not drawn here: clicking picks the
 * district out, and the highlight is painted by the `.map-lit` layer above the
 * hairlines so a small district's outline is never buried under a large
 * neighbour's. See `MapCanvas`. The click deliberately does not care whether
 * the district holds any records — a reader tapping Beed to ask "is anything
 * happening here" has asked a real question, and answering it with nothing at
 * all reads as a broken map rather than as an empty district.
 *
 * Districts holding records used to be filled with an engraver's hatch, so the
 * pilot's coverage was visible before reading a word. It went for two reasons:
 * it made Amravati a dense dark blob at exactly the spot the pins need to be
 * legible, and with only one district hatched it was a legend with one entry.
 * Coverage is now said by the pins themselves and by the count on the brand
 * plate, which is where a reader looks for it anyway.
 *
 * Memoised: the map re-renders whenever the reader crosses a zoom bracket and
 * the markers have to be laid out again, and 36 unchanged silhouettes should
 * not be rebuilt for it.
 */
export const DistrictPath = memo(function DistrictPath({
  district,
  delay,
  onPointerEnter,
  onLeave,
  onMove,
  onSelect,
  label,
}: DistrictPathProps) {
  return (
    <path
      d={district.d}
      className="map-district"
      style={{ animationDelay: `${delay}ms` }}
      onPointerEnter={() => onPointerEnter(district)}
      onPointerLeave={() => onLeave(district)}
      onPointerMove={onMove}
      onClick={() => onSelect(district)}
    >
      {/* The name is on the shape rather than in a label layer: the plate is
          `aria-hidden` because it follows a pointer, so this is what a screen
          reader and a native tooltip both read. */}
      <title>{label ?? district.nameMr}</title>
    </path>
  );
});
