import type { Projector } from "@/lib/map/project";

/** Administrative divisions of Maharashtra — the six revenue divisions. */
export type DivisionId =
  | "konkan"
  | "nashik"
  | "pune"
  | "chhatrapati-sambhajinagar"
  | "amravati"
  | "nagpur";

export type Division = {
  id: DivisionId;
  name: string;
  nameMr: string;
};

/** One district, already projected into the map's viewBox coordinate space. */
export type DistrictShape = {
  id: string;
  name: string;
  nameMr: string;
  division: DivisionId;
  /** SVG path data in viewBox units. */
  d: string;
  centroid: [x: number, y: number];
  bounds: [min: [x: number, y: number], max: [x: number, y: number]];
  /** Projected area in square viewBox units — drives paint order. */
  area: number;
};

export type MapGeometry = {
  /** Always `0 0 W H` — the projection is pre-translated to suit. */
  viewBox: string;
  /** Reproduces the server projection, so lon/lat signals land in this space. */
  projector: Projector;
  size: [width: number, height: number];
  /** Union of all 36 districts, as sub-paths of one `d` string. */
  landPath: string;
  graticulePath: string;
  /** Sorted largest-first so small districts stay hoverable on top. */
  districts: DistrictShape[];
};
