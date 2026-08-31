# The DGIPR layer

Government press releases from the Directorate General of Information and
Public Relations, Government of Maharashtra, shown on the map as a third layer
that can be switched on over either mode.

## Where the data comes from

Two importers, writing the same snapshot. Run the live one; the curated one is
kept because it carries the only Mumbai releases the layer has.

### 1. mahasamvad.in, live — `pnpm dgipr:pull:live`

DGIPR's own site is WordPress, so every release is already published as clean
JSON at `/wp-json/wp/v2/`. No HTML parsing, no headless browser, no API key.

```
pnpm dgipr:pull:live [--per-district=N] [--dry]
```

The district is **never guessed from the text**. DGIPR's editors file each
release under a district category — `जिल्हा वार्ता` (222) → division → district
— and the script fetches one district at a time by that category's id, so the
district is known by construction before a word of the release is read.

The tree is discovered at runtime, not listed, because it *reuses names across
its two levels*: `पुणे` is both the division (233) and the district inside it
(235), and so are `नाशिक`, `नागपूर`, `कोल्हापूर`, `अमरावती`, `लातूर` and
`छत्रपती संभाजीनगर`. Matching on name alone would collide seven ways. The rule
that separates them is structural — a **leaf** under `जिल्हा वार्ता` is a
district, a node with children is a division.

That yields 36 leaves, of which 34 resolve against `districts.ts` exactly, with
no alias table. The two that do not are `नवी दिल्ली` and `पणजी`, which are the
state's information offices *outside* Maharashtra; they are reported and
skipped.

Two things it does not collect, both deliberately:

- **Mumbai.** There is no Mumbai category anywhere under `जिल्हा वार्ता` —
  releases from Mantralaya are filed under `वृत्त विशेष` (15k posts) with no
  district term at all. So Mumbai's marks come from the curated import below,
  which is why this script merges rather than replaces.
- **Division-only posts.** A few hundred are filed on a division and never on a
  district. Placing one would mean choosing a district the editors declined to
  choose — the exact guess this script exists to avoid.

Re-running is idempotent: live rows are keyed `ms-<wordpress post id>` and a
re-pull replaces that set wholesale. Rows without the prefix are left alone.

### 2. `maharashtra-in-a-glance`, curated — `pnpm dgipr:pull`

A sibling app carrying a hand-curated feed of Marathi releases in
`src/data/articles.ts`. Those five were transcribed off mahasamvad.in by hand,
so this is the slower path to the same source — but they are datelined Mumbai,
which the live pull cannot reach, so they stay.

```
pnpm dgipr:pull [path-to-maharashtra-in-a-glance]
```

Defaults to `../maharashtra-in-a-glance`. It writes two things and both are
committed:

- `src/data/dgipr-releases.json` — the snapshot the app reads.
- `public/dgipr/posters/*.svg` — the posters, copied across so the snapshot is
  self-contained.

Re-running it is idempotent: it overwrites both from whatever the source repo
currently holds. That is the upgrade path if the feed grows — re-run and commit
the diff.

## Making a sheet for a release — `pnpm dgipr:pdfs`, `pnpm dgipr:docx`

The five curated releases have a PDF because the sibling repo hand-made one for
each. The 136 live releases have none and never will: mahasamvad.in publishes
WordPress posts, not documents, so the live pull writes `pdfUrl: null` and is
right to. That is a gap in the source, not in the importer — the only way to
close it is to make the document here, from the text already held.

`make-pdfs.mjs` is therefore a renderer, not a fetcher. It reads
`dgipr-releases.json`, lays a release out on A4 and prints it with headless
Chromium. Nothing is written, summarised, translated or reordered on the way
through, so a wording fix lands in the snapshot and reaches the PDF by
re-running this.

`make-docx.mjs` writes the editable twin of that sheet — same masthead, same
headline, same full text, same credit block — so a recipient who needs to quote
a release or paste it into a bulletin gets the words rather than a page image.
The half the two share (the vocabulary, the Marathi dates, the selection flags,
the write-back) lives in `release.mjs` precisely so the pair cannot drift. The
layouts stay apart, because a stylesheet and a `docx` document tree have nothing
to factor out between them.

Both take the same flags:

```
pnpm dgipr:pdfs                        # Pune's four — the default set
pnpm dgipr:docx
pnpm dgipr:pdfs -- --district=nanded
pnpm dgipr:docx -- --only=ms-213394,ms-213391
pnpm dgipr:pdfs -- --all
pnpm dgipr:docx -- --no-write          # write files, leave the snapshot alone
```

They write two things each, all committed:

- `public/dgipr/pdfs/<id>.pdf` and `public/dgipr/docs/<id>.docx` — named by
  mahasamvad post id, not by slug. The live rows' slugs are the percent-encoded
  Devanagari WordPress gave them, a hundred-odd characters of `%e0%a4…` that is
  neither readable as a filename nor tolerable in a URL.
- `pdfUrl` / `docxUrl` on the rows they wrote, and nothing else in the file.
  Running one after the other is safe: each re-serialises the snapshot it read,
  so the other's field survives.

Three things to know:

- **A live pull blanks them.** `dgipr:pull:live` rewrites every `ms-*` row from
  the API, both fields included. Re-run the generators after a live pull.
- **The sheet says what it is.** The masthead names the directorate, because the
  directorate wrote the words. The footer names महासंवाद, the permalink and the
  import date, because this file was not issued by anybody's government. Both
  halves are needed: without the masthead the text is misattributed, and with
  only the masthead it is a government notice wearing our page furniture, which
  is a worse thing to hand somebody.
