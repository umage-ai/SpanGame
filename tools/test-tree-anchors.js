#!/usr/bin/env node
// SPAN — flexible tree anchors and ground stakes (docs/challenges/SPEC-CHALLENGES.md §1), headless, no rendering:
// the Model API (treeSpec / treeBase / stakes / bolts), the root spring (lean under load, elastic-plastic roots,
// uprooting -> failReason 'uprooted'), guy ropes to stakes, the sim.trees readout, determinism, and that levels
// without `tree` fields run exactly the old code path.
// Usage: node tools/test-tree-anchors.js [filter]
'use strict';
const fs = require('fs');
const path = require('path');
const { BG, runHeadless } = require('./harness');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const DEG = 180 / Math.PI;
const M = BG.Model, TA = BG.TreeAnchor;

// a deck material that only the uproot tests use: a walkway that does not snap, so the roots are what fails
BG.Materials.tt_deck = Object.assign({}, BG.Materials.walkway, { id: 'tt_deck', tensionLimit: 4e5, compressionLimit: 4e5, momentLimit: 2.5e4 });

// ------------------------------------------------------------------ helpers
// a 62-like canopy: 32 m gap, cliff bolts, flexible trees 8 m up on both bank edges, stakes 5 m behind them
function canopy(traffic, extra) {
  return Object.assign({
    id: 901, name: 'canopy', hint: '', theme: 'jungle',
    terrain: { leftEdge: 0, leftY: 0, rightEdge: 32, rightY: 0, floorY: -14, waterY: -6 },
    anchors: [{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 0, y: -4 }, { x: 32, y: -4 },
      { x: 0, y: 8, deco: 'tree', tree: {} }, { x: 32, y: 8, deco: 'tree', tree: {} },
      { x: -5, y: 0, deco: 'stake' }, { x: 37, y: 0, deco: 'stake' }],
    pierZones: [], maxPiers: 0, noBuild: [], buildArea: { x0: 0, x1: 32, y0: -6, y1: 14 },
    materials: ['walkway', 'bamboo', 'liana', 'rope'], budget: 1e9, traffic: traffic || [], timeLimit: 120, templates: false,
  }, extra || {});
}
// a walkway deck in 4 m segments, every deck joint hung by `hang` from the nearer tree (mid-span from both),
// optionally guyed from each tree back to the stake behind it
function fan(opt) {
  opt = opt || {};
  const deck = opt.deck || 'walkway', hang = opt.hang || 'rope';
  const d = { nodes: [], beams: [], piers: [] }, ids = ['a0'];
  for (let i = 1; i < 8; i++) { d.nodes.push({ id: 'n' + i, x: 4 * i, y: 0 }); ids.push('n' + i); }
  ids.push('a1');
  for (let i = 0; i < 8; i++) d.beams.push({ a: ids[i], b: ids[i + 1], m: deck });
  for (let i = 1; i <= 4; i++) d.beams.push({ a: 'a4', b: ids[i], m: hang });
  for (let i = 4; i <= 7; i++) d.beams.push({ a: 'a5', b: ids[i], m: hang });
  if (opt.guy) { d.beams.push({ a: 'a6', b: 'a4', m: opt.guy }); d.beams.push({ a: 'a7', b: 'a5', m: opt.guy }); }
  return d;
}
const PORTERS = [{ type: 'walker', count: 6, interval: 1.5 }];
const CARTS = [{ type: 'walker', count: 6, interval: 1.5 }, { type: 'handcart', count: 2, interval: 3 }];
const OX = [{ type: 'oxcart', count: 1, interval: 3 }];

// run to the end (or maxTime), tracking the largest |lean| and the uproot events
function run(level, design, opts) {
  opts = opts || {};
  let maxLean = 0;
  const ev = [];
  const sim = new BG.Simulation(level, design, { seed: 1 });
  const n = Math.ceil((opts.maxTime || level.timeLimit + 0.5) * 60 - 1e-6);
  for (let i = 0; i < n && (opts.keepRunning || sim.status === 'running'); i++) {
    sim.step();
    for (const e of sim.drainEvents()) if (e.type === 'tree_uproot') ev.push(e);
    for (const t of sim.trees) if (Math.abs(t.lean) > maxLean) maxLean = Math.abs(t.lean);
  }
  return { sim, s: sim.summary(), maxLean, uproots: ev };
}
// trunk angle from vertical (pylon convention: + = toward -x)
function trunkAngle(t) { return Math.atan2(-(t.x - t.baseX), t.y - t.baseY); }

