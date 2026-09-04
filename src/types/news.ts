/**
 * The shapes the news map is built from.
 *
 * These describe **articles**, not projects. The map used to be fed by
 * `Signal` — a curated development record with a coordinate, a sector and a
 * stage — and every one of those four things is absent here. A newspaper
 * article has no lon/lat, no sector taxonomy and no lifecycle; what it has is
 * a district, a time and a position on a section page. So the
 * types are drawn from what the corpus actually holds rather than bent to fit
 * the old ones. See `scripts/news/db.mjs` for where each field comes from.
 */

/**
 * One article, as the browser gets it.
 *
 * `body` is deliberately not here and never crosses this boundary. The
 * collector stores it because the analysis needs it; republishing a Marathi
 * daily's article in full is a different act from linking to it, and this is
 * the line where that is enforced. The reader gets the headline, the
 * publisher's own standfirst, the picture and a link back — which is the
 * arrangement every aggregator on the web operates under.
 */
export type NewsArticle = {
  url: string;
  districtId: string | null;
  /** The site section the piece was filed under, verbatim — `नागपूर / विदर्भ`. */
  section: string | null;
  headline: string;
  /** The publisher's own one-line summary. Present on every fetched row. */
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string;
  /** Set only when the piece was edited after publication. */
  modifiedAt: string | null;
  wordCount: number | null;
  /** How many times a new `dateModified` has been observed. A running story
   *  gets rewritten; a filed-and-forgotten one never does. */
  revisions: number;
  /** Derived at read time from `rank_snapshots`. See `prominenceOf`. */
  prominence: Prominence | null;
};

/**
 * How prominently the press itself played a story — inferred, never stated.
 *
 * Neither paper publishes a view count, so the only evidence of attention
 * available from outside is where the editors put the link and how widely they
 * repeated it. `scripts/news/rank.mjs` records that and draws no conclusion
 * from it on purpose, so the conclusion is drawn here, at read time, where the
 * constants can be changed without re-scraping a week that cannot be
 * re-scraped.
 *
 * `reach` is the fraction of the section pages that came back in a sweep on
 * which this URL appeared. Near 1 means both papers were carrying it on every
 * desk's page — the global top-stories block — which is the strongest signal
 * of a big story the data contains. `bestPosition` is the highest the link
 * ever climbed in a page's markup.
 */
export type Prominence = {
  /** 0–1. Share of successfully-swept pages carrying the link, at its peak. */
  reach: number;
  /** 1-based. The best rank the link reached in any page's source order. */
  bestPosition: number;
  /** How many sweeps saw it at all — how long it stayed up. */
  sweeps: number;
  /** 0–1, the two above combined. What the lead story is chosen by. */
  score: number;
};

/** One district's news, as the map paints it. */
export type DistrictNews = {
  districtId: string;
  /** Articles in the active window, most prominent first. */
  articles: NewsArticle[];
  count: number;
  /** 0–5. Which step of the choropleth ramp this district is painted at;
   *  0 means nothing in the window, which is painted as bare land. */
  level: number;
  /** The piece the press played hardest here. Null when nothing is in window. */
  lead: NewsArticle | null;
  /** When the most recent piece from this district was published. */
  latestAt: string | null;
};

/**
 * How far back the map is looking.
 *
 * Time is the axis this corpus actually has, in the way sector and stage were
 * the axes the curated set had. Everything else about an article — which
 * which desk — is a fact about the newsroom; when it was published
 * is a fact about the state.
 */
export type WindowId = "24h" | "48h" | "7d" | "30d" | "all";

export type NewsWindow = {
  id: WindowId;
  hours: number | null;
  labelMr: string;
};

/**
 * Where someone sits in the Council of Ministers.
 *
 * Four ranks and not forty-one chips, because the corpus will not support the
 * second. Measured over seven days: the Chief Minister is named in 83 articles
 * and the senior Deputy in 35, after which the whole cabinet drops to single
 * figures — 29 of the 32 remaining ministers have between nought and four. Per-
 * minister tabs would therefore be a row of empty tabs most weeks. The rank is
 * the chip; the names live inside it and appear only where there is something
 * to open.
 *
 * `mos` is a Minister of State, which is a real distinction in this Council —
 * the six of them hold parts of portfolios that also have a Cabinet minister,
 * so folding them into `min` would put two people under one heading who are not
 * answerable for the same thing.
 */
export type MinisterTier = "cm" | "dcm" | "min" | "mos";

