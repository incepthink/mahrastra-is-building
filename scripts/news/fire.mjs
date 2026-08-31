/**
 * What is on fire, on the terminal.
 *
 * The board itself lives in `src/lib/news/fire.ts` and this imports it rather
 * than reimplementing it. That is the same rule the story service follows about
 * its matcher: the constants *are* the argument, and a second copy under
 * `scripts/` would drift from the first without anyone being able to see that
 * it had.
 *
 * Its job is to print the evidence, not the score. `scripts/news/README.md`
 * fixes the standard — "#1 because eleven of thirteen outlets carried it and it
 * held a top-3 slot on four homepages for nine hours" is defensible, "the model
 * ranked it highest" is not — so every line below is a count a reader can go
 * and check against the store.
 *
 *   pnpm news:fire                 # the last 3h of climbs, 24h of arrivals
 *   pnpm news:fire -- --hours=6    # a wider velocity window
 *   pnpm news:fire -- --arrivals=48
 *   pnpm news:fire -- --top=30
 *   pnpm news:fire -- --json
 */
import { registerTsLoader } from "./lib/ts-loader.mjs";

registerTsLoader();

const { loadFireBoard } = await import("../../src/lib/news/fire.ts");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));

  return hit ? Number(hit.split("=")[1]) : fallback;
};

const hours = flag("hours", 3);
const arrivals = flag("arrivals", 24);
const top = flag("top", 20);

const board = loadFireBoard(hours, arrivals);

if (args.includes("--json")) {
  console.log(JSON.stringify(board, null, 2));
  process.exit(0);
}

if (!board.asOf) {
  console.log(
    "No section-page captures yet. Run `pnpm news:cycle`, or `pnpm news:schedule`\n" +
      "to keep collecting — fire is a derivative and one capture has none.",
  );
  process.exit(0);
}

const swept = Object.entries(board.captures)
  .map(([source, n]) => `${n} ${source}`)
  .join(" / ");

console.log(`\nOn fire — ${hours}h climbs, ${arrivals}h arrivals`);
console.log(`as of ${board.asOf.replace("T", " ").slice(0, 19)}Z`);
console.log(
  `captures ${swept} over ${board.observedHours}h` +
    (board.observedHours < hours
      ? `  (window asked for ${hours}h — still filling)`
      : ""),
);
console.log(
  board.runId
    ? `stories run ${board.runId}, corpus to ${String(board.runCorpusTo).replace("T", " ").slice(0, 19)}Z`
    : "no story run — ranking articles, not stories",
);

/**
 * The warning that matters most while the collector is young.
 *
 * Velocity needs two captures of one masthead before it can say anything at
 * all. Until then this is a board of arrivals, and a board of arrivals that
 * does not say so is claiming to measure growth it has not measured.
 */
if (!board.velocityAvailable) {
  console.log(
    "\n  !! fewer than two captures of any masthead in this window.\n" +
      "     Nothing below is a rate. This is ranking arrivals only.",
  );
}

console.log("");

if (board.entries.length === 0) {
  console.log("  Nothing climbed and nothing was filed more than usual.\n");
  process.exit(0);
}

for (const [index, entry] of board.entries.slice(0, top).entries()) {
  const rank = String(index + 1).padStart(3);
  const name = entry.titleMr ?? entry.headline;

  console.log(`${rank}  ${entry.score.toFixed(3)}  ${clip(name, 66)}`);

  const velocity = entry.velocity;
  if (velocity) {
    // The sentence the whole service exists to be able to say.
    console.log(
      `              ${velocity.sourceId} carried it on ${velocity.pagesTo} of ` +
        `${velocity.sitePages} section pages, up from ${velocity.pagesFrom}` +
        ` — ${clock(velocity.fromAt)} to ${clock(velocity.peakAt)}` +
        (velocity.promoted ? "  [sitewide]" : ""),
    );

    // Only worth a line when it moved; it usually has not.
    if (
      velocity.positionFrom !== null &&
      velocity.positionTo !== null &&
      velocity.positionTo < velocity.positionFrom
    ) {
      console.log(
        `              best slot ${velocity.positionFrom} → ${velocity.positionTo} in page source order`,
      );
    }

    // A spike that gave it back is a fact about the top-stories block turning
    // over, not about the story. Said out loud rather than left in the number.
    if (velocity.pagesPeak > velocity.pagesTo) {
      console.log(
        `              peaked at ${velocity.pagesPeak} pages and has since fallen back`,
      );
    }
  }

  if (entry.articlesInWindow > 0) {
    console.log(
      `              ${entry.articlesInWindow} article${entry.articlesInWindow === 1 ? "" : "s"} in ${arrivals}h` +
        ` (typical story ${entry.expectedArticles}, so ×${entry.arrivalRatio})` +
        `  ${entry.sources.join(" + ")}`,
    );
  }

  console.log(
    `              ${place(entry)}` +
      `  ·  ${entry.threadId ? (entry.titleMr ? "named story" : "unnamed story") : "not yet threaded"}`,
  );
  console.log("");
}

const shown = Math.min(top, board.entries.length);
console.log(
  `  ${shown} of ${board.entries.length} entries.` +
    " Every figure above is a row count from .data/news.db.\n",
);

function place(entry) {
  if (entry.placeTier === "taluka" && entry.talukaNameMr) {
    return `${entry.talukaNameMr} (${entry.districtId ?? "?"})`;
  }
  if (entry.placeTier === "district") return entry.districtId ?? "district unknown";
  if (entry.placeTier === "state") return "statewide";

  return "place unresolved";
}

function clock(at) {
  return at.slice(11, 16);
}

/** Marathi is counted in code points here, which is close enough for a column
 *  and much better than cutting a grapheme cluster in half. */
function clip(text, width) {
  const chars = [...text];

  return chars.length <= width ? text : `${chars.slice(0, width - 1).join("")}…`;
}
