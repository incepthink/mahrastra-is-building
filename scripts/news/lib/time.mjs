/**
 * One timestamp format in the database, always UTC.
 *
 * The sources hand back `2026-08-29T22:01:44+05:30` and this engine generates
 * `2026-08-29T16:31:44.000Z`. Storing both shapes in the same column looks
 * harmless until something does `GROUP BY` on the hour or `ORDER BY` across
 * sources — string comparison then treats an IST timestamp as five and a half
 * hours later than it is, and every velocity curve is quietly wrong.
 *
 * So everything is normalised on write. Reading back in IST is exact and
 * lossless: India has a fixed +05:30 offset and no daylight saving, which is
 * what `istDayKey` relies on to answer "which day did this happen, locally".
 */

/** Any parseable timestamp → UTC ISO. Unparseable or absent → null. */
export function toUtcIso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const IST_OFFSET_MS = 5.5 * 3600_000;

/** `YYYY-MM-DD` for the Indian calendar day a UTC timestamp falls in. */
export function istDayKey(value) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}
