/**
 * Builds the Nagpur signal-review page.
 *
 * Run: `node scripts/nagpur/build-review-page.mjs [outputPath]`
 */
import { buildReviewPage } from "../lib/build-review-page.mjs";

await buildReviewPage("nagpur", process.argv[2]);
