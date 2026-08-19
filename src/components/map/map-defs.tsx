/**
 * The land silhouette, the clip taken from it, and the one gradient it is
 * filled with.
 *
 * `#map-land-shape` is defined once and referenced by `<use>` for the sheet,
 * the contact shadow, the coastline and the clip — four layers off one ~85 kB
 * path string instead of four copies of it in the DOM.
 *
 * `#map-land-fill` is the only gradient on the map and it is one hue: mint,
 * two shades of it, on the same diagonal the page behind it runs on. Districts
 * are not filled at all — the sheet shows through and the hairlines divide it.
 * There is no hatch, no division tint and no per-district colour here; see
 * `DistrictPath` for why each of those went.
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
        <stop offset="0%" stopColor="var(--color-mint-300)" />
        <stop offset="100%" stopColor="var(--color-mint-200)" />
      </linearGradient>

      {/* Contact shadow under the sheet. Tight and warm — paper on paper, not
          an element floating in space. */}
      <filter id="map-contact" x="-12%" y="-12%" width="124%" height="124%">
        <feDropShadow
          dx="0"
          dy="5"
          stdDeviation="7"
          floodColor="#14120c"
          floodOpacity="0.22"
        />
      </filter>
    </defs>
  );
}
