import type { Division, DivisionId } from "@/types/map";

/**
 * The six revenue divisions, as names.
 *
 * Each used to carry a `tint`, and the map used to fill every district with
 * its division's colour. Six plates across 36 districts turned the state into
 * a chart of an administrative fact nobody had asked about, and it fought the
 * pins for attention. The state is one sheet under one gradient now, and the
 * only colour on it belongs to the records. The tints are gone rather than
 * merely unused, so nothing here implies a rendering that does not happen.
 */
export const DIVISIONS: Record<DivisionId, Division> = {
  konkan: {
    id: "konkan",
    name: "Konkan",
    nameMr: "कोकण",
  },
  nashik: {
    id: "nashik",
    name: "Nashik",
    nameMr: "नाशिक",
  },
  pune: {
    id: "pune",
    name: "Pune",
    nameMr: "पुणे",
  },
  "chhatrapati-sambhajinagar": {
    id: "chhatrapati-sambhajinagar",
    name: "Chhatrapati Sambhajinagar",
    nameMr: "छत्रपती संभाजीनगर",
  },
  amravati: {
    id: "amravati",
    name: "Amravati",
    nameMr: "अमरावती",
  },
  nagpur: {
    id: "nagpur",
    name: "Nagpur",
    nameMr: "नागपूर",
  },
};
