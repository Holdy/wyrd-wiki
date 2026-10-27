# wyrd.wiki

A gazetteer of folklore, filed by place, shown on a parchment-coloured page.
It is a static site (plain HTML, CSS and JavaScript, no build step), meant for GitHub Pages.

## Running it

```
npm run server        # python -m http.server, then open http://localhost:8000/
```

The page reads its sitemap and story files with `fetch`, so it must be opened through a server. Opened straight from disk it shows a message saying so. How the filing works is in [filing-scheme.md](filing-scheme.md).

## Publishing

The site is served by GitHub Pages from the `main` branch, at the root, at **https://wyrd.wiki** (repo `Holdy/wyrd-wiki`). Pushing to `main` publishes it within a minute or two.

- `CNAME` holds the custom domain and `.nojekyll` stops GitHub processing the files, so keep both.
- DNS is at GoDaddy: four A records for `@` (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) and the default `www` CNAME to `wyrd.wiki`. "Enforce HTTPS" is on.
- Not done yet: verifying the domain in GitHub (Settings → Pages, account level, a TXT record), which stops anyone else claiming it on Pages.
- The `origin` remote is SSH, and the SSH key on this machine belongs to a different GitHub account than the repo's owner, so pushes have been made over HTTPS with the `gh` login: `git -c credential.helper='!gh auth git-credential' push https://github.com/Holdy/wyrd-wiki.git main`.

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | The whole page: styles, markup and all the scripts |
| `js/triangles.js` | Renderer for the triangle drawings, copied from the triangle-evolution project and extended here (the `animateIn` options below) |
| `rsc/quill/` | The quill font: its TypeScript source (`src/`, built with `npm run quill`), a demo page, and `word.js`, which draws the rest of each title as pen-written words, one canvas per word, with the real text over them. See its README and "Quill titles" below |
| `rsc/letters/A.bin` … `Z.bin` | The illuminated letters |
| `rsc/tags/*.bin` | 182 more drawings, one per tag (witch, ghost-light, …). Shown at the top of the menu for a story |
| `rsc/tags/index.txt` | The names of those drawings, one per line without `.bin`. **Keep it up to date** whenever a drawing is added, removed or renamed |
| `data/stories/` | Sitemaps and story files (see below) |
| `data/spelling.txt` | The word changes the flyer makes to story text (American → British), one `from -> to` per line |
| `W.base64` | The old inline form of the W. No longer used |

The `.bin` files and `js/triangles.js` are copies. When the triangle-evolution project produces new ones, copy them over again (letters go in `rsc/letters/`, the rest in `rsc/tags/`).

After changing the files in `rsc/tags/`, regenerate its index from inside that folder:

```
ls *.bin | sed 's/\.bin$//' > index.txt
```

## Content and navigation

### Layout

- **Top of the left column:** the *breadcrumb-panel*: breadcrumbs for the places the visitor has chosen, for example *Wyrd Wiki › Europe › England › Norfolk › Norwich ›*. Each crumb is followed by a separator and the trail is right aligned, so a long one runs off the left edge of the page. The open story's title sits beside it as the last breadcrumb. Every crumb is a link, except the last when no story is open (it is the current place).
- **Left (below the breadcrumbs):** the options at the current level (no heading). When a story is open it is not listed again; instead the drawing for the first of its tags that has one (see below) is shown at the top of the column, and the menu lists the other stories at that level.
- **Main (the full height of the page, starting at the top):** the home page text at the top level, otherwise the open story, or a short prompt if only a level is chosen.
- Narrow screens (under 700 px) put the options above the main area.
- **Taller than wide (a phone):** a single column in this order: the breadcrumb-panel (no dashed line under it) directly above the title, the story, the closing diamonds, then the tag drawing and the options. (`max-aspect-ratio: 1/1` in the CSS: the `aside` and `main` become `display: contents` so their parts can be ordered.)

### The address

`index.html?/europe/england/norfolk/norwich/peter-the-wild-boy`

Clicking updates the page without reloading, and the back button works. Unknown places show "Nothing found here".

### Sitemaps

Navigation is built from the sitemap files, starting at `data/stories/sitemap.xml`:

