/**
 * What the news engine reads, and what each source will and will not give us.
 *
 * Written after probing both sites rather than from their documentation,
 * because neither documents any of this. The findings that shaped the design:
 *
 * LOKSATTA publishes a Google News sitemap at /news-sitemap.xml carrying the
 * Marathi headline, the publication timestamp and a bilingual keyword list for
 * every article — roughly 577 entries covering about two days. Discovery
 * therefore costs one request and already knows enough to cluster on. It also
 * exposes dated archive sitemaps (?yyyy=&mm=&dd=), which is the only backfill
 * either source offers.
 *
 * LOKMAT is harder. Its /sitemap.xml holds ~2,800 URLs but most of them are
 * topic hubs (1,396) and section pagination (/pune/page/4/), leaving only about
 * fifty real Maharashtra articles per refresh. Its per-section RSS feeds exist
 * but are unusable: /rss/maharashtra.xml was three weeks stale when probed and
 * /rss/amravati.xml returns 403. So Lokmat is discovered primarily from its
 * section pages, which are live and complete — the same pages the rank pass
 * already fetches every half hour, so the two jobs share one request.
 *
 * Lokmat also keeps no archive of any kind. Anything that scrolls out of the
 * sitemap window is unrecoverable, so its history begins the day polling
 * begins. That is the strongest argument for starting this loop now, before
 * anything downstream of it is built.
 *
 * ROBOTS. Lokmat allows everything. Loksatta's `User-agent: *` is `Allow: /`,
 * which is the rule this scraper falls under, but it separately names and
 * blocks ClaudeBot, anthropic-ai, PerplexityBot, Bytespider, cohere-ai and a
 * dozen other AI crawlers. We are not one of those and we are not training on
 * their text — but the signal is unambiguous, so `articleBody` is stored for
 * clustering and never republished. What goes on the website is the headline,
 * our own summary, and a link back. Both sites disallow /search/ and
 * /wp-json/wp/v2/; neither is touched here.
 */

/** Requests are spaced by `scripts/lib/http.mjs`; these are the polling gaps. */
export const CADENCE = {
  /** Lokmat's sitemap window is ~7h, Loksatta's news sitemap ~2 days. Fifteen
   *  minutes is far inside both and keeps timestamps sharp enough for velocity. */
  discoverMinutes: 15,
  /** The rank curve only needs to be smooth, not dense. */
  rankMinutes: 30,
  /** Same reasoning for the view curve, and it deliberately shares the rank
   *  pass's clock: the press signal and the audience signal are then sampled at
   *  the same moments, which is what makes the two comparable at all. */
  youtubeMinutes: 30,
};

/**
 * How far back a video keeps being re-observed.
 *
 * Views accrue fastest in the first hours, and a story still climbing two days
 * later is exactly what this service exists to find, so the window is
 * deliberately generous: a wider window costs a few quota units, a narrower one
 * costs the interesting half of the curve. Videos older than this stay in
 * `yt_videos` with whatever observations they collected; they simply stop being
 * asked about.
 */
export const YOUTUBE_TRACK_HOURS = 72;

/**
 * A ceiling on how many videos one sweep will ask about, so a channel that
 * suddenly posts three hundred Shorts cannot quietly eat the day's quota. The
 * newest videos are the ones kept when the cap bites.
 */
export const YOUTUBE_MAX_TRACKED = 600;

/**
 * Marathi news channels, watched for the one thing the newspapers cannot give:
 * a number the public generated rather than an editor.
 *
 * PINNED BY `channelId`, WITH THE HANDLE KEPT ONLY AS THE HUMAN-READABLE LABEL.
 * The first resolve pass (2026-08-30) is the reason. Of eight guessed handles
 * three did not resolve at all — an honest failure, reported and recorded — but
 * three others resolved to the *wrong channel* and were the more dangerous
 * outcome, because a wrong channel looks exactly like a right one in
 * `yt_channels`: @SaamTVNews was an 81-subscriber impersonation of the 6.1M
 * broadcaster, @LokmatMedia had 0 subscribers, and @News18Lokmat belonged to a
 * private individual. Only the 404 on that last one's uploads playlist gave the
 * game away. Handles are squatted, recycled and renamed; a `UC...` id is issued
 * once and never reassigned, so it is the only stable name a channel has.
 *
 * Every id below was verified twice over: subscriber count consistent with a
 * national broadcaster, and the three newest uploads read as Maharashtra news
 * on the day of pinning. Re-verify the same way before adding a ninth, and
 * treat a low subscriber count as a failure rather than a curiosity —
 * `handle did not resolve` is loud, a plausible impostor is silent.
 *
 * Eight is a deliberate number. The quota arithmetic that makes this pass safe
 * is one unit per channel per sweep for the uploads list, plus one per fifty
 * videos for the statistics — and never `search.list`, which costs a hundred a
 * call and would exhaust the day inside an hour. See scripts/news/youtube.mjs.
 */
