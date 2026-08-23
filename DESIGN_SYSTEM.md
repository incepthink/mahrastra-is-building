# Design system — "Orion"

The rules below exist so that every screen added later looks like it belongs to
the same product. Read this before adding a component.

> **State of this document.** §1, §2 and §7 describe the code as it stands.
> §3–§6 predate *three* palette changes now and still describe the retired
> "Konkan Light" system — its `harbor`/`surf`/`shell` ramps, an `AmbientGlow`,
> a `SiteFooter` and a `ui/` primitives folder, none of which exist. Treat
> those sections as intent, not as reference, and check
> `src/styles/tokens.css` before quoting a token from them. §4's shadow names
> and §6's contrast figures are the two places most likely to mislead: the
> real depth scale is `--shadow-xs/sm/md/lg` plus `--shadow-accent`, and the
> real measured contrast is in §2.

---

## 1. Concept

A **lit console**, not a printed sheet.

White objects on a soft lavender ground, deeply rounded, separated by diffuse
shadow rather than by rules. Nothing in the product is outlined. If two things
need telling apart, one of them is lifted. If a thing has a border round it, it
is wrong.

The system reached this by failing three times, and all three are worth keeping
in mind:

1. **Almost monochrome.** Cream paper on a cream ground, one green, one brass.
   Careful, coherent, and indistinguishable from a government form.
2. **Colour spread everywhere.** Every district filled with its revenue
   division's tint. That did not make the map livelier; it made it a chart of a
   fact nobody had asked about, and it fought the pins for attention.
3. **The poster.** Six hard diagonal bands of colour behind a cream sheet, hard
   black rules, solid offset shadows. It had real personality and it was the
   personality of a risographed government form — the loudest thing on a screen
   whose subject is a map was the wallpaper behind it.

What works is a quiet ground, white objects, and colour reserved for marks:

| Layer | Treatment |
| --- | --- |
| **The page** | Quiet. One lavender wash on a long diagonal, edge to edge. |
| **The objects** | White, borderless, `radius-lg`, lifted by `--shadow-md`. Cards never have a border. |
| **The state** | Near-white, floating directly on the wash under a long soft cast. No sheet under it, no district tints, no hatch. |
| **The marks** | Saturated, and the only saturation on screen. Five status inks and ten sector hues. Nothing else may be coloured. |

The one place the product blurs is the dialog scrim, and the reason is in
§2 — a flat scrim over a map reads as the map having been switched off.

---

## 2. Colour

Tokens live in `src/styles/tokens.css` in two tiers. **Tier 1 — primitives**
(`--color-violet-*`, `--color-slate-*`) are the raw ramps; never reference them
in a component. **Tier 2 — semantics** (`--color-canvas`, `--color-accent`) are
what JSX and the stylesheets use.

**Violet is the one hue the product owns.** `--color-accent` `#6c5ce7` is the
brand, the primary button, the focus ring and "you are here" on the map, and it
appears nowhere else. A violet thing on this screen is always something you can
press or something you have picked.

Anything painted `--color-accent` sets `--color-on-accent` (white, 4.86:1) for
its text. Anything that wants a quiet accent surface takes `--color-accent-soft`
`#e9e5fe`, which is pale enough for ordinary body ink and pairs with
`--color-accent-deep` at 7.38:1.

The grounds and the neutral ramp:

| Token | Value | Is |
| --- | --- | --- |
| `--color-canvas` | `#e7e7f8` | the lavender page, under `--gradient-canvas` |
| `--color-surface` | `#ffffff` | every card, panel and dialog |
| `--color-surface-sunken` | `#f6f6fc` | a recess *inside* a card — the stage box, the foot |
| `--color-land` | `#f7f7fc` | the state itself |
| `--color-text` / `-muted` / `-subtle` | `#1a1a30` / `#4d4d6b` / `#656587` | three levels, no fourth |

Measured contrast, worst ground first (the canvas is always the worst, which is
why the text ramp is measured against it rather than against white):