- A sitemap is either an **index** (`<sitemapindex>`, listing further sitemaps) or a **page list** (`<urlset>`, listing stories). A blank file counts as an empty index.
- Each path segment is found by matching the file name of a listed sitemap: `North_America.xml` has the address segment `north-america` and the name "North America" (lower case, `_` becomes `-`; `_` becomes a space for display).
- A settlement's sitemap (for example `Norwich.xml`) lists its stories. The story file is the same name with `.md` (`Norwich.md`), in the same folder.
- The `<loc>` values are relative to the sitemap, so only this site's own navigation can follow them. They are not the full addresses search engines expect.

```
data/stories/
  sitemap.xml                 → africa/Africa.xml, europe/Europe.xml, …
  europe/Europe.xml           → england/England.xml
  europe/england/England.xml  → norfolk/Norfolk.xml
  europe/england/norfolk/
    Norfolk.xml               → Buxton.xml, Norwich.xml, …
    Norwich.xml               → one <url> per story
    Norwich.md                → the stories
```

### Story files

A settlement file holds one or more stories, separated by a line containing only `---`. Each has `title`, `summary` and (optionally) `details` sections. The page shows the title, then the summary, then the details under their own heading if there are any. Paragraphs are separated by blank lines, and text between `*asterisks*` is shown in italics. Headings may be written `# title` or `#title`. The `tags` section (comma-separated, for example `witch, approx`) picks the drawing shown in the menu column. Other sections (`location`, `upstream-source`, `reference`, `coordinates`, …) are kept in the file but not shown yet.

A story that belongs to a river, rock formation or road rather than a settlement goes in the file of the next level up, such as `Norfolk.md`. That file has no sitemap or page yet.

Stories tagged `skip` or `duplicate` are kept in the files but left out of the settlement's sitemap, so they don't appear on the site.

### Importing stories

`data/stories` is generated from the research data in the local-llm-agent project (`~/projects/local-llm-agent`, the `*-data-targets/` directories: ghost, witch, hound, devil, curse, …). Run

```
bun tools/import-stories.ts [--source <dir>] [--dry-run]
```

- **Source is the truth.** Every run rebuilds all the place files and sitemaps from the source; edit the source files there, not the generated ones. `--dry-run` prints the counts and warnings and writes nothing.
- **Filing is by file name only** (the source directory layout differs between subjects and is ignored): `Afghanistan.md` is a country, `Aberdeenshire, UK.md` or `Alabama, USA.md` a region, `Acle,norfolk,uk.md` or `Airdrie, Alberta, Canada.md` a settlement. Region files for the UK are filed under England, Scotland, Wales or Northern Ireland (`UK_REGION_COUNTRY` in the script); countries go under their continent (`COUNTRY_CONTINENT`). A name the script doesn't know is reported as a warning and its stories are skipped, so add it to the lists.
- **Several subjects, one place:** stories from every subject for the same place are merged into one file (sorted by title). Identical copies are dropped; two stories with the same title in a place are both kept but only listed once in the sitemap.
- **Tags:** `skip` and `duplicate` stories are kept in the file but left out of the sitemap. Everything else (`private`, `pinless`, `approx`, …) is published.
- **Stories filed at a country or region** (such as `Alabama, USA.md`) are written to `<Region>.md` but have no page yet, so they are not in any sitemap, and a country or region with nothing but such stories is not listed at all (about 990 of the 2,300 stories).
- **A story filed in the wrong place** is fixed by moving it between files in local-llm-agent, not here. The Boleyn bridges, the Hethel Thorn and the Great Yarmouth execution were moved that way (the Boleyn bridges now sit in `Norfolk, UK.md`, listed in `witch-data-targets.progress` so the research run skips it).

## Look and behaviour

All of the animation respects the visitor's *reduced motion* setting (see the end).

### Parchment

