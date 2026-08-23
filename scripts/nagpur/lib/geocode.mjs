/**
 * Nominatim geocoding for Nagpur district places, with honest precision.
 *
 * The district site names a mouza and its tahsil but never gives coordinates,
 * so every point is inferred. A result is only accepted as village-precision
 * when it lands inside the district and agrees with the taluka the notice
 * states — otherwise the record falls back to the taluka centroid, then the
 * district centroid, and says so in `precision`. Nothing is silently pinned.
 */
import { fetchJson } from "../../lib/http.mjs";

/** [west, south, east, north] — Nagpur district, from the OSM relation. */
export const DISTRICT_BBOX = [78.24, 20.58, 79.66, 21.73];

/** Nagpur district label point, the last-resort location. */
export const DISTRICT_CENTROID = [79.0145, 21.153];

/**
 * The fourteen tahsils of Nagpur district, as the district site's own Tahsil
 * page lists them.
 *
 * The two Nagpur tahsils are the ones that matter here: the notices split the
 * city from the surrounding countryside and write the split four different ways
 * — "Nagpur (City)", "Nagpur Urban", "Nagpur (Rural)", "Nagpur Gramin" — so the
 * aliases below carry more weight for these two than for the other twelve.
 */
export const TALUKAS = [
  "Bhiwapur", "Hingna", "Kalmeshwar", "Kamptee", "Katol",
  "Kuhi", "Mouda", "Nagpur City", "Nagpur Rural", "Narkhed",
  "Parseoni", "Ramtek", "Saoner", "Umred",
];

/**
 * Taluka spellings the notices use that are not the canonical name.
 * Keyed by the normalised form, so lookup is spelling-insensitive.
 *
 * Most of these are transliteration drift the site never settled — Bhiwapur is
 * written "Bhivapur" in roughly half its own notices, and Mouda appears as
 * "Mauda", "Maouda" and "Moudha". `khas` is the revenue term for the principal
 * village of a mouza and shows up as "Nagpur (Khas)", which is the city.
 */
const TALUKA_ALIASES = {
  bhivapur: "Bhiwapur",
  bhiwapur: "Bhiwapur",
  bhiwapure: "Bhiwapur",
  mauda: "Mouda",
  maouda: "Mouda",
  moudha: "Mouda",
  mouda: "Mouda",
  savner: "Saoner",
  saoner: "Saoner",
  sawner: "Saoner",
  parsheoni: "Parseoni",
  parshivni: "Parseoni",
  parseoni: "Parseoni",
  kamthi: "Kamptee",
  kampti: "Kamptee",
  kamptee: "Kamptee",
  narkher: "Narkhed",
  kalmeshwer: "Kalmeshwar",
  nagpur: "Nagpur City",
  nagpurcity: "Nagpur City",
  nagpururban: "Nagpur City",
  nagpurkhas: "Nagpur City",
  khas: "Nagpur City",
  nagpurrural: "Nagpur Rural",
  nagpurgramin: "Nagpur Rural",
  nagpurgrameen: "Nagpur Rural",
  gramin: "Nagpur Rural",
};

/**
 * The same fourteen tahsils in Devanagari.
 *
 * The archive has begun mixing scripts inside a single English title — `Case No
 * 59/अ-65/2025-26`, `Taluka कुही Dist. Nagpur` — and a Devanagari capture
 * normalises to the empty string under `normalizePlace`, so it needs its own
 * table rather than an entry in the alias map. Nominatim is still queried in
 * Roman: it does not resolve Devanagari place names.
 */
const DEVANAGARI_TALUKAS = {
  "भिवापूर": "Bhiwapur",
  "हिंगणा": "Hingna",
  "कळमेश्वर": "Kalmeshwar",
  "कामठी": "Kamptee",
  "काटोल": "Katol",
  "कुही": "Kuhi",
  "मौदा": "Mouda",
  "नागपूर": "Nagpur City",
  "नागपूर शहर": "Nagpur City",
  "नागपूर ग्रामीण": "Nagpur Rural",
  "नरखेड": "Narkhed",
  "पारशिवनी": "Parseoni",
  "रामटेक": "Ramtek",
  "सावनेर": "Saoner",
  "उमरेड": "Umred",
};

