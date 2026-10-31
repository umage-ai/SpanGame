// native: renders the Google Play store graphics from the real game (docs/store/PLAY-CONSOLE.md). Headless only.
// Usage: node tools/store-assets.js [--out dir] [--only phone,tablet7,tablet10,feature,cover,icon] [--lang en|da]
//   default out: docs/store/screenshots (en) or docs/store/screenshots-da
// Phone and tablet screenshots are landscape (the game's best orientation) at 16:9 / 16:10, inside Google Play's
// limits (each side 320-3840 px, the long side at most twice the short side). The scenes reuse tools/screenshots.js
// (a fake clock and an exact frame loop), so every run renders the same frames.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const shots = require('./screenshots');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LANG = argVal('--lang') || 'en';
const OUT = path.resolve(argVal('--out') || path.join(ROOT, 'docs', 'store', LANG === 'en' ? 'screenshots' : 'screenshots-' + LANG));
const ONLY = argVal('--only') ? argVal('--only').split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const UA_TABLET = 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const touch = (w, h, dpr, ua) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent: ua, locale: LANG === 'da' ? 'da-DK' : 'en-US' });
const DEVICES = {
  phone: touch(800, 450, 2.4, UA_ANDROID),     // 1920 x 1080
  tablet7: touch(960, 600, 2, UA_TABLET),       // 1920 x 1200
  tablet10: touch(1280, 800, 2, UA_TABLET),     // 2560 x 1600
};
const langQ = LANG === 'en' ? '' : '&lang=' + LANG;
const written = [];

async function save(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 }); // Google Play takes JPEG or 24-bit PNG; JPEG keeps the repo small
  written.push(file);
  console.log('  ' + path.relative(ROOT, file) + '  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}
const E = (page, fn, arg) => page.evaluate(fn, arg);
const quiet = page => E(page, () => { if (BG.Hud.hideHint) BG.Hud.hideHint(); document.querySelectorAll('.toast, .m-rotate-hint, .rotate-hint').forEach(e => e.remove()); });

// one level with its best saved design, tested for t seconds of game time
async function simScene(device, name, id, t, follow) {
  const page = await shots.newPage(DEVICES[device], 'level=' + id + '&unlockall&noresume' + langQ);
  await shots.openWithDesign(page, shots.sol(id + '-best'));
  await quiet(page);
  await shots.startTest(page, !!follow);
  await shots.run(page, t);
  await quiet(page);
  await save(page, name);
  await page._ctx.close();
}

async function deviceSet(device, scenes) {
  console.log(device);
  const d = DEVICES[device];
  if (scenes.includes('title')) {
    const page = await shots.newPage(d, 'noresume' + langQ);
    await shots.run(page, 6);
    await save(page, device + '-1-title.jpg');
    await page._ctx.close();
  }
  if (scenes.includes('hero')) await simScene(device, device + '-2-suspension.jpg', 47, 29.5);
  if (scenes.includes('levels')) {
    const page = await shots.newPage(d, 'screen=levels&noresume' + langQ, { init: shots.seedProgress });
    await E(page, () => {
      for (let id = 1; id <= 22; id++) { const g = BG.Goals.forLevel(id); if (g.length && id % 3 !== 1) BG.Storage.recordBadges(id, g.slice(0, 1 + (id % 2)).map(x => x.type)); }
      BG.Game.goLevelSelect();
    });
    await shots.run(page, 1.2);
    await save(page, device + '-3-levels.jpg');
    await page._ctx.close();
  }
  if (scenes.includes('train')) await simScene(device, device + '-4-ironroad.jpg', 108, 5);
  if (scenes.includes('jungle')) await simScene(device, device + '-5-jungle.jpg', 62, 9);
  if (scenes.includes('famous')) {
    const page = await shots.newPage(d, 'level=208&unlockall&noresume' + langQ);
    await shots.run(page, 1.2);
    await save(page, device + '-6-famous.jpg');
    await page._ctx.close();
  }
}

// 1024 x 500: the title scene without its buttons and chips (logo, tagline and the live demo bridge)
// (also the itch.io cover, 630 x 500: --only cover)
async function featureGraphic(w, h, file) {
  console.log(file);
  const page = await shots.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: LANG === 'da' ? 'da-DK' : 'en-US' }, 'noresume' + langQ);
  await page.addStyleTag({ content: '#screen-title button, #screen-title .chip, .title-buttons, .title-foot, .title-meta { visibility: hidden !important; }' });
  await shots.run(page, 6);
  await save(page, file);
  await page._ctx.close();
}

(async () => {
  const browser = await require('./browser').launch(chromium);
  shots.setBrowser(browser);
  const want = n => !ONLY || ONLY.includes(n);
  if (want('phone')) await deviceSet('phone', ['title', 'hero', 'levels', 'train', 'jungle', 'famous']);
  if (want('tablet7')) await deviceSet('tablet7', ['title', 'hero', 'levels', 'train']);
  if (want('tablet10')) await deviceSet('tablet10', ['title', 'hero', 'levels', 'train']);
  if (want('feature')) await featureGraphic(1024, 500, 'feature-graphic.jpg');
  if (want('cover')) await featureGraphic(630, 500, 'itch-cover.jpg');
  if (want('icon')) {
    const file = path.join(OUT, 'icon-512.png');
    fs.copyFileSync(path.join(ROOT, 'assets', 'icons', 'app', 'icon-512.png'), file);
    written.push(file);
    console.log('  ' + path.relative(ROOT, file));
  }
  await browser.close();
  console.log(written.length + ' files in ' + path.relative(ROOT, OUT));
})().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
