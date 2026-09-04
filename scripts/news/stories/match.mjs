/**
 * Pass 1 — the free matcher. Which articles are the same event.
 *
 * This solves one of the two relations in the corpus and does not pretend to
 * solve the other. **Same event, two mastheads, same day** is a text problem
 * and text solves it: reporters describing one thing reuse the proper nouns,
 * and above 0.45 on the blend in `text.mjs` every measured pair was genuine.
 * **Same running story across days** is not a text problem at all — each
 * article in a running story exists because it says something new — and no
 * threshold separates it from noise. That relation is handled in `label.mjs`,
 * one model call per group, and nothing in this file attempts it.
 *
 * Three things the original plan got wrong, corrected here against measured
 * results on the 665-article corpus:
 *
 * 1. **District is a bonus, never a block.** Blocking candidate pairs by
 *    district is the obvious optimisation and it makes the acceptance test
 *    impossible: the tribal students' Long March was filed under chandrapur,
 *    thane, amravati, nagpur four times, mumbai-city and one statewide row.
 *    `articles.district_id` is the desk that filed the piece, not where the
 *    event happened. So blocking is by TIME only, and a shared district adds a
 *    small amount rather than gating anything.
 * 2. **Candidates come from an inverted index on rare terms.** Every pair in
 *    the window is ~96,000 comparisons for five days and grows as the square.
 *    Two articles about the same event always share at least one rare term, so
 *    only pairs that co-occur in some rare term's posting list are ever
 *    scored — which is a few thousand, and exact for the pairs that matter.
 * 3. **No LLM sees a borderline pair.** The 0.3-0.6 band is packed with
 *    same-event duplicates this file already gets right, and the cross-day
 *    pairs sit mostly below 0.3, so sampling that band would spend money to
 *    re-confirm easy answers and still miss the hard ones.
 */
import {
  buildIdf,
  cosine,
  keywordPhrases,
  termCounts,
  toVector,
  trigrams,
} from "./text.mjs";

/**
 * The constants. All of them are recorded against the run that used them.
 *
 * `MERGE_THRESHOLD` is 0.45 because that is where the window was measured
 * clean: every pair at or above it was a genuine same-event pair. Two things
 * worth knowing about that number, both measured on the Aug 26-30 window:
 *
 * - The headroom is much larger than expected. The named calibration case —
 *   the Aug 28 Thane ashram-school POCSO arrest against the Aug 28 Amravati
 *   Long March pieces, same day, sharing `आदिवासी` and `विद्यार्थिनी` — scores
 *   0.133, not the near-miss it was taken for. Shared common nouns are worth
 *   almost nothing once IDF has had them.
 * - The threshold is conservative, not exact. There are true same-event pairs
 *   between about 0.41 and 0.45 that it declines (the Pune municipal exam
 *   irregularity at 0.427, the Cipla licence at 0.426), and the first pair
 *   that is arguably not one event appears around 0.43. 0.45 keeps the side of
 *   that line where the answer is not arguable, which is the right trade for a
 *   union-find: an accepted pair is transitive and a wrong one merges two
 *   stories, while a declined one only leaves a group smaller than it could be.
 *
 * Chaining, the usual objection to a transitive closure, does not bite here:
 * at 0.40 the largest group in the window is still four articles.
 *
 * `PAIR_WINDOW_HOURS` is 48 because the relation being matched is same-event,
 * and the same event covered more than two days apart is a follow-up, which is
 * the other relation. It also drops the Aug 20 Chandrapur hostel piece from
 * the Long March on time alone — correctly: a seven-day coverage gap means
 * nothing textual connects them either.
 *
 * What this produces on the acceptance case is worth stating, because it is
 * both the success and the limit. The Long March's ten articles come out as
 * one four-article group — the Aug 28 setting-off pieces and the Aug 29
 * suspension pieces, filed by amravati and nagpur desks, which is the merge
 * district blocking would have made impossible. The other six are separate
 * groups, and they are *supposed* to be: the Congress accusation, the High
 * Court order and the Aug 20 hostel piece are different events in one running
 * story, and joining them is the label's job, not this file's.
 */
export const MERGE_THRESHOLD = 0.45;
export const PAIR_WINDOW_HOURS = 48;

