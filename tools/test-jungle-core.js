#!/usr/bin/env node
// SPAN — jungle core tests (docs/jungle/SPEC-JUNGLE.md §2, §3, WP-core): the jungle materials (walkway, bamboo,
// liana) and traffic types (walker, monkey, handcart, oxcart, jeep, livingstone), headless, no rendering.
// Usage: node tools/test-jungle-core.js [filter]
'use strict';
const { BG, runHeadless } = require('./harness');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const JUNGLE_MATS = ['walkway', 'bamboo', 'liana'];
const JUNGLE_TYPES = ['walker', 'monkey', 'handcart', 'oxcart', 'jeep', 'livingstone'];

// ------------------------------------------------------------------ helpers (same shapes as test-physics.js)
function makeLevel(gap, traffic, extra) {
  return Object.assign({
    id: 900, name: 'test', hint: '', theme: 'meadow',
    terrain: { leftEdge: 0, leftY: 0, rightEdge: gap, rightY: 0, floorY: -15, waterY: -12 },
    anchors: [{ x: 0, y: 0 }, { x: gap, y: 0 }, { x: 0, y: -3 }, { x: gap, y: -3 }],
    pierZones: [], maxPiers: 0, noBuild: [],
    buildArea: { x0: -30, x1: gap + 30, y0: -14, y1: 40 },
    materials: Object.keys(BG.Materials), budget: 1e9,
    traffic: traffic || [], timeLimit: 90, templates: false,
  }, extra || {});
}

function Builder(level) {
  const d = { nodes: [], beams: [], piers: [] };
  const map = new Map();
  const key = (x, y) => x.toFixed(3) + ',' + y.toFixed(3);
  (level.anchors || []).forEach((a, i) => map.set(key(a.x, a.y), 'a' + i));
  let k = 0;
  const api = {
    d,
    node(x, y) { const kk = key(x, y); if (map.has(kk)) return map.get(kk); const id = 'n' + (++k); d.nodes.push({ id, x, y }); map.set(kk, id); return id; },
    beam(a, b, m) { if (a !== b && !d.beams.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) d.beams.push({ a, b, m }); return d.beams.length - 1; },
    line(x0, y0, x1, y1, n, m) {
      const ids = []; for (let i = 0; i <= n; i++) ids.push(api.node(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n));
      for (let i = 0; i < n; i++) api.beam(ids[i], ids[i + 1], m); return ids;
    },
  };
  return api;
}

// a hanging walkway: n segments from bank to bank, parabolic sag (deck nodes at y = -sag * 4t(1-t))
function catenary(level, gap, n, sag) {
  const b = Builder(level), ids = [];
  for (let i = 0; i <= n; i++) { const t = i / n; ids.push(b.node(gap * t, -sag * 4 * t * (1 - t))); }
  for (let i = 0; i < n; i++) b.beam(ids[i], ids[i + 1], 'walkway');
  return { b, ids };
}

// walkway deck at y = 0 on an under-deck truss of depth h: bamboo bottom chord between the bank anchors at y = -h,
// a vertical under every deck joint, diagonals running down toward mid-span (Pratt pattern)
function underTruss(level, gap, n, h, frame) {
  const b = Builder(level);
  const top = b.line(0, 0, gap, 0, n, 'walkway');
  const dx = gap / n, bot = [b.node(0, -h)];
  for (let i = 1; i < n; i++) bot.push(b.node(dx * i, -h));
  bot.push(b.node(gap, -h));
  for (let i = 0; i < n; i++) b.beam(bot[i], bot[i + 1], frame); // bottom chord (anchor to anchor)
  for (let i = 0; i < n; i++) i < n / 2 ? b.beam(top[i], bot[i + 1], frame) : b.beam(bot[i], top[i + 1], frame); // diagonals
  for (let i = 1; i < n; i++) b.beam(top[i], bot[i], frame); // verticals: every deck joint is held
  return b;
}

