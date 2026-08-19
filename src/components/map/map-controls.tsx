"use client";

import { Minus, Plus, Shrink } from "lucide-react";

import { MR } from "@/lib/signals/marathi";

type MapControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

/** The only chrome on the page: three hairline buttons for touch and keyboard.
 *  Nothing else in the product moves the camera. */
export function MapControls({ onZoomIn, onZoomOut, onReset }: MapControlsProps) {
  return (
    <div className="map-controls">
      <button type="button" onClick={onZoomIn} aria-label={MR.zoomIn}>
        <Plus aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <span className="map-controls-rule" aria-hidden />
      <button type="button" onClick={onZoomOut} aria-label={MR.zoomOut}>
        <Minus aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <span className="map-controls-rule" aria-hidden />
      <button type="button" onClick={onReset} aria-label={MR.resetView}>
        <Shrink aria-hidden size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}
