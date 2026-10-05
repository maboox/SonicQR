import { makePacket, modulate, waveBytes, mixCover, SAMPLE_RATE, PROFILES, MAX_TEXT_BYTES, MAX_AUDIO_SECONDS } from './codec.mjs';
import { PCMRecorder, readAudio } from './audio.mjs';
import { exportAudio, copyText, openMicrophoneSettings, setupLifecycle, isAndroid, platform } from './platform.mjs';
import { I18N } from './i18n.mjs';
import { renderIcons } from './icons.mjs';
const $ = id => document.getElementById(id);
const stored = (() => { try { return localStorage.getItem('audioQrLang'); } catch { return null; } })();
const state = { lang: ['fa', 'en'].includes(stored) ? stored : (navigator.language.startsWith('fa') ? 'fa' : 'en'), profile: 'fast', tab: 'send', source: 'microphone', building: false, mixing: false, analyzing: false, preparing: false, exporting: false, recording: null, starting: false, signal: null, mixed: null, cover: null, result: null, pendingPacket: null, lastAudio: null, coverStatus: '', coverDetail: '', sendError: '', receiveError: '', revision: 0 };
const recorder = new PCMRecorder();
let toastKey = '';
let worker = null, workerTimeout = null, analysisId = 0, toastTimer = null;
const urls = new Map();
const tr = key => I18N[state.lang][key] || I18N[state.lang].unexpected;
const number = value => new Intl.NumberFormat(state.lang === 'fa' ? 'fa-IR' : 'en', { maximumFractionDigits: 1 }).format(value);
const seconds = value => `${number(value)} ${tr('seconds')}`;
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const waveBlob = (samples, sr = SAMPLE_RATE) => new Blob([waveBytes(samples, sr)], { type: 'audio/wav' });
const busy = () => state.building || state.mixing || state.analyzing || state.preparing || state.recording || state.starting || state.exporting;
function toast(key) { toastKey = key; $('toast').textContent = tr(key); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
function errorCode(error) { return error.code && I18N.en[error.code] ? error.code : 'unexpected'; }
function error(area, code = '') { state[`${area}Error`] = code; render(); }
function setAudio(id, blob) {
  const player = $(id); player.pause(); player.removeAttribute('src'); player.load();
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  if (blob) { const url = URL.createObjectURL(blob); urls.set(id, url); player.src = url; }
}
function invalidate() {
  state.revision++; state.signal = null; state.mixed = null; state.sendError = ''; state.coverStatus = state.cover ? 'coverSelected' : '';
  setAudio('signalPlayer', null); setAudio('mixedPlayer', null); render();
}
function render() {
  const current = state.lang;
  if (toastKey && !$('toast').hidden) $('toast').textContent = tr(toastKey);
  document.documentElement.lang = current; document.documentElement.dir = current === 'fa' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-placeholder]').forEach(el => { el.placeholder = tr(el.dataset.placeholder); });
  document.querySelectorAll('[data-title]').forEach(el => { el.title = tr(el.dataset.title); el.setAttribute('aria-label', tr(el.dataset.title)); });
  $('languageBtn').textContent = current === 'en' ? 'فارسی' : 'EN';
  $('languageBtn').setAttribute('aria-label', current === 'en' ? 'Switch to Persian' : 'تغییر زبان به انگلیسی');
  $('sendPanel').hidden = state.tab !== 'send'; $('receivePanel').hidden = state.tab !== 'receive';
  for (const tab of ['send', 'receive']) {
    $(tab + 'Tab').classList.toggle('active', tab === state.tab); $(tab + 'Tab').setAttribute('aria-selected', String(tab === state.tab));
    $(tab + 'Tab').disabled = !!(state.recording || state.starting || state.building || state.mixing);
  }
  const text = $('message').value, count = Array.from(text).length, bytes = new TextEncoder().encode(text).length;
  const valid = !!text.trim() && count <= 500 && bytes <= MAX_TEXT_BYTES;
  $('messageCount').textContent = `${number(count)} / ${number(500)} ${tr('characters')}`;
  $('messageCount').parentElement.classList.toggle('invalid', count > 500 || bytes > MAX_TEXT_BYTES);
  const estimated = 0.42 + (bytes + 9 + ($('password').value ? 36 : 0)) * 2 * PROFILES[state.profile].symbolSeconds;
  $('estimate').textContent = bytes ? `${tr('about')} ${seconds(estimated)}` : '—';
  if (count > 500 || bytes > MAX_TEXT_BYTES) state.sendError = 'messageTooLong';
  $('buildBtn').disabled = !valid || !!busy(); $('buildLabel').textContent = tr(state.building ? 'building' : 'createSignal');
  for (const id of ['message', 'password', 'clearMessage', 'strength', 'coverFile']) $(id).disabled = !!(state.recording || state.starting || state.building || state.mixing);
  document.querySelectorAll('[data-profile]').forEach(el => { el.classList.toggle('selected', el.dataset.profile === state.profile); el.setAttribute('aria-pressed', String(el.dataset.profile === state.profile)); el.disabled = !!(state.recording || state.starting || state.building || state.mixing); });
  $('coverCard').hidden = state.profile !== 'hidden';
  $('outputEmpty').hidden = !!state.signal; $('outputReady').hidden = !state.signal;
  $('outputBadge').textContent = tr(state.signal ? 'ready' : 'waiting'); $('outputBadge').classList.toggle('ready', !!state.signal); $('waveArt').classList.toggle('ready', !!state.signal);
  $('signalTitle').textContent = tr(state.signal?.profile === 'hidden' ? 'hidden' : 'fast');
  $('signalMeta').textContent = state.signal ? `${seconds(state.signal.duration)} · WAV` : '';
  $('coverDuration').textContent = state.signal ? seconds(state.signal.duration + 0.6) : '—';
  $('coverRecord').disabled = (!state.signal || !!busy()) && state.recording !== 'cover';
  $('coverRecordLabel').textContent = tr(state.recording === 'cover' ? 'stopCover' : (state.starting && state.tab === 'send' ? 'requestingMic' : 'recordCover'));
  $('coverRecord').classList.toggle('recording-button', state.recording === 'cover'); $('coverRecording').hidden = state.recording !== 'cover';
  $('coverStatus').textContent = (state.coverStatus ? tr(state.coverStatus) : '') + (state.coverDetail ? ` · ${state.coverDetail}` : '');
  $('mixedReady').hidden = !state.mixed;
  $('sendTip').textContent = tr(state.profile === 'hidden' ? 'hiddenWarning' : 'sendTip');
  $('microphoneSource').hidden = state.source !== 'microphone'; $('fileSource').hidden = state.source !== 'file';
  document.querySelectorAll('[data-source]').forEach(el => { el.classList.toggle('selected', el.dataset.source === state.source); el.setAttribute('aria-pressed', String(el.dataset.source === state.source)); el.disabled = !!(state.recording || state.starting || state.preparing || state.analyzing); });
  $('listenBtn').disabled = !!busy() && state.recording !== 'listen'; $('listenLabel').textContent = tr(state.recording === 'listen' ? 'stopDecode' : (state.starting && state.tab === 'receive' ? 'requestingMic' : 'startRecording'));
  $('listenBtn').classList.toggle('recording-button', state.recording === 'listen'); $('microphoneVisual').classList.toggle('recording', state.recording === 'listen'); $('levelMeter').classList.toggle('recording', state.recording === 'listen');
  $('listenHeading').textContent = tr(state.recording === 'listen' ? 'recordingHeading' : 'readyToListen'); $('listenHint').textContent = tr(state.recording === 'listen' ? 'recordingHint' : 'listenHint');
  $('cancelRecording').hidden = state.recording !== 'listen';
  $('decodeFile').disabled = !!busy(); $('decodePassword').disabled = state.analyzing || state.preparing;
  $('resultEmpty').hidden = !!state.result || state.analyzing || state.preparing;
  $('analysisState').hidden = !state.analyzing && !state.preparing; $('resultReady').hidden = !state.result || state.analyzing || state.preparing;
  $('resultBadge').textContent = tr(state.analyzing || state.preparing ? 'decoding' : state.result ? 'found' : 'waiting'); $('resultBadge').classList.toggle('ready', !!state.result);
  if (state.result) { $('resultText').textContent = state.result.text; $('resultProfile').textContent = tr(state.result.profile); }
  for (const area of ['send', 'receive']) { $(area + 'Error').hidden = !state[area + 'Error']; $(area + 'Error').textContent = state[area + 'Error'] ? tr(state[area + 'Error']) : ''; }
  $('retryBtn').hidden = !state.lastAudio && !state.pendingPacket; $('retryBtn').disabled = !!busy();
  $('micSettings').hidden = !['micDenied', 'micError', 'micBusy'].includes(state.receiveError) || platform === 'web';
  document.querySelectorAll('.android-only').forEach(el => { el.hidden = !isAndroid; });
  for (const id of ['saveSignal', 'shareSignal', 'saveMixed', 'shareMixed']) $(id).disabled = !!busy();
}
async function mix() {
  if (!state.signal || !state.cover || state.profile !== 'hidden') return;
  state.mixing = true; state.coverStatus = 'mixing'; render();
  try {
    const result = mixCover(state.signal.samples, state.cover.samples, state.cover.sampleRate);
    state.mixed = waveBlob(result.samples); setAudio('mixedPlayer', state.mixed);
    state.coverStatus = result.looped ? 'coverLooped' : 'mixedReady';
  } catch (e) { state.coverStatus = ''; error('send', errorCode(e)); }
  finally { state.mixing = false; render(); }
}
async function build() {
  if (busy()) return;
  state.building = true; state.sendError = ''; render();
  const revision = state.revision, profile = state.profile;
  try {
    const packet = await makePacket($('message').value, $('password').value, PROFILES[profile].id);
    const samples = modulate(packet, profile, profile === 'hidden' ? Number($('strength').value) : undefined);
    if (revision !== state.revision) return;
    state.signal = { samples, blob: waveBlob(samples), profile, packet, duration: samples.length / SAMPLE_RATE };
    setAudio('signalPlayer', state.signal.blob); state.mixed = null; setAudio('mixedPlayer', null);
    if (profile === 'hidden' && state.cover) await mix();
  } catch (e) { error('send', errorCode(e)); }
  finally { state.building = false; render(); }
}
async function exportFile(mixed, share = false) {
  if (busy()) return;
  const blob = mixed ? state.mixed : state.signal?.blob;
  if (!blob) return;
  state.exporting = true; render();
  try {
    const name = mixed ? 'audio-qr-mixed.wav' : `audio-qr-${state.signal.profile}.wav`;
    const result = await exportAudio(blob, name, share);
    if (result?.saved) toast('saved');
  } catch (e) { if (e.code !== 'cancelled') error('send', e.code ? errorCode(e) : 'exportError'); }
  finally { state.exporting = false; render(); }
}
async function startRecording(kind) {
  if (busy()) return;
  if (kind === 'cover' && !state.signal) return;
  state.starting = true; state[kind === 'cover' ? 'sendError' : 'receiveError'] = ''; render();
  $('signalPlayer').pause(); $('mixedPlayer').pause();
  const duration = kind === 'cover' ? Math.min(MAX_AUDIO_SECONDS, state.signal.duration + 0.75) : MAX_AUDIO_SECONDS;
  try {
    await recorder.start({ duration, onLevel: (level, elapsed) => {
      const time = clock(elapsed);
      if (kind === 'cover') { $('coverTimer').textContent = time; $('coverProgress').value = elapsed / duration; }
      else { $('listenTimer').textContent = time; $('levelMeter').querySelectorAll('span').forEach((bar, i) => { bar.style.height = `${4 + level * 20 * (0.5 + 0.5 * Math.sin(i * 1.8 + elapsed))}px`; }); }
    }, onLimit: () => { if (state.recording) void stopRecording(); }, onError: async e => { await stopRecording(true); error(kind === 'cover' ? 'send' : 'receive', errorCode(e)); } });
    if (recorder.running) { state.recording = kind; $('listenTimer').textContent = '00:00'; $('coverTimer').textContent = '00:00'; $('coverProgress').value = 0; }
  } catch (e) { if (e.code !== 'cancelled') error(kind === 'cover' ? 'send' : 'receive', errorCode(e)); }
  finally { state.starting = false; render(); }
}
let stopping = false;
async function stopRecording(discard = false) {
  if (stopping) return;
  stopping = true;
  const kind = state.recording;
  try {
    const recorded = await recorder.stop(discard);
    state.recording = null; state.starting = false;
    $('levelMeter').querySelectorAll('span').forEach(bar => { bar.style.height = '4px'; }); render();
    if (discard || !recorded) return;
    if (recorded.samples.length / recorded.sampleRate < 0.3) { error(kind === 'cover' ? 'send' : 'receive', 'tooShort'); return; }
    if (kind === 'cover') { state.cover = recorded; state.coverDetail = ''; await mix(); }
    else { state.lastAudio = recorded; state.pendingPacket = null; await analyze(recorded); }
  } finally { stopping = false; }
}
function terminateWorker() { worker?.terminate(); worker = null; clearTimeout(workerTimeout); }
function cancelAnalysis() { analysisId++; terminateWorker(); state.analyzing = false; state.preparing = false; render(); }
async function analyze(audio = state.lastAudio) {
  if (state.analyzing || !audio && !state.pendingPacket) return;
  terminateWorker(); state.result = null; state.receiveError = ''; state.analyzing = true; $('decodeProgress').value = 0.03; render();
  const id = ++analysisId;
  try {
    worker = new Worker('./decoder.worker.js');
    worker.onmessage = ({ data }) => {
      if (data.id !== analysisId) return;
      if (data.progress != null) { $('decodeProgress').value = Math.max($('decodeProgress').value, data.progress); return; }
      terminateWorker(); state.analyzing = false;
      if (data.error) { state.receiveError = data.error; if (data.packet) state.pendingPacket = data.packet; }
      else { state.result = data.result; state.pendingPacket = null; }
      render();
    };
    worker.onerror = () => { if (id !== analysisId) return; terminateWorker(); state.analyzing = false; error('receive', 'unexpected'); };
    worker.postMessage(state.pendingPacket ? { id, packet: state.pendingPacket, password: $('decodePassword').value } : { id, samples: audio.samples, sampleRate: audio.sampleRate, password: $('decodePassword').value });
    workerTimeout = setTimeout(() => { if (id !== analysisId) return; cancelAnalysis(); error('receive', 'decodeTimeout'); }, 45000);
  } catch (e) { terminateWorker(); state.analyzing = false; error('receive', errorCode(e)); }
}
async function decodeFile(file) {
  if (!file || busy()) return;
  state.preparing = true; state.result = null; state.receiveError = ''; state.lastAudio = null; state.pendingPacket = null; $('decodeFilename').textContent = file.name; render();
  const id = ++analysisId;
  try { const audio = await readAudio(file); if (id !== analysisId) return; state.preparing = false; state.lastAudio = audio; await analyze(audio); }
  catch (e) { if (id === analysisId) { state.preparing = false; error('receive', errorCode(e)); } }
  finally { render(); }
}
function switchTab(tab) { if (state.recording || state.starting || state.building || state.mixing) return; state.tab = tab; render(); }
renderIcons();
for (let i = 0; i < 48; i++) { const bar = document.createElement('span'); bar.style.height = `${8 + Math.abs(Math.sin(i * 1.6)) * (13 + 53 * Math.sin(Math.PI * i / 47) ** 2)}px`; $('waveArt').append(bar); }
for (let i = 0; i < 28; i++) $('levelMeter').append(document.createElement('span'));
$('buildBtn').onclick = build;
for (const id of ['message', 'password']) $(id).addEventListener('input', invalidate);
$('clearMessage').onclick = () => { $('message').value = ''; invalidate(); $('message').focus(); };
document.querySelectorAll('[data-profile]').forEach(el => { el.onclick = () => { if (busy()) return; state.profile = el.dataset.profile; invalidate(); }; });
$('strength').onchange = async () => {
  if (!state.signal || state.profile !== 'hidden' || busy()) return;
  const samples = modulate(state.signal.packet, 'hidden', Number($('strength').value));
  state.signal = { ...state.signal, samples, blob: waveBlob(samples) }; setAudio('signalPlayer', state.signal.blob);
  state.mixed = null; setAudio('mixedPlayer', null); await mix(); render();
};
$('coverFile').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || busy()) return;
  state.mixing = true; state.sendError = ''; state.coverStatus = 'mixing'; render();
  try { state.cover = await readAudio(file); state.coverDetail = file.name; state.coverStatus = 'coverSelected'; }
  catch (e) { error('send', errorCode(e)); state.coverStatus = ''; }
  finally { state.mixing = false; render(); }
  if (state.cover && !state.sendError) await mix();
};
$('coverRecord').onclick = () => state.recording === 'cover' ? stopRecording() : startRecording('cover');
$('coverCancel').onclick = async () => { await stopRecording(true); toast('recordingCancelled'); };
$('listenBtn').onclick = () => state.recording === 'listen' ? stopRecording() : startRecording('listen');
$('cancelRecording').onclick = async () => { await stopRecording(true); toast('recordingCancelled'); };
$('sendTab').onclick = () => switchTab('send'); $('receiveTab').onclick = () => switchTab('receive');
document.querySelectorAll('[data-source]').forEach(el => { el.onclick = () => { if (busy()) return; state.source = el.dataset.source; render(); }; });
$('decodeFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; void decodeFile(file); };
$('dropZone').ondragover = event => { event.preventDefault(); if (!busy()) $('dropZone').classList.add('dragging'); };
$('dropZone').ondragleave = () => $('dropZone').classList.remove('dragging');
$('dropZone').ondrop = event => { event.preventDefault(); $('dropZone').classList.remove('dragging'); void decodeFile(event.dataTransfer.files[0]); };
$('retryBtn').onclick = () => { if (!busy()) void analyze(); };
$('decodePassword').onkeydown = event => { if (event.key === 'Enter' && !busy()) void analyze(); };
$('cancelDecode').onclick = cancelAnalysis;
$('micSettings').onclick = async () => { try { await openMicrophoneSettings(); } catch { error('receive', 'micError'); } };
$('saveSignal').onclick = () => exportFile(false); $('saveMixed').onclick = () => exportFile(true);
$('shareSignal').onclick = () => exportFile(false, true); $('shareMixed').onclick = () => exportFile(true, true);
$('copyBtn').onclick = async () => { if (!state.result) return; try { await copyText(state.result.text); toast('copied'); } catch (e) { error('receive', errorCode(e)); } };
$('languageBtn').onclick = () => { state.lang = state.lang === 'en' ? 'fa' : 'en'; try { localStorage.setItem('audioQrLang', state.lang); } catch {} render(); };
document.querySelectorAll('.reveal').forEach(el => { el.onclick = () => { const input = $(el.dataset.target); input.type = input.type === 'password' ? 'text' : 'password'; el.setAttribute('aria-pressed', String(input.type === 'text')); }; });
$('helpBtn').onclick = () => $('helpDialog').showModal();
for (const id of ['closeHelp', 'helpDone']) $(id).onclick = () => $('helpDialog').close();
$('helpDialog').onclick = event => { if (event.target === $('helpDialog')) { const rect = $('helpDialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('helpDialog').close(); } };
void setupLifecycle(() => {
  if (state.recording || state.starting) { void stopRecording(true); toast('stoppedInBackground'); }
  $('signalPlayer').pause(); $('mixedPlayer').pause();
}, () => {
  if ($('helpDialog').open) { $('helpDialog').close(); return true; }
  if (state.recording || state.starting) { void stopRecording(true); return true; }
  if (state.analyzing || state.preparing) { cancelAnalysis(); return true; }
  if (state.tab === 'receive') { switchTab('send'); return true; }
  return false;
}).catch(() => {});
window.addEventListener('pagehide', () => { terminateWorker(); void recorder.stop(true); for (const url of urls.values()) URL.revokeObjectURL(url); });
render();
