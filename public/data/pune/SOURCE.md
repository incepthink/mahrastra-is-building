# Pune district data

Scraped from the official Pune district portal by `node scripts/scrape-pune.mjs`
(`pnpm scrape:pune`). Re-running the script regenerates every file in this
directory.

## Source

https://pune.gov.in/ — the Pune District Administration site, run by NIC on the
S3WaaS (WordPress) platform, the same build as
[Amravati](../amravati/SOURCE.md).

The site publishes no API: `/wp-json/` is closed, and there is no sitemap or RSS
feed. Everything is read from the server-rendered listing tables, which are
template-generated and stable.

`/en/` and `/` (Marathi) are **two separate sets of posts**, not translations of
a single post. Pune's Marathi category slugs are Devanagari, so
`/notice_category/notice/` simply redirects back to `/en/…` — the only reliable
pairing is each record's own detail page and its
`<link rel="alternate" hreflang="mr">`.

## How Pune differs from Amravati

The two districts run the same software and publish very differently, which is
why they have separate scrapers rather than one parameterised by district.

| | Amravati | Pune |
| --- | --- | --- |
| Land acquisition | its own notice category | split between the general `notice` category and a separate documents archive |
| Notice title column | the issuing office ("Collector Office, Camp Road") | the notice itself, with the place written into it |
| Where the place is stated | `Village- X, Taluka- Y` | `Mouje X, Tal. Y`, `Village-X, Tal.-Y`, `S.No. 94C Mundhawa Tal. Pune City`, and `PRR E Khed Khalumbre` |
| Scheme named | no | often — a D.P. road, NH-548-D, the Ring Road, Nira Devghar |
| Implementing agency | readable from the title column | derived from wording, else the Collectorate |

Shared, generic code lives in [`scripts/lib/`](../../../scripts/lib) — polite
cached HTTP, S3WaaS HTML helpers, and the review-page builder. Everything that
encodes what a *place* or a *notice* looks like in this district lives in
[`scripts/pune/`](../../../scripts/pune).

### What is read

| File | Source | Notes |
| --- | --- | --- |
| `signals.json` | `/en/notice_category/{notice,announcements,order,tenders,recruitment}/` | Paginated notice tables: title, description, start/end date, attached PDF |
| | `/en/document-category/land-acquisition-awards/` | A different table — Title \| Date \| PDF, no description at all |
| `facilities.json` | `/en/public-utility-category/{hospitals,schools,colleges,municipality,electricity,banks,postal,ngos}/` | Standing facilities inventory — **not** development updates, hence a separate file |
| `review.csv` | derived | Flat sheet of every signal for eyeballing before publication |
| `review.html` | derived | Built by `node scripts/pune/build-review-page.mjs` |

`tenders`, `recruitment` and `order` are empty as of this scrape. They are kept
in the source list because the site refills them and an empty listing costs one
request.

The **land acquisition awards** archive is the highest-value source here — 148
of the 172 records. An award is the stage at which an acquisition is actually
being executed, each row names a village and taluka, and the Ring Road rows name
the project outright.

### What is deliberately not read

`/document-category/others/` was scraped once and dropped: of its 50 rows only
three were acquisitions, the rest being mining survey reports, grievance-redress
notes, investor guides and election paperwork.

Separately, **rows that are registers of named people are skipped wherever they
appear** — `isPersonalRecord` in `scrape.mjs`. This is not a theoretical
precaution: the land-acquisition awards archive itself carries nine "SDRF Grant
Distribution Beneficiary/Farmer List" rows among the awards. The brief rules out
beneficiary-level and personally identifiable information, and no category on
this site is reliably free of it, so the filter runs per row rather than per
source.

## This snapshot

| | |
| --- | --- |
| Signals | 172 |
| Facilities | 51 |
| Marathi display text | 164 (95%) |
| Named a scheme | 150 |
| Village precision | 48 |
| Taluka precision | 120 |
| District precision | 4 |
| Flagged `needsReview` | 134 |

