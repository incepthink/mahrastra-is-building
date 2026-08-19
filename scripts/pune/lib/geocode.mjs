/**
 * Nominatim geocoding for Pune district places, with honest precision.
 *
 * The district site names villages and talukas but never gives coordinates, so
 * every point is inferred. A result is only accepted as village-precision when
 * it lands inside the district and agrees with the taluka the notice states —
 * otherwise the record falls back to the taluka centroid, then the district
 * centroid, and says so in `precision`. Nothing is silently pinned.
 */
import { fetchJson } from "../../lib/http.mjs";

/** [west, south, east, north] — Pune district, from the OSM relation. */
export const DISTRICT_BBOX = [73.32, 17.89, 75.17, 19.4];

/** Pune district centroid (OSM relation label point), the last-resort location. */
export const DISTRICT_CENTROID = [73.9224, 18.6449];

/**
 * The talukas of Pune district, as the district site's own Tahsils page lists
 * them. Pimpri-Chinchwad and Loni Kalbhor are the two recent additions and are
 * kept in the site's spelling so a notice matches on the string it uses.
 */
export const TALUKAS = [
  "Ambegaon", "Baramati", "Bhor", "Daund", "Haveli",
  "Indapur", "Junnar", "Khed", "Loni Kalbhor", "Maval",
  "Mulshi", "Pimpri-Chinchwad", "Pune City", "Purandar", "Shirur",
  "Velha",
];

/**
 * Taluka names the notices use that are not the canonical spelling.
 * Keyed by the normalised form so lookup is spelling-insensitive.
 */
const TALUKA_ALIASES = {
  // "PRR E Hareli Gavdewadi Main Award" — the awards archive misspells Haveli.
  hareli: "Haveli",
  havali: "Haveli",
  pune: "Pune City",
  punecity: "Pune City",
  punecityhaveli: "Pune City",
  velhe: "Velha",
  wellhe: "Velha",
  purandhar: "Purandar",
  purandher: "Purandar",
  mawal: "Maval",
  pimprichinchwad: "Pimpri-Chinchwad",
  lonikalbhor: "Loni Kalbhor",
  ambegao: "Ambegaon",
};

const GEO_CACHE_TTL_HOURS = 24 * 90;

export const normalizePlace = (value) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every spelling that means this taluka, normalised — the canonical name plus
 * each alias that resolves to it.
 *
 * Needed because the agreement check below reads OSM's display name, and OSM
 * does not use the district site's spelling: Maval is "Mawal Subdistrict"
 * there, Velha is "Velhe". Comparing against the canonical name alone rejected
 * good matches and dropped them to a taluka centroid, which is how Talegaon
 * Dabhade — a town OSM knows perfectly well — ended up on Maval's midpoint.
 */
function talukaSpellings(taluka) {
  const canonical = canonicalTaluka(taluka) ?? taluka;
  const spellings = new Set([normalizePlace(canonical), normalizePlace(taluka)]);

  for (const [alias, name] of Object.entries(TALUKA_ALIASES)) {
    if (name === canonical) spellings.add(alias);
  }

  return [...spellings].filter(Boolean);
}

/** Snaps a taluka name the site wrote to the canonical spelling, or null. */
export function canonicalTaluka(value) {
  if (!value) return null;
  const key = normalizePlace(value);
  if (!key) return null;
  return (
    TALUKAS.find((name) => normalizePlace(name) === key) ?? TALUKA_ALIASES[key] ?? null
  );
}

/**
 * Romanisation of Marathi village names is inconsistent between the district
 * site and OSM ("Chovisawadi" vs "Chovisewadi"), and the site abbreviates the
 * standard Budruk/Khurd suffixes. These are the variants worth a second lookup.
 */
function nameVariants(name) {
  const base = name.replace(/\s+/g, " ").trim().replace(/[.,]+$/, "");
  const variants = new Set([base]);

  const expanded = base
    .replace(/\bBu\.?\b/gi, "Budruk")
    .replace(/\bBk\.?\b/gi, "Budruk")
    .replace(/\bKh\.?\b/gi, "Khurd");
  variants.add(expanded);

  for (const value of [...variants]) {
    variants.add(value.replace(/zh/gi, "z").replace(/jh/gi, "j"));
    variants.add(value.replace(/chh/gi, "ch"));
    variants.add(value.replace(/\s*\(.*?\)\s*/g, " ").trim());
    variants.add(value.replace(/\b(Bu|Bk|Kh)\.?\b/gi, "").trim());
    // "Katraj-Kondhwa" and "Katraj & Kondhwa" are two villages in one notice;
    // the first one is the one worth pinning.
    variants.add(value.split(/\s*(?:[&+]|-|and)\s*/i)[0].trim());
  }

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

/**
 * Resolve `{ village, taluka }` to a point.
 * Returns `{ coordinates, precision, matchedName, osmId, query }`.
 */
export async function geocodePlace({ village, taluka }, options = {}) {
  const wantedTaluka = taluka ? normalizePlace(taluka) : null;
  const wantedSpellings = taluka ? talukaSpellings(taluka) : [];

  if (village) {
    for (const variant of nameVariants(village)) {
      const queries = [
        taluka ? `${variant}, ${taluka}, Pune, Maharashtra, India` : null,
        `${variant}, Pune, Maharashtra, India`,
      ].filter(Boolean);

      for (const query of queries) {
        for (const candidate of await search(query, options)) {
          if (!inBbox(candidate.coordinates)) continue;

          // A village match is only trusted when OSM agrees on the taluka —
          // Pune has several same-named villages in different talukas. Any of
          // the taluka's known spellings counts, because the agreement is about
          // the place, not about whose romanisation is used. "Pune City" is
          // exempt: OSM writes the city, not the tahsil, into the display name
          // of places inside it.
          const displayName = normalizePlace(candidate.displayName);
          const agrees =
            !wantedTaluka ||
            wantedTaluka === "punecity" ||
            wantedSpellings.some((spelling) => displayName.includes(spelling));
          if (!agrees) continue;

          return { ...candidate, precision: "village", matchedName: variant, query };
        }
      }
    }
  }

  if (taluka) {
    // "Pune City" alone resolves to the whole city; the tahsil is what is meant.
    const query = `${taluka === "Pune City" ? "Pune" : taluka}, Pune, Maharashtra, India`;
    for (const candidate of await search(query, options)) {
      if (!inBbox(candidate.coordinates)) continue;
      return { ...candidate, precision: "taluka", matchedName: taluka, query };
    }
  }

  return {
    coordinates: DISTRICT_CENTROID,
    precision: "district",
    matchedName: "Pune district",
    displayName: "Pune, Maharashtra, India",
    osmId: null,
    query: null,
  };
}
