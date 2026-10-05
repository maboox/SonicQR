// This harness bypasses the single-instance Unix socket only for sandboxed CI tests.
// The production main process still enforces its normal single-instance lock.
const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.requestSingleInstanceLock = () => true;
const savePath = path.resolve(__dirname, '../qa/electron-save.wav');
fs.mkdirSync(path.dirname(savePath), { recursive: true });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });
let watchdog = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 30000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const capabilities = await win.webContents.executeJavaScript(`({ secure: window.isSecureContext, bridge: typeof window.audioQR?.saveWave, worker: typeof Worker, crypto: !!crypto.subtle })`);
      if (!capabilities.secure || capabilities.bridge !== 'function' || !capabilities.crypto) throw new Error('Missing secure app capabilities: ' + JSON.stringify(capabilities));
      await win.webContents.executeJavaScript(`document.getElementById('message').value = 'Electron test message'; document.getElementById('message').dispatchEvent(new Event('input')); document.getElementById('buildBtn').click();`);
      await new Promise(resolve => setTimeout(resolve, 250));
      await win.webContents.executeJavaScript(`document.getElementById('saveSignal').click();`);
      await new Promise(resolve => setTimeout(resolve, 250));
      if (!fs.existsSync(savePath) || fs.readFileSync(savePath).toString('ascii', 0, 4) !== 'RIFF') throw new Error('Native WAV export failed');
      const mic = await win.webContents.executeJavaScript(`navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return true; }).catch(error => error.name)`);
      if (mic !== true) throw new Error('Audio permission failed: ' + mic);
      const camera = await win.webContents.executeJavaScript(`navigator.mediaDevices.getUserMedia({ video: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return true; }).catch(error => error.name)`);
      if (camera === true) throw new Error('Unexpected camera permission');
      console.log('PASS Electron local secure origin, preload bridge, encryption capability, WAV native save, audio permission, camera denial.');
      clearTimeout(watchdog); app.exit(0);
    } catch (error) { console.error(error); clearTimeout(watchdog); app.exit(1); }
  });
});
require('../main.cjs');
