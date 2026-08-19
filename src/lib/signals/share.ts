import type { AnySignal } from "@/types/signal";

/**
 * A post a reader can send about one record — written by hand, never derived.
 *
 * The obvious version of this file builds the text from `card.gist` and ships
 * a share button on all nine pins. It is the wrong version. A panel summary is
 * read next to the notice it summarises, with the stage meter, the deadline and
 * the source link around it; the same sentence alone on a timeline is a claim
 * about a land acquisition with nothing standing behind it. So a record gets a
 * share button when somebody has written its post and checked it against the
 * notice, and no record gets one by default.
 *
 * `text` is what the reader sees in the composer before they edit it, so it is
 * theirs to change — which is the other reason it is written rather than
 * generated. Keep it under about 250 characters: X counts the appended `url` as
 * 23 whatever its real length.
 */
export type SharePost = {
  /** The body. Devanagari figures throughout, like the rest of the interface. */
  text: string;
  /** Appended by the composer on its own line — the source, not a share page. */
  url: string;
  /**
   * The card that goes with the post.
   *
   * The composer has no media parameter — there is no way to hand X an image
   * through an intent link — so this is downloaded to the reader's device and
   * attached by them. `src` is served from `public/`; `filename` is what lands
   * in their downloads folder, so it says what the image is of.
   */
  image: { src: string; filename: string };
  /**
   * What that image says, written out rather than folded into the post above.
   *
   * A card is not the tweet set in a nicer font. The post is read with the
   * composer around it and the link under it; the card is read on its own, at
   * thumbnail size, by somebody scrolling — so it carries the place, one
   * sentence, the date and who published it, and nothing else. Keeping the two
   * apart is also what lets `scripts/render-share-cards.mjs` redraw every card
   * when the design moves without anybody rewriting the posts.
   */
  card: {
    /** The place, as the panel says it: village, taluka, district. */
    place: string;
    /** The one sentence the card is built around. Around 140 characters — it
     *  is set large, and a card that has to be zoomed into has failed. */
    line: string;
    /** The date in words, without the label; the card prints the label. */
    deadline: string;
    /** Who published the notice. The card has to cite itself: it travels far
     *  from the panel that had a source link. */
    source: string;
  };
};

/**
 * Keyed by signal id. Exported so `scripts/render-share-cards.mjs` draws the
 * cards from these entries rather than from a second copy of them.
 *
 * Keyed by signal id. One entry today; the shape is a map because the next one
 * is a written post and a rendered card, not a code change.
 */
export const SHARE_POSTS: Readonly<Record<string, SharePost>> = {
  // Talegaon Dabhade STP — public notice of 26 Feb 2026, valid to 26 Aug 2026.
  // The area is the notice's own arithmetic: 4600 sq m for the plant plus 1000
  // for the 12 m road. "मुदत" rather than "हरकतींची मुदत" — the notice gives a
  // validity, and calling it an objection window would be us adding a fact.
  "pun-notice-e6360393": {
    text: [
      "📍 तळेगाव दाभाडे, ता. मावळ, जि. पुणे",
      "",
      "तळेगाव दाभाडे नगरपरिषद हद्दीत मैला शुद्धीकरण केंद्र (STP) व रस्त्यासाठी एकूण ५६०० चौ.मी. खाजगी जमीन थेट खरेदी पद्धतीने घेण्याबाबत जाहीर सूचना प्रसिद्ध झाली आहे.",
      "",
      "🗓 मुदत: २६ ऑगस्ट २०२६",
    ].join("\n"),
    url: "https://cdn.s3waas.gov.in/s3ffeabd223de0d4eacb9a3e6e53e5448d/uploads/2026/02/17721156463969.pdf",
    image: {
      src: "/share/pun-notice-e6360393.png",
      filename: "talegaon-dabhade-stp.png",
    },
    card: {
      place: "तळेगाव दाभाडे, ता. मावळ, जि. पुणे",
      line: "मैला शुद्धीकरण केंद्र (STP) व रस्त्यासाठी ५६०० चौ.मी. खाजगी जमीन थेट खरेदी पद्धतीने घेण्याबाबत जाहीर सूचना.",
      deadline: "२६ ऑगस्ट २०२६",
      source: "तळेगाव दाभाडे नगरपरिषद · जिल्हाधिकारी कार्यालय, पुणे",
    },
  },
};

/** The written post for a record, or null — which is most records. */
export function sharePostFor(signal: AnySignal): SharePost | null {
  return SHARE_POSTS[signal.id] ?? null;
}

/** The composer, pre-filled. `x.com/intent/post` is the current spelling of
 *  what used to be `twitter.com/intent/tweet`; the old host still redirects. */
export function composerUrl(post: SharePost): string {
  const params = new URLSearchParams({ text: post.text, url: post.url });

  return `https://x.com/intent/post?${params}`;
}