| | canvas | white | sunken |
| --- | --- | --- | --- |
| `text` | 13.92 | 17.01 | 15.80 |
| `text-muted` | 6.64 | 8.11 | 7.53 |
| `text-subtle` | 4.56 | 5.58 | 5.18 |

All three clear AA for normal text on every ground. `text-subtle` is the floor
and it is deliberately close to it — metadata runs at 11px, which WCAG counts
as normal text, so there is no room below this.

### The colour rules

> **1. Status carries colour by meaning. Nothing else on the sheet does.**

Five statuses, five inks, in the order work moves through them — the ramp warms
as money arrives and cools again once the thing exists:

| Status | Ink | | Reads as |
| --- | --- | --- | --- |
| `announced` | indigo | `#5566e8` | declared, no money yet |
| `sanctioned` | amber | `#f5b312` | funded |
| `in-progress` | coral | `#f4663f` | active — the hottest thing on the map |
| `completed` | emerald | `#1f8f5f` | built |
| `operational` | cyan | `#12a5c4` | built *and* running |

Mapping lives in `src/lib/design/status.ts`. Recolour a status there and the
pins, the legend, the panel edge and the stage meter all follow.

**Status inks are marks and never text.** They paint the panel's leading edge,
the stage meter's nodes, a cluster's chips and the dot on a hover plate — all
of which carry a label beside them. The single place a status hue has to
survive as body text is a notice window about to close, and that uses
`--color-coral-600` `#c93a1c` (5.12:1 on white) rather than the `500` mark.

`LIGHT_TONES` used to live in the same file, listing the inks pale enough to
need dark glyphs rather than white ones. Nothing reads it: no status ink sits
under a glyph anywhere any more.

> **2. A sector's colour comes at two strengths, and they are not
> interchangeable.**

Categories used to be deliberately colourless. That held while a category was
just an icon inside a status-coloured disc; it stopped holding once the map
became a handful of curated pins a reader has to tell apart at a glance.

Each sector now carries its hue twice. `--color-sector-*` is the **mark** —
saturated, always under a white glyph — and fills anything small enough to need
finding: a pin head, the legend's icon badge, the dot leading a ticker headline.
`--color-sector-*-plate` is the **surface** — pale, always under ordinary body
ink — and fills anything large enough to be read on: the record panel's header,
the meaning block, the report dialog's head.

One pastel used to do both jobs. That made the pin as quiet as the panel, and
the pin is the smallest thing on screen.

**The threshold for a badge is 3:1, twice over** — white glyph against the fill,
and fill against the near-white land it stands on. Not 4.5:1. That is the
threshold for *text*, and a sector badge is an icon with its own label beside it
everywhere it appears. Holding all ten to 4.5 was tried, and it makes the
palette worse: every hue has to go dark to reach it, and ten dark hues are far
harder to tell apart than ten separated ones — which is the only property the
badges actually depend on. The floor across the ten is 3.43 (energy).

| Sector | Mark | glyph / land | Plate |
| --- | --- | --- | --- |
| infrastructure | `#5361d8` | 5.16 / 4.83 | `#e4e6fb` |
| transportation | `#e0417a` | 4.03 / 3.78 | `#fce0ea` |
| energy | `#b8800a` | 3.43 / 3.21 | `#f9edcf` |
| public systems | `#b83bab` | 4.94 / 4.63 | `#f7e0f4` |
| manufacturing | `#e06414` | 3.50 / 3.28 | `#fde6d3` |
| research | `#0d7f96` | 4.67 / 4.38 | `#d8eef4` |
| agriculture | `#14926a` | 3.93 / 3.68 | `#d9f0e6` |
| water | `#2b7fd4` | 4.13 / 3.86 | `#dde9f9` |
| housing | `#7a4f4a` | 6.90 / 6.46 | `#f2e5db` |
| environment | `#6f8f27` | 3.73 / 3.49 | `#e9efd6` |

Every plate clears 13.7:1 for `text`, so body copy on any of them is safe.

