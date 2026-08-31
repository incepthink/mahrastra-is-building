/**
 * The story service's command line.
 *
 * Four passes over `.data/news.db`, writing `.data/stories.db`:
 *
 *   match   IDF-weighted similarity groups articles into events   free
 *   place   a gazetteer resolves where each event happened        free
 *   label   one model call per candidate group says what it is    paid
 *   thread  groups link across days by the key the model returned free
 *
 * Three of the four are arithmetic. The paid one is fenced: it names stories
 * and never ranks them — see the header of `label.mjs`.
 *
 * This reads the collector's database and never writes to it. Everything it
 * produces is derived, is stamped with a `run_id`, and is re-derivable from
 * scratch, which is the arrangement `scripts/news/db.mjs` insists on because
 * Lokmat keeps no archive and a re-scrape is not available.
 *
 * Usage
 *   pnpm news:stories                     the full pipeline, last 14 days
 *   pnpm news:stories -- --days=30
 *   pnpm news:stories -- --no-label       free passes only, no API key needed
 *   pnpm news:stories -- --dry            plan and cost, calls nothing
 *   pnpm news:stories -- --limit=20       cap the model calls (costs money)
 *   pnpm news:stories -- --threshold=0.42
 *   pnpm news:stories -- --show=लाँग      print the threads matching a string
 *
 * Flags
 *   --days=N          how far back to cluster (default 14)
 *   --threshold=N     merge threshold for the free matcher (default 0.45)
 *   --pairs=N         cross-day pairs to spend the labelling budget on (200)
 *   --keep=N          finished runs to retain (default 5)
 */
import process from "node:process";

import {
  endStoryRun,
  MATCHER_VERSION,
  openNewsDb,
  openStoriesDb,
  pruneRuns,
  startStoryRun,
} from "./db.mjs";
import { buildEvents, indexCorpus, loadCorpus, MERGE_THRESHOLD, PAIR_WINDOW_HOURS } from "./match.mjs";
import { loadGazetteer, placeOf, resolvePlace, surfaceFrequencies } from "./place.mjs";
import { confirmModel, labelCandidates, labelEvent, loadEnvFiles, MODEL } from "./label.mjs";
import { buildThreads, deskDistricts, threadSteps } from "./threads.mjs";

const THREAD_WINDOW_HOURS = 24 * 14;

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const has = (name) => args.includes(`--${name}`);

const days = Number(flag("days") ?? 14);
const threshold = Number(flag("threshold") ?? MERGE_THRESHOLD);
const wantLabels = !has("no-label");
const dry = has("dry");
const budget = Number(flag("limit") ?? Infinity);

const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const log = (message) => console.log(`[${stamp()}] ${message}`);

await main();

