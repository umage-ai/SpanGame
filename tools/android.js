// native: runs the Android Gradle build with the right JDK and SDK found automatically (docs/NATIVE.md).
// Usage: node tools/android.js [gradle tasks...]        (default: assembleDebug)
//   npm run android:debug     -> android/app/build/outputs/apk/debug/app-debug.apk
//   npm run android:release   -> android/app/build/outputs/bundle/release/app-release.aab (+ apk/release/app-release.apk)
// JAVA_HOME / ANDROID_HOME are used when set; otherwise Android Studio's bundled JDK and the default SDK folder.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = path.resolve(__dirname, '..', 'android');
const win = process.platform === 'win32';
const env = Object.assign({}, process.env);

const first = list => list.filter(Boolean).find(p => fs.existsSync(p));
if (!env.JAVA_HOME) {
  const jdk = first(win
    ? [path.join(env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')]
    : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', path.join(env.HOME || '', 'android-studio', 'jbr'), '/opt/android-studio/jbr']);
  if (jdk) env.JAVA_HOME = jdk;
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const sdk = first(win
    ? [path.join(env.LOCALAPPDATA || '', 'Android', 'Sdk')]
    : [path.join(env.HOME || '', 'Library', 'Android', 'sdk'), path.join(env.HOME || '', 'Android', 'Sdk')]);
  if (sdk) env.ANDROID_HOME = sdk;
}
if (!env.JAVA_HOME) console.warn('[android] no JAVA_HOME and no Android Studio JDK found: Gradle will use java from PATH');
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) console.warn('[android] no Android SDK found: set ANDROID_HOME');

const tasks = process.argv.slice(2);
const gradlew = path.join(DIR, win ? 'gradlew.bat' : 'gradlew');
const r = spawnSync(win ? '"' + gradlew + '"' : gradlew, tasks.length ? tasks : ['assembleDebug'], { cwd: DIR, env, stdio: 'inherit', shell: win });
process.exit(r.status == null ? 1 : r.status);
