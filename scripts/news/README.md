# News engine

Collects Maharashtra news from seven Marathi mastheads into a local database, so
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

**Geography filter runs before any fetch.** Every source names the section
somewhere in the URL path — `lokmat.com/amravati/…`, but also
`pudhari.news/maharashtra/vidarbha/chandrapur/…` — so ~4,600 candidate URLs a
cycle are cut to a few hundred without spending a request. The filter reads
every segment *except the article slug*, and the deepest district wins. Per the
brief this is geography-led:
anything happening *in* Maharashtra counts, whatever the subject. Relevance is
decided downstream, on stored data, so it can be retuned without re-scraping.

## The four passes

| Pass | What it does | Cost |
| --- | --- | --- |
| `discover` | Read every source feed, keep Maharashtra article URLs | ~7 requests |
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

**The planned list is finished, and two of its last three steps ended as
measurements rather than as features.**

Google Trends was the last item — corroboration only, against a fixed anchor
term. It was gated before a collector was written and it is not being collected:
it passes robots, it passes the zero-versus-failure test that retired Google
News RSS, and it needs no query at all, but `geo=IN-MH` turns out to mean
*searched from* Maharashtra rather than *about* it, and 0 of 13 observed terms
attach to a story. See "Public curiosity, and why Google Trends is not
collected" below.

YouTube views per hour was the step before it and is built — see "What the
public is watching". Like outlet breadth before it, neither arrived the way this
file predicted: in both cases the arithmetic was sound and the *attribution* was
the hard half.

So what is actually left is not another source. It is the one the YouTube
measurement pointed at: **an entity board built from publisher keyword
phrases**, which covered 93% of growing videos and 97% of views per hour where
event attribution covered 2.5–4.6%. Its unsolved constant is *which entities are
stories*, and the honest position is that it is not solvable against this store
yet:

| phrase | df | baseline/day | last 24h | burst |
| --- | --- | --- | --- | --- |
| `devendra fadnavis` | 76 | 19.84 | 12 | 0.58 |
| `manoj jarange patil` | 51 | 12.09 | 12 | 0.92 |

The natural instrument is the one used everywhere else here — a level against
its own rate, a standing entity being flat where a story entity spikes. Measured
over lokmat and loksatta, it separates those two by **1.59×**, which is nothing,
and both score *below 1*. The reason is a date rather than a design: with
collection starting 2026-08-30 the baseline is 3.2 days, the Jarange story runs
through the whole of it, and **a baseline that sits inside the story it is meant
to normalise cannot see the story**. Burst does rank the right things at the top
once it has something to work with — `विद्यानंद बापट मारहाण` 8.0,
`vidyanand bapat attack` 6.0, `संतोष पंडित अटक` 3.0 — but at burst ≥ 5 only four
phrases in the corpus qualify and at ≥ 10, none.

Two traps for whoever builds it, both found by getting them wrong first. The
numerator and the denominator **must come from the same sources**: counting the
24h window over all seven mastheads while baselining against the two with
history gives every new outlet's masthead tag a zero baseline by construction,
and `latest marathi news` outranks the biggest story of the day at burst 13.5.
And the baseline's left edge is **2026-08-30, not the oldest `published_at`** —
Lokmat carries a handful of 2023-dated pieces which stretch the denominator to
1,126 days and quietly turn burst into a synonym for the raw 24h count.

Revisit when the baseline is longer than the stories it has to normalise. That
is a matter of waiting, and the collector is already running.

## Outlet breadth, and why it is not Google News

The plan called for Google News RSS: one Marathi query per story, widening the
mastheads from two to roughly thirty. **It was measured and then abandoned, on
two separate grounds, either of which is sufficient.**

**Google News forbids it.** `news.google.com/robots.txt` gives `User-agent: *`
a `Disallow: /` with an allowlist that does not include `/rss/`, and separately
names `ClaudeBot`, `anthropic-ai`, `Claude-Web`, `GPTBot`, `CCBot` and
`PerplexityBot` and refuses them outright. Every feed also carries its own
terms: *"made available solely for the purpose of rendering Google News results
within a personal feed reader for personal, non-commercial use. Any other use of
the feed is expressly prohibited."* This engine already restricts itself on a
**weaker** signal than that — Loksatta's `User-agent: *` is `Allow: /` and it is
only the named-crawler list that made us decide never to republish `articleBody`.
Running a scheduled scraper against an explicit `Disallow` would abandon the
standard the rest of this file argues for.

