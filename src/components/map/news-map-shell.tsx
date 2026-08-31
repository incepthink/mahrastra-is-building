"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { NewsMap } from "./news-map";
import type { DgiprMap } from "@/types/dgipr";
import type { MapGeometry } from "@/types/map";
import type { NewsMap as NewsMapData, NewsStories, WindowId } from "@/types/news";

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
}: NewsMapShellProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setWindow = useCallback(
    (id: WindowId) => {
      startTransition(() => {
        // `replace`, not `push`: flipping between windows is adjusting a view,
        // not navigating, and stacking six of them in the history means six
        // presses of Back to leave the page.
        router.replace(`/?window=${id}`, { scroll: false });
      });
    },
    [router],
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
      pending={pending}
    />
  );
}
