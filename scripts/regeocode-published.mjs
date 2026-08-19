/**
 * Sharpens the point on the records that actually reach the map.
 *
 * A full scrape geocodes 350 notices in one pass and takes the first answer
 * Nominatim gives for each. That is the right trade for a file nobody reads
 * directly — but the handful of records in `published-signals.json` are the
 * ones a reader sees, and several of them name a locality in the notice and
 * still ended up on their taluka's centroid. Two records on one centroid is a
 * cluster badge at the state view, which hides exactly the thing the published
 * list was assembled to show: that a district does more than one kind of work.
 *
 * So this re-asks the geocoder for the published records only, using each
 * district's own rules, and writes the answer back when it is *better* than
 * what is there — never worse, and never for a notice that has no locality to
 * be precise about. A district-wide tender for water tankers belongs on the
 * district, and this leaves it there.
 *
 * Usage
 *   node scripts/regeocode-published.mjs           # write improvements
 *   node scripts/regeocode-published.mjs --dry     # print, write nothing
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLISHED_FILE = path.join(ROOT, "src", "data", "published-signals.json");

const DRY = process.argv.includes("--dry");

/** How precise a point is, as a number, so "better" is comparable. */
const RANK = { district: 0, taluka: 1, village: 2 };

/** Each district brings its own geocoder — the bbox, the taluka list and the
 *  romanisation variants are all district-specific. */
const GEOCODERS = {
  amravati: () => import("./amravati/lib/geocode.mjs"),
  pune: () => import("./pune/lib/geocode.mjs"),
};

async function main() {
  const published = JSON.parse(await readFile(PUBLISHED_FILE, "utf8"));
  const districts = [...new Set(published.records.map((record) => record.district))];

  for (const district of districts) {
    const load = GEOCODERS[district];
    if (!load) {
      console.log(`skip ${district}: no geocoder`);
      continue;
    }

    const { geocodePlace } = await load();
    const file = path.join(ROOT, "public", "data", district, "signals.json");
    const data = JSON.parse(await readFile(file, "utf8"));
    const wanted = new Set(
      published.records.filter((r) => r.district === district).map((r) => r.id),
    );

    let improved = 0;

    for (const signal of data.signals) {
      if (!wanted.has(signal.id)) continue;

      const was = signal.confidence?.location ?? "district";

      // Nothing to sharpen with. A notice that names no locality is already as
      // precise as its own text allows, and inventing one would be a lie about
      // where the work is.
      if (!signal.locality) {
        console.log(`  = ${signal.id}  ${was}  (no locality named)`);
        continue;
      }

      if (RANK[was] >= RANK.village) {
        console.log(`  = ${signal.id}  ${was}  (already village-precise)`);
        continue;
      }

      const found = await geocodePlace({
        village: signal.locality,
        taluka: signal.taluka ?? null,
      });

      if (RANK[found.precision] <= RANK[was]) {
        console.log(`  = ${signal.id}  ${was} → ${found.precision}  (no better)`);
        continue;
      }

      signal.coordinates = found.coordinates;
      signal.confidence = {
        ...signal.confidence,
        location: found.precision,
        locationMatch: found.matchedName ?? signal.locality,
      };

      improved += 1;
      console.log(
        `  + ${signal.id}  ${was} → ${found.precision}  ${found.matchedName}  ` +
          `[${found.coordinates.join(", ")}]`,
      );
    }

    if (!improved) {
      console.log(`${district}: nothing to sharpen`);
      continue;
    }

    // The file's own quality block is a summary of the records in it, so it has
    // to be recounted rather than left describing the previous pass.
    data.meta.quality.locationPrecision = data.signals.reduce(
      (counts, signal) => {
        const key = signal.confidence?.location ?? "district";
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      { village: 0, taluka: 0, district: 0 },
    );

    if (DRY) {
      console.log(`${district}: ${improved} improved (dry run, not written)`);
      continue;
    }

    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(`${district}: ${improved} improved, written`);
  }
}

await main();
