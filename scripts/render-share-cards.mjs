/**
 * Draws the share card for every record that has a written post.
 *
 * X's intent link takes text and a URL and nothing else, so the picture that
 * goes with a post cannot be attached for the reader — the share button hands
 * them the file and they attach it themselves. That file has to exist as a
 * static asset in `public/share/`, which is what this writes.
 *
 * The card is drawn by a browser rather than by an image library on purpose.
 * Marathi is a shaping script: matras reorder, conjuncts fuse, and the SVG
 * rasterisers that usually render social cards lay Devanagari out glyph by
 * glyph and get it visibly wrong. A card with mangled Marathi on it is worse
 * than no card at all. Chrome already ships the shaper the site itself leans
 * on, so a card is one HTML page photographed at the size X wants.
 *
 * Copy comes from `card` on each entry in `src/lib/signals/share.ts`, so a
 * sentence is written in exactly one place and this file only decides how it
 * looks.
 *
 *   pnpm share:cards            # every card
 *   pnpm share:cards <id>       # one of them
 */

import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHARE_POSTS } from "../src/lib/signals/share.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "share");

/** X crops anything wider than 2:1 in the timeline; 16:9 sits inside that. The
 *  page is laid out at half the final size and shot at 2×, so the type is
 *  sharp at the dimensions the README promises. */
const CARD = { width: 800, height: 450, scale: 2 };

/** Chrome, or the Edge every Windows machine already has. Same engine, and the
 *  card only needs its text shaper. */
const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const wanted = process.argv.slice(2);
const entries = Object.entries(SHARE_POSTS).filter(
  ([id]) => wanted.length === 0 || wanted.includes(id),
);

if (entries.length === 0) {
  throw new Error(
    `No share posts matched. Known ids: ${Object.keys(SHARE_POSTS).join(", ")}`,
  );
}

const browser = await findBrowser();
const work = await mkdtemp(path.join(tmpdir(), "share-cards-"));

await mkdir(OUT_DIR, { recursive: true });

try {
  for (const [id, post] of entries) {
    const page = path.join(work, `${id}.html`);
    const out = path.join(OUT_DIR, path.basename(post.image.src));

    await writeFile(page, cardHtml(post.card), "utf8");
    await shoot(browser, page, out);

    console.log(`  ${path.relative(ROOT, out)}`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log(`Drew ${entries.length} card${entries.length === 1 ? "" : "s"}.`);

/**
 * The card itself — the survey sheet, cut down to one record.
 *
 * Same grammar as the map: poster bands on the outside, one cream sheet with a
 * hard black rule and a solid offset shadow, the wordmark on the highlight
 * yellow, and the deadline as the only other block of colour. Fonts come from
 * Google over the wire because that is where the site gets them too, and the
 * stack falls back to the system Devanagari face rather than to a Latin one —
 * a run without a network produces a plainer card, never a broken one.
 */
function cardHtml(card) {
  return `<!doctype html>
<html lang="mr">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Marathi&family=Anek+Devanagari:wght@600&display=block" rel="stylesheet">
<style>
  :root {
    --cream: #fffdf2;
    --ink: #14120c;
    --ink-700: #4a4436;
    --ink-500: #746c58;
    --sun: #ffe44d;
    --mint: #a9e2a4;
    --peach: #fbd9a5;
    --coral: #fca79a;
    --blossom: #f2a3ea;
    --lavender: #c5b3f0;
    --marathi: "Tiro Devanagari Marathi", "Nirmala UI", serif;
    --sans: "Anek Devanagari", "Nirmala UI", sans-serif;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${CARD.width}px;
    height: ${CARD.height}px;
    overflow: hidden;
    /* The page: six hard-edged bands, corner to corner. The sheet covers the
       middle, so what survives is a band of colour framing it. */
    background: linear-gradient(
      118deg,
      var(--mint) 0%, var(--mint) 17%,
      var(--peach) 17%, var(--peach) 34%,
      var(--sun) 34%, var(--sun) 50%,
      var(--coral) 50%, var(--coral) 67%,
      var(--blossom) 67%, var(--blossom) 83%,
      var(--lavender) 83%, var(--lavender) 100%
    );
    padding: 26px 30px 30px 26px;
    -webkit-font-smoothing: antialiased;
  }

  .sheet {
    display: flex;
    height: 100%;
    flex-direction: column;
    overflow: hidden;
    border: 2.5px solid var(--ink);
    border-radius: 6px;
    background: var(--cream);
    box-shadow: 8px 10px 0 var(--ink);
  }

  /* The wordmark, on the one large area of yellow the system allows. */
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 22px 13px;
    border-bottom: 2.5px solid var(--ink);
    background: var(--sun);
  }

  .brand {
    font-family: var(--marathi);
    font-size: 25px;
    line-height: 1;
    color: var(--ink);
  }

  .kicker {
    font-family: var(--sans);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink);
  }

  /* Centred rather than top-set: a notice is one or two sentences long, and a
     block of type hung from the top leaves the card looking half-printed. */
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    padding: 22px 30px 26px;
  }

  /* The place, set as the headline: a notice is about somewhere before it is
     about anything else. */
  .place {
    font-family: var(--marathi);
    font-size: 37px;
    line-height: 1.34;
    color: var(--ink);
  }

  .rule {
    height: 2px;
    margin: 19px 0 17px;
    background: var(--ink);
    opacity: 0.14;
  }

  .line {
    font-family: var(--marathi);
    font-size: 22px;
    line-height: 1.62;
    color: var(--ink-700);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: auto;
    padding: 15px 30px 17px;
    border-top: 2px solid var(--ink);
  }

  /* The date, blocked in yellow inside a black rule — the one thing on the card
     that runs out, and the only reason to act on it today. */
  .deadline {
    display: inline-flex;
    align-items: baseline;
    gap: 9px;
    padding: 6px 13px 7px;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    font-family: var(--marathi);
    font-size: 19px;
    line-height: 1;
    color: var(--ink);
    white-space: nowrap;
  }

  .deadline b {
    font-size: 15.5px;
    font-weight: 400;
    opacity: 0.62;
  }

  .source {
    font-family: var(--marathi);
    font-size: 14.5px;
    line-height: 1.4;
    text-align: right;
    color: var(--ink-500);
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <span class="brand">महाराष्ट्र घडतो आहे</span>
      <span class="kicker">Maharashtra Is Building</span>
    </div>

    <div class="body">
      <p class="place">${escape(card.place)}</p>
      <div class="rule"></div>
      <p class="line">${escape(card.line)}</p>
    </div>

    <div class="foot">
      <span class="deadline"><b>मुदत</b>${escape(card.deadline)}</span>
      <span class="source">${escape(card.source)}</span>
    </div>
  </div>
</body>
</html>`;
}

function escape(value) {
  return value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character],
  );
}

/** One page, one PNG. `--virtual-time-budget` is what makes the shot wait for
 *  the webfonts; without it Chrome photographs the fallback face. */
function shoot(browser, page, out) {
  const args = [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    `--force-device-scale-factor=${CARD.scale}`,
    `--window-size=${CARD.width},${CARD.height}`,
    "--virtual-time-budget=12000",
    `--screenshot=${out}`,
    pageUrl(page),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(browser, args, { stdio: "ignore" });

    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${browser} exited ${code}`)),
    );
  });
}

function pageUrl(file) {
  return new URL(`file:///${path.resolve(file).replace(/\\/g, "/")}`).href;
}

async function findBrowser() {
  for (const candidate of BROWSERS) {
    try {
      await access(candidate);

      return candidate;
    } catch {
      // Next one.
    }
  }

  throw new Error(
    "No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.",
  );
}