Two pairs sit closer than the rest and are worth re-checking if either sector
gains records: **energy / manufacturing** (0.048 hue, 0.098 lightness) and
**manufacturing / housing** (0.048 / 0.094). Both are gold-against-orange or
orange-against-brown, distinguishable with a glyph inside them but not by colour
alone at 13px. Clay was moved from `#9c6246` to `#7a4f4a` precisely because it
was 0.011 of a hue turn from the manufacturing orange, which is not
distinguishable at all.

> **3. The state is one colour, and it is nearly white.**

No division tints, no hatch, no per-district fill. `#map-land-fill` is the only
gradient on the map and it is two steps of near-white. The land stopped being
green when sectors gained saturated marks: a tinted state plus ten tinted marks
is two categorical colour systems competing on one surface. The state is now
the quietest thing on screen, which is what makes every pin on it the loudest.

Status marks are the one exception to "3:1 against the ground". The ladder has
to run from a cool indigo through a *genuine* yellow to a hot coral, and a
yellow that carries its own 3:1 against a white card is not a yellow any more —
it is olive. So `sanctioned` (1.72), `operational` (2.71) and `progress` (2.86)
keep their saturation and take a 1px slate ring instead, and every one of them
has its label immediately beside it. `announced` (4.38) and `completed` (3.79)
need no help.

### Depth

Four steps, and every one of them is two casts — a wide diffuse one for the lift
and a tight one for the contact — tinted with the ground's own slate rather than
black, which is what keeps a white card from looking like it is sitting in
smoke.

| Token | For |
| --- | --- |
| `--shadow-xs` | a badge or chip resting on a card |
| `--shadow-sm` | a control — the statewide pill |
| `--shadow-md` | a card — the legend, the invitation, the zoom cluster, the news band |
| `--shadow-lg` | something covering the page — the record panel, a dialog |

Plus `--shadow-accent` / `--shadow-accent-hover`, a violet cast used **only**
under something painted in the accent. A filled violet button dropping a neutral
grey shadow looks pasted onto the card it sits on.

There is no fifth step. A product with five elevations has two it cannot tell
apart. **Never write a custom `box-shadow` in a component** — the exceptions
that exist are the definition rings on status marks and the white collars on
stage nodes, which are rings rather than elevation.

The retired device was a **solid offset plate in ink**, no blur —
`--shadow-plate-*`. Registration offset only ever worked on rectangles; the map
tried it with a second copy of the silhouette and it read as a green fringe
welded to the Konkan.

### Dark mode

Deliberately **not supported.** `color-scheme: light` is set explicitly so form
controls follow. This still reverses the brief's §8 "dark, cinematic" direction —
the energy comes from the saturated marks against a very quiet ground, not from
a dark one. If dark mode is ever added, the work is in the semantics tier only:
the primitives are already a full ramp, and no component references them.

---

## 3. Typography

Two geometric sans faces, one per script: **Manrope** for Latin and
**Poppins** for Devanagari. Poppins is drawn by Indian Type Foundry with its
Devanagari built alongside its Latin on the same circular skeleton, so it meets
Manrope on shared terms and English and Marathi read as one identity rather than
two bolted-together faces — the brief's §8 requirement, solved at the type level
rather than with CSS tweaks. `JetBrains Mono` carries counts, dates and
coordinates.

Poppins is **static, not variable.** `layout.tsx` loads 400 / 500 / 600 / 700,
and `font-synthesis-weight: none` means anything else falls back rather than
being faked. Add the weight there before you set it in a component.

`Anek` by Ek Type held Devanagari before this and left for the same reason the
editorial serif did: it is the humanist choice, and the product settled on
geometric on both sides.

| Token | Size | Use |
| --- | --- | --- |
| `text-display` | fluid 44 → 80px | one per page, the hero only |
| `text-title` | fluid 28 → 44px | stat values, panel titles |
| `text-heading` | 20px | section headings |
| `text-lead` | 17px | hero subcopy |
| `text-body` | 15px | default |
| `text-caption` | 13px | chips, secondary UI |
| `text-micro` | 11px | metadata, attribution |
| `text-eyebrow` | 11px, `0.18em` tracked | section kickers |

Rules:
- Marathi text always carries `lang="mr"`, which switches the face automatically
  via `:lang(mr)` in `base.css`. Use the `Bilingual` component for label pairs.
