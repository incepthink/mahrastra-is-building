# Maharashtra Is Building — what we are doing

A live map of Maharashtra that answers one question:

**What is on fire right now, and where?**

## What we measure

We measure which stories are **growing** — spreading to more outlets,
climbing higher up the page, pulling in more views — and which district they
are actually happening in.

Big is not the same as on fire. A story on every front page for a week is
big. A story that went from one page to thirty in an hour is on fire. We
rank the second one.

## Where the news comes from

**Marathi press — live.** We sweep **Lokmat** and **Loksatta** every 15
minutes, recording how many section pages carry each story and how high it
sits on them.

**Government releases — live.** **Mahasamvad** (the state's information
directorate, mahasamvad.in) is pulled live as a separate layer — around 141
releases across 34 districts. Their district is never guessed: the
department files its own releases by district.

**Google News RSS — next.** Takes us from two mastheads to roughly thirty.
How many separate outlets pick a story up, and how fast they join, is the
strongest signal available to us — and it is free.

## How we rank

**Our own press sweep** is the backbone: pages carrying a story, position on
each page, sampled every 15 minutes. No API, no cost, no rate limit.

**YouTube** gives the one thing newspapers cannot — a number the public
generated rather than an editor. We track views per hour across eight
Marathi news channels: **ABP Majha, TV9 Marathi, Zee 24 Taas, Saam TV,
News18 Marathi, Lokmat, Mumbai Tak, Loksatta**.

**Google Trends** comes last, and only to corroborate. Its numbers are
rescaled on every request, so it can confirm a story is rising but cannot
compare two stories against each other.

## How it works, in five lines

1. **Collect** — the 15-minute sweep above. That repetition is what creates a
   history, and history is what makes growth measurable.
2. **Group** — scattered articles get joined into one story, including the
   same story continuing across several days.
3. **Locate** — we place a story by the place names *in the article text*,
   not by the desk that filed it. (A march from Amravati to Yavatmal was
   filed under Nagpur three times. Nothing happened in Nagpur.)
4. **Rank** — by how fast a story is spreading, not by how large it already is.
5. **Show** — heat view by district, pins for individual stories, and a
   click opens the story as a timeline so you can see it move.

## Filtering the map

Two filters, and they combine.

**By time.** Look through a window of **24 hours, 48 hours, 7 days, 30 days,
or all of it**. 24 hours is the default. If a window is empty the map widens
to the next one and says so, rather than showing a blank state and implying
nothing happened.

**By minister.** Narrow to the **Chief Minister**, the **Deputy Chief
Ministers**, **cabinet ministers**, **ministers of state**, or **any single
named minister** — applied across the heat view, the pins, the side panel and
the government layer at once.

Both live in the page's address, so every view of the map is a link somebody
can send.

## Sharing a government release

Open any Mahasamvad release on the map and send it straight to **WhatsApp**,
the clipboard, or the phone's own share sheet — with the message previewed
before it goes. The message carries the release's opening paragraph **word
for word**. We never summarise or rewrite a government department's copy.

## Three rules we hold to

- **Every number is something we watched happen.** "Eleven of thirteen
  outlets carried it, and it held a top-three slot for nine hours" is
  defensible. "The system ranked it highest" is not.
- **The map never fakes precision.** Exact town → sharp pin. District only →
  soft marker that visibly says so.
- **AI names stories, it never ranks them.** Its only job is reading a group
  of articles and saying what they are about. Counting stays counting.
