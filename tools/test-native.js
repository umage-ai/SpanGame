// native: the app-shell side of SPAN (docs/NATIVE.md), checked in Node.
//  - tools/build-web-bundle.js ships exactly the PWA's precache list (plus bundle.json), never sw.js / tools / docs
//  - js/features/native.js: inert in a browser; with a shell, back / pause / saveFile behave as the shells expect
//  - the Android project keeps the guarantees players depend on: no permissions, a fixed origin (saves), the bundle step
// Usage: node tools/test-native.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { collect } = require('./gen-precache');
const { bundle } = require('./build-web-bundle');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra != null && !cond ? '  -> ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};

// ---------------------------------------------------------------- the web bundle
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'span-bundle-'));
  const info = bundle(out, 'android');
  const want = collect().files;
  const got = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(out, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(r); else got.push(r);
    }
  })('');
  const gotGame = got.filter(f => f !== 'bundle.json').sort();
  ok('bundle holds exactly the precache list', JSON.stringify(gotGame) === JSON.stringify(want.slice().sort()),
    { missing: want.filter(f => !got.includes(f)).slice(0, 5), extra: gotGame.filter(f => !want.includes(f)).slice(0, 5) });
  ok('bundle has index.html and native.js', got.includes('index.html') && got.includes('js/features/native.js'));
  ok('bundle leaves out sw.js, tools/ and docs', !got.some(f => f === 'sw.js' || f.startsWith('tools/') || f.startsWith('docs/') || f.endsWith('.md')));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('bundle.json names the version and platform', info.version === pkg.version && info.platform === 'android' && info.files === want.length, info);
  ok('index.html loads js/features/native.js', /<script src="js\/features\/native\.js"><\/script>/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  ok('bundling refuses to empty the repo', (() => { try { bundle(ROOT); return false; } catch (e) { return true; } })());
  fs.rmSync(out, { recursive: true, force: true });
}

// ---------------------------------------------------------------- BG.Native
const SRC = fs.readFileSync(path.join(ROOT, 'js/features/native.js'), 'utf8');

function load(shell, game) {
  const listeners = [];
  const classes = [];
  const toasts = [];
  const doc = {
    documentElement: { classList: { add: (...c) => classes.push(...c) } },
    body: {
      dispatchEvent(ev) { for (const fn of listeners) fn(ev); return !ev.defaultPrevented; },
    },
    activeElement: null,
  };
  class KeyboardEvent {
    constructor(type, o) { Object.assign(this, o, { type, defaultPrevented: false }); }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  }
  const audio = { state: 'running', suspend() { this.state = 'suspended'; }, resume() { this.state = 'running'; } };
  const win = {
    document: doc, KeyboardEvent, SpanNative: shell || undefined,
    BG: { Game: game, Audio: { context: audio }, Hud: { toast: (m, k) => toasts.push([m, k]) }, i18n: { t: (k, p) => k + (p ? JSON.stringify(p) : '') } },
  };
  vm.runInNewContext(SRC, { window: win, globalThis: win });
  return { win, N: win.BG.Native, listeners, classes, toasts, audio };
}

{
  const { N, classes } = load(null, { state: 'title' });
  ok('browser: BG.Native inactive', N.active === false && N.platform === null && classes.length === 0);
  ok('browser: saveFile declines (history.js keeps its download)', N.saveFile('a.json', '{}') === false);
}

