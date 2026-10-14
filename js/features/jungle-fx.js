/* SPAN — Jungle chapter visuals (levels 59-70), docs/jungle/SPEC-JUNGLE.md §4.
 *
 * Entirely additive, like forces-fx.js: it wraps BG.Renderer.prototype methods and never edits them, and it does
 * nothing on a level that is not a jungle level (jungle materials / traffic types are recognised by id, the
 * scenery by theme or by the optional level fields `anchors[].deco` and `jungle`).
 *   Renderer.THEMES.jungle / .jungle_temple  the two themes (palette, props 'jungle' | 'jungle_temple', no ships)
 *   Renderer.Sprites.meta / names            jungle traffic (keyed by vehicle type) + every jungle/<name> sprite
 *   RP.render                                stashes the frame state, runs the Livingstone / cameo logic
 *   RP._prop                                 buttress trees, banana plants, bamboo clumps, ferns, temple ruins
 *   RP._drawBeamItems                        liana (before), bamboo + bamboo walkway (after) with their own look
 *   RP._drawVehicle                          porter, monkey, hand cart, ox cart, jeep, Dr Livingstone
 *   RP._drawPierItem                         ruined stone pillars on jungle_temple; lashed timber trestle / log crib piers and
 *                                            A-frame log pylons elsewhere, never concrete (challenges spec §4.1)
 *   RP._drawAnchors / _drawJoints            lashing knots on tree anchors (at the live joint of a bending tree), ground stakes
 *   RP._drawDeadman                          timber block instead of concrete; no block under a stake
 *   RP._drawShips (after the original)       world pass behind the beams: waterfall, tree / ruin anchors, hanging
 *                                            vines, animals, canoes, crocodile, Stanley and Livingstone
 *   RP._drawLights                           speech bubbles (screen space, on top)
 *   RP._drawNoBuild                          edit-mode label "Canoe channel" / "Waterfall"
 *   BG.Hud.showResults                       the Livingstone toast
 * Everything timed against the simulation (canoes, Livingstone's lines) uses state.sim.time, so a replay shows
 * the same picture; the rest animates with the renderer clock. Nothing here touches the physics.
 */
