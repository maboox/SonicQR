import { decodeSamples, unpackPacket } from './codec.mjs';
self.onmessage = async ({ data }) => {
  try {
    const result = data.packet ? await unpackPacket(new Uint8Array(data.packet), data.password) :
      await decodeSamples(new Float32Array(data.samples), data.sampleRate, data.password, progress => self.postMessage({ id: data.id, progress }));
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.code || 'unexpected', packet: error.packet });
  }
};
