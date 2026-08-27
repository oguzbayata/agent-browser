'use strict';

const { app, BrowserWindow, WebContentsView, session, ipcMain, globalShortcut, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { startAgentBridgeServer, stopAgentBridgeServer, getListenInfo } = require('./agent-bridge');
const { collectIntel, knownModelRoots, isLoopbackHttpUrl } = require('./local-intel');

/**
 * In-memory partition only. A `persist:` prefix would write the session to disk.
 * An empty string would fall back to Electron's default (persistent) session.
 */
const PARTITION = 'in-memory-session';
const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 720;
const TAB_STRIP_HEIGHT = 36;
const TOOLBAR_HEIGHT = 48;
const BOOKMARKS_BAR_HEIGHT = 32;
const DOWNLOADS_PANEL_HEIGHT = 168;
const FIND_BAR_HEIGHT = 36;
const MENU_DROPDOWN_WIDTH = 344;
const SHIELD_POPUP_HEIGHT = 328;
const SOCKS5_PROXY = 'socks5://127.0.0.1:1080';
const SIDEBAR_WIDTH = 360;
const SETTINGS_WIDTH = 300;
const BOOKMARKS_PANEL_WIDTH = 328;
const DEFAULT_BOOKMARK_FOLDER_ID = 'bar';
const DEFAULT_TAB_URL = 'https://duckduckgo.com';
const NEWTAB_PATH = path.join(__dirname, 'newtab.html');
const NEWTAB_FILE_URL = pathToFileURL(NEWTAB_PATH).href;
const PANIC_QUIT_MS = 1500;
const PANIC_SHORTCUT = 'CommandOrControl+Shift+E';
const PAGE_TEXT_LIMIT = 80000;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const SUMMARIZE_SYSTEM_PROMPT =
  'Sen bir siber istihbarat özetleyicisisin. Aşağıdaki metni analiz et ve en önemli noktaları çıkar:';
const SEARCH_ENGINES = Object.freeze({
  duckduckgo: 'https://duckduckgo.com/?q=',
  startpage: 'https://www.startpage.com/sp/search?query=',
});
const BOOLEAN_SETTINGS = new Set([
  'blockTrackers',
  'stripThirdPartyCookies',
  'sendDnt',
  'spoofUserAgent',
  'agentBridge',
  'ghostNetwork',
]);
const AGENT_BRIDGE_HOST = '127.0.0.1';
const AGENT_BRIDGE_PORT = 17331;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const NETWORK_FILTER = Object.freeze({ urls: ['http://*/*', 'https://*/*'] });
const GHOST_DENIED_PERMISSIONS = new Set(['media', 'geolocation', 'display-capture']);
const COMMON_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TRACKER_HOST_SUFFIXES = Object.freeze([
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'googleadservices.com',
  'doubleclick.net',
  '2mdn.net',
  'connect.facebook.net',
  'facebook.net',
  'pixel.facebook.com',
  'ads-twitter.com',
  'analytics.twitter.com',
  'static.ads-twitter.com',
  'hotjar.com',
  'hotjar.io',
  'scorecardresearch.com',
  'quantserve.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'casalemedia.com',
  'moatads.com',
  'adsrvr.org',
  'advertising.com',
  'clarity.ms',
  'bat.bing.com',
  'ads.linkedin.com',
  'snap.licdn.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'ads.twitter.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'adservice.google.com.tr',
  'partner.googleadservices.com',
  'adtrafficquality.google',
  'fundingchoicesmessages.google.com',
  'analytics.google.com',
  'securepubads.g.doubleclick.net',
  'tpc.googlesyndication.com',
  'ad.doubleclick.net',
  'cm.g.doubleclick.net',
  'pagead.l.doubleclick.net',
  'stats.g.doubleclick.net',
  's0.2mdn.net',
  'sc-static.net',
  'tr.snapchat.com',
  'ads.yahoo.com',
  'advertising.yahoo.com',
  'ads.pinterest.com',
  'log.pinterest.com',
  'ads.reddit.com',
  'alb.reddit.com',
  'adform.net',
  'adsafeprotected.com',
  'openx.net',
  'openx.com',
  'smartadserver.com',
  'indexww.com',
  'contextweb.com',
  'bidswitch.net',
  'rlcdn.com',
  'bluekai.com',
  'krxd.net',
  'exelator.com',
  'mathtag.com',
  'media.net',
  'yieldmo.com',
  'sharethrough.com',
  '3lift.com',
  'googletagservices.com',
  'ads.youtube.com',
  'ad.youtube.com',
  'serving-sys.com',
  'creativecdn.com',
  'liadm.com',
  'adsymptotic.com',
  'branch.io',
  'app-measurement.com',
]);

const TRACKER_PATH_RULES = Object.freeze([
  { hostSuffix: 'facebook.com', pathTest: (pathname) => pathname === '/tr' || pathname.startsWith('/tr/') },
]);

if (PARTITION.startsWith('persist:') || PARTITION.length === 0) {
  throw new Error('Agent Browser must use a non-persistent in-memory partition.');
}

app.commandLine.appendSwitch('test-third-party-cookie-phaseout');

const sharedSessionPrefs = Object.freeze({
  partition: PARTITION,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false,
  spellcheck: false,
  enableWebSQL: false,
  navigateOnDragDrop: false,
});

const chromeWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
  preload: path.join(__dirname, 'preload.js'),
});

const guestWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
});

let mainWindow = null;
const views = new Map();
let activeTabId = null;
let nextTabId = 1;
let isWipingSession = false;
let privacyGuardsAttached = false;
let sidebarOpen = false;
let settingsOpen = false;
let bookmarksPanelOpen = false;
let downloadsOpen = false;
let menuOpen = false;
let shieldOpen = false;
let utilityOpen = false;
let findOpen = false;
let ramSheetOpen = false;
let panicInProgress = false;
const chromeWindows = new Set();
let overflowMenuView = null;
let overflowMenuReady = Promise.resolve();
let overflowHostWindow = null;
let overflowHostDismiss = null;
const sessionLocalFiles = [];
const sessionLocalDirs = [];
let selectedLocalModel = null;
let localIntelWatchers = [];
let localIntelTimer = null;
let localIntelBusy = false;
let localIntelPending = false;
const privacySettings = {
  blockTrackers: true,
  stripThirdPartyCookies: true,
  sendDnt: true,
  spoofUserAgent: true,
  searchEngine: 'duckduckgo',
  agentBridge: false,
  ghostNetwork: false,
};
let blockedRequestCount = 0;
const tabSecurityStats = new Map();
let securityStatsFlush = null;
let agentBridgeToken = '';
let nextDownloadId = 1;
let nextBookmarkId = 1;
let nextFolderId = 1;
let downloadsAttached = false;
const sessionFolders = [
  { id: DEFAULT_BOOKMARK_FOLDER_ID, title: 'Bookmarks bar', createdAt: 0 },
];
const sessionBookmarks = [];
const sessionDownloads = new Map();
const activeDownloadItems = new Map();

function emptySecurityStats() {
  return { trackers: 0, cookies: 0, upgrades: 0 };
}

function snapshotSecurityStats(tabId = activeTabId) {
  const stats = (tabId && tabSecurityStats.get(tabId)) || emptySecurityStats();
  return {
    tabId: tabId || null,
    trackers: stats.trackers,
    cookies: stats.cookies,
    upgrades: stats.upgrades,
  };
}

function sendSecurityStats(tabId = activeTabId) {
  sendToChrome('agent:security-stats', snapshotSecurityStats(tabId));
}

function scheduleSecurityStats(tabId = activeTabId) {
  if (securityStatsFlush) {
    return;
  }
  securityStatsFlush = setTimeout(() => {
    securityStatsFlush = null;
    sendSecurityStats(tabId);
  }, 80);
}

function bumpSecurityStat(tabId, key) {
  const id = tabId || activeTabId;
  if (!id) {
    return;
  }
  const stats = tabSecurityStats.get(id) || emptySecurityStats();
  stats[key] = (stats[key] || 0) + 1;
  tabSecurityStats.set(id, stats);
  if (key === 'trackers') {
    blockedRequestCount += 1;
  }
  if (id === activeTabId) {
    scheduleSecurityStats(id);
  }
}

function resetTabSecurityStats(tabId) {
  if (!tabId) {
    return;
  }
  tabSecurityStats.set(tabId, emptySecurityStats());
  if (tabId === activeTabId) {
    sendSecurityStats(tabId);
  }
}

function tabIdFromDetails(details) {
  const contents = details?.webContents;
  if (contents && !contents.isDestroyed()) {
    for (const [tabId, entry] of views) {
      if (entry.view.webContents === contents) {
        return tabId;
      }
    }
  }
  if (typeof details?.webContentsId === 'number') {
    for (const [tabId, entry] of views) {
      if (entry.view.webContents.id === details.webContentsId) {
        return tabId;
      }
    }
  }
  return activeTabId;
}

function isLoopbackHostname(hostname) {
  const host = String(hostname || '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function httpsUpgradeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:') {
    return null;
  }
  if (isLoopbackHostname(parsed.hostname)) {
    return null;
  }
  parsed.protocol = 'https:';
  return parsed.href;
}

function hostnameMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function shouldBlockUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (TRACKER_HOST_SUFFIXES.some((suffix) => hostnameMatchesSuffix(hostname, suffix))) {
    return true;
  }

  return TRACKER_PATH_RULES.some(
    (rule) => hostnameMatchesSuffix(hostname, rule.hostSuffix) && rule.pathTest(parsed.pathname),
  );
}

function tryOrigin(rawUrl) {
  try {
    const origin = new URL(rawUrl).origin;
    return origin && origin !== 'null' ? origin : '';
  } catch {
    return '';
  }
}

