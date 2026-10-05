import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('Desktop permissions, isolated renderer, local assets and bounded save IPC', async () => {
  const handlers = new Map(); let window, privileges, protocolHandler, saved;
  const session = { setPermissionCheckHandler(fn) { this.check = fn; }, setPermissionRequestHandler(fn) { this.request = fn; } };
  class BrowserWindow extends EventEmitter {
    static getAllWindows() { return window ? [window] : []; }
    constructor(options) { super(); this.options = options; window = this; this.webContents = new EventEmitter(); this.webContents.session = session; this.webContents.getURL = () => this.url; this.webContents.setWindowOpenHandler = fn => { this.popup = fn; }; }
    loadURL(url) { this.url = url; } show() {}
  }
  const app = new EventEmitter(); app.requestSingleInstanceLock = () => true; app.whenReady = async () => {};
  app.getPath = () => '/downloads'; app.quit = () => {};
  const electron = { app, BrowserWindow, protocol: { registerSchemesAsPrivileged(value) { privileges = value; }, handle(_scheme, fn) { protocolHandler = fn; } }, ipcMain: { handle(name, fn) { handlers.set(name, fn); } }, dialog: { showSaveDialog: async () => ({ canceled: false, filePath: '/selected/audio.wav' }) }, shell: { openExternal: async () => {} }, Menu: { setApplicationMenu() {} } };
  const fakeFs = { readFile: async file => { assert.ok(file.startsWith(path.join(root, 'www'))); return new Uint8Array([1]); }, writeFile: async (file, bytes) => { saved = { file, bytes }; } };
  const sandbox = { require: name => name === 'electron' ? electron : name === 'node:fs/promises' ? fakeFs : name === 'node:path' ? path : undefined, __dirname: root, Buffer, Uint8Array, URL, Response, process: { platform: 'win32' } };
  vm.runInNewContext(await fs.readFile(path.join(root, 'main.cjs'), 'utf8'), sandbox);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(privileges[0].privileges.secure, true); assert.equal(window.options.webPreferences.sandbox, true); assert.equal(window.options.webPreferences.nodeIntegration, false); assert.equal(window.options.webPreferences.contextIsolation, true);
  const wc = window.webContents;
  assert.equal(session.check(wc, 'media', 'audioqr://local', { mediaType: 'audio' }), true);
  assert.equal(session.check(wc, 'media', 'audioqr://local', { mediaType: 'video' }), false);
  assert.equal(session.check(wc, 'media', 'https://external.example', { mediaType: 'audio' }), false);
  let allowed;
  session.request(wc, 'media', value => { allowed = value; }, { requestingUrl: window.url, mediaTypes: ['audio'] }); assert.equal(allowed, true);
  session.request(wc, 'media', value => { allowed = value; }, { requestingUrl: window.url, mediaTypes: ['audio', 'video'] }); assert.equal(allowed, false);
  session.request(wc, 'geolocation', value => { allowed = value; }, { requestingUrl: window.url }); assert.equal(allowed, false);
  assert.equal((await protocolHandler({ url: 'audioqr://local/app.js', method: 'GET' })).status, 200);
  assert.equal((await protocolHandler({ url: 'audioqr://external/app.js', method: 'GET' })).status, 404);
  assert.equal((await protocolHandler({ url: 'audioqr://local/main.cjs', method: 'GET' })).status, 404);
  const save = handlers.get('audioqr:save-wave'); const event = { sender: wc, senderFrame: { url: window.url } };
  await assert.rejects(save({ sender: {}, senderFrame: { url: 'https://external.example' } }, {}), /Untrusted/);
  await assert.rejects(save(event, { bytes: new Uint8Array(100) }), /Invalid WAV/);
  const bytes = new Uint8Array(50); bytes.set(new TextEncoder().encode('RIFF')); bytes.set(new TextEncoder().encode('WAVE'), 8);
  assert.equal((await save(event, { filename: 'signal.wav', bytes })).saved, true); assert.equal(saved.file, '/selected/audio.wav');
});