/**
 * What the reader has narrowed the map to.
 *
 * A rank or one person, never both — see `asMinisterFilter` for why the two
 * share a single URL parameter.
 */
export type MinisterFilter =
  | { kind: "tier"; tier: MinisterTier }
  | { kind: "one"; id: string };

/**
 * One minister as the browser gets them.
 *
 * Deliberately not the roster row. `Minister` in `src/data/ministers.ts` also
 * carries the Gazette's formal name and the alias lists the matcher is built
 * from, and none of that has any business crossing to the client: the aliases
 * are a server-side matching detail, and shipping forty-one of them would put a
 * few kilobytes of matching machinery into every page load to render a chip
 * that needs a name and a number.
 */
export type MinisterCount = {
  id: string;
  tier: MinisterTier;
  nameMr: string;
  portfolioMr: string;
  /** Articles in the current window naming them, before any filter. */
  articles: number;
};

/**
 * The chips, counted over the window the map settled on.
 *
 * Always counted against the **unfiltered** window. A board that renumbered
 * itself as the reader clicked through it would make the chip they just left
 * unreadable, and the counts are the only way to tell a quiet week for a
 * minister from a minister the roster has misspelled.
 */
export type MinisterBoard = {
  /** Articles per rank. An article naming two ministers of the same rank
   *  counts once, so these stay counts of articles rather than of mentions. */
  tiers: Record<MinisterTier, number>;
  /** Every minister in Gazette order, including those with nothing. */
  ministers: MinisterCount[];
  /** Articles in the window naming anyone at all. Measured at about 16% of
   *  the corpus, steady across every window from a day to a month. */
  matched: number;
};

/**
 * Everything the page needs, read in one pass on the server.
 *
 * Assembled whole rather than fetched per component: the choropleth needs the
 * counts, the panel needs the articles behind them and the plate needs the
 * totals, and three round trips to the same 665 rows to answer three questions
 * about the same window is three chances for them to disagree.
 */
export type NewsMap = {
  /** Keyed by canonical district id. Only districts with articles appear. */
  districts: Record<string, DistrictNews>;
  /** Articles that are about Maharashtra rather than a place in it. */
  statewide: NewsArticle[];
  /** The window actually used — may be wider than asked for. See `loadNewsMap`. */
  window: NewsWindow;
  /** Set when the window was widened because the one asked for was empty. */
  widened: boolean;
  totals: {
    articles: number;
    districts: number;
    statewide: number;
  };
  /** The upper count any district reached — the top of the choropleth ramp. */
  ceiling: number;
  /** The chips, counted over this window before the filter below was applied. */
  ministers: MinisterBoard;
  /** Which minister the map is narrowed to, or null for the whole press. When
   *  set, `districts`, `statewide` and `totals` describe the narrowed corpus —
   *  everything on the sheet is that minister's news and nothing else. */
  minister: MinisterFilter | null;
  /** When the collector last wrote to the database. */
  collectedAt: string | null;
  /** When the section pages were last swept, and how many came back. */
  sweptAt: string | null;
};

/**
 * What the sheet is currently showing.
 *
 * `heat` is the choropleth — how much news came out of each district, which is
 * a fact about volume. `pins` is the story layer — which running stories are
 * where, which is a fact about events. They answer different questions over
 * the same window, so they are modes rather than layers stacked on each other:
 * pins over a full-strength choropleth is two violet systems arguing on one
 * sheet, and the choropleth's own note on why it is the only colour that
 * varies applies exactly as written.
 */
export type MapMode = "heat" | "pins";

/**
 * How precisely a story's place is known.
 *
 * The tier is the whole reason pins are allowed back onto this map.
 * `choropleth-layer.tsx` argues that "a pin at a centroid is a lie told with
 * great precision", and it is right: the corpus is keyed by the desk that
 * filed the piece, and a sharp dot dropped on a district centroid invites the
 * reader to believe something happened in a field outside Ambajogai.
 *
 * The answer is not to refuse pins but to refuse to draw a *sharp* one on a
 * district-level guess. So the tier travels with the story all the way to the
 * mark — `taluka` is a place the article's own words named, `district` is only
 * the desk, `state` is not a place at all and gets no pin. See
 * `scripts/news/stories/place.mjs` for how the tier is decided.
 */
export type PlaceTier = "taluka" | "district" | "state";

