/**
 * Polite, cached HTTP for the district scrapers.
 *
 * Every response is written to `.cache/scrape/` so a re-run costs nothing and a
 * site is hit once per URL per TTL. The cache key is a hash of the URL alone,
 * so districts share one store and a Nominatim lookup paid for by one is free
 * for the next. Requests to a host are spaced out; Nominatim gets the 1 req/sec
 * its usage policy asks for.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_ROOT = path.resolve(".cache/scrape");

const USER_AGENT =
  "maharashtra-is-building-poc/0.1 (public-information POC; contact incepthinkhashcase@gmail.com)";

/** Minimum gap between two requests to the same host, in ms. */
const HOST_DELAY_MS = { "nominatim.openstreetmap.org": 1200, default: 700 };

const lastRequestAt = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle(host) {
  const gap = HOST_DELAY_MS[host] ?? HOST_DELAY_MS.default;
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

function cacheFile(url) {
  return path.join(CACHE_ROOT, `${createHash("sha1").update(url).digest("hex")}.json`);
}

async function readCache(url, ttlHours) {
  try {
    const entry = JSON.parse(await readFile(cacheFile(url), "utf8"));
    const age = Date.now() - Date.parse(entry.fetchedAt);
    if (age > ttlHours * 3600_000) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Fetch `url` as text, from cache when fresh.
 * Returns `{ body, fetchedAt, fromCache, status }`.
 */
export async function fetchText(url, { ttlHours = 24, refresh = false } = {}) {
  if (!refresh) {
    const cached = await readCache(url, ttlHours);
    if (cached) return { ...cached, fromCache: true };
  }

  const host = new URL(url).host;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await throttle(host);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(45_000),
      });

      // 404 is a real answer here — pagination ends with one.
      if (response.status === 404) {
        const entry = { url, status: 404, body: "", fetchedAt: new Date().toISOString() };
        await writeEntry(url, entry);
        return { ...entry, fromCache: false };
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const entry = {
        url,
        status: response.status,
        body: await response.text(),
        fetchedAt: new Date().toISOString(),
      };
      await writeEntry(url, entry);
      return { ...entry, fromCache: false };
    } catch (error) {
      lastError = error;
      await sleep(attempt * 1500);
    }
  }

  throw new Error(`Failed after 3 attempts: ${url} — ${lastError?.message}`);
}

async function writeEntry(url, entry) {
  await mkdir(CACHE_ROOT, { recursive: true });
  await writeFile(cacheFile(url), JSON.stringify(entry), "utf8");
}

export async function fetchJson(url, options) {
  const { body } = await fetchText(url, options);
  return body ? JSON.parse(body) : null;
}