const fmt = r => `${r.status} ${r.failReason || ''} peak ${r.peakStress} ${r.vehiclesFinished}/${r.vehiclesTotal}` +
  (r.firstBreak ? ` break ${r.firstBreak.m}/${r.firstBreak.mode}` : '');

// ------------------------------------------------------------------ tests
test('jungle: material invariants (ids, order, flags, cheaper than wood, i18n getter)', () => {
  const M = BG.Materials;
  for (const id of JUNGLE_MATS) assert(M[id] && M[id].id === id, 'material ' + id);
  assert(M.walkway.isRoad && M.walkway.maxLength === 4 && M.walkway.momentLimit > 0 && M.walkway.bendStiffness > 0, 'walkway is a light deck');
  assert(M.walkway.momentLimit <= M.road.momentLimit / 10, 'walkway much weaker in bending than road');
  assert(M.liana.tensionOnly && !M.liana.isRoad && M.liana.costPerMeter < M.rope.costPerMeter, 'liana tension only and cheaper than rope');
  assert(M.liana.tensionLimit < M.rope.tensionLimit / 5 && M.liana.maxLength > M.rope.maxLength, 'liana weak and long');
  assert(!M.bamboo.tensionOnly && !M.bamboo.isRoad && M.bamboo.compressionLimit < M.bamboo.tensionLimit, 'bamboo weak in compression');
  for (const id of JUNGLE_MATS) assert(M[id].costPerMeter < M.wood.costPerMeter, id + ' cheaper than wood');
  assert(JSON.stringify(BG.MaterialOrder.slice(-3)) === JSON.stringify(JUNGLE_MATS), 'MaterialOrder appends the jungle ids');
  for (const id of JUNGLE_MATS) assert(typeof M[id].name === 'string' && M[id].name.length > 0, 'name getter ' + id);
  for (const id of JUNGLE_MATS) assert(BG.Forces.AERO[id], 'AERO entry ' + id);
});

test('jungle: traffic definitions (mass = sum of feet/wheels, flags, order, generator untouched)', () => {
  const V = BG.Vehicles;
  const mass = { walker: 80, monkey: 18, handcart: 320, oxcart: 1200, jeep: 1650, livingstone: 85 };
  for (const t of JUNGLE_TYPES) {
    const d = V[t];
    assert(d && d.type === t, 'type ' + t);
    assert(Math.abs(d.mass - mass[t]) < 1e-9, t + ' mass ' + d.mass);
    assert(d.width > 0 && d.width < 2.5, t + ' has a narrow wind width');
    for (const w of d.wheels) assert(w.x >= 0 && w.x <= d.length, t + ' wheel inside the body');
    assert(typeof d.name === 'string' && d.name.length > 0, 'name getter ' + t);
  }
  for (const t of ['walker', 'monkey', 'livingstone']) assert(V[t].foot === true, t + ' is foot traffic');
  for (const t of ['handcart', 'oxcart', 'jeep']) assert(!V[t].foot, t + ' is wheeled');
  assert(V.livingstone.hidden === true && JUNGLE_TYPES.every(t => t === 'livingstone' || !V[t].hidden), 'only Livingstone is hidden');
  for (const t of ['car', 'van', 'bus', 'truck', 'semi', 'tanker', 'heavy']) assert(!V[t].width && !V[t].foot && !V[t].hidden, 'road def ' + t + ' unchanged');
  assert(JSON.stringify(BG.VehicleOrder.slice(-6)) === JSON.stringify(JUNGLE_TYPES), 'VehicleOrder appends the jungle types');
  const gen = require('fs').readFileSync(require('path').resolve(__dirname, '..', 'js', 'core', 'generator.js'), 'utf8');
  for (const t of JUNGLE_TYPES) assert(!new RegExp("'" + t + "'").test(gen), 'generator must not pick ' + t);
});