**And it does not work well enough to be worth arguing about.** Measured against
fourteen real labelled threads:

- Querying the **thread headline** returned *nothing at all* for 8 of 14. A
  headline is a sentence; the search wants terms.
- No query shape beat 9 of 14. Headline, issue text, first actor and
  actor-pairs each hit a *different* subset, so covering the corpus would have
  meant several requests per thread per sweep.
- The shape with the best recall was the worst signal: querying the lead actor
  returned exactly **100 items — the cap — again and again**, because "Devendra
  Fadnavis" matches everything the Chief Minister did that week rather than one
  story.
- **An empty feed is indistinguishable from a broken one.** A query with no
  results returns byte-for-byte the same 1.1 KB shape as a nonsense control, and
  `पुणे` — Pune, second city of the state — returned zero items on every repeat.
  A source whose zero cannot be trusted cannot be counted, which is the whole
  job. This is the `rank_sweeps` lesson again: a capture that failed must never
  look like a quiet news hour.

There is also a boundary objection. A per-thread query is built from a label
**the model wrote**, so how many outlets we find for a story would depend on
which actor a model chose to name first. That drags model output into the
counting path, which is exactly the line `stories/README.md` says it may not
cross.

### What was built instead: five more mastheads, through the front door

The same result — cross-outlet carriage — obtained by reading each publisher's
own feed, which is what this engine already does for Lokmat and Loksatta.

Seventy outlets were observed actually carrying Maharashtra stories. Each
candidate was put through four gates in order: its robots.txt permits the feed
path for `*`; it does not name and block ClaudeBot and friends; it publishes a
Google News sitemap or RSS; and its pages carry a schema.org `NewsArticle` that
`lib/jsonld.mjs` can already read. Five passed:

| source | feed | Maharashtra articles per sweep |
| --- | --- | --- |
| `tv9marathi` | news sitemap, 423 entries | 99 |
| `navarashtra` | news sitemap, 344 entries | 74 |
| `esakal` | RSS `/feed` | 81 |
| `sarkarnama` | RSS `/feed` | 16 |
| `pudhari` | RSS `/feed` | 16 |

Four failed a gate and are listed in `sources.mjs` so nobody re-derives the same
dead ends — `saamana.com` disallows the feed paths; `divyamarathi`, `etvbharat`,
`aaplamahanagar`, `prahaar` and `news18marathi` block ClaudeBot by name;
`dainikprabhat.com` publishes flat URLs (`/pune-dahi-handi-traffic-changes/`)
where the district exists only inside the headline slug; and `lokshahi.com` has
a `NewsArticle` that the extractor got from only half its pages.

**None of the five carries `rankPages`, and that is deliberate.** The rank pass
measures position over time and feeds the velocity half of the score. These five
answer a different question — *did anyone else carry this* — and answering it
costs one feed read rather than fifty page reads. Adding five mastheads to the
rank sweep would triple the request budget to sharpen the weaker of the two
signals.

### Two things this changed underneath

**The geography filter no longer assumes the section is the first path
segment.** That was true of the two mastheads it was written for and false of
most outlets since: Pudhari files `/maharashtra/vidarbha/chandrapur/<slug>`,
Esakal `/uttar-maharashtra/nashik/<slug>`. Every segment *before the article
slug* is now considered and the **deepest** district wins, because taking the
first segment filed every Pudhari district story as `scope='state'` and threw
its district away. The final segment is still never read: slugs are full of
place names, and reading geography out of a slug is guessing where reading it
out of a section path is quoting the newsroom's own filing. Re-run over the
1,895 articles already stored, the new rule changes **not one** of them.

**Carriage stopped being capped at two.** Before, the widest event in the corpus
was carried by 2 outlets, because there were only 2. After one sweep:

```
events by number of outlets carrying them:
  1 outlet(s): 1797     2 outlet(s): 64     3 outlet(s): 5     4 outlet(s): 2

  4 outlets, 16 articles  [lokmat, loksatta, navarashtra, tv9marathi]
     Vidyanand Bapat: पुण्यात DJ वाद पेटला..! विद्यानंद बापट यांना पुण्यात मारहाण
```

That is the sentence this engine exists to be able to say, and it could not say
it before. The numbers will keep rising: the five new sources hold only a few
hours of history, against a fortnight for the mastheads.

## What the public is watching, and why it is not on the board

`src/lib/news/attention.ts` is the read side of `yt_stats`, and `pnpm
news:attention` prints it. It is the first figure in this project that counts
what an audience did rather than what an editor decided — and the reason it
sits beside the fire board instead of inside it is worth the space, because the
arithmetic works and the attribution does not.

### The subtraction, and the six rows it refuses

`yt_stats` holds a **level**. Views per hour is the difference between two of
its rows and that subtraction happens here, once, where the window is a
constant of ours rather than something frozen into a capture.

Six exclusions, each measured against the store:

| refused | why | seen in a 3h window |
| --- | --- | --- |
| `hidden` | a NULL view count is *hidden*, never zero | 0 |
| `single` | one observation is a level, not a rate | 47 |
| `live` | a rolling bulletin accrues views for hours about nothing | 30 |
| `stream` | a `P0D` duration is an in-progress stream | 0 |
| `premiere` | published *after* the first observation in the window | 26 |
| `flat` | no growth to measure | 35 |

Two of those are worth reading twice.

**`premiere` is a trap the age buckets exposed.** The store holds observations
at ages of −24h to −6h, because a scheduled premiere is snapshotted before it
exists. An interval that begins before publication has a denominator that is
partly not elapsed time.

**`stream` never fires, and the entry is honest about it.** Of 6,339 videos, 69
carry a `P0D` duration and every one of them is already `live` or `upcoming`.
The check stays because the two columns are independent observations of one
fact and a stream settling mid-sweep could disagree — but a counter that is
always zero should say so rather than imply a filter that is doing work.

### The view purge is handled by the shape, not by a correction

The schema warns that a view count is not monotonic, and the store proves it:
**602 consecutive pairs fall, across 360 videos, the largest by 11,746 views.**
Summing consecutive deltas would carry every one of those into the answer.

Taking the difference between the **two named observations** at the ends of the
window — the same choice `velocity.ts` makes for the same reason — is immune to
a dip that recovers. Measured, **not one** of the 741 videos in the window had a
negative net gain. The check stays anyway: a purge landing on a window's last
capture would produce one.

The rate is capped the way `velocity.ts` caps a climb, `min(gain, gain per
hour)`, and it bites just as hard. **166 of 741 videos** were observed across an
interval shorter than an hour. Uncapped, the board was led by a clip that took
8,636 views across a single fifteen-minute interval — reported as 34,415/h,
ahead of a video that had genuinely taken 86,343 views in three hours. Speed
discounts magnitude; it never manufactures it.

### The gate this step stood on, and what it measured

*Can a broadcast title be attached to a running story?* Everything else here is
worthless if not, so it was measured before anything was built, with the story
service's existing matcher and no second one.

**Narrowly yes.** At the matcher's own 0.45, over three hours, 30 of 741 growing
videos attach to an article — carrying **2.5–4.6%** of the views per hour the
window measured. The matches themselves are good: `Santosh Pandit Arrest :
मध्यरात्री पोलीस आले` against the Lokmat report of that arrest, six broadcasters
on one story, scores from 0.45 to 0.64.

**And far too narrowly to rank on.** Against a hand probe on proper nouns, that
is 12% of the Vidyanand Bapat story's YouTube attention and **0% of the Manoj
Jarange story's** — 168 videos and 452,608 views per hour, the largest single
thing on Marathi YouTube that week, none of it attributable.

