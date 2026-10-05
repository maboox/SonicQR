const paths = {
  wave: '<path d="M3 10v4m4-7v10m5-13v16m5-13v10m4-7v4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.7-2.5 1.8-2.5 3.5m0 3h.01"/>',
  send: '<path d="m21 3-6 18-4-8-8-4 18-6Z M11 13 21 3"/>',
  receive: '<path d="M12 3v12m-4-4 4 4 4-4M4 14v6h16v-6"/>',
  message: '<path d="M21 11a9 9 0 0 1-9 9H3l2.1-4.2A9 9 0 1 1 21 11Z"/><path d="M8 9h8m-8 4h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  folder: '<path d="M3 7V5h6l2 2h10v13H3V7Z"/>',
  bulb: '<path d="M9 18h6m-6 3h6M8.2 13.7a6 6 0 1 1 7.6 0L15 16H9l-.8-2.3Z"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
  refresh: '<path d="M20 7V3m0 4h-4M4 17v4m0-4h4M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z M8 12l3 3 5-6"/>',
};
export function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => {
    const name = element.dataset.icon;
    element.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.wave}</svg>`;
  });
}
