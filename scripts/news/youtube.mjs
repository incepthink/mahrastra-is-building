/**
 * Pass 4 — YouTube view snapshots.
 *
 * The other three passes watch what editors did. This one watches what the
 * public did, which is the half the newspapers cannot report on: neither Lokmat
 * nor Loksatta publishes a view, share or comment count, so `rank.mjs` has to
 * infer attention from where a link sat on a page. A view count is not an
 * inference. It is the only true engagement derivative available to this
 * project for free, and it is the reason this file exists.
 *
 * Like `rank.mjs`, this pass writes down what it saw and stops. It records a
 * view count at a moment in time. It does not compute views per hour, does not
 * decide what counts as fast, and does not rank anything — because every one of
 * those decisions (what window, how to treat a Short against a bulletin, what
 * to do with a rolling live stream) wants revisiting against the full history,
 * and that history only exists if the recording starts before the deciding does.
 *
 * ---------------------------------------------------------------------------
 * THE QUOTA IS THE DESIGN CONSTRAINT.
 *
 * The YouTube Data API allows 10,000 units a day, reset at midnight Pacific.
 * The costs that matter:
 *
 *   search.list         100 units    ← never used here, and never should be
 *   channels.list         1 unit     once per channel, ever
 *   playlistItems.list    1 unit     per channel per sweep
 *   videos.list           1 unit     per 50 video ids per sweep
 *
 * A per-district `search.list` — the obvious way to write this, one Marathi
 * query per district — costs 3,600 units a sweep and dies before lunch. The
 * arrangement below costs `channels + ceil(tracked / 50)` units a sweep: about
 * sixteen at a normal news volume, or ~800 a day at the half-hourly cadence.
 * That leaves the day's quota mostly unspent, and room to sample faster when
 * something big is happening.
 *
 * Every call's cost is written to `yt_sweeps.units`, so the spend is audited
 * rather than estimated. A pass that silently starts failing every afternoon is
 * the most likely way this data goes quietly wrong.
 * ---------------------------------------------------------------------------
 */
import { YOUTUBE_CHANNELS, YOUTUBE_MAX_TRACKED, YOUTUBE_TRACK_HOURS } from "./sources.mjs";

const API_ROOT = "https://www.googleapis.com/youtube/v3";

/** videos.list takes at most fifty ids per call, and each call costs one unit. */
const BATCH = 50;

/**
 * How long a failed handle is left alone before it is tried again.
 *
 * Not zero, and not forever. A handle can start working — a channel gets
 * renamed, a config typo gets fixed — so a permanent give-up would need a
 * manual reset nobody would remember to do. But retrying a dead handle on every
 * sweep costs a quota unit every thirty minutes for as long as it stays wrong,
 * and burns it on the one call guaranteed to return nothing. A day is long
 * enough that the waste is negligible and short enough that a fixed handle
 * starts collecting the same day.
 */
const RESOLVE_RETRY_HOURS = 24;

/**
 * Errors that mean "stop", as distinct from errors that mean "try again".
 *
 * Retrying a quota exhaustion is not merely useless, it is harmful: it burns
 * the pass's wall-clock budget and delays the next sweep, widening the gap in
 * the very curve this file exists to draw.
 */
export class QuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuotaError";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One API call.
 *
 * Deliberately not `scripts/lib/http.mjs`, for two reasons that are both about
 * correctness rather than taste. That helper caches every response to
 * `.cache/scrape/` keyed by URL — and a snapshot served from a cache is not a
 * snapshot, it is one observation recorded twice under two timestamps, which
 * puts a flat segment into a view curve that was never flat. It would also
 * write the API key, which travels in the query string, to disk in plaintext.
 *
 * The key is redacted from every error message for that same reason.
 *
 * `fetchImpl` is injectable so the whole pass can be exercised against a
 * scripted API without a key and without spending quota.
 */
