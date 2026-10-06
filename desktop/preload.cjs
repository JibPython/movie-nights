const { contextBridge, ipcRenderer } = require('electron');
const invoke = (method, ...args) => ipcRenderer.invoke('matinee', method, ...args);
contextBridge.exposeInMainWorld('matinee', {
  snapshot: () => invoke('snapshot'), chooseRoot: () => invoke('chooseRoot'), scan: () => invoke('scan'),
  pick: kind => invoke('pick', kind), importMovie: data => invoke('importMovie', data), cancelImport: () => invoke('cancelImport'),
  edit: (id, data) => invoke('edit', id, data), markWatched: (id, value) => invoke('markWatched', id, value),
  settings: data => invoke('settings', data), queue: ids => invoke('queue', ids),
  play: id => invoke('play', id), stop: () => invoke('stop'), control: (action, value) => invoke('control', action, value),
  viewport: rect => invoke('viewport', rect), obscure: value => invoke('obscure', value), fullscreen: value => invoke('fullscreen', value),
  window: action => invoke('window', action),
  on: (event, handler) => { if (!['player', 'ended', 'failure', 'progress', 'fullscreen', 'library'].includes(event)) return () => {}; const listener = (_, data) => handler(data); ipcRenderer.on(event, listener); return () => ipcRenderer.removeListener(event, listener); }
});
