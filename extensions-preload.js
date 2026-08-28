'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribePayload(channel, callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const listener = (_event, payload) => {
    callback(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld(
  'electronAPI',
  Object.freeze({
    getSettings: () => ipcRenderer.invoke('agent:settings-get'),
    toggleExtension: (id, state) => {
      if (typeof id !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:toggle-extension', { id, state: Boolean(state) });
    },
    onSettings: (callback) => subscribePayload('agent:settings', callback),
    getLocalIntel: () => ipcRenderer.invoke('agent:local-intel-get'),
    onLocalIntel: (callback) => subscribePayload('agent:local-intel', callback),
    toolsAction: (action) => {
      if (typeof action !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:tools-action', action);
    },
    openUsefulLinks: () => {
      ipcRenderer.send('open-useful-links');
    },
  }),
);
