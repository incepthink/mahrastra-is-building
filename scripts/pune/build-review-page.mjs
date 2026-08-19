/**
 * Builds the Pune signal-review page.
 *
 * Run: `node scripts/pune/build-review-page.mjs [outputPath]`
 */
import { buildReviewPage } from "../lib/build-review-page.mjs";

await buildReviewPage("pune", process.argv[2]);
