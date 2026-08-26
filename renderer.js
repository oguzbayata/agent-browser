'use strict';

let searchEngineBase = 'https://duckduckgo.com/?q=';

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

  return `https://${value}`;
}

function bindChrome() {
  const api = window.electronAPI;
  const form = document.getElementById('omni-form');
  const input = document.getElementById('omni-input');
  const backBtn = document.getElementById('back-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const reloadBtn = document.getElementById('reload-btn');

  if (!form || !input || !backBtn || !forwardBtn || !reloadBtn) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = resolveDestination(input.value);
    if (!url) {
      return;
    }

    input.value = url;
    api?.navigate?.(url);
    input.blur();
  });

  backBtn.addEventListener('click', () => api?.goBack?.());
  forwardBtn.addEventListener('click', () => api?.goForward?.());
  reloadBtn.addEventListener('click', () => api?.reload?.());

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

    if (document.activeElement === input) {
      return;
    }

    input.value = !url || url === 'about:blank' || url.startsWith('file:') ? '' : url;
  });
}

function sessionApiKey() {
  const field = document.getElementById('ai-key');
  return field ? field.value.trim() : '';
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

  if (!sidebar || !toggle || !form || !prompt || !summarizeBtn || !keyField) {
    return;
  }

  toggle.addEventListener('click', () => {
    const open = sidebar.hasAttribute('hidden');
    sidebar.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    api?.setSidebarOpen?.(open);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = prompt.value.trim();
    const apiKey = sessionApiKey();
    if (!message) {
      return;
    }
    if (!apiKey) {
      appendAiBubble('error', 'Oturum anahtarı gerekli.');
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
    if (!apiKey) {
      appendAiBubble('error', 'Oturum anahtarı gerekli.');
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

  function upsertTab({ tabId, title }, makeActive = true) {
    let tab = list.querySelector(`[data-tab-id="${CSS.escape(tabId)}"]`);
    if (!tab) {
      tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.tabId = tabId;
      tab.setAttribute('role', 'tab');

      const titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      titleEl.textContent = title || 'Yükleniyor...';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-close';
      closeBtn.setAttribute('aria-label', 'Sekmeyi kapat');
      closeBtn.textContent = '×';

      tab.append(titleEl, closeBtn);
      tab.addEventListener('click', () => {
        markActive(tabId);
        api?.switchTab?.(tabId);
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
bindPanic();
bindSettings();

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
  }

  toggle.addEventListener('click', () => {
    setOpen(panel.hasAttribute('hidden'));
  });
  closeBtn?.addEventListener('click', () => setOpen(false));

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
