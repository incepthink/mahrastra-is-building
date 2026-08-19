"use client";

import { useMemo } from "react";

import { categoryOf } from "@/lib/signals/format";
import { MR } from "@/lib/signals/marathi";
import type { SignalCategoryId } from "@/types/signal";

/**
 * One headline as it crosses the band.
 *
 * Deliberately not a `Signal`: the ticker is rendered on the client and the
 * page is rendered on the server, so what travels between them is the four
 * plain fields the band actually paints. The sector arrives as an id rather
 * than as a resolved icon and tint, because a Lucide component is a function
 * and functions do not cross that boundary.
 */
export type NewsItem = {
  id: string;
  headline: string;
  place: string;
  category: SignalCategoryId;
};

type NewsTickerProps = {
  items: NewsItem[];
};

/** Seconds of travel per character of headline text, and the floor under it.
 *  The duration is derived from the text rather than fixed, because a fixed
 *  one makes the band's speed a function of how many records happen to be
 *  published — nine notices would crawl and thirty would blur past. Tuned
 *  against the live set to land near 70px/s: fast enough to read as live, slow
 *  enough to finish a Marathi line before it leaves the frame. */
const SECONDS_PER_CHAR = 0.13;
const MIN_DURATION = 28;

/**
 * The band across the top of the sheet: what has landed lately, running past
 * once, continuously, the way a news channel runs its strip.
 *
 * It is the one place in the product that is printed *dark* — ink ground,
 * cream type — and that is on purpose. Everything below it is a survey sheet:
 * cream stock, black rules, colour only where it means something. A second
 * cream plate stretched across the full width would have read as more chrome
 * on the same sheet and would have been ignored. Inverting it makes the band a
 * different object entirely, which is what lets it sit above the map without
 * competing with a single pin.
 *
 * The house colours still do all the work — the label block is the same
 * highlight yellow as the wordmark, and each headline is led by its sector
 * plate, the same pastel disc the legend keys and the pin wears. So a reader
 * who sees a sky-blue dot go past knows it is water before they read a word.
 *
 * The list is rendered twice and the track is translated by exactly half its
 * width, so the loop closes on itself with no gap and no jump — the second
 * copy is `aria-hidden`, and a screen reader gets the headlines once. Hover or
 * focus anywhere on the band holds it still, because a line you cannot stop is
 * a line you cannot finish reading.
 */
export function NewsTicker({ items }: NewsTickerProps) {
  const duration = useMemo(() => {
    const characters = items.reduce(
      (total, item) => total + item.headline.length + item.place.length,
      0,
    );

    return Math.max(MIN_DURATION, Math.round(characters * SECONDS_PER_CHAR));
  }, [items]);

  // Nothing to say is said by saying nothing: an empty band would be a strip of
  // black across the top of the map claiming to be live.
  if (items.length === 0) return null;

  return (
    <section className="news-ticker" lang="mr" aria-label={MR.newsAria}>
      {/* The one fixed thing on the band. It does not scroll, so the strip
          still says what it is at any moment of the loop. */}
      <p className="news-ticker-label">
        <span className="news-ticker-dot" aria-hidden />
        {MR.newsLabel}
      </p>

      <div className="news-ticker-viewport">
        <div
          className="news-ticker-track"
          style={{ "--ticker-duration": `${duration}s` } as React.CSSProperties}
        >
          <NewsRun items={items} />
          <NewsRun items={items} aria-hidden />
        </div>
      </div>
    </section>
  );
}

/** One pass of the list. Two of these sit in the track end to end. */
function NewsRun({ items, ...rest }: { items: NewsItem[] } & React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className="news-ticker-run" {...rest}>
      {items.map((item) => (
        <li key={item.id} className="news-ticker-item">
          <span
            className="news-ticker-mark"
            style={{ "--sector": categoryOf(item.category).tint } as React.CSSProperties}
            aria-hidden
          />
          <span className="news-ticker-head">{item.headline}</span>
          {item.place ? <span className="news-ticker-place">{item.place}</span> : null}
        </li>
      ))}
    </ul>
  );
}
