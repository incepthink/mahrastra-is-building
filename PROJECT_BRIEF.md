# Maharashtra Is Building — Project Brief

## 1. Project overview

**Maharashtra Is Building / महाराष्ट्र घडत आहे** is a bilingual, map-led public information experience that presents clear, verifiable stories of development across Maharashtra.

The long-term product will help people understand:

- What changed or moved forward
- Where it happened
- Which sector and implementing agency are involved
- Whether the work is announced, in progress, completed, or operational
- What evidence supports the update

The visual and interaction reference is [India Is Building](https://www.indiaisbuilding.live/), but this product will have its own Maharashtra-focused design system and information structure.

## 2. POC objective

The first version is a focused proof of concept, not a statewide production platform.

The POC will include:

- One interactive map of Maharashtra
- District boundaries across the state
- Development records for only one selected pilot district, taluka, city, or other approved area
- Manually curated and locally stored project data
- Category, status, date, and location filters
- Map markers and marker clustering where appropriate
- A structured detail panel for each development record
- Responsive desktop, tablet, and mobile layouts
- English and Marathi-ready content fields
- A strong, original visual identity inspired by the quality of the reference site

## 3. Current non-goals

The POC will not initially include:

- Integration with Maharashtra government websites, databases, dashboards, or APIs
- Automated data feeds
- A production content-management workflow
- Public submissions
- Beneficiary-level or personally identifiable information
- Routing, directions, Street View, or Places search
- A statewide dataset covering every district
- Claims that open-source map boundaries are official government boundaries

## 4. Map strategy

### Map engine

**Superseded for the state view.** The Maharashtra district map is rendered as
projected SVG (d3-geo on the server, plain path strings on the client) because
the view has no basemap and needs per-district hover transforms that a tile
renderer cannot produce. See `DESIGN_SYSTEM.md` § "The map".

**MapLibre GL JS** remains the intended engine for the signal layer — markers,
clustering, popups and any view that does need an OpenStreetMap basemap.

### Basemap

The POC will use an OpenStreetMap-derived vector basemap, initially through **OpenFreeMap**. This avoids a Google Maps API key and billing while allowing a highly customized dark visual style.

The basemap provider must remain configurable so it can be replaced without rewriting the map components.

### Administrative boundaries

Maharashtra and district boundary files will be downloaded once, optimized, and stored locally in the repository as GeoJSON or TopoJSON.

For the POC, an openly licensed source such as **geoBoundaries** may be used. These boundaries must be clearly treated as indicative POC data and verified or replaced with an authoritative source before an official public launch.

### Attribution

All required OpenStreetMap, map-tile provider, and boundary-data attribution must remain visible and must not be hidden by the interface.

## 5. Content model

Each development record, or **signal**, should follow a consistent schema:

```ts
type SignalStatus =
  | "announced"
  | "sanctioned"
  | "in-progress"
  | "completed"
  | "operational";

type Signal = {
  id: string;
  slug: string;
  title: string;
  titleMr?: string;
  summary: string;
  summaryMr?: string;
  category: string;
  status: SignalStatus;
  publishedAt: string;
  milestoneDate?: string;
  district: string;
  taluka?: string;
  locality?: string;
  coordinates: [longitude: number, latitude: number];
  implementingAgency: string;
  outcome?: string;
  evidenceLabel?: string;
  evidenceUrl?: string;
  imageUrl?: string;
  featured?: boolean;
};
```

For the POC, records will be stored in a local typed data file and validated with Zod. No external data API is required.

## 6. Initial filters

The public interface should support:

- Category
- Project status
- Time period
- District
- Taluka or local area, when available
- Implementing agency
- Keyword search

Filter state should be reflected in URL search parameters when practical so a filtered map can be shared or revisited.

## 7. Information architecture

### Primary map screen

- Maharashtra map as the dominant product surface
- Brand and short public proposition
- Sector and status filters
- Time-period selector
- Signal markers and clusters
- Visible signal count
- Map zoom and reset controls
- Selected-signal detail panel

### Signal detail panel

- Development title and concise summary
- Location
- Category
- Status
- Milestone or publication date
- Implementing agency
- Public outcome
- Evidence link, when available
- Supporting image, when available

### Future editorial dashboard

The dashboard is intentionally deferred. A later version may add:

- Administrator authentication
- Create and edit forms
- Image and evidence uploads
- Draft, review, approve, publish, and archive states
- Validation and correction history
- Contributor and reviewer roles

Supabase is the preferred future backend for PostgreSQL, authentication, storage, and row-level access policies. PostGIS should be added only if the product eventually requires database-level spatial queries.

## 8. Design direction

The experience should feel credible, contemporary, and distinctly Maharashtrian without relying on generic government-dashboard styling.

Desired qualities:

- Map-first composition
- ~~Dark, cinematic background with restrained warm highlights~~ **Superseded:**
  the approved palette is light — warm cream ground, harbour blue accent. See
  `DESIGN_SYSTEM.md` § "Dark mode" for why the ground was inverted and where
  the cinematic quality now comes from.
- Clear information hierarchy
- High-contrast, accessible text
- Subtle glow and motion used to indicate activity
- Compact editorial cards rather than dense statistical dashboards
- Carefully designed desktop and mobile states
- English and Marathi typography that feels like one coherent identity

The final design must not be a direct visual copy of India Is Building.

## 9. Installed technical foundation

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- MapLibre GL JS
- D3 Geo
- TopoJSON Client
- Motion for React
- Zod
- Base UI primitives
- Lucide icons
- Class Variance Authority
- `clsx` and `tailwind-merge`
- `date-fns`

The project uses **pnpm** as its package manager.

## 10. Suggested source structure

```text
src/
  app/
  components/
    map/
    filters/
    signals/
    ui/
  data/
    signals.ts
    categories.ts
  lib/
    map/
    validation/
    utils/
  types/
public/
  data/
    boundaries/
  images/
```

## 11. Quality requirements

- Responsive from small mobile screens to large desktop displays
- Keyboard-accessible controls and panels
- Visible focus states
- Reduced-motion support
- Sufficient colour contrast
- Touch-friendly map and filter interactions
- No personal or sensitive location data
- Fast initial loading through optimized boundary geometry and lazy-loaded map code
- Clear data-source and map attribution
- Type checking, linting, and production build must pass before delivery

## 12. Recommended implementation sequence

1. Select the pilot location and assemble representative development records.
2. Acquire and optimize Maharashtra and district boundary files.
3. Establish the visual system and responsive map shell.
4. Render the Maharashtra boundary, districts, and pilot-area signals.
5. Add filters, counts, selection, clusters, and the signal detail panel.
6. Add bilingual content handling and accessibility refinements.
7. Validate the POC on desktop and mobile.
8. Only after the POC is approved, design the editorial dashboard and persistent backend.

## 13. Local development

```bash
pnpm dev
pnpm build
pnpm lint
```

The homepage is the interactive Maharashtra district map: all 36 districts with
their own boundaries, hover highlighting, click-to-frame, pan and zoom. No
signal data, government integration, dashboard, or production content has been
added yet.
