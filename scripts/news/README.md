# News engine

Collects Maharashtra news from Lokmat and Loksatta into a local database, so
that "which story is on fire" can later be answered with arithmetic rather than
with a guess.

Nothing here publishes anything. It is the data layer under the trending board,
the map's news timeline, and the DGIPR pickup report.

## Why it is built this way

**No source publishes attention numbers.** Neither masthead exposes a view,
share or comment count worth reading. Every "trending" figure on those sites is
absent or decorative. So attention is inferred from what is genuinely
observable: how many outlets carry a story, how often they return to it, and
what position the newsroom itself gives it on the page, over time.

**No CSS selectors.** Both sites ship a complete schema.org `NewsArticle` in
JSON-LD because Google requires it — headline, `datePublished`, `dateModified`,
section, keywords, body. That is the one part of the page they cannot afford to
break, so it is the only part this engine reads. A redesign moves every class
name and leaves it alone.

**Geography filter runs before any fetch.** Both sites put the section in the
first URL path segment, so ~3,400 candidate URLs a cycle are cut to a couple of
hundred without spending a request. Per the brief this is geography-led:
anything happening *in* Maharashtra counts, whatever the subject. Relevance is
decided downstream, on stored data, so it can be retuned without re-scraping.

## The four passes

| Pass | What it does | Cost |
| --- | --- | --- |
| `discover` | Read both sitemaps, keep Maharashtra article URLs | ~2 requests |
| `ingest` | Fetch pending articles, read their JSON-LD | 1 per article |
| `rank` | Snapshot the ordered links on 51 watched section pages | 51 requests |
| `youtube` | Snapshot view counts on 8 Marathi news channels | ~16 quota units |

`rank` also records every article URL it sees. That is not an optimisation: it
is how most Lokmat articles are found at all — 337 of its first 389 were never
in its sitemap (see below). It writes two tables per capture: `rank_snapshots`
for every link position seen, and `rank_sweeps` for which pages were attempted
and which came back. The second exists so that a capture where nine pages timed
out is distinguishable from a quiet news hour; without it every fraction
computed downstream uses the wrong denominator.

## The YouTube pass, and why it exists

Everything the press side of this engine knows about attention is **inferred**.
Neither masthead publishes a view, share or comment count, so `rank` has to work
backwards from where an editor put a link. That is a real signal and a weak one:
it measures what a newsroom decided, not what anybody did.

A view count is not inferred. `youtube` is the only place in this project where
the public rather than a newsroom is the thing being counted, which is why it is
worth a second API and a second quota. It writes four tables:

| Table | What it holds |
| --- | --- |
| `yt_channels` | handle → channel id → uploads-playlist id, resolved once |
| `yt_videos` | one row per video: title, duration, live state, publish time |
| `yt_stats` | **`(captured_at, video_id) → views`** — the load-bearing one |
| `yt_sweeps` | what was attempted each capture, and what each call cost |

`yt_stats` holds a **level, not a rate**. Views per hour is the difference
between two of its rows, and that subtraction happens downstream, where the
window and the treatment of Shorts can be retuned over the whole history. Three
things its reader must know:

- **A view count is not monotonic.** YouTube purges inauthentic views, so a
  later row can legitimately be lower than an earlier one. Nothing clamps that.
- **NULL is not zero.** A NULL view count means the uploader hid it. Averaging
  those as zero makes a channel that hides its numbers look unwatched.
- **A rolling live bulletin accrues views for hours without being about any one
  story.** `yt_videos.live_state` and `duration` are recorded so the scoring
  service can exclude them; a `P0D` duration is an in-progress stream.

### The quota is the design constraint

10,000 units a day, reset at midnight Pacific. The costs that matter:

| Call | Units | Used |
| --- | --- | --- |
| `search.list` | 100 | **never** |
| `channels.list` | 1 | once per channel, ever |
| `playlistItems.list` | 1 | per channel per sweep |
| `videos.list` | 1 | per 50 video ids per sweep |

The obvious implementation — one Marathi `search.list` per district, which is
what the original plan called for — costs 3,600 units a sweep and dies before
lunch. Reading each channel's hidden uploads playlist instead costs
`channels + ceil(tracked / 50)`: about 16 units a sweep, or ~800 a day at the
half-hourly cadence. `pnpm news:youtube -- --plan` prints that arithmetic
against the real tracked-video count without spending anything.

