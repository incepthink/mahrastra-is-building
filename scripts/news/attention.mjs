/**
 * What the public is watching, on the terminal.
 *
 * The arithmetic lives in `src/lib/news/attention.ts` and this imports it
 * rather than reimplementing it — the same rule `fire.mjs` follows and the
 * reason `lib/ts-loader.mjs` exists. The constants *are* the argument, and a
 * second copy of them under `scripts/` would drift without anyone being able
 * to see that it had.
 *
 * Its job is to print the evidence, not the score. Every figure below is a
 * count of rows or the difference between two counts of rows, and the
 * attribution line at the bottom is printed **always**, because it is the
 * number that says how much of the rest may be believed.
 *
 *   pnpm news:attention                  # 3h of growth, attributed to stories
 *   pnpm news:attention -- --hours=6     # a wider window
 *   pnpm news:attention -- --videos      # the raw per-video ranking as well
 *   pnpm news:attention -- --top=30
 *   pnpm news:attention -- --json
 */
import { registerTsLoader } from "./lib/ts-loader.mjs";

registerTsLoader();

const { attentionByThread } = await import("../../src/lib/news/attention.ts");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));

  return hit ? Number(hit.split("=")[1]) : fallback;
};

const hours = flag("hours", 3);
const top = flag("top", 20);

const { reading, threads, coverage } = attentionByThread(hours);

if (args.includes("--json")) {
  console.log(JSON.stringify({ reading, threads, coverage }, null, 2));
  process.exit(0);
}

if (!reading.asOf) {
  console.log(
    "No YouTube captures yet. Needs YOUTUBE_API_KEY in .env.local, then\n" +
      "`pnpm news:youtube` — and more than once: views per hour is a difference\n" +
      "between two observations and a single capture has none.",
  );
  process.exit(0);
}

const clock = (iso) => iso.replace("T", " ").slice(0, 19);
const n = (value) => value.toLocaleString("en-IN");

console.log(`\nWhat the public is watching — ${hours}h of view growth`);
console.log(`as of ${clock(reading.asOf)}Z`);
console.log(
  `${reading.captures} captures over ${reading.observedHours}h · ` +
    `${reading.videos.length} of ${reading.considered} videos usable · ` +
    `${n(reading.totalViewsPerHour)} views/hour measured`,
);

/**
 * The exclusions, always, even when they are all zero.
 *
 * A window of two usable videos and a window in which nobody watched anything
 * look identical on a leaderboard, and they are opposite claims. This is the
 * same argument `rank_sweeps` exists for on the press side.
 */
const dropped = Object.entries(reading.excluded).filter(([, count]) => count > 0);
if (dropped.length > 0) {
  console.log(
    `excluded: ${dropped.map(([name, count]) => `${count} ${name}`).join(", ")}`,
  );
}

if (reading.videos.length === 0) {
  console.log(
    "\nNothing measurable in this window. Every curve in it is a single\n" +
      "observation, a live stream, or flat — which is a statement about the\n" +
      "collector, not about the state.",
  );
  process.exit(0);
}

if (args.includes("--videos")) {
  console.log(`\n─ videos by views/hour ─────────────────────────────────`);
  for (const [index, video] of reading.videos.slice(0, top).entries()) {
    console.log(
      `\n${String(index + 1).padStart(3)}. ${n(video.viewsPerHour)}/h  ${video.channel}`,
    );
    console.log(`     ${video.title.slice(0, 96)}`);
    console.log(
      `     ${n(video.viewsFrom)} → ${n(video.viewsTo)} views ` +
        `(+${n(video.gain)}) over ${video.observedHours}h, ` +
        `${video.observations} captures · ${video.ageHours}h old · ${video.duration}`,
    );
  }
}

console.log(`\n─ attributed to a running story ────────────────────────`);

if (threads.length === 0) {
  console.log(
    "\nNothing in this window could be attached to a story at " +
      `${coverage.threshold}. That is the expected outcome much of the time —\n` +
      "see the attribution note below.",
  );
} else {
  for (const [index, entry] of threads.slice(0, top).entries()) {
    const name = entry.titleMr ?? entry.leadHeadline;
    console.log(`\n${String(index + 1).padStart(3)}. ${name.slice(0, 92)}`);
    if (!entry.threadId) console.log(`     (not yet threaded — one article)`);

    // The sentence this file exists to be able to print: a count of
    // broadcasters first, the rate second, because the count is the sturdier
    // half by a distance.
    console.log(
      `     ${entry.channels.length} broadcaster${entry.channels.length === 1 ? "" : "s"}, ` +
        `${entry.videos.length} video${entry.videos.length === 1 ? "" : "s"} — ` +
        `+${n(entry.gain)} views in ${hours}h, ${n(entry.viewsPerHour)}/h ` +
        `(hottest clip ${n(entry.peakViewsPerHour)}/h)`,
    );
    console.log(`     ${entry.channels.join(" + ")}`);

    for (const video of entry.videos.slice(0, 3)) {
      console.log(
        `       ${String(n(video.viewsPerHour)).padStart(9)}/h  ` +
          `[${video.matchScore.toFixed(2)}] ${video.title.slice(0, 66)}`,
      );
    }
    // What the match was actually made against, so the attribution is
    // checkable by a reader rather than only by its author.
    console.log(`     matched against: ${entry.leadHeadline.slice(0, 88)}`);
  }
}

/**
 * The attribution note, printed unconditionally.
 *
 * This is the honest heart of the command. The board above is a ranking of the
 * fraction of broadcast attention that could be tied to a story by text, and
 * measured, that fraction is small and is not a random sample of the whole:
 * clips that re-describe one event match, and the reaction soundbites and
 * rolling coverage that make up most of the volume do not. A reader who takes
 * the top row as "the most-watched story in Maharashtra" has been misled, and
 * the only defence against that is to print the denominator every time.
 */
console.log(`\n─ how much of this is attributable ─────────────────────`);
console.log(
  `${coverage.matchedVideos} of ${reading.videos.length} videos matched a story ` +
    `at ${coverage.threshold} (the matcher's own line), carrying\n` +
    `${n(coverage.matchedViewsPerHour)} of ${n(coverage.totalViewsPerHour)} views/hour ` +
    `— ${(coverage.share * 100).toFixed(1)}% of the attention this window measured.`,
);
console.log(
  `Scored against ${n(coverage.articles)} articles from story run ${coverage.runId}.`,
);
console.log(
  `\nThe unmatched majority is not noise, it is the other relation: a clip of a\n` +
    `politician reacting shares no event vocabulary with a newspaper headline.\n` +
    `So this is evidence beside the board, never a term in it — nothing here\n` +
    `enters \`pnpm news:fire\`. See src/lib/news/attention.ts for the numbers.`,
);
