# SPAN Challenges & bending trees: implementation spec

Status: v1 spec for the parallel workflow on branch `feature/challenges-trees`. Read SPEC.md §11 (badges), §15
(campaigns), §17 (land pylons), §20 and docs/jungle/SPEC-JUNGLE.md, docs/LEVEL-AUTHORING.md, docs/I18N.md and
docs/TESTING.md first.

The owner asked for five things:

1. **Weak tree anchors.** Trees lean towards the pull, and the bridge sags with them. Past a limit the roots give way and
   the tree tips over, which fails the run. The counter is a guy rope to a new ground stake behind the tree.
2. **Challenge stars.** The existing badges become visible "challenge stars" on tiles, in the build bar, in the
   results, and as chapter and campaign totals.
3. **New challenge types** that change the design: a material length cap, no material X, at most N joints, trees only,
   and no stakes.
4. **Jungle pillars** that are not concrete.
5. **Levels.** Retrofit 3 jungle levels with bending trees, and add 2 new jungle levels (69 and 70).

---

## 0. Hard rules (every agent)

- **Every other level stays bit-identical.** All tree behaviour is opt-in per anchor (`anchors[i].tree`). A level
  without any `tree` field runs exactly the same code path as today (`nTree = 0`, nothing runs, and no new keys appear
  in `summary()`). `node tools/verify-levels.js` must print the same peaks, times and costs for every level except 61,
  62, 65, 69 and 70. Before you touch physics.js, save a baseline to your scratchpad
  (`node tools/verify-levels.js --verbose > <scratchpad>/verify-before.txt`) and diff it after.
- **Determinism.** No `Math.random`, `Date` or `Math.atan2` in the sim. Use `atan2Det`/`hyp`. Trees are solved in anchor
  index order.
- **Ownership.** Edit only the files §9 gives you. Shared files (the i18n dictionaries, `tools/i18n-allowlist.json`,
  `js/ui/hud.js`, `tools/run-tests.js`) get small targeted `Edit`s, and you re-read the file just before each edit.
  Do not run `git add/commit/stash/reset/checkout`. The integrator commits.
- **Headless only.** Browser checks use `tools/browser.js`, `tools/shot.js` and `npm run test:browser`. Never open a
  visible window.
- **i18n.** Every player-visible string goes through `BG.i18n`, in English and Danish (§8). `node tools/test-i18n.js`
  (the lint) stays at 0.
- **Storage stays backward compatible.** The key stays `span.v1.badges` = `{ [levelId]: [goalType] }`. A level's goal
  set is **append-only**: a type that is shipped today is never removed from that level, so every star a player has
  already earned keeps counting.
- **Saved designs stay valid.** New anchors (stakes) are **appended** to a level's `anchors` array, so the existing ids
  `a0…aN` are unchanged.

---

## 1. Weak tree anchors (PHYSICS)

### 1.1 Decision: reuse the land-pylon model

A flexible tree is a land pylon with different numbers:
- a rigid column from a **root base** (fixed) to the anchor joint, which becomes a free node;
- a **rotational root spring** at the base (XPBD, compliance `1/stiffness`);
- an **elastic-plastic root moment limit**: the spring never resists more than `rootLimit`, and beyond that it
  rotates;
- **uprooting**: when the trunk has rotated more than `uprootTilt` from its rest direction, the roots let go.

The differences from pylons:
- The column may be **slanted at rest**. An edge tree's limb reaches over the gap edge, so the base is 1.1 m behind
  the anchor. The spring therefore acts on `th − th0`, not on `th`.
- The spring is **soft**, so the lean is visible at normal loads.
- **Uprooting fails the run at once** (`status = 'failed'`, `failReason = 'uprooted'`), the same way `derailed`
  does. A toppled pylon does not do this, but the owner asked for a clear failure reason, and a fallen tree is a
  failure even if the deck happens to survive.

Rationale: this reuses a proven, deterministic XPBD model that already has tests and a renderer counterpart. It costs
three small arrays and two loops. Levels without trees never enter it.

### 1.2 Level data format

```jsonc
"anchors": [
  { "x": 0,  "y": 0 },                                  // a0 road end (bolt)
  { "x": 32, "y": 0 },                                  // a1 road end (bolt)
  { "x": 0,  "y": -4 },                                 // a2 cliff bolt
  { "x": 32, "y": -4 },                                 // a3 cliff bolt
  { "x": 0,  "y": 8, "deco": "tree", "tree": {} },      // a4 flexible tree, all defaults
  { "x": 32, "y": 8, "deco": "tree", "tree": { "stiffness": 9e5, "rootLimit": 1.4e5 } },  // a5 overrides
  { "x": -5, "y": 0, "deco": "stake" },                 // a6 ground stake (appended)
  { "x": 37, "y": 0, "deco": "stake" }                  // a7 ground stake (appended)
]
```

| Field | Meaning |
|---|---|
| `deco: "tree"` | Look only, as today. **Without `tree` the tree stays a rigid anchor**, exactly as now. |
| `tree` | `true` or an object: the anchor is a flexible tree. All keys are optional. |
| `tree.baseX`, `tree.baseY` | Root base (m). Default: see `Model.treeSpec` below. |
| `tree.stiffness` | Root rotational stiffness, N·m/rad (default `BG.TreeAnchor.stiffness`). |
| `tree.rootLimit` | Root moment limit, N·m (default `BG.TreeAnchor.rootLimit`). |
| `tree.uprootTilt` | Rotation from rest at which it uproots, rad (default `BG.TreeAnchor.uprootTilt`). |
| `tree.topMass` | Mass added to the anchor joint, kg (default `BG.TreeAnchor.topMass`). |
| `deco: "stake"` | A ground stake: a normal fixed anchor on a bank top, drawn as a wooden peg. It has no physics of its own. |

**Stake placement rules** (checked by `test-tree-anchors.js`):
- On a bank top, with `y` equal to the bank surface (`leftY`/`rightY`).
- `x` at least 3 m behind the gap edge, and at most 6.5 m behind it, so it stays inside `levelBounds`, which is
  `leftEdge − 7`.

`Model.anchorInfo` then classifies a stake as `kind: 'inland'`, `explicit: false`. That means it is **not** a land
feature (`hasLandFeatures` stays false, and `test-anchors.js` "land features on exactly 54–58" holds), there is no
roadway envelope, and there is no camera re-frame. Never set `inland: true` on a stake, and never set `y` more than
0.3 m above the surface: that would make it a `hill` anchor.

### 1.3 Constants (js/core/materials.js)

```js
/** Flexible tree anchors (docs/challenges/SPEC-CHALLENGES.md §1; opt-in per anchor via anchors[i].tree): a rigid
 *  trunk from its root base to the anchor joint, with a soft rotational root spring (stiffness, N·m/rad). The roots
 *  resist at most rootLimit (N·m); beyond that the tree keeps leaning, and past uprootTilt (rad from its rest
 *  direction) it is uprooted, which fails the run. topMass (kg) is the trunk mass felt at the anchor joint. */
BG.TreeAnchor = { stiffness: 8e5, rootLimit: 1.2e5, uprootTilt: 0.25, topMass: 80, colStiffness: 5e9, damp: 0.002 };
```

Starting values. PHYSICS tunes them and records the final values here and in the materials.js header.

**Final values (PHYSICS):** `BG.TreeAnchor = { stiffness: 1.5e6, rootLimit: 1.1e5, uprootTilt: 0.085, topMass: 80,
colStiffness: 5e9, damp: 0.002 }`. Measured by `tools/test-tree-anchors.js` on the 62-like canopy (walkway deck in
4 m segments, every deck joint on a Rope fan hanger, mid-span hung from both trees):

| Case | Measured |
|---|---|
| Deck self-weight only | lean 1.3°, root 0.31 (≈ 35 kN·m) |
| Porters | peak lean 1.9°, peakRoot 0.45, deck peak 0.51, passes |
| Hand carts + porters | peak lean 2.7°, peakRoot 0.65, deck peak 0.80, passes |
| One ox cart, unguyed | yields at ≈ 4.2°, **uprooted** at 4.9° (`failReason 'uprooted'`); on a walkway deck a deck joint cracks ≈ 0.5 s before |
| The same, guyed with Rope to the stakes | steady lean 0.26°, peak 1.07° while the cart passes, peakRoot 0.26, passes |
| Liana guys under hand carts | a liana guy snaps late in the run, the bridge still passes |
| Static pull (rope V + 0.7 t) | lean = M/stiffness and ratio = M/rootLimit to < 0.1 % |

| Target (62-like geometry: anchors at +8 m, 32 m gap, rope fan hangers, walkway deck) | Value |
|---|---|
| Porters only, steady lean | **2–4°** (moment ≈ 30–50 kN·m) |
| Hand carts on the span, peak lean | **4–6°**, root ratio ≤ 0.75 |
| One ox cart (1.2 t) on one half, unguyed | moment > `rootLimit` → plastic lean → **uprooted** |
| The same, guyed with Rope to the stake | lean **< 1°**, passes |
| Liana guy under hand carts | the liana guy may snap (8 kN) and Rope holds. This is desirable but not required. |

