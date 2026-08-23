"use client";

import { MotionConfig, useMotionValue, useMotionValueEvent } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandPlate } from "./brand-plate";
import { ClusterReadout } from "./cluster-readout";
import { DistrictReadout } from "./district-readout";
import { LeadPlate } from "./lead-plate";
import { MapCanvas } from "./map-canvas";
import { MapControls } from "./map-controls";
import { SignalLayer } from "./signal-layer";
import { SignalReadout } from "./signal-readout";
import { StatewideBadge } from "./statewide-badge";
import { useMapCamera } from "./use-map-camera";
import { SignalPanel } from "@/components/signals";
import { districtIdOf } from "@/data/districts";
import { buildMarkers, clusterMembers } from "@/lib/map/cluster";
import {
  NO_FILTERS,
  matchesFilters,
  toggle,
  type SignalFilters,
} from "@/lib/signals/filter";
import { MR } from "@/lib/signals/marathi";
import type { DistrictShape, MapGeometry } from "@/types/map";
import type {
  MapScope,
  PlacedSignal,
  Signal,
  SignalCategoryId,
  SignalPulse,
  SignalStatus,
  StatewideSignal,
} from "@/types/signal";

/** Half the name plate's widest state, used to keep it inside the frame. */
const PLATE_REACH = 152;
/** Above this the plate would run off the top, so it flips under the pointer. */
const PLATE_HEIGHT = 210;
/** How far the pin may be enlarged on small screens before it dominates. */
const MAX_PIN_UNIT = 3;
/**
 * How much the zoom has to move before the markers are laid out again, as a
 * fraction of an octave. Clustering only changes at thresholds, so re-running
 * it on every animation frame would be a re-render per frame to produce the
 * same answer; a twelfth of a doubling is finer than any threshold the reader
 * can see crossing.
 */
const RELAYOUT_STEP = 1 / 12;

type MaharashtraMapProps = {
  geometry: MapGeometry;
  /** The curated set — the district records, already projected. */
  signals: PlacedSignal<Signal>[];
  /** How many records are published in total, pinned or not. The plate says so
   *  rather than letting seven pins imply the pilot holds seven notices. */
  published: number;
  /** How much has landed recently, for the line above the tally. Null when the
   *  pipeline has seen nothing lately and there is no honest number to give. */
  pulse: SignalPulse | null;
  /** The records that apply to the whole state — policies and schemes, each on
   *  a point chosen by hand rather than found. They take the sheet over from
   *  the district pins, never share it with them. */
  statewide: PlacedSignal<StatewideSignal>[];
};

/**
 * Owns what the map is doing — what is under the pointer, which record is
 * open, where the camera is looking. `MapCanvas` owns what it looks like.
 *
 * The camera is now driven by the reader alone. Opening a record used to fly
 * the view to the pin and closing it flew back, which meant every click
 * re-framed the whole state and you lost your place; the panel opens beside
 * whatever you were already looking at instead. Zoom is the wheel, the pinch
 * and the two buttons, and nothing else moves the map.
 */