- The paper is generated in CSS and SVG noise, with no image files: colour blotches, a fine grain, larger stains, and darkened edges.
- The grain and stains scroll with the page. The dark edges stay fixed to the window.
- **Arrival:** the page starts white, turns to the flat parchment colour over 1.6 s, then the blotches, the light-to-dark sweep, the grain and the dark edges come in together over 3.5 s. Each stage is a layer that only changes its opacity (`#paper` is the colour, `#paper::before` the blotches, `body::before` the grain, `body::after` the edges), so the browser fades it without repainting. This matters: an earlier version animated the gradients themselves, which repainted the whole background every frame and dropped the page from 60 to about 15 frames a second while the title was being written, slowing the quill. Under reduced motion the finished paper shows at once.
- **No flash of the home text:** a script at the top of the head adds a `deep` class to `<html>` when the URL has a query string, which hides the home section until the first render has chosen what to show.

### Illuminated letters

- The first letter of a story or level title, and the **W** of the home page, is a drawing made of semi-transparent triangles, loaded from `rsc/letters/<letter>.bin` and drawn by `js/triangles.js`.
- Each letter's canvas is multiplied onto the paper, so the white of the drawing disappears.
- A real letter lies invisibly on top, so selecting and copying a title gives plain text ("Peter the wild boy").
- The empty margin inside each drawing is measured, and the text is pulled in to meet the ink.
- **Story titles:** the first line sits on the bottom of the letter; wrapped lines hang below it, right-aligned, and never run under the letter.
- **Baseline:** on the home page too, the title's baseline is the bottom of the letter's ink (after trimming), and the quill writing's lowest ink sits on it.
- **Arrival:** each letter unfolds with the `sweep-right` transition (see "Animating a drawing in"). Its empty margin is measured from a finished copy drawn off the page, since the real one starts out flat.
- If a letter file can't be loaded, the plain letter is shown.
- The points of each drawing flee a mouse pointer, or the flyer (below), and drift back.

### Quill titles

The rest of each title (everything after the illuminated letter, and the "yrd Wiki" of the home page) is written in a quill font, a stroke font drawn by sweeping a fixed-angle nib along each stroke. The library is in `rsc/quill/` (TypeScript in `src/`, built with `npm run quill`, a demo page in `demo/`); `rsc/quill/word.js` is the page's own part, called by `writeTitle()` in `index.html`.

- **One canvas per word.** Each word is an inline-block holding a canvas and, over it, the real characters in transparent type, each as wide as its glyph. So the browser wraps the words, and selecting, copying and ctrl-F work on real text. The h1 carries the whole title as `aria-label` and the drawn parts are `aria-hidden`, so a screen reader reads it once.
- **No other font flashes up.** The quill font needs no loading, so the h1 is hidden (`pending`) only until its words are laid out, and nothing is ever shown in another face first. If the module can't load, the plain text is shown.
- **Look:** black ink at 74% opacity multiplied onto the paper (`.qw canvas` in the CSS: opacity is on the whole canvas so overlapping strokes don't darken), nib glitches (ink dropouts) at twice the library's default rate (`inkFadeRate` in `QUILL`), size 0.62 of the h1's font size, drawn at the screen's pixel density.
- **Baseline:** the strokes are centre lines and the slanted nib hangs below them by half its height, so the writing is lifted by that much and the lowest ink sits on the baseline. Word boxes give back `TRIM` (0.15 of the size) above and below, and the offset allows for it, so lines are about 2.1 × the size apart.
- **Writing:** each letter takes the same time to write, 0.5 s (`LETTER_TIME`), so the pen moves fast over a long letter like "w" and slowly over a short one like "l". Each letter starts 0.15 s (`LETTER_GAP`) after the one before, so pens overlap, and the next word starts when the last letter of the previous word starts. All the timing runs on one clock that advances by real frame time but never more than a frame's worth, so under load everything slows together and nothing catches up. It begins when the illuminated letter's sweep is a third of the way in (`doneAt: 1 / 3` in `drawInitial`). Under reduced motion the title is drawn at once.
- **Bending:** once a title is fully written, its letters are drawn towards at most two points of influence: slot 0 the mouse pointer, slot 1 the flyer (not while it rests among the diamonds). `index.html` just calls `influence(slot, x, y)` from `word.js` (`null` clears a slot); the bending itself is in the library (`makeDrawing(...).bend(points, dt)` in `rsc/quill/src/render.ts`). The two ends of each stroke stay pinned; only its middle point moves (towards a point of influence, more strongly the closer it is, by up to 0.325 of the size but never past it, for anything within 2.2 sizes), and the rest of the stroke follows it in a straight ramp, so each stroke acts as two shorter lines meeting at that point. The middle moves over in about 0.08 s and drift back over about 0.8 s (as the triangle drawings do), and the ink glitches stay where they were. Only words near a point of influence, or still moving, are repainted. Not done under reduced motion.
- **Debugging:** add `#quill-debug` to the address (or run `quillDebug()` in the console; `quillDebug(false)` turns it off) to draw a one-pixel red box round each glyph's cell: its advance width (the glyph's width plus the letter spacing) by the full height of the word box (1.7 above the baseline, 0.7 below).
- **Resizing** redraws the words (without animation) only if the font size changed; the line grouping is redone either way.
- **The flyer** flies through the middle of an "o" using `cell.inkCentre(k)` from `word.js`, which works out the centre of that glyph's strokes, not the transparent text box.

