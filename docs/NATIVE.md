# Native apps (Android, later iOS)

The app stores get the same game as the web. A native app is a thin **shell**: one full-screen WebView that runs the game files bundled inside the app. There is no second copy of the game in the repository. Every app build copies the current game in, so updating the PWA and rebuilding the app is the whole update process.

```
index.html, css/, js/, assets/      the game (the PWA)
        |  tools/build-web-bundle.js       same file list as the service worker precache (tools/gen-precache.js)
        v
android/app/build/generated/span/assets/www      bundled by Gradle before every build (task :app:webBundle)
        |
        v
android/app (MainActivity.java)  ->  WebView at https://appassets.androidplatform.net/assets/www/index.html
```

## Why a WebView shell

- **Bundled, not hosted:** the app works offline from the first launch and doesn't depend on GitHub Pages. A Trusted Web Activity would load the live site instead, and it needs a Digital Asset Links file at the root of the domain, which a `github.io/SpanGame` project page can't provide.
- **No framework:** a single Java activity and one small AndroidX library (`androidx.webkit`, for the asset loader). Capacitor would add an npm toolchain and plugins the game doesn't use. The iOS shell will be the same idea in Swift, which suits xtool (SwiftPM, no Xcode project).
- **The game knows almost nothing about it:** `js/features/native.js` (`BG.Native`) is the only game-side glue. `pwa.js` skips the service worker and install prompts inside a shell, and `history.js` hands save exports to the shell.

## Building

You need Node, plus the Android SDK and a JDK 17+ (Android Studio has both; `tools/android.js` finds them).

```sh
npm run android:debug      # android/app/build/outputs/apk/debug/app-debug.apk       (ai.umage.span.debug, "SPAN dev")
npm run android:release    # android/app/build/outputs/bundle/release/app-release.aab  (+ apk/release/), signed if a key is set
node tools/android.js <gradle tasks>    # anything else, e.g. installDebug
npm run bundle:web -- <dir>             # only the web bundle (also what the iOS build will use)
```

- **Version:** `versionName` is `package.json`'s `version`. `versionCode` is major × 10000 + minor × 100 + patch (1.4.0 → 10400). Google Play needs a higher code for every upload, so bump `package.json` with every release. If you have to re-upload the same version, override it with `-PversionCode=N` or `SPAN_VERSION_CODE`.
- **CI** (`.github/workflows/android.yml`): pull requests that touch the app get a debug APK artifact. **Publishing a GitHub release** builds the AAB and APK and attaches them to that release, so the app files always match the released PWA.

## Signing and Google Play

1. Create an upload key once, and keep it (and its password) somewhere safe, outside the repository:
   ```sh
   keytool -genkeypair -keystore span-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Local release builds read `SPAN_KEYSTORE` (path), `SPAN_KEYSTORE_PASSWORD`, `SPAN_KEY_ALIAS` and `SPAN_KEY_PASSWORD`. CI reads the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 span-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Without them, the release files are unsigned.
3. In the Play Console, create the app `ai.umage.span`, enrol in **Play App Signing** (Google keeps the app signing key; yours is only the upload key), and upload `span-<version>.aab`.
4. The store listing is ready in [docs/store/](store/): texts in English and Danish, Play Console answers ([PLAY-CONSOLE.md](store/PLAY-CONSOLE.md)), and screenshots, the feature graphic and the icon from `npm run store:assets`. The privacy policy is `privacy.html`, published at https://umage-ai.github.io/SpanGame/privacy.html. Store listing facts: no permissions, no network use, no data collected or shared (progress stays on the device; Android's auto-backup may back it up). It's a game with no ads and no in-app purchases. The target API is 36.

## What the shell does

| | Android (`android/app/src/main/java/ai/umage/span/MainActivity.java`) |
|---|---|
| Game files | served by `WebViewAssetLoader` from `https://appassets.androidplatform.net/assets/www/` |
| Saves | the game's `localStorage` on that origin. **Never change the host or path:** players would lose their progress |
| Back button | `BG.Native.back()`: works like Esc (closes the open panel, else goes one screen back); on the title screen it closes the app |
| Background | `BG.Native.pause()`: pauses a running test, saves, suspends audio; `resume()` brings the audio back |
| Rotation | handled in place (`configChanges`), so the game never reloads |
| Links | anything off the app origin opens in the browser |
| Save export / import | the system "save as" picker (`SpanNative.saveFile` → `BG.Native.saved`) / the file chooser |
| Screen | immersive full screen, drawn under the display cutout (the HUD respects `env(safe-area-inset-*)`) |
| Crash of the web renderer | the activity restarts; the autosave keeps the design |

