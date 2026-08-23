import { differenceInCalendarDays, isValid, parseISO } from "date-fns";

import { DISTRICTS, districtIdOf } from "@/data/districts";
import { categoryOf } from "@/lib/signals/format";
import type { AnySignal, SignalPulse, StatewideSignal } from "@/types/signal";

/**
 * Everything the interface says, in Marathi.
 *
 * The panel and the map plates read every string from here rather than holding
 * literals, so the product has exactly one place where its voice lives — and so
 * a reviewer can check the whole vocabulary in one screen instead of grepping
 * for Devanagari across a dozen components.
 */
export const MR = {
  brand: "महाराष्ट्र घडतो आहे",
  recordsOne: "नोंद",
  recordsMany: "नोंदी",
  deadline: "मुदत",
  closesToday: "आजच मुदत संपते",
  expired: "मुदत संपली",
  daysLeft: "दिवस शिल्लक",
  daysAgo: "दिवसांपूर्वी संपली",
  openNotice: "मूळ सूचना पाहा",
  report: "माहिती कळवा",
  /** Sits beside it: posting a record onward, rather than telling us about it. */
  share: "शेअर करा",
  /** The report dialog — telling us something on a record looks wrong. */
  reportTitle: "या नोंदीत काही चुकीचं आहे?",
  reportIntro: "खाली थोडक्यात सांगा. आम्ही मूळ सूचनेशी पडताळून पाहू.",
  reportOn: "नोंद",
  reportKind: "काय चुकीचं आहे?",
  reportDetails: "थोडक्यात सांगा",
  reportDetailsHint: "काय चुकीचं आहे आणि बरोबर काय आहे, हे लिहा.",
  reportDetailsPlaceholder: "उदा. गावाचं नाव चुकीचं आहे — ते …",
  reportContact: "संपर्क",
  reportOptional: "ऐच्छिक",
  reportContactHint: "पडताळणीसाठी गरज पडल्यास संपर्क करता येईल.",
  reportContactPlaceholder: "ईमेल किंवा भ्रमणध्वनी",
  reportSubmit: "पाठवा",
  reportCancel: "रद्द करा",
  reportNote: "ही सूचना जिल्ह्याच्या मूळ नोंदीत बदल करत नाही.",
  /** The plate under the legend, and the dialog it opens — a reader sending
   *  in something the pipeline has not seen. */
  leadPrompt: "तुमच्या भागात काही घडतंय?",
  leadHint: "रस्ता, पाणी योजना, नवा प्रकल्प — आम्हाला कळवा.",
  leadCta: "इथे क्लिक करा",
  /** The same button on a phone, where the plate collapses to a pill beside the
   *  statewide badge and the prompt above it is no longer there to be read.
   *  "Click here" alone would then name no destination, so the short form says
   *  the thing itself rather than the gesture. */
  leadCtaShort: "माहिती कळवा",
  leadTitle: "तुमच्याकडे एखादी माहिती आहे?",
  leadIntro: "खाली थोडक्यात सांगा. आम्ही पडताळून पाहू आणि मगच नकाशावर घेऊ.",
  leadKind: "कोणत्या प्रकारची माहिती?",
  leadPlace: "ठिकाण",
  leadPlaceHint: "गाव, तालुका आणि जिल्हा — जेवढं माहीत आहे तेवढं.",
  leadPlacePlaceholder: "उदा. आळंदी, खेड तालुका, पुणे",
  leadDetails: "काय घडतंय?",
  leadDetailsHint: "काय, कुठे आणि कोण करतंय, हे लिहा.",
  leadDetailsPlaceholder: "उदा. आमच्या गावात नवीन पाणीपुरवठा योजनेचं काम सुरू झालं आहे …",
  leadSource: "दुवा किंवा पुरावा",
  leadSourceHint: "बातमी, शासकीय सूचना किंवा छायाचित्राचा दुवा असल्यास द्या.",
  leadSourcePlaceholder: "https://",
  leadSubmit: "माहिती पाठवा",
  leadNote: "पडताळणी झाल्यावरच नोंद नकाशावर दिसेल.",
  close: "बंद करा",
  zoomIn: "जवळून पाहा",
  zoomOut: "दूरून पाहा",
  resetView: "नकाशा पूर्ववत",
  /** On a cluster badge — clicking fans it out rather than opening a record. */
  openCluster: "सर्व नोंदी पाहण्यासाठी क्लिक करा",
  district: "जिल्हा",
  /* The badge in the corner of the sheet, and what it switches the map to.
     `statewide` names the thing; `statewideHint` says what clicking does, and
     changes once it is on, because a pressed toggle whose label still describes
     the way in is a toggle nobody can find the way out of. */
  statewide: "महाराष्ट्रभर",
  statewideHint: "राज्यभरच्या नोंदी",
  statewideBack: "जिल्ह्यांकडे परत",
  /** Where a statewide record is — said in full rather than left blank. */
  allMaharashtra: "संपूर्ण महाराष्ट्र",
  /** Stands in for the pulse line while the map is showing the state. */
  statewideIntro: "राज्यभर लागू होणारी धोरणं आणि योजना.",
  prevRecord: "मागील नोंद",
  nextRecord: "पुढील नोंद",
  /** The ticker across the top of the page, and the plate that names it. */
  newsLabel: "ताज्या नोंदी",
  newsAria: "ताज्या नोंदींची पट्टी",
  /** Follows a figure: "२५ पैकी निवडक" — selected out of 25. */
  selectedFrom: "पैकी निवडक",
  /* --- The filters, under the pulse line ---------------------------------
     Two axes and a way out of them. `filtersEmpty` is the one line the legend
     prints when a combination matches nothing: a plate that simply goes blank
     reads as a map that broke rather than as an answer. */
  filters: "गाळणी",
  filterSector: "क्षेत्र",
  filterStatus: "सद्यस्थिती",
  filterClear: "सर्व दाखवा",
  filtersEmpty: "या गाळणीत एकही नोंद नाही.",
  /** Read out to a screen reader on a chip, before the sector or stage name. */
  filterToggle: "गाळणी लावा",
  /** The stage meter's heading in the record panel. */
  stage: "सद्यस्थिती",
  /** Heads the `impact` line — "what this means for you". */
  meaning: "याचा अर्थ काय",
  /** The implementing body, on the facts list. */
  agency: "यंत्रणा",
  boundaryNote: "जिल्हा सीमा निर्देशात्मक · geoBoundaries",
} as const;

