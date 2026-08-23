/**
 * Derives the parts of a Signal the Nagpur district site does not state
 * outright: where it is, which sector it belongs to, and how far along it is.
 *
 * Every derivation is keyword-driven and recorded in the record's `confidence`
 * block, so a reviewer can see what came from the source and what came from a
 * rule. Anything that falls through to a default is flagged `needsReview`.
 */
import {
  TALUKAS,
  canonicalMarathiTaluka,
  canonicalTaluka,
  marathiTaluka,
  normalizePlace,
} from "./geocode.mjs";

/**
 * The words Nagpur uses to introduce a village, and to introduce its tahsil.
 *
 * Everything built out of these uses `String.raw` — a plain template literal
 * would read `\b` as a backspace and `\s` as the letter s, and the pattern
 * would quietly stop matching instead of failing loudly.
 *
 * `mouza` is the revenue term for a village and is the site's usual word; it is
 * spelled four ways across the archive and all four are here. `th` is included
 * because roughly a third of the acquisition rows abbreviate the tahsil that
 * far — `Mouza Mokhala Th. Bhiwapur`.
 */
const VILLAGE_KEYWORD = "mouza|mauza|mouja|mauja|moje|villages?";
const TALUKA_KEYWORD = "taluka|tahsil|tehsil|tal|tah|th|tq";

/**
 * `Taluka Kuhi`, `Th. Bhiwapur`, `Tah-Nagpur Urban` — keyword, separator, name.
 *
 * Devanagari is in the character class because the archive has begun mixing
 * scripts inside a single English title — `Case No 59/अ-65/2025-26`, `Taluka
 * कुही Dist. Nagpur`. `canonicalTaluka` knows the fourteen tahsil names in both
 * scripts, so a Devanagari capture resolves the same as a Roman one.
 */
const TALUKA_PATTERN = new RegExp(
  String.raw`\b(?:${TALUKA_KEYWORD})\b\.?\s*[-–:.]?\s*([A-Za-zऀ-ॿ][A-Za-zऀ-ॿ ()'-]{2,30})`,
  "i",
);

/** Where the taluka clause starts, used to find the name sitting before it. */
const TALUKA_ANCHOR = new RegExp(
  String.raw`\b(?:${TALUKA_KEYWORD})\b\.?\s*[-–:.]?\s*[A-Za-z]`,
  "i",
);

/**
 * `Mouza – Channa Taluka Kuhi Dist. Nagpur` → the village.
 *
 * The capture is lazy and stops at the first thing that cannot be part of a
 * village name: a comma, the tahsil clause, the district, the case number, or
 * one of the prepositions the notices use to introduce the scheme the land is
 * for (`for the Gosikhurd project`, `under road widening`, `by private
 * negotiation`).
 */
const VILLAGE_PATTERN = new RegExp(
  String.raw`\b(?:${VILLAGE_KEYWORD})\b\s*[-–:.]?\s*` +
    String.raw`([A-Za-z][A-Za-z .'()&-]*?)` +
    String.raw`(?=\s*[,;]|\s*\b(?:${TALUKA_KEYWORD})\b|\s*\bDist(?:rict)?\b|\s*\bP\.?\s?[HC]\.?\s?N?\b|` +
    String.raw`\s*\bCase\b|\s*\bNew Act\b|\s*\(\s*\d|\s+(?:for|under|by|through|in|at|to)\b|$)`,
  "i",
);

/**
 * The site glues its own keywords onto the word before them often enough to
 * matter — `Mouza -WathodaTaluka Nagpur Gramin`, `Taluka UmredDist. Nagpur`.
 * Without a space there is no word boundary for the patterns above to find, and
 * the village silently absorbs the tahsil clause. One substitution up front is
 * cheaper than a lookahead for every glued form.
 */
const separateGluedKeyword = (value) =>
  value.replace(/([a-z])(Taluka|Tahsil|Tehsil|Dist(?:rict)?)\b/g, "$1 $2");

