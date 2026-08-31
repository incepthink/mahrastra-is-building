"use client";

import { MotionConfig, useMotionValue } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChoroplethLayer } from "./choropleth-layer";
import { DgiprLayer } from "./dgipr-layer";
import { MapCanvas } from "./map-canvas";
import { PinLayer } from "./pin-layer";
import { MapControls } from "./map-controls";
import { NewsPlate } from "./news-plate";
import { NewsReadout } from "./news-readout";
import { StatewideBadge } from "./statewide-badge";
import { useMapCamera } from "./use-map-camera";
import { DgiprPanel } from "@/components/news/dgipr-panel";
import { NewsPanel, type PanelSubject } from "@/components/news/news-panel";
import { StoryPanel } from "@/components/news/story-panel";
import { articleCountMr, NEWS_MR } from "@/lib/news/marathi";
import { useNow } from "@/lib/news/use-now";
import type { DgiprMap, DgiprRelease } from "@/types/dgipr";
import type { DistrictShape, MapGeometry } from "@/types/map";
import type {
  DistrictNews,
  MapMode,
  NewsArticle,
  NewsMap,
  NewsStories,
  Story,
  WindowId,
} from "@/types/news";

/** Half the readout's widest state, used to keep it inside the frame. */
const PLATE_REACH = 168;
/** Above this the plate would run off the top, so it flips under the pointer. */
const PLATE_HEIGHT = 210;

/**
 * What the map has open, which is one of four things and never two.
 *
 * A district, a story and a government release are different subjects for the
 * same dock on the right of the frame, so they share one piece of state rather
 * than three that have to be kept from being set at once.
 */
type Opened =
  | PanelSubject
  | { kind: "story"; storyId: string }
  | { kind: "dgipr"; releaseId: string };

type NewsMapProps = {
  geometry: MapGeometry;
  map: NewsMap;
  /** The story layer, or null when `.data/stories.db` has not been built. */
  stories: NewsStories | null;
  /** The DGIPR overlay — a separate store, switched on over either mode. */
  dgipr: DgiprMap;
  bands: Array<{ level: number; min: number; max: number }>;
  /** What the reader asked for; the server may have widened it. */
  window: WindowId;
  onWindow: (id: WindowId) => void;
  /** True while the server is fetching a different window. */
  pending: boolean;
};

/**
 * Owns what the map is doing — what is under the pointer, which district is
 * open, where the camera is looking. `MapCanvas` owns what it looks like.
 *
 * The shape of this file is inherited from the map it replaces and the
 * inheritance is deliberate: the camera, the readout that trails the pointer,
 * the frame that takes Escape, the controls in the corner. What changed is
 * everything between the geometry and the reader — there are no pins, no
 * clusters, no sector filters and no per-record panel, because the corpus
 * underneath is 665 newspaper articles keyed by district rather than nine
 * curated notices keyed by coordinate.
 *
 * The result is a simpler machine. Pins had to be laid out per zoom bracket,
 * fanned out of each other's way and folded into counters; a choropleth is
 * painted once and is correct at every zoom, so `RELAYOUT_STEP`, `buildMarkers`
 * and the whole clustering pass are gone rather than ported.
 */
