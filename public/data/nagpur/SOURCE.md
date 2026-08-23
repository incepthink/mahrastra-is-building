# Nagpur district data

Scraped from the official Nagpur district portal by
`node scripts/scrape-nagpur.mjs` (`pnpm scrape:nagpur`). Re-running the script
regenerates every file in this directory.

## Source

https://nagpur.gov.in/ — the Nagpur District Administration site, run by NIC on
the S3WaaS (WordPress) platform, the same build as
[Amravati](../amravati/SOURCE.md) and [Pune](../pune/SOURCE.md).

The site publishes no API: `/wp-json/` is closed, and there is no sitemap or RSS
feed. Everything is read from the server-rendered listing tables, which are
template-generated and stable.

**English is at the bare path here, Marathi at `/mr/`** — the reverse of the
other two districts, which serve English from `/en/`. `/en/notice_category/…`
returns 404 on this site.

## How Nagpur differs from Pune and Amravati

The three districts run the same software and publish very differently, which is
why they have separate scrapers rather than one parameterised by district. Two
of the differences below are not cosmetic — they change how the scraper works.

| | Amravati | Pune | Nagpur |
| --- | --- | --- | --- |
| English lives at | `/en/` | `/en/` | `/` |
| Marathi lives at | `/` | `/` | `/mr/` |
| Per-record detail page | yes | yes | **none** |
| EN↔MR pairing | per-record `hreflang` | per-record `hreflang` | **per-listing, keyed on the attached PDF** |
| Land acquisition | its own notice category | notices + an awards archive | one archive holding every stage |
| Where the place is stated | `Village- X, Taluka- Y` | `Mouje X, Tal. Y`, `PRR E Khed Khalumbre` | `Mouza – X Taluka Y Dist. Nagpur` and five variants of it |
| Scheme named | no | often — a D.P. road, NH-548-D | sometimes — Gosikhurd, Mokhabardi, the Wardha–Nagpur railway lines |

Shared, generic code lives in [`scripts/lib/`](../../../scripts/lib) — polite
cached HTTP, S3WaaS HTML helpers, and the review-page builder. Everything that
encodes what a *place* or a *notice* looks like in this district lives in
[`scripts/nagpur/`](../../../scripts/nagpur).

### Pairing English to Marathi without a detail page

This is the one structural problem Nagpur poses that the other two do not.

Pune finds a record's Marathi twin by opening the record's own page and
following `<link rel="alternate" hreflang="mr">`. On this site there is no such
page to open: the listing's "View" link goes straight to the PDF, and site
search does not index notices or documents — a title query returns the
homepage's featured notice and nothing else. Guessing the WordPress permalink
from the title returns 404.

What the site does have is a Marathi *listing*. The category page carries the
`hreflang` link, and a record's attached PDF is the same file in both languages
for **317 of the acquisition archive's 323 rows**. So the pairing is made on the
attachment rather than on a page:

1. read the English listing, page by page;
2. follow the category's own `hreflang="mr"` and read the Marathi listing the
   same way, building a map from PDF URL to Marathi title;
3. look each English row's PDF up in that map.

The attachment is a stronger key than a title — a title gets republished in
corrected form, a file does not — and it costs one request per page instead of
three per record: the archive pairs in 33 requests where the per-record approach
would have taken about 970.

The rows that do not pair are the ones where the two language posts carry
separately uploaded files. They keep their English text and are flagged
`needsTranslation`, which is what that flag is for.

### What is read

| File | Source | Notes |
| --- | --- | --- |
| `signals.json` | `/document-category/rehabilitation_resettelement/` | Title \| Date \| PDF, no description column. 301 of the 305 records |
| | `/notice_category/{announcements,tenders,recruitment,current-updates,nazul}/` | Paginated notice tables: title, description, start/end date, attached PDF |
| `facilities.json` | `/public-utility-category/{hospitals,colleges,municipal-corporation,municipal-councils,nagar-panchayat,postal_nagpur_city}/` | Standing facilities inventory — **not** development updates, hence a separate file |
| `review.csv` | derived | Flat sheet of every signal for eyeballing before publication |
| `review.html` | derived | Built by `node scripts/nagpur/build-review-page.mjs` |

