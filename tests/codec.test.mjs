import test from 'node:test';
import assert from 'node:assert/strict';
import { makePacket, unpackPacket, modulate, decodeSamples, mixCover, waveBytes, crc16, resample } from '../src/codec.mjs';
const messages = ['Hello from Audio QR', 'سلام، این یک پیام فارسی است 👋', 'Repeat '.repeat(50)];
for (const message of messages) test(`UTF-8 packet round trip: ${message.slice(0, 20)}`, async () => {
  const packet = await makePacket(message);
  assert.equal((await unpackPacket(packet)).text, message);
});
test('AES-GCM round trip, missing/wrong password and CRC damage', async () => {
  const packet = await makePacket('پیام محرمانه 🔐', 'secret 123');
  assert.equal((await unpackPacket(packet, 'secret 123')).text, 'پیام محرمانه 🔐');
  await assert.rejects(unpackPacket(packet), { code: 'passwordNeeded' });
  await assert.rejects(unpackPacket(packet, 'wrong'), { code: 'badPassword' });
  packet[10] ^= 1;
  await assert.rejects(unpackPacket(packet, 'secret 123'), { code: 'invalidPacket' });
});
for (const profile of ['fast', 'hidden']) test(`${profile}: acoustic round trip after arbitrary leading/trailing silence`, async () => {
  const message = 'سلام QR 123 👋';
  const packet = await makePacket(message, '', profile === 'fast' ? 1 : 2);
  const signal = modulate(packet, profile);
  const audio = new Float32Array(signal.length + 51037);
  audio.set(signal, 17413);
  assert.equal((await decodeSamples(audio, 48000)).text, message);
});
test('Audible signal: 44.1 kHz, gain change and deterministic noise', async () => {
  const signal = resample(modulate(await makePacket('A real recording 42')), 48000, 44100);
  let seed = 23;
  const audio = new Float32Array(signal.length + 29100);
  for (let i = 0; i < audio.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; audio[i] = ((seed / 2 ** 32) * 2 - 1) * 0.003; }
  for (let i = 0; i < signal.length; i++) audio[i + 15477] += signal[i] * 0.08;
  assert.equal((await decodeSamples(audio, 44100)).text, 'A real recording 42');
});
test('Low-audibility message survives cover mixing and loop indication', async () => {
  const signal = modulate(await makePacket('Hidden voice message', '', 2), 'hidden');
  const cover = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 330 * i / 48000) * 0.7);
  const mixed = mixCover(signal, cover, 48000);
  assert.equal(mixed.looped, true);
  assert.equal((await decodeSamples(mixed.samples, 48000)).text, 'Hidden voice message');
});
test('WAV metadata, clipping and invalid values', () => {
  const bytes = waveBytes(new Float32Array([-2, 0, 2, NaN]));
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 52); assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getInt16(44, true), -32768); assert.equal(view.getInt16(48, true), 32767);
  assert.equal(view.getInt16(50, true), 0);
});
test('Reject malformed packets, oversized messages and silent audio', async () => {
  await assert.rejects(makePacket('x'.repeat(501)), { code: 'messageTooLong' });
  await assert.rejects(makePacket('  '), { code: 'emptyMessage' });
  await assert.rejects(unpackPacket(new Uint8Array(2)), { code: 'invalidPacket' });
  await assert.rejects(decodeSamples(new Float32Array(48000), 48000), { code: 'noMessage' });
});
test('CRC known vector', () => assert.equal(crc16(new TextEncoder().encode('123456789')), 0x29b1));
test('Hidden signal in a 44.1 kHz music-like mix', async () => {
  const signal = modulate(await makePacket('پوشش موسیقی', '', 2), 'hidden', 0.035);
  const cover = Float32Array.from({ length: 44100 * 3 }, (_, i) => Math.sin(2 * Math.PI * 170 * i / 44100) * 0.4 + Math.sin(2 * Math.PI * 1100 * i / 44100) * 0.15);
  const mixed = mixCover(signal, cover, 44100);
  assert.equal((await decodeSamples(resample(mixed.samples, 48000, 44100), 44100)).text, 'پوشش موسیقی');
});
test('Encrypted packet is cached when detected acoustically without a password', async () => {
  const audio = modulate(await makePacket('secret in sound', 'password'));
  let cached;
  try { await decodeSamples(audio, 48000); } catch (error) { assert.equal(error.code, 'passwordNeeded'); cached = error.packet; }
  assert.ok(cached); assert.equal((await unpackPacket(cached, 'password')).text, 'secret in sound');
});
test('Integrity-valid oversized compressed payload is bounded and rejected', async () => {
  const { deflateSync } = await import('fflate');
  const compressed = deflateSync(new Uint8Array(100000).fill(65));
  const packet = new Uint8Array(compressed.length + 9); packet.set([83, 81, 3, 1, 2, compressed.length >> 8, compressed.length & 255]); packet.set(compressed, 7);
  const crc = crc16(packet.subarray(0, -2)); packet[packet.length - 2] = crc >> 8; packet[packet.length - 1] = crc & 255;
  await assert.rejects(unpackPacket(packet), { code: 'messageTooLong' });
});
test('Arbitrary file data fails rather than becoming decoded text', async () => {
  const samples = Float32Array.from({ length: 100000 }, (_, i) => Math.sin(i * 1.382) * 0.1);
  await assert.rejects(decodeSamples(samples, 48000), { code: 'noMessage' });
});