const MONTHS_MR = [
  "जानेवारी",
  "फेब्रुवारी",
  "मार्च",
  "एप्रिल",
  "मे",
  "जून",
  "जुलै",
  "ऑगस्ट",
  "सप्टेंबर",
  "ऑक्टोबर",
  "नोव्हेंबर",
  "डिसेंबर",
];

const DEVANAGARI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

/** ASCII digits to Devanagari, in place — everything else passes through. */
export function toDevanagari(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => DEVANAGARI_DIGITS[Number(digit)]);
}

/** `2026-08-18` → `१८ ऑगस्ट २०२६`. */
export function formatDateMr(iso: string | undefined): string | null {
  if (!iso) return null;

  const date = parseISO(iso);
  if (!isValid(date)) return null;

  return `${toDevanagari(date.getDate())} ${MONTHS_MR[date.getMonth()]} ${toDevanagari(date.getFullYear())}`;
}

/** How long a notice has left, as a phrase rather than a number. */
export function deadlineMr(iso: string | undefined, now: Date | null): string | null {
  const date = formatDateMr(iso);
  if (!date) return null;

  // `now` is null until the client knows what day it is, so the server renders
  // the date alone and the count arrives on hydration. See `useToday`.
  if (!now) return date;

  const days = differenceInCalendarDays(parseISO(iso as string), now);

  if (days === 0) return `${date} · ${MR.closesToday}`;
  if (days < 0) return `${date} · ${toDevanagari(Math.abs(days))} ${MR.daysAgo}`;

  return `${date} · ${toDevanagari(days)} ${MR.daysLeft}`;
}

/** Whether the deadline should be drawn as urgent, spent, or merely noted. */
export function deadlineState(
  iso: string | undefined,
  now: Date | null,
): "open" | "closing" | "closed" | null {
  if (!iso || !now) return null;

  const days = differenceInCalendarDays(parseISO(iso), now);

  if (days < 0) return "closed";

  return days <= 30 ? "closing" : "open";
}

/**
 * Whether this record belongs to the whole state rather than to a place on it.
 *
 * The discriminant is `scope`, which only a statewide record carries — a
 * district record is left exactly as the scraper wrote it rather than being
 * given a field whose only job is to say "not that other thing".
 */
export function isStatewide(signal: AnySignal): signal is StatewideSignal {
  return "scope" in signal && signal.scope === "state";
}

