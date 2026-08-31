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
    getUsefulLinks: () => ipcRenderer.invoke('agent:useful-links-get'),
    refreshUsefulLinks: () => ipcRenderer.invoke('agent:useful-links-refresh'),
    addUsefulSection: (title) => {
      if (typeof title !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:useful-links-add-section', { title });
    },
    addUsefulLink: (sectionId, name, url, note) => {
      if (typeof sectionId !== 'string' || typeof name !== 'string' || typeof url !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:useful-links-add-link', { sectionId, name, url, note });
    },
    openUsefulLink: (url) => {
      if (typeof url !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:useful-links-open', { url });
    },
    getLocalIntel: () => ipcRenderer.invoke('agent:local-intel-get'),
    onLocalIntel: (callback) => subscribePayload('agent:local-intel', callback),
    onUsefulLinks: (callback) => subscribePayload('agent:useful-links', callback),
  }),
);
