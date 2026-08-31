/**
 * `node:sqlite`, declared locally.
 *
 * The runtime has it — Node 22 ships `DatabaseSync`, which is the whole reason
 * `scripts/news/db.mjs` could use SQLite without adding a dependency. The
 * *types* are the gap: this project pins `@types/node` at v20, where the module
 * does not exist yet, so `tsc` rejects the import even though the import works.
 *
 * Declared here rather than fixed by bumping `@types/node` because that is a
 * dependency change with a blast radius across every Node API the project
 * touches, and this is a three-method surface used by exactly one file. When
 * `@types/node` next moves to v22 or later, delete this file — the real
 * declarations are better than these in every respect and will shadow nothing.
 *
 * Only what `src/lib/news/db.ts` actually calls is described. This is not an
 * attempt at the full API, and it should not grow into one: anything needing
 * more of `node:sqlite` than this is the signal to do the upgrade properly.
 */
declare module "node:sqlite" {
  type SQLInputValue = null | number | bigint | string | Uint8Array;
  type SQLOutputValue = SQLInputValue;

  interface StatementSync {
    all(...params: SQLInputValue[]): unknown[];
    get(...params: SQLInputValue[]): unknown;
    run(...params: SQLInputValue[]): { changes: number; lastInsertRowid: number | bigint };
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
  }

  class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }

  export { DatabaseSync, type StatementSync, type SQLInputValue, type SQLOutputValue };
}
