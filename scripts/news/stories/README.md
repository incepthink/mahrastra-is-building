# The story service

Reads `.data/news.db`, writes `.data/stories.db`. Turns a pile of articles into
**stories with a place and a progression** — which is what the map's pin mode
and the story panel are drawn from.

This is the service `scripts/news/README.md` says the collector is deliberately
not. Everything here is a judgement; everything there is an observation. The
boundary is a second file, and it is enforced by this service never opening the
collector's database except read-only.

```bash
pnpm news:stories                  # full pipeline over the last 14 days
pnpm news:stories -- --dry         # plan and cost; calls nothing
pnpm news:stories -- --no-label    # free passes only; no API key needed
pnpm news:stories -- --show=आदिवासी   # print the threads matching a string
```

## The four passes

| Pass | What it does | Cost |
| --- | --- | --- |
| `match` | IDF-weighted similarity groups articles into **events** | free |
| `place` | a taluka gazetteer resolves **where** each event happened | free |
| `label` | one model call per candidate group says **what it is about** | paid |
| `thread` | groups link across days into a **running story** | free |

Three of the four are arithmetic. On the current corpus a full run is 562
articles → 538 events → 482 threads, with 191 model calls.

## The two relations, which is the thing to understand first

The original plan treated "cluster the news" as one problem. Measured, it is
two, and they need completely different machinery.

**Same event, two mastheads, same day.** Reporters describing one thing reuse
the proper nouns. IDF-weighted term overlap blended with character trigrams on
the headline separates this cleanly: every pair scoring ≥0.45 in the Aug 26–30
window was genuine, with no false positives — Cooper hospital 0.61, Pune police
contempt 0.56, Nepal floods 0.54, Kharghar SIR forms 0.50. **Solved with
arithmetic. No AI.**

**Same running story across days.** The Long March: march sets off → minister
negotiates till 3am → Congress accuses → High Court orders → suspended →
withdrawn after 17 days. Its own cross-day pairs score 0.43, 0.32, 0.22, 0.18,
0.17 and 0.09 — the full length of the distribution, with the median unrelated
pair sitting inside that range. **No threshold separates them, and this is
structural rather than a tuning failure:** each article in a running story
exists precisely because it says something new, so the further the story runs
the less shared text there is to find.

So the second relation is not solved by a threshold. It is solved by *naming*
each group and comparing the names — see `label.mjs`.

## Three corrections the measurements forced

1. **District does not block.** Blocking candidate pairs by district is the
   obvious optimisation and it makes the acceptance test impossible: the Long
   March was filed under `chandrapur`, `thane`, `amravati`, `nagpur` ×4,
   `mumbai-city`, and one statewide row. Blocking is by **time only**, and a
   shared desk district adds 0.03 rather than gating anything.
2. **Lokmat's `keywords` is not sparse, it is generic.** 387 of 389 rows carry
   one; they are taxonomy (`Student,Crime News,Police`) where Loksatta's are
   entities. IDF sorts both out with no per-source branch — `Police` drops to
   nothing, `अशोक उईके` survives.
3. **No borderline pair is sent to a model.** That band is packed with
   same-event duplicates the free matcher already gets right, and the cross-day
   pairs sit mostly below it, so sampling it would pay to re-confirm easy
   answers and still miss the hard ones.

## Where the model is used, and the line it may not cross

One call per **event group**, never per pair. The model decides *what a story is
about* — actors, issue, place, a thread key — and it never ranks, scores, sorts
or judges what is on fire. Nothing it returns is a number.

That line is the one `scripts/news/README.md` draws: *"11 of 13 outlets carried
it"* is defensible, *"the model ranked it highest"* is not. Counting stays
counting. A label cannot promote a story; it can only say which articles belong
beside it.

`gpt-5.6-luna` at `reasoning_effort: low`, confirmed against `/v1/models` on
every run rather than assumed. Overridable with `OPENAI_STORY_MODEL`. Responses
are cached on a hash of the exact prompt, outside the run scope, so re-running
after a threshold change costs nothing and editing the prompt invalidates every
label at once.

**Which groups get a call is a ranking with a budget, not a threshold** — the
same measurement as above, applied to spending. Cross-day group pairs are
ordered by similarity and the top 200 (`--pairs=N`) have their groups labelled,
plus every multi-article group. The ranking is good even though no cut-off in it
is: the top of that order is the Bay of Bengal weather system, Ladki Bahin, the
Marathi-signage PIL, the Nepal floods, and the Long March at rank 9.

### Thread keys do not match exactly, and were never going to

The plan said groups link "by matching that key". They do not. The model is
right every time and identical almost never — the Long March's groups came back
as `amravati-tribal-students-long-march`, `amaravati-tribal-students-march`,
`nagpur-tribal-students-political-protest`, `maharashtra-tribal-students-protest`.
Two of those differ only in a transliteration of Amravati. An exact join gives
five threads of one and looks exactly like the clustering having failed.

So keys are compared as IDF-weighted token sets, with the tokens folded through
the same place skeleton as everything else (`translit.mjs`). `students` and
`protest` are worth nearly nothing; `hostel`, `snakebite` and `long` are worth a
lot.

## Where the event happened

**`articles.district_id` is the desk that filed the piece, not where the event
happened.** Loksatta filed the Amravati-to-Yavatmal march under `nagpur` three
times; nothing happened in Nagpur, that is where its Vidarbha desk sits.

Three tiers, and the tier is carried to the mark:

| tier | evidence | mark on the map |
| --- | --- | --- |
| `taluka` | a gazetteer name in the article's own text | sharp pin at the taluka |
| `district` | only the desk district is known | soft haloed marker at the district centroid |
| `state` | `scope='state'` | no pin — the existing statewide rail |