Sanity check: the elastic lean at the limit is `rootLimit/stiffness = 0.15 rad ≈ 8.6°`, which is below
`uprootTilt = 0.25 rad ≈ 14°`, so a short overload leaves a permanent lean and does not uproot. A trunk top 8 m up has
a lateral stiffness of about `k/L² ≈ 1.2e4 N/m`. A 10 m Rope guy has an axial stiffness of about 6e5 N/m (50× stiffer),
so a guyed tree barely moves. The self-weight moment (`topMass · g · 1.1 m ≈ 0.9 kN·m`) is negligible (< 0.1°).

Mid-gap trees (a giant standing in the river, base on the floor) have a trunk 2–4× longer. If a level makes one
flexible, it must give explicit values scaled by about `(L/8)²` for `stiffness` and `(L/8)` for `rootLimit`. The
retrofit keeps mid-river trees rigid.

### 1.4 Model API (js/core/model.js, PHYSICS)

```js
Model.treeSpec(level, i)  // -> null unless anchors[i].tree is truthy; else
   // { i, id: 'a'+i, x, y,                      // anchor (joint) position
   //   baseX, baseY, length, rest,              // rest = atan2Det(-(x-baseX), y-baseY) (pylon convention, + = toward -x)
   //   stiffness, rootLimit, uprootTilt, topMass,
   //   side }                                   // +1 left-bank tree (gap toward +x), -1 right bank, 0 mid-gap
Model.treeBase(level, i)  // -> {x, y, side, edge} for ANY deco:'tree' anchor (rigid ones too; the renderer uses it)
Model.treeAnchors(level)  // -> [treeSpec] of the flexible trees, in anchor order
Model.isTreeAnchorId(level, id)   // deco 'tree' (rigid or flexible)
Model.isStakeAnchorId(level, id)  // deco 'stake'
Model.isBoltAnchorId(level, id)   // a plain anchor: no deco, and not one of Model.roadAnchors(level) (the road ends)
```

The default base (identical to what jungle-fx draws today):
- **Edge tree**, meaning `|a.x − leftEdge| ≤ 1.2` or `|a.x − rightEdge| ≤ 1.2`: `baseX = a.x ∓ 1.1` (behind the edge,
  on the bank), `baseY` = that bank's surface y.
- **Mid-gap tree**: `baseX = a.x`, `baseY = floorY`.

Explicit `tree.baseX`/`tree.baseY` override either. A tree whose `length < 1 m` is degenerate and stays rigid.

### 1.5 Simulation (js/core/physics.js, PHYSICS)

- `_buildTrees()` runs right after `_buildPylons()` in `_buildStructure`. For every `Model.treeAnchors(level)` entry
  it finds the node `k = nodeIndex.get('a' + i)`. Then it sets `nodes[k].fixed = false`, `nodes[k].tree = true`,
  `mass[k] += topMass`, and fills typed arrays like the pylon ones: `trN, trA` (anchor index), `trBX, trBY, trLen,
  trTh0, trDC, trRC, trCap, trTilt, trM, trMf, trF, trAct, trPeak`. It also sets `this.nTree` and
  `this.firstUproot = null`. When there are no trees, `nTree = 0` and nothing else is allocated.
- `_solveTrees(h)` is called in the substep **right after** `_solvePylons` (`if (this.nTree) this._solveTrees(h);`).
  It is the pylon solver with these changes:
  - the column compliance is `len / colStiffness`;
  - the root constraint is `C = th − th0`, with `th = atan2Det(-dx, dy)`;
  - `dm` is clamped to `± rootLimit·h²` (plastic).
  
  Once uprooted, the column stays and the root spring is off. The trunk pivots freely about its base and comes to rest
  lying down: clamp it so that `py[k] ≥ baseY − 0.2` when it falls toward the land, and `|th| ≤ π/2 + 0.35` when it
  falls into the gap.
- `_treePost(h, kf)` is called in step 8 right after `_pylonPost`. It does three things:
  - Damping: `vx, vy *= 1 − damp`.
  - Moment filter: `trMf += (trM − trMf)·kf`, `ratio = |trMf| / cap`, `trPeak = max(...)`.
  - The uproot check: when `|th − th0| > uprootTilt`, it sets `trAct = 0` and pushes the event
    `{ type: 'tree_uproot', anchor: i, x: baseX, y: baseY, moment: |trMf|, time }`. It sets `firstUproot` (the first
    event) and, `if (status === 'running')`, `status = 'failed'; failReason = 'uprooted'`.
- `summary()` adds keys **only when `nTree > 0`**:
  - `treesUprooted` (count),
  - `firstUproot` (event or null),
  - `peakRoot` (max `trPeak`, rounded to 4 decimals).
- `_syncOut()` keeps **`sim.trees`** up to date. It is an array in anchor order, and the same objects are reused every
  step:

```js
sim.trees = [{
  anchor: 4,            // anchors[] index (id 'a4')
  node: 4,              // sim node index (the anchor joint, now free)
  baseX, baseY,         // root base (fixed)
  x, y,                 // live anchor joint
  length,               // trunk length base->anchor (rest)
  rest,                 // th0 (rad, pylon convention + = toward -x)
  lean,                 // rotation from rest, rad, + = top moved toward +x   (i.e. -(th - th0))
  ratio,                // |filtered root moment| / rootLimit (0..1+; 1 after uprooting)
  peak,                 // max ratio so far
  uprooted              // bool
}]
```

  `sim.trees` is `[]` when `nTree = 0`. This is a new property, always present on new sims; it does not affect
  `summary()`.
- Wind and quakes: unchanged. events.js does not move tree bases. No jungle level has a quake, and this is recorded as a
  known limitation.

### 1.6 Failure reason and results text (UI owns main.js and hud.js)

- `resultText`: a new branch `c.reason === 'uprooted'`:
  - title `results.title.uprooted`;
  - text `results.fail.uprootedStake` when the level has any stake anchor, else `results.fail.uprooted`;
  - if `firstBreak` happened **before** `firstUproot`, append the usual `results.why.*` line for the member.
- `ctx` gets `firstUproot` from `sum.firstUproot || sim.firstUproot`.
- The events switch gets `case 'tree_uproot'`: `sfx('break', { material: 'wood', pan })` and `shake(0.6)`.
- The results modal: when `res.peakRoot != null`, add a stat row `results.stat.roots` (pct, `bad` at ≥ 100%).
  `_finishRun` passes `peakRoot: sum.peakRoot` into `res`.

### 1.7 Stress view and HUD

- **Renderer (RENDER, §4):** when stress colours are on, the root flare gets a glow tinted with
  `Renderer.stressColor(ratio)`. It turns red-pulsing from 0.85 on, like the pylon footing.
- **Sim bar (UI):** on a level with flexible trees, a small chip `hud.sim.roots` ("Roots 64 %"). It shows the highest
  live `ratio` over `sim.trees`, coloured with `stressColor`. It is hidden on other levels.
- **Tooltip (UI, `getHoverInfo` in main.js):**
  - In sim/results, hovering within 0.8 m of a trunk segment (base→joint), when no beam is closer, shows:
    - title `features.jungle.tree.name`;
    - rows: lean (`features.jungle.tree.deg`, 1 decimal), root load (pct, good/warn/bad), peak (pct), and
      "uprooted" if it has been uprooted;
    - the meter is `ratio`.
  - In edit mode, hovering a flexible tree's anchor shows the title and `features.jungle.tree.editTip`. Hovering a
    stake shows `features.jungle.stake.name` and `features.jungle.stake.editTip`.

### 1.8 Interactions

| System | Effect |
|---|---|
| Editor | Stakes and trees are ordinary anchors: they can be connected, they pulse when unused, and anchor-to-anchor members are allowed (as today). Nothing in editor.js changes. A guy from a stake rises over the bank; `Model.validate` accepts it (checked: stake (−5,0) → tree (0,8) on 62 is valid). |
| Traffic | Members never collide with vehicles, so walkers pass "beside" a guy rope. This is accepted (a 2D side view). |
| Templates | Unchanged code. Bending trees make tree-hung templates weaker, which only helps "no template earns ★★★". `ctx.inland` now lists stakes, but it is only used in the land-pylon modes (ground zones), which jungle levels do not have. |
| Generator (daily / endless) | Never emits `tree` or `stake`, so it is unchanged (the daily level for a fixed date stays identical). |
| verify-levels | PHYSICS adds: on levels with flexible trees, the **reference** must have `peakRoot ≤ 0.92`, and both designs must have `treesUprooted === 0`. `--verbose` prints `root` next to peak. |
| gen-goals `accept()` | Additionally requires `peakRoot ≤ 0.99` (or `peakRoot == null`). This is a GOALTYPES change. |
| Goals `cool_head` | `metrics.peak = max(peakStress, peakRoot)` when `peakRoot` is present, so a cool head guys its trees. Other levels are unaffected. |
| Hints | The retrofit and new levels mention lean and guy ropes in their hint text (§7). |
| Saved player designs on 61/62/65 | Still load (ids are stable), but may now fail or uproot. Stars already earned stay. |

---

## 2. Challenge stars (UI)

