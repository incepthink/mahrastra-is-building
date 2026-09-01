"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { MODAL_GRID, PanelModal, PanelTools } from "./panel-modal";
import {
  agoMr,
  articleCountMr,
  districtNameMr,
  NEWS_MR,
  prominenceMr,
  toDevanagari,
} from "@/lib/news/marathi";
import type { NewsArticle } from "@/types/news";

const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

const panelVariants = {
  hidden: { opacity: 0, x: 40 },
  shown: {
    opacity: 1,
    x: 0,
    transition: { ...SPRING, staggerChildren: 0.04, delayChildren: 0.08 },
  },
  gone: { opacity: 0, x: 28, transition: { duration: 0.18 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
  gone: { opacity: 0 },
};

export type PanelSubject =
  | { kind: "district"; districtId: string }
  | { kind: "state" };

type NewsPanelProps = {
  subject: PanelSubject | null;
  articles: NewsArticle[];
  /** The district's own count. Equal to `articles.length` since `read.ts`
   *  stopped clipping the lists it hands over; kept as a separate figure
   *  because the tally is a claim about the district and not about the array. */
  total: number;
  /**
   * Who the map is narrowed to, if anyone, as the plate names them.
   *
   * Carried purely so the panel cannot be misread. A district that files forty
   * pieces a day showing three of them, with a heading that says only the
   * district's name, reads as a quiet district — and the tally underneath says
   * "3" in support of that. One line saying whose news this is turns the same
   * screen from wrong into narrow.
   */
  ministerNameMr: string | null;
  now: Date | null;
  onClose: () => void;
};

/**
 * What a district is reading, as a list you can actually read.
 *
 * The panel this replaces showed one record at a time, because the curated set
 * gave a district two or three notices and each one deserved a screen. A
 * district files forty articles a day, so one-at-a-time would mean forty
 * clicks to find out what is going on in Nashik. The unit of the panel is
 * therefore the *place*, not the piece.
 *
 * Every item links out and none of them opens a reader here. The collector
 * stores article bodies, and this is the boundary where that stops travelling:
 * republishing a Marathi daily in full is a different act from pointing at it,
 * and the whole arrangement this map operates under is that the papers keep
 * their readers. So the panel shows the headline, the publisher's own
 * standfirst and their picture, then sends you to them.
 */
export function NewsPanel({
  subject,
  articles,
  total,
  ministerNameMr,
  now,
  onClose,
}: NewsPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const subjectKey = subject
    ? subject.kind === "state"
      ? "state"
      : subject.districtId
    : null;

  /**
   * Which subject is being read full-page, rather than whether one is.
   *
   * Held as the subject's own key so that picking a different district closes
   * the grid by arithmetic rather than by an effect that has to notice and
   * correct itself. Carrying a `true` across to the next district would leave
   * the reader looking at a grid whose heading changed underneath them, and
   * the version of this that resets a boolean in an effect is a cascading
   * render for a fact that was already derivable.
   */
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = subjectKey !== null && expandedFor === subjectKey;

  /**
   * What the reader is hunting for inside the expanded grid.
   *
   * Cleared by whoever opens or closes the sheet rather than by an effect
   * watching `expanded`, for the reason the comment above gives about
   * `expandedFor`: both moments are already handlers, and a query surviving
   * into the next district would show that district's forty articles filtered
   * by a word the reader typed about a different one.
   *
   * The docked panel is deliberately not filtered by it. That column is a list
   * you scroll; the grid is forty cards at once, which is where scanning turns
   * into hunting — and a field in the corner of the panel quietly hiding rows
   * behind the reader's back is the version of this that causes support
   * tickets.
   */
  const [query, setQuery] = useState("");

  function openExpanded(key: string) {
    setQuery("");
    setExpandedFor(key);
  }

  function closeExpanded() {
    setQuery("");
    setExpandedFor(null);
  }

  // A new subject is a new list, and inheriting the last one's scroll offset
  // drops the reader into the middle of a district they just opened.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [subject]);

  useEffect(() => {
    // While the grid is open it owns Escape — otherwise one press closes both
    // it and the panel underneath, and the reader loses their place instead of
    // stepping back to it.
    if (!subject || expanded) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [subject, expanded, onClose]);

  const place = subject
    ? subject.kind === "state"
      ? NEWS_MR.statewide
      : districtNameMr(subject.districtId)
    : "";

  /**
   * The place, and — when one is chosen — whose news this is: `पुणे - मुख्यमंत्री`.
   *
   * The filter used to be an eyebrow line over the heading, on the argument
   * that the panel must not be misread: a district that files forty pieces a
   * day showing three, under a heading that says only "Pune", reads as a quiet
   * district. That argument was right and the placement was wrong. A reader
   * scanning a panel reads the big line, not the small grey one above it, so
   * the one qualifier that changes what the whole list means was sitting in
   * the least-read position on the panel. Joined to the heading it cannot be
   * read past.
   */
  const title = ministerNameMr ? `${place} - ${ministerNameMr}` : place;

  const eyebrow =
    subject?.kind === "state" ? NEWS_MR.statewideHint : NEWS_MR.districtOne;

  // How much this place filed in the window, whole. It used to read `२४ / ७१`
  // whenever the server had clipped the list; `read.ts` no longer clips, so
  // there is one number and it is the district's own. See the note on
  // `panelTotal` in `news-map.tsx`.
  const tally = articleCountMr(total);

  /** Every word the reader typed, each of which has to be found somewhere. */
  const terms = useMemo(() => searchTerms(query), [query]);

  const found = useMemo(
    () => (terms.length === 0 ? articles : articles.filter((article) => hits(article, terms))),
    [articles, terms],
  );

  /**
   * The lead badge, pinned to the article rather than to a row number.
   *
   * `articles[0]` is the piece the papers played hardest — see
   * `byProminenceThenTime` — and the badge is a claim about that piece. Marking
   * whatever happens to be first *after* a search would move the badge onto
   * the top match, which is a claim about the reader's query and not about the
   * press.
   */
  const leadUrl =
    articles.length > 0 && prominenceMr(articles[0]) ? articles[0].url : null;

  // The grid's own count, which is a different figure from the panel's: the
  // panel says how much this district filed, and this says how much of it the
  // search left standing.
  const gridTally =
    terms.length > 0
      ? `${toDevanagari(found.length)} / ${articleCountMr(articles.length)}`
      : tally;

  return (
    <>
      <AnimatePresence>
        {subject ? (
          <motion.aside
            key={subjectKey}
            className="news-panel"
            lang="mr"
            role="dialog"
            aria-label={title}
            variants={panelVariants}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            <header className="news-panel-head">
              <div>
                <p className="news-panel-eyebrow">{eyebrow}</p>
                <h2 className="news-panel-title">{title}</h2>
                <p className="news-panel-tally">{tally}</p>
              </div>

              {/* No expand on an empty district: a full page whose only content
                  is "nothing was filed here" is a worse way to say it than the
                  one line the panel already says it in. */}
              <PanelTools
                onClose={onClose}
                onExpand={
                  articles.length > 0 && subjectKey
                    ? () => openExpanded(subjectKey)
                    : undefined
                }
              />
            </header>

            <div className="news-panel-list" ref={listRef}>
              {articles.length === 0 ? (
                <p className="news-panel-empty">
                  {ministerNameMr ? NEWS_MR.ministerEmpty : NEWS_MR.emptyDistrict}
                </p>
              ) : (
                articles.map((article) => (
                  <ArticleCard
                    key={article.url}
                    article={article}
                    now={now}
                    // The first card is the one the papers played hardest, not
                    // simply the newest — see `byProminenceThenTime`. It is
                    // badged only when the evidence supports the claim.
                    lead={article.url === leadUrl}
                  />
                ))
              )}
            </div>

            <footer className="news-panel-foot">
              <p>{NEWS_MR.credit}</p>
            </footer>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* The same list, the same cards and the same footer, over the whole page.
          What the width buys is columns — see `PanelModal`. */}
      <PanelModal
        open={expanded}
        onClose={closeExpanded}
        // Escape unwinds one level at a time, the way it does in the DGIPR
        // sheet: a reader who has narrowed forty cards to three and presses it
        // means "give me the forty back", not "throw the district away".
        onEscape={query ? () => setQuery("") : closeExpanded}
        eyebrow={eyebrow}
        title={title}
        tally={gridTally}
        tools={
          <PanelSearch value={query} onChange={setQuery} />
        }
        foot={NEWS_MR.credit}
      >
        {/* The grid is deliberately not keyed by the query. Re-mounting it on
            every keystroke would tear down and rebuild forty cards — and forty
            `<img>` elements pointing at forty publishers — for a filter that
            changes which of them are on screen and nothing else. Keyed by URL,
            a card that survives the keystroke stays exactly where it is, and
            only the ones that arrive animate in. */}
        {found.length === 0 ? (
          <div className="panel-modal-empty">
            <p>{NEWS_MR.searchEmpty}</p>
            <button type="button" className="panel-search-reset" onClick={() => setQuery("")}>
              {NEWS_MR.searchAll}
            </button>
          </div>
        ) : (
          <motion.div
            className="panel-modal-grid"
            variants={MODAL_GRID}
            initial="hidden"
            animate="shown"
          >
            {found.map((article) => (
              <ArticleCard
                key={article.url}
                article={article}
                now={now}
                lead={article.url === leadUrl}
              />
            ))}
          </motion.div>
        )}
      </PanelModal>
    </>
  );
}

/**
 * The grid's filter, over the words the sheet is already showing.
 *
 * Deliberately not a fuzzy match and not a ranker. Every card here carries a
 * Marathi headline and, usually, an English standfirst the publisher wrote
 * themselves, and readers arrive at this field with a word they have *just
 * read on the screen* — `कुंभमेळा`, `Samruddhi`, a minister's surname. A
 * substring match on those two fields answers that question exactly, and an
 * approximate matcher would answer a question nobody asked by returning cards
 * that do not contain the word.
 *
 * `section` is searched with them because it is how the papers themselves
 * label a desk, and it is the only handle a reader has on "the Vidarbha
 * pieces" — but it is never displayed on a card, so it is the one field where
 * a match is invisible. That is the right trade: a search that returns a card
 * whose match is not visible is odd, and one that ignores the word the site
 * itself printed is broken.
 */
function searchTerms(query: string): string[] {
  return normalise(query).split(" ").filter(Boolean);
}

/**
 * Every term, somewhere in the piece — not the whole query in one field.
 *
 * `मुख्यमंत्री नाशिक` should find the Nashik piece with the CM in its headline,
 * and it does not appear anywhere as that phrase: one word is in the headline
 * and the other is in the standfirst. AND across terms and OR across fields is
 * what makes a two-word query narrow the grid instead of emptying it.
 */
function hits(article: NewsArticle, terms: string[]): boolean {
  const haystack = normalise(
    `${article.headline} ${article.description ?? ""} ${article.section ?? ""}`,
  );

  return terms.every((term) => haystack.includes(term));
}

/**
 * The one form both sides of a comparison are put into.
 *
 * `NFC` because the same Devanagari word can arrive from two publishers in two
 * normalisation forms and compare unequal while looking identical — the
 * decomposed spelling of नाशिक is a different string from the composed one,
 * and a reader typing on a phone keyboard has no way to know which one the
 * page holds. `toLowerCase` is a no-op on Devanagari and the whole point on
 * the English standfirsts. The zero-width joiners are stripped because they
 * are invisible: a query that fails on a character nobody can see is a bug
 * with no symptom.
 */
function normalise(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The field itself.
 *
 * Uncontrolled focus and a controlled value: the sheet owns the query because
 * the grid, the tally and Escape all read it, and this is only the way it is
 * typed. `type="search"` rather than `text` so a phone offers a search key on
 * the keyboard; the browser's own clear affordance is turned off in the CSS in
 * favour of a button, because WebKit's is invisible until the field has focus
 * and reads as nothing at all next to a Devanagari placeholder.
 */
function PanelSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();

  return (
    <div className="panel-search" data-filled={value ? "" : undefined}>
      <label className="panel-search-label" htmlFor={inputId}>
        {NEWS_MR.search}
      </label>

      <Search className="panel-search-mark" size={15} strokeWidth={2.2} aria-hidden />

      <input
        id={inputId}
        className="panel-search-input"
        type="search"
        lang="mr"
        value={value}
        placeholder={NEWS_MR.searchPlaceholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />

      {/* Only when there is something to clear — a permanently lit X in a field
          with nothing in it is a button that does nothing. */}
      {value ? (
        <button
          type="button"
          className="panel-search-clear"
          onClick={() => onChange("")}
          aria-label={NEWS_MR.searchClear}
          title={NEWS_MR.searchClear}
        >
          <X size={14} strokeWidth={2.4} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function ArticleCard({
  article,
  now,
  lead,
}: {
  article: NewsArticle;
  now: Date | null;
  lead: boolean;
}) {
  const ago = agoMr(article.publishedAt, now);
  const played = prominenceMr(article);

  return (
    <motion.a
      className="news-card"
      href={article.url}
      target="_blank"
      rel="noreferrer noopener"
      variants={ITEM}
      data-lead={lead || undefined}
    >
      {article.imageUrl ? (
        /* The publisher's own picture, at the publisher's own URL.
           `next/image` is deliberately not used, and the lint rule that wants
           it assumes we own the image: it would fetch, re-encode and serve a
           copy of every one of these through our optimiser, which turns
           pointing at someone's photograph into serving it. Lazy and
           `no-referrer` for the two costs we can control — opening a panel
           should not cost the reader forty image fetches, nor report their
           browsing back to the publisher. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="news-card-image"
          src={article.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : null}

      <div className="news-card-body">
        <p className="news-card-meta">
          {ago ? <span className="news-card-ago">{ago}</span> : null}
          {article.revisions > 0 ? (
            <span className="news-card-revised">
              {toDevanagari(article.revisions)} {NEWS_MR.updatedTimes}
            </span>
          ) : null}
        </p>

        <h3 className="news-card-headline">{article.headline}</h3>

        {article.description ? (
          <p className="news-card-standfirst">{article.description}</p>
        ) : null}

        {played ? (
          <p className="news-card-played">
            <span className="news-card-played-mark" aria-hidden />
            {played}
          </p>
        ) : null}
      </div>

      <ArrowUpRight className="news-card-out" size={15} strokeWidth={2.2} aria-hidden />
    </motion.a>
  );
}