// ------------------------------------------------------------------ 1. opt-in
test('1. no tree field: nTree 0, sim.trees [], no new summary keys; a deco tree without `tree` stays fixed', () => {
  const L = canopy(PORTERS);
  L.anchors[4] = { x: 0, y: 8, deco: 'tree' }; L.anchors[5] = { x: 32, y: 8, deco: 'tree' };
  const r = run(L, fan());
  assert(r.sim.nTree === 0, 'nTree ' + r.sim.nTree);
  assert(Array.isArray(r.sim.trees) && r.sim.trees.length === 0, 'sim.trees not []');
  for (const k of ['peakRoot', 'treesUprooted', 'firstUproot']) assert(!(k in r.s), 'summary has ' + k);
  const k4 = r.sim.nodeIndex.get('a4');
  assert(r.sim.nodes[k4].fixed && r.sim.w[k4] === 0, 'rigid tree anchor is not fixed');
  assert(r.sim.nodes[k4].x === 0 && r.sim.nodes[k4].y === 8, 'rigid tree anchor moved');
  assert(r.s.status === 'success', 'rigid canopy fails: ' + r.s.failReason);
});

// ------------------------------------------------------------------ 2. Model.treeSpec / treeBase
test('2. Model.treeSpec defaults, overrides and treeBase', () => {
  const L = canopy([], { terrain: { leftEdge: 0, leftY: 1, rightEdge: 32, rightY: -1, floorY: -14, waterY: -6 } });
  L.anchors.push({ x: 16, y: 12, deco: 'tree', tree: {} });                                     // a8 mid-gap
  L.anchors.push({ x: 0.5, y: 12, deco: 'tree', tree: { baseX: -3, baseY: 1, stiffness: 2e6, rootLimit: 2e5, uprootTilt: 0.2, topMass: 50 } }); // a9
  L.anchors.push({ x: 31.5, y: 9, deco: 'tree' });                                              // a10 rigid
  L.anchors.push({ x: 1, y: 1.5, deco: 'tree', tree: { baseX: 1, baseY: 1 } });                 // a11 degenerate (0.5 m)
  const s4 = M.treeSpec(L, 4), s5 = M.treeSpec(L, 5), s8 = M.treeSpec(L, 8), s9 = M.treeSpec(L, 9);
  assert(s4 && s4.id === 'a4' && s4.baseX === -1.1 && s4.baseY === 1 && s4.side === 1, 'left edge tree base ' + JSON.stringify(s4));
  assert(s5 && s5.baseX === 33.1 && s5.baseY === -1 && s5.side === -1, 'right edge tree base ' + JSON.stringify(s5));
  assert(s8 && s8.baseX === 16 && s8.baseY === -14 && s8.side === 0 && Math.abs(s8.length - 26) < 1e-12 && s8.rest === 0, 'mid-gap tree ' + JSON.stringify(s8));
  assert(s9.baseX === -3 && s9.baseY === 1 && s9.stiffness === 2e6 && s9.rootLimit === 2e5 && s9.uprootTilt === 0.2 && s9.topMass === 50, 'overrides ' + JSON.stringify(s9));
  assert(s4.stiffness === TA.stiffness && s4.rootLimit === TA.rootLimit && s4.uprootTilt === TA.uprootTilt && s4.topMass === TA.topMass, 'defaults');
  for (const s of [s4, s5, s9]) {
    assert(Math.abs(s.length - Math.hypot(s.x - s.baseX, s.y - s.baseY)) < 1e-12, 'length');
    assert(Math.abs(s.rest - Math.atan2(-(s.x - s.baseX), s.y - s.baseY)) < 1e-12, 'rest ' + s.rest);
  }
  assert(s4.rest < 0 && s5.rest > 0, 'edge trees slant out over the gap (pylon sign convention)');
  assert(M.treeSpec(L, 10) === null && M.treeSpec(L, 11) === null && M.treeSpec(L, 0) === null, 'rigid / degenerate / bolt are no flexible trees');
  assert(M.treeAnchors(L).map(s => s.i).join() === '4,5,8,9', 'treeAnchors ' + M.treeAnchors(L).map(s => s.i));
  const b10 = M.treeBase(L, 10);
  assert(b10 && b10.x === 32.6 && b10.y === -1 && b10.side === -1 && b10.edge, 'treeBase of a rigid tree ' + JSON.stringify(b10));
  assert(M.treeBase(L, 0) === null && M.treeBase(L, 6) === null, 'treeBase only for trees');
  const b4 = M.treeBase(L, 4);
  assert(b4.x === s4.baseX && b4.y === s4.baseY, 'treeBase == treeSpec base');
});

