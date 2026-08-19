/**
 * Derives the parts of a Signal the Pune district site does not state outright:
 * where it is, which sector it belongs to, and how far along it is.
 *
 * Every derivation is keyword-driven and recorded in the record's `confidence`
 * block, so a reviewer can see what came from the source and what came from a
 * rule. Anything that falls through to a default is flagged `needsReview`.
 */
import { TALUKAS, canonicalTaluka, normalizePlace } from "./geocode.mjs";

/**
 * The words Pune uses to introduce a village, and to introduce its taluka.
 *
 * Everything built out of these uses `String.raw` — a plain template literal
 * would read `\b` as a backspace and `\s` as the letter s, and the pattern
 * would quietly stop matching instead of failing loudly.
 */
const VILLAGE_KEYWORD = "mouje|mauje|mouja|moje|villages?|mouza";
const TALUKA_KEYWORD = "taluka|tahsil|tehsil|tal|tq|tah";

/** `Tal. Maval` — the keyword, its optional separator, and the name after it. */
const TALUKA_PATTERN = new RegExp(
  String.raw`\b(?:${TALUKA_KEYWORD})\b\.?\s*[-–:.]?\s*([A-Za-z][A-Za-z .'-]{2,30})`,
  "i",
);

/** `Mouje Vadgaon,` — stops at a comma, a bracket, or the taluka that follows. */
const VILLAGE_PATTERN = new RegExp(
  String.raw`\b(?:${VILLAGE_KEYWORD})\b\s*[-–:.]?\s*` +
    String.raw`([A-Za-z][A-Za-z .'()&-]*?)` +
    String.raw`(?=\s*[,;]|\s*\bT(?:al|q|ah)\b|\s*\bDist\b|\s+for\b|\s+S\.?\s?No\b|\s+Gat\b|$)`,
  "i",
);

/** Where the taluka clause starts, used to find the name sitting before it. */
const TALUKA_ANCHOR = new RegExp(
  String.raw`\b(?:${TALUKA_KEYWORD})\b\.?\s*[-–:.]?\s*[A-Za-z]`,
  "i",
);

/**
 * `Mouje Vadgaon, Tal. Maval, Dist. Pune` → its two parts.
 *
 * Pune writes the location into the notice title in a handful of shapes —
 * `Mouje X, Tal. Y`, `Village-X, Tal.-Y`, `village - X, Tal-Y city` — and the
 * separator between keyword and name may be a dash, a colon, a full stop or
 * nothing at all. One pattern covers them by making the separator optional.
 */
export function parsePlaceFromTitle(title) {
  const clean = title
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  const ringRoad = parseRingRoad(clean);
  if (ringRoad) return ringRoad;

  const taluka = parseTaluka(clean);
  const village =
    parseVillage(clean) ??
    villageBeforeTaluka(clean) ??
    villageAfterSurveyNumber(clean) ??
    villageAfterPreposition(clean);

  return { village: cleanName(village), taluka: cleanName(taluka) };
}

/** The taluka the title states, snapped to its canonical spelling. */
function parseTaluka(clean) {
  const stated = clean.match(TALUKA_PATTERN)?.[1];

  // Without a comma to stop it — `Tal. Shirur Dist.-Pune Land Acquisition...` —
  // the capture runs into the rest of the sentence, so it is cut back to the
  // name: at the district that follows, then at two words at most.
  const trimmed = stated
    ?.split(/\bDist(?:rict)?\b/i)[0]
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");

  // Two words is right for "Pune City" and "Loni Kalbhor" and one word too many
  // for "Taluka Khed – July 2021", so the shorter reading is tried as well
  // before the capture is accepted as written.
  if (trimmed) {
    const first = trimmed.split(" ")[0];
    return (
      canonicalTaluka(trimmed) ?? canonicalTaluka(first) ?? trimmed.replace(/[.,]+$/, "")
    );
  }

  // Fall back to any taluka named anywhere in the text.
  const haystack = normalizePlace(clean);
  return TALUKAS.find((name) => haystack.includes(normalizePlace(name))) ?? null;
}

/** The village the title names after `Mouje`, `Mauje` or `Village`. */
function parseVillage(clean) {
  return clean.match(VILLAGE_PATTERN)?.[1] ?? null;
}

/**
 * `S.No. 94C Mundhawa Tal. Pune City` — no keyword at all, the village is
 * simply the name sitting immediately before the taluka. Only a capitalised
 * word qualifies, which is why this is read off the text rather than matched
 * case-insensitively: `for Reservation Tal. Haveli` must not yield a village.
 */
function villageBeforeTaluka(clean) {
  const at = clean.search(TALUKA_ANCHOR);
  if (at <= 0) return null;

  const before = clean.slice(0, at).replace(/[\s,.-]+$/, "");
  const word = before.match(/([A-Z][a-zA-Z]{3,})$/)?.[1];
  return word && !STOP_WORDS.has(word.toLowerCase()) ? word : null;
}