test('jungle: liana is tension only (slack in compression), bamboo holds as a strut', () => {
  const L = makeLevel(12, [], { anchors: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 6, y: -3 }, { x: 6, y: 6 }] });
  const mk = (below, above) => { const b = Builder(L); const r = b.line(0, 0, 12, 0, 3, 'walkway'); if (below) b.beam('a2', r[1], below); if (above) b.beam('a3', r[1], above); return b; };
  const sim = (d) => { const s = new BG.Simulation(L, d, { seed: 1 }); for (let i = 0; i < 240; i++) { s.step(); s.events.length = 0; } return s; };
  const b1 = mk('liana', 'liana'); const s1 = sim(b1.d);
  const below = s1.beams[3], above = s1.beams[4];
  assert(below.force === 0 && below.stress === 0, 'liana pushed in compression goes slack, force ' + below.force);
  assert(above.force > 0 && above.stress > 0, 'liana hanger carries tension, force ' + above.force);
  const yB = sim(mk('bamboo', null).d), yL = sim(mk('liana', null).d);
  const y = s => s.nodes[s.nodeIndex.get('n1')].y;
  assert(yB.beams[3].force < 0, 'bamboo strut is in compression');
  assert(y(yB) > y(yL) + 0.05, `bamboo strut holds the deck (${y(yB).toFixed(3)}), a liana strut does not (${y(yL).toFixed(3)})`);
});

test('jungle: walkway catenary (16 m, 1.5 m sag) carries porters and monkeys, folds under a hand cart', () => {
  const run = traffic => { const L = makeLevel(16, traffic); return runHeadless(L, catenary(L, 16, 5, 1.5).b.d); };
  const p = run([{ type: 'walker', count: 6, interval: 1.5 }]);
  assert(p.status === 'success', 'porters: ' + fmt(p));
  const m = run([{ type: 'monkey', count: 8, interval: 0.8 }]);
  assert(m.status === 'success', 'monkeys: ' + fmt(m));
  const h = run([{ type: 'handcart', count: 2, interval: 3 }]);
  assert(h.status === 'failed' && h.brokenBeams > 0 && h.firstBreak.m === 'walkway', 'hand cart must break the bare walkway: ' + fmt(h));
  console.log(`      porters ${p.peakStress}, monkeys ${m.peakStress}, hand cart ${fmt(h)}`);
});

// catenary + hangers from tree anchors at y = +4 on both banks
function hung(traffic, hanger) {
  const L = makeLevel(16, traffic, { anchors: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 0, y: 4 }, { x: 16, y: 4 }] });
  const { b, ids } = catenary(L, 16, 5, 1.5);
  for (let i = 1; i < ids.length - 1; i++) b.beam(i < ids.length / 2 ? 'a2' : 'a3', ids[i], hanger);
  return runHeadless(L, b.d);
}
test('jungle: liana hangers carry hand carts, snap under the ox cart; rope hangers carry it', () => {
  const h = hung([{ type: 'handcart', count: 2, interval: 3 }], 'liana');
  assert(h.status === 'success', 'liana-hung walkway carries hand carts: ' + fmt(h));
  const o = hung([{ type: 'oxcart', count: 1, interval: 3 }], 'liana');
  assert(o.status === 'failed' && o.firstBreak && o.firstBreak.m === 'liana' && o.firstBreak.mode === 'tension', 'ox cart snaps a liana: ' + fmt(o));
  const r = hung([{ type: 'oxcart', count: 1, interval: 3 }], 'rope');
  assert(r.status === 'success', 'rope hangers carry the ox cart: ' + fmt(r));
  console.log(`      liana+handcart ${h.peakStress}, liana+ox ${fmt(o)}, rope+ox ${r.peakStress}`);
});

