/**
 * The news engine's command line.
 *
 * Four passes, run separately or together:
 *
 *   discover   read every source feed, keep Maharashtra URLs      (~7 requests)
 *   ingest     fetch pending articles, read their JSON-LD         (1 per article)
 *   rank       snapshot the order of 51 watched section pages     (51 requests)
 *   youtube    snapshot view counts on 8 Marathi news channels    (~16 quota units)
 *
 * All four are collectors. Nothing here scores, clusters or ranks anything —
 * that belongs to a separate service reading `.data/news.db`. `stats` below
 * reports collection health only, and deliberately publishes no leaderboard.
 *
 * Usage
 *   pnpm news:cycle                        one pass of all three
 *   pnpm news:watch                        run continuously on the source cadence
 *   pnpm news:discover
 *   pnpm news:ingest -- --limit=500
 *   pnpm news:ingest -- --recheck          look for edited articles
 *   pnpm news:rank
 *   pnpm news:youtube
 *   pnpm news:youtube -- --plan         what a sweep would cost, spending nothing
 *   pnpm news:stats
 *   pnpm news:backfill -- --date=2026-08-28    Loksatta only; Lokmat keeps no archive
 *
 * Flags
 *   --source=<id>              restrict to one masthead (see sources.mjs)
 *   --limit=N                  articles per ingest pass (default 200)
 *   --since-hours=N            recheck window (default 48)
 *   --plan                     youtube only: print the quota arithmetic and exit
 *   --reresolve                youtube only: retry handles that failed to resolve,
 *                              rather than waiting out the 24h backoff
 */
import process from "node:process";
import { CADENCE, SOURCES } from "./sources.mjs";
import { endRun, openDb, startRun, upsertSources } from "./db.mjs";
import { backfill, discover } from "./discover.mjs";
import { ingest } from "./ingest.mjs";
import { snapshotRanks } from "./rank.mjs";
import { plannedCost, snapshotYouTube } from "./youtube.mjs";
import { istDayKey } from "./lib/time.mjs";

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "cycle";
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const has = (name) => args.includes(`--${name}`);

const selected = flag("source")
  ? SOURCES.filter((s) => s.id === flag("source"))
  : SOURCES;