That failure is structural and this project has already named it. There are two
relations. *Same event, two mastheads, same day* is a text problem and text
solves it, which is why the matches that land are clean. *Same running story
across days* is not, because each item exists precisely because it says
something new. **Broadcast volume lives almost entirely in the second
relation** — reaction soundbites, panel segments, rolling coverage. Measured,
the 22 Jarange articles in the corpus are themselves spread across **17
threads**, so both sides fragment and there is no single event left to match.

So the number is reported and does not enter `pnpm news:fire`. A rate over a
sample of unknown size is not a measurement; it is a number whose magnitude
depends on how many broadcasters happened to phrase a title like a newspaper
headline. That is the same boundary objection that retired Google News RSS, and
it holds against a feed we collect ourselves. **`pnpm news:attention` prints its
own coverage every time**, because a board that cannot say what fraction of its
subject it saw is the `rank_sweeps` failure again: a capture that missed most of
its subject must never read as a quiet news hour.

### Two defects that only showed up against the real corpus

The videos were first indexed *with* the articles, as one corpus — which is what
`indexCorpus` is for. Both failures follow, and both are worst exactly where the
signal is largest:

1. **The candidate gate silently dropped the hottest stories.** The matcher
   generates pairs only from terms rarer than `RARE_DF_MAX = 30`. Adding 6,270
   broadcast titles to a 2,054-article corpus inflates every document frequency,
   and inflates a big story's identifying words most: `सालियन` went from df 15 to
   42, `jarange` from 90 to 2,233. The video `विद्यानंद बापट यांना मारहाण, काय
   म्हणाले CM फडणवीस?` ended up with **zero** tokens rare enough to generate a
   single candidate, and scored 0.000 against a corpus holding sixteen articles
   about that assault. Its true best match is 0.408.
2. **IDF was diluted by the videos.** `विद्यानंद` at df 78 of 2,054 articles is
   strong evidence; at df 316 of 8,324 documents it is not.

The fix is not a new constant, it is a correction about membership: **a video is
a query against the press corpus, not a member of it.** IDF, document frequency
and the postings index come from the articles alone, and each video is projected
into that space with the same `termCounts`, `toVector` and `trigrams`. Nothing
inside the matcher changed.

Two smaller measured choices. **Title only, never the description** — the schema
calls it "boilerplate-heavy but carries place names", and the boilerplate wins
by a distance at 788 characters against an 83-character title; including it took
matches at threshold from 25 down to 9. And **no rare-term gate on the video
side**: it is a 20× speed-up that costs 5 of 30 matches, and recall is the one
thing this step cannot spare.

### One thing the attribution earns for free

A recorded headline roundup — `Tv9 Marathi News Top Headline Today | 3 September
2026 | 4 Minute 24 Headlines` — is not live, has a real duration, and so walks
through both documented stream filters while topping the raw views-per-hour
ranking four times over. It names no event, so it matches no article: **0 of the
67 bulletin-shaped videos in the window score above any threshold tested.**

Requiring a story before counting a view turns out to be the bulletin filter
that `live_state` and `P0D` cannot be.

### Known limits

- **A story can appear as several rows.** The bucket is the thread of the matched
  article, so this inherits the story run's threading, fragments and all. The
  first live run split the Vidyanand Bapat assault across three entries. Every
  entry prints the article it matched, so the split is visible rather than
  silent.
- **Place is not checked, and one match in thirty is wrong because of it.**
  Always the same shape — same kind of event, same day, wrong district. `Sillod
  Maratha Protest` scored 0.49 against a Pune rasta roko in support of the same
  man. `place.mjs` and `translit.mjs` could veto a place disagreement, and that
  is deliberately not taken yet: a veto trades recall for precision, and recall
  is what this step is short of.
- **`0.45` is not the zero-false-positive line it is for article-against-article.**
  At this threshold a *count of broadcasters* is sound and any single row of it
  may be wrong, which is why `matchScore` is printed per video and never rounded
  to a verdict.

## Public curiosity, and why Google Trends is not collected

Trends was the last item in the plan: `geo=IN-MH`, corroboration only, against a
fixed anchor term. **It was gated before a collector was written, it passed the
three tests that killed Google News RSS, and it failed on the fourth.** The
distinction matters, because the reasons here are not the earlier reasons and
nobody should retire this source for the wrong ones.

