"use client";

import { animate, useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 16;
const WHEEL_SENSITIVITY = 0.0022;
/** Pointer travel, in on-screen pixels, before a press becomes a drag. */
const DRAG_SLOP = 3;

const GLIDE = { type: "spring", stiffness: 190, damping: 30, mass: 0.9 } as const;

type Point = { x: number; y: number };

type Gesture =
  /** `from` is where the pointer was on the **previous** frame, not where the
   *  press started — see `onPointerMove`. `origin` is the press, in client
   *  pixels, and is only ever read by the drag threshold. */
  | { kind: "pan"; from: Point; origin: Point }
  | { kind: "pinch"; span: number; midpoint: Point }
  | null;

/**
 * Pan, zoom and pinch for an SVG whose viewBox is `0 0 width height`.
 *
 * CSS transforms on SVG pivot around the view-box centre `M`, so a content
 * point `p` lands at `M + scale * (p - M) + offset`. Every function below is
 * that one line solved for a different unknown.
 */
export function useMapCamera([width, height]: [number, number]) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const [isPanning, setIsPanning] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(null);
  /** Stays true until the next press, so a drag never lands as a click. */
  const dragged = useRef(false);

  const midX = width / 2;
  const midY = height / 2;

  const settle = useCallback(
    (nextScale: number, nextX: number, nextY: number, glide: boolean) => {
      const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const target = {
        scale: clamped,
        x: clampOffset(nextX, clamped, width),
        y: clampOffset(nextY, clamped, height),
      };

      if (!glide) {
        scale.set(target.scale);
        x.set(target.x);
        y.set(target.y);
        return;
      }

      animate(scale, target.scale, GLIDE);
      animate(x, target.x, GLIDE);
      animate(y, target.y, GLIDE);
    },
    [height, scale, width, x, y],
  );

  /**
   * Rescale so that whatever content sits under `from` ends up under `to`.
   * Zoom, pinch and drag are all this call with different arguments.
   */
  const reframe = useCallback(
    (nextScale: number, from: Point, to: Point, glide: boolean) => {
      const current = scale.get();
      const next = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const heldX = midX + (from.x - midX - x.get()) / current;
      const heldY = midY + (from.y - midY - y.get()) / current;

      settle(
        next,
        to.x - midX - next * (heldX - midX),
        to.y - midY - next * (heldY - midY),
        glide,
      );
    },
    [midX, midY, scale, settle, x, y],
  );

  const zoomAt = useCallback(
    (factor: number, anchor: Point, glide = false) =>
      reframe(scale.get() * factor, anchor, anchor, glide),
    [reframe, scale],
  );

  const zoomBy = useCallback(
    (factor: number) => zoomAt(factor, { x: midX, y: midY }, true),
    [midX, midY, zoomAt],
  );

  const reset = useCallback(() => settle(1, 0, 0, true), [settle]);

  // React marks `wheel` passive on its root listener, so the zoom gesture has
  // to bind natively to keep the page from scrolling underneath it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const anchor = toContentSpace(svg, event);
      if (anchor) zoomAt(Math.exp(-event.deltaY * WHEEL_SENSITIVITY), anchor);
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const point = toContentSpace(event.currentTarget, event);
    if (!point) return;

    pointers.current.set(event.pointerId, point);
    const active = [...pointers.current.values()];

    if (active.length === 1) {
      dragged.current = false;
      gesture.current = {
        kind: "pan",
        from: point,
        origin: { x: event.clientX, y: event.clientY },
      };
      // Capture is deliberately deferred to the first real drag below: taking it
      // on press retargets the follow-up click to the <svg>, which would stop
      // any district from ever registering one.
      return;
    }

    if (active.length === 2) {
      // A second finger is never a tap, so lock out selection straight away.
      dragged.current = true;
      setIsPanning(true);
      gesture.current = {
        kind: "pinch",
        span: distance(active[0], active[1]),
        midpoint: middle(active[0], active[1]),
      };
    }
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!pointers.current.has(event.pointerId)) return;

      const point = toContentSpace(event.currentTarget, event);
      if (!point) return;

      pointers.current.set(event.pointerId, point);
      const active = [...pointers.current.values()];
      const current = gesture.current;

      if (current?.kind === "pinch" && active.length >= 2) {
        const span = distance(active[0], active[1]);
        const midpoint = middle(active[0], active[1]);
        if (span <= 1e-6 || current.span <= 1e-6) return;

        reframe(
          scale.get() * (span / current.span),
          current.midpoint,
          midpoint,
          false,
        );
        gesture.current = { kind: "pinch", span, midpoint };
        return;
      }

      if (current?.kind !== "pan") return;

      // The threshold is measured in client pixels. Measuring it in view-box
      // units and scaling by the camera was wrong twice over: the camera lives
      // on an inner group, so it is not in the SVG's screen matrix at all, and
      // the matrix already folds in the view-box fit that the units needed.
      if (!dragged.current) {
        const travel = Math.hypot(
          event.clientX - current.origin.x,
          event.clientY - current.origin.y,
        );

        if (travel < DRAG_SLOP) return;

        dragged.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsPanning(true);
      }

      // Against the previous frame, never against the press. `from` used to be
      // left at the press point for the whole drag, so every frame re-applied
      // the entire travel on top of an offset that already contained it — the
      // map accelerated away from the pointer at roughly the frame count, which
      // is what made a zoomed-in view impossible to steer.
      settle(
        scale.get(),
        x.get() + point.x - current.from.x,
        y.get() + point.y - current.from.y,
        false,
      );

      gesture.current = { kind: "pan", from: point, origin: current.origin };
    },
    [reframe, scale, settle, x, y],
  );

  const endPan = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const active = [...pointers.current.values()];

    // Lifting one finger of a pinch hands the drag back to the one still down.
    // It is already past the threshold, so `origin` only has to be somewhere —
    // it is never read again on this gesture.
    gesture.current =
      active.length === 1
        ? { kind: "pan", from: active[0], origin: active[0] }
        : null;

    if (active.length === 0) setIsPanning(false);
  }, []);

  return {
    svgRef,
    camera: { x, y, scale },
    isPanning,
    hasDragged: () => dragged.current,
    zoomBy,
    reset,
    surfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
      onDoubleClick: (event: React.MouseEvent<SVGSVGElement>) => {
        const anchor = toContentSpace(event.currentTarget as SVGSVGElement, event);
        if (anchor) zoomAt(1.8, anchor, true);
      },
    },
  };
}

/** Client pixels to the SVG's own user-space units. */
function toContentSpace(
  svg: SVGSVGElement,
  event: { clientX: number; clientY: number },
): Point | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;

  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    matrix.inverse(),
  );

  return { x: point.x, y: point.y };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Keep the artwork covering the viewport. Pivoting around the centre makes the
 * usable offset range symmetric.
 */
function clampOffset(value: number, scale: number, extent: number): number {
  const limit = ((scale - 1) * extent) / 2;

  return Math.min(limit, Math.max(-limit, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
