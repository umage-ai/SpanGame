// Headless browser check of the challenge stars UI (stored as badges). Never opens a visible window.
// Usage: node tools/e2e-goals.js [outDir=%TEMP%/span-goals]   Exit code 0 = all checks passed.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const url = require('url');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'span-goals');
fs.mkdirSync(OUT, { recursive: true });
const pad2 = n => String(n).padStart(2, '0');
const results = [];
const ok = (name, cond, info) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };

(async () => {
  const browser = await require('./browser').launch(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const file = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  await page.goto(file); await page.waitForTimeout(1500);

  const goalsData = await page.evaluate(() => BG.GoalsData);
  const nLevels = await page.evaluate(() => BG.Levels.filter(l => !BG.Requirements || BG.Requirements.met(l)).length); // famous: stubs have no goals yet
  ok('goals data loaded for every playable level (road + rail + famous)', Object.keys(goalsData).length === nLevels && nLevels >= 70, { goals: Object.keys(goalsData).length, nLevels });
  await page.evaluate(() => BG.Game.goLevelSelect()); await page.waitForTimeout(700);
  const ls = await page.evaluate(() => ({ tiles: document.querySelectorAll('.tile-badges').length, chip: (document.querySelector('.ls-right .badge-chip') || {}).textContent }));
  ok('level tiles show challenge-star pips', ls.tiles === 50, ls);
  // one teal pip per challenge on every tile, none earned on a fresh profile; chapter totals; campaign chip
  const pips = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.tile[data-id]:not(.soon)').forEach(t => {
      const b = t.querySelector('.tile-badges'); if (!b) return;
      const n = BG.Goals.forLevel(+t.dataset.id).length;
      if (b.querySelectorAll('.chal-star').length !== n || b.querySelectorAll('.chal-star.on').length !== 0) bad.push(t.dataset.id);
    });
    const ch = Array.from(document.querySelectorAll('section.chapter')).map(sec => {
      const c = sec.querySelector('.ch-challenges');
      const ids = Array.from(sec.querySelectorAll('.tile[data-id]:not(.soon)')).map(t => +t.dataset.id);
      return { has: !!c, text: c && c.textContent.trim(), max: ids.reduce((a, id) => a + BG.Goals.forLevel(id).length, 0) };
    });
    const camp = document.querySelectorAll('.ls-right .chal-camp-chip');
    return { bad, ch, camp: camp.length, campText: camp[0] && camp[0].textContent.trim(), campTitle: camp[0] && camp[0].title, tileTip: (document.querySelector('.tile[data-id="1"] .tile-badges') || {}).title };
  });
  ok('every tile: one teal pip per challenge, none earned yet', pips.bad.length === 0, pips.bad);
  ok('chapter headers show .ch-challenges got/max', pips.ch.length > 0 && pips.ch.every(c => c.has && c.text === '0' + '/' + c.max), pips.ch);
  ok('one campaign chip in the header with the tab total', pips.camp === 1 && /^0\s*\/\s*\d+$/.test(pips.campText || '') && /challenge stars/.test(pips.campTitle || '') && /0 of 2 challenge stars/.test(pips.tileTip || ''), pips);
  const maxB = await page.evaluate(() => BG.Storage.maxBadges());
  // unrevealed hidden bonus levels (Forces of Nature 51-53) are not counted until their chapter opens
  const hiddenIds = await page.evaluate(() => (BG.Hud.hiddenLevelIds ? BG.Hud.hiddenLevelIds() : []));
  const sumB = Object.entries(goalsData).reduce((a, [id, s]) => a + (hiddenIds.includes(+id) ? 0 : s.length), 0);
  ok('level select total badge chip (both campaigns)', new RegExp('0\\s*/\\s*' + sumB).test(ls.chip || '') && maxB === sumB, { chip: ls.chip, maxB, sumB, hiddenIds });
  await shot('01-levelselect');
  // campaign tabs: the Iron Road tab rebuilds the grid; its tiles get badge counts too, and back again
  await page.evaluate(() => BG.Hud.setCampaignTab('rail')); await page.waitForTimeout(500);
  const rl = await page.evaluate(() => ({ tab: BG.Hud.tab, tiles: document.querySelectorAll('.tile.is-rail .tile-badges').length, chips: document.querySelectorAll('.ls-right .badge-chip').length }));
  const railCamp = await page.evaluate(() => ({ n: document.querySelectorAll('.ls-right .chal-camp-chip').length, t: document.querySelector('.ls-right .chal-camp-chip').textContent.trim(), max: Array.from(document.querySelectorAll('.tile[data-id]:not(.soon)')).reduce((a, t) => a + BG.Goals.forLevel(+t.dataset.id).length, 0) }));
  ok('Iron Road tab: rail tiles show challenge pips, one total chip', rl.tab === 'rail' && rl.tiles === 20 && rl.chips === 1, rl);
  ok('campaign chip follows the tab (Iron Road total)', railCamp.n === 1 && railCamp.t.replace(/\s/g, '') === '0/' + railCamp.max, railCamp);
  await shot('01b-levelselect-rail');
  await page.evaluate(() => BG.Hud.setCampaignTab('road')); await page.waitForTimeout(500);
  const rd = await page.evaluate(() => ({ tiles: document.querySelectorAll('.tile-badges').length, chips: document.querySelectorAll('.ls-right .badge-chip').length }));
  ok('Roads tab again: 50 tiles with badge counts, no duplicate chip', rd.tiles === 50 && rd.chips === 1, rd);

  // play level 1 with the symmetric goal design
  const sol = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'solutions', 'goals', 'level-01-' + goalsData[1][0].type + '.json'), 'utf8'));
  await page.evaluate(() => { BG.Game.openLevel(1, { force: true }); }); await page.waitForTimeout(1200);
  await page.evaluate(() => BG.Hud.hideHint());
  const panel = await page.evaluate(() => ({ btn: !document.querySelector('.goals-btn').hidden, rows: document.querySelectorAll('.goals-panel .gp-row').length, open: document.querySelector('.goals-panel').classList.contains('open') }));
  ok('goals button + open panel with one row per goal', panel.btn && panel.open && panel.rows === goalsData[1].length, panel);
  const pipsBtn = await page.evaluate(() => ({ n: document.querySelectorAll('.goals-btn .goals-pips .chal-star').length, track: document.querySelectorAll('.goals-btn .chal-star.track').length, title: document.querySelector('.goals-btn').title, head: document.querySelector('.goals-panel .gp-head b').textContent }));
  ok('build bar button: one pip per challenge, none on track on an empty design; texts renamed', pipsBtn.n === goalsData[1].length && pipsBtn.track === 0 && /challenge stars/.test(pipsBtn.title) && pipsBtn.head === 'Challenges', pipsBtn);
  await shot('02-level1-goals-panel');

  await page.evaluate(d => { const ed = BG.Game.editor; if (ed.setDesign) ed.setDesign(d); else ed.design = d; }, sol);
  await page.waitForTimeout(700);
  const live = await page.evaluate(() => Array.from(document.querySelectorAll('.goals-panel .gp-row')).map(r => r.className));
  ok('panel shows live progress (on-track rows)', live.some(c => /ontrack/.test(c)), live);
  const livePips = await page.evaluate(() => document.querySelectorAll('.goals-btn .chal-star.track').length);
  ok('build bar pips go live: a design that meets a live goal turns a pip to on-track', livePips >= 1, livePips);
  await page.evaluate(() => BG.Game.toggleTest());
  await page.evaluate(() => { const g = BG.Game; let t = 0; while (g.state === 'sim' && t < 60) { g._updateSim(1 / 6); BG.Effects.update && BG.Effects.update(1 / 60); t += 1 / 6; } });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => BG.Game.state);
  ok('run finished in results', st === 'results', st);
  await page.waitForTimeout(3400);
  const rb = await page.evaluate(() => ({ n: document.querySelectorAll('.res-badges .rb').length, fresh: document.querySelectorAll('.res-badges .rb.new').length, shown: document.querySelectorAll('.res-badges .rb.in').length, stored: BG.Storage.getBadges(1) }));
  const expect = await page.evaluate(() => { const g = BG.Game; return BG.Goals.evaluate(g.level, g.getDesign(), g.sim.summary()).earned; });
  ok('results modal lists all goals and reveals them', rb.n === goalsData[1].length && rb.shown === rb.n, rb);
  const resT = await page.evaluate(() => ({ title: document.querySelector('.res-badges .rb-title span').textContent, stars: document.querySelectorAll('.res-badges .rb .chal-star.on').length }));
  ok('results card title is "Challenge stars" with a teal star per earned challenge', resT.title === 'Challenge stars' && resT.stars >= 1, resT);
  ok('earned badges are new + persisted', rb.fresh === expect.length && expect.length >= 1 && rb.stored.length === expect.length, { rb, expect });
  await shot('03-results-badges');

  // persistence across reload
  await page.reload(); await page.waitForTimeout(1500);
  await page.evaluate(() => BG.Game.goLevelSelect()); await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ total: BG.Storage.totalBadges(), t1: (document.querySelector('.tile[data-id="1"] .tile-badges') || {}).textContent, chip: document.querySelector('.ls-right .badge-chip').textContent }));
  after.t1 = await page.evaluate(() => document.querySelectorAll('.tile[data-id="1"] .tile-badges .chal-star.on').length);
  after.ch = await page.evaluate(() => document.querySelector('section.chapter .ch-challenges').textContent.trim());
  after.camp = await page.evaluate(() => document.querySelector('.ls-right .chal-camp-chip').textContent.trim());
  ok('challenge stars persist after reload (tile pips, chapter, campaign chip, global total)', after.total === expect.length && after.t1 === expect.length && new RegExp('^' + expect.length + '/').test(after.ch) && new RegExp('^' + expect.length + '\\s*/').test(after.camp), after);
  await shot('04-levelselect-after');
  await page.evaluate(() => BG.Game.goTitle()); await page.waitForTimeout(600);
  ok('title shows badge total', await page.evaluate(() => !!document.querySelector('#screen-title .badge-chip')));
  await shot('05-title');

  // Iron Road: play level 101 with a goal design; badges are keyed by the rail level id
  const g101 = goalsData[101][0].type;
  const sol101 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'solutions', 'goals', 'level-101-' + g101 + '.json'), 'utf8'));
  await page.evaluate(() => { BG.Game.openLevel(101, { force: true }); }); await page.waitForTimeout(1200);
  await page.evaluate(() => BG.Hud.hideHint());
  const p101 = await page.evaluate(() => ({ btn: !document.querySelector('.goals-btn').hidden, rows: document.querySelectorAll('.goals-panel .gp-row').length }));
  ok('101: goals button + one panel row per goal', p101.btn && p101.rows === goalsData[101].length, p101);
  await page.evaluate(d => { const ed = BG.Game.editor; if (ed.setDesign) ed.setDesign(d); else ed.design = d; }, sol101);
  await page.waitForTimeout(500);
  await page.evaluate(() => BG.Game.toggleTest());
  await page.evaluate(() => { const g = BG.Game; let t = 0; while (g.state === 'sim' && t < 90) { g._updateSim(1 / 6); BG.Effects.update && BG.Effects.update(1 / 60); t += 1 / 6; } });
  await page.waitForTimeout(3900);
  const r101 = await page.evaluate(g => ({ state: BG.Game.state, n: document.querySelectorAll('.res-badges .rb').length, stored: BG.Storage.getBadges(101), shown: !!document.querySelector('.res-badges.show') }), g101);
  ok('101: passes, results list its badges and the goal badge is stored', r101.state === 'results' && r101.n === goalsData[101].length && r101.stored.includes(g101), r101);
  await shot('05b-results-101');
  const tot = await page.evaluate(() => BG.Storage.totalBadges());
  ok('total counts road + rail badges', tot >= expect.length + 1, tot);

  // storage stays backward compatible: stars written under the old key and shape keep counting (stale types do not)
  await page.evaluate(() => { localStorage.setItem('span.v1.badges', JSON.stringify({ 1: ['symmetric', 'gone_type'], 2: ['symmetric', 'minimalist'] })); });
  await page.reload(); await page.waitForTimeout(1500);
  await page.evaluate(() => { BG.Game.goLevelSelect(); BG.Hud.setCampaignTab('road'); }); await page.waitForTimeout(700);
  const old = await page.evaluate(() => ({ total: BG.Storage.totalBadges(), ct: BG.Storage.challengeTotals([1, 2]), t1: document.querySelectorAll('.tile[data-id="1"] .tile-badges .chal-star.on').length, t2: document.querySelectorAll('.tile[data-id="2"] .tile-badges .chal-star.on').length }));
  ok('old-key badges still count (stale types ignored)', old.total === 3 && old.ct.got === 3 && old.ct.max === 4 && old.t1 === 1 && old.t2 === 2, old);

  // Danish names
  await page.evaluate(() => BG.i18n.setLanguage('da')); await page.waitForTimeout(500);
  await page.evaluate(() => { BG.Game.openLevel(1, { force: true }); }); await page.waitForTimeout(900);
  const da = await page.evaluate(() => ({ title: document.querySelector('.goals-btn').title, head: document.querySelector('.goals-panel .gp-head b').textContent, res: BG.i18n.t('features.goalsUi.resTitle') }));
  ok('Danish: Udfordringer / Udfordringsstjerner', /udfordringsstjerner/.test(da.title) && da.head === 'Udfordringer' && da.res === 'Udfordringsstjerner', da);
  await page.evaluate(() => BG.i18n.setLanguage('en')); await page.waitForTimeout(300);

  // mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { BG.Game.openLevel(1, { force: true }); }); await page.waitForTimeout(1200);
  await page.evaluate(() => BG.Hud.hideHint());
  await page.click('.goals-btn'); await page.waitForTimeout(600);
  const mob = await page.evaluate(() => { const r = document.querySelector('.goals-panel').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, open: document.querySelector('.goals-panel').classList.contains('open') }; });
  ok('mobile: panel opens inside the viewport', mob.open && mob.l >= 0 && mob.r <= mob.w, mob);
  await shot('06-mobile-panel');

  // a level with 4 challenges fits a 360 px phone tile without overflow (and the header chips fit)
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => { BG.Goals.register(1, [{ type: 'symmetric' }, { type: 'minimalist', max: 4 }, { type: 'cool_head', max: 0.5 }, { type: 'featherweight', maxMass: 2460 }]); BG.Game.goLevelSelect(); });
  await page.waitForTimeout(800);
  const four = await page.evaluate(() => {
    const tile = document.querySelector('.tile[data-id="1"]'), row = tile.querySelector('.tile-stars'), b = tile.querySelector('.tile-badges');
    const tr = tile.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { pips: b.querySelectorAll('.chal-star').length, rowFits: row.scrollWidth <= row.clientWidth + 1, inTile: br.right <= tr.right + 0.5 && br.left >= tr.left, docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      head: Array.from(document.querySelectorAll('.ls-head .chip')).filter(c => !c.hidden && c.getBoundingClientRect().right > innerWidth + 0.5).map(c => c.className + ':' + Math.round(c.getBoundingClientRect().right)) };
  });
  ok('4 challenges fit a 360 px tile, no horizontal overflow', four.pips === 4 && four.rowFits && four.inTile && !four.docOverflow && four.head.length === 0, four);
  await shot('07-mobile-tile-4');

  ok('no console errors', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  const bad = results.filter(x => !x).length;
  console.log(bad ? bad + ' FAILED' : 'all ' + results.length + ' checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