/**
 * `(Sr.No 272 Chikhli 30 Mtr. Road)` — the section 23 awards recite the Act in
 * full and put the only place name in a trailing parenthetical, after the
 * town-planning serial number.
 */
function villageAfterSurveyNumber(clean) {
  const name = clean.match(/\bS(?:r|urvey)?\.?\s?No\.?\s*\d+\s+([A-Z][a-zA-Z]{3,})\b/)?.[1];
  return name && !STOP_WORDS.has(name.toLowerCase()) ? name : null;
}

/**
 * `reserved land of Balewadi for 30 mtr wide D.P. road` — the notice names no
 * village and no taluka, only the locality the land sits in. It is read here
 * because the alternative is a district-centroid pin on a record that does say
 * where it is; the geocoder still rejects the name if it cannot place it inside
 * Pune district, so a bad guess costs precision rather than correctness.
 */
function villageAfterPreposition(clean) {
  const name = clean.match(/\bland\s+(?:of|at|near|in)\s+([A-Z][a-zA-Z]{3,})\b/)?.[1];
  return name && !STOP_WORDS.has(name.toLowerCase()) ? name : null;
}

/** Words that end a clause before a taluka but are not a place. */
const STOP_WORDS = new Set([
  "reservation", "survey", "part", "road", "land", "acquisition", "award",
  "notice", "notification", "village", "mouje", "mauje", "area", "public",
]);

/**
 * Pune Ring Road award rows are filed as `PRR E Khed Khalumbre Main Award` —
 * carriageway, taluka, village. Nothing else on the site is written this way,
 * and the taluka in the middle is what tells the pattern apart from a title
 * that merely happens to start with those letters.
 */
function parseRingRoad(title) {
  const match = title.match(/\bPRR\s+([EW])\s+([A-Za-z]+)\s+([A-Za-z][A-Za-z.]*)/i);
  if (!match) return null;

  const taluka = canonicalTaluka(match[2]);
  if (!taluka) return null;

  return { village: cleanName(match[3]), taluka, project: "Pune Ring Road" };
}

function cleanName(value) {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s.,-]+|[\s.,;:-]+$/g, "")
    .replace(/\b(?:part|pt|area|sq|ha)\b\.?$/i, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : null;
}

/**
 * The scheme a notice names, when it names one.
 *
 * Unlike category and status this is *stated* — the notice says the land is for
 * NH-548-D or the Nira Devghar project — so it is worth carrying even though
 * the Signal schema has no field for a scheme. It goes into provenance, where a
 * reviewer writing the published record can use it.
 */
const PROJECT_RULES = [
  [/\bPRR\s+[EW]\b|pune ring road|ring road/i, "Pune Ring Road"],
  [/\bNH[-\s]?(\d+[A-Z]?(?:-[A-Z])?)\b/i, (m) => `National Highway ${m[1]}`],
  [/nira\s*devghar/i, "Nira Devghar irrigation project"],
  [/bhama\s*askhed/i, "Bhama Askhed dam"],
  [/\bSTP\b|sewage treatment/i, "sewage treatment plant"],
  [/solid waste management/i, "solid waste management facility"],
  [/\b(\d+(?:\.\d+)?)\s*(?:m|mtr|meter|metre|M\.)\s*(?:wide\s*)?D\.?\s?P\.?\s*r[oa]ad/i, (m) => `${m[1]} m development-plan road`],
  [/D\.?\s?P\.?\s*r[oa]ad/i, "development-plan road"],
  [/water\s*works?/i, "water works"],
];

export function deriveProject(haystack) {
  for (const [pattern, value] of PROJECT_RULES) {
    const match = haystack.match(pattern);
    if (match) return typeof value === "function" ? value(match) : value;
  }
  return null;
}

/**
 * Category rules, ordered so the more specific sector wins.
 *
 * Pune's acquisition notices are overwhelmingly for roads — development-plan
 * roads, the Ring Road, national highways — so transportation sits first and
 * the generic construction wording is left to `infrastructure` below it.
 */
const CATEGORY_RULES = [
  ["transportation", /\b(d\.?\s?p\.?\s*r[oa]ad|ring road|\bprr\b|road|highway|\bnh[-\s]?\d|bridge|railway|metro|bypass|transport|bus |depot|airport|flyover|culvert|approach)\b/i],
  ["energy", /\b(electricity|power|solar|substation|grid|msedcl|mahavitaran|transformer|energy)\b/i],
  ["agriculture", /\b(farmer|agricultur|crop|kisan|irrigation|canal|\bdam\b|devghar|askhed|watershed|horticultur|shetkari)\b/i],
  // "Site for Industrial Housing" is a housing reservation, not a factory, so
  // `industrial` only counts when housing does not follow it.
  ["manufacturing", /\b(midc|industrial(?!\s+housing)|industry|factory|textile|mill|manufactur|cluster)\b/i],
  ["research", /\b(research|incubat|university|innovation|laboratory|skill development)\b/i],
  ["infrastructure", /\b(construction|building|works|water supply|water work|\bstp\b|sewage|drainage|sewer|solid waste|housing|awas|land acquisition|acquisition|reservation|premises|renovation|repair|garden|public park)\b/i],
  ["public-systems", /\b(hospital|health|school|education|welfare|pension|ration|scheme|certificate|admission|recruitment|office|seva kendra|aadhaar|election|census)\b/i],
];