/**
 * The Marathi name each tahsil is displayed under, and every Devanagari
 * spelling that means it.
 *
 * `DEVANAGARI_TALUKAS` above answers "which English tahsil is this?" and stops
 * there, which is enough for geocoding. The Marathi card needs the answer in
 * the other direction — a *display* name — and the archive writes each tahsil
 * several ways: `नागपुर (ग्रामीण)`, `नागपूर ग्रामीण` and `नागपूर (ग्रा)` are one
 * place, and a card that shows all three reads as three. The keys are
 * normalised by `normalizeDevanagari`, so bracketing, spacing and the
 * `नागपुर`/`नागपूर` vowel-length split all collapse to one lookup.
 */
const MARATHI_TALUKAS = {
  Bhiwapur: "भिवापूर",
  Hingna: "हिंगणा",
  Kalmeshwar: "कळमेश्वर",
  Kamptee: "कामठी",
  Katol: "काटोल",
  Kuhi: "कुही",
  Mouda: "मौदा",
  "Nagpur City": "नागपूर (शहर)",
  "Nagpur Rural": "नागपूर (ग्रामीण)",
  Narkhed: "नरखेड",
  Parseoni: "पारशिवनी",
  Ramtek: "रामटेक",
  Saoner: "सावनेर",
  Umred: "उमरेड",
};

/**
 * Devanagari spellings the notices use, normalised, mapped to the English
 * canonical name.
 *
 * The two Nagpur tahsils carry the weight here for the same reason they do in
 * the Roman alias table: the archive splits city from countryside four ways and
 * abbreviates both (`नागपूर (श)`, `नागपूर (ग्रा)`). A bare `नागपूर` is the city
 * tahsil, matching how the English side reads an unqualified "Nagpur".
 */
const DEVANAGARI_TALUKA_ALIASES = {
  "भिवापुर": "Bhiwapur",
  हिंगना: "Hingna",
  कलमेश्वर: "Kalmeshwar",
  कामठि: "Kamptee",
  कुहि: "Kuhi",
  मोदा: "Mouda",
  नागपुर: "Nagpur City",
  नागपुरश: "Nagpur City",
  नागपुरशहर: "Nagpur City",
  नागपुरखास: "Nagpur City",
  नागपुरग्रा: "Nagpur Rural",
  नागपुरग्रामिण: "Nagpur Rural",
  नागपुरग्रामिन: "Nagpur Rural",
  नरखेद: "Narkhed",
  पारशिवनि: "Parseoni",
  परशिवनि: "Parseoni",
  रामटेक: "Ramtek",
  सावनेर: "Saoner",
  सवनेर: "Saoner",
  उमरेद: "Umred",
};

/**
 * Collapses a Devanagari place name to a comparison key.
 *
 * Everything that is not a Devanagari letter or vowel sign goes — brackets,
 * spaces, dandas, the digits of a case serial — and then the three distinctions
 * the site does not keep consistently are folded away: long vowels against
 * short (`नागपूर` against `नागपुर`, `कुही` against `कुहि`), the nasal marks it
 * drops at will (`हिंगणा` against `हिंगना`), and the retroflex/dental pairs its
 * typists alternate (`ण`/`न`, `ळ`/`ल`, `ष`/`श`). Folding is safe here because
 * the table it feeds holds fourteen known names, not an open vocabulary.
 */
const VOWEL_FOLDS = { "ी": "ि", "ू": "ु", "ॄ": "ृ", "ै": "े", "ौ": "ो" };

const normalizeDevanagari = (value) =>
  String(value ?? "")
    .replace(/[^ऀ-ॿ]/g, "")
    .replace(/[ीूॄैौ]/g, (vowel) => VOWEL_FOLDS[vowel])
    .replace(/[ँंः्]/g, "")
    .replace(/ण/g, "न")
    .replace(/ळ/g, "ल")
    .replace(/ष/g, "श");

/**
 * Every Devanagari spelling that resolves to a canonical tahsil, keyed by its
 * normalised form.
 *
 * Built rather than written out, so the display names above and the alias list
 * are both reachable through the same fold — a name only has to be written once
 * in whichever table it belongs to.
 */
