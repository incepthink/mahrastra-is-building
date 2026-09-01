"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  agoMr,
  articleCountMr,
  districtNameMr,
  NEWS_MR,
  storyPlaceMr,
  toDevanagari,
} from "@/lib/news/marathi";
import type { Story, StoryStep } from "@/types/news";

const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

const panelVariants = {
  hidden: { opacity: 0, x: 40 },
  shown: {
    opacity: 1,
    x: 0,
    transition: { ...SPRING, staggerChildren: 0.05, delayChildren: 0.1 },
  },
  gone: { opacity: 0, x: 28, transition: { duration: 0.18 } },
};

const STEP = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
  gone: { opacity: 0 },
};

type StoryPanelProps = {
  story: Story | null;
  now: Date | null;
  onClose: () => void;
};

/**
 * One running story, as the sequence it actually was.
 *
 * `NewsPanel` renders a district's articles as a reading list sorted by
 * prominence then recency, which is right for a place: forty unrelated pieces
 * have no order but importance. It is the wrong shape for a story. The Long
 * March corpus is literally a sequence — students set off from Amravati, the
 * minister negotiates until three in the morning, the High Court orders, the
 * march is suspended at Babulgaon, it is withdrawn after seventeen days — and
 * a list sorted by prominence hides the one interesting thing about it, which
 * is that it moved.
 *
 * So the unit here is the **step**, not the piece: time, headline, and the
 * place where the place changed. The rail down the left is the
 * chronology; the reader can see at a glance that the story ran over two days
 * and travelled two districts.
 *
 * The same boundary as everywhere else holds: the collector stores article
 * bodies and none of them arrive here. A step carries the publisher's own
 * headline and a link back to the publisher, and nothing else.
 */
export function StoryPanel({ story, now, onClose }: StoryPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [story?.id]);

  useEffect(() => {
    if (!story) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [story, onClose]);

  return (
    <AnimatePresence>
      {story ? (
        <motion.aside
          key={story.id}
          className="news-panel story-panel"
          lang="mr"
          role="dialog"
          aria-label={story.titleMr}
          variants={panelVariants}
          initial="hidden"
          animate="shown"
          exit="gone"
        >
          <header className="news-panel-head">
            <div>
              <p className="news-panel-eyebrow">{NEWS_MR.storyHint}</p>
              <h2 className="news-panel-title story-title">{story.titleMr}</h2>

              {/* Where the story is pinned. The tier that used to be spelled
                  out beside it is gone: the head is three lines over a
                  chronology, and a reader who clicked a mark wants the story,
                  not a note on how confidently it was placed. The precision is
                  still readable where it is actually load-bearing — in the
                  shape of the mark, and on a step that names the town it
                  moved to. */}
              <p className="story-place">
                <span className="story-place-name">{storyPlaceMr(story)}</span>
              </p>
            </div>

            <button
              type="button"
              className="news-panel-close"
              onClick={onClose}
              aria-label={NEWS_MR.close}
            >
              <X size={17} strokeWidth={2.2} aria-hidden />
            </button>
          </header>

          <div className="news-panel-list story-flow" ref={listRef}>
            <p className="story-flow-head">
              <span className="story-flow-label">{NEWS_MR.progression}</span>
              <span className="story-flow-tally">
                {story.steps.length < story.articles
                  ? `${toDevanagari(story.steps.length)} / ${articleCountMr(story.articles)}`
                  : articleCountMr(story.articles)}
              </span>
            </p>

            {story.steps.map((step, index) => (
              <Step
                key={step.url}
                step={step}
                now={now}
                // A step is worth marking with its place only when the place
                // changed. Repeating "Babulgaon" down five rows says nothing;
                // printing it on the row where the story arrived there is the
                // movement the panel exists to show.
                moved={placeOf(step) !== null && placeOf(step) !== placeOf(story.steps[index - 1])}
                last={index === story.steps.length - 1}
              />
            ))}
          </div>

          <footer className="news-panel-foot">
            <p>{NEWS_MR.credit}</p>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * What a step says about where it happened.
 *
 * The two tiers are not two grades of the same fact and are not printed as
 * though they were. A taluka-tier step names a place the article itself named:
 * the march reached Babulgaon. A district-tier step names only the desk that
 * filed the piece, and printing that bare would say the march went back to
 * Amravati on its fourth day — it did not; the Vidarbha desk is simply there. That is the exact error `news-pin-placement-design` was written
 * against, and it would be reintroduced here, in words, under a map built to
 * avoid it. So a desk is labelled a desk.
 */
function placeOf(step: StoryStep | undefined): string | null {
  if (!step) return null;
  if (step.placeTier === "taluka" && step.talukaNameMr) return step.talukaNameMr;

  return step.districtId
    ? `${districtNameMr(step.districtId)} ${NEWS_MR.storyDesk}`
    : null;
}

function Step({
  step,
  now,
  moved,
  last,
}: {
  step: StoryStep;
  now: Date | null;
  moved: boolean;
  last: boolean;
}) {
  const ago = agoMr(step.publishedAt, now);
  const place = placeOf(step);

  return (
    <motion.a
      className="story-step"
      href={step.url}
      target="_blank"
      rel="noreferrer noopener"
      variants={STEP}
      data-last={last || undefined}
    >
      {/* The rail: a numbered node and the line running to the next one. The
          line stops at the last step rather than trailing into the footer,
          because a chronology that fades out implies more of it exists. */}
      <span className="story-step-rail" aria-hidden>
        <span className="story-step-node">{toDevanagari(step.step)}</span>
      </span>

      <span className="story-step-body">
        <span className="story-step-meta">
          {ago ? <span className="news-card-ago">{ago}</span> : null}
          <time className="story-step-clock" dateTime={step.publishedAt}>
            {clockMr(step.publishedAt)}
          </time>
        </span>

        <span className="story-step-headline">{step.headline}</span>

        {/* Printed only where the story moved. See `moved`. */}
        {moved && place ? (
          <span className="story-step-place" data-tier={step.placeTier ?? "district"}>
            {place}
          </span>
        ) : null}
      </span>

      <ArrowUpRight className="story-step-out" size={14} strokeWidth={2.2} aria-hidden />
    </motion.a>
  );
}

/**
 * The day and hour of a step, in Devanagari digits.
 *
 * A progression needs absolute times as well as relative ones: "२ दिवसांपूर्वी"
 * on three consecutive rows tells a reader nothing about the shape of the
 * story, and the shape is the point. Formatted by hand rather than through
 * `Intl` so the server and the client cannot disagree about a locale.
 */
function clockMr(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const pad = (value: number) => toDevanagari(value).padStart(2, "०");

  return `${pad(at.getDate())}/${pad(at.getMonth() + 1)} · ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