/**
 * One article's position in a story, as the browser gets it.
 *
 * Deliberately thinner than `NewsArticle`. A step is a beat in a sequence —
 * who said it, when, what happened, where — and the panel reads as a flow only
 * if each beat is one line rather than a card. The picture and the standfirst
 * belong to the reading list; the progression is a chronology.
 *
 * The same rule holds as everywhere else on this boundary: `body` is not here
 * and never will be. The reader gets the publisher's headline, the time and a
 * link back to the publisher.
 */
export type StoryStep = {
  url: string;
  /** 1-based, ordered by `publishedAt`. Written by the pipeline, not derived
   *  here, so every consumer numbers the steps identically. */
  step: number;
  headline: string;
  publishedAt: string;
  /** Where *this* step happened, when the article's own text said. Null when
   *  only the desk was known — the story panel shows it only where it moves. */
  placeTier: PlaceTier | null;
  talukaNameMr: string | null;
  districtId: string | null;
};

/**
 * A running story as the map pins it — everything needed to draw the mark and
 * nothing needed to read the story.
 *
 * `point` is lon/lat rather than viewBox units because the projection lives on
 * the server and the client reproduces it: `geometry.projector` plus
 * `projectPoint` put this in the same space as the district paths. It is set
 * for the taluka tier only. A district-tier story has no coordinate at all and
 * is drawn at `DistrictShape.centroid`, which is a position the mark is
 * explicitly not claiming.
 *
 * The place is the story's **newest** known location, not its first and not
 * its most common. This corpus contains a march that went Amravati →
 * Babulgaon → Mantralaya over two days, and a pin left where the story started
 * is wrong from the second article onward.
 */
export type StoryPin = {
  id: string;
  /** The model's Marathi name for the story. See `label.mjs` — the model says
   *  what a story is about and never how important it is. */
  titleMr: string;
  actors: string | null;
  issue: string | null;
  placeTier: PlaceTier;
  talukaNameMr: string | null;
  districtId: string | null;
  /** `[longitude, latitude]`, taluka tier only. Projected in the browser. */
  point: [longitude: number, latitude: number] | null;
  /** The words in the article that put the story here, so the claim is
   *  checkable by a reader rather than only by its author. */
  placeEvidence: string | null;
  /** How many articles are in the thread, uncapped. */
  articles: number;
  firstAt: string;
  lastAt: string;
  /** Every desk that filed into this story. Kept because it is the evidence
   *  for why filing by desk district would have been wrong: the Long March
   *  carries six desks and happened in none of them. */
  deskDistricts: string[];
};

/** A pin with its progression — what the panel reads when a pin is clicked. */
export type Story = StoryPin & {
  /** Oldest first. Capped; `articles` is the true figure. */
  steps: StoryStep[];
};

/**
 * The story layer for one window, read in one pass beside the choropleth.
 *
 * Null-safe by construction: a deploy without `.data/stories.db` gets an empty
 * `stories` array and the map simply offers no pin mode. The derived store is
 * disposable in a way the collector's is not.
 */
export type NewsStories = {
  /** Pinnable stories — every tier except `state` — newest first. */
  stories: Story[];
  /** How many pinnable stories the window holds, before the payload cap. */
  total: number;
  /** Statewide stories, which get no pin. Counted so the plate can say they
   *  exist rather than letting them vanish between the two modes. */
  statewide: number;
  /** Which pipeline run this came from, and when it finished. */
  runId: number;
  runAt: string;
};

/**
 * How fast the press moved a story, as opposed to how far it got.
 *
 * `Prominence` is a level — the peak of what the papers ever gave a link. This
 * is its derivative, and the two answer different questions: a story sitting on
 * forty-one pages all day is big, and a story that was on one page an hour ago
 * and is on forty-one now is *on fire*. Only the second is news about the news.
 *
 * **The shape of this signal was measured before it was designed, and it is not
 * a gradient.** Across 515 URLs seen in two or more full sweeps, 510 (99.0%)
 * were at their peak reach the first time they were ever seen. The five that
 * moved did not drift — they stepped: 1 → 41 pages in fifty minutes, 3 → 35 in
 * nineteen, 10 → 34 in three. That is a newsroom promoting a story into the
 * sitewide top-stories block, and it is the sharpest thing in the corpus.
 *
 * So this is deliberately not a smoothed rate of change. It records the climb,
 * the two observations it happened between, and how long that took, because
 * "on one page at 12:04, on forty-one at 13:10" is the sentence
 * `scripts/news/README.md` demands a ranking be able to produce.
 *
 * Every field is a count of rows or a difference between two counts of rows.
 * Nothing here is a model output, and nothing here depends on a judgement made
 * at capture time — `rank.mjs` wrote down what it saw and stopped, and the
 * constants that turn that into a rate live in `velocity.ts` where they can be
 * retuned over the whole history.
 */
