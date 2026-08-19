import { readFile } from "node:fs/promises";
import path from "node:path";

import published from "@/data/published-signals.json";
import { signalFileSchema, statewideFileSchema } from "@/lib/validation/signal";
import type {
  DataAttribution,
  Signal,
  SignalCategoryId,
  SignalPulse,
  StatewideSignal,
} from "@/types/signal";

/**
 * One published row: which district file to read the record from, and the
 * editorial corrections that stand between the scraper's guess and the map.
 *
 * `category` is the only field allowed to override the pipeline, and only
 * because the data asks for it — both districts' files carry the caveat
 * "Category and status are derived from notice wording; both need editorial
 * confirmation". A row that overrides carries `why`; a row that does not
 * carries `note` or nothing. Neither ever changes what the notice says.
 */
export type PublishedRecord = {
  district: string;
  id: string;
  category?: SignalCategoryId;
  why?: string;
  note?: string;
};

export const PUBLISHED_RECORDS: readonly PublishedRecord[] =
  published.records as PublishedRecord[];

/** Ids only, for anything that just needs to know what is live. */
export const PUBLISHED_SIGNAL_IDS: readonly string[] = PUBLISHED_RECORDS.map(
  (record) => record.id,
);

const DATA_ROOT = path.join(process.cwd(), "public", "data");

const signalFile = (district: string) =>
  path.join(DATA_ROOT, district, "signals.json");

export type SignalSet = {
  signals: Signal[];
  /**
   * Travels with the data so the panel can never render without its credit.
   * Keyed by the district a record names, because the pilot now reads two
   * portals and each one is its own publisher — a Pune notice credited to
   * Amravati's administration would be a false statement about provenance.
   */
  attribution: Record<string, DataAttribution>;
};

/**
 * Reads every district named by the publication list, in the order listed
 * there.
 *
 * Files are read once each however many records they contribute, and a missing
 * id throws rather than being skipped: a row in the publication list is a
 * statement that a record is live, so a typo should stop the build instead of
 * quietly shortening the map.
 */
export async function loadPublishedSignals(): Promise<SignalSet> {
  const districts = [...new Set(PUBLISHED_RECORDS.map((record) => record.district))];

  const files = await Promise.all(
    districts.map(async (district) => {
      const raw = await readFile(signalFile(district), "utf8");
      const { meta, signals } = signalFileSchema.parse(JSON.parse(raw));

      return {
        district,
        attribution: meta.attribution,
        byId: new Map(signals.map((signal) => [signal.id, signal])),
      };
    }),
  );

  const byDistrict = new Map(files.map((file) => [file.district, file]));

  const live = PUBLISHED_RECORDS.map((record) => {
    const file = byDistrict.get(record.district);

    if (!file) throw new Error(`Published record names an unknown district: ${record.district}`);

    const signal = file.byId.get(record.id);

    if (!signal) {
      throw new Error(
        `Published signal is missing from ${record.district}/signals.json: ${record.id}`,
      );
    }

    if (!record.category || record.category === signal.category) return signal;

    // An override is an editorial statement, so it is recorded as one: the
    // panel's confidence block should say the sector was confirmed by a person,
    // not keep claiming the keyword rule that got it wrong.
    return {
      ...signal,
      category: record.category,
      confidence: { ...signal.confidence, category: "stated" as const },
    };
  });

  const attribution = Object.fromEntries(
    files.map((file) => [file.district.toLowerCase(), file.attribution]),
  );

  return { signals: live, attribution };
}

export type StatewideSet = {
  signals: StatewideSignal[];
  attribution: DataAttribution;
};

/**
 * The records that are true of the whole state.
 *
 * A separate read from a separate file, and deliberately not folded into
 * `loadPublishedSignals`: these come from state Government Resolutions rather
 * than from the district portals, they are credited to the state rather than
 * to a Collector's office, and none of them has a coordinate. Merging the two
 * sets would mean every consumer of a record downstream having to ask which
 * kind it is before it could place it. Two files, two loaders, one panel.
 *
 * There is no publication list guarding this one. That list exists because the
 * district files hold hundreds of scraped notices and only nine are live; this
 * file holds exactly what is live, written by hand, so a second list naming its
 * own three rows would only be a place for the two to disagree.
 */
export async function loadStatewideSignals(): Promise<StatewideSet> {
  const raw = await readFile(
    path.join(DATA_ROOT, "maharashtra", "statewide.json"),
    "utf8",
  );
  const { meta, signals } = statewideFileSchema.parse(JSON.parse(raw));

  return { signals, attribution: meta.attribution };
}

/**
 * Windows the pulse line will accept, tightest first, in hours.
 *
 * The line reads "in the last 48 hours" because that is the claim worth making
 * — it says the map is watching, not that it was built once. But the pipeline
 * runs against district portals that publish in bursts, and a quiet Tuesday
 * would leave a headline reading "0 things moved Maharashtra forward", which is
 * both untrue and the worst thing the page could say about itself. So the
 * window widens until it finds something, and the line names whichever window
 * it ended up using. A widening window is honest; a zero is not.
 */
const PULSE_WINDOWS = [48, 24 * 7, 24 * 30] as const;

/**
 * How many notices landed in the recent past, over the tightest window that
 * has any.
 *
 * Counted across every scraped record rather than the published nine: the pins
 * are a curated selection and this is a statement about the pipeline. Returns
 * null when even the widest window is empty, and the plate then simply does not
 * draw the line — a headline that has to be invented is worse than no headline.
 */
export async function recentPulse(now: Date = new Date()): Promise<SignalPulse | null> {
  const districts = [...new Set(PUBLISHED_RECORDS.map((record) => record.district))];

  const dates = (
    await Promise.all(
      districts.map(async (district) => {
        const raw = await readFile(signalFile(district), "utf8");
        const { signals } = signalFileSchema.parse(JSON.parse(raw));

        return signals.map((signal) => Date.parse(signal.publishedAt));
      }),
    )
  )
    .flat()
    .filter((time) => Number.isFinite(time));

  for (const hours of PULSE_WINDOWS) {
    const since = now.getTime() - hours * 60 * 60 * 1000;
    const count = dates.filter((time) => time >= since).length;

    if (count > 0) return { count, hours };
  }

  return null;
}
