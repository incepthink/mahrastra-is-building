import { DISTRICTS } from "@/data/districts";
import { toDevanagari } from "@/lib/signals/marathi";
import type { NewsArticle, NewsWindow, PlaceTier } from "@/types/news";

export { toDevanagari };

/**
 * Every word the news map says, in one place.
 *
 * The product is Marathi-first and the corpus is Marathi, so nothing here is a
 * translation of an English original — these are the words a Marathi reader
 * would use for what is on screen. Kept apart from `lib/signals/marathi.ts`
 * because that file's vocabulary is about *notices* — deadlines, agencies,
 * sanctions — and none of it applies to a newspaper article.
 */
export const NEWS_MR = {
  /** The headline reading of the map. */
  brand: "महाराष्ट्र घडतो आहे",
  tagline: "राज्यभरच्या बातम्या, जिल्ह्यानुसार",

  /** The choropleth legend. */
  intensity: "बातम्यांची घनता",
  fewer: "कमी",
  more: "जास्त",
  noNews: "बातमी नाही",

  /** The window control. */
  window: "कालावधी",
  windowWidened: "या कालावधीत बातमी नव्हती, म्हणून व्याप्ती वाढवली.",

  /** Counting. */
  articleOne: "बातमी",
  articleMany: "बातम्या",
  districtOne: "जिल्हा",
  districtMany: "जिल्हे",
  inDistricts: "जिल्ह्यांत",

  /** The panel. */
  statewide: "संपूर्ण महाराष्ट्र",
  statewideHint: "राज्यभरच्या बातम्या",
  statewideBack: "जिल्ह्यांकडे परत",
  lead: "आघाडीची बातमी",
  readAt: "मूळ बातमी वाचा",
  showingOf: "पैकी",
  emptyDistrict: "या जिल्ह्यातून या कालावधीत बातमी आली नाही.",
  close: "बंद करा",
  /** The second button in the panel's corner: the same list, opened out over
   *  the whole page as a grid of cards. Says "read on a full screen" rather
   *  than "expand", because what is being offered is room to read. */
  expand: "पूर्ण पडद्यावर वाचा",
  collapse: "पूर्ण पडदा बंद करा",

  /** How prominently the press played a piece. See `Prominence`. */
  prominence: "प्रसिद्धी",
  onEveryPage: "राज्यभर मुखपृष्ठी",
  frontOfSection: "विभागात आघाडीवर",
  updated: "अद्ययावत",
  updatedTimes: "वेळा अद्ययावत",

  /** The mode toggle — what the sheet is showing. */
  mode: "नकाशा",
  modeHeat: "घनता",
  modePins: "घडामोडी",

  /** The story layer: a running story, its place and its progression. */
  storyOne: "घडामोड",
  storyMany: "घडामोडी",
  storyHint: "घडामोडीचा घटनाक्रम",
  progression: "घटनाक्रम",
  storyPlace: "ठिकाण",
  storyDesks: "बातमी दिलेली वृत्तकेंद्रे",
  /** Appended to a step's district, so a desk is never read as a place. */
  storyDesk: "वृत्तकेंद्र",
  storyEvidence: "आधार",
  storyStep: "टप्पा",
  noStories: "या कालावधीत नोंदवलेली घडामोड नाही.",
  storiesUnbuilt: "घडामोडींची नोंद अद्याप तयार केलेली नाही.",
  /** Said on the plate, so the statewide stories do not simply vanish when the
   *  reader switches to pins. They have no place, so they get no mark. */
  storiesStatewide: "राज्यव्यापी — नकाशावर खूण नाही",

  /** How precisely a story's place is known. The tier is the whole reason
   *  pins are allowed on this map at all — see `PlaceTier`. */
  precision: "ठिकाणाची अचूकता",
  tierTaluka: "नेमके ठिकाण",
  tierDistrict: "अंदाजे — जिल्हा",
  tierState: "राज्यव्यापी",
  tierTalukaNote: "बातमीत आलेल्या गावाच्या नावावरून",
  tierDistrictNote: "फक्त वृत्तकेंद्र माहीत — जिल्ह्यात कुठेतरी",

  /** Timestamps. */
  justNow: "आत्ताच",
  minutesAgo: "मिनिटांपूर्वी",
  hoursAgo: "तासांपूर्वी",
  daysAgo: "दिवसांपूर्वी",
  collectedAt: "शेवटची नोंद",

  /** The plate's own control, and only on a phone: at that width the legend is
   *  a header across the top of the frame, and open by default it printed
   *  three chip rows and a key over the state itself. Collapsed it is a
   *  wordmark and a count; this is the word on the button that opens it. */
  filters: "फिल्टर",
  filtersShow: "फिल्टर दाखवा",
  filtersHide: "फिल्टर लपवा",

  /** Map chrome, carried over unchanged — the gestures have not changed. */
  zoomIn: "जवळून पाहा",
  zoomOut: "दूरून पाहा",
  resetView: "नकाशा पूर्ववत",
  boundaryNote: "जिल्हा सीमा निर्देशात्मक · geoBoundaries",
  ticker: "ताज्या बातम्या",
  tickerAria: "ताज्या बातम्यांची पट्टी",

  /** Said once, at the bottom of the panel. */
  credit: "बातम्या संबंधित वृत्तपत्रांच्या. दुव्यावर क्लिक करून मूळ बातमी वाचा.",
  noDatabase: "अद्याप बातम्या गोळा केलेल्या नाहीत.",
} as const;

