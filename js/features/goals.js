// SPAN — Goals beyond stars ("badges"). Pure evaluation logic: no DOM, runs in browser and Node.
//   BG.Goals.evaluate(level, design, simSummary) -> { passed, metrics, goals:[...], earned:[ids] }
//   BG.Goals.metrics(level, design, simSummary)  -> measurable facts about the design/run
//   BG.Goals.forLevel(levelOrId)                 -> goal specs [{type, ...params}] (from BG.GoalsData, js/features/goals-data.js)
//   BG.Goals.register(levelId, specs)            -> add/replace goal specs at runtime (campaigns, e.g. Iron Road 101-120)
// Design challenges (docs/challenges/SPEC-CHALLENGES.md §3): stock, no_material, max_joints, trees_only, no_stakes.
// A TYPE may carry title(p) (a parametrised name) and an icon that is a function p => string.
// A badge is only ever awarded for a run that passed the level (sim success AND cost <= budget).
(function (root) {
  'use strict';
  const BG = (root.BG = root.BG || {});

  const EPS = 0.02;      // metres: coordinate tolerance for the symmetry check
  const registry = {};   // runtime-registered specs override BG.GoalsData

  function frac(limit, value) { return value <= 0 ? 1 : Math.max(0, Math.min(1, limit / value)); }
  // i18n (docs/I18N.md): names, descriptions and progress texts come from the features dictionary
  function t(k, p) { return BG.i18n ? BG.i18n.t(k, p) : k; }
  function num(v) { return BG.i18n ? BG.i18n.num(v) : String(v); }
  function fmtMass(kg) { return kg >= 10000 ? num(Math.round(kg / 100) / 10) + ' t' : num(Math.round(kg)) + ' kg'; }
  function pct(v) { return BG.i18n ? BG.i18n.percent(v) : Math.round(v * 100) + '%'; }
  const RUN_TEST = () => t('features.goals.runTest');

  // ---- goal types ---------------------------------------------------------------------------
  // check(m, p) -> { met, value, target, text, frac } ; m = metrics, p = spec parameters.
  // live:true  -> can be judged from the design alone (shown with live progress while building)
  // live:false -> needs a finished test run (progress shows "run a test")
  // name is a getter (features.goals.<type>.name), so it reads in the current language
  const TYPES = {
    minimalist: {
      icon: 'minimalist', live: true,
      desc: p => t('features.goals.minimalist.desc', { max: p.max }),
      check: (m, p) => ({ met: m.members <= p.max, value: m.members, target: p.max, text: t('features.goals.minimalist.progress', { n: m.members, max: p.max }), frac: frac(p.max, m.members) }),
    },
    penny: {
      icon: 'penny', live: true,
      desc: p => t('features.goals.penny.desc', { pct: pct(p.ratio) }),
      check: (m, p) => ({ met: m.costRatio <= p.ratio + 1e-9, value: m.costRatio, target: p.ratio, text: t('features.goals.penny.progress', { pct: pct(m.costRatio), target: pct(p.ratio) }), frac: frac(p.ratio, m.costRatio) }),
    },
    featherweight: {
      icon: 'feather', live: true,
      desc: p => t('features.goals.featherweight.desc', { mass: fmtMass(p.maxMass) }),
      check: (m, p) => ({ met: m.mass <= p.maxMass, value: m.mass, target: p.maxMass, text: fmtMass(m.mass) + ' / ' + fmtMass(p.maxMass), frac: frac(p.maxMass, m.mass) }),
    },
    cool_head: {
      icon: 'cool', live: false,
      desc: p => t('features.goals.cool_head.desc', { pct: pct(p.max) }),
      check: (m, p) => m.peak == null
        ? { met: false, value: null, target: p.max, text: RUN_TEST(), frac: 0 }
        : { met: m.peak <= p.max + 1e-9, value: m.peak, target: p.max, text: t('features.goals.cool_head.progress', { pct: pct(m.peak), target: pct(p.max) }), frac: frac(p.max, m.peak) },
    },
    symmetric: {
      icon: 'symmetric', live: true,
      desc: () => t('features.goals.symmetric.desc'),
      check: m => ({ met: m.symmetric, value: m.asymmetry, target: 0, text: m.symmetric ? t('features.goals.symmetric.done') : t('features.goals.symmetric.progress', { n: m.asymmetry }), frac: m.symmetric ? 1 : Math.max(0, 1 - m.asymmetry / Math.max(1, m.members)) }),
    },
    no_steel: {
      icon: 'nosteel', live: true,
      desc: () => t('features.goals.no_steel.desc'),
      check: m => ({ met: !m.materials.steel, value: m.count.steel || 0, target: 0, text: m.materials.steel ? t('features.goals.no_steel.progress', { n: m.count.steel }) : t('features.goals.no_steel.done'), frac: m.materials.steel ? 0 : 1 }),
    },
    timber_only: {
      icon: 'timber', live: true,
      desc: () => t('features.goals.timber_only.desc'),
      check: m => {
        const bad = Object.keys(m.count).filter(k => k !== 'road' && k !== 'wood').reduce((a, k) => a + m.count[k], 0);
        return { met: bad === 0, value: bad, target: 0, text: bad ? t('features.goals.timber_only.progress', { n: bad }) : t('features.goals.timber_only.done'), frac: bad ? 0 : 1 };
      },
    },
    // railway levels: the worst kink the train felt (sim.ride.kinkRatio, the same passage-mean kink / limit the
    // derail rule judges) at or below a share of its limit
    smooth_ride: {
      icon: 'smooth', live: false,
      desc: p => t('features.goals.smooth_ride.desc', { pct: pct(p.max) }),
      check: (m, p) => m.ride == null
        ? { met: false, value: null, target: p.max, text: RUN_TEST(), frac: 0 }
        : { met: m.ride <= p.max + 1e-9, value: m.ride, target: p.max, text: t('features.goals.smooth_ride.progress', { pct: pct(m.ride), target: pct(p.max) }), frac: frac(p.max, m.ride) },
    },
    no_piers: {
      icon: 'nopiers', live: true,
      desc: () => t('features.goals.no_piers.desc'),
      check: m => ({ met: m.piers === 0, value: m.piers, target: 0, text: m.piers ? t('features.goals.no_piers.progress', { n: m.piers }) : t('features.goals.no_piers.done'), frac: m.piers ? 0 : 1 }),
    },
    // ---- design challenges (docs/challenges/SPEC-CHALLENGES.md §3): all judged from the design alone ----
    stock: {
      icon: 'stock', live: true,
      title: p => t('features.goals.stock.name', matParams(p.material)),
      desc: p => t('features.goals.stock.desc', Object.assign({ len: metres(p.maxLen) }, matParams(p.material))),
      check: (m, p) => {
        const used = (m.length && m.length[p.material]) || 0;
        return { met: used <= p.maxLen + 1e-9, value: used, target: p.maxLen, text: t('features.goals.stock.progress', Object.assign({ used: metres(Math.round(used)), len: metres(p.maxLen) }, matParams(p.material))), frac: frac(p.maxLen, used) };
      },
    },
    no_material: {
      icon: p => 'no_' + p.material, live: true,
      title: p => t('features.goals.no_material.name', matParams(p.material)),
      desc: p => t('features.goals.no_material.desc', matParams(p.material)),
      check: (m, p) => {
        const n = m.count[p.material] || 0;
        return { met: n === 0, value: n, target: 0, text: n ? t('features.goals.no_material.progress', Object.assign({ n }, matParams(p.material))) : t('features.goals.no_material.done', matParams(p.material)), frac: n ? 0 : 1 };
      },
    },
    max_joints: {
      icon: 'joints', live: true,
      desc: p => t('features.goals.max_joints.desc', { max: p.max }),
      check: (m, p) => ({ met: m.joints <= p.max, value: m.joints, target: p.max, text: t('features.goals.max_joints.progress', { n: m.joints, max: p.max }), frac: frac(p.max, m.joints) }),
    },
    trees_only: {
      icon: 'trees', live: true,
      desc: () => t('features.goals.trees_only.desc'),
      check: m => ({ met: m.boltMembers === 0, value: m.boltMembers, target: 0, text: m.boltMembers ? t('features.goals.trees_only.progress', { n: m.boltMembers }) : t('features.goals.trees_only.done'), frac: m.boltMembers ? 0 : 1 }),
    },
    no_stakes: {
      icon: 'nostakes', live: true,
      desc: () => t('features.goals.no_stakes.desc'),
      check: m => ({ met: m.stakeMembers === 0, value: m.stakeMembers, target: 0, text: m.stakeMembers ? t('features.goals.no_stakes.progress', { n: m.stakeMembers }) : t('features.goals.no_stakes.done'), frac: m.stakeMembers ? 0 : 1 }),
    },
  };
  // material names in texts: English keeps the game's capitalised name, other languages (Danish) use it lowercase
  // inside a sentence. Both dictionaries use {material} (the lint wants identical params); materialLc is also given.
  function matParams(id) {
    const mat = BG.Materials && BG.Materials[id];
    const name = mat ? mat.name : String(id);
    const lc = name.toLocaleLowerCase();
    return { material: BG.i18n && BG.i18n.lang() !== 'en' ? lc : name, materialLc: lc };
  }
  function metres(v) { return BG.i18n ? BG.i18n.meters(v, 0) : v + ' m'; }
  // materials the 'no_material' challenge can be offered for (one icon each; never steel or a deck material)
  const NO_MATERIAL_ICONS = ['liana', 'bamboo', 'rope', 'wood'];
  Object.keys(TYPES).forEach(id => {
    const k = 'features.goals.' + id + '.name';
    Object.defineProperty(TYPES[id], 'name', { enumerable: true, configurable: true, get: () => t(k) });
  });

  // ---- metrics ------------------------------------------------------------------------------
  function nodeMap(level, design) {
    const out = {};
    for (const n of BG.Model.allNodes(level, design)) out[n.id] = n;
    return out;
  }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  // How many members/piers have no mirror twin about the span's centre line (0 = perfectly symmetric).
  function asymmetry(level, design, nodes) {
    const t = level.terrain || {};
    const cx = ((t.leftEdge || 0) + (t.rightEdge || 0)) / 2;
    const q = v => Math.round(v / EPS);
    const key = (x1, y1, x2, y2, m) => {
      const a = [q(x1), q(y1)], b = [q(x2), q(y2)];
      const s = (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) ? [a, b] : [b, a];
      return m + ':' + s[0] + ':' + s[1];
    };
    const list = [];
    for (const b of design.beams || []) {
      const A = nodes[b.a], B = nodes[b.b];
      if (!A || !B) continue;
      list.push({ k: key(A.x, A.y, B.x, B.y, b.m), mk: key(2 * cx - A.x, A.y, 2 * cx - B.x, B.y, b.m) });
    }
    const have = new Set(list.map(e => e.k));
    let miss = 0;
    for (const e of list) if (!have.has(e.mk)) miss++;
    const ps = new Set((design.piers || []).map(p => q(p.x) + ':' + q(p.topY)));
    for (const p of design.piers || []) if (!ps.has(q(2 * cx - p.x) + ':' + q(p.topY))) miss++;
    return miss;
  }

  // anchor classification: Model.is*AnchorId (SPEC-CHALLENGES §1.4) when present, else straight from the level data
  function anchorOf(level, id) {
    const m = /^a(\d+)$/.exec(id);
    return m ? ((level && level.anchors) || [])[+m[1]] || null : null;
  }
  function isDeco(level, id, deco) {
    const f = deco === 'stake' ? BG.Model.isStakeAnchorId : BG.Model.isTreeAnchorId;
    if (f) return !!f(level, id);
    const a = anchorOf(level, id);
    return !!a && a.deco === deco;
  }
  function isBolt(level, id) {
    if (BG.Model.isBoltAnchorId) return !!BG.Model.isBoltAnchorId(level, id);
    const a = anchorOf(level, id);
    if (!a || a.deco) return false;
    const ra = BG.Model.roadAnchors(level);
    return id !== ra.left && id !== ra.right;
  }

  function metrics(level, design, sim) {
    const M = BG.Model, mats = BG.Materials || {};
    design = design || { nodes: [], beams: [], piers: [] };
    const nodes = nodeMap(level, design);
    const count = {};
    let mass = 0;
    for (const b of design.beams || []) {
      count[b.m] = (count[b.m] || 0) + 1;
      const A = nodes[b.a], B = nodes[b.b], mat = mats[b.m];
      if (A && B && mat) mass += Math.hypot(A.x - B.x, A.y - B.y) * (mat.massPerMeter || 0);
    }
    const cost = M.cost(level, design).total;
    const budget = level.budget == null ? Infinity : level.budget;
    const asym = (design.beams || []).length ? asymmetry(level, design, nodes) : 1;
    const materials = {};
    for (const k in count) materials[k] = true;
    const simOk = !!sim && sim.status === 'success';
    // ride quality of a railway run: a summary may carry it (.ride), or the run object its sim (.sim.ride)
    const ride = sim && (sim.ride || (sim.sim && sim.sim.ride)) || null;
    // design-challenge facts: material lengths, user joints, members on bolts / stakes, tree and stake anchors
    const length = {}, userJoints = new Set();
    let boltMembers = 0, stakeMembers = 0;
    for (const b of design.beams || []) {
      const A = nodes[b.a], B = nodes[b.b];
      if (A && B) length[b.m] = (length[b.m] || 0) + Math.hypot(A.x - B.x, A.y - B.y);
      for (const id of [b.a, b.b]) if (nodes[id] && nodes[id].kind === 'node') userJoints.add(id);
      if (isBolt(level, b.a) || isBolt(level, b.b)) boltMembers++;
      if (isDeco(level, b.a, 'stake') || isDeco(level, b.b, 'stake')) stakeMembers++;
    }
    for (const k in length) length[k] = Math.round(length[k] * 100) / 100;
    const anchors = (level && level.anchors) || [];
    return {
      length, joints: userJoints.size, boltMembers, stakeMembers,
      trees: anchors.filter(a => a.deco === 'tree').length, stakes: anchors.filter(a => a.deco === 'stake').length,
      members: (design.beams || []).length,
      cost, budget, costRatio: budget === Infinity ? 0 : round3(cost / budget),
      mass: Math.round(mass),
      // a flexible tree's root load counts as stress for the cool head (SPEC-CHALLENGES §1.8)
      peak: sim && sim.peakStress != null ? (sim.peakRoot != null ? Math.max(sim.peakStress, sim.peakRoot) : sim.peakStress) : null,
      ride: ride && typeof ride.kinkRatio === 'number' ? Math.round(ride.kinkRatio * 1000) / 1000 : null,
      piers: (design.piers || []).length,
      count, materials,
      asymmetry: asym, symmetric: asym === 0,
      simOk, passed: simOk && cost <= budget,
    };
  }

  // ---- specs --------------------------------------------------------------------------------
  function idOf(levelOrId) { return levelOrId && typeof levelOrId === 'object' ? levelOrId.id : levelOrId; }
  function forLevel(levelOrId) {
    const id = idOf(levelOrId);
    if (registry[id]) return registry[id];
    const data = BG.GoalsData || {};
    return data[id] || [];
  }
  function register(levelId, specs) { registry[levelId] = Array.isArray(specs) ? specs : []; }

  function describe(spec) {
    const T = TYPES[spec.type];
    const name = !T ? spec.type : T.title ? T.title(spec) : T.name;
    const icon = !T ? spec.type : typeof T.icon === 'function' ? T.icon(spec) : T.icon;
    return { id: spec.type, type: spec.type, name, icon, desc: T ? T.desc(spec) : '', live: T ? T.live : false };
  }

  // Evaluates every goal of the level. Goals are only 'met' on a passing run (see header).
  function evaluate(level, design, sim) {
    const m = metrics(level, design, sim);
    const goals = forLevel(level).map(spec => {
      const T = TYPES[spec.type];
      const info = describe(spec);
      if (!T) return Object.assign(info, { met: false, candidate: false, text: '', frac: 0 });
      const c = T.check(m, spec);
      // a badge needs a passing run; `candidate` = the design/run already satisfies the condition
      const empty = m.members === 0;   // nothing built yet: never 'on track'
      const met = !!c.met && m.passed && !empty;
      return Object.assign(info, { met, candidate: !!c.met && !empty, text: empty ? t('features.goals.nothingBuilt') : c.text, value: c.value, target: c.target, frac: empty ? 0 : c.frac });
    });
    return { passed: m.passed, metrics: m, goals, earned: goals.filter(g => g.met).map(g => g.id) };
  }

  BG.Goals = { TYPES, metrics, evaluate, forLevel, register, describe, asymmetry, NO_MATERIAL_ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
