/**
 * Pass 4 — the running story.
 *
 * Event groups from different days are linked into one thread by the key the
 * model returned for each of them. The intelligence is spent on *naming* the
 * story in `label.mjs`; joining the names is arithmetic, and deliberately so —
 * nothing here scores, ranks or judges, it only decides which articles belong
 * beside each other.
 *
 * A group with no label — most of them, because the pre-filter only labels
 * groups that could plausibly be part of a running story — becomes a thread of
 * one. That is not a degraded result: most news is a single event covered once,
 * and a thread of one displays as exactly that.
 */
import { skeleton } from "./translit.mjs";

/**
 * How alike two thread keys have to be before they are one story.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT AN EXACT STRING MATCH, WHICH IS WHAT THE PLAN ASSUMED.
 *
 * The plan said groups link across days "by matching that key". Measured
 * against real model output, they do not, and the reason is worth writing
 * down: the model is *right* every time and *identical* almost never. The
 * seven groups of the tribal students' Long March came back as
 *
 *   amravati-tribal-students-long-march
 *   amaravati-tribal-students-march
 *   nagpur-tribal-students-political-protest
 *   maharashtra-tribal-students-protest
 *   chandrapur-tribal-hostel-admission
 *
 * Every one of those is a fair description of its own group. No two are equal,
 * and two of them differ only by a transliteration of Amravati. An exact join
 * would have produced five threads of one and looked exactly like the
 * clustering having failed.
 *
 * Asking the model to reuse a neighbour's key instead would work, but it makes
 * the pass sequential and order-dependent — every call would wait on the ones
 * before it, and the answer would change if the groups arrived in a different
 * order. Comparing the keys afterwards is free, parallel, and re-runnable over
 * stored labels without spending anything.
 *
 * The comparison is IDF-weighted over the key vocabulary, for the same reason
 * everything else here is: `students`, `protest` and `news` turn up in dozens
 * of keys and are worth nearly nothing, while `hostel`, `snakebite` and `long`
 * are worth a great deal. A plain token overlap makes every protest in
 * Maharashtra one story.
 * ---------------------------------------------------------------------------
 */
export const KEY_THRESHOLD = 0.42;

/**
 * Group the events into threads.
 *
 * The window matters. Two groups sharing a key six weeks apart are usually the
 * same *topic* rather than the same *story* — `pune-water-supply` recurs every
 * summer — and a thread that spans a season stops being a progression and
 * becomes a subject tag. So a key only joins groups within `threadWindowHours`
 * of each other, which lets a story run as long as it keeps being covered and
 * closes it when coverage stops.
 */
