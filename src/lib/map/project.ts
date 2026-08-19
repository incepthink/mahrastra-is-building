/**
 * The server's projection, reduced to the two numbers that reproduce it.
 *
 * `geometry.ts` fits a `geoMercator` to the state and ships path strings, so
 * the client never loads d3-geo. But signals arrive as lon/lat and have to land
 * in the same viewBox space as those paths, which is what this carries: with no
 * rotation or centre offset — and `geoMercator().fitExtent()` sets neither — a
 * Mercator is just a scale and a translate over the raw spherical formula.
 */
export type Projector = {
  scale: number;
  translate: [x: number, y: number];
};

const DEGREES = Math.PI / 180;

/** `[longitude, latitude]` to a point in viewBox units. */
export function projectPoint(
  [longitude, latitude]: [number, number],
  { scale, translate }: Projector,
): [x: number, y: number] {
  const lambda = longitude * DEGREES;
  // Clamped shy of the poles, where the Mercator y term runs to infinity.
  const phi = Math.max(-85, Math.min(85, latitude)) * DEGREES;

  return [
    translate[0] + scale * lambda,
    translate[1] - scale * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  ];
}
