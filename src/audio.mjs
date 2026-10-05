import { microphonePermission, keepAwake } from './platform.mjs';
import { MAX_AUDIO_SECONDS, MAX_FILE_BYTES } from './codec.mjs';
export async function readAudio(blob) {
  if (!blob?.size) throw Object.assign(new Error('fileError'), { code: 'fileError' });
  if (blob.size > MAX_FILE_BYTES) throw Object.assign(new Error('fileTooLarge'), { code: 'fileTooLarge' });
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw Object.assign(new Error('audioUnsupported'), { code: 'audioUnsupported' });
  const context = new Context({ sampleRate: 48000 });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (buffer.duration > MAX_AUDIO_SECONDS) throw Object.assign(new Error('audioTooLong'), { code: 'audioTooLong' });
    const samples = new Float32Array(buffer.length);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < samples.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
    }
    return { samples, sampleRate: buffer.sampleRate };
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(new Error('fileError'), { code: 'fileError' });
  } finally { await context.close(); }
}
export class PCMRecorder {
  constructor() { this.running = false; this.starting = false; this.chunks = []; this.timer = null; this.frames = 0; }
  async start({ onLevel = () => {}, onLimit = () => {}, onError = () => {}, duration = MAX_AUDIO_SECONDS } = {}) {
    if (this.running || this.starting) return;
    this.starting = true; this.cancelled = false; this.onError = onError;
    try {
      // Resume inside the user gesture, before an OS permission dialog can suspend it.
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw Object.assign(new Error('audioUnsupported'), { code: 'audioUnsupported' });
      this.context = new Context({ sampleRate: 48000 });
      await this.context.resume();
      await microphonePermission();
      if (this.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('micInsecure'), { code: 'micInsecure' });
      this.stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000 } });
      if (this.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      this.sampleRate = this.context.sampleRate; this.chunks = []; this.frames = 0;
      const collect = data => {
        this.chunks.push(data); this.frames += data.length;
        let energy = 0; for (const value of data) energy += value * value;
        onLevel(Math.min(1, Math.sqrt(energy / data.length) * 5), this.frames / this.sampleRate);
        if (this.frames / this.sampleRate >= duration && !this.limitReached) { this.limitReached = true; onLimit(); }
      };
      this.source = this.context.createMediaStreamSource(this.stream);
      this.limitReached = false;
      try {
        await this.context.audioWorklet.addModule('./recorder.worklet.js');
        this.node = new AudioWorkletNode(this.context, 'pcm-recorder');
        this.node.port.onmessage = ({ data }) => { if (data === 'stopped') this.flushResolve?.(); else collect(data); };
      } catch {
        // Older Android WebViews: retain raw PCM rather than falling back to lossy Opus.
        this.node = this.context.createScriptProcessor(4096, 1, 1);
        this.node.onaudioprocess = event => { if (this.running) collect(event.inputBuffer.getChannelData(0).slice()); event.outputBuffer.getChannelData(0).fill(0); };
      }
      if (this.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      this.running = true; this.startedAt = performance.now();
      this.source.connect(this.node); this.node.connect(this.context.destination);
      this.stream.getTracks().forEach(track => { track.onended = () => { if (this.running) onError(Object.assign(new Error('micLost'), { code: 'micLost' })); }; });
      await keepAwake(true);
      this.timer = setTimeout(onLimit, Math.min(duration, MAX_AUDIO_SECONDS) * 1000);
    } catch (error) {
      await this.cleanup();
      if (error.code) throw error;
      const code = { NotAllowedError: 'micDenied', SecurityError: 'micInsecure', NotFoundError: 'micMissing', NotReadableError: 'micBusy', AbortError: 'micBusy' }[error.name] || 'micError';
      throw Object.assign(new Error(code), { code });
    } finally { this.starting = false; }
  }
  async stop(discard = false) {
    if (this.starting) { this.cancelled = true; return null; }
    if (!this.running) return null;
    this.running = false; clearTimeout(this.timer);
    if (this.node?.port) {
      await new Promise(resolve => { this.flushResolve = resolve; this.node.port.postMessage('stop'); setTimeout(resolve, 200); });
    }
    const samples = new Float32Array(this.frames); let offset = 0;
    for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    const sampleRate = this.sampleRate;
    await this.cleanup(); this.chunks = [];
    return discard ? null : { samples, sampleRate };
  }
  async cleanup() {
    clearTimeout(this.timer);
    for (const track of this.stream?.getTracks() || []) { track.onended = null; track.stop(); }
    this.node?.disconnect(); this.source?.disconnect();
    if (this.context && this.context.state !== 'closed') await this.context.close().catch(() => {});
    this.running = false; this.stream = null; this.node = null; this.context = null;
    await keepAwake(false);
  }
}
