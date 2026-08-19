import { MaharashtraMap } from "@/components/map";
import { NewsTicker, type NewsItem } from "@/components/news";
import {
  PUBLISHED_SIGNAL_IDS,
  loadPublishedSignals,
  recentPulse,
} from "@/data/signals";
import { buildMapGeometry } from "@/lib/map/geometry";
import { projectPoint } from "@/lib/map/project";
import { headlineMr, placeMr } from "@/lib/signals/marathi";
import type { Signal } from "@/types/signal";

export default async function HomePage() {
  const [geometry, { signals }, pulse] = await Promise.all([
    buildMapGeometry(),
    loadPublishedSignals(),
    recentPulse(),
  ]);

  // Projected here rather than in the browser: the client gets viewBox points
  // and never has to know the projection existed.
  const placed = signals.map((signal) => ({
    signal,
    point: projectPoint(signal.coordinates, geometry.projector),
  }));

  return (
    <main className="map-page">
      {/* The band across the top: the same records that are pinned below, newest
          first, running past continuously. It is fed from the published set
          rather than the whole scraped corpus so that every headline crossing
          the strip is a headline the reader can then go and click. */}
      <NewsTicker items={newsItems(signals)} />

      <div className="map-stage">
        <MaharashtraMap
          geometry={geometry}
          signals={placed}
          published={PUBLISHED_SIGNAL_IDS.length}
          pulse={pulse}
        />
      </div>
    </main>
  );
}

/**
 * The published records as ticker lines, newest first.
 *
 * Flattened to four plain fields on the server: the ticker is a client
 * component, and a `Signal` carries provenance, confidence and a source URL
 * that the band has no use for and should not be paying to serialise.
 */
function newsItems(signals: Signal[]): NewsItem[] {
  return [...signals]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((signal) => ({
      id: signal.id,
      headline: headlineMr(signal),
      place: placeMr(signal),
      category: signal.category,
    }));
}