export function MaharashtraMap({
  geometry,
  signals,
  published,
  pulse,
  statewide,
}: MaharashtraMapProps) {
  const { svgRef, camera, isPanning, hasDragged, zoomBy, reset, surfaceProps } =
    useMapCamera(geometry.size);

  const frameRef = useRef<HTMLDivElement>(null);
  const frameBox = useRef<DOMRect | null>(null);
  const [pointed, setPointed] = useState<DistrictShape | null>(null);
  const [pointedSignal, setPointedSignal] = useState<PlacedSignal | null>(null);
  const [plateBelow, setPlateBelow] = useState(false);
  const [pinUnit, setPinUnit] = useState(1);
  const [openSignal, setOpenSignal] = useState<PlacedSignal | null>(null);
  const [pointedCluster, setPointedCluster] = useState<PlacedSignal[] | null>(null);
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  /** The district the reader clicked, records or none. See `pickDistrict`. */
  const [pickedDistrict, setPickedDistrict] = useState<string | null>(null);
  /**
   * Which question the map is answering. See `MapScope`.
   *
   * A mode rather than a filter: in `state` the pins are not dimmed or
   * reordered, they are gone, because the three records on screen are not in
   * any of those places - they are in all of them. The camera is left exactly
   * where the reader had it, so coming back returns to the same view rather
   * than to a reset one.
   */
  const [scope, setScope] = useState<MapScope>("district");
  /**
   * What the reader has narrowed the sheet to — sectors, stages, or neither.
   *
   * A filter, unlike `scope`, does not change which corpus the map is about:
   * it takes pins off the sheet the reader asked not to see. It survives the
   * switch between the two views on purpose — "show me water work" is a
   * standing instruction about the kind of record, and the statewide set has
   * sectors and stages like any other.
   */
  const [filters, setFilters] = useState<SignalFilters>(NO_FILTERS);
  // Starts at the camera's rest zoom so the first client render reproduces the
  // server's markers exactly. See `buildMarkers`.
  const [zoom, setZoom] = useState(1);
  const laidOutAt = useRef(1);

  // A zoom that crosses a bracket is a different view, and a cluster opened in
  // the old one is describing a group that may no longer exist. Let it close.
  useMotionValueEvent(camera.scale, "change", (value) => {
    if (Math.abs(Math.log2(value / laidOutAt.current)) < RELAYOUT_STEP) return;

    laidOutAt.current = value;
    setZoom(value);
    setOpenCluster(null);
  });

  /** The two sets with the narrowing applied. Everything downstream — the
   *  markers, the legend's tally, the statewide stepper — works off these, so
   *  a filtered-out record is gone rather than hidden. */
  const visible = useMemo(
    () => signals.filter(({ signal }) => matchesFilters(signal, filters)),
    [filters, signals],
  );

  const visibleStatewide = useMemo(
    () => statewide.filter(({ signal }) => matchesFilters(signal, filters)),
    [filters, statewide],
  );

  /** Everything the current view could show before narrowing — what the filter
   *  chips count from. See `MapFilters`. */
  const pool = useMemo(
    () => (scope === "state" ? statewide : signals).map((placed) => placed.signal),
    [scope, signals, statewide],
  );

  /**
   * Whichever set the map is currently about, laid out as markers.
   *
   * The same builder for both, which is the point: a statewide record is drawn
   * as the pin a district record gets, clusters the way one does, and opens the
   * same panel. What changes between the two views is not how a record is drawn
   * but which set is on the sheet — the district pins are gone in the statewide
   * view, not dimmed, because the three policies on screen are not in any of
   * those places, they are in all of them.
   */
  const markers = useMemo(
    () =>
      buildMarkers(
        scope === "state" ? visibleStatewide : visible,
        zoom / pinUnit,
        openCluster,
      ),
    [openCluster, pinUnit, scope, visible, visibleStatewide, zoom],
  );

  /** Where in the statewide set the open record sits, or -1 when the panel is
   *  closed or showing a district record. Feeds the panel's stepper. */
  const stateIndex = useMemo(
    () =>
      scope === "state" && openSignal
        ? visibleStatewide.findIndex((placed) => placed.signal.id === openSignal.signal.id)
        : -1,
    [openSignal, scope, visibleStatewide],
  );

  /**
   * The districts the reader's current selection stands in.
   *
   * Opening a record used to leave the state looking exactly as it did — the
   * panel named a place and the map said nothing about where that was, so a
   * reader who did not already know their districts had to hunt for the pin
   * they had just clicked. Lighting the border answers "where is this" in the
   * one place the question is asked. A counter lights every district its
   * members cover, because a group straddling a boundary is a fact about the
   * group.
   *
   * A directly clicked district joins them, and it joins them whether or not
   * it holds a single record. That is the whole point: "is anything happening
   * near me" is the question a reader arrives with, and a district that
   * refuses to respond to a click reads as a broken map rather than as an
   * empty one. The highlight is the answer "nothing here yet" — said clearly,
   * in the place the question was asked.
   */
  const lit = useMemo(() => {
    // Nothing is picked out while the state is the subject: lighting one
    // district would say a policy happens there rather than everywhere. The
    // sheet answers as a whole - see `[data-scope="state"]` in `map.css`.
    if (scope === "state") return new Set<string>();

    const chosen = new Set([
      ...(openSignal ? [openSignal.signal.id] : []),
      ...clusterMembers(openCluster),
    ]);

    const districts = visible
      .filter(({ signal }) => chosen.has(signal.id))
      .map(({ signal }) => districtIdOf(signal.district));

    return new Set(pickedDistrict ? [...districts, pickedDistrict] : districts);
  }, [openCluster, openSignal, pickedDistrict, scope, visible]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const box = frame.getBoundingClientRect();
      frameBox.current = box;

      // `preserveAspectRatio="xMidYMid meet"` fits the viewBox by its tighter
      // axis. Pins counter-scale by the result, so a pin is the same number of
      // CSS pixels on a phone as on a desktop instead of shrinking with the
      // map — which is what keeps it a real touch target.
      const perPixel = Math.min(
        geometry.size[0] / Math.max(box.width, 1),
        geometry.size[1] / Math.max(box.height, 1),
      );

      setPinUnit(Math.min(MAX_PIN_UNIT, Math.max(1, perPixel)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    window.addEventListener("scroll", measure, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
    };
  }, [geometry.size]);

  /** Motion values, not state — the plate follows the cursor without re-rendering. */
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
      setPointed(district);
    },
    [isPanning],
  );

  const leave = useCallback((district: DistrictShape) => {
    setPointed((current) => (current?.id === district.id ? null : current));
  }, []);

  const closeSignal = useCallback(() => setOpenSignal(null), []);

  /**
   * Everything the reader can currently have picked out, let go at once -
   * including the statewide view, which is a selection like any other. Escape
   * and a click on empty ground are the two gestures that mean "never mind",
   * and one of them leaving the map in a mode the reader was trying to leave
   * is how a map starts feeling stuck.
   */
  const clearSelection = useCallback(() => {
    setOpenSignal(null);
    setOpenCluster(null);
    setPickedDistrict(null);
    setScope("district");
  }, []);

  /**
   * Narrowing the sheet, on either axis.
   *
   * Both let go of whatever was open first. A record the reader has just
   * filtered away cannot stay in the panel describing a pin that is no longer
   * on the map, and a counter's id names a group that the next layout pass is
   * about to rebuild from a different set of records.
   */
  const toggleSector = useCallback((id: SignalCategoryId) => {
    setOpenSignal(null);
    setOpenCluster(null);
    setFilters((current) => ({ ...current, sectors: toggle(current.sectors, id) }));
  }, []);

  const toggleStatus = useCallback((status: SignalStatus) => {
    setOpenSignal(null);
    setOpenCluster(null);
    setFilters((current) => ({ ...current, statuses: toggle(current.statuses, status) }));
  }, []);

  /** Back to the whole sheet. Both axes at once: two resets for two axes is
   *  two clicks to undo one decision the reader thinks of as "narrowed". */
  const clearFilters = useCallback(() => {
    setOpenSignal(null);
    setOpenCluster(null);
    setFilters(NO_FILTERS);
  }, []);

  /** Into the statewide view and back out. Either direction lets go of whatever
   *  was open: the record the reader had is not in the set they are about to be
   *  shown, and a panel that survives the switch describes the view they left. */
  const toggleScope = useCallback(() => {
    setOpenSignal(null);
    setOpenCluster(null);
    setPickedDistrict(null);
    setScope((current) => (current === "state" ? "district" : "state"));
  }, []);

  /**
   * Steps the statewide panel, wrapping at both ends so neither arrow is ever a
   * dead button.
   *
   * The pins are the navigation now, and on a wide screen the stepper is only a
   * convenience. On a phone it is the navigation: the panel is a sheet over the
   * whole map, so the other two pins are underneath it and there is nothing to
   * click between.
   */
  const stepStatewide = useCallback(
    (by: number) => {
      const total = visibleStatewide.length;
      if (!total) return;

      setOpenSignal(visibleStatewide[(Math.max(stateIndex, 0) + by + total) % total]);
    },
    [stateIndex, visibleStatewide],
  );

  /**
   * Click the land: pick that district out, or let it go if it was already
   * the one picked.
   *
   * It closes an open record on the way, because the two are answers to the
   * same question — "where am I looking" — and two districts lit at once for
   * two different reasons is a map arguing with itself. A drag that ended over
   * a district is a pan, not a click, so `hasDragged` gets the first word.
   */
  const pickDistrict = useCallback(
    (district: DistrictShape) => {
      if (hasDragged()) return;

      setOpenSignal(null);
      setOpenCluster(null);
      setScope("district");
      setPickedDistrict((current) => (current === district.id ? null : district.id));
    },
    [hasDragged],
  );

  /** Fold an open cluster back into its badge, or open the one just clicked. */
  const toggleCluster = useCallback(
    (id: string) => {
      if (hasDragged()) return;

      setPointedCluster(null);
      setPickedDistrict(null);
      setOpenCluster((current) => (current === id ? null : id));
    },
    [hasDragged],
  );

  const enterCluster = useCallback(
    (members: PlacedSignal[], event: React.PointerEvent<SVGGElement>) => {
      if (isPanning) return;
      trackPointer(event);
      setPointedCluster(members);
    },
    [isPanning, trackPointer],
  );

  const leaveCluster = useCallback(() => setPointedCluster(null), []);

  const enterSignal = useCallback(
    (placed: PlacedSignal, event: React.PointerEvent<SVGGElement>) => {
      if (isPanning) return;
      trackPointer(event);
      setPointedSignal(placed);
    },
    [isPanning, trackPointer],
  );

  const leaveSignal = useCallback((placed: PlacedSignal) => {
    setPointedSignal((current) =>
      current?.signal.id === placed.signal.id ? null : current,
    );
  }, []);

  /** Open the record where it is. The camera does not move. */
  const selectSignal = useCallback(
    (placed: PlacedSignal) => {
      if (hasDragged()) return;

      // The record lights its own district; a district picked out by hand
      // before this would leave two lit for two different reasons.
      setPickedDistrict(null);
      setOpenSignal((current) =>
        current?.signal.id === placed.signal.id ? null : placed,
      );
    },
    [hasDragged],
  );

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={frameRef}
        className="map-frame"
        data-panning={isPanning || undefined}
        data-scope={scope}
        onKeyDown={(event) => {
          if (event.key === "Escape") clearSelection();
          if (event.key === "+" || event.key === "=") zoomBy(1.5);
          if (event.key === "-") zoomBy(1 / 1.5);
        }}
      >
        {/* The page the map is printed on: one cool gradient carried by
            `.map-frame` itself, a faint drafting grid over it, and the tooth of
            the paper. The two blurred washes that used to drift here are gone —
            a blur is a screen effect, and this sheet is printed. */}
        <div className="map-sheet-grid" aria-hidden />
        <div className="map-tooth" aria-hidden />

        <MapCanvas
          geometry={geometry}
          svgRef={svgRef}
          camera={camera}
          surfaceProps={surfaceProps}
          lit={lit}
          onGroundClick={(event) => {
            // A click that lands on the ground rather than on a pin.
            if (event.target !== event.currentTarget || hasDragged()) return;

            clearSelection();
          }}
          onPointerEnter={enter}
          onLeave={leave}
          onMove={trackPointer}
          onSelectDistrict={pickDistrict}
        >
          <SignalLayer
            markers={markers}
            scale={camera.scale}
            selectedId={openSignal?.signal.id ?? null}
            unit={pinUnit}
            onSelect={selectSignal}
            onOpenCluster={toggleCluster}
            onEnter={enterSignal}
            onLeave={leaveSignal}
            onEnterCluster={enterCluster}
            onLeaveCluster={leaveCluster}
            onMove={trackPointer}
          />
        </MapCanvas>

        {/* The legend, and under it — deliberately outside it — the one thing
            on this screen that asks the reader for something. Stacked in a rail
            rather than positioned apart because the legend's height is the
            data's: sectors with nothing in them are not drawn. */}
        <div className="map-rail">
          <BrandPlate
            signals={visible}
            statewide={visibleStatewide}
            pool={pool}
            scope={scope}
            published={published}
            pulse={pulse}
            filters={filters}
            onToggleSector={toggleSector}
            onToggleStatus={toggleStatus}
            onClearFilters={clearFilters}
          />

          {/* The invitation and the way into the statewide view, docked
              together. On a desktop they sit under the legend as the bottom of
              one column; on a phone the rail splits and this pair is what
              lands on the bottom edge, side by side, where a thumb is. The
              badge used to be pinned to the frame's own bottom-left corner and
              had no relationship to anything — it now reads as the third card
              of the stack it was always a sibling of. */}
          <div className="map-rail-dock">
            <LeadPlate />

            {statewide.length ? (
              <StatewideBadge
                count={visibleStatewide.length}
                active={scope === "state"}
                onToggle={toggleScope}
              />
            ) : null}
          </div>
        </div>

        {/* One plate at a time: whatever is on top of the ground under the
            pointer outranks the district it happens to be standing on. */}
        <DistrictReadout
          district={pointedSignal || pointedCluster ? null : pointed}
          x={pointerX}
          y={pointerY}
          below={plateBelow}
        />
        <SignalReadout
          signal={pointedSignal?.signal ?? null}
          x={pointerX}
          y={pointerY}
          below={plateBelow}
        />
        <ClusterReadout
          members={pointedCluster}
          x={pointerX}
          y={pointerY}
          below={plateBelow}
        />

        {/* One panel for whichever pin was clicked, in either view. The two
            sets are never on the sheet together, so there is only ever one
            record open and never a question of which panel this is.

            The stepper is added only in the statewide view, where the set is
            small, fixed and worth walking. A district record does not get one:
            the map is the navigation there, and a next arrow would invent an
            order the pins do not have. */}
        <SignalPanel
          signal={openSignal?.signal ?? null}
          onClose={closeSignal}
          step={
            scope === "state" && stateIndex >= 0
              ? {
                  index: stateIndex,
                  total: visibleStatewide.length,
                  onPrev: () => stepStatewide(-1),
                  onNext: () => stepStatewide(1),
                }
              : undefined
          }
        />

        <MapControls
          onZoomIn={() => zoomBy(1.6)}
          onZoomOut={() => zoomBy(1 / 1.6)}
          onReset={reset}
        />

        <p className="map-attribution" lang="mr">
          {MR.boundaryNote}
        </p>
      </div>
    </MotionConfig>
  );
}

function clampToFrame(value: number, frameWidth: number): number {
  if (frameWidth < PLATE_REACH * 2) return frameWidth / 2;

  return Math.min(frameWidth - PLATE_REACH, Math.max(PLATE_REACH, value));
}
