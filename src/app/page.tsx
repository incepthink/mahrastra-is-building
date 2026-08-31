import { NewsMapShell } from "@/components/map";
import { NewsTicker, type NewsItem } from "@/components/news";
import { loadDgipr } from "@/lib/dgipr/read";
import { districtNameMr } from "@/lib/news/marathi";
import { legendBands, loadNewsMap } from "@/lib/news/read";
import { loadStories } from "@/lib/news/stories";
import { DEFAULT_WINDOW, WINDOWS } from "@/lib/news/window";
import { buildMapGeometry } from "@/lib/map/geometry";
import type { NewsArticle, NewsMap, WindowId } from "@/types/news";

/** How many headlines the band carries before it starts repeating. */
const TICKER_LENGTH = 40;

type HomePageProps = {
  searchParams: Promise<{ window?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const { window } = await searchParams;

  const [geometry, map] = await Promise.all([
    buildMapGeometry(),
    loadNewsMap(asWindow(window)),
  ]);

  // Read against the window the map actually settled on, not the one the query
  // string asked for: `loadNewsMap` widens an empty window, and two layers of
  // one map disagreeing about which days they cover is worse than either being
  // narrow. Sequential rather than parallel because both are synchronous reads
  // of the same SQLite handle, and the second needs the first one's answer.
  const stories = loadStories(map.window);

  // The third layer, read from a committed snapshot rather than the corpus —
  // see `lib/dgipr/read.ts`. It is given the window the reader asked for and
  // not the one the map settled on, because it is allowed to widen on its own
  // terms: the collector adds hundreds of articles a day where the directorate
  // issues a handful of releases, and forcing an official layer onto a scraper's
  // clock shows an authoritative-looking zero for days at a time.
  const dgipr = loadDgipr(asWindow(window));

  return (
    <main className="map-page">
      {/* The band across the top: the newest thing every district filed, most
          recent first, running past continuously. Fed from the same window the
          map is painted from, so a headline crossing the strip is always a
          headline the reader can then go and find on the sheet below. */}
      <NewsTicker items={tickerItems(map)} />

      <div className="map-stage">
        <NewsMapShell
          geometry={geometry}
          map={map}
          stories={stories}
          dgipr={dgipr}
          bands={legendBands(map)}
          window={asWindow(window)}
        />
      </div>
    </main>
  );
}

/** A query string is anything at all; this is the only place that is true. */
function asWindow(value: string | undefined): WindowId {
  return WINDOWS.some((option) => option.id === value)
    ? (value as WindowId)
    : DEFAULT_WINDOW;
}

/**
 * The band's lines: the newest piece from each district, then the rest.
 *
 * One per district first, so a hundred Mumbai headlines cannot take the strip
 * over and leave the reader watching a Mumbai ticker on a Maharashtra map.
 * After every district has had its say the remainder fills the band newest
 * first, which is what keeps it looking like a wire feed rather than a
 * round-robin.
 */
function tickerItems(map: NewsMap): NewsItem[] {
  const seen = new Set<string>();
  const firsts: NewsArticle[] = [];
  const rest: NewsArticle[] = [];

  const all = [
    ...Object.values(map.districts).flatMap((district) => district.articles),
    ...map.statewide,
  ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  for (const article of all) {
    const key = article.districtId ?? "state";

    if (seen.has(key)) {
      rest.push(article);
      continue;
    }

    seen.add(key);
    firsts.push(article);
  }

  return [...firsts, ...rest].slice(0, TICKER_LENGTH).map((article) => ({
    id: article.url,
    headline: article.headline,
    place: article.districtId ? districtNameMr(article.districtId) : "",
    url: article.url,
  }));
}
