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

function invokeTab(channel, tabId) {
  if (typeof tabId !== 'string') {
    return Promise.resolve({ ok: false });
  }
  return ipcRenderer.invoke(channel, tabId);
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
    runLocalSearch: (query) => {
      if (typeof query !== 'string') {
        return Promise.resolve({ ok: false, error: 'invalid-query', results: [] });
      }
      return ipcRenderer.invoke('agent:local-search', query);
    },
    goBack: () => ipcRenderer.invoke('agent:go-back'),
    goForward: () => ipcRenderer.invoke('agent:go-forward'),
    reload: () => ipcRenderer.invoke('agent:reload'),
    stop: () => ipcRenderer.invoke('agent:stop'),
    setSidebarOpen: (open) => ipcRenderer.invoke('agent:sidebar', Boolean(open)),
    watchLocalIntel: (open) => ipcRenderer.invoke('agent:local-intel-watch', Boolean(open)),
    selectLocalModel: (id) => {
      if (id !== null && typeof id !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:local-intel-select', id);
    },
    pickLocalModel: (kind) => ipcRenderer.invoke('agent:local-intel-pick', kind === 'dir' ? 'dir' : 'file'),
    setSettingsOpen: (open) => ipcRenderer.invoke('agent:settings-panel', Boolean(open)),
    getSettings: () => ipcRenderer.invoke('agent:settings-get'),
    setSetting: (key, value) => {
      if (typeof key !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:settings-set', { key, value });
    },
    createTab: () => ipcRenderer.invoke('agent:create-tab'),
    switchTab: (tabId) => invokeTab('agent:switch-tab', tabId),
    closeTab: (tabId) => invokeTab('agent:close-tab', tabId),
    closeOtherTabs: (tabId) => invokeTab('agent:close-other-tabs', tabId),
    toggleMute: (tabId) => invokeTab('agent:toggle-mute', tabId),
    togglePin: (tabId) => invokeTab('agent:toggle-pin', tabId),
    toggleBookmark: () => ipcRenderer.invoke('agent:bookmark-toggle'),
    removeBookmark: (bookmarkId) => {
      if (typeof bookmarkId !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:bookmark-remove', bookmarkId);
    },
    createBookmarkFolder: (title) => ipcRenderer.invoke('agent:bookmark-folder-create', title),
    renameBookmark: (id, title) => {
      if (typeof id !== 'string' || typeof title !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:bookmark-rename', { id, title });
    },
    setBookmarksPanelOpen: (open) => ipcRenderer.invoke('agent:bookmarks-panel', Boolean(open)),
    cancelDownload: (downloadId) => {
      if (typeof downloadId !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:download-cancel', downloadId);
    },
    setDownloadsOpen: (open) => ipcRenderer.invoke('agent:downloads-panel', Boolean(open)),
    setMenuOpen: (open, anchor) =>
      ipcRenderer.invoke('agent:menu-panel', {
        open: Boolean(open),
        anchor: anchor && typeof anchor === 'object' ? {
          left: Number(anchor.left),
          top: Number(anchor.top),
          right: Number(anchor.right),
          bottom: Number(anchor.bottom),
          width: Number(anchor.width),
          height: Number(anchor.height),
        } : null,
      }),
    onMenuClosed: (callback) => subscribePayload('agent:menu-closed', callback),
    setFindOpen: (open) => ipcRenderer.invoke('agent:find-panel', Boolean(open)),
    setRamSheetOpen: (open) => ipcRenderer.invoke('agent:ram-sheet', Boolean(open)),
    setShieldOpen: (open) => ipcRenderer.invoke('agent:shield-panel', Boolean(open)),
    getSecurityStats: () => ipcRenderer.invoke('agent:security-stats'),
    onSecurityStats: (callback) => subscribePayload('agent:security-stats', callback),
    setUtilityOpen: (open) => ipcRenderer.invoke('agent:utility-panel', Boolean(open)),
    setZoom: (action) => ipcRenderer.invoke('agent:zoom', action),
    toggleFullscreen: () => ipcRenderer.invoke('agent:fullscreen'),
    menuAction: (action) => {
      if (typeof action !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:menu-action', action);
    },
    findInPage: (query, options) => {
      if (typeof query !== 'string') {
        return Promise.resolve({ ok: false });
      }
      return ipcRenderer.invoke('agent:find-in-page', {
        query,
        forward: options?.forward !== false,
        findNext: Boolean(options?.findNext),
      });
    },
    stopFindInPage: () => ipcRenderer.invoke('agent:find-stop'),
    onFindResult: (callback) => subscribePayload('agent:find-result', callback),
    onMenuCommand: (callback) => subscribePayload('agent:menu-command', callback),
    showTabMenu: (tabId, position) => {
      if (typeof tabId !== 'string') {
        return;
      }
      ipcRenderer.send('agent:tab-context', {
        tabId,
        x: Number(position?.x),
        y: Number(position?.y),
      });
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
          callback({ url: payload, canGoBack: false, canGoForward: false, isLoading: false, bookmarked: false, bookmarksBar: true });
          return;
        }
        if (payload && typeof payload === 'object') {
          callback({
            url: typeof payload.url === 'string' ? payload.url : '',
            canGoBack: Boolean(payload.canGoBack),
            canGoForward: Boolean(payload.canGoForward),
            isLoading: Boolean(payload.isLoading),
            bookmarked: Boolean(payload.bookmarked),
            bookmarksBar: payload.bookmarksBar !== false,
          });
        }
      };

      ipcRenderer.on('agent:url-changed', listener);
      return () => ipcRenderer.removeListener('agent:url-changed', listener);
    },
    onAiResponse: (callback) => subscribePayload('agent:ai-response', callback),
    onLocalIntel: (callback) => subscribePayload('agent:local-intel', callback),
    onTabCreated: (callback) => subscribePayload('agent:tab-created', callback),
    onTabTitleUpdated: (callback) => subscribePayload('agent:tab-title-updated', callback),
    onTabUpdated: (callback) => subscribePayload('agent:tab-updated', callback),
    onTabClosed: (callback) => subscribePayload('agent:tab-closed', callback),
    onBookmarks: (callback) => subscribePayload('agent:bookmarks', callback),
    onDownloads: (callback) => subscribePayload('agent:downloads', callback),
    triggerPanic: () => {
      ipcRenderer.send('trigger-panic');
    },
    onPanicBurn: (callback) => subscribePayload('panic:burn', callback),
  }),
);
