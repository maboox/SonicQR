const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const android = path.join(root, 'android');
const cli = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
function cap(...args) { execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' }); }
if (!fs.existsSync(path.join(android, 'settings.gradle'))) cap('add', 'android');
const topGradle = path.join(android, 'build.gradle');
fs.writeFileSync(topGradle, fs.readFileSync(topGradle, 'utf8').replace(/\s*classpath 'com.google.gms:google-services:[^']+'/, ''));
for (const file of ['app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java', 'app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java']) fs.rmSync(path.join(android, file), { force: true });
const java = path.join(android, 'app/src/main/java/app/audioqr/mobile');
fs.mkdirSync(java, { recursive: true });
for (const file of ['AudioAccessPlugin.java', 'MainActivity.java']) fs.copyFileSync(path.join(root, 'native/android', file), path.join(java, file));
const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.permission.RECORD_AUDIO')) manifest = manifest.replace('</manifest>', '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n</manifest>');
// No camera/storage blanket permissions. A system picker grants access to chosen files.
manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
manifest = manifest.replace(/android:label="@string\/app_name"/, 'android:label="@string/app_name" android:usesCleartextTraffic="false"');
manifest = manifest.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask" android:windowSoftInputMode="adjustResize"');
manifest = manifest.replace(/(android:windowSoftInputMode="adjustResize")\s+android:windowSoftInputMode="adjustResize"/g, '$1');
manifest = manifest.replace(/(android:usesCleartextTraffic="false")\s+android:usesCleartextTraffic="false"/g, '$1');
fs.writeFileSync(manifestPath, manifest);
const gradlePath = path.join(android, 'app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8').replace(/versionCode\s+\d+/, 'versionCode 2').replace(/versionName\s+"[^"]+"/, 'versionName "1.1.0"');
gradle = gradle.replace(/\ntry \{[\s\S]*?Push Notifications won't work"\)\n\}/, '');
if (!gradle.includes("apply from: '../../native/android/signing.gradle'")) gradle += "\napply from: '../../native/android/signing.gradle'\n";
fs.writeFileSync(gradlePath, gradle);
fs.writeFileSync(path.join(android, 'app/src/main/res/xml/file_paths.xml'), '<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="audio_qr" path="audio-qr/"/></paths>\n');
const res = path.join(android, 'app/src/main/res');
for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const dir = path.join(res, `mipmap-${density}`); fs.mkdirSync(dir, { recursive: true });
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) fs.copyFileSync(path.join(root, `assets/android-${size}.png`), path.join(dir, name));
  fs.copyFileSync(path.join(root, `assets/android-foreground-${size}.png`), path.join(dir, 'ic_launcher_foreground.png'));
}
fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), '<resources><color name="ic_launcher_background">#087f75</color></resources>\n');
const adaptive = path.join(res, 'mipmap-anydpi-v26'); fs.mkdirSync(adaptive, { recursive: true });
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) fs.writeFileSync(path.join(adaptive, name), '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n');
fs.writeFileSync(path.join(res, 'drawable/audioqr_splash.xml'), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:strokeColor="#ffffff" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M34,47 L34,61 M44,39 L44,69 M54,31 L54,77 M64,39 L64,69 M74,47 L74,61"/></vector>\n');
const colors = path.join(res, 'values/styles.xml');
let styles = fs.readFileSync(colors, 'utf8').replace(/<item name="colorPrimary">[^<]*<\/item>/, '<item name="colorPrimary">#087f75</item>').replace(/<item name="colorPrimaryDark">[^<]*<\/item>/, '<item name="colorPrimaryDark">#066c63</item>').replace(/<item name="colorAccent">[^<]*<\/item>/, '<item name="colorAccent">#087f75</item>');
if (!styles.includes('windowSplashScreenBackground')) styles = styles.replace('<item name="android:background">@drawable/splash</item>', '<item name="android:background">#087f75</item>\n        <item name="windowSplashScreenBackground">#087f75</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/audioqr_splash</item>\n        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>');
fs.writeFileSync(colors, styles);
cap('sync', 'android');
console.log('Android permission bridge, native export, app icon and version configured.');
