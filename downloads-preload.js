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
    getDownloads: () => ipcRenderer.invoke('agent:downloads-get'),
    cancelDownload: (downloadId) => {
      if (typeof downloadId !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:download-cancel', downloadId);
    },
    openDownload: (downloadId) => {
      if (typeof downloadId !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:download-open', downloadId);
    },
    onDownloads: (callback) => subscribePayload('agent:downloads', callback),
    onDiskWarning: (callback) => subscribePayload('agent:disk-warning', callback),
    onToast: (callback) => subscribePayload('agent:toast', callback),
  }),
);
