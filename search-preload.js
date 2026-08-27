'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI',
  Object.freeze({
    runLocalSearch: (query) => {
      if (typeof query !== 'string') {
        return Promise.resolve({ ok: false, error: 'invalid-query', results: [] });
      }
      return ipcRenderer.invoke('agent:local-search', query);
    },
    openUsefulLinks: () => {
      ipcRenderer.send('open-useful-links');
    },
  }),
);
