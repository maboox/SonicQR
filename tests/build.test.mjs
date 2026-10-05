import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('A clean source checkout builds every offline runtime asset', async () => {
  const checkout = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-qr-build-'));
  try {
    for (const entry of ['scripts', 'src', 'assets', 'index.html']) {
      await fs.cp(path.join(root, entry), path.join(checkout, entry), { recursive: true });
    }
    await fs.symlink(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'), 'junction');
    const built = spawnSync(process.execPath, ['scripts/build-web.cjs'], { cwd: checkout, encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr || built.error?.message);
    const files = await fs.readdir(path.join(checkout, 'www'));
    assert.deepEqual(files.sort(), ['app.js', 'decoder.worker.js', 'icon.png', 'index.html', 'recorder.worklet.js', 'styles.css']);
    for (const file of files) assert.ok((await fs.stat(path.join(checkout, 'www', file))).size > 0, file);
    const html = await fs.readFile(path.join(checkout, 'www/index.html'), 'utf8');
    assert.match(html, /src="\.\/app\.js"/);
    assert.match(html, /href="\.\/styles\.css"/);
    assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  } finally { await fs.rm(checkout, { recursive: true, force: true }); }
});

test('Electron reports missing web output before starting its native runtime', async () => {
  const checkout = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-qr-electron-'));
  try {
    await fs.mkdir(path.join(checkout, 'tests'));
    await fs.copyFile(path.join(root, 'tests/electron-smoke.cjs'), path.join(checkout, 'tests/electron-smoke.cjs'));
    const result = spawnSync(process.execPath, ['tests/electron-smoke.cjs'], { cwd: checkout, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing built asset:.*index\.html/);
    assert.match(result.stderr, /npm run test:desktop/);
    assert.doesNotMatch(result.stderr, /Cannot find module 'electron'/);
  } finally { await fs.rm(checkout, { recursive: true, force: true }); }
});
