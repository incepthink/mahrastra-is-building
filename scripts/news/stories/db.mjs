/**
 * The derived store: one SQLite file at `.data/stories.db`.
 *
 * Everything in here is a judgement. Which articles are the same event, where
 * that event happened, what a group of articles is about, which groups are the
 * same running story — none of it is something a source said, and all of it
 * depends on constants somebody chose.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE FILE FROM `.data/news.db`.
 *
 * `scripts/news/db.mjs` holds observations only, and says so at length. The
 * reason it says so is Lokmat: that masthead keeps no archive, so a re-scrape
 * is not available and a week of collection is a week that exists exactly once.
 * Anything derived at capture time would be derived once and forever against
 * whatever rule was current that day.
 *
 * So nothing here is ever a column on `articles`. This file is disposable in a
 * way that one is not: `rm .data/stories.db` costs a re-run, not a week. Every
 * row is stamped with a `run_id`, and a run records the constants it was
 * produced under — the merge threshold, the pair window, the matcher version,
 * the model — so a run from a changed recipe sits beside its predecessor
 * rather than overwriting it, and the two can be compared over the same
 * history.
 *
 * The read layer joins across both files in one query by ATTACHing this one
 * onto its read-only handle on `news.db`. `url` is therefore a foreign key in
 * spirit and never in DDL: SQLite cannot enforce a reference across databases,
 * and even if it could, this file must be droppable without the collector
 * noticing.
 * ---------------------------------------------------------------------------
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
export const STORIES_FILE = path.join(ROOT, ".data", "stories.db");
export const NEWS_FILE = path.join(ROOT, ".data", "news.db");

/**
 * Bumped whenever the matcher's arithmetic changes in a way that makes two
 * runs incomparable — a new field in the vector, a different blend, a changed
 * tokeniser. It is stored on the run rather than checked against anything:
 * the point is that a chart drawn across runs can tell where the recipe moved.
 */
export const MATCHER_VERSION = "1.0.0";

/**
 * Six tables.
 *
 * `story_runs` is the spine. Every other table carries `run_id`, and the read
 * layer only ever looks at the newest run that finished — a half-written run
 * is invisible rather than partially believed.
 *
 * `events` is the free matcher's output: one row per group of articles judged
 * to be *the same event*, which is the relation IDF-weighted term overlap
 * actually solves. `event_articles` carries the membership and, per article,
 * the place that article itself points at — because a story physically moves,
 * and the article is the finest grain at which "where" is known.
 *
 * `event_labels` is the model's answer about what a group is about, and it is
 * the only AI-derived table in the project. It carries `input_hash` so a
 * re-run over unchanged input is free, and `model` so an answer can be traced
 * to what produced it. It holds no score of any kind, which is the whole point
 * — see `scripts/news/README.md` on why counting stays counting.
 *
 * `label_cache` is deliberately NOT run-scoped. It is content-addressed on the
 * exact prompt sent, so re-running the pipeline after changing only the merge
 * threshold re-uses every label whose group came out identical, and changing
 * the prompt invalidates all of them at once without a flag.
 *
 * `threads` is the running story: groups from different days linked by the key
 * the model returned. `thread_articles` is denormalised membership, written so
 * the panel's progression is one indexed read rather than a three-way join.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS story_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  ok               INTEGER,

  -- The constants this run was produced under. Stored so a run is reproducible
  -- and so two runs with different answers can be told apart by their recipe
  -- rather than by guesswork.
  matcher_version  TEXT NOT NULL,
  merge_threshold  REAL NOT NULL,
  pair_window_h    INTEGER NOT NULL,
  thread_window_h  INTEGER NOT NULL,
  corpus_from      TEXT,
  corpus_to        TEXT,

  articles         INTEGER NOT NULL DEFAULT 0,
  events           INTEGER NOT NULL DEFAULT 0,
  threads          INTEGER NOT NULL DEFAULT 0,
  labelled         INTEGER NOT NULL DEFAULT 0,
  model            TEXT,
  note             TEXT
);

CREATE TABLE IF NOT EXISTS events (
  run_id           INTEGER NOT NULL,
  id               TEXT NOT NULL,
  size             INTEGER NOT NULL,
  first_at         TEXT,
  last_at          TEXT,

  -- Where the event happened, at the finest grain the text supports.
  -- 'taluka' | 'district' | 'state'. See place.mjs; the tier is carried all
  -- the way to the mark on the map, because a district-level guess drawn as a
  -- sharp pin is the lie src/components/map/choropleth-layer.tsx names.
  place_tier       TEXT NOT NULL,
  taluka_id        TEXT,
  taluka_name      TEXT,
  taluka_name_mr   TEXT,
  district_id      TEXT,
  lon              REAL,
  lat              REAL,
  -- What actually matched, in the article's own words, so the claim is
  -- checkable by a reader rather than only by its author.
  place_evidence   TEXT,

  thread_id        TEXT,
  PRIMARY KEY (run_id, id)
);

CREATE INDEX IF NOT EXISTS events_thread ON events(run_id, thread_id);

CREATE TABLE IF NOT EXISTS event_articles (
  run_id           INTEGER NOT NULL,
  event_id         TEXT NOT NULL,
  url              TEXT NOT NULL,
  -- The best pair score that pulled this article into the group. A merge is
  -- auditable or it is a black box.
  affinity         REAL,
  place_tier       TEXT,
  taluka_id        TEXT,
  taluka_name_mr   TEXT,
  district_id      TEXT,
  lon              REAL,
  lat              REAL,
  place_evidence   TEXT,
  PRIMARY KEY (run_id, event_id, url)
);

CREATE INDEX IF NOT EXISTS event_articles_url ON event_articles(run_id, url);

CREATE TABLE IF NOT EXISTS event_labels (
  run_id           INTEGER NOT NULL,
  event_id         TEXT NOT NULL,
  thread_key       TEXT NOT NULL,
  actors           TEXT,
  issue            TEXT,
  place            TEXT,
  title_mr         TEXT,
  model            TEXT NOT NULL,
  input_hash       TEXT NOT NULL,
  labelled_at      TEXT NOT NULL,
  PRIMARY KEY (run_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_labels_key ON event_labels(run_id, thread_key);

CREATE TABLE IF NOT EXISTS label_cache (
  input_hash       TEXT PRIMARY KEY,
  model            TEXT NOT NULL,
  response         TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  run_id           INTEGER NOT NULL,
  id               TEXT NOT NULL,
  thread_key       TEXT NOT NULL,
  title_mr         TEXT,
  actors           TEXT,
  issue            TEXT,
  events           INTEGER NOT NULL,
  articles         INTEGER NOT NULL,
  first_at         TEXT,
  last_at          TEXT,

  -- The NEWEST known location, not the first and not the most common. A
  -- running story travels — this corpus has one that went Amravati to
  -- Babulgaon to Mantralaya over two days — and a pin that stays where the
  -- story started is wrong from the second article onward.
  place_tier       TEXT NOT NULL,
  taluka_id        TEXT,
  taluka_name      TEXT,
  taluka_name_mr   TEXT,
  district_id      TEXT,
  lon              REAL,
  lat              REAL,
  place_evidence   TEXT,
  -- Every desk that filed into this thread, as a JSON array. Kept because it
  -- is the evidence for why filing by desk district would have been wrong:
  -- one story, six desks. See the pin-placement note in the README.
  desk_districts   TEXT,
  PRIMARY KEY (run_id, id)
);

CREATE INDEX IF NOT EXISTS threads_last ON threads(run_id, last_at);

CREATE TABLE IF NOT EXISTS thread_articles (
  run_id           INTEGER NOT NULL,
  thread_id        TEXT NOT NULL,
  url              TEXT NOT NULL,
  event_id         TEXT NOT NULL,
  published_at     TEXT,
  -- Position in the progression, 1-based, ordered by published_at. Written
  -- rather than computed at read time so the panel and any future export
  -- number the steps identically.
  step             INTEGER NOT NULL,
  place_tier       TEXT,
  taluka_name_mr   TEXT,
  district_id      TEXT,
  PRIMARY KEY (run_id, thread_id, url)
);

CREATE INDEX IF NOT EXISTS thread_articles_step ON thread_articles(run_id, thread_id, step);
`;

export function openStoriesDb({ file = STORIES_FILE } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  return db;
}

/** The collector's store, read-only. This pipeline never writes to it. */
export function openNewsDb({ file = NEWS_FILE } = {}) {
  return new DatabaseSync(file, { readOnly: true });
}