### It passes the gates that retired Google News

**Robots and terms permit it.** `trends.google.com/robots.txt` is ninety-three
bytes: `User-agent: *` with `Disallow: /explore?` and `Disallow: /trends/explore?`.
It does not name ClaudeBot, `anthropic-ai` or any other crawler, and the feed
body carries no terms-of-use clause — where every Google News RSS body carried
*"any other use of the feed is expressly prohibited."* `/trending/rss` is
matched by neither Disallow. This is a published feed and we are allowed to read
it.

That holds only for the RSS. **The anchor-term route is a different endpoint and
it fails both of the first two gates.** `/trends/api/explore` — the backend the
unofficial libraries drive, and the only route that returns the normalised
0–100 interest curve — is covered by `Disallow: /trends/api` in
`google.com/robots.txt`, and it answered our *first* request with HTTP 429. A
source that rate-limits before the first datum cannot distinguish a quiet week
from a throttle.

**A zero is distinguishable from a failure, and decisively so.** This was the
test Google News RSS could not pass, where an empty result was byte-identical to
a broken one.

| request | result |
| --- | --- |
| `geo=IN-MH` | HTTP 200, ~22 KB, **exactly 10 items** |
| `geo=IN-ZZ`, `geo=ZZ`, `geo=GARBAGE!!` | HTTP **400**, 1,691 B, 0 items |
| 26 polls over 25 minutes | **26 × HTTP 200, 10 items**, no throttling, no 429 |

A failure is a 400 of a different size. And absence means something here that it
could not mean for a search query: the board is a **fixed ten slots**, so a
populated board is proof the request worked, and a story missing from it is an
observation rather than a silence.

One trap, and it is the mirror of the one that killed Google News. **`geo=`
empty returns HTTP 200 with ten perfectly plausible items — the national
board.** A dropped or misspelt geo does not fail loudly; it silently answers a
different question. Measured, the IN-MH and IN boards share **no terms at all**
(overlap 0.00; IN-MH against IN-DL, 0.11), so the check is available — but it
has to be written, because the HTTP layer will not do it for you.

**And the query needs no model output.** There is no query. The board is a list
Google publishes; we choose nothing, so nothing a model wrote can enter the
count. This is strictly cleaner than the per-thread query that made Google News
RSS's outlet counts depend on which actor a label named first. On this gate
Trends is the best-behaved external source considered so far.

**The documented anchor-term trap does not apply to this route.** `approx_traffic`
is a bucketed absolute count — `100+`, `200+`, `500+`, `2000+` — not the
per-request normalised index. Two items on one board are comparable and no
anchor term is needed. The trap is real, but it belongs to `/trends/explore`,
which robots forbids anyway.

### It fails on attribution, and the reason is new

*Can a trending search term be attached to a running story?* The same question
the YouTube step stood on, asked with the same matcher, the trending item
projected as a query against the press corpus rather than a member of it.

**Over 14 distinct terms accumulated across 26 consecutive boards, 0 attach at
0.45.** Best score on any term, 0.150. That is not a marginal miss — it
is an order of magnitude below the line, against a threshold at which
article-against-article has no false positives.

The URL join is worse and it is the more telling number, because it needs no
matcher at all. Each trending term ships the publisher URLs Google itself
associated with it. Of **41 such URLs, 0 were in our corpus and 1 was on a host
we collect at all.**

The board is the reason. A representative IN-MH capture:

```
 1. 2027 क्रिकेट विश्व कप   [100+]   Navbharat Times | olympics.com | News18 Hindi
 2. नेपाळचे पंतप्रधान       [100+]   NDTV Marathi | Maharashtra Times | Lokmat.com
 3. saturn decagon         [100+]   NASA Science | Space | BBC Sky at Night
 4. deepti sharma          [500+]   News18 Kannada | myKhel Kannada | Asianet Kannada
 5. गर्भावस्था              [200+]   BBC | AajTak | News18 Hindi        (a Karachi
                                    hospital case)
 6. faiz saifi             [100+]   Brighter Kashmir | ETV Bharat
 7. मदन गोपाल मेघवाल        [200+]   AajTak | Dainik Bhaskar            (Bikaner,
                                    Rajasthan)
 8. nandani sharma        [2000+]   Cricinfo | News18 Hindi | Jagran
 9. bethlehem kudumba unit ott release [500+]  NDTV | TOI | The Hindu
10. mirzapur               [100+]   NDTV | Rediff | iDiva
```