if (selected.length === 0) {
  console.error(`Unknown source "${flag("source")}". Known: ${SOURCES.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

/**
 * `.env.local` then `.env`, first value wins — the same precedence Next uses.
 * Copied rather than imported, for the reason `scripts/news/stories/label.mjs`
 * gives where it does the same thing: it is eight lines, and making it a
 * dependency is how a script stops being runnable on its own.
 */
async function loadEnvFiles() {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve(import.meta.dirname, "..", "..");

  for (const name of [".env.local", ".env"]) {
    let contents;
    try {
      contents = await readFile(path.join(root, name), "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^["'](.*)["']$/, "$1");
    }
  }
}

await loadEnvFiles();

const db = openDb();
upsertSources(db, SOURCES);

const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

/** Wrap a pass so every run is recorded, successful or not. */
async function tracked(task, fn) {
  const id = startRun(db, task);
  console.log(`[${stamp()}] ${task}`);
  try {
    const result = await fn();
    endRun(db, id, { ok: true, note: JSON.stringify(result ?? {}) });
    return result;
  } catch (error) {
    endRun(db, id, { ok: false, note: String(error.message).slice(0, 300) });
    console.error(`  ! ${task} failed — ${error.message}`);
    return null;
  }
}

const runDiscover = () => tracked("discover", () => discover(db, { sources: selected }));
const runRank = () => tracked("rank", () => snapshotRanks(db, { sources: selected }));
/**
 * The one pass that needs a credential, so the one pass that can be absent.
 *
 * A missing key is not an error — the press side of the engine is complete
 * without it, and a `cycle` that refused to run because YouTube was
 * unconfigured would stop collecting the newspaper data too. It says so once
 * and returns; `stats` then reports zero captures, which is the honest state.
 */
const runYouTube = () => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log(
      `[${stamp()}] youtube — skipped, no YOUTUBE_API_KEY in .env.local\n` +
        "         Get one at console.cloud.google.com → enable YouTube Data API v3 → create an API key.",
    );
    return Promise.resolve(null);
  }
  return tracked("youtube", () => snapshotYouTube(db, { apiKey, reresolve: has("reresolve") }));
};

const runIngest = () =>
  tracked("ingest", () =>
    ingest(db, {
      limit: Number(flag("limit") ?? 200),
      recheck: has("recheck"),
      sinceHours: Number(flag("since-hours") ?? 48),
    }),
  );

/**
 * Collection health for the YouTube pass, reported as bluntly as possible.
 *
 * The headline number is not how many view counts were recorded — it is how
 * many videos have been observed **more than once**, because a single
 * observation of a view count supports no statement about growth whatsoever.
 * A table with forty thousand rows and no repeat observations is a table with
 * nothing in it, and this is the line that would say so.
 */
function youtubeStats(q, one) {
  const channels = q("SELECT * FROM yt_channels ORDER BY handle");
  if (channels.length === 0) {
    console.log("\nYouTube                 not yet resolved — run `pnpm news:youtube`");
    return;
  }

  const broken = channels.filter((c) => !c.uploads_playlist);
  console.log(
    `\nYouTube channels        ${channels.length - broken.length}/${channels.length} resolved`,
  );
  for (const c of broken) {
    console.log(`    unresolved  ${c.handle.padEnd(18)} ${c.resolve_error ?? ""}`);
  }

  const caps = one(
    `SELECT COUNT(DISTINCT captured_at) AS captures, COUNT(*) AS rows,
            MIN(captured_at) AS lo, MAX(captured_at) AS hi FROM yt_stats`,
  );
  console.log(
    `View observations       ${caps.rows} across ${caps.captures} captures` +
      (caps.lo ? `\n                        ${caps.lo} → ${caps.hi}` : ""),
  );

  /**
   * The only line here that says whether the data is yet good for anything.
   * Until this is non-zero, no rate of any kind is computable and the trending
   * service has nothing to read.
   */
  const repeats = one(
    `SELECT COUNT(*) AS videos FROM (
       SELECT video_id FROM yt_stats GROUP BY video_id HAVING COUNT(*) >= 2
     )`,
  );
  const span = one(
    `SELECT MAX(hours) AS hours FROM (
       SELECT (julianday(MAX(captured_at)) - julianday(MIN(captured_at))) * 24 AS hours
       FROM yt_stats GROUP BY video_id
     )`,
  );
  console.log(
    `Videos observed 2+ times ${repeats.videos}` +
      (repeats.videos === 0
        ? "   ← no growth is computable until this is non-zero"
        : `   (longest curve ${(span.hours ?? 0).toFixed(1)}h)`),
  );

  /**
   * Quota spent since the last Pacific midnight, which is when YouTube resets
   * the 10,000-unit allowance. Reported in that timezone rather than IST
   * because that is the boundary the API actually enforces.
   */
  const pacificMidnightUtc = (() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    const secondsIntoPacificDay = get("hour") * 3600 + get("minute") * 60 + get("second");
    return new Date(now.getTime() - secondsIntoPacificDay * 1000).toISOString();
  })();

  const spend = one(
    `SELECT COALESCE(SUM(units), 0) AS units, COUNT(DISTINCT captured_at) AS sweeps,
            SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures
     FROM yt_sweeps WHERE captured_at >= ?`,
    pacificMidnightUtc,
  );
  console.log(
    `Quota since PT midnight ${spend.units}/10000 units over ${spend.sweeps} sweeps` +
      (spend.failures > 0 ? `  (${spend.failures} failed calls)` : ""),
  );

  for (const row of q(
    `SELECT step, target, error, COUNT(*) AS n FROM yt_sweeps
     WHERE ok = 0 AND error IS NOT NULL GROUP BY step, error
     ORDER BY n DESC LIMIT 3`,
  )) {
    console.log(`    ${String(row.n).padStart(3)}x ${row.step.padEnd(8)} ${String(row.error).slice(0, 90)}`);
  }
}

function stats() {
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  console.log("\nArticles by source and status");
  for (const row of q(
    `SELECT source_id, fetch_status, COUNT(*) AS n FROM articles
     GROUP BY source_id, fetch_status ORDER BY source_id, fetch_status`,
  )) {
    console.log(`  ${row.source_id.padEnd(9)} ${row.fetch_status.padEnd(8)} ${row.n}`);
  }

  const span = one(
    `SELECT MIN(published_at) AS lo, MAX(published_at) AS hi, COUNT(*) AS n
     FROM articles WHERE published_at IS NOT NULL`,
  );
  console.log(`\nPublished span  ${span.lo ?? "-"}  →  ${span.hi ?? "-"}  (${span.n})`);

  /**
   * Volume per Indian calendar day — the quickest read on collection health.
   * A day that suddenly halves usually means a source changed, not that
   * Maharashtra went quiet.
   *
   * The tail is expected to be long and thin. Section pages carry evergreen
   * links beside live news — Lokmat's Mumbai page still links pieces from 2023
   * — so those are real observations of what the page showed, not parse
   * errors. Anything time-sensitive must therefore window on `published_at`
   * rather than assume the corpus is recent.
   */
  const perDay = new Map();
  for (const row of q("SELECT published_at, source_id FROM articles WHERE published_at IS NOT NULL")) {
    const day = istDayKey(row.published_at);
    if (!day) continue;
    const counts = perDay.get(day) ?? {};
    counts[row.source_id] = (counts[row.source_id] ?? 0) + 1;
    perDay.set(day, counts);
  }
  const days = [...perDay.keys()].sort();
  console.log("\nArticles per IST day (last 7 with content)");
  for (const day of days.slice(-7)) {
    const counts = perDay.get(day);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const parts = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join("  ");
    console.log(`  ${day}  ${String(total).padStart(4)}   ${parts}`);
  }
  const older = days.slice(0, -7).reduce(
    (n, d) => n + Object.values(perDay.get(d)).reduce((a, b) => a + b, 0), 0,
  );
  if (older > 0) console.log(`  ${String(older).padStart(16)} older (evergreen links on section pages)`);


  console.log("\nTop districts");
  for (const row of q(
    `SELECT COALESCE(district_id, '(statewide)') AS d, COUNT(*) AS n
     FROM articles GROUP BY d ORDER BY n DESC LIMIT 12`,
  )) {
    console.log(`  ${row.d.padEnd(28)} ${row.n}`);
  }

  const ranks = one(
    `SELECT COUNT(*) AS rows, COUNT(DISTINCT captured_at) AS captures,
            MIN(captured_at) AS lo, MAX(captured_at) AS hi FROM rank_snapshots`,
  );
  console.log(
    `\nSection page snapshots  ${ranks.captures} captures, ${ranks.rows} link positions` +
      (ranks.lo ? `\n                        ${ranks.lo} → ${ranks.hi}` : ""),
  );

  /**
   * Sweep completeness, not a ranking.
   *
   * A capture where nine district pages timed out produces fewer rows, and
   * without this it looks exactly like a quiet news hour. Anything computed
   * downstream as a fraction of pages needs to know the real denominator.
   */
  const sweeps = one(
    `SELECT COUNT(*) AS attempted, SUM(ok) AS ok, COUNT(DISTINCT captured_at) AS captures
     FROM rank_sweeps`,
  );
  if (sweeps.attempted > 0) {
    const failed = sweeps.attempted - (sweeps.ok ?? 0);
    console.log(
      `Pages swept             ${sweeps.ok ?? 0}/${sweeps.attempted} ok across ${sweeps.captures} captures` +
        (failed > 0 ? `  (${failed} failed)` : ""),
    );
    for (const row of q(
      `SELECT page_id, COUNT(*) AS misses FROM rank_sweeps
       WHERE ok = 0 GROUP BY page_id ORDER BY misses DESC LIMIT 5`,
    )) {
      console.log(`    ${String(row.misses).padStart(3)}x failed  ${row.page_id}`);
    }
  }

  const revisions = one(
    `SELECT COUNT(*) AS observations, COUNT(DISTINCT url) AS articles FROM article_revisions`,
  );
  console.log(
    `Modification times seen ${revisions.observations} across ${revisions.articles} articles`,
  );

  youtubeStats(q, one);

  /**
   * No leaderboard here, on purpose.
   *
   * Ranking stories is the job of the service that reads this database, and it
   * needs decisions this script has no business making — how to treat the
   * global top-stories block both papers repeat on every section page, how to
   * discount a page nobody updates, what window counts. Printing a "top
   * stories" list from here would quietly become the definition of one.
   */
  console.log();
}

async function cycle() {
  await runDiscover();
  await runIngest();
  await runRank();
  await runYouTube();
}

/**
 * Continuous mode. Discovery and ranking run on their own clocks; ingest runs
 * after every discovery because that is when there is something to fetch.
 *
 * Lokmat keeps no archive — its sitemap window is about seven hours and
 * anything that falls out of it is unrecoverable. So the useful thing this
 * command does is simply to keep running.
 */
async function watch() {
  console.log(
    `watching — discover every ${CADENCE.discoverMinutes}m, rank every ${CADENCE.rankMinutes}m, ` +
      `youtube every ${CADENCE.youtubeMinutes}m. Ctrl+C to stop.`,
  );
  let lastRank = 0;
  let lastYouTube = 0;

  for (;;) {
    await runDiscover();
    await runIngest();

    if (Date.now() - lastRank >= CADENCE.rankMinutes * 60_000) {
      await runRank();
      lastRank = Date.now();
    }

    if (Date.now() - lastYouTube >= CADENCE.youtubeMinutes * 60_000) {
      await runYouTube();
      lastYouTube = Date.now();
    }

    await new Promise((r) => setTimeout(r, CADENCE.discoverMinutes * 60_000));
  }
}

const commands = {
  discover: runDiscover,
  ingest: runIngest,
  rank: runRank,
  youtube: async () => {
    if (!has("plan")) return runYouTube();
    const plan = plannedCost(db, { everyMinutes: CADENCE.youtubeMinutes });
    console.log(
      `\n${plan.resolved}/${plan.configured} channels resolved, ${plan.tracked} videos in the tracking window\n` +
        `  ${plan.perSweep} units per sweep x ${plan.sweepsPerDay} sweeps/day = ${plan.perDay} of ${plan.limit}\n` +
        (plan.perDay > plan.limit
          ? "  ! over the daily allowance — widen CADENCE.youtubeMinutes or narrow YOUTUBE_TRACK_HOURS\n"
          : `  ${Math.round((1 - plan.perDay / plan.limit) * 100)}% of the daily allowance left over\n`),
    );
    return null;
  },
  cycle,
  watch,
  stats: async () => stats(),
  backfill: async () => {
    const date = flag("date");
    if (!date) throw new Error("backfill needs --date=YYYY-MM-DD");
    await tracked("backfill", () => backfill(db, date, { sources: selected }));
  },
};

if (!commands[command]) {
  console.error(`Unknown command "${command}". Known: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

await commands[command]();
if (command !== "stats" && command !== "watch") stats();
