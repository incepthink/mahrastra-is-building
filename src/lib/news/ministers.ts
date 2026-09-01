import "server-only";

import { query, newsDb } from "./db";
import { snapshotArticlesSince } from "./snapshot";
import {
  MINISTER_BY_ID,
  MINISTER_TIERS,
  MINISTERS,
  satisfiesFilter,
  type Minister,
} from "@/data/ministers";
import type {
  MinisterBoard,
  MinisterCount,
  MinisterFilter,
  MinisterTier,
} from "@/types/news";

/**
 * Which articles name which minister — decided here, at read time, and stored
 * nowhere.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A COLUMN ON `articles`.
 *
 * `scripts/news/db.mjs` sets the rule in its own header: *"If you are about to
 * add a column whose value depends on a constant you chose, it belongs in that
 * service, not in this file."* A minister tag depends entirely on the roster in
 * `src/data/ministers.ts`, which is a list this project asserts rather than
 * something a source said. Three concrete things would break if it were stored:
 *
 *   - A reshuffle would freeze wrong. Rows tagged while a portfolio was held
 *     stay tagged that way, and re-tagging means rewriting a corpus that cannot
 *     be re-scraped — the feeds keep no archive.
 *   - A roster fix would need a backfill. Add a missing alias and every article
 *     collected before that moment silently keeps missing them.
 *   - There is nothing to cache anyway. Matching all 41 ministers against the
 *     whole corpus takes about 75 ms; see `ministerIndex` for the measurement.
 *
 * So this is the same arrangement `prominence.ts` already lives under: the
 * store holds observations, and the judgement is made on the way out where its
 * constants can be changed without touching a byte of collected data.
 * ---------------------------------------------------------------------------
 *
 * WHAT IS MATCHED, AND WHAT IS DELIBERATELY NOT.
 *
 * `keywords`, then `headline`, then `description` — and never `body`.
 *
 * `keywords` is the load-bearing one. Both mastheads tag their own articles
 * with the people the piece is about, bilingually and already disambiguated
 * between `एकनाथ शिंदे`, `श्रीकांत शिंदे` and `अजिंक्य शिंदे`. It is present on
 * 1,075 of 1,086 fetched rows. Nothing this file could infer from prose would
 * beat a tag the publisher wrote themselves.
 *
 * `body` is excluded on evidence, not on principle. It matches far more — 116
 * articles mention Fadnavis against the 82 that are tagged with him — but the
 * median first mention sits 26% of the way into the copy and only 16 of 116 are
 * in the first 200 characters. Those are passing mentions, not stories about
 * him. It also may not cross the boundary into the browser at all, which
 * `types/news.ts` states as a rule; matching on it here would put the reader one
 * refactor away from a payload that violates it.
 */

/**
 * How a name is found inside a line of Marathi or English text.
 *
 * **Substring matching is not safe here and the corpus proves it twice.**
 * `प्रताप सरनाईक` contains `नाईक`, so a substring match files the Transport
 * Minister's news under the Forest Minister. `तपासावे` — an ordinary verb —
 * contains `सावे`. Both are avoided by requiring a word boundary, and Devanagari
 * needs that boundary spelled out because JavaScript's `\b` is built from ASCII
 * `\w` and treats every Devanagari character as a boundary.
 *
 * The two sides are deliberately asymmetric:
 *
 *   left  `(?<![\p{L}\p{M}])`  nothing letter-like may precede. Blocking a
 *         combining mark as well is what rejects `तपासावे`, where `सावे` is
 *         preceded by the vowel sign `ा` rather than by a consonant.
 *   right `(?![\p{L}])`        a letter may not follow, but a combining mark
 *         may. This is not laxity — it is Marathi inflection. Surnames take
 *         their case endings as attached matras, so `फडणवीसांनी` is `फडणवीस`
 *         plus `ांनी`, and a symmetric rule would refuse every oblique form in
 *         the corpus.
 */
