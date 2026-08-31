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

let lastIntel = null;
let lastSettings = {};

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

function localRuntimeReady(intel) {
  const models = Array.isArray(intel?.models) ? intel.models : [];
  if (models.some((item) => item.live && item.ready && (item.kind === 'ollama' || item.kind === 'openai-compat'))) {
    return true;
  }
  const selectedId = intel?.selectedId;
  const model = selectedId ? models.find((item) => item.id === selectedId) : null;
  if (model && model.ready && (model.kind === 'ollama' || model.kind === 'openai-compat')) {
    return true;
  }
  return (Array.isArray(intel?.agents) ? intel.agents : []).some(
    (agent) => agent.status === 'running' && agent.id !== 'agent-bridge',
  );
}

function renderLocalIntel(intel) {
  const modelSelect = document.getElementById('ai-model-select');
  const status = document.getElementById('ai-intel-status');
  const selectedLabel = document.getElementById('ai-selected');
  const keyLabel = document.getElementById('ai-key-label');
  const models = Array.isArray(intel?.models) ? intel.models : [];
  const selectedId = intel?.selectedId || null;
  const selected = models.find((item) => item.id === selectedId) || null;

  if (modelSelect) {
    modelSelect.replaceChildren();
    const cloud = document.createElement('option');
    cloud.value = '';
    cloud.textContent = 'OpenAI (session key) · cloud';
    modelSelect.appendChild(cloud);
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model.id;
      const state = model.live ? 'live' : model.kind === 'file' ? 'file' : 'saved';
      option.textContent = [model.name, model.source, state, model.sizeLabel].filter(Boolean).join(' · ');
      modelSelect.appendChild(option);
    }
    modelSelect.value = selectedId || '';
  }
  if (status) {
    const liveCount = models.filter((item) => item.live).length;
    status.textContent = models.length
      ? `${models.length} model · ${liveCount} live`
      : 'no models in known folders — pick a file or folder';
  }
  if (selectedLabel) {
    const modelLine = selected
      ? `${selected.name}${selected.live ? ' · live' : ' · file'}`
      : 'no model selected · OpenAI key or a local model';
    const brain = lastSettings.brain === 'siyuan' || lastSettings.brain === 'obsidian' ? lastSettings.brain : 'off';
    selectedLabel.textContent =
      brain === 'off'
        ? modelLine
        : `Agent · ${brain === 'siyuan' ? 'SiYuan' : 'Obsidian'} · ${modelLine}`;
  }
  if (keyLabel) {
    keyLabel.textContent = localRuntimeReady(intel)
      ? 'API key (local model selected · not required)'
      : 'API key (cloud only · session)';
  }
}

function applyBrainUi(settings) {
  const brain = settings?.brain === 'siyuan' || settings?.brain === 'obsidian' ? settings.brain : 'off';
  const title = document.getElementById('models-card-title');
  const siyuan = document.getElementById('brain-siyuan');
  const obsidian = document.getElementById('brain-obsidian');
  const endpoint = document.getElementById('brain-endpoint');
  const token = document.getElementById('brain-token');
  const vault = document.getElementById('brain-vault-path');
  const bridge = settings?.memoryBridge || {};
  if (title) {
    title.textContent = brain === 'off' ? 'Local models' : 'Agent';
  }
  document.querySelectorAll('.brain-option[data-brain]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.brain === brain);
  });
  if (siyuan) {
    siyuan.hidden = brain !== 'siyuan';
  }
  if (obsidian) {
    obsidian.hidden = brain !== 'obsidian';
  }
  if (endpoint && document.activeElement !== endpoint) {
    endpoint.value = bridge.endpoint || 'http://127.0.0.1:6806/api/block/insertBlock';
  }
  if (token && document.activeElement !== token && !token.value) {
    token.placeholder = bridge.hasToken
      ? 'a session key is stored · type to replace it'
      : 'this session only · not written to disk';
  }
  if (vault) {
    vault.textContent = bridge.vaultPath || 'no folder selected';
  }
}

function applySettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return;
  }
  lastSettings = settings;
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
  const apiKey = document.getElementById('session-api-key');
  if (apiKey && document.activeElement !== apiKey && typeof settings.sessionApiKey === 'string') {
    apiKey.value = settings.sessionApiKey;
  }
  applyBrainUi(settings);
  if (lastIntel) {
    renderLocalIntel(lastIntel);
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

  const apiKey = document.getElementById('session-api-key');
  let apiKeyTimer = 0;
  const saveApiKey = () => {
    if (!apiKey) {
      return;
    }
    setSetting('sessionApiKey', apiKey.value);
  };
  apiKey?.addEventListener('input', () => {
    window.clearTimeout(apiKeyTimer);
    apiKeyTimer = window.setTimeout(saveApiKey, 250);
  });
  apiKey?.addEventListener('change', saveApiKey);
  apiKey?.addEventListener('blur', saveApiKey);

  document.getElementById('ai-model-select')?.addEventListener('change', (event) => {
    api?.selectLocalModel?.(event.target.value || null);
  });
  document.getElementById('ai-model-pick')?.addEventListener('click', () => {
    api?.pickLocalModel?.('file');
  });
  document.getElementById('ai-model-dir')?.addEventListener('click', () => {
    api?.pickLocalModel?.('dir');
  });
  api?.onLocalIntel?.((payload) => {
    lastIntel = payload;
    renderLocalIntel(payload);
  });
  api?.getLocalIntel?.()?.then((result) => {
    if (result?.ok && result.intel) {
      lastIntel = result.intel;
      renderLocalIntel(result.intel);
    }
  });
  api?.watchLocalIntel?.(true);

  document.getElementById('brain-picker')?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-brain]');
    if (!option) {
      return;
    }
    setSetting('brain', option.dataset.brain);
  });
  const saveBrainHttp = () => {
    api?.setMemoryBridge?.({
      provider: 'siyuan',
      endpoint: document.getElementById('brain-endpoint')?.value || '',
      token: document.getElementById('brain-token')?.value || undefined,
    })?.then((result) => {
      if (result?.ok && result.settings) {
        applySettings(result.settings);
      } else if (result?.bridge) {
        applyBrainUi({ brain: 'siyuan', memoryBridge: result.bridge });
      }
      const token = document.getElementById('brain-token');
      if (token) {
        token.value = '';
      }
    });
  };
  document.getElementById('brain-endpoint')?.addEventListener('change', saveBrainHttp);
  document.getElementById('brain-token')?.addEventListener('change', saveBrainHttp);
  document.getElementById('brain-pick-vault')?.addEventListener('click', () => {
    api?.pickMemoryVault?.()?.then((result) => {
      if (result?.ok && result.settings) {
        applySettings(result.settings);
      } else if (result?.bridge) {
        applyBrainUi({ brain: 'obsidian', memoryBridge: result.bridge, siyuanBridge: true });
      }
    });
  });

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