- **The two sheets differ in exactly one place, on purpose: the typeface.** The
  PDF sets Noto Sans Devanagari, a webfont Chromium loads at print time and
  embeds. Word resolves no fallback of its own, so the DOCX asks for Nirmala UI
  — which ships with Windows, covers Devanagari, and is therefore what the
  machines these get forwarded to actually have.

Neither needs a dev server, unlike the sibling repo's `gen:pdfs` — there is no
`/print` route to keep in sync. If a browsable preview is ever wanted, the
`sheet()` template in `make-pdfs.mjs` is what it should serve. `make-docx.mjs`
needs no browser at all: the sibling's version launches Chromium to rasterise
SVG posters and downscale oversized photographs, and neither job exists on this
data — every live poster is already a JPEG of about the size the page uses.

## Why the snapshot is committed and not in `.data/`

Every other store in this project lives in `.data/`, which is gitignored, and
both `scripts/news/db.mjs` and `scripts/news/stories/db.mjs` argue at length for
why. Those files hold a scraped corpus that is enormous, rebuildable, and — in
Lokmat's case — unrepeatable.

None of that applies here. A few hundred government press releases are content,
not a corpus; a fresh clone or a Vercel build that silently has none of them is
a broken feature rather than an empty one. So the snapshot ships with the app
and needs no build step on the far side.

It is worth knowing the weight, because the body of every release is carried in
full and that is most of the file. At `--per-district=4` the snapshot is 141
releases and about 1.4 MB on disk — but `loadDgipr` filters before anything is
serialised, so what actually reaches the browser is one window's worth: roughly
240 KB at 48 hours, 440 KB at seven days. Raising `--per-district` raises the
file, and raises the payload only for the windows the extra releases fall in.

## Why it is a separate store

A release is never written into `news.db` or `stories.db`. It is not an article
the collector observed:

- no URL that was swept, so no `rank_snapshots` row and no **prominence**
- no `dateModified`, so no **revisions**
- one document from one department, so no **thread**, no follow-ups, no
  **velocity** and no place on the fire board
- a dateline and never a coordinate, so no **taluka tier**

Letting it into `articles` would put a row in every one of those tables that
means something different from its neighbours, and every count drawn over them —
the choropleth's levels, the arrival ratio, the quantile ramp — would quietly
start mixing two kinds of thing. The separation is the point, not an
inconvenience.

## What the map does with it

| | press | DGIPR |
|---|---|---|
| control | `mode` — heat / pins | `official` — a filter, switched on over either |
| hue | violet (`--color-accent`) | green (`--color-official`) |
| mark | pin with a tip (taluka) or halo (district) | halo with a **square** core |
| panel | headline, standfirst, link out | the released text **in full** |

Two things there are deliberate departures from rules the rest of the map holds
to, and both are argued where they happen:

1. **A second hue.** `news-map.css` says the sheet has exactly one hue that
   means anything. It was arguing against ten sector colours over a choropleth —
   two categorical systems on one surface. This is one hue standing for one
   thing: a source that is not the press. See `--color-official` in
   `tokens.css`.

2. **The panel prints the body.** `NewsPanel` and `StoryPanel` both stop at a
   headline and say why: republishing a Marathi daily is a different act from
   linking to it. A DGIPR release is a government department's own public
   information, issued to be carried and already published in full on
   mahasamvad.in. See the note at the top of `src/components/news/dgipr-panel.tsx`.

## The one judgement the curated import makes

This applies to `pull.mjs` only. The live pull makes no such judgement, because
it never reads a dateline — see above.

DGIPR datelines `मुंबई`. The map has two Mumbais. Releases datelined Mumbai are
issued from Mantralaya, which is in Mumbai City, so that is where they are
filed — see `ALIASES` in `pull.mjs`. The release keeps its own dateline word
beside the resolved id and the panel prints **that**, so a reader is never shown
a district the department did not name.

Anything else that does not match a district's `nameMr` exactly is left
unresolved rather than guessed at. An unresolved release still reads in the
panel; it simply gets no mark, and the plate counts it so it does not vanish.

## Windowing

Releases carry a calendar date and no clock, so the window is applied at **day**
granularity. That widens a 24-hour window by up to a day at its far edge, which
is the smaller of the two available errors — inventing a midnight timestamp
would drop every release actually issued on the boundary day.

This layer also **widens its own window**, which `loadStories` deliberately does
not do. The reason that rule exists is that pins over a choropleth must not show
marks the counts underneath do not account for; nothing of the kind is true
here, since this layer paints no land and is summed into no total. What is true
is that the collector adds hundreds of articles a day where the directorate
issues a handful of releases, so pinning this to the corpus's clock would show
an official-looking zero for days at a stretch. It widens, and the plate says
so.

**It widens until it reaches six districts, not until it is non-empty.** That
threshold was right when the snapshot was five releases from one district, where
"not empty" and "worth looking at" were the same test. The live pull separated
them: the directorate files from somewhere between three and ten districts on a
given day out of thirty-five, so a 24-hour window is now reliably non-empty and
reliably almost blank — four marks on a map of the whole state, which reads as
"the state was quiet" when what happened is "the window is short". Six is about
a division's worth. See `DISTRICT_FLOOR` in `src/lib/dgipr/read.ts`.
