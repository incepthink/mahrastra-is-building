"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { NewsMap } from "./news-map";
import { ministerParam } from "@/data/ministers";
import type { DgiprMap } from "@/types/dgipr";
import type { MapGeometry } from "@/types/map";
import type {
  MinisterFilter,
  NewsMap as NewsMapData,
  NewsStories,
  WindowId,
} from "@/types/news";

type NewsMapShellProps = {
  geometry: MapGeometry;
  map: NewsMapData;
  /** The story layer for the same window, or null when it has never been
   *  built. Read on the server beside the map rather than fetched when the
   *  reader switches modes — see the mode note in `NewsMap`. */
  stories: NewsStories | null;
  /** The DGIPR overlay for the same request. Never null — it is a committed
   *  snapshot rather than a store that may not have been built — but it can be
   *  empty, in which case the filter is offered with a count of zero rather
   *  than withheld. */
  dgipr: DgiprMap;
  bands: Array<{ level: number; min: number; max: number }>;
  window: WindowId;
  /** Who the map is narrowed to. In the URL for the same reason the window is:
   *  it decides which rows exist. See `setFilters`. */
  minister: MinisterFilter | null;
};

/**
 * Holds the one control that has to go back to the server.
 *
 * The mode chips are answered in the browser — both layers are already in
 * memory, so flipping between them redraws something we hold. The time window
 * is not: it decides which rows exist at all, and the corpus behind it
 * is 665 articles today and will be tens of thousands by winter, so shipping
 * every window to the client so one can be picked would mean downloading a
 * month of news to look at a day of it.
 *
 * So the window lives in the URL and the server re-queries. That also makes
 * every view of this map a link — `?window=7d` is a page somebody can send to
 * somebody else, which a piece of component state never is.
 *
 * `useTransition` is what keeps the swap from feeling like a page load: the
 * current map stays on screen and interactive while the next one is fetched,
 * and `pending` is passed down so the frame can say it is working rather than
 * appearing to have ignored the click.
 */
export function NewsMapShell({
  geometry,
  map,
  stories,
  dgipr,
  bands,
  window,
  minister,
}: NewsMapShellProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * Both server-side controls, written as one query string.
   *
   * They have to move together. Building the URL from one of them and letting
   * the other fall back to its default would mean picking a minister silently
   * reset the window to 24 hours — the classic bug of a URL that is the state
   * rather than a projection of it, hit the first time a second parameter is
   * added. So this takes the whole next state and prints it.
   */
  const setFilters = useCallback(
    (next: { window: WindowId; minister: MinisterFilter | null }) => {
      const params = new URLSearchParams({ window: next.window });
      const who = ministerParam(next.minister);

      // Absent rather than empty when there is no filter: `?minister=` is a
      // value the parser would have to have an opinion about, and "no filter"
      // is better said by saying nothing.
      if (who) params.set("minister", who);

      startTransition(() => {
        // `replace`, not `push`: adjusting a view is not navigating, and
        // stacking six of them in the history means six presses of Back to
        // leave the page.
        router.replace(`/?${params.toString()}`, { scroll: false });
      });
    },
    [router],
  );

  const setWindow = useCallback(
    (id: WindowId) => setFilters({ window: id, minister }),
    [setFilters, minister],
  );

  const setMinister = useCallback(
    (next: MinisterFilter | null) => setFilters({ window, minister: next }),
    [setFilters, window],
  );

  return (
    <NewsMap
      geometry={geometry}
      map={map}
      stories={stories}
      dgipr={dgipr}
      bands={bands}
      window={window}
      onWindow={setWindow}
      minister={minister}
      onMinister={setMinister}
      pending={pending}
    />
  );
}
