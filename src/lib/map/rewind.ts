import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

/**
 * d3-geo treats polygons as spherical and expects exterior rings to wind
 * **clockwise**; RFC 7946 — which geoBoundaries follows — specifies
 * counter-clockwise. Feed d3 the file as-is and every district is read as
 * "the whole sphere except this shape", which paints the entire clip extent.
 *
 * This rewinds a collection into d3's convention: exterior rings clockwise
 * (negative signed area), holes counter-clockwise. It is idempotent, so data
 * that already winds correctly passes through untouched.
 */
export function rewindForD3<P>(
  collection: FeatureCollection<Geometry, P>,
): FeatureCollection<Geometry, P> {
  return {
    ...collection,
    features: collection.features.map((feature) => rewindFeature(feature)),
  };
}

function rewindFeature<P>(
  feature: Feature<Geometry, P>,
): Feature<Geometry, P> {
  const { geometry } = feature;

  if (geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: { ...geometry, coordinates: rewindPolygon(geometry.coordinates) },
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates: geometry.coordinates.map(rewindPolygon),
      },
    };
  }

  return feature;
}

function rewindPolygon(polygon: Position[][]): Position[][] {
  return polygon.map((ring, index) => {
    const clockwise = signedArea(ring) < 0;
    const shouldBeClockwise = index === 0;

    return clockwise === shouldBeClockwise ? ring : [...ring].reverse();
  });
}

/** Shoelace area in degrees²; positive means counter-clockwise. */
function signedArea(ring: Position[]): number {
  let total = 0;

  for (let i = 0, last = ring.length - 1; i < ring.length; last = i++) {
    total += ring[last][0] * ring[i][1] - ring[i][0] * ring[last][1];
  }

  return total / 2;
}
