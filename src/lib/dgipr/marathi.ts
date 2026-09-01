import { DISTRICTS } from "@/data/districts";
import { formatDateMr, toDevanagari } from "@/lib/signals/marathi";

/**
 * Every word the DGIPR layer says.
 *
 * Kept apart from `NEWS_MR` for the same reason that file is kept apart from
 * `lib/signals/marathi.ts`: its vocabulary is about newspaper articles —
 * prominence, desks, mastheads, how hard the press played a piece — and none of
 * it describes a government press release. A release is not "आघाडीची बातमी"; it
 * is a thing a department published, and the words for it are the department's
 * own.
 */
export const DGIPR_MR = {
  /** The filter chip, and what the layer is called wherever it is named. */
  layer: "शासकीय प्रसिद्धीपत्रके",
  /** The short tag, for the chip and the mark's label. Names the department's
   *  own outlet — महासंवाद — rather than the directorate's initials, because
   *  that is the name a Marathi reader has seen on the releases themselves. */
  tag: "महासंवाद",
  source: "स्रोत",

  /** Who issues them, said in full once — on the panel. */
  issuer: "माहिती व जनसंपर्क महासंचालनालय, महाराष्ट्र शासन",
  releaseOne: "प्रसिद्धीपत्रक",
  releaseMany: "प्रसिद्धीपत्रके",

  /** The panel. */
  hint: "शासकीय प्रसिद्धीपत्रक",
  category: "विषय",
  tags: "खुणा",
  dateline: "दिनांकित",
  issuedBy: "जारी करणारे कार्यालय",
  readPdf: "मूळ प्रसिद्धीपत्रक (PDF)",
  /** The link out to the release on DGIPR's own site. Names महासंवाद rather
   *  than saying "source", because the reader is being sent to the department,
   *  not to a publisher. */
  readSource: "महासंवादवर पहा",
  featured: "महत्त्वाचे",

  /** The key, on the plate. The mark says "somewhere in this district" exactly
   *  the way a district-tier story pin does, and for the same reason: a release
   *  carries a dateline and never a coordinate. */
  keyName: "शासकीय — जिल्हा",
  keyNote: "प्रसिद्धीपत्रकाच्या दिनांक-स्थळावरून",

  /** Said when this layer had to look further back than the map beside it.
   *  Names *districts* and not releases, because that is what the widening walk
   *  now tests — see `DISTRICT_FLOOR` in `read.ts`. Saying "there were no
   *  releases" would be plainly false on a day when there were nine of them
   *  from four districts. */
  widened: "या कालावधीत मोजक्याच जिल्ह्यांतून प्रसिद्धीपत्रके आली, म्हणून व्याप्ती वाढवली.",
  /** Said when a release's dateline names no district on the map. */
  unplaced: "जिल्हा निश्चित नाही — नकाशावर खूण नाही",
  none: "या कालावधीत शासकीय प्रसिद्धीपत्रक नाही.",
  pulledAt: "शेवटची आयात",
} as const;

/** `३ प्रसिद्धीपत्रके` — the count and its noun, agreeing in number. */
export function releaseCountMr(count: number): string {
  return `${toDevanagari(count)} ${count === 1 ? DGIPR_MR.releaseOne : DGIPR_MR.releaseMany}`;
}

/**
 * Where a release says it is from.
 *
 * The department's own dateline word comes first and the map's resolved
 * district only fills in behind it. The one case where the two differ is the
 * one that matters: DGIPR datelines `मुंबई`, the map has two Mumbais, and
 * printing `मुंबई शहर` here would put a precision on the release that the
 * release does not carry. See `ALIASES` in `scripts/dgipr/pull.mjs`.
 */
export function datelineMr(release: {
  datelineMr: string | null;
  districtId: string | null;
}): string {
  if (release.datelineMr) return release.datelineMr;

  return release.districtId
    ? (DISTRICTS[release.districtId]?.nameMr ?? release.districtId)
    : "";
}

/**
 * A `YYYY-MM-DD` printed as a Marathi date — `२६ ऑगस्ट २०२६`.
 *
 * `formatDateMr` already does exactly this and has since the curated map, so
 * this is a thin pass-through rather than a second month table: two lists of
 * Marathi month names in one repo would drift, and the one that drifted would
 * be the one nobody was looking at. The only thing added is the fallback — a
 * release's date comes from a hand-maintained feed, and a malformed one should
 * print as itself rather than as nothing at all.
 */
export function releaseDateMr(date: string): string {
  return formatDateMr(date) ?? date;
}

