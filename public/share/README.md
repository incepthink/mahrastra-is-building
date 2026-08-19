# Share cards

One PNG per record that has a written post in `src/lib/signals/share.ts`, named
by the record's id. X's intent link has no media parameter, so these are not
uploaded by us — the share button downloads the file and the reader attaches it
in the composer. The file has to be here before the button works: a missing card
is a 404 the reader meets as "File wasn't available on site".

- `pun-notice-e6360393.png` — Talegaon Dabhade STP land-acquisition notice.

1600 × 900. Anything wider than 2:1 gets cropped in the timeline.

## Redrawing them

    pnpm share:cards               # every card
    pnpm share:cards <signal-id>   # one of them

`scripts/render-share-cards.mjs` reads the `card` copy off each entry in
`src/lib/signals/share.ts` and photographs an HTML page with headless Chrome or
Edge — a browser rather than an image library because Marathi needs real text
shaping, and it fetches the site's fonts, so a run wants a network. Add an entry
there, run the script, and commit the PNG it writes here.
