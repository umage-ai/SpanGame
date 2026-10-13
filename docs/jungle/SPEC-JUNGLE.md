# SPAN Jungle — implementation spec (bonus chapter, levels 59–68)

Status: v1 spec for the parallel workflow on branch `feature/jungle`. Background: GitHub issue #7 ("Chapter idea:
Jungle"). Read SPEC.md §15 (one campaign system), §17.7 (Anchorages, the bonus-chapter precedent, commit e706a52),
docs/LEVEL-AUTHORING.md, docs/I18N.md and docs/TESTING.md first.

The brief: a full jungle chapter. Start simple (bamboo, lianas, rope), then add more. Decorations in a "Jungle Book"
style: dense rainforest, vines, ferns, temple ruins, waterfalls and animals. Everything is generic, with no Disney IP.
Monkeys, porters and small carts cross; canoes paddle underneath; Dr Livingstone makes a surprise appearance as a joke
("Dr Livingstone, I presume?").

## 0. Hard rules (every work package)

- **Existing levels stay bit-identical.** `node tools/verify-levels.js` stays 100% green for levels 1–58, 101–120 and
  201–212, with the same peaks and times. Nothing in this spec changes `js/core/physics.js`. New fields are optional and
  default to today's behaviour. Jungle materials and vehicles are reachable only from levels that list them.
