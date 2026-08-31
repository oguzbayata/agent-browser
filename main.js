'use strict';

const { app, BrowserWindow, WebContentsView, session, ipcMain, globalShortcut, Menu, nativeImage, dialog, clipboard, shell, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const net = require('node:net');
const { startAgentBridgeServer, stopAgentBridgeServer, getListenInfo } = require('./agent-bridge');
const { collectIntel, knownModelRoots, isLoopbackHttpUrl, resolveLocalChatTarget } = require('./local-intel');
const pageTranslate = require('./page-translate');
const { AD_HIDE_CSS, isGooglePropertyUrl, shouldBlockUrl } = require('./tracker-block');
const chromeIdentity = require('./chrome-identity');
const micAccess = require('./mic-access');
const { findFfmpeg, findYtDlp, hunterPathEnv, isWindowsStoreStub } = require('./hunter-tools');
const agentExtensionCatalog = require('./extensions_data');
const catalogTools = require('./session-catalog-tools');
const usefulLinkSeed = require('./useful-links-seed');
const usefulLinksLive = require('./useful-links-live');

if (process.platform === 'win32') {
  app.setAppUserModelId('oguzbayata.agent-browser');
}

function appIconPath() {
  const ico = path.join(__dirname, 'assets', 'agent-browser-logo.ico');
  if (fs.existsSync(ico)) {
    return ico;
  }
  const png = path.join(__dirname, 'assets', 'agent-browser-logo.png');
  return fs.existsSync(png) ? png : undefined;
}

/**
 * In-memory partition only. A `persist:` prefix would write the session to disk.
 * An empty string would fall back to Electron's default (persistent) session.
 */
const PARTITION = 'in-memory-session';
const HIDE_SCROLLBAR_CSS =
  '*{scrollbar-width:none !important;-ms-overflow-style:none !important}' +
  '*::-webkit-scrollbar,*::-webkit-scrollbar-button,*::-webkit-scrollbar-thumb,' +
  '*::-webkit-scrollbar-track,*::-webkit-scrollbar-track-piece,*::-webkit-scrollbar-corner,' +
  '*::-webkit-scrollbar-resizer{display:none !important;width:0 !important;height:0 !important;background:transparent !important}';
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
const DEFAULT_TAB_URL = 'about:blank';
const NEWTAB_PATH = path.join(__dirname, 'newtab.html');
const NEWTAB_FILE_URL = pathToFileURL(NEWTAB_PATH).href;
const SEARCH_PATH = path.join(__dirname, 'search.html');
const SEARCH_FILE_URL = pathToFileURL(SEARCH_PATH).href;
const SEARCH_PRELOAD_PATH = path.join(__dirname, 'search-preload.js');
const DOWNLOADS_PATH = path.join(__dirname, 'downloads.html');
const DOWNLOADS_FILE_URL = pathToFileURL(DOWNLOADS_PATH).href;
const DOWNLOADS_PRELOAD_PATH = path.join(__dirname, 'downloads-preload.js');
const USEFUL_LINKS_PATH = path.join(__dirname, 'useful-links.html');
const USEFUL_LINKS_PRELOAD_PATH = path.join(__dirname, 'useful-links-preload.js');
const USEFUL_LINKS_FILE_URL = pathToFileURL(USEFUL_LINKS_PATH).href;
const EXTENSIONS_PATH = path.join(__dirname, 'extensions.html');
const EXTENSIONS_FILE_URL = pathToFileURL(EXTENSIONS_PATH).href;
const EXTENSIONS_PRELOAD_PATH = path.join(__dirname, 'extensions-preload.js');
const SETTINGS_PATH = path.join(__dirname, 'settings.html');
const SETTINGS_FILE_URL = pathToFileURL(SETTINGS_PATH).href;
const MEMORY_BRIDGE_PATH = path.join(__dirname, 'memory-bridge.html');
const MEMORY_BRIDGE_FILE_URL = pathToFileURL(MEMORY_BRIDGE_PATH).href;
const MEMORY_BRIDGE_PRELOAD_PATH = path.join(__dirname, 'memory-bridge-preload.js');
const SCRAPER_PATH = path.join(__dirname, 'engine', 'scraper.py');
const AGENT_SEARCH_PREFIX = 'agent-search:';
const PYTHON_MISSING_MESSAGE = 'Local Intelligence Agent could not start: Python was not found';
const PANIC_QUIT_MS = 1500;
const PANIC_SHORTCUT = 'CommandOrControl+Shift+E';
const PAGE_TEXT_LIMIT = 80000;
const LOCAL_CHAT_TIMEOUT_MS = 45000;
const CLOUD_CHAT_TIMEOUT_MS = 45000;
const PAGE_TEXT_TIMEOUT_MS = 2500;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const SUMMARIZE_SYSTEM_PROMPT =
  'You are a cyber-intelligence summarizer. Analyze the text below and extract the most important points:';
const SEARCH_ENGINE_LIST = Object.freeze([
  { id: 'duckduckgo', name: 'DuckDuckGo', base: 'https://duckduckgo.com/?q=', icon: 'assets/search-engines/duckduckgo.svg' },
  { id: 'startpage', name: 'Startpage', base: 'https://www.startpage.com/sp/search?query=', icon: 'assets/search-engines/startpage.svg' },
  { id: 'google', name: 'Google', base: 'https://www.google.com/search?q=', icon: 'assets/search-engines/google.svg' },
  { id: 'bing', name: 'Bing', base: 'https://www.bing.com/search?q=', icon: 'assets/search-engines/bing.svg' },
  { id: 'baidu', name: 'Baidu', base: 'https://www.baidu.com/s?wd=', icon: 'assets/search-engines/baidu.svg' },
  { id: 'yandex', name: 'Yandex', base: 'https://yandex.com/search/?text=', icon: 'assets/search-engines/yandex.svg' },
  { id: 'yahoo', name: 'Yahoo', base: 'https://search.yahoo.com/search?p=', icon: 'assets/search-engines/yahoo.svg' },
  { id: 'naver', name: 'Naver', base: 'https://search.naver.com/search.naver?query=', icon: 'assets/search-engines/naver.svg' },
]);
const SEARCH_ENGINES = Object.freeze(
  Object.fromEntries(SEARCH_ENGINE_LIST.map((item) => [item.id, item.base])),
);
const BOOLEAN_SETTINGS = new Set([
  'blockTrackers',
  'stripThirdPartyCookies',
  'sendDnt',
  'spoofUserAgent',
  'agentBridge',
  'ghostNetwork',
  'mediaHunter',
  'blockMedia',
  'canvasPoisoner',
  'siyuanBridge',
  'humanJitter',
  'deadManSwitch',
  'web3Shield',
  'shadowDomPierce',
  'markdownDom',
  'uiCodeExtract',
  'infiniteScroll',
  'tableParser',
  'xhrHunter',
  'jsonFormFill',
  'proxyRotate',
  'webglInspector',
  'mediaSourceReveal',
  'n8nWebhook',
  'lmStudioPort',
  'memoryBlockSync',
  'cursorIdeBridge',
  'tabOrchestrator',
  'headlessMode',
  'inputSimulator',
  'rateLimitGuard',
  'sandboxIsolator',
  'excommunicadoLock',
  ...catalogTools.SETTING_KEYS,
]);
const AGENT_BRIDGE_HOST = '127.0.0.1';
const AGENT_BRIDGE_PORT = 17331;
const AGENT_PORT_FILE = path.join(__dirname, '.agent_port');
const AGENT_API_PORT_FILE = path.join(__dirname, '.agent_api_port');
const AGENT_API_BODY_LIMIT = 1024 * 1024;
const AJAN_LOG = '\x1b[36m[AJAN]\x1b[0m';
const AJAN_WARN = '\x1b[33m[AJAN]\x1b[0m';
const AJAN_ERR = '\x1b[31m[AJAN]\x1b[0m';
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const NETWORK_FILTER = Object.freeze({ urls: ['http://*/*', 'https://*/*'] });
const GHOST_DENIED_PERMISSIONS = new Set(['media', 'geolocation', 'display-capture']);
const MEDIA_DENIED_PERMISSIONS = new Set(['media', 'display-capture', 'speaker-selection']);
const EXTENSION_TOGGLE_IDS = Object.freeze({
  shield: 'blockTrackers',
  ghost: 'ghostNetwork',
  guvenlik: 'blockMedia',
  hunter: 'mediaHunter',
  cookies: 'stripThirdPartyCookies',
  dnt: 'sendDnt',
  ua: 'spoofUserAgent',
  'canvas-poisoner': 'canvasPoisoner',
  'canvas-fingerprint-defender': 'canvasPoisoner',
  'siyuan-bridge': 'siyuanBridge',
  'human-jitter': 'humanJitter',
  'human-jitter-cursor-simulator': 'humanJitter',
  'dead-man-switch': 'deadManSwitch',
  'web3-shield': 'web3Shield',
  'shadow-dom-pierce': 'shadowDomPierce',
  'shadow-dom-piercer': 'shadowDomPierce',
  'markdown-dom': 'markdownDom',
  'page-to-markdown-converter': 'markdownDom',
  'ui-code-extract': 'uiCodeExtract',
  'infinite-scroll': 'infiniteScroll',
  'infinite-scroll-autopilot': 'infiniteScroll',
  'table-parser': 'tableParser',
  'table-to-json-auto-parser': 'tableParser',
  'xhr-hunter': 'xhrHunter',
  'xhr-fetch-payload-catcher': 'xhrHunter',
  'json-form-fill': 'jsonFormFill',
  'proxy-rotate': 'proxyRotate',
  'dynamic-proxy-swapper': 'proxyRotate',
  'webgl-inspector': 'webglInspector',
  'media-source': 'mediaSourceReveal',
  'media-source-blob-revealer': 'mediaSourceReveal',
  'n8n-webhook': 'n8nWebhook',
  'multi-agent-swarm-broadcaster': 'n8nWebhook',
  'lm-studio-port': 'lmStudioPort',
  'memory-block': 'memoryBlockSync',
  'cursor-ide-bridge': 'cursorIdeBridge',
  'tab-orchestrator': 'tabOrchestrator',
  'autonomous-agent-task-queue': 'tabOrchestrator',
  'headless-mode': 'headlessMode',
  'headless-mode-resource-saver': 'headlessMode',
  'input-simulator': 'inputSimulator',
  'rate-limit-guard': 'rateLimitGuard',
  'rate-limit-auto-pauser': 'rateLimitGuard',
  'sandbox-isolator': 'sandboxIsolator',
  'excommunicado-lock': 'excommunicadoLock',
  'user-agent-rotator': 'spoofUserAgent',
  'third-party-cookie-annihilator': 'stripThirdPartyCookies',
  ...catalogTools.TOGGLE_IDS,
});
const EXT_EXPERT_DANGEROUS_IDS = new Set(['dead-man-switch', 'excommunicado-lock']);
const EXT_EXPERT_CATALOG = Object.freeze(
  (Array.isArray(agentExtensionCatalog) ? agentExtensionCatalog : []).map((item) => ({
    id: item.id,
    setting: item.id,
    name: item.name,
  })),
);
const KNOWN_EXTENSION_IDS = new Set(EXT_EXPERT_CATALOG.map((item) => item.id));
const chromeFullVersion = chromeIdentity.chromeFullVersion;
const chromeMajorVersion = chromeIdentity.chromeMajorVersion;
const chromePlatformLabel = chromeIdentity.chromePlatformLabel;
const COMMON_USER_AGENT = chromeIdentity.userAgent();
app.userAgentFallback = COMMON_USER_AGENT;

if (PARTITION.startsWith('persist:') || PARTITION.length === 0) {
  throw new Error('Agent Browser must use a non-persistent in-memory partition.');
}

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

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
  preload: SEARCH_PRELOAD_PATH,
});

const downloadsWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
  preload: DOWNLOADS_PRELOAD_PATH,
});

const extensionsWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
  preload: EXTENSIONS_PRELOAD_PATH,
});

const settingsWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
  preload: path.join(__dirname, 'preload.js'),
});

const memoryBridgeWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
  preload: MEMORY_BRIDGE_PRELOAD_PATH,
});

const usefulLinksWebPreferences = Object.freeze({
  ...sharedSessionPrefs,
  preload: USEFUL_LINKS_PRELOAD_PATH,
});

let mainWindow = null;
const views = new Map();
const scraperChildren = new Set();
const hunterChildren = new Set();
const hunterJobs = new Map();
const imageDownloadWaiters = [];
let expectImageDownload = false;
const IMAGE_MIME_EXT = Object.freeze({
  'image/png': 'png',
  'image/x-png': 'png',
  'image/apng': 'apng',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/svg': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/ico': 'ico',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jxl': 'jxl',
  'image/tiff': 'tiff',
  'image/tif': 'tiff',
  'image/x-tiff': 'tiff',
  'image/jp2': 'jp2',
  'image/jpx': 'jpx',
  'image/vnd.wap.wbmp': 'wbmp',
});
const IMAGE_URL_EXT = /\.(avif|apng|bmp|gif|heic|heif|ico|jfif|jpe|jpeg|jpg|jxl|jp2|png|svg|tif|tiff|webp|wbmp)(?:$|[?#])/i;
let cachedPython = null;
let activeTabId = null;
let nextTabId = 1;
let isWipingSession = false;
let privacyGuardsAttached = false;
const sessionsWithGuards = new WeakSet();
const extraAgentSessions = new Map();
const xhrCaptureLog = [];
const sessionMemoryBlocks = [];
const sessionCodeSnippets = [];
const agentFailCounts = new Map();
const agentSearchEngines = new Map();
const sessionExtensionState = new Map();
const sessionUsefulUserSections = [];
const sessionUsefulExtraLinks = new Map();
let usefulLinksLiveCache = { signature: '', fetchedAt: 0, sections: [], error: '' };
const agentLockedTabs = new Set();
const XHR_CAPTURE_LIMIT = 80;
const N8N_WEBHOOK_URL = 'http://127.0.0.1:5678/webhook/agent-browser';
const PROXY_POOL = Object.freeze([SOCKS5_PROXY]);
let proxyRotateIndex = 0;
let rateLimitPauseUntil = 0;
let sidebarOpen = false;
let settingsOpen = false;
let bookmarksPanelOpen = false;
let downloadsOpen = false;
let menuOpen = false;
let shieldOpen = false;
let siteOpen = false;
let toolsOpen = false;
let utilityOpen = false;
let findOpen = false;
let ramSheetOpen = false;
let panicInProgress = false;
const chromeWindows = new Set();
let overflowMenuView = null;
let overflowMenuReady = Promise.resolve();
let overflowHostWindow = null;
let overflowHostDismiss = null;
let shieldMenuView = null;
let shieldMenuReady = Promise.resolve();
let shieldHostWindow = null;
let shieldHostDismiss = null;
let siteMenuView = null;
let siteMenuReady = Promise.resolve();
let siteHostWindow = null;
let siteHostDismiss = null;
let toolsMenuView = null;
let toolsMenuReady = Promise.resolve();
let toolsHostWindow = null;
let toolsHostDismiss = null;
let shortcutsOpen = false;
let shortcutsMenuView = null;
let shortcutsMenuReady = Promise.resolve();
let shortcutsHostWindow = null;
let shortcutsHostDismiss = null;
let profileOpen = false;
let profileMenuView = null;
let profileMenuReady = Promise.resolve();
let profileHostWindow = null;
let profileHostDismiss = null;
let downloadsMenuView = null;
let downloadsMenuReady = Promise.resolve();
let downloadsHostWindow = null;
let downloadsHostDismiss = null;
const sessionLocalFiles = [];
const sessionLocalDirs = [];
let selectedLocalModel = null;
let lastIntelModels = [];
let lastIntelAgents = [];
const extExpertHistory = [];
let localIntelWatchers = [];
let localIntelTimer = null;
let localIntelBusy = false;
let localIntelPending = false;
let deadManTimer = null;
let deadManGateway = '';
const MEMORY_BRIDGE_CATALOG = Object.freeze([
  {
    id: 'mem0',
    name: 'Mem0',
    hint: 'Mem0 memory API',
    defaultUrl: 'http://127.0.0.1:8888/v1/memories',
    kind: 'http',
  },
  {
    id: 'zep',
    name: 'Zep',
    hint: 'Zep memory server',
    defaultUrl: 'http://127.0.0.1:8000/api/v2/memory',
    kind: 'http',
  },
  {
    id: 'langgraph',
    name: 'LangGraph / LangChain Memory',
    hint: 'LangGraph Studio / checkpoint',
    defaultUrl: 'http://127.0.0.1:2024/memory',
    kind: 'http',
  },
  {
    id: 'siyuan',
    name: 'SiYuan',
    hint: 'SiYuan kernel API',
    defaultUrl: 'http://127.0.0.1:6806/api/block/insertBlock',
    kind: 'http',
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex Memory Modules',
    hint: 'LlamaIndex memory service',
    defaultUrl: 'http://127.0.0.1:8001/memory',
    kind: 'http',
  },
  {
    id: 'motorhead',
    name: 'Motorhead',
    hint: 'Motorhead session memory',
    defaultUrl: 'http://127.0.0.1:8080/sessions',
    kind: 'http',
  },
  {
    id: 'memgpt',
    name: 'MemGPT',
    hint: 'Letta / MemGPT',
    defaultUrl: 'http://127.0.0.1:8283/v1/agents/memory',
    kind: 'http',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    hint: 'Local vault folder',
    defaultUrl: '',
    kind: 'folder',
  },
]);
const memoryBridge = {
  provider: 'siyuan',
  endpoint: 'http://127.0.0.1:6806/api/block/insertBlock',
  token: '',
  vaultPath: '',
};
const privacySettings = {
  blockTrackers: true,
  stripThirdPartyCookies: true,
  sendDnt: true,
  spoofUserAgent: true,
  searchEngine: 'duckduckgo',
  agentBridge: false,
  ghostNetwork: false,
  mediaHunter: false,
  blockMedia: true,
  canvasPoisoner: false,
  siyuanBridge: false,
  humanJitter: false,
  deadManSwitch: false,
  web3Shield: false,
  shadowDomPierce: false,
  markdownDom: false,
  uiCodeExtract: false,
  infiniteScroll: false,
  tableParser: false,
  xhrHunter: false,
  jsonFormFill: false,
  proxyRotate: false,
  webglInspector: false,
  mediaSourceReveal: false,
  n8nWebhook: false,
  lmStudioPort: false,
  memoryBlockSync: false,
  cursorIdeBridge: false,
  tabOrchestrator: false,
  headlessMode: false,
  inputSimulator: false,
  rateLimitGuard: false,
  sandboxIsolator: false,
  excommunicadoLock: false,
  ...catalogTools.defaultSettings(),
};
privacySettings.pageTranslate = true;
global.isDownloaderEnabled = false;
let blockedRequestCount = 0;
const tabSecurityStats = new Map();
const lastSecurityHeaders = new Map();
const tabIdleAt = new Map();
let idleRamTimer = null;

function summarizeSecurityHeaders(headers) {
  const pick = (name) => {
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === name) {
        const value = headers[key];
        return Array.isArray(value) ? String(value[0] || '') : String(value || '');
      }
    }
    return '';
  };
  return {
    csp: Boolean(pick('content-security-policy')),
    hsts: Boolean(pick('strict-transport-security')),
    xfo: Boolean(pick('x-frame-options')),
    referrerPolicy: Boolean(pick('referrer-policy')),
    at: Date.now(),
  };
}
let securityStatsFlush = null;
let agentBridgeToken = '';
let sessionApiKeyValue = '';
let sessionTranslateLang = 'tr';
const sessionMicGrants = new Set();
let osMicAsked = false;
let nativeContextMenuOpen = false;
const translatedWebContents = new WeakSet();
let agentControlKey = '';
let agentCdpPort = 0;
let agentApiPort = 0;
let agentApiServer = null;
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

function tryOrigin(rawUrl) {
  try {
    const origin = new URL(rawUrl).origin;
    return origin && origin !== 'null' ? origin : '';
  } catch {
    return '';
  }
}

function firstPartyPageUrl(details) {
  const contents = details?.webContents;
  const current = contents && !contents.isDestroyed() ? contents.getURL() || '' : '';
  if (isGooglePropertyUrl(current)) {
    return current;
  }
  const referrer = String(details?.referrer || '');
  if (isGooglePropertyUrl(referrer)) {
    return referrer;
  }
  if (details?.resourceType === 'mainFrame' && isGooglePropertyUrl(details?.url)) {
    return details.url;
  }
  return current;
}

function shouldBypassGooglePrivacy(details) {
  return isGooglePropertyUrl(details?.url) || isGooglePropertyUrl(firstPartyPageUrl(details));
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

function applyChromeClientHints(headers) {
  const major = chromeMajorVersion();
  const full = chromeFullVersion();
  const platform = chromePlatformLabel();
  const arch = process.arch === 'arm64' ? '"arm"' : '"x86"';
  setHeader(headers, 'Sec-CH-UA', `"Not)A;Brand";v="8", "Chromium";v="${major}", "Google Chrome";v="${major}"`);
  setHeader(headers, 'Sec-CH-UA-Mobile', '?0');
  setHeader(headers, 'Sec-CH-UA-Platform', `"${platform}"`);
  setHeader(headers, 'Sec-CH-UA-Full-Version', `"${full}"`);
  setHeader(
    headers,
    'Sec-CH-UA-Full-Version-List',
    `"Not)A;Brand";v="10.0.0.4", "Chromium";v="${full}", "Google Chrome";v="${full}"`,
  );
  setHeader(headers, 'Sec-CH-UA-Arch', arch);
  setHeader(headers, 'Sec-CH-UA-Bitness', '"64"');
  setHeader(headers, 'Sec-CH-UA-Model', '""');
  setHeader(headers, 'Sec-CH-UA-WoW64', '?0');
  setHeader(headers, 'Sec-CH-UA-Form-Factors', '"Desktop"');
}

function chromeIdentityPageSource() {
  return chromeIdentity.pageSource();
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

function mediaPermissionBlocked(permission, details) {
  if (privacySettings.ghostNetwork && GHOST_DENIED_PERMISSIONS.has(permission)) {
    return true;
  }
  if (!privacySettings.blockMedia || !MEDIA_DENIED_PERMISSIONS.has(permission)) {
    return false;
  }
  if (permission === 'media' && micAccess.mediaIncludesAudio(details)) {
    return false;
  }
  return true;
}

function applyDisplayMediaBlock(isolatedSession) {
  if (!isolatedSession || typeof isolatedSession.setDisplayMediaRequestHandler !== 'function') {
    return;
  }
  if (privacySettings.blockMedia) {
    isolatedSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({});
    });
    return;
  }
  isolatedSession.setDisplayMediaRequestHandler(null);
}

function applySessionPermissions(isolatedSession) {
  isolatedSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      callback(false);
      return;
    }
    if (mediaPermissionBlocked(permission, details)) {
      callback(false);
      return;
    }
    if (privacySettings.geolocationShift && permission === 'geolocation') {
      callback(false);
      return;
    }
    if (permission === 'media' && micAccess.mediaIncludesAudio(details)) {
      decideMicrophonePermission(contents, details)
        .then((allowed) => callback(allowed))
        .catch(() => callback(false));
      return;
    }
    callback(true);
  });

  isolatedSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      return false;
    }
    if (mediaPermissionBlocked(permission, details)) {
      return false;
    }
    if (privacySettings.geolocationShift && permission === 'geolocation') {
      return false;
    }
    if (permission === 'media' && micAccess.mediaIncludesAudio(details)) {
      const origin = micAccess.originOf(details?.securityOrigin || requestingOrigin || contents?.getURL?.() || '');
      return origin ? sessionMicGrants.has(origin) : false;
    }
    return true;
  });

  applyDisplayMediaBlock(isolatedSession);
}

function hostWindowForContents(contents) {
  if (contents && typeof contents.getOwnerBrowserWindow === 'function') {
    const win = contents.getOwnerBrowserWindow();
    if (win && !win.isDestroyed()) {
      return win;
    }
  }
  for (const entry of views.values()) {
    if (entry.view?.webContents === contents && entry.window && !entry.window.isDestroyed()) {
      return entry.window;
    }
  }
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function tabIdFromWebContents(contents) {
  if (!contents) {
    return '';
  }
  for (const [tabId, entry] of views.entries()) {
    if (entry.view?.webContents === contents) {
      return tabId;
    }
  }
  return '';
}

async function ensureOsMicrophone() {
  if (typeof systemPreferences?.askForMediaAccess !== 'function') {
    return true;
  }
  if (osMicAsked) {
    if (typeof systemPreferences.getMediaAccessStatus === 'function') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      return status === 'granted' || status === 'unknown' || status === 'not-determined';
    }
    return true;
  }
  osMicAsked = true;
  try {
    return Boolean(await systemPreferences.askForMediaAccess('microphone'));
  } catch {
    return true;
  }
}

