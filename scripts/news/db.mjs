/**
 * The news engine's store: one SQLite file at `.data/news.db`.
 *
 * The district scrapers commit their output as JSON because a district
 * publishes a few hundred notices a year and every one of them is meant to be
 * read by a human before it goes live. News is the opposite shape — roughly
 * 1,500 articles a day across the seven sources, plus a snapshot of every watched
 * section page every half hour — so it goes into a database that can be queried
 * and thrown away rather than a file that gets committed.
 *
 * SQLite rather than Postgres for this first run because the schema is going to
 * change while the scoring service is designed, and `rm .data/news.db` is a
 * cheaper reset than a migration. Nothing here uses a SQLite-only feature: the
 * DDL ports to Supabase unchanged apart from `TEXT` timestamps becoming
 * `timestamptz`.
 *
 * Node 22 ships `node:sqlite`, so this adds no dependency.
 *
 * ---------------------------------------------------------------------------
 * THIS STORE HOLDS OBSERVATIONS ONLY.
 *
 * Every column here is something a source actually said, or something we
 * actually saw at a point in time. Nothing is a judgement, a threshold, a
 * classification we invented, or a score. Attention modelling, story clustering
 * and any notion of what is "on fire" belong to a separate service reading this
 * database — kept out of here on purpose, so that service can be retuned over
 * the full history without re-scraping. Lokmat keeps no archive, so a re-scrape
 * is not available: anything derived must stay derivable.
 *
 * If you are about to add a column whose value depends on a constant you chose,
 * it belongs in that service, not in this file.
 * ---------------------------------------------------------------------------
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const DB_FILE = path.join(ROOT, ".data", "news.db");

/**
 * Five tables carry the press side of the engine, four more the YouTube side.
 *
 * `articles` is keyed by URL, which is the only identifier both sources agree
 * on, and is written in two passes: discovery fills in what a sitemap knows
 * (Loksatta's news sitemap hands over the headline and keywords for free;
 * Lokmat's hands over nothing but a URL and a timestamp), and ingest fills in
 * the rest from the article's own JSON-LD. `fetch_status` is what separates the
 * two, so the ingest pass is just "everything still pending".
 *
 * `rank_snapshots` records where each article link sat on a section page at a
 * moment in time — one row per URL per page per capture. That is all it does.
 * It draws no conclusion about what a position means. Both papers repeat a
 * global top-stories block across their section pages, and separating that
 * chrome from a desk's own choice is a decision for the reader of this table,
 * which is possible because every (page_id, url) pair in a capture is stored.
 *
 * `rank_sweeps` says which pages were attempted in each capture and which came
 * back. Without it a capture that half-failed is indistinguishable from a quiet
 * news hour, and any per-page denominator computed downstream is silently wrong.
 *
 * `article_revisions` records every distinct `dateModified` seen for an article.
 * One row per observed value; how many there are, and how fast they arrive, is
 * arithmetic for whoever reads it.
 *
 * The `yt_*` tables are the same arrangement pointed at YouTube, and they exist
 * because neither masthead publishes a view, share or comment count — so
 * everything the press side can say about attention is inferred from where an
 * editor put a link. A view count is not inferred. It is the one place in this
 * whole store where the public, rather than a newsroom, is the one being
 * counted, which is why it is worth a second API and a second quota.
 *
 * `yt_stats` is the load-bearing one and it holds a level, not a rate:
 * `(captured_at, video_id) -> views`. Views per hour is the difference between
 * two rows of it, and that subtraction happens downstream, where the window and
 * the treatment of Shorts can be retuned over the whole history. Two things the
 * reader of this table must know: a view count is **not** monotonic — YouTube
 * purges inauthentic views and a later row can legitimately be lower than an
 * earlier one, and nothing here clamps that away — and a NULL means the count
 * is hidden, which is not a zero and must not be averaged as one.
 *
 * `yt_sweeps` is to `yt_stats` what `rank_sweeps` is to `rank_snapshots`: the
 * record of what was attempted. A capture where the quota ran out mid-sweep
 * yields fewer stat rows, and without this it is indistinguishable from an hour
 * in which Maharashtra stopped watching television. It also carries `units`,
 * because the API allows 10,000 a day and a pass that silently starts failing
 * every afternoon is the most likely way this data quietly goes wrong.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  homepage    TEXT NOT NULL,
  language    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  url              TEXT PRIMARY KEY,
  source_id        TEXT NOT NULL REFERENCES sources(id),

  -- Geography, read off the URL at discovery so we never pay for a fetch we are
  -- going to throw away. Structural, not editorial: it records which section of
  -- the site the piece was filed under, mapped onto a canonical district id.
  -- See geography.mjs.
  section          TEXT,
  scope            TEXT,     -- 'district' | 'state'
  district_id      TEXT,     -- canonical id from src/data/districts.ts, NULL when scope='state'

  discovered_at    TEXT NOT NULL,
  sitemap_title    TEXT,     -- Loksatta's news sitemap carries this; Lokmat's does not
  sitemap_keywords TEXT,
  sitemap_lastmod  TEXT,

  -- Filled by the ingest pass from the page's NewsArticle JSON-LD.
  fetch_status     TEXT NOT NULL DEFAULT 'pending',  -- pending | ok | failed
  fetched_at       TEXT,
  fetch_error      TEXT,
  headline         TEXT,
  description      TEXT,
  article_section  TEXT,     -- the publisher's own label, kept verbatim
  keywords         TEXT,
  author           TEXT,
  image_url        TEXT,
  published_at     TEXT,
  modified_at      TEXT,
  body             TEXT,     -- private: analysis input only, never republished
  word_count       INTEGER
);

CREATE INDEX IF NOT EXISTS articles_pending  ON articles(fetch_status);
CREATE INDEX IF NOT EXISTS articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS articles_district ON articles(district_id, published_at);
CREATE INDEX IF NOT EXISTS articles_source   ON articles(source_id, discovered_at);

CREATE TABLE IF NOT EXISTS rank_snapshots (
  captured_at  TEXT NOT NULL,
  source_id    TEXT NOT NULL REFERENCES sources(id),
  page_id      TEXT NOT NULL,    -- which section page, e.g. 'lokmat:maharashtra'
  position     INTEGER NOT NULL, -- 1-based order of the link in the page source
  url          TEXT NOT NULL,
  PRIMARY KEY (captured_at, page_id, position)
);

CREATE INDEX IF NOT EXISTS rank_url  ON rank_snapshots(url, captured_at);
CREATE INDEX IF NOT EXISTS rank_page ON rank_snapshots(page_id, captured_at);

CREATE TABLE IF NOT EXISTS rank_sweeps (
  captured_at  TEXT NOT NULL,
  source_id    TEXT NOT NULL REFERENCES sources(id),
  page_id      TEXT NOT NULL,
  ok           INTEGER NOT NULL,           -- 1 fetched and read, 0 failed
  links        INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  PRIMARY KEY (captured_at, page_id)
);

CREATE TABLE IF NOT EXISTS article_revisions (
  url          TEXT NOT NULL REFERENCES articles(url),
  seen_at      TEXT NOT NULL,
  modified_at  TEXT NOT NULL,
  headline     TEXT,
  PRIMARY KEY (url, modified_at)
);

CREATE TABLE IF NOT EXISTS yt_channels (
  handle           TEXT PRIMARY KEY,  -- what sources.mjs asks for, e.g. '@abpmajha'
  channel_id       TEXT,              -- UC..., resolved from the handle
  title            TEXT,
  uploads_playlist TEXT,              -- the every-upload playlist; resolved once
  subscribers      INTEGER,           -- as reported at resolve time
  resolved_at      TEXT,
  resolve_error    TEXT               -- kept: a handle that stopped resolving is news
);

CREATE TABLE IF NOT EXISTS yt_videos (
  id            TEXT PRIMARY KEY,
  channel_id    TEXT,
  handle        TEXT,
  title         TEXT,       -- latest seen; matching input for the scoring service
  description   TEXT,       -- truncated; boilerplate-heavy but carries place names
  duration      TEXT,       -- ISO-8601. A 45s Short and a 22m bulletin are not
                            -- the same object and views/hour cannot be compared
                            -- across them without knowing which is which.
  live_state    TEXT,       -- 'live' | 'upcoming' | 'none', latest seen. A rolling
                            -- live bulletin accumulates views for hours without
                            -- being about any one story, and would otherwise sit
                            -- at the top of every views/hour ranking forever.
  published_at  TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT
);

CREATE INDEX IF NOT EXISTS yt_videos_published ON yt_videos(published_at);

CREATE TABLE IF NOT EXISTS yt_stats (
  captured_at TEXT NOT NULL,
  video_id    TEXT NOT NULL REFERENCES yt_videos(id),
  views       INTEGER,      -- NULL, never 0, when the uploader hides the count
  likes       INTEGER,
  comments    INTEGER,
  PRIMARY KEY (captured_at, video_id)
);

CREATE INDEX IF NOT EXISTS yt_stats_video ON yt_stats(video_id, captured_at);

CREATE TABLE IF NOT EXISTS yt_sweeps (
  captured_at TEXT NOT NULL,
  step        TEXT NOT NULL,  -- 'resolve' | 'uploads' | 'stats'
  target      TEXT NOT NULL,  -- channel handle, or 'batch:N' for a stats call
  ok          INTEGER NOT NULL,
  requested   INTEGER NOT NULL DEFAULT 0,
  returned    INTEGER NOT NULL DEFAULT 0,
  units       INTEGER NOT NULL DEFAULT 0,  -- quota spent, so the daily 10,000 is auditable
  error       TEXT,
  PRIMARY KEY (captured_at, step, target)
);

CREATE INDEX IF NOT EXISTS yt_sweeps_time ON yt_sweeps(captured_at);

CREATE TABLE IF NOT EXISTS runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task       TEXT NOT NULL,     -- discover | ingest | rank | youtube | backfill
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  ok         INTEGER,
  note       TEXT
);
`;

/**
 * Drop a column left over from an earlier schema, if it is still there.
 *
 * Used to retire fields that turned out to be interpretations rather than
 * observations. `CREATE TABLE IF NOT EXISTS` does not touch a database that
 * already exists, so such columns have to be dropped explicitly or they linger
 * for the life of the file and get read by something downstream.
 *
 * The schema is expected to churn, and re-collecting a week of snapshots is not
 * possible — Lokmat keeps no archive, so a dropped database is a permanently
 * lost week. Cheap in-place migrations are worth more here than schema purity;
 * the matching `ADD COLUMN` helper is four lines and can come back when there
 * is a column that needs it.
 */