test('jungle: bamboo truss carries the jeep at 20 m; buckles (compression) under the ox cart at 32 m; wood passes', () => {
  const jeep = (() => { const L = makeLevel(20, [{ type: 'oxcart', count: 1, interval: 3 }, { type: 'jeep', count: 1, interval: 3 }]); return runHeadless(L, underTruss(L, 20, 5, 3, 'bamboo').d); })();
  assert(jeep.status === 'success', '20 m bamboo truss carries ox cart + jeep: ' + fmt(jeep));
  const L28 = makeLevel(32, [{ type: 'oxcart', count: 1, interval: 3 }]);
  const b28 = runHeadless(L28, underTruss(L28, 32, 8, 3, 'bamboo').d);
  assert(b28.status === 'failed' && b28.firstBreak.m === 'bamboo' && b28.firstBreak.mode === 'compression', '32 m bamboo truss buckles: ' + fmt(b28));
  const w28 = runHeadless(L28, underTruss(L28, 32, 8, 3, 'wood').d);
  assert(w28.status === 'success', '32 m wood truss passes: ' + fmt(w28));
  console.log(`      bamboo 20 m ${jeep.peakStress}, bamboo 32 m ${fmt(b28)}, wood 32 m ${w28.peakStress}`);
});

test('jungle: every new traffic type crosses a sound bridge, and falls through a missing deck', () => {
  for (const t of JUNGLE_TYPES) {
    const L = makeLevel(16, [{ type: t, count: 2, interval: 3 }]);
    const ok = runHeadless(L, underTruss(L, 16, 4, 3, 'bamboo').d);
    assert(ok.status === 'success' && ok.vehiclesFinished === 2 && ok.vehiclesTotal === 2, t + ' crosses: ' + fmt(ok));
    // the deck stops 8 m short of the far bank
    const b = Builder(L); b.line(0, 0, 8, 0, 2, 'walkway'); b.beam('a2', 'n1', 'bamboo'); b.beam('a2', 'n2', 'bamboo');
    // it runs off the end (failed: vehicle_jumped / vehicle_fell), then keeps falling into the gorge
    const sim = new BG.Simulation(L, b.d, { seed: 1 });
    let failedAt = -1;
    for (let i = 0; i < 60 * 60 && (failedAt < 0 || i < failedAt + 180); i++) { sim.step(); sim.events.length = 0; if (failedAt < 0 && sim.status !== 'running') failedAt = i; }
    const s = sim.summary();
    assert(s.status === 'failed' && /^vehicle_(fell|jumped)$/.test(s.failReason) && s.vehiclesFinished === 0, t + ' fails at the missing deck: ' + fmt(s));
    assert(sim.vehicles[0].y < -3, t + ' dropped into the gap, y ' + sim.vehicles[0].y.toFixed(2));
  }
});

test('jungle: foot traffic stays upright and finishes on a 2.5 m-sag walkway', () => {
  for (const t of ['walker', 'livingstone', 'monkey']) {
    const L = makeLevel(16, [{ type: t, count: 3, interval: 2 }], { anchors: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 0, y: 4 }, { x: 16, y: 4 }] });
    const { b, ids } = catenary(L, 16, 5, 2.5);
    for (let i = 1; i < ids.length - 1; i++) b.beam(i < ids.length / 2 ? 'a2' : 'a3', ids[i], 'rope');
    let maxTilt = 0;
    const r = runHeadless(L, b.d, { onStep: s => { for (const v of s.vehicles) if (v.state === 'driving') maxTilt = Math.max(maxTilt, Math.abs(v.angle)); } });
    assert(r.status === 'success' && r.vehiclesFinished === 3, t + ' finishes: ' + fmt(r));
    assert(maxTilt < 0.75, t + ' stayed upright, max tilt ' + maxTilt.toFixed(2) + ' rad');
  }
});