export function NewsMap({
  geometry,
  map,
  stories,
  dgipr,
  bands,
  window: requested,
  onWindow,
  pending,
}: NewsMapProps) {
  const { svgRef, camera, isPanning, hasDragged, zoomBy, reset, surfaceProps } =
    useMapCamera(geometry.size);

  const frameRef = useRef<HTMLDivElement>(null);
  const frameBox = useRef<DOMRect | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const [plateBelow, setPlateBelow] = useState(false);
  const [open, setOpen] = useState<Opened | null>(null);
  /**
   * Which of the two maps is on the sheet.
   *
   * Client state and not a URL round trip. The argument in `NewsMapShell` is
   * that the window is a server concern because it decides which rows exist,
   * and the corpus behind it is far too large to ship whole; mode decides
   * nothing of the kind. Both layers were read in the same pass and are both
   * already in memory, so putting this in the URL would mean a fetch, a
   * transition and a spinner in order to draw something the browser is
   * already holding.
   */
  const [mode, setMode] = useState<MapMode>("heat");
  /**
   * Whether the government layer is on the sheet.
   *
   * A filter and not a mode, which is the whole shape of this feature. `mode`
   * is a choice between two readings of one corpus — how much news came out of
   * a district, or which running stories are where — and the two are mutually
   * exclusive because they are the same sheet coloured two ways. DGIPR is a
   * different *source*, so it is a switch rather than a choice: it goes over
   * the choropleth and over the pins alike, and turning it off leaves whatever
   * was underneath exactly as it was.
   *
   * Off by default. The map's front door is the press — that is what the
   * product is — and an overlay the reader did not ask for would put marks on
   * the sheet before they have been told what the marks mean.
   */
  const [official, setOfficial] = useState(false);
  /** Null while the server renders, then the live minute. See `useNow`. */
  const now = useNow();

  const levels = useMemo(
    () =>
      Object.fromEntries(
        Object.values(map.districts).map((district) => [
          district.districtId,
          district.level,
        ]),
      ),
    [map],
  );

  /**
   * What each shape is called, for anyone reading the map without seeing it.
   *
   * The fill is the data now, so a `<title>` carrying only the district's name
   * would hand a screen reader thirty-six place names and none of the numbers
   * they are painted with. Every district gets a label, including the ones
   * with nothing in the window — "no news" is an answer, and a shape that says
   * nothing at all is indistinguishable from one the map forgot.
   */
  const labels = useMemo(() => {
    const named: Record<string, string> = {};

    for (const district of geometry.districts) {
      const count = map.districts[district.id]?.count ?? 0;

      named[district.id] =
        `${district.nameMr} — ${count === 0 ? NEWS_MR.noNews : articleCountMr(count)}`;
    }

    return named;
  }, [geometry.districts, map]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      frameBox.current = frame.getBoundingClientRect();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    globalThis.addEventListener("scroll", measure, true);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener("scroll", measure, true);
    };
  }, []);

  /** Motion values, not state — the plate follows the cursor without a render. */
  const trackPointer = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const box = frameBox.current;
      if (!box) return;

      const top = event.clientY - box.top;

      pointerX.set(clampToFrame(event.clientX - box.left, box.width));
      pointerY.set(top);
      // React bails out when the value is unchanged, so this is a no-op for
      // all but the two moves that actually cross the threshold.
      setPlateBelow(top < PLATE_HEIGHT);
    },
    [pointerX, pointerY],
  );

  const enter = useCallback(
    (district: DistrictShape) => {
      if (isPanning) return;
      setPointed(district.id);
    },
    [isPanning],
  );

  const leave = useCallback((district: DistrictShape) => {
    setPointed((current) => (current === district.id ? null : current));
  }, []);

  const clearSelection = useCallback(() => setOpen(null), []);

  /**
   * Switching modes closes an open story, and only a story.
   *
   * A story panel left standing over the choropleth would be describing a mark
   * that is no longer on the sheet, and there would be no way back to it. A
   * district panel survives the switch because the district survives it — both
   * maps are drawn on the same 36 shapes.
   */
  const pickMode = useCallback((next: MapMode) => {
    setMode(next);
    setOpen((current) => (current?.kind === "story" ? null : current));
  }, []);

  /**
   * Turning the government layer off closes an open release, and only that.
   *
   * The same rule the mode switch follows, for the same reason: a panel left
   * standing would be describing a mark that is no longer on the sheet, with no
   * way back to it. Turning the layer *on* opens nothing — an overlay appearing
   * with a document already open would answer a question the reader has not
   * asked yet.
   */
  const toggleOfficial = useCallback(() => {
    // Read outside the updater rather than inside it: an updater must be pure,
    // and React calls it twice in development to prove that it is.
    if (official) setOpen((current) => (current?.kind === "dgipr" ? null : current));

    setOfficial((on) => !on);
  }, [official]);

  const pickRelease = useCallback(
    (release: DgiprRelease) => {
      if (hasDragged()) return;

      setOpen((current) =>
        current?.kind === "dgipr" && current.releaseId === release.id
          ? null
          : { kind: "dgipr", releaseId: release.id },
      );
    },
    [hasDragged],
  );

  /** Switching releases from inside the panel's rail, where a drag cannot have
   *  happened and closing on a second click would be wrong. */
  const openRelease = useCallback((release: DgiprRelease) => {
    setOpen({ kind: "dgipr", releaseId: release.id });
  }, []);

  const pickStory = useCallback(
    (story: Story) => {
      if (hasDragged()) return;

      setOpen((current) =>
        current?.kind === "story" && current.storyId === story.id
          ? null
          : { kind: "story", storyId: story.id },
      );
    },
    [hasDragged],
  );

  /**
   * Click the land: open that district, or close it if it was already open.
   *
   * It fires whether or not the district has any news, and that is the point.
   * "Is anything happening near me" is the question a reader arrives with, and
   * a district that refuses to respond to a click reads as a broken map rather
   * than as an empty one. The panel answers "nothing here in this window" in
   * words, in the place the question was asked.
   *
   * A drag that ended over a district is a pan, not a click, so `hasDragged`
   * gets the first word.
   */
  const pickDistrict = useCallback(
    (district: DistrictShape) => {
      if (hasDragged()) return;

      setOpen((current) =>
        current?.kind === "district" && current.districtId === district.id
          ? null
          : { kind: "district", districtId: district.id },
      );
    },
    [hasDragged],
  );

  const toggleStatewide = useCallback(() => {
    setOpen((current) => (current?.kind === "state" ? null : { kind: "state" }));
  }, []);

  /** The three panels share the dock, so at most one of these is ever set. */
  const panelSubject: PanelSubject | null =
    open && open.kind !== "story" && open.kind !== "dgipr" ? open : null;

  const openStory: Story | null =
    open?.kind === "story"
      ? (stories?.stories.find((story) => story.id === open.storyId) ?? null)
      : null;

  /**
   * The open release, and every other release its district issued.
   *
   * The mark stands for a district's whole stack — four of the five releases in
   * the snapshot are datelined Mumbai — so the panel is handed the stack and
   * told which of it to open, rather than one release with the rest hidden
   * behind the map. An unplaced release has no stack and stands alone.
   */
  const focusedRelease: DgiprRelease | null =
    open?.kind === "dgipr"
      ? (dgipr.releases.find((release) => release.id === open.releaseId) ?? null)
      : null;

  const releaseStack: DgiprRelease[] = useMemo(() => {
    if (!focusedRelease) return [];

    return focusedRelease.districtId
      ? (dgipr.byDistrict[focusedRelease.districtId] ?? [focusedRelease])
      : [focusedRelease];
  }, [focusedRelease, dgipr]);

  /** The district panel's subject. */
  const openDistrict: DistrictNews | undefined =
    open?.kind === "district" ? map.districts[open.districtId] : undefined;

  const panelArticles: NewsArticle[] =
    open?.kind === "state"
      ? map.statewide
      : (openDistrict?.articles ?? []);

  // The true figure, not the length of the list being shown. Both sets are
  // capped on the server — see `PER_DISTRICT` and `STATEWIDE_LIMIT` — so a
  // panel reporting its own length would tell a reader there are 30 statewide
  // pieces while the badge two inches away says 56.
  const panelTotal =
    open?.kind === "state" ? map.totals.statewide : (openDistrict?.count ?? 0);

  /**
   * The district drawn as picked out — the one whose panel is open, or the one
   * an open story stands in.
   *
   * A story lights its district even at the taluka tier, where the pin is
   * making a finer claim than that. Lighting the shape is not a claim about
   * where the story happened; it answers "where am I looking", which is the
   * question a reader has after clicking a 13-pixel mark on a map of a state.
   */
  const lit = useMemo(() => {
    if (open?.kind === "district") return new Set([open.districtId]);
    if (openStory?.districtId) return new Set([openStory.districtId]);
    if (focusedRelease?.districtId) return new Set([focusedRelease.districtId]);

    return new Set<string>();
  }, [open, openStory, focusedRelease]);

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={frameRef}
        className="map-frame"
        data-panning={isPanning || undefined}
        data-pending={pending || undefined}
        data-mode={mode}
        data-official={official || undefined}
        onKeyDown={(event) => {
          // A panel's expanded reading is mounted on `<body>` through a
          // portal but is still a React child of this frame, so its
          // keystrokes bubble here through the React tree. Escape has to
          // belong to whatever is actually on top, and the camera keys must
          // not fire from a dialog covering the map — so the frame only
          // answers for keys pressed inside its own DOM.
          if (!event.currentTarget.contains(event.target as Node)) return;

          if (event.key === "Escape") clearSelection();
          if (event.key === "+" || event.key === "=") zoomBy(1.5);
          if (event.key === "-") zoomBy(1 / 1.5);
        }}
      >
        <div className="map-sheet-grid" aria-hidden />
        <div className="map-tooth" aria-hidden />

        <MapCanvas
          geometry={geometry}
          svgRef={svgRef}
          camera={camera}
          surfaceProps={surfaceProps}
          lit={lit}
          ground={
            <ChoroplethLayer districts={geometry.districts} levels={levels} />
          }
          labels={labels}
          onGroundClick={(event) => {
            // A click that landed on the sea rather than on a district.
            if (event.target !== event.currentTarget || hasDragged()) return;

            clearSelection();
          }}
          onPointerEnter={enter}
          onLeave={leave}
          onMove={trackPointer}
          onSelectDistrict={pickDistrict}
        >
          {/* The story layer, in the slot `MapCanvas` has always kept for
              marks: inside the camera, above every land layer, so a pin
              travels with the village it stands on.

              The choropleth stays underneath in pin mode rather than being
              swapped out — the counts are still true, and a sheet of bare land
              with pins on it loses the one thing that told the reader where the
              news is thick. It is dimmed instead, so the marks have the sheet's
              only strong colour to themselves. See `news-map.css`. */}
          {mode === "pins" && stories ? (
            <PinLayer
              stories={stories.stories}
              districts={geometry.districts}
              projector={geometry.projector}
              scale={camera.scale}
              selectedId={openStory?.id ?? null}
              onSelect={pickStory}
            />
          ) : null}

          {/* The government layer, over whichever of the two is showing.
              Rendered last so an official mark is never buried under a story
              pin standing on the same centroid — the overlay is the thing the
              reader switched on, and it should be the thing they can click. */}
          {official ? (
            <DgiprLayer
              byDistrict={dgipr.byDistrict}
              districts={geometry.districts}
              scale={camera.scale}
              selectedId={focusedRelease?.id ?? null}
              onSelect={pickRelease}
            />
          ) : null}
        </MapCanvas>

        <div className="map-rail">
          <NewsPlate
            map={map}
            bands={bands}
            window={requested}
            onWindow={onWindow}
            mode={mode}
            onMode={pickMode}
            stories={stories}
            dgipr={dgipr}
            official={official}
            onOfficial={toggleOfficial}
            articles={map.totals.articles}
            districts={map.totals.districts}
            now={now}
          />

          <div className="map-rail-dock">
            {map.statewide.length ? (
              <StatewideBadge
                count={map.totals.statewide}
                active={open?.kind === "state"}
                onToggle={toggleStatewide}
              />
            ) : null}
          </div>
        </div>

        <NewsReadout
          districtId={pointed}
          news={pointed ? map.districts[pointed] : undefined}
          x={pointerX}
          y={pointerY}
          below={plateBelow}
        />

        <NewsPanel
          subject={panelSubject}
          articles={panelArticles}
          total={panelTotal}
          now={now}
          onClose={clearSelection}
        />

        {/* The other subject the dock can hold: one running story, read as the
            sequence it was rather than as a list. See `StoryPanel`. */}
        <StoryPanel
          story={openStory}
          now={now}
          onClose={clearSelection}
        />

        {/* The third subject the dock can hold: one government release, read in
            full. It is the one panel in this product that prints a body — see
            `DgiprPanel` for why that is not the same decision the other two
            declined to make. */}
        <DgiprPanel
          releases={releaseStack}
          openId={focusedRelease?.id ?? null}
          onOpen={openRelease}
          onClose={clearSelection}
        />

        <MapControls
          onZoomIn={() => zoomBy(1.6)}
          onZoomOut={() => zoomBy(1 / 1.6)}
          onReset={reset}
        />

        <p className="map-attribution" lang="mr">
          {NEWS_MR.boundaryNote}
        </p>
      </div>
    </MotionConfig>
  );
}

function clampToFrame(value: number, frameWidth: number): number {
  if (frameWidth < PLATE_REACH * 2) return frameWidth / 2;

  return Math.min(frameWidth - PLATE_REACH, Math.max(PLATE_REACH, value));
}