- Every number uses `.numeric` (tabular figures) so counts don't jitter.
- Three text levels only: `ink`, `ink-muted`, `ink-subtle`. If you want a fourth,
  the layout is the problem.

---

## 4. Shape, depth, motion

- **Radii:** `xs 6 · sm 8 · md 12 · lg 16 · xl 22 · 2xl 28`. Panels use `lg`;
  buttons and chips are fully round.
- **No pills inside a record.** The panel states facts, and a rounded capsule
  around a fact reads as a button that cannot be pressed. Status, counts and
  dates there are set as type, measured on a scale, or ruled off — never
  wrapped. Pill shapes stay on the things you actually click.
- **Meaning is measured, not decorated.** Where a value has a range behind it
  (a stage on the five-stage ladder, days left in a notice window), draw the
  range and mark the value on it. `status-meter` and `notice-window` are the
  two worked examples.
- **Depth** comes from three shadows only: `shadow-raised` (cards),
  `shadow-panel` (floating overlays), `shadow-accent` (primary button lift).
  All three are soft and blue-tinted — a neutral black drop shadow on cream
  reads as dirt. Never write a custom `box-shadow` in a component.
- **One light source.** `AmbientGlow` is the only gradient in the product. On a
  light ground it works by tinting rather than glowing. Panels are flat, and
  separate from the canvas by shadow and hairline more than by fill — `surface`
  is only 1.1:1 against `canvas` by design.
- **Motion:** `ease-out-soft` for entrances, 200ms for state changes.
  `animate-signal-pulse` marks live activity. `prefers-reduced-motion` is
  honoured globally in `base.css`.

---

## 5. Component structure

```text
src/
  app/                     routes only — pages compose, they never style
  components/
    ui/                    generic primitives, no domain knowledge
      bilingual · button · chip · copy-button · panel · section-label · stat
    map/                   the district map
      maharashtra-map (state) · map-canvas (paint) · district-path
      district-readout · map-controls · map-defs · use-map-camera
      signal-layer · signal-marker · signal-readout
      cluster-marker · cluster-readout · stem · use-counter-scale
    filters/               (next) filter bar wired to URL params
    signals/               the record panel
      signal-panel (shell) · signal-facts (the ledger) · status-meter
      notice-window · signal-provenance · language-toggle
  data/                    typed local content (categories, districts, divisions)
                           signals.ts — which records are published
  lib/
    cn.ts                  clsx + tailwind-merge
    design/                design decisions expressed as data (status.ts)
    map/                   geometry.ts (server projection) · project.ts · rewind.ts
    signals/               format.ts — dates, places, language fallback
    validation/            signal.ts — the Zod gate over the scraped file
  types/                   Signal, SignalStatus, SignalCategoryId, MapGeometry
  styles/                  tokens.css, base.css, map.css, signals.css
```

Conventions:

1. **One component per file, named export, kebab-case filename.** Each folder has
   an `index.ts` barrel so imports read `@/components/ui`.
2. **Keep files under ~100 lines.** If a component grows past that, it is doing
   two jobs — split it. `MapPlaceholder` splitting out its `Marker` is the pattern.
3. **Variants via `cva`, never via ad-hoc prop-to-class ternaries.** `Button`,
   `Badge`, `Panel` and `Container` all follow this.
4. **`ui/` knows nothing about signals.** Domain types stop at `home/`, `signals/`,
   `filters/`. That is what makes `ui/` reusable.
5. **`"use client"` only where state or events live** (`Chip`, later the map).
   Everything else stays a Server Component.
6. **Never hardcode a colour.** If a value isn't in `tokens.css`, add it there
   first with a semantic name.

---

## 6. Accessibility baseline

- Single global focus ring (`:focus-visible`, saffron, 2px, 2px offset) — never
  remove it locally.
- Filter chips are real `<button>`s with `aria-pressed`; rails are labelled
  `role="group"`.
