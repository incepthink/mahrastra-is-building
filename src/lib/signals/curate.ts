import { CATEGORIES } from "@/data/categories";
import type { Signal, SignalCategoryId } from "@/types/signal";

/**
 * How many pins the map carries. Not a performance ceiling — a reading one.
 *
 * The pilot used to publish twenty-five records that were all land-acquisition
 * notices from one district, projecting into a patch about 2.6 viewBox units
 * across on a 1084-unit map: at the state view they were a single illegible
 * clot of pins that said "something is happening in Vidarbha" and nothing else.
 *
 * The answer was never a smaller number, it was a wider one. The publication
 * list now names one record per sector across two districts, so the limit only
 * has to be generous enough to let every sector reach the map.
 */
export const MARKER_LIMIT = 12;

export type Curation = {
  /** The records that get a pin, best first. */
  shown: Signal[];
  /** How many passed the quality gate — shown or not. */
  eligible: number;
  /** How many are published at all. */
  published: number;
  /** Which sectors reached the map, in the order they were taken. */
  sectors: SignalCategoryId[];
};

/** The sector order the map fills in, taken from the registry so a new
 *  category appears here by being declared there and nowhere else. */
const SECTOR_ORDER: SignalCategoryId[] = CATEGORIES.map((category) => category.id);

/**
 * Which records are good enough to stand for the pilot.
 *
 * This gate used to do the curating: it demanded a plain-Marathi card, a
 * village-precision point and no review flag, because it was picking seven
 * records out of twenty-five machine-classified ones and had nothing else to
 * go on. It is not picking any more — `published-signals.json` names the
 * records, a person chose them, and every choice there carries its reason.
 *
 * So what is left is the two conditions that make a *pin* wrong rather than a
 * record weak:
 *
 *   - a link to the original notice, so the claim is checkable;
 *   - an open notice window, because a showcase should not spend a sector on a
 *     window that has already closed.
 *
 * Card, precision and review state still matter — they decide the order below,
 * and the panel says which of them a record is missing. They no longer decide
 * whether a whole sector is allowed on the map.
 */
function isShowable(signal: Signal, now: Date): boolean {
  if (!sourceUrl(signal)) return false;

  const validUntil = signal.provenance?.validUntil;

  return !validUntil || Date.parse(validUntil) >= now.getTime();
}

/**
 * Best first, within a sector.
 *
 * Evidence outranks freshness. A record written up as plain Marathi and pinned
 * to a named village is worth more to a reader than a newer one that is still
 * raw notice text on a taluka centroid, so those score first and the notice
 * window only breaks ties. Days-remaining stays weighted above days-since:
 * a notice with a long window still open is more use than a fresher one that
 * shuts next week.
 */
function quality(signal: Signal, now: Date): number {
  const published = Date.parse(signal.publishedAt);
  const validUntil = signal.provenance?.validUntil
    ? Date.parse(signal.provenance.validUntil)
    : NaN;

  const daysLeft = Number.isNaN(validUntil)
    ? 0
    : Math.max(0, (validUntil - now.getTime()) / 86_400_000);
  const daysOld = Number.isNaN(published)
    ? 3650
    : Math.max(0, (now.getTime() - published) / 86_400_000);

  const card = signal.card?.headline ? 60 : 0;
  // Impact text is the one field the panel leans on hardest, and the one the
  // AI pass most often leaves thin. A substantial one is worth a fortnight.
  const impact = (signal.card?.impact?.length ?? 0) > 60 ? 14 : 0;
  const precision = signal.confidence?.location === "village" ? 40 : 0;
  const review = signal.needsReview ? -10 : 0;

  return card + impact + precision + review + daysLeft * 0.5 - daysOld * 0.25;
}

/**
 * The map's records, picked in three passes.
 *
 * 1. **Every sector that survives the gate gets its best record.** This is the
 *    whole point of the pass. A map that shows ten pins from one sector has
 *    told the reader one thing ten times; a map that shows one pin from each of
 *    seven has told them what a district actually does.
 * 2. **Then widen the geography.** A taluka that already has a pin is skipped,
 *    so the rest land in as many parts of the two districts as the data allows.
 * 3. **Then simply the best of what is left.**
 */
export function curateSignals(
  signals: Signal[],
  now: Date = new Date(),
  limit: number = MARKER_LIMIT,
): Curation {
  const eligible = signals
    .filter((signal) => isShowable(signal, now))
    .sort((a, b) => quality(b, now) - quality(a, now));

  const shown: Signal[] = [];
  const areas = new Set<string>();
  const sectors: SignalCategoryId[] = [];

  const take = (signal: Signal) => {
    shown.push(signal);
    areas.add(areaOf(signal));
    if (!sectors.includes(signal.category)) sectors.push(signal.category);
  };

  for (const sector of SECTOR_ORDER) {
    if (shown.length >= limit) break;

    const best = eligible.find((signal) => signal.category === sector);
    if (best) take(best);
  }

  for (const signal of eligible) {
    if (shown.length >= limit) break;
    if (shown.includes(signal) || areas.has(areaOf(signal))) continue;

    take(signal);
  }

  for (const signal of eligible) {
    if (shown.length >= limit) break;
    if (shown.includes(signal)) continue;

    take(signal);
  }

  return { shown, eligible: eligible.length, published: signals.length, sectors };
}

/** The taluka if the record names one, else the district. Used to spread the
 *  selection out rather than to display anything. Districts are part of the key
 *  now that two of them are live — Khed is a taluka in Pune and a village name
 *  elsewhere, and Haveli is not unique either. */
function areaOf(signal: Signal): string {
  return `${signal.district ?? ""}/${signal.taluka ?? ""}`.trim().toLowerCase();
}

function sourceUrl(signal: Signal): string | undefined {
  return (
    signal.evidenceUrl ?? signal.provenance?.detailUrlMr ?? signal.provenance?.detailUrl
  );
}
