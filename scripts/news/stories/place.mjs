/**
 * Pass 2 — where the event happened, as opposed to who filed it.
 *
 * ---------------------------------------------------------------------------
 * `articles.district_id` IS THE DESK, NOT THE EVENT.
 *
 * This is the load-bearing fact of the whole pin mode. Verified on the live
 * corpus: the Amravati-to-Yavatmal tribal students' Long March was filed by
 * Loksatta under `nagpur` three separate times. Nothing happened in Nagpur;
 * that is where Loksatta's Vidarbha desk sits. The same story also carries
 * `amravati`, `mumbai-city` for the High Court angle, and a statewide row with
 * no district at all. Pinning by `district_id` turns one story into four pins,
 * three of them false.
 *
 * So the district column is used here as *context for disambiguation* and as a
 * fallback, and never as the answer when the text supports a better one.
 * ---------------------------------------------------------------------------
 *
 * The three tiers, and why the tier is carried all the way to the mark:
 *
 *   taluka    a gazetteer place name found in the article's own text
 *   district  only the desk district is known
 *   state     the piece is about Maharashtra rather than a place in it
 *
 * `src/components/map/choropleth-layer.tsx` argues that "a pin at a centroid
 * is a lie told with great precision" — it puts a dot on a field outside
 * Ambajogai and invites the reader to believe something happened there. That
 * argument is right and is not overturned here. The answer is not to refuse
 * pins but to refuse to draw a *sharp* one on a district-level guess: a taluka
 * match gets a sharp pin at the taluka, a district-only guess gets a soft
 * haloed marker at the district centroid that reads as an area rather than a
 * point, and a statewide piece gets no pin at all.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { skeleton, skeletonsFor } from "./translit.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const TALUKA_FILE = path.join(
  ROOT,
  "public",
  "data",
  "boundaries",
  "maharashtra-talukas.geojson",
);

/**
 * A skeleton shorter than this is not distinctive enough to claim a place on
 * its own. The fold that makes `Babulgaon` and `बाभूळगाव` agree also shortens
 * `Vasai` and `Washi` into the same four letters, and Maharashtra has talukas
 * whose skeleton is two characters. Short names are still matched, but only
 * when the surface word is rare in the corpus — see `RARE_DF_MAX`.
 */
const SHORT_SKELETON = 5;

/**
 * A place name that appears in this many articles is being used as a common
 * word, not as a place. `पेठ` is a taluka in Nashik and also the Marathi for a
 * market ward; `माण` is a taluka in Satara and also "measure". Corpus document
 * frequency separates the two without a stop-list anyone has to maintain.
 */
const RARE_DF_MAX = 45;

/**
 * How much of the body is read for a place name.
 *
 * A dateline and the first few paragraphs are where a Marathi report says
 * where it is. Three hundred words down, a piece about a Beed protest is
 * quoting a minister in Mumbai and listing every district that sent marchers —
 * all real place names, none of them where the event happened. Reading the
 * whole body finds more names and gets them wrong more often.
 */
const BODY_LEAD_CHARS = 700;

/**
 * The dateline: `यवतमाळ : ` at the head of the body.
 *
 * Both mastheads use it and it is the reporter's own statement of where the
 * piece was filed from, which is a far better claim than the section of the
 * website it was published under. Treated as the strongest evidence available
 * short of nothing.
 */
const DATELINE = /^\s*([ऀ-ॿA-Za-z][ऀ-ॿA-Za-z .]{1,28}?)\s*[:：]\s/;

/** Area-weighted centroid of a ring, in lon/lat. */
function ringCentroid(ring) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const cross = x0 * y1 - x1 * y0;

    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  // A degenerate ring (three collinear points, or a repeated vertex) has zero
  // area and the formula divides by it. Falling back to the mean of the
  // vertices is wrong by a few hundred metres and right by not being NaN.
  if (twiceArea === 0) {
    const mean = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return [mean[0] / ring.length, mean[1] / ring.length];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

/** The centroid of a feature's largest ring — for a taluka with an island or
 *  an exclave, the mainland is the part worth pointing at. */
function featureCentroid(geometry) {
  const polygons =
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];

  let best = null;
  let bestArea = -1;

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;

    let twiceArea = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      twiceArea += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }

    const area = Math.abs(twiceArea);
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }

  return best ? ringCentroid(best) : null;
}

