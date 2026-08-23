/**
 * What the Nagpur scraper reads, and why.
 *
 * Nagpur runs the same S3WaaS (WordPress) build as Amravati and Pune — closed
 * REST API, no sitemap, no feed — so everything again comes from the
 * server-rendered listing tables. Three things differ, and they shape this file
 * and the scraper beside it:
 *
 * 1. **English lives at the bare path.** Amravati and Pune serve English from
 *    `/en/` and Marathi from `/`; Nagpur serves English from `/` and Marathi
 *    from `/mr/`. Every path below is therefore unprefixed.
 * 2. **Records have no reachable detail page.** The listing's "View" link goes
 *    straight to the PDF, and site search does not index notices or documents —
 *    a title query returns the homepage's featured notice and nothing else. So
 *    the `hreflang` walk Pune uses to find a record's Marathi twin has nothing
 *    to walk to. The pairing is done listing-to-listing instead: the *category*
 *    page carries `<link rel="alternate" hreflang="mr">`, and a record's
 *    attached PDF is the same file in both languages for 317 of 323 rows. That
 *    is one extra request per page rather than three per record.
 * 3. **The acquisition record is one archive, not a notice category.** Nagpur
 *    has no `land-acquisition` notice category and no awards archive. It has
 *    `rehabilitation_resettelement` (the site's spelling), which holds the whole
 *    RFCTLARR file — section 11 notifications, section 19 declarations, section
 *    21 notices, awards and corrigenda — 323 rows deep, back to 2018.
 */

export const SITE = "https://nagpur.gov.in";
export const DISTRICT = "Nagpur";

/** Fallback agency when a notice does not name its issuing office. */
export const DEFAULT_AGENCY = "Office of the District Collector, Nagpur";

const LAND_ACQUISITION_AGENCY =
  "Land Acquisition Branch, Office of the District Collector, Nagpur";

/**
 * Notice categories, each a paginated table of
 * Title | Description | Start date | End date | PDF.
 *
 * All five are shallow — the site keeps only current notices here and expires
 * the rest — and `recruitment`, `current-updates` and `nazul` are empty as of
 * this writing. They are kept because the site refills them and an empty
 * listing costs one request. `nazul` is the one worth watching: nazul is
 * government-owned urban land, and a notice in that category is usually a
 * lease or allotment on it.
 */
export const NOTICE_SOURCES = [
  {
    id: "announcements",
    path: "/notice_category/announcements/",
    label: "Announcements",
    maxPages: 6,
  },
  {
    id: "tenders",
    path: "/notice_category/tenders/",
    label: "Tenders",
    maxPages: 6,
  },
  {
    id: "recruitment",
    path: "/notice_category/recruitment/",
    label: "Recruitment notices",
    maxPages: 3,
  },
  {
    id: "current-updates",
    path: "/notice_category/current-updates/",
    label: "Current updates",
    maxPages: 4,
  },
  {
    id: "nazul",
    path: "/notice_category/nazul/",
    label: "Nazul land notices",
    maxPages: 4,
  },
];

/**
 * Document categories — Title | Date | PDF, no description at all.
 *
 * `rehabilitation_resettelement` is effectively the whole dataset. Every row
 * names a mouza and nearly every one names its tahsil, the section cited puts
 * the record on the RFCTLARR ladder, and a good number name the scheme the land
 * is for outright — the Gosikhurd irrigation project, the Wardha–Nagpur third
 * and fourth railway lines, the Kanhan river barrage, NH-7 widening.
 *
 * The site's other document categories are deliberately *not* read:
 *
 * - `others` was checked and dropped. Of its 50 rows, the development-related
 *   ones are two draft District Survey Reports; the rest is election paperwork,
 *   RTI disclosures, compassionate-appointment waiting lists and freedom-fighter
 *   registers — administration, and in several cases named people.
 * - `pandan_rasta` is six per-tahsil code lists of field access roads. It is an
 *   inventory of roads that already exist, not a record of anything being built.
 * - `seniority_list` and `special-executive-officer` are registers of named
 *   people and are excluded outright; see `isPersonalRecord` in scrape.mjs,
 *   which drops that kind of row wherever it appears, including inside the
 *   acquisition archive.
 * - `census` and `citizen-charter` are one row each, both static reference
 *   documents.
 */
export const DOCUMENT_SOURCES = [
  {
    id: "rehabilitation_resettelement",
    path: "/document-category/rehabilitation_resettelement/",
    label: "Land acquisition, rehabilitation & resettlement",
    agency: LAND_ACQUISITION_AGENCY,
    maxPages: 40,
  },
];

/**
 * Public utilities are a standing facilities inventory, not development
 * updates, so they are written to their own file rather than mixed into
 * signals.
 *
 * Nagpur publishes a shorter list than Pune and a different one: no schools,
 * banks, electricity offices or NGOs, but three tiers of urban local body,
 * which is what a district holding the state's second capital looks like.
 */
export const UTILITY_SOURCES = [
  { id: "hospitals", path: "/public-utility-category/hospitals/", label: "Hospitals" },
  { id: "colleges", path: "/public-utility-category/colleges/", label: "Colleges & universities" },
  { id: "municipal-corporation", path: "/public-utility-category/municipal-corporation/", label: "Municipal corporation" },
  { id: "municipal-councils", path: "/public-utility-category/municipal-councils/", label: "Municipal councils" },
  { id: "nagar-panchayat", path: "/public-utility-category/nagar-panchayat/", label: "Nagar panchayats" },
  { id: "postal_nagpur_city", path: "/public-utility-category/postal_nagpur_city/", label: "Post offices" },
];

export const ATTRIBUTION = {
  content: {
    label: "Nagpur District Administration (nagpur.gov.in)",
    url: "https://nagpur.gov.in/",
    note: "Public notices reproduced from the official district portal (NIC S3WaaS).",
  },
  geocoding: {
    label: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    note: "Coordinates are inferred from place names via Nominatim, not published by the district.",
  },
};