// ------------------------------------------------------------------ 3. stakes and bolts
test('3. stakes are plain inland anchors (no land features); bolt / tree / stake ids', () => {
  const L = canopy();
  for (const i of [6, 7]) {
    const f = M.anchorInfo(L, i);
    assert(f.kind === 'inland' && f.explicit === false, 'stake a' + i + ' ' + JSON.stringify(f));
    assert(M.isStakeAnchorId(L, 'a' + i) && !M.isTreeAnchorId(L, 'a' + i) && !M.isBoltAnchorId(L, 'a' + i), 'stake ids');
  }
  assert(M.hasLandFeatures(L) === false && M.roadEnvelope(L) === null, 'stakes made land features');
  assert(M.isBoltAnchorId(L, 'a2') && M.isBoltAnchorId(L, 'a3'), 'cliff bolts');
  assert(!M.isBoltAnchorId(L, 'a0') && !M.isBoltAnchorId(L, 'a1'), 'road ends are no bolts');
  assert(M.isTreeAnchorId(L, 'a4') && !M.isBoltAnchorId(L, 'a4'), 'trees are no bolts');
  assert(!M.isBoltAnchorId(L, 'n1') && !M.isBoltAnchorId(L, 'a99') && !M.isStakeAnchorId(L, 'x'), 'bad ids');
  // a guy rope from a stake to a tree is a valid member
  const v = M.validate(L, fan({ guy: 'rope' }));
  assert(v.ok !== false && !(v.errors || []).length, 'guyed canopy invalid: ' + JSON.stringify(v.errors || v));
  // the shipped levels: stakes stay within 3..6.5 m behind the gap edge, on the bank surface
  for (const lv of BG.Levels || []) {
    const t = lv.terrain || {};
    (lv.anchors || []).forEach((a, i) => {
      if (a.deco !== 'stake') return;
      const left = a.x < (t.leftEdge + t.rightEdge) / 2, back = left ? t.leftEdge - a.x : a.x - t.rightEdge;
      assert(back >= 3 - 1e-9 && back <= 6.5 + 1e-9, 'level ' + lv.id + ' stake a' + i + ' ' + back + ' m behind the edge');
      assert(Math.abs(a.y - (left ? t.leftY : t.rightY)) < 1e-9 && !a.inland, 'level ' + lv.id + ' stake a' + i + ' not on the bank surface');
    });
  }
});

// ------------------------------------------------------------------ 4. a lone tree stands
test('4. a lone tree (upright or slanted) keeps its rest angle', () => {
  const L = canopy([], { timeLimit: 5 });
  L.anchors[5] = { x: 32, y: 8, deco: 'tree', tree: { baseX: 35, baseY: 0 } }; // slanted 3 m
  const r = run(L, { nodes: [], beams: [], piers: [] }, { maxTime: 5, keepRunning: true });
  assert(r.sim.nTree === 2, 'nTree ' + r.sim.nTree);
  for (const t of r.sim.trees) {
    assert(Math.abs(t.lean) < 0.003, 'a' + t.anchor + ' leans ' + t.lean);
    assert(Math.abs(Math.hypot(t.x - t.baseX, t.y - t.baseY) - t.length) < 1e-3, 'trunk length');
    assert(!t.uprooted, 'uprooted');
  }
  assert(Math.abs(r.sim.trees[1].rest - Math.atan2(3, 8)) < 1e-9, 'slanted rest');
});