export function startStoryRun(db, config) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO story_runs
         (started_at, matcher_version, merge_threshold, pair_window_h,
          thread_window_h, corpus_from, corpus_to, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      new Date().toISOString(),
      MATCHER_VERSION,
      config.mergeThreshold,
      config.pairWindowHours,
      config.threadWindowHours,
      config.corpusFrom ?? null,
      config.corpusTo ?? null,
      config.model ?? null,
    );

  return Number(lastInsertRowid);
}

export function endStoryRun(db, id, { ok = true, ...counts } = {}) {
  db.prepare(
    `UPDATE story_runs
        SET ended_at = ?, ok = ?, articles = ?, events = ?, threads = ?,
            labelled = ?, note = ?
      WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    ok ? 1 : 0,
    counts.articles ?? 0,
    counts.events ?? 0,
    counts.threads ?? 0,
    counts.labelled ?? 0,
    counts.note ?? "",
    id,
  );
}

/**
 * Keep the last `keep` finished runs and delete the rest.
 *
 * Runs are kept so a recipe change is comparable against what it replaced, but
 * they are not kept forever: each one writes a row per article and the whole
 * file is rebuildable from `news.db` in a minute. Unfinished runs are never
 * swept — a crashed run's rows are the evidence for why it crashed.
 */
export function pruneRuns(db, { keep = 5 } = {}) {
  const doomed = db
    .prepare(
      `SELECT id FROM story_runs
        WHERE ended_at IS NOT NULL
        ORDER BY id DESC
        LIMIT -1 OFFSET ?`,
    )
    .all(keep)
    .map((row) => row.id);

  if (doomed.length === 0) return 0;

  const list = doomed.join(",");
  for (const table of [
    "thread_articles",
    "threads",
    "event_labels",
    "event_articles",
    "events",
  ]) {
    db.exec(`DELETE FROM ${table} WHERE run_id IN (${list})`);
  }
  db.exec(`DELETE FROM story_runs WHERE id IN (${list})`);

  return doomed.length;
}
