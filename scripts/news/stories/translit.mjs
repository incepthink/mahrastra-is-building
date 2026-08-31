/**
 * Getting a Devanagari place name and a Latin one to agree.
 *
 * The gazetteer is `public/data/boundaries/maharashtra-talukas.geojson`, whose
 * 356 talukas are named in Latin (`Babulgaon`), and the text to find them in is
 * Marathi newspaper prose (`बाभूळगाव`). Something has to bridge the two.
 *
 * ---------------------------------------------------------------------------
 * THE DIRECTION MATTERS, AND IT IS THE OPPOSITE OF THE OBVIOUS ONE.
 *
 * The obvious move is to transliterate the gazetteer into Devanagari and look
 * for the result in the body. It does not work, because Latin-to-Devanagari is
 * not a function: `Babulgaon` could be बाबुलगाव, बाभुळगाव or बाभूळगाव, and only
 * one of those is the village. Romanisation has already destroyed the
 * distinctions Devanagari makes — aspiration, vowel length, retroflex `ळ`
 * against dental `ल` — and no rule puts them back.
 *
 * So this goes the other way. Devanagari is very nearly phonemic, so
 * Devanagari-to-Latin *is* a function, and both sides are then folded into the
 * same deliberately lossy skeleton: aspirates collapse onto their plain
 * consonant, long vowels onto short, `ळ` onto `l`, `श`/`ष` onto `s`. The
 * skeleton throws away exactly the information romanisation had already thrown
 * away, so the two sides meet on equal terms.
 *
 * The one-letter mismatch the live corpus already contains — the gazetteer
 * spells the village `Babulgaon` and Loksatta's own keyword list spells it
 * `बाभूळगाव` — is then not a fuzzy match at all. Both fold to `babulgav`, and
 * they match exactly. That is the point of folding rather than of tolerance:
 * an edit-distance budget large enough to bridge `bh`/`b` is also large enough
 * to confuse `Wai` with `Mai`, and Maharashtra has a lot of short names.
 * ---------------------------------------------------------------------------
 */

/**
 * Consonants, with their inherent `a`. Digraphs are written out because the
 * fold below removes them again — `bh` has to exist before it can collapse to
 * `b`, or `भ` and `ब` would already be indistinguishable at a stage where the
 * distinction is still doing work in the tests.
 */
const CONSONANTS = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n",
  च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v",
  श: "sh", ष: "sh", स: "s", ह: "h",
  ळ: "l", क़: "k", ख़: "kh", ग़: "g", ज़: "z", ड़: "d", ढ़: "dh", फ़: "f", य़: "y",
  ऱ: "r",
};

/** Independent vowels — the form a name starts with. */
const VOWELS = {
  अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ऋ: "ru",
  ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ऍ: "e",
};

/** Dependent vowel signs — the form a name's later syllables carry. */
const MATRAS = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ru",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};

const VIRAMA = "्";
const ANUSVARA = "ं";
const CHANDRABINDU = "ँ";
const VISARGA = "ः";
const NUKTA = "़";
const INVISIBLE = /[​-‍﻿]/g;

/**
 * Devanagari to Latin, syllable by syllable.
 *
 * The whole job is the inherent vowel: `नगर` is `nagar`, not `ngr`, because
 * every consonant carries an `a` unless a matra replaces it or a virama kills
 * it. Getting that wrong turns every name into a consonant cluster that
 * matches nothing.
 */
export function devanagariToLatin(text) {
  const source = String(text).normalize("NFC").replace(INVISIBLE, "").replace(new RegExp(NUKTA, "g"), "");
  let out = "";

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (VOWELS[ch]) {
      out += VOWELS[ch];
      continue;
    }

    const consonant = CONSONANTS[ch];
    if (consonant) {
      out += consonant;

      const next = source[i + 1];

      if (next === VIRAMA) {
        // A dead consonant: no vowel at all, and the virama is consumed.
        i += 1;
        continue;
      }
      if (MATRAS[next]) {
        out += MATRAS[next];
        i += 1;
        continue;
      }

      out += "a";
      continue;
    }

    // A nasal or a visarga attached to whatever came before it.
    if (ch === ANUSVARA || ch === CHANDRABINDU) out += "n";
    else if (ch === VISARGA) out += "h";
    else if (/\s/.test(ch)) out += " ";
  }

  return out;
}

/**
 * The systematic ways Marathi place names get romanised on a map sheet.
 *
 * These are not spelling mistakes, they are a different convention, and they
 * are regular enough to be rules rather than a table of exceptions:
 *
 * - `गाव` is written `gaon`, not `gav`. About a fifth of the gazetteer ends
 *   this way, so it is the single highest-value rule here.
 * - `पूर` is written `pur`, and a final `ी` is written `i`.
 * - Surveyors wrote `w` where the sound is `व`, so `Wai` and `वाई` have to
 *   agree, and `Washim` and `वाशिम`.
 *
 * Applied to both sides, so neither is privileged.
 */