function getFirstPartyOrigin(details) {
  const contents = details.webContents;
  if (contents && !contents.isDestroyed()) {
    const pageOrigin = tryOrigin(contents.getURL());
    if (pageOrigin) {
      return pageOrigin;
    }
  }

  return tryOrigin(details.referrer);
}

function isThirdPartyRequest(details) {
  if (details.resourceType === 'mainFrame') {
    return false;
  }

  const requestOrigin = tryOrigin(details.url);
  const firstPartyOrigin = getFirstPartyOrigin(details);
  if (!requestOrigin || !firstPartyOrigin) {
    return false;
  }

  return requestOrigin !== firstPartyOrigin;
}

function setHeader(headers, name, value) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      delete headers[key];
    }
  }
  headers[name] = value;
}

function deleteHeader(headers, name) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      delete headers[key];
    }
  }
}

function headerPresent(headers, name) {
  if (!headers) {
    return false;
  }
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function stripSetCookieHeaders(responseHeaders) {
  if (!responseHeaders) {
    return responseHeaders;
  }

  const next = {};
  for (const [key, value] of Object.entries(responseHeaders)) {
    if (key.toLowerCase() === 'set-cookie') {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function applyWebRtcPolicyToContents(contents) {
  if (!contents || contents.isDestroyed() || typeof contents.setWebRTCIPHandlingPolicy !== 'function') {
    return;
  }
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
}

function applyIsolatedSessionWebRtc(isolatedSession) {
  if (!isolatedSession || typeof isolatedSession.setWebRTCIPHandlingPolicy !== 'function') {
    return;
  }
  isolatedSession.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
}

function applyWebRtcPolicyToAll() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyWebRtcPolicyToContents(mainWindow.webContents);
  }
  for (const { view } of views.values()) {
    applyWebRtcPolicyToContents(view.webContents);
  }
}

function applySessionPermissions(isolatedSession) {
  isolatedSession.setPermissionRequestHandler((_contents, permission, callback) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      callback(false);
      return;
    }
    if (privacySettings.ghostNetwork && GHOST_DENIED_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }
    callback(true);
  });

  isolatedSession.setPermissionCheckHandler((_contents, permission) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      return false;
    }
    if (privacySettings.ghostNetwork && GHOST_DENIED_PERMISSIONS.has(permission)) {
      return false;
    }
    return true;
  });
}

async function applyGhostNetwork() {
  const isolatedSession = getIsolatedSession();
  applySessionPermissions(isolatedSession);
  applyIsolatedSessionWebRtc(isolatedSession);
  applyWebRtcPolicyToAll();

  if (privacySettings.ghostNetwork) {
    await isolatedSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: SOCKS5_PROXY,
      proxyBypassRules: '<local>;<-loopback>',
    });
  } else {
    await isolatedSession.setProxy({
      mode: 'direct',
    });
  }

  if (typeof isolatedSession.closeAllConnections === 'function') {
    await isolatedSession.closeAllConnections();
  }
}

function attachPrivacyNetworkGuards(isolatedSession) {
  if (privacyGuardsAttached) {
    return;
  }
  privacyGuardsAttached = true;

  isolatedSession.setUserAgent(COMMON_USER_AGENT);
  applySessionPermissions(isolatedSession);
  applyIsolatedSessionWebRtc(isolatedSession);

  isolatedSession.webRequest.onBeforeRequest(NETWORK_FILTER, (details, callback) => {
    const tabId = tabIdFromDetails(details);
    if (privacySettings.blockTrackers && shouldBlockUrl(details.url)) {
      bumpSecurityStat(tabId, 'trackers');
      callback({ cancel: true });
      return;
    }

    const upgraded = httpsUpgradeUrl(details.url);
    if (upgraded) {
      bumpSecurityStat(tabId, 'upgrades');
      callback({ redirectURL: upgraded });
      return;
    }

    callback({});
  });

  isolatedSession.webRequest.onBeforeSendHeaders(NETWORK_FILTER, (details, callback) => {
    const requestHeaders = { ...(details.requestHeaders || {}) };
    if (privacySettings.spoofUserAgent) {
      setHeader(requestHeaders, 'User-Agent', COMMON_USER_AGENT);
    }
    if (privacySettings.sendDnt) {
      setHeader(requestHeaders, 'DNT', '1');
    }

    if (privacySettings.stripThirdPartyCookies && isThirdPartyRequest(details)) {
      if (headerPresent(requestHeaders, 'Cookie')) {
        bumpSecurityStat(tabIdFromDetails(details), 'cookies');
      }
      deleteHeader(requestHeaders, 'Cookie');
    }

    callback({ requestHeaders });
  });

  isolatedSession.webRequest.onHeadersReceived(NETWORK_FILTER, (details, callback) => {
    if (
      !privacySettings.stripThirdPartyCookies ||
      !isThirdPartyRequest(details) ||
      !details.responseHeaders
    ) {
      callback({});
      return;
    }

    if (headerPresent(details.responseHeaders, 'Set-Cookie')) {
      bumpSecurityStat(tabIdFromDetails(details), 'cookies');
    }

    callback({
      responseHeaders: stripSetCookieHeaders(details.responseHeaders),
    });
  });
}

function getIsolatedSession() {
  return session.fromPartition(PARTITION);
}

function getGuestWebContents() {
  const entry = activeTabId ? views.get(activeTabId) : null;
  return entry?.view.webContents ?? null;
}

function getTabWebContents(tabId) {
  const entry = views.get(tabId);
  const webContents = entry?.view.webContents;
  if (!webContents || webContents.isDestroyed()) {
    return null;
  }
  return webContents;
}

function serializeTab(tabId) {
  const entry = views.get(tabId);
  const webContents = getTabWebContents(tabId);
  if (!entry || !webContents) {
    return null;
  }

  const url = webContents.getURL();
  return {
    tabId,
    title: tabTitleOf(webContents),
    url: isStartPage(url) ? '' : url,
    active: tabId === activeTabId,
    owner: entry.owner || null,
    loading: webContents.isLoading(),
    pinned: Boolean(entry.pinned),
    muted: Boolean(webContents.isAudioMuted()),
    audible: Boolean(webContents.isCurrentlyAudible()),
  };
}

function failTab(error) {
  return { ok: false, error };
}