The bridge contract, which the iOS shell must also follow:

- the shell defines `window.SpanNative` **before any game script runs**, with `getPlatform()`, `getVersion()` and `saveFile(name, text)`;
- the shell calls `BG.Native.back()`, `pause()`, `resume()` and `saved(ok)`.

`js/features/native.js` documents both directions.

## Testing

- `node tools/test-native.js` (part of `npm test`) checks that the bundle is exactly the precache list without `sw.js`, `tools/` or docs, that `BG.Native` behaves as described in a browser and in a shell, and that the Android project keeps its guarantees: no permissions, the fixed origin, rotation without a reload, and the bundle step in every build.
- On a device or emulator: debug builds allow WebView debugging. Forward it with `adb forward tcp:9471 localabstract:webview_devtools_remote_<pid>` (`<pid>` from `adb shell pidof ai.umage.span.debug`) and use `chrome://inspect`, or send `Runtime.evaluate` over the DevTools websocket. An emulator also runs headless: `emulator -avd <name> -no-window -no-audio`, with screenshots from `adb exec-out screencap -p`.

## iPhone, iPad and Mac (`ios/`)

One universal iOS app covers the iPhone and the iPad. App Store Connect can also offer it on Apple Silicon Macs ("Designed for iPad"; the project sets `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD`). It is the same thin shell as on Android, in Swift (`ios/SPAN/Sources/`):

- a full-screen `WKWebView` loading `span-app://localhost/index.html`, served from the bundled `www/` folder by a `WKURLSchemeHandler` (`AppSchemeHandler.swift`). That scheme and host are the page origin that holds the saves. **Never change them.**
- a `WKUserScript` at document start that defines `window.SpanNative` (`getPlatform()` = `ios`, `getVersion()`, `saveFile()`). Save export goes through a script message to the system "Save to Files" picker, which answers `BG.Native.saved(ok)`. Import (`<input type=file>`) works in `WKWebView` without extra code.
- `BG.Native.pause()` / `resume()` from the scene lifecycle. iOS has no back button, so `back()` is unused.
- links off the app origin open in Safari; the status bar and home indicator are hidden.

The game files are not in the repository copy of `ios/`: `npm run ios:bundle` (`tools/build-web-bundle.js ios/SPAN/www --platform ios`) writes them, and CI runs it before every build.

### Building

There are two routes. Neither needs a Mac on your desk.

- **CI (the App Store route), `.github/workflows/ios.yml` on a GitHub macOS runner.** It bundles the game, generates `ios/SPAN.xcodeproj` from `ios/project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen), and always builds for the simulator, which proves the code compiles. On a published GitHub release (or a manual run), and when the signing secrets are set, it archives and uploads the build to App Store Connect, where it appears in TestFlight. The version is `package.json`'s, and the build number uses the same rule as the Android version code.
- **Your own iPhone or iPad with [xtool](https://github.com/xtool-org/xtool)** from Windows (WSL) or Linux: `ios/Package.swift` and `ios/xtool.yml` describe the same app as a SwiftPM package. Run `npm run ios:bundle`, then `xtool dev` in `ios/` (see xtool's docs for signing in with your Apple ID and pairing the device). This route is for testing on devices; App Store uploads go through CI.

### Signing and the App Store

1. Join the **Apple Developer Program** ($99/year). An organization account needs the D-U-N-S number, the same one as for Google Play.
2. In App Store Connect, create the app with bundle id `ai.umage.span`, and an **API key** (Users and Access → Integrations) with the *App Manager* role.
3. Add the repository secrets `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8` (the contents of the downloaded `.p8` file). CI then signs automatically (`-allowProvisioningUpdates` with the API key), so no certificates or profiles need to be managed by hand.
4. Listing: privacy labels "Data Not Collected", age rating 4+, the same privacy policy URL, and screenshots for the 6.9" iPhone and the 13" iPad. In the review notes, mention that the whole game runs offline from the app bundle (Apple's guideline 4.2 rejects apps that only wrap a website).
