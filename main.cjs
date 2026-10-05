const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const ORIGIN = 'audioqr://local';
const assets = new Set(['index.html', 'app.js', 'styles.css', 'decoder.worker.js', 'recorder.worklet.js', 'icon.png']);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' };
let mainWindow;
protocol.registerSchemesAsPrivileged([{ scheme: 'audioqr', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const trusted = url => typeof url === 'string' && (url === ORIGIN || url.startsWith(ORIGIN + '/'));
function validateSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || !trusted(event.senderFrame?.url)) throw new Error('Untrusted caller');
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 900, minWidth: 360, minHeight: 560,
    backgroundColor: '#f6f8fb', title: 'Audio QR', show: false,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, preload: path.join(__dirname, 'preload.cjs') }
  });
  Menu.setApplicationMenu(null);
  const ses = mainWindow.webContents.session;
  // Permission checks and permission requests both restrict access to the local app.
  ses.setPermissionCheckHandler((wc, permission, origin, details) => wc === mainWindow?.webContents && trusted(origin) &&
    (permission === 'media' && details.mediaType === 'audio' || permission === 'clipboard-sanitized-write'));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => callback(wc === mainWindow?.webContents && trusted(details.requestingUrl || wc.getURL()) &&
    (permission === 'media' && details.mediaTypes?.length > 0 && details.mediaTypes.every(type => type === 'audio') || permission === 'clipboard-sanitized-write')));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault(); });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(ORIGIN + '/index.html');
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('audioqr', async request => {
      const url = new URL(request.url), name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (url.hostname !== 'local' || !assets.has(name) || request.method !== 'GET') return new Response('Not found', { status: 404 });
      try { return new Response(await fs.readFile(path.join(__dirname, 'www', name)), { headers: { 'Content-Type': mime[path.extname(name)], 'X-Content-Type-Options': 'nosniff' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    });
    ipcMain.handle('audioqr:save-wave', async (event, payload) => {
      validateSender(event);
      if (!payload || !(payload.bytes instanceof Uint8Array) || payload.bytes.length < 44 || payload.bytes.length > 25 * 1024 * 1024) throw new Error('Invalid audio data');
      const bytes = Buffer.from(payload.bytes);
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV file');
      const filename = typeof payload.filename === 'string' ? path.basename(payload.filename).replace(/[^A-Za-z0-9._-]/g, '_') : 'audio-qr.wav';
      const result = await dialog.showSaveDialog(mainWindow, { title: 'Save Audio QR', defaultPath: path.join(app.getPath('downloads'), filename), filters: [{ name: 'WAV audio', extensions: ['wav'] }] });
      if (result.canceled || !result.filePath) return { saved: false };
      await fs.writeFile(result.filePath, bytes); return { saved: true };
    });
    ipcMain.handle('audioqr:microphone-settings', async event => { validateSender(event); if (process.platform === 'win32') await shell.openExternal('ms-settings:privacy-microphone'); });
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