/**
 * A term is a candidate generator only if it is rare enough to be about
 * something. A posting list longer than this is a common word — `पोलीस`,
 * `Maharashtra`, a masthead's boilerplate tag — and pairing everything inside
 * it costs more than every rare term put together while generating nothing the
 * rare terms miss.
 */
const RARE_DF_MAX = 30;

/**
 * Weight on the word half of the blend. The rest goes to headline trigrams.
 *
 * Words say which story; trigrams say the two headlines are phrased about the
 * same thing and survive Marathi's inflection, where two mastheads decline the
 * same noun differently and word overlap sees two unrelated terms.
 */
const TERM_WEIGHT = 0.62;

/**
 * What a shared desk district is worth. Deliberately small.
 *
 * It is real evidence — two Beed pieces on one day are likelier to be the same
 * event than a Beed piece and a Nashik piece — but it is evidence about the
 * newsroom, not about the world, and the story this pipeline is built to catch
 * is one that six desks filed. Large enough to break ties, too small to make a
 * match on its own.
 */
const DISTRICT_BONUS = 0.03;

/**
 * The corpus this run clusters over.
 *
 * `fetch_status = 'ok'` only, for the same reason the map uses it: a pending
 * row has a URL and nothing else, and a group built from URLs is not a group.
 *
 * The window is on `published_at`, never `discovered_at`. Both matter and they
 * are different questions — "what happened" against "when did our cron notice"
 * — and a section page carries evergreen links from 2023, so a corpus bounded
 * by discovery time would drag three-year-old articles into today's clusters.
 *
 * The bounds are annotated because this module is imported by TypeScript as
 * well as by Node — `src/lib/news/attention.ts` scores broadcast titles against
 * this corpus — and without them the checker infers the parameter type from the
 * `= null` defaults alone and rejects the string every caller actually passes.
 *
 * @param {unknown} newsDb A read-only handle on `.data/news.db`.
 * @param {{ fromIso?: string | null, toIso?: string | null }} [window]
 */
export function loadCorpus(newsDb, { fromIso = null, toIso = null } = {}) {
  const clauses = ["a.fetch_status = 'ok'", "a.published_at IS NOT NULL"];
  const params = [];

  if (fromIso) {
    clauses.push("a.published_at >= ?");
    params.push(fromIso);
  }
  if (toIso) {
    clauses.push("a.published_at <= ?");
    params.push(toIso);
  }

  const rows = newsDb
    .prepare(
      `SELECT a.url, a.source_id, a.district_id, a.scope, a.section,
              a.headline, a.sitemap_title, a.description, a.keywords,
              a.sitemap_keywords, a.body, a.published_at, a.image_url,
              a.word_count
         FROM articles a
        WHERE ${clauses.join(" AND ")}
        ORDER BY a.published_at`,
    )
    .all(...params);

  return rows.map((row) => ({
    url: row.url,
    sourceId: row.source_id,
    districtId: row.district_id,
    scope: row.scope,
    section: row.section,
    headline: row.headline ?? row.sitemap_title ?? "",
    description: row.description ?? "",
    body: row.body ?? "",
    imageUrl: row.image_url ?? null,
    wordCount: row.word_count ?? null,
    publishedAt: row.published_at,
    at: Date.parse(row.published_at),
    keywordPhrases: keywordPhrases(row.keywords, row.sitemap_keywords),
  }));
}

/**
 * Vectors, trigrams and the rare-term index for a corpus.
 *
 * Built once and handed around, because IDF is a property of the whole corpus
 * and recomputing it per comparison would make every score depend on which
 * pair happened to be looked at.
 */
export function indexCorpus(articles) {
  const counts = articles.map((article) => termCounts(article));
  const { idf, df } = buildIdf(counts);

  const vectors = counts.map((count) => toVector(count, idf));
  const grams = articles.map((article) => trigrams(article.headline));

  /** term -> the article indices that carry it, for rare terms only. */
  const postings = new Map();

  counts.forEach((count, index) => {
    for (const term of count.keys()) {
      if ((df.get(term) ?? 0) > RARE_DF_MAX) continue;

      const list = postings.get(term);
      if (list) list.push(index);
      else postings.set(term, [index]);
    }
  });

  return { counts, idf, df, vectors, grams, postings };
}