async function decideMicrophonePermission(contents, details) {
  const origin =
    micAccess.originOf(details?.securityOrigin || '') ||
    micAccess.originOf(contents && !contents.isDestroyed() ? contents.getURL() : '');
  if (!origin || origin === 'null') {
    return false;
  }
  if (sessionMicGrants.has(origin)) {
    return ensureOsMicrophone();
  }
  const osOk = await ensureOsMicrophone();
  if (!osOk) {
    return false;
  }
  const win = hostWindowForContents(contents);
  const host = (() => {
    try {
      return new URL(origin).hostname || origin;
    } catch {
      return origin;
    }
  })();
  const camera = micAccess.mediaIncludesVideo(details);
  const result = await dialog.showMessageBox(win || undefined, {
    type: 'question',
    buttons: ['Block', 'Allow'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
    title: 'Microphone',
    message: camera ? `${host} wants to use your microphone and camera` : `${host} wants to use your microphone`,
    detail: 'Allow for this RAM session only. The address bar shows a mic icon while it is on.',
  });
  if (result.response !== 1) {
    return false;
  }
  sessionMicGrants.add(origin);
  return true;
}

function setTabMicrophone(tabId, active) {
  const entry = views.get(tabId);
  if (!entry) {
    return;
  }
  const next = Boolean(active);
  if (Boolean(entry.microphone) === next) {
    return;
  }
  entry.microphone = next;
  emitTabUpdated(tabId);
  if (tabId === activeTabId) {
    broadcastBrowserState();
  }
}

function stopTabMicrophone(tabId) {
  const webContents = getTabWebContents(tabId);
  if (!webContents) {
    return { ok: false };
  }
  webContents.executeJavaScript(micAccess.pageStopSource(), true).catch(() => {});
  setTabMicrophone(tabId, false);
  return { ok: true };
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

function rememberXhrCapture(entry) {
  xhrCaptureLog.push(entry);
  if (xhrCaptureLog.length > XHR_CAPTURE_LIMIT) {
    xhrCaptureLog.shift();
  }
}

function applyNetworkCompletedHooks(details) {
  const status = Number(details?.statusCode) || 0;
  const url = String(details?.url || '');
  if (privacySettings.xhrHunter && details?.resourceType && details.resourceType !== 'mainFrame') {
    rememberXhrCapture({
      tabId: tabIdFromDetails(details) || '',
      url: url.slice(0, 500),
      status,
      method: details.method || '',
      type: details.resourceType,
      at: Date.now(),
    });
  }
  if (!privacySettings.rateLimitGuard) {
    return;
  }
  const challenge =
    status === 429 ||
    status === 503 ||
    /\/cdn-cgi\/challenge|challenges\.cloudflare|\/recaptcha\//i.test(url);
  if (challenge) {
    rateLimitPauseUntil = Date.now() + 20000;
    emitAgentLocalHook('rate-limit-pause', { url: url.slice(0, 180), status });
  }
}

function attachPrivacyNetworkGuards(isolatedSession) {
  if (sessionsWithGuards.has(isolatedSession)) {
    return;
  }
  sessionsWithGuards.add(isolatedSession);
  privacyGuardsAttached = true;

  isolatedSession.setUserAgent(COMMON_USER_AGENT);
  applySessionPermissions(isolatedSession);
  applyIsolatedSessionWebRtc(isolatedSession);

  isolatedSession.webRequest.onBeforeRequest(NETWORK_FILTER, (details, callback) => {
    const tabId = tabIdFromDetails(details);
    if (
      privacySettings.blockTrackers &&
      shouldBlockUrl(details.url, { pageUrl: firstPartyPageUrl(details) })
    ) {
      bumpSecurityStat(tabId, 'trackers');
      callback({ cancel: true });
      return;
    }

    const catalogHit = shouldBypassGooglePrivacy(details)
      ? null
      : catalogTools.beforeRequest(details, privacySettings);
    if (catalogHit?.cancel) {
      callback({ cancel: true });
      return;
    }
    if (catalogHit?.redirectURL) {
      callback({ redirectURL: catalogHit.redirectURL });
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
      applyChromeClientHints(requestHeaders);
    }
    if (privacySettings.sendDnt && !shouldBypassGooglePrivacy(details)) {
      setHeader(requestHeaders, 'DNT', '1');
    }
    if (privacySettings.referrerStrip && !shouldBypassGooglePrivacy(details)) {
      deleteHeader(requestHeaders, 'Referer');
      deleteHeader(requestHeaders, 'Referrer');
    }
    if (privacySettings.etagCacheClean && !shouldBypassGooglePrivacy(details)) {
      deleteHeader(requestHeaders, 'If-None-Match');
      deleteHeader(requestHeaders, 'If-Modified-Since');
    }

    if (
      privacySettings.stripThirdPartyCookies &&
      isThirdPartyRequest(details) &&
      !shouldBypassGooglePrivacy(details)
    ) {
      if (headerPresent(requestHeaders, 'Cookie')) {
        bumpSecurityStat(tabIdFromDetails(details), 'cookies');
      }
      deleteHeader(requestHeaders, 'Cookie');
    }

    callback({ requestHeaders });
  });

  isolatedSession.webRequest.onHeadersReceived(NETWORK_FILTER, (details, callback) => {
    const headers = details.responseHeaders ? { ...details.responseHeaders } : {};
    if (privacySettings.httpHeaderAnalyze && details.resourceType === 'mainFrame') {
      lastSecurityHeaders.set(tabIdFromDetails(details) || 'session', summarizeSecurityHeaders(headers));
    }
    if (privacySettings.etagCacheClean && headers && !shouldBypassGooglePrivacy(details)) {
      deleteHeader(headers, 'ETag');
      deleteHeader(headers, 'Last-Modified');
    }
    if (
      privacySettings.stripThirdPartyCookies &&
      isThirdPartyRequest(details) &&
      !shouldBypassGooglePrivacy(details) &&
      details.responseHeaders
    ) {
      if (headerPresent(details.responseHeaders, 'Set-Cookie')) {
        bumpSecurityStat(tabIdFromDetails(details), 'cookies');
      }
      callback({
        responseHeaders: stripSetCookieHeaders(privacySettings.etagCacheClean ? headers : details.responseHeaders),
      });
      return;
    }
    if (privacySettings.etagCacheClean) {
      callback({ responseHeaders: headers });
      return;
    }
    callback({});
  });

  isolatedSession.webRequest.onCompleted(NETWORK_FILTER, (details) => {
    applyNetworkCompletedHooks(details);
  });
}

function getIsolatedSession() {
  return session.fromPartition(PARTITION);
}

const FAVICON_MAX_BYTES = 96 * 1024;
const faviconCache = new Map();
const faviconInflight = new Map();
const tabFavicons = new Map();

function pageHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function resolveHttpUrl(raw, base) {
  try {
    const parsed = base ? new URL(raw, base) : new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function iconHrefFromHtml(html, baseUrl) {
  const chunk = String(html || '').slice(0, 120000);
  const tags = chunk.match(/<link\b[^>]*>/gi) || [];
  let fallback = '';
  for (const tag of tags) {
    if (!/\brel\s*=\s*["'][^"']*icon/i.test(tag)) {
      continue;
    }
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!href) {
      continue;
    }
    const abs = resolveHttpUrl(href[1], baseUrl);
    if (!abs) {
      continue;
    }
    if (/apple-touch-icon/i.test(tag)) {
      if (!fallback) {
        fallback = abs;
      }
      continue;
    }
    return abs;
  }
  return fallback;
}

async function readFaviconResponse(response) {
  if (!response || !response.ok) {
    return '';
  }
  const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript')) {
    return '';
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (!buf.length || buf.length > FAVICON_MAX_BYTES) {
    return '';
  }
  const kind = mime.startsWith('image/') ? mime : 'image/x-icon';
  return `data:${kind};base64,${buf.toString('base64')}`;
}

async function fetchFaviconDataUrl(pageUrl, hintUrl) {
  const host = pageHost(pageUrl);
  if (!host) {
    return '';
  }
  if (faviconCache.has(host)) {
    return faviconCache.get(host);
  }
  if (faviconInflight.has(host)) {
    return faviconInflight.get(host);
  }

  const work = (async () => {
    const ses = getIsolatedSession();
    const origin = (() => {
      try {
        return new URL(pageUrl).origin;
      } catch {
        return '';
      }
    })();
    const candidates = [];
    const hint = resolveHttpUrl(hintUrl, pageUrl);
    if (hint) {
      candidates.push(hint);
    }
    if (origin) {
      candidates.push(`${origin}/favicon.ico`, `${origin}/favicon.png`);
    }

    const seen = new Set();
    const tryCandidate = async (candidate) => {
      if (!candidate || seen.has(candidate)) {
        return '';
      }
      seen.add(candidate);
      const res = await ses.fetch(candidate, { method: 'GET', signal: AbortSignal.timeout(7000) });
      return readFaviconResponse(res);
    };

    for (const candidate of candidates) {
      try {
        const dataUrl = await tryCandidate(candidate);
        if (dataUrl) {
          faviconCache.set(host, dataUrl);
          return dataUrl;
        }
      } catch {
        // Try the next well-known path or HTML discovery.
      }
    }

    const safePage = sanitizeUrl(pageUrl);
    if (safePage) {
      try {
        const pageRes = await ses.fetch(safePage, { method: 'GET', signal: AbortSignal.timeout(7000) });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const discovered = iconHrefFromHtml(html, pageRes.url || safePage);
          const dataUrl = await tryCandidate(discovered);
          if (dataUrl) {
            faviconCache.set(host, dataUrl);
            return dataUrl;
          }
        }
      } catch {
        // Leave the host uncached so a later add can retry.
      }
    }

    return '';
  })();

  faviconInflight.set(host, work);
  try {
    return await work;
  } finally {
    faviconInflight.delete(host);
  }
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
    url: displayGuestUrl(url),
    active: tabId === activeTabId,
    owner: entry.owner || null,
    loading: webContents.isLoading(),
    pinned: Boolean(entry.pinned),
    muted: Boolean(webContents.isAudioMuted()),
    audible: Boolean(webContents.isCurrentlyAudible()),
    microphone: Boolean(entry.microphone),
  };
}

function failTab(error) {
  return { ok: false, error };
}

function sendToChrome(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
  if (shieldViewAlive() && !shieldMenuView.webContents.isDestroyed()) {
    shieldMenuView.webContents.send(channel, payload);
  }
  if (siteViewAlive() && !siteMenuView.webContents.isDestroyed()) {
    siteMenuView.webContents.send(channel, payload);
  }
  if (overflowViewAlive() && !overflowMenuView.webContents.isDestroyed()) {
    overflowMenuView.webContents.send(channel, payload);
  }
  if (toolsViewAlive() && !toolsMenuView.webContents.isDestroyed()) {
    toolsMenuView.webContents.send(channel, payload);
  }
}

function sendToKind(kind, channel, payload) {
  for (const entry of views.values()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === kind && webContents && !webContents.isDestroyed()) {
      webContents.send(channel, payload);
    }
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
  if (isStartPage(url) || isSearchFile(url) || isDownloadsFile(url) || isUsefulLinksFile(url) || isExtensionsFile(url) || isSettingsFile(url) || isMemoryBridgeFile(url)) {
    return '';
  }
  return url;
}

function snapshotSiteInfo() {
  const url = currentGuestUrl();
  if (!url) {
    return {
      url: '',
      host: 'no page',
      meta: 'Open a target from the address bar.',
      scheme: 'ram',
    };
  }
  try {
    const parsed = new URL(url);
    const secure = parsed.protocol === 'https:';
    const protocol = parsed.protocol.replace(':', '');
    return {
      url,
      host: parsed.hostname || parsed.href,
      meta: secure ? 'Connection encrypted (HTTPS)' : `${protocol} · not encrypted`,
      scheme: secure ? 'HTTPS' : protocol || 'ram',
    };
  } catch {
    return {
      url,
      host: url,
      meta: 'Address could not be resolved.',
      scheme: 'ram',
    };
  }
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
  killAllScrapers();
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
  faviconCache.clear();
  faviconInflight.clear();
  tabFavicons.clear();
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
  hideShieldMenu({ notify: false });
  if (shieldMenuView) {
    try {
      if (!shieldMenuView.webContents.isDestroyed()) {
        shieldMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    shieldMenuView = null;
    shieldMenuReady = Promise.resolve();
  }
  hideSiteMenu({ notify: false });
  if (siteMenuView) {
    try {
      if (!siteMenuView.webContents.isDestroyed()) {
        siteMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    siteMenuView = null;
    siteMenuReady = Promise.resolve();
  }
  hideToolsMenu({ notify: false });
  if (toolsMenuView) {
    try {
      if (!toolsMenuView.webContents.isDestroyed()) {
        toolsMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    toolsMenuView = null;
    toolsMenuReady = Promise.resolve();
  }
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  if (shortcutsMenuView) {
    try {
      if (!shortcutsMenuView.webContents.isDestroyed()) {
        shortcutsMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    shortcutsMenuView = null;
    shortcutsMenuReady = Promise.resolve();
  }
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  if (profileMenuView) {
    try {
      if (!profileMenuView.webContents.isDestroyed()) {
        profileMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    profileMenuView = null;
    profileMenuReady = Promise.resolve();
  }
  hideDownloadsMenu({ notify: false });
  if (downloadsMenuView) {
    try {
      if (!downloadsMenuView.webContents.isDestroyed()) {
        downloadsMenuView.webContents.close();
      }
    } catch {
      // Wipe still proceeds if the popup view is already gone.
    }
    downloadsMenuView = null;
    downloadsMenuReady = Promise.resolve();
  }
  siteOpen = false;
  toolsOpen = false;
  shortcutsOpen = false;
  profileOpen = false;
  downloadsOpen = false;
  agentSearchEngines.clear();
  sessionExtensionState.clear();
  sessionUsefulUserSections.length = 0;
  sessionUsefulExtraLinks.clear();
  usefulLinksLiveCache = { signature: '', fetchedAt: 0, sections: [], error: '' };
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
  sessionApiKeyValue = '';
  sessionMicGrants.clear();
  sessionMemoryBlocks.length = 0;
  lastIntelModels = [];
  lastIntelAgents = [];
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

function setMediaHunterEnabled(enabled) {
  privacySettings.mediaHunter = Boolean(enabled);
  global.isDownloaderEnabled = privacySettings.mediaHunter;
}

function isYoutubeWatchUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      return parsed.pathname.length > 1;
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host.endsWith('.youtube.com')
    ) {
      return (
        parsed.pathname.includes('/watch') ||
        parsed.pathname.startsWith('/shorts') ||
        parsed.pathname.startsWith('/embed') ||
        parsed.pathname.startsWith('/live')
      );
    }
  } catch {
    return false;
  }
  return false;
}

function isDirectMediaFile(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const pathname = parsed.pathname.toLowerCase();
    return (
      /\.(mp4|webm|mkv|m4v|mov|ogv|m3u8|mpd)(\?|$)/i.test(pathname) ||
      /\/videoplayback(?:\/|$)/i.test(pathname)
    );
  } catch {
    return false;
  }
}

function parseYtDlpProgress(line, record) {
  const percent = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (percent) {
    record.progress = Math.min(1, Number(percent[1]) / 100);
    if (record.total > 0) {
      record.received = Math.round(record.progress * record.total);
    }
  }
  const size = line.match(/\[download\]\s+\d+(?:\.\d+)?%\s+of\s+~?\s*([\d.]+[KMG]i?B)/i);
  if (size && record.total <= 0) {
    record.total = 1;
  }
  const speed = line.match(/\bat\s+(\S+)\s/i);
  if (speed) {
    record.speed = speed[1];
  }
  const destination = line.match(/Destination:\s+(.+)\s*$/);
  if (destination) {
    applyDownloadPath(record, destination[1].trim());
  }
  const merged = line.match(/Merging formats into "(.+)"/);
  if (merged) {
    applyDownloadPath(record, merged[1]);
  }
}

function killHunterProcess(child) {
  if (!child) {
    return;
  }
  hunterChildren.delete(child);
  try {
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    child.removeAllListeners();
  } catch {
    // Ignore listener cleanup errors.
  }
  try {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  } catch {
    // Process may already be gone.
  }
}

function killAllHunters() {
  for (const child of [...hunterChildren]) {
    killHunterProcess(child);
  }
  hunterJobs.clear();
  expectImageDownload = false;
  while (imageDownloadWaiters.length) {
    notifyImageDownloadSettled();
  }
}

function ytDlpCandidates() {
  const list = [];
  const resolved = findYtDlp();
  if (resolved) {
    list.push({ cmd: resolved, prefix: [] });
  }
  list.push({ cmd: 'yt-dlp', prefix: [] });
  const pythons = cachedPython
    ? [cachedPython, ...pythonCandidates().filter((item) => item.cmd !== cachedPython.cmd)]
    : pythonCandidates();
  for (const py of pythons) {
    if (isWindowsStoreStub(py.cmd)) {
      continue;
    }
    list.push({ cmd: py.cmd, prefix: [...py.prefix, '-m', 'yt_dlp'] });
  }
  return list;
}

const DISK_PERSIST_WARNING =
  'Warning: This file was saved to your local disk. The Excommunicado protocol may not delete it.';

function emitDiskWarning() {
  const payload = { message: DISK_PERSIST_WARNING };
  sendToChrome('agent:disk-warning', payload);
  for (const entry of views.values()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'downloads' && webContents && !webContents.isDestroyed()) {
      webContents.send('agent:disk-warning', payload);
    }
  }
}

function translateMenuIcon() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'translate.svg'));
    if (icon && !icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  } catch {
    // Menu still works without an icon.
  }
  try {
    const fallback = nativeImage.createFromPath(path.join(__dirname, 'assets', 'agent-browser-logo.png'));
    if (fallback && !fallback.isEmpty()) {
      return fallback.resize({ width: 16, height: 16 });
    }
  } catch {
    // Menu still works without an icon.
  }
  return undefined;
}

function popupAppMenu(template, webContents) {
  if (!Array.isArray(template) || !template.length) {
    return;
  }
  const win = (webContents && BrowserWindow.fromWebContents(webContents)) || mainWindow;
  nativeContextMenuOpen = true;
  const menu = Menu.buildFromTemplate(template);
  menu.popup({
    window: win && !win.isDestroyed() ? win : undefined,
    callback: () => {
      nativeContextMenuOpen = false;
    },
  });
}

function overlayBlurShouldHide() {
  return !nativeContextMenuOpen;
}

function translateTargetFrom(webContents) {
  if (webContents && !webContents.isDestroyed()) {
    for (const entry of views.values()) {
      if (entry?.view?.webContents === webContents) {
        return webContents;
      }
    }
  }
  return getGuestWebContents();
}

async function runPageTranslate(webContents, langId) {
  const lang = pageTranslate.normalizeLang(langId) || sessionTranslateLang;
  const target = translateTargetFrom(webContents);
  if (!target || target.isDestroyed()) {
    throw new Error('No page to translate.');
  }
  sessionTranslateLang = lang;
  emitChromeToast(`Translating to ${pageTranslate.langLabel(lang)}…`);
  const snapshot = await target.executeJavaScript(pageTranslate.COLLECT_PAGE_SOURCE, true);
  const texts = Array.isArray(snapshot?.texts) ? snapshot.texts : [];
  if (!texts.length) {
    throw new Error('No visible text to translate.');
  }
  const translated = await pageTranslate.translateStrings(texts, lang);
  const applied = await target.executeJavaScript(pageTranslate.applyPageSource(translated), true);
  if (!applied) {
    throw new Error('Could not apply the translation to this page.');
  }
  translatedWebContents.add(target);
  emitChromeToast(`Translated to ${pageTranslate.langLabel(lang)}.`);
}

async function restorePageTranslate(webContents) {
  const target = translateTargetFrom(webContents);
  if (!target || target.isDestroyed()) {
    return;
  }
  await target.executeJavaScript(pageTranslate.RESTORE_PAGE_SOURCE, true).catch(() => false);
  translatedWebContents.delete(target);
  emitChromeToast('Showing original page.');
}

async function runSelectionTranslate(webContents, text, langId) {
  const lang = pageTranslate.normalizeLang(langId) || sessionTranslateLang;
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) {
    throw new Error('No selected text to translate.');
  }
  sessionTranslateLang = lang;
  const translated = await pageTranslate.translatePlainText(source, lang);
  const target = webContents && !webContents.isDestroyed() ? webContents : getGuestWebContents();
  if (target && !target.isDestroyed()) {
    const replaced = await target
      .executeJavaScript(pageTranslate.replaceSelectionSource(translated), true)
      .catch(() => false);
    if (replaced) {
      emitChromeToast(`Translated to ${pageTranslate.langLabel(lang)}.`);
      return;
    }
  }
  clipboard.writeText(translated);
  emitChromeToast('Translation copied.');
}

function translateMenuTemplate(webContents, params = {}) {
  if (!privacySettings.pageTranslate) {
    return [];
  }
  const icon = translateMenuIcon();
  const selection = typeof params.selectionText === 'string' ? params.selectionText.trim() : '';
  const pageItems = pageTranslate.TRANSLATE_LANGS.map((item) => ({
    label: item.label,
    click: () => {
      runPageTranslate(webContents, item.id).catch((error) => {
        emitChromeToast(error instanceof Error ? error.message : 'Translate failed.');
      });
    },
  }));
  const selectionItems = selection
    ? pageTranslate.TRANSLATE_LANGS.map((item) => ({
        label: item.label,
        click: () => {
          runSelectionTranslate(webContents, selection, item.id).catch((error) => {
            emitChromeToast(error instanceof Error ? error.message : 'Translate failed.');
          });
        },
      }))
    : [];
  const submenu = [
    ...pageItems,
    ...(selectionItems.length
      ? [{ type: 'separator' }, { label: 'Selection', enabled: false }, ...selectionItems]
      : []),
    { type: 'separator' },
    {
      label: 'Show original',
      enabled: Boolean(webContents && translatedWebContents.has(translateTargetFrom(webContents))),
      click: () => {
        restorePageTranslate(webContents).catch(() => {});
      },
    },
  ];
  return [
    {
      label: 'Translate',
      ...(icon ? { icon } : {}),
      submenu,
    },
  ];
}

function popupTranslateChooser(webContents) {
  const items = translateMenuTemplate(webContents || getGuestWebContents(), {});
  if (!items.length) {
    emitChromeToast('Turn on Translate in Extensions first.');
    return;
  }
  popupAppMenu(items[0].submenu, webContents || getGuestWebContents());
}

function mediaHunterMenuIcon() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'agent-browser-logo.png'));
    if (icon && !icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  } catch {
    // Menu still works without an icon.
  }
  return undefined;
}

function emitChromeToast(message) {
  const payload = { message: String(message || '') };
  if (!payload.message) {
    return;
  }
  sendToChrome('agent:toast', payload);
  for (const entry of views.values()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'downloads' && webContents && !webContents.isDestroyed()) {
      webContents.send('agent:toast', payload);
    }
  }
}

function startDirectMediaDownload(srcUrl) {
  startDirectUrlDownload(null, srcUrl);
}

function startDirectUrlDownload(webContents, srcUrl) {
  try {
    if (webContents && !webContents.isDestroyed()) {
      webContents.downloadURL(srcUrl);
      return;
    }
    const guest = getGuestWebContents();
    if (guest && !guest.isDestroyed()) {
      guest.downloadURL(srcUrl);
      return;
    }
    getIsolatedSession().downloadURL(srcUrl);
  } catch (error) {
    console.error('Direct download failed:', error);
  }
}

function notifyImageDownloadSettled() {
  const next = imageDownloadWaiters.shift();
  if (typeof next === 'function') {
    next();
  }
}

function looksLikeImageUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return false;
  }
  if (rawUrl.startsWith('data:image/') || rawUrl.startsWith('blob:')) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return IMAGE_URL_EXT.test(parsed.pathname) || IMAGE_URL_EXT.test(parsed.href);
  } catch {
    return false;
  }
}

function extensionFromImageMime(mime) {
  const mapped = IMAGE_MIME_EXT[mime];
  if (mapped) {
    return mapped;
  }
  const subtype = String(mime || '').split('/')[1] || '';
  const token = subtype.split('+')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
  return token || '';
}

function sniffImageExt(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return '';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpg';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'gif';
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'bmp';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand.startsWith('avif') || brand === 'avis') {
      return 'avif';
    }
    if (brand.startsWith('heic') || brand.startsWith('heif') || brand === 'mif1') {
      return 'heic';
    }
  }
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return 'ico';
  }
  const head = buffer.toString('utf8', 0, Math.min(buffer.length, 160)).trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) {
    return 'svg';
  }
  return '';
}

function parseDataImageUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('data:')) {
    return null;
  }
  const match = rawUrl.match(/^data:([^;,]+)?(;[^,]*)?,(.*)$/s);
  if (!match) {
    return null;
  }
  const mime = String(match[1] || '').toLowerCase();
  const params = match[2] || '';
  const payload = match[3] || '';
  if (!payload || payload.length > 12_000_000) {
    return null;
  }
  try {
    const buffer = /;base64/i.test(params)
      ? Buffer.from(payload.replace(/\s/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    if (!buffer.length) {
      return null;
    }
    const ext = (mime.startsWith('image/') ? extensionFromImageMime(mime) : '') || sniffImageExt(buffer);
    if (!ext) {
      return null;
    }
    return { buffer, ext };
  } catch {
    return null;
  }
}

function saveDataImageToDownloads(rawUrl) {
  const parsed = parseDataImageUrl(rawUrl);
  if (!parsed || panicInProgress) {
    return false;
  }
  const filename = `agent_img_${Date.now()}.${parsed.ext}`;
  const savePath = uniqueSavePath(app.getPath('downloads'), filename);
  fs.writeFileSync(savePath, parsed.buffer);
  const record = createHunterRecord(path.basename(savePath), savePath);
  record.state = 'completed';
  record.progress = 1;
  record.received = parsed.buffer.length;
  record.total = parsed.buffer.length;
  record.speed = '';
  revealDownloadsMenu();
  broadcastDownloads();
  emitDiskWarning();
  return true;
}

function downloadHttpImageSerial(webContents, srcUrl) {
  return new Promise((resolve) => {
    let settled = false;
    let waiter = null;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    waiter = () => {
      clearTimeout(timer);
      finish();
    };
    const timer = setTimeout(() => {
      const index = imageDownloadWaiters.indexOf(waiter);
      if (index !== -1) {
        imageDownloadWaiters.splice(index, 1);
      }
      expectImageDownload = false;
      finish();
    }, 90_000);
    imageDownloadWaiters.push(waiter);
    expectImageDownload = true;
    try {
      startDirectUrlDownload(webContents, srcUrl);
    } catch {
      const index = imageDownloadWaiters.indexOf(waiter);
      if (index !== -1) {
        imageDownloadWaiters.splice(index, 1);
      }
      expectImageDownload = false;
      clearTimeout(timer);
      finish();
    }
  });
}

async function resolveBlobImage(webContents, blobUrl) {
  if (!webContents || webContents.isDestroyed() || typeof blobUrl !== 'string') {
    return '';
  }
  try {
    const result = await webContents.executeJavaScript(
      `(async function () {
        const src = ${JSON.stringify(blobUrl)};
        const response = await fetch(src);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('read-failed'));
          reader.readAsDataURL(blob);
        });
      })()`,
      true,
    );
    return typeof result === 'string' ? result : '';
  } catch {
    return '';
  }
}

async function downloadOneImage(webContents, srcUrl) {
  if (panicInProgress || typeof srcUrl !== 'string' || !srcUrl) {
    return;
  }
  if (srcUrl.startsWith('data:image/')) {
    saveDataImageToDownloads(srcUrl);
    await new Promise((resolve) => setImmediate(resolve));
    return;
  }
  if (srcUrl.startsWith('blob:')) {
    const dataUrl = await resolveBlobImage(webContents, srcUrl);
    if (dataUrl.startsWith('data:image/')) {
      saveDataImageToDownloads(dataUrl);
    }
    await new Promise((resolve) => setImmediate(resolve));
    return;
  }
  try {
    const parsed = new URL(srcUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return;
    }
  } catch {
    return;
  }
  await downloadHttpImageSerial(webContents, srcUrl);
}

function isUsableImageSrc(src) {
  return (
    typeof src === 'string' &&
    Boolean(src) &&
    src !== 'about:blank' &&
    (
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('data:') ||
      src.startsWith('blob:')
    )
  );
}

async function findImageAtPoint(webContents, x, y) {
  if (!webContents || webContents.isDestroyed()) {
    return '';
  }
  const px = Number(x) || 0;
  const py = Number(y) || 0;
  try {
    const found = await webContents.executeJavaScript(`(() => {
      const pickUrl = (value) => {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim().replace(/^url\\((['"]?)(.*)\\1\\)$/i, '$2').replace(/^['"]|['"]$/g, '');
        if (!trimmed || trimmed === 'none') return '';
        try { return new URL(trimmed, document.baseURI).href; } catch { return trimmed; }
      };
      const fromImg = (img) => pickUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
      const el = document.elementFromPoint(${px}, ${py});
      if (!el) return '';
      if (el.tagName === 'IMG' || el.tagName === 'IMAGE') return fromImg(el);
      if (el.tagName === 'SOURCE' && el.parentElement && el.parentElement.tagName === 'PICTURE') {
        const img = el.parentElement.querySelector('img');
        if (img) return fromImg(img);
      }
      if (el.tagName === 'CANVAS') {
        try { return el.toDataURL('image/png'); } catch { return ''; }
      }
      const svg = el.closest && el.closest('svg');
      if (svg) {
        try {
          const xml = new XMLSerializer().serializeToString(svg);
          return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        } catch { return ''; }
      }
      const picture = el.closest && el.closest('picture');
      if (picture) {
        const img = picture.querySelector('img');
        if (img) return fromImg(img);
      }
      const video = el.tagName === 'VIDEO' ? el : (el.closest && el.closest('video'));
      if (video && video.poster) return pickUrl(video.poster);
      let node = el;
      for (let i = 0; i < 6 && node; i += 1) {
        const style = getComputedStyle(node);
        const bg = pickUrl(style.backgroundImage);
        if (bg) return bg;
        const srcset = node.getAttribute && node.getAttribute('srcset');
        if (srcset) {
          const first = srcset.split(',')[0].trim().split(/\\s+/)[0];
          const resolved = pickUrl(first);
          if (resolved) return resolved;
        }
        node = node.parentElement;
      }
      return '';
    })()`, true);
    return typeof found === 'string' ? found : '';
  } catch (error) {
    console.error('findImageAtPoint failed:', error);
    return '';
  }
}

async function downloadContextImage(webContents, params) {
  let src = params.srcURL || params.linkURL || '';
  if (!isUsableImageSrc(src) || (params.mediaType === 'canvas' && !src.startsWith('data:'))) {
    const found = await findImageAtPoint(webContents, params.x, params.y);
    if (found) {
      src = found;
    }
  }
  startImageDownload(webContents, src);
}

function startImageDownload(webContents, srcUrl) {
  if (panicInProgress || typeof srcUrl !== 'string' || !srcUrl) {
    return;
  }
  if (srcUrl.startsWith('data:')) {
    try {
      saveDataImageToDownloads(srcUrl);
    } catch (error) {
      console.error('Base64 image save failed:', error);
    }
    return;
  }
  if (srcUrl.startsWith('blob:')) {
    resolveBlobImage(webContents, srcUrl).then((dataUrl) => {
      if (dataUrl.startsWith('data:')) {
        saveDataImageToDownloads(dataUrl);
      }
    }).catch((error) => {
      console.error('Blob image save failed:', error);
    });
    return;
  }
  try {
    const parsed = new URL(srcUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return;
    }
  } catch {
    return;
  }
  startDirectUrlDownload(webContents, srcUrl);
}

async function agentCollectPageImages() {
  const MIN = 150;
  const MAX = 80;
  const seen = new Set();
  const raw = [];

  function resolveUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    if (!trimmed || trimmed === 'none') {
      return '';
    }
    try {
      return new URL(trimmed, document.baseURI).href;
    } catch {
      return trimmed;
    }
  }

  function isAllowed(src) {
    return (
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('data:image/') ||
      src.startsWith('blob:')
    );
  }

  function add(src) {
    const resolved = resolveUrl(src);
    if (!resolved || seen.has(resolved) || !isAllowed(resolved)) {
      return;
    }
    if (resolved.startsWith('data:image/') && resolved.length > 6_000_000) {
      return;
    }
    seen.add(resolved);
    raw.push(resolved);
  }

  function isLarge(width, height) {
    return Number(width) >= MIN && Number(height) >= MIN;
  }

  function extractBackgroundUrls(value) {
    if (typeof value !== 'string' || value === 'none') {
      return;
    }
    const matches = value.match(/url\(([^)]+)\)/gi) || [];
    for (const match of matches) {
      add(match.replace(/^url\(/i, '').replace(/\)$/, ''));
    }
  }

  for (const img of document.images) {
    const width = img.naturalWidth || img.width || img.clientWidth;
    const height = img.naturalHeight || img.height || img.clientHeight;
    if (!isLarge(width, height)) {
      continue;
    }
    add(img.currentSrc || img.src);
  }

  const nodes = document.querySelectorAll('body, body *');
  for (const node of nodes) {
    const style = window.getComputedStyle(node);
    const box = node.getBoundingClientRect();
    const width = Math.max(box.width, node.clientWidth || 0);
    const height = Math.max(box.height, node.clientHeight || 0);
    if (!isLarge(width, height)) {
      continue;
    }
    extractBackgroundUrls(style.backgroundImage);
  }

  const converted = [];
  for (const src of raw) {
    if (converted.length >= MAX) {
      break;
    }
    if (!src.startsWith('blob:')) {
      converted.push(src);
      continue;
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsDataURL(blob);
      });
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') && dataUrl.length <= 6_000_000) {
        converted.push(dataUrl);
      }
    } catch {
      // Skip blobs the page will not yield.
    }
  }
  return converted;
}