The data and proof system is unchanged: `BG.Goals`, `BG.GoalsData`, gen-goals and test-goals. Only the presentation
is renamed: "badge" becomes **challenge star**.
- The visual is a small **5-point star in teal** (`--chal: #3fd0c9`, earned; dim outline when not earned). It is shared
  as one inline SVG from goals-ui (`chalStar(state)`), so it never looks like the gold cost stars.
- Keep the existing DOM classes and hooks that tests use: `.tile-badges`, `.badge-chip`, `.goals-btn`,
  `.goals-panel`, `.res-badges`, `BG.Storage.*Badges`. Change only their content and look.

| Place | What |
|---|---|
| **Level-select tile** | Inside `.tile-stars`, after the 3 gold stars: a thin separator and then one teal pip per challenge (filled = earned). The element is still `span.tile-badges` (classes `all`/`some`). Its title is `features.goalsUi.tileTip`. No text count; the pips are the count. |
| **Chapter header** | Next to `.ch-stars`, a `span.ch-challenges`: teal star + `got/max` for the chapter's revealed levels. The title is `features.goalsUi.chapterTip`. goals-ui computes it from the section's `.tile[data-id]` elements when it wraps `buildLevelSelect` (no hud.js change is needed; if it must change hud.js, keep it to the chapter loop). |
| **Campaign total** | A second chip in the level-select header, `span.chal-camp-chip`: the challenge stars of the *active tab's* campaign (revealed levels only). The title is `features.goalsUi.campaignTip`. The existing global `.badge-chip` keeps its meaning (all campaigns), so the `e2e-events` expectations hold. |
| **Build bar** | The `.goals-btn` in the level top bar shows one pip per challenge, **live**: filled = earned, pulsing outline = on track now (`candidate`), dim = not met. Its title is `features.goalsUi.btnTip`. The panel (`G`) lists the challenges with a progress bar, as today. Live types update while you build (`live: true`), and run-based ones show "run a test". |
| **Results** | The `.res-badges` card title becomes `features.goalsUi.resTitle` ("Challenge stars"). Each challenge is a star pip with its name. The staged reveal is as today. Newly earned stars pop with `sfx('star')`. |
| **Title screen** | `.badge-chip` with the teal star icon (the global total). |

