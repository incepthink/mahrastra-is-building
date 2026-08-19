"use client";

import type { MotionValue } from "motion/react";
import { useEffect, useState } from "react";

import { ClusterMarker } from "./cluster-marker";
import { SignalMarker } from "./signal-marker";
import type { MapMarker } from "@/lib/map/cluster";
import type { PlacedSignal } from "@/types/signal";

/** Held back until the districts have finished arriving. */
const FIRST_DROP_MS = 900;
const STAGGER_MS = 110;

type SignalLayerProps = {
  markers: MapMarker[];
  scale: MotionValue<number>;
  selectedId: string | null;
  /** viewBox units per CSS pixel, from the map's current fit. */
  unit: number;
  onSelect: (placed: PlacedSignal) => void;
  onOpenCluster: (id: string) => void;
  onEnter: (placed: PlacedSignal, event: React.PointerEvent<SVGGElement>) => void;
  onLeave: (placed: PlacedSignal) => void;
  onEnterCluster: (
    members: PlacedSignal[],
    event: React.PointerEvent<SVGGElement>,
  ) => void;
  onLeaveCluster: () => void;
  onMove: (event: React.PointerEvent<SVGGElement>) => void;
};

/**
 * Every published signal, drawn above the map and below nothing — as a pin
 * where there is room for one and as a counter where there is not. Which is
 * which is decided per view by `lib/map/cluster.ts`, so this layer re-renders
 * as the reader zooms; the markers themselves keep following the camera through
 * motion values and are untouched by it.
 */
export function SignalLayer({
  markers,
  scale,
  selectedId,
  unit,
  onSelect,
  onOpenCluster,
  onEnter,
  onLeave,
  onEnterCluster,
  onLeaveCluster,
  onMove,
}: SignalLayerProps) {
  // The staggered drop is an entrance, not a rule about markers. A cluster that
  // splits three zoom steps later should appear at once rather than trickling
  // in behind a second of dead time — so the stagger is retired once the first
  // set has landed. Re-rendering to retire it is free: by then every marker's
  // animation has finished, and `animationDelay` is inert on a finished one.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled) return;

    const timer = window.setTimeout(
      () => setSettled(true),
      FIRST_DROP_MS + markers.length * STAGGER_MS,
    );

    return () => window.clearTimeout(timer);
  }, [markers.length, settled]);

  const dropAt = (index: number) =>
    settled ? 0 : FIRST_DROP_MS + index * STAGGER_MS;

  return (
    <g className="signal-layer">
      {markers.map((marker, index) =>
        marker.kind === "cluster" ? (
          <ClusterMarker
            key={marker.id}
            id={marker.id}
            point={marker.point}
            head={marker.head}
            members={marker.members}
            scale={scale}
            unit={unit}
            delay={dropAt(index)}
            onOpen={onOpenCluster}
            onEnter={onEnterCluster}
            onLeave={onLeaveCluster}
            onMove={onMove}
          />
        ) : (
          <SignalMarker
            key={marker.id}
            placed={marker.placed}
            head={marker.head}
            scale={scale}
            isSelected={marker.id === selectedId}
            delay={dropAt(index)}
            unit={unit}
            onSelect={onSelect}
            onEnter={onEnter}
            onLeave={onLeave}
            onMove={onMove}
          />
        ),
      )}
    </g>
  );
}