const IMAGE_SCRAPE_SOURCE = `(${agentCollectPageImages.toString()})()`;

async function scrapePageImages(webContents) {
  if (!webContents || webContents.isDestroyed() || panicInProgress) {
    return;
  }
  let sources = [];
  try {
    const result = await webContents.executeJavaScript(IMAGE_SCRAPE_SOURCE, true);
    sources = Array.isArray(result) ? result.filter((item) => typeof item === 'string') : [];
  } catch (error) {
    console.error('Image scrape failed:', error);
    sources = [];
  }
  emitChromeToast(`Scraping images: ${sources.length} found`);
  if (!sources.length) {
    return;
  }
  revealDownloadsMenu();
  for (const src of sources) {
    if (panicInProgress || webContents.isDestroyed()) {
      break;
    }
    try {
      await downloadOneImage(webContents, src);
    } catch (error) {
      console.error('Image download failed:', error);
    }
  }
}

const DOWNLOAD_IMAGE_EXTS = new Set([
  '.apng', '.avif', '.bmp', '.gif', '.heic', '.heif', '.ico', '.jfif', '.jpe', '.jpeg',
  '.jpg', '.jxl', '.jp2', '.png', '.svg', '.tif', '.tiff', '.webp', '.wbmp',
]);
const DOWNLOAD_VIDEO_EXTS = new Set([
  '.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.ogv', '.webm', '.wmv',
]);

function applyDownloadPath(record, filePath) {
  if (!record || typeof filePath !== 'string') {
    return;
  }
  const trimmed = filePath.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) {
    return;
  }
  const resolved = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.join(app.getPath('downloads'), trimmed);
  record.savePath = resolved;
  record.filename = path.basename(resolved);
}

function downloadOpenKind(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (DOWNLOAD_IMAGE_EXTS.has(ext)) {
    return 'image';
  }
  if (DOWNLOAD_VIDEO_EXTS.has(ext)) {
    return 'video';
  }
  if (ext === '.pdf') {
    return 'pdf';
  }
  return 'file';
}

function isPathInsideDownloads(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    return false;
  }
  const root = path.resolve(app.getPath('downloads'));
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function createHunterRecord(filename, savePath) {
  const id = String(nextDownloadId);
  nextDownloadId += 1;
  const record = {
    id,
    filename,
    savePath: '',
    received: 0,
    total: 0,
    progress: 0,
    speed: '',
    state: 'progressing',
  };
  if (savePath) {
    applyDownloadPath(record, savePath);
  }
  sessionDownloads.set(id, record);
  return record;
}

function spawnYtDlpDownload(pageUrl, record, savePath) {
  const ffmpegPath = findFfmpeg();
  const env = {
    ...process.env,
    PATH: hunterPathEnv(ffmpegPath),
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  function buildArgs(simple) {
    const args = [
      '--no-playlist',
      '--newline',
      '--no-warnings',
      '-o',
      savePath,
      '--user-agent',
      COMMON_USER_AGENT,
    ];
    if (ffmpegPath) {
      args.unshift('--ffmpeg-location', ffmpegPath);
    }
    if (privacySettings.ghostNetwork) {
      args.unshift('--proxy', SOCKS5_PROXY);
    }
    if (simple) {
      args.push('-f', 'b/best');
    } else {
      args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
    }
    args.push(pageUrl);
    return args;
  }

  const tryCandidate = (index, simple) => {
    const candidates = ytDlpCandidates();
    if (index >= candidates.length) {
      return downloadWithYtdlCore(pageUrl, record, savePath);
    }
    const candidate = candidates[index];
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(candidate.cmd, [...candidate.prefix, ...buildArgs(simple)], {
          cwd: app.getPath('downloads'),
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        resolve(tryCandidate(index + 1, false));
        return;
      }

      hunterChildren.add(child);
      hunterJobs.set(record.id, child);
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      let stderr = '';
      const onLine = (chunk) => {
        const text = String(chunk);
        stderr += text;
        if (stderr.length > 80_000) {
          stderr = stderr.slice(-80_000);
        }
        const current = sessionDownloads.get(record.id);
        if (!current || current.state !== 'progressing') {
          return;
        }
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) {
            parseYtDlpProgress(line, current);
          }
        }
        broadcastDownloads();
      };
      child.stdout?.on('data', onLine);
      child.stderr?.on('data', onLine);
      child.on('error', (error) => {
        hunterJobs.delete(record.id);
        killHunterProcess(child);
        if (error && error.code === 'ENOENT') {
          resolve(tryCandidate(index + 1, false));
          return;
        }
        currentFail(record, 'interrupted', error?.message);
        resolve(false);
      });
      child.on('close', (code) => {
        hunterJobs.delete(record.id);
        hunterChildren.delete(child);
        const current = sessionDownloads.get(record.id);
        if (!current) {
          resolve(false);
          return;
        }
        if (current.state === 'cancelled') {
          resolve(false);
          return;
        }
        if (code === 0) {
          const output = hunterOutputFile(savePath);
          if (output) {
            current.state = 'completed';
            current.progress = 1;
            current.speed = '';
            current.error = '';
            applyDownloadPath(current, output);
            current.received = fs.statSync(output).size;
            current.total = current.received;
            broadcastDownloads();
            emitDiskWarning();
            resolve(true);
            return;
          }
        }
        if (/No module named|not recognized|not found|ENOENT/i.test(stderr)) {
          resolve(tryCandidate(index + 1, false));
          return;
        }
        if (!simple) {
          resolve(tryCandidate(index, true));
          return;
        }
        currentFail(record, 'interrupted', hunterFailMessage(stderr));
        resolve(false);
      });
    });
  };

  return tryCandidate(0, false);
}

function hunterOutputFile(savePath) {
  if (fs.existsSync(savePath)) {
    try {
      if (fs.statSync(savePath).size > 0) {
        return savePath;
      }
    } catch {
      return '';
    }
  }
  const dir = path.dirname(savePath);
  const stem = path.basename(savePath, path.extname(savePath));
  try {
    const match = fs.readdirSync(dir).find((name) => {
      if (name.endsWith('.part') || name.endsWith('.ytdl')) {
        return false;
      }
      return name === path.basename(savePath) || name.startsWith(`${stem}.`);
    });
    if (!match) {
      return '';
    }
    const full = path.join(dir, match);
    return fs.statSync(full).size > 0 ? full : '';
  } catch {
    return '';
  }
}

function hunterFailMessage(stderr) {
  const text = String(stderr || '').trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const useful = [...lines].reverse().find((line) => /error|ffmpeg|unavailable|denied|bot|sign in/i.test(line));
  return (useful || lines[lines.length - 1] || 'Video indirilemedi').slice(0, 240);
}

function currentFail(record, state, message) {
  const current = sessionDownloads.get(record.id);
  if (!current || current.state === 'cancelled') {
    return;
  }
  current.state = state;
  current.speed = '';
  if (message) {
    current.error = String(message).slice(0, 240);
  }
  broadcastDownloads();
}

async function downloadWithYtdlCore(pageUrl, record, savePath) {
  let ytdl;
  try {
    ytdl = require('@distube/ytdl-core');
  } catch {
    currentFail(record, 'interrupted', 'YouTube fallback downloader could not load. yt-dlp must be installed.');
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      hunterJobs.delete(record.id);
      resolve(ok);
    };
    try {
      const stream = ytdl(pageUrl, { quality: 'highest' });
      hunterJobs.set(record.id, stream);
      stream.on('progress', (_chunk, downloaded, total) => {
        const current = sessionDownloads.get(record.id);
        if (!current || current.state !== 'progressing') {
          return;
        }
        current.received = downloaded;
        current.total = total || current.total;
        current.progress = total > 0 ? downloaded / total : current.progress;
        broadcastDownloads();
      });
      stream.on('error', (error) => {
        currentFail(record, 'interrupted', error?.message || 'The video stream was interrupted.');
        finish(false);
      });
      const out = fs.createWriteStream(savePath);
      stream.pipe(out);
      out.on('finish', () => {
        const current = sessionDownloads.get(record.id);
        if (current && current.state !== 'cancelled') {
          current.state = 'completed';
          current.progress = 1;
          applyDownloadPath(current, savePath);
          current.speed = '';
          broadcastDownloads();
          emitDiskWarning();
        }
        finish(true);
      });
      out.on('error', () => {
        currentFail(record, 'interrupted');
        finish(false);
      });
    } catch (error) {
      currentFail(record, 'interrupted', error?.message || 'Video indirilemedi.');
      finish(false);
    }
  });
}

function startMediaHunterDownload(pageUrl, srcUrl) {
  if (!global.isDownloaderEnabled || panicInProgress) {
    return;
  }
  const page = typeof pageUrl === 'string' ? pageUrl : '';
  const src = typeof srcUrl === 'string' ? srcUrl : '';
  const extractUrl = /^https?:/i.test(page) ? page : /^https?:/i.test(src) ? src : '';
  if (!extractUrl) {
    emitChromeToast('No video source found.');
    return;
  }
  if (isDirectMediaFile(extractUrl) && !isYoutubeWatchUrl(extractUrl) && !/^https?:/i.test(page)) {
    startDirectMediaDownload(extractUrl);
    return;
  }

  const savePath = uniqueSavePath(app.getPath('downloads'), 'agent-video.mp4');
  const record = createHunterRecord(path.basename(savePath), savePath);
  revealDownloadsMenu();
  broadcastDownloads();
  spawnYtDlpDownload(extractUrl, record, savePath).catch((error) => {
    currentFail(record, 'interrupted', error?.message);
  });
}

function serializeDownload(record) {
  const progress =
    record.total > 0
      ? Math.min(1, record.received / record.total)
      : typeof record.progress === 'number'
        ? Math.min(1, Math.max(0, record.progress))
        : 0;
  const savePath = typeof record.savePath === 'string' ? record.savePath : '';
  const kind = downloadOpenKind(record.filename);
  return {
    id: record.id,
    filename: record.filename,
    path: savePath,
    kind,
    canOpen: record.state === 'completed' && Boolean(savePath),
    received: record.received,
    total: record.total,
    state: record.state,
    progress,
    speed: typeof record.speed === 'string' ? record.speed : '',
    error: typeof record.error === 'string' ? record.error : '',
    diskPersist: true,
  };
}

function broadcastDownloads() {
  const payload = {
    items: [...sessionDownloads.values()].map(serializeDownload),
  };
  sendToChrome('agent:downloads', payload);
  if (downloadsViewAlive() && !downloadsMenuView.webContents.isDestroyed()) {
    downloadsMenuView.webContents.send('agent:downloads', payload);
  }
  for (const entry of views.values()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'downloads' && webContents && !webContents.isDestroyed()) {
      webContents.send('agent:downloads', payload);
    }
  }
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
      savePath,
      received: 0,
      total: item.getTotalBytes() || 0,
      state: 'progressing',
      imageHunter: expectImageDownload,
    };
    if (expectImageDownload) {
      expectImageDownload = false;
    }
    sessionDownloads.set(id, record);
    activeDownloadItems.set(id, item);
    revealDownloadsMenu();
    broadcastDownloads();

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
      const finalPath = typeof item.getSavePath === 'function' ? item.getSavePath() : '';
      if (finalPath) {
        applyDownloadPath(record, finalPath);
      }
      activeDownloadItems.delete(id);
      broadcastDownloads();
      if (record.imageHunter) {
        notifyImageDownloadSettled();
      }
      if (state === 'completed') {
        emitDiskWarning();
      }
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
    const pageUrl = webContents.getURL();
    const showDownloadImage =
      hasImage ||
      params.mediaType === 'canvas' ||
      looksLikeImageUrl(params.srcURL) ||
      looksLikeImageUrl(params.linkURL);
    const showMediaHunter =
      Boolean(global.isDownloaderEnabled) &&
      (params.mediaType === 'video' || isYoutubeWatchUrl(pageUrl));

    const template = [];
    if (showDownloadImage && privacySettings.reverseImage) {
      const imageUrl = params.srcURL || params.linkURL || '';
      template.push(
        {
          label: 'Reverse image search',
          click: () => {
            if (!imageUrl) {
              return;
            }
            createGuestTab(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`);
            createGuestTab(`https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`);
            createGuestTab(`https://tineye.com/search?url=${encodeURIComponent(imageUrl)}`);
          },
        },
        { type: 'separator' },
      );
    }
    if (privacySettings.base64Decode && params.selectionText) {
      template.push({
        label: 'Decode selection',
        click: () => {
          webContents
            .executeJavaScript(
              `typeof window.__agentDecode === 'function' ? window.__agentDecode(${JSON.stringify(params.selectionText)}) : null`,
              true,
            )
            .then((result) => {
              if (result && result.value) {
                clipboard.writeText(String(result.value));
              }
            })
            .catch(() => {});
        },
      });
    }
    if (showDownloadImage) {
      template.push(
        {
          label: 'Download image',
          click: () => {
            downloadContextImage(webContents, params).catch((error) => {
              console.error('Image download failed:', error);
            });
          },
        },
        {
          label: 'Grab all images on this page',
          click: () => {
            scrapePageImages(webContents).catch((error) => {
              console.error('Bulk image scrape failed:', error);
            });
          },
        },
        { type: 'separator' },
      );
    }
    if (showMediaHunter) {
      const hunterIcon = mediaHunterMenuIcon();
      template.push(
        {
          label: '[Agent] Download this video',
          ...(hunterIcon ? { icon: hunterIcon } : {}),
          click: () => {
            startMediaHunterDownload(pageUrl, params.srcURL || params.linkURL || '');
          },
        },
        { type: 'separator' },
      );
    }
    template.push(
      {
        label: 'Back',
        enabled: flags.canGoBack,
        click: () => {
          if (goHistoryOn(webContents, 'back') && webContents === getGuestWebContents()) {
            broadcastBrowserState();
          }
        },
      },
      {
        label: 'Forward',
        enabled: flags.canGoForward,
        click: () => {
          if (goHistoryOn(webContents, 'forward') && webContents === getGuestWebContents()) {
            broadcastBrowserState();
          }
        },
      },
      {
        label: 'Reload',
        click: () => webContents.reload(),
      },
      { type: 'separator' },
      {
        label: 'Copy',
        enabled: canCopy,
        click: () => webContents.copy(),
      },
      {
        label: 'Paste',
        enabled: canPaste,
        click: () => webContents.paste(),
      },
      {
        label: 'Copy image',
        visible: hasImage,
        click: () => webContents.copyImageAt(params.x, params.y),
      },
      { type: 'separator' },
      {
        label: 'Print',
        click: () => printWebContents(webContents, params),
      },
    );
    const translateItems = translateMenuTemplate(webContents, params);
    if (translateItems.length) {
      template.push({ type: 'separator' }, ...translateItems);
    }
    template.push(
      { type: 'separator' },
      {
        label: 'Inspect',
        click: () => webContents.inspectElement(params.x, params.y),
      },
    );

    popupAppMenu(template, webContents);
  });
}

function installHiddenEditMenu() {
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut', accelerator: 'CommandOrControl+X' },
        { role: 'copy', label: 'Copy', accelerator: 'CommandOrControl+C' },
        { role: 'paste', label: 'Paste', accelerator: 'CommandOrControl+V' },
        { role: 'selectAll', label: 'Select all', accelerator: 'CommandOrControl+A' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachChromeContextMenu(webContents) {
  webContents.on('context-menu', (_event, params) => {
    if (!webContents || webContents.isDestroyed() || panicInProgress) {
      return;
    }

    const editable = Boolean(params.isEditable);
    const hasSelection = Boolean(params.selectionText && String(params.selectionText).trim());
    const flags = params.editFlags || {};
    const template = [];
    if (editable) {
      template.push(
        { label: 'Cut', role: 'cut', enabled: Boolean(flags.canCut) && hasSelection },
        { label: 'Copy', role: 'copy', enabled: Boolean(flags.canCopy) && hasSelection },
        { label: 'Paste', role: 'paste', enabled: flags.canPaste !== false },
        { type: 'separator' },
        { label: 'Select all', role: 'selectAll', enabled: flags.canSelectAll !== false },
      );
    } else if (hasSelection) {
      template.push({ label: 'Copy', role: 'copy', enabled: true });
    } else {
      template.push(
        { label: 'Copy', role: 'copy', enabled: Boolean(flags.canCopy) },
        { label: 'Paste', role: 'paste', enabled: Boolean(flags.canPaste) },
        { label: 'Select all', role: 'selectAll', enabled: flags.canSelectAll !== false },
      );
    }
    const translateItems = translateMenuTemplate(getGuestWebContents() || webContents, params);
    if (translateItems.length) {
      template.push({ type: 'separator' }, ...translateItems);
    }
    popupAppMenu(template, webContents);
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
      label: 'Close tab',
      click: () => destroyTab(tabId),
    },
    {
      label: 'Close others',
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
      label: muted ? 'Unmute' : 'Mute',
      click: () => {
        guest.setAudioMuted(!guest.isAudioMuted());
        emitTabUpdated(tabId);
      },
    },
    {
      label: pinned ? 'Unpin' : 'Pin',
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
  const extra = utilityOpen ? SHIELD_POPUP_HEIGHT : 0;
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
      raiseShieldMenu();
      raiseSiteMenu();
      raiseToolsMenu();
      raiseShortcutsMenu();
      raiseProfileMenu();
      return;
    } catch {
      // WebContentsView is not a BrowserView; fall through.
    }
  }

  mainWindow.contentView.addChildView(view);
  raiseOverflowMenu();
  raiseShieldMenu();
  raiseSiteMenu();
  raiseToolsMenu();
  raiseShortcutsMenu();
  raiseProfileMenu();
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

function isSearchFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.toLowerCase().endsWith('/search.html') || parsed.href.split('?')[0] === SEARCH_FILE_URL) {
      const filePath = fileUrlToPath(parsed.href);
      if (filePath && filePath.toLowerCase() === path.normalize(SEARCH_PATH).toLowerCase()) {
        return true;
      }
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(SEARCH_PATH).toLowerCase();
}

function isDownloadsFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.toLowerCase().endsWith('/downloads.html') || parsed.href.split('?')[0] === DOWNLOADS_FILE_URL) {
      const filePath = fileUrlToPath(parsed.href);
      if (filePath && filePath.toLowerCase() === path.normalize(DOWNLOADS_PATH).toLowerCase()) {
        return true;
      }
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(DOWNLOADS_PATH).toLowerCase();
}

function isUsefulLinksFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.toLowerCase().endsWith('/useful-links.html') || parsed.href.split('?')[0] === USEFUL_LINKS_FILE_URL) {
      const filePath = fileUrlToPath(parsed.href);
      if (filePath && filePath.toLowerCase() === path.normalize(USEFUL_LINKS_PATH).toLowerCase()) {
        return true;
      }
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(USEFUL_LINKS_PATH).toLowerCase();
}

function isExtensionsFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.toLowerCase().endsWith('/extensions.html') || parsed.href.split('?')[0] === EXTENSIONS_FILE_URL) {
      const filePath = fileUrlToPath(parsed.href);
      if (filePath && filePath.toLowerCase() === path.normalize(EXTENSIONS_PATH).toLowerCase()) {
        return true;
      }
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(EXTENSIONS_PATH).toLowerCase();
}

function isSettingsFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.toLowerCase().endsWith('/settings.html') || parsed.href.split('?')[0] === SETTINGS_FILE_URL) {
      const filePath = fileUrlToPath(parsed.href);
      if (filePath && filePath.toLowerCase() === path.normalize(SETTINGS_PATH).toLowerCase()) {
        return true;
      }
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(SETTINGS_PATH).toLowerCase();
}

function isMemoryBridgeFile(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.toLowerCase().endsWith('/memory-bridge.html') || parsed.href.split('?')[0] === MEMORY_BRIDGE_FILE_URL) {
      const filePath = fileUrlToPath(parsed.href);
      if (filePath && filePath.toLowerCase() === path.normalize(MEMORY_BRIDGE_PATH).toLowerCase()) {
        return true;
      }
    }
  } catch {
    // Compare by filesystem path below.
  }

  const filePath = fileUrlToPath(rawUrl);
  return Boolean(filePath) && filePath.toLowerCase() === path.normalize(MEMORY_BRIDGE_PATH).toLowerCase();
}

function searchQueryFromUrl(rawUrl) {
  try {
    return String(new URL(rawUrl).searchParams.get('q') || '').trim().slice(0, 500);
  } catch {
    return '';
  }
}

function parseAgentSearchTarget(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  if (!value.startsWith(AGENT_SEARCH_PREFIX)) {
    return isSearchFile(value) ? searchQueryFromUrl(value) : null;
  }
  try {
    return decodeURIComponent(value.slice(AGENT_SEARCH_PREFIX.length)).trim().slice(0, 500);
  } catch {
    return value.slice(AGENT_SEARCH_PREFIX.length).trim().slice(0, 500);
  }
}

function normalizeSearchEngineId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return Object.hasOwn(SEARCH_ENGINES, id) ? id : '';
}

function searchEngineIdForAgent(agentId) {
  const owned = agentId ? normalizeSearchEngineId(agentSearchEngines.get(agentId)) : '';
  return owned || normalizeSearchEngineId(privacySettings.searchEngine) || 'duckduckgo';
}

function searchUrlFor(query, engineId) {
  const q = String(query || '').trim().slice(0, 500);
  if (!q) {
    return '';
  }
  const id = normalizeSearchEngineId(engineId) || searchEngineIdForAgent('');
  const base = SEARCH_ENGINES[id] || SEARCH_ENGINES.duckduckgo;
  return `${base}${encodeURIComponent(q)}`;
}

function snapshotSearchSettings(agentId) {
  const sessionEngine = normalizeSearchEngineId(privacySettings.searchEngine) || 'duckduckgo';
  const agentEngine = agentId ? normalizeSearchEngineId(agentSearchEngines.get(agentId)) : '';
  const active = agentEngine || sessionEngine;
  return {
    searchEngine: active,
    sessionSearchEngine: sessionEngine,
    agentSearchEngine: agentEngine || null,
    searchBase: SEARCH_ENGINES[active] || SEARCH_ENGINES.duckduckgo,
    searchEngines: SEARCH_ENGINE_LIST.map((item) => ({ id: item.id, name: item.name, base: item.base, icon: item.icon })),
  };
}

function displayGuestUrl(rawUrl) {
  if (isStartPage(rawUrl)) {
    return '';
  }
  if (isSearchFile(rawUrl)) {
    return searchQueryFromUrl(rawUrl);
  }
  if (isDownloadsFile(rawUrl)) {
    return '';
  }
  if (isUsefulLinksFile(rawUrl)) {
    return '';
  }
  if (isExtensionsFile(rawUrl)) {
    return '';
  }
  if (isSettingsFile(rawUrl)) {
    return '';
  }
  if (isMemoryBridgeFile(rawUrl)) {
    return '';
  }
  return rawUrl;
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
  return rawUrl === 'about:blank' || isNewTabFile(rawUrl) || isSearchFile(rawUrl) || isDownloadsFile(rawUrl) || isUsefulLinksFile(rawUrl) || isExtensionsFile(rawUrl) || isSettingsFile(rawUrl) || isMemoryBridgeFile(rawUrl) || Boolean(sanitizeUrl(rawUrl));
}

function loadStartPage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  webContents.loadFile(NEWTAB_PATH);
}

function loadSearchPage(webContents, query) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  const q = String(query || '').trim().slice(0, 500);
  return webContents.loadFile(SEARCH_PATH, { query: { q } });
}