- Measured contrast on `canvas` / `surface` / `surface-sunken`: `ink`
  14.9 / 16.4 / 14.7, `ink-muted` 7.8 / 8.6 / 7.7, `ink-subtle` 4.7 / 5.2 / 4.7,
  `accent` 5.0 / 5.5 / 5.0. Every status tone lands between 4.7 and 5.9 on all
  three grounds. All pass WCAG AA for normal text; none clear AAA, so `accent`
  and the status tones stay out of body copy and `ink-subtle` stays on
  supporting copy.
- `accent-wash` and raw `surf-300` are decorative grounds only — `ink-subtle`
  drops below AA on them. Text over either must be `ink` or `ink-muted`.
- Harbour blue is dark enough that `ink-inverse` (cream) on `bg-accent` clears
  5.5:1 — primary buttons use light text, never dark.
- Reduced motion disables all animation globally.
- Map and boundary attribution stays in `SiteFooter` and must not be hidden.

---

## 7. The map

The homepage is the map and nothing else — no header, hero, rails or footer. The
placeholder shell that used to occupy those slots has been removed.

Decisions worth knowing before touching `components/map/`:

- **SVG, not MapLibre.** There is no basemap to render, and the brief's core
  interaction — a district that lifts and grows under the pointer — is a
  per-polygon transform, which a tile renderer cannot do. MapLibre stays the
  right choice for the signal layer later; it is the wrong one for this.
- **The projection runs on the server.** `lib/map/geometry.ts` reads the
  GeoJSON, projects it with d3-geo and ships path strings. The browser
  downloads neither d3-geo nor the 440 kB source file.
- **The coastline is the union of the 36 districts,** not the separate ADM1
  outline: the two files are different vintages and disagree by kilometres.
  Sheet, coast, contact shadow and clip are four `<use>` references to one
  `<path>`. That union is a real **dissolve** — `topojson.merge` over the same
  simplified topology the districts come from. It used to be the 36 outlines
  concatenated into one path, which *fills* as a clean union and so looked
  right; but the coast rule strokes the same path, so every internal border was
  being overprinted in full ink at coastline weight and the state read as a net.
  One path, two uses, and only the dissolve satisfies both.
- **The state is one plate, and it is near-white.** Districts have no fill at
  all — a transparent one for hit-testing, and a hairline. Two things were
  tried here and removed:
  per-division tints (a chart of a fact nobody had asked about, competing with
  the pins) and an engraver's hatch over districts holding records (a dark blob
  at exactly the spot the pins need to be legible, and a legend with one entry).
- **The land does not offer a cursor.** `.map-surface` is `cursor: default`, not
  `grab`. The camera still pans on drag, but a hand under the pointer across the
  whole screen made the page look like something you were meant to be dragging.
  Pins are the only things that claim to be clickable and the only things that
  change the cursor.
- **There is no sheet.** `.map-page` carries the lavender wash and `.map-frame`
  is now fully transparent, so the state sits directly on the ground under its
  own long contact shadow. This is the change the whole retheme turns on: a
  near-white state on a pale *sheet* is one flat field with a hairline in it,
  while a near-white state on lavender is an object. The frame still exists for
  the clipping, the stacking context and the pointer — it simply paints
  nothing. Two texture layers were retired with it: `.map-page::after` and
  `.map-tooth`, both multiplied noise, which is the one thing that reliably
  makes a light interface look dirty rather than textured.
- **The coast is slate, not black.** `--color-coast` at 1.35px. A black outline
  around a white state on a pale page reads as a sticker cut out and laid down,
  which is the one thing a map must not look like. It is drawn *dark enough to
  be a line*, though — the first pass sat at 26% ink and one weight, and against
  lavender the silhouette's edge dissolved into the district hairlines it was
  supposed to close.

### Signals on the map

The pilot's first record — a section 19 land-acquisition declaration at
Sahadapur, Morshi taluka — is on the map. Decisions worth knowing:

- **Which records are public is a list, not a query.** The two scraped files
  hold 116 Amravati and 172 Pune records, most unreviewed. `data/signals.ts`
  publishes the rows in `published-signals.json` and nothing else, reading each
  district's file once however many records it contributes, and every record is
  validated through `lib/validation/signal.ts` on the way in. A row may also
  correct the record's *sector*, which is the one field the pipeline is allowed
  to be overruled on — both districts' files carry the caveat that category is
  derived from notice wording and needs editorial confirmation, so an override
  is that confirmation and is stored with its reason next to the id. Nothing
  else about a notice can be edited on the way to the map.
- **Signals are projected on the server too.** `geometry.ts` now also ships a
  `projector` — the fitted Mercator reduced to a scale and a translate — and
  `lib/map/project.ts` turns a lon/lat into the same viewBox units the district
  paths use. The client still never sees d3-geo.
- **One record per sector, not twenty-five of one.** The first published set
  was 25 land-acquisition notices from a single district, projecting into a
  patch a few viewBox units across on a 1084-unit map — an illegible clot that
  said "something is happening in Vidarbha" and nothing else. The fix was not a
  smaller number but a wider one. `src/data/published-signals.json` now names
  the live records across both pilot districts, one per sector, each row
  carrying the reason it was chosen and — where the scraper's keyword rule got
  the sector wrong — the correction and why. `lib/signals/curate.ts` no longer
  does the choosing: it gates only on what makes a *pin* wrong (a link to the
  original notice, an unexpired window), scores on evidence quality (a
  plain-Marathi card, a point matched to a named village, no review flag), and
  takes the best record of each sector before widening across talukas. The
  brand plate counts what is pinned and says how many were published, so the
  pins never imply the pilot holds only that many notices.
- **A pin is one size on every screen.** The marker counter-scales against the
  camera *and* against the map's current fit, so a pin is ~15 CSS px whether it
  is on a desktop or a phone, and stays that size at 16×.
- **Only heads move; anchors never do.** A pin is an anchor (a claim about a
  coordinate) and a head (a label). When two records sit closer than two heads
  can be drawn, `lib/map/spread.ts` fans the heads around the shared anchor and
  draws each stem along the resulting angle.
- **Records too close to fan get a counter, not a pin.** `lib/map/cluster.ts`
  folds anchors within 26 **on-screen pixels** of each other into one badge
  carrying the count in Devanagari, with a row of status squares under it so
  "four notices, one of them complete" is readable without opening anything. A
  counter describes the *current view*, never the data: zoom in and the ground
  spreads while the badge holds its size, so groups split on their own the
  moment there is room for real pins. Clicking one opens it in place — the
  members fan out around the point they share and the camera does not move,
  same rule as opening a record. This is why head placement moved to the
  browser: at 1× the four Amravati notices sharing two taluka centroids are two
  badges, and at 8× they are four pins in two towns. Both are the same records.
  The gap was 40 while every record came from one taluka; at that distance the
  whole of Pune folded into a single badge, so it now sits just under the
  rosette's own minimum — anything left unmerged is something `spread.ts` can
  still fan apart.
- **The panel opens with a stage meter.** Five round nodes on one rail, the
  reached ones filled in their own status inks, each with a hairline ring so a
  pale ink still holds an edge on the pale ground. It claims no *dates*: the district
  publishes notices, not schedules, and a meter implying "completion: March"
  would be inventing the most consequential fact on the panel.
- **The counter-scale is a `transform` attribute, not a CSS property.** Attribute
  transforms pivot on the element's own origin. The CSS property pivots on
  `transform-origin`, which motion overwrites with the view-box centre — which
  threw the pin thousands of pixels off the map at zoom.
- **The panel is honest about what is derived.** The district never labelled
  this notice "infrastructure, sanctioned"; a keyword rule did. `How this record
  was built` says which fields are the source's words and which are ours, states
  that the coordinates are inferred rather than published, and links the
  original notice in both languages. Brief §3 rules out passing derived data off
  as official.
- **The language toggle switches the record, not the interface.** `/en/` and `/`
  on the district portal are separate posts, so English and Marathi are two
  sources; `lib/signals/format.ts` owns the fallback when only one exists.

Still to come, from brief §12 steps 4–5: filters and URL filter state. Those
should reuse the primitives in `ui/`.