/**
 * `Mouza – Channa Taluka Kuhi Dist. Nagpur` → its two parts.
 *
 * The Nagpur archive writes the location into the title in half a dozen shapes
 * — `Mouza-Chapegadi Taluka Kuhi`, `Mauza-Shivangaon Tah-Nagpur Urban`,
 * `Village Mouza Pipaldhara Taluka – Hingna`, `Mouza Bhandewadi, P.C No- 34 Th.
 * Nagpur City` — and the separator between keyword and name may be a dash, a
 * colon, a full stop or nothing at all. One pattern covers them by making the
 * separator optional and stopping the capture on structure rather than length.
 */
export function parsePlaceFromTitle(title) {
  const clean = separateGluedKeyword(
    title
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const taluka = parseTaluka(clean);
  const village = parseVillage(clean) ?? villageBeforeTaluka(clean);

  return { village: cleanName(village), taluka: cleanName(taluka) };
}

/** The tahsil the title states, snapped to its canonical spelling. */
function parseTaluka(clean) {
  const stated = clean.match(TALUKA_PATTERN)?.[1];

  // Without a comma to stop it — `Th. Bhiwapur District Nagpur Land
  // Acquisition…` — the capture runs into the rest of the sentence, so it is
  // cut back to the name: at the district that follows, then at two words at
  // most. Two is right because both Nagpur tahsils are two words.
  const trimmed = stated
    ?.split(/Dist(?:rict)?\b/i)[0]
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");

  if (trimmed) {
    // "Nagpur (City)" and "Nagpur Urban" are two words; "Bhiwapur Dist" is one
    // word and a fragment. Both readings are tried before the capture is
    // accepted as written.
    const first = trimmed.split(" ")[0];
    const canonical = canonicalTaluka(trimmed) ?? canonicalTaluka(first);
    if (canonical) return canonical;

    // A bare "Nagpur" with no qualifier is the city tahsil on this site: the
    // rural one is always written "Rural" or "Gramin".
    return trimmed.replace(/[.,]+$/, "");
  }

  // Fall back to any tahsil named anywhere in the text.
  const haystack = normalizePlace(clean);
  return TALUKAS.find((name) => haystack.includes(normalizePlace(name))) ?? null;
}

/** The village the title names after `Mouza`, `Mauza`, `Mouja` or `Village`. */
function parseVillage(clean) {
  const captured = clean.match(VILLAGE_PATTERN)?.[1];
  if (!captured) return null;

  // `Village Mouza Pipaldhara` doubles the keyword; the first match eats the
  // outer one and leaves the inner one at the head of the capture.
  const stripped = captured.replace(
    new RegExp(String.raw`^\s*(?:${VILLAGE_KEYWORD})\b\s*[-–:.]?\s*`, "i"),
    "",
  );

  return STOP_WORDS.has(stripped.trim().toLowerCase()) ? null : stripped;
}

/**
 * `Rehabilitation and Resettelement, Mouza Sawargaon Tah. Bhiwapur` is the easy
 * shape; `Extension Granted 12 Month for Section 19(1) Notification.
 * Mauza-Khariy Dhalgaon Taluka Saoner` is not, because the keyword match can
 * fail on the punctuation between them. The village is then simply the
 * capitalised name sitting immediately before the tahsil clause.
 *
 * Only a capitalised word qualifies, which is why this is read off the text
 * rather than matched case-insensitively: `regarding Corrigendum Taluka Kuhi`
 * must not yield a village.
 */
function villageBeforeTaluka(clean) {
  const at = clean.search(TALUKA_ANCHOR);
  if (at <= 0) return null;

  const before = clean.slice(0, at).replace(/[\s,.-]+$/, "");
  const word = before.match(/([A-Z][a-zA-Z]{3,})$/)?.[1];
  return word && !STOP_WORDS.has(word.toLowerCase()) ? word : null;
}

/** Words that end a clause before a tahsil but are not a place. */
const STOP_WORDS = new Set([
  "acquisition", "act", "area", "award", "case", "corrigendum", "declaration",
  "land", "list", "mauja", "mauza", "mouja", "mouza", "notice", "notification",
  "priority", "public", "rehabilitation", "resettlement", "resettelement",
  "section", "survey", "village",
]);

/**
 * Words that can follow a village name in these titles but are never part of
 * one — the road the land is being widened for, the document the row is.
 *
 * `Mauza- Nagpur(Khas) Model Mill Chowk to Ramji Pahelwan Chowk` is the case
 * that needs them: the mouza is Nagpur (Khas) and everything after it is the
 * stretch of road, which the capture has no structural reason to stop at.
 */
const NAME_NOISE = new Set([
  "acquisition", "act", "case", "chowk", "draft", "ground", "groung", "land",
  "mill", "model", "negotiation", "notice", "notification", "play", "private",
  "public", "road", "section", "village",
]);

/**
 * Trims a captured name down to what a place name can actually be.
 *
 * Two words at most: every genuinely two-word name in this archive is either a
 * compound (`Wela Harishchandra`, `Khairi Dhalgaon`) or a name with its revenue
 * qualifier (`Junapani (Rithi)`, `Khapri (Railway)`), and nothing in it is
 * three. The scan also stops early at a noise word, so a name that runs into a
 * road description keeps only the name.
 */
function cleanName(value) {
  if (!value) return null;

  const kept = [];
  for (const token of value.replace(/\s+/g, " ").trim().split(" ")) {
    // `Mauza – Tas Mokhabardi (54)` and `Mouza Pendhri (6)` end in the case
    // serial, which is not part of the name.
    if (/^\(\s*\d+\s*\)$/.test(token)) break;
    if (NAME_NOISE.has(token.toLowerCase().replace(/[^a-zऀ-ॿ]/g, ""))) break;
    kept.push(token);
    if (kept.length === 2) break;
  }

  const cleaned = kept
    .join(" ")
    .replace(/^[\s.,–-]+|[\s.,;:–-]+$/g, "")
    .replace(/\b(?:part|pt|area|sq|ha)\b\.?$/i, "")
    .trim();

  return cleaned.length >= 3 ? cleaned : null;
}

/**
 * The scheme a notice names, when it names one.
 *
 * Unlike category and status this is *stated* — the notice says the land is for
 * the Gosikhurd project or the Wardha–Nagpur third and fourth railway lines —
 * so it is worth carrying even though the Signal schema has no field for a
 * scheme. It goes into provenance, where a reviewer writing the published
 * record can use it.
 *
 * Note what is deliberately absent: no rule turns a scheme into an *agency*.
 * Gosikhurd is executed by the Vidarbha Irrigation Development Corporation, but
 * the notice does not say so, and `implementingAgency` is only ever the body a
 * notice names or the office that issued it.
 */
const PROJECT_RULES = [
  [/\bgosi\s*khurd\b/i, "Gosikhurd irrigation project"],
  [/\bmokhabardi\b/i, "Mokhabardi lift irrigation scheme"],
  [/\bnakshi\b.{0,20}\bcanal\b/i, "Nakshi branch canal"],
  [/\bkanhan\b.{0,30}(?:barrage|project)|\bkoch+i+\b.{0,10}barrage/i, "Kanhan river project (Kochi barrage)"],
  [/\bwardha\s*[-–]?\s*nagpur\b.{0,30}\brail|\bnagpur\s*[-–]?\s*wardha\b.{0,30}\brail/i, "Wardha–Nagpur third and fourth railway line"],
  [/\b(?:etarshi|itarsi)\b.{0,30}\brail/i, "Itarsi–Nagpur third railway line"],
  [/\bthird\b.{0,20}\brailway line\b|\brailway line\b/i, "railway line"],
  [/\bmodel mill chowk\b/i, "Model Mill Chowk–Ramji Pahelwan Chowk road widening"],
  [/\bnational highway no\.?\s*(\d+)|\bNH[-\s]?(\d+)/i, (m) => `National Highway ${m[1] ?? m[2]}`],
  [/\bmihan\b/i, "MIHAN"],
  [/\bmetro\b/i, "Nagpur Metro"],
  [/road widening|widening of/i, "road widening"],
  [/\b(?:land )?development plan\b|\bD\.?\s?P\.?\s*r[oa]ad\b/i, "development-plan road"],
  [/\bupsa|upasa\b.{0,20}(?:sinchan|irrigation)|lift irrigation/i, "lift irrigation scheme"],
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
 * Nagpur's acquisition file is not Pune's. Where Pune is acquiring almost
 * entirely for roads, Nagpur's named schemes are irrigation — Gosikhurd,
 * Mokhabardi, the Kanhan barrage — and railway, with city road widening third.
 * So transportation is tested first (railway wording is unambiguous), then
 * agriculture, which owns the irrigation vocabulary, and the generic
 * construction wording is left to `infrastructure` below both.
 */
const CATEGORY_RULES = [
  ["transportation", /\b(railway|rail line|road|highway|nh[-\s]?\d|bridge|metro|bypass|transport|bus |depot|airport|flyover|culvert|ring road|widening|chowk)\b/i],
  ["agriculture", /\b(gosi\s*khurd|mokhabardi|irrigation|sinchan|canal|barrage|\bdam\b|watershed|farmer|agricultur|crop|kisan|horticultur|shetkari|kharif|rabi)\b/i],
  ["energy", /\b(electricity|power|solar|substation|grid|msedcl|mahavitaran|transformer|energy|thermal)\b/i],
  ["manufacturing", /\b(midc|mihan|industrial(?!\s+housing)|industry|factory|textile|mill(?!\s+chowk)|manufactur|cluster)\b/i],
  ["research", /\b(research|incubat|university|innovation|laboratory|skill development)\b/i],
  ["infrastructure", /\b(construction|building|works|water supply|water work|\bstp\b|sewage|drainage|sewer|solid waste|housing|awas|land acquisition|acquisition|rehabilitation|resettelement|resettlement|reservation|premises|renovation|repair|garden|public park|nazul)\b/i],
  ["public-systems", /\b(hospital|health|school|education|welfare|pension|ration|scheme|certificate|admission|recruitment|office|seva kendra|aadhaar|election|census|charter)\b/i],
];

export function deriveCategory(haystack) {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return { category, basis: "keyword" };
  }
  return { category: "public-systems", basis: "default" };
}

/**
 * Land acquisition notices carry their own status ladder, and on the Nagpur
 * site it is the RFCTLARR Act 2013 numbering throughout: section 11 opens the
 * process, 19 declares the land is required, 21 calls interested persons ahead
 * of the award, 23 is the award itself — the point at which the acquisition is
 * being executed — and 37(1) is the final award that closes it.
 *
 * The section is written as `11(1)`, `19(1)`, `U|S 19`, `Section II (1)` and
 * `Sec 19(1)` across the archive; `II` is a typo for `11` that occurs often
 * enough to be worth matching.
 */
const SECTION = String.raw`(?:section|sec|u\|s|u\/s|article)[-\s.]*(?:of[-\s]*)?`;

const STATUS_RULES = [
  ["operational", /\b(inaugurat|commission|lokarpan|now operational|opened to (the )?public)\b/i],
  ["completed", new RegExp(String.raw`\bfinal award\b|${SECTION}37\b|\b(completed|completion|handed over)\b`, "i")],
  ["in-progress", new RegExp(String.raw`${SECTION}2[123]\b|\baward\b|\bwork order\b|\bunder construction\b|\bin progress\b|\bongoing\b`, "i")],
  ["sanctioned", new RegExp(String.raw`${SECTION}19\b|\b19\s*\(\s*1\s*\)|\bdeclaration\b|\bsanction\b|\bapproved\b|\badministrative approval\b`, "i")],
  ["announced", new RegExp(String.raw`${SECTION}(?:11|II)\b|\b11\s*\(\s*1\s*\)|\bpreliminary notification\b|\bpublic notice\b|\bnotification\b|\bproposal\b|\bnotice\b|\btender\b|\bquotation\b|\badvertisement\b|\bnotice inviting\b|\bpress note\b|\bcorrigendum\b`, "i")],
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
 * Like Pune, Nagpur writes the notice itself into the Title column rather than
 * the issuing office, so there is no column to read an agency out of. It is
 * instead taken from a body named in the wording, and otherwise defaults to the
 * Collectorate — which does issue these notices, so the default is a true
 * statement rather than a guess about who builds the thing being acquired for.
 */
const AGENCY_RULES = [
  [/\b(nmc|nagpur municipal corporation)\b/i, "Nagpur Municipal Corporation"],
  [/\b(nit|nagpur improvement trust)\b/i, "Nagpur Improvement Trust"],
  [/\b(msrdc|maharashtra state road development)\b/i, "Maharashtra State Road Development Corporation"],
  [/\b(nhai|national highways? authority)\b/i, "National Highways Authority of India"],
  [/\b(vidc|vidarbha irrigation development)\b/i, "Vidarbha Irrigation Development Corporation"],
  [/\b(madc|maharashtra airport development)\b/i, "Maharashtra Airport Development Company"],
  [/\b(mahametro|maha metro|nagpur metro rail)\b/i, "Maha Metro"],
  [/\bcentral railway\b/i, "Central Railway"],
  // The council's own name sits in front of the word, so it is captured rather
  // than thrown away: "Bidgaon-Tarodi Nagar Parishad", not "Nagar Parishad".
  [/\b((?:[A-Z][a-z]+[\s-])?[A-Z][a-z]+)\s*[Nn]agar\s?[Pp]anchayat\b/, (m) => `${m[1]} Nagar Panchayat`],
  [/\bnagar\s?panchayat\b/i, "Nagar Panchayat"],
  [/\b((?:[A-Z][a-z]+[\s-])?[A-Z][a-z]+)\s*(?:[Nn]agar\s?[Pp]arishad|[Mm]unicipal [Cc]ouncil)\b/, (m) => `${m[1]} Municipal Council`],
  [/\bnagar\s?parishad\b|municipal council/i, "Municipal Council"],
  [/\bzilla parishad\b/i, "Zilla Parishad, Nagpur"],
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

/* --------------------------------------------------- Marathi display text -- */

/**
 * Everything below reads the *Marathi* text, and exists because Marathi is the
 * display language while every rule above it is written against the English
 * twin.
 *
 * The English title gets recomposed for a stated reason — the site writes a
 * case-number recital where a headline belongs. That reason applies at least as
 * strongly to the Marathi title, which is the one people actually read:
 * `भूसंपादन प्रकरण क्रमांक 5/अ-65/2025-26 मौजा – चन्ना तालुका कुही जि. नागपूर मधील
 * प्रारंभिक अधिसुचना 11(1) चे प्रकाशन` is the same recital, and cutting it to a
 * card's width leaves the case number and drops the village. So the place and
 * the scheme are parsed out of the Marathi and a headline is composed from
 * them, the way Amravati composes its own.
 */

/** `मौजा`, `मौझा` — the revenue word for a village, in the spellings used. */
const MR_VILLAGE_KEYWORD = String.raw`मौजा|मौझा|मोजा|मौजे`;

/**
 * `तालुका`, `तहसिल`, `ता.` — the tahsil keyword.
 *
 * `ता` needs the lookahead: it is two of the commonest letters in the language
 * and appears inside ordinary words (`प्रस्तावित`, `करितात`), so it only counts
 * as the keyword when a separator follows it.
 */
const MR_TALUKA_KEYWORD = String.raw`तालुका|तहसिल|तहसील|तहशील|ता(?=[\s.:ः–—-])`;

/**
 * A word boundary, hand-rolled.
 *
 * `\b` is defined on ASCII word characters, so between two Devanagari letters
 * it never matches and `ता` would be found inside `प्रस्तावित`. The preceding
 * character is tested instead.
 */
const MR_BEFORE = String.raw`(?:^|[\s,;।(\-–—])`;

/** Keyword to name: a dash, a colon, a visarga, a full stop, or nothing. */
const MR_SEP = String.raw`\s*[-–—:ः.]{0,3}\s*`;

/** The clauses that follow a place name and are not part of it. */
const MR_TAIL = String.raw`जि\s*\.|जिल्ह|मधील|मध्ये|येथील|येथे|अंतर्गत|करीता|करिता|साठी|नुसार|अन्वये|अनवये`;

const MR_VILLAGE_PATTERN = new RegExp(
  MR_BEFORE +
    String.raw`(?:${MR_VILLAGE_KEYWORD})${MR_SEP}([^,;।]+?)` +
    String.raw`(?=\s*[,;।]|\s*(?:(?:${MR_TALUKA_KEYWORD})|${MR_TAIL})|$)`,
  "u",
);

/**
 * `…प्रकरण क्रमांक १०/अ-६५/२०१८-१९ मधील रानमांगली, तालुका भिवापूर` — the rows that
 * name the village without the `मौजा` keyword put it immediately before the
 * tahsil clause, which is the Marathi counterpart of `villageBeforeTaluka`.
 */
const MR_VILLAGE_BEFORE_TALUKA = new RegExp(
  String.raw`(?:मधील|मध्ये|अंतर्गत)\s+([^,;।]{2,40}?)\s*,\s*(?:${MR_TALUKA_KEYWORD})`,
  "u",
);

const MR_TALUKA_PATTERN = new RegExp(
  MR_BEFORE +
    String.raw`(?:${MR_TALUKA_KEYWORD})${MR_SEP}([^,;।]+?)` +
    String.raw`(?=\s*[,;।]|\s*(?:${MR_TAIL})|$)`,
  "u",
);

/**
 * Words that can follow a village name in these titles but are never part of
 * one — the Marathi counterpart of `NAME_NOISE`.
 *
 * The case that needs them is the same one: `मौजा – नागपूर (खास) मॉडेल मिल चौक ते
 * रामजी पहेलवान चौक` is the mouza Nagpur (Khas) followed by the stretch of road
 * the land is being widened for, and nothing structural tells the capture to
 * stop between them.
 */
const MR_NAME_NOISE = new Set([
  "ते", "मॉडेल", "मिल", "चौक", "चौकापर्यंत", "रस्ता", "रोड", "रुंदीकरण", "खाजगी",
  "वाटाघाटी", "जाहीर", "मसुदा", "भूसंपादन", "भुसंपादन", "प्रकरण", "क्रमांक", "क्र",
  "जागा", "थेट", "खरेदी", "अधिसूचना", "अधिसुचना", "नोटिस", "कलम", "शुध्दीपत्रक",
  "प्रकल्प", "योजना", "योजनेअंतर्गत", "गट", "सर्व्हे",
]);

/**
 * Trims a captured Marathi name to what a place name can be — two words, the
 * same cap the English side uses and for the same reason: every genuinely
 * two-word name here is a compound (`बोरी सदाचार`) or a name with its revenue
 * qualifier (`जुनापाणी (रिठी)`), and none is three.
 *
 * A bracketed group counts as one word, so `नागपूर (खास)` survives the cap, and
 * a long one is dropped outright — `नागपूर (मॉडेल मिल चौक ते रामजी पहेलवान
 * चौकापर्यंत)` is a road, not a qualifier.
 */
function cleanMarathiName(value) {
  if (!value) return null;

  // Re-join bracketed groups that the space split would break apart.
  const tokens = [];
  for (const token of String(value).replace(/\s+/g, " ").trim().split(" ")) {
    const open = tokens.length > 0 && tokens.at(-1).includes("(") && !tokens.at(-1).includes(")");
    if (open) tokens[tokens.length - 1] += ` ${token}`;
    else tokens.push(token);
  }

  const kept = [];
  for (const token of tokens) {
    // `मौझा तास मोखाबर्डी (५४)` ends in the case serial, not the name.
    if (/^\(\s*[\d०-९]+\s*\)$/.test(token)) break;
    // A bracketed clause of more than two words is a description, not a
    // qualifier, and the name is whatever came before it.
    if (token.includes("(") && token.split(" ").length > 2) break;
    if (MR_NAME_NOISE.has(token.replace(/[^ऀ-ॿ]/g, ""))) break;
    kept.push(token);
    if (kept.length === 2) break;
  }

  const cleaned = kept
    .join(" ")
    .split(/[.।]/)[0]
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();

  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * `मौजा – चन्ना तालुका कुही जि. नागपूर` → its two parts, in Devanagari.
 *
 * The tahsil is snapped to one display spelling per tahsil: the archive writes
 * `नागपुर (ग्रामीण)`, `नागपूर ग्रामीण` and `नागपूर (ग्रा)` for one place, and
 * three spellings on three cards read as three places. A capture that snaps to
 * nothing is dropped rather than shown, because the captures that fail to snap
 * are the ones that ran past the name — `जि`, `कुही प्रकरण क्रमांक`.
 */
export function parseMarathiPlace(value) {
  if (!value) return {};

  const text = String(value).replace(/\s+/g, " ").trim();
  const village =
    cleanMarathiName(text.match(MR_VILLAGE_PATTERN)?.[1]) ??
    cleanMarathiName(text.match(MR_VILLAGE_BEFORE_TALUKA)?.[1]);
  const stated = cleanMarathiName(text.match(MR_TALUKA_PATTERN)?.[1]);

  return {
    village: village ?? undefined,
    taluka: marathiTaluka(canonicalMarathiTaluka(stated)) ?? undefined,
  };
}

/**
 * The Marathi name of the scheme a notice names, when it names one.
 *
 * A separate table from `PROJECT_RULES` rather than a translation of it: these
 * match the Marathi wording and return the Marathi name, and the two tables are
 * allowed to disagree without either being wrong — the English row and its
 * Marathi twin are separate posts, and one can name the scheme where the other
 * only recites the case number.
 */
const MR_PROJECT_RULES = [
  [/गोसी\s*खुर्द|गोसीखुर्द/, "गोसीखुर्द प्रकल्प"],
  [/मोखाबर्डी/, "मोखाबर्डी उपसा सिंचन योजना"],
  [/नक्षी\s*शाखा|नक्षीशाखा/, "नक्षी शाखा कालवा"],
  [/कन्हान\s*नदी|कोच्छी/, "कन्हान नदी प्रकल्प (कोच्छी बॅरेज)"],
  [
    /वर्धा\s*[-–]?\s*नागपूर.{0,30}रेल्वे|नागपूर\s*[-–]?\s*वर्धा.{0,30}रेल्वे/,
    "वर्धा–नागपूर तिसरी व चौथी रेल्वे लाईन",
  ],
  [/(?:ईटारसी|इटारसी).{0,30}रेल्वे/, "ईटारसी–नागपूर तिसरी रेल्वे लाईन"],
  [/रेल्वे\s*लाईन|रेल्वे\s*मार्ग/, "रेल्वे लाईन"],
  [/मॉडेल\s*मिल\s*चौक/, "मॉडेल मिल चौक ते रामजी पहेलवान चौक रस्ता रुंदीकरण"],
  [/राष्ट्रीय\s*महामार्ग\s*(?:क्र\.?\s*)?([०-९\d]+)/, (match) => `राष्ट्रीय महामार्ग क्र. ${match[1]}`],
  [/मिहान/, "मिहान"],
  [/मेट्रो/, "नागपूर मेट्रो"],
  [/बाह्यवळण|बाहयवळण|आउटर\s*रिंग/, "नागपूर बाह्यवळण रस्ता"],
  [/रस्ता\s*रुंदीकरण|रुंदीकरण/, "रस्ता रुंदीकरण"],
  [/उपसा\s*सिंचन/, "उपसा सिंचन योजना"],
];

export function deriveMarathiProject(text) {
  if (!text) return null;

  for (const [pattern, value] of MR_PROJECT_RULES) {
    const match = String(text).match(pattern);
    if (match) return typeof value === "function" ? value(match) : value;
  }
  return null;
}
