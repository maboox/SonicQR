const { chromium } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const qa = path.join(root, 'qa');
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const { makePacket, modulate, waveBytes } = await import('../src/codec.mjs');
  const original = 'سلام از QR صوتی 👋';
  const micSignal = modulate(await makePacket('Microphone transfer test'));
  const micFile = path.join(qa, 'mic-test.wav'); fs.writeFileSync(micFile, waveBytes(micSignal));
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]);
    const file = path.join(root, 'www', name);
    if (!file.startsWith(path.join(root, 'www') + path.sep)) { res.writeHead(404).end(); return; }
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)];
    try { res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(fs.readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${micFile}`] });
  let failures = [];
  try {
    const context = await browser.newContext({ acceptDownloads: true, permissions: ['microphone', 'clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') failures.push(msg.text()); });
    await page.goto(url);
    await page.locator('#message').fill(original);
    await page.locator('#buildBtn').click(); await page.locator('#outputReady').waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download'); await page.locator('#saveSignal').click();
    const signalDownload = await downloadPromise; const signalPath = path.join(qa, 'signal.wav'); await signalDownload.saveAs(signalPath);
    await page.locator('#receiveTab').click(); await page.locator('[data-source="file"]').click();
    await page.locator('#decodeFile').setInputFiles(signalPath);
    await page.waitForFunction(text => document.getElementById('resultText').textContent === text, original);
    await page.locator('#copyBtn').click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), original);
    await page.locator('#sendTab').click(); await page.locator('#message').fill(original + ' edited');
    assert.equal(await page.locator('#outputReady').isVisible(), false, 'edited text must invalidate audio');
    await page.locator('#message').fill('Encrypted Persian: سلام 🔐');
    await page.locator('.privacy-options summary').click(); await page.locator('#password').fill('test-password');
    await page.locator('#buildBtn').click(); await page.locator('#outputReady').waitFor({ state: 'visible' });
    const encryptedPromise = page.waitForEvent('download'); await page.locator('#saveSignal').click(); const encryptedPath = path.join(qa, 'encrypted.wav'); await (await encryptedPromise).saveAs(encryptedPath);
    await page.locator('#receiveTab').click(); await page.locator('#decodeFile').setInputFiles(encryptedPath);
    await page.waitForFunction(() => document.getElementById('receiveError').textContent.includes('encrypted'));
    await page.locator('#decodePassword').fill('wrong'); await page.locator('#retryBtn').click();
    await page.waitForFunction(() => document.getElementById('receiveError').textContent.includes('incorrect'));
    await page.locator('#decodePassword').fill('test-password'); await page.locator('#retryBtn').click();
    await page.waitForFunction(() => document.getElementById('resultText').textContent === 'Encrypted Persian: سلام 🔐');
    await page.screenshot({ path: path.join(qa, 'desktop-receive.png'), fullPage: true });
    await page.locator('#sendTab').click(); await page.locator('#password').fill(''); await page.locator('#message').fill('Mixed voice test');
    await page.locator('[data-profile="hidden"]').click(); await page.locator('#buildBtn').click(); await page.locator('#outputReady').waitFor({ state: 'visible' });
    const cover = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 400 * i / 48000) * 0.5);
    const coverPath = path.join(qa, 'cover.wav'); fs.writeFileSync(coverPath, waveBytes(cover));
    await page.locator('#coverFile').setInputFiles(coverPath); await page.locator('#mixedReady').waitFor({ state: 'visible' });
    await page.locator('#strength').selectOption('0.08'); await page.locator('#mixedReady').waitFor({ state: 'visible' });
    const mixedPromise = page.waitForEvent('download'); await page.locator('#saveMixed').click(); const mixedPath = path.join(qa, 'mixed.wav'); await (await mixedPromise).saveAs(mixedPath);
    await page.locator('#receiveTab').click(); await page.locator('#decodeFile').setInputFiles(mixedPath);
    await page.waitForFunction(() => document.getElementById('resultText').textContent === 'Mixed voice test');
    await page.locator('[data-source="microphone"]').click(); await page.locator('#listenBtn').click();
    await page.waitForFunction(() => document.getElementById('microphoneVisual').classList.contains('recording'));
    await page.waitForTimeout((micSignal.length / 48000 + 1) * 1000);
    await page.locator('#listenBtn').click(); await page.waitForFunction(() => document.getElementById('resultText').textContent === 'Microphone transfer test');
    await page.locator('#listenBtn').click(); await page.locator('#cancelRecording').waitFor({ state: 'visible' }); await page.locator('#cancelRecording').click();
    await page.waitForFunction(() => !document.getElementById('microphoneVisual').classList.contains('recording'));
    assert.equal(await page.evaluate(() => document.querySelector('#listenBtn').disabled), false);
    console.log('PASS encode, WAV export, file decode, clipboard, stale output, encrypted retry, cover mix, strength changes, raw PCM microphone, recording cancel.');
    for (const lang of ['en', 'fa']) {
      if (await page.getAttribute('html', 'lang') !== lang) await page.locator('#languageBtn').click();
      await page.locator('#sendTab').click(); await page.locator('[data-profile="fast"]').click();
      await page.locator('#message').fill(lang === 'fa' ? 'سلام! این پیام با صدا به تو می‌رسد. 👋' : 'Hello! This message travels through sound. 👋');
      await page.locator('#buildBtn').click(); await page.locator('#outputReady').waitFor({ state: 'visible' });
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 950 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow: ${lang}/${width}`);
        if (width === 390 || width === 1280) await page.screenshot({ path: path.join(qa, `${lang}-${width}.png`), fullPage: true });
      }
      await page.locator('#receiveTab').click(); await page.setViewportSize({ width: 360, height: 850 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `receive overflow: ${lang}`);
      await page.locator('#helpBtn').click(); await page.locator('#helpDialog').waitFor({ state: 'visible' }); await page.locator('#helpDone').click();
    }
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: path.join(qa, 'fa-dark-receive.png'), fullPage: true });
    await page.reload(); assert.equal(await page.getAttribute('html', 'lang'), 'fa');
    await page.evaluate(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('denied', 'NotAllowedError'); } }));
    await page.locator('#receiveTab').click(); await page.locator('#listenBtn').click(); await page.locator('#receiveError').waitFor({ state: 'visible' });
    assert.match(await page.locator('#receiveError').textContent(), /دسترسی میکروفون/);
    assert.equal(await page.locator('#listenBtn').isEnabled(), true);
    console.log('PASS English/Persian layout at 360/390/768/1280 px, language persistence, dark mode, help, denied microphone recovery.');
    assert.deepEqual(failures, [], 'browser errors');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