Storage: no change of key or shape. Add `S.challengeTotals(ids) -> {got, max}` (it counts only types that are valid in
the level's current set) and use it for the chapter and campaign totals. `totalBadges`/`maxBadges` stay as they are
(hidden levels are still excluded). A level can now have **2–4** challenges, so the pip rows must fit 4 pips on a
phone tile (check `test-mobile`).

---

## 3. New challenge types (GOALTYPES)

### 3.1 Evaluator changes (js/features/goals.js)

- New optional TYPE fields:
  - `title(p)`: a parametrised name. `describe()` uses `T.title ? T.title(spec) : T.name`.
  - `icon` may be a function `p => string`. `describe()` resolves it.
- New metrics, all computed from the design alone:
  - `length: { [material]: metres }`, the sum of beam lengths, rounded to 0.01;
  - `joints`, the number of distinct **user** nodes referenced by beams (anchors and pier tops excluded);
  - `boltMembers`, the beams with an end on `Model.isBoltAnchorId`;
  - `stakeMembers`, the beams with an end on `Model.isStakeAnchorId`;
  - `trees`, the count of `deco:'tree'` anchors;
  - `stakes`, the count of stakes.
- `metrics.peak = max(peakStress, peakRoot)` when the summary has `peakRoot` (§1.8).
- Material names in texts: pass `{ material: BG.Materials[m].name, materialLc: name.toLocaleLowerCase() }`. English uses
  `{material}` (game style capitalises material names); Danish uses `{materialLc}` inside sentences.

| type | params | met when (`live`) | icon (assets/icons/badges/) |
|---|---|---|---|
| `stock` | `material`, `maxLen` (m) | `length[material] ≤ maxLen` (live) | `stock.svg` (a measuring stick over a small bundle) |
| `no_material` | `material` | no beam of `material` (live) | `no_<material>.svg`: `no_liana`, `no_bamboo`, `no_rope`, `no_wood` |
| `max_joints` | `max` | `joints ≤ max` (live) | `joints.svg` (three lashed knots) |
| `trees_only` | – | `boltMembers === 0`: only trees, stakes, ruins and the two road ends (live) | `trees.svg` (a tree with a rope) |
| `no_stakes` | – | `stakeMembers === 0` (live) | `nostakes.svg` (a struck-out peg) |

`no_steel` stays as it is (legacy ids). `no_material` is never offered for `steel` or for a deck material (`isRoad` /
`isRail`). `NO_MATERIAL_ICONS = ['liana', 'bamboo', 'rope', 'wood']` is exported as `BG.Goals.NO_MATERIAL_ICONS`.

**Heavy-load challenge: not in this release.** The evaluator judges a single run. A heavier-traffic test would need a
second simulation with changed traffic, plus a matching proof harness, UI and replay. That is not cheap, so it is
left out on purpose.

Icons are 64×64 medallions in the style of the existing ones: a gold rim, a coloured disc (`stock` amber, `no_*` red
like `nosteel`, `joints` violet, `trees` green, `nostakes` brown), and a white glyph.

### 3.2 Generation (tools/gen-goals.js)

- `--only` accepts ranges (`59-70`, `59..70`), as in verify-levels.
- **`--keep`** (append mode, passed through to workers):
  - The level's currently shipped types are kept. Their thresholds are re-derived from the new pool. If one can no
    longer be proven, the run exits non-zero for that level, and a level agent must add a seed design.
  - Then **new design types** are appended (`DESIGN = ['no_material', 'stock', 'trees_only', 'no_stakes',
    'max_joints']`, priority in that order, all `PRIORITY 6` except `max_joints` 4), until the level has **4**
    challenges, with **at most 2** design types per level.
  - Without `--keep`, the old behaviour stays (3 goals). For a brand-new level it picks 3 by the old rules, then
    appends up to 1 design type (total ≤ 4).
- **Seeds:** the pool also loads every `tools/solutions/seeds/level-NN-*.json` (hand-made designs by the level
  agents). Seeds go through `accept()` like every other candidate. Only gen-goals reads this directory.
- **New substitutions** (only when both materials are allowed): `{bamboo: 'wood'}`, `{liana: 'rope'}`,
  `{rope: 'liana'}`, `{bamboo: 'steel'}`.
- `accept()` also requires `peakRoot ≤ 0.99` (or `peakRoot` absent). cool_head uses `metrics.peak`.
- **When each new type is offered (proof rules):**
  - `no_material`: `M ∈ NO_MATERIAL_ICONS ∩ level.materials`, ref or best uses `M`, and some pool design without `M`
    passes. Pick the `M` with the largest ref length.
  - `stock`: for an allowed non-deck `M` used by ref/best, `lmin` = the smallest `length[M]` in the pool (> 0) and
    `lref` = min(ref, best). Offer it only if `lmin ≤ 0.6·lref` (a real redesign, not a trim), with
    `maxLen = ceil(lmin · 1.05)` in whole metres. Never offer it on the same level as `no_material` for the same `M`.
  - `max_joints`: `jmin` = the smallest pool joint count and `jref` = min(ref, best). Offer it if `jmin ≤ 0.8·jref`,
    with `max = jmin + max(1, round(0.05·jmin))`. It is mutually exclusive with `minimalist` in the same set when *new*
    (it may still be appended next to a kept `minimalist`).
  - `trees_only`: the level has ≥ 1 tree anchor and ≥ 1 bolt anchor, ref or best uses a bolt, and a pool design
    passes with `boltMembers === 0`.
  - `no_stakes`: the level has stakes, ref and best both use a stake, and a pool design passes with
    `stakeMembers === 0`.
- **Scope of regeneration in this release:** only `node tools/gen-goals.js --only 59-70 --keep`, run once by the
  INTEGRATOR. No other level is regenerated (their sets and proofs stay byte-identical). Level agents may run the
  single-level worker (`node tools/gen-goals.js --level N --keep`) for their own levels to see what is offered. That
  writes only `tools/solutions/goals/level-NN-*` and `_level-NN.json`, never `goals-data.js`.

### 3.3 test-goals.js (GOALTYPES, unit part)

- The data shape check becomes **2–4** goals per level.
- Unit tests on synthetic levels (use `G.register(9001, …)`, like today):
  - `stock` (met and unmet, live, exact boundary);
  - `no_material` (title and icon resolve to `No Liana` / `no_liana`);
  - `max_joints` (counts user joints only, anchors excluded);
  - `trees_only` (road-end anchors allowed, a cliff bolt breaks it, stakes and ruins allowed);
  - `no_stakes`;
  - cool_head with `peakRoot` (`peakRoot` 0.7 + `peakStress` 0.4 is not met at max 0.5);
  - Danish texts use the lowercase material (`'Uden lian'`, `'Gennemfør uden at bruge lian'`).
- The existing full re-verification of every shipped goal stays as it is.

---

## 4. Jungle visuals: pillars, trees, stakes (RENDER)

All of this goes in `js/features/jungle-fx.js` (wrapping only; renderer.js is untouched). It does nothing on other
themes.

### 4.1 Piers (the user's direct request: "not concrete")

| Case | Look |
|---|---|
| `jungle` floor pier, `topY − baseY ≥ 3` | **Lashed timber trestle.** Two raked log legs (dark `#5e3e22` → `#7a5432`, 0.35 m thick) from a **river-stone footing** (3–5 rounded mossy stones, `#7d7a68`/`#5f5c4e`, moss `rgba(80,140,50,.55)`) up to a log cap beam (2.2 m wide). X cross-bracing of thinner poles every ~2.5 m, with rope lashings (`#c9b58a`, 3 wraps) at each crossing and at the cap. A water-stain band below `waterY`. |
| `jungle` floor pier, shorter than 3 m | **Log crib.** Horizontal logs stacked in alternating layers (round ends showing every other layer), on the same stone footing. |
| `jungle_temple` floor pier | Unchanged: the ruin pillar (`pillar()`). |
| A land pylon (`p.ground`) on any jungle theme | **A-frame log tower** rotated by the live tilt (`p.topX`), on a stone footing. The red footing glow at `footing > 0.85` is kept. No jungle level has one today, but it must not look concrete. |
| Edit-mode ghost / invalid | The same drawing, with `globalAlpha 0.55` / red tint, like the original. |

These are drawn on the canvas, deterministic from `hash2(x)`. No new sprite is required. An optional
`assets/sprites/jungle/stone_footing.svg` may be used. Count calls in `JungleFx.pierHits` for the tests.

### 4.2 Trees

- `drawTreeAnchor` takes its base from `Model.treeBase(level, i)` for every tree, so rigid trees render exactly where
  they do today.
- When the level is in sim/results and `sim.trees` has an entry for that anchor, the whole tree (trunk, limb, crown,
  parrot or monkey perch) is drawn **bent**. The trunk is a quadratic curve from the base (tangent stays near vertical,
  so the roots hold) to the live joint plus the limb offset, so it bows toward the pull. The crown follows the top.
  Using `lean` from `sim.trees` gives the visible lean, and the bridge sags with it on its own (the beams attach to the
  live node).
- **Anchor knot at the live joint.** `_drawAnchors` draws `L.anchors` at static positions. For flexible trees in
  sim mode, pass the original a shallow-copied level whose tree anchors carry the live `x, y`.
- **Stress view** (`state.settings.showStress` or the renderer's flag): a root glow tinted with
  `stressColor(ratio)`, pulsing red from 0.85 on.
- **Uprooted:** the root plate (a dark soil disc with root strands) lifts on the side away from the fall, and the trunk
  rotates with the sim. On the transition, emit dust and clods through an existing `this.effects` helper if one exists
  (no effects.js edit).

### 4.3 Stakes

- A `deco:'stake'` anchor is drawn as a **sharpened wooden peg**: 0.25 m wide, 0.9 m above ground, leaning 15° away from
  the gap, with a rope coil and a lashing knot at the anchor point.
- The renderer's concrete deadman block (`_drawDeadman`, which stakes reach because they are `inland`) and the shackle
  eye in `_drawAnchors` must **not** be drawn for stakes. Wrap `_drawDeadman` (skip it when
  `L.anchors[a.i].deco === 'stake'`) and handle the anchor eye in the `_drawAnchors` wrapper.
- An unused stake still pulses in edit mode, like any anchor.
- In edit mode only, a small label `features.jungle.label.stake` ("Stake") appears under each stake, through the
  `_label` path used for the canoe channel.

### 4.4 Other concrete in the jungle

The bank abutments (log cribbing / temple stones) and anchor bolts (`anchor_wood` / `anchor_stone`) are already jungle
styled. RENDER should check headlessly that no concrete-grey (`#8f9294`, `#c4c6c4`) fill is left on levels 59–70 in
edit or sim mode. The pier, pylon and deadman paths are the known ones.

---

## 5. Retrofit levels (LEVELS-RETROFIT)

| Level | Change | Stakes (appended) |
|---|---|---|
| **61 Canopy Walk** | `a4`, `a5` (the bank trees at ±0.5 / y 10) get `"tree": {}`. The mid-river giant `a6` stays rigid ("rooted in rock"). | `a7 (−5, 0)`, `a8 (35, 0)` |
| **62 Canoe Crossing** | `a4`, `a5` get `"tree": {}`. | `a6 (−5, 0)`, `a7 (37, 0)` |
| **65 Thundering Falls** | `a4`, `a5` get `"tree": {}`. | `a6 (−5, 0)`, `a7 (41, 0)` |
| **68 Source of the Nile** | Hint text only (no longer "The finale:", §7). Trees stay rigid. | – |

59 (*Monkey Bridge*, the first level, light loads) and 66 (*Monsoon*) keep rigid trees, which keeps their proofs and
challenge sets untouched. The retrofit agent may additionally opt 66 in, but only if it is re-proven cheaply.

For each retrofit level:
- Re-prove the reference and best solutions (`tools/solutions/level-NN.json`, `-best.json`) under the new physics. The
  reference should show a clear lean (2–6°), have `peakRoot ≤ 0.92`, and (on at least one of the three levels) use a
  guy rope.
- Keep `budget` and `timeLimit`. You may raise the budget by at most +15% if the guyed reference needs it; never lower
  it (a player's ★★★ must not get harder retroactively without need).
- Write 1–3 seed designs into `tools/solutions/seeds/` that prove a design challenge, such as
  `level-62-nostakes.json` (balanced fan with no guys) or `level-61-treesonly.json`.
- Update the hints of 61, 62, 65 and 68, in the JSON and in `js/i18n/en/levels.js` (character for character) and
  `js/i18n/da/levels.js` (§7).
- Run `node tools/build-levels.js` (it regenerates `js/core/levels.js` from all the JSON; running it again after the
  other level agent is harmless).

## 6. New levels 69 and 70 (LEVELS-NEW)

**Placement decision:** the levels are **appended at the end of the Jungle chapter**: 59–70, and **70 is the new
chapter finale**.
- Inserting them before 68 would mean renumbering 68, which would break saved progress, i18n keys, solutions and goal
  proofs.
- The unlock rule is dynamic (either of the two previous levels is complete), so players who already finished 68 find
  69 open at once.
- Dr Livingstone stays on 68 (`jungle.livingstone: 'finale'` is a scene flag, independent of the chapter finale), so
  the story beat is kept. 69–70 are the journey home.

| # | Name (en / da) | Theme | Gap / terrain | Anchors | Materials | Traffic | Concept |
|---|---|---|---|---|---|---|---|
| **69** | Guy Ropes / Barduner | jungle | 24 m; floor −14, water −8 | a0 (0,0), a1 (24,0), a2 (0,9) tree `{}`, a3 (24,9) tree `{}`, a4 (−5,0) stake, a5 (29,0) stake. **No cliff bolts.** | walkway, liana, rope, bamboo | walker ×6 @1.5, handcart ×2 @3 | The teaching level: the only things to hang from are two flexible trees. An unguyed hung walkway leans the trees 6°+ under hand carts and uproots one (tune so that it does). Rope guys to the stakes make it stand. `buildArea {0,24,−7,13}`, `jungle {canoes:1}`, templates true. |
| **70** | The Leaning Kapok / Den skæve kapok | jungle | 36 m; floor −18, water −10 | a0 (0,0), a1 (36,0), a2 (0,−5), a3 (36,−5), a4 (0,12) tree `{ "baseX": −3, "baseY": 0, "stiffness": 1.1e6, "rootLimit": 1.6e5 }` (an old kapok already leaning out over the river, about 14° at rest), a5 (36,8) tree `{}`, a6 (−6,0) stake, a7 (41,0) stake | walkway, bamboo, liana, rope, wood | walker ×4 @1.5, handcart ×2 @3, oxcart ×1 @4 | The finale: an ox cart drags each tree in turn as it crosses. A hung deck must be guyed on both sides, or propped with bamboo/wood from the cliff bolts, so the trees carry less. `buildArea {0,36,−10,16}`, `jungle {canoes:1}`. |

LEVELS-NEW may adjust the geometry and numbers, but names, ids, materials and traffic kinds stay as above (or change
together with the dictionaries). Every change goes in "Deviations".

Rules:
- Budgets: best ≤ 70% of budget, reference ≤ about 88%, rounded up to $50.
- `timeLimit` = the reference time + about 25%, rounded to 5 s.
- Proven reference and best solutions, and seeds for at least one design challenge per level.
- `buildArea.y1 ≥ deck + 5.01`, no `terrain.ceiling`, no land features (test-ceiling and test-anchors stay as they
  are).
- **No template earns ★★★** (`test-templates`).

**Registration: every place that hard-codes the jungle range or the level count** (LEVELS-NEW edits unless noted):

| File | Change |
|---|---|
| `tools/levels/level-69.json`, `level-70.json` | new |
| `js/core/levels.js` | `node tools/build-levels.js` |
| `js/ui/storage.js` | `jungle` bonus entry `last: 68 → 70`, and the comment on line 108 ("59-68" → "59-70") |
| `js/ui/hud.js` | `CHAPTERS` jungle `to: 68 → 70`, and the comment on line 408 |
| `js/i18n/en/levels.js`, `js/i18n/da/levels.js` | `levels.69.*`, `levels.70.*` (§7) |
| `tools/test-unlock.js` | `b.last === 70`; `range(59, 70)` everywhere; finales: `finaleOf(70) === 'jungle'`, `finaleOf(68) === null`, `finaleOf(69) === null`; comments |
| `tools/e2e.js` | header comment; `jungToast` `to: 70`. Jungle section: Next `[30, 59, 67, 68, 69, 70]` → `[31, 60, 68, 69, 70, null]`. 68's best still meets Livingstone (`lastMeeting`), but its Next is 69 (not a finale). A new check: 70's best passes with `finaleKind === 'jungle'`, the finale banner and "All levels". Seed 59–69 as done before opening 70. |
| `tools/e2e-events.js` | revealed road stars `'/ 204'` → `'/ 210'`; comment "59-68" → "59-70". The hidden total `'/ 150'` and the 9 chapters are unchanged. |
| `tools/test-jungle.js` | `IDS = [59 … 70]` (one line; RENDER owns the rest of the file) |
| `js/features/jungle-fx.js` | header comment "levels 59-68" → "59-70" (**RENDER**) |
| `docs/jungle/SPEC-JUNGLE.md` §1 | a note "extended to 59–70 by docs/challenges/SPEC-CHALLENGES.md" (**INTEGRATOR**) |
| `SPEC.md` §11, §20, new §21 | ranges, challenge stars, new types, tree anchors (**INTEGRATOR**) |
| `docs/GAMEPLAY.md` | "9 Jungle (59–68)" → 59–70 (lines 105, 169, 209), plus table rows for 69 and 70 (**INTEGRATOR**) |
| `docs/LEVEL-AUTHORING.md` | Roads ids 1–70; `anchors[].tree`, `deco: 'stake'` (**INTEGRATOR**) |
| `docs/PHYSICS.md`, `docs/TESTING.md` | the tree anchor model; `test-tree-anchors.js` (**INTEGRATOR**) |
| `README.md` | "100 hand-made levels" → 102; the table row "59–68" → "59–70"; challenge stars (**INTEGRATOR**) |
| `package.json` | description "100 levels" → "102 levels" (**INTEGRATOR**) |
| `js/features/about-data.js` | `node tools/gen-about.js` (levels 102, road 70) (**INTEGRATOR**) |
| `sw.js` | `node tools/gen-precache.js` (new icons and sprites) (**INTEGRATOR**) |
| `tools/e2e-goals.js` | "50 tiles" expectations hold on a fresh profile (UI re-checks) |
| `results.finale.jungle.*` | unchanged text, now shown after 70 |

---

## 7. Level texts (exact; the English must equal the JSON character for character)

**61 hint**
- en: `Three giant trees hold up the canopy - tie onto them. The two on the banks lean when you pull on them, and the walkway sags with them; pull too hard and the roots give way. A guy rope back to the stake behind a tree holds it upright. Liana is cheap, Rope is the safe choice.`
- da: `Tre kæmpetræer holder baldakinen oppe - bind fast i dem. De to på bredderne læner sig, når du trækker i dem, og gangbroen synker med; træk for hårdt, og rødderne giver slip. En bardun tilbage til pløkken bag træet holder det oprejst. Lianer er billige, reb er det sikre valg.`

**62 hint**
- en: `Fishermen paddle their canoes down the middle of the river, so nothing may stand in the channel. Carry the walkway over it: hang it from the trees and guy them back to the stakes behind them, or spring a Bamboo arch from the cliff bolts.`
- da: `Fiskerne padler deres kanoer ned gennem midten af floden, så intet må stå i renden. Før gangbroen over den: hæng den op i træerne, og bardunér dem tilbage til pløkkene bag dem, eller spænd en bambusbue ud fra klippeboltene.`

**65 hint**
- en: `A waterfall thunders through the middle of the gorge. Nothing may stand in the falling water, so the walkway has to leap the curtain in one step - make both sides stiff enough to hold it. Hang them from the trees if you like, but a leaning tree lets its side droop: guy it back.`
- da: `Et vandfald buldrer gennem midten af kløften. Intet må stå i det faldende vand, så gangbroen skal springe over tæppet i ét skridt - gør begge sider stive nok til at bære det. Hæng dem gerne op i træerne, men et træ, der læner sig, lader sin side synke: bardunér det tilbage.`

**68 hint** (it is no longer the chapter finale)
- en: `The source of the Nile: a wide river, a canoe channel, temple ruins and every kind of traveller in the jungle. An expedition has been waiting on the far bank for weeks - get everyone across. Someone over there will be very glad to see you.`
- da: `Nilens kilde: en bred flod, en kanorende, tempelruiner og alle slags rejsende i junglen. En ekspedition har ventet på den fjerne bred i ugevis - få alle over. Nogen derovre bliver meget glade for at se dig.`

**69** `Guy Ropes` / `Barduner`
- en: `Two kapok trees, one on each bank, and nothing else to hang from. Hang the walkway from the trees - then watch them lean. A tree only takes so much pull before its roots tear out. Run a guy rope from each tree back to the ground stake behind it and it will stand like a post.`
- da: `To kapoktræer, et på hver bred, og intet andet at hænge i. Hæng gangbroen op i træerne - og se dem læne sig. Et træ tåler kun så meget træk, før rødderne rives op. Spænd en bardun fra hvert træ tilbage til jordpløkken bag det, så står det som en pæl.`

**70** `The Leaning Kapok` / `Den skæve kapok`
- en: `The old kapok on the near bank already leans out over the river, and the ox cart is coming. Hang the walkway from both trees, but guy them well: as the ox cart rolls across, it drags each tree in turn towards the river. Bamboo props from the cliff bolts take some of the weight off.`
- da: `Det gamle kapoktræ på den nære bred hælder allerede ud over floden, og oksekærren er på vej. Hæng gangbroen op i begge træer, men bardunér dem godt: når oksekærren ruller over, trækker den hvert træ mod floden efter tur. Bambusstivere fra klippeboltene tager noget af vægten.`

---

## 8. i18n keys (en / da)

Each agent adds or edits only the keys in its own block. Material params: English `{material}`, Danish `{materialLc}`.

### GOALTYPES: `js/i18n/{en,da}/features.js`

| Key | en | da |
|---|---|---|
| `features.goals.stock.name` | `Short on {material}` | `Sparsom med {materialLc}` |
| `features.goals.stock.desc` | `Pass using at most {len} of {material}` | `Gennemfør med højst {len} {materialLc}` |
| `features.goals.stock.progress` | `{used} / {len} of {material}` | `{used} / {len} {materialLc}` |
| `features.goals.no_material.name` | `No {material}` | `Uden {materialLc}` |
| `features.goals.no_material.desc` | `Pass without using any {material}` | `Gennemfør uden at bruge {materialLc}` |
| `features.goals.no_material.done` | `no {material} used` | `ingen {materialLc} brugt` |
| `features.goals.no_material.progress` | `{one: '{n} {material} member', other: '{n} {material} members'}` | `{one: '{n} bjælke af {materialLc}', other: '{n} bjælker af {materialLc}'}` |
| `features.goals.max_joints.name` | `Few Knots` | `Få knuder` |
| `features.goals.max_joints.desc` | `Pass using at most {max} joints` | `Gennemfør med højst {max} knudepunkter` |
| `features.goals.max_joints.progress` | `{n} / {max} joints` | `{n} / {max} knudepunkter` |
| `features.goals.trees_only.name` | `Tree Hugger` | `Trækrammer` |
| `features.goals.trees_only.desc` | `Pass without the cliff bolts - only trees, stakes and the road ends` | `Gennemfør uden klippeboltene - kun træer, pløkke og vejenderne` |
| `features.goals.trees_only.done` | `no cliff bolts used` | `ingen klippebolte brugt` |
| `features.goals.trees_only.progress` | `{one: '{n} member on a cliff bolt', other: '{n} members on cliff bolts'}` | `{one: '{n} bjælke i en klippebolt', other: '{n} bjælker i klippebolte'}` |
| `features.goals.no_stakes.name` | `Free Standing` | `Fritstående` |
| `features.goals.no_stakes.desc` | `Pass without tying anything to the ground stakes` | `Gennemfør uden at binde noget til jordpløkkene` |
| `features.goals.no_stakes.done` | `no stakes used` | `ingen pløkke brugt` |
| `features.goals.no_stakes.progress` | `{one: '{n} member on a stake', other: '{n} members on stakes'}` | `{one: '{n} bjælke i en pløk', other: '{n} bjælker i pløkke'}` |

`{len}` and `{used}` are formatted with `BG.i18n.meters` (whole metres).

### UI: renamed values (same keys) and new keys

| Key | en | da |
|---|---|---|
| `features.goalsUi.btnTip` | `Challenges - optional challenge stars (G)` | `Udfordringer - valgfrie udfordringsstjerner (G)` |
| `features.goalsUi.panelAria` | `Level challenges` | `Banens udfordringer` |
| `features.goalsUi.title` | `Challenges` | `Udfordringer` |
| `features.goalsUi.count` | `{got} / {n} challenge stars` | `{got} / {n} udfordringsstjerner` |
| `features.goalsUi.closeAria` | `Close challenges` | `Luk udfordringer` |
| `features.goalsUi.sub` | `Optional challenges. Pass the level and meet the condition to earn a challenge star.` | `Valgfrie udfordringer. Gennemfør banen, og opfyld betingelsen for at vinde en udfordringsstjerne.` |
| `features.goalsUi.resTitle` | `Challenge stars` | `Udfordringsstjerner` |
| `features.goalsUi.tileTip` | `{have} of {n} challenge stars` | `{have} af {n} udfordringsstjerner` |
| `features.goalsUi.chapterTip` *(new)* | `{have} of {n} challenge stars in this chapter` | `{have} af {n} udfordringsstjerner i dette kapitel` |
| `features.goalsUi.campaignTip` *(new)* | `{have} of {n} challenge stars in {name}` | `{have} af {n} udfordringsstjerner i {name}` |
| `features.goalsUi.onTrack` *(new)* | `on track` | `på vej` |
| `hud.title.badgesTip` | `Challenge stars earned` | `Optjente udfordringsstjerner` |
| `hud.sim.roots` *(new)* | `Roots {pct}` | `Rødder {pct}` |
| `results.title.uprooted` *(new)* | `Uprooted!` | `Rykket op med rode!` |
| `results.fail.uprooted` *(new)* | `A tree was pulled over: the bridge pulled on it harder than its roots could hold. Spread the pull over more anchors, or balance it with members pulling the other way.` | `Et træ blev trukket omkuld: broen trak hårdere i det, end rødderne kunne holde. Fordel trækket på flere ankerpunkter, eller afbalancér det med bjælker, der trækker den anden vej.` |
| `results.fail.uprootedStake` *(new)* | `A tree was pulled over: the bridge pulled on it harder than its roots could hold. Guy it back with a rope to the ground stake behind it, or hang less from it.` | `Et træ blev trukket omkuld: broen trak hårdere i det, end rødderne kunne holde. Bardunér det tilbage med et reb til jordpløkken bag det, eller hæng mindre i det.` |
| `results.stat.roots` *(new)* | `Root load` | `Rodbelastning` |
| `features.jungle.tree.name` *(new)* | `Tree` | `Træ` |
| `features.jungle.tree.lean` *(new)* | `Lean` | `Hældning` |
| `features.jungle.tree.deg` *(new)* | `{n}°` | `{n}°` *(allowlist: same as English)* |
| `features.jungle.tree.roots` *(new)* | `Root load` | `Rodbelastning` |
| `features.jungle.tree.peak` *(new)* | `Peak root load` | `Maks. rodbelastning` |
| `features.jungle.tree.uprooted` *(new)* | `uprooted` | `rykket op` |
| `features.jungle.tree.editTip` *(new)* | `Bends under load; its roots give way if pulled too hard. Guy it back to a stake.` | `Bøjer under last; rødderne giver slip, hvis der trækkes for hårdt. Bardunér det tilbage til en pløk.` |
| `features.jungle.stake.name` *(new)* | `Ground stake` | `Jordpløk` |
| `features.jungle.stake.editTip` *(new)* | `Tie a guy rope here to hold a tree upright.` | `Bind en bardun her for at holde et træ oprejst.` |

UI also adds to the Danish glossary comment in `js/i18n/da/core.js`:
`challenge star -> udfordringsstjerne   ground stake -> jordpløk (pløk)   uprooted -> rykket op med rode`.

### RENDER

| Key | en | da |
|---|---|---|
| `features.jungle.label.stake` | `Stake` | `Pløk` |

### LEVELS-RETROFIT / LEVELS-NEW

`levels.61.hint`, `levels.62.hint`, `levels.65.hint`, `levels.68.hint`, `levels.69.name/hint`, `levels.70.name/hint`
(§7). If test-i18n flags a Danish word that is the same as the English (for example "Kapok"), add it to
`tools/i18n-allowlist.json` with a targeted edit.

---

## 9. Agents, file ownership, waves

**Wave 1 (parallel):** PHYSICS, GOALTYPES, RENDER (pillars and stakes right away; bent trees against the §1.5
`sim.trees` contract, tested on a patched level until PHYSICS lands), UI.
**Wave 2 (after PHYSICS):** LEVELS-RETROFIT and LEVELS-NEW in parallel.
**Wave 3:** INTEGRATOR.

### PHYSICS
- **Owns:**
  - `js/core/physics.js`, `js/core/materials.js` (`BG.TreeAnchor`, header);
  - `js/core/model.js` (§1.4 API + exports);
  - `tools/test-tree-anchors.js` (new);
  - `tools/run-tests.js` (adds `['test-tree-anchors.js']` to NODE after `test-anchors.js`);
  - `tools/verify-levels.js` (the `peakRoot` / `treesUprooted` gate + verbose column);
  - the §1.3 table in this file.
- **Does:** §1.1–§1.5, §1.8 verify-levels.
- **`tools/test-tree-anchors.js`** (synthetic levels like `test-jungle-core.js`):
  1. A level without `tree` fields: `sim.nTree === 0`, `sim.trees.length === 0`, and the summary has no `peakRoot` /
     `treesUprooted` keys. A `deco:'tree'` anchor without `tree` stays fixed (its node does not move under load).
  2. `Model.treeSpec` defaults: an edge tree's base is at `a.x ∓ 1.1` on the bank surface, a mid-gap tree's base is on
     the floor, explicit overrides win, `rest` matches `atan2Det`. `Model.treeBase` works for rigid trees.
  3. Stakes: `anchorInfo.kind === 'inland'`, `hasLandFeatures === false`, `isStakeAnchorId`, and
     `isBoltAnchorId` excludes the road ends, trees and stakes.
  4. A lone flexible tree with nothing attached stands: `|lean| < 0.003` after 5 s. A slanted tree (base offset 3 m)
     keeps its rest angle (`|lean| < 0.003`).
  5. A static pull (a weight hung by rope from the tree to the gap side): the lean is within ±15% of `M/stiffness`, and
     `ratio` is within ±15% of `M/rootLimit`.
  6. Calibration (a 62-like geometry, porters): passes, lean 2–4°. With hand carts: lean 4–6° and `peakRoot ≤ 0.8`.
  7. An ox cart without guys: `treesUprooted ≥ 1`, `status 'failed'`, `failReason 'uprooted'`, `firstUproot.type ===
     'tree_uproot'`, and a `tree_uproot` event was emitted.
  8. The same with Rope guys to the stakes: success, `|lean| < 1°`, `peakRoot < 0.5`.
  9. An uprooted tree comes to rest: all positions finite after 10 s, and the trunk lies within the clamp.
  10. Determinism: two runs give an identical summary and `sim.trees` (JSON-equal).
- **Must pass:**
  - `node tools/test-tree-anchors.js`, `node tools/test-physics.js`, `node tools/test-jungle-core.js`,
    `node tools/test-anchors.js`, `node tools/test-events.js`;
  - `node tools/verify-levels.js` (diff against the baseline: identical for every level; levels 61/62/65 may change
    only once LEVELS-RETROFIT lands);
  - `node tools/test-generator.js --quick`, `node tools/test-daily.js --node-only`.

### GOALTYPES
- **Owns:**
  - `js/features/goals.js`, `tools/gen-goals.js`, `tools/test-goals.js` (the unit and shape parts);
  - `assets/icons/badges/{stock,no_liana,no_bamboo,no_rope,no_wood,joints,trees,nostakes}.svg`;
  - the `features.goals.*` keys in `js/i18n/{en,da}/features.js`.
- **Does:** §3. Do **not** run the full gen-goals or write `goals-data.js` (the INTEGRATOR does). Prove the new types
  with `--level N --keep` worker runs on a scratch copy if needed.
- **Tests:** §3.3. The icons are valid SVG with `viewBox="0 0 64 64"` (add a check in test-goals: every `TYPES` icon,
  and every `no_<m>` in `NO_MATERIAL_ICONS`, exists as a file).
- **Must pass:** `node tools/test-goals.js` (all currently shipped goals still verify), `node tools/test-i18n.js
  --node-only`.

### UI
- **Owns:**
  - `js/features/goals-ui.js`, `css/goals.css`;
  - `js/ui/hud.js`, only for: the tile pips if they cannot be done from goals-ui, the chapter totals, the results
    `roots` row and the sim-bar roots chip;
  - `js/main.js`: `resultText` uprooted, the `tree_uproot` event, `peakRoot` into `res`, and the tree/stake tooltips;
  - `tools/e2e-goals.js`;
  - the i18n keys in §8 "UI" and the glossary line.
- **Does:** §1.6, §1.7 (HUD chip and tooltips), §2.
- **`tools/e2e-goals.js`** additions (headless):
  - tiles show teal pips (`.tile-badges` has one pip per goal, and the earned ones are filled after
    `recordBadges`);
  - the chapter header shows `.ch-challenges` with the correct `got/max`;
  - the header has one `.chal-camp-chip` that changes with the tab;
  - the build-bar button shows live pip states (build a design that meets a `live` goal and the pip turns "on track");
  - the results card title is "Challenge stars" (en) and "Udfordringsstjerner" (da);
  - existing earned badges stored under the old key count (seed `span.v1.badges` by hand and check the totals);
  - a level with 4 goals (register one at runtime) fits on a 360 px phone tile without overflow.
- **Must pass:** `node tools/e2e-goals.js`, `node tools/e2e-events.js`, `node tools/test-i18n.js`,
  `node tools/test-i18n-ui.js`, `node tools/test-mobile.js`.

### RENDER
- **Owns:**
  - `js/features/jungle-fx.js`;
  - new `assets/sprites/jungle/*.svg` (optional: `stake.svg`, `stone_footing.svg`, `root_plate.svg`);
  - `tools/test-jungle.js` (everything except the `IDS` line);
  - the `features.jungle.label.stake` key.
- **Does:** §4.
- **`tools/test-jungle.js`** additions:
  - Node part: `Model.treeBase` equals the drawn trunk base for every tree on 59–70.
  - Browser part:
    - On 63 and 67 (plain-jungle piers) `JungleFx.pierHits > 0`, and the original concrete `_drawPier` is never
      called on a jungle level (spy on it).
    - 64 still draws ruin pillars.
    - Stakes: no `_drawDeadman` body is drawn for a stake.
    - A 62 run mid-way has `sim.trees[0].lean ≠ 0` and renders without errors; an uprooted tree renders (patched level
      with an ox cart).
    - Level 24 is unchanged (no jungle hook entered).
    - Screenshots of 62 (lean), 63 (trestle), 69 (stakes) and an uprooting go to the scratchpad via `tools/shot.js`.
- **Must pass:** `node tools/test-jungle.js`, `node tools/test-ceiling.js`, `node tools/test-i18n.js`.

### LEVELS-RETROFIT
- **Owns:**
  - `tools/levels/level-61.json`, `level-62.json`, `level-65.json`, `level-68.json` (hint only);
  - `tools/solutions/level-61*.json`, `level-62*.json`, `level-65*.json`;
  - `tools/solutions/seeds/level-61-*`, `-62-*`, `-65-*`;
  - `levels.61/62/65/68.hint` in `js/i18n/{en,da}/levels.js`;
  - `js/core/levels.js` (only via `node tools/build-levels.js`).
- **Does:** §5.
- **Must pass:**
  - `node tools/verify-levels.js --only 59-68` and then the full run;
  - `node tools/test-templates.js`, `node tools/test-anchors.js`, `node tools/test-ceiling.js --no-browser`;
  - `node tools/test-i18n-content.js`, `node tools/test-tree-anchors.js`;
  - `node tools/gen-goals.js --level N --keep` for 61, 62 and 65 shows every currently shipped type still achievable,
    plus at least one design type on at least two of the three levels.

### LEVELS-NEW
- **Owns:**
  - `tools/levels/level-69.json`, `level-70.json`;
  - `tools/solutions/level-69*.json`, `level-70*.json`, `tools/solutions/seeds/level-69-*`, `-70-*`;
  - `levels.69.*`, `levels.70.*` in both languages;
  - every registration edit in the §6 table that is not marked INTEGRATOR or RENDER;
  - `js/core/levels.js` (via build-levels).
- **Does:** §6.
- **Must pass:**
  - `node tools/verify-levels.js --only 69,70` and then the full run;
  - `node tools/test-unlock.js`, `node tools/test-templates.js`, `node tools/test-anchors.js`;
  - `node tools/test-ceiling.js --no-browser`, `node tools/test-i18n-content.js`, `node tools/test-jungle.js
    --node-only`;
  - `node tools/gen-goals.js --level 69 --keep` and `--level 70 --keep` offer 3–4 goals, including a design type.
  - The e2e and e2e-events changes are checked by the INTEGRATOR's browser run.

### INTEGRATOR
- **Owns:**
  - `js/features/goals-data.js` and `tools/solutions/goals/level-59…70-*` (via **one** run of
    `node tools/gen-goals.js --only 59-70 --keep`);
  - `sw.js` (gen-precache), `js/features/about-data.js` (gen-about);
  - `SPEC.md`, `docs/*.md`, `docs/jungle/SPEC-JUNGLE.md` (the note), `README.md`, `package.json`;
  - the "Deviations" section here.
- **Runs:**
  - `npm test`, then `npm run test:browser` (`e2e`, `e2e-goals`, `e2e-events`, `test-jungle`, `test-pwa`,
    `test-mobile`, ...);
  - a final `node tools/verify-levels.js` diffed against the PHYSICS baseline (only 61, 62, 65, 69 and 70 may
    differ).
  - It fixes ownership gaps with the owning agent, and commits.
- **Checks after gen-goals:**
  - every jungle level kept its previous types (append-only; the git diff of `goals-data.js` lines 59–68 adds and
    never removes a type);
  - levels outside 59–70 are byte-identical;
  - `test-goals.js` is green.

---

## 10. Existing tests affected (summary)

| Test | Change |
|---|---|
| `verify-levels.js` | +2 levels; 61, 62, 65 re-proven; root gate; every other level identical |
| `test-goals.js` | 2–4 goals per level; new unit tests; jungle goal proofs regenerated |
| `test-unlock.js` | Jungle 59–70, finale 70 |
| `e2e.js` | Jungle Next/finale on 70; 68 meets Livingstone and is not the finale |
| `e2e-events.js` | `/ 204` → `/ 210` |
| `e2e-goals.js` | challenge-star UI checks |
| `test-jungle.js` | IDS 59–70; pier, tree and stake rendering checks |
| `test-anchors.js`, `test-ceiling.js`, `test-templates.js`, `test-daily.js`, `test-generator.js` | unchanged expectations (stakes are not land features; no template ★★★; generator untouched) |
| `test-i18n.js`, `test-i18n-content.js`, `test-i18n-ui.js` | new keys in both languages |
| `test-about.js`, `test-pwa.js`, `test-offline-tour.js` | gen-about / gen-precache (INTEGRATOR) |
| new `test-tree-anchors.js` | PHYSICS, in the NODE list of run-tests |

---

## Deviations

*(Agents record here every change from this spec: what, why, and who. Empty at the start.)*

- **PHYSICS — tree constants and lean targets (§1.3).** The starting values (8e5 / 1.2e5 / 0.25) lean an unguyed
  walkway fan so far that the deck itself snaps: both trees lean in, the mid-span joint (hung from both) drops and the
  walkway kinks there. With 8e5 the deck broke under hand carts at 6.4° and under the ox cart at 9° — long before the
  roots reached `uprootTilt` (14°), so an overload never uprooted anything. The tuned values (1.5e6 / 1.1e5 / 0.085)
  keep a plain fan passing with hand carts (deck 0.80) and make an overload uproot. Consequences: the leans are smaller
  than the table's targets (porters 1.3–1.9° instead of 2–4°, carts 2.7° instead of 4–6°), and the elastic limit
  (`rootLimit/stiffness` = 0.073 rad, 4.2°) is only just below `uprootTilt` (4.9°), so a short overload leaves at most
  a small permanent lean. Level agents who want a showier lean or an earlier uproot on one tree use the per-anchor
  overrides (`tree.stiffness`, `tree.rootLimit`, `tree.uprootTilt`).
- **PHYSICS — plastic set.** The roots are elastic-plastic with a permanent set: once the root moment reaches
  `rootLimit`, the spring's rest direction moves with the trunk (an extra `trThP` array), so the tree keeps the
  yielded lean after the load goes. The uproot check still measures from the original rest direction `th0`, and
  `sim.trees[].lean` is measured from `th0` too.
- **PHYSICS — guyed lean < 1° (§9 test 8)** is checked on the steady lean and at the end of the run. The peak while the
  ox cart passes right under the guyed tree is 1.07° on the walkway fan (the test allows 1.25°).
- **PHYSICS — test-tree-anchors.js** uses a test-only deck material (`tt_deck`: a walkway that does not snap) for the
  ox-cart uproot, guyed and rest tests, so the roots are what fails. It also runs the same checks on the real walkway
  deck.
- **PHYSICS — verify-levels `--verbose`** prints `root <peakRoot>` at the end of the verbose JSON line (levels with
  flexible trees only), not as a new table column. That keeps the output for every other level byte-identical.
- **PHYSICS — i18n:** the failure-reason keys (`results.title.uprooted`, `results.fail.uprooted`,
  `results.fail.uprootedStake`) were already added by UI in en + da, so PHYSICS added no keys.
- **LEVELS-RETROFIT — 65 budget 2450 → 3050 (+24 %, over the §5 cap of +15 %).** With default trees an unguyed
  hung walkway on 65 cannot pass: the old reference uproots the near tree (4.9°), the old best (an all-liana fan)
  droops until a hand cart falls, and Liana guys snap (8 kN). Rope guys to both stakes are required, and the cheapest
  passing design (all-liana fan + 2 Rope guys, $2108) is above the old ★★★ line (1715) and above the line after a
  +15 % raise (1972). 3050 keeps ★★★ reachable at 69 %. Reference = old reference + Rope guys ($2576, 0.84, peak
  0.72, root 0.19, lean 0.8°). This is the level where the guy rope is genuinely needed. The trees keep `"tree": {}`
  (no overrides): per-anchor scaling to the 10 m trunk (2.3e6 / 1.4e5) would let the old unguyed fans pass and make
  the guy pointless.
- **LEVELS-RETROFIT — 62 budget 2250 → 2350 (+4.4 %).** The shipped `penny` (offered only when some design is at
  ≤ 62 % of budget) could no longer be proven: the old cheap proof (one tree carrying four hangers) uproots, and every
  balanced fan at ≤ $1395 droops. The cheapest passing balanced fan (seed `level-62-penny.json`, $1438, peak 0.97) is
  61 % of 2350, so `penny` stays with ratio 0.65. Reference = the old best fan with Rope on the two centre hangers
  ($2022, 0.86, lean 2.6°, root 0.63; the clear-lean reference); best = the old best, unchanged ($1486, lean 2.6°).
  The old bamboo-arch reference is kept as seed `level-62-arch.json`, and `level-62-guyed.json` (fan + Rope guys,
  lean 0.6°, peak 0.69) shows what guying buys.
- **LEVELS-RETROFIT — 61** keeps its reference and best (both pass unchanged: lean 1.2°, root 0.29; most of the load
  goes to the rigid mid-river giant), so its lean is below the 2–6° target. Seed `level-61-guyed.json` (best + Rope
  guys) drops the peak from 0.77 to 0.47, which is what makes the guy useful there (`cool_head` 0.5).
- **LEVELS-RETROFIT — gen-goals --keep (worker runs, results not written to goals-data.js):** 61 keeps penny 0.6,
  cool_head 0.5, minimalist 16 and gains `no_material` rope; 62 keeps penny 0.65, minimalist 16 → 17, featherweight
  710 → 720 and gains `no_material` rope; 65 keeps minimalist 18 → 21 (the guys add members) and featherweight 810 →
  860, with no design type offered (Rope guys and Liana hangers are both needed, no bolts or stakes can be dropped).
  The worker-written proofs for 61/62/65 were restored to HEAD; the INTEGRATOR's `--only 59-70 --keep` run writes them.
- **LEVELS-NEW — 69 Guy Ropes: per-tree overrides `{ "stiffness": 6e5, "rootLimit": 3.2e4 }` on both trees.** With the
  default trees (24 m gap, 9 m trunks) an unguyed liana fan passes with hand carts (root 0.41), so the guy would be
  pointless. With the overrides the unguyed fan yields at ≈ 3° and is **uprooted** at 4.9° (`uprootTilt` default,
  ≈ 43 s, when the hand carts are on; a deck joint cracks ≈ 0.5 s before, as PHYSICS noted), Liana guys snap (8 kN) and
  the tree is uprooted anyway, and Rope guys pass (lean 0.3–0.5°, root 0.13–0.18). The "6°+" lean of the §6 table is
  not reachable: the uproot tilt is 4.9°. Budget 2050, timeLimit 80. Reference = 8-hanger liana fan with the 8 m / 16 m
  joints hung from both trees + Rope guys ($1684, 0.82, peak 0.55, root 0.13); best = 5-hanger liana fan + Rope guys
  ($1426, 0.70, peak 0.59, root 0.18). A shallow Bamboo truss under the deck from the two road ends passes without the
  trees at ≈ $1420–1470 (seed `level-69-nostakes.json`, depth 1.5 m, $1470, peak 0.76), so ★★★ is reachable both ways;
  the budget is set so the taught design (guyed fan) also earns it. gen-goals worker: symmetric, penny 0.6, cool_head
  0.5, `no_material` liana (also achievable: minimalist, featherweight, stock, no_stakes).
- **LEVELS-NEW — 70 The Leaning Kapok: tree values and hint.** a4 keeps the leaning geometry (`baseX −3`, `baseY 0`,
  stiffness 1.1e6) but `rootLimit 8e4` (not 1.6e5), and a5 gets `{ "stiffness": 8e5, "rootLimit": 5e4 }`: with the
  §6 values the cheapest design (walkway deck on a Bamboo truss, hung from both trees) passed **unguyed** and cheaper
  than guyed, so the finale would not need a guy. Now the same design unguyed is uprooted (≈ 52 s, ox cart), guyed it
  passes (root ≈ 0.32). A walkway deck in 4 m panels cannot carry the ox cart on hangers alone (the walkway snaps in
  bending between hangers), so both solutions stiffen the deck with a 3 m deep Bamboo Howe truss underneath (verticals
  at every deck joint, diagonals 5.0 m = Bamboo's max length). Bamboo props from the cliff bolts were tried and always
  buckle (20 kN) before helping, so the last hint sentence was changed from "Bamboo props from the cliff bolts take
  some of the weight off." to "A Bamboo truss under the deck spreads the weight of the cart." (da: "En gitterdrager af
  bambus under gangbroen fordeler kærrens vægt."). Budget 4900, timeLimit 100. Reference = full liana fan (8 hangers,
  Rope at 28 m) + truss + Rope guys ($3745, 0.76, peak 0.70, root 0.31); best = 6 hangers + truss + Rope guys ($3386,
  0.69, peak 0.96, root 0.32). Seed `level-70-noliana.json` (Rope hangers, $4566). gen-goals worker: penny 0.65,
  minimalist, featherweight, `no_material` liana (no cool_head: no design under peak 0.6; symmetric is trivial).
- **LEVELS-NEW — gen-goals.js fix (GOALTYPES-owned file, one-line change in `workerMain`).** For a new level the old
  rules picked 3 types from *all* achievable types, design types included (they have no `PRIORITY`, so they sort
  arbitrarily), and then filtered the design types out, which left 70 with only `penny` + `no_material` (2 goals).
  `choose()` now only sees the classic types; `appendDesign` adds the design type afterwards as specified. Only the
  no-`--keep` / no-shipped-goals path changes, which in this release is only 69 and 70.
- **LEVELS-NEW — e2e.js:** 68 is checked as "passes, Livingstone met, no finale, Next leads on"; a new check plays 70's
  best (59–69 seeded as done) and expects the Jungle finale, its banner and "All levels". Screenshot `48-jungle-finale`
  is now `48-jungle-livingstone` plus `49-jungle-finale`.
- **INTEGRATOR — goals regenerated for every level, not only 59–70 (§3.2 "scope").** The integration task asked for
  the new challenge types to appear across the game wherever they are proven, so `node tools/gen-goals.js --keep` ran
  on all 102 levels. To keep every shipped goal exactly as players know it, `--keep` now keeps a shipped goal
  **byte-identical** (same threshold, same proof file) whenever its stored proof still passes the level and still earns
  it, and only re-derives the threshold when it does not. Result: no type removed anywhere and no threshold changed
  outside 62 and 65 (whose physics changed: 62 minimalist 16 → 17, featherweight 710 → 720; 65 minimalist 18 → 21,
  featherweight 810 → 860; 61's `cool_head` keeps 0.5 with a new proof). Every proof file outside 61, 62 and 65 is
  unchanged; 67 design goals were appended to levels that had room (most often `no_material` wood or rope, `stock` on
  cable/steel on a few big road, rail and famous levels, `stock` bamboo 7 m on 63, `no_material` bamboo on 68). 275 →
  350 goals on 102 levels.
- **INTEGRATOR — 69 and 70 get 2 classic + 2 design challenges (not 3 + 1).** For a new jungle level with at least two
  provable design types, `choose()` picks 2 classic types and `appendDesign` adds 2 design types, trying the tree/stake
  types (`trees_only`, `no_stakes`) first. 69: symmetric, penny 0.6, `no_stakes` (Free Standing: the Bamboo truss
  route without guys) and `no_material` liana. 70: penny 0.65, minimalist 39, `no_material` liana and `stock` rope
  10 m. No `trees_only` is offered on 69/70: 69 has no cliff bolts, and on 70 no passing design avoided them.
- **INTEGRATOR — 65 and 66 keep 2 challenges.** No design type is provable on them (65: see LEVELS-RETROFIT; 66:
  none achievable), and the append-only rule forbids replacing a shipped type.
- **REVIEW — uprooted results text (§1.6).** A walkway on an unguyed tree kinks a fraction of a second before the roots
  let go (69 without its guys: deck breaks at 42.7 s, the tree uproots at 43.1 s), so "break before uproot" appended
  a misleading walkway-spacing tip. `resultText` now explains a first break only when it came more than
  `UPROOT_LEAD` (1.5 s) before the first uproot.
- **REVIEW — temple stone is sandstone.** The `jungle_temple` ruin pillars (`ruin_pillar.svg`, `ruin_cap.svg`), the
  temple abutment stones and the level-tile thumbnail pillars were a grey close to the concrete `#c4c6c4`. They are now
  a weathered sandstone matching the painted temple, so no jungle pillar reads as concrete (the user's request).
- **REVIEW — phone portrait.** The level-select header showed both teal totals and overflowed at 390 px; on phone
  portrait only the active campaign's chip is shown (the global total stays on the title screen). The level bar's
  four pips stack 2 x 2 there, so the cost readout no longer runs into the hint button.
