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
    navigate: (url) => {
      if (typeof url !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:navigate', url);
    },
    goBack: () => ipcRenderer.invoke('agent:go-back'),
    goForward: () => ipcRenderer.invoke('agent:go-forward'),
    reload: () => ipcRenderer.invoke('agent:reload'),
    setSidebarOpen: (open) => ipcRenderer.invoke('agent:sidebar', Boolean(open)),
    setSettingsOpen: (open) => ipcRenderer.invoke('agent:settings-panel', Boolean(open)),
    getSettings: () => ipcRenderer.invoke('agent:settings-get'),
    setSetting: (key, value) => {
      if (typeof key !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:settings-set', { key, value });
    },
    createTab: () => ipcRenderer.invoke('agent:create-tab'),
    switchTab: (tabId) => {
      if (typeof tabId !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:switch-tab', tabId);
    },
    closeTab: (tabId) => {
      if (typeof tabId !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:close-tab', tabId);
    },
    sendAiMessage: (message, apiKey) => {
      if (typeof message !== 'string' || typeof apiKey !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:ai-message', { message, apiKey });
    },
    summarizeCurrentPage: (apiKey) => {
      if (typeof apiKey !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:ai-summarize', { apiKey });
    },
    onUrlChanged: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      const listener = (_event, payload) => {
        if (typeof payload === 'string') {
          callback({ url: payload, canGoBack: false, canGoForward: false });
          return;
        }
        if (payload && typeof payload === 'object') {
          callback({
            url: typeof payload.url === 'string' ? payload.url : '',
            canGoBack: Boolean(payload.canGoBack),
            canGoForward: Boolean(payload.canGoForward),
          });
        }
      };

      ipcRenderer.on('agent:url-changed', listener);
      return () => ipcRenderer.removeListener('agent:url-changed', listener);
    },
    onAiResponse: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      const listener = (_event, payload) => {
        callback(payload);
      };

      ipcRenderer.on('agent:ai-response', listener);
      return () => ipcRenderer.removeListener('agent:ai-response', listener);
    },
    onTabCreated: (callback) => subscribePayload('agent:tab-created', callback),
    onTabTitleUpdated: (callback) => subscribePayload('agent:tab-title-updated', callback),
    onTabClosed: (callback) => subscribePayload('agent:tab-closed', callback),
    triggerPanic: () => {
      ipcRenderer.send('trigger-panic');
    },
    onPanicBurn: (callback) => subscribePayload('panic:burn', callback),
  }),
);