export async function callApi(endpoint, params, { apiKey, fetchImpl = fetch } = {}) {
  const url = new URL(`${API_ROOT}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", apiKey);

  const redact = (text) => String(text).split(apiKey).join("<key>");
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (caught) {
      lastError = new Error(redact(caught.message));
      await sleep(attempt * 1500);
      continue;
    }

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (response.ok) return payload ?? {};

    const reason = payload?.error?.errors?.[0]?.reason ?? "";
    const detail = redact(payload?.error?.message ?? text.slice(0, 200));

    if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
      throw new QuotaError(`${reason}: ${detail}`);
    }

    // A 4xx that is not a rate limit is a bad request, a dead handle or a
    // revoked key. None of those improve on a retry.
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`HTTP ${response.status} ${reason} — ${detail}`.replace("  ", " "));
    }

    lastError = new Error(`HTTP ${response.status} — ${detail}`);
    await sleep(attempt * 1500);
  }

  throw lastError ?? new Error("request failed");
}

/** YouTube returns counts as strings, and omits them entirely when hidden. */
function count(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve configured handles to channel ids and uploads-playlist ids.
 *
 * Runs once per channel for the life of the database. Every channel has a
 * hidden "uploads" playlist holding all its videos, and reading that playlist
 * costs one unit where searching the channel costs a hundred — so this one-off
 * call is what makes the rest of the pass affordable.
 *
 * A handle that does not resolve is recorded, not thrown. One bad handle in the
 * config should cost that channel's data, not the whole sweep's.
 */
export async function resolveChannels(
  db,
  {
    channels = YOUTUBE_CHANNELS,
    apiKey,
    fetchImpl,
    capturedAt,
    force = false,
    now = new Date(),
    log = console.log,
  } = {},
) {
  const cached = new Map(
    db.prepare("SELECT * FROM yt_channels").all().map((row) => [row.handle, row]),
  );

  const upsert = db.prepare(
    `INSERT INTO yt_channels (handle, channel_id, title, uploads_playlist, subscribers, resolved_at, resolve_error)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(handle) DO UPDATE SET channel_id = excluded.channel_id,
                                       title = excluded.title,
                                       uploads_playlist = excluded.uploads_playlist,
                                       subscribers = excluded.subscribers,
                                       resolved_at = excluded.resolved_at,
                                       resolve_error = excluded.resolve_error`,
  );
  const sweep = db.prepare(
    `INSERT INTO yt_sweeps (captured_at, step, target, ok, requested, returned, units, error)
     VALUES (?, 'resolve', ?, ?, 1, ?, ?, ?)
     ON CONFLICT(captured_at, step, target) DO NOTHING`,
  );

  const resolved = [];
  const skipped = [];
  let units = 0;
  const retryFloor = new Date(now.getTime() - RESOLVE_RETRY_HOURS * 3600_000).toISOString();

  for (const channel of channels) {
    const known = cached.get(channel.handle);
    if (known?.uploads_playlist) {
      resolved.push(known);
      continue;
    }

    // A handle that failed recently is left alone rather than re-bought every
    // sweep. Without this a single wrong entry in the config spends a unit
    // every thirty minutes, forever, on a call that cannot succeed.
    if (!force && known?.resolve_error && known.resolved_at && known.resolved_at >= retryFloor) {
      skipped.push(channel.handle);
      continue;
    }

    // A pinned id in the config skips the lookup entirely — the escape hatch
    // for a channel whose handle the API will not resolve.
    const params = channel.channelId
      ? { part: "snippet,contentDetails,statistics", id: channel.channelId }
      : { part: "snippet,contentDetails,statistics", forHandle: channel.handle };

    try {
      const payload = await callApi("channels", params, { apiKey, fetchImpl });
      units += 1;
      const item = payload.items?.[0];

      if (!item) {
        upsert.run(channel.handle, null, null, null, null, capturedAt, "handle did not resolve");
        sweep.run(capturedAt, channel.handle, 0, 0, 1, "handle did not resolve");
        log(`  ! ${channel.handle} — no such channel`);
        continue;
      }

      const uploads = item.contentDetails?.relatedPlaylists?.uploads ?? null;
      upsert.run(
        channel.handle,
        item.id ?? null,
        item.snippet?.title ?? null,
        uploads,
        count(item.statistics?.subscriberCount),
        capturedAt,
        uploads ? null : "channel resolved but exposes no uploads playlist",
      );
      sweep.run(
        capturedAt,
        channel.handle,
        uploads ? 1 : 0,
        1,
        1,
        uploads ? null : "no uploads playlist",
      );

      if (uploads) {
        resolved.push({
          handle: channel.handle,
          channel_id: item.id ?? null,
          title: item.snippet?.title ?? null,
          uploads_playlist: uploads,
        });
        log(`  + ${channel.handle} → ${item.snippet?.title ?? item.id}`);
      }
    } catch (error) {
      if (error instanceof QuotaError) throw error;
      const message = String(error.message).slice(0, 300);
      upsert.run(channel.handle, null, null, null, null, capturedAt, message);
      sweep.run(capturedAt, channel.handle, 0, 0, 1, message);
      log(`  ! ${channel.handle} — ${message}`);
    }
  }

  if (skipped.length > 0) {
    log(`  · ${skipped.length} handle(s) still unresolved, not retried today: ${skipped.join(", ")}`);
  }

  return { channels: resolved, units, skipped };
}

/**
 * The videos this sweep will ask about.
 *
 * Two sets, unioned. The newest uploads, because a story on fire is usually one
 * somebody just posted about — and everything already tracked inside the
 * window, because **growth is only measurable on a video observed more than
 * once**. Asking only about the newest fifty each time would fill this table
 * with single observations and no derivative anywhere in it, which is precisely
 * the failure this pass exists to avoid.
 */
export function trackedVideoIds(
  db,
  { now = new Date(), trackHours = YOUTUBE_TRACK_HOURS, max = YOUTUBE_MAX_TRACKED } = {},
) {
  const cutoff = new Date(now.getTime() - trackHours * 3600_000).toISOString();
  return db
    .prepare(
      `SELECT id FROM yt_videos
       WHERE published_at IS NOT NULL AND published_at >= ?
       ORDER BY published_at DESC LIMIT ?`,
    )
    .all(cutoff, max)
    .map((row) => row.id);
}

/**
 * One sweep: list each channel's newest uploads, then read the statistics of
 * everything currently tracked.
 *
 * `capturedAt` is a single timestamp for the whole sweep, matching `rank.mjs` —
 * a capture is one observation of the state of the audience, not four hundred
 * smeared ones. It also means the press snapshot and the view snapshot taken in
 * the same cycle carry comparable timestamps, which is the point of running
 * them on one clock.
 */
export async function snapshotYouTube(
  db,
  {
    apiKey,
    fetchImpl,
    channels = YOUTUBE_CHANNELS,
    trackHours = YOUTUBE_TRACK_HOURS,
    maxTracked = YOUTUBE_MAX_TRACKED,
    reresolve = false,
    now = new Date(),
    log = console.log,
  } = {},
) {
  const capturedAt = now.toISOString();

  const sweep = db.prepare(
    `INSERT INTO yt_sweeps (captured_at, step, target, ok, requested, returned, units, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(captured_at, step, target) DO NOTHING`,
  );

  const seeVideo = db.prepare(
    `INSERT INTO yt_videos (id, channel_id, handle, published_at, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
                                   published_at = COALESCE(yt_videos.published_at, excluded.published_at)`,
  );

  const detailVideo = db.prepare(
    `UPDATE yt_videos SET title = ?, description = ?, duration = ?, live_state = ?,
                          published_at = COALESCE(?, published_at),
                          channel_id = COALESCE(?, channel_id),
                          last_seen_at = ?
     WHERE id = ?`,
  );

  const insertStat = db.prepare(
    `INSERT INTO yt_stats (captured_at, video_id, views, likes, comments)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(captured_at, video_id) DO NOTHING`,
  );

  let units = 0;
  let quotaHit = null;

  /**
   * A quota exhaustion during resolution must not escape as an exception.
   *
   * It would leave the capture with no `yt_sweeps` row at all, and a capture
   * with no sweep row is exactly the state this table exists to rule out: an
   * hour of missing data that reads as an hour in which nobody watched
   * anything. So it is caught, written down, and returned as an outcome.
   */
  let resolve;
  try {
    resolve = await resolveChannels(db, {
      channels,
      apiKey,
      fetchImpl,
      capturedAt,
      force: reresolve,
      now,
      log,
    });
  } catch (error) {
    if (!(error instanceof QuotaError)) throw error;
    const message = String(error.message).slice(0, 300);
    sweep.run(capturedAt, "resolve", "(sweep)", 0, channels.length, 0, 0, message);
    log(`  ! quota exhausted during channel resolution — ${message}`);
    return { capturedAt, channels: 0, videos: 0, stats: 0, units, quotaHit: message };
  }

  units += resolve.units;

  const watched = resolve.channels;
  if (watched.length === 0) {
    log("  ! no channels resolved — nothing to sweep");
    return { capturedAt, channels: 0, videos: 0, stats: 0, units, quotaHit: null };
  }

  // --- Step 1: what each channel has posted lately. One unit per channel. ---
  const fresh = new Set();

  for (const channel of watched) {
    try {
      const payload = await callApi(
        "playlistItems",
        { part: "contentDetails", playlistId: channel.uploads_playlist, maxResults: BATCH },
        { apiKey, fetchImpl },
      );
      units += 1;

      const items = payload.items ?? [];
      for (const item of items) {
        const id = item.contentDetails?.videoId;
        if (!id) continue;
        fresh.add(id);
        seeVideo.run(
          id,
          channel.channel_id ?? null,
          channel.handle,
          item.contentDetails?.videoPublishedAt ?? null,
          capturedAt,
          capturedAt,
        );
      }

      sweep.run(capturedAt, "uploads", channel.handle, 1, BATCH, items.length, 1, null);
    } catch (error) {
      const quota = error instanceof QuotaError;
      const message = String(error.message).slice(0, 300);
      sweep.run(capturedAt, "uploads", channel.handle, 0, BATCH, 0, quota ? 0 : 1, message);
      if (!quota) units += 1;
      log(`  ! uploads ${channel.handle} — ${message}`);
      if (quota) {
        quotaHit = message;
        break;
      }
    }
  }

  // --- Step 2: statistics for everything in the window. One unit per fifty. ---
  //
  // The union, not just `fresh`: re-reading a video first seen an hour ago is
  // what turns a pile of levels into a curve.
  const ids = quotaHit
    ? []
    : [
        ...new Set([...fresh, ...trackedVideoIds(db, { now, trackHours, max: maxTracked })]),
      ].slice(0, maxTracked);

  let statRows = 0;
  let batchIndex = 0;

  for (let offset = 0; offset < ids.length; offset += BATCH) {
    const slice = ids.slice(offset, offset + BATCH);
    batchIndex += 1;
    const target = `batch:${batchIndex}`;

    try {
      const payload = await callApi(
        "videos",
        { part: "snippet,contentDetails,statistics", id: slice.join(","), maxResults: BATCH },
        { apiKey, fetchImpl },
      );
      units += 1;

      const items = payload.items ?? [];
      for (const item of items) {
        detailVideo.run(
          item.snippet?.title ?? null,
          (item.snippet?.description ?? "").slice(0, 800) || null,
          item.contentDetails?.duration ?? null,
          item.snippet?.liveBroadcastContent ?? null,
          item.snippet?.publishedAt ?? null,
          item.snippet?.channelId ?? null,
          capturedAt,
          item.id,
        );

        // A hidden view count is stored as NULL, never as 0. Averaging a
        // hidden count as zero is how a channel that hides its numbers ends up
        // looking like a channel nobody watches.
        insertStat.run(
          capturedAt,
          item.id,
          count(item.statistics?.viewCount),
          count(item.statistics?.likeCount),
          count(item.statistics?.commentCount),
        );
        statRows += 1;
      }

      // `requested` exceeding `returned` is the normal state of this row, not a
      // fault: YouTube silently omits videos deleted or made private since the
      // last sweep. Recorded so that the gap in the curve is explicable.
      sweep.run(capturedAt, "stats", target, 1, slice.length, items.length, 1, null);
    } catch (error) {
      const quota = error instanceof QuotaError;
      const message = String(error.message).slice(0, 300);
      sweep.run(capturedAt, "stats", target, 0, slice.length, 0, quota ? 0 : 1, message);
      if (!quota) units += 1;
      log(`  ! stats ${target} — ${message}`);
      if (quota) {
        quotaHit = message;
        break;
      }
    }
  }

  log(
    `  ${watched.length} channels, ${fresh.size} recent uploads, ${statRows} view observations, ${units} quota units`,
  );
  if (quotaHit) log(`  ! quota exhausted mid-sweep — ${quotaHit}`);

  return {
    capturedAt,
    channels: watched.length,
    videos: fresh.size,
    stats: statRows,
    units,
    quotaHit,
  };
}

/**
 * What a sweep would cost, without spending anything.
 *
 * Worth having before raising the cadence: "can we sample every ten minutes" is
 * arithmetic, and it should be arithmetic done against the real tracked-video
 * count rather than a guess.
 */
export function plannedCost(
  db,
  {
    channels = YOUTUBE_CHANNELS,
    now = new Date(),
    trackHours = YOUTUBE_TRACK_HOURS,
    maxTracked = YOUTUBE_MAX_TRACKED,
    everyMinutes = 30,
  } = {},
) {
  const resolved = db
    .prepare("SELECT COUNT(*) AS n FROM yt_channels WHERE uploads_playlist IS NOT NULL")
    .get().n;
  const configured = channels.length;
  const tracked = trackedVideoIds(db, { now, trackHours, max: maxTracked }).length;

  // Before the first sweep nothing is tracked yet, so the floor assumes each
  // channel contributes a full page of uploads — otherwise the estimate reads
  // reassuringly tiny for exactly the run that has never been tested.
  const willAsk = Math.min(Math.max(tracked, (resolved || configured) * BATCH), maxTracked);
  const perSweep = (resolved || configured) + Math.ceil(willAsk / BATCH);
  const sweepsPerDay = Math.floor((24 * 60) / everyMinutes);

  return {
    configured,
    resolved,
    tracked,
    perSweep,
    sweepsPerDay,
    perDay: perSweep * sweepsPerDay,
    limit: 10_000,
  };
}
