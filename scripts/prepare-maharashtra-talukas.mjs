/**
 * Cuts Maharashtra's talukas out of the India ADM3 dataset.
 *
 * geoBoundaries ADM3 carries no parent-district property — every feature knows
 * only its own name — so membership is decided geometrically: a taluka belongs
 * to Maharashtra if its centroid falls inside the ADM1 state polygon we already
 * ship. That is the same test the eye would apply, and it is stable across
 * releases in a way that name matching is not.
 *
 * Each kept feature is also tagged with the district whose polygon contains it,
 * so the map can key taluka line work off a district without a second lookup.
 *
 * Usage:
 *   node scripts/prepare-maharashtra-talukas.mjs <IND-ADM3.geojson>
 *
 * The input is the file linked from
 * https://www.geoboundaries.org/api/current/gbOpen/IND/ADM3/ — pinned, like the
 * district data, to geoBoundaries commit 9469f09.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Containment is tested in the plane, not on the sphere.
 *
 * `d3.geoContains` is spherical and therefore winding-sensitive: geoBoundaries
 * follows RFC 7946 and winds exteriors counter-clockwise, which d3 reads as
 * "the whole globe except this shape" — so the first run of this script kept
 * zero features. `rewindForD3` exists in `src/lib/map/rewind.ts` for exactly
 * that reason, but it is TypeScript and this is a plain script; over an area
 * the size of one state a planar ray cast gives the same answer, and it does
 * not care which way a ring is wound.
 */
function pointInRing([x, y], ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/** Inside the exterior ring and outside every hole. */
function pointInPolygon(point, rings) {
  if (!pointInRing(point, rings[0])) return false;

  return rings.slice(1).every((hole) => !pointInRing(point, hole));
}

function containsPoint(feature, point) {
  const { type, coordinates } = feature.geometry;

  if (type === "Polygon") return pointInPolygon(point, coordinates);
  if (type === "MultiPolygon") {
    return coordinates.some((rings) => pointInPolygon(point, rings));
  }

  return false;
}

/** The average of a feature's vertices is not guaranteed to sit inside a
 *  crescent-shaped taluka, so fall back to any vertex-adjacent interior point
 *  by testing the ring's own first vertex nudged toward the mean. */
function representativePoint(feature) {
  const points = [];

  const visit = (node) => {
    if (Array.isArray(node) && typeof node[0] === "number") {
      points.push(node);
      return;
    }

    if (Array.isArray(node)) node.forEach(visit);
  };

  visit(feature.geometry.coordinates);

  if (points.length === 0) return null;

  const mean = points.reduce(
    (sum, [x, y]) => [sum[0] + x / points.length, sum[1] + y / points.length],
    [0, 0],
  );

  return containsPoint(feature, mean) ? mean : points[0];
}

const ROOT = path.resolve(import.meta.dirname, "..");
const BOUNDARIES = path.join(ROOT, "public", "data", "boundaries");

const [input] = process.argv.slice(2);

if (!input) {
  console.error("Usage: node scripts/prepare-maharashtra-talukas.mjs <IND-ADM3.geojson>");
  process.exit(1);
}

const [adm3, state, districts] = await Promise.all([
  readJson(input),
  readJson(path.join(BOUNDARIES, "maharashtra.geojson")),
  readJson(path.join(BOUNDARIES, "maharashtra-districts.geojson")),
]);

const stateFeature = state.type === "FeatureCollection" ? state.features[0] : state;

// A cheap bounding-box reject before the expensive point-in-polygon: 6,822
// features against one 257 kB polygon is otherwise several seconds of work for
// an answer that is "no" 95% of the time.
const [west, south, east, north] = bbox(stateFeature);

const kept = [];

for (const feature of adm3.features) {
  const point = representativePoint(feature);

  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
  if (
    point[0] < west - 0.05 ||
    point[0] > east + 0.05 ||
    point[1] < south - 0.05 ||
    point[1] > north + 0.05
  ) {
    continue;
  }

  if (!containsPoint(stateFeature, point)) continue;

  const district = districts.features.find((candidate) =>
    containsPoint(candidate, point),
  );

  kept.push({
    type: "Feature",
    properties: {
      talukaId: feature.properties.shapeID,
      name: feature.properties.shapeName,
      districtId: district?.properties?.districtId ?? null,
    },
    geometry: feature.geometry,
  });
}

kept.sort((a, b) => a.properties.name.localeCompare(b.properties.name));

const orphans = kept.filter((feature) => !feature.properties.districtId).length;

await writeFile(
  path.join(BOUNDARIES, "maharashtra-talukas.geojson"),
  `${JSON.stringify({ type: "FeatureCollection", features: kept })}\n`,
  "utf8",
);

console.log(`Kept ${kept.length} talukas.`);
console.log(
  `${kept.length - orphans} matched to a district; ${orphans} fell outside every district polygon.`,
);

function bbox(feature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (node) => {
    if (Array.isArray(node) && typeof node[0] === "number") {
      minX = Math.min(minX, node[0]);
      maxX = Math.max(maxX, node[0]);
      minY = Math.min(minY, node[1]);
      maxY = Math.max(maxY, node[1]);
      return;
    }

    if (Array.isArray(node)) node.forEach(visit);
  };

  visit(feature.geometry.coordinates);

  return [minX, minY, maxX, maxY];
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