/** The Marathi name of a district, looked up from the English one the scraper
 *  recorded. Falls back to what it was given rather than rendering a gap. */
export function districtMr(name: string | undefined): string {
  if (!name) return "";

  return DISTRICTS[districtIdOf(name)]?.nameMr ?? name;
}

/**
 * Where this is, in Marathi.
 *
 * The AI pass writes a proper Marathi place line into `card.placeMr` — the
 * scraper's own `locality`/`taluka` are romanised, and "Hivra Bu." in the
 * middle of a Marathi sentence is exactly the kind of seam that makes a
 * government site feel machine-made. Without a card we fall back to the
 * district alone, which is at least wholly Marathi.
 */
export function placeMr(signal: AnySignal): string {
  if (signal.card?.placeMr) return signal.card.placeMr;
  if (isStatewide(signal)) return MR.allMaharashtra;

  const district = districtMr(signal.district);

  return district ? `${district} ${MR.district}` : "";
}

/** The headline: the AI's short line if there is one, else the notice's own. */
export function headlineMr(signal: AnySignal): string {
  return signal.card?.headline ?? signal.titleMr ?? signal.title;
}

/** One or two sentences of plain Marathi. */
export function gistMr(signal: AnySignal): string {
  return signal.card?.gist ?? signal.summaryMr ?? signal.summary;
}

/**
 * What the notice means for someone living there, in one sentence.
 *
 * Written by the AI pass alongside the gist and, until now, never rendered —
 * the panel showed a summary of what the notice *says* and nothing about what
 * it *does*, which is the half a reader actually arrives for. There is no
 * fallback on purpose: guessing an impact from notice wording at render time
 * is exactly the invention the enrichment prompt forbids, so a record without
 * a card simply has no impact line.
 */
export function impactMr(signal: AnySignal): string | null {
  return signal.card?.impact ?? null;
}

/**
 * The implementing body, in Marathi.
 *
 * `implementingAgency` on the record is the scraper's English — "Land
 * Acquisition Branch, Office of the District Collector, Amravati" — and a line
 * of English in the middle of a Marathi panel is the seam that makes a
 * government page feel machine-made. Better no row than that row.
 */
export function agencyMr(signal: AnySignal): string | null {
  return signal.card?.agencyMr ?? null;
}

/** `पायाभूत सुविधा` — the sector, in Marathi, for the chip line. */
export function categoryMr(signal: AnySignal): string {
  return categoryOf(signal.category).labelMr;
}

/**
 * The pulse line: `गेल्या ४८ तासांत महाराष्ट्रात ९ गोष्टी पुढे सरकल्या.`
 *
 * The window is said in whatever unit it was measured in — 48 hours stays 48
 * hours rather than becoming "two days", because the two-day version reads as
 * a rounding and the point of the line is that it is precise. Anything wider
 * than a couple of days is said in days, where hours stop being legible.
 */
export function pulseMr({ count, hours }: SignalPulse): string {
  const window =
    hours <= 48
      ? `${toDevanagari(hours)} तासांत`
      : `${toDevanagari(Math.round(hours / 24))} दिवसांत`;

  return `गेल्या ${window} महाराष्ट्रात ${toDevanagari(count)} गोष्टी पुढे सरकल्या.`;
}

/** `४ नोंदी` — a count with its noun agreeing, in Devanagari figures. */
export function countMr(total: number): string {
  return `${toDevanagari(total)} ${total === 1 ? MR.recordsOne : MR.recordsMany}`;
}

/**
 * What a reader can say is wrong, as a closed list.
 *
 * A free-text box alone gets "हे चूक आहे" and nothing to act on; naming the
 * four things that actually go wrong on these records — the place, the wording,
 * the dates, the link — tells the reader what kind of answer is useful before
 * they start typing. `other` is last and exists so the list never blocks a
 * report it did not anticipate.
 */
export const REPORT_KINDS = [
  { id: "place", labelMr: "जागा किंवा गाव चुकीचं आहे" },
  { id: "facts", labelMr: "माहिती चुकीची आहे" },
  { id: "dates", labelMr: "दिनांक किंवा मुदत चुकीची आहे" },
  { id: "link", labelMr: "मूळ सूचनेची लिंक चालत नाही" },
  { id: "other", labelMr: "इतर काही" },
] as const;

export type ReportKindId = (typeof REPORT_KINDS)[number]["id"];
