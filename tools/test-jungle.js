#!/usr/bin/env node
// jungle visuals (js/features/jungle-fx.js, docs/jungle/SPEC-JUNGLE.md §4).
//   Node part:    themes and sprite tables are well-formed (every sprite file exists, every traffic type has a meta entry
//                 whose width is def.length * 100), cameo() is deterministic, jungle levels use no land features and
//                 keep the build ceiling clear.
//   Browser part: (headless Chromium via playwright, never a visible window) every jungle level draws in edit mode and
//                 in sim mode without errors or failed sprites, no ship on jungle themes, canoes on water levels, the
//                 finale shows Stanley's greeting and Livingstone's reply, ?livingstone=1 shows the cameo, and a
//                 non-jungle level never enters a jungle hook.
// Usage: node tools/test-jungle.js [--node-only | --browser-only]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { BG } = require('./harness');
const load = (rel) => require(path.join(ROOT, rel));
load('js/render/effects.js');
load('js/render/renderer.js');
load('js/features/jungle-figures.js');
load('js/features/jungle-fx.js');
const Fx = BG.JungleFx;

let pass = 0, fail = 0;
const ok = (c, msg, info) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + msg + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } };
const section = (s) => console.log('- ' + s);
const args = process.argv.slice(2);
const NODE = args.indexOf('--browser-only') < 0, BROWSER = args.indexOf('--node-only') < 0;
const IDS = [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
const jungleLevels = () => BG.Levels.filter(L => IDS.indexOf(L.id) >= 0);
const sol = (n, kind) => {
  const f = path.join(__dirname, 'solutions', 'level-' + String(n).padStart(2, '0') + (kind ? '-' + kind : '') + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

if (NODE) {
  section('themes, sprites and traffic tables');
  ok(!!Fx, 'BG.JungleFx exists');
  for (const id of ['jungle', 'jungle_temple']) {
    const T = BG.Renderer.THEMES[id];
    ok(!!T && T.sky.length === 3 && T.layers.length === 3 && T.water.length === 3 && !!T.ground && T.ships === false && T.props === id, id + ': theme is well-formed and registered');
    ok(T && T.lights === 0 && T.night === 0 && T.ambient === 'birds', id + ': no lights, day, birds');
  }
  section('animated figures: planted feet, every pose draws');
  {
    const F = BG.JungleFigures, C = 1.3;
    ok(!!F && typeof F.human === 'function' && typeof F.monkey === 'function', 'BG.JungleFigures exists');
    // during stance the foot moves back exactly as far as the body moves forward (phase advances by dist / C)
    let slide = 0;
    for (let p = 0; p < 0.49; p += 0.01) slide = Math.max(slide, Math.abs((F.foot(p + 0.01, C, 0.1, 0.5).x - F.foot(p, C, 0.1, 0.5).x) + 0.01 * C));
    ok(slide < 1e-9 && F.foot(0.2, C, 0.1, 0.5).y === 0, 'a stance foot stays planted on the deck', slide);
    ok(F.foot(0.75, C, 0.1, 0.5).y > 0.09, 'the swing foot lifts');
    const k = F.ik(0, 0.9, 0.2, 0.06, 0.44, 0.43, 1);
    ok(k.x > 0.1 && Math.abs(Math.hypot(k.x, k.y - 0.9) - 0.44) < 1e-9, 'knees bend forward, bones keep their length', k);
    const noop = function () {};
    const ctx = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }) }, { get: (o, n) => n in o ? o[n] : noop, set: () => true });
    let threw = null;
    try {
      for (let p = 0; p < 1; p += 0.125) for (const w of [0, 0.5, 1]) {
        F.human(ctx, { p, w, load: 'basket', arms: 'carry' }); F.human(ctx, { p, w, hat: 'pith', beard: '#eee', stick: true });
        F.human(ctx, { p, w, arms: 'push', hand: { x: 0.4, y: 0.77 }, lean: 0.35 }); F.human(ctx, { p, w, fall: true, t: p * 3 });
        F.monkey(ctx, { p, w }); F.monkey(ctx, { p, w, fall: true, t: p });
      }
    } catch (e) { threw = e.message; }
    ok(!threw, 'porters, Livingstone, the cart pusher and monkeys draw in every pose', threw);
  }
  const dir = path.join(ROOT, 'assets', 'sprites', 'jungle');
  for (const n in Fx.SPRITES) {
    const f = path.join(dir, n + '.svg');
    if (!fs.existsSync(f)) { ok(false, 'sprite file exists: ' + n + '.svg'); continue; }
    const m = /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/.exec(fs.readFileSync(f, 'utf8'));
    ok(m && +m[3] === Fx.SPRITES[n][0] && +m[4] === Fx.SPRITES[n][1], n + '.svg: viewBox matches the sprite table', m && m.slice(3, 5));
    ok(BG.Sprites.names.indexOf('jungle/' + n) >= 0 && !!BG.Sprites.meta['jungle/' + n], n + ': preloaded and in the meta table');
  }
  for (const t in Fx.TYPES) {
    const def = BG.Vehicles[t], meta = BG.Sprites.meta[t];
    ok(!!def && !!meta, t + ': a vehicle def and a sprite meta entry');
    ok(def && meta && Math.abs(meta.w - def.length * 100) < 1e-6, t + ': sprite width = def.length x 100', [meta && meta.w, def && def.length]);
    ok(def && BG.Renderer.drawnHeight(t) > 0, t + ': drawnHeight is known', def && BG.Renderer.drawnHeight(t));
  }

  section('trees: the drawn trunk base is Model.treeBase; poses are rigid turns about it');
  {
    let n = 0;
    for (const L of jungleLevels()) (L.anchors || []).forEach((a, i) => {
      if (a.deco !== 'tree') return;
      n++;
      const b = Fx.treeBase(L, i), mb = BG.Model.treeBase ? BG.Model.treeBase(L, i) : null;
      ok(isFinite(b.x) && isFinite(b.y), L.id + ' a' + i + ': tree base is finite', b);
      if (mb) ok(Math.abs(b.x - mb.x) < 1e-9 && Math.abs(b.y - (mb.y - 0.3)) < 1e-9, L.id + ' a' + i + ': drawn base = Model.treeBase (sunk 0.3 m)', [b, mb]);
      const rest = Fx.treePose(L, a, i, null, null), live = Fx.treePose(L, a, i, null, { x: a.x + 0.4, y: a.y - 0.02, ratio: 0.5 });
      ok(rest.delta === 0 && Math.abs(rest.top.x - rest.top0.x) < 1e-9, L.id + ' a' + i + ': rest pose has no turn');
      ok(live.delta < 0 && live.top.x > rest.top.x, L.id + ' a' + i + ': a joint pulled to +x turns the crown to +x', live.delta);
    });
    ok(n >= 1, 'tree anchors exist on the jungle levels (' + n + ')');
    ok(Fx.liveTrees({ _jst: null }) === null && Fx.liveTrees({ _jst: { mode: 'edit', sim: { trees: [{ anchor: 0, x: 0, y: 0 }] } } }) === null && !!Fx.liveTrees({ _jst: { mode: 'sim', sim: { trees: [{ anchor: 0, x: 0, y: 0 }] } } }), 'live trees only in sim / results');
  }

  section('cameo is deterministic');
  {
    const L = { id: 61, theme: 'jungle' }, fin = { id: 68, theme: 'jungle_temple', jungle: { livingstone: 'finale' } };
    const got = [];
    for (let n = 0; n < 60; n++) got.push(Fx.cameo(L, { nDesignBeams: n }) ? 1 : 0);
    const again = [];
    for (let n = 0; n < 60; n++) again.push(Fx.cameo(L, { nDesignBeams: n }) ? 1 : 0);
    ok(JSON.stringify(got) === JSON.stringify(again), 'same inputs, same answer');
    ok(got.reduce((a, b) => a + b, 0) >= 7 && got.reduce((a, b) => a + b, 0) <= 10, 'about one bridge in seven', got.join(''));
    ok(Fx.cameo(L, { nDesignBeams: 1 }) === ((61 + 1) % 7 === 0), 'rule: (level.id + nDesignBeams) % 7 === 0');
    ok(!Fx.cameo(fin, { nDesignBeams: 2 }) && !Fx.cameo({ id: 24, theme: 'meadow' }, { nDesignBeams: 4 }), 'never on the finale or on other themes');
  }

  section('jungle levels: no land features, clear build ceiling');
  {
    const Ls = jungleLevels();
    ok(Ls.length >= 1, 'jungle levels exist (' + Ls.length + ')');
    for (const L of Ls) {
      ok(L.theme === 'jungle' || L.theme === 'jungle_temple', L.id + ': jungle theme');
      ok(!BG.Model.hasLandFeatures(L), L.id + ': no land features');
      const deck = Math.max(L.terrain.leftY, L.terrain.rightY);
      ok(L.buildArea.y1 >= deck + 5.01 - 1e-9, L.id + ': buildArea.y1 clears the deck by 5.01 m', [L.buildArea.y1, deck]);
      ok(!L.terrain.ceiling, L.id + ': no terrain.ceiling');
      ok(!(L.pierZones || []).some(z => z.ground), L.id + ': no ground pier zones');
    }
  }
}

