/**
 * Lets a Node script import the app's own read-layer modules.
 *
 * `src/lib/news/fire.ts` is the fire board. It is written for the Next server
 * and there must not be a second copy of it living under `scripts/` — the
 * scoring constants are the whole argument of that module, and a duplicate
 * would drift from it silently and be wrong in a way nobody could see. So the
 * CLI imports the real file, and this makes Node able to resolve it.
 *
 * Two gaps between what TypeScript accepts and what Node's ESM resolver does:
 *
 * 1. `import "server-only"` is a build-time marker that Next aliases away. It
 *    has no package on disk, so it is mapped to an empty module. The guard it
 *    provides is a bundler guard and is unaffected — nothing here is bundled.
 * 2. TypeScript writes `from "./db"`; Node ESM requires `./db.ts`. The
 *    extension is added back when the bare path does not resolve on its own.
 *
 * Node 22 strips the types themselves, so nothing is compiled and there is no
 * build step to keep in sync.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const EMPTY = "data:text/javascript,";

export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: EMPTY, shortCircuit: true };
  }

  // `next` is async, so the fallback has to await rather than try/catch around
  // a promise that has not rejected yet.
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
    try {
      return await next(specifier, context);
    } catch {
      return withFormat(await next(`${specifier}.ts`, context));
    }
  }

  return withFormat(await next(specifier, context));
}

/**
 * Names `.ts` as ES module explicitly.
 *
 * Without it Node tries CommonJS first, fails to parse, re-parses as ESM and
 * warns about it on every run. The package has no `"type": "module"` and should
 * not gain one: it is a Next app, and that field changes how every `.js` file
 * in it is read.
 */
function withFormat(resolved) {
  return resolved.url.endsWith(".ts") && !resolved.format
    ? { ...resolved, format: "module-typescript" }
    : resolved;
}

/** Registers the hook in the current process, for a script that then imports. */
export function registerTsLoader() {
  register(pathToFileURL(import.meta.filename));
}