export type Velocity = {
  /** Which masthead's pages this was measured on. Reach is normalised within
   *  a source, never across: Lokmat has 41 section pages and Loksatta 10, so a
   *  shared denominator would score a Loksatta story its own paper is pushing
   *  everywhere *below* a Lokmat story on a quarter of its pages. */
  sourceId: string;
  /** 0–1. Share of that source's pages carrying the link when the climb began. */
  from: number;
  /**
   * The same three figures as raw page counts, with the size of the masthead
   * they are counted against.
   *
   * Carried because a fraction is not the defensible form. The standard
   * `scripts/news/README.md` sets is "eleven of thirteen outlets carried it" —
   * a count a reader can check — and "reach 0.976" is the kind of number that
   * has to be taken on trust. Each count is against the pages swept in its own
   * capture, so `pagesFrom` and `pagesTo` can be out of a different total on a
   * day when a page failed; `sitePages` is the total at the last observation,
   * which is the one the present-tense claim is made against.
   */
  pagesFrom: number;
  pagesPeak: number;
  pagesTo: number;
  sitePages: number;
  /** 0–1. The highest it reached inside the window. Evidence, not the score:
   *  a spike that fell back is visible here as `peak > to`. */
  peak: number;
  /** 0–1. Where it stood at the last observation. */
  to: number;
  /** `to - from`. The climb as it stands **now**, in units of "share of the
   *  masthead", which is the tense a fire board makes its claim in. Scoring the
   *  peak instead put a Loksatta piece that touched all ten pages for one
   *  capture level with a story that reached thirty-four Lokmat pages and was
   *  still on every one of them an hour later. */
  climb: number;
  /** `climb` per hour, over the interval the climb actually happened in rather
   *  than over the whole window. Floored at the collector's own cadence: a rate
   *  cannot be resolved faster than the thing is sampled. */
  climbPerHour: number;
  /** When the climb started and when it topped out — the two timestamps the
   *  defensible sentence is built from. */
  fromAt: string;
  peakAt: string;
  /** True when the link was not on any page at the start of the window. The
   *  story did not climb into the block, it landed in it. Both are fire and
   *  they read differently, so the readout can tell them apart. */
  arrived: boolean;
  /** True when it crossed from below the sitewide share to at or above it and
   *  is still there — the discrete event underneath the continuous number.
   *  Measured separation is wide enough that this is unambiguous: on a full
   *  capture the block sits at 39–41 of 41 Lokmat pages and 10 of 10 Loksatta
   *  ones, with nothing at all between there and 6 of 41. */
  promoted: boolean;
  /** Best position in page source order when the climb began and at the last
   *  observation, 1-based. Null means the link was not on any page then.
   *
   *  Corroboration only and weighted as such: source order is not layout order,
   *  and across the best available 1.17h window not one URL in the corpus
   *  improved its position while three were promoted outright. It scores
   *  nothing at all unless the link was present at *both* ends — an arrival has
   *  no position to have climbed from, and crediting it for appearing near the
   *  top of one page counts a level that reach has already counted. */
  positionFrom: number | null;
  positionTo: number | null;
  /** How many eligible captures the window actually contained. One capture
   *  cannot show a change, so a `Velocity` is never built from fewer than two
   *  and this is the number that says how much to believe the rest. */
  captures: number;
  /** The span the captures really covered, which is not the window asked for
   *  while the collector is still filling one. */
  observedHours: number;
  /** 0–1, the components combined. What a fire board sorts on. */
  score: number;
};

/**
 * One story on the fire board, with the evidence for why it is there.
 *
 * The unit is a **thread**, not an article, and the reason is that an article
 * cannot grow. It is published once and that is the whole of it; every number
 * that could rise — more outlets, more follow-ups, a bigger share of the site —
 * is a property of the running story an article belongs to. Threads come from
 * `scripts/news/stories/`, which is also where the one use of a model in this
 * project lives, fenced to deciding what a story is *about*.
 *
 * **Nothing on this board is a model output.** Every field below is a count of
 * rows or a difference between two counts of rows, and the ranking is
 * arithmetic on them. The model named these stories; it has no vote in which of
 * them is burning. That line is drawn in `scripts/news/README.md` and it is the
 * difference between "eleven of thirteen outlets carried it and it went from
 * one section page to forty-one in an hour" and "the model ranked it highest".
 */
