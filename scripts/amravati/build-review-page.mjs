/**
 * Builds the Amravati signal-review page.
 *
 * Run: `node scripts/amravati/build-review-page.mjs [outputPath]`
 */
import { buildReviewPage } from "../lib/build-review-page.mjs";

await buildReviewPage("amravati", process.argv[2]);