/**
 * The gazetteer: 356 talukas indexed by skeleton, plus the 36 district names.
 *
 * A skeleton can hold more than one taluka, and seven of them genuinely do —
 * `Kalamb` exists in both Yavatmal and Dharashiv, `Karjat` in both Ahilyanagar
 * and Raigad. Those are kept as a list and resolved against the filing desk at
 * match time rather than being decided here, because the right answer depends
 * on the article.
 *
 * One entry in that list is not a real homonym but an artefact of the fold:
 * Vasai in Palghar and Washi in Dharashiv both reduce to `vsi`. It is left in
 * rather than special-cased, because the disambiguation it needs is the same
 * disambiguation the real homonyms need, and a rule that fires on one name is
 * a rule nobody will remember is there.
 */
export async function loadGazetteer() {
  const raw = JSON.parse(await readFile(TALUKA_FILE, "utf8"));
  const bySkeleton = new Map();
  const byName = new Map();
  const talukas = new Map();

  for (const feature of raw.features) {
    const { talukaId, name, districtId } = feature.properties;
    if (!talukaId || !name) continue;

    const centroid = featureCentroid(feature.geometry);
    const entry = {
      talukaId,
      name,
      districtId,
      lon: centroid?.[0] ?? null,
      lat: centroid?.[1] ?? null,
    };

    talukas.set(talukaId, entry);

    for (const form of skeletonsFor(name)) {
      const list = bySkeleton.get(form);
      if (list) list.push(entry);
      else bySkeleton.set(form, [entry]);
    }

    const plain = name.toLowerCase();
    const named = byName.get(plain);
    if (named) named.push(entry);
    else byName.set(plain, [entry]);
  }

  return { bySkeleton, byName, talukas };
}

/**
 * Every distinct word in the parts of an article that say where it is.
 *
 * Returned with the field it came from, because the fields are not equal
 * evidence: a place in the dateline is where the reporter was, a place in the
 * headline is what the story is about, and a place in the keyword list was
 * applied by hand. A place three hundred words into the body is usually
 * somebody quoted from somewhere else.
 */
function placeCandidates(article) {
  const found = [];
  const push = (text, field) => {
    if (!text) return;

    for (const [word] of String(text)
      .normalize("NFC")
      .matchAll(/[ऀ-ॿ]{2,}|[A-Z][a-z]{2,}/g)) {
      found.push({ word, field });
    }
  };

  const dateline = DATELINE.exec(article.body ?? "");
  if (dateline) push(dateline[1], "dateline");

  push(article.headline, "headline");
  for (const phrase of article.keywordPhrases ?? []) push(phrase, "keywords");
  push(article.description, "description");
  push(String(article.body ?? "").slice(0, BODY_LEAD_CHARS), "body");

  return found;
}

/** What each field's evidence is worth. A dateline is the reporter saying it
 *  outright; a name deep in the body is usually somebody else's location. */
const FIELD_RANK = {
  dateline: 5,
  headline: 4,
  keywords: 3,
  description: 2,
  body: 1,
};

/**
 * Marathi does not leave a place name alone in a sentence.
 *
 * `खालापूर` appears in a headline as `खालापूरच्या`, `मुंबई` as `मुंबईत`,
 * `यवतमाळ` as `यवतमाळमधील`. The case ending is agglutinated onto the noun with
 * no space, so a tokeniser hands over one word and an exact lookup misses
 * every inflected mention — which is most of them. Measured, this was the
 * single largest source of *wrong* answers rather than of missing ones: with
 * the true name invisible, the resolver fell through to whatever else in the
 * sentence happened to collide with a taluka.
 *
 * So a gazetteer skeleton is also accepted as a *prefix* of the word's
 * skeleton, with the leftover capped at the length of a case ending. The cap
 * is what keeps this from matching `Ner` inside `Nerul`: four characters of
 * skeleton is a suffix, not another name.
 */
const MAX_SUFFIX = 5;

/** Below this a prefix match is not evidence, it is a coincidence. Exact
 *  matches are still allowed down to `MIN_SKELETON`. */
const MIN_PREFIX = 4;
const MIN_SKELETON = 3;

