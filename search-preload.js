'use strict';

const { contextBridge, ipcRenderer, webFrame } = require('electron');
const chromeIdentity = require('./chrome-identity');
const micAccess = require('./mic-access');

function isInternalSearchSurface() {
  try {
    const href = String(location.href || '');
    if (!href.startsWith('file:')) {
      return false;
    }
    return /(?:^|\/)(newtab|search)\.html(?:\?|#|$)/i.test(href);
  } catch {
    return false;
  }
}

try {
  webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: chromeIdentity.pageSource() }]);
  webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: micAccess.pageHookSource() }]);
} catch {
  // Document may not be ready in this frame.
}

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'agent-mic') {
    return;
  }
  ipcRenderer.send('agent:mic-capture', { active: Boolean(event.data.active) });
});

if (isInternalSearchSurface()) {
  contextBridge.exposeInMainWorld(
    'electronAPI',
    Object.freeze({
      runLocalSearch: (query) => {
        if (typeof query !== 'string') {
          return Promise.resolve({ ok: false, error: 'invalid-query', results: [] });
        }
        return ipcRenderer.invoke('agent:local-search', query);
      },
      getFavicon: (url) => {
        if (typeof url !== 'string') {
          return Promise.resolve({ ok: false, dataUrl: '' });
        }
        return ipcRenderer.invoke('agent:favicon', url);
      },
      openUsefulLinks: () => {
        ipcRenderer.send('open-useful-links');
      },
    }),
  );
}