function loadDownloadsPage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  return webContents.loadFile(DOWNLOADS_PATH);
}

function loadUsefulLinksPage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  return webContents.loadFile(USEFUL_LINKS_PATH);
}

function loadExtensionsPage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  return webContents.loadFile(EXTENSIONS_PATH);
}

function loadSettingsPage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  return webContents.loadFile(SETTINGS_PATH);
}

function findSettingsTabId() {
  for (const [tabId, entry] of views.entries()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'settings' && webContents && !webContents.isDestroyed()) {
      return tabId;
    }
  }
  return null;
}

function openSettingsTab() {
  const existing = findSettingsTabId();
  if (existing) {
    switchToTab(existing);
    broadcastSettings();
    return existing;
  }
  return createGuestTab(SETTINGS_FILE_URL, { settings: true });
}

function loadMemoryBridgePage(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  return webContents.loadFile(MEMORY_BRIDGE_PATH);
}

function findUsefulLinksTabId() {
  for (const [tabId, entry] of views.entries()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'useful' && webContents && !webContents.isDestroyed()) {
      return tabId;
    }
  }
  return null;
}

function openUsefulLinksTab() {
  const existing = findUsefulLinksTabId();
  if (existing) {
    switchToTab(existing);
    refreshUsefulLinksCatalog({ force: false }).catch(() => {});
    return existing;
  }
  const tabId = createGuestTab(USEFUL_LINKS_FILE_URL);
  refreshUsefulLinksCatalog({ force: false }).catch(() => {});
  return tabId;
}

function findExtensionsTabId() {
  for (const [tabId, entry] of views.entries()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'extensions' && webContents && !webContents.isDestroyed()) {
      return tabId;
    }
  }
  return null;
}

function openExtensionsTab() {
  const existing = findExtensionsTabId();
  if (existing) {
    switchToTab(existing);
    pushLocalIntel();
    return existing;
  }
  const tabId = createGuestTab(EXTENSIONS_FILE_URL, { extensions: true });
  pushLocalIntel();
  return tabId;
}

function findMemoryBridgeTabId() {
  for (const [tabId, entry] of views.entries()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'memory' && webContents && !webContents.isDestroyed()) {
      return tabId;
    }
  }
  return null;
}

function openMemoryBridgeTab() {
  const existing = findMemoryBridgeTabId();
  if (existing) {
    switchToTab(existing);
    sendToKind('memory', 'agent:memory-bridge', snapshotMemoryBridge());
    return existing;
  }
  return createGuestTab(MEMORY_BRIDGE_FILE_URL, { memory: true });
}

function findDownloadsTabId() {
  for (const [tabId, entry] of views.entries()) {
    const webContents = entry.view?.webContents;
    if (entry.kind === 'downloads' && webContents && !webContents.isDestroyed()) {
      return tabId;
    }
  }
  return null;
}

function openDownloadsTab() {
  const existing = findDownloadsTabId();
  if (existing) {
    switchToTab(existing);
    return existing;
  }
  return createGuestTab(DOWNLOADS_FILE_URL, { downloads: true });
}

function pythonCandidates() {
  if (process.platform === 'win32') {
    return [
      { cmd: 'python', prefix: [] },
      { cmd: 'python3', prefix: [] },
      { cmd: 'py', prefix: ['-3'] },
    ];
  }
  return [
    { cmd: 'python3', prefix: [] },
    { cmd: 'python', prefix: [] },
  ];
}

function killScraperProcess(child) {
  if (!child) {
    return;
  }
  scraperChildren.delete(child);
  try {
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    child.removeAllListeners();
  } catch {
    // Ignore listener cleanup errors.
  }
  try {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  } catch {
    // Process may already be gone.
  }
}

function killAllScrapers() {
  for (const child of [...scraperChildren]) {
    killScraperProcess(child);
  }
  cachedPython = null;
  killAllHunters();
}

function runScraperProcess(command, args, env) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: path.dirname(SCRAPER_PATH),
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }

    scraperChildren.add(child);
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error, payload) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      killScraperProcess(child);
      if (error) {
        reject(error);
        return;
      }
      resolve(payload);
    };

    const timer = setTimeout(() => {
      const timeoutError = new Error('scraper-timeout');
      timeoutError.code = 'scraper-timeout';
      finish(timeoutError);
    }, 90000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 4_000_000) {
        stdout = stdout.slice(0, 4_000_000);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 80_000) {
        stderr = stderr.slice(-80_000);
      }
    });
    child.on('error', (error) => {
      finish(error);
    });
    child.on('close', (code) => {
      let parsed;
      try {
        parsed = JSON.parse(stdout.trim() || '[]');
      } catch {
        parsed = [];
      }
      const missingModule = /ModuleNotFoundError|No module named/i.test(stderr);
      finish(null, { code, parsed, stderr, missingModule });
    });
  });
}

async function runLocalScraper(query) {
  const q = String(query || '').trim().slice(0, 500);
  if (!q) {
    return { ok: false, error: 'invalid-query', message: 'The search query is empty.', results: [] };
  }

  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    AGENT_USER_AGENT: COMMON_USER_AGENT,
    AGENT_PROXY: privacySettings.ghostNetwork ? SOCKS5_PROXY : '',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const candidates = cachedPython
    ? [cachedPython, ...pythonCandidates().filter((item) => item.cmd !== cachedPython.cmd)]
    : pythonCandidates();

  for (const candidate of candidates) {
    try {
      const result = await runScraperProcess(
        candidate.cmd,
        [...candidate.prefix, '-u', SCRAPER_PATH, q],
        env,
      );
      cachedPython = candidate;
      if (result.missingModule) {
        return {
          ok: false,
          error: 'python-deps',
          message: 'Local Intelligence Agent could not start: Python packages are missing (pip install -r engine/requirements.txt)',
          results: [],
        };
      }
      const results = Array.isArray(result.parsed) ? result.parsed : [];
      return { ok: true, results };
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'python_missing')) {
        continue;
      }
      return {
        ok: false,
        error: error?.code || 'scraper-failed',
        message: 'Local Intelligence Agent returned no results.',
        results: [],
      };
    }
  }

  return {
    ok: false,
    error: 'python_missing',
    message: PYTHON_MISSING_MESSAGE,
    results: [],
  };
}

function tabTitleOf(webContents) {
  const url = webContents.getURL();
  if (isStartPage(url)) {
    return 'New Tab';
  }
  if (isSearchFile(url)) {
    return searchQueryFromUrl(url).slice(0, 80) || 'Search';
  }
  if (isDownloadsFile(url)) {
    return 'Downloads';
  }
  if (isUsefulLinksFile(url)) {
    return 'Useful Links';
  }
  if (isExtensionsFile(url)) {
    return 'Extensions';
  }
  if (isSettingsFile(url)) {
    return 'Settings';
  }
  if (isMemoryBridgeFile(url)) {
    return 'Memory Bridge';
  }

  const title = webContents.getTitle();
  if (title && title !== 'about:blank' && title !== 'New Tab') {
    return title.slice(0, 80);
  }
  return 'Loading...';
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
    '.mgp_skipAd',
    '.mgp_skipButton',
    '[class*="skipAd"]',
    '[class*="skip-ad"]',
    '[aria-label="Skip Ad"]',
    '[aria-label="Skip Ads"]',
  ];
  const BANNER_HIDE = [
    '.ytp-ad-overlay-image',
    '.ytp-ad-text-overlay',
    '.ytp-ad-overlay-container',
    '.ytp-ad-overlay-slot',
    '.ytp-ad-image-overlay',
    '.ytp-ad-player-overlay',
    '.mgp_ad',
    '.mgp_preroll',
    '.mgp_overlayAd',
    '.mgp_promo',
  ];
  const PLAYER_SELECTORS = ['#movie_player', '.html5-video-player', '.video-js', '#player', '.mgp_container', 'video'];
  const AD_CLASS = /\b(ad-showing|ad-interrupting|ytp-ad-player-overlay|videoAdUi|ima-ad-container|mgp_ad)\b/i;
  const AD_NEAR = /\b(ads?|advert|sponsor(?:ed)?|preroll|midroll)\b/i;
  const SKIP_LABEL = /skip\s+ad|reklam[ıi]\s*(atla|geç)/i;
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
    scope.querySelectorAll('button, a, [role="button"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const label = `${node.innerText || ''} ${node.getAttribute('aria-label') || ''}`.replace(/\s+/g, ' ').trim();
      if (SKIP_LABEL.test(label) && label.length < 48) {
        node.click();
      }
    });
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

function agentCanvasPoisoner() {
  if (window.__agentCanvasPoisoner) {
    return;
  }
  window.__agentCanvasPoisoner = true;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = originalGetContext.call(this, type, attrs);
    if (!ctx || typeof ctx.getImageData !== 'function') {
      return ctx;
    }
    const originalGetImageData = ctx.getImageData.bind(ctx);
    ctx.getImageData = function (x, y, w, h) {
      const image = originalGetImageData(x, y, w, h);
      const bytes = image.data;
      const steps = Math.min(12, Math.max(1, Math.floor(bytes.length / 64)));
      for (let i = 0; i < bytes.length; i += steps * 4) {
        bytes[i] = bytes[i] ^ 1;
      }
      return image;
    };
    return ctx;
  };
}

function agentWeb3Shield() {
  if (window.__agentWeb3Shield) {
    return;
  }
  window.__agentWeb3Shield = true;
  for (const name of ['ethereum', 'solana', 'phantom']) {
    try {
      Object.defineProperty(window, name, {
        configurable: false,
        enumerable: false,
        get() {
          return undefined;
        },
        set() {},
      });
    } catch {
      // Provider may already be locked by the page.
    }
  }
}

const CANVAS_POISONER_SOURCE = `(${agentCanvasPoisoner.toString()})();`;
const WEB3_SHIELD_SOURCE = `(${agentWeb3Shield.toString()})();`;

function agentPageTools(flags) {
  const on = flags || {};
  if (on.shadowDomPierce && !window.__agentShadowDomPierce) {
    window.__agentShadowDomPierce = true;
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function attachShadowOpen(init) {
      return original.call(this, Object.assign({}, init || {}, { mode: 'open' }));
    };
  }
  if (on.uiCodeExtract) {
    window.__agentExtractUi = function agentExtractUi() {
      const sel = window.getSelection && window.getSelection();
      const node = sel && sel.rangeCount ? sel.anchorNode : document.body;
      const el = node && node.nodeType === 1 ? node : node && node.parentElement;
      if (!el) {
        return null;
      }
      return {
        tag: el.tagName,
        id: el.id || '',
        className: String(el.className || ''),
        html: String(el.outerHTML || '').slice(0, 20000),
      };
    };
  }
  if (on.infiniteScroll) {
    window.__agentScrollTick = function agentScrollTick() {
      window.scrollBy(0, Math.floor((window.innerHeight || 600) * 0.9));
      return {
        y: window.scrollY,
        height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
      };
    };
  }
  if (on.tableParser) {
    window.__agentTables = function agentTables() {
      return Array.from(document.querySelectorAll('table'))
        .slice(0, 20)
        .map((table) => ({
          rows: Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => String(cell.innerText || '').trim())),
        }));
    };
  }
  if (on.jsonFormFill) {
    window.__agentFillJson = function agentFillJson(data) {
      if (!data || typeof data !== 'object') {
        return { ok: false, filled: [] };
      }
      const filled = [];
      for (const key of Object.keys(data)) {
        const value = data[key];
        const named = document.getElementsByName(key)[0];
        const byId = document.getElementById(key);
        const el = named || byId;
        if (!el) {
          continue;
        }
        el.focus();
        if ('value' in el) {
          el.value = String(value ?? '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = String(value ?? '');
        }
        filled.push(key);
      }
      return { ok: true, filled };
    };
  }
  if (on.xhrHunter && !window.__agentXhrHunter) {
    window.__agentXhrHunter = true;
    window.__agentNetLog = window.__agentNetLog || [];
    const push = (item) => {
      window.__agentNetLog.push(item);
      if (window.__agentNetLog.length > 80) {
        window.__agentNetLog.shift();
      }
    };
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = async function agentFetchHook(...args) {
        const res = await origFetch.apply(this, args);
        try {
          const clone = res.clone();
          const ct = String(clone.headers.get('content-type') || '');
          if (ct.includes('json')) {
            const text = await clone.text();
            push({
              kind: 'fetch',
              url: String(args[0] && args[0].url ? args[0].url : args[0]).slice(0, 400),
              status: res.status,
              body: String(text).slice(0, 4096),
            });
          }
        } catch {
          // Ignore opaque or aborted bodies.
        }
        return res;
      };
    }
    const OrigXHR = window.XMLHttpRequest;
    if (OrigXHR) {
      const origOpen = OrigXHR.prototype.open;
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.open = function agentXhrOpen(method, url, ...rest) {
        this.__agentUrl = String(url || '');
        return origOpen.call(this, method, url, ...rest);
      };
      OrigXHR.prototype.send = function agentXhrSend(body) {
        this.addEventListener('load', function onLoad() {
          const ct = String(this.getResponseHeader('content-type') || '');
          if (ct.includes('json')) {
            push({
              kind: 'xhr',
              url: String(this.__agentUrl || '').slice(0, 400),
              status: this.status,
              body: String(this.responseText || '').slice(0, 4096),
            });
          }
        });
        return origSend.call(this, body);
      };
    }
    const OrigSocket = window.WebSocket;
    if (OrigSocket) {
      window.WebSocket = function agentWebSocket(url, protocols) {
        const socket = protocols !== undefined ? new OrigSocket(url, protocols) : new OrigSocket(url);
        socket.addEventListener('message', (event) => {
          push({
            kind: 'ws',
            url: String(url || '').slice(0, 400),
            body: String(event && event.data != null ? event.data : '').slice(0, 1024),
          });
        });
        return socket;
      };
      window.WebSocket.prototype = OrigSocket.prototype;
    }
  }
  if (on.webglInspector) {
    window.__agentWebglMeta = function agentWebglMeta() {
      return Array.from(document.querySelectorAll('canvas'))
        .slice(0, 12)
        .map((canvas) => {
          let renderer = '';
          try {
            const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
            if (gl) {
              renderer = String(gl.getParameter(gl.RENDERER) || '');
            }
          } catch {
            renderer = '';
          }
          return { width: canvas.width, height: canvas.height, renderer };
        });
    };
  }
  if (on.mediaSourceReveal) {
    window.__agentMediaSources = function agentMediaSources() {
      return Array.from(document.querySelectorAll('video, audio, source'))
        .slice(0, 40)
        .map((el) => ({
          tag: el.tagName,
          src: el.currentSrc || el.src || el.getAttribute('src') || '',
        }))
        .filter((item) => item.src);
    };
  }
}

function pageToolFlags() {
  return {
    shadowDomPierce: Boolean(privacySettings.shadowDomPierce),
    uiCodeExtract: Boolean(privacySettings.uiCodeExtract),
    infiniteScroll: Boolean(privacySettings.infiniteScroll),
    tableParser: Boolean(privacySettings.tableParser),
    jsonFormFill: Boolean(privacySettings.jsonFormFill),
    xhrHunter: Boolean(privacySettings.xhrHunter),
    webglInspector: Boolean(privacySettings.webglInspector),
    mediaSourceReveal: Boolean(privacySettings.mediaSourceReveal),
  };
}

function isInternalGuestUrl(rawUrl) {
  return (
    isStartPage(rawUrl) ||
    isSearchFile(rawUrl) ||
    isDownloadsFile(rawUrl) ||
    isUsefulLinksFile(rawUrl) ||
    isExtensionsFile(rawUrl) ||
    isSettingsFile(rawUrl) ||
    isMemoryBridgeFile(rawUrl)
  );
}

function injectGuestScript(webContents, source) {
  if (!webContents || webContents.isDestroyed() || isInternalGuestUrl(webContents.getURL())) {
    return;
  }
  webContents.executeJavaScript(source, true).catch(() => {});
}

function injectVideoAdSkipper(webContents) {
  injectGuestScript(webContents, VIDEO_AD_SKIPPER_SOURCE);
}

function hidePageAds(webContents) {
  if (!webContents || webContents.isDestroyed() || !privacySettings.blockTrackers) {
    return;
  }
  webContents.insertCSS(AD_HIDE_CSS).catch(() => {});
}

function hideScrollbars(webContents) {
  if (!webContents || webContents.isDestroyed() || isGooglePropertyUrl(webContents.getURL())) {
    return;
  }
  webContents.insertCSS(HIDE_SCROLLBAR_CSS).catch(() => {});
}

function watchHiddenScrollbars(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  const apply = () => hideScrollbars(webContents);
  webContents.on('dom-ready', apply);
  webContents.on('did-finish-load', apply);
  webContents.on('did-frame-finish-load', apply);
}

function injectSessionGuards(webContents) {
  hideScrollbars(webContents);
  const pageUrl = webContents.getURL();
  if (isGooglePropertyUrl(pageUrl)) {
    if (privacySettings.spoofUserAgent) {
      injectGuestScript(webContents, chromeIdentityPageSource());
    }
    return;
  }
  hidePageAds(webContents);
  injectVideoAdSkipper(webContents);
  if (privacySettings.spoofUserAgent) {
    injectGuestScript(webContents, chromeIdentityPageSource());
  }
  if (privacySettings.canvasPoisoner) {
    injectGuestScript(webContents, CANVAS_POISONER_SOURCE);
  }
  if (privacySettings.web3Shield) {
    injectGuestScript(webContents, WEB3_SHIELD_SOURCE);
  }
  injectGuestScript(webContents, `(${agentPageTools.toString()})(${JSON.stringify(pageToolFlags())});`);
  injectGuestScript(webContents, catalogTools.pageToolSource(privacySettings));
  refreshCatalogLookups(webContents);
}

function injectSessionGuardsIntoGuests() {
  for (const entry of views.values()) {
    const webContents = entry.view?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      continue;
    }
    if (entry.kind === 'downloads' || entry.kind === 'extensions' || entry.kind === 'settings' || entry.kind === 'memory' || entry.kind === 'useful') {
      continue;
    }
    injectSessionGuards(webContents);
  }
}

function readDefaultGateway() {
  try {
    const printed = spawnSync(process.platform === 'win32' ? 'route' : 'ip', process.platform === 'win32' ? ['print', '0.0.0.0'] : ['route'], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    });
    const text = String(printed.stdout || '');
    const match = text.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function stopDeadManWatch() {
  if (deadManTimer) {
    clearInterval(deadManTimer);
    deadManTimer = null;
  }
  deadManGateway = '';
}

function startDeadManWatch() {
  stopDeadManWatch();
  deadManGateway = readDefaultGateway();
  deadManTimer = setInterval(() => {
    if (!privacySettings.deadManSwitch || panicInProgress) {
      return;
    }
    const next = readDefaultGateway();
    if (deadManGateway && next && next !== deadManGateway) {
      triggerExcommunicado();
    }
  }, 15000);
}

function emitAgentLocalHook(eventName, data) {
  const payload = {
    event: String(eventName || 'event'),
    at: Date.now(),
    ...(data && typeof data === 'object' ? data : {}),
  };
  if (privacySettings.memoryBlockSync || privacySettings.siyuanBridge) {
    sessionMemoryBlocks.push(payload);
    if (sessionMemoryBlocks.length > 40) {
      sessionMemoryBlocks.shift();
    }
  }
  if (!privacySettings.n8nWebhook || !isLoopbackHttpUrl(N8N_WEBHOOK_URL)) {
    return;
  }
  try {
    const raw = JSON.stringify(payload);
    const req = http.request(
      N8N_WEBHOOK_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } },
      (res) => {
        res.resume();
      },
    );
    req.on('error', () => {});
    req.end(raw);
  } catch {
    // Local hook is best-effort.
  }
}

function memoryBridgeSpec(id) {
  return MEMORY_BRIDGE_CATALOG.find((item) => item.id === id) || MEMORY_BRIDGE_CATALOG.find((item) => item.id === 'siyuan');
}

function snapshotMemoryBridge() {
  const spec = memoryBridgeSpec(memoryBridge.provider);
  const enabled = Boolean(privacySettings.siyuanBridge) && (spec.id === 'siyuan' || spec.id === 'obsidian');
  return {
    enabled,
    provider: spec.id,
    providerName: spec.name,
    endpoint: memoryBridge.endpoint || spec.defaultUrl,
    hasToken: Boolean(memoryBridge.token),
    vaultPath: memoryBridge.vaultPath,
    notes: sessionMemoryBlocks.length,
    catalog: MEMORY_BRIDGE_CATALOG.filter((item) => item.id === 'siyuan' || item.id === 'obsidian').map((item) => ({
      id: item.id,
      name: item.name,
      hint: item.hint,
      defaultUrl: item.defaultUrl,
      kind: item.kind,
    })),
  };
}

function brainChoice() {
  if (!privacySettings.siyuanBridge) {
    return 'off';
  }
  const id = memoryBridgeSpec(memoryBridge.provider).id;
  return id === 'siyuan' || id === 'obsidian' ? id : 'off';
}

function applyBrainChoice(value) {
  if (value === 'off' || value === '' || value === 'none' || value === false) {
    privacySettings.siyuanBridge = false;
    sessionExtensionState.set('siyuan-bridge', false);
    sendToKind('memory', 'agent:memory-bridge', snapshotMemoryBridge());
    return true;
  }
  if (value !== 'siyuan' && value !== 'obsidian') {
    return false;
  }
  applyMemoryBridgePatch({ provider: value });
  privacySettings.siyuanBridge = true;
  sessionExtensionState.set('siyuan-bridge', true);
  sendToKind('memory', 'agent:memory-bridge', snapshotMemoryBridge());
  return true;
}

function rememberAgentThought(text) {
  if (!privacySettings.siyuanBridge || typeof text !== 'string' || !text.trim()) {
    return;
  }
  const entry = { text: text.trim().slice(0, 8000), at: Date.now() };
  sessionMemoryBlocks.push(entry);
  if (sessionMemoryBlocks.length > 40) {
    sessionMemoryBlocks.shift();
  }
  postToMemoryBridge(entry.text);
}

function formatMemoryEntry(item) {
  if (!item) {
    return '';
  }
  if (typeof item === 'string') {
    return item;
  }
  if (typeof item.text === 'string' && item.text) {
    return item.text;
  }
  if (item.event) {
    return `${item.event}${item.tabId ? ` · tab ${item.tabId}` : ''}`;
  }
  return '';
}

function readObsidianNotes() {
  const vault = memoryBridge.vaultPath;
  if (!vault) {
    return '';
  }
  try {
    const file = path.join(vault, 'Agent Browser', 'oturum.md');
    if (!fs.existsSync(file)) {
      return '';
    }
    return fs.readFileSync(file, 'utf8').slice(-6000);
  } catch {
    return '';
  }
}

function siyuanOrigin() {
  try {
    const parsed = new URL(memoryBridge.endpoint || 'http://127.0.0.1:6806/api/block/insertBlock');
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://127.0.0.1:6806';
  }
}

