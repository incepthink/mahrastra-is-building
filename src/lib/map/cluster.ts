import { assignHeads, ringHeads } from "./spread";
import type { PlacedSignal } from "@/types/signal";

/**
 * What the map draws: pins, and counters standing in for pins.
 *
 * `spread.ts` can fan a handful of co-located records into a rosette, and at
 * the pilot's scale that was enough. It stops being enough the moment two
 * anchors are a pixel apart: the fan gets wider than the taluka it describes,
 * the stems cross, and a reader has to guess which head belongs to which dot.
 *
 * So before anything is staked, records whose anchors are within
 * `CLUSTER_GAP` **on screen** are folded into one counter carrying the number
 * inside it. Zoom in and the ground spreads underneath while the badge holds
 * its size, so the group splits on its own the moment there is room for real
 * pins — the counter is a statement about the current view, never about the
 * data. Clicking one opens it in place: the members fan out around the point
 * they share, `expandedId` telling this pass to leave that group alone.
 */

/**
 * Anchor separation, in on-screen pixels, below which pins merge into one.
 *
 * This was 40 when the map carried twenty-five land-acquisition notices from a
 * single taluka, where almost any two anchors were a few pixels apart and a
 * generous gap was the only thing keeping the state view readable. The
 * published set is now one record per sector across two districts, and at 40
 * the whole of Pune folded into one badge — the reader saw four counters and
 * could not tell that a ring road, a sewage plant and an irrigation project
 * were three different kinds of work.
 *
 * What it is really pinned to is `MIN_GAP` in `spread.ts`: it sits just under
 * it, so anything this pass leaves alone is something the rosette can still
 * fan apart without two heads touching. That is why it moves whenever the head
 * radius does — bigger heads need a wider gap before two of them stop reading
 * as one blob, and it moved from 43 to 48 when `MIN_GAP` went to 54 for the
 * same reason. Records genuinely sharing a centroid — two Achalpur notices on
 * Achalpur's midpoint — still merge, which is honest, because there is nothing
 * to tell them apart by position.
 */
const CLUSTER_GAP = 48;

type MarkerBody =
  | { kind: "single"; id: string; point: [x: number, y: number]; placed: PlacedSignal }
  | {
      kind: "cluster";
      id: string;
      point: [x: number, y: number];
      members: PlacedSignal[];
    };

/** A marker with its head placed. See `spread.ts` for what a head is. */
export type MapMarker = MarkerBody & { head: [x: number, y: number] };

/**
 * The markers for one view.
 *
 * @param perUnit Screen pixels per viewBox unit — the camera's zoom over the
 *   map's fit. At rest this is 1, which is what makes the first client render
 *   match the server's.
 * @param expandedId The one cluster the reader has opened, if any. Its members
 *   are staked individually so the rosette answers "which seven?".
 */
export function buildMarkers(
  placed: PlacedSignal[],
  perUnit: number,
  expandedId: string | null,
): MapMarker[] {
  const groups = groupByProximity(placed, perUnit);
  const opened = groups.find(
    (group) => group.length > 1 && clusterId(group) === expandedId,
  );

  // The opened group is laid out first and on its own terms — one even ring
  // around the point its badge stood on, rather than each member competing for
  // slots with whatever else is on screen. See `ringHeads`.
  const rosette = opened
    ? ringHeads(opened.map(toSingle), perUnit, centroid(opened))
    : [];

  const bodies: MarkerBody[] = [];

  for (const group of groups) {
    if (group === opened) continue;

    if (group.length > 1) {
      bodies.push({
        kind: "cluster",
        id: clusterId(group),
        point: centroid(group),
        members: group,
      });
      continue;
    }

    bodies.push(...group.map(toSingle));
  }

  // The rosette's slots are handed over as taken, so a badge sitting next to
  // the group the reader just opened steps around it instead of into it — and
  // the rosette is drawn last, above everything it was opened out of.
  const reserved = rosette.map(
    (marker): [number, number] => [
      marker.point[0] * perUnit + marker.head[0],
      marker.point[1] * perUnit + marker.head[1],
    ],
  );

  return [...assignHeads(bodies, perUnit, reserved), ...rosette];
}

function toSingle(member: PlacedSignal): MarkerBody & { kind: "single" } {
  return {
    kind: "single",
    id: member.signal.id,
    point: member.point,
    placed: member,
  };
}

/**
 * Single-linkage grouping: a record joins a group if it is within reach of
 * *any* record already in it, so a chain of near-neighbours becomes one badge
 * rather than several overlapping ones.
 *
 * Quadratic, over at most `MARKER_LIMIT` records. Input order is preserved, so
 * the best-evidenced record still seeds the first group and the layout is
 * stable between renders at the same zoom.
 */
function groupByProximity(placed: PlacedSignal[], perUnit: number): PlacedSignal[][] {
  const reach = CLUSTER_GAP / Math.max(perUnit, 1e-6);
  const groups: PlacedSignal[][] = [];
  const taken = new Set<string>();

  for (const seed of placed) {
    if (taken.has(seed.signal.id)) continue;

    const group = [seed];
    taken.add(seed.signal.id);

    // Grows while it is being walked: a record pulled in on one pass can pull
    // in its own neighbours on the next.
    for (let index = 0; index < group.length; index += 1) {
      for (const other of placed) {
        if (taken.has(other.signal.id)) continue;
        if (distance(group[index].point, other.point) > reach) continue;

        taken.add(other.signal.id);
        group.push(other);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Identity from membership, not from position: the id survives a pan, and a
 * group that gains or loses a record on zoom is a different group — which is
 * exactly when an open cluster should close rather than silently re-point.
 */
function clusterId(group: PlacedSignal[]): string {
  return `${CLUSTER_PREFIX}${group
    .map((member) => member.signal.id)
    .sort()
    .join("|")}`;
}

const CLUSTER_PREFIX = "cluster:";

/**
 * The record ids a cluster id stands for.
 *
 * A parse rather than a lookup, because the id *is* the membership — see
 * `clusterId`. It exists so that callers holding nothing but "which cluster is
 * open" (the map, lighting up the districts an opened group covers) can answer
 * "which records is that" without this file's id format leaking into them.
 */
export function clusterMembers(id: string | null): string[] {
  if (!id || !id.startsWith(CLUSTER_PREFIX)) return [];

  return id.slice(CLUSTER_PREFIX.length).split("|");
}

/** The badge stands at the middle of what it covers, not on any one record. */
function centroid(group: PlacedSignal[]): [number, number] {
  const total = group.reduce(
    (sum, member) => [sum[0] + member.point[0], sum[1] + member.point[1]],
    [0, 0],
  );

  return [total[0] / group.length, total[1] / group.length];
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