function sendToChrome(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function emitTabUpdated(tabId) {
  const tab = serializeTab(tabId);
  if (tab) {
    sendToChrome('agent:tab-updated', tab);
  }
}

function currentGuestUrl() {
  const guest = getGuestWebContents();
  if (!guest) {
    return '';
  }
  const url = guest.getURL();
  return isStartPage(url) ? '' : url;
}

function isCurrentUrlBookmarked() {
  const url = currentGuestUrl();
  return Boolean(url && sessionBookmarks.some((item) => item.url === url));
}

function broadcastBookmarks() {
  sendToChrome('agent:bookmarks', {
    items: sessionBookmarks.map((item) => ({ ...item })),
    folders: sessionFolders.map((item) => ({ ...item })),
    currentUrl: currentGuestUrl(),
    bookmarked: isCurrentUrlBookmarked(),
  });
}

function purgeSessionChromeState() {
  for (const item of activeDownloadItems.values()) {
    try {
      item.cancel();
    } catch {
      // Ignore cancel errors during wipe.
    }
  }
  activeDownloadItems.clear();
  sessionDownloads.clear();
  sessionBookmarks.length = 0;
  sessionFolders.length = 0;
  sessionFolders.push({ id: DEFAULT_BOOKMARK_FOLDER_ID, title: 'Bookmarks bar', createdAt: 0 });
  bookmarksPanelOpen = false;
  downloadsOpen = false;
  hideOverflowMenu({ notify: false });
  menuOpen = false;
  if (overflowMenuView) {
    try {
      if (!overflowMenuView.webContents.isDestroyed()) {
        overflowMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    overflowMenuView = null;
    overflowMenuReady = Promise.resolve();
  }
  shieldOpen = false;
  tabSecurityStats.clear();
  blockedRequestCount = 0;
  if (securityStatsFlush) {
    clearTimeout(securityStatsFlush);
    securityStatsFlush = null;
  }
  utilityOpen = false;
  sidebarOpen = false;
  findOpen = false;
  ramSheetOpen = false;
  stopLocalIntelWatch();
  sessionLocalFiles.length = 0;
  sessionLocalDirs.length = 0;
  selectedLocalModel = null;
  sendToChrome('agent:downloads', { items: [], open: false });
  sendToChrome('agent:local-intel', { models: [], agents: [], selectedId: null, scannedAt: 0 });
  broadcastBookmarks();
}

function safeDownloadName(name) {
  const cleaned = path
    .basename(String(name || 'indirilen'))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 180);
  return cleaned || 'indirilen';
}

function uniqueSavePath(directory, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = path.join(directory, filename);
  let serial = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${serial})${ext}`);
    serial += 1;
  }
  return candidate;
}

function serializeDownload(record) {
  return {
    id: record.id,
    filename: record.filename,
    received: record.received,
    total: record.total,
    state: record.state,
    progress: record.total > 0 ? Math.min(1, record.received / record.total) : 0,
  };
}

function broadcastDownloads(open = false) {
  sendToChrome('agent:downloads', {
    items: [...sessionDownloads.values()].map(serializeDownload),
    open,
  });
}

function attachDownloadManager(isolatedSession) {
  if (downloadsAttached) {
    return;
  }
  downloadsAttached = true;

  isolatedSession.on('will-download', (event, item) => {
    if (panicInProgress) {
      event.preventDefault();
      return;
    }

    const id = String(nextDownloadId);
    nextDownloadId += 1;
    const filename = safeDownloadName(item.getFilename());
    const savePath = uniqueSavePath(app.getPath('downloads'), filename);
    item.setSavePath(savePath);

    const record = {
      id,
      filename: path.basename(savePath),
      received: 0,
      total: item.getTotalBytes() || 0,
      state: 'progressing',
    };
    sessionDownloads.set(id, record);
    activeDownloadItems.set(id, item);
    downloadsOpen = true;
    fitBrowserView();
    broadcastDownloads(true);

    item.on('updated', (_updatedEvent, state) => {
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes() || record.total;
      record.state = item.isPaused() ? 'paused' : state;
      broadcastDownloads();
    });

    item.once('done', (_doneEvent, state) => {
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes() || record.total;
      record.state = state;
      activeDownloadItems.delete(id);
      broadcastDownloads();
    });
  });
}

function attachGuestContextMenu(webContents) {
  webContents.on('context-menu', (_event, params) => {
    if (!webContents || webContents.isDestroyed() || panicInProgress) {
      return;
    }

    const flags = navigationFlags(webContents);
    const canCopy = Boolean(params.selectionText) || Boolean(params.editFlags?.canCopy);
    const canPaste = Boolean(params.isEditable) || Boolean(params.editFlags?.canPaste);
    const hasImage = params.mediaType === 'image' || Boolean(params.hasImageContents);

    const menu = Menu.buildFromTemplate([
      {
        label: 'Geri',
        enabled: flags.canGoBack,
        click: () => {
          if (goHistoryOn(webContents, 'back') && webContents === getGuestWebContents()) {
            broadcastBrowserState();
          }
        },
      },
      {
        label: 'İleri',
        enabled: flags.canGoForward,
        click: () => {
          if (goHistoryOn(webContents, 'forward') && webContents === getGuestWebContents()) {
            broadcastBrowserState();
          }
        },
      },
      {
        label: 'Yeniden Yükle',
        click: () => webContents.reload(),
      },
      { type: 'separator' },
      {
        label: 'Kopyala',
        enabled: canCopy,
        click: () => webContents.copy(),
      },
      {
        label: 'Yapıştır',
        enabled: canPaste,
        click: () => webContents.paste(),
      },
      {
        label: 'Resmi Kopyala',
        visible: hasImage,
        click: () => webContents.copyImageAt(params.x, params.y),
      },
      { type: 'separator' },
      {
        label: 'İncele',
        click: () => webContents.inspectElement(params.x, params.y),
      },
    ]);

    menu.popup({ window: mainWindow || undefined });
  });
}

function popupTabContextMenu(tabId, x, y) {
  const guest = getTabWebContents(tabId);
  const entry = views.get(tabId);
  if (!guest || !entry || panicInProgress) {
    return;
  }

  const muted = guest.isAudioMuted();
  const pinned = Boolean(entry.pinned);
  const menu = Menu.buildFromTemplate([
    {
      label: 'Sekmeyi Kapat',
      click: () => destroyTab(tabId),
    },
    {
      label: 'Diğerlerini Kapat',
      enabled: views.size > 1,
      click: () => {
        for (const otherId of [...views.keys()]) {
          if (otherId !== tabId) {
            destroyTab(otherId, false);
          }
        }
        if (views.has(tabId)) {
          switchToTab(tabId);
        }
      },
    },
    {
      label: muted ? 'Sesi Aç' : 'Sesi Kapat',
      click: () => {
        guest.setAudioMuted(!guest.isAudioMuted());
        emitTabUpdated(tabId);
      },
    },
    {
      label: pinned ? 'Sabiti Kaldır' : 'Sabitle',
      click: () => {
        entry.pinned = !entry.pinned;
        emitTabUpdated(tabId);
      },
    },
  ]);

  menu.popup({
    window: mainWindow || undefined,
    x: Number.isFinite(x) ? Math.round(x) : undefined,
    y: Number.isFinite(y) ? Math.round(y) : undefined,
  });
}

function bookmarksBarOpen() {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return true;
  }
  return isStartPage(guest.getURL());
}

function chromeHeight() {
  const extra = Math.max(
    downloadsOpen ? DOWNLOADS_PANEL_HEIGHT : 0,
    shieldOpen ? SHIELD_POPUP_HEIGHT : 0,
    utilityOpen ? SHIELD_POPUP_HEIGHT : 0,
  );
  const bookmarks = bookmarksBarOpen() ? BOOKMARKS_BAR_HEIGHT : 0;
  return TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT + bookmarks + extra + (findOpen ? FIND_BAR_HEIGHT : 0);
}

function viewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const { width, height } = mainWindow.getContentBounds();
  const reservedLeft = settingsOpen ? SETTINGS_WIDTH : 0;
  let reservedRight = 0;
  if (sidebarOpen) {
    reservedRight = SIDEBAR_WIDTH;
  } else if (bookmarksPanelOpen || ramSheetOpen) {
    reservedRight = BOOKMARKS_PANEL_WIDTH;
  }
  const top = chromeHeight();
  return {
    x: reservedLeft,
    y: top,
    width: Math.max(0, width - reservedLeft - reservedRight),
    height: Math.max(0, height - top),
  };
}

function bringViewToFront(view) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (typeof mainWindow.setTopBrowserView === 'function') {
    try {
      mainWindow.setTopBrowserView(view);
      raiseOverflowMenu();
      return;
    } catch {
      // WebContentsView is not a BrowserView; fall through.
    }
  }

  mainWindow.contentView.addChildView(view);
  raiseOverflowMenu();
}

function fileUrlToPath(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'file:') {
      return '';
    }

    let pathname = decodeURIComponent(parsed.pathname);
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return path.normalize(pathname);
  } catch {
    return '';
  }
}

function isNewTabFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    if (new URL(rawUrl).href === NEWTAB_FILE_URL) {
      return true;
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(NEWTAB_PATH).toLowerCase();
}

function isStartPage(rawUrl) {
  return !rawUrl || rawUrl === 'about:blank' || isNewTabFile(rawUrl);
}

function isAllowedGuestUrl(rawUrl) {
  return rawUrl === 'about:blank' || isNewTabFile(rawUrl) || Boolean(sanitizeUrl(rawUrl));
}

function loadStartPage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  webContents.loadFile(NEWTAB_PATH);
}

function tabTitleOf(webContents) {
  if (isStartPage(webContents.getURL())) {
    return 'Yeni Sekme';
  }

  const title = webContents.getTitle();
  if (title && title !== 'about:blank' && title !== 'Yeni Sekme') {
    return title.slice(0, 80);
  }
  return 'Yükleniyor...';
}

function agentVideoAdSkipper() {
  if (window.__agentVideoAdSkipper) {
    return;
  }
  window.__agentVideoAdSkipper = true;

  const SKIP_BUTTONS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-container button',
    '.ytp-skip-ad-button',
    '.ytp-ad-overlay-close-button',
    '.videoAdUiSkipButton',
    '.ima-skip-button',
  ];
  const BANNER_HIDE = [
    '.ytp-ad-overlay-image',
    '.ytp-ad-text-overlay',
    '.ytp-ad-overlay-container',
    '.ytp-ad-overlay-slot',
    '.ytp-ad-image-overlay',
    '.ytp-ad-player-overlay',
  ];
  const PLAYER_SELECTORS = ['#movie_player', '.html5-video-player', '.video-js', 'video'];
  const AD_CLASS = /\b(ad-showing|ad-interrupting|ytp-ad-player-overlay|videoAdUi|ima-ad-container)\b/i;
  const AD_NEAR = /\b(ads?|advert|sponsor(?:ed)?|preroll|midroll)\b/i;
  const watched = new WeakSet();

  const hideCss = document.createElement('style');
  hideCss.textContent = `${BANNER_HIDE.join(',')}{display:none!important;visibility:hidden!important;pointer-events:none!important}`;
  (document.head || document.documentElement).appendChild(hideCss);

  function clickSkip(root) {
    const scope = root && root.querySelectorAll ? root : document;
    for (const selector of SKIP_BUTTONS) {
      scope.querySelectorAll(selector).forEach((node) => {
        if (node instanceof HTMLElement) {
          node.click();
        }
      });
    }
  }

  function skipVideo(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }
    const duration = Number(video.duration);
    if (Number.isFinite(duration) && duration > 0) {
      try {
        video.currentTime = Math.max(0, duration - 0.1);
      } catch {
        // Seek can fail while metadata is still loading.
      }
    }
    video.muted = true;
    video.playbackRate = 16;
  }

  function playerHasAd(player) {
    if (!player) {
      return false;
    }
    const className = String(player.className || '');
    if (player.classList?.contains('ad-showing') || player.classList?.contains('ad-interrupting')) {
      return true;
    }
    if (AD_CLASS.test(className)) {
      return true;
    }
    return Boolean(
      player.querySelector?.(
        '.ytp-ad-player-overlay,.ytp-ad-preview-container,.ytp-ad-text,.videoAdUi,.ima-ad-container',
      ),
    );
  }

  function nearAdShell(video) {
    let node = video;
    for (let depth = 0; node && depth < 5; depth += 1) {
      const className = String(node.className || '');
      const id = String(node.id || '');
      if (AD_NEAR.test(className) || AD_NEAR.test(id)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function sweep(root) {
    const scope = root && root.querySelectorAll ? root : document;
    clickSkip(scope);
    const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (ytPlayer && playerHasAd(ytPlayer)) {
      ytPlayer.querySelectorAll('video').forEach(skipVideo);
      clickSkip(ytPlayer);
    }
    scope.querySelectorAll('video').forEach((video) => {
      if (ytPlayer && ytPlayer.contains(video)) {
        return;
      }
      if (nearAdShell(video)) {
        skipVideo(video);
      }
    });
  }

  function playerRootFor(node) {
    if (!(node instanceof Element)) {
      return null;
    }
    if (node.matches?.('#movie_player,.html5-video-player,.video-js')) {
      return node;
    }
    if (node.tagName === 'VIDEO') {
      return node.closest('#movie_player,.html5-video-player,.video-js,[class*="player"]') || node.parentElement || node;
    }
    return node.closest('#movie_player,.html5-video-player,.video-js') || node;
  }

  function watchPlayer(root) {
    if (!root || watched.has(root)) {
      return;
    }
    watched.add(root);
    const observer = new MutationObserver(() => sweep(root));
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    sweep(root);
  }

  function attachPlayers() {
    for (const selector of PLAYER_SELECTORS) {
      document.querySelectorAll(selector).forEach((node) => {
        const root = playerRootFor(node);
        if (root) {
          watchPlayer(root);
        }
      });
    }
  }

  let scoutTries = 0;
  const scoutTimer = setInterval(() => {
    attachPlayers();
    scoutTries += 1;
    if (document.getElementById('movie_player') || document.querySelector('video') || scoutTries > 40) {
      clearInterval(scoutTimer);
      attachPlayers();
    }
  }, 400);

  attachPlayers();
  document.addEventListener('yt-navigate-finish', () => {
    attachPlayers();
    sweep(document.getElementById('movie_player') || document);
  });
  setInterval(() => {
    const ytPlayer = document.getElementById('movie_player');
    if (ytPlayer && playerHasAd(ytPlayer)) {
      sweep(ytPlayer);
    }
  }, 750);
}

const VIDEO_AD_SKIPPER_SOURCE = `(${agentVideoAdSkipper.toString()})();`;

function injectVideoAdSkipper(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  if (isStartPage(webContents.getURL())) {
    return;
  }
  webContents.executeJavaScript(VIDEO_AD_SKIPPER_SOURCE, true).catch(() => {});
}

function attachTabListeners(tabId, webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = sanitizeUrl(url);
    if (safeUrl) {
      createGuestTab(safeUrl);
    }
    return { action: 'deny' };
  });

  webContents.on('before-input-event', handleAppShortcut);
  webContents.on('found-in-page', (_event, result) => {
    sendToChrome('agent:find-result', {
      activeMatchOrdinal: Number(result?.activeMatchOrdinal) || 0,
      matches: Number(result?.matches) || 0,
    });
  });

  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedGuestUrl(url)) {
      event.preventDefault();
    }
  });
  webContents.on('dom-ready', () => injectVideoAdSkipper(webContents));
  webContents.on('did-finish-load', () => injectVideoAdSkipper(webContents));

  const emitTitle = () => {
    sendToChrome('agent:tab-title-updated', {
      tabId,
      title: tabTitleOf(webContents),
    });
  };

  webContents.on('page-title-updated', emitTitle);
  webContents.on('did-start-loading', () => {
    sendToChrome('agent:tab-title-updated', {
      tabId,
      title: isStartPage(webContents.getURL()) ? 'Yeni Sekme' : 'Yükleniyor...',
    });
    emitTabUpdated(tabId);
    if (tabId === activeTabId) {
      broadcastBrowserState();
    }
  });
  webContents.on('did-stop-loading', () => {
    emitTitle();
    emitTabUpdated(tabId);
    if (tabId === activeTabId) {
      broadcastBrowserState();
    }
  });
  webContents.on('did-fail-load', (_event, errorCode) => {
    if (errorCode === -3) {
      return;
    }
    emitTabUpdated(tabId);
    if (tabId === activeTabId) {
      broadcastBrowserState();
    }
  });
  webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      resetTabSecurityStats(tabId);
    }
  });
  webContents.on('did-navigate', () => {
    emitTitle();
    emitTabUpdated(tabId);
    if (tabId === activeTabId) {
      broadcastBrowserState();
    }
  });
  webContents.on('did-navigate-in-page', () => {
    if (tabId === activeTabId) {
      broadcastBrowserState();
    }
  });
  webContents.on('media-started-playing', () => emitTabUpdated(tabId));
  webContents.on('media-paused', () => emitTabUpdated(tabId));
  webContents.on('before-input-event', handleHistoryShortcut);
  attachGuestContextMenu(webContents);
}

function switchToTab(tabId) {
  const entry = views.get(tabId);
  if (!entry || !mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  activeTabId = tabId;
  entry.view.setBounds(viewBounds());
  bringViewToFront(entry.view);
  sendSecurityStats(tabId);
  broadcastBrowserState();
  return true;
}

function createGuestTab(initialUrl, options = {}) {
  const host = options.window && !options.window.isDestroyed() ? options.window : mainWindow;
  if (panicInProgress || !host || host.isDestroyed()) {
    return null;
  }

  const tabId = String(nextTabId);
  nextTabId += 1;
  const activate = options.activate !== false;
  const owner = typeof options.owner === 'string' ? options.owner.trim().slice(0, 80) : '';

  const view = new WebContentsView({
    webPreferences: guestWebPreferences,
  });
  view.setBackgroundColor('#070809');
  views.set(tabId, { id: tabId, view, owner, pinned: false, window: host });
  tabSecurityStats.set(tabId, emptySecurityStats());
  attachTabListeners(tabId, view.webContents);
  host.contentView.addChildView(view);
  view.setBounds(viewBounds());
  if (activate) {
    switchToTab(tabId);
  }

  const target = initialUrl || 'about:blank';
  if (target !== 'about:blank') {
    const safeUrl = sanitizeUrl(target);
    if (safeUrl) {
      view.webContents.loadURL(safeUrl);
    } else {
      loadStartPage(view.webContents);
    }
  } else {
    loadStartPage(view.webContents);
  }

  sendToChrome('agent:tab-created', {
    tabId,
    title: target === 'about:blank' ? 'Yeni Sekme' : 'Yükleniyor...',
    url: target,
    active: activate,
    pinned: false,
    muted: false,
    audible: false,
  });

  return tabId;
}

function destroyTab(tabId, replaceIfLast = true) {
  const entry = views.get(tabId);
  if (!entry) {
    return null;
  }

  const order = [...views.keys()];
  const index = order.indexOf(tabId);
  const wasActive = activeTabId === tabId;

  if (entry.window && !entry.window.isDestroyed()) {
    entry.window.contentView.removeChildView(entry.view);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(entry.view);
  }

  const { webContents } = entry.view;
  destroyWebContentsHard(webContents);

  views.delete(tabId);
  tabSecurityStats.delete(tabId);

  let nextId = null;
  if (views.size === 0 && replaceIfLast && mainWindow && !mainWindow.isDestroyed()) {
    nextId = createGuestTab(DEFAULT_TAB_URL);
  } else if (wasActive) {
    nextId = order[index - 1] || order[index + 1] || [...views.keys()][0];
    if (nextId && views.has(nextId)) {
      switchToTab(nextId);
    }
  } else {
    nextId = activeTabId;
  }

  sendToChrome('agent:tab-closed', { tabId, nextTabId: nextId });
  return nextId;
}

function destroyWebContentsHard(webContents) {
  if (!webContents) {
    return;
  }

  try {
    if (webContents.isDestroyed()) {
      return;
    }
  } catch {
    return;
  }

  try {
    if (typeof webContents.destroy === 'function') {
      webContents.destroy();
    }
  } catch {
    // Fall through to close(); quit must not depend on this path.
  }

  try {
    if (!webContents.isDestroyed()) {
      webContents.close({ waitForBeforeUnload: false });
    }
  } catch {
    try {
      if (!webContents.isDestroyed()) {
        webContents.close();
      }
    } catch {
      // Never block purge/quit.
    }
  }
}

function destroyAllGuestTabs() {
  const snapshot = [...views.values()];
  views.clear();
  activeTabId = null;

  for (const entry of snapshot) {
    try {
      entry.view.setVisible(false);
    } catch {
      // Ignore visibility errors.
    }

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.contentView.removeChildView(entry.view);
      }
    } catch {
      // Ignore detach errors.
    }

    try {
      destroyWebContentsHard(entry.view.webContents);
    } catch {
      // Ignore destroy errors; remaining tabs still get processed.
    }
  }
}

function forcePanicQuit() {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore unregister failures.
  }

  try {
    app.quit();
  } catch {
    // Fall through to hard exit.
  }

  setTimeout(() => {
    try {
      app.exit(0);
    } catch {
      process.exit(0);
    }
  }, 400);
}

function triggerExcommunicado() {
  if (panicInProgress) {
    return;
  }

  panicInProgress = true;
  isWipingSession = true;
  hideOverflowMenu({ notify: false });
  setTimeout(forcePanicQuit, PANIC_QUIT_MS);

  try {
    stopAgentBridgeServer();
    agentBridgeToken = '';
    privacySettings.agentBridge = false;
    privacySettings.ghostNetwork = false;
    applyGhostNetwork().catch(() => {});
  } catch {
    // Bridge shutdown must not block purge.
  }

  try {
    sendToChrome('panic:burn');
  } catch {
    // Overlay is best-effort; wipe still proceeds.
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.setBackgroundColor('#000000');
      mainWindow.show();
    }
  } catch {
    // Visual burn is optional; destruction is not.
  }

  try {
    purgeSessionChromeState();
    destroyAllGuestTabs();
  } catch {
    views.clear();
    activeTabId = null;
  }

  wipeIsolatedSession().catch(() => {});
}

function chromeWindowFromEvent(event) {
  if (!event?.sender) {
    return null;
  }
  for (const win of chromeWindows) {
    if (!win.isDestroyed() && event.sender === win.webContents) {
      return win;
    }
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents) {
    return mainWindow;
  }
  return null;
}

function isChromeSender(event) {
  if (!event?.sender) {
    return false;
  }
  if (
    overflowMenuView &&
    !overflowMenuView.webContents.isDestroyed() &&
    event.sender === overflowMenuView.webContents
  ) {
    return true;
  }
  return Boolean(chromeWindowFromEvent(event));
}

function notifyChromeMenuClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:menu-closed');
    }
  }
}

function detachOverflowHost() {
  if (overflowHostWindow && !overflowHostWindow.isDestroyed() && overflowHostDismiss) {
    overflowHostWindow.removeListener('move', overflowHostDismiss);
    overflowHostWindow.removeListener('resize', overflowHostDismiss);
  }
  overflowHostWindow = null;
  overflowHostDismiss = null;
}

function overflowViewAlive() {
  return Boolean(overflowMenuView && !overflowMenuView.webContents.isDestroyed());
}

function raiseOverflowMenu() {
  if (!menuOpen || !overflowViewAlive() || !overflowHostWindow || overflowHostWindow.isDestroyed()) {
    return;
  }
  overflowHostWindow.contentView.addChildView(overflowMenuView);
}

function hideOverflowMenu(options = {}) {
  const notify = options.notify !== false;
  menuOpen = false;
  const host = overflowHostWindow;
  detachOverflowHost();
  if (overflowViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(overflowMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeMenuClosed();
  }
}

function ensureOverflowMenuView() {
  if (overflowViewAlive()) {
    return overflowMenuReady;
  }

  overflowMenuView = new WebContentsView({
    webPreferences: chromeWebPreferences,
  });
  overflowMenuView.setBackgroundColor('#292a2d');
  overflowMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overflowMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        menuOpen &&
        overflowViewAlive() &&
        !overflowMenuView.webContents.isFocused()
      ) {
        hideOverflowMenu();
      }
    }, 0);
  });
  overflowMenuReady = overflowMenuView.webContents.loadFile(path.join(__dirname, 'overflow-menu.html'));
  return overflowMenuReady;
}

function showOverflowMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = MENU_DROPDOWN_WIDTH;
  const kebabBottom = Number(anchor && anchor.bottom);
  const kebabRight = Number(anchor && anchor.right);
  const bottom = Number.isFinite(kebabBottom) ? kebabBottom : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;
  const right = Number.isFinite(kebabRight) ? kebabRight : contentWidth - 8;
  let x = Math.round(right - width);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(160, contentHeight - y - 8);
  const initialH = Math.min(620, maxH);

  overflowHostWindow = host;
  menuOpen = true;
  overflowHostDismiss = () => {
    if (overflowHostWindow === host) {
      hideOverflowMenu();
    }
  };
  host.on('move', overflowHostDismiss);
  host.on('resize', overflowHostDismiss);

  ensureOverflowMenuView()
    .then(async () => {
      if (!menuOpen || overflowHostWindow !== host || host.isDestroyed() || !overflowViewAlive()) {
        return;
      }
      overflowMenuView.setBounds({ x, y, width, height: Math.min(800, maxH) });
      let measured = initialH;
      try {
        measured = await overflowMenuView.webContents.executeJavaScript(`(() => {
          const menu = document.getElementById('agent-main-menu');
          if (!menu) {
            return 0;
          }
          return Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height));
        })()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!menuOpen || overflowHostWindow !== host || !overflowViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 120), maxH);
      overflowMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(overflowMenuView);
      overflowMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open overflow menu:', error);
      hideOverflowMenu();
    });
}

function sanitizeUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    parsed.protocol = 'https:';
  }

  return parsed.href;
}

function navigationFlags(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return { canGoBack: false, canGoForward: false };
  }

  const history = webContents.navigationHistory;
  if (history && typeof history.canGoBack === 'function') {
    return {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    };
  }

  return {
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward(),
  };
}

function goHistoryOn(webContents, direction) {
  if (!webContents || webContents.isDestroyed()) {
    return false;
  }

  const flags = navigationFlags(webContents);
  if (direction === 'back') {
    if (!flags.canGoBack) {
      return false;
    }
    if (webContents.navigationHistory?.goBack) {
      webContents.navigationHistory.goBack();
    } else {
      webContents.goBack();
    }
    return true;
  }

  if (!flags.canGoForward) {
    return false;
  }
  if (webContents.navigationHistory?.goForward) {
    webContents.navigationHistory.goForward();
  } else {
    webContents.goForward();
  }
  return true;
}

function handleAppShortcut(event, input) {
  if (!input || input.type !== 'keyDown' || input.isAutoRepeat) {
    return;
  }

  const ctrl = Boolean(input.control || input.meta);
  const shift = Boolean(input.shift);
  const alt = Boolean(input.alt);
  const key = String(input.key || '');
  const lower = key.toLowerCase();

  const goBack = key === 'BrowserBack' || (alt && !ctrl && key === 'ArrowLeft');
  const goForward = key === 'BrowserForward' || (alt && !ctrl && key === 'ArrowRight');
  if (goBack || goForward) {
    event.preventDefault();
    if (goHistoryOn(getGuestWebContents(), goBack ? 'back' : 'forward')) {
      broadcastBrowserState();
    }
    return;
  }

  if (!ctrl) {
    return;
  }

  if (lower === 't' && !shift) {
    event.preventDefault();
    createGuestTab('about:blank');
    return;
  }
  if (lower === 'n') {
    event.preventDefault();
    createAgentWindow();
    return;
  }
  if (lower === 'j' && !shift) {
    event.preventDefault();
    sendToChrome('agent:menu-command', { action: 'downloads' });
    return;
  }
  if (lower === 'p' && !shift) {
    event.preventDefault();
    printActiveGuest();
    return;
  }
  if (lower === 'f' && !shift) {
    event.preventDefault();
    findOpen = true;
    fitBrowserView();
    sendToChrome('agent:menu-command', { action: 'find' });
    return;
  }
  if (shift && (lower === 'delete' || key === 'Delete')) {
    event.preventDefault();
    clearIsolatedBrowsingData().then(() => {
      sendToChrome('agent:menu-command', { action: 'cleared' });
    });
  }
}