function dropColumn(db, table, column) {
  const present = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (!present) return;
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

export function openDb({ file = DB_FILE } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  /**
   * Wait for a competing writer rather than failing the run.
   *
   * The scheduled task refuses to start a second collector while one is
   * running, but it does not know about a hand-run `pnpm news:ingest` or a
   * `news:stories` pass, and going from two sources to seven made every cycle
   * long enough for that overlap to be ordinary rather than unlucky. Without a
   * busy timeout the loser of the race throws SQLITE_BUSY and drops its whole
   * capture — the one failure this store cannot absorb, because Lokmat keeps no
   * archive and a lost fifteen minutes is lost for good.
   */
  db.exec("PRAGMA busy_timeout = 15000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  /**
   * Retired when scoring was moved out of the collector.
   *
   * `rank_snapshots.placement` labelled each link 'sitewide' or 'section' from
   * a 0.6 appearance-fraction threshold chosen here. It was a real distinction
   * and a useful idea, but it was our judgement written into an observation row
   * at capture time, which meant the threshold could never be revisited over
   * past captures. Every (page_id, url) pair in a capture is stored, so the
   * same label is recomputable downstream — with a threshold chosen by the
   * service that actually needs it.
   *
   * `articles.revisions` was a counter incremented only during `--recheck`
   * runs, so it read 0 for every article while `article_revisions` already held
   * 660 observations. A derived count that disagrees with the rows it purports
   * to summarise is worse than no count; `COUNT(*) FROM article_revisions` is
   * exact and always has been.
   */
  dropColumn(db, "rank_snapshots", "placement");
  dropColumn(db, "articles", "revisions");

  return db;
}

/** Register (or refresh) the source rows. Idempotent — safe on every run. */
export function upsertSources(db, sources) {
  const stmt = db.prepare(
    `INSERT INTO sources (id, label, homepage, language) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label,
                                   homepage = excluded.homepage,
                                   language = excluded.language`,
  );
  for (const s of sources) stmt.run(s.id, s.label, s.homepage, s.language);
}

export function startRun(db, task) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO runs (task, started_at) VALUES (?, ?)")
    .run(task, new Date().toISOString());
  return lastInsertRowid;
}

export function endRun(db, id, { ok = true, note = "" } = {}) {
  db.prepare("UPDATE runs SET ended_at = ?, ok = ?, note = ? WHERE id = ?").run(
    new Date().toISOString(),
    ok ? 1 : 0,
    note,
    id,
  );
}