export type FireEntry = {
  /** Null for an article the story pipeline has not threaded yet. Those are
   *  not dropped: `stories.db` is a snapshot built at a moment, the corpus runs
   *  on ahead of it, and the newest stories are exactly the ones most likely to
   *  be on fire. Measured on the current run, two of the three fastest-climbing
   *  stories in the corpus had no thread. */
  threadId: string | null;
  /** The model's Marathi name for the story, when it has one. Only 127 of the
   *  latest run's 571 threads are labelled, so this is often null and the
   *  headline below is what the board shows. */
  titleMr: string | null;
  /** The publisher's own headline for the piece driving the entry — always
   *  present, so an unlabelled story is still readable. */
  headline: string;
  /** The article the climb was measured on: a thread's fire is its hottest
   *  piece, not the sum of its pieces. */
  leadUrl: string;
  /** The climb, or null when nothing in this story moved. Null is "we watched
   *  and it did not move", which is a measurement — distinguishable from the
   *  whole board being null, which is "we have not watched for long enough". */
  velocity: Velocity | null;
  /** Articles in this story published inside the **arrival** window, which is
   *  wider than the velocity window and for a measured reason. */
  articlesInWindow: number;
  /** How many articles a story of average appetite would have taken from the
   *  same window — total filed, divided by the stories filing. Compared against
   *  rather than a flat rate because the newsroom's day has a shape: measured,
   *  arrivals run at 2/hour overnight and 27/hour at midday, so a fixed
   *  threshold would call every story dead at 4am and every story hot at noon. */
  expectedArticles: number;
  /** `articlesInWindow / expectedArticles`. 1.0 is an ordinary story. */
  arrivalRatio: number;
  /** Which mastheads carried it inside the window. Two today; the RSS pass is
   *  what turns this from a pair into a breadth worth counting. */
  sources: string[];
  /** Where the story is, carried through from the thread so fire can be put on
   *  the map. Null for an unthreaded entry, which has no resolved place. */
  placeTier: PlaceTier | null;
  talukaNameMr: string | null;
  districtId: string | null;
  point: [longitude: number, latitude: number] | null;
  /** 0–1, the components combined. What the board sorts on. */
  score: number;
};

/**
 * The fire board for one window, and an honest account of what it rests on.
 *
 * The metadata is not decoration. `captures` and `observedHours` are how a
 * reader tells a quiet three hours from three hours nobody was watching, and
 * the board is designed to be readable while it is still filling: velocity
 * needs two captures of the same masthead before it can say anything at all,
 * and until then this is an arrivals board that says so.
 */
export type FireBoard = {
  entries: FireEntry[];
  /** The newest capture the window is anchored on — not the wall clock, so a
   *  stalled collector shows its last real window and how old it is rather than
   *  a screen of confident zeros. */
  asOf: string | null;
  /** Eligible captures inside the window, per masthead. */
  captures: Record<string, number>;
  /** The span those captures actually covered, against the span asked for. */
  observedHours: number;
  /** The window the climb was measured over. */
  windowHours: number;
  /** The window arrivals were counted over, which is deliberately much wider.
   *  Measured, no story in the corpus files a second article inside three
   *  hours, so counting arrivals on the velocity clock could only ever return
   *  zero. See `ARRIVAL_HOURS` in `fire.ts`. */
  arrivalHours: number;
  /** False until some masthead has two eligible captures in the window. While
   *  it is false every `velocity` is null and the board is ranking arrivals
   *  alone — which is a real board, but it is not a measure of growth. */
  velocityAvailable: boolean;
  /** Which story run the threads came from, and how far its corpus reached.
   *  Articles published after `corpusTo` cannot have a thread yet. */
  runId: number | null;
  runCorpusTo: string | null;
};

/**
 * One video's growth across the attention window.
 *
 * Every field is either something the API said at a named moment or the
 * difference between two such things. `viewsFrom`/`viewsTo` and their two
 * timestamps are carried beside the rate for the reason
 * `scripts/news/README.md` sets as the standard: "41,203 views at 17:20, up
 * from 38,664 at 14:20" is a sentence a reader can check against the store,
 * where "2,539 views/hour" has to be taken on trust.
 */
