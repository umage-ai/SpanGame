# itch.io: what to enter

SPAN on itch.io is the web game as an HTML5 upload, played in the browser on the itch.io page. Check the form's current wording when you fill this in; itch.io changes it now and then.

## The upload

- `npm run bundle:itch` writes `dist/span-<version>-web.zip`: the same files as the app bundles, with `index.html` at the root of the zip and no `sw.js`. Every published GitHub release also attaches it (the *Android app* workflow).
- itch.io runs the game in an iframe on its own CDN. `js/features/pwa.js` registers no service worker inside an iframe, and the moved banner only shows on the old GitHub Pages address. Saves use `localStorage` on itch.io's game origin, so they survive new uploads but are separate from span.studio.umage.ai.
- To update: upload the new zip and delete the old one, or use butler (`butler push dist/span-<version>-web.zip <user>/span:html5`).

## Create new project

| Field | Value |
|---|---|
| Title | SPAN: Bridge Builder |
| Project URL | `<account>.itch.io/span` |
| Short description or tagline | Build bridges, test them with real physics, and don't drop the bus. |
| Classification | Games |
| Kind of project | HTML (*You have a ZIP or HTML file that will be played in the browser*) |
| Release status | Released |
| Pricing | No payments (or *$0 or donate* to allow tips) |
| Uploads | the zip, ticked **This file will be played in the browser** |

### Embed options

| Field | Value |
|---|---|
| Embed in page | Manually set size: **960 × 640** (landscape; the game scales to any size) |
| Mobile friendly | On, orientation **Landscape** |
| Automatically start on page load | Off (sound needs a click first anyway) |
| Fullscreen button | On |
| Enable scrollbars | Off |
| Click to launch in fullscreen | Off (the game has its own fullscreen button) |
| SharedArrayBuffer support | Off (not needed) |

### Details

| Field | Value |
|---|---|
| Description | the text below |
| Genre | Puzzle |
| Tags (up to 10) | bridge, physics, puzzle, engineering, construction, trains, 2d, casual, singleplayer, touch-friendly |
| AI generation disclosure | **Yes**: code and text written by AI agents (Claude Code), backgrounds generated with local AI (ComfyUI, Qwen-Image). Sprites are drawn in code and sounds synthesized in code, both by the agents |
| App store links | Google Play (`https://play.google.com/store/apps/details?id=ai.umage.span`) once the app is public |
| Custom noun | leave empty |
| Community | Comments |
| Visibility | Draft while testing, then Public |

### Metadata (Edit game → More → Metadata)

| Field | Value |
|---|---|
| Languages | English, Danish |
| Inputs | Mouse, Keyboard, Touchscreen |
| Average session | A few minutes |
| Platforms | HTML5 (add Android if you also upload the APK) |

### Media

| Field | File |
|---|---|
| Cover image (630 × 500) | your own cover (or `node tools/store-assets.js --only cover` for a title-scene one) |
| Screenshots | `screenshots/tablet10-*.jpg` and `screenshots/phone-*.jpg` (3–5 is plenty) |
| Theme | Edit theme: dark background `#0d1424`, links `#ffb547` (the game's colours) |

## Description

```
Bridge the gap. Mind the budget. Don't drop the bus.

SPAN is a physics bridge-building puzzle game. Build a bridge across a gap from road, wood, steel, rope and cable, stay under budget, then press Test and watch cars, buses, trains and 60-tonne haulers drive across. Every member bends, stretches and can snap: real physics decides whether your bridge holds.

102 HAND-MADE LEVELS
• Roads: 50 levels in six chapters, from a 10 m creek crossed with two planks to a 150 m span carrying tankers, plus three hidden bonus chapters: the Jungle, the Anchorages and the Forces of Nature (hurricanes, earthquakes, a galloping deck).
• Iron Road: 20 railway bridges, from handcars to 2000-tonne ore trains. Trains are fussy: a kink in the track derails them.
• Famous Bridges: rebuild 12 real bridges, from the Pont du Gard to the Millau Viaduct, each with the story of why the engineers chose its shape.

A NEW CROSSING EVERY DAY
A Daily Challenge that is the same for everyone, plus an Endless mode of ever-harder crossings.

STARS AND CHALLENGES
Earn up to three stars by building cheaper, then go for the challenge stars.

CONTROLS
Mouse: drag to build, right-click or Esc stops building, wheel zooms, Space tests. Touch: drag to build, pinch to zoom. Undo, mirror mode and templates included.

No ads, no account, no data collected. Your progress is saved in your browser. In English and Danish.

Also on Android (Google Play) and at span.studio.umage.ai.

SPAN is a umage.ai Studio game, designed and built by AI agents directed by umage.ai. More games at studio.umage.ai.
```