async function browserPart() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('  (playwright not available: browser part skipped)'); return; }
  const url = require('url');
  const HREF = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
  const browser = await require('./browser').launch(chromium);
    try {
    section('every jungle level draws in edit mode and in sim mode');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      page.on('console', m => { if (m.type() === 'error' || /\[jungle-fx\]|\[i18n\]/.test(m.text())) errs.push(m.text()); });
      await page.goto(HREF + '?unlockall&noresume');
      await page.waitForTimeout(1200);
      const res = await page.evaluate(async ([ids, designs]) => {
        const out = [];
        const g = BG.Game, frame = g._frame;
        g._frame = function () {};
        for (const id of ids) {
          const L = BG.Levels.find(l => l.id === id);
          if (!L) continue;
          g.openLevel(id, { force: true, skipCard: true });
          const r = g.renderer;
          for (let i = 0; i < 3; i++) r.render({ mode: 'edit', level: L, design: g.design, editorState: g.editor && g.editor.state, dt: 1 / 60 });
          const rec = { id, ships: r.theme.ships, theme: r.themeId, canoes: BG.JungleFx.canoes, wet: L.terrain.waterY !== null && L.terrain.waterY !== undefined, simmed: false };
          const d = designs[id];
          if (d) {
            g._replaceDesign(d);
            g.setFollow(false); g._lastToggle = -1e9; g.startSim();
            let t = performance.now();
            for (let i = 0; i < 40; i++) { t += 100; frame.call(g, t); }
            rec.simmed = true; rec.status = g.sim && g.sim.status;
          }
          out.push(rec);
        }
        g._frame = frame;
        const failed = Object.keys(BG.Sprites.failed || {}).filter(n => n.indexOf('jungle/') === 0);
        return { out, failed };
      }, [IDS, Object.fromEntries(IDS.map(id => [id, sol(id, 'best')]).filter(e => e[1]))]);
      ok(res.out.length >= 1, 'jungle levels rendered (' + res.out.length + ')');
      ok(res.out.every(r => r.ships === false && (r.theme === 'jungle' || r.theme === 'jungle_temple')), 'jungle themes with ships off', res.out.map(r => r.theme + ':' + r.ships));
      ok(res.failed.length === 0, 'no jungle sprite failed to load', res.failed);
      ok(res.out.some(r => r.simmed), 'some levels were rendered in sim mode');
      ok(errs.length === 0, 'no page errors or warnings', errs.slice(0, 3));
      const wetL = res.out.filter(r => r.wet);
      ok(wetL.length === 0 || res.out.some(r => r.wet && r.canoes > 0), 'canoes on the water levels');
      await page.close();
    }

    section('finale: Stanley greets, Livingstone replies, the meeting is recorded');
    // the real finale when level 68 and its best solution exist, else level 59 turned into a finale in the page
    const real = !!sol(68, 'best') && jungleLevels().some(L => L.id === 68);
    const fin = real ? { id: 68, design: sol(68, 'best') } : { id: 59, design: sol(59, 'best'), patch: true };
    if (!fin.design || !jungleLevels().some(L => L.id === fin.id)) console.log('  (no level or solution to run the finale on: skipped)');
    else {
      if (!real) console.log('  (level 68 or its best solution is missing: checked on level 59 patched into a finale)');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(HREF + '?level=' + fin.id + '&unlockall&noresume');
      await page.waitForTimeout(1400);
      const r = await page.evaluate(([f]) => {
        const g = BG.Game, frame = g._frame;
        g._frame = function () {};
        if (f.patch) {
          const L = BG.Levels.find(l => l.id === f.id);
          L.traffic = [{ type: 'livingstone', count: 1, interval: 3 }]; L.jungle = { canoes: 1, livingstone: 'finale' }; L.timeLimit = 70;
          g.openLevel(f.id, { force: true, skipCard: true });
        }
        if (BG.Famous && BG.Famous.card && BG.Famous.card.open) { const b = document.querySelector('[data-fb=build]'); if (b) b.click(); }
        try { localStorage.removeItem('span.v1.jungle.livingstone'); } catch (e) { /* ignore */ }
        g._replaceDesign(f.design);
        g.setFollow(false); g._lastToggle = -1e9; g.startSim();
        let t = performance.now(), n = 0;
        while (g.sim && g.sim.status === 'running' && n < 4000) { t += 100; frame.call(g, t); n++; }
        g._frame = frame; // the results card follows on the real clock
        return { status: g.sim && g.sim.status };
      }, [fin]);
      await page.waitForTimeout(2500);
      Object.assign(r, await page.evaluate(() => {
        let met = null; try { met = localStorage.getItem('span.v1.jungle.livingstone'); } catch (e) { /* ignore */ }
        return { lm: BG.JungleFx.lastMeeting, shown: BG.JungleFx.shown, met };
      }));
      ok(r.status === 'success', 'the finale run passes', r.status);
      ok(r.lm && r.lm.level === fin.id && r.lm.replyAt > r.lm.greetAt, 'lastMeeting is set', r.lm);
      ok((r.shown['features.jungle.livingstone.greet'] || 0) > 0 && (r.shown['features.jungle.livingstone.reply'] || 0) > 0, 'the greeting and the reply bubbles were shown', r.shown);
      ok(r.met === '1', 'the once-per-profile flag is stored', r.met);
      ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
      await page.close();
    }

    section('?livingstone=1 shows the cameo on a passed run of 59');
    {
      const best59 = sol(59, 'best');
      if (!best59 || !jungleLevels().some(L => L.id === 59)) console.log('  (level 59 or its best solution is missing: cameo check skipped)');
      else {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        await page.goto(HREF + '?level=59&unlockall&noresume&livingstone=1');
        await page.waitForTimeout(1400);
        const r = await page.evaluate(([design]) => {
          const g = BG.Game, frame = g._frame;
          g._frame = function () {};
          g._replaceDesign(design);
          g.setFollow(false); g._lastToggle = -1e9; g.startSim();
          let t = performance.now(), n = 0;
          while (g.sim && g.sim.status === 'running' && n < 3000) { t += 100; frame.call(g, t); n++; }
          for (let i = 0; i < 25; i++) { t += 100; frame.call(g, t); }
          return { status: g.sim && g.sim.status, shown: BG.JungleFx.shown, force: BG.JungleFx.forceCameo };
        }, [best59]);
        ok(r.force === true, 'the URL flag is read');
        ok(r.status === 'success' && (r.shown['features.jungle.livingstone.cameo'] || 0) > 0, 'the cameo bubble was shown after the pass', r);
        ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
        await page.close();
      }
    }

    section('timber piers, stakes, bending and uprooting trees (headless)');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      page.on('console', m => { if (m.type() === 'error' || /[jungle-fx]/.test(m.text())) errs.push(m.text()); });
      await page.goto(HREF + '?unlockall&noresume');
      await page.waitForTimeout(1200);
      const r = await page.evaluate(([d62, best67]) => {
        const g = BG.Game, frame = g._frame, Fx = BG.JungleFx, out = {};
        g._frame = function () {};
        const R = () => g.renderer;
        const edit = (L, design) => { for (let i = 0; i < 2; i++) R().render({ mode: 'edit', level: L, design, editorState: g.editor && g.editor.state, dt: 1 / 60 }); };
        const open = (id) => { g.openLevel(id, { force: true, skipCard: true }); return BG.Levels.find(l => l.id === id); };
        let spy = 0; const orig = BG.Renderer.prototype._drawPier; BG.Renderer.prototype._drawPier = function () { spy++; return orig.apply(this, arguments); };
        const kinds = () => JSON.stringify(Fx.pierKinds);
        // plain jungle: a trestle (tall pier) and a crib (short pier), and the edit ghost / invalid look
        for (const id of [63, 67]) {
          const L = open(id), z = L.pierZones[0], x = (z.x0 + z.x1) / 2, fy = L.terrain.floorY;
          const h0 = Fx.pierHits;
          edit(L, { nodes: [], beams: [], piers: [{ x, topY: fy + 8 }] });
          edit(L, { nodes: [], beams: [], piers: [{ x, topY: fy + 2.2 }] });
          const ctx = R().ctx || R().canvas.getContext('2d');
          R()._worldXf(ctx, 0, 0);
          R()._drawPierItem(ctx, { x, baseY: fy, topY: fy + 6 }, true, false); R()._drawPierItem(ctx, { x, baseY: fy, topY: fy + 6 }, true, true);
          out['hits' + id] = Fx.pierHits - h0;
        }
        out.kinds = JSON.parse(kinds());
        out.concrete = spy;
        // the temple keeps its ruin pillar
        { const L = open(64), z = L.pierZones && L.pierZones[0], pk = Fx.pierKinds.pillar; if (z) edit(L, { nodes: [], beams: [], piers: [{ x: (z.x0 + z.x1) / 2, topY: L.terrain.floorY + 6 }] }); out.pillar = Fx.pierKinds.pillar - pk; out.hasZone64 = !!z; }
        out.concrete2 = spy;
        // stakes and bending trees on 62 patched with flexible trees and stakes
        { const L = BG.Levels.find(l => l.id === 62);
          L.anchors[4].tree = {}; L.anchors[5].tree = {};
          L.anchors.push({ x: -5, y: 0, deco: 'stake' }, { x: 37, y: 0, deco: 'stake' });
          open(62);
          
          const s0 = Fx.stakes; edit(L, g.design);
          out.stakes = Fx.stakes - s0;
          g._replaceDesign(d62); g.setFollow(false); g._lastToggle = -1e9; g.startSim();
          let t = performance.now(); for (let i = 0; i < 30; i++) { t += 100; frame.call(g, t); }
          out.lean = g.sim.trees && g.sim.trees[0] ? g.sim.trees[0].lean : null; out.bent = Fx.treesBent; out.status = g.sim.status;
          // an uprooted tree: weak roots
          L.anchors[4].tree = { rootLimit: 1.5e4 }; L.anchors[5].tree = { rootLimit: 1.5e4 };
          open(62); g._replaceDesign(d62); g.setFollow(false); g._lastToggle = -1e9; g.startSim();
          t = performance.now(); for (let i = 0; i < 60 && g.sim.status === 'running'; i++) { t += 100; frame.call(g, t); }
          for (let i = 0; i < 20; i++) { t += 100; frame.call(g, t); }
          out.uprooted = g.sim.status === 'failed' && g.sim.failReason === 'uprooted'; out.up = Fx.treeUp;
        }
        // level 24 (not jungle) is unchanged
        { const L = open(24); const h = Fx.hits, pk = JSON.stringify(Fx.pierKinds); edit(L, g.design); out.l24 = Fx.hits === h && JSON.stringify(Fx.pierKinds) === pk; }
        BG.Renderer.prototype._drawPier = orig;
        g._frame = frame;
        return out;
      }, [sol(62, 'best'), null]);
      ok(r.hits63 > 0 && r.hits67 > 0, 'plain-jungle pier levels draw timber piers (63, 67)', r);
      ok(r.kinds.trestle > 0 && r.kinds.crib > 0, 'a tall pier is a trestle and a short one a crib', r.kinds);
      ok(r.concrete === 0 && r.concrete2 === 0, 'the concrete _drawPier is never called on a jungle level', [r.concrete, r.concrete2]);
      ok(!r.hasZone64 || r.pillar > 0, 'level 64 still draws ruin pillars', r.pillar);
      ok(r.stakes > 0, 'stakes are drawn as pegs (' + r.stakes + ')');
      ok(r.status !== undefined && r.lean !== 0 && r.lean !== null && r.bent > 0, 'a 62 run has leaning, bent trees', [r.lean, r.bent, r.status]);
      ok(r.uprooted && r.up > 0, 'an uprooted tree fails the run and renders', [r.uprooted, r.up]);
      ok(r.l24, 'level 24 enters no jungle hook');
      ok(errs.length === 0, 'no page errors', errs.slice(0, 3));
      await page.close();
    }

    section('other themes never enter a jungle hook (level 24: edit, sim, results)');
    {
      const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(HREF + '?level=24&unlockall&noresume');
      await page.waitForTimeout(1400);
      const r = await page.evaluate(([design]) => {
        const g = BG.Game, frame = g._frame;
        g._frame = function () {};
        if (BG.Famous && BG.Famous.card && BG.Famous.card.open) { const b = document.querySelector('[data-fb=build]'); if (b) b.click(); }
        const h0 = BG.JungleFx.hits;
        const R = g.renderer;
        for (let i = 0; i < 5; i++) R.render({ mode: 'edit', level: g.level, design: g.design, editorState: g.editor && g.editor.state, dt: 1 / 60 });
        if (design) { g._replaceDesign(design); g.setFollow(false); g._lastToggle = -1e9; g.startSim(); let t = performance.now(); for (let i = 0; i < 60; i++) { t += 100; frame.call(g, t); } }
        return { hits: BG.JungleFx.hits - h0, ships: R.theme.ships, theme: R.themeId, simmed: !!design };
      }, [sol(24, 'best') || sol(24)]);
      ok(r.hits === 0 && r.ships !== false && r.theme !== 'jungle', 'no jungle hook ran and the ship stays on level 24', r);
      ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
      await page.close();
    }
  } finally { await browser.close(); }
}

(async () => {
  if (BROWSER) {
    try { await browserPart(); } catch (e) { ok(false, 'browser part crashed: ' + e.message); }
  }
  console.log(pass + '/' + (pass + fail) + ' jungle checks passed');
  process.exit(fail ? 1 : 0);
})();
