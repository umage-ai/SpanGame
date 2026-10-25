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
  // its own copy of the texts: an old service worker can serve this (new) file next to old, cached dictionaries
  // that don't have these keys yet, and the returning players it serves are exactly who the banner is for
  const OWN = {
    en: {
      'features.moved.title': 'SPAN has moved to span.studio.umage.ai.',
      'features.moved.text': 'Your progress is saved in this browser at this address: export it here (Settings → Save data), then import the file on the new site.',
      'features.moved.open': 'Go to the new site',
      'features.moved.export': 'Export progress',
      'features.moved.later': 'Later',
    },
    da: {
      'features.moved.title': 'SPAN er flyttet til span.studio.umage.ai.',
      'features.moved.text': 'Dine fremskridt er gemt i denne browser på denne adresse: eksportér dem her (Indstillinger → Gemte data), og importér filen på det nye websted.',
      'features.moved.open': 'Gå til det nye websted',
      'features.moved.export': 'Eksportér fremskridt',
      'features.moved.later': 'Senere',
    },
  };
  const t = (k) => {
    const v = BG.i18n && BG.i18n.t ? BG.i18n.t(k) : k;
    if (v && v !== k) return v;
    const l = BG.i18n && BG.i18n.lang ? BG.i18n.lang() : (doc && doc.documentElement.lang) || 'en';
    return (OWN[l] || OWN.en)[k] || OWN.en[k];
  };
  const later = () => { try { return root.sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } };

  BG.Moved = { active, newSite: NEW_SITE, texts: OWN };
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
