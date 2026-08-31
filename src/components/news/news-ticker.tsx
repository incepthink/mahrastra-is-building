"use client";

import { useMemo } from "react";

import { NEWS_MR } from "@/lib/news/marathi";

/**
 * One headline as it crosses the band.
 *
 * Deliberately not a `NewsArticle`: the ticker is rendered on the client and
 * the page is rendered on the server, so what travels between them is the four
 * plain fields the band actually paints — not the standfirst, the picture, the
 * word count or the prominence workings, none of which the strip has any use
 * for and all of which it would otherwise be paying to serialise.
 */
export type NewsItem = {
  id: string;
  headline: string;
  /** Which district, in Marathi. Empty for a statewide piece. */
  place: string;
  url: string;
};

type NewsTickerProps = {
  items: NewsItem[];
};

/** Seconds of travel per character of headline text, and the floor under it.
 *  The duration is derived from the text rather than fixed, because a fixed
 *  one makes the band's speed a function of how much news happens to have
 *  landed — nine headlines would crawl and forty would blur past. Tuned to
 *  land near 70px/s: fast enough to read as live, slow enough to finish a
 *  Marathi line before it leaves the frame. */
const SECONDS_PER_CHAR = 0.13;
const MIN_DURATION = 28;

/**
 * The band across the top of the sheet: what has landed lately, running past
 * once, continuously, the way a news channel runs its strip.
 *
 * It is the one place in the product that is printed *dark* — ink ground,
 * pale type — and that is on purpose. Everything below it is a survey sheet;
 * a second pale plate stretched across the full width would have read as more
 * chrome on the same surface and would have been ignored. Inverting it makes
 * the band a different object entirely, which is what lets it sit above the
 * map without competing with a single district.
 *
 * Each headline is led by a plain disc rather than by a sector dot. The sector
 * taxonomy the dot used to carry does not exist in this corpus and inventing
 * one from keywords would have been the strip asserting something the data
 * does not say, so the mark is punctuation now: it separates headlines and
 * claims nothing.
 *
 * Every line is a link now. The strip used to be a read-only summary of pins
 * that were clickable below it, which made it the one live-looking thing on
 * the page that did nothing when pressed.
 *
 * The list is rendered twice and the track translated by exactly half its
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
    <section className="news-ticker" lang="mr" aria-label={NEWS_MR.tickerAria}>
      {/* The one fixed thing on the band. It does not scroll, so the strip
          still says what it is at any moment of the loop. */}
      <p className="news-ticker-label">
        <span className="news-ticker-dot" aria-hidden />
        {NEWS_MR.ticker}
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
function NewsRun({
  items,
  ...rest
}: { items: NewsItem[] } & React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className="news-ticker-run" {...rest}>
      {items.map((item) => (
        <li key={item.id} className="news-ticker-item">
          <a
            className="news-ticker-link"
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            // The duplicate run is inert to the pointer and to the reader: two
            // copies of every headline in the tab order is the accessibility
            // cost of a seamless loop, and this is how it is not paid.
            tabIndex={rest["aria-hidden"] ? -1 : undefined}
          >
            <span className="news-ticker-mark" aria-hidden />
            <span className="news-ticker-head">{item.headline}</span>
            {item.place ? <span className="news-ticker-place">{item.place}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