/**
 * The endings a Marathi place name is allowed to be wearing.
 *
 * A prefix match with *any* short leftover is far too loose — measured, it
 * turned `पूर्णपणे` ("completely") into Purna and `वृद्धीयंदा` into Warud, by
 * chopping three letters off a word that was never a place. Requiring the
 * leftover to be an actual case ending closes that: the postpositions are a
 * closed class, there are about twenty of them, and every genuine inflected
 * mention in the corpus lands in the set — `खालापूरच्या` leaves `cy`,
 * `मुंबईतील` leaves `til`, `अमरावतीहून` leaves `hun`, `नाशिकमध्ये` leaves
 * `ndye`. `पूर्णपणे` leaves `pne`, which is not an ending, so Purna is not
 * claimed.
 *
 * Written in Devanagari and folded through the same skeleton as everything
 * else, so the list reads as Marathi rather than as a column of consonants,
 * and so a change to the fold cannot silently desynchronise the two.
 */
const SUFFIXES = new Set(
  [
    "", "चा", "ची", "चे", "च्या", "चं", "ला", "ले", "ल्या", "ने", "नी", "ना",
    "त", "ात", "तील", "ातील", "तून", "ातून", "मध्ये", "मधील", "मधून",
    "हून", "कडे", "कडून", "पासून", "पर्यंत", "वर", "वरील", "शी", "स",
    "करांनी", "कर", "कारांनी", "ही", "हा",
  ].map((suffix) => skeleton(suffix)),
);

/**
 * Words that are not places, measured against this corpus.
 *
 * Every entry is a real collision the fold produces between an ordinary
 * Marathi word and a taluka name: `बंदर` (harbour) lands on Bhandara, `झोळी`
 * (a cloth sling) on Jaoli, `वृद्ध` (elderly) on Warud, `पूर्ण` (complete) on
 * Purna, `आर्मी` on Arni. None is fixable by a rule — they are genuinely the
 * same skeleton once romanisation's distinctions are gone — and frequency has
 * nothing to say about them either, since `झोळी` occurs once in the corpus.
 *
 * Held as *skeletons*, not as surface words, which is the difference between
 * this list working and this list looking like it works. Marathi inflects:
 * blocking `वृद्ध` while `वृद्धांना` and `वृद्धाने` walk straight past is what
 * the first version of this did.
 *
 * The cost is stated rather than hidden: these eleven talukas cannot be
 * matched by name any more, so an article genuinely about Warud or Mul now
 * falls back to its desk district and is drawn as a district-tier marker. That
 * is the right way to be wrong. The alternative — a sharp pin on Bhandara for
 * an article about a harbour in Sindhudurg — is the failure this whole file
 * exists to avoid, and it is worth eleven names to be rid of it.
 */
const NOT_PLACES = new Set(
  [
    "बंदर",     // harbour — Bhandara
    "झोळी",     // a cloth sling — Jaoli
    "राहता",    // "living / remaining" — Rahta
    "वृद्ध",    // elderly — Warud
    "आजार",     // illness — Ajra
    "मान",      // neck, or regard — Man
    "पेठ",      // a market ward — Peth
    "वाडा",     // a hamlet, or a mansion — Wada
    "पूर्ण",    // complete — Purna
    "मूळ",      // origin, root — Mul
    "आर्मी",    // the army — Arni
    "कांदा",    // onion — Kannad
    "पालन",     // rearing, upkeep — Palam
    "सावली",    // shadow — Sawali
    "पाटणा",    // Patna, in Bihar — Patan
  ].map((word) => skeleton(word)),
);

/**
 * A taluka that shares its name with the district it sits in.
 *
 * Almost every district headquarters is also a taluka of the same name, and a
 * dateline naming it — `मुंबई :`, `अमरावती :` — is telling you which desk
 * filed the piece, not which of its talukas the event was in. Those resolve to
 * district tier, so the map draws the soft area marker rather than a sharp pin
 * it has not earned.
 *
 * The comparison is on skeletons and on every name a district goes by,
 * including the ones it used to: Loksatta still files Chhatrapati
 * Sambhajinagar under `aurangabad`, and `धाराशिव` was `उस्मानाबाद` until
 * recently. Both spellings are in circulation in the corpus right now.
 */
const DISTRICT_NAMES = {
  "mumbai-city": ["Mumbai", "मुंबई"],
  "mumbai-suburban": ["Mumbai", "मुंबई", "Mumbai Suburban"],
  "chhatrapati-sambhajinagar": ["Aurangabad", "Sambhajinagar", "छत्रपती संभाजीनगर", "औरंगाबाद"],
  dharashiv: ["Osmanabad", "Dharashiv", "धाराशिव", "उस्मानाबाद"],
  ahilyanagar: ["Ahmadnagar", "Ahmednagar", "Nagar", "अहिल्यानगर", "अहमदनगर", "नगर"],
};

