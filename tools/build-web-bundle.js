// native: copies the shipped game into a folder a native app shell bundles (docs/NATIVE.md).
// Usage: node tools/build-web-bundle.js <outDir> [--platform android|ios] [--check]
//   outDir      emptied, then filled with the game files (the Android build passes its generated assets/www)
//   --platform  written into bundle.json for the shell's diagnostics (default: web)
//   --check     only print what would be bundled
// The file list is the service worker's precache list (tools/gen-precache.js collect()), so the app ships exactly
// what the PWA ships: index.html, manifest, css/, js/, assets/. sw.js stays out: the app needs no service worker.
// The Android Gradle build runs this before every build, so an app build always contains the current game.
'use strict';
const fs = require('fs');
const path = require('path');
const { collect } = require('./gen-precache');

const ROOT = path.resolve(__dirname, '..');

function bundle(outDir, platform) {
  const data = collect();
  const out = path.resolve(outDir);
  // never empty a folder that is not ours: refuse the repo itself or anything above it
  if (ROOT.startsWith(out + path.sep) || out === ROOT) throw new Error('refusing to empty ' + out);
  fs.rmSync(out, { recursive: true, force: true });
  for (const f of data.files) {
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), dest);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const info = { app: pkg.name, version: pkg.version, content: data.version, platform: platform || 'web', files: data.files.length, bytes: data.bytes };
  fs.writeFileSync(path.join(out, 'bundle.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}

function main() {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const outDir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--platform');
  if (args.includes('--check')) {
    const d = collect();
    console.log(d.files.join('\n') + '\n' + d.files.length + ' files, ' + (d.bytes / 1048576).toFixed(2) + ' MB, content ' + d.version);
    return;
  }
  if (!outDir) { console.error('usage: node tools/build-web-bundle.js <outDir> [--platform android|ios]'); process.exit(2); }
  const info = bundle(outDir, opt('--platform'));
  console.log('web bundle: ' + info.files + ' files, ' + (info.bytes / 1048576).toFixed(2) + ' MB, v' + info.version + ' (content ' + info.content + ') -> ' + path.resolve(outDir));
}

if (require.main === module) main();
module.exports = { bundle };
