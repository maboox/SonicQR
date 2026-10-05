const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
// Every CI job starts from its own checkout. Never rely on another job's www/.
for (const file of ['index.html', 'app.js', 'styles.css', 'decoder.worker.js', 'recorder.worklet.js', 'icon.png']) {
  const asset = path.join(root, 'www', file);
  if (!fs.existsSync(asset) || !fs.statSync(asset).size) {
    throw new Error(`Missing built asset: ${asset}. Run npm run test:desktop to build the app before testing.`);
  }
}
const { app, dialog } = require('electron');
// Only this harness bypasses the single-instance socket. Production keeps its lock.
app.requestSingleInstanceLock = () => true;
const savePath = path.join(root, 'qa/electron-save.wav');
fs.mkdirSync(path.dirname(savePath), { recursive: true });
fs.rmSync(savePath, { force: true });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });
let stage = 'loading the local app', finished = false;
const watchdog = setTimeout(() => finish(new Error(`Electron smoke test timed out while ${stage}`)), 45000);
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  if (error) console.error(`FAIL Electron smoke test while ${stage}:`, error);
  else console.log('PASS Electron local secure origin, preload bridge, encryption capability, WAV native save, audio permission, camera denial.');
  app.exit(error ? 1 : 0);
}
async function waitFor(check, description) {
  stage = description;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}
app.on('browser-window-created', (_event, win) => {
  const wc = win.webContents;
  wc.on('console-message', details => {
    if (details.level === 'error') console.error('Renderer:', details.message, `${details.sourceId}:${details.lineNumber}`);
  });
  wc.on('preload-error', (_event, file, error) => finish(new Error(`Preload failed (${file}): ${error.message}`)));
  wc.on('render-process-gone', (_event, details) => finish(new Error(`Renderer exited: ${details.reason} (${details.exitCode})`)));
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) finish(new Error(`Failed to load ${url}: ${description} (${code})`));
  });
  // Return renderer exceptions explicitly; executeJavaScript otherwise hides their details.
  async function evaluate(fn) {
    const result = await wc.executeJavaScript(`(async () => {
      try { return { ok: true, value: await (${fn.toString()})() }; }
      catch (error) { return { ok: false, error: error.stack || String(error) }; }
    })()`, true);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  wc.once('did-finish-load', async () => {
    try {
      stage = 'checking secure app capabilities';
      const capabilities = await evaluate(() => ({ secure: window.isSecureContext, bridge: typeof window.audioQR?.saveWave, worker: typeof Worker, crypto: !!crypto.subtle }));
      if (!capabilities.secure || capabilities.bridge !== 'function' || capabilities.worker !== 'function' || !capabilities.crypto) throw new Error('Missing secure app capabilities: ' + JSON.stringify(capabilities));
      await waitFor(() => evaluate(() => typeof document.getElementById('buildBtn')?.onclick === 'function'), 'initializing the interface');
      stage = 'creating an encrypted audio message';
      await evaluate(() => {
        const message = document.getElementById('message');
        message.value = 'Electron test message';
        message.dispatchEvent(new Event('input'));
        const password = document.getElementById('password');
        password.value = 'smoke-test-password';
        password.dispatchEvent(new Event('input'));
        document.getElementById('buildBtn').click();
      });
      await waitFor(() => evaluate(() => {
        const error = document.getElementById('sendError');
        if (!error.hidden) throw new Error(error.textContent);
        return !document.getElementById('outputReady').hidden && !document.getElementById('saveSignal').disabled;
      }), 'generating the WAV');
      stage = 'saving through the native dialog';
      await evaluate(() => document.getElementById('saveSignal').click());
      await waitFor(() => {
        if (!fs.existsSync(savePath)) return false;
        const bytes = fs.readFileSync(savePath);
        return bytes.length > 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
      }, 'writing the native WAV file');
      stage = 'requesting audio permission';
      const mic = await evaluate(() => navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return true; }).catch(error => error.name));
      if (mic !== true) throw new Error('Audio permission failed: ' + mic);
      stage = 'checking camera permission is denied';
      const camera = await evaluate(() => navigator.mediaDevices.getUserMedia({ video: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return true; }).catch(error => error.name));
      if (camera !== 'NotAllowedError') throw new Error('Expected camera denial, received: ' + camera);
      finish();
    } catch (error) { finish(error); }
  });
});
require('../main.cjs');