test('jungle: Livingstone is hidden from trafficSummary but counts in vehiclesTotal', () => {
  const L = makeLevel(16, [{ type: 'walker', count: 2, interval: 2 }, { type: 'livingstone', count: 1, interval: 2 }]);
  const s = BG.Model.trafficSummary(L);
  assert(s.items.length === 1 && s.items[0].type === 'walker' && s.total === 2, 'summary hides him: ' + JSON.stringify(s));
  assert(!/livingstone/i.test(s.text), 'text hides him: ' + s.text);
  const r = runHeadless(L, underTruss(L, 16, 4, 3, 'bamboo').d);
  assert(r.status === 'success' && r.vehiclesTotal === 3 && r.vehiclesFinished === 3, 'he still crosses and counts: ' + fmt(r));
  const road = BG.Model.trafficSummary(makeLevel(16, [{ type: 'car', count: 2 }]));
  assert(road.total === 2 && road.items.length === 1, 'road summary unchanged');
});

test('jungle: wind - width used for foot traffic, 2.5 m default unchanged, walkway gets its own AERO', () => {
  const A = BG.Forces.AERO;
  assert(A.walkway.chord === 1.2 && A.walkway.chord < BG.Forces.DECK.chord, 'walkway is a narrow deck, not the road chord');
  // drag on a porter vs the same porter without width (the old 2.5 m frontal width)
  const wind = [{ type: 'wind', start: 0, duration: 60, speed: 16, gust: 0, dir: 1 }];
  const drag = (def) => {
    const L = makeLevel(16, [{ type: 'walker', count: 1, interval: 1 }], { events: wind });
    const saved = BG.Vehicles.walker; BG.Vehicles.walker = def;
    try {
      const sim = new BG.Simulation(L, underTruss(L, 16, 4, 3, 'bamboo').d, { seed: 1 });
      for (let i = 0; i < 60 * 8; i++) { sim.step(); sim.events.length = 0; }
      return { x: sim.vehicles[0].x, sim };
    } finally { BG.Vehicles.walker = saved; }
  };
  const narrow = drag(BG.Vehicles.walker);
  const wide = drag(Object.assign({}, BG.Vehicles.walker, { width: undefined }));
  assert(narrow.x !== wide.x, 'def.width changes the wind drag (' + narrow.x + ' vs ' + wide.x + ')');
  // walkway deck in a 16 m/s wind: finite, survives
  const L = makeLevel(16, [], { events: wind });
  const sim = new BG.Simulation(L, catenary(L, 16, 5, 1.5).b.d, { seed: 1 });
  for (let i = 0; i < 60 * 10; i++) { sim.step(); sim.events.length = 0; }
  for (let i = 0; i < sim.nNodes; i++) assert(isFinite(sim.px[i]) && isFinite(sim.py[i]), 'finite');
  const ctl = (sim._ext || []).find(e => e && e._aeroOf);
  assert(ctl, 'wind controller attached');
  {
    const a = ctl._aeroOf(0);
    assert(Math.abs(a.lift - 0.5 * BG.Forces.AIR_DENSITY * 1.2 * 0.6) < 1e-9, 'walkway lift uses its AERO chord');
  }
});

test('jungle: deterministic (same run twice -> identical summaries and poses)', () => {
  const L = makeLevel(16, [{ type: 'monkey', count: 3, interval: 0.8 }, { type: 'walker', count: 2, interval: 1.5 }, { type: 'handcart', count: 1, interval: 2 }, { type: 'livingstone', count: 1, interval: 2 }],
    { anchors: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 0, y: 4 }, { x: 16, y: 4 }] });
  const { b, ids } = catenary(L, 16, 5, 1.5);
  for (let i = 1; i < ids.length - 1; i++) b.beam(i < ids.length / 2 ? 'a2' : 'a3', ids[i], 'liana');
  const go = () => { let last; const r = runHeadless(L, b.d, { onStep: s => { last = s.vehicles.map(v => [v.x, v.y, v.angle]); } }); delete r.wallMs; return JSON.stringify(r) + JSON.stringify(last); };
  const a = go(), c = go();
  assert(a === c, 'two runs differ');
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
