/* SPAN — Jungle chapter visuals (levels 59-68), docs/jungle/SPEC-JUNGLE.md §4.
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
 *   RP._drawPierItem                         ruined stone pillars on jungle_temple
 *   RP._drawAnchors                          lashing knots on tree anchors
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
    wheel_wood: [100, 100], canoe: [520, 110], parrot: [40, 70], snake: [180, 60], tiger: [220, 90],
    elephant: [400, 300], croc: [300, 30], fern: [140, 90], ruin_head: [300, 360], ruin_pillar: [200, 400], ruin_cap: [240, 80]
  };
  // vehicle type -> [sprite, wheel sprite or null, stride (m) or 0]; the sprite width is def.length * 100
  const TYPES = {
    walker: { body: 'walker', frames: true, stride: 0.35, wheel: null },
    monkey: { body: 'monkey', frames: true, stride: 0.25, wheel: null },
    handcart: { body: 'handcart', frames: true, stride: 0.35, wheel: 'wheel_wood', wheels: [0, 1] },
    oxcart: { body: 'oxcart', frames: true, stride: 0.45, wheel: 'wheel_wood', wheels: [0] },
    jeep: { body: 'jeep', frames: false, stride: 0, wheel: 'wheel', wheels: [0, 1] },
    livingstone: { body: 'livingstone', frames: true, stride: 0.35, wheel: null }
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
  const origPier = RP._drawPierItem;
  RP._drawPierItem = function (ctx, p, ghost, invalid) {
    if (this.themeId !== 'jungle_temple' || p.ground || !(p.topY > p.baseY + 0.1)) return origPier.apply(this, arguments);
    JungleFx.hits++;
    pillar(this, ctx, p.x, p.baseY, p.topY, 2.0, { ghost, invalid });
  };

  // ------------------------------------------------------------------ anchors: lashing knots on trees
  const origAnchors = RP._drawAnchors;
  RP._drawAnchors = function (ctx, L) {
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
    for (const a of L.anchors || []) if (a.deco === 'tree' && a.y > Math.max(T.ly, T.ry) + 1) spots.push({ x: a.x - (a.x < (T.le + T.re) / 2 ? 1.0 : -1.0) * 0.6, y: a.y + 0.05, anchor: true, side: a.x < (T.le + T.re) / 2 ? 0 : 1 });
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
  function drawTreeAnchor(r, ctx, a, L, T) {
    const mid = (T.le + T.re) / 2;
    const edge = Math.abs(a.x - T.le) <= 1.2 || Math.abs(a.x - T.re) <= 1.2;
    const side = a.x < mid ? -1 : 1;
    const cx = edge ? a.x + side * 1.1 : a.x;
    const base = r.groundY(cx) - 0.3, top = a.y + 1.6, h = top - base;
    if (!(h > 1)) return;
    const bw = 1.5, tw = 0.48;
    ctx.save();
    ctx.fillStyle = '#4a3524';
    ctx.beginPath();
    ctx.moveTo(cx - bw, base); ctx.quadraticCurveTo(cx - tw * 1.3, base + h * 0.1, cx - tw, base + h * 0.3); ctx.lineTo(cx - tw * 0.85, top);
    ctx.lineTo(cx + tw * 0.85, top); ctx.lineTo(cx + tw, base + h * 0.3); ctx.quadraticCurveTo(cx + tw * 1.3, base + h * 0.1, cx + bw, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a4a30';
    ctx.beginPath(); ctx.moveTo(cx + tw * 0.1, base + 0.2); ctx.lineTo(cx + tw * 0.15, top); ctx.lineTo(cx + tw * 0.85, top); ctx.lineTo(cx + tw, base + h * 0.3); ctx.quadraticCurveTo(cx + tw * 1.3, base + h * 0.1, cx + bw * 0.7, base); ctx.closePath(); ctx.fill();
    // bark furrows
    ctx.strokeStyle = 'rgba(30,18,8,0.45)'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const fx = cx + (k - 2) * tw * 0.38;
      ctx.beginPath(); ctx.moveTo(fx, base + 0.5 + hash2(k, a.x * 10 | 0, 1) * 1.5); ctx.lineTo(fx + (k - 2) * 0.03, top - 0.3 - hash2(k, a.x * 10 | 0, 2) * 2); ctx.stroke();
    }
    // moss on the roots
    ctx.fillStyle = 'rgba(80,140,50,0.55)'; blob(ctx, cx - bw * 0.4, base + 0.4, 0.7, 0.3);
    // the limb that carries the anchor
    if (edge) {
      ctx.strokeStyle = '#4a3524'; ctx.lineWidth = 0.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, a.y - 0.9); ctx.quadraticCurveTo(a.x + side * 0.3, a.y - 0.6, a.x, a.y - 0.05); ctx.stroke();
    }
    // crown
    const cr = Math.min(3.4, 1.6 + h * 0.14), cy = top + cr * 0.35;
    ctx.fillStyle = '#1f5a30'; blob(ctx, cx, cy, cr * 1.2, cr * 0.75);
    ctx.fillStyle = '#2f7a3a'; blob(ctx, cx - cr * 0.4, cy + cr * 0.3, cr * 0.9, cr * 0.6);
    ctx.fillStyle = '#3f9a44'; blob(ctx, cx + cr * 0.35, cy + cr * 0.45, cr * 0.65, cr * 0.42);
    ctx.fillStyle = '#5fb04e'; blob(ctx, cx - cr * 0.05, cy + cr * 0.68, cr * 0.4, cr * 0.24);
    ctx.restore();
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
  function drawCanoes(r, ctx, L, T, tm) {
    const n = canoeCount(L); if (!n || !wetLevel(L)) return;
    JungleFx.canoes = n; // for the tests: canoes drawn this frame
    const wy = L.terrain.waterY, M0 = 6, span = (T.re + M0) - (T.le - M0);
    for (let k = 0; k < n; k++) {
      const dir = k % 2 ? -1 : 1;
      const rel = ((hash2(L.id | 0, k, 91) * span + dir * 1.2 * tm) % span + span) % span;
      const cx = T.le - M0 + rel;
      const by = wy + Math.sin(tm * 1.7 + k * 2.1) * 0.03;
      ctx.save();
      ctx.beginPath(); ctx.rect(T.le + 0.05, wy - 3, T.re - T.le - 0.1, 6); ctx.clip(); // the river only: the banks hide the canoe
      ctx.translate(cx, by);
      if (dir < 0) ctx.scale(-1, 1);
      // canoe + paddlers, then the paddles (grips at 1.5 / 3.7 m, 0.6 m above the waterline)
      spriteBox(r, ctx, 'canoe', 0, 0, 5.2, { top: 0.85, fallback: '#7a5a34' });
      const stroke = (tm / 1.1 + k * 0.37) % 1, a = Math.sin(stroke * TAU) * 0.55;
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
    for (const a of L.anchors || []) {
      if (a.deco === 'tree') safe(() => drawTreeAnchor(r, ctx, a, L, T));
      else if (a.deco === 'ruin') safe(() => pillar(r, ctx, a.x, r.groundY(a.x) - 0.2, a.y, 2.0));
    }
    // hanging vines
    safe(() => drawVines(r, ctx, L, T, t, v));
    // animals on perches
    const spots = perchSpots(r, L, T);
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
  const JungleFx = BG.JungleFx = { THEMES, TYPES, SPRITES: SPR, isJungle, cameo, lastMeeting: null, forceCameo: false, shown: {}, canoes: 0, hits: 0 };
  try { if (root.location && /[?&]livingstone=1\b/.test(root.location.search || '')) JungleFx.forceCameo = true; } catch (e) { /* no location */ }
})(typeof window !== 'undefined' ? window : globalThis);