function boundedPattern(alias: string): RegExp {
  // The hyphen is deliberately **not** escaped, and `राधाकृष्ण विखे-पाटील` is
  // why: outside a character class a hyphen is already literal, and under the
  // `u` flag `\-` is an *invalid* escape that throws at construction. Escaping
  // it took the whole roster down at import time, which no type checker could
  // have seen.
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}])`, "iu");
}

type CompiledAlias = { needle: string; pattern: RegExp };

/**
 * Every alias in the roster, compiled once per process.
 *
 * `needle` is the lowercased alias used as a prefilter. The regexes are the
 * correct test but the expensive one, and the overwhelming majority of articles
 * name no minister at all, so a plain `includes` decides almost every row before
 * a pattern is ever run. Lowercasing is a no-op for Devanagari — the script has
 * no case — and is what makes `Fadnavis` and `fadnavis` one alias.
 */
const COMPILED: Array<{ minister: Minister; aliases: CompiledAlias[] }> = MINISTERS.map(
  (minister) => ({
    minister,
    aliases: [...minister.aliasesMr, ...minister.aliasesEn].map((alias) => ({
      needle: alias.toLowerCase(),
      pattern: boundedPattern(alias),
    })),
  }),
);

/**
 * One pattern that matches any alias in the roster, used only to say no.
 *
 * The per-minister loop below is 110 alias tests, and five articles in six name
 * nobody at all — so almost all of that work went on proving a negative 110
 * separate times. This settles the negative in one pass, and only the sixth
 * article that survives pays for the loop that says *which* minister.
 *
 * Measured over the corpus, matching alone: 64 ms without this, 38 ms with it,
 * returning the same 162 articles both ways. That is the honest size of it —
 * the index build as a whole is about 75 ms, and the read of 1,086 rows is
 * roughly the other half.
 *
 * Correctness is unaffected by construction: this is an alternation of exactly
 * the same alias list under exactly the same boundary rule, so it cannot reject
 * anything the loop would have accepted.
 */
const ANY_MINISTER = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:${MINISTERS.flatMap((minister) => [
    ...minister.aliasesMr,
    ...minister.aliasesEn,
  ])
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![\\p{L}])`,
  "iu",
);

/**
 * Which ministers a piece of text names, by roster id.
 *
 * Public because the DGIPR layer needs exactly this and has no articles to
 * index: a release is a title and a body of government text, matched directly.
 * The government layer is where ministers are dense — 81 of 141 releases name
 * one in the title alone — so it gets the same matcher rather than an
 * approximation of it.
 */
export function ministersInText(text: string): string[] {
  if (!text || !ANY_MINISTER.test(text)) return [];

  const haystack = text.toLowerCase();
  const found: string[] = [];

  for (const { minister, aliases } of COMPILED) {
    for (const alias of aliases) {
      if (!haystack.includes(alias.needle)) continue;
      if (!alias.pattern.test(text)) continue;

      found.push(minister.id);
      break;
    }
  }

  return found;
}

/** What the index is built over. A narrow projection on purpose — this is the
 *  one query in the app that reads every article regardless of window. */
type NameRow = {
  url: string;
  keywords: string | null;
  headline: string | null;
  description: string | null;
};

export type MinisterIndex = {
  /** Roster ids naming this article, in roster order. Empty for most rows. */
  idsFor(url: string): string[];
  /** Whether this article satisfies the filter. */
  matches(url: string, filter: MinisterFilter): boolean;
  /** How many articles in the whole corpus name any minister — the honest
   *  denominator behind every chip count. */
  matched: number;
};

