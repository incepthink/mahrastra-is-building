# Design system — "Survey Press"

The rules below exist so that every screen added later looks like it belongs to
the same product. Read this before adding a component.

> **State of this document.** §1, §2 and §7 describe the code as it stands.
> §3–§6 predate two palette changes and still describe the retired "Konkan
> Light" system — its `harbor`/`surf`/`shell` ramps, an `AmbientGlow`, a
> `SiteFooter` and a `ui/` primitives folder, none of which exist. Treat those
> sections as intent, not as reference, and check `src/styles/tokens.css`
> before quoting a token from them.

---

## 1. Concept

A **screen-printed civic poster**, not a dashboard.

Flat blocks of colour, hard black rules, and a solid offset shadow where
something lifts off the page. No blur, no glow, no glass, no soft elevation
ramp. If a thing looks like it is floating in space it is wrong; if it looks
like it was printed slightly out of register it is right.

The system reached this by failing twice, and both failures are worth keeping
in mind:

1. **Almost monochrome.** Cream paper on a cream ground, one green, one brass.
   Careful, coherent, and indistinguishable from a government form.
2. **Colour spread everywhere.** Every district filled with its revenue
   division's tint. That did not make the map livelier; it made it a chart of a
   fact nobody had asked about, and it fought the pins for attention.

What works is putting colour where colour belongs and nowhere else:

| Layer | Treatment |
| --- | --- |
| **The page** | Loud. Six hard diagonal bands of poster colour, corner to corner. |
| **The card** | The map sits on it: cream, 3px black rule, solid black shadow. |
| **The sheet** | One colour. The state is a single mint plate throughout — no district tints, no hatch, no per-region fill. |
| **The marks** | Saturated. Five status inks and ten sector plates. Nothing else on the sheet may be coloured. |

---

## 2. Colour

Tokens live in `src/styles/tokens.css` in two tiers. **Tier 1 — primitives**
(`--color-mint-*`, `--color-cream-*`) are the raw ramps; never reference them in
a component. **Tier 2 — semantics** (`--color-canvas`, `--color-accent`) are
what JSX and the stylesheets use.

The poster set — six hues, each with a light **plate** for filling an area and a
deep **ink** for anything that has to sit under a black hairline and hold 13px
type:

| Hue | Plate | Ink | Carries |
| --- | --- | --- | --- |
| Mint | `#a9e2a4` | `#14713f` | the land; the "research" sector |
| Peach | `#fbd9a5` | `#e0a54b` | bands; "manufacturing" |
| Sun | `#ffe44d` | `#f5cf16` | the accent block; "sanctioned"; "energy" |
| Coral | `#fca79a` | `#e2542e` | "in progress"; a deadline about to close |
| Lavender | `#c5b3f0` | `#6b4fd0` | "infrastructure" |
| Blossom | `#f2a3ea` | `#b93aa8` | "public systems" |

Plus two cool inks with no plate, because they only ever appear as marks:
indigo `#3e4bd1` ("announced", and the focus ring) and teal `#0e7c86`
("operational"). Deccan green `#1d4a3c` survives from the old palette as the
wordmark's colour and the "completed" ink.

**Plates are areas; inks are marks. Never the other way round.** An ink used as
a large fill turns the page into a billboard; a plate used as text fails
contrast at every size.

### The colour rules

> **1. Status carries colour by meaning. Nothing else on the sheet does.**

Five statuses, five inks, in the order work moves through them — the ramp warms
as money arrives and cools again once the thing exists:

| Status | Ink | Reads as |
| --- | --- | --- |
| `announced` | indigo | declared, no money yet |
| `sanctioned` | sun | funded |
| `in-progress` | coral | active — the hottest thing on the map |
| `completed` | deccan | built |
| `operational` | teal | built *and* running |

Mapping lives in `src/lib/design/status.ts`. Recolour a status there and the
pins, the legend, the panel edge and the stage meter all follow. `LIGHT_TONES`
in the same file lists the inks pale enough to need dark glyphs rather than
white ones.

> **2. Sector colour is a plate, and only ever a small one.**

Categories used to be deliberately colourless. That held while a category was
just an icon inside a status-coloured disc; it stopped holding once the map
became a handful of curated pins a reader has to tell apart at a glance. So a
sector gets a pastel **collar** behind the pin head and the **header block** of
the record panel — areas — while status keeps the ink inside them. The two
cannot be confused because they are used at different saturations and in
different places.

> **3. The state is one colour.**

No division tints, no hatch, no per-district fill. `#map-land-fill` is the only
gradient on the map and it is one hue, two shades. Districts are the lines
between, not 36 shapes to be coloured in.

### Depth

One device: a **solid offset shadow in ink**, no blur — `--shadow-plate-sm`,
`--shadow-plate`, `--shadow-plate-lg`. There is no elevation scale and no
ambient light. Registration offset is for **rectangles only**: the map tried it
with a second copy of the silhouette and it read as a green fringe welded to the
Konkan rather than as a second plate.

### Dark mode

Deliberately **not supported.** `color-scheme: light` is set explicitly so form
controls follow. This reverses the brief's §8 "dark, cinematic" direction — the
energy now comes from the poster bands and the saturated inks, not from a dark
ground.

---

## 3. Typography

One superfamily, two scripts: **Anek** by Ek Type. `Anek Latin` and
`Anek Devanagari` share skeleton, proportion and weight axis, so English and
Marathi read as one identity rather than two bolted-together faces — which is the
brief's §8 requirement, solved at the type level rather than with CSS tweaks.
`JetBrains Mono` carries counts, dates and coordinates.

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
- **The state is one plate.** Districts have no fill at all — a transparent one
  for hit-testing, and a hairline. Two things were tried here and removed:
  per-division tints (a chart of a fact nobody had asked about, competing with
  the pins) and an engraver's hatch over districts holding records (a dark blob
  at exactly the spot the pins need to be legible, and a legend with one entry).
- **The land does not offer a cursor.** `.map-surface` is `cursor: default`, not
  `grab`. The camera still pans on drag, but a hand under the pointer across the
  whole screen made the page look like something you were meant to be dragging.
  Pins are the only things that claim to be clickable and the only things that
  change the cursor.
- **The sheet, not the viewport.** `.map-page` carries the poster bands and
  `.map-frame` is a cream rectangle inset on top of them, so the bands read as a
  colour margin framing the sheet rather than as a background behind a map. The
  sheet carries no rule and no plate of its own: it used to be a card with a 3px
  black border and a 10px ink shadow, which at full-bleed size was a frame
  around a frame and took width from the state for nothing.

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
- **The panel opens with a stage meter.** Five nodes on one rail, the reached
  ones filled in their own status inks. It claims no *dates*: the district
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