function handleHistoryShortcut(event, input) {
  handleAppShortcut(event, input);
}

function broadcastBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    sendToChrome('agent:url-changed', {
      url: '',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      bookmarked: false,
      bookmarksBar: true,
    });
    fitBrowserView();
    return;
  }

  const url = guest.getURL();
  const flags = navigationFlags(guest);
  sendToChrome('agent:url-changed', {
    url: isStartPage(url) ? '' : url,
    canGoBack: flags.canGoBack,
    canGoForward: flags.canGoForward,
    isLoading: guest.isLoading(),
    bookmarked: isCurrentUrlBookmarked(),
    bookmarksBar: isStartPage(url),
  });
  broadcastBookmarks();
  fitBrowserView();
}

function fitBrowserView() {
  if (views.size === 0) {
    return;
  }

  const saved = mainWindow;
  for (const { view, window: host } of views.values()) {
    const win = host && !host.isDestroyed() ? host : saved;
    if (!win || win.isDestroyed()) {
      continue;
    }
    mainWindow = win;
    view.setBounds(viewBounds());
  }
  if (saved && !saved.isDestroyed()) {
    mainWindow = saved;
  }
}

async function wipeIsolatedSession() {
  const isolatedSession = getIsolatedSession();

  await Promise.all([
    isolatedSession.clearStorageData(),
    isolatedSession.clearCache(),
    isolatedSession.clearAuthCache(),
  ]);
}

ipcMain.handle('agent:navigate', async (event, rawUrl) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const url = sanitizeUrl(rawUrl);
  const guest = getGuestWebContents();
  if (!url || !guest || guest.isDestroyed()) {
    return { ok: false };
  }

  await guest.loadURL(url);
  return { ok: true, url };
});

ipcMain.handle('agent:go-back', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const ok = goHistoryOn(getGuestWebContents(), 'back');
  if (ok) {
    broadcastBrowserState();
  }
  return { ok };
});

ipcMain.handle('agent:go-forward', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const ok = goHistoryOn(getGuestWebContents(), 'forward');
  if (ok) {
    broadcastBrowserState();
  }
  return { ok };
});

ipcMain.handle('agent:reload', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false };
  }

  guest.reload();
  return { ok: true };
});

ipcMain.handle('agent:stop', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false };
  }

  guest.stop();
  broadcastBrowserState();
  return { ok: true };
});

ipcMain.handle('agent:toggle-mute', async (event, tabId) => {
  if (!isChromeSender(event) || typeof tabId !== 'string') {
    return { ok: false };
  }

  const guest = getTabWebContents(tabId);
  if (!guest) {
    return { ok: false };
  }

  guest.setAudioMuted(!guest.isAudioMuted());
  emitTabUpdated(tabId);
  return { ok: true, tab: serializeTab(tabId) };
});

ipcMain.handle('agent:toggle-pin', async (event, tabId) => {
  if (!isChromeSender(event) || typeof tabId !== 'string') {
    return { ok: false };
  }

  const entry = views.get(tabId);
  if (!entry) {
    return { ok: false };
  }

  entry.pinned = !entry.pinned;
  emitTabUpdated(tabId);
  return { ok: true, tab: serializeTab(tabId) };
});

ipcMain.handle('agent:close-other-tabs', async (event, tabId) => {
  if (!isChromeSender(event) || typeof tabId !== 'string' || !views.has(tabId)) {
    return { ok: false };
  }

  for (const otherId of [...views.keys()]) {
    if (otherId !== tabId) {
      destroyTab(otherId, false);
    }
  }

  if (!views.has(tabId)) {
    return { ok: false };
  }

  switchToTab(tabId);
  return { ok: true };
});