/**
 * Every word the share message and its controls say.
 *
 * A second object rather than more keys on `DGIPR_MR`, because these are read
 * somewhere `DGIPR_MR` never is. The panel's vocabulary is spoken to somebody
 * looking at the map, with the badge, the dateline and the green marks around
 * it to carry half the meaning. This is read in WhatsApp by somebody who has
 * never seen the map and never will, so the message has to say who issued
 * these releases in its own first line rather than assume it.
 */
export const DGIPR_SHARE_MR = {
  /* -- The message ---------------------------------------------------------
     Its first two lines are its masthead, and the third is the date. */

  /** The directorate, named without `, महाराष्ट्र शासन`.
   *
   *  Deliberately not `DGIPR_MR.issuer`, which carries the government's name
   *  too. That is right on the panel, where the line is a footer credit under
   *  a document and the reader has to be told which government. It is wrong as
   *  a message's first bold line, where the same words become a *sender* — and
   *  this app is not sending on the state's behalf. It is forwarding four
   *  notices the directorate published. */
  directorate: "माहिती व जनसंपर्क महासंचालनालय",
  heading: "महत्वाच्या बातम्यांचा सारांश",
  pdfLabel: "संपूर्ण लेख (PDF):",
  docxLabel: "संपादनयोग्य प्रत (DOCX):",

  /* -- The bar at the foot of the expanded reading ----------------------- */

  enter: "शेअर मोड सुरू करा",
  exit: "शेअर मोड बंद करा",
  /** Stands where the count stands, before anything is picked. */
  hint: "पाठवायची प्रसिद्धीपत्रके निवडा",
  selectAll: "दिसणारी सर्व निवडा",
  clear: "निवड रद्द करा",
  send: "पाठवा",
  /** Said on a card there is nothing to send from. Short on purpose: it is a
   *  reason printed on a disabled control, not an apology. */
  noFiles: "PDF व DOCX उपलब्ध नाही",

  /* -- The preview ------------------------------------------------------- */

  previewTitle: "पाठवायचा मजकूर",
  close: "बंद करा",
  whatsapp: "WhatsApp",
  whatsappLong: "WhatsApp वर पाठवा",
  copy: "कॉपी करा",
  copyLong: "संपूर्ण मजकूर कॉपी करा",
  device: "उपकरणाद्वारे पाठवा",
  deviceUnavailable: "या ब्राउझरमध्ये थेट पाठवण्याची सुविधा नाही. WhatsApp किंवा कॉपी वापरा.",
  copied: "मजकूर कॉपी झाला.",
  copyFailed: "मजकूर कॉपी करता आला नाही. मजकूर निवडून स्वतः कॉपी करा.",
  shared: "मजकूर पाठवला.",
  shareFailed: "मजकूर पाठवता आला नाही.",
  whatsappOpened: "WhatsApp उघडले जात आहे.",
  tooLongTitle: "मजकूर WhatsApp दुव्यासाठी मोठा आहे",
  tooLong:
    "निवडलेला मजकूर मोठा असल्याने काही उपकरणांवर WhatsApp दुव्यातून तो पूर्ण उघडणार नाही. संपूर्ण मजकूर पाठवण्यासाठी “कॉपी करा” वापरा आणि तो WhatsApp मध्ये चिकटवा.",
} as const;

/** `३ प्रसिद्धीपत्रके निवडली` — the tally on the share bar, agreeing in number. */
export function selectedCountMr(count: number): string {
  return count === 1
    ? `${toDevanagari(1)} ${DGIPR_MR.releaseOne} निवडले`
    : `${toDevanagari(count)} ${DGIPR_MR.releaseMany} निवडली`;
}

/** `२५१० अक्षरे` — how long the message is, under the preview's heading. */
export function charCountMr(count: number): string {
  return `${toDevanagari(count)} अक्षरे`;
}

/**
 * The one date line at the top of a share message.
 *
 * A single date when every selected release carries the same one, which is the
 * ordinary case — a share is assembled from one district's stack and a stack is
 * usually one day's. A range otherwise, because the alternative is printing the
 * newest release's date over a set that is not all from it, and a dated
 * government notice is exactly the kind of thing where that would be read as a
 * claim rather than as a heading.
 */
export function shareDateMr(dates: string[]): string {
  const span = [...new Set(dates)].sort();
  if (span.length === 0) return "";

  const first = releaseDateMr(span[0]);
  const last = releaseDateMr(span[span.length - 1]);

  return first === last ? first : `${first} – ${last}`;
}