export type VideoAttention = {
  videoId: string;
  /** The broadcaster's own title, unrewritten — the matching input. */
  title: string;
  handle: string;
  /** The resolved channel title, which is the name a reader recognises. A
   *  handle is squatted and renamed; see `yt_channels` on why ids are pinned. */
  channel: string;
  publishedAt: string;
  /** ISO-8601. A 45s Short and a 22m bulletin are not the same object. */
  duration: string;
  viewsFrom: number;
  viewsTo: number;
  /** `viewsTo - viewsFrom`. The difference between two named observations, not
   *  a sum of consecutive deltas — which is what makes it immune to the view
   *  purges `yt_stats` documents. */
  gain: number;
  fromAt: string;
  lastAt: string;
  /** How many observations *with a view count* the window holds. Two is the
   *  minimum a change can be seen in. */
  observations: number;
  /** The span those observations really covered, which is less than the window
   *  for a video published inside it. */
  observedHours: number;
  /** How old the video was at the last observation. Carried because the level
   *  rises monotonically with age — measured, average views run 8k at 0–6h and
   *  63k at 48h — so a rate without an age beside it invites the wrong
   *  reading. */
  ageHours: number;
  /** `min(gain, gain per hour)`. Speed may discount magnitude, never
   *  manufacture it. */
  viewsPerHour: number;
  /** How well the title matched the article it was attributed to, or null when
   *  the video was never put to the matcher. Never a threshold, always the
   *  score, so a reader can see how close a call it was. */
  matchScore: number | null;
};

/** Rows the arithmetic refused, counted so that a window which is mostly
 *  exclusions cannot pass for a window in which nobody watched anything. Each
 *  case is argued in `attention.ts`. */
export type AttentionExclusions = {
  hidden: number;
  single: number;
  live: number;
  stream: number;
  premiere: number;
  flat: number;
};

/** One window of YouTube growth, with everything needed to say how much of it
 *  was measurable at all. */
export type AttentionReading = {
  videos: VideoAttention[];
  /** The newest capture the window is anchored on — not the wall clock. Null
   *  when the YouTube pass has never run here. */
  asOf: string | null;
  windowHours: number;
  /** The span the eligible captures actually covered. Smaller than
   *  `windowHours` while the collector is filling its first window, and the
   *  difference is the whole of what "not enough history yet" means. */
  observedHours: number;
  captures: number;
  /** Videos the window held a curve for, before any exclusion. */
  considered: number;
  excluded: AttentionExclusions;
  totalViewsPerHour: number;
};

/**
 * A running story's share of the broadcast day, and the videos it is claimed
 * from.
 *
 * `channels` is the sturdy figure and `viewsPerHour` is not: the first is a
 * count of distinct broadcasters, the second a rate over a sample whose size
 * is reported in `AttentionCoverage` and measured at 2.5%. Read them in that
 * order.
 */
export type ThreadAttention = {
  /** Null when the matched article has no thread yet — the story pipeline is a
   *  snapshot, and the newest stories are the ones it predates. */
  threadId: string | null;
  titleMr: string | null;
  /** The article the match was actually made against, so the attribution is
   *  checkable rather than merely asserted. */
  leadHeadline: string;
  leadUrl: string;
  videos: VideoAttention[];
  /** Distinct broadcasters carrying it. A plain count of rows. */
  channels: string[];
  viewsPerHour: number;
  /** The single hottest video, kept beside the total because one clip taking
   *  30,000 views an hour and six clips taking 5,000 each are different
   *  claims. */
  peakViewsPerHour: number;
  gain: number;
  bestMatch: number;
};

/**
 * How much of the window's measured attention a reading accounts for.
 *
 * Reported with every board rather than computed on request, because it is the
 * figure that decides whether any of the rest may be used for anything. On the
 * corpus this was built against it is **0.025** — two and a half percent — and
 * a caller that ranks stories by `viewsPerHour` while ignoring that is ranking
 * a phrasing coincidence rather than an audience.
 */
export type AttentionCoverage = {
  matchedVideos: number;
  matchedViewsPerHour: number;
  totalViewsPerHour: number;
  /** `matchedViewsPerHour / totalViewsPerHour`, 0–1. */
  share: number;
  /** The matcher line the attribution was made at, carried so a board states
   *  the constant it was produced under. */
  threshold: number;
  /** Which story run supplied the threads, and how many articles the videos
   *  were scored against. */
  runId: number | null;
  articles: number;
};