function postJsonLoopback(targetUrl, body, headers) {
  return new Promise((resolve) => {
    try {
      if (!isLoopbackHttpUrl(targetUrl)) {
        resolve(null);
        return;
      }
      const raw = JSON.stringify(body);
      const req = http.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(raw),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.setTimeout(800, () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
      req.end(raw);
    } catch {
      resolve(null);
    }
  });
}

async function readSiyuanNotes() {
  const origin = siyuanOrigin();
  if (!origin) {
    return '';
  }
  const headers = {};
  if (memoryBridge.token) {
    headers.Authorization = `Token ${memoryBridge.token}`;
  }
  const payload = await postJsonLoopback(`${origin}/api/query/sql`, {
    stmt: "SELECT content FROM blocks WHERE content != '' ORDER BY updated DESC LIMIT 12",
  }, headers);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((row) => (typeof row?.content === 'string' ? row.content : ''))
    .filter(Boolean)
    .join('\n')
    .slice(-6000);
}

async function recalledMemoryText() {
  if (!privacySettings.siyuanBridge) {
    return '';
  }
  const spec = memoryBridgeSpec(memoryBridge.provider);
  let external = '';
  if (spec.id === 'obsidian') {
    external = readObsidianNotes();
  } else if (spec.id === 'siyuan') {
    external = await readSiyuanNotes();
  }
  const session = sessionMemoryBlocks.map(formatMemoryEntry).filter(Boolean).join('\n---\n').slice(-4000);
  return [external, session].filter(Boolean).join('\n---\n').slice(-8000);
}

async function withAgentMemory(messages) {
  if (!Array.isArray(messages)) {
    return messages;
  }
  let next = messages;
  if (privacySettings.systemPromptInject) {
    next = [
      {
        role: 'system',
        content: 'Session system prompt: stay with facts from this RAM session and the current page. Do not invent sources.',
      },
      ...next,
    ];
  }
  if (privacySettings.genericLlmBridge) {
    const page = await extractVisiblePageText();
    if (page) {
      next = [{ role: 'system', content: `Current page text:\n${page.slice(0, 8000)}` }, ...next];
    }
  }
  if (!privacySettings.siyuanBridge) {
    return next;
  }
  messages = next;
  if (!privacySettings.siyuanBridge || !Array.isArray(messages)) {
    return messages;
  }
  const spec = memoryBridgeSpec(memoryBridge.provider);
  const recalled = await recalledMemoryText();
  const preface = recalled
    ? `You are an agent with persistent ${spec.name} memory. Use these recalled notes when they help:\n${recalled}`
    : `You are an agent with a ${spec.name} memory bridge. Persist useful facts. No notes have been recalled yet.`;
  return [{ role: 'system', content: preface }, ...messages];
}

function resetMemoryBridge() {
  const spec = memoryBridgeSpec('siyuan');
  memoryBridge.provider = spec.id;
  memoryBridge.endpoint = spec.defaultUrl;
  memoryBridge.token = '';
  memoryBridge.vaultPath = '';
}

function applyMemoryBridgePatch(payload) {
  const spec = memoryBridgeSpec(typeof payload?.provider === 'string' ? payload.provider : memoryBridge.provider);
  memoryBridge.provider = spec.id;
  if (spec.kind === 'folder') {
    memoryBridge.endpoint = '';
  } else if (typeof payload?.endpoint === 'string') {
    const next = payload.endpoint.trim().slice(0, 256);
    memoryBridge.endpoint = next && isLoopbackHttpUrl(next) ? next : spec.defaultUrl;
  } else if (!memoryBridge.endpoint) {
    memoryBridge.endpoint = spec.defaultUrl;
  }
  if (typeof payload?.token === 'string') {
    memoryBridge.token = payload.token.trim().slice(0, 512);
  }
}

function writeObsidianNote(text) {
  const vault = memoryBridge.vaultPath;
  if (!vault) {
    return false;
  }
  try {
    if (!fs.statSync(vault).isDirectory()) {
      return false;
    }
    const dir = path.join(vault, 'Agent Browser');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'oturum.md'), `\n\n## ${new Date().toISOString()}\n\n${text}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function postToMemoryBridge(text) {
  if (!privacySettings.siyuanBridge || typeof text !== 'string' || !text) {
    return;
  }
  const spec = memoryBridgeSpec(memoryBridge.provider);
  if (spec.kind === 'folder') {
    writeObsidianNote(text);
    return;
  }
  const endpoint = memoryBridge.endpoint || spec.defaultUrl;
  if (!isLoopbackHttpUrl(endpoint)) {
    return;
  }
  try {
    const raw = JSON.stringify({
      text,
      source: 'agent-browser',
      provider: spec.id,
      at: Date.now(),
    });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(raw),
    };
    if (memoryBridge.token) {
      headers.Authorization = spec.id === 'siyuan' ? `Token ${memoryBridge.token}` : `Bearer ${memoryBridge.token}`;
    }
    const req = http.request(endpoint, { method: 'POST', headers }, (res) => {
      res.resume();
    });
    req.on('error', () => {});
    req.end(raw);
  } catch {
    // Local memory backends are best-effort.
  }
}

function guestPartitionFor(owner) {
  if (!privacySettings.sandboxIsolator || !owner) {
    return PARTITION;
  }
  const slug =
    String(owner)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'agent';
  const name = `in-memory-session-${slug}`;
  if (!name || name.startsWith('persist:')) {
    return PARTITION;
  }
  return name;
}

function webPreferencesForGuest(owner) {
  const partition = guestPartitionFor(owner);
  if (partition === PARTITION) {
    return guestWebPreferences;
  }
  const isolated = session.fromPartition(partition);
  extraAgentSessions.set(partition, isolated);
  attachPrivacyNetworkGuards(isolated);
  if (privacySettings.ghostNetwork || privacySettings.proxyRotate) {
    const rule = PROXY_POOL[proxyRotateIndex % PROXY_POOL.length];
    isolated.setProxy({ proxyRules: rule }).catch(() => {});
    if (privacySettings.proxyRotate) {
      proxyRotateIndex += 1;
    }
  }
  return { ...guestWebPreferences, partition };
}

function applyViewPerformanceMode() {
  const guests = [...views.entries()].filter(([, entry]) => entry.kind === 'guest');
  const hideInactive = Boolean(privacySettings.headlessMode);
  const orchestrate = Boolean(privacySettings.tabOrchestrator) && guests.length > 10;
  for (const [tabId, entry] of views) {
    const webContents = entry.view?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      continue;
    }
    const sleep = entry.kind === 'guest' && tabId !== activeTabId && (hideInactive || orchestrate);
    try {
      if (typeof webContents.setBackgroundThrottling === 'function') {
        webContents.setBackgroundThrottling(sleep || Boolean(privacySettings.headlessMode && entry.kind === 'guest'));
      }
    } catch {
      // Throttling is optional.
    }
    try {
      if (typeof entry.view.setVisible === 'function') {
        entry.view.setVisible(!sleep);
      }
    } catch {
      // Visibility is optional.
    }
  }
}

function agentActionBlocked(tabId) {
  if (privacySettings.rateLimitGuard && Date.now() < rateLimitPauseUntil) {
    return { ok: false, error: 'rate-limit-pause', resumeAt: rateLimitPauseUntil };
  }
  if (privacySettings.excommunicadoLock && tabId && agentLockedTabs.has(tabId)) {
    return { ok: false, error: 'excommunicado-lock' };
  }
  return null;
}

function noteAgentFailure(tabId) {
  if (!privacySettings.excommunicadoLock || !tabId) {
    return null;
  }
  const next = (agentFailCounts.get(tabId) || 0) + 1;
  agentFailCounts.set(tabId, next);
  if (next < 5) {
    return null;
  }
  agentLockedTabs.add(tabId);
  emitAgentLocalHook('agent-failed', { tabId, failures: next });
  destroyTab(tabId, false);
  return { ok: false, error: 'excommunicado-lock', tabId };
}

function noteAgentSuccess(tabId) {
  if (tabId) {
    agentFailCounts.delete(tabId);
  }
}

function applyDohMode() {
  if (typeof app.configureHostResolver !== 'function') {
    return;
  }
  if (privacySettings.dohForcer) {
    app.configureHostResolver({
      enableBuiltInResolver: true,
      secureDnsMode: 'secure',
      secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
    });
    return;
  }
  app.configureHostResolver({
    enableBuiltInResolver: true,
    secureDnsMode: 'automatic',
    secureDnsServers: [],
  });
}

function applyNetworkThrottle() {
  const isolated = getIsolatedSession();
  if (privacySettings.networkThrottle && typeof isolated.enableNetworkEmulation === 'function') {
    isolated.enableNetworkEmulation({
      latency: 400,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 20 * 1024,
    });
    return;
  }
  if (typeof isolated.disableNetworkEmulation === 'function') {
    isolated.disableNetworkEmulation();
  }
}

function touchTabIdle(tabId) {
  if (tabId) {
    tabIdleAt.set(tabId, Date.now());
  }
}

function applyIdleRamPurge() {
  if (idleRamTimer) {
    clearInterval(idleRamTimer);
    idleRamTimer = null;
  }
  if (!privacySettings.idleRamPurge) {
    return;
  }
  idleRamTimer = setInterval(() => {
    const now = Date.now();
    for (const [tabId, entry] of views) {
      if (entry.kind !== 'guest' || tabId === activeTabId) {
        continue;
      }
      const last = tabIdleAt.get(tabId) || 0;
      if (now - last < 120000) {
        continue;
      }
      const webContents = entry.view?.webContents;
      if (!webContents || webContents.isDestroyed()) {
        continue;
      }
      if (typeof webContents.setBackgroundThrottling === 'function') {
        webContents.setBackgroundThrottling(true);
      }
    }
    const isolated = getIsolatedSession();
    if (isolated && typeof isolated.clearCache === 'function') {
      isolated.clearCache().catch(() => {});
    }
  }, 30000);
}

function applyCatalogSideEffect(key) {
  if (!catalogTools.isCatalogSetting(key)) {
    return;
  }
  if (key === 'dohForcer') {
    applyDohMode();
    return;
  }
  if (key === 'networkThrottle') {
    applyNetworkThrottle();
    return;
  }
  if (key === 'idleRamPurge') {
    applyIdleRamPurge();
    return;
  }
  if (key === 'webrtcLeakBlock') {
    applyWebRtcPolicyToAll();
    injectSessionGuardsIntoGuests();
    return;
  }
  if (key === 'geolocationShift') {
    applySessionPermissions(getIsolatedSession());
    injectSessionGuardsIntoGuests();
    return;
  }
  injectSessionGuardsIntoGuests();
}

function refreshCatalogLookups(webContents) {
  if (!webContents || webContents.isDestroyed() || isInternalGuestUrl(webContents.getURL())) {
    return;
  }
  const pageUrl = webContents.getURL();
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = '';
  }
  const inject = (key, value) => {
    injectGuestScript(
      webContents,
      `window.__agentCatalog=window.__agentCatalog||{};window.__agentCatalog[${JSON.stringify(key)}]=${JSON.stringify(value)};`,
    );
  };
  if (privacySettings.httpHeaderAnalyze) {
    inject('headers', lastSecurityHeaders.get(activeTabId) || lastSecurityHeaders.get('session') || null);
  }
  if (privacySettings.waybackFetch && pageUrl.startsWith('http')) {
    fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(pageUrl)}`)
      .then((res) => res.json())
      .then((body) => inject('wayback', body?.archived_snapshots?.closest || null))
      .catch(() => inject('wayback', null));
  }
  if (privacySettings.shodanPassive && host) {
    dnsLookup(host)
      .then((ip) => fetch(`https://internetdb.shodan.io/${ip}`).then((res) => (res.ok ? res.json() : null)))
      .then((body) => inject('shodan', body))
      .catch(() => inject('shodan', null));
  }
  if (privacySettings.bgpVisualize && host) {
    fetch(`https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(host)}`)
      .then((res) => res.json())
      .then((body) => inject('bgp', body?.data || null))
      .catch(() => inject('bgp', null));
  }
  if (privacySettings.localhostScan) {
    scanLocalhostPorts().then((ports) => inject('localhost', ports)).catch(() => inject('localhost', []));
  }
  if (privacySettings.sslInspect && host) {
    inspectTlsCertificate(host).then((cert) => inject('tls', cert)).catch(() => inject('tls', null));
  }
}

function dnsLookup(host) {
  return new Promise((resolve, reject) => {
    require('node:dns').lookup(host, (error, address) => {
      if (error || !address) {
        reject(error || new Error('no address'));
        return;
      }
      resolve(address);
    });
  });
}

function scanLocalhostPorts() {
  const ports = [3000, 3001, 4173, 5173, 8000, 8080, 4200, 5000, 9222];
  return Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve) => {
          const socket = net.connect({ host: '127.0.0.1', port }, () => {
            socket.end();
            resolve(port);
          });
          socket.setTimeout(250);
          socket.on('timeout', () => {
            socket.destroy();
            resolve(0);
          });
          socket.on('error', () => resolve(0));
        }),
    ),
  ).then((found) => found.filter(Boolean));
}

function inspectTlsCertificate(host) {
  return new Promise((resolve) => {
    const tls = require('node:tls');
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 4000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve({
        subject: cert?.subject?.CN || host,
        issuer: cert?.issuer?.CN || '',
        validTo: cert?.valid_to || '',
      });
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function applyExtensionSideEffect(key) {
  switch (key) {
    case 'canvasPoisoner':
    case 'web3Shield':
    case 'shadowDomPierce':
    case 'uiCodeExtract':
    case 'infiniteScroll':
    case 'tableParser':
    case 'jsonFormFill':
    case 'xhrHunter':
    case 'webglInspector':
    case 'mediaSourceReveal':
      injectSessionGuardsIntoGuests();
      break;
    case 'deadManSwitch':
      if (privacySettings.deadManSwitch) {
        startDeadManWatch();
      } else {
        stopDeadManWatch();
      }
      break;
    case 'headlessMode':
    case 'tabOrchestrator':
      applyViewPerformanceMode();
      break;
    case 'proxyRotate':
    case 'sandboxIsolator':
    case 'markdownDom':
    case 'lmStudioPort':
    case 'n8nWebhook':
    case 'memoryBlockSync':
    case 'siyuanBridge':
      sendToKind('memory', 'agent:memory-bridge', snapshotMemoryBridge());
      break;
    case 'cursorIdeBridge':
    case 'inputSimulator':
    case 'rateLimitGuard':
    case 'excommunicadoLock':
      break;
    default:
      applyCatalogSideEffect(key);
      break;
  }
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
    const entry = views.get(tabId);
    if (entry?.kind === 'downloads') {
      if (!isDownloadsFile(url)) {
        event.preventDefault();
      }
      return;
    }
    if (entry?.kind === 'extensions') {
      if (!isExtensionsFile(url)) {
        event.preventDefault();
      }
      return;
    }
    if (entry?.kind === 'settings') {
      if (!isSettingsFile(url)) {
        event.preventDefault();
      }
      return;
    }
    if (entry?.kind === 'memory') {
      if (!isMemoryBridgeFile(url)) {
        event.preventDefault();
      }
      return;
    }
    if (entry?.kind === 'useful') {
      if (!isUsefulLinksFile(url)) {
        event.preventDefault();
      }
      return;
    }
    if (isDownloadsFile(url) || isExtensionsFile(url) || isSettingsFile(url) || isMemoryBridgeFile(url) || !isAllowedGuestUrl(url)) {
      event.preventDefault();
    }
  });
  webContents.on('dom-ready', () => injectSessionGuards(webContents));
  webContents.on('did-finish-load', () => injectSessionGuards(webContents));
  webContents.on('did-frame-finish-load', () => {
    hideScrollbars(webContents);
    hidePageAds(webContents);
  });

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
      title: isDownloadsFile(webContents.getURL())
        ? 'Downloads'
        : isUsefulLinksFile(webContents.getURL())
          ? 'Useful Links'
          : isExtensionsFile(webContents.getURL())
            ? 'Extensions'
            : isSettingsFile(webContents.getURL())
              ? 'Settings'
            : isMemoryBridgeFile(webContents.getURL())
              ? 'Memory Bridge'
              : isStartPage(webContents.getURL())
            ? 'New Tab'
            : 'Loading...',
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
  webContents.on('page-favicon-updated', (_event, favicons) => {
    tabFavicons.set(
      tabId,
      (Array.isArray(favicons) ? favicons : [])
        .map((item) => resolveHttpUrl(item))
        .filter(Boolean),
    );
  });
  webContents.on('did-navigate', () => {
    translatedWebContents.delete(webContents);
    setTabMicrophone(tabId, false);
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
  touchTabIdle(tabId);
  entry.view.setBounds(viewBounds());
  bringViewToFront(entry.view);
  applyViewPerformanceMode();
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

  const downloads = options.downloads === true || isDownloadsFile(initialUrl);
  const usefulLinks = isUsefulLinksFile(initialUrl);
  const extensions = options.extensions === true || isExtensionsFile(initialUrl);
  const settingsPage = options.settings === true || isSettingsFile(initialUrl);
  const memory = options.memory === true || isMemoryBridgeFile(initialUrl);
  const view = new WebContentsView({
    webPreferences: downloads
      ? downloadsWebPreferences
      : extensions
        ? extensionsWebPreferences
        : settingsPage
          ? settingsWebPreferences
        : memory
          ? memoryBridgeWebPreferences
        : usefulLinks
          ? usefulLinksWebPreferences
          : webPreferencesForGuest(owner),
  });
  view.setBackgroundColor('#070809');
  views.set(tabId, {
    id: tabId,
    view,
    owner,
    pinned: false,
    window: host,
    kind: downloads ? 'downloads' : extensions ? 'extensions' : settingsPage ? 'settings' : memory ? 'memory' : usefulLinks ? 'useful' : 'guest',
    microphone: false,
  });
  tabSecurityStats.set(tabId, emptySecurityStats());
  if (typeof view.webContents.setUserAgent === 'function') {
    view.webContents.setUserAgent(COMMON_USER_AGENT);
  }
  attachTabListeners(tabId, view.webContents);
  host.contentView.addChildView(view);
  view.setBounds(viewBounds());
  if (activate) {
    switchToTab(tabId);
  } else {
    applyViewPerformanceMode();
  }

  const target = initialUrl || 'about:blank';
  const searchQuery = parseAgentSearchTarget(target);
  if (downloads) {
    loadDownloadsPage(view.webContents);
  } else if (usefulLinks) {
    loadUsefulLinksPage(view.webContents);
  } else if (extensions) {
    loadExtensionsPage(view.webContents);
  } else if (settingsPage) {
    loadSettingsPage(view.webContents);
  } else if (memory) {
    loadMemoryBridgePage(view.webContents);
  } else if (searchQuery) {
    const nextUrl = searchUrlFor(searchQuery);
    if (nextUrl) {
      view.webContents.loadURL(nextUrl);
    } else {
      loadStartPage(view.webContents);
    }
  } else if (target !== 'about:blank') {
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
    title: downloads
      ? 'Downloads'
      : usefulLinks
        ? 'Useful Links'
        : extensions
          ? 'Extensions'
          : settingsPage
            ? 'Settings'
          : memory
            ? 'Memory Bridge'
            : target === 'about:blank'
            ? 'New Tab'
            : 'Loading...',
    url: target,
    active: activate,
    pinned: false,
    muted: false,
    audible: false,
    microphone: false,
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
  tabFavicons.delete(tabId);
  agentFailCounts.delete(tabId);
  agentLockedTabs.delete(tabId);

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
    stopAgentApiServer();
    removeAgentPortFiles();
  } catch {
    // Port files must not block quit.
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
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  setTimeout(forcePanicQuit, PANIC_QUIT_MS);

  try {
    stopAgentBridgeServer();
    stopAgentApiServer();
    removeAgentPortFiles();
    agentBridgeToken = '';
    sessionApiKeyValue = '';
    sessionMicGrants.clear();
    agentControlKey = '';
    privacySettings.agentBridge = false;
    privacySettings.ghostNetwork = false;
    privacySettings.mediaHunter = false;
    privacySettings.blockMedia = true;
    privacySettings.canvasPoisoner = false;
    privacySettings.siyuanBridge = false;
    sessionMemoryBlocks.length = 0;
    resetMemoryBridge();
    privacySettings.humanJitter = false;
    privacySettings.deadManSwitch = false;
    privacySettings.web3Shield = false;
    privacySettings.shadowDomPierce = false;
    privacySettings.markdownDom = false;
    privacySettings.uiCodeExtract = false;
    privacySettings.infiniteScroll = false;
    privacySettings.tableParser = false;
    privacySettings.xhrHunter = false;
    privacySettings.jsonFormFill = false;
    privacySettings.proxyRotate = false;
    privacySettings.webglInspector = false;
    privacySettings.mediaSourceReveal = false;
    privacySettings.n8nWebhook = false;
    privacySettings.lmStudioPort = false;
    privacySettings.memoryBlockSync = false;
    privacySettings.cursorIdeBridge = false;
    privacySettings.tabOrchestrator = false;
    privacySettings.headlessMode = false;
    privacySettings.inputSimulator = false;
    privacySettings.rateLimitGuard = false;
    privacySettings.sandboxIsolator = false;
    privacySettings.excommunicadoLock = false;
    catalogTools.resetSettings(privacySettings);
    extExpertHistory.length = 0;
    stopDeadManWatch();
    global.isDownloaderEnabled = false;
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
  if (
    shieldMenuView &&
    !shieldMenuView.webContents.isDestroyed() &&
    event.sender === shieldMenuView.webContents
  ) {
    return true;
  }
  if (
    siteMenuView &&
    !siteMenuView.webContents.isDestroyed() &&
    event.sender === siteMenuView.webContents
  ) {
    return true;
  }
  if (
    toolsMenuView &&
    !toolsMenuView.webContents.isDestroyed() &&
    event.sender === toolsMenuView.webContents
  ) {
    return true;
  }
  if (
    shortcutsMenuView &&
    !shortcutsMenuView.webContents.isDestroyed() &&
    event.sender === shortcutsMenuView.webContents
  ) {
    return true;
  }
  if (
    profileMenuView &&
    !profileMenuView.webContents.isDestroyed() &&
    event.sender === profileMenuView.webContents
  ) {
    return true;
  }
  for (const entry of views.values()) {
    if (
      entry.kind === 'settings' &&
      entry.view?.webContents &&
      !entry.view.webContents.isDestroyed() &&
      entry.view.webContents === event.sender
    ) {
      return true;
    }
  }
  return Boolean(chromeWindowFromEvent(event));
}

function isSearchSender(event) {
  const contents = event?.sender;
  if (!contents || contents.isDestroyed()) {
    return false;
  }
  return isSearchFile(contents.getURL());
}

function isDownloadsSender(event) {
  const contents = event?.sender;
  if (!contents || contents.isDestroyed()) {
    return false;
  }
  if (
    downloadsMenuView &&
    !downloadsMenuView.webContents.isDestroyed() &&
    downloadsMenuView.webContents === contents
  ) {
    return true;
  }
  for (const entry of views.values()) {
    if (
      entry.kind === 'downloads' &&
      entry.view?.webContents &&
      !entry.view.webContents.isDestroyed() &&
      entry.view.webContents === contents
    ) {
      return true;
    }
  }
  return isDownloadsFile(contents.getURL());
}

function isExtensionsSender(event) {
  const contents = event?.sender;
  if (!contents || contents.isDestroyed()) {
    return false;
  }
  for (const entry of views.values()) {
    if (
      entry.kind === 'extensions' &&
      entry.view?.webContents &&
      !entry.view.webContents.isDestroyed() &&
      entry.view.webContents === contents
    ) {
      return true;
    }
  }
  return isExtensionsFile(contents.getURL());
}

function isUsefulLinksSender(event) {
  const contents = event?.sender;
  if (!contents || contents.isDestroyed()) {
    return false;
  }
  for (const entry of views.values()) {
    if (
      entry.kind === 'useful' &&
      entry.view?.webContents &&
      !entry.view.webContents.isDestroyed() &&
      entry.view.webContents === contents
    ) {
      return true;
    }
  }
  return isUsefulLinksFile(contents.getURL());
}

function isMemoryBridgeSender(event) {
  const contents = event?.sender;
  if (!contents || contents.isDestroyed()) {
    return false;
  }
  for (const entry of views.values()) {
    if (
      entry.kind === 'memory' &&
      entry.view?.webContents &&
      !entry.view.webContents.isDestroyed() &&
      entry.view.webContents === contents
    ) {
      return true;
    }
  }
  return isMemoryBridgeFile(contents.getURL());
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
  watchHiddenScrollbars(overflowMenuView.webContents);
  attachChromeContextMenu(overflowMenuView.webContents);
  overflowMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
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
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
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

function shieldViewAlive() {
  return Boolean(shieldMenuView && !shieldMenuView.webContents.isDestroyed());
}

function raiseShieldMenu() {
  if (!shieldOpen || !shieldViewAlive() || !shieldHostWindow || shieldHostWindow.isDestroyed()) {
    return;
  }
  shieldHostWindow.contentView.addChildView(shieldMenuView);
}

function detachShieldHost() {
  if (shieldHostWindow && !shieldHostWindow.isDestroyed() && shieldHostDismiss) {
    shieldHostWindow.removeListener('move', shieldHostDismiss);
    shieldHostWindow.removeListener('resize', shieldHostDismiss);
  }
  shieldHostWindow = null;
  shieldHostDismiss = null;
}

function notifyChromeShieldClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:shield-closed');
    }
  }
}

function hideShieldMenu(options = {}) {
  const notify = options.notify !== false;
  shieldOpen = false;
  const host = shieldHostWindow;
  detachShieldHost();
  if (shieldViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(shieldMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeShieldClosed();
  }
}

function ensureShieldMenuView() {
  if (shieldViewAlive()) {
    return shieldMenuReady;
  }

  shieldMenuView = new WebContentsView({
    webPreferences: chromeWebPreferences,
  });
  shieldMenuView.setBackgroundColor('#292a2d');
  shieldMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchHiddenScrollbars(shieldMenuView.webContents);
  attachChromeContextMenu(shieldMenuView.webContents);
  shieldMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
        shieldOpen &&
        shieldViewAlive() &&
        !shieldMenuView.webContents.isFocused()
      ) {
        hideShieldMenu();
      }
    }, 0);
  });
  shieldMenuReady = shieldMenuView.webContents.loadFile(path.join(__dirname, 'shield-menu.html'));
  return shieldMenuReady;
}

function showShieldMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  hideShieldMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = MENU_DROPDOWN_WIDTH;
  const btnBottom = Number(anchor && anchor.bottom);
  const btnRight = Number(anchor && anchor.right);
  const bottom = Number.isFinite(btnBottom) ? btnBottom : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;
  const right = Number.isFinite(btnRight) ? btnRight : contentWidth - 8;
  let x = Math.round(right - width);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(160, contentHeight - y - 8);
  const initialH = Math.min(420, maxH);

  shieldHostWindow = host;
  shieldOpen = true;
  shieldHostDismiss = () => {
    if (shieldHostWindow === host) {
      hideShieldMenu();
    }
  };
  host.on('move', shieldHostDismiss);
  host.on('resize', shieldHostDismiss);

  ensureShieldMenuView()
    .then(async () => {
      if (!shieldOpen || shieldHostWindow !== host || host.isDestroyed() || !shieldViewAlive()) {
        return;
      }
      shieldMenuView.setBounds({ x, y, width, height: Math.min(520, maxH) });
      let measured = initialH;
      try {
        measured = await shieldMenuView.webContents.executeJavaScript(`(() => {
          const menu = document.getElementById('agent-shield-menu');
          if (!menu) {
            return 0;
          }
          return Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height));
        })()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!shieldOpen || shieldHostWindow !== host || !shieldViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 120), maxH);
      shieldMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(shieldMenuView);
      shieldMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open shield menu:', error);
      hideShieldMenu();
    });
}

function siteViewAlive() {
  return Boolean(siteMenuView && !siteMenuView.webContents.isDestroyed());
}

function raiseSiteMenu() {
  if (!siteOpen || !siteViewAlive() || !siteHostWindow || siteHostWindow.isDestroyed()) {
    return;
  }
  siteHostWindow.contentView.addChildView(siteMenuView);
}

function detachSiteHost() {
  if (siteHostWindow && !siteHostWindow.isDestroyed() && siteHostDismiss) {
    siteHostWindow.removeListener('move', siteHostDismiss);
    siteHostWindow.removeListener('resize', siteHostDismiss);
  }
  siteHostWindow = null;
  siteHostDismiss = null;
}

function notifyChromeSiteClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:site-closed');
    }
  }
}

function hideSiteMenu(options = {}) {
  const notify = options.notify !== false;
  siteOpen = false;
  const host = siteHostWindow;
  detachSiteHost();
  if (siteViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(siteMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeSiteClosed();
  }
}

function ensureSiteMenuView() {
  if (siteViewAlive()) {
    return siteMenuReady;
  }

  siteMenuView = new WebContentsView({
    webPreferences: chromeWebPreferences,
  });
  siteMenuView.setBackgroundColor('#292a2d');
  siteMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchHiddenScrollbars(siteMenuView.webContents);
  attachChromeContextMenu(siteMenuView.webContents);
  siteMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
        siteOpen &&
        siteViewAlive() &&
        !siteMenuView.webContents.isFocused()
      ) {
        hideSiteMenu();
      }
    }, 0);
  });
  siteMenuReady = siteMenuView.webContents.loadFile(path.join(__dirname, 'site-menu.html'));
  return siteMenuReady;
}

function showSiteMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  hideShieldMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  hideSiteMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = MENU_DROPDOWN_WIDTH;
  const btnBottom = Number(anchor && anchor.bottom);
  const btnRight = Number(anchor && anchor.right);
  const bottom = Number.isFinite(btnBottom) ? btnBottom : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;
  const right = Number.isFinite(btnRight) ? btnRight : contentWidth - 8;
  let x = Math.round(right - width);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(160, contentHeight - y - 8);
  const initialH = Math.min(280, maxH);

  siteHostWindow = host;
  siteOpen = true;
  siteHostDismiss = () => {
    if (siteHostWindow === host) {
      hideSiteMenu();
    }
  };
  host.on('move', siteHostDismiss);
  host.on('resize', siteHostDismiss);

  ensureSiteMenuView()
    .then(async () => {
      if (!siteOpen || siteHostWindow !== host || host.isDestroyed() || !siteViewAlive()) {
        return;
      }
      siteMenuView.setBounds({ x, y, width, height: Math.min(360, maxH) });
      let measured = initialH;
      try {
        measured = await siteMenuView.webContents.executeJavaScript(`(() => {
          const menu = document.getElementById('agent-site-menu');
          if (!menu) {
            return 0;
          }
          return Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height));
        })()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!siteOpen || siteHostWindow !== host || !siteViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 120), maxH);
      siteMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(siteMenuView);
      const info = snapshotSiteInfo();
      if (!siteMenuView.webContents.isDestroyed()) {
        siteMenuView.webContents.send('agent:site-info', info);
      }
      siteMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open site menu:', error);
      hideSiteMenu();
    });
}

function toolsViewAlive() {
  return Boolean(toolsMenuView && !toolsMenuView.webContents.isDestroyed());
}

function raiseToolsMenu() {
  if (!toolsOpen || !toolsViewAlive() || !toolsHostWindow || toolsHostWindow.isDestroyed()) {
    return;
  }
  toolsHostWindow.contentView.addChildView(toolsMenuView);
}

function detachToolsHost() {
  if (toolsHostWindow && !toolsHostWindow.isDestroyed() && toolsHostDismiss) {
    toolsHostWindow.removeListener('move', toolsHostDismiss);
    toolsHostWindow.removeListener('resize', toolsHostDismiss);
  }
  toolsHostWindow = null;
  toolsHostDismiss = null;
}

function notifyChromeToolsClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:tools-closed');
    }
  }
}

function hideToolsMenu(options = {}) {
  const notify = options.notify !== false;
  toolsOpen = false;
  const host = toolsHostWindow;
  detachToolsHost();
  if (toolsViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(toolsMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeToolsClosed();
  }
}

function ensureToolsMenuView() {
  if (toolsViewAlive()) {
    return toolsMenuReady;
  }

  toolsMenuView = new WebContentsView({
    webPreferences: chromeWebPreferences,
  });
  toolsMenuView.setBackgroundColor('#292a2d');
  toolsMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchHiddenScrollbars(toolsMenuView.webContents);
  attachChromeContextMenu(toolsMenuView.webContents);
  toolsMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
        toolsOpen &&
        toolsViewAlive() &&
        !toolsMenuView.webContents.isFocused()
      ) {
        hideToolsMenu();
      }
    }, 0);
  });
  toolsMenuReady = toolsMenuView.webContents.loadFile(path.join(__dirname, 'tools-menu.html'));
  return toolsMenuReady;
}

function showToolsMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  hideToolsMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = MENU_DROPDOWN_WIDTH;
  const btnBottom = Number(anchor && anchor.bottom);
  const btnRight = Number(anchor && anchor.right);
  const bottom = Number.isFinite(btnBottom) ? btnBottom : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;
  const right = Number.isFinite(btnRight) ? btnRight : contentWidth - 8;
  let x = Math.round(right - width);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(160, contentHeight - y - 8);
  const initialH = Math.min(440, maxH);

  toolsHostWindow = host;
  toolsOpen = true;
  toolsHostDismiss = () => {
    if (toolsHostWindow === host) {
      hideToolsMenu();
    }
  };
  host.on('move', toolsHostDismiss);
  host.on('resize', toolsHostDismiss);

  ensureToolsMenuView()
    .then(async () => {
      if (!toolsOpen || toolsHostWindow !== host || host.isDestroyed() || !toolsViewAlive()) {
        return;
      }
      await pushLocalIntel();
      if (!toolsOpen || toolsHostWindow !== host || host.isDestroyed() || !toolsViewAlive()) {
        return;
      }
      toolsMenuView.setBounds({ x, y, width, height: Math.min(520, maxH) });
      let measured = initialH;
      try {
        measured = await toolsMenuView.webContents.executeJavaScript(`(() => new Promise((resolve) => {
          requestAnimationFrame(() => {
            const menu = document.getElementById('agent-tools-menu');
            if (!menu) {
              resolve(0);
              return;
            }
            resolve(Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height)));
          });
        }))()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!toolsOpen || toolsHostWindow !== host || !toolsViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 120), maxH);
      toolsMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(toolsMenuView);
      toolsMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open tools menu:', error);
      hideToolsMenu();
    });
}

function shortcutsViewAlive() {
  return Boolean(shortcutsMenuView && !shortcutsMenuView.webContents.isDestroyed());
}

function raiseShortcutsMenu() {
  if (!shortcutsOpen || !shortcutsViewAlive() || !shortcutsHostWindow || shortcutsHostWindow.isDestroyed()) {
    return;
  }
  shortcutsHostWindow.contentView.addChildView(shortcutsMenuView);
}

function detachShortcutsHost() {
  if (shortcutsHostWindow && !shortcutsHostWindow.isDestroyed() && shortcutsHostDismiss) {
    shortcutsHostWindow.removeListener('move', shortcutsHostDismiss);
    shortcutsHostWindow.removeListener('resize', shortcutsHostDismiss);
  }
  shortcutsHostWindow = null;
  shortcutsHostDismiss = null;
}

function notifyChromeShortcutsClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:shortcuts-closed');
    }
  }
}

function hideShortcutsMenu(options = {}) {
  const notify = options.notify !== false;
  shortcutsOpen = false;
  const host = shortcutsHostWindow;
  detachShortcutsHost();
  if (shortcutsViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(shortcutsMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeShortcutsClosed();
  }
}

function ensureShortcutsMenuView() {
  if (shortcutsViewAlive()) {
    return shortcutsMenuReady;
  }

  shortcutsMenuView = new WebContentsView({
    webPreferences: chromeWebPreferences,
  });
  shortcutsMenuView.setBackgroundColor('#292a2d');
  shortcutsMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchHiddenScrollbars(shortcutsMenuView.webContents);
  attachChromeContextMenu(shortcutsMenuView.webContents);
  shortcutsMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
        shortcutsOpen &&
        shortcutsViewAlive() &&
        !shortcutsMenuView.webContents.isFocused()
      ) {
        hideShortcutsMenu();
        hideProfileMenu();
      }
    }, 0);
  });
  shortcutsMenuReady = shortcutsMenuView.webContents.loadFile(path.join(__dirname, 'shortcuts-menu.html'));
  return shortcutsMenuReady;
}

function showShortcutsMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = MENU_DROPDOWN_WIDTH;
  const btnBottom = Number(anchor && anchor.bottom);
  const btnLeft = Number(anchor && anchor.left);
  const bottom = Number.isFinite(btnBottom)
    ? btnBottom
    : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT + BOOKMARKS_BAR_HEIGHT;
  const left = Number.isFinite(btnLeft) ? btnLeft : 8;
  let x = Math.round(left);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(160, contentHeight - y - 8);
  const initialH = Math.min(360, maxH);

  shortcutsHostWindow = host;
  shortcutsOpen = true;
  shortcutsHostDismiss = () => {
    if (shortcutsHostWindow === host) {
      hideShortcutsMenu();
      hideProfileMenu();
    }
  };
  host.on('move', shortcutsHostDismiss);
  host.on('resize', shortcutsHostDismiss);

  ensureShortcutsMenuView()
    .then(async () => {
      if (!shortcutsOpen || shortcutsHostWindow !== host || host.isDestroyed() || !shortcutsViewAlive()) {
        return;
      }
      shortcutsMenuView.setBounds({ x, y, width, height: Math.min(420, maxH) });
      let measured = initialH;
      try {
        measured = await shortcutsMenuView.webContents.executeJavaScript(`(() => {
          const menu = document.getElementById('agent-shortcuts-menu');
          if (!menu) {
            return 0;
          }
          return Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height));
        })()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!shortcutsOpen || shortcutsHostWindow !== host || !shortcutsViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 120), maxH);
      shortcutsMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(shortcutsMenuView);
      shortcutsMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open shortcuts menu:', error);
      hideShortcutsMenu();
      hideProfileMenu();
    });
}

function profileViewAlive() {
  return Boolean(profileMenuView && !profileMenuView.webContents.isDestroyed());
}

function raiseProfileMenu() {
  if (!profileOpen || !profileViewAlive() || !profileHostWindow || profileHostWindow.isDestroyed()) {
    return;
  }
  profileHostWindow.contentView.addChildView(profileMenuView);
}

function detachProfileHost() {
  if (profileHostWindow && !profileHostWindow.isDestroyed() && profileHostDismiss) {
    profileHostWindow.removeListener('move', profileHostDismiss);
    profileHostWindow.removeListener('resize', profileHostDismiss);
  }
  profileHostWindow = null;
  profileHostDismiss = null;
}

function notifyChromeProfileClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:profile-closed');
    }
  }
}

function hideProfileMenu(options = {}) {
  const notify = options.notify !== false;
  profileOpen = false;
  const host = profileHostWindow;
  detachProfileHost();
  if (profileViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(profileMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeProfileClosed();
  }
}

function ensureProfileMenuView() {
  if (profileViewAlive()) {
    return profileMenuReady;
  }

  profileMenuView = new WebContentsView({
    webPreferences: chromeWebPreferences,
  });
  profileMenuView.setBackgroundColor('#292a2d');
  profileMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchHiddenScrollbars(profileMenuView.webContents);
  attachChromeContextMenu(profileMenuView.webContents);
  profileMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
        profileOpen &&
        profileViewAlive() &&
        !profileMenuView.webContents.isFocused()
      ) {
        hideProfileMenu();
      }
    }, 0);
  });
  profileMenuReady = profileMenuView.webContents.loadFile(path.join(__dirname, 'profile-menu.html'));
  return profileMenuReady;
}

function showProfileMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = MENU_DROPDOWN_WIDTH;
  const btnBottom = Number(anchor && anchor.bottom);
  const btnRight = Number(anchor && anchor.right);
  const bottom = Number.isFinite(btnBottom) ? btnBottom : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;
  const right = Number.isFinite(btnRight) ? btnRight : contentWidth - 8;
  let x = Math.round(right - width);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(160, contentHeight - y - 8);
  const initialH = Math.min(280, maxH);

  profileHostWindow = host;
  profileOpen = true;
  profileHostDismiss = () => {
    if (profileHostWindow === host) {
      hideProfileMenu();
    }
  };
  host.on('move', profileHostDismiss);
  host.on('resize', profileHostDismiss);

  ensureProfileMenuView()
    .then(async () => {
      if (!profileOpen || profileHostWindow !== host || host.isDestroyed() || !profileViewAlive()) {
        return;
      }
      profileMenuView.setBounds({ x, y, width, height: Math.min(360, maxH) });
      let measured = initialH;
      try {
        measured = await profileMenuView.webContents.executeJavaScript(`(() => {
          const menu = document.getElementById('agent-profile-menu');
          if (!menu) {
            return 0;
          }
          return Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height));
        })()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!profileOpen || profileHostWindow !== host || !profileViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 120), maxH);
      profileMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(profileMenuView);
      profileMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open profile menu:', error);
      hideProfileMenu();
    });
}

function downloadsViewAlive() {
  return Boolean(downloadsMenuView && !downloadsMenuView.webContents.isDestroyed());
}

function detachDownloadsHost() {
  if (downloadsHostWindow && !downloadsHostWindow.isDestroyed() && downloadsHostDismiss) {
    downloadsHostWindow.removeListener('move', downloadsHostDismiss);
    downloadsHostWindow.removeListener('resize', downloadsHostDismiss);
  }
  downloadsHostWindow = null;
  downloadsHostDismiss = null;
}

function notifyChromeDownloadsClosed() {
  for (const win of chromeWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:downloads-closed');
    }
  }
}

function hideDownloadsMenu(options = {}) {
  const notify = options.notify !== false;
  downloadsOpen = false;
  const host = downloadsHostWindow;
  detachDownloadsHost();
  if (downloadsViewAlive() && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(downloadsMenuView);
    } catch {
      // View may already have been detached.
    }
  }
  if (notify) {
    notifyChromeDownloadsClosed();
  }
}

function ensureDownloadsMenuView() {
  if (downloadsViewAlive()) {
    return downloadsMenuReady;
  }

  downloadsMenuView = new WebContentsView({
    webPreferences: downloadsWebPreferences,
  });
  downloadsMenuView.setBackgroundColor('#292a2d');
  downloadsMenuView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchHiddenScrollbars(downloadsMenuView.webContents);
  attachChromeContextMenu(downloadsMenuView.webContents);
  downloadsMenuView.webContents.on('blur', () => {
    setTimeout(() => {
      if (
        overlayBlurShouldHide() &&
        downloadsOpen &&
        downloadsViewAlive() &&
        !downloadsMenuView.webContents.isFocused()
      ) {
        hideDownloadsMenu();
      }
    }, 0);
  });
  downloadsMenuReady = downloadsMenuView.webContents.loadFile(path.join(__dirname, 'downloads-menu.html'));
  return downloadsMenuReady;
}

function showDownloadsMenu(anchor, host) {
  hideOverflowMenu({ notify: false });
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  if (!host || host.isDestroyed()) {
    return;
  }

  const { width: contentWidth, height: contentHeight } = host.getContentBounds();
  const width = Math.min(400, Math.max(MENU_DROPDOWN_WIDTH, contentWidth - 16));
  const btnBottom = Number(anchor && anchor.bottom);
  const btnRight = Number(anchor && anchor.right);
  const bottom = Number.isFinite(btnBottom) ? btnBottom : TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;
  const right = Number.isFinite(btnRight) ? btnRight : contentWidth - 8;
  let x = Math.round(right - width);
  let y = Math.round(bottom + 4);
  x = Math.max(8, Math.min(x, Math.max(8, contentWidth - width - 8)));
  if (y < 8) {
    y = 8;
  }
  const maxH = Math.max(180, contentHeight - y - 8);
  const initialH = Math.min(420, maxH);

  downloadsHostWindow = host;
  downloadsOpen = true;
  downloadsHostDismiss = () => {
    if (downloadsHostWindow === host) {
      hideDownloadsMenu();
    }
  };
  host.on('move', downloadsHostDismiss);
  host.on('resize', downloadsHostDismiss);

  ensureDownloadsMenuView()
    .then(async () => {
      if (!downloadsOpen || downloadsHostWindow !== host || host.isDestroyed() || !downloadsViewAlive()) {
        return;
      }
      broadcastDownloads();
      downloadsMenuView.setBounds({ x, y, width, height: Math.min(480, maxH) });
      let measured = initialH;
      try {
        measured = await downloadsMenuView.webContents.executeJavaScript(`(() => {
          const menu = document.getElementById('agent-downloads-menu');
          if (!menu) {
            return 0;
          }
          return Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height));
        })()`);
      } catch {
        // Keep the initial height if measurement fails.
      }
      if (!downloadsOpen || downloadsHostWindow !== host || !downloadsViewAlive()) {
        return;
      }
      const raw = Number(measured);
      const height = Math.min(Math.max(raw >= 80 ? raw : initialH, 160), maxH);
      downloadsMenuView.setBounds({ x, y, width, height });
      host.contentView.addChildView(downloadsMenuView);
      downloadsMenuView.webContents.focus();
    })
    .catch((error) => {
      console.error('Failed to open downloads menu:', error);
      hideDownloadsMenu();
    });
}

function revealDownloadsMenu(anchor) {
  const host = mainWindow;
  if (!host || host.isDestroyed()) {
    return;
  }
  if (downloadsOpen && downloadsViewAlive()) {
    broadcastDownloads();
    return;
  }
  showDownloadsMenu(anchor || null, host);
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

  if (lower === 'c' || lower === 'v' || lower === 'x' || lower === 'a') {
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
    revealDownloadsMenu();
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
      microphone: false,
    });
    fitBrowserView();
    return;
  }

  const url = guest.getURL();
  const flags = navigationFlags(guest);
  sendToChrome('agent:url-changed', {
    url: displayGuestUrl(url),
    canGoBack: flags.canGoBack,
    canGoForward: flags.canGoForward,
    isLoading: guest.isLoading(),
    bookmarked: isCurrentUrlBookmarked(),
    bookmarksBar: isStartPage(url),
    microphone: Boolean(views.get(activeTabId)?.microphone),
  });
  if (siteOpen && siteViewAlive() && !siteMenuView.webContents.isDestroyed()) {
    siteMenuView.webContents.send('agent:site-info', snapshotSiteInfo());
  }
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

  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false };
  }

  const searchQuery = parseAgentSearchTarget(rawUrl);
  if (
    isDownloadsFile(guest.getURL()) ||
    isExtensionsFile(guest.getURL()) ||
    isSettingsFile(guest.getURL()) ||
    isMemoryBridgeFile(guest.getURL()) ||
    views.get(activeTabId)?.kind === 'downloads' ||
    views.get(activeTabId)?.kind === 'extensions' ||
    views.get(activeTabId)?.kind === 'settings' ||
    views.get(activeTabId)?.kind === 'memory'
  ) {
  if (searchQuery) {
    const nextUrl = searchUrlFor(searchQuery);
    const tabId = createGuestTab(nextUrl);
    return { ok: Boolean(tabId), url: nextUrl };
  }
    const nextUrl = sanitizeUrl(rawUrl);
    if (!nextUrl) {
      return { ok: false };
    }
    const tabId = createGuestTab(nextUrl);
    return { ok: Boolean(tabId), url: nextUrl };
  }

  if (searchQuery) {
    const nextUrl = searchUrlFor(searchQuery);
    if (!nextUrl) {
      return { ok: false };
    }
    await guest.loadURL(nextUrl);
    return { ok: true, url: nextUrl };
  }

  const url = sanitizeUrl(rawUrl);
  if (!url) {
    return { ok: false };
  }

  await guest.loadURL(url);
  return { ok: true, url };
});

ipcMain.handle('agent:local-search', async (event, rawQuery) => {
  if (!isSearchSender(event) && !isChromeSender(event)) {
    return { ok: false, error: 'forbidden', results: [] };
  }
  return runLocalScraper(rawQuery);
});

ipcMain.handle('agent:clipboard-read', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false, text: '' };
  }
  return { ok: true, text: clipboard.readText() };
});

ipcMain.handle('agent:clipboard-write', async (event, text) => {
  if (!isChromeSender(event) || typeof text !== 'string') {
    return { ok: false };
  }
  clipboard.writeText(text.slice(0, 100000));
  return { ok: true };
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
      favicon: await fetchFaviconDataUrl(url, tabFavicons.get(activeTabId)?.[0] || ''),
    });
    nextBookmarkId += 1;
  }

  broadcastBookmarks();
  broadcastBrowserState();
  return { ok: true, bookmarked: isCurrentUrlBookmarked() };
});

ipcMain.handle('agent:favicon', async (event, rawUrl) => {
  if ((!isChromeSender(event) && !isSearchSender(event)) || typeof rawUrl !== 'string') {
    return { ok: false, dataUrl: '' };
  }
  const dataUrl = await fetchFaviconDataUrl(rawUrl);
  return { ok: Boolean(dataUrl), dataUrl };
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
  if ((!isChromeSender(event) && !isDownloadsSender(event)) || typeof downloadId !== 'string') {
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
  const hunter = hunterJobs.get(downloadId);
  if (hunter) {
    hunterJobs.delete(downloadId);
    if (typeof hunter.kill === 'function') {
      killHunterProcess(hunter);
    } else if (typeof hunter.destroy === 'function') {
      try {
        hunter.destroy();
      } catch {
        // Stream may already be closed.
      }
    }
  }

  const record = sessionDownloads.get(downloadId);
  if (record && record.state === 'progressing') {
    record.state = 'cancelled';
    broadcastDownloads();
  }
  return { ok: true };
});

ipcMain.handle('agent:downloads-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showDownloadsMenu(anchor, host);
  } else {
    hideDownloadsMenu();
  }
  return { ok: true, open: downloadsOpen };
});

ipcMain.handle('agent:downloads-open', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  const host = chromeWindowFromEvent(event) || mainWindow;
  showDownloadsMenu(null, host);
  return { ok: true, open: downloadsOpen };
});

ipcMain.handle('agent:extensions-open', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  const tabId = openExtensionsTab();
  return { ok: Boolean(tabId), tabId };
});

ipcMain.handle('agent:settings-open', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  hideOverflowMenu({ notify: false });
  hideShieldMenu({ notify: false });
  hideSiteMenu({ notify: false });
  hideToolsMenu({ notify: false });
  hideShortcutsMenu({ notify: false });
  hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  utilityOpen = false;
  settingsOpen = false;
  const tabId = openSettingsTab();
  fitBrowserView();
  return { ok: Boolean(tabId), tabId };
});

ipcMain.handle('agent:downloads-get', async (event) => {
  if (!isChromeSender(event) && !isDownloadsSender(event)) {
    return { ok: false, items: [] };
  }
  return {
    ok: true,
    items: [...sessionDownloads.values()].map(serializeDownload),
  };
});

ipcMain.handle('agent:download-open', async (event, downloadId) => {
  if ((!isChromeSender(event) && !isDownloadsSender(event)) || typeof downloadId !== 'string') {
    return { ok: false };
  }
  const record = sessionDownloads.get(downloadId);
  const savePath = record && typeof record.savePath === 'string' ? record.savePath : '';
  if (!record || record.state !== 'completed' || !savePath || !isPathInsideDownloads(savePath)) {
    return { ok: false };
  }
  if (!fs.existsSync(savePath)) {
    return { ok: false, error: 'File is missing.' };
  }
  const error = await shell.openPath(savePath);
  return { ok: !error, error: error || '' };
});

ipcMain.handle('agent:menu-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showOverflowMenu(anchor, host);
  } else {
    hideOverflowMenu();
  }
  return { ok: true, open: menuOpen };
});

ipcMain.handle('agent:shield-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showShieldMenu(anchor, host);
  } else {
    hideShieldMenu();
  }
  return { ok: true, open: shieldOpen, settings: snapshotSettings(), stats: snapshotSecurityStats() };
});

ipcMain.handle('agent:site-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showSiteMenu(anchor, host);
  } else {
    hideSiteMenu();
  }
  return { ok: true, open: siteOpen, ...snapshotSiteInfo() };
});

ipcMain.handle('agent:tools-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showToolsMenu(anchor, host);
  } else {
    hideToolsMenu();
  }
  return { ok: true, open: toolsOpen };
});

ipcMain.handle('agent:shortcuts-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showShortcutsMenu(anchor, host);
  } else {
    hideShortcutsMenu();
    hideProfileMenu();
  }
  return { ok: true, open: shortcutsOpen };
});

ipcMain.handle('agent:profile-panel', async (event, payload) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  const open = typeof payload === 'object' && payload !== null ? Boolean(payload.open) : Boolean(payload);
  const anchor = payload && typeof payload === 'object' ? payload.anchor : null;
  const host = chromeWindowFromEvent(event) || mainWindow;
  if (open) {
    utilityOpen = false;
    showProfileMenu(anchor, host);
  } else {
    hideProfileMenu();
  }
  return { ok: true, open: profileOpen };
});

ipcMain.handle('agent:tools-action', async (event, action) => {
  if ((!isChromeSender(event) && !isExtensionsSender(event)) || typeof action !== 'string') {
    return { ok: false };
  }
  hideToolsMenu();
  if (action === 'downloads') {
    revealDownloadsMenu();
    return { ok: true };
  }
  if (action === 'memory-bridge') {
    openMemoryBridgeTab();
    return { ok: true };
  }
  if (action === 'shield' || action === 'ghost' || action === 'settings' || action === 'models') {
    sendToChrome('agent:tools-command', { action });
    return { ok: true };
  }
  if (action === 'translate') {
    popupTranslateChooser(getGuestWebContents());
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('agent:site-info', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  return { ok: true, ...snapshotSiteInfo() };
});

ipcMain.on('agent:mic-capture', (event, payload) => {
  const tabId = tabIdFromWebContents(event.sender);
  if (!tabId) {
    return;
  }
  setTabMicrophone(tabId, Boolean(payload && payload.active));
});

ipcMain.handle('agent:mic-stop', async (event) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  return stopTabMicrophone(activeTabId);
});

ipcMain.handle('agent:utility-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  utilityOpen = Boolean(open);
  if (utilityOpen) {
    hideOverflowMenu();
    hideShieldMenu({ notify: false });
    hideSiteMenu({ notify: false });
    hideToolsMenu({ notify: false });
    hideShortcutsMenu({ notify: false });
    hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
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
    case 'settings':
      openSettingsTab();
      hideOverflowMenu();
      return { ok: true };
    case 'exit':
      triggerExcommunicado();
      return { ok: true };
    case 'gemini':
    case 'lens':
      result = { ok: true, openAi: true, summarize: action === 'lens' };
      break;
    case 'translate':
      hideOverflowMenu();
      popupTranslateChooser(getGuestWebContents());
      return { ok: true };
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
    hideShieldMenu();
    hideSiteMenu();
    hideToolsMenu();
    hideShortcutsMenu();
    hideProfileMenu();
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
  lastIntelModels = intel.models.map((item) => serializeLocalModel(item)).filter(Boolean);
  lastIntelAgents = Array.isArray(intel.agents) ? intel.agents : [];
  if (selectedLocalModel) {
    const match = intel.models.find((item) => item.id === selectedLocalModel.id);
    selectedLocalModel = match || { ...selectedLocalModel, live: false, ready: selectedLocalModel.kind !== 'file' ? false : selectedLocalModel.ready };
  }
  return {
    models: lastIntelModels,
    agents: lastIntelAgents,
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
      sendToKind('extensions', 'agent:local-intel', snapshot);
      sendToKind('settings', 'agent:local-intel', snapshot);
      sendToKind('useful', 'agent:local-intel', snapshot);
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

function isAbortLike(error) {
  const name = error && typeof error === 'object' ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

function chatReachError(model, fallback) {
  const source = model?.source || model?.runtime || 'the local server';
  const port = Number(model?.port) || 0;
  const where = port ? `${source} on 127.0.0.1:${port}` : source;
  return new Error(fallback || `Could not reach ${where}. Is the app running, and is a model loaded?`);
}

async function fetchChatResponse(url, init, timeoutMs, model, kind) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortLike(error)) {
      throw new Error(
        kind === 'cloud'
          ? 'The cloud model timed out. Check the API key and network.'
          : `The local model timed out. Is ${model?.source || 'Ollama or LM Studio'} running, and is a model loaded?`,
      );
    }
    if (kind === 'cloud') {
      throw new Error('Could not reach the cloud model. Check the API key and network.');
    }
    throw chatReachError(model);
  }
}

async function requestOllamaChat(model, messages) {
  const response = await fetchChatResponse(
    model.chatUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.name,
        messages,
        stream: false,
      }),
    },
    LOCAL_CHAT_TIMEOUT_MS,
    model,
    'local',
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Ollama HTTP ${response.status}`);
  }
  const content = body?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('The local model returned an empty reply.');
  }
  return content.trim();
}

async function requestLocalOpenAiChat(model, messages) {
  const response = await fetchChatResponse(
    model.chatUrl,
    {
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
    },
    LOCAL_CHAT_TIMEOUT_MS,
    model,
    'local',
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body.error?.message === 'string'
        ? body.error.message
        : `Local server HTTP ${response.status}`;
    throw new Error(message);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('The local model returned an empty reply.');
  }
  return content.trim();
}

function localChatTargetReady(target) {
  return Boolean(
    target &&
      target.chatUrl &&
      (target.kind === 'ollama' || target.kind === 'openai-compat'),
  );
}

async function requestChat(apiKey, messages) {
  const keyed = await withAgentMemory(messages);
  const selected = selectedLocalModel && serializeLocalModel(selectedLocalModel);
  const target = resolveLocalChatTarget(selected, lastIntelModels, lastIntelAgents);
  const canUseLocal = localChatTargetReady(target);

  if (selected && !canUseLocal) {
    if (selected.kind === 'file') {
      throw new Error(
        'Selected model is a weight file, not a running chat server. Start Ollama or LM Studio and pick a live model.',
      );
    }
    throw new Error(
      'The selected local model is not reachable. Start Ollama or LM Studio, or pick a live model in Settings → Agents.',
    );
  }

  if (canUseLocal && (selected || !apiKey)) {
    if (target.kind === 'ollama') {
      return requestOllamaChat(target, keyed);
    }
    return requestLocalOpenAiChat(target, keyed);
  }

  if (!apiKey) {
    throw new Error('Select a live local model or enter a session API key.');
  }
  return requestOpenAiChat(apiKey, keyed);
}

async function extractVisiblePageText() {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return '';
  }

  const pageUrl = guest.getURL();
  if (!pageUrl || isInternalGuestUrl(pageUrl)) {
    return '';
  }

  let text = '';
  try {
    text = await Promise.race([
      guest.executeJavaScript(
        `(function () {
          try {
            return document.body && document.body.innerText ? document.body.innerText : '';
          } catch (error) {
            return '';
          }
        })()`,
        true,
      ),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), PAGE_TEXT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return '';
  }

  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/[ \t]+\n/g, '\n').trim().slice(0, PAGE_TEXT_LIMIT);
}

