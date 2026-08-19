/**
 * Where a pin's head sits relative to its anchor.
 *
 * A pin is two things: an **anchor**, which is a claim about a coordinate, and
 * a **head**, which is a label. Only the anchor has to be truthful about
 * position. So when two records are closer together than two heads can be, the
 * heads move and the anchors do not — the standard cartographic displacement,
 * and the reason the head has always been drawn on a stem rather than sitting
 * on the point.
 *
 * Everything here is measured in **on-screen pixels**, which is also the space
 * a marker draws in: the marker counter-scales against the camera, so one unit
 * inside it is one CSS pixel at every zoom. Anchors arrive in viewBox units and
 * are converted on the way in by `perUnit` — screen pixels per viewBox unit,
 * which is the camera's zoom over the map's fit. That is the whole reason this
 * now runs in the browser rather than on the server: at 1x seven notices from
 * one taluka are a rosette, and at 8x they are seven pins standing on seven
 * villages. The layout has to be recomputed as the reader zooms, and
 * `lib/map/cluster.ts` is what calls it.
 */

/** Head radius of a single pin, from `SignalMarker`. Every other measurement
 *  in this file is sized against it, so the fan opens up as the head does. */
const HEAD = 20;
/** Head radius of a cluster badge, from `ClusterMarker`. */
const CLUSTER_HEAD = 22;
/** Rest height of an undisplaced pin — the classic staked look. */
const LIFT = 40;
/**
 * Centre-to-centre distance below which two heads read as one blob.
 *
 * This was 44, which is a head's diameter plus four pixels — geometrically
 * "not overlapping", and visibly a clump. Two heads that close touch at the
 * selection ring (`HEAD + 6`, so 52 across) and share a border along their
 * outlines, which is what made an opened cluster look like a pile of coins
 * rather than a set of pins. At 54 the discs stand a seventh of their own
 * width apart and the ring of the open record clears its neighbours.
 */
const MIN_GAP = 54;
/** How much further out each ring of the rosette sits. */
const RING_STEP = 32;
/** Past this the fan is wider than the district it is describing. */
const RINGS = 5;

/** Anything that can be staked to the map: a record, or a cluster of them. */
export type Anchored = { point: [x: number, y: number] };

/**
 * Assigns each marker a head position, in order, taking the first candidate
 * slot that clears every head already placed.
 *
 * Greedy rather than optimal on purpose: the input is at most seven records
 * (`MARKER_LIMIT`) and it arrives sorted best-first, so the best record keeps
 * the classic straight-up stem and the rest arrange themselves around it. An
 * optimiser would produce a marginally tighter rosette and a layout that
 * changes shape whenever the data does.
 *
 * @param perUnit Screen pixels per viewBox unit — `zoom / fit`.
 * @param reserved Head positions already spoken for, in screen pixels. An
 *   opened cluster lays its rosette out first and hands the slots it took in
 *   here, so a badge standing next to it is displaced around the rosette
 *   instead of landing in the middle of it.
 */
export function assignHeads<T extends Anchored>(
  items: T[],
  perUnit: number,
  reserved: ReadonlyArray<[number, number]> = [],
): Array<T & { head: [x: number, y: number] }> {
  const heads: Array<[number, number]> = [...reserved];

  return items.map((item) => {
    const screen: [number, number] = [
      item.point[0] * perUnit,
      item.point[1] * perUnit,
    ];
    const head = firstFreeSlot(screen, heads);

    heads.push([screen[0] + head[0], screen[1] + head[1]]);

    return { ...item, head };
  });
}

/**
 * The opened cluster: every member on one ring around the point they share.
 *
 * `assignHeads` is the wrong tool for this and always was. It is greedy and
 * first-come, so the first member takes the straight-up stem and the rest take
 * whatever slot happens to clear — which on a handful of records a few pixels
 * apart produces a lopsided huddle where the heads are technically `MIN_GAP`
 * apart and read as one object. A group the reader has just asked to see open
 * should look opened: one ring, even spacing, every stem radiating out of the
 * middle, and no two discs touching at any count the badge can hold.
 *
 * The radius is whatever it takes for the chord between two neighbours to
 * clear `MIN_GAP`, floored at `LIFT` so a pair still stands at normal pin
 * height rather than sitting on their own anchors. Members keep their input
 * order — best-evidenced first, at the top of the ring, going clockwise — so
 * the rosette is the same shape every time the same group is opened.
 *
 * Only heads move. Each member's anchor stays on its own coordinate, and the
 * head offset returned is measured from that anchor to its slot on the ring,
 * which is what draws the stems fanning out of the shared ground.
 *
 * @param centre The group's shared point, in viewBox units — the badge's own
 *   anchor, so the ring opens where the counter stood.
 */
export function ringHeads<T extends Anchored>(
  items: T[],
  perUnit: number,
  centre: [x: number, y: number],
): Array<T & { head: [x: number, y: number] }> {
  const hub: [number, number] = [centre[0] * perUnit, centre[1] * perUnit];
  const radius = ringRadius(items.length);

  return items.map((item, index) => {
    // From the top, clockwise — the same order the fallback rings in `slots`
    // are walked in, so an opened group turns in the direction pins already do.
    const angle = (index / items.length) * 2 * Math.PI;
    const slotX = hub[0] + radius * Math.sin(angle);
    const slotY = hub[1] - radius * Math.cos(angle);

    return {
      ...item,
      head: [
        round(slotX - item.point[0] * perUnit),
        round(slotY - item.point[1] * perUnit),
      ] as [number, number],
    };
  });
}

/** Big enough that adjacent heads on the ring clear `MIN_GAP`. */
function ringRadius(count: number): number {
  if (count < 2) return LIFT;

  return Math.max(LIFT, MIN_GAP / (2 * Math.sin(Math.PI / count)));
}

function firstFreeSlot(
  point: [number, number],
  taken: Array<[number, number]>,
): [number, number] {
  for (const candidate of slots()) {
    const absolute: [number, number] = [point[0] + candidate[0], point[1] + candidate[1]];

    if (taken.every((head) => distance(head, absolute) >= MIN_GAP)) return candidate;
  }

  // Every ring was full. Better a stacked pin than a pin thrown off the state.
  return [0, -LIFT];
}

/**
 * Candidate head positions: straight up first, then rings of increasing radius
 * around the anchor, each ring starting at the top and going clockwise.
 */
function* slots(): Generator<[number, number]> {
  yield [0, -LIFT];

  for (let ring = 1; ring <= RINGS; ring += 1) {
    const radius = LIFT + ring * RING_STEP;
    const count = Math.max(6, Math.round((2 * Math.PI * radius) / MIN_GAP));

    for (let step = 0; step < count; step += 1) {
      const angle = (step / count) * 2 * Math.PI;

      yield [round(radius * Math.sin(angle)), round(-radius * Math.cos(angle))];
    }
  }
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export { CLUSTER_HEAD, HEAD, LIFT };
