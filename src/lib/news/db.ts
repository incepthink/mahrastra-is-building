import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * The handle on the collector's SQLite file.
 *
 * The news engine writes `.data/news.db` (see `scripts/news/db.mjs`) and this
 * reads it. Two processes, one file, and the file is the contract between
 * them — which is why nothing here creates a table or migrates anything. If a
 * column this module wants is missing, the collector is what is out of date,
 * and failing loudly is the right answer.
 *
 * Opened read-only. The engine may be mid-cycle when a page renders, and WAL
 * lets a reader see a consistent snapshot while a writer is appending, so the
 * two never block each other. It also means a rendering bug can never corrupt
 * a week of scraping that cannot be re-scraped — the feeds keep no archive.
 *
 * `server-only` is the guard that matters here. This module resolves a
 * filesystem path and imports a Node builtin; a stray import from a client
 * component should fail the build rather than the browser.
 */
const DB_FILE = path.join(process.cwd(), ".data", "news.db");

/**
 * Held for the life of the process rather than opened per request.
 *
 * Opening a SQLite file is cheap but not free, and in dev this module is
 * evaluated on every render of a page that reads it. The handle is stateless
 * as far as callers are concerned — every query below is a single statement —
 * so there is nothing to reset between requests.
 */
let handle: DatabaseSync | null = null;
/** Set once when the file is missing, so the warning is printed once. */
let reportedMissing = false;

/**
 * The database, or null when the collector has never run here.
 *
 * Null rather than a throw, because a missing `.data/news.db` is the expected
 * state of a fresh clone and of any deploy that does not carry the file: the
 * directory is gitignored, since it holds a rebuildable corpus far too large
 * to commit. The page renders the state with no news on it and says so, which
 * is a better first run than a stack trace.
 */
export function newsDb(): DatabaseSync | null {
  if (handle) return handle;

  if (!existsSync(DB_FILE)) {
    if (!reportedMissing) {
      reportedMissing = true;
      console.warn(
        `[news] no database at ${DB_FILE} — run \`pnpm news:cycle\` to collect one.`,
      );
    }

    return null;
  }

  handle = new DatabaseSync(DB_FILE, { readOnly: true });

  return handle;
}

/** Rows come back as null-prototype objects; this is the shape we read them as. */
export type Row = Record<string, string | number | bigint | null | Uint8Array>;

/** Run a query, or get nothing back when there is no database to run it against. */
export function query<T extends Row>(sql: string, ...params: unknown[]): T[] {
  const db = newsDb();
  if (!db) return [];

  return db.prepare(sql).all(...(params as never[])) as T[];
}

/** The same, for a statement that returns one row or none. */
export function queryOne<T extends Row>(sql: string, ...params: unknown[]): T | null {
  const db = newsDb();
  if (!db) return null;

  return (db.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
}

/**
 * The derived store, attached onto the same handle.
 *
 * `.data/stories.db` is written by `scripts/news/stories/` and holds the
 * judgements — which articles are one event, where it happened, what it is
 * about, which groups are one running story. It is a second file rather than a
 * set of columns on `articles` for the reason `scripts/news/stories/db.mjs`
 * gives at length: the collector's file holds observations, the feeds keep no
 * archive, and a week of collection exists exactly once, so anything derived
 * has to stay droppable.
 *
 * Attached rather than opened separately so a story and the articles behind it
 * come back from one statement. SQLite cannot enforce a foreign key across
 * databases, so `thread_articles.url` references `articles.url` in spirit
 * only — which is the point, since this file has to be removable without the
 * collector noticing.
 */
const STORIES_FILE = path.join(process.cwd(), ".data", "stories.db");

/** Null once the attach has been tried and failed, so it is tried once. */
let storiesState: "unattached" | "attached" | "absent" = "unattached";

/**
 * The handle with `stories.*` available on it, or null when there is no
 * derived store.
 *
 * Absent is an ordinary state, not an error: `.data/stories.db` is gitignored
 * and disposable, a fresh clone has never run `pnpm news:stories`, and the map
 * without it is the choropleth — which is a complete product. So this returns
 * null and the page simply has no pin mode to offer.
 */
export function storiesDb(): DatabaseSync | null {
  const db = newsDb();
  if (!db) return null;

  if (storiesState === "attached") return db;
  if (storiesState === "absent") return null;

  if (!existsSync(STORIES_FILE)) {
    storiesState = "absent";
    console.warn(
      `[news] no story database at ${STORIES_FILE} — run \`pnpm news:stories\` to build one.`,
    );

    return null;
  }

  try {
    // Parameterised rather than interpolated: this is a filesystem path from
    // `process.cwd()`, and on Windows it is full of backslashes that a quoted
    // SQL literal would have to escape.
    db.prepare("ATTACH DATABASE ? AS stories").run(STORIES_FILE);
    storiesState = "attached";

    return db;
  } catch (error) {
    storiesState = "absent";
    console.warn(`[news] could not attach ${STORIES_FILE}:`, error);

    return null;
  }
}

/** `query`, against the attached store. Empty when there is no store. */
export function storyQuery<T extends Row>(sql: string, ...params: unknown[]): T[] {
  const db = storiesDb();
  if (!db) return [];

  return db.prepare(sql).all(...(params as never[])) as T[];
}

/** The same, for a statement that returns one row or none. */
export function storyQueryOne<T extends Row>(sql: string, ...params: unknown[]): T | null {
  const db = storiesDb();
  if (!db) return null;

  return (db.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
}