async function main() {
  await loadEnvFiles();

  const newsDb = openNewsDb();
  const storiesDb = openStoriesDb();

  const fromIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const articles = loadCorpus(newsDb, { fromIso });

  if (articles.length === 0) {
    console.error(
      `No articles published in the last ${days} days. Run \`pnpm news:cycle\` first.`,
    );
    process.exit(1);
  }

  log(
    `corpus ${articles.length} articles, ${articles[0].publishedAt.slice(0, 10)} → ` +
      `${articles[articles.length - 1].publishedAt.slice(0, 10)}`,
  );

  // ---- match ------------------------------------------------------------
  const index = indexCorpus(articles);
  const { events, scoredPairs, acceptedPairs } = buildEvents(articles, index, { threshold });
  const grouped = events.filter((event) => event.members.length > 1);

  log(
    `match  ${events.length} events (${grouped.length} multi-article) from ` +
      `${scoredPairs} candidate pairs, ${acceptedPairs} accepted at ≥${threshold}`,
  );

  // ---- place ------------------------------------------------------------
  const gazetteer = await loadGazetteer();
  const surfaceDf = surfaceFrequencies(articles);
  const placeByUrl = new Map();
  const tiers = { taluka: 0, district: 0, state: 0 };

  for (const article of articles) {
    const place = resolvePlace(article, gazetteer, surfaceDf);
    place.at = article.publishedAt;
    placeByUrl.set(article.url, place);
    tiers[place.tier] += 1;
  }

  log(
    `place  ${tiers.taluka} taluka · ${tiers.district} district · ${tiers.state} statewide`,
  );

  // ---- label ------------------------------------------------------------
  const candidates = labelCandidates(events, index, {
    pairBudget: Number(flag("pairs") ?? 200),
    threadWindowHours: THREAD_WINDOW_HOURS,
  });
  const labels = new Map();
  let called = 0;
  let cachedCount = 0;
  let model = null;

  if (!wantLabels) {
    log(`label  skipped (--no-label); ${candidates.size} groups would have been sent`);
  } else if (dry) {
    log(`label  ${candidates.size} of ${events.length} groups would be sent to ${MODEL} — dry run`);
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(
        "Missing OPENAI_API_KEY. Put it in .env.local at the repo root, or run " +
          "with --no-label to build events and places without threading them.",
      );
      process.exit(1);
    }

    const check = await confirmModel(apiKey);
    if (!check.ok) {
      console.error(
        `Model "${check.model}" is not available on this key (HTTP ${check.status}).` +
          (check.near.length ? `\nNearby ids the API does list:\n  ${check.near.join("\n  ")}` : "") +
          "\nSet OPENAI_STORY_MODEL to one of them.",
      );
      process.exit(1);
    }
    model = check.model;

    log(`label  ${candidates.size} of ${events.length} groups to ${model} (rest cannot thread)`);

    for (const position of candidates) {
      if (called >= budget) break;

      const event = events[position];

      try {
        const label = await labelEvent(storiesDb, event, { apiKey, model });
        labels.set(event.id, label);

        if (label.cached) cachedCount += 1;
        else called += 1;
      } catch (error) {
        // One group failing is not a reason to lose the run. It threads as a
        // single event, which is what it would have been without a label.
        console.error(`  ! ${event.id} — ${error.message}`);
      }
    }

    log(`label  ${called} call(s), ${cachedCount} from cache`);
  }

  // ---- thread -----------------------------------------------------------
  const threads = buildThreads(events, labels, { threadWindowHours: THREAD_WINDOW_HOURS });
  const running = threads.filter((thread) => thread.events.length > 1);

  log(`thread ${threads.length} threads, ${running.length} running across more than one event`);

  if (dry) {
    report(threads, placeByUrl, flag("show"));
    return;
  }

  // ---- write ------------------------------------------------------------
  const runId = startStoryRun(storiesDb, {
    mergeThreshold: threshold,
    pairWindowHours: PAIR_WINDOW_HOURS,
    threadWindowHours: THREAD_WINDOW_HOURS,
    corpusFrom: articles[0].publishedAt,
    corpusTo: articles[articles.length - 1].publishedAt,
    model,
  });

  write(storiesDb, runId, { events, threads, labels, placeByUrl });

  endStoryRun(storiesDb, runId, {
    ok: true,
    articles: articles.length,
    events: events.length,
    threads: threads.length,
    labelled: labels.size,
    note: `matcher ${MATCHER_VERSION}`,
  });

  const pruned = pruneRuns(storiesDb, { keep: Number(flag("keep") ?? 5) });
  log(`wrote  run ${runId}${pruned ? `, pruned ${pruned} older run(s)` : ""}`);

  report(threads, placeByUrl, flag("show"));
}

/**
 * One transaction for the whole run.
 *
 * A half-written run is worse than no run: the read layer takes the newest
 * *finished* run, and a crash between the events and the threads would leave a
 * run whose `ended_at` is null but whose rows are visible to anything that
 * forgot to check. Wrapping the writes means the run either exists whole or
 * does not exist.
 */