`choropleth-layer.tsx` argues that "a pin at a centroid is a lie told with great
precision". That argument stands. The answer is not to refuse pins but to refuse
to draw a **sharp** one on a district-level guess.

Current run: 153 taluka · 295 district · 34 statewide threads.

### Matching Latin gazetteer names to Marathi prose

The gazetteer names 356 talukas in Latin (`Babulgaon`); the articles are in
Devanagari (`बाभूळगाव`). The bridge goes **Devanagari → Latin**, never the other
way: romanisation has already destroyed aspiration, vowel length and `ळ`/`ल`,
and no rule puts them back, but Devanagari is nearly phonemic so the forward
direction is a function. Both sides then fold into a deliberately lossy
skeleton. The one-letter mismatch the corpus already contains — gazetteer
`Babulgaon`, Loksatta `बाभूळगाव` — is not a fuzzy match at all: both are
`bulgv`, and they match exactly.

Four things that were measured and are load-bearing:

- **Schwa deletion.** `नगर` is `nagar`, not `nagara`. Rather than answer a hard
  phonological question, `a` is dropped from both sides (except word-initially,
  where it is never a schwa) and the disagreement cannot arise.
- **Marathi inflects place names.** `खालापूरच्या`, `मुंबईतील`, `अमरावतीहून`. A
  gazetteer name is accepted as a *prefix* only when the leftover is an actual
  case ending from a committed closed list — otherwise `पूर्णपणे` becomes Purna
  and `वृद्धीयंदा` becomes Warud, both of which it did.
- **Corroboration.** A name found only in the body or standfirst must appear
  twice. A dateline, headline or hand-applied keyword is the publisher
  asserting where the story is; a word mid-paragraph is just a word, and roughly
  one in three hundred Marathi words folds onto some taluka in a state that has
  356 of them.
- **District namesakes are district-tier.** `मुंबई :` at the head of a story
  says which desk filed it. Ranking the field first gets this backwards, and
  did: the Aug 29 Loksatta piece has the dateline `यवतमाळ` and the keyword
  `बाभूळगाव आंदोलन`, and Babulgaon is where the march was actually suspended.

## The acceptance case

The tribal students' Long March, which the whole design was calibrated on:

```
आदिवासी विद्यार्थ्यांचा अमरावतीहून यवतमाळकडे पायी मोर्चा
  5 articles · 2 events · taluka Babulgaon (yavatmal) · desks: amravati, nagpur
   1. 08-28 12:11 lokmat    अमरावती ते यवतमाळ 'लाँग मार्च'; मागण्यांवर ठाम
   2. 08-28 12:34 loksatta  अमरावतीहून पायीच निघाले यवतमाळच्या दिशेने
   3. 08-29 05:08 loksatta  मंत्र्यांकडून पहाटे ३ वाजेपर्यंत मनधरणी      → बाभूळगाव
   4. 08-29 14:30 lokmat    ‘लाँग मार्च’ अखेर स्थगित
   5. 08-29 16:33 loksatta  मंत्रालयातील बैठकीच्या आश्वासनानंतर स्थगित    → बाभूळगाव
```

Two mastheads, two desks, two days, one story, pinned at the taluka where it
actually ended rather than at any of the six districts that filed it.

## Known limits

- **A statewide story picks up a spurious locality.** The place rule is "newest
  article that knows", and for the Nepal floods thread the newest knowing
  article named Alibag, so the thread pins there. A story whose real scope is
  the state should probably not take a taluka from one of its members; the fix
  is to let a `scope='state'` majority override, and it is not written yet.
- **Key similarity sometimes over-links.** `mumbai-high-court-property-dispute`
  swallowed the Marathi-signage petition: both keys carry `mumbai`, `high`,
  `court`. The threshold is 0.42 and is the obvious knob.
- **Not everything that should thread does.** The Long March's Congress
  accusation and High Court order stayed separate — correctly by the key
  comparison, arguably wrong by a reader's judgement.
- **Eleven talukas cannot be matched by name** because they collide with common
  words (`बंदर`/Bhandara, `झोळी`/Jaoli, `वृद्ध`/Warud, `पूर्ण`/Purna). Articles
  about them fall back to district tier, which is the right way to be wrong.
- **Pune's oblique stem** (`पुण्यातील`) does not prefix-match `Pune`. It is a
  district namesake so it resolves to district tier anyway, but the same
  pattern will hide other `-ए` ending names.

## The store

`.data/stories.db`, gitignored, disposable. Every row carries a `run_id`, and a
run records the constants it was produced under — merge threshold, pair window,
thread window, matcher version, model — so a run from a changed recipe sits
beside its predecessor instead of overwriting it. The last five finished runs
are kept (`--keep=N`).

Nothing here is ever a column on `articles`. Lokmat keeps no archive, so a
re-scrape is unavailable and a week of collection exists exactly once; anything
derived at capture time would be derived once and forever against whatever rule
was current that day. `rm .data/stories.db` costs a re-run. `rm .data/news.db`
costs a week.

The read layer joins across both files in one query by attaching this one onto
its read-only handle on `news.db` — verified working:

```js
db.exec(`ATTACH DATABASE '${storiesPath}' AS stories`);
db.prepare(`SELECT s.step, a.headline
              FROM stories.thread_articles s
              JOIN main.articles a ON a.url = s.url
             WHERE s.run_id = ? AND s.thread_id = ? ORDER BY s.step`);
```

`url` is a foreign key in spirit and never in DDL: SQLite cannot enforce a
reference across databases, and this file has to stay droppable without the
collector noticing.
