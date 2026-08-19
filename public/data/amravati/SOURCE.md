# Amravati pilot-district data

Scraped from the official Amravati district portal by
`node scripts/scrape-amravati.mjs` (`pnpm scrape:amravati`). Re-running the
script regenerates every file in this directory.

## Source

https://amravati.gov.in/ — the Amravati District Administration site, run by NIC
on the S3WaaS (WordPress) platform.

The site publishes no API: `/wp-json/` returns 401, and there is no sitemap or
RSS feed. Everything is read from the server-rendered listing tables, which are
template-generated and stable.

`/en/` and `/` (Marathi) are **two separate sets of posts**, not translations of
a single post — their IDs, slugs, orderings and even PDF attachments differ. A
record's Marathi twin is found through its own page's
`<link rel="alternate" hreflang="mr">`, which is the only reliable pairing the
site offers.

## Language

**Display text is Marathi** (`title`, `summary`), taken from the district's own
Marathi posts rather than machine-translated.

English is still scraped, because it is the working language of the pipeline —
Nominatim cannot resolve Devanagari place names, and the category and status
rules match English notice wording. It is kept in `provenance.titleEn` /
`provenance.summaryEn` so a record can be checked against its source, and is
used as display text only when no Marathi twin is found. Those records are
flagged `needsTranslation`.

Coverage is currently 106 of 116 records. The Marathi post is located by
searching the notice's own description — searching its title does not work,
since dozens of notices share the title "Collector Office, Camp Road,
Amravati".

### What is read

| File | Source | Notes |
| --- | --- | --- |
| `signals.json` | `/en/notice_category/{land-acquisition,announcements,tenders,recruitment}/` | Paginated notice tables: title, description, start/end date, attached PDF |
| `facilities.json` | `/en/public-utility-category/{hospitals,schools,colleges,municipality,electricity,banks,post}/` | Standing facilities inventory — **not** development updates, hence a separate file |
| `review.csv` | derived | Flat sheet of every signal for eyeballing before publication |

Land-acquisition notices are the highest-value source: they name a village and
taluka outright, cite a section number that maps to a real project stage, and
attach the notification PDF as evidence.

## Coordinates

**The district publishes no coordinates.** Every point is inferred from place
names via Nominatim (OpenStreetMap) and each record states how precisely it is
known in `confidence.location`:

- `village` — Nominatim matched the named village *and* agreed on its taluka.
- `taluka` — the village could not be matched, so the point is the taluka
  centroid. The record is flagged `needsReview`.
- `district` — no place at all could be read from the notice; the point is the
  district centroid.

A village match is rejected when OSM disagrees on the taluka, because Amravati
has several same-named villages in different talukas.

Attribution: © OpenStreetMap contributors (ODbL). Nominatim is called at one
request per second, per its usage policy, and responses are cached for 90 days.

## Derived fields

`category` and `status` are **not stated by the source**. They are derived from
notice wording and every record records the basis in `confidence`:

- Category comes from keyword rules; a record that falls through to the default
  is flagged `needsReview`. Place names and the issuing office's address are
  stripped before matching — several talukas are named "… Railway", and tender
  notices carry the Collectorate's "Camp Road" address.
- Status comes from notice wording. For land acquisition the section number is
  the ladder: section 11 opens the process (`announced`), 19 declares the land
  is required (`sanctioned`), 21/23 execute it (`in-progress`).

`outcome` is deliberately never populated — the notices do not state outcomes,
and inventing them would defeat the point of the product.

## Known limits

- The district site expires notices, so this is a **current-notices snapshot,
  not a full archive**. Records disappear upstream over time; re-scraping will
  not recover them. Commit the JSON if the snapshot matters.
- Land-acquisition notices say *that* land is being acquired, not *what for*.
  The purpose is inside the PDF, which is not parsed — hence category
  `infrastructure` on those records is a placeholder awaiting review.
- Tender and recruitment notices are procurement and staffing, not development.
  They are collected because they carry real dates and agencies, but most land
  in `public-systems` with `needsReview: true`.
- Village romanisation differs between the district site and OSM ("Nagzhari" vs
  "Nagzari"); the geocoder retries a few spelling variants and falls back to
  taluka precision rather than guessing.

This is indicative proof-of-concept data. Nothing here should be presented as an
official statement of the Amravati District Administration beyond the linked
source PDFs.
