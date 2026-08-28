'use strict';

let searchEngineBase = 'https://duckduckgo.com/?q=';
const AGENT_SEARCH_PREFIX = 'agent-search:';
const sessionVisits = [];
let currentPageUrl = '';
let sessionBookmarkItems = [];
let sessionBookmarkFolders = [{ id: 'bar', title: 'Bookmarks bar', createdAt: 0 }];
const BAR_SHORTCUTS = Object.freeze([
  { id: 'ddg', title: 'DuckDuckGo', url: 'https://duckduckgo.com', tone: 'gold' },
  { id: 'startpage', title: 'Startpage', url: 'https://www.startpage.com', tone: 'dark' },
  { id: 'wikipedia', title: 'Wikipedia', url: 'https://www.wikipedia.org', tone: 'x', letter: 'W' },
  { id: 'proton', title: 'Proton', url: 'https://proton.me', tone: 'stone' },
  { id: 'archive', title: 'Archive', url: 'https://archive.org', tone: 'mist' },
  { id: 'github', title: 'GitHub', url: 'https://github.com', tone: 'flame' },
]);
let barShortcuts = BAR_SHORTCUTS.map((item) => ({ ...item }));

function isUrlLike(raw) {
  const value = raw.trim();
  if (!value || /\s/.test(value)) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return true;
  }

  if (value === 'localhost' || value.startsWith('localhost:')) {
    return true;
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#].*)?$/.test(value)) {
    return true;
  }

  return /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function isLocalHostOrIp(value) {
  return (
    value === 'localhost' ||
    value.startsWith('localhost:') ||
    value.startsWith('localhost/') ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#].*)?$/.test(value)
  );
}

function isLoopbackTyped(value) {
  const host = String(value || '').split('/')[0].split('?')[0].split('#')[0].toLowerCase();
  return (
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host === '127.0.0.1' ||
    host.startsWith('127.0.0.1:') ||
    host === '[::1]' ||
    host.startsWith('[::1]:')
  );
}

function schemeOf(value) {
  return isLoopbackTyped(value) ? 'http://' : 'https://';
}

function resolveDestination(raw) {
  const value = raw.trim();
  if (!value) {
    return '';
  }

  if (!isUrlLike(value)) {
    return `${AGENT_SEARCH_PREFIX}${encodeURIComponent(value)}`;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return `${schemeOf(value)}${value}`;
}

function maybePrefixUrl(input) {
  const raw = input.value;
  const trimmed = raw.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || !isUrlLike(trimmed)) {
    return;
  }

  const scheme = schemeOf(trimmed);
  const leading = raw.match(/^\s*/)[0].length;
  const start = input.selectionStart ?? raw.length;
  input.value = `${raw.slice(0, leading)}${scheme}${trimmed}${raw.slice(leading + trimmed.length)}`;
  const next = start + (start >= leading ? scheme.length : 0);
  input.setSelectionRange(next, next);
}

function setReloadState(button, loading) {
  if (!button) {
    return;
  }
  button.classList.toggle('is-loading', loading);
  button.dataset.loading = loading ? '1' : '0';
  button.setAttribute('aria-label', loading ? 'Durdur' : 'Yenile');
  button.title = loading ? 'Durdur' : 'Yenile';
}

function setStarState(button, bookmarked) {
  if (!button) {
    return;
  }
  button.classList.toggle('is-active', bookmarked);
  button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
}

function insertOmniboxText(input, rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectedOmniboxText(input) {
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  if (start === end) {
    return '';
  }
  return input.value.slice(start, end);
}

function bindOmniboxEditing(input) {
  input.addEventListener('keydown', async (event) => {
    const ctrl = event.ctrlKey || event.metaKey;
    if (!ctrl || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const api = window.electronAPI;
    if (key === 'a' && !event.shiftKey) {
      event.preventDefault();
      input.select();
      return;
    }
    if (key === 'c' && !event.shiftKey) {
      const text = selectedOmniboxText(input);
      if (!text) {
        return;
      }
      event.preventDefault();
      await api?.writeClipboard?.(text);
      return;
    }
    if (key === 'x' && !event.shiftKey) {
      const text = selectedOmniboxText(input);
      if (!text) {
        return;
      }
      event.preventDefault();
      await api?.writeClipboard?.(text);
      insertOmniboxText(input, '');
      return;
    }
    if (key === 'v' && !event.shiftKey) {
      event.preventDefault();
      const result = await api?.readClipboard?.();
      if (result?.ok && typeof result.text === 'string') {
        insertOmniboxText(input, result.text);
      }
    }
  });
}

function bindChrome() {
  const api = window.electronAPI;
  const form = document.getElementById('omni-form');
  const input = document.getElementById('url-bar') || document.getElementById('omni-input');
  const backBtn = document.getElementById('back-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const reloadBtn = document.getElementById('reload-btn');
  const starBtn = document.getElementById('bookmark-star');

  if (!form || !input || !backBtn || !forwardBtn || !reloadBtn) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    maybePrefixUrl(input);
    const url = resolveDestination(input.value);
    if (!url) {
      return;
    }

    if (!url.startsWith(AGENT_SEARCH_PREFIX)) {
      input.value = url;
    }
    api?.navigate?.(url);
    input.blur();
  });

  input.addEventListener('input', () => maybePrefixUrl(input));
  bindOmniboxEditing(input);

  backBtn.addEventListener('click', () => api?.goBack?.());
  forwardBtn.addEventListener('click', () => api?.goForward?.());
  reloadBtn.addEventListener('click', () => {
    if (reloadBtn.dataset.loading === '1') {
      api?.stop?.();
      return;
    }
    api?.reload?.();
  });
  starBtn?.addEventListener('click', () => api?.toggleBookmark?.());

  input.addEventListener('focus', () => {
    input.classList.add('is-focused');
  });
  input.addEventListener('blur', () => {
    input.classList.remove('is-focused');
  });

  api?.onUrlChanged?.((state) => {
    const url = typeof state === 'string' ? state : state?.url;
    backBtn.disabled = typeof state === 'object' ? !state.canGoBack : true;
    forwardBtn.disabled = typeof state === 'object' ? !state.canGoForward : true;
    setReloadState(reloadBtn, Boolean(state?.isLoading));
    setStarState(starBtn, Boolean(state?.bookmarked));

    const displayUrl = !url || url === 'about:blank' || url.startsWith('file:') ? '' : url;
    currentPageUrl = displayUrl;
    setBookmarksBarVisible(typeof state?.bookmarksBar === 'boolean' ? state.bookmarksBar : !displayUrl);
    if (document.activeElement === input) {
      return;
    }

    input.value = displayUrl;
    if (input.value) {
      rememberSessionVisit(input.value);
    }
    refreshSecurityStats();
  });
}

function rememberSessionVisit(url) {
  if (!url || sessionVisits[0] === url) {
    return;
  }
  sessionVisits.unshift(url);
  if (sessionVisits.length > 40) {
    sessionVisits.length = 40;
  }
}

function applyPrivacyChrome(settings) {
  if (!settings || typeof settings !== 'object') {
    return;
  }

  document.body.classList.toggle('ghost-network', Boolean(settings.ghostNetwork));
  document.getElementById('shield-toggle')?.classList.toggle('is-armed', settings.blockTrackers !== false);
  const ghostBtn = document.getElementById('ghost-toggle');
  ghostBtn?.classList.toggle('is-armed', Boolean(settings.ghostNetwork));
  ghostBtn?.setAttribute('aria-pressed', settings.ghostNetwork ? 'true' : 'false');

  const shieldToggle = document.getElementById('toggle-blockTrackers');
  if (shieldToggle && typeof settings.blockTrackers === 'boolean') {
    shieldToggle.checked = settings.blockTrackers;
  }
  const ghostToggle = document.getElementById('toggle-ghostNetwork');
  if (ghostToggle && typeof settings.ghostNetwork === 'boolean') {
    ghostToggle.checked = settings.ghostNetwork;
  }
  const settingsGhost = document.getElementById('setting-ghostNetwork');
  if (settingsGhost && typeof settings.ghostNetwork === 'boolean') {
    settingsGhost.checked = settings.ghostNetwork;
  }
  const settingsBlock = document.getElementById('setting-blockTrackers');
  if (settingsBlock && typeof settings.blockTrackers === 'boolean') {
    settingsBlock.checked = settings.blockTrackers;
  }

  const blocked = document.getElementById('shield-blocked');
  if (blocked && typeof settings.blockedRequestCount === 'number') {
    blocked.textContent = `${settings.blockedRequestCount} izleyici engellendi`;
  }
  if (settings.securityStats) {
    applySecurityStats(settings.securityStats);
  }
}

function applySecurityStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return;
  }

  const trackers = Number(stats.trackers) || 0;
  const cookies = Number(stats.cookies) || 0;
  const upgrades = Number(stats.upgrades) || 0;

  const trackerEl = document.getElementById('stat-trackers');
  const cookieEl = document.getElementById('stat-cookies');
  const upgradeEl = document.getElementById('stat-upgrades');
  if (trackerEl) {
    trackerEl.textContent = String(trackers);
  }
  if (cookieEl) {
    cookieEl.textContent = String(cookies);
  }
  if (upgradeEl) {
    upgradeEl.textContent = String(upgrades);
  }

  const blocked = document.getElementById('shield-blocked');
  if (blocked) {
    blocked.textContent = `${trackers} izleyici engellendi`;
  }
}