const DEVANAGARI_TALUKA_LOOKUP = new Map([
  ...Object.entries(MARATHI_TALUKAS).map(([canonical, marathi]) => [normalizeDevanagari(marathi), canonical]),
  ...Object.entries(DEVANAGARI_TALUKAS).map(([marathi, canonical]) => [normalizeDevanagari(marathi), canonical]),
  ...Object.entries(DEVANAGARI_TALUKA_ALIASES).map(([marathi, canonical]) => [normalizeDevanagari(marathi), canonical]),
]);

/**
 * The English canonical tahsil a Devanagari capture means, or null.
 *
 * Tried in the same order as the Roman side: the name as written, then its
 * first word, because the capture routinely runs one word past the name
 * (`कुही प्रकरण क्रमांक`) and the tahsil is always the head of it.
 */
export function canonicalMarathiTaluka(value) {
  if (!value) return null;

  const written = String(value).replace(/\s+/g, " ").trim();
  const lookup = (name) => {
    const key = normalizeDevanagari(name);
    return key ? (DEVANAGARI_TALUKA_LOOKUP.get(key) ?? null) : null;
  };

  return lookup(written) ?? lookup(written.split(" ")[0]) ?? null;
}

/** The Marathi display name for a canonical tahsil, or null. */
export const marathiTaluka = (canonical) => MARATHI_TALUKAS[canonical] ?? null;

const GEO_CACHE_TTL_HOURS = 24 * 90;

export const normalizePlace = (value) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Snaps a taluka name the site wrote to the canonical spelling, or null. */
export function canonicalTaluka(value) {
  if (!value) return null;

  const devanagari = DEVANAGARI_TALUKAS[String(value).replace(/\s+/g, " ").trim()];
  if (devanagari) return devanagari;

  const key = normalizePlace(value);
  if (!key) return null;
  return TALUKAS.find((name) => normalizePlace(name) === key) ?? TALUKA_ALIASES[key] ?? null;
}

/**
 * Every spelling that means this taluka, normalised.
 *
 * Needed because the agreement check below reads OSM's display name, and OSM
 * does not use the district site's spelling: Mouda is "Mauda Taluka" there,
 * Kamptee is "Kamthi", and neither of the two Nagpur tahsils is named at all —
 * OSM writes "Nagpur" for both. Comparing against the canonical name alone
 * rejected good matches and dropped them to a taluka centroid.
 */
function talukaSpellings(taluka) {
  const canonical = canonicalTaluka(taluka) ?? taluka;
  const spellings = new Set([normalizePlace(canonical), normalizePlace(taluka)]);

  for (const [alias, name] of Object.entries(TALUKA_ALIASES)) {
    if (name === canonical) spellings.add(alias);
  }

  // `nagpur` and `khas` are aliases for canonicalising what the notice wrote —
  // they are useless as *evidence*. Every display name in the district contains
  // "Nagpur", so accepting it as agreement would accept everything, and "khas"
  // is a revenue term OSM never uses.
  return [...spellings].filter((spelling) => spelling && spelling !== "nagpur" && spelling !== "khas");
}

/**
 * Whether OSM's display name is allowed to be silent about the taluka.
 *
 * Nagpur City is the one exemption, for the same reason Pune City is one on its
 * own site: OSM writes the *city* into places inside it rather than the tahsil,
 * so demanding agreement would reject every genuine match in the district's
 * most built-up half.
 *
 * Nagpur Rural is deliberately **not** exempt, though it was at first. OSM does
 * name that tahsil — "Borkhedi, Nagpur Rural Taluka" — so the check has
 * something real to test, and exempting it let a Wathoda that OSM places in
 * Kalmeshwar be accepted as the Wathoda a Nagpur Rural notice named. Without
 * the exemption that row falls back to the taluka centroid, which is the
 * truthful answer.
 */
const skipsTalukaCheck = (taluka) => taluka === "Nagpur City";

/**
 * Romanisation of Marathi village names is inconsistent between the district
 * site and OSM ("Wathoda" vs "Vathoda", "Chikhali" vs "Chikhli"), and the
 * notices carry revenue qualifiers OSM has never heard of. These are the
 * variants worth a second lookup.
 */
