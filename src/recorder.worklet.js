class PCMRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(4096); this.offset = 0; this.running = true;
    this.port.onmessage = event => { if (event.data === 'stop') { this.running = false; if (this.offset) this.port.postMessage(this.buffer.slice(0, this.offset)); this.port.postMessage('stopped'); } };
  }
  process(inputs, outputs) {
    // Never feed the microphone to the loudspeaker (prevents feedback).
    for (const channel of outputs[0] || []) channel.fill(0);
    if (!this.running) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      this.buffer[this.offset++] = sample;
      if (this.offset === this.buffer.length) { const complete = this.buffer; this.buffer = new Float32Array(4096); this.offset = 0; this.port.postMessage(complete, [complete.buffer]); }
    }
    return true;
  }
}
registerProcessor('pcm-recorder', PCMRecorder);