ipcMain.handle('agent:bookmark-toggle', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const guest = getGuestWebContents();
  const url = currentGuestUrl();
  if (!guest || !url) {
    return { ok: false };
  }

  const existing = sessionBookmarks.findIndex((item) => item.url === url);
  if (existing >= 0) {
    sessionBookmarks.splice(existing, 1);
  } else {
    sessionBookmarks.push({
      id: String(nextBookmarkId),
      url,
      title: tabTitleOf(guest) || url,
      folderId: DEFAULT_BOOKMARK_FOLDER_ID,
      createdAt: Date.now(),
    });
    nextBookmarkId += 1;
  }

  broadcastBookmarks();
  broadcastBrowserState();
  return { ok: true, bookmarked: isCurrentUrlBookmarked() };
});

ipcMain.handle('agent:bookmark-remove', async (event, bookmarkId) => {
  if (!isChromeSender(event) || typeof bookmarkId !== 'string') {
    return { ok: false };
  }

  const index = sessionBookmarks.findIndex((item) => item.id === bookmarkId);
  if (index >= 0) {
    sessionBookmarks.splice(index, 1);
  }
  broadcastBookmarks();
  broadcastBrowserState();
  return { ok: true };
});

ipcMain.handle('agent:bookmark-folder-create', async (event, title) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  const label = typeof title === 'string' ? title.trim().slice(0, 80) : '';
  sessionFolders.push({
    id: `f${nextFolderId}`,
    title: label || `New folder ${nextFolderId}`,
    createdAt: Date.now(),
  });
  nextFolderId += 1;
  broadcastBookmarks();
  return { ok: true };
});

ipcMain.handle('agent:bookmark-rename', async (event, payload) => {
  if (!isChromeSender(event) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }
  const id = typeof payload.id === 'string' ? payload.id : '';
  const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 80) : '';
  if (!id || !title) {
    return { ok: false };
  }
  const bookmark = sessionBookmarks.find((item) => item.id === id);
  if (bookmark) {
    bookmark.title = title;
    broadcastBookmarks();
    return { ok: true };
  }
  const folder = sessionFolders.find((item) => item.id === id);
  if (folder && folder.id !== DEFAULT_BOOKMARK_FOLDER_ID) {
    folder.title = title;
    broadcastBookmarks();
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('agent:download-cancel', async (event, downloadId) => {
  if (!isChromeSender(event) || typeof downloadId !== 'string') {
    return { ok: false };
  }

  const item = activeDownloadItems.get(downloadId);
  if (item) {
    try {
      item.cancel();
    } catch {
      return { ok: false };
    }
  }

  const record = sessionDownloads.get(downloadId);
  if (record && record.state === 'progressing') {
    record.state = 'cancelled';
    broadcastDownloads();
  }
  return { ok: true };
});

ipcMain.handle('agent:downloads-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  downloadsOpen = Boolean(open);
  fitBrowserView();
  return { ok: true, open: downloadsOpen };
});

ipcMain.handle('agent:menu-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    shieldOpen = false;
    utilityOpen = false;
    showOverflowMenu(anchor, host);
  } else {
    hideOverflowMenu();
  }
  return { ok: true, open: menuOpen };
});

ipcMain.handle('agent:shield-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  shieldOpen = Boolean(open);
  if (shieldOpen) {
    hideOverflowMenu();
    utilityOpen = false;
  }
  fitBrowserView();
  return { ok: true, open: shieldOpen, settings: snapshotSettings(), stats: snapshotSecurityStats() };
});

ipcMain.handle('agent:utility-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  utilityOpen = Boolean(open);
  if (utilityOpen) {
    hideOverflowMenu();
    shieldOpen = false;
  }
  fitBrowserView();
  return { ok: true, open: utilityOpen };
});

ipcMain.handle('agent:zoom', async (event, action) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false };
  }

  let factor = guest.getZoomFactor();
  if (action === 'in') {
    factor = Math.min(3, Math.round((factor + 0.1) * 10) / 10);
  } else if (action === 'out') {
    factor = Math.max(0.25, Math.round((factor - 0.1) * 10) / 10);
  } else {
    factor = 1;
  }
  guest.setZoomFactor(factor);
  return { ok: true, zoom: Math.round(factor * 100) };
});

ipcMain.handle('agent:fullscreen', async (event) => {
  if (!isChromeSender(event) || !mainWindow || mainWindow.isDestroyed()) {
    return { ok: false };
  }

  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return { ok: true, fullscreen: next };
});

ipcMain.handle('agent:menu-action', async (event, action) => {
  if (!isChromeSender(event) || typeof action !== 'string') {
    return { ok: false };
  }

  let result = { ok: true };
  switch (action) {
    case 'new-tab':
      createGuestTab('about:blank');
      break;
    case 'new-window':
    case 'new-incognito':
      createAgentWindow();
      break;
    case 'print':
      result = printActiveGuest();
      break;
    case 'fullscreen': {
      if (!mainWindow || mainWindow.isDestroyed()) {
        result = { ok: false };
        break;
      }
      const next = !mainWindow.isFullScreen();
      mainWindow.setFullScreen(next);
      result = { ok: true, fullscreen: next };
      break;
    }
    case 'clear-data':
      await clearIsolatedBrowsingData();
      break;
    case 'exit':
      triggerExcommunicado();
      return { ok: true };
    case 'gemini':
    case 'lens':
      result = { ok: true, openAi: true, summarize: action === 'lens' };
      break;
    default:
      break;
  }

  sendToChrome('agent:menu-command', { action });
  hideOverflowMenu();
  return result;
});

ipcMain.handle('agent:find-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  findOpen = Boolean(open);
  if (!findOpen) {
    const guest = getGuestWebContents();
    if (guest && !guest.isDestroyed()) {
      guest.stopFindInPage('clearSelection');
    }
  }
  fitBrowserView();
  return { ok: true, open: findOpen };
});

ipcMain.handle('agent:ram-sheet', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  ramSheetOpen = Boolean(open);
  if (ramSheetOpen) {
    sidebarOpen = false;
    bookmarksPanelOpen = false;
    hideOverflowMenu();
  }
  fitBrowserView();
  return { ok: true, open: ramSheetOpen };
});

ipcMain.handle('agent:find-in-page', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  const guest = getGuestWebContents();
  const query = typeof payload?.query === 'string' ? payload.query : '';
  if (!guest || guest.isDestroyed() || !query) {
    return { ok: false };
  }
  guest.findInPage(query, {
    forward: payload?.forward !== false,
    findNext: Boolean(payload?.findNext),
  });
  return { ok: true };
});

ipcMain.handle('agent:find-stop', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  const guest = getGuestWebContents();
  if (guest && !guest.isDestroyed()) {
    guest.stopFindInPage('clearSelection');
  }
  return { ok: true };
});

ipcMain.on('agent:tab-context', (event, payload) => {
  if (!isChromeSender(event) || !payload || typeof payload.tabId !== 'string') {
    return;
  }
  popupTabContextMenu(payload.tabId, payload.x, payload.y);
});

ipcMain.handle('agent:create-tab', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const tabId = createGuestTab('about:blank');
  return { ok: Boolean(tabId), tabId };
});

ipcMain.handle('agent:switch-tab', async (event, tabId) => {
  if (!isChromeSender(event) || typeof tabId !== 'string') {
    return { ok: false };
  }

  return { ok: switchToTab(tabId) };
});

ipcMain.handle('agent:close-tab', async (event, tabId) => {
  if (!isChromeSender(event) || typeof tabId !== 'string') {
    return { ok: false };
  }

  destroyTab(tabId);
  return { ok: true };
});

function emitAiResponse(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent:ai-response', payload);
  }
  return payload;
}

function readSessionApiKey(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  const apiKey = raw.trim();
  if (apiKey.length < 8 || apiKey.length > 256 || /[\r\n]/.test(apiKey)) {
    return null;
  }

  return apiKey;
}

function serializeLocalModel(model) {
  if (!model || typeof model !== 'object') {
    return null;
  }
  return {
    id: String(model.id || '').slice(0, 480),
    name: String(model.name || '').slice(0, 180),
    source: String(model.source || ''),
    runtime: String(model.runtime || ''),
    kind: String(model.kind || ''),
    ready: Boolean(model.ready),
    live: Boolean(model.live),
    path: typeof model.path === 'string' ? model.path.slice(0, 480) : '',
    sizeLabel: typeof model.sizeLabel === 'string' ? model.sizeLabel : '',
    port: Number(model.port) || 0,
    chatUrl: typeof model.chatUrl === 'string' && isLoopbackHttpUrl(model.chatUrl) ? model.chatUrl : '',
  };
}

function stopLocalIntelWatch() {
  for (const watcher of localIntelWatchers) {
    try {
      watcher.close();
    } catch {
      // Ignore watcher shutdown errors.
    }
  }
  localIntelWatchers = [];
  if (localIntelTimer) {
    clearInterval(localIntelTimer);
    localIntelTimer = null;
  }
}

function startLocalIntelWatch() {
  stopLocalIntelWatch();
  const dirs = knownModelRoots(sessionLocalDirs);
  const refresh = () => {
    pushLocalIntel().catch(() => {});
  };
  let debounce = null;
  const schedule = () => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(refresh, 400);
  };
  for (const dir of dirs) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, schedule);
      watcher.on('error', () => {});
      localIntelWatchers.push(watcher);
    } catch {
      // Directory may be unreadable; skip.
    }
  }
  localIntelTimer = setInterval(refresh, 3000);
}

async function buildLocalIntelSnapshot() {
  const intel = await collectIntel({
    extraDirs: sessionLocalDirs.slice(),
    extraFiles: sessionLocalFiles.slice(),
    listenInfo: privacySettings.agentBridge ? getListenInfo() : null,
  });
  if (selectedLocalModel) {
    const match = intel.models.find((item) => item.id === selectedLocalModel.id);
    selectedLocalModel = match || { ...selectedLocalModel, live: false, ready: selectedLocalModel.kind !== 'file' ? false : selectedLocalModel.ready };
  }
  return {
    models: intel.models.map((item) => serializeLocalModel(item)).filter(Boolean),
    agents: intel.agents,
    selectedId: selectedLocalModel?.id || null,
    scannedAt: intel.scannedAt,
  };
}