/** Every skeleton a district answers to, keyed by district id. */
function districtSkeletons(districtId) {
  const names = DISTRICT_NAMES[districtId] ?? [String(districtId).replace(/-/g, " ")];

  return new Set(names.map((name) => skeleton(name)).filter(Boolean));
}

/**
 * Document frequency of every surface word across the corpus, used to tell a
 * place name from a common word that happens to be spelled like one.
 */
export function surfaceFrequencies(articles) {
  const df = new Map();

  for (const article of articles) {
    const seen = new Set(placeCandidates(article).map((c) => c.word.toLowerCase()));
    for (const word of seen) df.set(word, (df.get(word) ?? 0) + 1);
  }

  return df;
}

/**
 * Resolve one article to a place and a tier.
 *
 * The desk district does two jobs and neither of them is "be the answer":
 * it breaks a homonym (a `Kalamb` in a piece filed from the Yavatmal desk is
 * the Yavatmal one), and it is what the tier falls back to when no name is
 * found. A taluka that sits in the filing district is also preferred over one
 * that does not, which is the same reasoning applied more weakly — but a
 * taluka in another district still wins over no taluka at all, because that is
 * exactly the case the Long March is: filed from Nagpur, happening in Yavatmal.
 */
export function resolvePlace(article, gazetteer, surfaceDf) {
  if (article.scope === "state") {
    return { tier: "state", talukaId: null, districtId: null, lon: null, lat: null, evidence: null };
  }

  /**
   * Every mention, gathered before anything is decided.
   *
   * The first version took the single highest-ranked hit and stopped, which
   * threw away the one signal that separates a real location from a fold
   * collision: how many times the article says it. A report about Rajura says
   * `राजुरा` three times. A report about onion prices says `कांदा` once, and
   * `कांदा` happens to fold onto Kannad.
   */
  const mentions = new Map();

  for (const { word, field } of placeCandidates(article)) {
    const form = skeleton(word);
    if (form.length < MIN_SKELETON) continue;

    // Latin text is compared to a Latin gazetteer, so the fold has no work to
    // do and does only harm: it is there to bridge two scripts, and applying
    // it within one script turned `Farmers` into Parner and `Near` into Ner.
    const latin = !/[ऀ-ॿ]/.test(word);
    const hit = latin ? exact(word, gazetteer) : lookup(form, gazetteer);
    if (!hit) continue;

    // Checked on the matched stem rather than on the whole word, so one entry
    // covers every case ending the word can wear.
    if (NOT_PLACES.has(form.slice(0, hit.length))) continue;

    // A short skeleton is only distinctive if the word itself is rare. `पेठ`
    // is a taluka in Nashik and the Marathi for a market ward, and it is the
    // second of those in almost every article that contains it.
    if (hit.length < SHORT_SKELETON && (surfaceDf.get(word.toLowerCase()) ?? 0) > RARE_DF_MAX) {
      continue;
    }

    // Homonyms resolve to the filing desk when it is one of the candidates.
    // When it is not, and there is more than one candidate, the name genuinely
    // does not say which place it means — so it is dropped rather than guessed
    // at, and the article falls back to district tier.
    let match = hit.matches[0];
    if (hit.matches.length > 1) {
      const local = hit.matches.find((m) => m.districtId === article.districtId);
      if (!local) continue;
      match = local;
    }

    /**
     * Specificity first, then who said it, then how much of the word was
     * matched.
     *
     * Specificity is the ordering that matters and it is not obvious. A taluka
     * that shares its name with its district — `अमरावती`, `यवतमाळ`, `मुंबई` —
     * is almost always the dateline naming the district headquarters, which is
     * district-level knowledge wearing a taluka's name. A taluka that does not
     * — `बाभूळगाव`, `खालापूर` — is a genuine locality claim.
     *
     * Ranking the field first gets this backwards, and measurably did: the
     * Aug 29 Loksatta piece on the Long March carries the dateline `यवतमाळ`
     * and the keyword `बाभूळगाव आंदोलन`, and Babulgaon is where the march was
     * actually suspended. The dateline is where the reporter filed from.
     */
    const specific = !districtSkeletons(match.districtId).has(skeleton(match.name));
    const rank =
      (specific ? 100 : 0) +
      FIELD_RANK[field] * 4 +
      (match.districtId === article.districtId ? 2 : 0) +
      Math.min(hit.length, 12) / 12;

    const seen = mentions.get(match.talukaId);
    if (seen) {
      seen.mentions += 1;
      seen.strongest = Math.max(seen.strongest, FIELD_RANK[field]);
      if (rank > seen.rank) Object.assign(seen, { rank, word, field });
    } else {
      mentions.set(match.talukaId, {
        rank,
        match,
        word,
        field,
        specific,
        mentions: 1,
        strongest: FIELD_RANK[field],
      });
    }
  }

  /**
   * A name found only in the body or the standfirst has to be said twice.
   *
   * This is the corroboration rule, and it is what the accuracy of the sharp
   * pins rests on. A dateline, a headline or a hand-applied keyword is the
   * publisher asserting where the story is, and one mention is enough. A word
   * in the middle of a paragraph is not an assertion about anything — it is
   * just a word, and roughly one in three hundred Marathi words folds onto
   * some taluka in a state that has 356 of them. Requiring a second mention
   * costs a handful of true positives and removes most of the false ones,
   * which is the right trade for a mark whose entire claim is precision.
   */
  const best = [...mentions.values()]
    .filter((m) => m.strongest >= FIELD_RANK.keywords || m.mentions >= 2)
    .sort((a, b) => b.rank - a.rank)[0] ?? null;

  if (best) {
    return {
      /**
       * A district-namesake match is reported as district tier, not taluka.
       *
       * `मुंबई :` at the head of a story tells you the piece was filed in
       * Mumbai. Drawing a sharp pin on Mumbai taluka's centroid from that would
       * be the exact error `choropleth-layer.tsx` names — precision the
       * evidence does not carry. The name is still kept, because it is worth
       * showing a reader *why* the map put the marker where it did.
       */
      tier: best.specific ? "taluka" : "district",
      talukaId: best.specific ? best.match.talukaId : null,
      talukaName: best.specific ? best.match.name : null,
      talukaNameMr: best.specific ? best.word : null,
      // The taluka's own district, not the desk's. These differ exactly when
      // the pin mode is earning its keep.
      districtId: best.match.districtId,
      lon: best.specific ? best.match.lon : null,
      lat: best.specific ? best.match.lat : null,
      evidence: `${best.word} (${best.field})`,
    };
  }

  return {
    tier: article.districtId ? "district" : "state",
    talukaId: null,
    talukaName: null,
    talukaNameMr: null,
    districtId: article.districtId,
    lon: null,
    lat: null,
    evidence: null,
  };
}

