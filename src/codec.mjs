import { deflateSync, inflateSync } from 'fflate';

export const SAMPLE_RATE = 48000;
export const MAX_TEXT_BYTES = 2000;
export const MAX_AUDIO_SECONDS = 120;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PROFILES = Object.freeze({
  fast: { id: 1, symbolSeconds: 0.022, frequencies: Array.from({ length: 16 }, (_, i) => 1000 + i * 400), preamble: 7800, marker: 600, amplitude: 0.68 },
  hidden: { id: 2, symbolSeconds: 0.026, frequencies: Array.from({ length: 16 }, (_, i) => 14500 + i * 280), preamble: 19300, marker: 13600, amplitude: 0.055 },
});
const encoder = new TextEncoder();
export class CodecError extends Error {
  constructor(code) { super(code); this.name = 'CodecError'; this.code = code; }
}
export function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
async function deriveKey(password, salt, usage) {
  if (!globalThis.crypto?.subtle) throw new CodecError('cryptoUnavailable');
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
export async function makePacket(text, password = '', profileId = 1) {
  const original = encoder.encode(text);
  if (!text.trim()) throw new CodecError('emptyMessage');
  if (Array.from(text).length > 500 || original.length > MAX_TEXT_BYTES) throw new CodecError('messageTooLong');
  if (![1, 2].includes(profileId)) throw new CodecError('invalidPacket');
  const compressed = deflateSync(original, { level: 6 });
  let data = compressed.length + 2 < original.length ? compressed : original;
  let flags = data === compressed ? 2 : 0;
  if (password) {
    // The v3 layout is retained so existing Audio QR recordings remain readable.
    const salt = crypto.getRandomValues(new Uint8Array(8));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, 'encrypt');
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
    data = new Uint8Array(20 + encrypted.length);
    data.set(salt); data.set(iv, 8); data.set(encrypted, 20);
    flags |= 1;
  }
  const packet = new Uint8Array(9 + data.length);
  packet.set([83, 81, 3, profileId, flags, data.length >> 8, data.length & 255]);
  packet.set(data, 7);
  const check = crc16(packet.subarray(0, -2));
  packet[packet.length - 2] = check >> 8; packet[packet.length - 1] = check & 255;
  return packet;
}
export async function unpackPacket(packet, password = '') {
  if (packet.length < 9 || packet[0] !== 83 || packet[1] !== 81 || packet[2] !== 3 || ![1, 2].includes(packet[3]) || packet[4] & ~3) throw new CodecError('invalidPacket');
  const length = packet[5] * 256 + packet[6];
  if (length > MAX_TEXT_BYTES + 36 || packet.length !== 9 + length || crc16(packet.subarray(0, -2)) !== packet.at(-2) * 256 + packet.at(-1)) throw new CodecError('invalidPacket');
  let data = packet.slice(7, -2);
  if (packet[4] & 1) {
    if (!password) throw new CodecError('passwordNeeded');
    if (data.length < 36) throw new CodecError('invalidPacket');
    const key = await deriveKey(password, data.subarray(0, 8), 'decrypt');
    try { data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(8, 20) }, key, data.subarray(20))); }
    catch { throw new CodecError('badPassword'); }
  }
  if (packet[4] & 2) {
    // A fixed output buffer bounds decompression of hostile acoustic packets.
    try {
      data = inflateSync(data, { out: new Uint8Array(MAX_TEXT_BYTES + 1) });
    } catch { throw new CodecError('invalidPacket'); }
  }
  if (data.length > MAX_TEXT_BYTES) throw new CodecError('messageTooLong');
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(data), profile: packet[3] === 1 ? 'fast' : 'hidden' }; }
  catch { throw new CodecError('invalidPacket'); }
}
function writeTone(out, start, count, frequency, amplitude) {
  const fade = Math.min(150, Math.floor(count / 7));
  for (let i = 0; i < count; i++) {
    const envelope = Math.min(1, i / fade, (count - 1 - i) / fade);
    out[start + i] = Math.sin(2 * Math.PI * frequency * i / SAMPLE_RATE) * amplitude * envelope;
  }
}
export function modulate(packet, profileName = 'fast', amplitude) {
  const p = PROFILES[profileName];
  if (!p) throw new CodecError('invalidPacket');
  const symbolLength = Math.floor(p.symbolSeconds * SAMPLE_RATE);
  const dataStart = Math.round(0.36 * SAMPLE_RATE);
  const out = new Float32Array(dataStart + packet.length * 2 * symbolLength + Math.round(0.06 * SAMPLE_RATE));
  const amp = amplitude ?? p.amplitude;
  writeTone(out, 0, Math.round(0.16 * SAMPLE_RATE), p.preamble, amp);
  writeTone(out, Math.round(0.21 * SAMPLE_RATE), Math.round(0.1 * SAMPLE_RATE), p.marker, amp);
  let position = dataStart;
  for (const byte of packet) {
    writeTone(out, position, symbolLength, p.frequencies[byte >> 4], amp); position += symbolLength;
    writeTone(out, position, symbolLength, p.frequencies[byte & 15], amp); position += symbolLength;
  }
  return out;
}
export function waveBytes(samples, sampleRate = SAMPLE_RATE) {
  if (!samples.length || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new CodecError('fileError');
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
export function resample(samples, sourceRate, targetRate = SAMPLE_RATE) {
  if (sourceRate === targetRate) return samples;
  const result = new Float32Array(Math.round(samples.length * targetRate / sourceRate));
  for (let i = 0; i < result.length; i++) {
    const index = i * sourceRate / targetRate, low = Math.floor(index), frac = index - low;
    result[i] = (samples[low] ?? 0) * (1 - frac) + (samples[Math.min(low + 1, samples.length - 1)] ?? 0) * frac;
  }
  return result;
}
export function mixCover(signal, cover, coverRate) {
  if (!cover.length) throw new CodecError('fileError');
  const normalized = resample(cover, coverRate);
  const offset = Math.round(0.22 * SAMPLE_RATE);
  const length = Math.max(normalized.length, signal.length + offset + Math.round(0.18 * SAMPLE_RATE));
  if (length / SAMPLE_RATE > MAX_AUDIO_SECONDS) throw new CodecError('audioTooLong');
  let peak = 0.001;
  for (const x of normalized) peak = Math.max(peak, Math.abs(x));
  const gain = Math.min(1, 0.78 / peak);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = normalized[i % normalized.length] * gain;
  for (let i = 0; i < signal.length; i++) out[offset + i] += signal[i];
  return { samples: out, looped: normalized.length < length };
}
function power(samples, start, length, frequency, sampleRate) {
  const coefficient = 2 * Math.cos(2 * Math.PI * frequency / sampleRate);
  let a = 0, b = 0;
  const end = Math.min(samples.length, start + length);
  for (let i = Math.max(0, start); i < end; i++) { const next = samples[i] + coefficient * a - b; b = a; a = next; }
  return Math.max(0, a * a + b * b - coefficient * a * b);
}
function readSymbol(samples, start, length, profile, sampleRate) {
  let best = -1, symbol = 0;
  for (let i = 0; i < 16; i++) {
    const score = power(samples, start, length, profile.frequencies[i], sampleRate);
    if (score > best) { best = score; symbol = i; }
  }
  return symbol;
}
function byteAt(samples, start, index, profile, sampleRate, symbolLength) {
  const length = Math.floor(symbolLength * 0.68), margin = symbolLength * 0.16;
  const hi = readSymbol(samples, Math.round(start + index * 2 * symbolLength + margin), length, profile, sampleRate);
  const lo = readSymbol(samples, Math.round(start + (index * 2 + 1) * symbolLength + margin), length, profile, sampleRate);
  return (hi << 4) | lo;
}
function highPass(samples, sampleRate, cutoff) {
  const omega = 2 * Math.PI * cutoff / sampleRate, cos = Math.cos(omega), alpha = Math.sin(omega) / Math.SQRT2;
  const a0 = 1 + alpha, b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0;
  const a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const y = b0 * samples[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y; x2 = x1; x1 = samples[i]; y2 = y1; y1 = y;
  }
  return out;
}
function markerCandidates(samples, sampleRate, profile) {
  const window = Math.round(0.024 * sampleRate), step = Math.round(0.008 * sampleRate);
  const groups = [];
  let group = null;
  for (let start = 0; start + window <= samples.length; start += step) {
    let energy = 0;
    for (let i = start; i < start + window; i++) energy += samples[i] * samples[i];
    const tone = energy > 1e-10 ? power(samples, start, window, profile.marker, sampleRate) / (energy * window) : 0;
    if (tone > 0.10) {
      if (!group) group = { first: start, last: start, score: tone };
      group.last = start; group.score = Math.max(tone, group.score);
    } else if (group) { groups.push(group); group = null; }
  }
  if (group) groups.push(group);
  return groups.filter(g => (g.last - g.first) / sampleRate >= 0.032)
    .sort((a, b) => b.score - a.score).slice(0, 48)
    .map(g => ({ start: g.last + window / 2 + 0.05 * sampleRate, score: g.score }));
}
export async function decodeSamples(input, sampleRate, password = '', onProgress = () => {}) {
  if (!input.length || input.length / sampleRate > MAX_AUDIO_SECONDS + 0.1) throw new CodecError('audioTooLong');
  if (sampleRate < 16000) throw new CodecError('sampleRateLow');
  let foundPacket = null;
  for (const [name, p] of Object.entries(PROFILES)) {
    if (sampleRate / 2 <= p.preamble + 100) continue;
    // The audible profile is cheaper to analyze at 24 kHz.
    const sr = name === 'fast' && sampleRate > 24000 ? 24000 : sampleRate;
    let samples = sr === sampleRate ? input : resample(input, sampleRate, sr);
    if (name === 'hidden') samples = highPass(samples, sr, 12000);
    const candidates = markerCandidates(samples, sr, p);
    onProgress(name === 'fast' ? 0.15 : 0.60);
    for (let c = 0; c < candidates.length; c++) {
      for (const clock of [1, 0.9975, 1.0025, 0.995, 1.005]) {
        // floor reproduces the original transmitter's symbol duration at 48 kHz.
        const symbolLength = Math.floor(p.symbolSeconds * SAMPLE_RATE) * sr / SAMPLE_RATE * clock;
        for (let delta = -0.036 * sr; delta <= 0.044 * sr; delta += Math.max(1, Math.round(0.0008 * sr))) {
          const start = Math.round(candidates[c].start + delta);
          if (start < 0 || start + 18 * symbolLength > samples.length) continue;
          const prefix = [83, 81, 3, p.id];
          let valid = true;
          for (let i = 0; i < prefix.length; i++) if (byteAt(samples, start, i, p, sr, symbolLength) !== prefix[i]) { valid = false; break; }
          if (!valid) continue;
          const flags = byteAt(samples, start, 4, p, sr, symbolLength);
          const length = byteAt(samples, start, 5, p, sr, symbolLength) * 256 + byteAt(samples, start, 6, p, sr, symbolLength);
          if (flags & ~3 || length > MAX_TEXT_BYTES + 36 || start + (length + 9) * 2 * symbolLength > samples.length + 1) continue;
          const packet = new Uint8Array(length + 9);
          packet.set([...prefix, flags, length >> 8, length & 255]);
          for (let i = 7; i < packet.length; i++) packet[i] = byteAt(samples, start, i, p, sr, symbolLength);
          if (crc16(packet.subarray(0, -2)) !== packet.at(-2) * 256 + packet.at(-1)) continue;
          foundPacket = packet;
          // All subsequent attempts use this cached packet; no re-analysis is needed.
          try { return { ...await unpackPacket(packet, password), packet }; }
          catch (error) { if (error.code === 'passwordNeeded' || error.code === 'badPassword') { error.packet = packet; throw error; } throw error; }
        }
      }
      onProgress((name === 'fast' ? 0.15 : 0.6) + ((c + 1) / Math.max(1, candidates.length)) * 0.3);
    }
  }
  if (foundPacket) throw new CodecError('invalidPacket');
  throw new CodecError('noMessage');
}