**`geo=IN-MH` means searched *from* Maharashtra, not *about* it.** That is the
whole finding. The board is national and global consumer curiosity — sport,
cinema, disasters, oddities — sampled by the location of the searcher. The press
corpus is state political and civic events. They are not the same subject, and
no threshold reconciles two different subjects.

This is a sharper version of what the YouTube step found. There, broadcast
attention organised around **people** while the press organised around
**events**, and the mismatch cost all but 2.5–4.6%. Search terms are people-shaped
too, and the expectation was the same wall. It is a different wall and a taller
one: not a granularity mismatch within one subject but a **subject mismatch**.

### The best case the board offered, and what it cost

Over the polling window one genuine Maharashtra story did surface, and it is
worth following all the way down because it is the most favourable case this
source can produce.

`पुणे` arrived in the **top traffic bucket, 2000+** — the Indapur land dispute in
which two sons beat their 65-year-old parents in the road, on CCTV. Our own
press covered it three times over: Loksatta on 09-02, TV9 Marathi and Lokmat on
09-01.

The matcher found the right article. It ranked
`Video: "जमीन का विकली?" पोटच्या मुलांनीच वृद्ध आई-वडिलांना भररस्त्यात काठ्यांनी केली मारहाण`
**first**, ahead of 2,000 others, for every text variant tried.

It scored **0.089**.

The ranking is correct and the score is five times below threshold, because
**the two sides are in different languages.** Google's related-news for an IN-MH
term comes from the Hindi national press — AajTak, Dainik Bhaskar, Navbharat
Times — and our corpus is Marathi. `जमीन क्यों बेची` against `जमीन का विकली?`: the
same event, nearly the same words, the same script, and almost no shared terms.
Cross-language overlap is not something a threshold can be lowered into.

The alternative text — the term by itself — is worse in the way this project has
already documented once. `पुणे` alone scored 0.186, and its top hit was an MIDC
masterplan story. A bare district name matches everything filed from that
district, which is exactly why querying `Devendra Fadnavis` returned the
hundred-item cap when Google News RSS was measured.

Fixing the language gap would mean translating one side. Transliteration does
not help — both are Devanagari — so it would mean a model in the path between an
observation and a count, which is the line this project does not cross.

### So nothing is collected

No `trends.mjs`, no table, no term in the fire score. The gate was run before a
collector was written precisely so that this would be the cheap outcome, and it
was: three probes and an afternoon, against a schema and a scheduled task.

Two further facts, recorded so the next reader does not re-derive them. **The
feed is ten items spanning about ninety minutes, and `&hours=` is ignored** —
`hours=4`, `hours=24` and `hours=168` all return the same board. The fire board's
windows are 3h and 24h, so a 24h view of Trends could only ever be accumulated
by polling, and there is no backfill: its history would begin when polling began,
exactly as every other source's did. **And the board turns over slowly**: over
26 polls in 25 minutes the first banked 10 terms and the remaining twenty-five
added **four**, the last of them a Spanish football fixture.

If this is ever revisited, the thing to revisit is not the threshold. It is
whether a source whose subject is national consumer curiosity has any business
corroborating a board about Maharashtra civic news.

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

pnpm news:attention                 # YouTube view growth, attributed to stories
pnpm news:attention -- --hours=6    # a wider window
pnpm news:attention -- --videos     # the raw per-video ranking as well
pnpm news:attention -- --json

pnpm news:stories                   # derive events, places and running stories
pnpm news:stories -- --dry          # plan and cost, calls nothing
pnpm news:stories -- --no-label     # the free passes only, no API key needed

# any command: --source=lokmat|loksatta|tv9marathi|navarashtra|esakal|sarkarnama|pudhari
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
