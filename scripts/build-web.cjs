const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
esbuild.buildSync({ entryPoints: [path.join(root, 'src/app.mjs')], bundle: true, format: 'iife', platform: 'browser', target: 'chrome90', minify: true, outfile: path.join(out, 'app.js') });
esbuild.buildSync({ entryPoints: [path.join(root, 'src/decoder.worker.mjs')], bundle: true, format: 'iife', platform: 'browser', target: 'chrome90', minify: true, outfile: path.join(out, 'decoder.worker.js') });
for (const [source, destination] of [['index.html', 'index.html'], ['src/styles.css', 'styles.css'], ['src/recorder.worklet.js', 'recorder.worklet.js'], ['assets/icon.png', 'icon.png']]) {
  fs.copyFileSync(path.join(root, source), path.join(out, destination));
}
console.log('Offline app assets built in www/.');