async function pushLocalIntel() {
  if (localIntelBusy) {
    localIntelPending = true;
    return null;
  }
  localIntelBusy = true;
  let snapshot = null;
  try {
    do {
      localIntelPending = false;
      snapshot = await buildLocalIntelSnapshot();
      sendToChrome('agent:local-intel', snapshot);
    } while (localIntelPending);
    return snapshot;
  } catch {
    return snapshot;
  } finally {
    localIntelBusy = false;
  }
}

async function setSidebarOpenState(open) {
  sidebarOpen = Boolean(open);
  if (sidebarOpen) {
    bookmarksPanelOpen = false;
    fitBrowserView();
    const snapshot = await pushLocalIntel();
    startLocalIntelWatch();
    return { ok: true, open: true, intel: snapshot };
  }
  stopLocalIntelWatch();
  fitBrowserView();
  return { ok: true, open: false };
}

function rememberUserPath(raw, into) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 480 || !path.isAbsolute(raw)) {
    return null;
  }
  try {
    fs.accessSync(raw);
  } catch {
    return null;
  }
  if (!into.includes(raw)) {
    into.push(raw);
  }
  return raw;
}

async function requestOllamaChat(model, messages) {
  const response = await fetch(model.chatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.name,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Ollama HTTP ${response.status}`);
  }
  const content = body?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Yerel model boş yanıt döndü.');
  }
  return content.trim();
}

async function requestLocalOpenAiChat(model, messages) {
  const response = await fetch(model.chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer local',
    },
    body: JSON.stringify({
      model: model.name,
      temperature: 0.2,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body.error?.message === 'string'
        ? body.error.message
        : `Yerel sunucu HTTP ${response.status}`;
    throw new Error(message);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Yerel model boş yanıt döndü.');
  }
  return content.trim();
}

async function requestChat(apiKey, messages) {
  const selected = selectedLocalModel && serializeLocalModel(selectedLocalModel);
  if (selected?.kind === 'ollama' && selected.ready && selected.chatUrl) {
    return requestOllamaChat(selected, messages);
  }
  if (selected?.kind === 'openai-compat' && selected.ready && selected.chatUrl) {
    return requestLocalOpenAiChat(selected, messages);
  }
  if (selected?.kind === 'file') {
    throw new Error(
      'Bu model dosyası seçildi ama çalışan bir yerel sunucu yok. Ollama, LM Studio veya benzeri bir çalışma zamanını başlatıp modeli yükleyin.',
    );
  }
  if (!apiKey) {
    throw new Error('Yerel bir model seçin veya oturum API anahtarı girin.');
  }
  return requestOpenAiChat(apiKey, messages);
}

async function extractVisiblePageText() {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return '';
  }

  const pageUrl = guest.getURL();
  if (!pageUrl || isStartPage(pageUrl)) {
    return '';
  }

  const text = await guest.executeJavaScript(
    `(function () {
      try {
        return document.body && document.body.innerText ? document.body.innerText : '';
      } catch (error) {
        return '';
      }
    })()`,
    true,
  );

  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/[ \t]+\n/g, '\n').trim().slice(0, PAGE_TEXT_LIMIT);
}

async function requestOpenAiChat(apiKey, messages) {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body.error?.message === 'string'
        ? body.error.message
        : `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('AI boş yanıt döndü.');
  }

  return content.trim();
}

ipcMain.handle('agent:sidebar', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  return setSidebarOpenState(open);
});

ipcMain.handle('agent:bookmarks-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  bookmarksPanelOpen = Boolean(open);
  if (bookmarksPanelOpen) {
    sidebarOpen = false;
    stopLocalIntelWatch();
  }
  fitBrowserView();
  return { ok: true, open: bookmarksPanelOpen };
});

ipcMain.handle('agent:local-intel-watch', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  if (open) {
    const snapshot = await pushLocalIntel();
    startLocalIntelWatch();
    return { ok: true, intel: snapshot };
  }
  stopLocalIntelWatch();
  return { ok: true };
});

ipcMain.handle('agent:local-intel-select', async (event, id) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  if (id === null || id === '' || id === 'cloud') {
    selectedLocalModel = null;
    const snapshot = await pushLocalIntel();
    return { ok: true, intel: snapshot };
  }
  if (typeof id !== 'string' || id.length > 480) {
    return { ok: false, error: 'geçersiz model' };
  }
  const snapshot = await buildLocalIntelSnapshot();
  const match = snapshot.models.find((item) => item.id === id);
  if (!match) {
    return { ok: false, error: 'model bulunamadı' };
  }
  selectedLocalModel = match;
  snapshot.selectedId = match.id;
  sendToChrome('agent:local-intel', snapshot);
  return { ok: true, intel: snapshot };
});

ipcMain.handle('agent:local-intel-pick', async (event, kind) => {
  if (!isChromeSender(event) || !mainWindow || mainWindow.isDestroyed()) {
    return { ok: false };
  }

  const wantDir = kind === 'dir';
  const result = await dialog.showOpenDialog(mainWindow, {
    title: wantDir ? 'Model klasörü seç' : 'Yerel model dosyası seç',
    properties: wantDir ? ['openDirectory'] : ['openFile'],
    filters: wantDir
      ? undefined
      : [
          { name: 'LLM ağırlıkları', extensions: ['gguf', 'ggml', 'bin', 'onnx', 'safetensors', 'pt', 'pth'] },
          { name: 'Tüm dosyalar', extensions: ['*'] },
        ],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: true, canceled: true };
  }

  const picked = rememberUserPath(result.filePaths[0], wantDir ? sessionLocalDirs : sessionLocalFiles);
  if (!picked) {
    return { ok: false, error: 'geçersiz yol' };
  }

  const snapshot = await pushLocalIntel();
  startLocalIntelWatch();
  if (!wantDir && snapshot?.models) {
    const match = snapshot.models.find((item) => item.path === picked);
    if (match) {
      selectedLocalModel = match;
      snapshot.selectedId = match.id;
      sendToChrome('agent:local-intel', snapshot);
    }
  }
  return { ok: true, intel: snapshot };
});

function snapshotSettings() {
  const listen = privacySettings.agentBridge ? getListenInfo() : null;
  return {
    blockTrackers: privacySettings.blockTrackers,
    stripThirdPartyCookies: privacySettings.stripThirdPartyCookies,
    sendDnt: privacySettings.sendDnt,
    spoofUserAgent: privacySettings.spoofUserAgent,
    searchEngine: privacySettings.searchEngine,
    searchBase: SEARCH_ENGINES[privacySettings.searchEngine] || SEARCH_ENGINES.duckduckgo,
    panicShortcut: process.platform === 'darwin' ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
    agentBridge: privacySettings.agentBridge,
    agentBridgeUrl: listen ? `http://${listen.host}:${listen.port}/v1` : '',
    agentBridgeToken: privacySettings.agentBridge ? agentBridgeToken : '',
    ghostNetwork: privacySettings.ghostNetwork,
    proxyUrl: privacySettings.ghostNetwork ? SOCKS5_PROXY : '',
    blockedRequestCount,
    securityStats: snapshotSecurityStats(),
  };
}

function applySpoofedUserAgent() {
  const isolatedSession = getIsolatedSession();
  isolatedSession.setUserAgent(
    privacySettings.spoofUserAgent ? COMMON_USER_AGENT : app.userAgentFallback || COMMON_USER_AGENT,
  );
}

async function runHistory(tabId, direction) {
  const guest = getTabWebContents(tabId);
  if (!guest) {
    return failTab('tab-not-found');
  }
  if (!goHistoryOn(guest, direction)) {
    return { ok: false, error: direction === 'back' ? 'cannot-go-back' : 'cannot-go-forward' };
  }
  if (tabId === activeTabId) {
    broadcastBrowserState();
  }
  return { ok: true, tab: serializeTab(tabId) };
}

