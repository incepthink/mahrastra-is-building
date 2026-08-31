import { readFile } from "node:fs/promises";
import path from "node:path";

import { geoGraticule, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type {
  GeometryCollection,
  MultiPolygon,
  Objects,
  Polygon,
  Topology,
} from "topojson-specification";
import { feature as toFeatures, merge as mergeArcs } from "topojson-client";
import { topology } from "topojson-server";
import { planarTriangleArea, presimplify, simplify } from "topojson-simplify";

import { DISTRICTS } from "@/data/districts";
import { rewindForD3 } from "@/lib/map/rewind";
import type { Projector } from "@/lib/map/project";
import type { DistrictShape, MapGeometry } from "@/types/map";

/** Square the projection is fitted into before the viewBox is cropped to it. */
const FIT = 1000;
/** Headroom for the outer halo rings and the hover lift. */
const PADDING = 42;
/**
 * Visvalingam weight, in square viewBox units, below which a vertex is dropped.
 *
 * The source is far finer than this map can show: 21,967 points, every one of
 * which gets painted nine times over — shadow, three aura strokes, coast, land,
 * districts, inset and sheen — on every frame the scene is invalidated. At 2
 * that comes down to 6,293 points and 85 kB of path data instead of 299 kB, for
 * a mean error of 1.3 units. That is about one screen pixel at rest; no
 * district moves more than 1% of its own area and no island is lost.
 */
const SIMPLIFY_TOLERANCE = 2;

type BoundaryProperties = { districtId?: string; name?: string; talukaId?: string };
type Boundary = FeatureCollection<Geometry, BoundaryProperties>;

/**
 * Projects the 36 districts once, on the server, and hands the client plain
 * path strings — the browser never sees d3-geo or the 440 kB of source GeoJSON.
 *
 * The state silhouette is the union of the districts rather than the separate
 * ADM1 outline: the two files are from different vintages (2011 vs 2021) and
 * disagree by a few kilometres along the north and east, which showed up as a
 * coastline slicing through Nandurbar and Gadchiroli.
 *
 * Built once per process and then handed out. This used to be free: the page
 * was statically prerendered, so the projection ran at build time and the
 * result was baked into the HTML. The news map made the route dynamic — it
 * reads a time window off the query string and re-queries a database that
 * changes every half hour — and without this the whole pipeline below would
 * run on every request: read 440 kB of GeoJSON, project 21,967 points, build a
 * topology, simplify it and re-path 36 districts, to produce a byte-identical
 * answer every time. The inputs are two files that ship with the deploy and
 * cannot change while the process is alive, so the answer is memoised rather
 * than recomputed.
 *
 * The *promise* is cached, not the value, so concurrent first requests share
 * one build instead of racing into several.
 */
let geometry: Promise<MapGeometry> | null = null;

export function buildMapGeometry(): Promise<MapGeometry> {
  return (geometry ??= projectMapGeometry());
}

async function projectMapGeometry(): Promise<MapGeometry> {
  const boundaries = await readBoundary("maharashtra-districts.geojson");

  const projection = geoMercator().fitExtent(
    [
      [0, 0],
      [FIT, FIT],
    ],
    boundaries,
  );
  const toSphericalPath = geoPath(projection).digits(2);

  // Slide the projection so the state's own bounding box starts at (PADDING,
  // PADDING). The viewBox can then be a plain `0 0 W H`, which keeps every
  // camera calculation on the client a simple `scale * point + offset`.
  const [[left, top], [right, bottom]] = toSphericalPath.bounds(boundaries);
  const [translateX, translateY] = projection.translate();
  projection.translate([
    translateX - left + PADDING,
    translateY - top + PADDING,
  ]);

  // Past this point the districts carry viewBox coordinates, so `geoPath(null)`
  // reads them as already projected. That skips d3's spherical clipping and
  // adaptive resampling, and it puts the simplifier in the one space where a
  // tolerance means something you can reason about.
  const toPath = geoPath(null).digits(2);
  const { features, outline } = thin(project(boundaries, projection));
  const districts = features
    .map((feature) => toDistrictShape(feature, toPath))
    .sort((a, b) => b.area - a.area);

  return {
    viewBox: `0 0 ${round(right - left + PADDING * 2)} ${round(bottom - top + PADDING * 2)}`,
    projector: toProjector(projection),
    size: [round(right - left + PADDING * 2), round(bottom - top + PADDING * 2)],
    // The dissolved outline — see `thin`. This is stroked as well as filled,
    // so it has to be the state's edge and nothing else.
    landPath: toPath(outline) ?? "",
    graticulePath: toSphericalPath(graticuleFor(boundaries)) ?? "",
    districts,
  };
}

/**
 * The finished projection as two plain numbers, so the client can place a
 * lon/lat point in viewBox units without shipping d3-geo. Read *after* the
 * translate above has been re-centred — that is the whole point of it.
 */
function toProjector(projection: GeoProjection): Projector {
  const [x, y] = projection.translate();

  return { scale: projection.scale(), translate: [x, y] };
}

/** Bakes the projection into the coordinates, leaving plain viewBox units. */
function project(boundaries: Boundary, projection: GeoProjection): Boundary {
  const point = ([longitude, latitude]: Position): Position =>
    projection([longitude, latitude]) ?? [0, 0];
  const polygon = (rings: Position[][]) => rings.map((ring) => ring.map(point));

  return {
    ...boundaries,
    features: boundaries.features.map((feature) => {
      const { geometry } = feature;

      if (geometry.type === "Polygon") {
        return {
          ...feature,
          geometry: { ...geometry, coordinates: polygon(geometry.coordinates) },
        };
      }

      if (geometry.type === "MultiPolygon") {
        return {
          ...feature,
          geometry: { ...geometry, coordinates: geometry.coordinates.map(polygon) },
        };
      }

      return feature;
    }),
  };
}

/**
 * Visvalingam simplification over a shared-arc topology, and the union taken
 * from the same one.
 *
 * Simplifying is done on the topology rather than on the polygons one at a
 * time because every internal border belongs to two districts as a single arc,
 * so it can only be thinned identically on both sides. Thinning the 36 polygons
 * independently would open slivers along all of those borders.
 *
 * `outline` is the districts **dissolved** — the state's edge with every
 * internal arc dropped. It used to be the 36 outlines concatenated into one
 * `<path>`, which fills as a clean union and so looked right, but `.map-coast`
 * *strokes* that path: every district border was being overprinted in full ink
 * at coastline weight, and the 15%-alpha hairlines underneath were invisible
 * beneath it. That is what made the state read as a net. Dissolving here is the
 * only place the two uses can be told apart.
 */
function thin(boundaries: Boundary): { features: Boundary["features"]; outline: Geometry } {
  // The topojson types model properties as possibly `null`, which the
  // simplifier's own signature does not allow; the objects are ours either way.
  const built = topology({ districts: boundaries }) as Topology<Objects<BoundaryProperties>>;
  const arcs = presimplify(built, planarTriangleArea);
  const thinned = simplify(arcs, SIMPLIFY_TOLERANCE);
  const districts = thinned.objects.districts as GeometryCollection<BoundaryProperties>;

  return {
    features: (toFeatures(thinned, districts) as Boundary).features,
    // `merge` wants the members, and every member here is an area — the cast
    // only drops the `NullObject` the collection's type allows and the source
    // data never contains.
    outline: mergeArcs(thinned, districts.geometries as Array<Polygon | MultiPolygon>),
  };
}

function toDistrictShape(
  feature: Feature<Geometry, BoundaryProperties>,
  toPath: ReturnType<typeof geoPath>,
): DistrictShape {
  const id = feature.properties?.districtId;
  const meta = id ? DISTRICTS[id] : undefined;

  if (!id || !meta) {
    throw new Error(`Unknown district in boundary data: ${id ?? "(no id)"}`);
  }

  const [min, max] = toPath.bounds(feature);

  return {
    id,
    name: feature.properties?.name ?? id,
    nameMr: meta.nameMr,
    division: meta.division,
    d: toPath(feature) ?? "",
    centroid: roundPoint(toPath.centroid(feature)),
    bounds: [roundPoint(min), roundPoint(max)],
    area: round(toPath.area(feature)),
  };
}

/** A half-degree net, drawn under the land and clipped to the coastline. */
function graticuleFor(boundaries: Boundary) {
  const [west, south, east, north] = boundingBox(boundaries);

  return geoGraticule()
    .extent([
      [Math.floor(west), Math.floor(south)],
      [Math.ceil(east), Math.ceil(north)],
    ])
    .stepMinor([0.5, 0.5])();
}

function boundingBox(boundaries: Boundary): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (node: unknown): void => {
    if (Array.isArray(node) && typeof node[0] === "number") {
      const [x, y] = node as [number, number];
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
      return;
    }

    if (Array.isArray(node)) node.forEach(visit);
  };

  boundaries.features.forEach((feature) => {
    visit((feature.geometry as { coordinates?: unknown }).coordinates);
  });

  return [west, south, east, north];
}

function roundPoint([x, y]: [number, number] | number[]): [number, number] {
  return [round(x), round(y)];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function readBoundary(fileName: string): Promise<Boundary> {
  const file = await readFile(
    path.join(process.cwd(), "public", "data", "boundaries", fileName),
    "utf8",
  );

  return rewindForD3(JSON.parse(file) as Boundary);
}
