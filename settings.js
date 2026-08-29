'use strict';

const api = window.electronAPI;
const ENGINE_FALLBACK = Object.freeze([
  { id: 'duckduckgo', name: 'DuckDuckGo', icon: 'assets/search-engines/duckduckgo.svg' },
  { id: 'startpage', name: 'Startpage', icon: 'assets/search-engines/startpage.svg' },
  { id: 'google', name: 'Google', icon: 'assets/search-engines/google.svg' },
  { id: 'bing', name: 'Bing', icon: 'assets/search-engines/bing.svg' },
  { id: 'baidu', name: 'Baidu', icon: 'assets/search-engines/baidu.svg' },
  { id: 'yandex', name: 'Yandex', icon: 'assets/search-engines/yandex.svg' },
  { id: 'yahoo', name: 'Yahoo', icon: 'assets/search-engines/yahoo.svg' },
  { id: 'naver', name: 'Naver', icon: 'assets/search-engines/naver.svg' },
]);

function engineIcon(item) {
  return item?.icon || `assets/search-engines/${item?.id || 'duckduckgo'}.svg`;
}

function setEnginePickerOpen(open) {
  const btn = document.getElementById('engine-picker-btn');
  const list = document.getElementById('engine-picker-list');
  if (!btn || !list) {
    return;
  }
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  list.hidden = !open;
}

function renderEnginePicker(catalog, selectedId) {
  const list = document.getElementById('engine-picker-list');
  const name = document.getElementById('engine-picker-name');
  const icon = document.getElementById('engine-picker-icon');
  const card = document.getElementById('engine-card-icon');
  const engines = catalog.length ? catalog : ENGINE_FALLBACK;
  const active = engines.find((item) => item.id === selectedId) || engines[0];
  if (name) {
    name.textContent = active.name;
  }
  if (icon) {
    icon.src = engineIcon(active);
  }
  if (card) {
    card.src = engineIcon(active);
  }
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const item of engines) {
    const row = document.createElement('li');
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'engine-picker-option';
    option.setAttribute('role', 'option');
    option.dataset.engine = item.id;
    option.classList.toggle('is-active', item.id === active.id);
    option.setAttribute('aria-selected', item.id === active.id ? 'true' : 'false');
    const mark = document.createElement('img');
    mark.src = engineIcon(item);
    mark.width = 18;
    mark.height = 18;
    mark.alt = '';
    const label = document.createElement('span');
    label.textContent = item.name;
    option.append(mark, label);
    row.append(option);
    list.append(row);
  }
}

function setView(name) {
  const views = document.querySelectorAll('.ext-view');
  const nav = document.querySelectorAll('.ext-nav-item[data-view]');
  for (const view of views) {
    view.hidden = view.dataset.section !== name;
  }
  for (const item of nav) {
    item.classList.toggle('is-active', item.dataset.view === name);
  }
  filterCards();
}

function filterCards() {
  const query = String(document.getElementById('set-query')?.value || '').trim().toLowerCase();
  const active = document.querySelector('.ext-view:not([hidden])');
  if (!active) {
    return;
  }
  for (const card of active.querySelectorAll('.ext-card')) {
    const hay = `${card.dataset.search || ''} ${card.textContent || ''}`.toLowerCase();
    card.hidden = Boolean(query) && !hay.includes(query);
  }
}

function applySettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return;
  }
  for (const toggle of document.querySelectorAll('.ext-switch[data-setting]')) {
    const key = toggle.dataset.setting;
    if (typeof settings[key] === 'boolean') {
      toggle.setAttribute('aria-checked', settings[key] ? 'true' : 'false');
    }
  }
  const catalog = Array.isArray(settings.searchEngines) ? settings.searchEngines : [];
  if (catalog.length || settings.searchEngine) {
    renderEnginePicker(catalog, settings.searchEngine);
  }
  const shortcut = document.getElementById('setting-shortcut');
  if (shortcut && typeof settings.panicShortcut === 'string') {
    shortcut.textContent = settings.panicShortcut;
  }
  const bridgeUrl = document.getElementById('agent-bridge-url');
  const bridgeToken = document.getElementById('agent-bridge-token');
  if (bridgeUrl) {
    bridgeUrl.value = settings.agentBridgeUrl || '';
  }
  if (bridgeToken) {
    bridgeToken.value = settings.agentBridgeToken || '';
  }
}

function setSetting(key, value) {
  api?.setSetting?.(key, value)?.then((result) => {
    if (result?.ok && result.settings) {
      applySettings(result.settings);
    }
  });
}

function bindPage() {
  document.getElementById('nav-toggle')?.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('is-nav-collapsed');
    document.getElementById('nav-toggle')?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  document.getElementById('set-query')?.addEventListener('input', filterCards);

  document.querySelectorAll('.ext-nav-item[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('.ext-switch[data-setting]');
    if (toggle && !toggle.disabled) {
      const next = toggle.getAttribute('aria-checked') !== 'true';
      setSetting(toggle.dataset.setting, next);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action) {
      return;
    }
    const name = action.dataset.action;
    if (name === 'extensions-page') {
      api?.openExtensionsTab?.();
      return;
    }
    if (name === 'downloads') {
      api?.openDownloadsTab?.();
      return;
    }
    api?.menuAction?.(name);
  });

  const picker = document.getElementById('engine-picker');
  const pickerBtn = document.getElementById('engine-picker-btn');
  const pickerList = document.getElementById('engine-picker-list');
  pickerBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    setEnginePickerOpen(pickerBtn.getAttribute('aria-expanded') !== 'true');
  });
  pickerList?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-engine]');
    if (!option) {
      return;
    }
    setEnginePickerOpen(false);
    setSetting('searchEngine', option.dataset.engine);
  });
  document.addEventListener('click', (event) => {
    if (picker && !picker.contains(event.target)) {
      setEnginePickerOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setEnginePickerOpen(false);
    }
  });
  renderEnginePicker(ENGINE_FALLBACK, 'duckduckgo');

  async function applyZoom(action) {
    const result = await api?.setZoom?.(action);
    const label = document.getElementById('zoom-label');
    if (result?.ok && label) {
      label.textContent = `${result.zoom}%`;
    }
  }
  document.getElementById('zoom-out')?.addEventListener('click', () => applyZoom('out'));
  document.getElementById('zoom-in')?.addEventListener('click', () => applyZoom('in'));

  api?.onSettings?.(applySettings);
  api?.getSettings?.()?.then((result) => {
    if (result?.ok && result.settings) {
      applySettings(result.settings);
    }
  });
}

bindPage();