function conventions(latin) {
  return latin
    .replace(/aon\b/g, "aav")
    .replace(/aum\b/g, "aav")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/q/g, "k");
}

/**
 * The skeleton both sides are compared in.
 *
 * Everything romanisation cannot preserve is thrown away here: aspiration,
 * vowel length, the sibilant distinctions, doubled consonants. What survives
 * is roughly the sequence of places in the mouth, which is what two people
 * spelling the same village in two scripts do actually agree on.
 *
 * The order is load-bearing. `chh` has to go before `ch`, which has to go
 * before the bare `h`-stripping rule, or `छ` comes out as `c` in one pass and
 * `ch` in another and the two never meet.
 */
export function skeleton(text) {
  let s = String(text).toLowerCase().trim();

  // Devanagari input is transliterated first; Latin input passes straight in.
  if (/[ऀ-ॿ]/.test(s)) s = devanagariToLatin(s);

  s = conventions(s)
    .replace(/[^a-z ]+/g, " ")
    // Sibilants and affricates, longest first.
    .replace(/chh/g, "c")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/jh/g, "j")
    // Aspirated stops onto their plain consonant.
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/ph/g, "p")
    .replace(/bh/g, "b")
    // `f` and `ph` are the same sound in Marathi and are spelled either way.
    .replace(/f/g, "p")
    .replace(/z/g, "j")
    // Vowel length is not recoverable from Latin, so it is not kept.
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    // An anusvara takes the place of whatever consonant follows it, so the
    // same nasal is written `m` before a labial and `n` elsewhere — `मुंबई` is
    // `Mumbai` on the map sheet and `munbai` out of the transliterator. One
    // nasal in the skeleton and the question does not arise.
    .replace(/m/g, "n");

  /**
   * Schwa deletion — the rule that makes Marathi spelling work, and the one
   * thing a naive transliterator always gets wrong.
   *
   * Every Devanagari consonant carries an inherent `a`, but Marathi does not
   * pronounce most of them: `नगर` is `nagar`, not `nagara`, and `अमरावती` is
   * `Amravati`, not `Amaravati`. Which schwas survive is a genuinely hard
   * phonological question, and the honest answer for a skeleton is not to
   * answer it: the two sides only ever disagree about `a`, so `a` is dropped
   * from both and the disagreement cannot arise.
   *
   * Word-initial `a` is kept, because there it is never a schwa — it is a real
   * vowel that both spellings agree on, and dropping it would leave `Akola`
   * and `Kolhapur` sharing a prefix they do not share.
   */
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] + word.slice(1).replace(/a/g, ""))
    // A doubled consonant is a stress mark in one script and nothing in the
    // other: `Akkalkot` and `अक्कलकोट` have to fold together.
    .map((word) => word.replace(/([a-z])\1+/g, "$1"))
    .join(" ")
    .trim();
}

/**
 * Names that no rule reaches, because the two names are genuinely different
 * words rather than two spellings of one.
 *
 * Committed rather than derived, and kept deliberately short: every entry here
 * is an admission that the fold above failed, so a growing table is a signal
 * to fix a rule instead. Renamings belong here (the state renamed the places,
 * the gazetteer has not caught up) and so do the two Marathi forms in genuine
 * circulation for one town.
 *
 * Keyed by the gazetteer's Latin name, lowercased.
 */
export const NAME_ALIASES = {
  aurangabad: ["छत्रपती संभाजीनगर", "औरंगाबाद", "संभाजीनगर"],
  osmanabad: ["धाराशिव", "उस्मानाबाद"],
  ahmadnagar: ["अहिल्यानगर", "अहमदनगर"],
  ahmednagar: ["अहिल्यानगर", "अहमदनगर"],
  ahmadpur: ["अहमदपूर"],
  mumbai: ["मुंबई"],
  "mumbai suburban": ["मुंबई उपनगर"],
  poona: ["पुणे"],
};

/**
 * Every skeleton a name should be findable under: its own, plus any committed
 * alias. Returned as a set because a name and its alias often fold together
 * anyway, and a duplicate posting would double-count the evidence.
 */
export function skeletonsFor(latinName) {
  const forms = new Set([skeleton(latinName)]);

  for (const alias of NAME_ALIASES[String(latinName).toLowerCase()] ?? []) {
    forms.add(skeleton(alias));
  }

  return [...forms].filter(Boolean);
}
