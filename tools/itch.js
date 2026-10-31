// itch: packages the game as an itch.io HTML5 upload (docs/store/ITCH.md).
// Usage: node tools/itch.js [out.zip]   (default dist/span-<version>-web.zip)
// The zip holds the same files as the native app bundles (tools/build-web-bundle.js: index.html at the root, no
// sw.js). itch.io serves it in an iframe on its own CDN; js/features/pwa.js registers no service worker there.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { bundle } = require('./build-web-bundle');

const ROOT = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'span-' + version + '-web.zip'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'span-itch-'));
const info = bundle(dir, 'itch');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
// Windows 10+ ships bsdtar in System32 (writes zip by the extension; Git's GNU tar on PATH can't); elsewhere zip
if (process.platform === 'win32') execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', out, '-C', dir].concat(fs.readdirSync(dir)), { stdio: 'inherit' });
else execFileSync('zip', ['-q', '-r', '-X', out].concat(fs.readdirSync(dir)), { cwd: dir, stdio: 'inherit' });
fs.rmSync(dir, { recursive: true, force: true });
console.log('itch.io zip: ' + (info.files + 1) + ' files, ' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB -> ' + out);