/**
 * The whole corpus, indexed by URL.
 *
 * Built unbounded rather than per window, and that is the one deliberate cost
 * in this file. The story layer needs it: `loadStories` carries threads whose
 * `last_at` is inside the window but whose earlier steps are not, and a thread
 * is shown under a minister when *any* article in it names them. An index built
 * only over the window would silently drop a running story whose ministerial
 * article happens to be its oldest.
 *
 * Measured at 1,086 articles against 41 ministers: about 75 ms warm, of which
 * roughly half is the read and half the matching. Built once per request in
 * `page.tsx` and handed to every reader that needs it, rather than cached at
 * module scope — the collector appends to this database continuously, and a
 * cache keyed on nothing would serve a stale index for the life of the
 * process.
 */
export function ministerIndex(): MinisterIndex {
  const byUrl = new Map<string, string[]>();

  for (const row of nameRows()) {
    // One haystack per article rather than three passes over three fields.
    // The separator is a character no alias can contain, so a name cannot be
    // assembled across a field boundary — `…शिंदे` at the end of a headline
    // and `एकनाथ…` at the start of a description are two different facts.
    const ids = ministersInText(
      `${row.keywords ?? ""} | ${row.headline ?? ""} | ${row.description ?? ""}`,
    );

    if (ids.length > 0) byUrl.set(row.url, ids);
  }

  return {
    idsFor: (url) => byUrl.get(url) ?? [],
    matches: (url, filter) => satisfiesFilter(byUrl.get(url) ?? [], filter),
    matched: byUrl.size,
  };
}

/**
 * The rows the index is built from, from the collector's database or from the
 * shipped corpus.
 *
 * The same fork as `read.ts::articlesSince`, and it has to be: a production
 * deploy has no `.data/` and reads the committed snapshot, so a matcher that
 * only knew how to query SQLite would leave every chip on the deployed map
 * reading zero while the laptop that built it showed 146.
 */
function nameRows(): NameRow[] {
  if (!newsDb()) {
    return snapshotArticlesSince(null).map((row) => ({
      url: row.url,
      keywords: row.keywords,
      headline: row.headline,
      description: row.description,
    }));
  }

  return query<NameRow>(
    `SELECT url, keywords, headline, description
       FROM articles
      WHERE fetch_status = 'ok' AND published_at IS NOT NULL`,
  );
}

/**
 * What the plate's chips say, counted over the window actually being shown.
 *
 * Counts are of the **unfiltered** window, which is what makes the chips a
 * board rather than a readout of the current selection: switching from the
 * Chief Minister to Revenue must not renumber the chip you are switching away
 * from. `loadNewsMap` therefore builds this before it applies the filter.
 *
 * A minister with nothing in the window is carried with a zero rather than
 * dropped. The plate decides what to print — it shows named chips only where
 * there is something to open — but the decision is the view's, and a board that
 * silently omitted a minister would leave a reader unable to tell "no news this
 * week" from "not in the cabinet".
 */
export function ministerBoard(index: MinisterIndex, urls: string[]): MinisterBoard {
  const perMinister = new Map<string, number>();
  const tiers: Record<MinisterTier, number> = { cm: 0, dcm: 0, min: 0, mos: 0 };
  let matched = 0;

  for (const url of urls) {
    const ids = index.idsFor(url);
    if (ids.length === 0) continue;

    matched += 1;

    for (const id of ids) {
      perMinister.set(id, (perMinister.get(id) ?? 0) + 1);
    }

    // A tier is counted once per article even when the article names two of
    // its members, so the tier totals stay a count of articles. Summing the
    // per-minister figures instead would report 4 articles for a week that
    // held 3, which is the kind of number a reader can check against the list
    // underneath it.
    for (const tier of MINISTER_TIERS) {
      if (ids.some((id) => MINISTER_BY_ID.get(id)?.tier === tier)) tiers[tier] += 1;
    }
  }

  const ministers: MinisterCount[] = MINISTERS.map((minister) => ({
    id: minister.id,
    tier: minister.tier,
    nameMr: minister.nameMr,
    portfolioMr: minister.portfolioMr,
    articles: perMinister.get(minister.id) ?? 0,
  }));

  return { tiers, ministers, matched };
}