By category: 151 transportation, 17 infrastructure, 3 agriculture, 1
public-systems — a shape that reflects what Pune is currently acquiring land
for, which is overwhelmingly roads. By stage: 145 in-progress (an award has been
made), 29 announced, 5 sanctioned, 2 completed.

The Pune Ring Road alone accounts for 123 records, one per village per award.

## Language

**Display text is Marathi** (`title`, `summary`), taken from the district's own
Marathi posts rather than machine-translated.

English is still scraped, because it is the working language of the pipeline —
Nominatim cannot resolve Devanagari place names, and the category, status,
scheme and agency rules match English notice wording. It is kept in
`provenance.titleEn` / `provenance.summaryEn` so a record can be checked against
its source, and is used as display text when no Marathi twin is found. Those
records are flagged `needsTranslation`.

A Marathi post is only accepted as a translation when it actually contains
Devanagari. Some records — the Ring Road awards especially — are filed under the
Marathi post type but titled in English; counting those as translated would hide
how much still needs translating.

## Coordinates

**The district publishes no coordinates.** Every point is inferred from place
names via Nominatim (OpenStreetMap) and each record states how precisely it is
known in `confidence.location`:

- `village` — Nominatim matched the named village *and* agreed on its taluka.
- `taluka` — the village could not be matched, so the point is the taluka
  centroid. The record is flagged `needsReview`.
- `district` — no place at all could be read; the point is the district
  centroid.

A village match is rejected when it falls outside the district's OSM envelope,
or when OSM disagrees on the taluka — Pune has same-named villages in different
talukas. "Pune City" is the one exemption from the taluka check: OSM writes the
*city* into the display name of places inside it, not the tahsil.

Attribution: © OpenStreetMap contributors (ODbL). Nominatim is called at one
request per second, per its usage policy, and responses are cached for 90 days.

## Derived fields

`category` and `status` are **not stated by the source**. They are derived from
notice wording and every record records the basis in `confidence`:

- Category comes from keyword rules; a record that falls through to the default
  is flagged `needsReview`. Pune's acquisitions are overwhelmingly for roads, so
  `transportation` is tested before the generic construction wording.
- Status comes from the RFCTLARR Act 2013 ladder the notices cite: section 11
  opens the process (`announced`), 19 declares the land is required
  (`sanctioned`), 21–23 execute it (`in-progress`), and a final award closes it
  (`completed`).
- `implementingAgency` is the office that *issued* the notice unless the wording
  names a body. It is not a claim about who builds the thing the land is for.

`provenance.project` is different: the scheme is **stated** by the notice — "for
NH-548-D", "for the Nira Devghar project", "84 M.D.P. road" — so it is carried
verbatim in spirit even though the Signal schema has no field for a scheme.

`outcome` is deliberately never populated — the notices do not state outcomes,
and inventing them would defeat the point of the product.

## Known limits

- The district site expires notices, so this is a **current-notices snapshot,
  not a full archive**. Records disappear upstream over time; re-scraping will
  not recover them. Commit the JSON if the snapshot matters.
- Acquisition notices say *that* land is being acquired and often *what for*,
  but not what will be built or when. The detail is inside the PDF, which is
  not parsed.
- The same acquisition appears more than once — a section 19 notification, then
  a section 21 notification, then an award. These are deduplicated only by
  attachment, so one project can hold several records at different stages. That
  is accurate, but a reviewer publishing them should decide which stage to show.
- `Waki T.Wada` parses as the village "Wada": the site abbreviates *tarf* in
  revenue names. The geocoder falls back to taluka precision rather than
  guessing.
- Village romanisation differs between the district site and OSM; the geocoder
  retries a few spelling variants and falls back to taluka precision.

This is indicative proof-of-concept data. Nothing here should be presented as an
official statement of the Pune District Administration beyond the linked source
PDFs.
