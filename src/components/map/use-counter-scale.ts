"use client";

import type { MotionValue } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Stakes a group to a viewBox point and holds it at one size on screen.
 *
 * Everything drawn inside the returned group is in CSS pixels at every zoom:
 * the camera scales the ground by `zoom`, this scales the marker back down by
 * the same amount, and the two cancel. The pin therefore keeps its weight while
 * the geography moves underneath it — which is what makes the anchor mean
 * something, and what lets `spread.ts` and `cluster.ts` reason in pixels.
 *
 * Two details are load-bearing:
 *
 * - The transform is written to the **attribute**, not the CSS property.
 *   Attribute transforms pivot on the element's own origin, so the
 *   counter-scale shrinks the marker onto its anchor and nothing else. The CSS
 *   property pivots on `transform-origin`, which motion overwrites with the
 *   view-box centre — at 7x that throws the marker off the map entirely.
 * - The returned `transform` reads the camera's *current* zoom rather than
 *   assuming rest, so the JSX attribute agrees with whatever the subscription
 *   last wrote. Without that, any re-render of the layer — a cluster opening, a
 *   new zoom bracket — would snap every marker back to its rest transform for
 *   one frame before the effect below put it right.
 */
export function useCounterScale(
  point: [x: number, y: number],
  scale: MotionValue<number>,
  unit: number,
) {
  const ref = useRef<SVGGElement>(null);
  const [x, y] = point;

  // Subscribed by hand rather than through `useMotionValueEvent`, so the
  // listener closes over this render's point and unit and is replaced whenever
  // either changes — a cluster's anchor moves as its membership does.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const place = (zoom: number) => {
      node.setAttribute("transform", `translate(${x} ${y}) scale(${unit / zoom})`);
    };

    place(scale.get());

    return scale.on("change", place);
  }, [scale, unit, x, y]);

  return { ref, transform: `translate(${x} ${y}) scale(${unit / scale.get()})` };
}