Every call's cost is written to `yt_sweeps.units`, and `pnpm news:stats` reports
the spend since the last Pacific midnight, because a pass that silently starts
failing every afternoon is the likeliest way this data goes quietly wrong.

### Each sweep asks about more than the new videos

The video set is the union of each channel's newest 50 uploads **and everything
already tracked inside `YOUTUBE_TRACK_HOURS` (72h)**. That union is the whole
point: growth is only measurable on a video observed more than once. Asking
only about the newest uploads each time would build a table of single
observations with no derivative anywhere in it.

This is also why `pnpm news:stats` leads its YouTube section with *videos
observed 2+ times* rather than a row count. Until that number is non-zero, no
rate of any kind is computable and the trending service has nothing to read.

### Channels are pinned by id, and the reason is a near miss

`YOUTUBE_CHANNELS` in `sources.mjs` originally named channels by handle, on the
reasoning that a handle is the part a human can check. The first resolve pass
retired that idea. Of eight guessed handles, three failed outright — loud,
recorded in `yt_channels.resolve_error`, reported by `pnpm news:stats`, easy to
act on. The other three were the problem: they resolved to the **wrong
channel**, and a wrong channel is indistinguishable from a right one in the
store. `@SaamTVNews` was an 81-subscriber impersonation of the 6.1M broadcaster,
`@LokmatMedia` had zero subscribers, and `@News18Lokmat` belonged to a private
individual. Only a 404 on that last one's uploads playlist gave it away; the
other two were quietly collecting view counts for videos nobody watched.

So every entry now carries a `channelId`. A `UC...` id is issued once and never
reassigned; a handle is squatted, recycled and renamed. Verify a new entry the
way these eight were: a subscriber count consistent with a national broadcaster,
and three recent uploads that read as Maharashtra news. Treat a low subscriber
count as a failure, not a curiosity.

A handle that fails to resolve is retried once a day rather than every sweep, so
one wrong entry costs one unit a day instead of one every thirty minutes; force
an immediate retry with `--reresolve`.

Needs `YOUTUBE_API_KEY` in `.env.local`. Without it the pass skips and says so;
the press side of the engine is unaffected.

## Keeping it running

**This is the part that was missing, and it is not a code problem.** As of
2026-08-30 the collector had run essentially once: `rank_snapshots` held two
captures and `yt_stats` did not exist. Every question this project is being
built to answer — what is growing, what is fading, what is on fire — is a
question about change over time, and none of it is computable from a single
capture, no matter how good the scoring service is.

`pnpm news:watch` runs the loop, but only while a terminal stays open. To make
the history survive a closed window and a reboot:

```bash
pnpm news:schedule            # register a Windows task: news:cycle every 15 min
pnpm news:schedule:status     # is it registered, when did it last run, what did it return
pnpm news:schedule:remove     # stop collecting
```

It registers `scripts/news/schedule-windows.ps1`, which runs `news:cycle` — a
series of short independent runs, so a crash costs one run rather than the loop
— with the working directory pinned to the repo root (`scripts/lib/http.mjs`
resolves its cache relative to the current directory), output appended to
`.data/collector.log`, and `MultipleInstances IgnoreNew` so two collectors never
write the same SQLite file at once. It also clears the two default settings that
refuse to start a task on battery, which would otherwise punch holes in every
curve on days spent away from a desk.

With an external scheduler the cadence lives in the task, not in
`sources.mjs CADENCE` — those constants govern `news:watch` only.

### The run is invisible on purpose

The task launches `wscript.exe` against a generated `.data/run-collector.vbs`,
whose one line runs the collector with a hidden window and waits for it. That
indirection exists because **a visible console window is fatal, not untidy.**

A task with a plain `cmd.exe` or `node` action pops a console on the desktop
every fifteen minutes. Anyone sane closes it — and closing it kills the run
mid-flight with `0xC000013A` (`STATUS_CONTROL_C_EXIT`), leaving a torn
half-capture and a `^C` in the log. That is how this collector spent its first
hour: every run reached `rank` or `youtube` and died there. The symptom
implicates everything except the cause — a `ping` probe registered as a task
"failed" identically, which read as a machine-wide policy against scheduled
tasks. **If a run ever dies at `0xC000013A`, suspect a window before suspecting
Windows.**

With the window gone, `.data/collector.log` is the only place the collector is
visible. Check it, and check the task's *result*, not merely that it exists:

```bash
pnpm news:schedule:status     # LastTaskResult: 0 = success, 267009 = still running
tail .data/collector.log
```

**Two more Windows details**, both of which register a task successfully and
then collect nothing — the failure shape worth guarding against here, since an
empty log looks exactly like a quiet news hour:

- `Register-ScheduledTask` writes through a CIM provider that answers *access
  denied* to a non-administrator. `schtasks.exe /Create /XML` registers the same
  task, as the same user, without elevation. Reads are unaffected, so `-Status`
  still uses `Get-ScheduledTask`.
- A `<LogonTrigger>` with no `<UserId>` means *any* user, which is privileged and
  is refused the same way. It was redundant anyway: a repeating time trigger
  resumes across a reboot on its own, and `StartWhenAvailable` runs the capture
  the downtime missed.

## What each source actually gives us

**Loksatta** publishes a Google News sitemap at `/news-sitemap.xml` carrying the
Marathi headline, publication timestamp and a bilingual keyword list for every
article — ~577 entries over about two days. Discovery costs one request and
already knows enough to cluster on. Dated archive sitemaps
(`/sitemap.xml?yyyy=&mm=&dd=`) are the only backfill either source offers, which
is what `news:backfill` uses.

**Lokmat** is harder. Its `/sitemap.xml` holds ~2,800 URLs but most are topic
hubs and section pagination, leaving only ~50 real Maharashtra articles per
refresh. Its per-section RSS feeds are unusable — `/rss/maharashtra.xml` was
three weeks stale when probed and `/rss/amravati.xml` returns 403. So Lokmat is
discovered mainly from its 41 district section pages, which are live and
complete, and which the rank pass already fetches.

**Lokmat keeps no archive.** Anything that scrolls out of its sitemap window is
unrecoverable. Its history begins the day polling begins — which is the whole
argument for running `news:watch` now, before anything downstream exists.

## Observed volume, and the evergreen tail

A full day of both sources yields roughly **200 Maharashtra articles**
(2026-08-28: 196 — Loksatta 155, Lokmat 41). That is the number to scale from
when adding the remaining thirteen sources.

Section pages also link evergreen material beside live news — Lokmat's Mumbai
page still links pieces from 2023, and about 150 such articles came in on the
first sweep. These are real observations of what the page showed, not parse
errors, so they are kept. But **anything time-sensitive must window on
`published_at`**; the corpus is not uniformly recent and `MIN(published_at)`
will always look alarming.

## One trap the scoring service has to handle

Both papers repeat a global top-stories block on every section page. Lokmat's
appears on all 41, so a single promoted story shows up 41 times in one capture
before anyone has read it. Counting those 41 the same way you count a story
that leads the Beed page and nowhere else is exactly the arithmetic a trending
list must not do.

This engine used to label each link `sitewide` or `section` at capture time,
using an appearance-fraction threshold picked inside `rank.mjs`. That has been
removed. It was a real distinction, but it was our judgement written into an
observation row, and it fixed a threshold that could never afterwards be
revisited against past captures.

Every `(page_id, url)` pair in a capture is stored, and `rank_sweeps` records
how many pages that capture actually reached — so the same label is one `GROUP
BY` away, computed by whoever needs it, against a number they chose:

```sql
SELECT r.url,
       COUNT(DISTINCT r.page_id) * 1.0 /
       (SELECT SUM(ok) FROM rank_sweeps s
         WHERE s.captured_at = r.captured_at AND s.source_id = r.source_id) AS page_fraction
FROM rank_snapshots r
WHERE r.captured_at = ? AND r.source_id = ?
GROUP BY r.url;
```

Observed separation is wide — genuine chrome scores near 1.0, a real district
story near 0.02 — so almost any threshold in between behaves the same. Which is
the argument for picking it downstream, not here.

## What is on fire

`src/lib/news/velocity.ts` and `src/lib/news/fire.ts` are the read side — the
first thing in this project that answers the question the collector exists for.
`pnpm news:fire` prints it.

They are read-time modules beside `prominence.ts` rather than a pass that writes
a table, for the reason this file gives everywhere else: the constants in them
are ours, not the newsroom's, and a constant written into a row is frozen
against a week that cannot be collected again.

### Level and velocity are different questions

`prominence.ts` already answered "how big" — peak reach blended with best
position. Fire is the *derivative*: not where a story got to, but how fast it
got there. A story sitting on forty-one pages all day is big. A story that was
on one page an hour ago and is on forty-one now is on fire. Only the second is
news about the news.

