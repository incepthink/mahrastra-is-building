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
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const EMPTY = "data:text/javascript,";

/** `@/` is `src/` — the one path alias `tsconfig.json` declares. Node's
 *  resolver knows nothing about it, and the app's own modules use it for every
 *  cross-directory import, so a script importing one gets no further than its
 *  first `@/data/...` line without this. Types are erased before Node sees
 *  them, so only value imports ever reach here. */
const SRC = path.resolve(import.meta.dirname, "..", "..", "..", "src");

export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: EMPTY, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const named = /\.[mc]?[jt]s(on)?$/.test(specifier);
    const target = pathToFileURL(
      named ? path.join(SRC, specifier.slice(2)) : `${path.join(SRC, specifier.slice(2))}.ts`,
    ).href;

    // A bundler infers a JSON import from the extension; Node requires the
    // attribute to be written at the import site, which the app's own source
    // has no reason to do. Answering the resolution with the attribute already
    // attached is what lets a script import a module that reads
    // `@/data/news-snapshot.json`. It has to be on the *result* — the loader
    // validates what resolve returned, not what it was asked.
    if (target.endsWith(".json")) {
      return {
        url: target,
        format: "json",
        importAttributes: { type: "json" },
        shortCircuit: true,
      };
    }

    return withFormat(await next(target, context));
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
