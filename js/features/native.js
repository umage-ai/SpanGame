// native: BG.Native - the game's side of the native app shells (Android now, iOS later; docs/NATIVE.md).
// A shell loads the bundled game files into a WebView and defines window.SpanNative before any script runs.
// In a browser there is no SpanNative, BG.Native.active is false and every call here does nothing.
//
// The shell -> game calls (the shell runs them with evaluateJavascript):
//   BG.Native.back()        Android back button: true when the game handled it, false = leave the app
//   BG.Native.pause()       the app went to the background: pause a running test, save, silence the audio
//   BG.Native.resume()      the app is back in front
//   BG.Native.saved(ok)     result of a saveFile() request (the system file picker)
// The game -> shell calls (methods on window.SpanNative):
//   getPlatform() -> 'android' | 'ios'     getVersion() -> app version name
//   saveFile(name, text)                    open the system "save as" picker for a save export
// Hooks: none (pwa.js and history.js check BG.Native / window.SpanNative themselves).
(function (root) {
  'use strict';
  const BG = (root.BG = root.BG || {});
  const shell = root.SpanNative || null;
  const doc = root.document;

  const call = (name, ...args) => {
    try { return shell && typeof shell[name] === 'function' ? shell[name](...args) : undefined; } catch (e) { return undefined; }
  };
  const t = (k, p) => (BG.i18n && BG.i18n.t ? BG.i18n.t(k, p) : k);
  const toast = (msg, kind) => { try { if (BG.Hud && BG.Hud.toast) BG.Hud.toast(msg, kind); } catch (e) { /* no HUD */ } };

  let pendingKb = 0;

  const Native = BG.Native = {
    active: !!shell,
    platform: shell ? String(call('getPlatform') || 'unknown') : null,
    appVersion: shell ? String(call('getVersion') || '') : null,

    // The Android back button behaves like Esc: close the open panel, else go one screen back.
    // On the title screen with nothing open, the app closes (return false).
    back() {
      const G = BG.Game;
      const before = G && G.state;
      if (!doc) return false;
      const ev = new root.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      (doc.activeElement || doc.body || doc).dispatchEvent(ev);
      if (before !== 'title') return true;
      return ev.defaultPrevented || (G && G.state !== before);
    },

    pause() {
      const G = BG.Game;
      try { if (G && G.state === 'sim' && !G.paused && G.togglePause) G.togglePause(); } catch (e) { /* */ }
      try { if (G && G._saveNow) G._saveNow(); } catch (e) { /* */ } // the app may be killed in the background
      const ctx = BG.Audio && BG.Audio.context;
      try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) { /* */ }
    },

    resume() {
      const ctx = BG.Audio && BG.Audio.context;
      try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { /* */ }
    },

    // history.js export: true when the shell took over (it answers through saved())
    saveFile(name, text) {
      if (!shell) return false;
      pendingKb = Math.max(1, Math.round(String(text).length / 1024));
      return call('saveFile', String(name), String(text)) !== false;
    },
    saved(ok) {
      if (ok) toast(t('features.history.toast.exported', { kb: pendingKb }), 'good');
      else if (ok === false) toast(t('features.history.toast.noExport'), 'warn');
      // null = the player cancelled the picker: say nothing
    },
  };

  if (shell && doc && doc.documentElement) doc.documentElement.classList.add('native', 'native-' + Native.platform);
})(typeof window !== 'undefined' ? window : globalThis);
