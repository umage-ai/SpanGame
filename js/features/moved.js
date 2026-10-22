// moved: the "SPAN has moved" banner on the old address (docs/DEPLOY.md).
// The game moved from GitHub Pages (umage-ai.github.io/SpanGame) to https://span.studio.umage.ai. Browsers keep saves
// per address, so progress does not follow by itself: the banner sends players to the new site and offers the
// Settings > Save data export (they import the file there). Shown only on the old address (or with ?moved for
// testing); "Later" hides it for this browser session. Hooks: none (adds its own element to the page).
(function (root) {
  'use strict';
  const BG = (root.BG = root.BG || {});
  const doc = root.document;
  const NEW_SITE = 'https://span.studio.umage.ai/';
  const OLD_HOSTS = ['umage-ai.github.io'];
  const KEY = 'span.moved.later';

  const loc = root.location || {};
  const forced = /[?&]moved\b/.test(loc.search || '');
  const active = !!doc && !root.SpanNative && (forced || OLD_HOSTS.indexOf(loc.hostname) >= 0);
  const t = (k, p) => (BG.i18n && BG.i18n.t ? BG.i18n.t(k, p) : k);
  const later = () => { try { return root.sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } };

  BG.Moved = { active, newSite: NEW_SITE };
  if (!active) return;

  function render(el) {
    el.innerHTML =
      '<div class="mv-text"><b>' + t('features.moved.title') + '</b> <span>' + t('features.moved.text') + '</span></div>' +
      '<div class="mv-acts">' +
        '<a class="btn btn-primary mv-go" href="' + NEW_SITE + '">' + t('features.moved.open') + '</a>' +
        '<button type="button" class="btn btn-glass mv-export">' + t('features.moved.export') + '</button>' +
        '<button type="button" class="btn btn-glass mv-later">' + t('features.moved.later') + '</button>' +
      '</div>';
  }
  function mount() {
    if (later() || doc.querySelector('.moved-banner')) return;
    const el = doc.createElement('div');
    el.className = 'moved-banner';
    el.setAttribute('role', 'status');
    render(el);
    el.addEventListener('click', e => {
      if (e.target.closest('.mv-export')) { try { BG.Hud.openSettings(); } catch (err) { /* no HUD */ } }
      if (e.target.closest('.mv-later')) { try { root.sessionStorage.setItem(KEY, '1'); } catch (err) { /* */ } el.remove(); }
    });
    doc.body.appendChild(el);
    root.addEventListener('languagechange', () => render(el));
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount); else mount();
})(typeof window !== 'undefined' ? window : globalThis);
