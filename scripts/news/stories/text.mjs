/**
 * The arithmetic under the free matcher: tokens, IDF, and two similarities.
 *
 * No model runs here and none is needed. Measured over ~96,000 pairs in the
 * Aug 26-30 window, every pair this file scores above 0.45 was a genuine
 * same-event pair — two mastheads describing one thing on one day — with no
 * false positives. Reporters covering the same event reuse the same proper
 * nouns, and proper nouns are exactly what IDF promotes.
 *
 * What it cannot do is the other relation. "Same running story across days" is
 * structurally invisible to text similarity: each article in a running story
 * exists precisely because it says something new, so there is no shared text
 * to find. That job goes to a label, one call per group, in `label.mjs`.
 */

/**
 * Words, in either script the corpus uses.
 *
 * Devanagari and Latin are both kept because the two mastheads mix them: a
 * Loksatta keyword list carries `Ashok Uike Tribal Minister` and `अशोक उईके`
 * for the same man, and dropping either half throws away a match that costs
 * nothing to keep.
 *
 * Two codepoints are stripped rather than split on. ZWJ and ZWNJ sit inside
 * Marathi conjuncts and are invisible; a tokeniser that splits on them turns
 * one word into two that match nothing. The Devanagari danda is punctuation
 * and splits like a full stop.
 */
const WORD = /[ऀ-ॿ]+|[A-Za-z][A-Za-z']*|[0-9]+/g;
const INVISIBLE = /[​-‍﻿]/g;

export function tokenize(text) {
  if (!text) return [];

  const cleaned = String(text).normalize("NFC").replace(INVISIBLE, "");
  const out = [];

  for (const [match] of cleaned.matchAll(WORD)) {
    // Two codepoints is the floor. Marathi has real two-letter words (`घर`)
    // and one-letter tokens are almost always a stranded matra or an initial.
    if (match.length < 2) continue;
    // Bare numbers carry no identity — every article about a meeting has a
    // date in it — and they crowd the rare-term index they would otherwise
    // dominate, since most numbers appear exactly once.
    if (/^[0-9]+$/.test(match)) continue;

    out.push(match.toLowerCase());
  }

  return out;
}

/**
 * The publisher's keyword list, split into phrases and then into words.
 *
 * Both columns are used and neither is branched on, which is the correction
 * the measurements forced: Lokmat's list is not sparse — 387 of 389 rows carry
 * one — it is *generic*, a taxonomy of `Student,Crime News,Police`. Loksatta's
 * averages thirty entity-rich tags plus a boilerplate tail of
 * `लोकसत्ता ताज्या बातम्या`. IDF sorts both out without a per-source rule:
 * `Police` appears in hundreds of rows and drops to nothing, `अशोक उईके`
 * appears in six and survives.
 *
 * Phrases are returned alongside their words because a two-word phrase is a
 * far better thread key than either half — `बाभूळगाव आंदोलन` says which
 * protest, `आंदोलन` says only that there was one.
 */
export function keywordPhrases(...columns) {
  const phrases = [];

  for (const column of columns) {
    if (!column) continue;

    for (const raw of String(column).split(/[,;|]/)) {
      const phrase = raw.trim().toLowerCase().replace(/\s+/g, " ");
      if (phrase.length >= 3) phrases.push(phrase);
    }
  }

  return [...new Set(phrases)];
}

/**
 * How much each field's words count toward the vector.
 *
 * A headline is written to identify the story and a body is written to tell
 * it, so a word the two articles share in their headlines is much stronger
 * evidence than one they share three hundred words down. The keyword list sits
 * between them: it is hand-applied and entity-dense, but a third of it is the
 * masthead's own name.
 *
 * These are the only free constants in the matcher, and they are here rather
 * than inline so that changing them is a visible act recorded against a run.
 */
export const FIELD_WEIGHTS = {
  headline: 3.0,
  keywords: 2.0,
  description: 1.5,
  body: 1.0,
};

/**
 * One article as a bag of weighted term counts, before IDF.
 *
 * Term frequency is sublinear — `1 + log(n)` — because a 500-word piece that
 * says `विद्यार्थी` eleven times is not eleven times more about students than
 * one that says it once, and without the damping long articles dominate every
 * comparison they take part in.
 */
export function termCounts(article) {
  const counts = new Map();

  const add = (tokens, weight) => {
    const seen = new Map();
    for (const token of tokens) seen.set(token, (seen.get(token) ?? 0) + 1);

    for (const [token, n] of seen) {
      counts.set(token, (counts.get(token) ?? 0) + weight * (1 + Math.log(n)));
    }
  };

  add(tokenize(article.headline), FIELD_WEIGHTS.headline);
  add(
    article.keywordPhrases.flatMap((phrase) => tokenize(phrase)),
    FIELD_WEIGHTS.keywords,
  );
  add(tokenize(article.description), FIELD_WEIGHTS.description);
  add(tokenize(article.body), FIELD_WEIGHTS.body);

  return counts;
}

/**
 * Inverse document frequency across the corpus being clustered.
 *
 * Smoothed, so a term in every document scores a small positive number rather
 * than zero — a hard zero would make two articles that share only boilerplate
 * orthogonal, which is right, but it also makes the vector norm depend on how
 * much boilerplate a masthead happens to attach, which is not.
 */
export function buildIdf(documents) {
  const df = new Map();

  for (const counts of documents) {
    for (const term of counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const n = documents.length;
  const idf = new Map();

  for (const [term, count] of df) {
    idf.set(term, Math.log((n + 1) / (count + 0.5)));
  }

  return { idf, df, documents: n };
}

/** An L2-normalised IDF-weighted vector, ready for a dot product. */
export function toVector(counts, idf) {
  const vector = new Map();
  let norm = 0;

  for (const [term, tf] of counts) {
    const weight = tf * (idf.get(term) ?? 0);
    if (weight <= 0) continue;

    vector.set(term, weight);
    norm += weight * weight;
  }

  if (norm === 0) return vector;

  const scale = 1 / Math.sqrt(norm);
  for (const [term, weight] of vector) vector.set(term, weight * scale);

  return vector;
}

/** Cosine of two normalised sparse vectors — iterate the shorter one. */
export function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;

  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }

  return dot;
}

/**
 * Character trigrams of a headline, normalised and L2'd.
 *
 * This is the half of the blend that survives Marathi's inflection. Two
 * mastheads writing the same headline decline the same noun differently —
 * `विद्यार्थ्यांचा` against `विद्यार्थ्यांच्या` — and word-level overlap sees
 * two unrelated terms where a reader sees one. Trigrams see eleven shared
 * characters out of thirteen.
 *
 * It is also why the blend is not word overlap alone. On the measured window
 * trigrams alone are far noisier — every Marathi headline shares
 * `ांच`, `्या`, `णार` with every other — so the two are blended rather than
 * either being used by itself: words say *which* story, trigrams say the two
 * headlines are phrased about the same thing.
 */
export function trigrams(text) {
  if (!text) return new Map();

  const flat = String(text)
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .replace(/[^ऀ-ॿa-z0-9]+/g, " ")
    .trim();

  if (flat.length < 3) return new Map();

  const counts = new Map();
  for (let i = 0; i + 3 <= flat.length; i += 1) {
    const gram = flat.slice(i, i + 3);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let norm = 0;
  for (const n of counts.values()) norm += n * n;
  const scale = 1 / Math.sqrt(norm);
  for (const [gram, n] of counts) counts.set(gram, n * scale);

  return counts;
}