{
  const saves = [];
  const shell = { getPlatform: () => 'android', getVersion: () => '1.4.0', saveFile: (n, t) => { saves.push([n, t]); return true; } };
  const game = { state: 'title', paused: false, togglePause() { this.paused = !this.paused; } };
  const env = load(shell, game);
  const { N } = env;
  ok('shell: active, platform and version from the shell', N.active && N.platform === 'android' && N.appVersion === '1.4.0');
  ok('shell: <html> gets native classes', env.classes.includes('native') && env.classes.includes('native-android'));

  ok('back on the title with nothing open leaves the app', N.back() === false);
  env.listeners.push(ev => { if (ev.key === 'Escape') ev.preventDefault(); }); // e.g. Settings open: its handler takes Esc
  ok('back on the title closes an open panel first', N.back() === true);
  env.listeners.length = 0;
  for (const st of ['levelSelect', 'edit', 'sim', 'results']) { game.state = st; ok('back in ' + st + ' stays in the app', N.back() === true); }
  game.state = 'levelSelect';
  env.listeners.push(ev => { if (ev.key === 'Escape') game.state = 'title'; });
  ok('back dispatches Escape to the game', N.back() === true && game.state === 'title');

  game.state = 'sim';
  N.pause();
  ok('pause: a running test pauses and the audio stops', game.paused === true && env.audio.state === 'suspended');
  N.resume();
  ok('resume: audio comes back, the test stays paused', env.audio.state === 'running' && game.paused === true);

  ok('saveFile hands the export to the shell', N.saveFile('span-save.json', 'x'.repeat(3000)) === true && saves.length === 1 && saves[0][0] === 'span-save.json');
  N.saved(true); N.saved(null); N.saved(false);
  ok('saved(): toast on success and failure, quiet on cancel', env.toasts.length === 2 && /exported/.test(env.toasts[0][0]) && /"kb":3/.test(env.toasts[0][0]) && env.toasts[1][1] === 'warn', env.toasts);
}

// ---------------------------------------------------------------- the Android project
{
  const A = p => fs.readFileSync(path.join(ROOT, 'android', p), 'utf8');
  const manifest = A('app/src/main/AndroidManifest.xml');
  const gradle = A('app/build.gradle');
  const activity = A('app/src/main/java/ai/umage/span/MainActivity.java');
  ok('android: no permissions (the game runs offline)', !/<uses-permission/.test(manifest));
  ok('android: rotation does not recreate the activity', /android:configChanges="[^"]*orientation[^"]*screenSize/.test(manifest));
  ok('android: fixed origin, so saves survive updates', /HOST = "appassets\.androidplatform\.net"/.test(activity) && /START_URL = "https:\/\/" \+ HOST \+ "\/assets\/www\/index\.html"/.test(activity));
  ok('android: every build bundles the current game', /tools\/build-web-bundle\.js/.test(gradle) && /dependsOn webBundle/.test(gradle));
  ok('android: version name comes from package.json', /versionName = pkg\.version/.test(gradle));
  ok('android: the bridge is window.SpanNative', /addJavascriptInterface\(new Bridge\(\), "SpanNative"\)/.test(activity));
}

// ---------------------------------------------------------------- the iOS project
{
  const I = p => fs.readFileSync(path.join(ROOT, 'ios', p), 'utf8');
  const handler = I('SPAN/Sources/AppSchemeHandler.swift');
  const vc = I('SPAN/Sources/GameViewController.swift');
  const proj = I('project.yml');
  const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  ok('ios: fixed origin span-app://localhost, so saves survive updates', /static let scheme = "span-app"/.test(handler) && /static let host = "localhost"/.test(handler) && handler.includes('URL(string: "span-app://localhost/index.html")'));
  ok('ios: window.SpanNative is defined before any game script runs', /injectionTime: \.atDocumentStart/.test(vc) && vc.includes("getPlatform: function () { return 'ios'; }") && vc.includes('messageHandlers.spanSave'));
  ok('ios: the shell drives BG.Native pause / resume / saved', ['BG.Native.pause()', 'BG.Native.resume()', 'BG.Native.saved('].every(x => vc.includes(x)));
  ok('ios: the game ships as the generated www folder (bundle step, folder reference)', /path: SPAN\/www\s+type: folder/.test(proj) && pkg.includes('"ios:bundle": "node tools/build-web-bundle.js ios/SPAN/www --platform ios"'));
  ok('ios: universal (iPhone + iPad) and offered on Apple Silicon Macs', proj.includes('TARGETED_DEVICE_FAMILY: "1,2"') && proj.includes('SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: YES'));
  ok('ios: no permission usage strings (no camera, location, network)', !/NS\w+UsageDescription|NSAppTransportSecurity/.test(proj));
}

console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nall native checks passed');
process.exit(fails ? 1 : 0);