async function requestOpenAiChat(apiKey, messages) {
  const response = await fetchChatResponse(
    OPENAI_CHAT_URL,
    {
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
    },
    CLOUD_CHAT_TIMEOUT_MS,
    null,
    'cloud',
  );

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
    throw new Error('The AI returned an empty reply.');
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

function currentUsefulIntel() {
  return {
    models: lastIntelModels,
    agents: lastIntelAgents,
    selectedId: selectedLocalModel?.id || null,
  };
}

function snapshotUsefulLinks(intel, extra = {}) {
  const merged = usefulLinksLive.mergeCatalog(usefulLinkSeed, usefulLinksLiveCache.sections, sessionUsefulUserSections);
  const sections = merged.map((section) => {
    const extras = sessionUsefulExtraLinks.get(section.id) || [];
    return extras.length ? { ...section, links: [...extras, ...section.links].slice(0, 40) } : section;
  });
  return {
    ok: true,
    bound: usefulLinksLive.boundLine(intel || currentUsefulIntel()),
    status: extra.status || usefulLinksLiveCache.error || '',
    fetchedAt: usefulLinksLiveCache.fetchedAt || 0,
    sections,
  };
}

async function searchGithubRepos(query, limit, options = {}) {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', String(query || 'stars:>1000'));
  const sort = options.sort === 'stars' || options.sort === 'created' ? options.sort : 'updated';
  url.searchParams.set('sort', sort);
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(Math.min(8, Math.max(3, Number(limit) || 6))));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Agent-Browser',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  const body = await response.json();
  return (Array.isArray(body.items) ? body.items : [])
    .map((item) =>
      usefulLinksLive.normalizeLink({
        name: item.full_name,
        url: item.html_url,
        note: String(item.description || '').slice(0, 180),
      }),
    )
    .filter(Boolean);
}

async function refreshUsefulLinksCatalog(options = {}) {
  const intel = options.intel || currentUsefulIntel();
  const signature = usefulLinksLive.catalogSignature(sessionUsefulUserSections);
  const fresh = Date.now() - (usefulLinksLiveCache.fetchedAt || 0) < 180000;
  if (!options.force && fresh && usefulLinksLiveCache.signature === signature) {
    const snapshot = snapshotUsefulLinks(intel);
    sendToKind('useful', 'agent:useful-links', snapshot);
    return snapshot;
  }
  const queries = usefulLinksLive.defaultLiveQueries();
  const live = [];
  let error = '';
  try {
    for (const item of queries) {
      const links = await searchGithubRepos(item.query, item.perPage, { sort: item.sort });
      if (links.length) {
        live.push({
          id: item.id,
          title: item.title,
          source: 'live',
          query: item.query,
          links,
        });
      }
    }
    for (const section of sessionUsefulUserSections) {
      const query = usefulLinksLive.keywordQuery(section.query || section.title);
      if (!query) {
        continue;
      }
      const links = await searchGithubRepos(query, 8, { sort: 'stars' });
      section.source = 'live';
      section.query = query;
      section.links = links;
    }
    usefulLinksLiveCache = { signature, fetchedAt: Date.now(), sections: live, error: '' };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'GitHub search failed.';
    usefulLinksLiveCache = {
      signature,
      fetchedAt: usefulLinksLiveCache.fetchedAt || Date.now(),
      sections: usefulLinksLiveCache.sections || [],
      error,
    };
  }
  const snapshot = snapshotUsefulLinks(intel, {
    status: error
      ? `Live fetch failed (${error}). Seed and your added links stay.`
      : 'Updated from GitHub just now.',
  });
  sendToKind('useful', 'agent:useful-links', snapshot);
  return snapshot;
}

ipcMain.handle('agent:local-intel-get', async (event) => {
  if (!isChromeSender(event) && !isExtensionsSender(event) && !isUsefulLinksSender(event)) {
    return { ok: false };
  }
  const snapshot = await pushLocalIntel();
  return { ok: true, intel: snapshot };
});

ipcMain.handle('agent:useful-links-get', async (event) => {
  if (!isUsefulLinksSender(event)) {
    return { ok: false };
  }
  if (!usefulLinksLiveCache.sections.length) {
    return refreshUsefulLinksCatalog({ force: false });
  }
  return snapshotUsefulLinks(currentUsefulIntel());
});

ipcMain.handle('agent:useful-links-refresh', async (event) => {
  if (!isUsefulLinksSender(event)) {
    return { ok: false };
  }
  return refreshUsefulLinksCatalog({ force: true });
});

ipcMain.handle('agent:useful-links-add-section', async (event, payload) => {
  if (!isUsefulLinksSender(event) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }
  const title = usefulLinksLive.keywordQuery(payload.title);
  if (!title) {
    return { ok: false, error: 'invalid-section', ...snapshotUsefulLinks(currentUsefulIntel()) };
  }
  let links = [];
  let error = '';
  try {
    links = await searchGithubRepos(title, 8, { sort: 'stars' });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'GitHub search failed.';
  }
  const section = usefulLinksLive.normalizeSection(
    {
      id: `user-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now()}-${Date.now()}`,
      title,
      source: 'live',
      query: title,
      links,
    },
    `user-${sessionUsefulUserSections.length + 1}`,
  );
  if (!section) {
    return { ok: false, error: 'invalid-section', ...snapshotUsefulLinks(currentUsefulIntel()) };
  }
  sessionUsefulUserSections.unshift(section);
  usefulLinksLiveCache.signature = '';
  const snapshot = snapshotUsefulLinks(currentUsefulIntel(), {
    status: error
      ? `Live fetch failed (${error}). The column is empty until GitHub answers.`
      : links.length
        ? `Live column for “${title}” — ${links.length} repos from GitHub.`
        : `GitHub returned no repos for “${title}”.`,
  });
  sendToKind('useful', 'agent:useful-links', snapshot);
  return snapshot;
});

ipcMain.handle('agent:useful-links-add-link', async (event, payload) => {
  if (!isUsefulLinksSender(event) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }
  const link = usefulLinksLive.normalizeLink({
    name: payload.name,
    url: payload.url,
    note: payload.note,
  });
  if (!link) {
    return { ok: false, error: 'invalid-link', ...snapshotUsefulLinks(currentUsefulIntel()) };
  }
  const sectionId = String(payload.sectionId || '');
  if (!sectionId) {
    return { ok: false, error: 'invalid-section', ...snapshotUsefulLinks(currentUsefulIntel()) };
  }
  const extras = sessionUsefulExtraLinks.get(sectionId) || [];
  sessionUsefulExtraLinks.set(sectionId, [link, ...extras].slice(0, 40));
  const snapshot = snapshotUsefulLinks(currentUsefulIntel(), { status: 'Link added for this RAM session.' });
  sendToKind('useful', 'agent:useful-links', snapshot);
  return snapshot;
});

ipcMain.handle('agent:useful-links-open', async (event, payload) => {
  if (!isUsefulLinksSender(event) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }
  const safeUrl = sanitizeUrl(payload.url);
  if (!safeUrl) {
    return { ok: false };
  }
  const tabId = createGuestTab(safeUrl);
  return { ok: Boolean(tabId), tabId };
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

function broadcastLocalIntelSelection(selectedId) {
  const snapshot = {
    models: lastIntelModels,
    agents: lastIntelAgents,
    selectedId: selectedId || null,
  };
  sendToChrome('agent:local-intel', snapshot);
  sendToKind('settings', 'agent:local-intel', snapshot);
  sendToKind('extensions', 'agent:local-intel', snapshot);
  sendToKind('useful', 'agent:local-intel', snapshot);
  return snapshot;
}

ipcMain.handle('agent:local-intel-select', async (event, id) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }
  if (id === null || id === '' || id === 'cloud') {
    selectedLocalModel = null;
    return { ok: true, intel: broadcastLocalIntelSelection(null) };
  }
  if (typeof id !== 'string' || id.length > 480) {
    return { ok: false, error: 'invalid model' };
  }
  let match = lastIntelModels.find((item) => item.id === id);
  if (!match) {
    const snapshot = await buildLocalIntelSnapshot();
    match = snapshot.models.find((item) => item.id === id);
    if (!match) {
      return { ok: false, error: 'model not found' };
    }
    selectedLocalModel = match;
    snapshot.selectedId = match.id;
    sendToChrome('agent:local-intel', snapshot);
    sendToKind('settings', 'agent:local-intel', snapshot);
    sendToKind('extensions', 'agent:local-intel', snapshot);
    sendToKind('useful', 'agent:local-intel', snapshot);
    return { ok: true, intel: snapshot };
  }
  selectedLocalModel = match;
  return { ok: true, intel: broadcastLocalIntelSelection(match.id) };
});

ipcMain.handle('agent:local-intel-pick', async (event, kind) => {
  if (!isChromeSender(event) || !mainWindow || mainWindow.isDestroyed()) {
    return { ok: false };
  }

  const wantDir = kind === 'dir';
  const result = await dialog.showOpenDialog(mainWindow, {
    title: wantDir ? 'Choose a model folder' : 'Choose a local model file',
    properties: wantDir ? ['openDirectory'] : ['openFile'],
    filters: wantDir
      ? undefined
      : [
          { name: 'LLM weights', extensions: ['gguf', 'ggml', 'bin', 'onnx', 'safetensors', 'pt', 'pth'] },
          { name: 'All files', extensions: ['*'] },
        ],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: true, canceled: true };
  }

  const picked = rememberUserPath(result.filePaths[0], wantDir ? sessionLocalDirs : sessionLocalFiles);
  if (!picked) {
    return { ok: false, error: 'invalid path' };
  }

  const snapshot = await pushLocalIntel();
  startLocalIntelWatch();
  if (!wantDir && snapshot?.models) {
    const match = snapshot.models.find((item) => item.path === picked);
    if (match) {
      selectedLocalModel = match;
      snapshot.selectedId = match.id;
      sendToChrome('agent:local-intel', snapshot);
      sendToKind('settings', 'agent:local-intel', snapshot);
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
    searchEngines: SEARCH_ENGINE_LIST.map((item) => ({ id: item.id, name: item.name, base: item.base, icon: item.icon })),
    extensionStates: Object.fromEntries(sessionExtensionState),
    panicShortcut: process.platform === 'darwin' ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
    agentBridge: privacySettings.agentBridge,
    agentBridgeUrl: listen ? `http://${listen.host}:${listen.port}/v1` : '',
    agentBridgeToken: privacySettings.agentBridge ? agentBridgeToken : '',
    sessionApiKey: sessionApiKeyValue,
    ghostNetwork: privacySettings.ghostNetwork,
    mediaHunter: Boolean(privacySettings.mediaHunter),
    blockMedia: privacySettings.blockMedia !== false,
    canvasPoisoner: Boolean(privacySettings.canvasPoisoner),
    siyuanBridge: Boolean(privacySettings.siyuanBridge),
    brain: brainChoice(),
    memoryBridge: snapshotMemoryBridge(),
    humanJitter: Boolean(privacySettings.humanJitter),
    deadManSwitch: Boolean(privacySettings.deadManSwitch),
    web3Shield: Boolean(privacySettings.web3Shield),
    shadowDomPierce: Boolean(privacySettings.shadowDomPierce),
    markdownDom: Boolean(privacySettings.markdownDom),
    uiCodeExtract: Boolean(privacySettings.uiCodeExtract),
    infiniteScroll: Boolean(privacySettings.infiniteScroll),
    tableParser: Boolean(privacySettings.tableParser),
    xhrHunter: Boolean(privacySettings.xhrHunter),
    jsonFormFill: Boolean(privacySettings.jsonFormFill),
    proxyRotate: Boolean(privacySettings.proxyRotate),
    webglInspector: Boolean(privacySettings.webglInspector),
    mediaSourceReveal: Boolean(privacySettings.mediaSourceReveal),
    n8nWebhook: Boolean(privacySettings.n8nWebhook),
    lmStudioPort: Boolean(privacySettings.lmStudioPort),
    memoryBlockSync: Boolean(privacySettings.memoryBlockSync),
    cursorIdeBridge: Boolean(privacySettings.cursorIdeBridge),
    tabOrchestrator: Boolean(privacySettings.tabOrchestrator),
    headlessMode: Boolean(privacySettings.headlessMode),
    inputSimulator: Boolean(privacySettings.inputSimulator),
    rateLimitGuard: Boolean(privacySettings.rateLimitGuard),
    sandboxIsolator: Boolean(privacySettings.sandboxIsolator),
    excommunicadoLock: Boolean(privacySettings.excommunicadoLock),
    ...catalogTools.snapshot(privacySettings),
    proxyUrl: privacySettings.ghostNetwork ? SOCKS5_PROXY : '',
    blockedRequestCount,
    securityStats: snapshotSecurityStats(),
  };
}

function broadcastSettings() {
  const settings = snapshotSettings();
  sendToChrome('agent:settings', settings);
  sendToKind('extensions', 'agent:settings', settings);
  sendToKind('settings', 'agent:settings', settings);
  return settings;
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
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const engine = body?.searchEngine || searchEngineIdForAgent(agentId);
    const requested = query
      ? searchUrlFor(query, engine)
      : typeof body?.url === 'string'
        ? body.url
        : 'about:blank';
    if (query && !requested) {
      return { ok: false, error: 'invalid-query' };
    }
    const tabId = createGuestTab(requested, { activate, owner });
    if (!tabId) {
      return failTab('cannot-create-tab');
    }
    return { ok: true, tab: serializeTab(tabId), searchEngine: normalizeSearchEngineId(engine) || searchEngineIdForAgent(agentId) };
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
    const entry = views.get(tabId);
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const engine = body?.searchEngine || searchEngineIdForAgent(entry?.owner);
    const url = query ? searchUrlFor(query, engine) : sanitizeUrl(body?.url);
    if (!guest) {
      return failTab('tab-not-found');
    }
    if (!url) {
      return { ok: false, error: query ? 'invalid-query' : 'invalid-url' };
    }
    if (entry?.kind === 'downloads' || entry?.kind === 'extensions' || entry?.kind === 'settings' || entry?.kind === 'memory') {
      const nextId = createGuestTab(url, { owner: entry.owner });
      return nextId ? { ok: true, tab: serializeTab(nextId) } : failTab('cannot-create-tab');
    }
    await guest.loadURL(url);
    return { ok: true, tab: serializeTab(tabId) };
  },
  getSettings: async (agentId) => ({
    ok: true,
    ...snapshotSearchSettings(agentId),
  }),
  setSettings: async (body, agentId) => {
    const engine = normalizeSearchEngineId(body?.searchEngine);
    if (!engine) {
      return { ok: false, error: 'invalid-search-engine', ...snapshotSearchSettings(agentId) };
    }
    const scope = body?.scope === 'session' || !agentId ? 'session' : 'agent';
    if (scope === 'agent') {
      agentSearchEngines.set(agentId, engine);
    } else {
      privacySettings.searchEngine = engine;
      broadcastSettings();
    }
    return { ok: true, scope, ...snapshotSearchSettings(agentId) };
  },
  search: async (body, agentId) => {
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const engine = body?.searchEngine || searchEngineIdForAgent(agentId);
    const url = searchUrlFor(query, engine);
    if (!url) {
      return { ok: false, error: 'invalid-query' };
    }
    const tabId = typeof body?.tabId === 'string' && views.has(body.tabId)
      ? body.tabId
      : createGuestTab(url, {
          activate: body?.activate !== false,
          owner: (typeof body?.owner === 'string' && body.owner.trim()) || agentId,
        });
    if (!tabId) {
      return failTab('cannot-create-tab');
    }
    if (typeof body?.tabId === 'string' && views.has(body.tabId)) {
      const guest = getTabWebContents(tabId);
      if (!guest) {
        return failTab('tab-not-found');
      }
      await guest.loadURL(url);
    }
    return { ok: true, tab: serializeTab(tabId), searchEngine: normalizeSearchEngineId(engine) || searchEngineIdForAgent(agentId) };
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
    const blocked = agentActionBlocked(tabId);
    if (blocked) {
      return blocked;
    }
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const source = privacySettings.markdownDom
      ? AGENT_MARKDOWN_SOURCE
      : `(function () {
        try {
          return document.body && document.body.innerText ? document.body.innerText : '';
        } catch {
          return '';
        }
      })()`;
    let text = await guest.executeJavaScript(source, true);
    text = typeof text === 'string' ? text.slice(0, PAGE_TEXT_LIMIT) : '';
    if (privacySettings.semanticHtml) {
      const semantic = await guest.executeJavaScript(
        `(function () { return window.__agentCatalog && window.__agentCatalog.semantic ? window.__agentCatalog.semantic : ''; })()`,
        true,
      );
      if (typeof semantic === 'string' && semantic.trim()) {
        text = semantic.slice(0, PAGE_TEXT_LIMIT);
      }
    }
    if (privacySettings.contextSplitter && text.length > 1800) {
      const chunks = [];
      for (let i = 0; i < text.length && chunks.length < 8; i += 1800) {
        chunks.push(text.slice(i, i + 1800));
      }
      text = chunks.map((chunk, index) => `[chunk ${index + 1}/${chunks.length}]\n${chunk}`).join('\n\n');
    }
    if (privacySettings.lmStudioPort && text.length > 6000) {
      try {
        text = await requestChat('', [
          { role: 'system', content: 'Keep the summary short. Summarize only the page content.' },
          { role: 'user', content: text.slice(0, 12000) },
        ]);
      } catch {
        // Keep the original extract if the local model is offline.
      }
    }
    return { ok: true, tabId, text };
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
    const blocked = agentActionBlocked(tabId);
    if (blocked) {
      return blocked;
    }
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const expression = typeof body?.expression === 'string' ? body.expression : '';
    if (!expression || expression.length > 32000) {
      return { ok: false, error: 'invalid-expression' };
    }
    try {
      const result = await guest.executeJavaScript(expression, true);
      let safeResult = null;
      try {
        safeResult = JSON.parse(JSON.stringify(result ?? null));
      } catch {
        safeResult = String(result);
      }
      noteAgentSuccess(tabId);
      return { ok: true, tabId, result: safeResult };
    } catch (error) {
      return noteAgentFailure(tabId) || { ok: false, error: error instanceof Error ? error.message : 'evaluate-failed' };
    }
  },
  click: async (tabId, body) => {
    const blocked = agentActionBlocked(tabId);
    if (blocked) {
      return blocked;
    }
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const selector = typeof body?.selector === 'string' ? body.selector : '';
    if (!selector || selector.length > 512) {
      return { ok: false, error: 'invalid-selector' };
    }
    if (privacySettings.humanJitter || privacySettings.inputSimulator) {
      const box = await guest.executeJavaScript(
        `(function () {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) { return null; }
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
        })()`,
        true,
      );
      if (!box) {
        return noteAgentFailure(tabId) || { ok: false, error: 'not-found', tabId };
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 50 + Math.floor(Math.random() * 101));
      });
      const x = Math.round(box.x + (Math.random() - 0.5) * Math.min(8, Math.max(2, box.w * 0.25)));
      const y = Math.round(box.y + (Math.random() - 0.5) * Math.min(8, Math.max(2, box.h * 0.25)));
      guest.sendInputEvent({ type: 'mouseMove', x, y });
      guest.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      guest.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      noteAgentSuccess(tabId);
      return { ok: true, tabId };
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
    if (!result?.ok) {
      return noteAgentFailure(tabId) || { ok: Boolean(result?.ok), tabId, ...(result || {}) };
    }
    noteAgentSuccess(tabId);
    return { ok: Boolean(result?.ok), tabId, ...(result || {}) };
  },
  type: async (tabId, body) => {
    const blocked = agentActionBlocked(tabId);
    if (blocked) {
      return blocked;
    }
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    if (privacySettings.jsonFormFill && body?.fields && typeof body.fields === 'object') {
      const result = await guest.executeJavaScript(
        `(function () {
          const fn = window.__agentFillJson;
          if (typeof fn !== 'function') { return { ok: false, error: 'form-fill-off' }; }
          return fn(${JSON.stringify(body.fields)});
        })()`,
        true,
      );
      if (result?.ok) {
        noteAgentSuccess(tabId);
      } else {
        noteAgentFailure(tabId);
      }
      return { ok: Boolean(result?.ok), tabId, ...(result || {}) };
    }
    const text = typeof body?.text === 'string' ? body.text : '';
    const selector = typeof body?.selector === 'string' ? body.selector : '';
    if (!text || text.length > 8000) {
      return { ok: false, error: 'invalid-text' };
    }
    const focused = await guest.executeJavaScript(
      `(function () {
        const el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.activeElement'};
        if (!el) { return { ok: false, error: 'not-found' }; }
        el.focus();
        if ('value' in el) { el.value = ''; }
        return { ok: true };
      })()`,
      true,
    );
    if (!focused?.ok) {
      return noteAgentFailure(tabId) || { ok: false, tabId, ...(focused || {}) };
    }
    if (privacySettings.inputSimulator || privacySettings.humanJitter) {
      for (const char of text) {
        await new Promise((resolve) => {
          setTimeout(resolve, 35 + Math.floor(Math.random() * 70));
        });
        guest.sendInputEvent({ type: 'char', keyCode: char });
      }
      noteAgentSuccess(tabId);
      return { ok: true, tabId };
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
    if (result?.ok) {
      noteAgentSuccess(tabId);
    } else {
      noteAgentFailure(tabId);
    }
    return { ok: Boolean(result?.ok), tabId, ...(result || {}) };
  },
  scroll: async (tabId) => {
    const blocked = agentActionBlocked(tabId);
    if (blocked) {
      return blocked;
    }
    if (!privacySettings.infiniteScroll) {
      return { ok: false, error: 'infinite-scroll-off' };
    }
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const result = await guest.executeJavaScript(
      `(function () {
        if (typeof window.__agentScrollTick !== 'function') { return { ok: false, error: 'not-injected' }; }
        return Object.assign({ ok: true }, window.__agentScrollTick());
      })()`,
      true,
    );
    return { ok: Boolean(result?.ok), tabId, ...(result || {}) };
  },
  tables: async (tabId) => {
    if (!privacySettings.tableParser) {
      return { ok: false, error: 'table-parser-off' };
    }
    const guest = getTabWebContents(tabId);
    if (!guest) {
      return failTab('tab-not-found');
    }
    const tables = await guest.executeJavaScript(
      `(function () { return typeof window.__agentTables === 'function' ? window.__agentTables() : []; })()`,
      true,
    );
    return { ok: true, tabId, tables: Array.isArray(tables) ? tables : [] };
  },
  netlog: async (tabId) => {
    if (!privacySettings.xhrHunter) {
      return { ok: false, error: 'xhr-hunter-off' };
    }
    const guest = getTabWebContents(tabId);
    const pageLog = guest
      ? await guest.executeJavaScript(
          `(function () { return Array.isArray(window.__agentNetLog) ? window.__agentNetLog.slice(-40) : []; })()`,
          true,
        ).catch(() => [])
      : [];
    return {
      ok: true,
      tabId,
      requests: xhrCaptureLog.filter((item) => !tabId || item.tabId === tabId).slice(-40),
      bodies: Array.isArray(pageLog) ? pageLog : [],
    };
  },
  remember: async (tabId, body) => {
    if (!privacySettings.memoryBlockSync && !privacySettings.siyuanBridge && !privacySettings.cursorIdeBridge) {
      return { ok: false, error: 'memory-off' };
    }
    const text = typeof body?.text === 'string' ? body.text.slice(0, 8000) : '';
    if (!text) {
      return { ok: false, error: 'invalid-text' };
    }
    const entry = { text, tabId, at: Date.now() };
    if (privacySettings.cursorIdeBridge) {
      sessionCodeSnippets.push(entry);
      if (sessionCodeSnippets.length > 40) {
        sessionCodeSnippets.shift();
      }
    } else {
      sessionMemoryBlocks.push(entry);
      if (sessionMemoryBlocks.length > 40) {
        sessionMemoryBlocks.shift();
      }
    }
    emitAgentLocalHook('memory-block', { tabId, bytes: text.length });
    postToMemoryBridge(text);
    return {
      ok: true,
      stored: privacySettings.cursorIdeBridge ? sessionCodeSnippets.length : sessionMemoryBlocks.length,
    };
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
  if (!isChromeSender(event) && !isExtensionsSender(event)) {
    return { ok: false };
  }
  return { ok: true, settings: snapshotSettings() };
});

async function applyBooleanSetting(key, value) {
  if (!BOOLEAN_SETTINGS.has(key)) {
    return { ok: false };
  }
  if (key === 'mediaHunter') {
    setMediaHunterEnabled(value);
  } else {
    privacySettings[key] = Boolean(value);
  }
  if (key === 'spoofUserAgent') {
    applySpoofedUserAgent();
  }
  if (key === 'agentBridge') {
    try {
      await ensureAgentBridge(privacySettings.agentBridge);
    } catch {
      privacySettings.agentBridge = false;
      return { ok: false, error: 'The agent bridge could not listen.' };
    }
  }
  if (key === 'blockMedia') {
    applySessionPermissions(getIsolatedSession());
  }
  applyExtensionSideEffect(key);
  if (key === 'ghostNetwork') {
    if (value) {
      for (const tabId of views.keys()) {
        stopTabMicrophone(tabId);
      }
      sessionMicGrants.clear();
    }
    try {
      await applyGhostNetwork();
    } catch {
      privacySettings.ghostNetwork = false;
      await applyGhostNetwork().catch(() => {});
      return {
        ok: false,
        error: 'SOCKS5 proxy could not be applied. Is 127.0.0.1:1080 listening?',
      };
    }
  }
  return { ok: true };
}

ipcMain.handle('agent:settings-set', async (event, payload) => {
  if ((!isChromeSender(event) && !isExtensionsSender(event)) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }

  const key = payload.key;
  if (BOOLEAN_SETTINGS.has(key)) {
    const applied = await applyBooleanSetting(key, payload.value);
    if (!applied.ok) {
      return { ok: false, error: applied.error, settings: broadcastSettings() };
    }
  } else if (key === 'searchEngine' && Object.hasOwn(SEARCH_ENGINES, payload.value)) {
    privacySettings.searchEngine = payload.value;
  } else if (key === 'sessionApiKey') {
    if (typeof payload.value !== 'string' || payload.value.length > 256 || /[\r\n]/.test(payload.value)) {
      return { ok: false, settings: snapshotSettings() };
    }
    sessionApiKeyValue = payload.value.trim();
  } else if (key === 'brain') {
    if (!applyBrainChoice(payload.value)) {
      return { ok: false, settings: snapshotSettings() };
    }
  } else {
    return { ok: false, settings: snapshotSettings() };
  }

  return { ok: true, settings: broadcastSettings() };
});

function applyAgentExtensionToggle(id, state) {
  const token = String(id || '').trim();
  if (!token || token.length > 80) {
    return { ok: false };
  }
  const known = KNOWN_EXTENSION_IDS.has(token) || Object.hasOwn(EXTENSION_TOGGLE_IDS, token);
  if (!known && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token)) {
    return { ok: false };
  }
  const key = EXTENSION_TOGGLE_IDS[token];
  if (key && BOOLEAN_SETTINGS.has(key)) {
    privacySettings[key] = Boolean(state);
    applyExtensionSideEffect(key);
  }
  sessionExtensionState.set(token, Boolean(state));
  return { ok: true, settings: broadcastSettings() };
}

