/**
 * What the Pune scraper reads, and why.
 *
 * Pune runs the same S3WaaS (WordPress) build as Amravati — closed REST API,
 * no sitemap, no feed — so everything again comes from the server-rendered
 * listing tables. Two things differ, and they shape this file:
 *
 * 1. Pune has no `land-acquisition` notice category. Its acquisition record
 *    lives in two other places: the general `notice` category, where almost
 *    every current post is an RFCTLARR notification, and the *document*
 *    category `land-acquisition-awards`, which is the awards archive.
 * 2. Document listings are a different table — Title | Date | File — with no
 *    description column and no end date. They are read by their own collector.
 *
 * `/en/` and `/` are two separate post sets, not translations of one post —
 * they are paired through each detail page's `<link rel="alternate" hreflang>`.
 */

export const SITE = "https://pune.gov.in";
export const DISTRICT = "Pune";

/** Fallback agency when a notice does not name its issuing office. */
export const DEFAULT_AGENCY = "Office of the District Collector, Pune";

const LAND_ACQUISITION_AGENCY =
  "Land Acquisition Branch, Office of the District Collector, Pune";

/**
 * Notice categories, each a paginated table of
 * Title | Description | Start date | End date | PDF.
 *
 * `tenders`, `recruitment` and `order` are empty as of this writing. They are
 * kept because the site refills them, and an empty listing costs one request.
 */
export const NOTICE_SOURCES = [
  {
    id: "notice",
    path: "/en/notice_category/notice/",
    label: "Public notices",
    /**
     * Pune writes the location into the notice title itself — `Mouje Vadgaon,
     * Tal. Maval, Dist. Pune` — so the title is the place to read it from.
     */
    placeInTitle: true,
    maxPages: 8,
  },
  {
    id: "announcements",
    path: "/en/notice_category/announcements/",
    label: "Announcements",
    placeInTitle: false,
    maxPages: 6,
  },
  {
    id: "order",
    path: "/en/notice_category/order/",
    label: "Orders",
    placeInTitle: false,
    maxPages: 6,
  },
  {
    id: "tenders",
    path: "/en/notice_category/tenders/",
    label: "Tenders",
    placeInTitle: false,
    maxPages: 6,
  },
  {
    id: "recruitment",
    path: "/en/notice_category/recruitment/",
    label: "Recruitment notices",
    placeInTitle: false,
    maxPages: 3,
  },
];

/**
 * Document categories — Title | Date | PDF, no description.
 *
 * The awards archive is the highest-value source on the Pune site: an award is
 * the stage at which an acquisition is actually being executed, each row names
 * a village and taluka, and the Ring Road rows name the project outright.
 *
 * The site's other document categories are deliberately *not* read.
 * `/document-category/others/` was tried and dropped: of its 50 rows only three
 * were acquisitions, the rest being mining survey reports, grievance-redress
 * notes, investor guides and election paperwork — administration, not
 * development. `senioritylist`, `assembly-election-form-20` and
 * `waqf-properties-second-survey-report` are registers of named people and are
 * excluded outright; see `isPersonalRecord` in scrape.mjs, which drops the same
 * kind of row wherever it appears, including inside the awards archive.
 */
export const DOCUMENT_SOURCES = [
  {
    id: "land-acquisition-awards",
    path: "/en/document-category/land-acquisition-awards/",
    label: "Land acquisition awards",
    placeInTitle: true,
    agency: LAND_ACQUISITION_AGENCY,
    maxPages: 20,
  },
];

/**
 * Public utilities are a standing facilities inventory, not development
 * updates, so they are written to their own file rather than mixed into
 * signals.
 */
export const UTILITY_SOURCES = [
  { id: "hospitals", path: "/en/public-utility-category/hospitals/", label: "Hospitals" },
  { id: "schools", path: "/en/public-utility-category/schools/", label: "Schools" },
  { id: "colleges", path: "/en/public-utility-category/colleges/", label: "Colleges & universities" },
  { id: "municipality", path: "/en/public-utility-category/municipality/", label: "Municipal bodies" },
  { id: "electricity", path: "/en/public-utility-category/electricity/", label: "Electricity offices" },
  { id: "banks", path: "/en/public-utility-category/banks/", label: "Banks" },
  { id: "postal", path: "/en/public-utility-category/postal/", label: "Post offices" },
  { id: "ngos", path: "/en/public-utility-category/ngos/", label: "NGOs" },
];

export const ATTRIBUTION = {
  content: {
    label: "Pune District Administration (pune.gov.in)",
    url: "https://pune.gov.in/en/",
    note: "Public notices reproduced from the official district portal (NIC S3WaaS).",
  },
  geocoding: {
    label: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    note: "Coordinates are inferred from place names via Nominatim, not published by the district.",
  },
};