function nameVariants(name) {
  const base = name.replace(/\s+/g, " ").trim().replace(/[.,]+$/, "");
  const variants = new Set([base]);

  // `(Rithi)` marks a depopulated revenue village, `(Railway)` and
  // `(Devasthan)` distinguish same-named neighbours, `Khas` marks the principal
  // village. None of them is part of the name OSM knows.
  variants.add(base.replace(/\s*\((?:rithi|railway|rly|dev|devasthan|khas|old|new)\)\s*/gi, " ").trim());
  variants.add(base.replace(/\s*\(.*?\)\s*/g, " ").trim());

  for (const value of [...variants]) {
    // The site writes Budruk/Khurd — the "greater/lesser" pair that splits a
    // village in two — in every abbreviation there is.
    variants.add(value.replace(/\bBu\.?\b/gi, "Budruk").replace(/\bBk\.?\b/gi, "Budruk").replace(/\bKh\.?\b/gi, "Khurd"));
    // v/w and z/j are the two consonants Marathi romanisation never agrees on.
    variants.add(value.replace(/^W/i, "V"));
    variants.add(value.replace(/^V/i, "W"));
    variants.add(value.replace(/zh/gi, "z").replace(/jh/gi, "j"));
    variants.add(value.replace(/\b(Bu|Bk|Kh)\.?\b/gi, "").trim());
  }

  // Tried last, and only because some rows carry the scheme in the same breath
  // as the village — `Mauza – Tas Mokhabardi`, where Tas is the village and
  // Mokhabardi the lift-irrigation scheme it is being acquired for. A genuine
  // two-word village (Wela Harishchandra) has already matched in full by the
  // time this is reached, and the taluka-agreement check still has to pass.
  const head = base.split(/\s+/)[0];
  if (head.length >= 4) variants.add(head);

  return [...variants].filter((value) => value.length >= 3);
}

const inBbox = ([lon, lat]) =>
  lon >= DISTRICT_BBOX[0] && lon <= DISTRICT_BBOX[2] &&
  lat >= DISTRICT_BBOX[1] && lat <= DISTRICT_BBOX[3];

async function search(query, options) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "5",
      countrycodes: "in",
      addressdetails: "1",
    });

  const results = await fetchJson(url, { ttlHours: GEO_CACHE_TTL_HOURS, ...options });
  return (results ?? []).map((result) => ({
    coordinates: [Number(result.lon), Number(result.lat)],
    displayName: result.display_name,
    osmId: `${result.osm_type}/${result.osm_id}`,
  }));
}

/** The query string for a taluka centroid — OSM knows no "Nagpur City" tahsil. */
const talukaQuery = (taluka) =>
  taluka === "Nagpur City" || taluka === "Nagpur Rural"
    ? "Nagpur, Maharashtra, India"
    : `${taluka}, Nagpur, Maharashtra, India`;

/**
 * Resolve `{ village, taluka }` to a point.
 * Returns `{ coordinates, precision, matchedName, osmId, query }`.
 */
export async function geocodePlace({ village, taluka }, options = {}) {
  const canonical = canonicalTaluka(taluka) ?? taluka ?? null;
  const wantedSpellings = canonical ? talukaSpellings(canonical) : [];

  if (village) {
    for (const variant of nameVariants(village)) {
      const queries = [
        canonical ? `${variant}, ${talukaQuery(canonical)}` : null,
        `${variant}, Nagpur, Maharashtra, India`,
      ].filter(Boolean);

      for (const query of queries) {
        for (const candidate of await search(query, options)) {
          if (!inBbox(candidate.coordinates)) continue;

          // A village match is only trusted when OSM agrees on the taluka —
          // Nagpur has a Parsodi in Bhiwapur and another in Nagpur Rural, and a
          // Chikhali in three tahsils. Any known spelling of the taluka counts,
          // because the agreement is about the place and not about whose
          // romanisation is used.
          const displayName = normalizePlace(candidate.displayName);
          const agrees =
            !canonical ||
            skipsTalukaCheck(canonical) ||
            wantedSpellings.some((spelling) => displayName.includes(spelling));
          if (!agrees) continue;

          return { ...candidate, precision: "village", matchedName: variant, query };
        }
      }
    }
  }

  if (canonical) {
    for (const candidate of await search(talukaQuery(canonical), options)) {
      if (!inBbox(candidate.coordinates)) continue;
      return { ...candidate, precision: "taluka", matchedName: canonical, query: talukaQuery(canonical) };
    }
  }

  return {
    coordinates: DISTRICT_CENTROID,
    precision: "district",
    matchedName: "Nagpur district",
    displayName: "Nagpur, Maharashtra, India",
    osmId: null,
    query: null,
  };
}
