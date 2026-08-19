export const SIGNAL_STATUSES = [
  "announced",
  "sanctioned",
  "in-progress",
  "completed",
  "operational",
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export type SignalCategoryId =
  | "infrastructure"
  | "energy"
  | "transportation"
  | "public-systems"
  | "manufacturing"
  | "research"
  | "agriculture"
  | "water"
  | "housing"
  | "environment";

/**
 * Where a record came from and what the source itself said, kept verbatim.
 *
 * The pilot's display text is Marathi, taken from the district's own Marathi
 * posts; the English the pipeline works in lives here rather than being thrown
 * away, so the panel can offer both and a reviewer can check either against the
 * original notice. See `public/data/amravati/SOURCE.md`.
 */
export type SignalProvenance = {
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceDescription?: string;
  titleEn?: string;
  summaryEn?: string;
  /** The district's own wording for the kind of notice — "Declaration", "Tender". */
  noticeType?: string;
  validUntil?: string;
  detailUrl?: string;
  detailUrlMr?: string;
  scrapedAt?: string;
};

/** How each derived field was arrived at. `stated` came from the source; every
 *  other value is a rule the pipeline applied, and the panel says so. */
export type SignalConfidence = {
  category?: "stated" | "keyword" | "default";
  status?: "stated" | "keyword" | "default";
  agency?: "stated" | "keyword" | "default";
  /** How precisely the point is known — a village, a taluka centroid, or the district. */
  location?: "village" | "taluka" | "district";
  locationMatch?: string;
};

/**
 * The reader's version of a record, written by the AI pass in
 * `scripts/enrich-marathi.mjs` and stored alongside the notice — never
 * generated at request time.
 *
 * A land-acquisition notice says "भूसंपादन प्रकरण क्रमांक २९/४७/२०२६-२७ मौजा-
 * हिवरा बु." That is the district's own wording and it stays in `titleMr` as
 * the record of what was published; this is the same fact said the way someone
 * who does not work in the Collector's office would say it. The panel shows
 * this and links the original, so the plain version never replaces the notice —
 * it only gets you to it.
 */
export type SignalCard = {
  /** One line, no case numbers. Roughly ten Marathi words. */
  headline: string;
  /** One or two sentences of plain Marathi. */
  gist: string;
  /** Why this matters to someone living there. One sentence. */
  impact: string;
  /** `हिवरा बु., नांदगाव खंडेश्वर तालुका, अमरावती` — wholly Devanagari. */
  placeMr: string;
  /** The implementing body, shortened and in Marathi. */
  agencyMr: string;
  /** Which model wrote it, and when — so a stale card can be found later. */
  model?: string;
  generatedAt?: string;
};

/** A single verified development update. See PROJECT_BRIEF.md §5. */
export type Signal = {
  id: string;
  slug: string;
  title: string;
  titleMr?: string;
  summary: string;
  summaryMr?: string;
  category: SignalCategoryId;
  status: SignalStatus;
  publishedAt: string;
  milestoneDate?: string;
  district: string;
  taluka?: string;
  locality?: string;
  coordinates: [longitude: number, latitude: number];
  implementingAgency: string;
  outcome?: string;
  evidenceLabel?: string;
  evidenceUrl?: string;
  imageUrl?: string;
  featured?: boolean;
  provenance?: SignalProvenance;
  confidence?: SignalConfidence;
  /** The plain-Marathi rewrite the panel actually renders. */
  card?: SignalCard;
  /** No Marathi twin was found, so the display text is English. */
  needsTranslation?: boolean;
  needsReview?: boolean;
};

/** Credit the source data carries with it. Brief §4: it stays visible. */
export type Credit = { label: string; url: string; note?: string };

export type DataAttribution = {
  /** Who published the notice text. */
  content: Credit;
  /** Who the coordinates came from — they are inferred, never official. */
  geocoding?: Credit;
};

/**
 * A signal with its coordinates already projected into viewBox units.
 *
 * Only the anchor lives here. Where the *head* of the pin ends up — fanned out
 * of a neighbour's way, or folded into a counter with three other records —
 * depends on how far the reader has zoomed in, so it is decided per view by
 * `lib/map/cluster.ts` rather than carried by the record.
 *
 * Generic in the record it carries, because both kinds of record get pinned
 * now and the two sets are never on the sheet together. Anything that only
 * *draws* a pin takes the default and never has to ask which kind it has; the
 * two places that read a district back off the record — the legend's "one
 * district" line, the counter's plate — ask for `PlacedSignal<Signal>` and get
 * the field they need checked for them.
 */
export type PlacedSignal<T extends AnySignal = AnySignal> = {
  signal: T;
  /** The anchor: the record's own coordinate. Always truthful. */
  point: [x: number, y: number];
};

/**
 * How much the pipeline has seen land recently — the one line above the tally
 * that says the map is alive rather than archived.
 *
 * It counts **everything scraped**, not the curated set that gets pins: nine
 * pins is an editorial decision, and "how much moved this week" is a fact about
 * the state. The window travels with the count because the window is not fixed
 * — see `recentPulse` — and a figure without its window is a claim nobody can
 * check.
 */
export type SignalPulse = {
  count: number;
  /** Length of the window the count was taken over, in hours. */
  hours: number;
};

/**
 * A record that belongs to the whole state rather than to a place on it.
 *
 * A loan waiver, a drinking-water policy, an AI policy: each one is a real
 * development and each one is true of Sindhudurg and Gadchiroli alike. What it
 * does not have is an address, and that is what this type takes away: no
 * district, no taluka, no locality, because there is no answer to "where".
 *
 * It keeps `coordinates`, and they mean a different thing here. A district
 * record's coordinate is a finding — the pipeline matched a village and the pin
 * stands on it. A statewide record's is a **placement**: a point chosen by hand
 * so the record has somewhere to be drawn, one per division so the set spreads
 * across the sheet instead of stacking. Nothing reads them back as a location —
 * the readout and the panel both say `संपूर्ण महाराष्ट्र`, because that is where
 * the record applies.
 *
 * Everything else is a `Signal` unchanged, which is the whole reason for the
 * shape: the panel, the stage meter, the sector plate, the pin itself and the
 * source link all read these without knowing they are looking at a different
 * kind of record.
 *
 * These come from state Government Resolutions and cabinet releases rather than
 * from the district scrapers, so the set is small, hand-written, and lives in
 * `public/data/maharashtra/statewide.json`.
 */
export type StatewideSignal = Omit<Signal, "district" | "taluka" | "locality"> & {
  scope: "state";
};

/** Either kind of record — what anything that only *renders* a record takes. */
export type AnySignal = Signal | StatewideSignal;

/**
 * What the map is currently about: the districts, or the state as a whole.
 *
 * Not a filter and not a layer — the two sets answer different questions and
 * are never on screen together. "What is happening near me" is answered by the
 * district pins; "what has the state decided" is answered by the statewide set,
 * which takes the sheet over from them rather than joining them on it.
 */
export type MapScope = "district" | "state";
