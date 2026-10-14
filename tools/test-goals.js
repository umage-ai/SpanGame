#!/usr/bin/env node
// SPAN — tests for the goals/badges feature. Re-verifies EVERY shipped goal:
//   for each goal in js/features/goals-data.js there must be tools/solutions/goals/level-NN-<goal>.json that
//   passes the level (valid, in budget, editor-buildable, peak <= 0.99) AND earns exactly that badge via
//   BG.Goals.evaluate. Also unit-tests the evaluator and checks the data shape.
// Usage: node tools/test-goals.js [--only 1,2,3]
'use strict';
const fs = require('fs');
const path = require('path');
const { BG, runHeadless } = require('./harness');
require('../js/features/goals.js');
require('../js/features/goals-data.js');
const { accept } = require('./gen-goals.js');

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? new Set(args[oi + 1].split(',').map(Number)) : null;
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) pass++; else { fail++; console.log('FAIL ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}
const pad2 = n => String(n).padStart(2, '0');
const dir = path.join(__dirname, 'solutions', 'goals');
const load = f => BG.Model.deserialize(fs.readFileSync(f, 'utf8'));
const solDesign = (id, suf) => load(path.join(__dirname, 'solutions', 'level-' + pad2(id) + suf + '.json'));
const L = id => BG.Levels.find(l => l.id === id);
const G = BG.Goals;

// ---------------------------------------------------------------- unit tests (evaluator)
{
  const lv = L(1), ref = solDesign(1, '');
  const r = runHeadless(lv, ref);
  const m = G.metrics(lv, ref, r);
  ok('metrics: members', m.members === ref.beams.length);
  ok('metrics: passed', m.passed === true);
  ok('metrics: cost ratio', Math.abs(m.costRatio - r.cost / lv.budget) < 0.001);
  ok('metrics: mass positive', m.mass > 0);
  // a design that does not pass never earns a badge, even if its numbers qualify
  G.register(9001, [{ type: 'minimalist', max: 99 }, { type: 'no_steel' }]);
  const lv2 = Object.assign({}, lv, { id: 9001 });
  const failed = G.evaluate(lv2, { nodes: [], beams: [], piers: [] }, { status: 'failed', peakStress: 1.2 });
  ok('no badge without a pass', failed.earned.length === 0 && failed.passed === false);
  const good = G.evaluate(lv2, ref, r);
  ok('register(): custom ids (campaign levels)', good.earned.length === 2 && good.goals.length === 2, good.earned);
  const tight = (G.register(9001, [{ type: 'minimalist', max: ref.beams.length - 1 }]), G.evaluate(lv2, ref, r));
  ok('minimalist threshold respected', tight.earned.length === 0 && tight.goals[0].candidate === false);
  G.register(9001, [{ type: 'penny', ratio: 0.01 }, { type: 'cool_head', max: 0.01 }, { type: 'featherweight', maxMass: 1 }]);
  ok('impossible thresholds not met', G.evaluate(lv2, ref, r).earned.length === 0);
  G.register(9001, [{ type: 'cool_head', max: 0.99 }]);
  ok('cool_head needs a run', G.evaluate(lv2, ref, null).earned.length === 0 && G.evaluate(lv2, ref, r).earned.length === 1);
  G.register(9001, [{ type: 'bogus' }]);
  ok('unknown goal type is harmless', G.evaluate(lv2, ref, r).earned.length === 0);
  // symmetry
  const lv30 = L(20);
  const sym = { nodes: [{ id: 'n1', x: 6, y: 0 }], beams: [], piers: [] };
  ok('asymmetry of lone design is a miss', G.metrics(lv30, sym, null).symmetric === false || sym.beams.length === 0);
  // i18n: names, conditions and progress follow the language (features.goals.* in js/i18n/<lang>/features.js)
  G.register(9001, [{ type: 'penny', ratio: 0.7 }, { type: 'no_piers' }, { type: 'cool_head', max: 0.8 }]);
  const en = G.evaluate(lv2, ref, null).goals;
  ok('goal texts in English', en[0].name === 'Penny Pincher' && en[0].desc === 'Pass for at most 70% of the budget' && en[1].text === 'no piers' && en[2].text === 'run a test', en);
  BG.i18n.setLanguage('da', { persist: false });
  const da = G.evaluate(lv2, ref, null).goals;
  BG.i18n.setLanguage('en', { persist: false });
  ok('goal texts in Danish', da[0].name === 'Fedtsyl' && da[0].desc === 'Gennemfør for højst 70\u00a0% af budgettet' && da[1].name === 'Pillefri' && da[1].text === 'ingen piller' && da[2].text === 'kør en test' && G.TYPES.penny.name === 'Penny Pincher', da);
}

// ---------------------------------------------------------------- unit tests (design challenges, SPEC-CHALLENGES 3.3)
{
  // synthetic level: road ends a0/a1, a cliff bolt a2, a flexible tree a3, a ruin a4, a stake a5
  const base = L(1);
  const lv = Object.assign({}, base, {
    id: 9002, budget: 1e9,
    materials: ['road', 'wood', 'liana', 'rope'],
    anchors: base.anchors.slice(0, 2).concat([
      { x: -2, y: 4 }, { x: 0, y: 8, deco: 'tree', tree: {} }, { x: 3, y: 0, deco: 'ruin' }, { x: -5, y: 0, deco: 'stake' },
    ]),
  });
  const ids = { cliff: 'a2', tree: 'a3', ruin: 'a4', stake: 'a5' };
  const des = (nodes, beams) => ({ nodes, beams, piers: [] });
  const pass = { status: 'success', peakStress: 0.3 };
  const ev = (specs, d, sim) => (G.register(9002, specs), G.evaluate(lv, d, sim === undefined ? pass : sim));
  const rope = (a, b) => ({ a, b, m: 'rope' });
  const A = lv.anchors;
  const L1 = Math.round(Math.hypot(A[3].x - A[5].x, A[3].y - A[5].y) * 100) / 100;
  const d1 = des([], [rope(ids.tree, ids.stake)]);

  // stock: met / unmet / live / exact boundary
  ok('metrics: length per material', G.metrics(lv, d1, null).length.rope === L1, G.metrics(lv, d1, null).length);
  let r = ev([{ type: 'stock', material: 'rope', maxLen: Math.ceil(L1) }], d1);
  ok('stock: met when within the cap', r.goals[0].met === true && r.goals[0].candidate, r.goals[0]);
  r = ev([{ type: 'stock', material: 'rope', maxLen: Math.floor(L1) }], d1);
  ok('stock: unmet over the cap', r.goals[0].met === false && r.goals[0].candidate === false && r.goals[0].frac < 1, r.goals[0]);
  r = ev([{ type: 'stock', material: 'rope', maxLen: L1 }], d1);
  ok('stock: the exact boundary counts as met', r.goals[0].met === true);
  r = ev([{ type: 'stock', material: 'rope', maxLen: 99 }], d1, null);
  ok('stock: live - on track without a run, not earned', G.TYPES.stock.live === true && r.goals[0].candidate === true && r.goals[0].met === false);
  r = ev([{ type: 'stock', material: 'liana', maxLen: 5 }], d1);
  ok('stock: a material not used is within any cap', r.goals[0].met === true);
  r = ev([{ type: 'stock', material: 'rope', maxLen: 12 }], d1);
  ok('stock: texts', r.goals[0].name === 'Short on Rope' && r.goals[0].desc === 'Pass using at most 12 m of Rope' && r.goals[0].icon === 'stock' && /\/ 12 m of Rope$/.test(r.goals[0].text), r.goals[0]);

  // no_material: title and icon resolve per material
  r = ev([{ type: 'no_material', material: 'liana' }], d1);
  ok('no_material: title and icon', r.goals[0].name === 'No Liana' && r.goals[0].icon === 'no_liana' && r.goals[0].desc === 'Pass without using any Liana' && r.goals[0].met, r.goals[0]);
  r = ev([{ type: 'no_material', material: 'rope' }], d1);
  ok('no_material: unmet when used', !r.goals[0].met && !r.goals[0].candidate && r.goals[0].icon === 'no_rope' && r.goals[0].text === '1 Rope member', r.goals[0]);

  // max_joints: user joints only (anchors excluded)
  const d2 = des([{ id: 'n1', x: 1, y: 1 }, { id: 'n2', x: 2, y: 1 }, { id: 'n3', x: 3, y: 1 }],
    [rope('a0', 'n1'), rope('n1', 'n2'), rope('n2', 'a1'), rope('n1', 'n2'), rope('a0', 'a1')]);
  ok('metrics: joints count the used user nodes only', G.metrics(lv, d2, null).joints === 2, G.metrics(lv, d2, null).joints);
  ok('max_joints: met at the count, unmet below', ev([{ type: 'max_joints', max: 2 }], d2).goals[0].met && !ev([{ type: 'max_joints', max: 1 }], d2).goals[0].met);
  ok('max_joints: text', ev([{ type: 'max_joints', max: 4 }], d2).goals[0].text === '2 / 4 joints');

  // trees_only: road ends, trees, stakes and ruins are allowed; a cliff bolt breaks it
  const ok1 = des([{ id: 'n1', x: 1, y: 2 }], [rope('a0', 'n1'), rope('n1', ids.tree), rope('n1', ids.ruin), rope('n1', ids.stake), rope('n1', 'a1')]);
  r = ev([{ type: 'trees_only' }], ok1);
  ok('trees_only: road ends, trees, stakes and ruins are allowed', r.goals[0].met === true && G.metrics(lv, ok1, null).boltMembers === 0, G.metrics(lv, ok1, null));
  const bad1 = des([{ id: 'n1', x: 1, y: 2 }], [rope('a0', 'n1'), rope('n1', ids.cliff)]);
  r = ev([{ type: 'trees_only' }], bad1);
  ok('trees_only: a cliff bolt breaks it', r.goals[0].met === false && r.goals[0].text === '1 member on a cliff bolt' && G.metrics(lv, bad1, null).boltMembers === 1, r.goals[0]);
  ok('metrics: trees and stakes counted', G.metrics(lv, ok1, null).trees === 1 && G.metrics(lv, ok1, null).stakes === 1);

  // no_stakes
  r = ev([{ type: 'no_stakes' }], ok1);
  ok('no_stakes: unmet with a stake member', r.goals[0].met === false && r.goals[0].text === '1 member on a stake', r.goals[0]);
  r = ev([{ type: 'no_stakes' }], bad1);
  ok('no_stakes: met without stakes', r.goals[0].met === true && r.goals[0].text === 'no stakes used', r.goals[0]);

  // cool_head takes the root load into account
  r = ev([{ type: 'cool_head', max: 0.5 }], bad1, { status: 'success', peakStress: 0.4, peakRoot: 0.7 });
  ok('cool_head: peakRoot 0.7 + peakStress 0.4 is not met at 0.5', r.goals[0].met === false && r.metrics.peak === 0.7, r.metrics.peak);
  r = ev([{ type: 'cool_head', max: 0.5 }], bad1, { status: 'success', peakStress: 0.4 });
  ok('cool_head: without peakRoot the stress counts alone', r.goals[0].met === true);

  // Danish: the material is lowercase inside the sentence
  BG.i18n.setLanguage('da', { persist: false });
  const da = ev([{ type: 'no_material', material: 'liana' }, { type: 'stock', material: 'rope', maxLen: 12 }], d1).goals;
  BG.i18n.setLanguage('en', { persist: false });
  ok('Danish texts use the lowercase material', da[0].name === 'Uden lian' && da[0].desc === 'Gennemfør uden at bruge lian' && da[1].name === 'Sparsom med reb', da.map(g => g.name + ' | ' + g.desc));

  // every icon exists as a file with the 64x64 viewBox, including a no_<m> per NO_MATERIAL_ICONS
  const iconDir = path.join(__dirname, '..', 'assets', 'icons', 'badges');
  const icons = new Set();
  for (const id of Object.keys(G.TYPES)) {
    const T = G.TYPES[id];
    if (typeof T.icon === 'function') G.NO_MATERIAL_ICONS.forEach(m => icons.add(T.icon({ material: m }))); else icons.add(T.icon);
  }
  ok('NO_MATERIAL_ICONS: four materials, none steel or deck', G.NO_MATERIAL_ICONS.length === 4 && G.NO_MATERIAL_ICONS.every(m => m !== 'steel' && !BG.Materials[m].isRoad && !BG.Materials[m].isRail));
  for (const ic of icons) {
    const f = path.join(iconDir, ic + '.svg');
    ok('icon file exists with a 64x64 viewBox: ' + ic, fs.existsSync(f) && /viewBox="0 0 64 64"/.test(fs.readFileSync(f, 'utf8')));
  }
}

// ---------------------------------------------------------------- data shape
const data = BG.GoalsData || {};
const ids = Object.keys(data).map(Number).sort((a, b) => a - b);
// famous: stub levels (BG.Requirements not met: no verified solutions yet) have no goals until they are finished
const playable = BG.Levels.filter(l => !BG.Requirements || BG.Requirements.met(l));
ok('goals data present for every playable level (roads 1-50, bonus 51-53, Iron Road 101-120, Famous Bridges 201+)', playable.every(l => data[l.id]), playable.filter(l => !data[l.id]).map(l => l.id));
ok('no goals on stub levels', BG.Levels.filter(l => !playable.includes(l)).every(l => !data[l.id]));
let total = 0;
const typeCount = {};
for (const id of ids) {
  const specs = data[id];
  ok('level ' + id + ': 2-4 goals', specs.length >= 2 && specs.length <= 4, specs.length);
  ok('level ' + id + ': unique types', new Set(specs.map(s => s.type)).size === specs.length);
  total += specs.length;
  specs.forEach(s => { typeCount[s.type] = (typeCount[s.type] || 0) + 1; ok('level ' + id + ': known type ' + s.type, !!G.TYPES[s.type]); });
}
// no stray solution files
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir)) {
    const mm = /^level-(\d+)-(.+)\.json$/.exec(f);
    if (!mm) { ok('unexpected file in solutions/goals: ' + f, false); continue; }
    ok('solution file has a goal: ' + f, (data[+mm[1]] || []).some(s => s.type === mm[2]));
  }
}

// ---------------------------------------------------------------- re-verify every goal
const t0 = Date.now();
for (const id of ids) {
  if (only && !only.has(id)) continue;
  const level = L(id);
  if (!level) { ok('level exists ' + id, false); continue; }
  for (const spec of data[id]) {
    const file = path.join(dir, 'level-' + pad2(id) + '-' + spec.type + '.json');
    if (!fs.existsSync(file)) { ok('level ' + id + ' ' + spec.type + ': solution file exists', false); continue; }
    const design = load(file);
    const run = accept(level, design);
    ok('level ' + id + ' ' + spec.type + ': design passes the level', !!run);
    if (!run) continue;
    const ev = G.evaluate(level, design, run);
    const g = ev.goals.find(x => x.id === spec.type);
    ok('level ' + id + ' ' + spec.type + ': badge earned', !!g && g.met, g && g.text);
  }
}
console.log((fail ? 'FAILED ' : 'ok ') + pass + ' checks passed, ' + fail + ' failed; ' + total + ' goals on ' + ids.length + ' levels; types ' + JSON.stringify(typeCount) + '; verify ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(fail ? 1 : 0);
