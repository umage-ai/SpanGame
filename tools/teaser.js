// teaser: renders a ~40 s YouTube teaser (1920x1080, 30 fps) from the real game. Headless only.
// Usage: node tools/teaser.js [--out dir] [--music file] [--only clip1,clip2] [--keep]
//   writes <out>/span-teaser.mp4 (default out: dist/teaser). Without --music the video is silent.
// Every clip drives the game with tools/screenshots.js's fake clock and frame loop and grabs one screenshot per
// video frame, so the footage is smooth however slow the capture is, and every run renders the same frames.
// Captions and the end card are DOM overlays on the page; ffmpeg joins the clips with short crossfades.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const shots = require('./screenshots');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(argVal('--out') || path.join(ROOT, 'dist', 'teaser'));
const MUSIC = argVal('--music');
const ONLY = argVal('--only') ? argVal('--only').split(',') : null;
const FPS = 30, FADE = 0.4;
const CTX = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }; // 1920 x 1080 frames, UI at a readable size
const E = (page, fn, arg) => page.evaluate(fn, arg);

// a caption in the upper left (the sky; the toolbars sit at the bottom), styled like the game's wordmark; t = seconds into the clip
const OVERLAY = () => {
  const st = document.createElement('style');
  st.textContent = `
    .tz-cap { position: fixed; left: 96px; top: 92px; z-index: 99999; pointer-events: none; font-family: var(--font-display);
      font-weight: 900; font-size: 50px; line-height: 1.05; letter-spacing: .01em; color: #fff;
      text-shadow: 0 3px 0 rgba(60, 25, 5, .55), 0 0 28px rgba(0, 0, 0, .55); }
    .tz-cap small { display: block; margin-bottom: 8px; font-size: 20px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; color: #ffb547; }
    .toast, .m-rotate-hint, .rotate-hint, .goals-panel, .hint, .hud-hint { display: none !important; }`;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.className = 'tz-cap';
  el.style.opacity = 0;
  document.body.appendChild(el);
  window.__tzCap = (html, t, dur) => {
    el.innerHTML = html || '';
    const a = Math.min(1, t / 0.35, (dur - t) / 0.35);
    el.style.opacity = html ? Math.max(0, a) : 0;
    el.style.transform = 'translateY(' + ((1 - Math.max(0, Math.min(1, t / 0.35))) * 18) + 'px)';
  };
};

// record dur seconds of video; rate = game seconds per video second; each(i) runs before a frame
async function record(page, dir, dur, opts) {
  opts = opts || {};
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    if (opts.each) await opts.each(i, n);
    await E(page, ([c, t, d]) => window.__tzCap(c, t, d), [opts.caption || '', i / FPS, dur]);
    await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    await shots.run(page, (opts.rate || 1) / FPS, 60);
  }
}

async function levelPage(id, design) {
  const page = await shots.newPage(CTX, 'level=' + id + '&unlockall&noresume');
  await E(page, OVERLAY);
  await shots.openWithDesign(page, design);
  await E(page, () => { if (BG.Hud.hideHint) BG.Hud.hideHint(); BG.Game._finishRun = () => {}; }); // no results card mid-shot
  return page;
}
const templateDesign = (page, id) => E(page, t => BG.Templates.generate(t, BG.Game.level, {}), id);

// a level with a design under test: skip to `from` seconds of game time, then record
async function simClip(dir, id, design, from, dur, opts) {
  opts = opts || {};
  const page = await levelPage(id, typeof design === 'function' ? null : design);
  if (typeof design === 'function') { await E(page, d => BG.Game._replaceDesign(d), await design(page)); await shots.run(page, 0.3); }
  await shots.startTest(page, !!opts.follow);
  if (from) await shots.run(page, from);
  await record(page, dir, dur, opts);
  await page._ctx.close();
}

const weak = (id, f) => { const d = shots.sol(id); f(d); return d; };
const cap = (small, big) => (small ? '<small>' + small + '</small>' : '') + big;

