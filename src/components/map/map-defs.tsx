/**
 * The land silhouette, the clip taken from it, and the one gradient it is
 * filled with.
 *
 * `#map-land-shape` is defined once and referenced by `<use>` for the sheet,
 * the contact shadow, the coastline and the clip — four layers off one ~85 kB
 * path string instead of four copies of it in the DOM.
 *
 * `#map-land-fill` is the only gradient on the map and it is barely a colour:
 * two steps of near-white on the same diagonal the lavender page behind it
 * runs on. The state is the quietest surface on screen on purpose — every
 * saturated thing here is a mark standing on it. Districts are not filled at
 * all; the land shows through and the hairlines divide it. There is no hatch,
 * no division tint and no per-district colour; see `DistrictPath` for why each
 * of those went.
 */
export function MapDefs({ landPath }: { landPath: string }) {
  return (
    <defs>
      <path id="map-land-shape" d={landPath} />

      <clipPath id="map-land-clip">
        <use href="#map-land-shape" />
      </clipPath>

      {/* `objectBoundingBox` units, so the sweep is across the silhouette's own
          bounds and holds at every zoom — the camera scales the geometry, not
          the gradient. */}
      <linearGradient id="map-land-fill" x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="var(--color-land)" />
        <stop offset="100%" stopColor="var(--color-land-deep)" />
      </linearGradient>

      {/* The cast under the state. It used to be a tight, warm contact shadow —
          paper resting on paper. There is no paper under the land any more:
          the frame is transparent and the silhouette sits directly on the
          page's lavender wash, so this is the one thing separating the two.
          Wider, softer and cooler to match, and pushed further down, because a
          shape this large needs a long cast to read as raised rather than as a
          shape with a dark edge. */}
      <filter id="map-contact" x="-18%" y="-18%" width="136%" height="136%">
        <feDropShadow
          dx="0"
          dy="14"
          stdDeviation="20"
          floodColor="#1a1a30"
          floodOpacity="0.16"
        />
      </filter>
    </defs>
  );
}