- **Drop caps:** the large red first letter of a story's summary and details is written in the same quill (`dropCap()` in `index.html`), in the illuminated letters' dark red, two sizes of the paragraph's text, with the real letter invisibly over it. It starts as a plain letter in the old drop-cap style until the quill module loads, and is drawn at once, not written with the pen. It is not bent by the mouse. The first letter is taken out of the text before circles and spelling corrections look at it, so those skip a first word ("Witches" at the start of a paragraph is not circled). The home page's drop cap is still the font's.

### Dust

- Round motes, half a millimetre across, pale yellow, 70–90% opaque, about one per 10 cm × 10 cm of window.
- Each mote circles a point that drifts in a slowly turning direction.
- **Mouse:** motes near the pointer's path are pushed mostly sideways, a little along it, with a short delay and a swirl, at half of the original strength.
- **Flyer:** moves them in the same way.
- **Bursts:** flying through an "o" adds eight motes (see the flyer's activities). They are ordinary motes: thrown out from the letter (12 px per frame, coasting about 100 px under the same damping as any push), always at full visibility (0.9), then they circle and drift like the rest, with no fading. They stay among the dust, at most 24 at a time (`BURST_KEEP`): the oldest give way to new ones. Resizing the window doesn't remove them.

### Tag drawing in the menu

- When a story opens, the page looks through its tags in order and uses the first one that has a drawing in `rsc/tags/`. A story with no matching tag (or no tags) shows `rsc/tags/book.bin`.
- Which tags have drawings comes from `rsc/tags/index.txt`, which is loaded in the background when the page starts. It must be kept up to date.
- The drawing is 200 px, multiplied onto the paper like the letters, with the tag name as its tooltip. Its points flee the mouse and the flyer in the same way.
- It builds up on screen: each triangle starts as a dot in the middle of the image and moves out to its position and size (see "Animating a drawing in" below).

### Animating a drawing in

`renderTriangles` (in `js/triangles.js`) takes an option `animateIn: "from-center"`. In triangle order, each triangle starts as a dot in the middle of the image and eases out to its real position and size. A new one sets off every 1/100 second (`animateGap`, in seconds) and each takes 3 seconds to arrive (`animateTime`), so a 90-triangle drawing finishes after about 4 seconds. Triangles keep their colour throughout; those that haven't set off yet aren't drawn. It works together with the mouse-repel option, and is skipped under reduced motion. Only the menu's tag drawing uses it so far.

`animateIn: "sweep-right"` is used by the illuminated letters. An imaginary line crosses the image from left to right in 2 seconds (`animateTime`, default `SWEEP_TIME`), easing in and out. Each triangle starts flat, all three points at its own leftmost x (so it draws nothing), and stretches to its real width as the line crosses it; very narrow triangles take at least 8% of the image (`SWEEP_MIN_SPAN`). `onDone` is called when the sweep has run `doneAt` of its time (default 1; the title uses 1/3 to start the quill), and at once if nothing animates. Both options work with mouse-repel and are skipped under reduced motion.

These options exist only in this site's copy of `js/triangles.js`, not in the triangle-evolution project, so keep it if you copy a newer renderer over.

### Spelling corrections

The flyer corrects spellings in the summary and details text of a story, by editing the page text for real (a copy of the text only, the story files are not changed).

- **The list:** `data/spelling.txt`, lines like `neighbor -> neighbour`. Matching is by whole word, ignoring case, and a capital at the start is kept. Add plural and other forms as separate lines. Lines starting `#` are comments. The list is loaded in the background when the page starts.
- **What it does:** about 3 seconds after a story opens, after any pencil circles, the flyer flies to a point just below the place inside the word where the spelling differs. There it narrows to a thin text cursor, then slides up into the gap between the letters. It backspaces the letters that are wrong one at a time and types the right ones (about 0.26 seconds each), pauses a moment, slides up out of the line still thin, and flies off, its diamond shape returning as it goes.
- **Limit:** corrections count as flight activities (see "The flyer" below): at most one or two per flight. Any left over wait, in the story's queue, for a later flight.
- **Which letters:** it compares the old and new word from both ends, so `baptizing → baptising` changes only the `z`, `center → centre` swaps the last two letters, and `fulfill → fulfil` deletes one `l`.
- **Without the flyer** (reduced motion) the corrections are applied straight away.
- Titles and the story files themselves are not changed.

### Pencil circles

- In a story's summary and details, the words *witch*, *witchcraft*, *magic*, *wizard*, *devil* and *devils* (any capitalisation) are circled about 3 seconds after the story opens, when the flyer picks that activity. To add a word, edit the pattern in `fillText` in `index.html`.
- The circle is a loose, open, hand-drawn loop: its ends miss each other and the shape is different each time.
- The flyer draws it. It goes round whichever way carries on from how the flyer arrived.
- Once drawn, the circle fades out evenly over 255 seconds.

### The flyer

A small 50% see-through sepia diamond that flies along **rails**. A rail is a smooth path, made only of arcs and straight lines with no sharp corners, worked out in advance from where the diamond is and which way it is heading to where it wants to be and the way it should be heading when it gets there (a Dubins path: the shortest path for a given tightest turn, here 110 px). The diamond follows its rail at an even speed, easing in and out only where it starts from or stops at a place.

If the thing it is heading for moves (the mouse, or a word or letter that has scrolled), the rail is **rewritten** from where the diamond now is and the way it is facing, so it still turns smoothly. Everything is at one fifth of the original pace (`PACE`).

| Mode | What it does |
| --- | --- |
| rest | Sits in its place in the closing diamonds |
| wander | Rails to random points around the window, each arriving already heading for the next so the legs join without a turn |
| approach | Rails to the start of a word's circle, arriving along the oval (going round whichever way is the shorter way in), or to a point just below a word it will correct, arriving heading up |
| trace | Goes round the oval itself, which is the rail; the stroke is drawn behind the diamond |
| mouse | Rails towards the mouse, rewritten whenever the mouse moves about 35 px, until within 3 cm (it doesn't circle it) |
| home | A rail to the free place at the left of the closing row, arriving heading right, then it rests there |

- **Activities:** a flight is one or two activities (the number is chosen at random as it sets off). They are taken in turn, in the order below, carrying on from where the last flight stopped. The round starts at a **random** activity when the page loads (not always at corrections or circles), then goes round in order; one the page can't offer just now (no words to circle, no mouse, no "o" in the title) is passed over:
  - correct a spelling (see Spelling corrections),
  - circle a word with the pencil,
  - fly to the mouse (if there is a real mouse over the window),
  - fly straight through an illuminated letter or the menu's tag drawing (in from one side, out the other, so it disturbs the drawing),
  - fly straight through an "o" or "O" in the story title. As it passes through the middle of the ink, eight dust motes join the dust there, thrown one to each compass point (N, NE, E, …); see "Dust".
  Between activities it wanders. As soon as its allowance is used up and the last activity is finished, it goes straight back to the three diamonds, even if they are scrolled off screen. If the page offers nothing to do, it wanders until 65–70 seconds and then goes home.
- **Console log:** the browser console shows what it is doing: `flyer: taking off, plans N activities, home in about Ns` at each takeoff (the activities themselves are chosen one at a time, as the page allows), `flyer: next activity "..."` for each, and `flyer: nothing on offer, wandering`.
- **Mouse visit:** it follows rails towards the mouse until within 3 cm; it gives up after 40 seconds. Only a real mouse counts, not touch.
- **Leaving and landing smoothly:** it leaves the three diamonds already facing right, on a straight rail out to the right of the row, so it never turns on the spot. Coming home, its rail ends at the free place heading right, so it always arrives from the left (looping round first if it has to).
- **Flight length:** a flight usually lasts from half a minute to a minute, and never more than 90 seconds: at 75 seconds, whatever it is doing, it turns for home.
- The tip of the diamond always faces the way it is heading, and it nudges the illuminated letters and dust as it passes. Flying through a letter, the tag drawing or an "o" is a rail that curves in to line up and then runs straight through the middle, going in and out only a little past the edge. The direction is chosen from many random ones so that the rail doesn't cross any of the other drawings on the page (the tag drawing and the title letter sit side by side).

### The diamonds

- **The flyer's row** is directly under the title (`#pips`). `render()` moves it to follow whichever title is showing, so it is under "Wyrd Wiki" on the home page and under the story's title elsewhere. It is where the flyer starts, lands and rests, so the flyer flies back up to the top to land, even if the page is scrolled.
- **The bottom row** (three diamonds ending the page content) is decoration only; the flyer ignores it.
- The three diamonds lie on their sides. The flyer is always the rightmost one. While it is away the other two slide one place right over a minute. If the flyer comes back before that minute is up, they hurry the rest of the way (in about 6 seconds), and the flyer circles its waypoint until the place is free.
- It lands in the free place at the left and rests for 10 seconds as that diamond. Then the rightmost diamond becomes the next flyer, and so on, so each takes a turn.
- At the start the flyer rests 4 seconds before the first launch.

### Reduced motion

If the visitor asks for reduced motion: there is no flyer, circles or dust animation (the dust is drawn once), the three diamonds just sit still, the parchment shows finished, the illuminated letters appear complete (no sweep) and the quill titles are drawn at once.

## Settings worth knowing

All are variables near the code they affect in `index.html`.

| Setting | Where | What it does |
| --- | --- | --- |
| `AREA_PER_MOTE` | dust script | Dust density |
| `MOTE` | dust script | Mote size |
| `PUSH_ASIDE`, `PUSH_ALONG`, `REACH`, `CURL`, `DAMPING` | dust script | How the dust reacts to a moving point |
| `PACE` | flyer code | Overall slowdown (1 = original pace) |
| `CRUISE`, `TURN_RADIUS` | flyer code | Speed, and the tightest curve a rail may make |
| `1700 * PACE` | `trace` mode | How long a circle takes to draw |
| `EDIT_STEP`, `BELOW` | flyer code | Time per letter when correcting a spelling, and how far below the word it waits before sliding up |
| `255000` | `finishCircle` | Fade time of a circle |
| `65000`, `75000` | `launch`, `stepSprite` | When the flyer comes home |
| `3 * CM` | `mouse` mode | How close counts as having reached the mouse |
| `BURST_SPEED`, `BURST_KEEP` | dust script | How hard the "o" motes are thrown, and how many stay |
| `QUILL` (`color`, `inkFadeRate`), size `0.62` | `index.html`, `writeTitle` | Quill ink colour, nib glitch rate, size relative to the title |
| `.qw canvas` opacity | CSS | How see-through the quill writing is |
| `LETTER_TIME`, `LETTER_GAP`, `TRIM` | `rsc/quill/word.js` | Time to write each letter, delay between letters, line spacing |
| `BEND_REACH`, `BEND_PUSH`, `PUSH_TIME`, `RETURN_TIME` | `rsc/quill/src/render.ts` | How far from the mouse or flyer the letters are drawn towards it, how far, and how fast they move over and back |
| `doneAt: 1 / 3` | `drawInitial` | How far through the letter's sweep the quill starts |
| `SWEEP_TIME`, `SWEEP_MIN_SPAN` | `js/triangles.js` | Length of the sweep, and the least stretch time of a narrow triangle |
| `1.6s`, `3.5s` | `#paper` and `#paper::before` `animation:` lines | Arrival: white to parchment, then the blotches |
