import type { DivisionId } from "@/types/map";

export type DistrictMeta = {
  nameMr: string;
  division: DivisionId;
};

/**
 * Marathi names and revenue division for each of Maharashtra's 36 districts,
 * keyed by the `districtId` carried in `maharashtra-districts.geojson`.
 * Geometry lives in the boundary files; naming and grouping live here.
 */
export const DISTRICTS: Record<string, DistrictMeta> = {
  // Konkan
  "mumbai-city": { nameMr: "मुंबई शहर", division: "konkan" },
  "mumbai-suburban": { nameMr: "मुंबई उपनगर", division: "konkan" },
  thane: { nameMr: "ठाणे", division: "konkan" },
  palghar: { nameMr: "पालघर", division: "konkan" },
  raigad: { nameMr: "रायगड", division: "konkan" },
  ratnagiri: { nameMr: "रत्नागिरी", division: "konkan" },
  sindhudurg: { nameMr: "सिंधुदुर्ग", division: "konkan" },

  // Nashik
  nashik: { nameMr: "नाशिक", division: "nashik" },
  dhule: { nameMr: "धुळे", division: "nashik" },
  nandurbar: { nameMr: "नंदुरबार", division: "nashik" },
  jalgaon: { nameMr: "जळगाव", division: "nashik" },
  ahilyanagar: { nameMr: "अहिल्यानगर", division: "nashik" },

  // Pune
  pune: { nameMr: "पुणे", division: "pune" },
  satara: { nameMr: "सातारा", division: "pune" },
  sangli: { nameMr: "सांगली", division: "pune" },
  solapur: { nameMr: "सोलापूर", division: "pune" },
  kolhapur: { nameMr: "कोल्हापूर", division: "pune" },

  // Chhatrapati Sambhajinagar
  "chhatrapati-sambhajinagar": {
    nameMr: "छत्रपती संभाजीनगर",
    division: "chhatrapati-sambhajinagar",
  },
  jalna: { nameMr: "जालना", division: "chhatrapati-sambhajinagar" },
  parbhani: { nameMr: "परभणी", division: "chhatrapati-sambhajinagar" },
  hingoli: { nameMr: "हिंगोली", division: "chhatrapati-sambhajinagar" },
  nanded: { nameMr: "नांदेड", division: "chhatrapati-sambhajinagar" },
  beed: { nameMr: "बीड", division: "chhatrapati-sambhajinagar" },
  latur: { nameMr: "लातूर", division: "chhatrapati-sambhajinagar" },
  dharashiv: { nameMr: "धाराशिव", division: "chhatrapati-sambhajinagar" },

  // Amravati
  amravati: { nameMr: "अमरावती", division: "amravati" },
  akola: { nameMr: "अकोला", division: "amravati" },
  washim: { nameMr: "वाशिम", division: "amravati" },
  buldhana: { nameMr: "बुलढाणा", division: "amravati" },
  yavatmal: { nameMr: "यवतमाळ", division: "amravati" },

  // Nagpur
  nagpur: { nameMr: "नागपूर", division: "nagpur" },
  wardha: { nameMr: "वर्धा", division: "nagpur" },
  bhandara: { nameMr: "भंडारा", division: "nagpur" },
  gondia: { nameMr: "गोंदिया", division: "nagpur" },
  chandrapur: { nameMr: "चंद्रपूर", division: "nagpur" },
  gadchiroli: { nameMr: "गडचिरोली", division: "nagpur" },
};

/**
 * The boundary file's key for a district, from the English name a record
 * carries — `"Pune"` and `"pune"` and `"Mumbai Suburban"` all land on the id
 * `maharashtra-districts.geojson` uses.
 *
 * Records name their district in the scraper's English, and the map keys its
 * shapes by id, so anything that has to line the two up — the Marathi name on
 * a plate, the border lit up under an open record — goes through here rather
 * than slugifying inline and drifting.
 *
 * Returns the slug even when nothing matches it: callers either look it up in
 * `DISTRICTS` (and get `undefined`, which is the honest answer) or compare it
 * against a shape id (and simply never match).
 */
export function districtIdOf(name: string | undefined): string {
  if (!name) return "";

  return name.trim().toLowerCase().replace(/\s+/g, "-");
}