function write(db, runId, { events, threads, labels, placeByUrl }) {
  const insertEvent = db.prepare(
    `INSERT INTO events (run_id, id, size, first_at, last_at, place_tier, taluka_id,
                         taluka_name, taluka_name_mr, district_id, lon, lat,
                         place_evidence, thread_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMember = db.prepare(
    `INSERT INTO event_articles (run_id, event_id, url, affinity, place_tier, taluka_id,
                                 taluka_name_mr, district_id, lon, lat, place_evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLabel = db.prepare(
    `INSERT INTO event_labels (run_id, event_id, thread_key, actors, issue, place,
                               title_mr, model, input_hash, labelled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertThread = db.prepare(
    `INSERT INTO threads (run_id, id, thread_key, title_mr, actors, issue, events,
                          articles, first_at, last_at, place_tier, taluka_id,
                          taluka_name, taluka_name_mr, district_id, lon, lat,
                          place_evidence, desk_districts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertStep = db.prepare(
    `INSERT INTO thread_articles (run_id, thread_id, url, event_id, published_at, step,
                                  place_tier, taluka_name_mr, district_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const threadOf = new Map();
  for (const thread of threads) {
    for (const event of thread.events) threadOf.set(event.id, thread.id);
  }

  db.exec("BEGIN");

  try {
    for (const event of events) {
      const places = event.articles.map((article) => placeByUrl.get(article.url));
      const place = placeOf(places) ?? places[0];

      insertEvent.run(
        runId, event.id, event.members.length, event.firstAt, event.lastAt,
        place?.tier ?? "state", place?.talukaId ?? null, place?.talukaName ?? null,
        place?.talukaNameMr ?? null, place?.districtId ?? null,
        place?.lon ?? null, place?.lat ?? null, place?.evidence ?? null,
        threadOf.get(event.id) ?? null,
      );

      event.articles.forEach((article, position) => {
        const own = placeByUrl.get(article.url);

        insertMember.run(
          runId, event.id, article.url, event.affinities[position],
          own?.tier ?? null, own?.talukaId ?? null, own?.talukaNameMr ?? null,
          own?.districtId ?? null, own?.lon ?? null, own?.lat ?? null,
          own?.evidence ?? null,
        );
      });

      const label = labels.get(event.id);
      if (label) {
        insertLabel.run(
          runId, event.id, label.threadKey, label.actors, label.issue, label.place,
          label.titleMr, label.model, label.inputHash, new Date().toISOString(),
        );
      }
    }

    for (const thread of threads) {
      const steps = threadSteps(thread, placeByUrl);
      const place = placeOf(steps.map((step) => step.place).filter(Boolean)) ?? null;

      insertThread.run(
        runId, thread.id, thread.threadKey, thread.titleMr || null,
        thread.actors || null, thread.issue || null,
        thread.events.length, steps.length, thread.firstAt, thread.lastAt,
        place?.tier ?? "state", place?.talukaId ?? null, place?.talukaName ?? null,
        place?.talukaNameMr ?? null, place?.districtId ?? null,
        place?.lon ?? null, place?.lat ?? null, place?.evidence ?? null,
        JSON.stringify(deskDistricts(steps)),
      );

      for (const step of steps) {
        insertStep.run(
          runId, thread.id, step.article.url, step.eventId, step.article.publishedAt,
          step.step, step.place?.tier ?? null, step.place?.talukaNameMr ?? null,
          step.place?.districtId ?? null,
        );
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** What the run found, for a human. Prints threads, never a leaderboard —
 *  ordering these by anything but time would be the ranking this pipeline is
 *  not allowed to do. */
function report(threads, placeByUrl, filter) {
  const running = threads
    .filter((thread) => thread.events.length > 1 || thread.events[0].members.length > 1)
    .filter((thread) =>
      !filter ||
      thread.titleMr?.includes(filter) ||
      thread.threadKey.includes(filter) ||
      thread.events.some((event) => event.articles.some((a) => a.headline.includes(filter))),
    )
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));

  if (running.length === 0) return;

  console.log(`\nThreads covering more than one article (${running.length})\n`);

  for (const thread of running.slice(0, filter ? 40 : 12)) {
    const steps = threadSteps(thread, placeByUrl);
    const place = placeOf(steps.map((s) => s.place).filter(Boolean));

    console.log(
      `  ${thread.titleMr || steps[0]?.article.headline.slice(0, 68) || thread.threadKey}` +
        `\n    ${thread.threadKey} · ${steps.length} articles · ${thread.events.length} event(s)` +
        ` · ${place?.tier ?? "?"}${place?.talukaName ? ` ${place.talukaName}` : ""}` +
        `${place?.districtId ? ` (${place.districtId})` : ""}`,
    );

    for (const step of steps) {
      console.log(
        `      ${String(step.step).padStart(2)}. ${step.article.publishedAt.slice(5, 16)}` +
          ` ${step.article.sourceId.padEnd(8)} ${step.article.headline.slice(0, 64)}`,
      );
    }
    console.log();
  }
}
