/* SPAN - jungle figures: procedurally animated walkers and monkeys (used by js/features/jungle-fx.js).
 *
 * The figures are drawn with canvas strokes in the same cartoon style as the jungle sprites (a dark
 * #1c2230 outline under a coloured stroke). Legs use foot planting and two-bone IK, so a stance foot
 * stays put on the deck while the body moves past it, which a two-frame flipbook can't do.
 *
 * Coordinates: metres, x forward, y up, origin on the ground under the hip (or under the monkey's belly).
 * The caller drives the gait phase from the distance the vehicle has covered (phase += dist / cycle),
 * so the feet match the real speed, and `w` (0..1) blends from standing to a full stride.
 *
 *   BG.JungleFigures.human(ctx, o)   o: { p, w, s, t, look, load, hat, beard, stick, arms, hand, fall, lean }
 *   BG.JungleFigures.monkey(ctx, o)  o: { p, w, s, t, fall, look }
 *   BG.JungleFigures.HUMAN_CYCLE / MONKEY_CYCLE  stride cycle lengths (m) at scale 1
 */
(function (root) {
  'use strict';
  const BG = (root.BG = root.BG || {});
  const TAU = Math.PI * 2, INK = '#1c2230';
  const HUMAN_CYCLE = 1.3, MONKEY_CYCLE = 0.62;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(q) { return q * q * (3 - 2 * q); }

  // foot (or paw) position relative to the hip for gait phase p: a planted stance for `sf` of the cycle
  // (moving back at exactly the body's speed), then a smooth swing forward with a lift
  function foot(p, C, lift, sf) {
    p = ((p % 1) + 1) % 1; sf = sf || 0.5;
    const half = C * sf / 2;
    if (p < sf) return { x: half - (p / sf) * 2 * half, y: 0, sw: 0 };
    const q = (p - sf) / (1 - sf), e = smooth(q);
    return { x: -half + e * 2 * half, y: lift * Math.sin(Math.PI * q), sw: q };
  }

  // two-bone IK: joint between a and b, bent towards +x when bend > 0 (a knee), -x when bend < 0 (an elbow)
  function ik(ax, ay, bx, by, l1, l2, bend) {
    let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    const max = (l1 + l2) * 0.999, min = Math.abs(l1 - l2) + 1e-4;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    if (d < min) d = min;
    const th = Math.atan2(dy, dx);
    const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const a = th + (bend > 0 ? al : -al);
    // for a limb hanging down (th ~ -90deg) +al swings the joint towards +x
    return { x: ax + l1 * Math.cos(a), y: ay + l1 * Math.sin(a), ex: ax + dx, ey: ay + dy };
  }

  function limb(ctx, pts, wOut, wIn, col) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = INK; ctx.lineWidth = wOut; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = wIn; ctx.stroke();
  }
  function ellipse(ctx, x, y, rx, ry, rot, fill, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    ctx.fillStyle = fill; ctx.fill();
    if (lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function shade(hex, k) { // darken (k < 0) or lighten (k > 0) a #rrggbb colour
    const n = parseInt(hex.slice(1), 16), t = k < 0 ? 0 : 255, f = Math.abs(k);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * f));
    return '#' + c.map(v => (v < 16 ? '0' : '') + v.toString(16)).join('');
  }

  // ------------------------------------------------------------------ people
  const HUMAN_LOOK = { skin: '#e0a672', hair: '#2a1a10', shirt: '#c8743a', trousers: '#e8dcc0', shoe: '#4a2e1a', belt: '#6a4a2a' };

  function human(ctx, o) {
    const s = o.s || 1, w = clamp(o.w === undefined ? 1 : o.w, 0, 1), t = o.t || 0;
    const L = Object.assign({}, HUMAN_LOOK, o.look);
    const fall = !!o.fall;
    let p = o.p || 0;
    if (fall) p = t * 2.2; // legs kick while tumbling
    const C = HUMAN_CYCLE * s * (0.25 + 0.75 * w), lift = 0.13 * s * w;
    const thigh = 0.44 * s, shin = 0.43 * s, ankle = 0.06 * s, upper = 0.3 * s, fore = 0.28 * s;
    const bob = 0.045 * s * w * (0.5 + 0.5 * Math.cos(4 * Math.PI * p)); // lowest with both feet down
    const breathe = (1 - w) * 0.006 * s * Math.sin(t * 2.4);
    const hx = 0, hy = 0.925 * s - bob + breathe;
    const lean = (o.lean !== undefined ? o.lean : 0.07 * w) + (fall ? Math.sin(t * 5) * 0.25 : 0);
    const sx = hx + Math.sin(lean) * 0.52 * s, sy = hy + Math.cos(lean) * 0.52 * s;
    const neckX = sx + Math.sin(lean) * 0.05 * s, neckY = sy + Math.cos(lean) * 0.05 * s;
    const headX = neckX + 0.03 * s, headY = neckY + 0.12 * s;

    const legW = [0.15 * s, 0.1 * s], armW = [0.125 * s, 0.075 * s];
    const legs = [p + 0.5, p].map(function (pp) { // [far, near]
      const f = foot(pp, C, lift, 0.5);
      const ax = hx + f.x * (fall ? 0.6 : 1), ay = f.y + ankle;
      const k = ik(hx, hy, ax, ay, thigh, shin, 1);
      return { f, k, ax: k.ex, ay: k.ey };
    });
    const swing = function (i) { // arm angle from the same-side foot (forward foot -> arm back)
      const f = legs[i].f; return -(f.x / (C / 2 || 1)) * 0.75 * w;
    };
    const armTo = function (i, tx, ty) {
      const k = ik(sx, sy, tx, ty, upper, fore, -1);
      return [sx, sy, k.x, k.y, k.ex, k.ey];
    };
    const swingArm = function (i) {
      const a = swing(i) + lean * 0.6;
      const ex = sx + Math.sin(a) * upper, ey = sy - Math.cos(a) * upper;
      const b = a + 0.25 + 0.35 * Math.max(0, a) * 2; // the elbow bends more on the forward swing
      return [sx, sy, ex, ey, ex + Math.sin(b) * fore, ey - Math.cos(b) * fore];
    };
    // arm targets
    const loadTop = headY + 0.13 * s;
    let near, far;
    if (fall) {
      near = armTo(1, sx + 0.25 * s + Math.sin(t * 9) * 0.08 * s, sy + 0.42 * s);
      far = armTo(0, sx - 0.2 * s + Math.cos(t * 8) * 0.08 * s, sy + 0.4 * s);
    } else if (o.arms === 'push' && o.hand) {
      near = armTo(1, o.hand.x, o.hand.y); far = armTo(0, o.hand.x - 0.04 * s, o.hand.y + 0.02 * s);
    } else if (o.arms === 'carry') {
      near = armTo(1, headX + 0.13 * s, loadTop + 0.02 * s); far = swingArm(0);
    } else { near = swingArm(1); far = swingArm(0); }

    const dark = function (c) { return shade(c, -0.28); };
    // far side: leg, arm (darker)
    const lf = legs[0];
    limb(ctx, [hx, hy, lf.k.x, lf.k.y, lf.ax, lf.ay], legW[0], legW[1], dark(L.trousers));
    drawFoot(ctx, lf, s, dark(L.shoe));
    limb(ctx, far, armW[0], armW[1], dark(L.shirt));
    ellipse(ctx, far[4], far[5], 0.042 * s, 0.042 * s, 0, dark(L.skin), 0.02 * s);
    if (o.stick && !fall) stick(ctx, far, s, t, legs, w);
    // torso
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx + Math.sin(lean) * 0.06 * s, hy + 0.04 * s); ctx.lineTo(sx - Math.sin(lean) * 0.02 * s, sy - 0.05 * s);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.3 * s; ctx.stroke();
    ctx.strokeStyle = L.shirt; ctx.lineWidth = 0.24 * s; ctx.stroke();
    ctx.strokeStyle = shade(L.shirt, 0.18); ctx.lineWidth = 0.07 * s; // a highlight down the chest
    ctx.beginPath(); ctx.moveTo(hx + Math.sin(lean) * 0.22 * s + 0.05 * s, hy + 0.2 * s); ctx.lineTo(sx + 0.04 * s, sy - 0.06 * s); ctx.stroke();
    // belt
    const bx = hx + Math.sin(lean) * 0.08 * s, by = hy + Math.cos(lean) * 0.08 * s;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(-lean);
    ctx.fillStyle = L.belt; ctx.strokeStyle = INK; ctx.lineWidth = 0.025 * s;
    ctx.beginPath(); ctx.rect(-0.14 * s, -0.035 * s, 0.28 * s, 0.07 * s); ctx.fill(); ctx.stroke();
    ctx.restore();
    // near leg
    const ln = legs[1];
    limb(ctx, [hx, hy, ln.k.x, ln.k.y, ln.ax, ln.ay], legW[0], legW[1], L.trousers);
    drawFoot(ctx, ln, s, L.shoe);
    // head
    ctx.save(); ctx.translate(headX, headY); ctx.rotate(-lean * 0.4 + (fall ? Math.sin(t * 6) * 0.3 : 0));
    ellipse(ctx, 0, 0, 0.11 * s, 0.115 * s, 0, L.skin, 0.03 * s);
    if (!o.hat) { // hair
      ctx.fillStyle = L.hair; ctx.strokeStyle = INK; ctx.lineWidth = 0.022 * s;
      ctx.beginPath(); ctx.moveTo(-0.11 * s, 0.02 * s); ctx.quadraticCurveTo(-0.11 * s, 0.125 * s, 0.02 * s, 0.12 * s);
      ctx.quadraticCurveTo(0.08 * s, 0.11 * s, 0.055 * s, 0.045 * s); ctx.quadraticCurveTo(-0.02 * s, 0.035 * s, -0.11 * s, 0.02 * s); ctx.fill(); ctx.stroke();
    }
    ellipse(ctx, -0.02 * s, 0, 0.026 * s, 0.034 * s, 0, L.skin, 0.018 * s); // ear
    ellipse(ctx, 0.05 * s, 0.01 * s, 0.017 * s, fall ? 0.024 * s : 0.017 * s, 0, INK); // eye
    ctx.strokeStyle = INK; ctx.lineWidth = 0.018 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    if (fall) { ctx.ellipse(0.07 * s, -0.055 * s, 0.022 * s, 0.03 * s, 0, 0, TAU); }
    else { ctx.moveTo(0.04 * s, -0.055 * s); ctx.quadraticCurveTo(0.075 * s, -0.08 * s, 0.1 * s, -0.045 * s); }
    ctx.stroke();
    if (o.beard) {
      ctx.fillStyle = o.beard; ctx.strokeStyle = INK; ctx.lineWidth = 0.018 * s;
      ctx.beginPath(); ctx.moveTo(0.0, -0.03 * s); ctx.quadraticCurveTo(0.02 * s, -0.17 * s, 0.1 * s, -0.09 * s);
      ctx.quadraticCurveTo(0.12 * s, -0.04 * s, 0.06 * s, -0.035 * s); ctx.quadraticCurveTo(0.03 * s, -0.06 * s, 0, -0.03 * s); ctx.fill(); ctx.stroke();
    }
    if (o.hat === 'pith') {
      ellipse(ctx, 0.005 * s, 0.075 * s, 0.17 * s, 0.035 * s, -0.05, '#e8e8e0', 0.02 * s);
      ctx.fillStyle = '#fafaf4'; ctx.strokeStyle = INK; ctx.lineWidth = 0.022 * s;
      ctx.beginPath(); ctx.ellipse(0, 0.09 * s, 0.12 * s, 0.11 * s, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9b46a'; ctx.fillRect(-0.12 * s, 0.085 * s, 0.24 * s, 0.025 * s);
    } else if (o.hat === 'brim') {
      ellipse(ctx, 0, 0.08 * s, 0.2 * s, 0.03 * s, 0, '#6a5030', 0.02 * s);
      ctx.fillStyle = '#7a5e38'; ctx.strokeStyle = INK; ctx.lineWidth = 0.022 * s;
      ctx.beginPath(); ctx.rect(-0.1 * s, 0.08 * s, 0.2 * s, 0.1 * s); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // the load on the head
    if (o.load && !fall) drawLoad(ctx, o.load, headX, loadTop - 0.02 * s, s, w, p);
    // near arm on top
    limb(ctx, near, armW[0], armW[1], L.shirt);
    ellipse(ctx, near[4], near[5], 0.045 * s, 0.045 * s, 0, L.skin, 0.022 * s);
  }
  function drawFoot(ctx, leg, s, col) {
    const toe = leg.f.sw ? -0.35 * Math.sin(Math.PI * leg.f.sw) : 0; // toe dips through the swing
    ellipse(ctx, leg.ax + 0.05 * s, leg.ay - 0.045 * s, 0.1 * s, 0.048 * s, toe, col, 0.025 * s);
  }
  function stick(ctx, arm, s, t, legs, w) { // a walking stick in the far hand, planted ahead
    const hx = arm[4], hy = arm[5];
    const tipX = hx + 0.12 * s + legs[1].f.x * 0.3, tipY = 0;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.055 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - 0.02 * s, hy + 0.08 * s); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 0.03 * s; ctx.stroke();
  }
  function drawLoad(ctx, kind, x, y, s, w, p) {
    const sway = Math.sin(p * TAU) * 0.04 * w;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sway);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.025 * s; ctx.lineJoin = 'round';
    if (kind === 'basket') {
      ctx.fillStyle = '#c99a52';
      ctx.beginPath(); ctx.moveTo(-0.2 * s, 0.2 * s); ctx.lineTo(0.2 * s, 0.2 * s); ctx.lineTo(0.14 * s, 0); ctx.lineTo(-0.14 * s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,60,25,0.7)'; ctx.lineWidth = 0.012 * s; ctx.beginPath();
      for (let i = 1; i < 4; i++) { const yy = i * 0.05 * s, hw = 0.14 * s + 0.06 * s * (yy / (0.2 * s)); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy); }
      ctx.stroke();
      ellipse(ctx, -0.07 * s, 0.24 * s, 0.07 * s, 0.05 * s, 0, '#e8c040', 0.018 * s); // fruit heaped in it
      ellipse(ctx, 0.06 * s, 0.24 * s, 0.07 * s, 0.05 * s, 0, '#d8552a', 0.018 * s);
      ellipse(ctx, 0, 0.27 * s, 0.06 * s, 0.045 * s, 0, '#7aa83a', 0.018 * s);
    } else if (kind === 'pot') {
      ellipse(ctx, 0, 0.12 * s, 0.13 * s, 0.12 * s, 0, '#b8643a', 0.025 * s);
      ctx.fillStyle = '#9a4e2a'; ctx.beginPath(); ctx.rect(-0.06 * s, 0.22 * s, 0.12 * s, 0.06 * s); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,200,0.5)'; ctx.lineWidth = 0.015 * s;
      ctx.beginPath(); ctx.moveTo(-0.11 * s, 0.1 * s); ctx.quadraticCurveTo(0, 0.07 * s, 0.11 * s, 0.1 * s); ctx.stroke();
    } else { // a cloth bundle
      ctx.fillStyle = '#e8d4a0';
      ctx.beginPath(); ctx.moveTo(-0.26 * s, 0.07 * s); ctx.quadraticCurveTo(-0.28 * s, 0.22 * s, 0, 0.22 * s); ctx.quadraticCurveTo(0.28 * s, 0.22 * s, 0.26 * s, 0.07 * s);
      ctx.quadraticCurveTo(0.26 * s, 0, 0, 0); ctx.quadraticCurveTo(-0.26 * s, 0, -0.26 * s, 0.07 * s); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,243,208,0.8)'; ctx.lineWidth = 0.02 * s;
      ctx.beginPath(); ctx.moveTo(-0.18 * s, 0.15 * s); ctx.quadraticCurveTo(0, 0.19 * s, 0.18 * s, 0.15 * s); ctx.stroke();
      ellipse(ctx, 0, 0.11 * s, 0.04 * s, 0.04 * s, 0, '#e8b84a', 0.02 * s);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ monkeys
  const MONKEY_LOOK = { fur: '#8a5a32', furLight: '#b07a48', face: '#e8c49a', belly: '#e0b88a' };

  function monkey(ctx, o) {
    const s = o.s || 1, w = clamp(o.w === undefined ? 1 : o.w, 0, 1), t = o.t || 0, fall = !!o.fall;
    const L = Object.assign({}, MONKEY_LOOK, o.look);
    let p = o.p || 0;
    if (fall) p = t * 3;
    const C = MONKEY_CYCLE * s * (0.3 + 0.7 * w), lift = 0.12 * s * w;
    // a bounding gait: the hind pair lands together, then the fore pair; the body rocks and hops
    const rock = 0.17 * w * Math.sin(p * TAU);
    const hop = 0.06 * s * w * Math.max(0, Math.sin(p * TAU + 0.6));
    const cy = 0.28 * s + hop + (1 - w) * 0.008 * s * Math.sin(t * 3);
    const cx = 0;
    const cr = Math.cos(rock), sr = Math.sin(rock);
    const at = function (lx, ly) { return { x: cx + lx * cr - ly * sr, y: cy + lx * sr + ly * cr }; };
    const hip = at(-0.17 * s, -0.02 * s), sh = at(0.17 * s, -0.01 * s);
    const l1 = 0.15 * s, l2 = 0.15 * s, a1 = 0.14 * s, a2 = 0.14 * s;
    const paws = [
      { base: hip, ph: p + 0.06, j: 1, l1, l2, near: false }, { base: hip, ph: p, j: 1, l1, l2, near: true },
      { base: sh, ph: p + 0.56, j: -1, l1: a1, l2: a2, near: false }, { base: sh, ph: p + 0.5, j: -1, l1: a1, l2: a2, near: true }
    ].map(function (q) {
      const f = foot(q.ph, C, lift, 0.42);
      const px0 = q.base.x + (q.j > 0 ? -0.02 : 0.03) * s + f.x * (fall ? 0.5 : 1);
      const py0 = f.y + 0.03 * s + (fall ? 0.1 * s * Math.sin(t * 9 + q.ph * 7) : 0);
      const k = ik(q.base.x, q.base.y, px0, py0, q.l1, q.l2, q.j);
      return Object.assign(q, { k });
    });
    const dark = shade(L.fur, -0.3);
    // tail: a question-mark curl that sways with the gait
    const tb = at(-0.22 * s, 0.03 * s), tw = Math.sin(p * TAU + 1.2) * 0.12 * w + Math.sin(t * 1.7) * 0.06;
    ctx.save(); ctx.translate(tb.x, tb.y); ctx.rotate(rock + tw);
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-0.16 * s, -0.04 * s, -0.16 * s, 0.2 * s, -0.04 * s, 0.2 * s);
    ctx.bezierCurveTo(0.04 * s, 0.2 * s, 0.06 * s, 0.12 * s, 0.0, 0.12 * s);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.09 * s; ctx.stroke();
    ctx.strokeStyle = L.fur; ctx.lineWidth = 0.045 * s; ctx.stroke();
    ctx.restore();
    // far limbs
    for (const q of paws) if (!q.near) {
      limb(ctx, [q.base.x, q.base.y, q.k.x, q.k.y, q.k.ex, q.k.ey], 0.12 * s, 0.065 * s, dark);
      ellipse(ctx, q.k.ex + 0.01 * s, q.k.ey - 0.005 * s, 0.035 * s, 0.025 * s, 0, '#3a2616');
    }
    // body
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rock);
    const g = ctx.createLinearGradient(0, 0.13 * s, 0, -0.13 * s);
    g.addColorStop(0, L.furLight); g.addColorStop(0.55, L.fur); g.addColorStop(1, shade(L.fur, -0.35));
    ellipse(ctx, 0, 0, 0.25 * s, 0.13 * s, 0, g, 0.03 * s);
    ellipse(ctx, 0.01 * s, -0.06 * s, 0.16 * s, 0.065 * s, 0, L.belly);
    ctx.restore();
    // near limbs
    for (const q of paws) if (q.near) {
      limb(ctx, [q.base.x, q.base.y, q.k.x, q.k.y, q.k.ex, q.k.ey], 0.12 * s, 0.065 * s, L.fur);
      ellipse(ctx, q.k.ex + 0.01 * s, q.k.ey - 0.005 * s, 0.035 * s, 0.028 * s, 0, '#3a2616');
    }
    // head: steadier than the body, looking ahead
    const hd = at(0.25 * s, 0.09 * s), nod = -rock * 0.6 + Math.sin(p * TAU * 2) * 0.04 * w;
    ctx.save(); ctx.translate(hd.x, hd.y); ctx.rotate(nod);
    ellipse(ctx, -0.07 * s, 0.0, 0.045 * s, 0.05 * s, 0, L.face, 0.02 * s); // ear
    ellipse(ctx, 0, 0, 0.11 * s, 0.105 * s, 0, L.fur, 0.03 * s);
    ellipse(ctx, 0.06 * s, -0.03 * s, 0.08 * s, 0.07 * s, 0, L.face, 0.03 * s);
    ellipse(ctx, 0.08 * s, 0.01 * s, 0.018 * s, fall ? 0.026 * s : 0.018 * s, 0, INK);
    ellipse(ctx, 0.01 * s, 0.03 * s, 0.018 * s, 0.018 * s, 0, INK);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.016 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    if (fall) ctx.ellipse(0.1 * s, -0.07 * s, 0.025 * s, 0.03 * s, 0, 0, TAU);
    else { ctx.moveTo(0.05 * s, -0.07 * s); ctx.quadraticCurveTo(0.09 * s, -0.09 * s, 0.12 * s, -0.06 * s); }
    ctx.stroke();
    ctx.fillStyle = '#6e4526'; ctx.lineWidth = 0.02 * s;
    ctx.beginPath(); ctx.moveTo(-0.03 * s, 0.1 * s); ctx.quadraticCurveTo(0.01 * s, 0.15 * s, 0.05 * s, 0.09 * s); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  BG.JungleFigures = { human, monkey, foot, ik, HUMAN_CYCLE, MONKEY_CYCLE };
})(typeof window !== 'undefined' ? window : globalThis);
