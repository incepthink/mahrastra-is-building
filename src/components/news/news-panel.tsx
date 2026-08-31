"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  /** How many exist behind the capped list. See `PER_DISTRICT` in `read.ts`. */
  total: number;
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

  const title = subject
    ? subject.kind === "state"
      ? NEWS_MR.statewide
      : districtNameMr(subject.districtId)
    : "";

  const eyebrow = subject?.kind === "state" ? NEWS_MR.statewideHint : NEWS_MR.districtOne;

  // The true figure and not the length of the list, in both readings. See the
  // note on `panelTotal` in `news-map.tsx`.
  const tally =
    articles.length < total
      ? `${toDevanagari(articles.length)} / ${articleCountMr(total)}`
      : articleCountMr(total);

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
                  ? () => setExpandedFor(subjectKey)
                  : undefined
              }
              />
            </header>

            <div className="news-panel-list" ref={listRef}>
              {articles.length === 0 ? (
                <p className="news-panel-empty">{NEWS_MR.emptyDistrict}</p>
              ) : (
                articles.map((article, index) => (
                  <ArticleCard
                    key={article.url}
                    article={article}
                    now={now}
                    // The first card is the one the papers played hardest, not
                    // simply the newest — see `byProminenceThenTime`. It is
                    // badged only when the evidence supports the claim.
                    lead={index === 0 && Boolean(prominenceMr(article))}
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
        onClose={() => setExpandedFor(null)}
        eyebrow={eyebrow}
        title={title}
        tally={tally}
        foot={NEWS_MR.credit}
      >
        <motion.div
          className="panel-modal-grid"
          variants={MODAL_GRID}
          initial="hidden"
          animate="shown"
        >
          {articles.map((article, index) => (
            <ArticleCard
              key={article.url}
              article={article}
              now={now}
              lead={index === 0 && Boolean(prominenceMr(article))}
            />
          ))}
        </motion.div>
      </PanelModal>
    </>
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
