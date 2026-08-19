/**
 * Nominatim geocoding for Amravati district places, with honest precision.
 *
 * The district site names villages and talukas but never gives coordinates, so
 * every point is inferred. A result is only accepted as village-precision when
 * it lands inside the district and agrees with the taluka the notice states —
 * otherwise the record falls back to the taluka centroid, then the district
 * centroid, and says so in `precision`. Nothing is silently pinned.
 */
import { fetchJson } from "../../lib/http.mjs";

/** [west, south, east, north] — Amravati district, from the OSM relation. */
export const DISTRICT_BBOX = [76.62, 20.53, 78.45, 21.78];

/** Amravati district centroid, the last-resort location. */
export const DISTRICT_CENTROID = [77.6443, 21.1545];

/** The 14 talukas of Amravati district. */
export const TALUKAS = [
  "Achalpur", "Amravati", "Anjangaon Surji", "Bhatkuli", "Chandur Bazar",
  "Chandur Railway", "Chikhaldara", "Daryapur", "Dhamangaon Railway", "Dharni",
  "Morshi", "Nandgaon Khandeshwar", "Teosa", "Warud",
];

const GEO_CACHE_TTL_HOURS = 24 * 90;

export const normalizePlace = (value) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Romanisation of Marathi village names is inconsistent between the district
 * site and OSM ("Nagzhari" vs "Nagzari"), and the site abbreviates the standard
 * Budruk/Khurd suffixes. These are the variants worth a second lookup.
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
  }

  return [...variants].filter(Boolean);
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

  if (village) {
    for (const variant of nameVariants(village)) {
      const queries = [
        taluka ? `${variant}, ${taluka}, Amravati, Maharashtra, India` : null,
        `${variant}, Amravati, Maharashtra, India`,
      ].filter(Boolean);

      for (const query of queries) {
        for (const candidate of await search(query, options)) {
          if (!inBbox(candidate.coordinates)) continue;

          // A village match is only trusted when OSM agrees on the taluka —
          // Amravati has several same-named villages in different talukas.
          const agrees =
            !wantedTaluka || normalizePlace(candidate.displayName).includes(wantedTaluka);
          if (!agrees) continue;

          return { ...candidate, precision: "village", matchedName: variant, query };
        }
      }
    }
  }

  if (taluka) {
    for (const candidate of await search(`${taluka}, Amravati, Maharashtra, India`, options)) {
      if (!inBbox(candidate.coordinates)) continue;
      return {
        ...candidate,
        precision: "taluka",
        matchedName: taluka,
        query: `${taluka}, Amravati, Maharashtra, India`,
      };
    }
  }

  return {
    coordinates: DISTRICT_CENTROID,
    precision: "district",
    matchedName: "Amravati district",
    displayName: "Amravati, Maharashtra, India",
    osmId: null,
    query: null,
  };
}
