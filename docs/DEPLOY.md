# Deploying the web game

SPAN's web version runs on umage.ai's own server (Ubuntu with nginx). [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) deploys it:

| Site | Folder on the server | Deployed |
|---|---|---|
| https://test.span.studio.umage.ai | `/var/www/span-test` | on every push to `main` |
| https://span.studio.umage.ai | `/var/www/span` | when a GitHub release is published |
| either | | by hand: *Actions → Deploy → Run workflow*, choose `test` or `production` |

Every deploy runs the Node test suites, regenerates the precache list (`tools/gen-precache.js`) and uploads only the shipped files (`index.html`, `privacy.html`, `sw.js`, `manifest.webmanifest`, `css/`, `js/`, `assets/`) with rsync over SSH. `sw.js` goes last, so a page loaded mid-deploy never gets a new service worker before its files are there. Afterwards the workflow checks that the site answers and serves the new `sw.js` version.

## One-time server setup

[deploy/setup-server.sh](../deploy/setup-server.sh), run as root, sets up:

- the user `deployspan`: no password, no sudo, and it can only log in with the deploy key. It owns the two web roots and nothing else;
- one nginx site per domain: its own logs, `sw.js` and the pages served with `Cache-Control: no-cache` so updates arrive at once, other files cached for an hour, gzip, and the `.webmanifest` MIME type;
- Let's Encrypt certificates for both domains with certbot, which also adds the http → https redirect.

Both DNS names must point at the server first (`*.studio.umage.ai` already does). Running the script again is safe.

## Secrets

| Secret | What it is |
|---|---|
| `DEPLOY_SSH_KEY` | the private half of the `deployspan` key (ed25519, no passphrase) |
| `DEPLOY_KNOWN_HOSTS` | the server's SSH host keys (`ssh-keyscan studio.umage.ai`), so the deploy refuses an impostor |

To replace the key: make a new pair with `ssh-keygen -t ed25519 -N "" -f deployspan`, put the public half in `/home/deployspan/.ssh/authorized_keys` on the server (remove the old line), and the private half in `DEPLOY_SSH_KEY`.

## The old address

Players' saves live in their browser and belong to one web address, so moving from `umage-ai.github.io/SpanGame` doesn't bring them along. Until the old site is switched off, it shows a banner (`js/features/moved.js`, test it with `?moved`). The banner links to the new site and opens *Settings → Save data* so players can export their progress and import it on the new site. GitHub Pages only serves public repositories on the free plan, so the old site stops when the repository becomes private.

The Android and iOS apps aren't affected: they ship the game inside the app and keep their own fixed origin.