// ------------------------------------------------------------------ 5. static pull
test('5. static pull: lean = M / stiffness and ratio = M / rootLimit (±15 %)', () => {
  // a rope V from the tree top to a far bolt, with a masonry weight hanging under its low point
  const L = canopy([], { timeLimit: 12 });
  L.anchors[3] = { x: 32, y: 8 };
  const d = { nodes: [{ id: 'n1', x: 16, y: 0 }, { id: 'n2', x: 16, y: -1 }], piers: [],
    beams: [{ a: 'a4', b: 'n1', m: 'rope' }, { a: 'a3', b: 'n1', m: 'rope' }, { a: 'n1', b: 'n2', m: 'masonry' }] };
  const r = run(L, d, { maxTime: 12, keepRunning: true });
  const sim = r.sim, t = sim.trees[0], k = t.node;
  // moment about the root base of every force on the top joint: the rope and the joint's weight
  const b = sim.beams[0], n1 = sim.nodes[sim.nodeIndex.get('n1')];
  const ux = n1.x - t.x, uy = n1.y - t.y, ul = Math.hypot(ux, uy);
  const Fx = b.force * ux / ul, Fy = b.force * uy / ul - sim.mass[k] * BG.Simulation.GRAVITY;
  const rx = t.x - t.baseX, ry = t.y - t.baseY;
  const Mom = Math.abs(rx * Fy - ry * Fx);
  const s = M.treeSpec(L, 4);
  const lean = Math.abs(t.lean), expLean = Mom / s.stiffness, expRatio = Mom / s.rootLimit;
  assert(Mom > 2e4, 'pull too small to test: ' + Mom);
  assert(Math.abs(lean / expLean - 1) < 0.15, 'lean ' + lean + ' vs M/k ' + expLean);
  assert(Math.abs(t.ratio / expRatio - 1) < 0.15, 'ratio ' + t.ratio + ' vs M/limit ' + expRatio);
  assert(t.lean > 0, 'pulled toward +x leans +x: ' + t.lean);
  console.log('      M ' + (Mom / 1000).toFixed(1) + ' kN·m: lean ' + (lean * DEG).toFixed(3) + '° (M/k ' + (expLean * DEG).toFixed(3) + '°), ratio ' + t.ratio.toFixed(3) + ' (M/limit ' + expRatio.toFixed(3) + ')');
});

// ------------------------------------------------------------------ 6. calibration
test('6. calibration (62-like canopy): porters lean a little, hand carts more, both pass', () => {
  const p = run(canopy(PORTERS), fan());
  assert(p.s.status === 'success', 'porters: ' + p.s.failReason);
  assert(p.maxLean * DEG > 1 && p.maxLean * DEG < 2.5, 'porters lean ' + (p.maxLean * DEG).toFixed(2) + '°');
  assert(p.s.peakRoot > 0.3 && p.s.peakRoot < 0.6, 'porters root ' + p.s.peakRoot);
  const c = run(canopy(CARTS), fan());
  assert(c.s.status === 'success', 'carts: ' + c.s.failReason);
  assert(c.maxLean * DEG > 2 && c.maxLean * DEG < 3.5, 'carts lean ' + (c.maxLean * DEG).toFixed(2) + '°');
  assert(c.maxLean > p.maxLean, 'carts lean less than porters');
  assert(c.s.peakRoot <= 0.75, 'carts root ' + c.s.peakRoot);
  // the same canopy on rigid trees has far lower member stress: the lean is what loads the deck
  const L = canopy(CARTS); L.anchors[4] = { x: 0, y: 8, deco: 'tree' }; L.anchors[5] = { x: 32, y: 8, deco: 'tree' };
  const rg = run(L, fan());
  assert(rg.s.peakStress < c.s.peakStress, 'rigid ' + rg.s.peakStress + ' vs flexible ' + c.s.peakStress);
});

// ------------------------------------------------------------------ 7. uprooting
test('7. an unguyed ox cart uproots a tree: failed / uprooted, tree_uproot event', () => {
  for (const deck of ['tt_deck', 'walkway']) {
    const r = run(canopy(OX), fan({ deck }));
    assert(r.s.status === 'failed' && r.s.failReason === 'uprooted', deck + ': ' + r.s.status + ' ' + r.s.failReason);
    assert(r.s.treesUprooted >= 1, deck + ': treesUprooted ' + r.s.treesUprooted);
    assert(r.s.firstUproot && r.s.firstUproot.type === 'tree_uproot' && (r.s.firstUproot.anchor === 4 || r.s.firstUproot.anchor === 5), deck + ': firstUproot');
    assert(r.uproots.length >= 1 && r.uproots[0].time === r.s.firstUproot.time, deck + ': no tree_uproot event');
    assert(r.s.peakRoot >= 0.99, deck + ': peakRoot ' + r.s.peakRoot);
    const t = r.sim.trees.find(x => x.anchor === r.s.firstUproot.anchor);
    assert(t.uprooted && t.ratio === 1, deck + ': sim.trees uprooted / ratio');
    if (deck === 'tt_deck') assert(r.s.brokenBeams === 0, 'a member broke before the roots');
  }
});

// ------------------------------------------------------------------ 8. guy ropes
test('8. guyed with Rope to the stakes: the ox cart crosses, lean < 1°, roots < 50 %', () => {
  for (const deck of ['tt_deck', 'walkway']) {
    const r = run(canopy(OX), fan({ deck, guy: 'rope' }));
    assert(r.s.status === 'success', deck + ': ' + r.s.failReason);
    assert(r.s.treesUprooted === 0, deck + ': uprooted');
    assert(r.s.peakRoot < 0.5, deck + ': peakRoot ' + r.s.peakRoot);
    // steady lean under 1°; the peak while the ox cart passes the guyed tree stays close to it
    assert(r.maxLean * DEG < 1.25, deck + ': peak lean ' + (r.maxLean * DEG).toFixed(2) + '°');
    for (const t of r.sim.trees) assert(Math.abs(t.lean) * DEG < 1, 'final lean ' + t.lean * DEG);
  }
});