- **Determinism.** The physics uses no `Math.random`. Everything in the simulation (including Livingstone, who is a
  normal traffic entry) comes from level data. Visuals may animate with the renderer clock. Anything that is timed
  against the sim (canoes, Livingstone's lines) uses `state.sim.time`, so it replays the same way.
- **Ownership.** Each WP edits only the files listed for it in §9. Do not run `git add/commit/stash/reset/checkout`.
  Do not open visible windows: browser checks are headless only (`node tools/shot.js`, `tools/browser.js`,
  `npm run test:browser`).
- **i18n.** Every player-visible string goes through `BG.i18n` (§7). The hard-coded string lint (`test-i18n.js`) stays at 0.

## 1. Chapter registration

| Item | Value |
|---|---|
| Chapter id / key | `jungle` |
| Levels | 59–68 (10 levels, `tools/levels/level-59.json` … `level-68.json`), Roads campaign (no `campaign` field) |
| Kind | hidden branching bonus chapter, exactly like Anchorages: `BG.Storage.CAMPAIGNS.road.bonus` entry |
| `unlockAfter` | **30** |
| HUD chapter | `{ n: 9, key: 'jungle', from: 59, to: 68, theme: 'jungle', hidden: true }` in `CHAPTERS` (js/ui/hud.js) |
| Finale id | `'jungle'` (`Storage.finaleOf(level 68) === 'jungle'`), finale text `results.finale.jungle.*` |
| Gates | none (bonus chapters are never gates; 68 is its finale, not a gate) |

Storage entry (js/ui/storage.js, appended to the existing `bonus` array):

```js
bonus: [
  lazyName({ id: 'anchorages', first: 54, last: 58, unlockAfter: 40 }, 'hud.chapter.anchorages.name'),
  lazyName({ id: 'jungle', first: 59, last: 68, unlockAfter: 30 }, 'hud.chapter.jungle.name'),
]
```

**Why level 30.** Level 30 (*The Long Haul*) is the chapter-4 finale, which is a gate, so every player who opens the
Jungle has finished chapters 1–4. By then they have built trusses, piers, rope and cable hangers, a suspension span
(25 *Strung Along*) and a cable-stayed span (28 *Harp Strings*). The Jungle reuses exactly those ideas (rope bridges,
hangers from trees, stays) at much lighter loads, so it is a breather between the tropical chapter (21–30) and the
canyon chapter (31–40). It also continues the tropical chapter's look, from palm beaches to deep rainforest.

The order of reveal becomes Jungle (after 30), then Anchorages (after 40), then Forces of Nature (after 50). In the level
select the chapters sort by `from`, so Forces (51), Anchorages (54) and Jungle (59) are listed last. Level 66
(*Monsoon*) is then the first weather event many players meet. It is mild, and forces-fx already shows the forecast
chip and warning banner, which explain it.

`main.js` needs no rule changes, because the bonus code is generic (`bonusChapters()`, `bonusOpened`, `nextInCampaign`).
One small polish (WP-campaign): a chapter-specific reveal toast. In the `bonusOpened` toast, use
`'results.toast.bonus.' + b.id` when `I().has(k, 'en')`, else the generic `results.toast.bonus`. The params are the
same (`{name, from, to}`).

## 2. Materials (WP-core: js/core/materials.js)

Jungle traffic is about 100× lighter than road traffic (an 80 kg porter instead of a 12 t bus). So the jungle materials
are scaled down: cheap, light and *weak*, and the puzzle still bites. The values below come from a headless
experiment, described under "Calibration" below. WP-core may tune any value by ±30% if its tests require it, and must
record the final values in this table (edit only this table in this file) and in the materials.js header.

| id | name key | role | cost $/m | kg/m | stiffness EA [N] | tension [N] | compression [N] | bend EI / momentLimit / ref | maxLength | width | color |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `walkway` | Bamboo Walkway | **deck** (`isRoad: true`) | 30 | 18 | 6.0e6 | 40e3 | 30e3 | 1.5e4 / 2.5e3 / 4 | **4** | 0.30 | `#c9a35a` |
| `bamboo` | Bamboo | frame member | 15 | 5 | 2.5e6 | 35e3 | 20e3 | – | 5 | 0.18 | `#a3b84a` |
| `liana` | Liana | tension only (`tensionOnly: true`) | 5 | 1 | 1.0e6 | 8e3 | 8e3 | – | **24** | 0.07 | `#4e7a2c` |

Compare these with the existing materials: wood costs $50/m for 130/110 kN, rope $20/m for 60 kN and road $100/m at
120 kg/m. Bamboo is cheaper than wood and light, with good tension strength per dollar. It is weak in compression
(20 kN) and very flexible (1.4% strain at the tension limit, against about 0.6% for steel), so bamboo bridges sway and
sag visibly. When a bamboo strut is overloaded it buckles at once: its compression limit is the first thing to go.
Liana is the cheapest and longest material, but only about 1/7 as strong as rope. The walkway is the only
light deck: it bends at its joints like road, but its moment limit is 12× lower and it has a 4 m maximum length.

**Why a third material (`walkway`).** Vehicles only drive on `isRoad` beams (physics `_broadphase`,
`Model.deckConnected`). Road ($100/m, 120 kg/m) would cost and weigh more than everything else in a footbridge.
`walkway` is the jungle deck and the default selected material on jungle levels (it is listed first). Like road,
`walkway` can also be used as a structural member (the editor doesn't restrict deck materials).

**Lashing (issue #7).** v1 has **no joint-strength mechanic**. That keeps physics.js untouched and bit-identical, and
bamboo's low compression limit already gives the "fails suddenly" character. Lashings are drawn: rope wraps at every
bamboo joint (§4.2). A future joint-strength rule could use a `lashLimit` field. It is out of scope.

`BG.MaterialOrder` gets `'walkway', 'bamboo', 'liana'` appended after `'girder'`. The i18n getters work for the
new ids automatically through the existing `BG.i18n.lazy` loop.

**Calibration (headless experiment; reproduce in test-physics, §8).** All runs on a 16 m gap with banks at 0:
- A bare walkway catenary (5 segments, 1.5 m sag, about $490) carries 6 porters (peak 0.45) and 8 monkeys (0.23). It
  snaps in bending under a hand cart.
- The same catenary with liana hangers from tree anchors at y = +4 carries hand carts (0.60) but not the ox cart (the
  liana breaks in tension).
- With rope hangers it carries the ox cart (0.48) but not the jeep.
- A walkway deck on a 20 m bamboo under-deck Warren truss (h 3 m) carries the ox cart (0.84) and the jeep (0.94).
- At 28 m the bamboo bottom chord buckles under the ox cart. With wood in place of bamboo it passes (0.66).

That is the intended progression.

## 3. Traffic types (WP-core: js/core/vehicles.js)

The existing rigid-body vehicle system is reused unchanged. Foot traffic is a "vehicle" whose two "wheels" are its
feet. `def.height` is the **physics hull height** and is deliberately lower than the drawn sprite. A body standing
1.75 m tall on a 0.4 m footprint tips over on a sagging walkway: in the experiment a porter fell flat at the first
slope, and the run timed out. A 0.8 m hull with a 0.7 m footprint stays upright on slopes up to about 25°. The
drawn height comes from the sprite (§5), which is what `BG.Renderer.drawnHeight` and ceiling.js use.

| type | name key | length | height (hull) | wheelRadius | wheels `{x, mass}` | mass | speed | accel | width (wind) | extra flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `walker` | Porter | 1.0 | 0.8 | 0.12 | `{0.15, 40}, {0.85, 40}` | 80 kg | 2.0 | 2.0 | 0.6 | `foot: true` |
| `monkey` | Monkey | 0.8 | 0.45 | 0.10 | `{0.10, 9}, {0.70, 9}` | 18 kg | 3.5 | 4.0 | 0.3 | `foot: true` |
| `handcart` | Hand Cart | 2.6 | 1.1 | 0.30 | `{0.9, 160}, {2.1, 160}` | 320 kg | 1.8 | 1.5 | 1.2 | – |
| `oxcart` | Ox Cart | 5.2 | 1.6 | 0.60 | `{1.3, 550}, {4.2, 650}` | 1.2 t | 1.5 | 0.8 | 1.6 | – |
| `jeep` | Jeep | 3.6 | 1.8 | 0.36 | `{0.75, 800}, {2.95, 850}` | 1.65 t | 6.0 | 2.5 | 1.7 | – |
| `livingstone` | Dr Livingstone | 1.0 | 0.8 | 0.12 | `{0.15, 42.5}, {0.85, 42.5}` | 85 kg | 1.8 | 1.8 | 0.6 | `foot: true, hidden: true` |

Colors (fallback body when a sprite is missing): walker `#c8743a`, monkey `#8a5a32`, handcart `#9a6a3a`, oxcart
`#b0894f`, jeep `#5d6b3a`, livingstone `#d8c49a`.

New optional def fields. They are documented in the vehicles.js header, and existing defs don't set them:
- `width` is the frontal width in m for wind drag. events.js uses `v.def.width > 0 ? v.def.width : VEH_WIDTH`
  (2.5 m). Without it, a porter would catch as much wind as a car.
- `foot: true` means walking traffic. It is a render hint (no wheel sprites, stride frames) and physics ignores it.
- `hidden: true` keeps the type out of every traffic summary: `BG.Model.trafficSummary` (parts and items) and the HUD
  traffic chips and tooltip (hud.js). It is used only by Livingstone, so the finale keeps its surprise. He still counts
  in `vehiclesTotal`.

`BG.VehicleOrder` gets `'walker', 'monkey', 'handcart', 'oxcart', 'jeep', 'livingstone'` appended. The daily/endless
generator (js/core/generator.js) has its own vehicle lists and must **not** pick jungle types (verify: test-generator,
test-daily stay green and the daily level of a fixed date is unchanged).

Interaction with the physics: these are tiny loads on light decks. The ox cart's front "wheel" is the ox's hooves.
Cruise control keeps foot traffic about 3–5 m apart. The 25 m spawn run-up (`SPAWN_GAP`) is unchanged, so a porter
needs about (25 + gap + 15)/2 s to finish. Level authors set `timeLimit` from the reference run plus about 25%. Groups spawn in
order, and a slow group delays the groups behind it (cruise control), so list fast groups first.

**Other core touches (WP-core):**
- **events.js:** add `AERO` entries `walkway: { cd: 1.2, depth: 0.3, chord: 1.2, cl: 0.6 }`, `bamboo: { cd: 1.2, depth: 0.2 }`
  and `liana: { cd: 1.2, depth: 0.08 }`. Without them an unknown deck falls back to the 9 m road chord and the
  walkway takes off. Also add the `def.width` rule above (one line at the `VEH_WIDTH * v.def.height` site).
- **model.js:** `trafficSummary` skips `def.hidden` groups.
- **templates.js:** `FALLBACK_MATS` gets the three materials. In `pickMaterials`, the road list becomes
  `['road', 'reinforced_road', 'walkway']`, the struct list gets `'bamboo'` right after `'wood'`, and the tension list gets
  `'liana'` right after `'rope'`. Existing levels don't allow the new ids, so their templates are unchanged.
- **js/ui/arch-tool.js:** `POST_ORDER` gets `'bamboo'` after `'wood'`, `HANGER_ORDER` gets `'liana'` after `'rope'`, and
  `ARCH_ORDER` gets `'bamboo'` after `'wood'`. This only affects levels that allow those materials.

## 4. Theme, scenery and the jungle feature module (WP-render)

### 4.1 Architecture

All jungle visuals live in a **new additive module, `js/features/jungle-fx.js`** (`BG.JungleFx`). It follows the
pattern of `forces-fx.js`: it wraps `BG.Renderer.prototype` methods and never edits them, and it does nothing on
non-jungle levels. It loads in index.html right after `forces-fx.js`:
`<script src="js/features/jungle-fx.js"></script><!-- jungle: themes, scenery, canoes, jungle traffic, Livingstone -->`

| Hook | What it adds |
|---|---|
| `BG.Renderer.THEMES.jungle`, `.jungle_temple` | the two themes (§4.3), registered at load time; `setLevel` reads the same object |
| `Renderer.Sprites.meta` | `walker`, `monkey`, `handcart`, `oxcart`, `jeep`, `livingstone` (sizes from §5, keyed by vehicle type so `drawnHeight` works) plus every `jungle/<name>` sprite |
| `RP._prop` (wrap) | props for `kind === 'jungle' \| 'jungle_temple'`; otherwise calls the original |
| `RP._drawBeamItems` (wrap) | draws `liana` items before the original, and `bamboo` + `walkway` items after it; the rest go to the original |
| `RP._drawVehicle` (wrap) | draws jungle traffic types (stride frames, wheel sprites, no headlights; jeep exhaust through `this.effects.exhaust`); otherwise the original. This also covers the edit-mode preview |
| `RP._drawPierItem` (wrap) | on `jungle_temple`, piers drawn as ruined stone pillars (carved, mossy) |
| `RP._drawAnchors` (wrap, draw before the original) | `anchors[i].deco === 'tree'`: a giant trunk from the ground to 1.5 m above the anchor, with a branch and a lashing knot. `'ruin'`: a ruined pillar from the floor or water bed up to the anchor |
| `RP._drawShips` (wrap, after the original) | world-space pass behind the beams: waterfall, hanging vines, canoes, crocodile, animals, Stanley / Livingstone, speech bubbles |
| `BG.Hud.showResults` (wrap) | the Livingstone toast (§4.7) |

The only edit to `js/render/renderer.js` is this line at the top of `R._drawShips`:
`if (this.theme.ships === false) return;`
Jungle themes set `ships: false`. A no-build zone over the water must not show a container ship; canoes replace it.
forces-fx (which wraps `_drawShips` and calls the original first) is unaffected.

jungle-fx keeps its own stroke helpers, because `strokeSet` and `pathLines` are private to renderer.js. It uses the
public helpers: `Renderer.util`, `Renderer.stressColor`, `Renderer.materialStyle`, `Renderer.Sprites`, and the
`RP._tint` method.

Public API for tests: `BG.JungleFx = { THEMES, TYPES, isJungle(level), cameo(level, sim) -> bool, lastMeeting: null | {level, greetAt, replyAt}, forceCameo }`.
The URL param `?livingstone=1` sets `forceCameo` (for screenshots).

### 4.2 Material looks (drawn by jungle-fx)

| Material | Look |
|---|---|
| `walkway` | Deck kind (the beam line is the top surface, drawn downward). Dark outline `#6e4f22`, base band `#c9a35a`, cross slats as dashes perpendicular to the beam (`#e6c983`, dash 0.08 m / gap 0.06 m). Two thin liana hand-ropes 0.9 m above the deck when zoomed in (cosmetic, `#4e7a2c`). |
| `bamboo` | A culm: outline `#4f6a1e`, base `#a3b84a`, highlight stripe `#d8e58a`, and darker node rings every 0.45 m (`#5f7a26`). At each end, a rope lashing (3 diagonal wraps in `#c9b58a`) is drawn when the zoom is high enough (w·zoom > 4 px). |
| `liana` | A twisted vine: two thin strokes (`#24401a`, `#4e7a2c`) with offset dashes for the twist, a light highlight `#8ab84e`, and small leaves (`#5f9a36` ellipses) about every 1.2 m on alternating sides when zoomed in. Slack lianas droop the same way rope does today. |

All three use the standard stress tint (`this._tint`) and snapped-end markers. When bamboo breaks, it may also emit
green splinters through `this.effects` if a debris helper exists. This is optional.

### 4.3 Themes `jungle` and `jungle_temple`

`jungle` is a deep rainforest gorge with a river. `jungle_temple` has the same palette but is warmer, has its own
background with temple ruins, and adds ruin props on the banks. Both themes have `props: 'jungle'` or
`'jungle_temple'`, `ambient: 'birds'`, `lights: 0`, `night: 0` and `ships: false`.

```js
jungle: {
  sky: ['#3f7f6a', '#9cc7a0', '#e3f0cf'], fog: '#cfe3c0', sun: 'sun',
  layers: [
    { kind: 'mountains', color: '#6f9a7c', p: 0.06, amp: 0.30, feat: 420, lift: 0.12 },
    { kind: 'hills', color: '#3f7a4f', p: 0.16, amp: 0.16, feat: 240, lift: 0.04 },
    { kind: 'trees', color: '#24583a', p: 0.30, amp: 0.08, feat: 160, lift: -0.01, tree: 'palm' }
  ],
  nearTint: '#1f4a30',
  ground: { top: 'grass', a: '#4f9a3a', b: '#2a6a2a', soil: ['#6b4a2e', '#352312'],
            strata: ['#7a5636', '#5e4128', '#8a6440', '#4e3420'], rock: '#7d7a68', bed: '#8a8a5a', tufts: '#3f8a3a' },
  water: ['#8aa65a', '#56703a', '#26381c'],           // green-brown jungle river
  props: 'jungle', clouds: { n: 4, color: '#f2f7ea', shade: '#b9cdb0', alpha: 0.7 },
  lights: 0, ambient: 'birds', night: 0, ships: false
},
jungle_temple: { /* as jungle, except: */
  sky: ['#5d8a5a', '#d4c48a', '#f3e6bf'], fog: '#e3d8b0',
  layers: [ mountains '#8a9a7a', hills '#5a7a4a', trees '#2e5a36' (same p/amp/feat/lift/tree) ],
  props: 'jungle_temple'
}
```

The HUD thumbnail palette goes in hud.js `THEMES` (WP-campaign):
`jungle: { sky: ['#6fae84', '#e3f0cf'], ground: '#3f8a3a', deep: '#24583a', accent: '#9bd36a', water: '#6f8f45' }` and
`jungle_temple: { sky: ['#a8b07a', '#f3e6bf'], ground: '#4f8a3a', deep: '#2e5a36', accent: '#e0b45a', water: '#6f8f45' }`.

### 4.4 Scenery: sprite or canvas, and where

| Element | How | Where / when |
|---|---|---|
| Bank props (`_prop`, cell 5.5 m) | canvas: buttress trees (`pRound`-like with a wide flared trunk), banana plants, bamboo clumps (3–7 green culms), plus `jungle/fern.svg` | both banks, deterministic by `hash2` like today; `jungle_temple` replaces about 25% with `jungle/ruin_head.svg` and fallen blocks |
| Hanging vines | canvas Bézier strands with leaves; sway `sin(time)` (visual only) | 4–7 strands hanging from an implied canopy above each bank edge, from the top of the view down to 3–8 m above the bank; never inside the build area above the gap |
| Tree anchors | canvas trunk (bark texture, buttress roots, one branch to the anchor, a leaf crown above) | every `anchors[i].deco === 'tree'` |
| Ruin anchors and ruin piers | `jungle/ruin_pillar.svg` tiled vertically, `jungle/ruin_cap.svg` on top, moss overlay | `deco === 'ruin'` anchors; every pier on `jungle_temple` |
| Waterfall | canvas: a band `x0..x1` from above the view down to the water; scrolling white and teal streaks (8 m/s), mist puffs and a foam ring at the bottom | `level.jungle.waterfall` (§6.1) |
| Canoes | `jungle/canoe.svg` (two seated paddlers) plus canvas paddles that rotate with a 1.1 s stroke | water levels: `level.jungle.canoes` (default 1 on water levels, 0 on dry ones), §4.5 |
| Crocodile | `jungle/croc.svg` at the waterline, drifting 0.2 m/s and blinking | water levels whose id is even |
| Parrot | `jungle/parrot.svg` perched on a tree anchor's branch or on the first prop tree left of the gap | every jungle level |
| Snake | `jungle/snake.svg` (python on a branch) | right bank, on odd level ids |
| Tiger | `jungle/tiger.svg` lying in ferns on the valley floor | dry levels only |
| Elephant | `jungle/elephant.svg`, standing at about 0.6 scale beyond the right bank (`rightEdge + 30`) | `jungle_temple` levels |
| Monkeys at rest | `jungle/monkey.svg` sitting on branches (2 per level) | trees on the banks |
| Stanley, Livingstone, speech bubbles | §4.7 | 68, and cameos |

Placement is deterministic from `level.id` and `hash2`. Nothing is drawn inside `buildArea` above the gap except the
waterfall, tree and ruin anchors, the canoes and the water animals. Those stay behind the beams (the `_drawShips` pass).

### 4.5 Canoes

Canoes are purely visual. They never collide and never affect the sim.
- Canoe `k` (0-based, at most 3) moves at 1.2 m/s, in direction `dir = k % 2 ? -1 : 1`. Its x position is
  `x = x0 + dir · 1.2 · t`, wrapped into `[leftEdge − 20, rightEdge + 20]`. The phase `x0` comes from
  `hash2(level.id, k, 91)`. The sprite is mirrored for `dir < 0`.
- `t` is `state.sim.time` while a sim exists, else the renderer clock. A replay therefore shows the canoes in the same
  places.
- The waterline sits at `terrain.waterY` with a ±3 cm bob. The canoe is 5.2 m long and has a 0.85 m freeboard to the
  paddlers' heads.
- On levels with a no-build zone over the water (a "canoe channel"), the zone is the reason the channel exists. Its
  edit-mode label reads `features.jungle.label.canoes` instead of the generic no-build label. To do that, wrap
  `_drawNoBuild`, or skip the label and draw the jungle one.

### 4.6 Jungle traffic drawing (wrap of `_drawVehicle`)

| type | body sprite(s) | wheels drawn | stride |
|---|---|---|---|
| walker | `jungle/walker.svg` / `walker_b.svg` | none | frame = `floor(dist / 0.35) % 2` |
| monkey | `jungle/monkey.svg` / `monkey_b.svg` | none | 0.25 m |
| handcart | `jungle/handcart.svg` / `handcart_b.svg` (the pusher's legs) | `jungle/wheel_wood.svg` at both axles | 0.35 m |
| oxcart | `jungle/oxcart.svg` / `oxcart_b.svg` (the ox's legs) | `jungle/wheel_wood.svg` at the rear wheel only (index 0); index 1 is the hooves | 0.45 m |
| jeep | `jungle/jeep.svg` | existing `wheel.svg` at both axles | – |
| livingstone | `jungle/livingstone.svg` / `livingstone_b.svg` | none | 0.35 m |

`dist` is the distance travelled, `wheels[0].rot · r`, which is deterministic. Pose: the existing `_vehPose` math
(the sprite width equals `def.length`). Foot traffic gets a 2 cm walking bob of `sin(dist · 2π / stride)`. There are
no headlights. The jeep gets exhaust puffs. A fallen walker or monkey falls with a splash, as today.

### 4.7 Dr Livingstone (the joke), deterministic

1. **Finale (level 68, `level.jungle.livingstone === 'finale'`).** Livingstone is the last traffic group
   (`{ "type": "livingstone", "count": 1, "interval": 3 }`). He is hidden from the traffic summary.
   - **Stanley** (`jungle/stanley.svg`, a static prop facing left) stands on the right bank at `rightEdge + 7` from the
     moment the level opens.
   - When Livingstone's rear passes `rightEdge + 2` (sim time `g`):
     - Stanley swaps to `stanley_b.svg` (hat raised) and a speech bubble shows `features.jungle.livingstone.greet`
       ("Dr Livingstone, I presume?") from `g` to `g + 2.6`.
     - Livingstone's bubble shows `features.jungle.livingstone.reply` from `g + 2.6` to `g + 5.2`.
   - If Livingstone falls, Stanley's bubble shows `features.jungle.livingstone.lost` instead.
   - Bubbles are anchored in world space and their timing uses sim time (so they pause with the sim). They are drawn as
     rounded rectangles with a tail, `Renderer.util.FONT`, and wrap at 240 CSS px.
   - Results of a passed run of 68 in which Livingstone finished set `BG.JungleFx.lastMeeting` and show the toast
     `features.jungle.livingstone.toast` 2.4 s after the results card. The toast appears once per profile
     (localStorage `span.v1.jungle.livingstone`, every access in try/catch); `lastMeeting` is set on every such run.
2. **Cameo (levels 59–67, cosmetic only, never a sim vehicle).**
   - Livingstone appears on a successful run when `(level.id + sim.nDesignBeams) % 7 === 0`, or when `?livingstone=1`
     is set. In effect he turns up for certain bridges and not others, with no randomness.
   - After `sim.status === 'success'` he steps out of the ferns at `rightEdge + 10` (facing left), tips his helmet
     (frame b), and says `features.jungle.livingstone.cameo` for 3 s.
3. There is no hidden badge in v1: the goals are generated per level and must be provable. The toast and the
   localStorage flag are the easter-egg record.

## 5. Sprites (WP-sprites: `assets/sprites/jungle/*.svg` only)

**Conventions** (the same as `car.svg` and `rail/handcar.svg`):
- 1 unit = 1 cm. `width`, `height` and the viewBox size are equal.
- Vehicles and props: `viewBox="0 -H W H"`. The origin is bottom-left, on the ground line (feet, hooves and wheel
  bottoms touch y = 0). The figure faces **right**.
- Wheel sprites: `viewBox="-50 -50 100 100"`, centred, like `wheel.svg`.
- The first element is a header comment that names the sprite, the origin, and any wheel or axle positions.
- Each file is self-contained: no `<text>`, no external refs, no fonts, no filters heavier than a blur. Use flat
  painterly shading with gradients, in the style of the existing sprites. Gradient ids are prefixed with the sprite
  name. Keep files under 12 KB each.
- The sprite's W must equal `def.length × 100`, because the renderer scales by length. H is free (that is the drawn
  height).
- `_b` frames are identical to their base frame except for the legs (the stride is swapped).
- Characters are generic, respectful and non-caricatured. Porters wear simple period-neutral clothing; no Disney
  likenesses.

| File | W × H (cm) | Notes |
|---|---|---|
| `walker.svg`, `walker_b.svg` | 100 × 175 | porter carrying a cloth bundle on his head (bundle top at y = −175); feet near x 15 and x 85 |
| `monkey.svg`, `monkey_b.svg` | 80 × 55 | macaque-like monkey on all fours, tail curled up; hands and feet near x 10 / 70 |
| `handcart.svg`, `handcart_b.svg` | 260 × 140 | wooden four-wheel hand wagon (bed x 70–260, sacks and a bunch of bananas) pushed by a porter at x 0–60; **no wheels** (axles at x 90 and x 210, r 30) |
| `oxcart.svg`, `oxcart_b.svg` | 520 × 200 | cart (bed x 0–260, arched thatch canopy, a seated driver) on a shaft to a hump-backed ox (x 280–520); **no cart wheel** (axle at x 130, r 60); ox hooves near x 380 and x 470 |
| `jeep.svg` | 360 × 190 | olive expedition jeep, canvas top, spare wheel on the rear, roof rack; **no wheels** (axles at x 75 and x 295, r 36); facing right |
| `livingstone.svg`, `livingstone_b.svg` | 100 × 180 | Victorian explorer: white pith helmet, white moustache and beard, khaki jacket, walking stick; frame b also tips the helmet slightly |
| `stanley.svg`, `stanley_b.svg` | 90 × 185 | second explorer (darker jacket, wide-brim hat); standing; frame b has the hat raised high in greeting. Drawn facing right; the renderer mirrors it |
| `wheel_wood.svg` | 100 × 100 (centred) | wooden cart wheel with 8 spokes, hub and iron tyre |
| `canoe.svg` | 520 × 110, `viewBox="0 -85 520 110"` | dugout canoe with two seated paddlers, **no paddles** (paddle grips at x 150 / y −60 and x 370 / y −60); the waterline is y = 0 and the hull extends to y = +25 |
| `parrot.svg` | 40 × 70 | scarlet macaw-like parrot perched (feet at y 0, long tail down past them is fine; keep it inside the box) |
| `snake.svg` | 180 × 60 | python draped over a short branch (the branch is included, its bottom at y 0) |
| `tiger.svg` | 220 × 90 | tiger lying down, head up, in profile |
| `elephant.svg` | 400 × 300 | Asian elephant standing, trunk curled |
| `croc.svg` | 300 × 30, `viewBox="0 -18 300 30"` | crocodile eyes, snout and back ridge above the waterline (y = 0), the rest dark below |
| `fern.svg` | 140 × 90 | bushy fern clump |
| `ruin_head.svg` | 300 × 360 | mossy carved stone face block (temple idol) |
| `ruin_pillar.svg` | 200 × 400 | weathered stone column segment that tiles vertically (top and bottom edges match), with vines |
| `ruin_cap.svg` | 240 × 80 | broken capital or top block of a ruin pillar |

That is 25 files. Self-check: every file parses as XML (for example
`node -e "for(const f of require('fs').readdirSync('assets/sprites/jungle'))require('fs').readFileSync('assets/sprites/jungle/'+f,'utf8').match(/^<svg[^>]*viewBox/)||console.log('bad',f)"`),
and its viewBox matches this table.

## 6. Backgrounds (WP-bg: `assets/bg/jungle.jpg`, `assets/bg/jungle_temple.jpg`, `assets/bg/credits.txt`)

The background file name equals the theme id (`loadBg(themeId)`), so there are two files. Match the existing set:
**2208 × 960 (21:9, about 2 MP), JPEG quality 0.85, about 60–140 KB**. Generate with ComfyUI Qwen-Image 2.1 (MCP
`comfy-studio generate_image`, sequential jobs) at 2208×960, or at the nearest supported size followed by a cover-crop.
Convert with `ffmpeg -i in.png -vf "scale=2208:960:force_original_aspect_ratio=increase,crop=2208:960" -q:v 3 out.jpg`,
or with a headless-Chrome canvas `toDataURL('image/jpeg', 0.85)`. Inspect the image (Read tool) before keeping it.
Regenerate it if it shows text, people, a bridge, or busy detail in the bottom 30%.

The prompt is the template from credits.txt, verbatim, with the scenery inserted:

> Wide 2D side-scrolling video game background, stylized painterly illustration, `<scenery>`, atmospheric perspective,
> no foreground objects, no bridge, no text, no people, clean flat color shapes, Poly Bridge style, calm simple lower area

- **jungle:** `dense tropical rainforest gorge, layered misty jungle canopy silhouettes, giant buttress trees and hanging vines in the distance, a distant waterfall on a green cliff, soft green and gold light, humid haze`
- **jungle_temple:** `ancient overgrown stone temple ruins and a stepped pyramid half swallowed by jungle in the distance, carved stone towers covered in vines and moss, misty rainforest canopy, warm golden green light`
- Negative prompt (if supported): `text, watermark, people, animals, bridge, foreground plants, frame, border, signature`.

Append both scenery lines to the "Scenery per theme" list in `assets/bg/credits.txt` (format `jungle: ...` and
`jungle_temple: ...`).

## 6.1 Level data: new optional fields

| Field | Meaning (cosmetic only; physics and Model ignore it) |
|---|---|
| `theme` | `"jungle"` or `"jungle_temple"` |
| `anchors[i].deco` | `"tree"`: drawn as a giant tree. Place it at `x` in `(leftEdge − 1, leftEdge]` or `[rightEdge, rightEdge + 1)` with y above the bank, so `Model.anchorInfo` keeps it an *edge* anchor (not inland, not a land feature), or mid-gap for a tree standing in the river. `"ruin"`: a mid-gap anchor drawn as a temple pillar |
| `jungle` | `{ canoes?: 0..3, waterfall?: { x0, x1, top? }, livingstone?: "finale" }`; `top` is where the falls start (default above the view) |

Jungle levels must **not** use land features (`inland`, `ground` pier zones, hillside anchors, `roadClearance`), so
that `test-anchors.js` ("land features on exactly 54–58") stays as is. They must keep `buildArea.y1 ≥ deck + 5.01`
and have no `terrain.ceiling`, so that `test-ceiling.js`'s level list stays as is.

## 7. i18n keys (WP-campaign owns every dictionary edit; English is the source text)

**vehicles** area (`js/i18n/en/vehicles.js`, `js/i18n/da/vehicles.js`):

| Key | en | da |
|---|---|---|
| `vehicles.material.walkway` | Bamboo Walkway | Bambusgangbro |
| `vehicles.material.bamboo` | Bamboo | Bambus |
| `vehicles.material.liana` | Liana | Lian |
| `vehicles.road.walker` | Porter | Bærer |
| `vehicles.road.monkey` | Monkey | Abe |
| `vehicles.road.handcart` | Hand Cart | Trækvogn |
| `vehicles.road.oxcart` | Ox Cart | Oksekærre |
| `vehicles.road.jeep` | Jeep | Jeep *(allowlist `sameAsEnglish`)* |
| `vehicles.road.livingstone` | Dr Livingstone | Dr. Livingstone |
| `vehicles.road.<type>.count` (all six) | `{one:'{n} porter', other:'{n} porters'}`, monkey(s), hand cart(s), ox cart(s), jeep(s), `{n} Dr Livingstone` (both forms) | `{n} bærer/bærere`, `{n} abe/aber`, `{n} trækvogn/trækvogne`, `{n} oksekærre/oksekærrer`, `{n} jeep/jeeps`, `{n} Dr. Livingstone` |

**hud** area:

| Key | en | da |
|---|---|---|
| `hud.chapter.jungle.name` | Jungle | Junglen |
| `hud.chapter.jungle.desc` | Bonus · bamboo, lianas, porters, monkeys and carts | Bonus · bambus, lianer, bærere, aber og kærrer |
| `hud.palette.short.walkway` | Walkway | Gangbro |

Also in hud.js: add `walkway: 1` to `SHORT_MAT`, add `matSwatch` cases for walkway (slats), bamboo (a culm with nodes)
and liana (a twisted green vine), add `VEH`/`WHEELS` silhouettes for the six types (foot types: `WHEELS = []`), and add
`THEMES` (§4.3).

**results** area:

| Key | en | da |
|---|---|---|
| `results.finale.jungle.banner` | Jungle complete | Junglen klaret |
| `results.finale.jungle.title` | Out of the jungle! | Ude af junglen! |
| `results.finale.jungle.text` | Rope bridges, canopy walks, temple pillars and a monsoon - and every porter, monkey and ox cart made it across. | Rebbroer, trætopstier, tempelsøjler og en monsun - og hver eneste bærer, abe og oksekærre kom over. |
| `results.toast.bonus.jungle` | Somewhere a rope bridge creaks... The hidden chapter {name} (levels {from}–{to}) is open on the level select. | Et sted knirker en rebbro ... Det skjulte kapitel {name} (bane {from}–{to}) er åbent i banevalget. |
| `results.why.bendWalkway` *(optional polish)* | The {name} bent too far at a joint - a bamboo walkway needs a hanger or strut at every joint, at most 4 m apart. | {name} bøjede for meget i et samlingspunkt - en bambusgangbro skal have en hænger eller et stræk i hvert samlingspunkt, højst 4 m fra hinanden. |

If `results.why.bendWalkway` is added, main.js uses it instead of `results.why.bendRoad` when the first-break member
is `walkway` (WP-campaign owns main.js).

**features** area (used by jungle-fx):

| Key | en | da |
|---|---|---|
| `features.jungle.livingstone.greet` | Dr Livingstone, I presume? | Dr. Livingstone, formoder jeg? |
| `features.jungle.livingstone.reply` | Indeed - and I see you have brought a bridge. | Ganske rigtigt - og jeg ser, De har taget en bro med. |
| `features.jungle.livingstone.lost` | Dr Livingstone? ...Dr Livingstone?! | Dr. Livingstone? ... Dr. Livingstone?! |
| `features.jungle.livingstone.cameo` | Splendid bridge. Carry on! | Fremragende bro. Bare fortsæt! |
| `features.jungle.livingstone.toast` | You found Dr Livingstone! He has been waiting for a decent bridge since 1871. | Du fandt Dr. Livingstone! Han har ventet på en ordentlig bro siden 1871. |
| `features.jungle.label.canoes` | Canoe channel | Kanorende |
| `features.jungle.label.waterfall` | Waterfall | Vandfald |

**levels** area: `levels.59.name` … `levels.68.hint`. The English entries must equal the JSON text in §8
**character for character** (`test-i18n-content.js`). WP-levels copies the English text from §8 into the JSON, and
WP-campaign copies the same text into `js/i18n/en/levels.js` and translates it into `js/i18n/da/levels.js` (the Danish
names are given below; WP-campaign translates the hints). Allowlist entries go in `tools/i18n-allowlist.json` (owned by
WP-campaign).

## 8. Level outlines (59–68)

General rules:
- Banks at y = 0 unless stated. Anchors `a0`/`a1` are the road ends.
- `templates`: `false` on 59–60, `true` from 61 on (no template may earn ★★★).
- Budgets are set by WP-levels from the designs: best ≤ 70% of budget, reference ≤ about 88%, rounded up to $50.
- `timeLimit` = the reference run time + about 25%, rounded to 5 s.
- Each level has 2–3 badges (`gen-goals`).
- Traffic groups are listed fast first. Livingstone is always last.

| # | Name (en / da) | Theme | Gap / terrain | Anchors | Materials | Traffic | Concept / extras |
|---|---|---|---|---|---|---|---|
| 59 | Monkey Bridge / Abebroen | jungle | 14 m; floor −14, water −9 | a0, a1, a2 (0,−3), a3 (14,−3), a4 (0,7) tree, a5 (14,7) tree | walkway, liana | monkey ×6 @0.7, walker ×2 @2 | The rope bridge: a walkway can simply hang between the banks (it is a chain in tension); liana from the trees steadies it. `buildArea {0,14,−6,12}`, `jungle {canoes:1}` |
| 60 | Porter's Path / Bærerstien | jungle | 20 m dry gorge; floor −12, water null | a0, a1, a2 (0,−4), a3 (20,−4); no high anchors | walkway, bamboo | walker ×6 @1.5, handcart ×2 @3 | Bamboo introduced: a bare catenary folds (bending) under a hand cart; any light bamboo truss (above or below) carries it. `buildArea {0,20,−10,8}`; tiger in the ferns |
| 61 | Canopy Walk / Trætopstien | jungle | 30 m; floor −18, water −12 | a0, a1, a2 (0,−4), a3 (30,−4), a4 (−0.5,10) tree, a5 (30.5,10) tree, a6 (15,14) tree (a giant tree in the river) | walkway, bamboo, liana, rope | monkey ×10 @0.5, walker ×4 @1.5, handcart ×2 @3 | Trees as anchor points: hang the deck from three trees; liana is enough for the monkeys, carts want rope. `buildArea {0,30,−8,16}`, `jungle {canoes:1}` |
| 62 | Canoe Crossing / Kanoovergangen | jungle | 32 m; floor −14, water −6 | a0, a1, a2 (0,−4), a3 (32,−4), a4 (0,8) tree, a5 (32,8) tree | walkway, bamboo, liana, rope | walker ×6 @1.5, handcart ×2 @3 | Canoe channel `noBuild {9,23,−6,−1.5}`: nothing mid-river; hang from above or a bamboo arch from the cliff bolts. `buildArea {0,32,−6,14}`, `jungle {canoes:2}` |
| 63 | Market Day / Markedsdag | jungle | 24 m; floor −12, water −7 | a0, a1, a2 (0,−4), a3 (24,−4) | walkway, bamboo, liana, rope, wood | walker ×4 @1.5, handcart ×2 @3, oxcart ×1 @4 | The ox cart (1.2 t) arrives: bamboo buckles under it; wood where compression peaks; one pier on a sandbank `pierZones [{10,14}]`, `maxPiers 1`. `buildArea {0,24,−7,10}`, `jungle {canoes:1}` |
| 64 | Temple Causeway / Tempelvejen | jungle_temple | 42 m; floor −16, water −9 | a0, a1, a2 (0,−4), a3 (42,−4), a4 (14,−1) ruin, a5 (28,−1) ruin | walkway, bamboo, liana, rope, wood | walker ×4 @1.5, oxcart ×2 @5 | Ruins as piers: two free stone pillars (fixed anchors mid-river) split the span into three. `buildArea {0,42,−9,12}`, `jungle {canoes:1}`; elephant |
| 65 | Thundering Falls / Tordenfaldet | jungle | 36 m; floor −20, water −12 | a0, a1, a2 (0,−5), a3 (36,−5), a4 (0,10) tree, a5 (36,10) tree | walkway, bamboo, liana, rope, wood | walker ×6 @1.5, handcart ×3 @3 | Waterfall no-build curtain: `noBuild [{16.25,19.75,−12,−0.75}, {16.25,19.75,1.25,16}]`; one 4 m walkway segment (joints at x 16 and 20) leaps the falls, so both sides must be stiff. `buildArea {0,36,−12,16}`, `jungle {waterfall:{x0:16.25,x1:19.75}, canoes:0}` |
| 66 | Monsoon / Monsun | jungle | 34 m; floor −14, water −8 | a0, a1, a2 (0,−4), a3 (34,−4), a4 (0,9) tree, a5 (34,9) tree | walkway, bamboo, liana, rope, wood | monkey ×6 @0.6, walker ×4 @1.5, handcart ×2 @3 | Wind `events [{type:'wind', start:6, duration:24, speed:24, gust:0.5, lift:2, dir:1, rain:true}]` (WP-levels tunes speed so a liana-only hung walkway fails and a deck braced from below passes). `buildArea {0,34,−8,14}`, `jungle {canoes:0}` |
| 67 | Supply Run / Forsyningsturen | jungle | 44 m; floor −18, water −10 | a0, a1, a2 (0,−5), a3 (44,−5) | walkway, road, bamboo, liana, rope, wood, steel | jeep ×2 @4, oxcart ×1 @4 | The jeep (1.65 t): mix wood and steel where it counts; one pier `pierZones [{20,24}]`, `maxPiers 1`. `buildArea {0,44,−10,14}`, `jungle {canoes:1}` |
| 68 | Source of the Nile / Nilens kilde | jungle_temple | 56 m; floor −20, water −8 | a0, a1, a2 (0,−5), a3 (56,−5), a4 (−0.5,12) tree, a5 (56.5,12) tree, a6 (12,−2) ruin, a7 (44,−2) ruin | walkway, road, bamboo, liana, rope, wood, steel | monkey ×6 @0.6, jeep ×1 @4, walker ×4 @1.5, handcart ×2 @3, oxcart ×1 @4, livingstone ×1 @3 | Finale: canoe channel `noBuild {21,35,−8,−3}`, ruins and trees, everything at once; Livingstone last (hidden in the summary). `buildArea {0,56,−8,18}`, `jungle {canoes:2, livingstone:'finale'}` |

**Hints (English source text, exact):**
- **59** — `Welcome to the jungle: no cars here, only monkeys and porters. A Bamboo Walkway can simply hang between the banks like a rope bridge - it sags, but it holds. Sling Liana down from the trees to stop it swinging; Liana is cheap and long, but it only pulls.`
- **60** — `The porters bring hand carts today, and a bare sagging walkway folds under a cart. Stiffen it with a light Bamboo truss from the lower bolts. Bamboo is cheap and strong in tension, but it buckles suddenly when squeezed - keep the struts short.`
- **61** — `Three giant trees hold up the canopy - tie onto them. Hang the walkway from the trees: Liana is cheap, and a full fan of it carries even the hand carts; Rope is the safe choice.`
- **62** — `Fishermen paddle their canoes down the middle of the river, so nothing may stand in the channel. Carry the walkway over it: hang it from the trees, or spring a Bamboo arch from the cliff bolts.`
- **63** — `Market day: an ox cart is coming, and an ox weighs as much as fifteen porters. Build a bamboo truss under the deck, and put Wood where the struts are squeezed hardest if it buckles.`
- **64** — `The old temple pillars still stand in the river, solid stone after a thousand years. Tie your bridge to them and let them carry the ox carts.`
- **65** — `A waterfall thunders through the middle of the gorge. Nothing may stand in the falling water, so the walkway has to leap the curtain in one step - make both sides stiff enough to hold it.`
- **66** — `The monsoon breaks a few seconds after the first monkey sets off. Gusts lift a light walkway, and Liana goes slack when the deck rises. Brace the deck from below as well as from above so it cannot flap.`
- **67** — `The expedition's jeep has arrived - more than a tonne and a half, far heavier than anything else in the jungle. Bamboo and Liana will not carry it alone: mix in Wood and Steel where the loads are highest.`
- **68** — `The finale: a wide river, a canoe channel, temple ruins and every kind of traveller in the jungle. An expedition has been waiting on the far bank for weeks - get everyone across. Someone over there will be very glad to see you.`

## 9. Work packages and strict file ownership

Wave 1 runs in parallel: WP-core, WP-sprites, WP-bg, WP-campaign (dictionaries and registration).
Wave 2 needs WP-core: WP-levels and WP-render (WP-render also uses the sprites when they land; missing sprites fall
back to canvas shapes). Wave 3 is WP-integrate, run by the orchestrator. The model suggestions follow the brief's "use
cheapest models where they make sense".

### WP-core: materials, traffic types, core rules, physics tests (no rendering). Suggested model: opus, or a strong sonnet
- **Owns:** `js/core/materials.js`, `js/core/vehicles.js`, `js/core/events.js`, `js/core/model.js`,
  `js/core/templates.js`, `js/ui/arch-tool.js`, `tools/test-physics.js`, `tools/test-events.js`, and the §2 table in
  this file.
- **Does:** §2 and §3 exactly (values, flags, `MaterialOrder`, `VehicleOrder`, AERO, `def.width`, `hidden` in
  `trafficSummary`, template and arch-tool pick lists). It **never touches physics.js.**
- **Adds tests to `tools/test-physics.js`:**
  1. `jungle: material invariants`: walkway `isRoad` with maxLength 4; liana `tensionOnly` and cheaper than rope;
     bamboo compression < tension; all three cheaper per metre than wood.
  2. `jungle: walkway catenary carries porters and monkeys, folds under a hand cart` (the 16 m case from §2).
  3. `jungle: liana hangers carry hand carts, snap under the ox cart; rope hangers carry it`.
  4. `jungle: bamboo truss carries the jeep at 20 m, buckles (compression) under the ox cart at 28 m; wood passes`.
  5. `jungle: foot traffic stays upright and finishes on a 2.5 m-sag (≈30°) walkway` (all of `walker`,
     `livingstone`, `monkey`).
  6. `jungle: Livingstone is hidden from trafficSummary but counts in vehiclesTotal`.
  7. `jungle: deterministic`: the same run twice gives identical summaries.
- **Adds tests to `tools/test-events.js`:**
  - Vehicles without `width` still use 2.5 m (bit-identical to before).
  - A porter's wind drag uses `width`.
  - A walkway deck in a 16 m/s wind gets finite lift, with the AERO entry used (not the road fallback).
- **Must pass:** `node tools/test-physics.js`, `node tools/test-events.js`, `node tools/verify-levels.js` (all existing
  levels unchanged), `node tools/test-templates.js`, `node tools/test-generator.js --quick`,
  `node tools/test-daily.js --node-only`.

### WP-sprites: SVG files only. Suggested model: sonnet (haiku for the simple decorations)
- **Owns:** `assets/sprites/jungle/` (the 25 files in §5). Nothing else.
- **Tests:** the XML and viewBox self-check in §5. Visual review happens in WP-render's screenshots.

### WP-bg: backgrounds. Suggested model: haiku (tool calls and image review)
- **Owns:** `assets/bg/jungle.jpg`, `assets/bg/jungle_temple.jpg`, `assets/bg/credits.txt`.
- **Tests:** dimensions are 2208×960 (check them with the JPEG SOF reader one-liner used for the existing files), the
  size is 40–200 KB, and a visual check confirms no text, people or bridge.

### WP-render: jungle visuals and the Livingstone logic. Suggested model: sonnet (opus if the beam and pose wrapping fights back)
- **Owns:** `js/features/jungle-fx.js` (new), `js/render/renderer.js` (the single `ships === false` line, nothing
  else), `index.html` (the one script line), `tools/test-jungle.js` (new), and `tools/run-tests.js` (adds
  `['test-jungle.js', '--node-only']` to NODE and `['test-jungle.js']` to BROWSER).
- **Does:** §4 entirely.
- **`tools/test-jungle.js`:**
  - **Node part:** jungle themes and sprite tables are well-formed (every sprite file in §5 exists, every `TYPES`
    entry has a meta entry whose W = `def.length × 100`). `cameo()` is deterministic. Jungle levels use no land
    features and have `buildArea.y1 ≥ deck + 5.01`.
  - **Browser part (headless):** every level 59–68 renders in edit mode and in sim mode with no console errors and no
    sprite in `Sprites.failed`. No container ship is drawn on jungle channel levels (`theme.ships === false`). Canoes
    are present on water levels. Level 68's best solution passes, `BG.JungleFx.lastMeeting` is set, and the greet
    bubble was shown. `?livingstone=1` shows a cameo on 59. A non-jungle level (24) renders exactly as before (same
    pixel hash with and without jungle-fx loaded, or at least no jungle hooks entered). Screenshots go to the
    scratchpad via `tools/shot.js`.
- **Must pass:** `node tools/test-jungle.js`, `node tools/test-ceiling.js` (every level renders; traffic fits under the
  ceilings), `node tools/test-i18n.js` (lint stays at 0, so all text goes through `t()`).

### WP-campaign: registration, HUD, every dictionary edit, unlock and e2e expectations. Suggested model: sonnet
- **Owns:** `js/ui/storage.js`, `js/ui/hud.js`, `js/main.js`, **all** of `js/i18n/en/*.js` and `js/i18n/da/*.js`,
  `tools/i18n-allowlist.json`, `tools/test-unlock.js`, `tools/e2e.js`, `tools/e2e-events.js`, `tools/e2e-goals.js`.
- **Does:** §1 (storage bonus entry, `CHAPTERS` `n: 9`, `bonusFinales.jungle = finaleText('jungle')`, chapter-specific
  toast in main.js), §4.3 hud `THEMES`, §7 (every key, both languages; level names and hints from §8, translated into
  Danish), hud `SHORT_MAT`, `matSwatch`, `VEH`/`WHEELS`, and hiding `hidden` traffic in chips and tooltips.
- **Tests:**
  - **`tools/test-unlock.js`** (new section):
    - Jungle is registered as a Roads bonus chapter (59–68, after 30).
    - None of its levels is a gate.
    - Closed before 30, and the lock text names level 30 and the chapter.
    - 30 done opens 59 only.
    - Own unlock list `[59..68]`; the main line skips it.
    - Finishing the jungle never opens or skips main-line levels.
    - Migration keeps nothing in 59–68.
    - `finaleOf(68) === 'jungle'`, `finaleOf(67) === null`.
  - **`tools/e2e.js`:**
    - Update the Anchorages section. `seed(1..39)` already reveals the Jungle, so at line 646 the last chapter is now
      Jungle with the Anchorages before it, and `ls2.open` is `'54,59'`.
    - Update the header comment.
    - Add a section "the hidden Jungle chapter (59–68): opens after level 30":
      - Next 30 → 31, 59 → 60, 68 → null.
      - Passing 30 shows the `results.toast.bonus.jungle` toast and opens only 59.
      - The chapter is in the level select.
      - The top bar on 59 names the chapter.
      - 68's best solution passes with `finaleKind === 'jungle'`, the finale banner, "All levels", and
        `BG.JungleFx.lastMeeting` set.
  - **`tools/e2e-events.js`:** the chapter count becomes 9 (`[6]` Forces of Nature, `[7]` Anchorages, `[8]` the jungle
    name). The revealed road stars change from `'/ 174'` to `'/ 204'` (+30). The hidden-total check on a fresh
    profile stays `'/ 150'`.
  - **`tools/e2e-goals.js`:** re-check the `tiles === 50` expectations. They hold on a fresh profile. If a step
    completes 30, expect 60 tiles.
  - `tools/test-i18n-content.js` checks the new `vehicles.road.<type>.count` keys automatically.
- **Must pass:** `node tools/test-unlock.js`, `node tools/test-i18n.js`, `node tools/test-i18n-content.js`, then the
  browser suites after WP-levels lands.

### WP-levels: levels 59–68. Suggested model: opus for design and optimisation (sonnet can do the JSON transcription)
- **Owns:** `tools/levels/level-59.json` … `level-68.json`, `tools/solutions/level-59*.json` … `level-68*.json`
  (reference + best), `tools/solutions/goals/level-59-*.json` … `level-68-*.json`, and the generated `js/core/levels.js`
  and `js/features/goals-data.js` (only through `node tools/build-levels.js` and `node tools/gen-goals.js --only 59-68`;
  one agent runs gen-goals, never two at once).
- **Does:** §8 exactly (names and hints verbatim, terrain, anchors with `deco`, `jungle` fields, materials, traffic). It
  sets budgets with the best/0.70 rule, writes solution designs (on the grid, 0.6 m spacing, no floppy parts) and
  sets `timeLimit`. Geometry may be adjusted when a level doesn't work as outlined, but names, hints, ids,
  materials and traffic kinds stay as in §8 (or are changed together with WP-campaign's English dictionary text). Any
  change must be noted in this section of the spec.
- **Must pass:** `node tools/verify-levels.js --only 59-68` and then the full run,
  `node tools/test-templates.js` (no ★★★ template), `node tools/test-goals.js`, `node tools/test-anchors.js`
  (unchanged: no land features), `node tools/test-ceiling.js --no-browser`, `node tools/test-i18n-content.js` (JSON
  matches the English dictionary once WP-campaign has landed).

### WP-integrate: the orchestrator, after all of the above
- **Owns:** `sw.js` (`node tools/gen-precache.js`, which picks up jungle-fx, the sprites and the backgrounds),
  `js/features/about-data.js` (`node tools/gen-about.js`, so levels 90 → 100), `SPEC.md` (new §20 "Jungle" summary
  table like §17.7, pointing here), `docs/LEVEL-AUTHORING.md`, `docs/GAMEPLAY.md`, `docs/TESTING.md`, `README.md`,
  and the `package.json` description.
- **LEVEL-AUTHORING.md changes:**
  - Ids: Roads use 1–68.
  - Themes: add `jungle` and `jungle_temple`.
  - Materials list: add `walkway`, `bamboo`, `liana`.
  - Traffic types: add the six new types.
  - Optional fields: add `anchors[].deco` and `jungle`.
- **Runs:** `npm test`, then `npm run test:browser`, then fixes ownership gaps with the owning WP.

## 10. Existing tests affected (summary)

| Test | Change |
|---|---|
| `verify-levels.js` | +10 levels; existing ones identical |
| `test-physics.js`, `test-events.js` | new jungle tests (WP-core); the random-material stability test now also picks jungle materials (still must stay finite) |
| `test-unlock.js` | new Jungle section (WP-campaign) |
| `e2e.js` | Anchorages expectations at line 646 (last chapter, open list) + new Jungle section (WP-campaign) |
| `e2e-events.js` | 8 → 9 chapters, `/ 174` → `/ 204` (WP-campaign) |
| `e2e-goals.js` | re-check the 50-tile expectations (WP-campaign) |
| `test-templates.js`, `test-goals.js` | cover 59–68 automatically |
| `test-anchors.js`, `test-ceiling.js`, `test-famous.js`, `test-daily.js` | unchanged as long as §6.1 holds (no land features, no low ceilings; road ≤ 50 counts untouched; generator ignores jungle types) |
| `test-i18n.js`, `test-i18n-content.js` | new keys in both languages; allowlist `Jeep` |
| `test-about.js`, e2e About | `gen-about` (WP-integrate) |
| `test-pwa.js`, `test-offline-tour.js` | `gen-precache` (WP-integrate) |
| new `test-jungle.js` | WP-render, in both run-tests lists |

Known cosmetic side effect: the palette's strength bars use a log scale over all materials. The new weakest material
(liana, 8 kN) moves `lo` from 60 kN to 8 kN, so every bar on existing levels gets a little longer. No test asserts bar
widths. This is accepted.