/**
 * A skeleton, or the longest gazetteer name it starts with.
 *
 * The prefix walk is what handles Marathi's case endings, and it walks down
 * from the full word rather than up from `MIN_PREFIX` so the longest — and so
 * the most specific — name wins: `खालापूरच्या` finds Khalapur rather than
 * stopping at some four-letter fragment inside it.
 */
function exact(word, gazetteer) {
  const matches = gazetteer.byName.get(word.toLowerCase());

  return matches ? { matches, length: skeleton(word).length } : null;
}

function lookup(form, gazetteer) {
  const exact = gazetteer.bySkeleton.get(form);
  if (exact) return { matches: exact, length: form.length };

  const floor = Math.max(MIN_PREFIX, form.length - MAX_SUFFIX);

  for (let length = form.length - 1; length >= floor; length -= 1) {
    // The leftover has to be a case ending, not merely short. This is the one
    // check standing between "Marathi inflects its place names" and "any word
    // beginning with four familiar letters is a village".
    if (!SUFFIXES.has(form.slice(length))) continue;

    const matches = gazetteer.bySkeleton.get(form.slice(0, length));
    if (matches) return { matches, length };
  }

  return null;
}

/**
 * Where a group of articles happened: the newest article that knows.
 *
 * Newest rather than most common, because a story physically moves and the
 * pin has to track it. This corpus has the case in it — the Long March went
 * Amravati, then Babulgaon, then Mantralaya in Mumbai over two days — and a
 * pin that sits at the modal location is at the start of a story that has
 * already ended somewhere else.
 *
 * A taluka-tier article beats a district-tier one regardless of age, though:
 * "we knew where this was yesterday and today we only know the desk" is not a
 * reason to throw away yesterday's answer.
 */
export function placeOf(places) {
  const ranked = [...places]
    .filter((p) => p.tier !== "state")
    .sort((a, b) => {
      const tier = tierRank(b.tier) - tierRank(a.tier);
      return tier !== 0 ? tier : Date.parse(b.at) - Date.parse(a.at);
    });

  return ranked[0] ?? places[0] ?? null;
}

function tierRank(tier) {
  return tier === "taluka" ? 2 : tier === "district" ? 1 : 0;
}