function refreshSecurityStats() {
  window.electronAPI?.getSecurityStats?.()?.then((result) => {
    if (result?.ok) {
      applySecurityStats(result);
    }
  });
}

const UTILITY_POPS = [
  { pop: 'profile-pop', toggle: 'profile-toggle' },
  { pop: 'apps-pop', toggle: 'apps-toggle' },
];

function hideUtilityPops() {
  for (const item of UTILITY_POPS) {
    document.getElementById(item.pop)?.classList.add('hidden');
    document.getElementById(item.toggle)?.setAttribute('aria-expanded', 'false');
  }
  document.body.classList.remove('utility-open');
  window.electronAPI?.setUtilityOpen?.(false);
}

function showUtilityPop(popId) {
  const target = document.getElementById(popId);
  if (!target) {
    return;
  }
  const alreadyOpen = !target.classList.contains('hidden');
  hideUtilityPops();
  document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
  document.getElementById('shield-toggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('site-toggle')?.setAttribute('aria-expanded', 'false');
  window.electronAPI?.setMenuOpen?.(false);
  window.electronAPI?.setShieldOpen?.(false);
  window.electronAPI?.setSiteOpen?.(false);
  window.electronAPI?.setToolsOpen?.(false);
  if (alreadyOpen) {
    return;
  }
  target.classList.remove('hidden');
  const match = UTILITY_POPS.find((item) => item.pop === popId);
  if (match) {
    document.getElementById(match.toggle)?.setAttribute('aria-expanded', 'true');
  }
  document.body.classList.add('utility-open');
  window.electronAPI?.setUtilityOpen?.(true);
}

const BOOKMARK_MARK_COLORS = ['#e53935', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00', '#00897b', '#3949ab'];
const expandedBookmarkFolders = new Set(['bar']);
let bookmarkSort = 'newest';

function hostKey(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function bookmarkMark(url) {
  const host = hostKey(url) || String(url || '');
  const letter = (host[0] || '?').toUpperCase();
  let sum = 0;
  for (const ch of host) {
    sum += ch.charCodeAt(0);
  }
  return { letter, color: BOOKMARK_MARK_COLORS[sum % BOOKMARK_MARK_COLORS.length] };
}

const faviconByHost = new Map();

function mountFavicon(el, dataUrl) {
  if (!el || !dataUrl) {
    return;
  }
  el.textContent = '';
  el.classList.add('has-icon');
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '';
  img.draggable = false;
  el.append(img);
}

function createSiteIcon(url, className, storedFavicon) {
  const mark = bookmarkMark(url);
  const el = document.createElement('span');
  el.className = className;
  el.textContent = mark.letter;
  const host = hostKey(url);
  const cached = storedFavicon || (host && faviconByHost.get(host)) || '';
  if (cached) {
    if (host) {
      faviconByHost.set(host, cached);
    }
    mountFavicon(el, cached);
    return el;
  }
  window.electronAPI?.getFavicon?.(url)?.then((result) => {
    if (!result?.ok || !result.dataUrl) {
      return;
    }
    if (host) {
      faviconByHost.set(host, result.dataUrl);
    }
    mountFavicon(el, result.dataUrl);
  });
  return el;
}

function sortedBookmarks(items) {
  const next = items.slice();
  if (bookmarkSort === 'az') {
    next.sort((a, b) => String(a.title || a.url).localeCompare(String(b.title || b.url)));
  } else if (bookmarkSort === 'oldest') {
    next.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } else {
    next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return next;
}

function renderBookmarksPanel() {
  const tree = document.getElementById('bp-tree');
  if (!tree) {
    return;
  }
  const query = (document.getElementById('bp-query')?.value || '').trim().toLowerCase();
  const folders = sessionBookmarkFolders.length
    ? sessionBookmarkFolders
    : [{ id: 'bar', title: 'Bookmarks bar', createdAt: 0 }];
  tree.replaceChildren();

  for (const folder of folders) {
    const inFolder = sortedBookmarks(
      sessionBookmarkItems.filter((item) => (item.folderId || 'bar') === folder.id),
    ).filter((item) => {
      if (!query) {
        return true;
      }
      return `${item.title || ''} ${item.url || ''}`.toLowerCase().includes(query);
    });
    if (query && inFolder.length === 0) {
      continue;
    }

    const wrap = document.createElement('div');
    wrap.className = 'bp-folder';
    if (expandedBookmarkFolders.has(folder.id) || query) {
      wrap.classList.add('is-open');
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bp-folder-btn';
    btn.innerHTML =
      '<svg class="bp-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.4 6.2 8 9.8 11.6 6.2"/></svg>';
    const label = document.createElement('span');
    label.textContent = `${folder.title} (${inFolder.length})`;
    btn.append(label);
    btn.addEventListener('click', () => {
      if (expandedBookmarkFolders.has(folder.id)) {
        expandedBookmarkFolders.delete(folder.id);
      } else {
        expandedBookmarkFolders.add(folder.id);
      }
      renderBookmarksPanel();
    });

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'bp-folder-items';
    if (inFolder.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'bp-empty';
      empty.textContent = 'No bookmarks in this folder';
      itemsWrap.append(empty);
    }
    for (const item of inFolder) {
      const row = document.createElement('div');
      row.className = 'bp-item';
      const icon = createSiteIcon(item.url, 'bp-mark', item.favicon);
      const name = document.createElement('button');
      name.type = 'button';
      name.textContent = item.title || item.url;
      name.addEventListener('click', () => window.electronAPI?.navigate?.(item.url));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bp-item-remove';
      remove.setAttribute('aria-label', 'Remove bookmark');
      remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12"/></svg>';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        window.electronAPI?.removeBookmark?.(item.id);
      });
      row.append(icon, name, remove);
      itemsWrap.append(row);
    }

    wrap.append(btn, itemsWrap);
    tree.append(wrap);
  }

  if (query && tree.childElementCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'bp-empty';
    empty.textContent = 'No matching bookmarks';
    tree.append(empty);
  }
}

function setBookmarksPanelOpen(open) {
  const panel = document.getElementById('bookmarks-panel');
  const toggle = document.getElementById('bookmarks-all-toggle');
  if (!panel) {
    return;
  }
  panel.hidden = !open;
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    const sidebar = document.getElementById('ai-sidebar');
    if (sidebar && !sidebar.hidden) {
      sidebar.hidden = true;
      document.getElementById('ai-toggle')?.setAttribute('aria-expanded', 'false');
      window.electronAPI?.setSidebarOpen?.(false);
    }
    const ramSheet = document.getElementById('ram-sheet');
    if (ramSheet && !ramSheet.hidden) {
      ramSheet.hidden = true;
      window.electronAPI?.setRamSheetOpen?.(false);
    }
  }
  window.electronAPI?.setBookmarksPanelOpen?.(open);
}

function setBookmarksBarVisible(visible) {
  const bar = document.getElementById('yerimleri-cubugu');
  const wasVisible = !document.documentElement.classList.contains('bookmarks-hidden');
  document.documentElement.classList.toggle('bookmarks-hidden', !visible);
  document.body.classList.toggle('bookmarks-hidden', !visible);
  if (bar) {
    bar.hidden = !visible;
  }
  if (wasVisible && !visible) {
    hideUtilityPops();
    const panel = document.getElementById('bookmarks-panel');
    if (panel && !panel.hidden) {
      setBookmarksPanelOpen(false);
    }
  }
}

function setSettingsPanelOpen(open) {
  const panel = document.getElementById('settings-panel');
  if (!panel) {
    return;
  }
  panel.hidden = !open;
  if (open) {
    window.electronAPI?.setMenuOpen?.(false);
    window.electronAPI?.setShieldOpen?.(false);
    window.electronAPI?.setSiteOpen?.(false);
    window.electronAPI?.setToolsOpen?.(false);
  }
  window.electronAPI?.setSettingsOpen?.(open);
}

function sessionApiKey() {
  const field = document.getElementById('ai-key');
  return field ? field.value.trim() : '';
}

function localRuntimeReady(intel) {
  const selectedId = intel?.selectedId;
  if (!selectedId) {
    return false;
  }
  const model = (intel.models || []).find((item) => item.id === selectedId);
  return Boolean(model && model.ready && (model.kind === 'ollama' || model.kind === 'openai-compat'));
}

function renderLocalIntel(intel) {
  const modelList = document.getElementById('ai-model-list');
  const agentList = document.getElementById('ai-agent-list');
  const status = document.getElementById('ai-intel-status');
  const selectedLabel = document.getElementById('ai-selected');
  const keyLabel = document.getElementById('ai-key-label');
  if (!modelList || !agentList) {
    return;
  }

  const models = Array.isArray(intel?.models) ? intel.models : [];
  const agents = Array.isArray(intel?.agents) ? intel.agents : [];
  const selectedId = intel?.selectedId || null;
  const selected = models.find((item) => item.id === selectedId) || null;

  modelList.replaceChildren();
  const cloud = document.createElement('button');
  cloud.type = 'button';
  cloud.className = `ai-intel-item${selectedId ? '' : ' is-on'}`;
  const cloudTitle = document.createElement('strong');
  cloudTitle.textContent = 'OpenAI (oturum anahtarı)';
  const cloudMeta = document.createElement('span');
  cloudMeta.textContent = 'bulut · anahtar gerekir';
  cloud.append(cloudTitle, cloudMeta);
  cloud.addEventListener('click', () => {
    window.electronAPI?.selectLocalModel?.(null);
  });
  modelList.appendChild(cloud);

  for (const model of models) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ai-intel-item${model.id === selectedId ? ' is-on' : ''}${model.live ? ' is-live' : ''}`;
    const state = model.live ? 'canlı' : model.kind === 'file' ? 'dosya' : 'kayıtlı';
    const meta = [model.source, state, model.sizeLabel].filter(Boolean).join(' · ');
    btn.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = model.name;
    const line = document.createElement('span');
    line.textContent = meta;
    btn.append(title, line);
    btn.addEventListener('click', () => {
      window.electronAPI?.selectLocalModel?.(model.id);
    });
    modelList.appendChild(btn);
  }

  agentList.replaceChildren();
  if (!agents.length) {
    const empty = document.createElement('li');
    empty.className = 'ai-intel-status';
    empty.textContent = 'kurulu ajan sistemi bulunamadı';
    agentList.appendChild(empty);
  } else {
    for (const agent of agents) {
      const row = document.createElement('li');
      row.className = `ai-agent-row${agent.status === 'running' ? ' is-running' : ''}`;
      const title = document.createElement('strong');
      title.textContent = agent.name;
      const line = document.createElement('span');
      line.textContent = agent.status === 'running' ? `çalışıyor · ${agent.detail}` : agent.detail || 'kurulu';
      row.append(title, line);
      agentList.appendChild(row);
    }
  }

  if (status) {
    const liveCount = models.filter((item) => item.live).length;
    status.textContent = models.length
      ? `${models.length} model · ${liveCount} canlı · ${agents.length} ajan`
      : 'bilinen klasörlerde model yok — dosya veya klasör seçin';
  }
  if (selectedLabel) {
    selectedLabel.textContent = selected
      ? `${selected.name}${selected.live ? ' · canlı' : ' · dosya'}`
      : 'model seçilmedi · OpenAI anahtarı veya yerel model';
  }
  if (keyLabel) {
    keyLabel.textContent = localRuntimeReady(intel)
      ? 'API Key (yerel model seçili · gerekmez)'
      : 'API Key (yalnızca bulut · oturum)';
  }
}

function appendAiBubble(role, text) {
  const chat = document.getElementById('ai-chat');
  if (!chat || !text) {
    return;
  }

  const bubble = document.createElement('article');
  bubble.className = `ai-bubble ai-bubble-${role}`;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

function setAiBusy(busy) {
  const sendBtn = document.getElementById('ai-send');
  const summarizeBtn = document.getElementById('ai-summarize');
  const prompt = document.getElementById('ai-prompt');
  if (sendBtn) {
    sendBtn.disabled = busy;
  }
  if (summarizeBtn) {
    summarizeBtn.disabled = busy;
  }
  if (prompt) {
    prompt.disabled = busy;
  }
}

function bindAiSidebar() {
  const api = window.electronAPI;
  const sidebar = document.getElementById('ai-sidebar');
  const toggle = document.getElementById('ai-toggle');
  const form = document.getElementById('ai-form');
  const prompt = document.getElementById('ai-prompt');
  const summarizeBtn = document.getElementById('ai-summarize');
  const keyField = document.getElementById('ai-key');
  const pickFile = document.getElementById('ai-model-pick');
  const pickDir = document.getElementById('ai-model-dir');
  let intelState = { models: [], agents: [], selectedId: null };

  if (!sidebar || !toggle || !form || !prompt || !summarizeBtn || !keyField) {
    return;
  }

  function applyIntel(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    intelState = {
      models: Array.isArray(payload.models) ? payload.models : [],
      agents: Array.isArray(payload.agents) ? payload.agents : [],
      selectedId: payload.selectedId || null,
    };
    renderLocalIntel(intelState);
  }

  toggle.addEventListener('click', () => {
    const open = sidebar.hasAttribute('hidden');
    sidebar.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      setBookmarksPanelOpen(false);
      const status = document.getElementById('ai-intel-status');
      if (status) {
        status.textContent = 'taranıyor…';
      }
    }
    api?.setSidebarOpen?.(open);
  });

  pickFile?.addEventListener('click', () => {
    api?.pickLocalModel?.('file');
  });
  pickDir?.addEventListener('click', () => {
    api?.pickLocalModel?.('dir');
  });

  api?.onLocalIntel?.(applyIntel);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = prompt.value.trim();
    const apiKey = sessionApiKey();
    if (!message) {
      return;
    }
    if (!apiKey && !localRuntimeReady(intelState)) {
      appendAiBubble('error', 'Yerel bir model seçin veya oturum anahtarı girin.');
      return;
    }

    appendAiBubble('user', message);
    prompt.value = '';
    if (!api?.sendAiMessage) {
      appendAiBubble('error', 'AI köprüsü yalnızca Electron oturumunda çalışır.');
      return;
    }
    setAiBusy(true);
    api.sendAiMessage(message, apiKey);
  });

  summarizeBtn.addEventListener('click', () => {
    const apiKey = sessionApiKey();
    if (!apiKey && !localRuntimeReady(intelState)) {
      appendAiBubble('error', 'Yerel bir model seçin veya oturum anahtarı girin.');
      return;
    }

    appendAiBubble('user', 'Sayfayı özetle');
    if (!api?.summarizeCurrentPage) {
      appendAiBubble('error', 'AI köprüsü yalnızca Electron oturumunda çalışır.');
      return;
    }
    setAiBusy(true);
    api.summarizeCurrentPage(apiKey);
  });

  api?.onAiResponse?.((payload) => {
    if (!payload || typeof payload !== 'object') {
      setAiBusy(false);
      return;
    }

    if (payload.ok !== false && payload.type === 'status') {
      appendAiBubble('status', payload.content || 'işleniyor');
      return;
    }

    setAiBusy(false);

    if (payload.ok === false) {
      appendAiBubble('error', payload.error || 'AI isteği başarısız.');
      return;
    }

    appendAiBubble('assistant', payload.content || '');
  });
}

function bindTabs() {
  const api = window.electronAPI;
  const list = document.getElementById('tab-list');
  const newTabBtn = document.getElementById('new-tab');
  if (!list || !newTabBtn) {
    return;
  }

  function markActive(tabId) {
    for (const tab of list.querySelectorAll('.tab')) {
      tab.classList.toggle('is-active', tab.dataset.tabId === tabId);
    }
  }

  function placeTab(tab) {
    if (tab.classList.contains('is-pinned')) {
      const pinned = [...list.children].filter((el) => el.classList.contains('is-pinned') && el !== tab);
      if (pinned.length) {
        pinned[pinned.length - 1].after(tab);
      } else {
        list.prepend(tab);
      }
      return;
    }
    list.appendChild(tab);
  }

  function applyTabState(tab, payload) {
    tab.classList.toggle('is-pinned', Boolean(payload.pinned));
    tab.classList.toggle('is-muted', Boolean(payload.muted));
    tab.classList.toggle('is-audible', Boolean(payload.audible) && !payload.muted);
    tab.dataset.pinned = payload.pinned ? '1' : '0';
    tab.dataset.muted = payload.muted ? '1' : '0';
    placeTab(tab);
  }

  function upsertTab(payload, makeActive = true) {
    const { tabId, title } = payload;
    let tab = list.querySelector(`[data-tab-id="${CSS.escape(tabId)}"]`);
    if (!tab) {
      tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.tabId = tabId;
      tab.setAttribute('role', 'tab');

      const pinEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      pinEl.setAttribute('class', 'tab-pin');
      pinEl.setAttribute('viewBox', '0 0 16 16');
      pinEl.setAttribute('aria-hidden', 'true');
      const pinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pinPath.setAttribute('d', 'M8 2.2 9.6 6.4 14 7 10.8 10l.8 4.2L8 12.2 4.4 14.2 5.2 10 2 7l4.4-.6Z');
      pinEl.append(pinPath);

      const muteEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      muteEl.setAttribute('class', 'tab-mute');
      muteEl.setAttribute('viewBox', '0 0 16 16');
      muteEl.setAttribute('aria-hidden', 'true');
      const mutePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      mutePath.setAttribute('d', 'M3 6.2h2.2L8.4 4v8L5.2 9.8H3Z');
      muteEl.append(mutePath);

      const titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      titleEl.textContent = title || 'Yükleniyor...';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-close';
      closeBtn.setAttribute('aria-label', 'Sekmeyi kapat');
      closeBtn.textContent = '×';

      tab.append(pinEl, muteEl, titleEl, closeBtn);
      tab.addEventListener('click', () => {
        markActive(tabId);
        api?.switchTab?.(tabId);
      });
      tab.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        api?.showTabMenu?.(tabId, { x: event.x, y: event.y });
      });
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        api?.closeTab?.(tabId);
      });
      list.appendChild(tab);
    } else if (title) {
      const titleEl = tab.querySelector('.tab-title');
      if (titleEl) {
        titleEl.textContent = title;
      }
    }

    applyTabState(tab, payload);

    if (makeActive) {
      markActive(tabId);
    }
  }

  newTabBtn.addEventListener('click', () => api?.createTab?.());

  api?.onTabCreated?.((payload) => {
    if (payload && typeof payload.tabId === 'string') {
      upsertTab(payload, payload.active !== false);
    }
  });

  api?.onTabTitleUpdated?.((payload) => {
    if (!payload || typeof payload.tabId !== 'string') {
      return;
    }
    const tab = list.querySelector(`[data-tab-id="${CSS.escape(payload.tabId)}"]`);
    const titleEl = tab?.querySelector('.tab-title');
    if (titleEl && typeof payload.title === 'string' && payload.title.trim()) {
      titleEl.textContent = payload.title;
    }
  });

  api?.onTabUpdated?.((payload) => {
    if (payload && typeof payload.tabId === 'string') {
      upsertTab(payload, payload.active === true);
      if (payload.active === true) {
        refreshSecurityStats();
      }
    }
  });

  api?.onTabClosed?.((payload) => {
    if (!payload || typeof payload.tabId !== 'string') {
      return;
    }
    list.querySelector(`[data-tab-id="${CSS.escape(payload.tabId)}"]`)?.remove();
    if (typeof payload.nextTabId === 'string') {
      markActive(payload.nextTabId);
    }
  });
}

function bindBookmarks() {
  const api = window.electronAPI;
  const list = document.getElementById('bookmarks-list');
  const shortcuts = document.getElementById('yerimleri-kisayollar');
  const panel = document.getElementById('bookmarks-panel');
  if (!list) {
    return;
  }

  function renderBarShortcuts() {
    if (!shortcuts) {
      return;
    }
    shortcuts.replaceChildren();
    for (const item of barShortcuts) {
      const chip = document.createElement('div');
      chip.className = 'yerim-chip';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'yerim-open';
      open.dataset.url = item.url;
      open.setAttribute('aria-label', item.title);
      const favicon = createSiteIcon(item.url, 'yerim-favicon', item.favicon);
      const title = document.createElement('span');
      title.className = 'yerim-title';
      title.textContent = item.title;
      open.append(favicon, title);
      open.addEventListener('click', () => {
        api?.navigate?.(item.url);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'yerim-remove';
      remove.setAttribute('aria-label', `${item.title} kısayolunu kaldır`);
      remove.textContent = '×';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        barShortcuts = barShortcuts.filter((entry) => entry.id !== item.id);
        renderBarShortcuts();
      });
      chip.append(open, remove);
      shortcuts.appendChild(chip);
    }
  }

  renderBarShortcuts();

  api?.onBookmarks?.((payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    sessionBookmarkItems = items;
    sessionBookmarkFolders = Array.isArray(payload?.folders) && payload.folders.length
      ? payload.folders
      : [{ id: 'bar', title: 'Bookmarks bar', createdAt: 0 }];
    const empty = document.getElementById('bookmarks-empty');
    if (empty) {
      empty.hidden = items.length > 0;
    }
    list.replaceChildren();
    for (const item of items) {
      const chip = document.createElement('div');
      chip.className = 'bookmark-chip';
      const icon = createSiteIcon(item.url, 'yerim-favicon', item.favicon);
      const label = document.createElement('span');
      label.textContent = item.title || item.url;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'yerim-remove';
      remove.setAttribute('aria-label', 'Yer imini kaldır');
      remove.textContent = '×';
      chip.append(icon, label, remove);
      chip.addEventListener('click', (event) => {
        if (event.target === remove) {
          return;
        }
        api?.navigate?.(item.url);
      });
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        api?.removeBookmark?.(item.id);
      });
      list.appendChild(chip);
    }
    const star = document.getElementById('bookmark-star');
    setStarState(star, Boolean(payload?.bookmarked));
    renderBookmarksPanel();
  });

  if (!panel) {
    return;
  }

  document.getElementById('bookmarks-all-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = panel.hasAttribute('hidden');
    setBookmarksPanelOpen(open);
    if (open) {
      renderBookmarksPanel();
    }
  });

  document.getElementById('bp-close')?.addEventListener('click', () => setBookmarksPanelOpen(false));
  document.getElementById('bp-pin')?.addEventListener('click', (event) => {
    const btn = event.currentTarget;
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', next ? 'true' : 'false');
    btn.classList.toggle('is-on', next);
  });
  document.getElementById('bp-query')?.addEventListener('input', renderBookmarksPanel);
  document.getElementById('bp-sort')?.addEventListener('change', (event) => {
    bookmarkSort = event.target.value || 'newest';
    renderBookmarksPanel();
  });
  document.getElementById('bp-view')?.addEventListener('click', (event) => {
    const compact = !panel.classList.contains('is-compact');
    panel.classList.toggle('is-compact', compact);
    event.currentTarget.setAttribute('aria-pressed', compact ? 'true' : 'false');
  });
  document.getElementById('bp-edit')?.addEventListener('click', (event) => {
    const editing = !panel.classList.contains('is-editing');
    panel.classList.toggle('is-editing', editing);
    event.currentTarget.setAttribute('aria-pressed', editing ? 'true' : 'false');
  });
  document.getElementById('bp-new-folder')?.addEventListener('click', () => {
    const title = window.prompt('Folder name', 'New folder');
    if (title && title.trim()) {
      api?.createBookmarkFolder?.(title.trim());
    }
  });
  document.getElementById('bp-add-tab')?.addEventListener('click', () => api?.toggleBookmark?.());
}

function bindDownloads() {
  const api = window.electronAPI;
  const toggle = document.getElementById('downloads-toggle');
  const badge = document.getElementById('downloads-badge');
  if (!toggle) {
    return;
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    api?.openDownloadsTab?.();
  });

  api?.onDownloads?.((payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const activeCount = items.filter((item) => item.state === 'progressing').length;
    if (badge) {
      badge.hidden = activeCount === 0;
      badge.textContent = String(activeCount);
    }
  });

  let diskWarningTimer = 0;
  function showChromeBanner(message, durationMs) {
    const banner = document.getElementById('disk-warning');
    if (!banner || !message) {
      return;
    }
    banner.textContent = message;
    banner.hidden = false;
    window.clearTimeout(diskWarningTimer);
    diskWarningTimer = window.setTimeout(() => {
      banner.hidden = true;
    }, durationMs);
  }

  api?.onDiskWarning?.((payload) => {
    showChromeBanner(
      payload?.message ||
        'Uyarı: Bu dosya yerel diskinize kaydedildi. Excommunicado protokolü bu dosyayı silmeyebilir.',
      8000,
    );
  });
  api?.onToast?.((payload) => {
    if (payload?.message) {
      showChromeBanner(payload.message, 5000);
    }
  });
}

function bindPanic() {
  const api = window.electronAPI;
  const panicBtn = document.getElementById('panic-btn');
  let burned = false;

  function burnInterface() {
    if (burned) {
      return;
    }
    burned = true;

    document.querySelectorAll('input, textarea').forEach((field) => {
      field.value = '';
    });
    document.getElementById('ai-chat')?.replaceChildren();
    document.getElementById('tab-list')?.replaceChildren();
    document.getElementById('bookmarks-list')?.replaceChildren();
    document.getElementById('yerimleri-kisayollar')?.replaceChildren();
    barShortcuts = [];
    faviconByHost.clear();
    document.getElementById('downloads-list')?.replaceChildren();
    document.querySelector('.chrome')?.remove();
    document.querySelector('.workspace')?.remove();
    document.body.classList.add('is-purged');

    const overlay = document.getElementById('excommunicado');
    if (overlay) {
      overlay.hidden = false;
    }
  }

  panicBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    burnInterface();
    api?.triggerPanic?.();
  });

  api?.onPanicBurn?.(() => {
    burnInterface();
  });
}

function bindUsefulLinks() {
  document.getElementById('btn-useful-links')?.addEventListener('click', () => {
    window.electronAPI?.openUsefulLinks?.();
  });
}

bindChrome();
bindUsefulLinks();
bindAiSidebar();
bindTabs();
bindBookmarks();
bindDownloads();
bindPanic();
bindSettings();
bindAppMenu();
bindShield();
bindSite();
bindTools();
bindToolbarControls();

function bindShield() {
  const api = window.electronAPI;
  const toggle = document.getElementById('shield-toggle');
  if (!toggle) {
    return;
  }

  let shieldVisible = false;
  let ignoreToggleUntil = 0;

  function shieldAnchor() {
    const box = toggle.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  }

  function setShieldVisible(open) {
    shieldVisible = open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      hideUtilityPops();
      document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      api?.setMenuOpen?.(false);
      api?.setSiteOpen?.(false);
      api?.setToolsOpen?.(false);
      ignoreToggleUntil = Date.now() + 280;
    }
    api?.setShieldOpen?.(open, open ? shieldAnchor() : null)?.then((result) => {
      if (result?.ok && result.settings) {
        applyPrivacyChrome(result.settings);
      }
    });
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (Date.now() < ignoreToggleUntil) {
      return;
    }
    setShieldVisible(!shieldVisible);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shieldVisible) {
      setShieldVisible(false);
    }
  });

  api?.onShieldClosed?.(() => {
    shieldVisible = false;
    ignoreToggleUntil = Date.now() + 280;
    toggle.setAttribute('aria-expanded', 'false');
  });
  api?.onSecurityStats?.((payload) => {
    applySecurityStats(payload);
  });
  refreshSecurityStats();
}

function bindSite() {
  const api = window.electronAPI;
  const toggle = document.getElementById('site-toggle');
  if (!toggle) {
    return;
  }

  let siteVisible = false;
  let ignoreToggleUntil = 0;

  function siteAnchor() {
    const box = toggle.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  }

  function setSiteVisible(open) {
    siteVisible = open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      hideUtilityPops();
      document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('shield-toggle')?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      api?.setMenuOpen?.(false);
      api?.setShieldOpen?.(false);
      api?.setToolsOpen?.(false);
      ignoreToggleUntil = Date.now() + 280;
    }
    api?.setSiteOpen?.(open, open ? siteAnchor() : null);
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (Date.now() < ignoreToggleUntil) {
      return;
    }
    setSiteVisible(!siteVisible);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && siteVisible) {
      setSiteVisible(false);
    }
  });

  api?.onSiteClosed?.(() => {
    siteVisible = false;
    ignoreToggleUntil = Date.now() + 280;
    toggle.setAttribute('aria-expanded', 'false');
  });
}

function bindTools() {
  const api = window.electronAPI;
  const toggle = document.getElementById('tools-toggle');
  if (!toggle) {
    return;
  }

  let toolsVisible = false;
  let ignoreToggleUntil = 0;

  function toolsAnchor() {
    const box = toggle.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  }

  function setToolsVisible(open) {
    toolsVisible = open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      hideUtilityPops();
      document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('shield-toggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('site-toggle')?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      api?.setMenuOpen?.(false);
      api?.setShieldOpen?.(false);
      api?.setSiteOpen?.(false);
      ignoreToggleUntil = Date.now() + 280;
    }
    api?.setToolsOpen?.(open, open ? toolsAnchor() : null);
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (Date.now() < ignoreToggleUntil) {
      return;
    }
    setToolsVisible(!toolsVisible);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toolsVisible) {
      setToolsVisible(false);
    }
  });

  api?.onToolsClosed?.(() => {
    toolsVisible = false;
    ignoreToggleUntil = Date.now() + 280;
    toggle.setAttribute('aria-expanded', 'false');
  });
  api?.onToolsCommand?.((payload) => {
    const action = payload?.action;
    if (action === 'shield') {
      document.getElementById('shield-toggle')?.click();
    } else if (action === 'ghost') {
      document.getElementById('ghost-toggle')?.click();
    } else if (action === 'settings') {
      setSettingsPanelOpen(true);
    }
  });
}

function bindToolbarControls() {
  const api = window.electronAPI;

  document.getElementById('ghost-toggle')?.addEventListener('click', () => {
    const next = !document.body.classList.contains('ghost-network');
    applyPrivacyChrome({
      ghostNetwork: next,
      blockTrackers: document.getElementById('shield-toggle')?.classList.contains('is-armed') !== false,
    });
    api?.setSetting?.('ghostNetwork', next)?.then((result) => {
      if (result?.settings) {
        applyPrivacyChrome(result.settings);
      }
    });
  });

  document.getElementById('profile-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    showUtilityPop('profile-pop');
  });

  document.getElementById('profile-settings')?.addEventListener('click', () => {
    hideUtilityPops();
    setSettingsPanelOpen(true);
  });

  document.getElementById('profile-panic')?.addEventListener('click', () => {
    document.getElementById('panic-btn')?.click();
  });

  document.getElementById('apps-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    showUtilityPop('apps-pop');
  });

  document.getElementById('apps-pop')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-url], [data-action]');
    if (!item) {
      return;
    }
    hideUtilityPops();
    if (item.dataset.action === 'new-tab') {
      api?.createTab?.();
      return;
    }
    if (item.dataset.url) {
      api?.navigate?.(item.dataset.url);
    }
  });

  for (const item of UTILITY_POPS) {
    document.getElementById(item.pop)?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  document.addEventListener('click', (event) => {
    const openPop = UTILITY_POPS.find((item) => {
      const pop = document.getElementById(item.pop);
      return pop && !pop.classList.contains('hidden');
    });
    if (!openPop) {
      return;
    }
    const pop = document.getElementById(openPop.pop);
    const toggle = document.getElementById(openPop.toggle);
    if (pop?.contains(event.target) || toggle?.contains(event.target)) {
      return;
    }
    hideUtilityPops();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideUtilityPops();
    }
  });
}

function bindAppMenu() {
  const api = window.electronAPI;
  const toggle = document.getElementById('settings-toggle');
  const findBar = document.getElementById('find-bar');
  const findQuery = document.getElementById('find-query');
  const findCount = document.getElementById('find-count');
  const ramSheet = document.getElementById('ram-sheet');
  const ramTitle = document.getElementById('ram-sheet-title');
  const ramBody = document.getElementById('ram-sheet-body');
  if (!toggle) {
    return;
  }

  let menuVisible = false;
  let ignoreToggleUntil = 0;

  const ramCopy = {
    passwords: ['Passwords and autofill', 'No saved passwords. Autofill stays in RAM for this session only.'],
    history: ['History', ''],
    bookmarks: ['Bookmarks and lists', ''],
    'tab-groups': ['Tab groups', 'Tab groups are not persisted. This session has no named groups.'],
    extensions: ['Extensions', 'Permanent extensions are blocked. Session tools live in the puzzle menu.'],
    translate: ['Translate', 'No translation memory is stored. Use a local model in the AI panel if you need a translation.'],
    find: ['Find and edit', 'Use the find bar to search the current page. Matches are not logged.'],
    cast: ['Cast, save, and share', 'Casting is disabled. Nothing is sent to a remote display from this browser.'],
    'more-tools': ['More tools', 'Task manager, developer extras, and install hooks stay out of this RAM session.'],
    help: ['Help', 'Ctrl+T new tab · Ctrl+N new window · Ctrl+Shift+N incognito window · Ctrl+J downloads · Ctrl+P print · Ctrl+F find · Ctrl+Shift+Del wipe RAM · Ctrl+Shift+E Excommunicado.'],
    profile: ['Sanatçı (Agent)', 'Signed in for this RAM session only. There is no account graph and nothing syncs.'],
  };

  function kebabAnchor() {
    const box = toggle.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  }

  function setMenuVisible(open) {
    menuVisible = open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);
    if (open) {
      hideUtilityPops();
      document.getElementById('shield-toggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('site-toggle')?.setAttribute('aria-expanded', 'false');
      api?.setShieldOpen?.(false);
      api?.setSiteOpen?.(false);
      api?.setToolsOpen?.(false);
      api?.setMenuOpen?.(true, kebabAnchor());
      return;
    }
    api?.setMenuOpen?.(false);
  }

  function setFindVisible(open) {
    if (!findBar) {
      return;
    }
    findBar.hidden = !open;
    document.body.classList.toggle('find-open', open);
    api?.setFindOpen?.(open);
    if (open) {
      findQuery?.focus();
      findQuery?.select();
    }
  }

  function setRamSheet(kind, extraHtml) {
    if (!ramSheet || !ramTitle || !ramBody) {
      return;
    }
    const meta = ramCopy[kind] || ['RAM-Only Data', 'Temporary session surface.'];
    ramTitle.textContent = meta[0];
    ramBody.replaceChildren();
    if (kind === 'history') {
      if (sessionVisits.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No visits in this RAM session.';
        ramBody.appendChild(empty);
      } else {
        const list = document.createElement('ul');
        for (const url of sessionVisits) {
          const item = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = url;
          btn.addEventListener('click', () => {
            api?.navigate?.(url);
            ramSheet.hidden = true;
            api?.setRamSheetOpen?.(false);
          });
          item.appendChild(btn);
          list.appendChild(item);
        }
        ramBody.appendChild(list);
      }
    } else if (kind === 'bookmarks') {
      const empty = document.createElement('p');
      empty.textContent = 'Open All Bookmarks for the session list. Nothing is written to disk.';
      ramBody.appendChild(empty);
    } else {
      const note = document.createElement('p');
      note.textContent = extraHtml || meta[1];
      ramBody.appendChild(note);
    }
    ramSheet.hidden = false;
    document.getElementById('bookmarks-panel') && (document.getElementById('bookmarks-panel').hidden = true);
    document.getElementById('bookmarks-all-toggle')?.setAttribute('aria-expanded', 'false');
    api?.setBookmarksPanelOpen?.(false);
    api?.setRamSheetOpen?.(true);
  }

  function runFind(findNext, forward = true) {
    const query = findQuery?.value?.trim() || '';
    if (!query) {
      return;
    }
    api?.findInPage?.(query, { findNext, forward });
  }

  async function handleMenuAction(action, fromMain = false) {
    if (action === 'default-browser' || action === 'cleared') {
      return;
    }
    if (action === 'new-tab') {
      if (!fromMain) {
        api?.menuAction?.('new-tab');
      }
      return;
    }
    if (action === 'new-window' || action === 'new-incognito') {
      if (!fromMain) {
        api?.menuAction?.(action);
      }
      return;
    }
    if (action === 'downloads') {
      api?.openDownloadsTab?.();
      return;
    }
    if (action === 'bookmarks') {
      document.getElementById('bookmarks-all-toggle')?.click();
      return;
    }
    if (action === 'history' || action === 'passwords' || action === 'tab-groups' || action === 'extensions' || action === 'translate' || action === 'cast' || action === 'more-tools' || action === 'help' || action === 'profile') {
      setRamSheet(action);
      return;
    }
    if (action === 'find') {
      setFindVisible(true);
      return;
    }
    if (action === 'print') {
      if (!fromMain) {
        api?.menuAction?.('print');
      }
      return;
    }
    if (action === 'fullscreen') {
      if (!fromMain) {
        api?.toggleFullscreen?.();
      }
      return;
    }
    if (action === 'gemini' || action === 'lens') {
      const sidebar = document.getElementById('ai-sidebar');
      if (sidebar?.hidden) {
        document.getElementById('ai-toggle')?.click();
      }
      if (action === 'lens') {
        const key = sessionApiKey();
        if (key) {
          api?.summarizeCurrentPage?.(key);
        }
      }
      return;
    }
    if (action === 'settings') {
      setSettingsPanelOpen(true);
      return;
    }
    if (action === 'clear-data') {
      if (!fromMain) {
        await api?.menuAction?.('clear-data');
      }
      setRamSheet('history');
      ramTitle.textContent = 'Delete browsing data';
      ramBody.replaceChildren();
      const note = document.createElement('p');
      note.textContent = 'Isolated RAM session cache and storage were wiped. Disk was not touched.';
      ramBody.appendChild(note);
      return;
    }
    if (action === 'exit') {
      if (!fromMain) {
        api?.menuAction?.('exit');
      }
    }
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (Date.now() < ignoreToggleUntil) {
      return;
    }
    setMenuVisible(!menuVisible);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!menuVisible) {
      return;
    }
    if (toggle.contains(event.target)) {
      return;
    }
    setMenuVisible(false);
  });

  document.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
      setMenuVisible(false);
      if (findBar && !findBar.hidden) {
        setFindVisible(false);
        api?.stopFindInPage?.();
      }
    }
    if (ctrl && event.key.toLowerCase() === 't' && !event.shiftKey) {
      event.preventDefault();
      handleMenuAction('new-tab');
    }
    if (ctrl && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      handleMenuAction(event.shiftKey ? 'new-incognito' : 'new-window');
    }
    if (ctrl && event.key.toLowerCase() === 'j' && !event.shiftKey) {
      event.preventDefault();
      handleMenuAction('downloads');
    }
    if (ctrl && event.key.toLowerCase() === 'p' && !event.shiftKey) {
      event.preventDefault();
      handleMenuAction('print');
    }
    if (ctrl && event.key.toLowerCase() === 'f' && !event.shiftKey) {
      event.preventDefault();
      handleMenuAction('find');
    }
    if (ctrl && event.shiftKey && event.key === 'Delete') {
      event.preventDefault();
      handleMenuAction('clear-data');
    }
  });

  findQuery?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runFind(true, !event.shiftKey);
    }
  });
  document.getElementById('find-next')?.addEventListener('click', () => runFind(true, true));
  document.getElementById('find-prev')?.addEventListener('click', () => runFind(true, false));
  document.getElementById('find-close')?.addEventListener('click', () => {
    setFindVisible(false);
    api?.stopFindInPage?.();
  });
  document.getElementById('ram-sheet-close')?.addEventListener('click', () => {
    if (ramSheet) {
      ramSheet.hidden = true;
    }
    api?.setRamSheetOpen?.(false);
  });

  api?.onFindResult?.((payload) => {
    if (findCount && payload) {
      findCount.textContent = `${payload.activeMatchOrdinal || 0}/${payload.matches || 0}`;
    }
  });
  api?.onMenuCommand?.((payload) => {
    if (payload?.action) {
      handleMenuAction(payload.action, true);
    }
  });
  api?.onMenuClosed?.(() => {
    menuVisible = false;
    ignoreToggleUntil = Date.now() + 280;
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  });
}

function bindSettings() {
  const api = window.electronAPI;
  const panel = document.getElementById('settings-panel');
  const toggle = document.getElementById('settings-toggle');
  const closeBtn = document.getElementById('settings-close');
  if (!panel || !toggle) {
    return;
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    api?.setSettingsOpen?.(open);
  }

  function applySettings(settings) {
    if (!settings || typeof settings !== 'object') {
      return;
    }

    for (const input of panel.querySelectorAll('input[data-setting]')) {
      const key = input.dataset.setting;
      if (typeof settings[key] === 'boolean') {
        input.checked = settings[key];
      }
    }

    const engine = document.getElementById('setting-searchEngine');
    if (engine && typeof settings.searchEngine === 'string') {
      engine.value = settings.searchEngine;
    }
    if (typeof settings.searchBase === 'string' && settings.searchBase) {
      searchEngineBase = settings.searchBase;
    }
    const shortcut = document.getElementById('setting-shortcut');
    if (shortcut && typeof settings.panicShortcut === 'string') {
      shortcut.textContent = settings.panicShortcut;
    }

    const bridgeCard = document.getElementById('agent-bridge-card');
    const bridgeUrl = document.getElementById('agent-bridge-url');
    const bridgeToken = document.getElementById('agent-bridge-token');
    if (bridgeCard) {
      bridgeCard.hidden = !settings.agentBridge;
    }
    if (bridgeUrl) {
      bridgeUrl.value = settings.agentBridgeUrl || '';
    }
    if (bridgeToken) {
      bridgeToken.value = settings.agentBridgeToken || '';
    }
    applyPrivacyChrome(settings);
  }

  closeBtn?.addEventListener('click', () => setSettingsPanelOpen(false));

  panel.addEventListener('change', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
      return;
    }
    const key = field.dataset.setting;
    if (!key || field.disabled) {
      return;
    }
    const value = field instanceof HTMLInputElement && field.type === 'checkbox' ? field.checked : field.value;
    api?.setSetting?.(key, value)?.then((result) => {
      if (result?.ok && result.settings) {
        applySettings(result.settings);
      }
    });
  });

  api?.onSettings?.((settings) => {
    applySettings(settings);
  });
  api?.getSettings?.()?.then((result) => {
    if (result?.ok && result.settings) {
      applySettings(result.settings);
    }
  });
}