`recruitment`, `current-updates` and `nazul` are empty as of this scrape. They
are kept in the source list because the site refills them and an empty listing
costs one request. `nazul` is the one worth watching — nazul is government-owned
urban land, and a notice there is usually a lease or allotment on it.

The **rehabilitation and resettlement** archive (the site's spelling) is
effectively the whole dataset, and it is a better source than either of the
other two districts offers. It is not an awards archive like Pune's: it holds
the entire RFCTLARR file — section 11 notifications, section 19 declarations,
section 21 notices, awards, final awards and corrigenda — 33 pages deep, back to
2015. Every row names a mouza, most name the tahsil, and 26 name the scheme the
land is being taken for.

### What is deliberately not read

Four of the site's seven document categories are skipped, and the reasons
differ:

- `others` — 50 rows, of which the development-related ones are two draft
  District Survey Reports. The rest is election paperwork, RTI disclosures,
  compassionate-appointment waiting lists and freedom-fighter registers.
- `pandan_rasta` — six per-tahsil code lists of field access roads. An inventory
  of roads that already exist, not a record of anything being built.
- `seniority_list`, `special-executive-officer` — registers of named people.
- `census`, `citizen-charter` — one static reference document each.

Separately, **rows that are registers of named people are skipped wherever they
appear** — `isPersonalRecord` in `scrape.mjs`. This is not a theoretical
precaution: the acquisition archive itself carries ten of them among the
notifications. The brief rules out beneficiary-level and personally identifiable
information, and no category on this site is reliably free of it, so the filter
runs per row rather than per source.

`section 18` is in that filter rather than in the section ladder, which is worth
stating plainly: section 18 of the 1894 Act is a *claimant's* reference to the
District Court against the compensation awarded to them, so every row citing it
here — the priority lists, the fund-transfer lists, the court-ordered
publications — is a list of named people and their claims. There is no
section-18 row in this archive that is about a project rather than about
individuals.

## This snapshot

| | |
| --- | --- |
| Signals | 305 |
| Facilities | 37 |
| Date range | 2015-02-07 → 2026-08-21 |
| Marathi display text | 301 (99%) |
| Named a scheme | 26 |
| Village precision | 175 |
| Taluka precision | 109 |
| District precision | 21 |
| Flagged `needsReview` | 138 |

By category: 270 infrastructure, 20 transportation, 11 agriculture, 2
public-systems, 2 manufacturing. By stage: 171 announced (a section 11
notification opening a case), 100 sanctioned (a section 19 declaration), 25
in-progress (sections 21–23, including awards), 9 completed (a final award).

The shape is different from Pune's, and it is the district talking rather than
the rules. Pune's file is 88% transportation because Pune is acquiring land for
roads; Nagpur's is mostly plain acquisition notices that name no scheme at all,
and where a scheme *is* named it is as often irrigation as road — Gosikhurd and
the Mokhabardi lift irrigation scheme against NH-7 and the Model Mill Chowk
widening. Kuhi (90) and Bhiwapur (76) carry more than half the archive between
them, which is the Gosikhurd command area.

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
Devanagari, so a row filed under the Marathi post type but titled in English is
not counted as translated.

## Coordinates

**The district publishes no coordinates.** Every point is inferred from place
names via Nominatim (OpenStreetMap) and each record states how precisely it is
known in `confidence.location`:

- `village` — Nominatim matched the named mouza *and* agreed on its tahsil.
- `taluka` — the village could not be matched, so the point is the tahsil
  centroid. The record is flagged `needsReview`.
- `district` — no place at all could be read; the point is the district
  centroid.

A village match is rejected when it falls outside the district's OSM envelope,
or when OSM disagrees on the tahsil — Nagpur has a Parsodi in Bhiwapur and
another in Nagpur Rural, and a Chikhali in three tahsils. Agreement accepts any
known spelling of the tahsil, because OSM does not use the district site's
romanisation: Mouda is "Mauda" there, Saoner is "Savner", Kamptee is "Kamthi".

**Nagpur City is the one tahsil exempt from that check**, because OSM writes the
*city* into places inside it rather than the tahsil. Nagpur Rural was exempt too
at first and is not any more: OSM does name that tahsil, so the check has
something real to test, and the exemption was letting a Wathoda that OSM places
in Kalmeshwar be accepted as the Wathoda a Nagpur Rural notice named. Five
records moved from village to tahsil precision when it was removed, which is the
truthful answer for them.

Attribution: © OpenStreetMap contributors (ODbL). Nominatim is called at one
request per second, per its usage policy, and responses are cached for 90 days.

## Derived fields

`category` and `status` are **not stated by the source**. They are derived from
notice wording and every record records the basis in `confidence`:

- Category comes from keyword rules; a record that falls through to the default
  is flagged `needsReview`. Transportation is tested first because railway
  wording is unambiguous, then agriculture, which owns the irrigation
  vocabulary; the generic construction wording falls to `infrastructure` below
  both, which is where most of this archive lands.
- Status comes from the RFCTLARR Act 2013 ladder the notices cite: section 11
  opens the process (`announced`), 19 declares the land is required
  (`sanctioned`), 21–23 execute it (`in-progress`), and section 37(1) — the
  final award — closes it (`completed`).
- `implementingAgency` is the office that *issued* the notice unless the wording
  names a body. It is not a claim about who builds the thing the land is for,
  and no rule turns a *scheme* into an agency: Gosikhurd is executed by the
  Vidarbha Irrigation Development Corporation, but the notices do not say so, so
  the records do not either.

`provenance.project` is different: the scheme is **stated** by the notice — "for
Gosikhurd Project", "under Kanhan River Project (Kochii Barrage)", "for
Wardha-Nagpur third & fourth Railway Line" — so it is carried verbatim in spirit
even though the Signal schema has no field for a scheme.

`outcome` is deliberately never populated — the notices do not state outcomes,
and inventing them would defeat the point of the product.

## Known limits

- The notice categories expire on the district site, so those are a
  **current-notices snapshot**. The acquisition archive is not expired and goes
  back to 2015, which is why it is 301 of the 305 records.
- Acquisition notices say *that* land is being acquired and sometimes *what
  for*, but not what will be built or when. The detail is inside the PDF, which
  is not parsed.
- The archive holds every stage of a case, so one project appears several times
  at different sections of the Act. That is accurate, but a reviewer publishing
  them should decide which stage to show.
- **The site's own English and Marathi posts sometimes disagree.** One current
  row is titled "Publication of notice 19(1)" in English and
  "प्रारंभिक अधिसुचना 11(1)" in Marathi — a different section of the Act, and so
  a different rung of the status ladder. Classification follows the English,
  because that is what the rules read; the Marathi is what the reader sees. Both
  are in the record.
- The site double-publishes some notices, listing one case twice with two
  separately uploaded PDFs. Those are deduplicated on title and date, keeping
  the copy the site lists first — which is also the one that has a Marathi twin.
- `Mauza – Tas Mokhabardi` runs the village into the scheme it is being acquired
  for. The village parser keeps at most two words and the geocoder retries on
  the first, so these resolve to Tas rather than failing, but the `locality`
  field reads as published.
- Village romanisation differs between the district site and OSM; the geocoder
  retries a few spelling variants (including the v/w swap that recovers
  "Wathoda" as "Vathoda") and falls back to tahsil precision.

This is indicative proof-of-concept data. Nothing here should be presented as an
official statement of the Nagpur District Administration beyond the linked
source PDFs.