(function (root) {
  'use strict';
  const BG = (root.BG = root.BG || {});
  const Renderer = BG.Renderer;
  if (!Renderer || !Renderer.THEMES || !Renderer.util) return;
  const U = Renderer.util;
  const { clamp, mix, rgba, hash2, TAU } = U;
  const Sprites = Renderer.Sprites;
  const RP = Renderer.prototype;
  function safe(fn) { try { return fn(); } catch (e) { if (!safe._w) { safe._w = 1; if (root.console) console.warn('[jungle-fx]', e && e.message); } return undefined; } }
  function tr(key, params) { return BG.i18n ? BG.i18n.t(key, params) : key; }

  // ------------------------------------------------------------------ themes
  const THEMES = {
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
      water: ['#8aa65a', '#56703a', '#26381c'],
      props: 'jungle', clouds: { n: 4, color: '#f2f7ea', shade: '#b9cdb0', alpha: 0.7 },
      lights: 0, ambient: 'birds', night: 0, ships: false
    }
  };
  THEMES.jungle_temple = Object.assign({}, THEMES.jungle, {
    sky: ['#5d8a5a', '#d4c48a', '#f3e6bf'], fog: '#e3d8b0',
    layers: [
      { kind: 'mountains', color: '#8a9a7a', p: 0.06, amp: 0.30, feat: 420, lift: 0.12 },
      { kind: 'hills', color: '#5a7a4a', p: 0.16, amp: 0.16, feat: 240, lift: 0.04 },
      { kind: 'trees', color: '#2e5a36', p: 0.30, amp: 0.08, feat: 160, lift: -0.01, tree: 'palm' }
    ],
    props: 'jungle_temple'
  });
  Renderer.THEMES.jungle = THEMES.jungle;
  Renderer.THEMES.jungle_temple = THEMES.jungle_temple;

  // ------------------------------------------------------------------ sprites
  // [w, h] in cm = the viewBox size (docs/jungle/SPEC-JUNGLE.md §5)
  const SPR = {
    walker: [100, 175], walker_b: [100, 175], monkey: [80, 55], monkey_b: [80, 55],
    handcart: [260, 140], handcart_b: [260, 140], oxcart: [520, 200], oxcart_b: [520, 200], jeep: [360, 190],
    livingstone: [100, 180], livingstone_b: [100, 180], stanley: [90, 185], stanley_b: [90, 185],
    handcart_cart: [260, 140], anchor_wood: [128, 128], anchor_stone: [128, 128], wheel_wood: [100, 100], canoe: [520, 110], parrot: [40, 70], snake: [180, 60], tiger: [220, 90],
    elephant: [400, 300], croc: [300, 30], fern: [140, 90], ruin_head: [300, 360], ruin_pillar: [200, 400], ruin_cap: [240, 80],
    stake: [40, 120]
  };
  // vehicle type -> [sprite, wheel sprite or null, stride (m) or 0]; the sprite width is def.length * 100
  const TYPES = {
    walker: { body: 'walker', frames: true, stride: 0.35, wheel: null, fig: 'human' },
    monkey: { body: 'monkey', frames: true, stride: 0.25, wheel: null, fig: 'monkey' },
    handcart: { body: 'handcart', frames: true, stride: 0.35, wheel: 'wheel_wood', wheels: [0, 1], pusher: 'handcart_cart' },
    oxcart: { body: 'oxcart', frames: true, stride: 0.45, wheel: 'wheel_wood', wheels: [0] },
    jeep: { body: 'jeep', frames: false, stride: 0, wheel: 'wheel', wheels: [0, 1] },
    livingstone: { body: 'livingstone', frames: true, stride: 0.35, wheel: null, fig: 'human' }
  };
  (function () {
    const meta = Sprites.meta, names = Sprites.names;
    for (const n in SPR) {
      meta['jungle/' + n] = { w: SPR[n][0], h: SPR[n][1] };
      if (names.indexOf('jungle/' + n) < 0) names.push('jungle/' + n);
    }
    for (const t in TYPES) meta[t] = { w: SPR[TYPES[t].body][0], h: SPR[TYPES[t].body][1] };
    try { for (const n in SPR) Sprites.load('jungle/' + n); } catch (e) { /* no DOM */ }
  })();

  // ------------------------------------------------------------------ level helpers
  function isJungleTheme(id) { return id === 'jungle' || id === 'jungle_temple'; }
  function isJungle(level) { return !!level && (isJungleTheme(level.theme) || !!level.jungle); }
  function jcfg(level) { return (level && level.jungle) || {}; }
  function wetLevel(level) { const w = level && level.terrain && level.terrain.waterY; return w !== null && w !== undefined; }
  function finaleLevel(level) { return jcfg(level).livingstone === 'finale'; }
  function canoeCount(level) {
    const c = jcfg(level).canoes;
    return clamp(c === undefined ? (wetLevel(level) ? 1 : 0) : (c | 0), 0, 3);
  }
  /** cosmetic Livingstone cameo after a passed run of levels 59-67: certain bridges, never random */
  function cameo(level, sim) {
    if (!level || !isJungle(level) || finaleLevel(level)) return false;
    if (JungleFx.forceCameo) return true;
    return !!sim && ((level.id | 0) + (sim.nDesignBeams | 0)) % 7 === 0;
  }

  // ------------------------------------------------------------------ canvas helpers
  function spriteBox(r, ctx, name, cx, y, wM, opts) {
    opts = opts || {};
    const m = Sprites.meta['jungle/' + name];
    const h = wM * m.h / m.w, top = opts.top !== undefined ? opts.top : h;
    const img = Sprites.raster('jungle/' + name, wM * r.camera.zoom * r.dpr);
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.save();
    ctx.translate(cx, y);
    if (opts.flip) ctx.scale(-1, 1);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.scale(1, -1);
    if (img) ctx.drawImage(img, -wM / 2, -top, wM, h);
    else { ctx.fillStyle = opts.fallback || '#6a5a3a'; ctx.fillRect(-wM / 2, -top, wM, h); }
    ctx.restore();
    ctx.globalAlpha = 1;
    return !!img;
  }
  function blob(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.ellipse(x - rx * 0.6, y - ry * 0.25, rx * 0.65, ry * 0.65, 0, 0, TAU);
    ctx.ellipse(x + rx * 0.6, y - ry * 0.2, rx * 0.6, ry * 0.62, 0, 0, TAU);
    ctx.fill();
  }
  function leaf(ctx, x, y, len, ang, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, len * 0.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function qpt(ax, ay, cx, cy, bx, by, t) { const u = 1 - t; return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]; }

  // ------------------------------------------------------------------ props (static layer; y-up, base at the origin)
  function pTree(g, h, r2, temple) {
    const bw = h * 0.16, tw = h * 0.05;
    const bark = temple ? '#5a4630' : '#4a3524', barkLit = temple ? '#7a6244' : '#6a4a30';
    g.fillStyle = bark;
    g.beginPath();
    g.moveTo(-bw * 1.5, 0); g.quadraticCurveTo(-bw * 0.5, h * 0.06, -tw, h * 0.34); g.lineTo(-tw * 0.8, h * 0.86);
    g.lineTo(tw * 0.8, h * 0.86); g.lineTo(tw, h * 0.34); g.quadraticCurveTo(bw * 0.5, h * 0.06, bw * 1.5, 0); g.closePath(); g.fill();
    g.fillStyle = barkLit; g.beginPath();
    g.moveTo(-tw * 0.1, 0.4); g.lineTo(tw * 0.2, h * 0.84); g.lineTo(tw * 0.8, h * 0.86); g.lineTo(tw, h * 0.34); g.quadraticCurveTo(bw * 0.5, h * 0.06, bw * 0.8, 0); g.closePath(); g.fill();
    // buttress roots
    g.fillStyle = bark;
    g.beginPath(); g.moveTo(-bw * 2.1, 0); g.quadraticCurveTo(-bw * 0.9, h * 0.03, -tw * 1.1, h * 0.2); g.lineTo(-bw * 0.4, 0); g.fill();
    g.beginPath(); g.moveTo(bw * 2.0, 0); g.quadraticCurveTo(bw * 0.9, h * 0.03, tw * 1.1, h * 0.2); g.lineTo(bw * 0.4, 0); g.fill();
    // crown
    const cy = h * 0.88, cr = h * 0.27;
    g.fillStyle = '#1f5a30'; blob(g, 0, cy, cr * 1.15, cr * 0.7);
    g.fillStyle = '#2f7a3a'; blob(g, -cr * 0.35, cy + cr * 0.25, cr * 0.85, cr * 0.55);
    g.fillStyle = '#3f9a44'; blob(g, cr * 0.3, cy + cr * 0.4, cr * 0.6, cr * 0.4);
    g.fillStyle = '#5fb04e'; blob(g, -cr * 0.1, cy + cr * 0.62, cr * 0.38, cr * 0.22);
    // hanging vines from the crown
    g.strokeStyle = '#2f6a2a'; g.lineWidth = Math.max(0.05, h * 0.006); g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * cr * 0.8 + (r2 - 0.5) * cr * 0.3, l = h * (0.18 + 0.12 * ((k + r2 * 7) % 1));
      g.beginPath(); g.moveTo(x, cy - cr * 0.3); g.quadraticCurveTo(x + h * 0.02, cy - cr * 0.3 - l * 0.5, x - h * 0.01, cy - cr * 0.3 - l); g.stroke();
    }
  }
  function pBanana(g, h, r2) {
    g.strokeStyle = '#6a8a3a'; g.lineWidth = h * 0.09; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(h * 0.04, h * 0.5, 0, h * 0.78); g.stroke();
    const cols = ['#3f9a3a', '#56b048', '#2f7a30'];
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 0.95 + 0.1 + (r2 - 0.5) * 0.2;
      g.save(); g.translate(0, h * 0.78); g.rotate(a > Math.PI / 2 ? a + 0.25 : a - 0.25);
      g.fillStyle = cols[i % 3];
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(h * 0.35, h * 0.14, h * 0.6, -h * 0.06); g.quadraticCurveTo(h * 0.35, -h * 0.02, 0, 0); g.fill();
      g.restore();
    }
    g.fillStyle = '#e0c040'; blob(g, h * 0.06, h * 0.62, h * 0.05, h * 0.07);
  }
  function pBamboo(g, h, r, r2) {
    const n = 3 + Math.floor(r2 * 5);
    for (let k = 0; k < n; k++) {
      const q = hash2(k, Math.floor(r * 1000), 3), q2 = hash2(k, Math.floor(r * 1000), 4);
      const x = (k - (n - 1) / 2) * h * 0.045 + (q - 0.5) * h * 0.03, hh = h * (0.7 + 0.3 * q2), tilt = (q - 0.5) * 0.35 + (k - (n - 1) / 2) * 0.03;
      const tx = Math.sin(tilt) * hh, ty = Math.cos(tilt) * hh;
      g.lineCap = 'round';
      g.strokeStyle = '#4f6a1e'; g.lineWidth = h * 0.034;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + tx, ty); g.stroke();
      g.strokeStyle = q > 0.5 ? '#a3b84a' : '#8fa83e'; g.lineWidth = h * 0.024;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + tx, ty); g.stroke();
      g.strokeStyle = '#5f7a26'; g.lineWidth = h * 0.006;
      for (let s = 0.18; s < 0.95; s += 0.17) { g.beginPath(); g.moveTo(x + tx * s - h * 0.014, ty * s); g.lineTo(x + tx * s + h * 0.014, ty * s); g.stroke(); }
      for (let l = 0; l < 4; l++) leaf(g, x + tx * (0.62 + l * 0.1), ty * (0.62 + l * 0.1), h * 0.2, (l % 2 ? 0.5 : Math.PI - 0.5) + q * 0.4, l % 2 ? '#7aa83a' : '#5f9a36');
    }
  }
  function pFern(r, g, w) {
    const m = Sprites.meta['jungle/fern'];
    const h = w * m.h / m.w;
    const img = Sprites.raster('jungle/fern', w * r.camera.zoom * r.dpr);
    if (img) { g.save(); g.scale(1, -1); g.drawImage(img, -w / 2, -h, w, h); g.restore(); return; }
    for (let i = 0; i < 7; i++) leaf(g, 0, 0, w * 0.6, 0.3 + i * 0.4, i % 2 ? '#4a9a3a' : '#3a7a2e');
  }
  function pFallenBlock(g, w, r) {
    g.fillStyle = '#8a8470'; g.fillRect(-w / 2, 0, w, w * 0.5);
    g.fillStyle = '#6a6652'; g.fillRect(-w / 2, 0, w, w * 0.08);
    g.fillStyle = 'rgba(80,140,50,0.75)'; blob(g, -w * 0.1, w * 0.5, w * 0.35, w * 0.1);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-w / 2 + w * r * 0.3, 0, w * 0.04, w * 0.5);
  }
  const origProp = RP._prop;
  RP._prop = function (g, kind, x, y, r, r2, G, th) {
    if (kind !== 'jungle' && kind !== 'jungle_temple') return origProp.apply(this, arguments);
    JungleFx.hits++;
    const temple = kind === 'jungle_temple';
    g.save();
    g.translate(x, y - 0.3);
    if (r < 0.28) pTree(g, 8 + r2 * 8, r2, temple);
    else if (r < 0.44) pBanana(g, 2.4 + r2 * 1.6, r2);
    else if (r < 0.64) pBamboo(g, 5 + r2 * 5, r, r2);
    else if (r < 0.9) pFern(this, g, 1.6 + r2 * 1.6);
    if (temple && r2 > 0.72) {
      // keep the big stone head off the far bank's first 13 m: Stanley and Livingstone meet there
      const T = this.terrain, meetSpot = T && x > T.re - 1 && x < T.re + 13;
      if (r < 0.5 && !meetSpot) {
        const w = 2.2 + r2 * 1.2;
        const m = Sprites.meta['jungle/ruin_head'], h = w * m.h / m.w;
        const img = Sprites.raster('jungle/ruin_head', w * this.camera.zoom * this.dpr);
        if (img) { g.save(); g.scale(1, -1); g.drawImage(img, -w / 2, -h, w, h); g.restore(); } else pFallenBlock(g, w, r);
      } else pFallenBlock(g, 1.4 + r2, r);
    }
    g.restore();
  };

  // ------------------------------------------------------------------ materials
  function localUp(it) {
    const dx = it.bx - it.ax, dy = it.by - it.ay, L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if (ny < -1e-6 || (Math.abs(ny) <= 1e-6 && nx > 0)) { nx = -nx; ny = -ny; }
    it._nx = nx; it._ny = ny; it._len = L;
  }
  function path(ctx, list, off, down) {
    ctx.beginPath();
    for (const it of list) {
      const o = off * it.st.w * (down ? -1 : 1), ox = it._nx * o, oy = it._ny * o;
      ctx.moveTo(it.ax + ox, it.ay + oy);
      if (it.sag > 0) ctx.quadraticCurveTo((it.ax + it.bx) / 2 + ox, (it.ay + it.by) / 2 - it.sag * 2 + oy, it.bx + ox, it.by + oy);
      else ctx.lineTo(it.bx + ox, it.by + oy);
    }
  }
  function stroke(ctx, list, off, width, color, down, dash, cap) {
    if (!list.length) return;
    path(ctx, list, off, down);
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = cap || 'butt';
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }
  function jagged(ctx, broken, color, px) {
    ctx.fillStyle = color;
    for (const it of broken) {
      const ex = it._freeX !== undefined ? it._freeX : it.bx, ey = it._freeY !== undefined ? it._freeY : it.by;
      const r = Math.max(it.st.w * 0.6, 1.5 * px);
      ctx.beginPath();
      ctx.moveTo(ex - it._nx * r, ey - it._ny * r);
      ctx.lineTo(ex + (it.bx - it.ax) / it._len * r * 0.6, ey + (it.by - it.ay) / it._len * r * 0.6);
      ctx.lineTo(ex + it._nx * r, ey + it._ny * r);
      ctx.fill();
    }
  }
  function drawLiana(r, ctx, list, z, px) {
    const w = 0.07, bw = Math.max(w, 1.6 * px), ow = Math.max(w, 2 * px) + 2 * px;
    const tinted = list.filter(it => it.s !== null && it.s !== undefined && !it.broken);
    const broken = list.filter(it => it.broken);
    stroke(ctx, list, 0, ow, '#24401a', false, null, 'round');
    stroke(ctx, list, 0, bw, '#4e7a2c', false, null, 'round');
    r._tint(ctx, tinted, 0, bw, false, 0.85);
    if (bw * z > 2.2) { // the twist: two offset dash sets and a highlight
      stroke(ctx, list, 0.22, bw * 0.45, '#24401a', false, [0.12, 0.1]);
      stroke(ctx, list, -0.22, bw * 0.45, '#8ab84e', false, [0.1, 0.12]);
    }
    if (z > 14) { // small leaves about every 1.2 m, on alternating sides
      ctx.fillStyle = '#5f9a36';
      for (const it of list) {
        if (it.broken) continue;
        const n = Math.floor(it._len / 1.2), mx = (it.ax + it.bx) / 2, my = (it.ay + it.by) / 2 - it.sag * 2;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, p = it.sag > 0 ? qpt(it.ax, it.ay, mx, my, it.bx, it.by, t) : [it.ax + (it.bx - it.ax) * t, it.ay + (it.by - it.ay) * t];
          const side = k % 2 ? 1 : -1, a = Math.atan2(it._ny * side, it._nx * side) + (k % 3 - 1) * 0.3;
          ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a);
          ctx.beginPath(); ctx.ellipse(0.1, 0, 0.1, 0.045, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
    }
    if (broken.length) { stroke(ctx, broken, 0, bw, 'rgba(20,30,10,0.35)', false, null, 'round'); jagged(ctx, broken, '#c8e08a', px); }
  }
  function drawBamboo(r, ctx, list, z, px) {
    const w = 0.18, bw = Math.max(w, 1.6 * px), ow = Math.max(w, 2 * px) + 2.2 * px;
    const tinted = list.filter(it => it.s !== null && it.s !== undefined && !it.broken);
    const broken = list.filter(it => it.broken);
    stroke(ctx, list, 0, ow, '#4f6a1e');
    stroke(ctx, list, 0, bw, '#a3b84a');
    r._tint(ctx, tinted, 0, bw, false, 0.8);
    if (broken.length) stroke(ctx, broken, 0, bw, 'rgba(40,50,10,0.35)');
    if (w * z > 3) {
      stroke(ctx, list, 0.3, w * 0.2, 'rgba(216,229,138,0.85)');
      stroke(ctx, list, 0, w * 1.02, '#5f7a26', false, [0.04, 0.41]); // node rings every 0.45 m
    }
    if (w * z > 4) { // rope lashing at both ends
      ctx.strokeStyle = '#c9b58a'; ctx.lineWidth = Math.max(0.035, 1.2 * px); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const it of list) {
        if (it.broken || it._len < 0.6) continue;
        const ux = (it.bx - it.ax) / it._len, uy = (it.by - it.ay) / it._len;
        for (let e = 0; e < 2; e++) {
          const px0 = e ? it.bx : it.ax, py0 = e ? it.by : it.ay, d = e ? -1 : 1;
          for (let k = 0; k < 3; k++) {
            const s = d * (0.06 + k * 0.07), hw = w * 0.62;
            ctx.moveTo(px0 + ux * s - it._nx * hw, py0 + uy * s - it._ny * hw);
            ctx.lineTo(px0 + ux * (s + d * 0.05) + it._nx * hw, py0 + uy * (s + d * 0.05) + it._ny * hw);
          }
        }
      }
      ctx.stroke();
    }
    if (broken.length) jagged(ctx, broken, '#e6f0b0', px);
  }
  function drawWalkway(r, ctx, list, z, px) {
    const w = 0.30, bw = Math.max(w, 1.6 * px), ow = Math.max(w, 2 * px) + 2.2 * px;
    const tinted = list.filter(it => it.s !== null && it.s !== undefined && !it.broken);
    const broken = list.filter(it => it.broken);
    stroke(ctx, list, 0.5, ow, '#6e4f22', true);
    stroke(ctx, list, 0.5, bw, '#c9a35a', true);
    r._tint(ctx, tinted, 0.76, bw * 0.48, true, 0.9);
    if (broken.length) stroke(ctx, broken, 0.5, bw, 'rgba(40,30,10,0.35)', true);
    if (w * z > 3) stroke(ctx, list, 0.5, w * 0.92, '#e6c983', true, [0.08, 0.06]); // cross slats
    if (z > 18) { // two cosmetic liana hand-ropes with posts at the joints
      ctx.lineCap = 'round';
      for (const k of [0, 1]) {
        const o = -(0.9 + k * 0.02) / w;
        stroke(ctx, list, o, Math.max(0.03, 1.4 * px), k ? '#3a5e22' : '#4e7a2c', true, null, 'round');
      }
      ctx.strokeStyle = '#6e4f22'; ctx.lineWidth = Math.max(0.035, 1.4 * px);
      ctx.beginPath();
      for (const it of list) { if (it.broken) continue; for (const e of [0, 1]) { const x = e ? it.bx : it.ax, y = e ? it.by : it.ay; ctx.moveTo(x, y); ctx.lineTo(x + it._nx * 0.9, y + it._ny * 0.9); } }
      ctx.stroke();
    }
    if (broken.length) jagged(ctx, broken, '#e8d29a', px);
  }
  const origBeams = RP._drawBeamItems;
  RP._drawBeamItems = function (ctx, items, opts) {
    let lia = null, post = null, rest = null;
    for (const it of items) {
      const m = it.m;
      if (m === 'liana') (lia || (lia = [])).push(it);
      else if (m === 'bamboo' || m === 'walkway') (post || (post = [])).push(it);
      else (rest || (rest = [])).push(it);
    }
    if (!lia && !post) return origBeams.apply(this, arguments);
    JungleFx.hits++;
    const z = this.camera.zoom, px = 1 / z;
    if (lia) { lia.forEach(localUp); safe(() => { ctx.save(); drawLiana(this, ctx, lia, z, px); ctx.restore(); }); }
    let out;
    if (rest) out = origBeams.call(this, ctx, rest, opts);
    if (post) {
      post.forEach(localUp);
      safe(() => {
        ctx.save();
        const bam = post.filter(it => it.m === 'bamboo'), walk = post.filter(it => it.m === 'walkway');
        if (walk.length) drawWalkway(this, ctx, walk, z, px);
        if (bam.length) drawBamboo(this, ctx, bam, z, px);
        ctx.restore();
      });
    }
    return out;
  };

  // ------------------------------------------------------------------ traffic
  // gait state per vehicle (js/features/jungle-figures.js): the stride phase advances with the distance
  // actually covered, so planted feet don't slide, and `w` eases between standing (0) and a full stride (1)
  const gaitS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function gait(v, def, tp, dist, dt, moving, k) {
    const Fig = BG.JungleFigures;
    let g = gaitS && gaitS.get(v);
    if (!g) { g = { d: dist, p: hash2(v.index | 0, 3, 17), w: 0, fall: false }; if (gaitS) gaitS.set(v, g); }
    let dd = dist - g.d; g.d = dist;
    if (!(Math.abs(dd) < 1)) dd = 0; // a reset or a teleport
    const want = moving ? clamp(Math.abs(v.vx || 0) / (((def && def.speed) || 2) * 0.55), 0, 1) : 0;
    if (dt > 0) g.w += (want - g.w) * (1 - Math.exp(-dt * 6));
    const mk = tp.fig === 'monkey', s = tp.pusher ? 0.86 * k : k;
    const C = (mk ? Fig.MONKEY_CYCLE * (0.3 + 0.7 * g.w) : Fig.HUMAN_CYCLE * (0.25 + 0.75 * g.w)) * s;
    g.p = (g.p + Math.abs(dd) / C) % 1;
    g.fall = v.state === 'fallen';
    return g;
  }
  const SHIRTS = ['#c8743a', '#3a7ab8', '#b8443a', '#5a8a3a', '#d8a838', '#8a4a9a', '#2a8a8a'];
  const TROUSERS = ['#e8dcc0', '#5a4a3a', '#c8b890', '#3a4a5a', '#f0ece0'];
  const SKIN = ['#e0a672', '#b87a4a', '#8a5a36', '#c68a58', '#6e4428'];
  const LOADS = ['bundle', 'basket', 'pot'];
  function look(v, s, g, t) { // a porter's colours and load, fixed per vehicle; Dr Livingstone in khaki
    const o = { p: g.p, w: g.w, s, t, fall: g.fall };
    if (v.type === 'livingstone') {
      return Object.assign(o, { look: { shirt: '#d6c08a', trousers: '#c8b080', skin: '#f0c8a0', shoe: '#3a2a18' }, hat: 'pith', beard: '#e4e4dc', stick: true });
    }
    const pick = function (a, k) { return a[Math.floor(hash2(v.index | 0, k, 29) * a.length) % a.length]; };
    const porter = v.type === 'walker';
    return Object.assign(o, {
      look: { shirt: pick(SHIRTS, 1), trousers: pick(TROUSERS, 2), skin: pick(SKIN, 3) },
      load: porter ? pick(LOADS, 4) : null, arms: porter ? 'carry' : null
    });
  }
  const exhaustT = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const origVehicle = RP._drawVehicle;
  RP._drawVehicle = function (ctx, v, dt, state) {
    const tp = TYPES[v && v.type];
    if (!tp) return origVehicle.apply(this, arguments);
    JungleFx.hits++;
    const def = this._vehDef(v);
    const P = this._vehPose(v, def);
    const z = this.camera.zoom, d = this.dpr;
    const ws = v.wheels || [];
    const r0 = (ws[0] && ws[0].r) || (def && def.wheelRadius) || 0.3;
    const dist = ws[0] && typeof ws[0].rot === 'number' ? ws[0].rot * r0 : (ws[0] ? ws[0].x : 0);
    const moving = v.state === 'driving' || v.state === 'running';
    const Fig = BG.JungleFigures;
    if ((tp.fig || tp.pusher) && Fig) { // procedurally animated walkers, monkeys and the cart pusher
      const g = gait(v, def, tp, dist, dt, moving, P.k);
      const t = this.time + (v.index | 0) * 0.9;
      ctx.save();
      ctx.translate(P.ox, P.oy); ctx.rotate(P.ang);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const mk = tp.fig === 'monkey', shW = mk ? 0.3 : tp.fig ? 0.3 : 1.2;
      ctx.beginPath(); ctx.ellipse(mk ? 0.42 * P.k : P.Lm / 2, 0.02, shW * P.k, Math.max(0.05, 0.04 * P.k), 0, 0, TAU); ctx.fill();
      if (mk) { ctx.translate(0.42 * P.k, 0); Fig.monkey(ctx, { p: g.p, w: g.w, s: P.k, t, fall: g.fall }); }
      else if (tp.fig) { ctx.translate(P.Lm / 2, 0); Fig.human(ctx, look(v, P.k, g, t)); }
      else {
        ctx.save(); ctx.translate(0.3 * P.k, 0);
        Fig.human(ctx, Object.assign(look(v, 0.86 * P.k, g, t), { load: null, arms: g.fall ? null : 'push', lean: g.fall ? undefined : 0.3 + 0.08 * g.w, hand: { x: 0.42 * P.k, y: 0.77 * P.k } }));
        ctx.restore();
        const img = Sprites.raster('jungle/' + tp.pusher, P.Lm * z * d);
        if (img) { ctx.save(); ctx.scale(1, -1); ctx.drawImage(img, 0, -P.Hm, P.Lm, P.Hm); ctx.restore(); }
      }
      ctx.restore();
    } else {
    const frame = tp.frames && tp.stride ? (Math.floor(Math.abs(dist) / tp.stride) % 2) : 0;
    const bob = tp.frames && moving && (def && def.foot) ? Math.sin(dist * TAU / tp.stride) * 0.02 : 0;
    ctx.save();
    ctx.translate(P.ox, P.oy); ctx.rotate(P.ang);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(P.Lm / 2, 0.02, P.Lm * 0.5, Math.max(0.1, P.Lm * 0.03), 0, 0, TAU); ctx.fill();
    ctx.translate(0, Math.abs(bob));
    const name = 'jungle/' + tp.body + (frame ? '_b' : '');
    const img = Sprites.raster(name, P.Lm * z * d) || (frame ? Sprites.raster('jungle/' + tp.body, P.Lm * z * d) : null);
    if (img) { ctx.scale(1, -1); ctx.drawImage(img, 0, -P.Hm, P.Lm, P.Hm); }
    else { ctx.fillStyle = (def && def.color) || '#9a6a3a'; ctx.fillRect(0, 0.1, P.Lm, Math.max(0.3, P.Hm * 0.7)); }
    ctx.restore();
    }
    if (tp.wheel) {
      const wname = tp.wheel === 'wheel' ? 'wheel' : 'jungle/' + tp.wheel;
      for (const i of tp.wheels) {
        const w = ws[i]; if (!w) continue;
        const r = w.r || (def && def.wheelRadius) || 0.35;
        const rot = typeof w.rot === 'number' ? -w.rot : 0;
        const wi = Sprites.raster(wname, 2 * r * z * d);
        ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(rot);
        if (wi) { ctx.scale(1, -1); ctx.drawImage(wi, -r, -r, 2 * r, 2 * r); }
        else { ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.fillStyle = '#9a7a4a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
    }
    // jeep exhaust (visual clock only)
    if (v.type === 'jeep' && this.effects && this.effects.exhaust && v.state === 'driving' && dt > 0 && !v.preview) {
      let t = exhaustT && exhaustT.get(v) || 0;
      t -= dt;
      if (t <= 0) {
        t = 0.14 + 0.1 * hash2(Math.floor(this.time * 10), 1, 2);
        const c = Math.cos(P.ang), s = Math.sin(P.ang), lx = 0.06 * P.k * 0 + 0.06, ly = 0.24 * P.k;
        this.effects.exhaust(P.ox + c * lx - s * ly, P.oy + s * lx + c * ly, v.vx || 0, 1);
      }
      if (exhaustT) exhaustT.set(v, t);
    }
  };

  // ------------------------------------------------------------------ bank tops: a jungle trail, not a road
  // The trail surface is at the same height as the road it replaces (vehicles walk on y), so only the look changes:
  // packed red earth with ruts and pebbles, a grassy lip, and log cribbing (jungle) or mossy ashlar (temple)
  // where a concrete abutment would be.
  const origBankTop = RP._drawBankTop;
  RP._drawBankTop = function (g, side, x0, x1, y, G, z) {
    if (!isJungle(this.level)) return origBankTop.apply(this, arguments);
    const px = 1 / z, ROAD = 0.42, VT = 0.7;
    const edge = side < 0 ? x1 : x0;
    const v = this._visibleWorld(40);
    const vx0 = Math.max(x0, v.x0 - 2), vx1 = Math.min(x1, v.x1 + 2);
    if (vx1 <= vx0) return;
    const T = this.terrain, temple = this.level.theme === 'jungle_temple';
    const ab0 = side < 0 ? edge - 1.7 : edge, ab1 = side < 0 ? edge : edge + 1.7, abBot = y - T.ABUT;
    const st = Math.max(0.3, 6 / z);
    // verge under the trail
    g.beginPath(); g.moveTo(vx0, y - ROAD); g.lineTo(vx1, y - ROAD);
    for (let x = vx1; x >= vx0 - st; x -= st) g.lineTo(x, y - ROAD - VT - (U.fbm(x * 0.6, 4, 2) - 0.5) * 0.35);
    g.closePath();
    const vg = g.createLinearGradient(0, y - ROAD, 0, y - ROAD - VT);
    vg.addColorStop(0, '#5a3c22'); vg.addColorStop(1, G.soil[0]);
    g.fillStyle = vg; g.fill();
    // the abutment: log cribbing or temple stones
    if (temple) {
      const rows = 5, hRow = (T.ABUT - ROAD) / rows;
      for (let i = 0; i < rows; i++) {
        const yy = abBot + i * hRow, off = i % 2 ? 0.45 : 0;
        for (let x = ab0 - off; x < ab1; x += 0.9) {
          const a = Math.max(x, ab0), b = Math.min(x + 0.9, ab1); if (b - a < 0.05) continue;
          const r = U.hash(Math.round(x * 13) + i * 7 + Math.round(edge));
          g.fillStyle = mix('#a39a80', '#7d7560', r * 0.6);
          g.fillRect(a + 0.02, yy + 0.02, b - a - 0.04, hRow - 0.04);
          g.fillStyle = 'rgba(255,250,230,0.18)'; g.fillRect(a + 0.02, yy + hRow - 0.08, b - a - 0.04, 0.06);
          if (r < 0.35) { g.fillStyle = 'rgba(70,120,50,0.55)'; g.beginPath(); g.ellipse((a + b) / 2, yy + hRow - 0.04, (b - a) * 0.35, 0.07, 0, 0, TAU); g.fill(); }
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(side < 0 ? ab1 - 0.1 : ab0, abBot, 0.1, T.ABUT - ROAD);
    } else {
      const n = 5, hRow = (T.ABUT - ROAD) / n;
      for (let i = 0; i < n; i++) { // logs laid along the trail, ends showing at the gap
        const yy = abBot + i * hRow + hRow / 2, rr = hRow * 0.52;
        const lg = g.createLinearGradient(0, yy - rr, 0, yy + rr);
        lg.addColorStop(0, '#4a2e18'); lg.addColorStop(0.5, '#7a5432'); lg.addColorStop(1, '#5e3e22');
        g.fillStyle = lg; g.fillRect(ab0, yy - rr, ab1 - ab0, 2 * rr);
        g.strokeStyle = 'rgba(40,24,10,0.45)'; g.lineWidth = 1.2 * px;
        g.beginPath(); g.moveTo(ab0, yy + rr * 0.3); g.lineTo(ab1, yy + rr * 0.3); g.moveTo(ab0, yy - rr * 0.4); g.lineTo(ab1, yy - rr * 0.4); g.stroke();
        const ex = edge, er = rr * 0.98; // the cut end, rings and all
        g.fillStyle = '#c89a62'; g.beginPath(); g.ellipse(ex, yy, er * 0.42, er, 0, 0, TAU); g.fill();
        g.strokeStyle = '#7a5432'; g.lineWidth = 1 * px;
        g.beginPath(); g.ellipse(ex, yy, er * 0.42, er, 0, 0, TAU); g.stroke();
        g.beginPath(); g.ellipse(ex, yy, er * 0.22, er * 0.52, 0, 0, TAU); g.stroke();
      }
      // a vine over the cribbing
      g.strokeStyle = '#3f7a2c'; g.lineWidth = 0.06;
      g.beginPath(); g.moveTo(ab0 + 0.3, y - ROAD); g.quadraticCurveTo((ab0 + ab1) / 2, abBot + 0.9, ab1 - 0.2, abBot + 0.4); g.stroke();
      for (let k = 0; k < 4; k++) leaf(g, ab0 + 0.4 + k * 0.32, y - ROAD - 0.35 - k * 0.35, 0.28, k % 2 ? 0.6 : 2.5, k % 2 ? '#5f9a36' : '#3f7a2c');
    }
    // the trail: packed earth
    const rg = g.createLinearGradient(0, y, 0, y - ROAD);
    rg.addColorStop(0, '#9a6a3e'); rg.addColorStop(0.3, '#7e5432'); rg.addColorStop(1, '#5a3a20');
    g.fillStyle = rg; g.fillRect(vx0, y - ROAD, vx1 - vx0, ROAD);
    g.fillStyle = '#b8875a'; g.fillRect(vx0, y - 0.06, vx1 - vx0, 0.06); // trodden top
    if (z > 4) { // ruts, pebbles and roots
      const sp = 0.55;
      for (let x = Math.floor(vx0 / sp) * sp; x < vx1; x += sp) {
        const r = U.hash(Math.round(x * 31) + 3), r2 = U.hash(Math.round(x * 17) + 9);
        if (r < 0.45) { g.fillStyle = r2 < 0.5 ? 'rgba(60,36,18,0.45)' : 'rgba(230,200,150,0.35)'; g.beginPath(); g.ellipse(x + r2 * 0.4, y - 0.12 - r * 0.5, 0.05 + r2 * 0.06, 0.03 + r * 0.03, 0, 0, TAU); g.fill(); }
        if (r > 0.9) { g.strokeStyle = 'rgba(70,44,24,0.8)'; g.lineWidth = 1.6 * px; g.beginPath(); g.moveTo(x, y - 0.05); g.quadraticCurveTo(x + 0.3, y - 0.28, x + 0.7, y - 0.36); g.stroke(); }
      }
    }
    // grass lip and tufts along the trail edge (behind and in front)
    if (z > 3) {
      g.fillStyle = '#4f9a3a';
      const sp = Math.max(0.12, 2.2 / z);
      g.beginPath();
      for (let x = vx0; x < vx1; x += sp) {
        if (x > ab0 - 0.05 && x < ab1 + 0.05) continue;
        const r = U.hash(Math.round(x * 40));
        if (r < 0.35) continue;
        const hh = 0.06 + r * 0.16;
        g.moveTo(x - 0.05, y - 0.02); g.lineTo(x + (r - 0.5) * 0.14, y + hh); g.lineTo(x + 0.05, y - 0.02);
      }
      g.fill();
      for (let x = Math.floor(vx0 / 2.3) * 2.3; x < vx1; x += 2.3) { // a fern or a fallen leaf now and then
        const r = U.hash(Math.round(x * 7) + 21);
        if (r > 0.3 || (x > ab0 - 0.5 && x < ab1 + 0.5)) continue;
        for (let k = 0; k < 4; k++) leaf(g, x, y - 0.02, 0.35 + r, -Math.PI / 2 + (k - 1.5) * 0.45 + Math.PI, k % 2 ? '#3f7a2c' : '#5f9a36');
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1 * px;
    g.beginPath(); g.moveTo(vx0, y - ROAD); g.lineTo(vx1, y - ROAD); g.stroke();
  };

  // ------------------------------------------------------------------ stone pillars (ruin piers / ruin anchors)
  function pillar(r, ctx, cx, base, top, w, opts) {
    opts = opts || {};
    const capH = 0.8 * w / 2.4;
    const bodyTop = top - capH;
    if (bodyTop <= base) return;
    const z = r.camera.zoom, px = 1 / z;
    const tileH = w * 2; // 200 x 400 sprite
    const pil = Sprites.raster('jungle/ruin_pillar', w * z * r.dpr);
    ctx.save();
    if (opts.ghost) ctx.globalAlpha = 0.55;
    if (opts.invalid) ctx.filter = 'none';
    // footing
    ctx.fillStyle = '#6a6652'; ctx.fillRect(cx - w * 0.72, base - 0.2, w * 1.44, 0.8);
    ctx.fillStyle = '#8a8470'; ctx.fillRect(cx - w * 0.72, base + 0.5, w * 1.44, 0.12);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2, base + 0.5, w, bodyTop - base - 0.5); ctx.clip();
    if (pil) {
      ctx.translate(cx, base + 0.5); ctx.scale(1, -1);
      for (let y = 0; y < bodyTop - base - 0.5 + tileH; y += tileH) ctx.drawImage(pil, -w / 2, -(y + tileH), w, tileH);
    } else {
      const gr = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      gr.addColorStop(0, '#a49e88'); gr.addColorStop(1, '#6c6854');
      ctx.fillStyle = gr; ctx.fillRect(cx - w / 2, base, w, bodyTop - base);
    }
    ctx.restore();
    // moss at the foot and below the cap
    ctx.fillStyle = 'rgba(70,130,50,0.6)';
    blob(ctx, cx - w * 0.15, base + 0.9, w * 0.5, 0.35); blob(ctx, cx + w * 0.2, bodyTop - 0.2, w * 0.4, 0.2);
    // cap
    const cap = Sprites.raster('jungle/ruin_cap', w * 1.2 * z * r.dpr);
    ctx.save(); ctx.translate(cx, top); ctx.scale(1, -1);
    if (cap) ctx.drawImage(cap, -w * 0.6, 0, w * 1.2, capH);
    else { ctx.fillStyle = '#9a9480'; ctx.fillRect(-w * 0.6, 0, w * 1.2, capH); }
    ctx.restore();
    if (opts.invalid) { ctx.fillStyle = 'rgba(220,60,40,0.4)'; ctx.fillRect(cx - w * 0.72, base, w * 1.44, top - base); }
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = px;
    ctx.restore();
  }
  // ------------------------------------------------------------------ timber piers (never concrete, challenges spec §4.1)
  // plain jungle: a lashed log trestle on a river-stone footing (tall) or a log crib (short); jungle_temple keeps the ruin
  // pillar; a land pylon (p.ground) is an A-frame log tower on any jungle theme. All of it is deterministic from the x.
  const WOOD = { dark: '#5e3e22', mid: '#7a5432', lit: '#9a6a3a', pole: '#6a4a2a', end: '#c89a62', rope: '#c9b58a', stoneA: '#7d7a68', stoneB: '#5f5c4e' };
  const tint = (col, invalid) => invalid ? mix(col, '#d03828', 0.55) : col;
  /** a log from a to b (butt ends) with a lit stripe along its upper side; `ends` paints the sawn rings */
  function logPole(ctx, ax, ay, bx, by, w, col, invalid, ends) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = tint(col, invalid); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.save();
    ctx.globalAlpha *= 0.5; ctx.strokeStyle = tint(WOOD.lit, invalid); ctx.lineWidth = w * 0.28;
    ctx.beginPath(); ctx.moveTo(ax + nx * w * 0.22, ay + ny * w * 0.22); ctx.lineTo(bx + nx * w * 0.22, by + ny * w * 0.22); ctx.stroke();
    ctx.restore();
    if (ends) {
      ctx.fillStyle = tint(WOOD.end, invalid);
      const ang = Math.atan2(dy, dx);
      for (const e of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.ellipse(e[0], e[1], w * 0.2, w * 0.5, ang, 0, TAU); ctx.fill(); }
    }
  }
  /** three rope wraps across a pole of width w at (x, y); ang = the pole's direction */
  function lashing(ctx, x, y, ang, w, invalid) {
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    ctx.strokeStyle = tint(WOOD.rope, invalid); ctx.lineWidth = Math.max(0.05, w * 0.2); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) {
      const ox = x + ux * k * w * 0.3, oy = y + uy * k * w * 0.3;
      ctx.moveTo(ox + nx * w * 0.62 - ux * w * 0.06, oy + ny * w * 0.62 - uy * w * 0.06); ctx.lineTo(ox - nx * w * 0.62 + ux * w * 0.06, oy - ny * w * 0.62 + uy * w * 0.06);
    }
    ctx.stroke();
  }
  /** a footing of rounded river stones whose tops are at about baseY + 0.55; moss on some */
  function stoneFooting(ctx, x, baseY, width, invalid) {
    const sd = Math.round(x * 10), n = Math.max(3, Math.round(width / 0.8));
    ctx.fillStyle = tint(WOOD.stoneB, invalid);
    ctx.fillRect(x - width / 2 + 0.15, baseY - 0.05, width - 0.3, 0.3);
    for (let k = 0; k < n; k++) {
      const h1 = hash2(sd, k, 31), h2 = hash2(sd, k, 32);
      const sx = x - width / 2 + (k + 0.5) * width / n + (h1 - 0.5) * 0.25, rx = width / n * (0.55 + h2 * 0.2), ry = 0.26 + h1 * 0.12;
      const sy = baseY + 0.28 + (k % 2 ? 0.14 : 0);
      ctx.fillStyle = tint(k % 2 ? WOOD.stoneB : WOOD.stoneA, invalid);
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(sx + rx * 0.15, sy - ry * 0.35, rx * 0.7, ry * 0.45, 0, 0, TAU); ctx.fill();
      if (!invalid && h1 > 0.4) { ctx.fillStyle = 'rgba(80,140,50,0.55)'; ctx.beginPath(); ctx.ellipse(sx - rx * 0.1, sy + ry * 0.75, rx * 0.75, ry * 0.32, 0, 0, TAU); ctx.fill(); }
    }
  }
  function waterStain(ctx, r, x, baseY, topY, hw, redraw) { // repaint what is below the waterline darker, clipped to it
    const t = r.level.terrain;
    if (t.waterY === null || t.waterY === undefined || r.theme.lava || !(t.waterY > baseY && t.waterY < topY)) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - hw, baseY - 1, hw * 2, t.waterY - baseY + 1.3); ctx.clip();
    redraw('rgba(30,48,40,0.38)');
    ctx.restore();
  }
  function timberPier(r, ctx, p, ghost, invalid) {
    const x = p.x, baseY = p.baseY, topY = p.topY, footTop = baseY + 0.55, capH = 0.42, capY = topY - capH;
    const crib = topY - baseY < 3;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.55;
    stoneFooting(ctx, x, baseY, crib ? 3.2 : 3.6, invalid);
    const draw = (stain) => { // the whole timberwork; `stain` repaints it in one flat colour (the water line)
      const ends = !stain;
      const pole = (ax, ay, bx, by, w, c, en) => {
        if (stain) { ctx.lineCap = 'butt'; ctx.strokeStyle = stain; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); } else logPole(ctx, ax, ay, bx, by, w, c, invalid, en);
      };
      if (crib) {
        const H = Math.max(0.2, topY - footTop), nl = Math.max(1, Math.round(H / 0.42)), th = H / nl;
        for (let k = 0; k < nl; k++) {
          const yc = footTop + (k + 0.5) * th, across = (nl - 1 - k) % 2 === 0, c = mix(WOOD.dark, WOOD.mid, hash2(Math.round(x * 10), k, 5));
          if (across) {
            pole(x - 1.25, yc, x + 1.25, yc, th * 0.94, c, true);
          } else {
            pole(x - 0.75, yc, x + 0.75, yc, th * 0.62, WOOD.dark, false);
            for (const ox of [-0.75, 0.75]) {
              ctx.fillStyle = stain || tint(c, invalid); ctx.beginPath(); ctx.arc(x + ox, yc, th * 0.48, 0, TAU); ctx.fill();
              if (ends) { ctx.fillStyle = tint(WOOD.end, invalid); ctx.beginPath(); ctx.arc(x + ox, yc, th * 0.3, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(70,40,15,0.55)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.arc(x + ox, yc, th * 0.17, 0, TAU); ctx.stroke(); }
            }
          }
        }
        if (ends) for (const ox of [-0.8, 0.8]) lashing(ctx, x + ox, topY - th / 2, Math.PI / 2, th * 0.94, invalid);
      } else {
        const H = capY - footTop, n = Math.max(1, Math.round(H / 2.5));
        const lx = (y) => 1.35 - 0.5 * (y - footTop) / H; // half-spacing of the legs: raked in towards the cap
        pole(x - lx(footTop), footTop - 0.1, x - lx(capY), capY, 0.36, WOOD.dark, true);
        pole(x + lx(footTop), footTop - 0.1, x + lx(capY), capY, 0.36, WOOD.dark, true);
        for (let k = 0; k < n; k++) {
          const y0 = footTop + H * k / n, y1 = footTop + H * (k + 1) / n;
          pole(x - lx(y0), y0, x + lx(y1), y1, 0.17, WOOD.pole, false);
          pole(x + lx(y0), y0, x - lx(y1), y1, 0.17, WOOD.pole, false);
          if (k > 0) pole(x - lx(y0), y0, x + lx(y0), y0, 0.2, WOOD.pole, false);
        }
        if (ends) {
          for (let k = 0; k < n; k++) {
            const y0 = footTop + H * k / n, y1 = footTop + H * (k + 1) / n, ym = (y0 + y1) / 2, ang = Math.atan2(y1 - y0, lx(y1) + lx(y0));
            lashing(ctx, x, ym, ang, 0.17, invalid); lashing(ctx, x, ym, -ang, 0.17, invalid);
            if (k > 0) for (const s of [-1, 1]) lashing(ctx, x + s * lx(y0), y0, Math.PI / 2, 0.36, invalid);
          }
          for (const s of [-1, 1]) lashing(ctx, x + s * lx(capY), capY - 0.1, Math.PI / 2, 0.36, invalid);
        }
        pole(x - 1.15, topY - capH / 2, x + 1.15, topY - capH / 2, capH, WOOD.mid, true);
        if (ends) for (const s of [-1, 1]) lashing(ctx, x + s * lx(capY), topY - capH / 2, 0, capH, invalid);
      }
    };
    draw(null);
    waterStain(ctx, r, x, baseY, topY, 1.8, draw);
    if (invalid) { ctx.fillStyle = 'rgba(220,60,40,0.22)'; ctx.fillRect(x - 1.5, baseY, 3, topY - baseY); }
    ctx.restore();
  }
  /** land pylon: an A-frame of lashed logs on a stone footing, tilting with the live top (p.topX) like the concrete one */
  function aframePylon(r, ctx, p, ghost, invalid) {
    const x = p.x, baseY = p.baseY, tx = p.topX !== undefined ? p.topX : x, ty = p.topY;
    const dx = tx - x, dy = ty - baseY, len = Math.hypot(dx, dy);
    if (len < 0.2) return;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.55;
    stoneFooting(ctx, x, baseY - 0.55, 4.0, invalid);
    ctx.translate(x, baseY + 0.1);
    ctx.rotate(Math.atan2(-dx, dy));
    const L = len - 0.1, capH = 0.45, wb = 1.1, wt = 0.42, hw = (u) => wb + (wt - wb) * (u / L);
    logPole(ctx, -wb, 0, -wt, L - capH, 0.4, WOOD.dark, invalid, true);
    logPole(ctx, wb, 0, wt, L - capH, 0.4, WOOD.dark, invalid, true);
    for (const f of [0.3, 0.62]) { const u = L * f; logPole(ctx, -hw(u), u, hw(u), u, 0.22, WOOD.pole, invalid, false); lashing(ctx, -hw(u), u, Math.PI / 2, 0.4, invalid); lashing(ctx, hw(u), u, Math.PI / 2, 0.4, invalid); }
    logPole(ctx, -hw(L * 0.3), L * 0.3, hw(L * 0.62), L * 0.62, 0.18, WOOD.pole, invalid, false);
    logPole(ctx, hw(L * 0.3), L * 0.3, -hw(L * 0.62), L * 0.62, 0.18, WOOD.pole, invalid, false);
    logPole(ctx, -wt - 0.5, L - capH / 2, wt + 0.5, L - capH / 2, capH, WOOD.mid, invalid, true);
    for (const s of [-1, 1]) lashing(ctx, s * wt, L - capH / 2, 0, capH, invalid);
    if (!invalid && !p.failed && p.footing > 0.85) { // footing about to give way
      ctx.fillStyle = 'rgba(255,60,40,' + (0.25 + 0.3 * Math.min(1, (p.footing - 0.85) / 0.15)) + ')';
      ctx.fillRect(-wb - 0.3, -0.2, wb * 2 + 0.6, 1.0);
    }
    ctx.restore();
  }
  const origPier = RP._drawPierItem;
  RP._drawPierItem = function (ctx, p, ghost, invalid) {
    if (!isJungle(this.level)) return origPier.apply(this, arguments);
    JungleFx.hits++; JungleFx.pierHits++;
    if (p.ground) { JungleFx.pierKinds.aframe++; return safe(() => aframePylon(this, ctx, p, ghost, invalid)); }
    if (!(p.topY > p.baseY + 0.1)) return;
    if (this.themeId === 'jungle_temple') { JungleFx.pierKinds.pillar++; return pillar(this, ctx, p.x, p.baseY, p.topY, 2.0, { ghost, invalid }); }
    JungleFx.pierKinds[p.topY - p.baseY < 3 ? 'crib' : 'trestle']++;
    safe(() => timberPier(this, ctx, p, ghost, invalid));
  };

  // ------------------------------------------------------------------ anchors: lashing knots on trees, ground stakes
  /** sim.trees by anchor index while a run (or its results) is on screen; null in edit mode and the undeformed view,
   *  and on a build of the physics without bending trees (then the trees are drawn at rest) */
  function liveTrees(r) {
    const st = r._jst;
    if (!st || !st.sim || st.mode === 'edit' || (st.mode === 'results' && st.undeformed)) return null;
    const list = st.sim.trees;
    if (!list || !list.length) return null;
    const m = {};
    for (const e of list) if (e && e.anchor !== undefined && isFinite(e.x) && isFinite(e.y)) m[e.anchor] = e;
    return m;
  }
  const hasStake = (L) => !!(L && L.anchors && L.anchors.some(a => a.deco === 'stake'));
  /** a ground stake: a sharpened peg leaning away from the gap, a lashing and a rope knot at the anchor point */
  function drawStake(r, ctx, a, i, L, edit, used) {
    const T = L.terrain, left = a.x < (T.leftEdge + T.rightEdge) / 2, rot = left ? 0.26 : -0.26, away = left ? -1 : 1;
    JungleFx.stakes++;
    ctx.save();
    if (edit && used && !used['a' + i]) { // an unused anchor pulses, like the others
      const p = 0.5 + 0.5 * Math.sin(r.time * 3 + i);
      ctx.fillStyle = 'rgba(255,214,90,' + (0.18 + 0.22 * p) + ')';
      ctx.beginPath(); ctx.arc(a.x, a.y, 0.55 + 0.25 * p, 0, TAU); ctx.fill();
    }
    spriteBox(r, ctx, 'stake', a.x, a.y, 0.4, { top: 0.9, rot, fallback: '#7a5432' });
    // the rope comes down from the peg's lashing to a knot at the anchor point
    const lx = a.x + away * 0.13, ly = a.y + 0.42;
    ctx.strokeStyle = '#c9b58a'; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(a.x + away * 0.05, a.y + 0.3, a.x, a.y + 0.07); ctx.stroke();
    ctx.fillStyle = '#8a7648'; ctx.beginPath(); ctx.arc(a.x, a.y + 0.07, 0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d8c698'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(a.x, a.y + 0.07, 0.1, 0, TAU); ctx.stroke();
    ctx.restore();
    if (edit) { // the label sits under the peg, in screen space
      ctx.save();
      r._screenXf(ctx);
      const s = r.worldToScreen(a.x, a.y);
      r._label(ctx, s.x, s.y + 20, tr('features.jungle.label.stake'), 'rgba(40,32,10,0.8)', '#ffd860', 10);
      ctx.restore();
    }
  }
  const origAnchors = RP._drawAnchors;
  RP._drawAnchors = function (ctx, L, edit, used) {
    if (isJungle(L)) { // lashed posts (or temple stone) for the bolts, not concrete with hazard stripes
      const live = liveTrees(this), anchors = L.anchors || [], stakes = [];
      let L2 = L;
      if (hasStake(L) || live) { // stakes get no bolt (drawn below); a bending tree's knot sits at its live joint
        L2 = Object.assign({}, L, { anchors: anchors.map((a, i) => {
          if (a.deco === 'stake') { stakes.push(i); return Object.assign({}, a, { x: -1e6 }); }
          const e = live && live[i];
          return e ? Object.assign({}, a, { x: e.x, y: e.y }) : a;
        }) });
      }
      const raster = Sprites.raster, alt = 'jungle/anchor_' + (L.theme === 'jungle_temple' ? 'stone' : 'wood');
      Sprites.raster = function (n) { return raster.apply(Sprites, [n === 'anchor' ? alt : n].concat([].slice.call(arguments, 1))) || (n === 'anchor' ? raster.apply(Sprites, arguments) : null); };
      try { jungleAnchors.call(this, ctx, L2, edit, used); } finally { Sprites.raster = raster; }
      for (const i of stakes) safe(() => drawStake(this, ctx, anchors[i], i, L, edit, used));
      return;
    }
    return jungleAnchors.apply(this, arguments);
  };
  const jungleAnchors = function (ctx, L) {
    if (L && L.anchors && L.anchors.some(a => a.deco === 'tree')) {
      JungleFx.hits++;
      safe(() => {
        const z = this.camera.zoom, px = 1 / z;
        ctx.save();
        ctx.strokeStyle = '#c9b58a'; ctx.lineWidth = Math.max(0.05, 1.6 * px); ctx.lineCap = 'round';
        for (const a of L.anchors) {
          if (a.deco !== 'tree') continue;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) { const o = -0.12 + k * 0.12; ctx.moveTo(a.x + o - 0.14, a.y - 0.2); ctx.lineTo(a.x + o + 0.14, a.y + 0.2); }
          ctx.stroke();
        }
        ctx.restore();
      });
    }
    return origAnchors.apply(this, arguments);
  };
  // the joint caps drawn over the anchors: none on a stake, and on a bending tree at the live joint
  const origJoints = RP._drawJoints;
  RP._drawJoints = function (ctx, pts) {
    const L = this.level, live = isJungle(L) && pts ? liveTrees(this) : null;
    if (!pts || !isJungle(L) || !(live || hasStake(L))) return origJoints.apply(this, arguments);
    const anchors = L.anchors || [], out = [];
    for (const p of pts) {
      const i = anchors.indexOf(p);
      if (i >= 0 && anchors[i].deco === 'stake') continue;
      const e = i >= 0 && live && live[i];
      out.push(e ? { x: e.x, y: e.y } : p);
    }
    return origJoints.call(this, ctx, out);
  };
  // anchor blocks buried in the bank: a timber block (never concrete); a stake has none
  const origDeadman = RP._drawDeadman;
  RP._drawDeadman = function (ctx, a) {
    const L = this.level;
    if (!isJungle(L)) return origDeadman.apply(this, arguments);
    const an = L.anchors && L.anchors[a.i];
    if (an && an.deco === 'stake') return;
    JungleFx.hits++;
    safe(() => {
      const s = a.side;
      let x0, y0, x1, y1;
      if (a.kind === 'hill') { x0 = Math.min(a.x - s * 2.4, a.x + s * 0.12); x1 = Math.max(a.x - s * 2.4, a.x + s * 0.12); y0 = a.y - 1.9; y1 = a.y + 0.35; }
      else { x0 = a.x - 1.2; x1 = a.x + 1.2; y0 = a.surfaceY - 1.7; y1 = a.surfaceY; }
      ctx.save();
      const n = Math.max(2, Math.round((y1 - y0) / 0.4)), th = (y1 - y0) / n;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = mix(WOOD.dark, WOOD.mid, hash2(Math.round(a.x * 10), k, 6));
        ctx.fillRect(x0, y0 + k * th + 0.02, x1 - x0, th - 0.04);
        ctx.fillStyle = WOOD.end; ctx.beginPath(); ctx.ellipse(x1, y0 + (k + 0.5) * th, 0.1, th * 0.45, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#c9b58a'; ctx.lineWidth = 0.09; ctx.lineCap = 'round'; // rope up to the anchor point
      ctx.beginPath(); ctx.moveTo(a.kind === 'hill' ? a.x + s * 0.1 : a.x, a.kind === 'hill' ? a.y - 0.3 : y1 - 0.3); ctx.lineTo(a.x, a.y); ctx.stroke();
      ctx.restore();
    });
  };

  // ------------------------------------------------------------------ per-frame state (set by render)
  function simTime(r) { const s = r._jst && r._jst.sim; return s && typeof s.time === 'number' ? s.time : r.time; }
  const REPLY_AT = 2.6, SAY = 2.6;

  function track(r, state) {
    const L = state && state.level;
    let J = r._jfx;
    const sim = state && state.mode !== 'edit' ? state.sim : null;
    if (!J || J.level !== L || J.sim !== sim) J = r._jfx = { level: L, sim, meet: null, lost: null, pos: null, cameoT: null };
    if (!sim || !L) return J;
    const T = L.terrain;
    if (finaleLevel(L) && sim.vehicles) {
      for (const v of sim.vehicles) {
        if (!v || v.type !== 'livingstone' || !v.wheels || !v.wheels.length) continue;
        let x0 = 1e9, y0 = 0;
        for (const w of v.wheels) if (w.x < x0) { x0 = w.x; y0 = w.y; }
        J.pos = { x: x0 + 0.5, y: y0 + 1.8 };
        if (v.state === 'fallen' && J.lost === null) J.lost = sim.time;
        const rear = x0 - 0.15;
        if (J.meet === null && J.lost === null && rear >= T.rightEdge + 2) {
          J.meet = { g: Math.max(0, sim.time - (rear - (T.rightEdge + 2)) / Math.max(Math.abs(v.vx || 0), 0.5)) };
        }
        J.vstate = v.state;
      }
    } else if (!finaleLevel(L) && sim.status === 'success' && J.cameoT === null && cameo(L, sim)) {
      J.cameoT = r.time;
    }
    return J;
  }
  const origRender = RP.render;
  RP.render = function (state) {
    this._jst = state || null;
    const L = state && state.level;
    if (!isJungle(L)) { this._jfx = null; return origRender.apply(this, arguments); }
    JungleFx.hits++;
    // sprites that finished loading after the static layers were drawn
    if (this._jsv !== Sprites.version) { this._jsv = Sprites.version; this._backKey = this._midKey = ''; }
    safe(() => track(this, state));
    return origRender.apply(this, arguments);
  };

  // ------------------------------------------------------------------ world pass (behind the beams, before the water)
  function propAt(r, side, i, T) { // the bank prop (i-th cell) as _drawProps places it
    const rr = hash2(i, T.seed, 41 + side), x = i * 5.5 + rr * 5.5 * 0.7, r2 = hash2(i, T.seed, 77);
    return { x, r: rr, r2, tree: rr < 0.28, h: 8 + r2 * 8 };
  }
  function perchSpots(r, L, T) { // tree spots for the parrot and the resting monkeys: [{x, y}] (left first)
    const spots = [];
    (L.anchors || []).forEach((a, ai) => { if (a.deco === 'tree' && a.y > Math.max(T.ly, T.ry) + 1) spots.push({ ai, x: a.x - (a.x < (T.le + T.re) / 2 ? 1.0 : -1.0) * 0.6, y: a.y + 0.05, anchor: true, side: a.x < (T.le + T.re) / 2 ? 0 : 1 }); });
    for (let side = 0; side < 2; side++) {
      let n = 0;
      for (let i = side ? Math.ceil((T.re + 6) / 5.5) : Math.floor((T.le - 6) / 5.5); n < 2 && Math.abs(i * 5.5 - (side ? T.re : T.le)) < 60; i += side ? 1 : -1) {
        const p = propAt(r, side, i, T);
        if (!p.tree || (side ? p.x < T.re + 6 : p.x > T.le - 6)) continue;
        spots.push({ x: p.x, y: (side ? T.ry : T.ly) + p.h * 0.55, side, branchOut: side ? -1 : 1 });
        n++;
      }
    }
    return spots;
  }
  function branch(ctx, x, y, dir, len) {
    ctx.save();
    ctx.strokeStyle = '#4a3524'; ctx.lineCap = 'round'; ctx.lineWidth = 0.22;
    ctx.beginPath(); ctx.moveTo(x - dir * len * 0.5, y - 0.15); ctx.quadraticCurveTo(x, y - 0.1, x + dir * len * 0.5, y + 0.1); ctx.stroke();
    ctx.restore();
  }
  /** root base of tree anchor i: Model.treeBase when the model has it (docs/challenges/SPEC-CHALLENGES.md §1.4), else the same
   *  defaults worked out here: an edge tree 1.1 m behind the edge on the bank, a mid-gap tree on the floor. side: -1 left bank */
  function treeBaseFor(L, i, gy) {
    const a = L.anchors[i], Mo = BG.Model, T = L.terrain;
    const mid = (T.leftEdge + T.rightEdge) / 2, side = a.x < mid ? -1 : 1;
    const edge = Math.abs(a.x - T.leftEdge) <= 1.2 || Math.abs(a.x - T.rightEdge) <= 1.2;
    let x = edge ? a.x + side * 1.1 : a.x, y = edge ? (side < 0 ? T.leftY : T.rightY) : (gy ? gy(a.x) : T.floorY);
    const spec = a.tree && typeof a.tree === 'object' ? a.tree : {};
    if (spec.baseX !== undefined) x = spec.baseX;
    if (spec.baseY !== undefined) y = spec.baseY;
    if (Mo && typeof Mo.treeBase === 'function') {
      try { const b = Mo.treeBase(L, i); if (b && isFinite(b.x) && isFinite(b.y)) { x = b.x; y = b.y; } } catch (e) { /* keep the defaults */ }
    }
    return { x, y, side, edge };
  }
  /** where the trunk is drawn from: the root base, sunk 0.3 m into the bank */
  function treeBase(L, i, gy) { const b = treeBaseFor(L, i, gy); return { x: b.x, y: b.y - 0.3 }; }
  const rot = (x, y, c, s) => ({ x: x * c - y * s, y: x * s + y * c });
  /** the tree as one rigid body turning about its base: the rest pose, or the live one from sim.trees (ent) */
  function treePose(L, a, i, gy, ent) {
    const tb = treeBaseFor(L, i, gy), B = { x: tb.x, y: tb.y - 0.3 };
    const v0x = a.x - B.x, v0y = a.y - B.y, len0 = Math.hypot(v0x, v0y) || 1, ux = v0x / len0, uy = v0y / len0;
    const limb = tb.edge && Math.abs(a.x - tb.x) <= 1.3; // an edge tree's limb reaches over the gap edge to the anchor
    const top0 = limb ? { x: tb.x, y: a.y + 1.6 } : { x: a.x + ux * 1.6, y: a.y + uy * 1.6 };
    const limb0 = limb ? { x: tb.x, y: a.y - 0.9 } : null;
    let delta = 0, s = 1, J = { x: a.x, y: a.y };
    if (ent) {
      J = { x: ent.x, y: ent.y };
      delta = Math.atan2(J.y - B.y, J.x - B.x) - Math.atan2(v0y, v0x);
      if (delta > Math.PI) delta -= TAU; else if (delta < -Math.PI) delta += TAU;
      s = clamp(Math.hypot(J.x - B.x, J.y - B.y) / len0, 0.5, 1.5);
    }
    const c = Math.cos(delta) * s, sn = Math.sin(delta) * s;
    const M = (p) => { const q = rot(p.x - B.x, p.y - B.y, c, sn); return { x: B.x + q.x, y: B.y + q.y }; };
    return { B, tb, limb, top0, limb0, top: M(top0), J, delta, rest: Math.atan2(top0.y - B.y, top0.x - B.x), ratio: ent ? ent.ratio || 0 : 0, up: !!(ent && ent.uprooted), live: !!ent };
  }
  function stressOn(r) { const st = r._jst; return !!st && st.mode !== 'edit' && !!(st.peakView || (st.mode === 'results' && st.peakView !== false) || st.showStress !== false); }
  const SOIL = '#4a3524', SOIL_LIT = '#6b4a2e';
  function drawTreeAnchor(r, ctx, a, L, T, i, ent, J) {
    const P = treePose(L, a, i, (x) => r.groundY(x), ent), B = P.B, top = P.top, top0 = P.top0;
    const hx = top.x - B.x, hy = top.y - B.y, h = Math.hypot(hx, hy), h0 = Math.hypot(top0.x - B.x, top0.y - B.y);
    if (!(h0 > 1)) return;
    const side = a.x < (T.le + T.re) / 2 ? -1 : 1;
    const bw = 1.5, tw = 0.48, d = P.delta;
    // trunk: a quadratic from the base to the top. Its tangent at the roots stays on the rest direction, so it bows with the pull
    const dir0 = { x: Math.cos(P.rest), y: Math.sin(P.rest) };
    const bow = P.live && !P.up;
    const C = bow ? { x: B.x + dir0.x * h * 0.55, y: B.y + dir0.y * h * 0.55 } : { x: B.x + hx / 2, y: B.y + hy / 2 };
    const at = (t) => { const u = 1 - t; return { x: u * u * B.x + 2 * u * t * C.x + t * t * top.x, y: u * u * B.y + 2 * u * t * C.y + t * t * top.y }; };
    const tan = (t) => { const u = 1 - t, x = 2 * u * (C.x - B.x) + 2 * t * (top.x - C.x), y = 2 * u * (C.y - B.y) + 2 * t * (top.y - C.y), l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
    const N = 18, mid = [], lft = [], rgt = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N, p = at(t), g = tan(t), w = tw - 0.07 * t + (bw - tw) * Math.pow(Math.max(0, 1 - t / 0.3), 2.2);
      mid.push(p); lft.push({ x: p.x - g.y * w, y: p.y + g.x * w }); rgt.push({ x: p.x + g.y * w, y: p.y - g.x * w });
    }
    ctx.save();
    // an uprooted tree: the pit it left, and its root plate turning with the trunk (soil, strands)
    if (P.up) {
      JungleFx.treeUp++;
      const gy0 = P.tb.y;
      ctx.fillStyle = '#1c120a'; ctx.beginPath(); ctx.ellipse(B.x, gy0 + 0.05, 1.5, 0.3, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(B.x, B.y); ctx.rotate(Math.atan2(hy, hx) - Math.PI / 2);
      ctx.strokeStyle = '#3a281a'; ctx.lineCap = 'round';
      for (let k = 0; k < 7; k++) {
        const o = (k - 3) / 3 * 1.35, hh = hash2(k, a.x * 10 | 0, 9);
        ctx.lineWidth = 0.1 + hh * 0.08;
        ctx.beginPath(); ctx.moveTo(o * 0.7, 0.05); ctx.quadraticCurveTo(o * 1.2, -0.5 - hh * 0.3, o * 1.1 + (hh - 0.5) * 0.5, -0.95 - hh * 0.5); ctx.stroke();
      }
      ctx.fillStyle = SOIL; ctx.beginPath(); ctx.ellipse(0, 0.05, 1.6, 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e1f12'; ctx.beginPath(); ctx.ellipse(0, -0.02, 1.2, 0.32, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = SOIL_LIT; ctx.beginPath(); ctx.ellipse(-0.4, 0.2, 0.5, 0.14, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // stress view: the root flare glows with the root load, red and pulsing from 0.85
    if (P.live && !P.up && stressOn(r) && Renderer.stressColor) {
      const rr = clamp(P.ratio, 0, 1.2), hot = rr >= 0.85, a0 = 0.16 + 0.34 * Math.min(1, rr) + (hot ? 0.2 * (0.5 + 0.5 * Math.sin(r.time * 9)) : 0);
      const gr = ctx.createRadialGradient(B.x, B.y + 0.5, 0.1, B.x, B.y + 0.5, 2.0);
      gr.addColorStop(0, Renderer.stressColor(Math.min(1, rr), a0)); gr.addColorStop(1, Renderer.stressColor(Math.min(1, rr), 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(B.x, B.y + 0.5, 2.0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = SOIL;
    ctx.beginPath(); ctx.moveTo(lft[0].x, lft[0].y);
    for (let k = 1; k <= N; k++) ctx.lineTo(lft[k].x, lft[k].y);
    for (let k = N; k >= 0; k--) ctx.lineTo(rgt[k].x, rgt[k].y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SOIL_LIT; // the lit side
    ctx.beginPath(); ctx.moveTo(mid[0].x, mid[0].y);
    for (let k = 1; k <= N; k++) ctx.lineTo(mid[k].x, mid[k].y);
    for (let k = N; k >= 0; k--) ctx.lineTo(rgt[k].x, rgt[k].y);
    ctx.closePath(); ctx.fill();
    // bark furrows, along the curve
    ctx.strokeStyle = 'rgba(30,18,8,0.45)'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * tw * 0.38, t0 = (0.5 + hash2(k, a.x * 10 | 0, 1) * 1.5) / h0, t1 = 1 - (0.3 + hash2(k, a.x * 10 | 0, 2) * 2) / h0;
      ctx.beginPath();
      for (let m = 0; m <= 6; m++) { const t = t0 + (t1 - t0) * m / 6, p = at(t), g = tan(t), o = off * (1 - 0.15 * t); m ? ctx.lineTo(p.x + g.y * o, p.y - g.x * o) : ctx.moveTo(p.x + g.y * o, p.y - g.x * o); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(80,140,50,0.55)'; blob(ctx, B.x - bw * 0.4, B.y + 0.4, 0.7, 0.3); // moss on the roots
    // roots heave on the side away from the lean as the load nears what they hold
    if (P.live && !P.up && P.ratio > 0.3) {
      const hv = Math.min(1.2, (P.ratio - 0.3) / 0.7), ls = d < 0 ? -1 : 1, hxm = B.x + ls * 0.95, gy0 = P.tb.y;
      ctx.fillStyle = SOIL; ctx.beginPath(); ctx.ellipse(hxm, gy0 + 0.1 + 0.2 * hv, 0.85, 0.12 + 0.28 * hv, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = SOIL_LIT; ctx.beginPath(); ctx.ellipse(hxm - ls * 0.15, gy0 + 0.2 + 0.28 * hv, 0.55, 0.08 + 0.12 * hv, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a281a'; ctx.lineWidth = 0.11; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(B.x + ls * 0.5, B.y + 0.35); ctx.quadraticCurveTo(B.x + ls * 1.1, B.y + 0.4 + 0.3 * hv, B.x + ls * 1.7, B.y + 0.25 + 0.35 * hv); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,12,6,0.6)'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(B.x + ls * 1.9, gy0 + 0.08); ctx.lineTo(B.x + ls * 2.25, gy0 - 0.12); ctx.moveTo(B.x + ls * 2.1, gy0 + 0.05); ctx.lineTo(B.x + ls * 2.6, gy0 + 0.0); ctx.stroke();
    }
    // the limb that carries the anchor: from the trunk to the joint (live)
    if (P.limb) {
      const tl = clamp(Math.hypot(P.limb0.x - B.x, P.limb0.y - B.y) / h0, 0, 1), q = at(tl), c2 = Math.cos(d), s2 = Math.sin(d);
      const o = rot(side * 0.3, -0.6, c2, s2), e = rot(0, -0.05, c2, s2);
      ctx.strokeStyle = SOIL; ctx.lineWidth = 0.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.quadraticCurveTo(P.J.x + o.x, P.J.y + o.y, P.J.x + e.x, P.J.y + e.y); ctx.stroke();
    }
    // crown, turning with the top
    const cr = Math.min(3.4, 1.6 + h0 * 0.14), cy = cr * 0.35;
    ctx.translate(top.x, top.y); ctx.rotate(P.up ? Math.atan2(hy, hx) - P.rest : d);
    ctx.fillStyle = '#1f5a30'; blob(ctx, 0, cy, cr * 1.2, cr * 0.75);
    ctx.fillStyle = '#2f7a3a'; blob(ctx, -cr * 0.4, cy + cr * 0.3, cr * 0.9, cr * 0.6);
    ctx.fillStyle = '#3f9a44'; blob(ctx, cr * 0.35, cy + cr * 0.45, cr * 0.65, cr * 0.42);
    ctx.fillStyle = '#5fb04e'; blob(ctx, -cr * 0.05, cy + cr * 0.68, cr * 0.4, cr * 0.24);
    ctx.restore();
    if (ent) JungleFx.treesBent++;
    // the toppling kicks up dust and clods, once
    if (P.up && J && !J.up[i] && r.effects) {
      J.up[i] = 1;
      safe(() => { r.effects.derailDust(B.x, P.tb.y + 0.3, 14, 1.8); r.effects.dust(B.x, P.tb.y + 0.5, 12, 'rgba(90,64,40,1)', 1.5); });
    }
  }
  function drawWaterfall(r, ctx, wf, L, T, t, v, z) {
    const wy = wetLevel(L) ? L.terrain.waterY : r.groundY((wf.x0 + wf.x1) / 2);
    const top = wf.top !== undefined ? wf.top : v.y1 + 4;
    if (!(top > wy + 0.5)) return;
    const w = wf.x1 - wf.x0, px = 1 / z;
    ctx.save();
    if (wf.top !== undefined) { // mossy ledge the water pours over
      ctx.fillStyle = '#5a5a48'; ctx.fillRect(wf.x0 - 1.2, top - 0.2, w + 2.4, 0.9);
      ctx.fillStyle = '#3f8a3a'; ctx.fillRect(wf.x0 - 1.2, top + 0.6, w + 2.4, 0.3);
    }
    const gr = ctx.createLinearGradient(wf.x0, 0, wf.x1, 0);
    gr.addColorStop(0, 'rgba(120,190,185,0.82)'); gr.addColorStop(0.5, 'rgba(210,240,236,0.88)'); gr.addColorStop(1, 'rgba(110,180,178,0.82)');
    ctx.fillStyle = gr; ctx.fillRect(wf.x0, wy, w, top - wy);
    ctx.lineCap = 'butt';
    const n = Math.max(4, Math.ceil(w / 0.32));
    for (let k = 0; k < n; k++) {
      const x = wf.x0 + (k + 0.5) / n * w, ph = hash2(k, 4, 8) * 6;
      ctx.strokeStyle = k % 3 ? 'rgba(255,255,255,0.75)' : 'rgba(60,150,150,0.5)';
      ctx.lineWidth = Math.max(0.05, w / n * 0.55);
      ctx.setLineDash([0.9 + hash2(k, 1, 9) * 1.6, 1.2 + hash2(k, 2, 9) * 2.2]);
      ctx.lineDashOffset = t * 8 + ph;
      ctx.beginPath(); ctx.moveTo(x, wy); ctx.lineTo(x, top); ctx.stroke();
    }
    ctx.setLineDash([]);
    // mist puffs and the foam ring at the bottom
    for (let k = 0; k < 9; k++) {
      const ph = (t * 0.35 + k / 9) % 1, mx = wf.x0 + w / 2 + Math.sin(k * 2.3 + t * 0.4) * w * 0.7;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.38 * (1 - ph)) + ')';
      blob(ctx, mx, wy + 0.4 + ph * 3.2, 1.2 + ph * 1.4, 0.7 + ph * 0.9);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse((wf.x0 + wf.x1) / 2, wy + 0.05, w * 0.75 + Math.sin(t * 3) * 0.15, 0.32, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawVines(r, ctx, L, T, t, v) {
    const bankY = [T.ly, T.ry];
    for (let side = 0; side < 2; side++) {
      const n = 4 + Math.floor(hash2(L.id | 0, side, 5) * 4);
      for (let k = 0; k < n; k++) {
        const q = hash2(L.id | 0, side * 20 + k, 6), q2 = hash2(L.id | 0, side * 20 + k, 7);
        const x = side ? T.re + 1.8 + q * 14 : T.le - 1.8 - q * 14;
        const yTop = v.y1 + 2, yBot = bankY[side] + 3 + q2 * 5;
        if (yTop <= yBot + 1) continue;
        const sway = Math.sin(t * 0.9 + k * 1.7 + side) * 0.3, len = yTop - yBot;
        const bx = x + sway, cx = x + sway * 0.4 + (q - 0.5) * 0.8;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#2f5a24'; ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.moveTo(x, yTop); ctx.quadraticCurveTo(cx, yBot + len * 0.5, bx, yBot); ctx.stroke();
        ctx.strokeStyle = '#4e7a2c'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(x + 0.02, yTop); ctx.quadraticCurveTo(cx + 0.02, yBot + len * 0.5, bx + 0.02, yBot); ctx.stroke();
        for (let j = 1; j <= 6; j++) {
          const tt = j / 7, p = qpt(x, yTop, cx, yBot + len * 0.5, bx, yBot, tt);
          leaf(ctx, p[0], p[1], 0.45, (j % 2 ? 0.7 : Math.PI - 0.7) - 1.2 + Math.sin(t + j) * 0.1, j % 2 ? '#5f9a36' : '#3f7a2c');
        }
        leaf(ctx, bx, yBot, 0.6, -Math.PI / 2, '#6fae3e');
        ctx.restore();
      }
    }
  }
  function profileX(pts, y) { // x of a cliff profile at height y (renderer.js has the same helper)
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      if ((y <= p.y && y >= q.y) || (y >= p.y && y <= q.y)) return p.x + (q.x - p.x) * (p.y === q.y ? 0 : (y - p.y) / (q.y - p.y));
    }
    return pts[pts.length - 1].x;
  }
  function drawCanoes(r, ctx, L, T, tm) {
    const n = canoeCount(L); if (!n || !wetLevel(L)) return;
    JungleFx.canoes = n; // for the tests: canoes drawn this frame
    // the canoes ferry across the river and back: they stay on the water between the two shorelines,
    // rest a moment at each bank and turn round (a side view of a river has no 'downstream' to sail off to)
    const wy = L.terrain.waterY, HALF = 2.6, SPEED = 1.2, REST = 2.5;
    const xl = profileX(T.left, wy), xr = profileX(T.right, wy);
    const xa = xl + HALF + 0.4, xb = xr - HALF - 0.4, D = Math.max(0, xb - xa), leg = D / SPEED, period = 2 * (leg + REST);
    for (let k = 0; k < n; k++) {
      let cx = (xa + xb) / 2, dir = k % 2 ? -1 : 1, go = 0.4;
      if (D > 0.5) {
        let ph = ((tm + hash2(L.id | 0, 0, 91) * period) % period + period) % period;
        if (k % 2) ph = (ph + leg + REST) % period; // the second canoe starts from the far bank
        if (ph < leg) { const q = ph / leg; cx = xa + D * (q * q * (3 - 2 * q)); dir = 1; go = Math.sin(Math.PI * q) * 0.6 + 0.4; }
        else if (ph < leg + REST) { cx = xb; dir = -1; go = 0; }
        else if (ph < 2 * leg + REST) { const q = (ph - leg - REST) / leg; cx = xb - D * (q * q * (3 - 2 * q)); dir = -1; go = Math.sin(Math.PI * q) * 0.6 + 0.4; }
        else { cx = xa; dir = 1; go = 0; }
      }
      const by = wy + Math.sin(tm * 1.7 + k * 2.1) * 0.03;
      const yl = wy - 1.2, xll = profileX(T.left, yl), xrr = profileX(T.right, yl);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(xl, wy + 3); ctx.lineTo(xr, wy + 3); ctx.lineTo(xr, wy); ctx.lineTo(xrr, yl); ctx.lineTo(xll, yl); ctx.lineTo(xl, wy); ctx.closePath();
      ctx.clip(); // the river only: the hull never shows through a bank
      ctx.translate(cx, by);
      if (dir < 0) ctx.scale(-1, 1);
      // canoe + paddlers, then the paddles (grips at 1.5 / 3.7 m, 0.6 m above the waterline)
      spriteBox(r, ctx, 'canoe', 0, 0, 5.2, { top: 0.85, fallback: '#7a5a34' });
      const stroke = (tm / 1.1 + k * 0.37) % 1, a = Math.sin(stroke * TAU) * 0.55 * go;
      for (const gx of [-1.1, 1.1]) {
        const ox = gx, oy = 0.6, L2 = 1.5, px2 = ox + Math.sin(a - 0.3) * L2, py2 = oy - Math.cos(a - 0.3) * L2;
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.06; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ox, oy + 0.35); ctx.lineTo(px2, py2); ctx.stroke();
        ctx.fillStyle = '#a8804a';
        ctx.save(); ctx.translate(px2, py2); ctx.rotate(Math.atan2(py2 - oy, px2 - ox) + Math.PI / 2 * 0);
        ctx.fillRect(-0.09, -0.34, 0.18, 0.4); ctx.restore();
      }
      ctx.restore();
    }
  }
  function drawBubble(r, ctx, wx, wy, text, alpha) {
    const s = r.worldToScreen(wx, wy);
    const font = '600 13px ' + U.FONT;
    ctx.save();
    r._screenXf(ctx);
    ctx.font = font;
    const maxW = 240, words = String(text).split(' '), lines = [];
    let cur = '';
    for (const w of words) { const tt = cur ? cur + ' ' + w : w; if (ctx.measureText(tt).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tt; }
    if (cur) lines.push(cur);
    let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const pw = tw + 20, lh = 17, ph = lines.length * lh + 14;
    const x = clamp(s.x - pw / 2, 8, Math.max(8, (r.W || 1280) - pw - 8)), y = Math.max(8, s.y - ph - 12);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    U.roundRect ? U.roundRect(ctx, x, y + 2, pw, ph, 10) : ctx.fillRect(x, y + 2, pw, ph);
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, 10); else ctx.rect(x, y, pw, ph);
    const tx = clamp(s.x, x + 14, x + pw - 14);
    ctx.moveTo(tx - 7, y + ph - 0.5); ctx.lineTo(s.x, y + ph + 11); ctx.lineTo(tx + 7, y + ph - 0.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,50,20,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#3a2a14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, x + pw / 2, y + 7 + lh * (i + 0.5)));
    ctx.restore();
  }

  function say(r, ctx, wx, wy, key, alpha) { // a bubble, counted for the tests (JungleFx.shown)
    JungleFx.shown[key] = (JungleFx.shown[key] || 0) + 1;
    drawBubble(r, ctx, wx, wy, tr(key), alpha);
  }

  const origShips = RP._drawShips;
  RP._drawShips = function (ctx) {
    const out = origShips.apply(this, arguments);
    const L = this.level, T = this.terrain;
    if (!L || !T || !isJungle(L)) return out;
    JungleFx.hits++;
    safe(() => drawWorld(this, ctx, L, T));
    return out;
  };
  function drawWorld(r, ctx, L, T) {
    const tm = simTime(r), t = r.time, z = r.camera.zoom, v = r._visibleWorld(0);
    const cfg = jcfg(L), wet = wetLevel(L), id = L.id | 0;
    const J = r._jfx;
    // waterfall
    if (cfg.waterfall) safe(() => drawWaterfall(r, ctx, cfg.waterfall, L, T, t, v, z));
    // tree and ruin anchors
    const live = liveTrees(r);
    if (J && !J.up) J.up = {};
    (L.anchors || []).forEach((a, i) => {
      if (a.deco === 'tree') safe(() => drawTreeAnchor(r, ctx, a, L, T, i, live && live[i], J));
      else if (a.deco === 'ruin') safe(() => pillar(r, ctx, a.x, r.groundY(a.x) - 0.2, a.y, 2.0));
    });
    // hanging vines
    safe(() => drawVines(r, ctx, L, T, t, v));
    // animals on perches
    const spots = perchSpots(r, L, T);
    for (const sp of spots) { // perches on a bending tree move with its joint
      const e = sp.ai !== undefined && live && live[sp.ai], an = e && L.anchors[sp.ai];
      if (e) { sp.x += e.x - an.x; sp.y += e.y - an.y; }
    }
    const parrot = spots[0], monkeys = spots.slice(1, 3);
    if (parrot) { branch(ctx, parrot.x, parrot.y, parrot.side ? -1 : 1, 1.6); spriteBox(r, ctx, 'parrot', parrot.x, parrot.y, 0.4); }
    monkeys.forEach((m, i) => { branch(ctx, m.x, m.y, m.side ? -1 : 1, 1.8); spriteBox(r, ctx, 'monkey', m.x, m.y, 0.8, { flip: !!m.side }); });
    if (id % 2 === 1) { // python on a branch hung from two vines, right bank
      const sx = T.re + 9, sy = T.ry + 4.2;
      ctx.save(); ctx.strokeStyle = '#2f5a24'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(sx - 0.8, sy + 0.5); ctx.lineTo(sx - 0.8, v.y1 + 2); ctx.moveTo(sx + 0.8, sy + 0.5); ctx.lineTo(sx + 0.8, v.y1 + 2); ctx.stroke(); ctx.restore();
      spriteBox(r, ctx, 'snake', sx, sy, 1.8);
    }
    if (!wet) { // tiger lying in the ferns on the valley floor, dry levels only
      const x = (T.le + T.re) / 2 + (hash2(id, 3, 11) - 0.5) * (T.re - T.le) * 0.3, y = r.groundY(x);
      spriteBox(r, ctx, 'tiger', x, y - 0.05, 2.2);
      spriteBox(r, ctx, 'fern', x - 1.6, y - 0.05, 1.8); spriteBox(r, ctx, 'fern', x + 1.7, y - 0.05, 1.5, { flip: true });
    }
    if (L.theme === 'jungle_temple') spriteBox(r, ctx, 'elephant', T.re + 30, T.ry - 0.2, 3.2, { flip: true });
    // water animals
    if (wet) {
      drawCanoes(r, ctx, L, T, tm);
      if (id % 2 === 0) {
        const lo = T.le + 1.8, rg = Math.max(1, T.re - T.le - 3.6 - 3), p = ((hash2(id, 5, 13) * rg * 2 + 0.2 * tm) % (rg * 2)), x = lo + 1.5 + (p < rg ? p : rg * 2 - p);
        spriteBox(r, ctx, 'croc', x, L.terrain.waterY + Math.sin(t * 1.3) * 0.02, 3.0, { top: 0.18 });
      }
    }
    // Stanley, and the cameo Livingstone
    if (finaleLevel(L)) {
      const b = J && J.meet && simTime(r) >= J.meet.g;
      spriteBox(r, ctx, b ? 'stanley_b' : 'stanley', T.re + 7, T.ry - 0.05, 0.9, { flip: true });
    } else if (J && J.cameoT !== null) {
      const e = r.time - J.cameoT, x = T.re + 10 - clamp(e / 0.8, 0, 1) * 0.0;
      const a = clamp(e / 0.5, 0, 1);
      if (e < 3.8) spriteBox(r, ctx, e > 0.5 ? 'livingstone_b' : 'livingstone', x, T.ry - 0.05, 1.0, { flip: true, alpha: a });
    }
  }

  // ------------------------------------------------------------------ speech bubbles (on top)
  const origLights = RP._drawLights;
  RP._drawLights = function (ctx) {
    const out = origLights.apply(this, arguments);
    const L = this.level, J = this._jfx;
    if (!J || !isJungle(L)) return out;
    safe(() => {
      const T = this.terrain, tm = simTime(this);
      if (finaleLevel(L)) {
        const sx = T.re + 7, sy = T.ry + 2.1;
        if (J.lost !== null && J.meet === null) {
          if (tm - J.lost < SAY * 2) say(this, ctx, sx, sy, 'features.jungle.livingstone.lost', 1);
        } else if (J.meet) {
          const e = tm - J.meet.g;
          if (e >= 0 && e < SAY) say(this, ctx, sx, sy, 'features.jungle.livingstone.greet', 1);
          else if (e >= REPLY_AT && e < REPLY_AT + SAY) { const p = J.pos || { x: T.re + 5, y: T.ry + 2 }; say(this, ctx, p.x, p.y + 0.3, 'features.jungle.livingstone.reply', 1); }
        }
      } else if (J.cameoT !== null) {
        const e = this.time - J.cameoT;
        if (e > 0.5 && e < 3.5) say(this, ctx, T.re + 10, T.ry + 2.1, 'features.jungle.livingstone.cameo', clamp(Math.min(e - 0.5, 3.5 - e) * 3, 0, 1));
      }
    });
    return out;
  };

  // ------------------------------------------------------------------ edit-mode label on the no-build zones
  const origNoBuild = RP._drawNoBuild;
  RP._drawNoBuild = function (ctx, state) {
    const L = this.level;
    if (!isJungle(L) || !(L.noBuild && L.noBuild.length) || (state && (state.mode || 'edit') !== 'edit')) return origNoBuild.apply(this, arguments);
    JungleFx.hits++;
    const orig = RP._label, self = this, generic = tr('editor.label.noBuild');
    const wf = jcfg(L).waterfall;
    this._label = function (c, x, y, text) {
      let key = null;
      if (text === generic) {
        for (const nb of L.noBuild) {
          if (Math.abs(self.worldToScreen((nb.x0 + nb.x1) / 2, nb.y1).x - x) > 1.5) continue;
          key = wf && nb.x0 >= wf.x0 - 0.6 && nb.x1 <= wf.x1 + 0.6 ? 'features.jungle.label.waterfall' : 'features.jungle.label.canoes';
        }
      }
      return orig.call(self, c, x, y, key ? tr(key) : text, arguments[4], arguments[5], arguments[6]);
    };
    try { return origNoBuild.apply(this, arguments); } finally { delete this._label; }
  };

  // ------------------------------------------------------------------ the toast after the finale
  const TOAST_KEY = 'span.v1.jungle.livingstone';
  function metBefore() { try { return root.localStorage && root.localStorage.getItem(TOAST_KEY) === '1'; } catch (e) { return false; } }
  function markMet() { try { if (root.localStorage) root.localStorage.setItem(TOAST_KEY, '1'); } catch (e) { /* private mode */ } }
  if (BG.Hud && BG.Hud.showResults && !BG.Hud._jungleWrapped) {
    BG.Hud._jungleWrapped = true;
    const origShow = BG.Hud.showResults;
    BG.Hud.showResults = function (res) {
      const out = origShow.apply(this, arguments);
      safe(() => {
        const G = BG.Game, L = G && G.level, R = G && G.renderer;
        // the meeting is tracked per frame; a run stepped without frames (fast-forward, tests) catches up here
        const J = R && L && G.sim && finaleLevel(L) ? track(R, { level: L, sim: G.sim, mode: 'sim' }) : R && R._jfx;
        if (!res || !res.passed || !L || !finaleLevel(L) || !J || !J.meet || J.lost !== null || J.level !== L) return;
        const fin = G.sim && G.sim.vehicles && G.sim.vehicles.some(v => v.type === 'livingstone' && v.state === 'finished');
        if (!fin && !res.simOk) return;
        JungleFx.lastMeeting = { level: L.id, greetAt: J.meet.g, replyAt: J.meet.g + REPLY_AT };
        if (metBefore()) return;
        markMet();
        const hud = this;
        setTimeout(() => { if (hud.toast) hud.toast(tr('features.jungle.livingstone.toast'), 'good', 6000); }, 2400);
      });
      return out;
    };
  }

  // ------------------------------------------------------------------ public API
  const JungleFx = BG.JungleFx = { THEMES, TYPES, SPRITES: SPR, isJungle, cameo, lastMeeting: null, forceCameo: false, shown: {}, canoes: 0, hits: 0,
    pierHits: 0, pierKinds: { trestle: 0, crib: 0, aframe: 0, pillar: 0 }, stakes: 0, treesBent: 0, treeUp: 0, treeBase, treePose, liveTrees };
  try { if (root.location && /[?&]livingstone=1\b/.test(root.location.search || '')) JungleFx.forceCameo = true; } catch (e) { /* no location */ }
})(typeof window !== 'undefined' ? window : globalThis);