// ------------------------------------------------------------------ 9. a fallen tree comes to rest
test('9. an uprooted tree comes to rest inside its clamp, everything finite', () => {
  const L = canopy(OX);
  const r = run(L, fan({ deck: 'tt_deck' }));
  assert(r.s.treesUprooted >= 1, 'no uproot');
  const sim = r.sim;
  for (let i = 0; i < 600; i++) sim.step(); // 10 s more (the sim keeps running after a failure)
  for (let i = 0; i < sim.nNodes; i++) assert(isFinite(sim.px[i]) && isFinite(sim.py[i]), 'node ' + i + ' not finite');
  for (const t of sim.trees) {
    assert(isFinite(t.x) && isFinite(t.y) && isFinite(t.lean), 'tree not finite');
    assert(Math.abs(Math.hypot(t.x - t.baseX, t.y - t.baseY) - t.length) < 0.05, 'trunk stretched');
    if (!t.uprooted) continue;
    const th = trunkAngle(t), side = M.treeSpec(L, t.anchor).side;
    const land = side * (t.x - t.baseX) < 0;
    if (land) assert(t.y >= t.baseY - 0.2 - 1e-6, 'fell into the bank: y ' + t.y);
    else assert(Math.abs(th) <= Math.PI / 2 + 0.35 + 1e-3, 'fell too far: ' + th);
  }
});

// ------------------------------------------------------------------ 10. determinism
test('10. determinism: identical summaries and sim.trees on two runs', () => {
  const go = () => { const r = run(canopy(CARTS), fan({ guy: 'liana' })); return JSON.stringify(r.s) + JSON.stringify(r.sim.trees) + r.maxLean; };
  const a = go(), b = go();
  assert(a === b, 'two runs differ');
  const g = () => { const r = run(canopy(OX), fan({ deck: 'tt_deck' })); return JSON.stringify(r.s) + JSON.stringify(r.sim.trees); };
  assert(g() === g(), 'two uproot runs differ');
});

// ------------------------------------------------------------------ other levels
test('11. other levels: no flexible tree -> nTree 0 and the old code path (bit-identical runs)', () => {
  const real = M.treeAnchors;
  let flexible = 0;
  for (const lv of BG.Levels || []) {
    const n = (lv.anchors || []).filter(a => a.tree).length;
    const sim = new BG.Simulation(lv, { nodes: [], beams: [], piers: [] }, { seed: 1 });
    assert(sim.nTree === M.treeAnchors(lv).length && sim.trees.length === sim.nTree, 'level ' + lv.id + ' nTree ' + sim.nTree);
    if (!n) {
      assert(sim.nTree === 0, 'level ' + lv.id + ' has trees without a tree field');
      assert(!('peakRoot' in sim.summary()), 'level ' + lv.id + ' summary has peakRoot');
    } else flexible++;
  }
  // a few levels without trees run identically with the tree code switched off entirely
  for (const id of [1, 24, 59, 66]) {
    const lv = (BG.Levels || []).find(l => l.id === id);
    const file = path.join(__dirname, 'solutions', 'level-' + String(id).padStart(2, '0') + '.json');
    if (!lv || !fs.existsSync(file) || (lv.anchors || []).some(a => a.tree)) continue;
    const d = M.deserialize(fs.readFileSync(file, 'utf8'));
    const once = () => { const r = runHeadless(lv, d, { maxTime: 20 }); delete r.wallMs; return JSON.stringify(r); };
    const a = once();
    M.treeAnchors = () => [];
    let b;
    try { b = once(); } finally { M.treeAnchors = real; }
    assert(a === b, 'level ' + id + ' differs with the tree code switched off');
  }
  console.log('      (' + flexible + ' shipped level(s) with flexible trees)');
});

// ------------------------------------------------------------------ run
(function main() {
  const filter = process.argv[2];
  let pass = 0, fail = 0;
  const t0 = Date.now();
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const ts = Date.now();
    try { t.fn(); pass++; console.log(`PASS  ${t.name}  (${Date.now() - ts} ms)`); }
    catch (e) { fail++; console.log(`FAIL  ${t.name}\n      ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(fail ? 1 : 0);
})();