const agentBridgeHandlers = {
  health: async () => ({
    ok: true,
    tabs: views.size,
    activeTabId,
    panic: panicInProgress,
  }),
  listTabs: async () => ({
    ok: true,
    tabs: [...views.keys()].map((tabId) => serializeTab(tabId)).filter(Boolean),
  }),
  createTab: async (body, agentId) => {
    const owner = (typeof body?.owner === 'string' && body.owner.trim()) || agentId;
    const activate = body?.activate === true;
    const requested = typeof body?.url === 'string' ? body.url : 'about:blank';
    const tabId = createGuestTab(requested, { activate, owner });
    if (!tabId) {
      return failTab('cannot-create-tab');
    }
    return { ok: true, tab: serializeTab(tabId) };
  },
  getTab: async (tabId) => {
    const tab = serializeTab(tabId);
    return tab ? { ok: true, tab } : failTab('tab-not-found');
  },
  closeTab: async (tabId) => {
    if (!views.has(tabId)) {
      return failTab('tab-not-found');
    }
    destroyTab(tabId);
    return { ok: true, tabId };
  },
  activateTab: async (tabId) => {
    return switchToTab(tabId) ? { ok: true, tab: serializeTab(tabId) } : failTab('tab-not-found');
  },
  navigate: async (tabId, body) => {
    const guest = getTabWebContents(tabId);
    const url = sanitizeUrl(body?.url);
    if (!guest) {
      return failTab('tab-not-found');
    }
    if (!url) {
      return { ok: false, error: 'invalid-url' };
    }
    await guest.loadURL(url);
    return { ok: true, tab: serializeTab(tabId) };
  },
  back: async (tabId) => runHistory(tabId, 'back'),
  forward: async (tabId) => runHistory(tabId, 'forward'),
  reload: async (tabId) => {
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    guest.reload();
    return { ok: true, tab: serializeTab(tabId) };
  },
  text: async (tabId) => {
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const text = await guest.executeJavaScript(
      `(function () {
        try {
          return document.body && document.body.innerText ? document.body.innerText : '';
        } catch {
          return '';
        }
      })()`,
      true,
    );
    return {
      ok: true,
      tabId,
      text: typeof text === 'string' ? text.slice(0, PAGE_TEXT_LIMIT) : '',
    };
  },
  screenshot: async (tabId) => {
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const image = await guest.capturePage();
    return { ok: true, tabId, mime: 'image/png', image: image.toPNG().toString('base64') };
  },
  evaluate: async (tabId, body) => {
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const expression = typeof body?.expression === 'string' ? body.expression : '';
    if (!expression || expression.length > 32000) {
      return { ok: false, error: 'invalid-expression' };
    }
    const result = await guest.executeJavaScript(expression, true);
    let safeResult = null;
    try {
      safeResult = JSON.parse(JSON.stringify(result ?? null));
    } catch {
      safeResult = String(result);
    }
    return { ok: true, tabId, result: safeResult };
  },
  click: async (tabId, body) => {
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const selector = typeof body?.selector === 'string' ? body.selector : '';
    if (!selector || selector.length > 512) {
      return { ok: false, error: 'invalid-selector' };
    }
    const result = await guest.executeJavaScript(
      `(function () {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) { return { ok: false, error: 'not-found' }; }
        el.click();
        return { ok: true };
      })()`,
      true,
    );
    return { ok: Boolean(result?.ok), tabId, ...(result || {}) };
  },
  type: async (tabId, body) => {
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const text = typeof body?.text === 'string' ? body.text : '';
    const selector = typeof body?.selector === 'string' ? body.selector : '';
    if (!text || text.length > 8000) {
      return { ok: false, error: 'invalid-text' };
    }
    const result = await guest.executeJavaScript(
      `(function () {
        const el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.activeElement'};
        if (!el) { return { ok: false, error: 'not-found' }; }
        el.focus();
        if ('value' in el) { el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); }
        else if (el.isContentEditable) { el.textContent = ${JSON.stringify(text)}; }
        return { ok: true };
      })()`,
      true,
    );
    return { ok: Boolean(result?.ok), tabId, ...(result || {}) };
  },
};

async function ensureAgentBridge(enabled) {
  if (!enabled) {
    agentBridgeToken = '';
    await stopAgentBridgeServer();
    return;
  }

  if (!agentBridgeToken) {
    agentBridgeToken = crypto.randomBytes(18).toString('base64url');
  }

  if (getListenInfo()) {
    return;
  }

  let lastError = null;
  for (let offset = 0; offset < 10; offset += 1) {
    try {
      await startAgentBridgeServer({
        host: AGENT_BRIDGE_HOST,
        port: AGENT_BRIDGE_PORT + offset,
        getToken: () => agentBridgeToken,
        handlers: agentBridgeHandlers,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!error || error.code !== 'EADDRINUSE') {
        break;
      }
    }
  }

  privacySettings.agentBridge = false;
  agentBridgeToken = '';
  throw lastError || new Error('Agent bridge could not bind a localhost port.');
}

ipcMain.handle('agent:security-stats', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  return { ok: true, ...snapshotSecurityStats() };
});

ipcMain.handle('agent:settings-get', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  return { ok: true, settings: snapshotSettings() };
});

ipcMain.handle('agent:settings-set', async (event, payload) => {
  if (!isChromeSender(event) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }

  const key = payload.key;
  if (BOOLEAN_SETTINGS.has(key)) {
    privacySettings[key] = Boolean(payload.value);
    if (key === 'spoofUserAgent') {
      applySpoofedUserAgent();
    }
    if (key === 'agentBridge') {
      try {
        await ensureAgentBridge(privacySettings.agentBridge);
      } catch {
        privacySettings.agentBridge = false;
        return { ok: false, error: 'Ajan köprüsü dinlenemedi.', settings: snapshotSettings() };
      }
    }
    if (key === 'ghostNetwork') {
      try {
        await applyGhostNetwork();
      } catch {
        privacySettings.ghostNetwork = false;
        await applyGhostNetwork().catch(() => {});
        return {
          ok: false,
          error: 'SOCKS5 vekil uygulanamadı. 127.0.0.1:1080 dinleniyor mu?',
          settings: snapshotSettings(),
        };
      }
    }
  } else if (key === 'searchEngine' && Object.hasOwn(SEARCH_ENGINES, payload.value)) {
    privacySettings.searchEngine = payload.value;
  } else {
    return { ok: false, settings: snapshotSettings() };
  }

  return { ok: true, settings: snapshotSettings() };
});

ipcMain.handle('agent:settings-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  settingsOpen = Boolean(open);
  fitBrowserView();
  return { ok: true, open: settingsOpen };
});

ipcMain.handle('agent:ai-message', async (event, payload) => {
  if (!isChromeSender(event)) {
    return emitAiResponse({ ok: false, error: 'yetkisiz' });
  }

  const apiKey = readSessionApiKey(payload?.apiKey);
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message || message.length > 8000) {
    return emitAiResponse({ ok: false, error: 'Geçersiz mesaj.' });
  }

  emitAiResponse({ ok: true, type: 'status', content: 'ajan yanıtlıyor' });

  try {
    const content = await requestChat(apiKey, [
      {
        role: 'system',
        content:
          'Sen Agent Browser içinde çalışan gizlilik odaklı bir asistansın. Sohbeti diske yazma. Kısa ve net yanıt ver.',
      },
      { role: 'user', content: message },
    ]);
    return emitAiResponse({ ok: true, type: 'chat', content });
  } catch (error) {
    return emitAiResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'AI isteği başarısız.',
    });
  }
});

ipcMain.on('trigger-panic', (event) => {
  if (!isChromeSender(event)) {
    return;
  }
  triggerExcommunicado();
});

ipcMain.handle('agent:ai-summarize', async (event, payload) => {
  if (!isChromeSender(event)) {
    return emitAiResponse({ ok: false, error: 'yetkisiz' });
  }

  const apiKey = readSessionApiKey(payload?.apiKey);

  emitAiResponse({ ok: true, type: 'status', content: 'sayfa metni okunuyor' });

  let pageText = '';
  try {
    pageText = await extractVisiblePageText();
  } catch {
    return emitAiResponse({ ok: false, error: 'Sayfa metni alınamadı.' });
  }

  if (!pageText) {
    return emitAiResponse({ ok: false, error: 'Özetlenecek görünür metin yok.' });
  }

  try {
    const content = await requestChat(apiKey, [
      { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user', content: pageText },
    ]);
    return emitAiResponse({ ok: true, type: 'summary', content });
  } catch (error) {
    return emitAiResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Özet isteği başarısız.',
    });
  }
});

function printActiveGuest() {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false };
  }
  guest.print({ silent: false });
  return { ok: true };
}

async function clearIsolatedBrowsingData() {
  const isolatedSession = getIsolatedSession();
  await Promise.all([
    isolatedSession.clearStorageData(),
    isolatedSession.clearCache(),
    isolatedSession.clearAuthCache(),
  ]);
  const guest = getGuestWebContents();
  if (guest && !guest.isDestroyed()) {
    guest.reload();
  }
}

function createAgentWindow() {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 800,
    minHeight: 500,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d47a1',
    title: 'Agent Browser',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d47a1',
      symbolColor: '#ffffff',
      height: TAB_STRIP_HEIGHT,
    },
    webPreferences: chromeWebPreferences,
  });

  chromeWindows.add(win);
  const previous = mainWindow;
  mainWindow = win;

  win.on('resize', fitBrowserView);
  win.on('focus', () => {
    if (!win.isDestroyed()) {
      mainWindow = win;
    }
  });
  win.webContents.on('before-input-event', handleAppShortcut);
  win.on('closed', () => {
    if (overflowHostWindow === win) {
      hideOverflowMenu({ notify: false });
    }
    chromeWindows.delete(win);
    for (const [tabId, entry] of [...views.entries()]) {
      if (entry.window === win) {
        destroyTab(tabId, false);
      }
    }
    if (mainWindow === win) {
      mainWindow = previous && !previous.isDestroyed() ? previous : [...chromeWindows][0] || null;
    }
  });

  win
    .loadFile(path.join(__dirname, 'index.html'))
    .then(() => {
      if (!win.isDestroyed()) {
        createGuestTab(DEFAULT_TAB_URL, { window: win });
        win.show();
      }
    })
    .catch((error) => {
      console.error('Failed to open Agent window:', error);
    });

  return win;
}

function createMainWindow() {
  return createAgentWindow();
}

app.on('web-contents-created', (_event, contents) => {
  applyWebRtcPolicyToContents(contents);
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

app.whenReady().then(() => {
  const isolatedSession = getIsolatedSession();
  attachPrivacyNetworkGuards(isolatedSession);
  attachDownloadManager(isolatedSession);
  createMainWindow();
  const registered = globalShortcut.register(PANIC_SHORTCUT, () => {
    triggerExcommunicado();
  });
  if (!registered) {
    console.error('Excommunicado shortcut registration failed:', PANIC_SHORTCUT);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore.
  }
  try {
    stopAgentBridgeServer();
  } catch {
    // Ignore.
  }
  try {
    stopLocalIntelWatch();
  } catch {
    // Ignore.
  }
});

app.on('before-quit', (event) => {
  if (isWipingSession) {
    return;
  }

  event.preventDefault();
  isWipingSession = true;
  purgeSessionChromeState();

  wipeIsolatedSession()
    .catch((error) => {
      console.error('Failed to wipe in-memory session traces:', error);
    })
    .finally(() => {
      app.exit(0);
    });
});
