import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { MAX_FILE_BYTES } from './codec.mjs';
const NativeAudio = registerPlugin('AudioAccess');
export const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : (window.audioQR ? 'windows' : 'web');
export const isAndroid = platform === 'android';
export async function microphonePermission(request = true) {
  if (isAndroid) {
    const status = await (request ? NativeAudio.requestMicrophone() : NativeAudio.checkMicrophone());
    if (request && status.microphone !== 'granted') throw Object.assign(new Error('micDenied'), { code: 'micDenied' });
    return status.microphone;
  }
  try { return (await navigator.permissions.query({ name: 'microphone' })).state; }
  catch { return 'prompt'; }
}
export async function openMicrophoneSettings() {
  if (isAndroid) return NativeAudio.openSettings();
  if (window.audioQR) return window.audioQR.openMicrophoneSettings();
}
export async function keepAwake(enabled) { if (isAndroid) await NativeAudio.keepAwake({ enabled }).catch(() => {}); }
async function toBase64(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
}
export async function exportAudio(blob, filename, share = false) {
  if (!blob || blob.size > MAX_FILE_BYTES) throw Object.assign(new Error('fileTooLarge'), { code: 'fileTooLarge' });
  if (isAndroid) return NativeAudio.exportWave({ filename, data: await toBase64(blob), share });
  if (window.audioQR) return window.audioQR.saveWave({ filename, bytes: new Uint8Array(await blob.arrayBuffer()) });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { saved: true };
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const textarea = document.createElement('textarea'); textarea.value = text;
    textarea.style.cssText = 'position:fixed;top:0;opacity:0'; document.body.append(textarea); textarea.select();
    const success = document.execCommand('copy'); textarea.remove();
    if (!success) throw Object.assign(new Error('copyFailed'), { code: 'copyFailed' });
  }
}
export async function setupLifecycle(onBackground, onBack) {
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBackground(); });
  if (isAndroid) {
    await App.addListener('appStateChange', ({ isActive }) => { if (!isActive) onBackground(); });
    await App.addListener('backButton', async () => { if (!onBack()) await App.exitApp(); });
  }
}