const CLIPS = {
  // the title screen and its live demo bridge, buttons hidden
  async title(dir) {
    const page = await shots.newPage(CTX, 'noresume');
    await E(page, OVERLAY);
    await E(page, () => document.querySelectorAll('.title-buttons, .title-meta, .title-foot').forEach(e => { e.style.visibility = 'hidden'; }));
    await shots.run(page, 2);
    await record(page, dir, 3.6);
    await page._ctx.close();
  },

  // a truss going up member by member, deck first (level 22's saved design)
  async build(dir) {
    const full = shots.sol('22-best');
    const page = await levelPage(22, { nodes: [], beams: [], piers: full.piers || [] });
    const order = full.beams.filter(b => /road/.test(b.m)).concat(full.beams.filter(b => !/road/.test(b.m)));
    const partialDesign = k => {
      const beams = order.slice(0, k), used = new Set();
      beams.forEach(b => { used.add(b.a); used.add(b.b); });
      return { nodes: full.nodes.filter(nd => used.has(nd.id)), beams, piers: full.piers || [] };
    };
    let shown = -1;
    await record(page, dir, 4.2, {
      caption: cap('', 'Build a bridge.'),
      each: async (i, n) => {
        const k = Math.min(order.length, Math.ceil(order.length * i / (n * 0.85)));
        if (k !== shown) { shown = k; await E(page, d => BG.Game._replaceDesign(d), partialDesign(k)); }
      },
    });
    await page._ctx.close();
  },

  // the same bridge under test: cars roll across, stress colours live
  async test22(dir) { await simClip(dir, 22, shots.sol('22-best'), 1.5, 3.8, { caption: cap('', 'Test it with real physics.') }); },

  // a long suspension bridge carrying heavy traffic
  async hero(dir) { await simClip(dir, 47, shots.sol('47-best'), 25.5, 3.6, { caption: cap('', 'Spans up to 150 m.') }); },

  // hangers swapped for rope: it snaps under two buses (slowed down a little)
  async collapse(dir) {
    await simClip(dir, 24, weak('24-best', d => d.beams.forEach(b => { if (b.m === 'cable') b.m = 'rope'; })), 4.4, 4.6,
      { rate: 0.8, caption: cap('', 'Don’t drop the bus.') });
  },

  // Iron Road: a steam train on a viaduct
  async train(dir) { await simClip(dir, 108, shots.sol('108-best'), 2.5, 3.8, { caption: cap('Iron Road', '20 railway bridges') }); },

  // a high-speed set derails on a humped deck, slow motion
  async derail(dir) { await simClip(dir, 116, weak('116-best', d => { d.beams = d.beams.filter((b, i) => /rail|road/.test(b.m) || i % 3); }), 2.2, 3, { rate: 0.6 }); },

  // Forces of Nature: an earthquake shakes the deck-arch template apart
  async quake(dir) { await simClip(dir, 52, p => templateDesign(p, 'deck_arch'), 12.5, 3.6, { caption: cap('Forces of Nature', 'Earthquakes.') }); },

  // Forces of Nature: hurricane-force gusts and rain
  async wind(dir) { await simClip(dir, 51, shots.sol('51-best'), 8.5, 3.4, { caption: cap('Forces of Nature', 'Hurricanes.') }); },

  // Famous Bridges: the Golden Gate under test
  async famous(dir) { await simClip(dir, 208, shots.sol('208-best'), 6, 3.8, { follow: true, caption: cap('Famous Bridges', 'Rebuild 12 real bridges') }); },

  // end card: the title screen's logo with the call to action
  async end(dir) {
    const page = await shots.newPage(CTX, 'noresume');
    await E(page, OVERLAY);
    await E(page, () => {
      document.querySelectorAll('.title-buttons, .title-meta, .title-foot').forEach(e => { e.style.visibility = 'hidden'; });
      const tag = document.querySelector('#screen-title .tagline');
      tag.innerHTML = '102 levels · a Daily Challenge · no ads';
      const cta = document.createElement('div');
      cta.style.cssText = 'margin-top:26px;font-family:var(--font-display);font-weight:900;font-size:34px;color:#ffb547;text-shadow:0 2px 0 rgba(60,25,5,.5)';
      cta.innerHTML = 'Play free: span.studio.umage.ai';
      tag.after(cta);
      const by = document.createElement('img');
      by.src = 'assets/brand/umage-ai-logo-white.svg';
      by.style.cssText = 'display:block;height:30px;margin:30px auto 0;opacity:.85';
      cta.after(by);
    });
    await shots.run(page, 4);
    await record(page, dir, 4.5);
    await page._ctx.close();
  },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await require('./browser').launch(chromium);
  shots.setBrowser(browser);
  const names = Object.keys(CLIPS).filter(n => !ONLY || ONLY.includes(n));
  for (const n of names) {
    const dir = path.join(OUT, 'frames', n);
    fs.rmSync(dir, { recursive: true, force: true });
    const t0 = Date.now();
    await CLIPS[n](dir);
    console.log('  ' + n + ': ' + fs.readdirSync(dir).length + ' frames (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  }
  await browser.close();
  if (ONLY) return;

  // join: each clip encoded, then crossfaded (xfade) into the next, music faded in and out under it
  const parts = Object.keys(CLIPS).map(n => ({ n, len: fs.readdirSync(path.join(OUT, 'frames', n)).length / FPS }));
  const ff = ['-y', '-v', 'error'];
  parts.forEach(p => ff.push('-framerate', String(FPS), '-i', path.join(OUT, 'frames', p.n, '%05d.jpg')));
  let filter = '', last = '[0:v]', t = parts[0].len;
  for (let i = 1; i < parts.length; i++) {
    const lbl = '[x' + i + ']';
    filter += last + '[' + i + ':v]xfade=transition=fade:duration=' + FADE + ':offset=' + (t - FADE).toFixed(3) + lbl + ';';
    last = lbl; t += parts[i].len - FADE;
  }
  filter += last + 'fade=t=in:st=0:d=0.5,fade=t=out:st=' + (t - 0.8).toFixed(3) + ':d=0.8,format=yuv420p[v]';
  const maps = ['-map', '[v]'];
  if (MUSIC) {
    ff.push('-i', MUSIC);
    filter += ';[' + parts.length + ':a]atrim=0:' + t.toFixed(3) + ',afade=t=in:st=0:d=0.3,afade=t=out:st=' + (t - 2).toFixed(3) + ':d=2,loudnorm=I=-14:TP=-1.5[a]';
    maps.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  }
  const file = path.join(OUT, 'span-teaser.mp4');
  execFileSync('ffmpeg', ff.concat(['-filter_complex', filter], maps, ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', String(FPS), '-movflags', '+faststart', file]), { stdio: 'inherit' });
  console.log('teaser: ' + t.toFixed(1) + ' s, ' + (fs.statSync(file).size / 1048576).toFixed(1) + ' MB -> ' + file);
  if (!args.includes('--keep')) fs.rmSync(path.join(OUT, 'frames'), { recursive: true, force: true });
})().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
