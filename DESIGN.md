# Personal website

The homepage follows the compact navigation, pixel typography and restrained interactions of [Omarchy](https://omarchy.org/), with a concise introduction informed by [Ryo Lu](https://ryo.lu/). Works, Writing and Workout are independent pages in English, Simplified Chinese and Traditional Chinese. Their EAZYLEE mastheads share one 360px maximum width. Journal is currently withdrawn; its Markdown source and authoring instructions remain for later use.

## Editing and publishing

`content/site.json` contains translated site copy. `content/projects.json` contains the curated gallery, its links, media choices and translated summaries. `scripts/build_site.py` builds nine column pages and three homepages. It converts existing Simplified Chinese article/contact pages to Traditional Chinese with OpenCC, protecting code blocks from translation.

Install `requirements-site.txt`, then run `python3 scripts/build_site.py`. Preview with `python3 -m http.server 8765 --bind 127.0.0.1` in this repository. GitHub Pages builds on commits and the existing deployment schedule. Source content, scripts, tests and drafts are excluded from its static artifact. GitHub credentials are used only by the build.

## Works

The gallery includes fourteen substantive public repositories. Eleven use real README artwork or project logos; three use locally authored diagrams of documented functions. [Artwork provenance](assets/projects/SOURCES.md) records the sources. Every card has a single 16:9 media stage, with complete banners contained inside it. Cards take their natural height, preventing an extra photo or device demo from leaving an empty neighboring card.

The browser refreshes public repository metadata on entry, on returning to the page and every five minutes while visible. It updates dates and language and sorts cards by the actual last push. API failures retain the saved public snapshot. New repositories can be added to `content/projects.json` with suitable artwork. The contribution calendar uses GitHub's actual dated contribution cells and counts, refreshed during deployment.

## Navigation

Clicking the header avatar opens a command menu in all three languages. Its geometry and keyboard behavior follow Omarchy's published SearchPalette: a 340px panel, 13px monospace search, 40px rows, persistent input focus, highlighted selection, and a back arrow beside the current submenu's placeholder. Works lists the fourteen projects; Writing lists the three published articles; Workout links its overview, Whooper and Luck Ring. Root search covers these items; submenu search filters that submenu. Escape clears the query, returns to the root menu, then closes. Arrow keys select or enter branches, Enter opens the selection, and Cmd/Ctrl K or / opens the menu.

The document scrollbar stays visible during command navigation, so opening the menu does not resize the hero or redraw the logo's layout. The mobile drawer header shares its solid theme background, with no shadow bleeding into it. The three desktop section dividers around the header, hero and introduction are removed.

## Typography, themes and motion

The EAZYLEE outline is derived from the supplied [Omarchy-Font](https://github.com/markcuda/Omarchy-Font), bundled with its MIT license. Geist and JetBrains Mono are bundled with their font licenses. Omarchy's [ttfx](https://github.com/omacom/ttfx) engine is bundled with its MIT license and original notice, driven by this site's own adapter and font bitmap.

Fifteen randomly selected entry effects assemble the wordmark. Clicking EAZYLEE replays a different effect without opening the theme picker. The animation and settled text share the same spatial color field and pointer lighting. A denser pixel field builds along the sides and a slowly shifting bank at the bottom, with clear space around the copy. Scanlines, subtle text flicker and a brief session boot are retained. Reduced-motion preferences suppress continuous decorative animation.

Eight palettes include Flexoki Light (the default), Monochrome and Matrix. The modal theme deck supports pointer, keyboard and mobile swipes and remembers the selection. Workout remains an empty state until WHOOP publication is configured; private health data is currently unpublished.

## Avatar

`assets/avatar-head.png` is the owner's Notion avatar, recolored with an SVG ink filter. The full-body character uses two twelve-view illustrated atlases: the tall, slim figure with Vision Pro, a two-tone puffer, jeans and shell-toe shoes, and the matching lean athletic version. Generation prompts are saved beside the artwork.

Rotation uses a continuous angular phase, precomputed regularized DIS motion fields and a shared correspondence between adjacent views. Signed contour distances constrain each interpolation to one silhouette and suppress unmatched edge outlines. WebGL renders motion, theme ink and outfit transitions. A pre-tinted Canvas fallback avoids per-frame pixel allocation on unsupported devices. The original GIF remains as source reference.

Drag rotates in either direction with inertia. Hovering over the torso switches to the athletic outfit while rotation continues; leaving restores the puffer. Keyboard arrows, Home and Space remain available on the accessible canvas. Offscreen or hidden pages stop drawing. Canvas data attributes expose renderer, frame rate and draw cost for local diagnostics.

`scripts/build_avatar_motion.py` regenerates numerical motion metadata when the source atlases change. Its optional authoring dependencies are Pillow, NumPy and OpenCV. Pages deploys the prebuilt binary and does not need those dependencies.

GitHub's official Invertocat and the other service icons are bundled locally in the shared SVG sprite. UI uses small SVG marks.

Workout uses Whooper's opt-in public `/api/public/workout` endpoint. Shanghai calendar days determine the status and count; only the workout-recorded boolean and freshness are exposed, with no sleep/recovery/body data. A successful WHOOP read with zero workouts enables the daily nudge; unknown/error states never assert a missed workout. The server persists browser-deduplicated daily nudges, and the three locales share that count. Refresh on page visibility and every minute, with an explicit retry state. Visitors are anonymous browser UUIDs, not verified people; there is no outbound notification.

Personal pages declare explicit avatar favicon/touch icons and Open Graph metadata in the initial HTML, so crawlers do not need JavaScript. The square 600px sharing thumbnail uses the existing Notion avatar on warm paper; the 1200×630 social cover pairs it with the exact EAZYLEE wordmark. Root favicon.ico and apple-touch-icon.png provide fallback discovery. The independently branded Reberry article retains its own share artwork. `scripts/build_brand_assets.py` renders these established assets with rsvg-convert; generated files are committed, so deployment does not need that renderer.

Workout session detail has two scroll-snap views: the owner's unchanged original
exercise-sheet image with date/value overlays, and the existing animated exercise
cards. Movement is the default. Mobile swipes, desktop trackpad/scrollbar, light text tabs and arrow keys select views;
offscreen panels are inert. The image and its existing EAZY LEE / M handwriting
are immutable. New values use bundled Kalam Regular; the original LBS heading is
preserved and WHOOP kilograms are converted to pounds only in that column.
Consecutive identical sets are grouped; varying sets keep their order and long
sessions continue on additional sheets. Metrics and official WHOOP branding live
outside the photograph.

`assets/data/workout-detail.json` remains the existing WHOOP strength snapshot,
not a live strength API. Updating it and rebuilding updates both views and creates
`/workout/share/YYYY-MM-DD/` in all three languages. Existing dated pages remain
available on subsequent builds. The share page supports link copying, native URL
sharing, PNG export of the original image plus its data layer, and printing/PDF.
The separate today's-status API and its nudge behavior are unchanged.

Both workout views have separate dated share pages (paper at the date route, animated movements at its `movement/` subroute). The main share link follows the selected view. Both support PNG exports; movement PNGs capture a still of each demonstration, while the shared page retains animation. WHOOP branding has a transparent background and uses its official black/white wordmark according to theme.


Workout reads a minimized public Strength Trainer feed from Whooper 2 at
`/api/public/workout/strength`. Latest detail refreshes on entry, visibility and
every minute while open. Both views and exports use the same response. Dated
share links use `/workout/share/?date=YYYY-MM-DD&workout=UUID&view=movement|sheet`;
these resolve that workout, rather than silently changing to the newest session.
The original image stays immutable. Unknown weights remain unknown. Read errors
retain the dated snapshot with a visible refresh failure; parameterized shares
never substitute another date. No login token is exposed in the public feed.

The training club combines the existing deduplicated daily nudge with a seven-day
bar chart, verified WHOOP workout status and same-day comparisons. Only completed
calendar days with successful WHOOP reads enter the association calculation; it
is descriptive, not a causal claim. Today is still in progress. Counts identify
anonymous browsers, not verified people. Successful nudges briefly accelerate
Workout Guide's bicep-curl figure and trigger theme-colored particles. Reduced
motion preferences suppress these effects. There are no sound or replay controls.
Guide SVGs for the current exercises are bundled locally to avoid CDN stalls.
Artwork credit appears once at the bottom of each page. No horizontal scrollbar
is shown; touch, trackpad and text tabs still switch views.
