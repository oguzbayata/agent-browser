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
    getMemoryBridge: () => ipcRenderer.invoke('agent:memory-bridge-get'),
    setMemoryBridge: (payload) => {
      if (!payload || typeof payload !== 'object') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:memory-bridge-set', payload);
    },
    pickMemoryVault: () => ipcRenderer.invoke('agent:memory-bridge-pick-vault'),
    onMemoryBridge: (callback) => subscribePayload('agent:memory-bridge', callback),
  }),
);