### The signal was measured before it was designed, and it is a step

Across 515 URLs seen in two or more full sweeps, **510 — 99.0% — were at their
peak reach the first time they were ever seen.** Reach does not drift upward. It
steps: the five that moved went 1 → 41 pages in fifty minutes, 3 → 35 in
nineteen, 10 → 34 in three. That is a newsroom lifting a story into its sitewide
top-stories block, and it is the sharpest thing this data contains.

So the module records a climb between two named observations rather than fitting
a slope. A least-squares rate over a step function is a worse number and an
unexplainable one, and the standard here is explainability.

### Four things that were measured and changed the arithmetic

1. **Reach must be normalised inside a masthead.** Lokmat sweeps 41 section
   pages and Loksatta 10. Dividing both by 51, as the level does, caps a
   Loksatta story its own paper has put on every page at 0.196 while a Lokmat
   story on a quarter of its pages scores higher. That is a fact about the two
   sites' navigation, not about the stories, and it would have kept Loksatta off
   the board permanently.
2. **The climb is measured to where the story stands now, not to its peak.** A
   Loksatta piece went from absent to all ten pages and back to one inside three
   captures; scored on its peak it ranked first, level with a Thane drowning
   that reached 40 of 41 pages and was still there an hour later. Of the fourteen
   links ever seen sitewide, five appeared in exactly one capture — the block
   turns over, and a board that cannot tell that from a story catching is
   worthless.
3. **A rate alone saturates; the size of the climb has to lead.** With the
   sampling floor, any gain of a quarter of a masthead inside one capture
   interval tops the scale — two Loksatta pieces on 3 of 10 pages tied exactly
   with the story on 40 of 41. The score is now `min(size, size per hour)`, so
   speed can only ever discount magnitude, never manufacture it.
4. **Arrivals need a different window from climbs, and a much wider one.**
   Counting back from the newest capture, **no story in the corpus files a
   second article inside three hours** — at the velocity window that term is not
   weak, it is arithmetically incapable of being non-zero. It needs 12h to say
   anything and 24h to be worth weighing. A newsroom promotes a story across its
   site inside one capture; it writes the follow-up the next morning.

### What it refuses to do

**A thin capture is excluded, not corrected.** The store already contains a
fourteen-page Lokmat sweep in which a story appears to fall from 40 pages to 13.
It did not fall; we stopped looking. The level can absorb this by holding its
denominator at the widest sweep ever completed, so a thin capture reads low —
the honest direction. A rate has no honest direction, because a thin capture at
either end of an interval fabricates a collapse or a climb depending which end
it lands on. So captures below 60% of a masthead are dropped, per masthead,
since the two are swept independently.

**Null is not zero.** A story with no climb is "we watched and it did not move".
A board with no velocity at all is "we have not watched long enough". Those are
different claims and `velocityAvailable` keeps them apart — below two captures of
one masthead, `pnpm news:fire` says outright that nothing on it is a rate.

**Nothing on the board is a model output.** The story service named these
threads and that is the whole of its involvement; it has no vote in which of
them is burning. Every figure is a count of rows or a difference between two
counts of rows, which is what makes the output a sentence rather than a score:

```
lokmat carried it on 41 of 41 section pages, up from 1 — 12:04 to 13:10
3 articles in 24h (typical story 1.1, so x2.7)  lokmat + loksatta
```

### Run the story pipeline first

`.data/stories.db` is a snapshot, not a view. The board attributes fire to
threads, and an article published after the last story run has no thread to be
attributed to — it appears as its own single-article entry, marked *not yet
threaded*, and its story's arrival count is short by one. The newest and hottest
stories are precisely the ones this bites. So `pnpm news:stories` before
`pnpm news:fire`, or read the board knowing it.

Nothing is dropped either way, which is deliberate: on the run this was built
against, two of the three fastest-climbing stories in the corpus had no thread,
and a board that silently required one would have shown neither.

### Still to build

Outlet breadth from Google News RSS is the next signal and the one that will
change the weights most: it widens the mastheads from two to roughly thirty, at
which point *outlets joining per hour* becomes the strongest countable thing
available. Then YouTube views per hour, matched to threads with the story
service's existing matcher rather than a second one. Then Google Trends last, as
corroboration only, against a fixed anchor term.