export function deriveCategory(haystack) {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return { category, basis: "keyword" };
  }
  return { category: "public-systems", basis: "default" };
}

/**
 * Land acquisition notices carry their own status ladder, and on the Pune site
 * it is the RFCTLARR Act 2013 numbering throughout: section 11 opens the
 * process, 19 declares the land is required, 21 and 22 call interested persons
 * ahead of the award, and 23 is the award itself — the point at which the
 * acquisition is being executed. A *final* award closes it.
 */
const STATUS_RULES = [
  ["operational", /\b(inaugurat|commission|lokarpan|now operational|opened to (the )?public)\b/i],
  ["completed", /\b(final award|completed|completion|handed over)\b/i],
  ["in-progress", /\b(section[-\s]*2[123]|sec[-\s]*2[123]|article[-\s]*2[123]|u\/s\s*(?:of\s*)?2[123]\b|\baward\b|work order|under construction|in progress|ongoing)\b/i],
  ["sanctioned", /\b(section[-\s]*19|sec[-\s]*19|article[-\s]*19|u\/s\s*19|declaration|sanction|approved|administrative approval)\b/i],
  ["announced", /\b(section[-\s]*11|sec[-\s]*11|article[-\s]*11|u\/s\s*11|preliminary notification|public notice|notification|tender|quotation|advertisement|notice inviting|press note|corrigendum)\b/i],
];

export function deriveStatus(haystack) {
  for (const [status, pattern] of STATUS_RULES) {
    if (pattern.test(haystack)) return { status, basis: "keyword" };
  }
  return { status: "announced", basis: "default" };
}

/**
 * The implementing body, when the notice names one.
 *
 * Pune's notice table is unlike Amravati's: its Title column holds the notice
 * itself rather than the issuing office, so there is no column to read an
 * agency out of. It is instead taken from a body named in the wording, and
 * otherwise defaults to the Collectorate — which does issue these notices, so
 * the default is a true statement rather than a guess about who builds the
 * thing being acquired for.
 */
const AGENCY_RULES = [
  [/\b(pmrda|pune metropolitan region development authority)\b/i, "Pune Metropolitan Region Development Authority"],
  [/\b(msrdc|maharashtra state road development)\b/i, "Maharashtra State Road Development Corporation"],
  [/\bpune ring road|\bprr\s+[ew]\b/i, "Maharashtra State Road Development Corporation"],
  [/\b(nhai|national highway)\b/i, "National Highways Authority of India"],
  [/\bpimpri[-\s]?chinchwad municipal corporation|\bpcmc\b/i, "Pimpri-Chinchwad Municipal Corporation"],
  [/\bpune municipal corporation\b|\bpmc\b/i, "Pune Municipal Corporation"],
  // The council's own name sits in front of the word, so it is captured rather
  // than thrown away: "Vadgaon Nagarpanchayat", not "Nagar Panchayat".
  // Two capitalised words, because the council is "Talegaon Dabhade" as often
  // as it is "Vadgaon".
  [/\b((?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s*[Nn]agar\s?[Pp]anchayat\b/, (m) => `${m[1]} Nagar Panchayat`],
  [/\bnagar\s?panchayat\b/i, "Nagar Panchayat"],
  [/\b((?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s*(?:[Nn]agar\s?[Pp]arishad|[Mm]unicipal [Cc]ouncil)\b/, (m) => `${m[1]} Municipal Council`],
  [/\bnagar\s?parishad\b|municipal council/i, "Municipal Council"],
  [/\bzilla parishad\b/i, "Zilla Parishad, Pune"],
  [/\b(msacs|maharashtra state aids control)\b/i, "Maharashtra State AIDS Control Society"],
  [/\bmsedcl\b|mahavitaran/i, "Maharashtra State Electricity Distribution Co. Ltd."],
  [/\bwater resources department|irrigation department\b/i, "Water Resources Department, Government of Maharashtra"],
];

export function deriveAgency(haystack, fallback) {
  for (const [pattern, agency] of AGENCY_RULES) {
    const match = haystack.match(pattern);
    if (match) {
      return { agency: typeof agency === "function" ? agency(match) : agency, basis: "keyword" };
    }
  }
  return { agency: fallback, basis: "default" };
}