/**
 * Every pair worth scoring: co-occurring in some rare term, within the window.
 *
 * The articles arrive sorted by time, so the posting lists are sorted too and
 * the inner walk can stop the moment it leaves the window rather than scanning
 * the rest of the list.
 */
export function candidatePairs(articles, index, { windowHours = PAIR_WINDOW_HOURS } = {}) {
  const span = windowHours * 3600_000;
  const pairs = new Set();

  for (const list of index.postings.values()) {
    if (list.length < 2) continue;

    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];

      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (articles[b].at - articles[a].at > span) break;

        pairs.add(a * articles.length + b);
      }
    }
  }

  return pairs;
}

/**
 * How alike two articles are, on the blend the measurements were taken with.
 *
 * Returned as a number and nothing else. There is no verdict here and no
 * threshold applied — the caller owns the threshold, because the threshold is
 * the one constant in this pipeline a reader might reasonably disagree with,
 * and it belongs on the run record rather than buried in a function.
 */
export function affinity(a, b, index, ia, ib) {
  const terms = cosine(index.vectors[ia], index.vectors[ib]);
  const gram = cosine(index.grams[ia], index.grams[ib]);

  const blended = TERM_WEIGHT * terms + (1 - TERM_WEIGHT) * gram;
  const sameDistrict =
    a.districtId !== null && a.districtId === b.districtId ? DISTRICT_BONUS : 0;

  return { score: Math.min(1, blended + sameDistrict), terms, gram };
}

/**
 * Group the articles into events.
 *
 * Union-find over accepted pairs, which makes the relation transitive: A and B
 * are the same event, B and C are the same event, so all three are one group
 * even if A and C never scored above the line themselves. That is the right
 * reading for a wire story picked up by two papers at different lengths, and
 * it is the reason the threshold is set where it is — a transitive closure
 * built from loose pairs chains unrelated stories together through a hub.
 */
export function buildEvents(
  articles,
  index,
  { threshold = MERGE_THRESHOLD, windowHours = PAIR_WINDOW_HOURS } = {},
) {
  const parent = articles.map((_, i) => i);
  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) [x, parent[x]] = [parent[x], root];
    return root;
  };

  const pairs = candidatePairs(articles, index, { windowHours });
  /** Best score that pulled each article into its group — the audit trail. */
  const affinities = articles.map(() => 0);
  let accepted = 0;

  for (const key of pairs) {
    const ia = Math.floor(key / articles.length);
    const ib = key % articles.length;

    const { score } = affinity(articles[ia], articles[ib], index, ia, ib);
    if (score < threshold) continue;

    accepted += 1;
    affinities[ia] = Math.max(affinities[ia], score);
    affinities[ib] = Math.max(affinities[ib], score);

    const ra = find(ia);
    const rb = find(ib);
    if (ra !== rb) parent[ra] = rb;
  }

  const groups = new Map();
  articles.forEach((_, index_) => {
    const root = find(index_);
    const members = groups.get(root);
    if (members) members.push(index_);
    else groups.set(root, [index_]);
  });

  const events = [...groups.values()].map((members) => {
    members.sort((x, y) => articles[x].at - articles[y].at);

    return {
      /** Stable across runs with the same membership: the oldest member's URL
       *  path is unique in the corpus and does not move when the group grows
       *  at the newer end, which is the end that grows. */
      id: eventId(articles[members[0]].url, members.length),
      members,
      articles: members.map((i) => articles[i]),
      affinities: members.map((i) => affinities[i]),
      firstAt: articles[members[0]].publishedAt,
      lastAt: articles[members[members.length - 1]].publishedAt,
    };
  });

  events.sort((x, y) => Date.parse(x.firstAt) - Date.parse(y.firstAt));

  return { events, scoredPairs: pairs.size, acceptedPairs: accepted };
}

/**
 * A short, stable id for a group.
 *
 * Derived from the oldest member's URL rather than from a counter, so two runs
 * over the same corpus produce the same ids and a diff between runs is
 * readable. The size is in it because a group that grew is a different group,
 * and silently reusing the id would make the change invisible.
 */
function eventId(url, size) {
  let hash = 2166136261;

  for (let i = 0; i < url.length; i += 1) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `e${(hash >>> 0).toString(36)}${size.toString(36)}`;
}