## Robots and reproduction

Lokmat's `robots.txt` allows everything. Loksatta's `User-agent: *` is
`Allow: /` — the rule this scraper falls under — but it separately blocks
ClaudeBot, `anthropic-ai`, PerplexityBot, Bytespider, cohere-ai and others by
name. We are none of those and are not training on their text, but the signal is
unambiguous, so **`articleBody` is stored for clustering and never republished**.
What reaches the website is the headline, our own summary, and a link back.
That is also the copyright-safe line: facts and headlines are not protected,
full article text is. Both sites disallow `/search/` and `/wp-json/wp/v2/`;
neither is touched.

Requests are spaced by `scripts/lib/http.mjs` (700 ms per host) and carry a
real User-Agent with a contact address. Every response is cached to
`.cache/scrape/`, so a parser bug is fixed by reparsing the stored copy rather
than by re-crawling.

## Commands

```bash
pnpm news:watch                     # the engine: discover+ingest every 15m, rank+youtube every 30m
pnpm news:cycle                     # one pass of all four
pnpm news:stats                     # what has been collected, and whether it is yet usable

pnpm news:schedule                  # keep it running without a terminal open (Windows task)
pnpm news:schedule:status
pnpm news:schedule:remove

pnpm news:discover
pnpm news:ingest -- --limit=500
pnpm news:ingest -- --recheck       # look for articles edited since publication
pnpm news:rank
pnpm news:youtube
pnpm news:youtube -- --plan         # quota arithmetic, spends nothing
pnpm news:youtube -- --reresolve    # retry channel handles that failed to resolve
pnpm news:backfill -- --date=2026-08-28   # Loksatta only

pnpm news:fire                      # what is on fire: climbs and arrivals
pnpm news:fire -- --hours=6         # a wider velocity window
pnpm news:fire -- --arrivals=48     # a wider arrivals window
pnpm news:fire -- --json

pnpm news:stories                   # derive events, places and running stories
pnpm news:stories -- --dry          # plan and cost, calls nothing
pnpm news:stories -- --no-label     # the free passes only, no API key needed

# any command: --source=lokmat|loksatta
```

Data lands in `.data/news.db` (SQLite, gitignored). SQLite rather than Postgres
for this first run because the schema will change while clustering is tuned and
`rm .data/news.db` is a cheaper reset than a migration — but `openDb` carries a
forward-migration helper, because Lokmat's missing archive means a dropped
database is a permanently lost week. The DDL ports to Supabase unchanged apart
from `TEXT` timestamps becoming `timestamptz`.

## What this deliberately does not do

**This is a collector. It stores observations and nothing else.** No clustering,
no fire score, no ranking, no AI. `youtube.mjs` holds to this as strictly as
`rank.mjs` does: it records that a video had 41,203 views at 14:30, and computes
no rate, no velocity and no leaderboard. Every column in `.data/news.db` is something a
source said or something we saw at a time — never a judgement, a threshold, or a
label we invented. That boundary is enforceable by one question: *does this
value depend on a constant somebody chose?* If yes, it belongs in the scoring
service, not here.

The reason is not tidiness. Lokmat keeps no archive, so anything derived at
capture time is derived once and forever against whatever rule was current that
day. Keeping the store observational means the scoring service can be rewritten
next month and re-run over the whole history.

That service now exists in part: `scripts/news/stories/` reads this database
and writes `.data/stories.db`, grouping articles into events, resolving where
each event happened, and linking events into running stories. It holds to the
boundary — it opens this database read-only, writes nothing back, and every row
it produces carries a `run_id` and is re-derivable from scratch. It is also
where the one use of AI in this project lives, fenced to deciding what a story
is *about* and never what is on fire. See that directory's README.

The score itself now exists too, in `src/lib/news/` rather than here, and it
stays arithmetic on observed counts. "This is #1 because 11 of 13 outlets
carried it and it held a top-3 slot on four homepages for nine hours" is
defensible to Brijesh sir. "The model ranked it highest" is not. See "What is on
fire" above.

Of those two clauses, the first is much the stronger. Cross-outlet carriage is a
plain count of rows. Position on a page is a rougher signal than it looks —
`rank.mjs` reads link order in the HTML source, which is not layout order, and
"held the top slot for nine hours" on a page that updates twice a day mostly
measures how rarely that page updates. Weight it accordingly, and normalise it
against how often each page actually changes.
