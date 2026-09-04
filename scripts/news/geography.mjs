/**
 * Which URLs are about Maharashtra, decided from the URL alone.
 *
 * Both sources put the section in the first path segment —
 * `lokmat.com/amravati/...`, `loksatta.com/nagpur/...` — so the geography
 * filter runs at discovery, before any article is fetched. That matters: the
 * Lokmat sitemap alone carries ~2,800 URLs per refresh and most of them are
 * cricket, astrology and Bollywood. Filtering here is the difference between
 * fetching 150 articles a cycle and fetching 2,800.
 *
 * The brief is geography-led: anything that happens *in* Maharashtra counts,
 * whatever the subject. A road tender and a temple festival both belong to
 * Latur; the relevance call is made downstream, on data we already hold, so it
 * can be retuned without re-scraping.
 *
 * Section slugs map onto the canonical district ids in `src/data/districts.ts`,
 * because the map, the district scrapers and this engine have to agree on what
 * "Amravati" is called or nothing can ever be joined.
 */

/** The 36 canonical district ids, mirrored from src/data/districts.ts. */
export const DISTRICT_IDS = [
  "mumbai-city", "mumbai-suburban", "thane", "palghar", "raigad", "ratnagiri", "sindhudurg",
  "nashik", "dhule", "nandurbar", "jalgaon", "ahilyanagar",
  "pune", "satara", "sangli", "solapur", "kolhapur",
  "chhatrapati-sambhajinagar", "jalna", "parbhani", "hingoli", "nanded", "beed", "latur", "dharashiv",
  "amravati", "akola", "washim", "buldhana", "yavatmal",
  "nagpur", "wardha", "bhandara", "gondia", "chandrapur", "gadchiroli",
];

/**
 * Section slugs that are not district names, and the district they belong to.
 *
 * Newsroom geography is not revenue geography. Both papers run a
 * Pimpri-Chinchwad desk and a Kalyan-Dombivli desk because that is where their
 * readers are, not because those are districts. Each one is folded into the
 * district it physically sits in so the map has somewhere to put it.
 *
 * Two of these are genuinely lossy and are marked as such rather than hidden:
 * `mumbai` covers both Mumbai City and Mumbai Suburban (no Marathi newsroom
 * distinguishes them), and Navi Mumbai straddles Thane and Raigad. Both resolve
 * to the larger half. A pin placed from one of these is a district-level claim,
 * never a locality-level one.
 */
const CITY_TO_DISTRICT = {
  mumbai: "mumbai-city",
  "navi-mumbai": "thane",
  navimumbai: "thane",
  "kalyan-dombivli": "thane",
  "vasai-virar": "palghar",
  vasaivirar: "palghar",
  "pimpri-chinchwad": "pune",
  malegaon: "nashik",
};

/**
 * Spelling drift between the two mastheads and the canonical id.
 * Lokmat writes `jalana`, `vardha`, `vashim`, `sindhudurga`, `parabhani`;
 * Loksatta still files Chhatrapati Sambhajinagar under `aurangabad`.
 */
const SECTION_ALIASES = {
  jalana: "jalna",
  vardha: "wardha",
  vashim: "washim",
  sindhudurga: "sindhudurg",
  parabhani: "parbhani",
  aurangabad: "chhatrapati-sambhajinagar",
  sambhajinagar: "chhatrapati-sambhajinagar",
  osmanabad: "dharashiv",
  ahmednagar: "ahilyanagar",
};

/**
 * Sections that are about Maharashtra as a whole rather than a place in it.
 * These become `scope='state'` records with no district — the same distinction
 * `StatewideSignal` already draws in `src/types/signal.ts`.
 */
const STATEWIDE_SECTIONS = new Set(["maharashtra"]);

/**
 * Paths that sit inside a geography section but are not reportage.
 * A photo gallery under `/pune/photos/` is a slideshow, not a story, and it
 * would pollute both the clustering and the article counts.
 */
const EXCLUDED_PATH_PARTS = new Set([
  "photos", "videos", "topics", "web-stories", "webstories",
  "page", // section pagination: /ahilyanagar/page/3/
]);

/** Resolve one path segment to a canonical district id, or null. */
function districtFromSegment(segment) {
  const section = segment.toLowerCase();
  const districtId = SECTION_ALIASES[section] ?? CITY_TO_DISTRICT[section] ?? section;
  return DISTRICT_IDS.includes(districtId) ? { section, districtId } : null;
}

/**
 * Resolve a URL to `{ section, scope, districtId }`, or `null` if it is not
 * Maharashtra geography. `null` is the normal answer for most of the sitemap.
 *
 * THE SECTION IS NOT ALWAYS THE FIRST SEGMENT. That was true of the two
 * mastheads this filter was written for and is false of most of the outlets
 * added since: Pudhari files `/maharashtra/vidarbha/chandrapur/<slug>`, Esakal
 * `/uttar-maharashtra/nashik/<slug>`, Navarashtra `/maharashtra/mumbai/<slug>`.
 * So every segment *before the article slug* is considered.
 *
 * Two rules make that safe rather than merely wider:
 *
 * The final segment is never examined. It is the headline slug, and slugs carry
 * place names constantly — `pune-dahi-handi-traffic-changes` is a Pune story
 * but the URL is not asserting that, the words are. Reading geography out of a
 * slug is guessing; reading it out of a section path is quoting the newsroom's
 * own filing. The same distinction `place.mjs` draws between a dateline and a
 * word mid-paragraph.
 *
 * The DEEPEST district wins, and a statewide container does not outrank it.
 * `/maharashtra/vidarbha/chandrapur/` is a Chandrapur story filed under the
 * state desk's tree, not a statewide one; taking the first segment would file
 * every Pudhari district story as `scope='state'` and strip its district
 * outright. `scope='state'` is reserved for a path that names no district at
 * all.
 */
export function classifyUrl(rawUrl) {
  let parts;
  try {
    parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
  if (parts.length < 2) return null; // a section index, not an article

  if (parts.some((part) => EXCLUDED_PATH_PARTS.has(part))) return null;

  // Everything except the article slug is filing structure we can quote.
  const sections = parts.slice(0, -1);

  for (let i = sections.length - 1; i >= 0; i -= 1) {
    const hit = districtFromSegment(sections[i]);
    if (hit) return { section: hit.section, scope: "district", districtId: hit.districtId };
  }

  const statewide = sections.find((part) => STATEWIDE_SECTIONS.has(part.toLowerCase()));
  if (statewide) return { section: statewide.toLowerCase(), scope: "state", districtId: null };

  return null;
}

/** Every section slug the filter accepts — used by the rank-snapshot pass to
 *  decide which section pages are worth watching. */
export function geographySections() {
  return [
    ...STATEWIDE_SECTIONS,
    ...DISTRICT_IDS,
    ...Object.keys(CITY_TO_DISTRICT),
    ...Object.keys(SECTION_ALIASES),
  ];
}
