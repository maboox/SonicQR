const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('audioQR', Object.freeze({
  saveWave: payload => ipcRenderer.invoke('audioqr:save-wave', payload),
  openMicrophoneSettings: () => ipcRenderer.invoke('audioqr:microphone-settings')
}));