export const YOUTUBE_CHANNELS = [
  { handle: "@abpmajhatv", channelId: "UCH7nv1A9xIrAifZJNvt7cgA", note: "ABP Majha — 16.4M, the largest Marathi news channel" },
  { handle: "@tv9marathilive", channelId: "UCdOSeEq9Cs2Pco7OCn2_i5w", note: "TV9 Marathi — 14.3M" },
  { handle: "@zee24taas", channelId: "UCVbsFo8aCgvIRIO9RYwsQMA", note: "Zee 24 Taas — 9.9M" },
  { handle: "@saamtv", channelId: "UC6cxTsUnfSZrj96KNHhRTHQ", note: "Saam TV News — 6.1M" },
  { handle: "@news18marathi", channelId: "UCrcpw88HvKJ0skdsHniCJtQ", note: "News18 Marathi — 5.9M; the channel the News18 Lokmat brand became" },
  { handle: "@lokmat", channelId: "UC5MHSwQ2menwYF2DqKoJsZg", note: "Lokmat — 4.7M, the masthead already in the article corpus" },
  { handle: "@mumbaitak", channelId: "UCQ2W9GCHctD59vQpvLKVg3g", note: "Mumbai Tak — 4.7M, digital-native, skews younger than the broadcasters" },
  { handle: "@loksatta", channelId: "UCwh_2Tw0JzkOEv74yvc20IQ", note: "Loksatta — 1.7M, the other masthead in the corpus" },
];

export const SOURCES = [
  {
    id: "lokmat",
    label: "Lokmat",
    homepage: "https://www.lokmat.com/",
    language: "mr",

    /** Flat urlset, no titles, ~7h rolling. Re-read every cycle. */
    discovery: [{ kind: "urlset", url: "https://www.lokmat.com/sitemap.xml" }],

    /** No dated archive exists. History accrues only from first run. */
    archive: null,

    /**
     * An article path is `/<section>/<slug>/`; Lokmat's slugs all carry a
     * trailing `-a-a<digits>` desk id. Topic and tag pages have short second
     * segments and are already dropped by the geography filter, so this only
     * has to be a floor, not a proof.
     */
    isArticleUrl: (url) => /^\/[a-z0-9-]+\/[a-z0-9-]{15,}\/?$/i.test(new URL(url).pathname),

    /**
     * Section pages, watched for the rank snapshot and read for discovery.
     *
     * The full district list rather than a sample, because for Lokmat these
     * pages *are* the article feed. The slugs are Lokmat's own spellings —
     * `jalana`, `vardha`, `vashim`, `sindhudurga`, `parabhani` — which
     * geography.mjs maps back onto the canonical district ids.
     *
     * Forty-one pages every thirty minutes is roughly 1.4 requests a minute to
     * one host, spaced by scripts/lib/http.mjs. That is a well-behaved reader.
     */
    rankPages: [
      "maharashtra",
      "mumbai", "navi-mumbai", "thane", "kalyan-dombivli", "palghar", "vasai-virar",
      "raigad", "ratnagiri", "sindhudurga",
      "nashik", "malegaon", "dhule", "nandurbar", "jalgaon", "ahilyanagar",
      "pune", "pimpri-chinchwad", "satara", "sangli", "solapur", "kolhapur",
      "chhatrapati-sambhajinagar", "jalana", "parabhani", "hingoli", "nanded",
      "beed", "latur", "dharashiv",
      "amravati", "akola", "vashim", "buldhana", "yavatmal",
      "nagpur", "vardha", "bhandara", "gondia", "chandrapur", "gadchiroli",
    ].map((section) => ({ id: section, url: `https://www.lokmat.com/${section}/` })),

    attribution: {
      label: "Lokmat (lokmat.com)",
      url: "https://www.lokmat.com/",
      note: "Headlines and metadata read from the publisher's own sitemap and schema.org markup. Full text is not reproduced.",
    },
  },

  {
    id: "loksatta",
    label: "Loksatta",
    homepage: "https://www.loksatta.com/",
    language: "mr",

    /** Google News sitemap: titles, publication dates and keywords included. */
    discovery: [{ kind: "urlset", url: "https://www.loksatta.com/news-sitemap.xml" }],

    /** Dated archives, used only when backfilling a specific day. */
    archive: (date) => {
      const [y, m, d] = date.split("-");
      return `https://www.loksatta.com/sitemap.xml?yyyy=${y}&mm=${m}&dd=${d}`;
    },

    /** Every Loksatta article ends in its numeric post id. */
    isArticleUrl: (url) => /-\d{6,}\/?$/.test(new URL(url).pathname),

    /**
     * A smaller watched set than Lokmat's, on purpose. Loksatta's news sitemap
     * is complete, so these pages are needed only for the rank curve, not for
     * finding articles — and a rank curve wants depth over time on the sections
     * that actually move, not thin coverage of all thirty-six.
     */
    rankPages: [
      "maharashtra", "mumbai", "pune", "nagpur", "thane",
      "nashik", "kolhapur", "aurangabad", "navimumbai", "vasaivirar",
    ].map((section) => ({ id: section, url: `https://www.loksatta.com/${section}/` })),

    attribution: {
      label: "Loksatta (loksatta.com)",
      url: "https://www.loksatta.com/",
      note: "Headlines and metadata read from the publisher's own news sitemap and schema.org markup. Full text is stored for analysis only and is not reproduced.",
    },
  },
];

export const sourceById = (id) => SOURCES.find((s) => s.id === id);
