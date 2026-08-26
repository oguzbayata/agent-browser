'use strict';

let searchEngineBase = 'https://duckduckgo.com/?q=';
const sessionVisits = [];
let currentPageUrl = '';
let sessionBookmarkItems = [];
let sessionBookmarkFolders = [{ id: 'bar', title: 'Bookmarks bar', createdAt: 0 }];

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

function schemeOf(value) {
  return isLocalHostOrIp(value) ? 'http://' : 'https://';
}

function resolveDestination(raw) {
  const value = raw.trim();
  if (!value) {
    return '';
  }

  if (!isUrlLike(value)) {
    return `${searchEngineBase}${encodeURIComponent(value)}`;
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

    input.value = url;
    api?.navigate?.(url);
    input.blur();
  });

  input.addEventListener('input', () => maybePrefixUrl(input));

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
    if (document.activeElement === input) {
      return;
    }

    input.value = displayUrl;
    if (input.value) {
      rememberSessionVisit(input.value);
    }
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
    blocked.textContent = `${settings.blockedRequestCount} istek engellendi`;
  }
}

const UTILITY_POPS = [
  { pop: 'site-pop', toggle: 'site-toggle' },
  { pop: 'tools-pop', toggle: 'tools-toggle' },
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
  document.getElementById('agent-main-menu')?.classList.add('hidden');
  document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
  document.getElementById('shield-pop')?.classList.add('hidden');
  document.getElementById('shield-toggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('shield-open');
  window.electronAPI?.setMenuOpen?.(false);
  window.electronAPI?.setShieldOpen?.(false);
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

function siteSummary() {
  if (!currentPageUrl) {
    return { host: 'sayfa yok', meta: 'Adres çubuğundan bir hedef açın.' };
  }
  try {
    const parsed = new URL(currentPageUrl);
    const secure = parsed.protocol === 'https:';
    return {
      host: parsed.hostname || parsed.href,
      meta: secure ? 'Bağlantı şifreli (HTTPS)' : `${parsed.protocol.replace(':', '')} · şifresiz`,
    };
  } catch {
    return { host: currentPageUrl, meta: 'Adres çözümlenemedi.' };
  }
}

const BOOKMARK_MARK_COLORS = ['#e53935', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00', '#00897b', '#3949ab'];
const expandedBookmarkFolders = new Set(['bar']);
let bookmarkSort = 'newest';

function bookmarkMark(url) {
  let host = String(url || '');
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // Keep raw value.
  }
  const letter = (host[0] || '?').toUpperCase();
  let sum = 0;
  for (const ch of host) {
    sum += ch.charCodeAt(0);
  }
  return { letter, color: BOOKMARK_MARK_COLORS[sum % BOOKMARK_MARK_COLORS.length] };
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
      const mark = bookmarkMark(item.url);
      const icon = document.createElement('span');
      icon.className = 'bp-mark';
      icon.style.background = mark.color;
      icon.textContent = mark.letter;
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
  }
  window.electronAPI?.setBookmarksPanelOpen?.(open);
}

function setSettingsPanelOpen(open) {
  const panel = document.getElementById('settings-panel');
  if (!panel) {
    return;
  }
  panel.hidden = !open;
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
  const panel = document.getElementById('bookmarks-panel');
  if (!list) {
    return;
  }

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
      const label = document.createElement('span');
      label.textContent = item.title || item.url;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Yer imini kaldır');
      remove.textContent = '×';
      chip.append(label, remove);
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
  const pop = document.getElementById('downloads-pop');
  const list = document.getElementById('downloads-list');
  const empty = document.getElementById('downloads-empty');
  const badge = document.getElementById('downloads-badge');
  if (!toggle || !pop || !list || !empty) {
    return;
  }

  function setOpen(open) {
    pop.hidden = !open;
    document.body.classList.toggle('downloads-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    api?.setDownloadsOpen?.(open);
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(pop.hasAttribute('hidden'));
  });

  api?.onDownloads?.((payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    empty.hidden = items.length > 0;
    list.replaceChildren();
    const activeCount = items.filter((item) => item.state === 'progressing').length;
    if (badge) {
      badge.hidden = activeCount === 0;
      badge.textContent = String(activeCount);
    }
    if (payload?.open) {
      setOpen(true);
    } else if (payload?.open === false) {
      setOpen(false);
    }

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'download-row';
      const name = document.createElement('p');
      name.textContent = item.filename || 'indirilen';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = '×';
      cancel.setAttribute('aria-label', 'İndirmeyi iptal et');
      cancel.disabled = item.state !== 'progressing';
      cancel.addEventListener('click', () => api?.cancelDownload?.(item.id));
      const bar = document.createElement('div');
      bar.className = 'download-bar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.round((item.progress || 0) * 100)}%`;
      bar.append(fill);
      row.append(name, cancel, bar);
      list.appendChild(row);
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

bindChrome();
bindAiSidebar();
bindTabs();
bindBookmarks();
bindDownloads();
bindPanic();
bindSettings();
bindAppMenu();
bindShield();
bindToolbarControls();

function bindShield() {
  const api = window.electronAPI;
  const toggle = document.getElementById('shield-toggle');
  const pop = document.getElementById('shield-pop');
  if (!toggle || !pop) {
    return;
  }

  function setShieldVisible(open) {
    pop.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('shield-open', open);
    if (open) {
      hideUtilityPops();
      document.getElementById('agent-main-menu')?.classList.add('hidden');
      document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      api?.setMenuOpen?.(false);
    }
    api?.setShieldOpen?.(open)?.then((result) => {
      if (result?.ok && result.settings) {
        applyPrivacyChrome(result.settings);
      }
    });
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setShieldVisible(pop.classList.contains('hidden'));
  });

  pop.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  pop.addEventListener('change', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.setting) {
      return;
    }
    api?.setSetting?.(field.dataset.setting, field.checked)?.then((result) => {
      if (result?.settings) {
        applyPrivacyChrome(result.settings);
        return;
      }
      applyPrivacyChrome({
        blockTrackers: document.getElementById('toggle-blockTrackers')?.checked,
        ghostNetwork: document.getElementById('toggle-ghostNetwork')?.checked,
      });
    });
    applyPrivacyChrome({
      blockTrackers: document.getElementById('toggle-blockTrackers')?.checked,
      ghostNetwork: document.getElementById('toggle-ghostNetwork')?.checked,
    });
  });

  document.addEventListener('click', (event) => {
    if (pop.classList.contains('hidden')) {
      return;
    }
    if (pop.contains(event.target) || toggle.contains(event.target)) {
      return;
    }
    setShieldVisible(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pop.classList.contains('hidden')) {
      setShieldVisible(false);
    }
  });
}

function bindToolbarControls() {
  const api = window.electronAPI;

  document.getElementById('site-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const summary = siteSummary();
    const host = document.getElementById('site-host');
    const meta = document.getElementById('site-scheme');
    if (host) {
      host.textContent = summary.host;
    }
    if (meta) {
      meta.textContent = summary.meta;
    }
    showUtilityPop('site-pop');
  });

  document.getElementById('site-copy')?.addEventListener('click', async () => {
    if (!currentPageUrl || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(currentPageUrl);
    } catch {
      // Clipboard may be denied in some hosts; the button still exists.
    }
  });

  document.getElementById('site-reload')?.addEventListener('click', () => {
    api?.reload?.();
    hideUtilityPops();
  });

  document.getElementById('ghost-toggle')?.addEventListener('click', () => {
    const next = !document.body.classList.contains('ghost-network');
    applyPrivacyChrome({
      ghostNetwork: next,
      blockTrackers: document.getElementById('toggle-blockTrackers')?.checked !== false,
    });
    api?.setSetting?.('ghostNetwork', next)?.then((result) => {
      if (result?.settings) {
        applyPrivacyChrome(result.settings);
      }
    });
  });

  document.getElementById('tools-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    showUtilityPop('tools-pop');
  });

  document.getElementById('tools-pop')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-tools]');
    if (!item) {
      return;
    }
    const action = item.dataset.tools;
    hideUtilityPops();
    if (action === 'shield') {
      document.getElementById('shield-toggle')?.click();
    } else if (action === 'ghost') {
      document.getElementById('ghost-toggle')?.click();
    } else if (action === 'downloads') {
      document.getElementById('downloads-toggle')?.click();
    } else if (action === 'settings') {
      setSettingsPanelOpen(true);
    }
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

  document.querySelectorAll('.yerim-chip[data-url]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const url = chip.dataset.url;
      if (url) {
        api?.navigate?.(url);
      }
    });
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
  const menu = document.getElementById('agent-main-menu');
  const zoomLabel = document.getElementById('zoom-label');
  const historyPop = document.getElementById('session-history-pop');
  const historyList = document.getElementById('session-history-list');
  const historyEmpty = document.getElementById('session-history-empty');
  if (!toggle || !menu) {
    return;
  }

  function setMenuVisible(open) {
    menu.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);
    if (open) {
      hideUtilityPops();
      document.getElementById('shield-pop')?.classList.add('hidden');
      document.getElementById('shield-toggle')?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('shield-open');
      api?.setShieldOpen?.(false);
    }
    api?.setMenuOpen?.(open);
  }

  function renderHistory() {
    if (!historyList || !historyEmpty) {
      return;
    }
    historyEmpty.hidden = sessionVisits.length > 0;
    historyList.replaceChildren();
    for (const url of sessionVisits) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'history-row';
      row.textContent = url;
      row.addEventListener('click', () => {
        api?.navigate?.(url);
        historyPop.hidden = true;
      });
      historyList.appendChild(row);
    }
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuVisible(menu.classList.contains('hidden'));
  });

  document.addEventListener('click', (event) => {
    if (menu.classList.contains('hidden')) {
      return;
    }
    if (menu.contains(event.target) || toggle.contains(event.target)) {
      return;
    }
    setMenuVisible(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMenuVisible(false);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
      event.preventDefault();
      api?.createTab?.();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      document.getElementById('downloads-toggle')?.click();
    }
  });

  async function applyZoom(action) {
    const result = await api?.setZoom?.(action);
    if (result?.ok && zoomLabel) {
      zoomLabel.textContent = `${result.zoom}%`;
    }
  }

  document.getElementById('zoom-out')?.addEventListener('click', (event) => {
    event.stopPropagation();
    applyZoom('out');
  });
  document.getElementById('zoom-in')?.addEventListener('click', (event) => {
    event.stopPropagation();
    applyZoom('in');
  });

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-action]');
    if (!item) {
      return;
    }
    const action = item.dataset.action;
    if (action === 'new-tab' || action === 'new-isolated') {
      api?.createTab?.();
    } else if (action === 'history') {
      renderHistory();
      if (historyPop) {
        historyPop.hidden = false;
      }
    } else if (action === 'downloads') {
      document.getElementById('downloads-toggle')?.click();
    } else if (action === 'bookmarks') {
      document.getElementById('bookmarks-all-toggle')?.click();
    } else if (action === 'fullscreen') {
      api?.toggleFullscreen?.();
    } else if (action === 'ai') {
      document.getElementById('ai-toggle')?.click();
    } else if (action === 'settings') {
      setSettingsPanelOpen(true);
    } else if (action === 'panic') {
      document.getElementById('panic-btn')?.click();
    }
    setMenuVisible(false);
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

  api?.getSettings?.()?.then((result) => {
    if (result?.ok && result.settings) {
      applySettings(result.settings);
    }
  });
}