ipcMain.on('update-agent-extension', (event, payload) => {
  if ((!isChromeSender(event) && !isExtensionsSender(event)) || !payload || typeof payload !== 'object') {
    return;
  }
  if (typeof payload.id !== 'string') {
    return;
  }
  applyAgentExtensionToggle(payload.id, payload.state);
});

ipcMain.handle('agent:toggle-extension', async (event, payload) => {
  if ((!isChromeSender(event) && !isExtensionsSender(event)) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }
  if (typeof payload.id !== 'string') {
    return { ok: false };
  }
  return applyAgentExtensionToggle(payload.id, payload.state);
});

function resolveExpertCatalogItem(raw) {
  const token = String(raw || '').trim();
  if (!token) {
    return null;
  }
  return (
    EXT_EXPERT_CATALOG.find((item) => item.id === token || item.setting === token) || null
  );
}

function extractExpertPlan(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return null;
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    const toggles = Array.isArray(parsed.toggles) ? parsed.toggles : [];
    return { reply, toggles };
  } catch {
    return null;
  }
}

function heuristicExpertToggles(message) {
  const text = String(message).toLocaleLowerCase('tr');
  const toggles = [];
  const seen = new Set();
  const wantsOff = /(kapat|kapa\b|devre\s*d[iı][sş][iı]|kapal[iı]|iptal et|durdur|turn\s*off|disable|stop\b)/.test(text);
  const add = (id, on) => {
    if (seen.has(id) || toggles.length >= 20) {
      return;
    }
    seen.add(id);
    toggles.push({ id, on: Boolean(on) });
  };

  if (/(webrtc|ip s[iı]z|leak blocker)/.test(text)) {
    add('webrtc-leak-blocker', !wantsOff);
  }
  if (/(hayalet a[gğ]|ghost network|socks|vekil|proxy|tor\b)/.test(text)) {
    add('dynamic-proxy-swapper', !wantsOff);
    add('doh-forcer', !wantsOff);
  }
  if (/(video indir|download video|blob|media source|youtube|downloader)/.test(text)) {
    add('media-source-blob-revealer', !wantsOff);
  }
  if (/([cç]erez|cookie)/.test(text)) {
    add('third-party-cookie-annihilator', !wantsOff);
  }
  if (/(referrer|utm|fbclid|gclid|tracking param)/.test(text)) {
    add('referrer-stripper-pro', !wantsOff);
    add('link-tracking-parameter-remover', !wantsOff);
  }
  if (/(kullan[iı]c[iı] ajan|kimlik mask|identity mask|user[- ]?agent|parmak izi|fingerprint|canvas)/.test(text)) {
    add('user-agent-rotator', !wantsOff);
    add('canvas-fingerprint-defender', !wantsOff);
    add('audiocontext-spoofer', !wantsOff);
  }
  if (/(wayback|shodan|exif|osint|subdomain|onion|homograph)/.test(text)) {
    add('wayback-machine-fast-fetcher', !wantsOff);
    add('shodan-passive-ip-scanner', !wantsOff);
    add('exif-metadata-viewer', !wantsOff);
  }
  if (/(kaz[iı]|scrape|markdown|shadow dom|tablo|table|xhr|websocket|sonsuz kayd[iı]r|infinite scroll)/.test(text)) {
    add('page-to-markdown-converter', !wantsOff);
    add('shadow-dom-piercer', !wantsOff);
    add('table-to-json-auto-parser', !wantsOff);
    add('xhr-fetch-payload-catcher', !wantsOff);
    add('infinite-scroll-autopilot', !wantsOff);
  }
  if (/(form doldur|json form|fill form|honeypot)/.test(text)) {
    add('hidden-form-field-revealer', !wantsOff);
  }
  if (/(headless|g[oö]r[uü]nmez mod|invisible mode)/.test(text)) {
    add('headless-mode-resource-saver', !wantsOff);
  }
  if (/(rate[- ]?limit|cloudflare bekle|pause agent|ajan[iı] duraklat|429)/.test(text)) {
    add('rate-limit-auto-pauser', !wantsOff);
  }
  if (/(gizlilik|privacy|anonim|anonymous|izliyor|parmak izi azalt)/.test(text) && toggles.length === 0) {
    add('webrtc-leak-blocker', true);
    add('third-party-cookie-annihilator', true);
    add('user-agent-rotator', true);
    add('canvas-fingerprint-defender', true);
    add('referrer-stripper-pro', true);
  }
  return toggles;
}

function expertAllowsDangerous(message, id) {
  if (!EXT_EXPERT_DANGEROUS_IDS.has(id)) {
    return true;
  }
  return /(excommunicado|panik|panic|protokol anahtar|protocol switch|dead.?man)/i.test(String(message));
}

function normalizeExpertToggles(rawToggles, message) {
  const toggles = [];
  const seen = new Set();
  for (const item of Array.isArray(rawToggles) ? rawToggles : []) {
    if (!item || typeof item !== 'object' || toggles.length >= 20) {
      break;
    }
    const catalog = resolveExpertCatalogItem(item.id || item.setting);
    if (!catalog || seen.has(catalog.id) || !expertAllowsDangerous(message, catalog.id)) {
      continue;
    }
    seen.add(catalog.id);
    const on = item.on === true || item.on === 'true' || item.on === 1;
    toggles.push({ id: catalog.id, setting: catalog.setting, name: catalog.name, on });
  }
  return toggles;
}

function expertSystemPrompt() {
  const model = selectedLocalModel ? serializeLocalModel(selectedLocalModel) : null;
  const memory = snapshotMemoryBridge();
  const rows = EXT_EXPERT_CATALOG.map((item) => {
    const on = sessionExtensionState.has(item.id)
      ? Boolean(sessionExtensionState.get(item.id))
      : Boolean(privacySettings[EXTENSION_TOGGLE_IDS[item.id]]);
    return `${item.id}\t${item.name}\t${on ? 'on' : 'off'}`;
  }).join('\n');
  return [
    'You are the Extension expert inside Agent Browser. Tell the user which session tools should be on, and only toggle what is needed.',
    'Reply with a single JSON object: {"reply":"short English explanation","toggles":[{"id":"shield","on":true}]}',
    'id must match a catalog id. Do not write the chat to disk. Do not trigger the Excommunicado protocol.',
    'Change dead-man-switch and excommunicado-lock only if the user clearly asks for panic, lock, or the protocol.',
    `Selected model: ${model?.name || 'none'}. Memory bridge: ${memory.providerName || 'none'} (${privacySettings.siyuanBridge ? 'on' : 'off'}).`,
    'Catalog (id, name, state):',
    rows,
  ].join('\n');
}

function pushExpertHistory(role, content) {
  extExpertHistory.push({ role, content: String(content).slice(0, 2000) });
  while (extExpertHistory.length > 8) {
    extExpertHistory.shift();
  }
}

ipcMain.handle('agent:ext-expert', async (event, payload) => {
  if (!isExtensionsSender(event) || panicInProgress) {
    return { ok: false };
  }
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message || message.length > 2000) {
    return { ok: false, error: 'Invalid message.' };
  }

  try {
  let reply = '';
  let usedModel = false;
  let plan = null;
  let modelError = '';
  try {
    const content = await requestChat('', [
      { role: 'system', content: expertSystemPrompt() },
      ...extExpertHistory,
      { role: 'user', content: message },
    ]);
    usedModel = true;
    plan = extractExpertPlan(content);
    reply = plan?.reply || content.replace(/```[\s\S]*?```/g, '').trim();
  } catch (error) {
    usedModel = false;
    plan = null;
    reply = '';
    modelError = error instanceof Error ? error.message : 'The local model did not reply.';
  }

  let toggles = normalizeExpertToggles(plan?.toggles, message);
  if (!toggles.length && (!usedModel || !plan)) {
    toggles = normalizeExpertToggles(heuristicExpertToggles(message), message);
  }

  const applied = [];
  const notes = [];
  for (const toggle of toggles) {
    const result = applyAgentExtensionToggle(toggle.id, toggle.on);
    if (result.ok) {
      applied.push(toggle);
    } else if (result.error) {
      notes.push(`${toggle.name}: ${result.error}`);
    }
  }

  const settings = applied.length || notes.length ? broadcastSettings() : snapshotSettings();
  if (!reply) {
    if (applied.length) {
      reply = applied
        .map((item) => `${item.name} ${item.on ? 'turned on' : 'turned off'}`)
        .join(', ');
      if (!usedModel) {
        reply += '. No local model was available; I applied keyword rules.';
      }
    } else if (!usedModel) {
      reply = modelError || 'Select a local model; no extension changes for now.';
    } else {
      reply = 'No extension changes were needed for this request.';
    }
  }
  if (notes.length) {
    reply = `${reply}\n${notes.join('\n')}`;
  }

  pushExpertHistory('user', message);
  pushExpertHistory('assistant', reply);
  if (privacySettings.siyuanBridge) {
    const appliedLine = applied.length
      ? applied.map((item) => `${item.name}: ${item.on ? 'on' : 'off'}`).join(', ')
      : 'none';
    rememberAgentThought(`Extension expert\nQuestion: ${message}\nReply: ${reply}\nApplied: ${appliedLine}`);
  }

  return { ok: true, reply, applied: applied.map((item) => ({ id: item.id, on: item.on })), settings };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The extension expert could not reply.',
      settings: snapshotSettings(),
    };
  }
});

ipcMain.handle('agent:memory-bridge-get', async (event) => {
  if (!isMemoryBridgeSender(event) && !isExtensionsSender(event) && !isChromeSender(event)) {
    return { ok: false };
  }
  return { ok: true, bridge: snapshotMemoryBridge() };
});

ipcMain.handle('agent:memory-bridge-set', async (event, payload) => {
  if ((!isMemoryBridgeSender(event) && !isChromeSender(event)) || !payload || typeof payload !== 'object') {
    return { ok: false };
  }
  applyMemoryBridgePatch(payload);
  const bridge = snapshotMemoryBridge();
  sendToKind('memory', 'agent:memory-bridge', bridge);
  return { ok: true, bridge, settings: broadcastSettings() };
});

ipcMain.handle('agent:memory-bridge-pick-vault', async (event) => {
  if ((!isMemoryBridgeSender(event) && !isChromeSender(event)) || !mainWindow || mainWindow.isDestroyed()) {
    return { ok: false };
  }
  applyMemoryBridgePatch({ provider: 'obsidian' });
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Obsidian vault',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: true, canceled: true, bridge: snapshotMemoryBridge() };
  }
  const picked = rememberUserPath(result.filePaths[0], sessionLocalDirs);
  if (!picked) {
    return { ok: false, error: 'invalid path', bridge: snapshotMemoryBridge() };
  }
  memoryBridge.vaultPath = picked;
  privacySettings.siyuanBridge = true;
  sessionExtensionState.set('siyuan-bridge', true);
  const bridge = snapshotMemoryBridge();
  sendToKind('memory', 'agent:memory-bridge', bridge);
  return { ok: true, bridge, settings: broadcastSettings() };
});

ipcMain.handle('agent:settings-panel', async (event, open) => {
  if (!isChromeSender(event)) {
    return { ok: false };
  }

  settingsOpen = Boolean(open);
  if (settingsOpen) {
    hideOverflowMenu();
    hideShieldMenu({ notify: false });
    hideSiteMenu({ notify: false });
    hideToolsMenu({ notify: false });
    hideShortcutsMenu({ notify: false });
    hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
  }
  fitBrowserView();
  return { ok: true, open: settingsOpen };
});

ipcMain.handle('agent:ai-message', async (event, payload) => {
  if (!isChromeSender(event)) {
    return emitAiResponse({ ok: false, error: 'unauthorized' });
  }

  const apiKey = readSessionApiKey(payload?.apiKey) || readSessionApiKey(sessionApiKeyValue);
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message || message.length > 8000) {
    return emitAiResponse({ ok: false, error: 'Invalid message.' });
  }

  const bound = selectedLocalModel && serializeLocalModel(selectedLocalModel);
  const preview = resolveLocalChatTarget(bound, lastIntelModels, lastIntelAgents);
  const label = preview?.name || bound?.name || (apiKey ? 'cloud model' : 'local model');
  emitAiResponse({ ok: true, type: 'status', content: `agent is replying · ${label}` });

  try {
    const content = await requestChat(apiKey, [
      {
        role: 'system',
        content:
          'You are a privacy-focused assistant running inside Agent Browser. Do not write the chat to disk. Keep replies short and clear.',
      },
      { role: 'user', content: message },
    ]);
    rememberAgentThought(`Chat\nQuestion: ${message}\nReply: ${content}`);
    return emitAiResponse({ ok: true, type: 'chat', content });
  } catch (error) {
    return emitAiResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'AI request failed.',
    });
  }
});

ipcMain.on('open-useful-links', (event) => {
  if (panicInProgress) {
    return;
  }
  const senderUrl = event.sender?.getURL?.() || '';
  if (!isChromeSender(event) && !isNewTabFile(senderUrl) && !isStartPage(senderUrl) && !isExtensionsSender(event)) {
    return;
  }
  openUsefulLinksTab();
});

ipcMain.on('trigger-panic', (event) => {
  if (!isChromeSender(event)) {
    return;
  }
  triggerExcommunicado();
});

ipcMain.handle('agent:ai-summarize', async (event, payload) => {
  if (!isChromeSender(event)) {
    return emitAiResponse({ ok: false, error: 'unauthorized' });
  }

  const apiKey = readSessionApiKey(payload?.apiKey) || readSessionApiKey(sessionApiKeyValue);

  emitAiResponse({ ok: true, type: 'status', content: 'reading page text' });

  let pageText = '';
  try {
    pageText = await extractVisiblePageText();
  } catch {
    return emitAiResponse({ ok: false, error: 'Could not read page text.' });
  }

  if (!pageText) {
    return emitAiResponse({ ok: false, error: 'No visible text to summarize.' });
  }

  try {
    const content = await requestChat(apiKey, [
      { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user', content: pageText },
    ]);
    rememberAgentThought(`Summary\n${content}`);
    return emitAiResponse({ ok: true, type: 'summary', content });
  } catch (error) {
    return emitAiResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Summary request failed.',
    });
  }
});

function printWebContents(webContents, params) {
  if (!webContents || webContents.isDestroyed() || typeof webContents.print !== 'function') {
    return { ok: false };
  }

  const cleanupPrintMarks = () => {
    webContents
      .executeJavaScript(
        `(() => {
          document.getElementById('agent-print-style')?.remove();
          document.querySelectorAll('[data-agent-print]').forEach((el) => el.removeAttribute('data-agent-print'));
        })()`,
        true,
      )
      .catch(() => {});
  };

  const runPrint = () => {
    webContents.print({ silent: false, printBackground: true }, () => {
      cleanupPrintMarks();
    });
  };

  const selection = String(params?.selectionText || '').trim();
  if (!selection) {
    runPrint();
    return { ok: true };
  }

  webContents
    .executeJavaScript(
      `(() => {
        const sel = window.getSelection && window.getSelection();
        let node = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType !== 1) {
          node = node.parentElement;
        }
        if (!node) {
          return false;
        }
        node.setAttribute('data-agent-print', '1');
        document.getElementById('agent-print-style')?.remove();
        const style = document.createElement('style');
        style.id = 'agent-print-style';
        style.textContent = '@media print { body * { visibility: hidden !important; } [data-agent-print="1"], [data-agent-print="1"] * { visibility: visible !important; } }';
        document.documentElement.appendChild(style);
        return true;
      })()`,
      true,
    )
    .then(runPrint)
    .catch(runPrint);

  return { ok: true };
}

function printActiveGuest() {
  return printWebContents(getGuestWebContents());
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
    backgroundColor: '#0a0c0f',
    icon: appIconPath(),
    title: 'Agent Browser',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0c0f',
      symbolColor: '#d5dce3',
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
  watchHiddenScrollbars(win.webContents);
  attachChromeContextMenu(win.webContents);
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
  win.on('closed', () => {
    if (overflowHostWindow === win) {
      hideOverflowMenu({ notify: false });
    }
    if (shieldHostWindow === win) {
      hideShieldMenu({ notify: false });
    }
    if (siteHostWindow === win) {
      hideSiteMenu({ notify: false });
    }
    if (toolsHostWindow === win) {
      hideToolsMenu({ notify: false });
    }
    if (shortcutsHostWindow === win) {
      hideShortcutsMenu({ notify: false });
    }
    if (profileHostWindow === win) {
      hideProfileMenu({ notify: false });
  hideDownloadsMenu({ notify: false });
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

app.on('web-contents-created', (_event, contents) => {
  applyWebRtcPolicyToContents(contents);
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

function logAgent(message) {
  console.log(`${AJAN_LOG} ${message}`);
}

function logAgentWarn(message) {
  console.warn(`${AJAN_WARN} ${message}`);
}

function logAgentError(message) {
  console.error(`${AJAN_ERR} ${message}`);
}

function isLoopbackSocket(req) {
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function tokensEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || left.length !== right.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

function readAgentKey(req) {
  const header = req.headers['agent-key'] || req.headers['Agent-Key'];
  return typeof header === 'string' ? header.trim() : '';
}

function removeAgentPortFiles() {
  for (const file of [AGENT_PORT_FILE, AGENT_API_PORT_FILE]) {
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        logAgentWarn(`Could not delete port file: ${path.basename(file)}`);
      }
    }
  }
}

function writeAgentPortFile(file, port) {
  fs.writeFileSync(file, `${port}\n`, { encoding: 'utf8' });
}

function findFreePort(host = '127.0.0.1', port = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    const onError = (error) => {
      try {
        server.close();
      } catch {
        // Ignore close after listen failure.
      }
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const address = server.address();
      const found = address && typeof address === 'object' ? address.port : 0;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(found);
      });
    });
  });
}

function findFreePortSync(host = '127.0.0.1', port = 0) {
  const script = `'use strict';
const net = require('net');
const server = net.createServer();
server.once('error', (err) => { process.stderr.write(String(err.code || err.message)); process.exit(1); });
server.listen(${Number(port) || 0}, ${JSON.stringify(host)}, () => {
  const addr = server.address();
  process.stdout.write(String(addr && addr.port ? addr.port : 0));
  server.close(() => process.exit(0));
});`;
  const result = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 4000,
    killSignal: 'SIGKILL',
  });
  if (result.status !== 0) {
    const error = new Error(String(result.stderr || 'EADDRINUSE').trim() || 'EADDRINUSE');
    error.code = String(result.stderr || 'EADDRINUSE').trim() || 'EADDRINUSE';
    throw error;
  }
  const found = Number(String(result.stdout || '').trim());
  if (!Number.isInteger(found) || found <= 0) {
    throw new Error('free-port-failed');
  }
  return found;
}

function findCdpAndApiPorts() {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const cdp = findFreePortSync(AGENT_BRIDGE_HOST, 0);
    try {
      findFreePortSync(AGENT_BRIDGE_HOST, cdp + 1);
      return { cdp, api: cdp + 1 };
    } catch {
      // Consecutive API port was taken; try another CDP port.
    }
  }
  throw new Error('No free consecutive localhost ports found.');
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readAgentApiBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > AGENT_API_BODY_LIMIT) {
        reject(new Error('too-large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid-json'));
      }
    });
    req.on('error', reject);
  });
}

function agentDomToMarkdown() {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'IFRAME', 'LINK', 'META', 'TEMPLATE']);
  const block = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'TR']);
  function textOf(node) {
    return (node && node.textContent ? node.textContent : '').replace(/\s+/g, ' ').trim();
  }
  function walk(node) {
    if (!node) {
      return '';
    }
    if (node.nodeType === 3) {
      return node.nodeValue.replace(/\s+/g, ' ');
    }
    if (node.nodeType !== 1) {
      return '';
    }
    const tag = node.tagName;
    if (skip.has(tag) || node.hidden) {
      return '';
    }
    if (tag === 'BR') {
      return '\n';
    }
    if (tag === 'HR') {
      return '\n---\n';
    }
    if (/^H[1-6]$/.test(tag)) {
      return `\n${'#'.repeat(Number(tag[1]))} ${textOf(node)}\n`;
    }
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      const label = textOf(node) || href;
      return href ? `[${label}](${href})` : label;
    }
    if (tag === 'IMG') {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src') || '';
      return alt || src ? `![${alt}](${src})` : '';
    }
    if (tag === 'PRE' || tag === 'CODE') {
      const body = (node.textContent || '').trim().replace(/\n/g, '\n    ');
      return body ? `\n    ${body}\n` : '';
    }
    if (tag === 'LI') {
      return `\n- ${Array.from(node.childNodes).map(walk).join('').trim()}`;
    }
    if (tag === 'BLOCKQUOTE') {
      return `\n> ${textOf(node)}\n`;
    }
    const inner = Array.from(node.childNodes).map(walk).join('');
    if (block.has(tag)) {
      return `\n${inner.trim()}\n`;
    }
    return inner;
  }
  const root = document.body || document.documentElement;
  return walk(root).replace(/\n{3,}/g, '\n\n').trim();
}

const AGENT_MARKDOWN_SOURCE = `(${agentDomToMarkdown.toString()})();`;

async function agentVision() {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false, error: 'no-active-tab' };
  }
  logAgent('Capturing screenshot...');
  const image = await guest.capturePage();
  const size = image.getSize();
  return {
    ok: true,
    mime: 'image/png',
    width: size.width,
    height: size.height,
    image: image.toPNG().toString('base64'),
  };
}

async function agentReadMarkdown() {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false, error: 'no-active-tab' };
  }
  logAgent('Reading page as Markdown...');
  const markdown = await guest.executeJavaScript(AGENT_MARKDOWN_SOURCE, true);
  const text = typeof markdown === 'string' ? markdown.slice(0, PAGE_TEXT_LIMIT * 2) : '';
  return { ok: true, url: guest.getURL(), markdown: text };
}

async function agentType(body) {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false, error: 'no-active-tab' };
  }
  const selector = typeof body?.selector === 'string' ? body.selector.trim() : '';
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!selector || selector.length > 512) {
    return { ok: false, error: 'invalid-selector' };
  }
  if (text.length > 8000) {
    return { ok: false, error: 'invalid-text' };
  }
  logAgent(`Filling form... (${selector})`);
  const result = await guest.executeJavaScript(
    `(function () {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) { return { ok: false, error: 'not-found' }; }
      el.focus();
      if ('value' in el) {
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.textContent = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { ok: false, error: 'not-editable' };
      }
      return { ok: true };
    })()`,
    true,
  );
  return { ok: Boolean(result?.ok), ...(result && typeof result === 'object' ? result : {}) };
}

async function agentEvaluate(body) {
  const guest = getGuestWebContents();
  if (!guest || guest.isDestroyed()) {
    return { ok: false, error: 'no-active-tab' };
  }
  const fn = typeof body?.function === 'string' ? body.function : '';
  const expression =
    typeof body?.expression === 'string'
      ? body.expression
      : typeof body?.code === 'string'
        ? body.code
        : typeof body?.script === 'string'
          ? body.script
          : '';
  const source = fn ? `(${fn})()` : expression;
  if (!source || source.length > 32000) {
    return { ok: false, error: 'invalid-expression' };
  }
  logAgent(`Running JavaScript... (${source.length} characters)`);
  const result = await guest.executeJavaScript(source, true);
  let safeResult = null;
  try {
    safeResult = JSON.parse(JSON.stringify(result ?? null));
  } catch {
    safeResult = String(result);
  }
  return { ok: true, result: safeResult };
}

async function handleAgentApiRoute(pathname, body) {
  if (pathname === '/agent/vision') {
    return agentVision();
  }
  if (pathname === '/agent/read-markdown') {
    return agentReadMarkdown();
  }
  if (pathname === '/agent/type') {
    return agentType(body);
  }
  if (pathname === '/agent/evaluate') {
    return agentEvaluate(body);
  }
  return null;
}

function stopAgentApiServer() {
  if (!agentApiServer) {
    return;
  }
  try {
    agentApiServer.close();
  } catch {
    // Already closed.
  }
  agentApiServer = null;
}

function startAgentApiServer(port) {
  if (agentApiServer) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handleAgentApiRequest(req, res).catch((error) => {
        logAgentError(error instanceof Error ? error.message : 'internal error');
        if (!res.writableEnded) {
          jsonResponse(res, 500, { ok: false, error: 'internal' });
        }
      });
    });

    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, AGENT_BRIDGE_HOST, () => {
      server.off('error', onError);
      agentApiServer = server;
      resolve();
    });
  });
}

async function handleAgentApiRequest(req, res) {
  if (!isLoopbackSocket(req)) {
    logAgentWarn('Rejected non-loopback request');
    jsonResponse(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  let url;
  try {
    url = new URL(req.url || '/', 'http://127.0.0.1');
  } catch {
    jsonResponse(res, 400, { ok: false, error: 'bad-url' });
    return;
  }

  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!tokensEqual(readAgentKey(req), agentControlKey)) {
    logAgentWarn('Rejected unauthorized request');
    jsonResponse(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  if (req.method !== 'POST') {
    jsonResponse(res, 405, { ok: false, error: 'method-not-allowed' });
    return;
  }

  let body;
  try {
    body = await readAgentApiBody(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'too-large';
    jsonResponse(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'too-large' : 'invalid-json' });
    return;
  }

  const payload = await handleAgentApiRoute(pathname, body);
  if (!payload) {
    jsonResponse(res, 404, { ok: false, error: 'not-found' });
    return;
  }
  jsonResponse(res, payload.ok === false ? 400 : 200, payload);
}

process.on('exit', () => {
  removeAgentPortFiles();
});

try {
  const ports = findCdpAndApiPorts();
  agentCdpPort = ports.cdp;
  agentApiPort = ports.api;
  agentControlKey = crypto.randomBytes(24).toString('hex');
  app.commandLine.appendSwitch('remote-debugging-port', `${agentCdpPort}`);
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  writeAgentPortFile(AGENT_PORT_FILE, agentCdpPort);
  writeAgentPortFile(AGENT_API_PORT_FILE, agentApiPort);
  logAgent(`CDP 127.0.0.1:${agentCdpPort} allocated`);
} catch (error) {
  logAgentError(error instanceof Error ? error.message : String(error));
  removeAgentPortFiles();
  app.exit(1);
}

app.whenReady().then(async () => {
  installHiddenEditMenu();
  const isolatedSession = getIsolatedSession();
  attachPrivacyNetworkGuards(isolatedSession);
  attachDownloadManager(isolatedSession);
  createMainWindow();
  await startAgentApiServer(agentApiPort);
  logAgent(`API http://127.0.0.1:${agentApiPort}`);
  logAgent(`Agent-Key ${agentControlKey}`);
  const registered = globalShortcut.register(PANIC_SHORTCUT, () => {
    triggerExcommunicado();
  });
  if (!registered) {
    console.error('Excommunicado shortcut registration failed:', PANIC_SHORTCUT);
  }
}).catch((error) => {
  logAgentError(error instanceof Error ? error.message : String(error));
  removeAgentPortFiles();
  app.exit(1);
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
    stopAgentApiServer();
  } catch {
    // Ignore.
  }
  try {
    removeAgentPortFiles();
  } catch {
    // Ignore.
  }
  try {
    stopLocalIntelWatch();
  } catch {
    // Ignore.
  }
  try {
    killAllScrapers();
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
  stopAgentApiServer();
  removeAgentPortFiles();

  wipeIsolatedSession()
    .catch((error) => {
      console.error('Failed to wipe in-memory session traces:', error);
    })
    .finally(() => {
      app.exit(0);
    });
});