/** A district id to its Marathi name, or the id when the map has never heard
 *  of it — which is the honest answer and never a guess. */
export function districtNameMr(id: string): string {
  return DISTRICTS[id]?.nameMr ?? id;
}

/** `२४ बातम्या` — the count and its noun, agreeing in number. */
export function articleCountMr(count: number): string {
  return `${toDevanagari(count)} ${count === 1 ? NEWS_MR.articleOne : NEWS_MR.articleMany}`;
}

export function districtCountMr(count: number): string {
  return `${toDevanagari(count)} ${count === 1 ? NEWS_MR.districtOne : NEWS_MR.districtMany}`;
}

/** `७ घडामोडी` — running stories, counted. */
export function storyCountMr(count: number): string {
  return `${toDevanagari(count)} ${count === 1 ? NEWS_MR.storyOne : NEWS_MR.storyMany}`;
}

/**
 * What the tier claims, in words.
 *
 * Printed beside every pin's place in the panel and spelled out in the map's
 * key, because the tier is the map's answer to `choropleth-layer.tsx`: the
 * mark's shape says how precise the position is, and a shape only carries a
 * meaning a reader has been told once.
 */
export function tierMr(tier: PlaceTier): string {
  if (tier === "taluka") return NEWS_MR.tierTaluka;

  return tier === "district" ? NEWS_MR.tierDistrict : NEWS_MR.tierState;
}

/** The place itself: the taluka when one was named, else the desk's district,
 *  and never a guess dressed up as either. */
export function storyPlaceMr(story: {
  placeTier: PlaceTier;
  talukaNameMr: string | null;
  districtId: string | null;
}): string {
  if (story.placeTier === "taluka" && story.talukaNameMr) {
    return story.districtId
      ? `${story.talukaNameMr}, ${districtNameMr(story.districtId)}`
      : story.talukaNameMr;
  }

  return story.districtId ? districtNameMr(story.districtId) : NEWS_MR.statewide;
}

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * Minutes below an hour, hours below a day, days after that — a wire ticker's
 * convention, and the right one for a surface whose whole claim is that it is
 * current. `now` arrives null on the server so the markup the client hydrates
 * against matches: the server has no business deciding what "two hours ago"
 * means when the page may be served from cache minutes later.
 */
export function agoMr(iso: string, now: Date | null): string | null {
  if (!now || !iso) return null;

  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;

  const minutes = Math.round((now.getTime() - then) / 60_000);

  if (minutes < 2) return NEWS_MR.justNow;
  if (minutes < 60) return `${toDevanagari(minutes)} ${NEWS_MR.minutesAgo}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${toDevanagari(hours)} ${NEWS_MR.hoursAgo}`;

  return `${toDevanagari(Math.round(hours / 24))} ${NEWS_MR.daysAgo}`;
}

/** The one line describing what the map is currently showing. */
export function windowSummaryMr(
  window: NewsWindow,
  articles: number,
  districts: number,
): string {
  return `${window.labelMr}: ${articleCountMr(articles)}, ${toDevanagari(districts)} ${NEWS_MR.inDistricts}`;
}

/**
 * What made a piece prominent, said in words rather than as a score.
 *
 * The number behind this is inferred from where the editors put the link (see
 * `prominenceByUrl`) and a reader has no way to check it, so the map never
 * prints the figure — it prints only the two claims the figure is confident
 * enough to support, and says nothing at all when it is not.
 */
export function prominenceMr(article: NewsArticle): string | null {
  const prominence = article.prominence;
  if (!prominence) return null;

  if (prominence.reach >= 0.5) return NEWS_MR.onEveryPage;
  if (prominence.bestPosition <= 3) return NEWS_MR.frontOfSection;

  return null;
}