export function buildThreads(
  events,
  labels,
  { threadWindowHours = 24 * 14, keyThreshold = KEY_THRESHOLD } = {},
) {
  const span = threadWindowHours * 3600_000;

  // Oldest first, so a thread is extended in the order it actually happened
  // and `step` numbering falls out of the walk rather than needing a re-sort.
  const ordered = [...events].sort((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt));
  const labelled = ordered.filter((event) => labels.get(event.id)?.threadKey);

  const idf = keyIdf(labelled.map((event) => labels.get(event.id).threadKey));
  const vectors = new Map(
    labelled.map((event) => [event.id, keyVector(labels.get(event.id).threadKey, idf)]),
  );

  /** Threads that a later group is still allowed to join. */
  const open = [];
  const threads = [];

  for (const event of ordered) {
    const label = labels.get(event.id);
    const key = label?.threadKey;

    if (!key) {
      threads.push(newThread(event, label, threads.length));
      continue;
    }

    const vector = vectors.get(event.id);
    let best = null;
    let bestScore = keyThreshold;

    for (const candidate of open) {
      if (Date.parse(event.firstAt) - Date.parse(candidate.lastAt) > span) continue;

      const score = similarity(vector, candidate.vector);
      if (score >= bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best) {
      best.events.push(event);
      best.lastAt = maxIso(best.lastAt, event.lastAt);
      best.keys.add(key);

      // The thread's vector accumulates every key that joined it, so a story
      // whose vocabulary drifts — `long-march` becoming `mantralaya-meeting` —
      // stays reachable from both ends rather than only from the wording of
      // whichever group happened to open it.
      for (const [token, weight] of vector) {
        best.vector.set(token, Math.max(best.vector.get(token) ?? 0, weight));
      }

      // The title follows the newest labelled group. A running story is named
      // by where it has got to, not by where it started: "march withdrawn
      // after 17 days" is a better name for the whole thread than "march sets
      // off", and a reader scanning threads is looking for the former.
      if (label.titleMr) best.titleMr = label.titleMr;
      if (label.actors) best.actors = label.actors;
      if (label.issue) best.issue = label.issue;
      continue;
    }

    const thread = newThread(event, label, threads.length);
    thread.vector = new Map(vector);
    threads.push(thread);
    open.push(thread);
  }

  return threads;
}

/** Key tokens, and how much each is worth. `students` and `protest` are in
 *  dozens of keys and mean almost nothing; `snakebite` is in one. */
function keyIdf(keys) {
  const df = new Map();

  for (const key of keys) {
    for (const token of new Set(key.split("-").filter(Boolean))) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const idf = new Map();
  for (const [token, count] of df) {
    idf.set(token, Math.log((keys.length + 1) / (count + 0.5)));
  }

  return idf;
}

/**
 * A key as an L2-normalised weighted token set.
 *
 * Tokens are folded through the place skeleton before weighting, so
 * `amravati` and `amaravati` — which the model produced for the same town in
 * two consecutive calls — become one token rather than two. That single fold
 * is the difference between the Long March threading and not.
 */
function keyVector(key, idf) {
  const vector = new Map();

  for (const token of new Set(key.split("-").filter(Boolean))) {
    const weight = idf.get(token) ?? Math.log(2);
    const folded = skeleton(token) || token;

    vector.set(folded, Math.max(vector.get(folded) ?? 0, weight));
  }

  let norm = 0;
  for (const weight of vector.values()) norm += weight * weight;
  norm = Math.sqrt(norm) || 1;
  for (const [token, weight] of vector) vector.set(token, weight / norm);

  return vector;
}

function similarity(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;

  for (const [token, weight] of small) {
    const other = large.get(token);
    if (other !== undefined) dot += weight * other;
  }

  return dot;
}

function newThread(event, label, ordinal) {
  const key = label?.threadKey ?? `single-${event.id}`;

  return {
    id: `t${ordinal.toString(36)}${event.id.slice(1)}`,
    threadKey: key,
    vector: new Map(),
    keys: new Set([key]),
    titleMr: label?.titleMr ?? "",
    actors: label?.actors ?? "",
    issue: label?.issue ?? "",
    events: [event],
    firstAt: event.firstAt,
    lastAt: event.lastAt,
  };
}

function maxIso(a, b) {
  return !a || (b && b > a) ? b : a;
}

/**
 * The progression: every article in the thread, oldest first, numbered.
 *
 * Ordered by `published_at` and by nothing else. The panel's whole argument is
 * that a running story is a sequence — students occupy the office, the march
 * sets off, the minister negotiates until 3am, the High Court orders, the
 * march is suspended, the agitation is withdrawn after 17 days — and any other
 * sort order hides the one thing that is interesting about it, which is that
 * it moved.
 *
 * Deduplicated by URL. Two event groups inside one thread can hold the same
 * article when a re-run merges differently, and a step that appears twice
 * makes the progression read as though the story repeated itself.
 */
export function threadSteps(thread, placeByUrl) {
  const seen = new Set();
  const steps = [];

  for (const event of thread.events) {
    for (const article of event.articles) {
      if (seen.has(article.url)) continue;
      seen.add(article.url);

      steps.push({ article, eventId: event.id, place: placeByUrl.get(article.url) ?? null });
    }
  }

  steps.sort((a, b) => a.article.at - b.article.at);
  steps.forEach((step, index) => {
    step.step = index + 1;
  });

  return steps;
}

/** Every desk that filed into a thread — the evidence for why filing by desk
 *  district would have been wrong. One story, six desks. */
export function deskDistricts(steps) {
  return [
    ...new Set(steps.map((step) => step.article.districtId).filter(Boolean)),
  ].sort();
}
