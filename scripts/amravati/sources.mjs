/**
 * What the Amravati scraper reads, and why.
 *
 * The district site is S3WaaS (WordPress). Its REST API is closed (401) and it
 * publishes no sitemap or feed, so everything here comes from the server
 * rendered listing tables, which are stable and machine-generated.
 *
 * `/en/` and `/` are two separate post sets, not translations of one post —
 * they are paired through each detail page's `<link rel="alternate" hreflang>`.
 */

export const SITE = "https://amravati.gov.in";
export const DISTRICT = "Amravati";

/** Fallback agency when a notice does not name its issuing office. */
export const DEFAULT_AGENCY = "Office of the District Collector, Amravati";

/**
 * Notice categories, each a paginated table of
 * Title | Description | Start date | End date | PDF.
 */
export const NOTICE_SOURCES = [
  {
    id: "land-acquisition",
    path: "/en/notice_category/land-acquisition/",
    label: "Land acquisition notices",
    /** These name a village and taluka outright — the best located records. */
    placeInTitle: true,
    agency: "Land Acquisition Branch, Office of the District Collector, Amravati",
    maxPages: 12,
  },
  {
    id: "announcements",
    path: "/en/notice_category/announcements/",
    label: "Announcements",
    placeInTitle: false,
    maxPages: 12,
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
  { id: "post", path: "/en/public-utility-category/post/", label: "Post offices" },
];

export const ATTRIBUTION = {
  content: {
    label: "Amravati District Administration (amravati.gov.in)",
    url: "https://amravati.gov.in/en/",
    note: "Public notices reproduced from the official district portal (NIC S3WaaS).",
  },
  geocoding: {
    label: "\u00a9 OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    note: "Coordinates are inferred from place names via Nominatim, not published by the district.",
  },
};
